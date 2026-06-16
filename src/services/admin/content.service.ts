/**
 * @file content.service.ts
 * @description
 *   Data-access layer for the `content_items` table and its type-specific
 *   detail tables (video / article / book / session).
 *
 *   Every function in this file accepts a pg `PoolClient` so callers can
 *   wrap multiple operations inside a single transaction. No HTTP logic lives
 *   here — only SQL and pure data transformations.
 */

import { pool } from "../../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches a single content item row by its UUID.
 * Returns `null` when no matching row is found.
 */
export async function getContentRow(client: any, contentId: string) {
  const { rows } = await client.query(
    `select id, type, title, description, image_url,
            price, currency, is_free,
            preview_body, content_body,
            is_published, created_at
     from public.content_items
     where id = $1 limit 1;`,
    [contentId],
  );
  return rows[0] ?? null;
}

/**
 * Fetches the type-specific details row for a content item.
 * Returns `null` for content types that have no separate details table
 * (currently `"book"`).
 */
export async function getDetailsRow(client: any, type: string, contentId: string) {
  if (type === "video") {
    const { rows } = await client.query(
      `select content_id, video_url, video_seconds, provider
       from public.content_video_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }

  if (type === "article") {
    const { rows } = await client.query(
      `select content_id, source_url, reading_minutes, author
       from public.content_article_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }

  if (type === "session") {
    const { rows } = await client.query(
      `select content_id, therapist_id, session_minutes, meeting_type
       from public.content_session_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }

  return null; // "book" has no separate details table
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a details row for a given content type if one does not already
 * exist. Safe to call multiple times (ON CONFLICT DO NOTHING).
 */
export async function ensureDetailsRow(client: any, type: string, contentId: string) {
  if (type === "video") {
    await client.query(
      `insert into public.content_video_details (content_id, video_url, video_seconds, provider)
       values ($1, '', null, null) on conflict (content_id) do nothing;`,
      [contentId],
    );
    return;
  }

  if (type === "article") {
    await client.query(
      `insert into public.content_article_details (content_id, source_url, reading_minutes, author)
       values ($1, null, null, null) on conflict (content_id) do nothing;`,
      [contentId],
    );
    return;
  }

  if (type === "session") {
    await client.query(
      `insert into public.content_session_details
         (content_id, therapist_id, session_minutes, meeting_type)
       values ($1, null, 60, 'zoom') on conflict (content_id) do nothing;`,
      [contentId],
    );
  }
}

/**
 * Applies a partial update to the type-specific details table of a content
 * item. Uses `COALESCE` so that `null` patch values leave existing DB values
 * untouched.
 *
 * @param pdfUrl  Pass the new Supabase URL when a fresh PDF was uploaded;
 *                pass `null` to keep the existing `pdf_url` in the database.
 */
export async function updateDetails(
  client:    any,
  type:      string,
  contentId: string,
  patch:     any,
  pdfUrl?:   string | null,
) {
  if (type === "video") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      `update public.content_video_details
       set video_url     = coalesce($2, video_url),
           video_seconds = coalesce($3, video_seconds),
           provider      = coalesce($4, provider)
       where content_id = $1;`,
      [
        contentId,
        patch.video_url?.trim() || null,
        typeof patch.video_seconds !== "undefined" ? patch.video_seconds : null,
        patch.provider ?? null,
      ],
    );
    return;
  }

  if (type === "article") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      `update public.content_article_details
       set source_url      = coalesce($2, source_url),
           reading_minutes = coalesce($3, reading_minutes),
           author          = coalesce($4, author),
           pdf_url         = coalesce($5, pdf_url)
       where content_id = $1;`,
      [
        contentId,
        patch.source_url      ?? null,
        typeof patch.reading_minutes !== "undefined" ? patch.reading_minutes : null,
        patch.author          ?? null,
        pdfUrl                ?? null,
      ],
    );
    return;
  }

  if (type === "book") {
    await client.query(
      `update public.content_book_details
       set pdf_url = coalesce($2, pdf_url),
           pages   = coalesce($3, pages),
           isbn    = coalesce($4, isbn)
       where content_id = $1;`,
      [
        contentId,
        pdfUrl             ?? null,
        patch.pages        ?? null,
        patch.isbn?.trim() || null,
      ],
    );
    return;
  }

  if (type === "session") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      `update public.content_session_details
       set therapist_id    = coalesce($2, therapist_id),
           session_minutes = coalesce($3, session_minutes),
           meeting_type    = coalesce($4, meeting_type)
       where content_id = $1;`,
      [
        contentId,
        patch.therapist_id    ?? null,
        typeof patch.session_minutes !== "undefined" ? patch.session_minutes : null,
        patch.meeting_type    ?? null,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List helper (used by GET /admin/content)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all content items ordered by creation date (newest first). */
export async function listContentItems() {
  const { rows } = await pool.query(
    `select id, type, title, description, image_url,
            price, is_free, is_published, created_at
     from public.content_items
     order by created_at desc;`,
  );
  return rows;
}