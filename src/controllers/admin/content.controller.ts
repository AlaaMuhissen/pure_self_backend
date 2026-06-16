/**
 * @file content.controller.ts
 * @description
 *   Request handlers for the admin content API.
 *
 *   Each exported function corresponds to one route verb + path combination
 *   and is wired up in `content.routes.ts`. Handlers are intentionally thin:
 *   they validate input, delegate to the service layer for DB work and to
 *   `supabase-storage` for file uploads, then shape the HTTP response.
 *
 *   No SQL lives here — keep it in `content.service.ts`.
 */

import type { Request, Response }  from "express";
import { getAuth }            from "@clerk/express";
import { z }                  from "zod";
import { pool }               from "../../db/supabase";
import { assertAdmin }        from "../../libs/user";
import {
  CreateContentSchema,
  PatchContentSchema,
  PutContentSchema,
} from "../../schemas/content.schema";
import {
  uploadToSupabase,
  extractFiles,
  parseBody,
} from "../../libs/supabase-storage";
import {
  listContentItems,
  getContentRow,
  getDetailsRow,
  updateDetails,
  ensureDetailsRow,
} from "../../services/admin/content.service";

// ─────────────────────────────────────────────────────────────────────────────
// Internal auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk userId from the request and throws if absent. */
function requireUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/content
 * Returns a summary list of all content items (no detail rows).
 */
export async function listContent(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    const items = await listContentItems();
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
}

/**
 * GET /admin/content/:id
 * Returns a single content item including its type-specific detail row.
 */
