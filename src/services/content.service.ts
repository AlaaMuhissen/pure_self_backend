/**
 * @file content.service.ts
 * @description
 *   Data-access layer for public content browsing and admin CRUD.
 *
 *   Covers: listing/filtering content, fetching a single item with details,
 *   creating an item with its type-specific details row, partial/full
 *   updates, and deletion. Also includes the Supabase PDF upload helper used
 *   on create.
 *
 *   No HTTP logic lives here.
 */

import type { PoolClient } from "pg";
import { pool, supabase } from "../db/supabase";
import {
  type ContentRow,
  detailsTable,
  patchSchema,
  videoDetailsSchema,
  bookDetailsSchema,
  articleDetailsSchema,
  sessionDetailsSchema,
  type createSchema,
} from "../schemas/content.schema";
import type { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Transaction helper
// ─────────────────────────────────────────────────────────────────────────────

/** Runs `fn` inside a BEGIN/COMMIT transaction, rolling back on error. */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a PDF buffer to Supabase Storage under `<type>s/` and returns its
 * public URL.
 */
export async function uploadContentPdf(
  type: "book" | "article",
  file: Express.Multer.File,
): Promise<string> {
  const fileName = `${type}s/${Date.now()}-${file.originalname}`;

  const { error } = await supabase.storage
    .from("content-files")
    .upload(fileName, file.buffer, { contentType: "application/pdf", upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("content-files").getPublicUrl(fileName);
  return data.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentListFilters {
  type?:     string;
  published?: string;
  freeOnly?: string;
  q?:        string;
  limit:     number;
  offset:    number;
}

/**
 * Returns a filtered, paginated list of content items.
 * Filters are applied additively (AND).
 */
export async function listContent(filters: ContentListFilters) {
  const where:  string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    where.push(`type = $${params.length + 1}`);
    params.push(filters.type);
  }
  if (filters.published !== undefined) {
    where.push(`is_published = $${params.length + 1}`);
    params.push(filters.published === "true");
  }
  if (filters.freeOnly === "true") {
    where.push(`(is_free = true OR COALESCE(price, 0) = 0)`);
  }
  if (filters.q) {
    where.push(
      `(title ILIKE $${params.length + 1} OR COALESCE(description,'') ILIKE $${params.length + 1})`,
    );
    params.push(`%${filters.q}%`);
  }

  const sql = `
    SELECT * FROM public.content_items
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(filters.limit, filters.offset);

  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single item
// ─────────────────────────────────────────────────────────────────────────────

/** Fetches a single content item by ID. Returns `null` if not found. */
export async function getContentItem(contentId: string): Promise<ContentRow | null> {
  const { rows } = await pool.query<ContentRow>(
    `SELECT * FROM public.content_items WHERE id = $1`,
    [contentId],
  );
  return rows[0] ?? null;
}

/** Fetches the type-specific details row for a content item. */
export async function getContentDetails(contentId: string, type: ContentRow["type"]) {
  const { table } = detailsTable(type);
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE content_id = $1`, [contentId]);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

type CreatePayload = z.infer<typeof createSchema>;

/**
 * Creates a content item and its type-specific details row inside a single
 * transaction.
 *
 * @param uploadedPdfUrl  Supabase URL of a freshly uploaded PDF (book/article
 *                         only). When provided it takes precedence over
 *                         `details.pdf_url`.
 */
export async function createContentItem(
  payload: CreatePayload,
  uploadedPdfUrl: string | null,
): Promise<ContentRow> {
  const { item, details } = payload;

  return withTx(async (c) => {
    const insertItem = await c.query<ContentRow>(
      `INSERT INTO public.content_items
         (type,title,description,image_url,price,currency,is_free,preview_body,content_body,is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        item.type,
        item.title,
        item.description  ?? null,
        item.image_url    ?? null,
        item.price        ?? null,
        item.currency     ?? "SAR",
        item.is_free      ?? false,
        item.preview_body ?? null,
        item.content_body ?? null,
        item.is_published ?? true,
      ],
    );

    const newItem = insertItem.rows[0];

    if (details) {
      const { table } = detailsTable(newItem.type);

      if (newItem.type === "video") {
        const d = videoDetailsSchema.parse(details);
        await c.query(
          `INSERT INTO ${table} (content_id,video_url,video_seconds,provider) VALUES ($1,$2,$3,$4)`,
          [newItem.id, d.video_url, d.video_seconds ?? null, d.provider ?? null],
        );
      }
      if (newItem.type === "book") {
        const d = bookDetailsSchema.parse(details);
        await c.query(
          `INSERT INTO ${table} (content_id,pdf_url,pages,isbn) VALUES ($1,$2,$3,$4)`,
          [newItem.id, uploadedPdfUrl ?? d.pdf_url ?? null, d.pages ?? null, d.isbn ?? null],
        );
      }
      if (newItem.type === "article") {
        const d = articleDetailsSchema.parse(details);
        await c.query(
          `INSERT INTO ${table} (content_id,source_url,reading_minutes,author,pdf_url) VALUES ($1,$2,$3,$4,$5)`,
          [
            newItem.id,
            d.source_url ?? null,
            d.reading_minutes ?? null,
            d.author ?? null,
            uploadedPdfUrl,
          ],
        );
      }
      if (newItem.type === "session") {
        const d = sessionDetailsSchema.parse(details);
        await c.query(
          `INSERT INTO ${table} (content_id,therapist_id,session_minutes,meeting_type) VALUES ($1,$2,$3,$4)`,
          [newItem.id, d.therapist_id ?? null, d.session_minutes ?? null, d.meeting_type ?? null],
        );
      }
    }

    return newItem;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Update (PATCH / PUT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a partial or full update to a content item's base fields.
 *
 * @param isFullReplace  When `true` (PUT), requires `item.title` to be
 *                        present — enforces "full payload" semantics.
 *
 * NOTE: Currently only updates `content_items` base fields. Type-specific
 * detail updates from `patch.details` are validated but not yet persisted —
 * preserved as-is from the original implementation.
 */
export async function updateContentItem(
  id: string,
  body: unknown,
  isFullReplace: boolean,
): Promise<true> {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid payload");

  const patch = parsed.data;

  const current = await getContentItem(id);
  if (!current) throw new Error("Not found");

  return withTx(async (c) => {
    if (patch.item?.type && patch.item.type !== current.type)
      throw new Error("Changing type not supported");

    if (isFullReplace && !patch.item?.title)
      throw new Error("PUT requires full item data (title missing)");

    if (patch.item) {
      const item = patch.item;
      await c.query(
        `UPDATE public.content_items
         SET
           title        = COALESCE($2, title),
           description  = COALESCE($3, description),
           image_url    = COALESCE($4, image_url),
           price        = COALESCE($5, price),
           currency     = COALESCE($6, currency),
           is_free      = COALESCE($7, is_free),
           preview_body = COALESCE($8, preview_body),
           content_body = COALESCE($9, content_body),
           is_published = COALESCE($10, is_published)
         WHERE id = $1`,
        [
          id,
          item.title        ?? null,
          item.description  ?? null,
          item.image_url    ?? null,
          item.price        ?? null,
          item.currency     ?? null,
          item.is_free      ?? null,
          item.preview_body ?? null,
          item.content_body ?? null,
          item.is_published ?? null,
        ],
      );
    }

    return true as const;
  });

}

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

/** Deletes a content item. Returns `null` if no matching row was found. */
export async function deleteContentItem(id: string): Promise<string | null> {
  const { rows, rowCount } = await pool.query<{ id: string }>(
    `DELETE FROM public.content_items WHERE id = $1 RETURNING id`,
    [id],
  );
  return rowCount === 0 ? null : rows[0].id;
}