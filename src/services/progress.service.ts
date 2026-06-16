/**
 * @file progress.service.ts
 * @description
 *   Data-access layer for user content progress and history (timeline events).
 *
 *   Covers: upserting the latest progress state, recording history events,
 *   reading progress for a single content item, listing "continue watching/
 *   reading" items, and reading the history timeline for a content item.
 *
 *   No HTTP logic lives here.
 */

import { pool } from "../db/supabase";
import type { UpsertProgressInput } from "../schemas/progress.schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProgressEventType = "completed" | "progress_update" | "opened";

export interface ProgressMeta {
  status:              string;
  progressPercent:     number;
  lastPositionSeconds: number | null;
  lastReadingLocation: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts the latest progress row for a user/content pair.
 *
 * On first insert, `started_at` is set to `now()` unless status is
 * `"not_started"`. On conflict, `completed_at` is set to `now()` only when
 * the new status is `"completed"`, otherwise it's left untouched.
 */
export async function upsertProgress(
  userId: string,
  contentId: string,
  status: string,
  progressPercent: number,
  lastPositionSeconds: number | null,
  lastReadingLocation: string | null,
) {
  const { rows } = await pool.query(
    `insert into public.user_content_progress
       (user_id, content_id, status, progress_percent, last_position_seconds, last_reading_location, started_at)
     values
       ($1, $2, $3, $4, $5, $6,
        coalesce(
          (select started_at from public.user_content_progress where user_id=$1 and content_id=$2),
          case when $3 <> 'not_started' then now() else null end
        )
       )
     on conflict (user_id, content_id)
     do update set
       status                 = excluded.status,
       progress_percent       = excluded.progress_percent,
       last_position_seconds  = excluded.last_position_seconds,
       last_reading_location  = excluded.last_reading_location,
       completed_at           = case when excluded.status='completed' then now() else public.user_content_progress.completed_at end,
       updated_at             = now()
     returning *;`,
    [userId, contentId, status, progressPercent, lastPositionSeconds, lastReadingLocation],
  );
  return rows[0];
}

/**
 * Inserts a history (timeline) event for a user/content pair.
 * Returns the new row's `id` and `created_at`.
 */
export async function insertHistoryEvent(
  userId: string,
  contentId: string,
  eventType: ProgressEventType,
  meta: ProgressMeta,
) {
  const { rows } = await pool.query(
    `insert into public.user_content_history (user_id, content_id, event_type, meta)
     values ($1, $2, $3, $4::jsonb)
     returning id, created_at;`,
    [userId, contentId, eventType, JSON.stringify(meta)],
  );
  return rows[0];
}

/**
 * Determines the history event type for a progress upsert, based on the
 * resulting status and whether any position/location data was provided.
 */
export function resolveEventType(
  status: string,
  progressPercent: number,
  lastPositionSeconds: number | null,
  lastReadingLocation: string | null,
): ProgressEventType {
  if (status === "completed") return "completed";
  if (progressPercent > 0 || lastPositionSeconds !== null || lastReadingLocation !== null) {
    return "progress_update";
  }
  return "opened";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the progress row for a user/content pair, or `null` if none exists. */
export async function getProgress(userId: string, contentId: string) {
  const { rows } = await pool.query(
    `select *
     from public.user_content_progress
     where user_id = $1 and content_id = $2
     limit 1;`,
    [userId, contentId],
  );
  return rows[0] ?? null;
}

/**
 * Returns the user's most recently updated in-progress/completed content,
 * joined with basic content item info. Excludes `not_started` and
 * unpublished items.
 */
export async function getContinueItems(userId: string, limit: number) {
  const { rows } = await pool.query(
    `select
       p.content_id,
       p.status,
       p.progress_percent,
       p.last_position_seconds,
       p.last_reading_location,
       p.updated_at,
       c.type,
       c.title,
       c.description,
       c.image_url,
       c.is_free,
       c.is_published
     from public.user_content_progress p
     join public.content_items c on c.id = p.content_id
     where p.user_id = $1
       and c.is_published = true
       and p.status <> 'not_started'
     order by p.updated_at desc
     limit $2;`,
    [userId, limit],
  );
  return rows;
}

/** Returns the history (timeline) events for a user/content pair, newest first. */
export async function getHistoryEvents(userId: string, contentId: string, limit: number) {
  const { rows } = await pool.query(
    `select id, event_type, meta, created_at
     from public.user_content_history
     where user_id = $1 and content_id = $2
     order by created_at desc
     limit $3;`,
    [userId, contentId, limit],
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Applies default values to an upsert-progress request body. */
export function withProgressDefaults(body: UpsertProgressInput) {
  return {
    status:              body.status ?? "in_progress",
    progressPercent:     body.progressPercent ?? 0,
    lastPositionSeconds: body.lastPositionSeconds ?? null,
    lastReadingLocation: body.lastReadingLocation ?? null,
  };
}