export async function getContent(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    const contentId = z.string().uuid().parse(req.params.id);
    const base      = await getContentRow(client, contentId);
    if (!base) return res.status(404).json({ error: "Not found" });

    const details = await getDetailsRow(client, base.type, contentId);
    return res.json({ ok: true, item: { ...base, details } });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * POST /admin/content
 *
 * Creates a new content item together with its type-specific details row.
 * Accepts multipart/form-data OR plain JSON:
 *   - `item`    — JSON string (base fields)
 *   - `details` — JSON string (type-specific fields)
 *   - `image`   — optional file (uploaded to Supabase, replaces `image_url`)
 *   - `pdf`     — optional file (book / article only)
 */
export async function createContent(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    // Extend the base schema with coerced numeric/boolean fields that arrive
    // as strings when the request is sent as FormData.
    const Body = CreateContentSchema.extend({
      price:           z.coerce.number().optional().nullable(),
      is_free:         z.coerce.boolean().default(false),
      is_published:    z.coerce.boolean().default(true),
      video_seconds:   z.coerce.number().int().min(0).optional().nullable(),
      reading_minutes: z.coerce.number().int().min(0).optional().nullable(),
      pages:           z.coerce.number().int().min(0).optional().nullable(),
      session_minutes: z.coerce.number().int().min(0).optional().nullable(),
      pdf_url:         z.string().url().optional().nullable(),
      isbn:            z.string().optional().nullable(),
    });

    const b = Body.parse(parseBody(req));
    const { pdfFile, imageFile } = extractFiles(req);

    // File upload always wins over a pasted URL string.
    let imageUrl: string | null = b.image_url ?? null;
    if (imageFile) {
      imageUrl = await uploadToSupabase(imageFile.buffer, imageFile.mimetype, "images");
    }

    let pdfUrl: string | null = (b as any).pdf_url ?? null;
    if ((b.type === "book" || b.type === "article") && pdfFile) {
      pdfUrl = await uploadToSupabase(pdfFile.buffer, pdfFile.mimetype, `${b.type}s`);
    }

    await client.query("begin");

    // Insert base row ─────────────────────────────────────────────────────────
    const { rows: itemRows } = await client.query(
      `insert into public.content_items
         (type, title, description, image_url,
          price, currency, is_free,
          preview_body, content_body, is_published)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id;`,
      [
        b.type,
        b.title,
        b.description  ?? null,
        imageUrl,
        b.price        ?? null,
        b.currency     ?? "SAR",
        b.is_free,
        b.preview_body ?? null,
        b.content_body ?? null,
        b.is_published,
      ],
    );

    const contentId = itemRows[0].id as string;

    // Insert type-specific detail row ─────────────────────────────────────────
    if (b.type === "video") {
      await client.query(
        `insert into public.content_video_details
           (content_id, video_url, video_seconds, provider)
         values ($1,$2,$3,$4);`,
        [contentId, b.video_url ?? null, b.video_seconds ?? null, b.provider ?? null],
      );
    }

    if (b.type === "article") {
      await client.query(
        `insert into public.content_article_details
           (content_id, source_url, reading_minutes, author, pdf_url)
         values ($1,$2,$3,$4,$5);`,
        [contentId, b.source_url ?? null, b.reading_minutes ?? null, b.author ?? null, pdfUrl],
      );
    }

    if (b.type === "book") {
      await client.query(
        `insert into public.content_book_details
           (content_id, pdf_url, pages, isbn)
         values ($1,$2,$3,$4);`,
        [contentId, pdfUrl, (b as any).pages ?? null, (b as any).isbn ?? null],
      );
    }

    if (b.type === "session") {
      await client.query(
        `insert into public.content_session_details
           (content_id, therapist_id, session_minutes, meeting_type)
         values ($1,$2,$3,$4);`,
        [contentId, b.therapist_id ?? null, b.session_minutes ?? 60, b.meeting_type ?? "zoom"],
      );
    }

    await client.query("commit");
    return res.json({ ok: true, contentId, image_url: imageUrl, pdf_url: pdfUrl });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    console.error("CREATE CONTENT ERROR:", e);
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * PATCH /admin/content/:id
 *
 * Partial update — only the supplied fields are overwritten.
 * Content `type` cannot be changed.
 * Accepts multipart/form-data OR plain JSON (same as POST).
 */
export async function patchContent(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    const contentId = z.string().uuid().parse(req.params.id);
    const patch     = PatchContentSchema.parse(parseBody(req));

    const { imageFile, pdfFile } = extractFiles(req);

    const current = await getContentRow(client, contentId);
    if (!current) return res.status(404).json({ error: "Not found" });

    // Upload new cover image when a file is attached.
    let imageUrl: string | null | undefined = patch.image_url;
    if (imageFile) {
      imageUrl = await uploadToSupabase(imageFile.buffer, imageFile.mimetype, "images");
    }

    // Upload new PDF for book / article when a file is attached.
    let pdfUrl: string | null = null;
    if ((current.type === "book" || current.type === "article") && pdfFile) {
      pdfUrl = await uploadToSupabase(pdfFile.buffer, pdfFile.mimetype, `${current.type}s`);
    }

    // Normalise price: free items are always stored as 0.
    const normalizedPrice =
      patch.is_free === true              ? 0
      : typeof patch.price !== "undefined" ? patch.price
      : null;

    await client.query("begin");

    await client.query(
      `update public.content_items
       set title        = coalesce($2,  title),
           description  = coalesce($3,  description),
           image_url    = coalesce($4,  image_url),
           price        = coalesce($5,  price),
           currency     = coalesce($6,  currency),
           is_free      = coalesce($7,  is_free),
           preview_body = coalesce($8,  preview_body),
           content_body = coalesce($9,  content_body),
           is_published = coalesce($10, is_published)
       where id = $1;`,
      [
        contentId,
        patch.title        ?? null,
        patch.description  ?? null,
        imageUrl           ?? null,
        normalizedPrice,
        patch.currency     ?? null,
        typeof patch.is_free      === "boolean" ? patch.is_free      : null,
        patch.preview_body ?? null,
        patch.content_body ?? null,
        typeof patch.is_published === "boolean" ? patch.is_published : null,
      ],
    );

    // Explicit free-price guard (belt-and-suspenders).
    if (patch.is_free === true) {
      await client.query(
        `update public.content_items set price = 0 where id = $1;`,
        [contentId],
      );
    }

    await updateDetails(client, current.type, contentId, patch, pdfUrl);
    await client.query("commit");

    const updated = await getContentRow(client, contentId);
    const details = await getDetailsRow(client, current.type, contentId);
    return res.json({ ok: true, item: { ...updated, details } });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * PUT /admin/content/:id
 *
 * Full replace — all fields are overwritten with the supplied values.
 * Content `type` cannot be changed (returns 400 if attempted).
 * Accepts multipart/form-data OR plain JSON.
 */
export async function putContent(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    const contentId = z.string().uuid().parse(req.params.id);
    const body      = PutContentSchema.parse(parseBody(req));

    const { imageFile } = extractFiles(req);

    const current = await getContentRow(client, contentId);
    if (!current) return res.status(404).json({ error: "Not found" });

    if (body.type !== current.type) {
      return res.status(400).json({ error: "Changing content type is not supported via PUT" });
    }

    let imageUrl: string | null = body.image_url ?? null;
    if (imageFile) {
      imageUrl = await uploadToSupabase(imageFile.buffer, imageFile.mimetype, "images");
    }

    const normalizedPrice    = body.is_free ? 0 : (body.price ?? null);
    const normalizedCurrency = body.currency ?? "SAR";

    await client.query("begin");

    await client.query(
      `update public.content_items
       set type=$2, title=$3, description=$4, image_url=$5,
           price=$6, currency=$7, is_free=$8,
           preview_body=$9, content_body=$10, is_published=$11
       where id=$1;`,
      [
        contentId,
        body.type,
        body.title,
        body.description  ?? null,
        imageUrl,
        normalizedPrice,
        normalizedCurrency,
        body.is_free,
        body.preview_body ?? null,
        body.content_body ?? null,
        body.is_published,
      ],
    );

    // Update type-specific details ─────────────────────────────────────────────
    if (body.type === "video") {
      await ensureDetailsRow(client, body.type, contentId);
      await client.query(
        `update public.content_video_details
         set video_url     = case when $2::text is not null then $2 else video_url end,
             video_seconds = case when $3::int  is not null then $3 else video_seconds end,
             provider      = case when $4::text is not null then $4 else provider end
         where content_id = $1;`,
        [
          contentId,
          typeof body.video_url     !== "undefined" ? body.video_url     : null,
          typeof body.video_seconds !== "undefined" ? body.video_seconds : null,
          typeof body.provider      !== "undefined" ? body.provider      : null,
        ],
      );
    } else if (body.type === "article") {
      await ensureDetailsRow(client, body.type, contentId);
      await client.query(
        `update public.content_article_details
         set source_url=$2, reading_minutes=$3, author=$4
         where content_id=$1;`,
        [contentId, body.source_url ?? null, body.reading_minutes ?? null, body.author ?? null],
      );
    } else if (body.type === "session") {
      await ensureDetailsRow(client, body.type, contentId);
      await client.query(
        `update public.content_session_details
         set therapist_id=$2, session_minutes=$3, meeting_type=$4
         where content_id=$1;`,
        [contentId, body.therapist_id ?? null, body.session_minutes ?? 60, body.meeting_type ?? "zoom"],
      );
    }

    await client.query("commit");

    const updated = await getContentRow(client, contentId);
    const details = await getDetailsRow(client, body.type, contentId);
    return res.json({ ok: true, item: { ...updated, details } });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * DELETE /admin/content/:id
 *
 * Removes the content item. Detail rows are cleaned up automatically via
 * `ON DELETE CASCADE` constraints in the database.
 */
export async function deleteContent(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
    await assertAdmin(userId);

    const contentId = z.string().uuid().parse(req.params.id);
    await pool.query(`delete from public.content_items where id = $1;`, [contentId]);
    return res.json({ ok: true });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
}