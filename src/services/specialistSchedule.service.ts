/**
 * @file specialistSchedule.service.ts
 * @description
 *   Data-access layer for a specialist's session schedule and manual
 *   availability blocks (`specialist_schedule_blocks`).
 *
 * ⚠️ DUPLICATE HELPER NOTE:
 *   `getDbUserId` here is identical to the one in `specialists.service.ts`
 *   (previous split). `assertSpecialist` here is SUBTLY DIFFERENT — this
 *   version only checks that a `specialists` row exists for the user,
 *   while the one in `specialists.service.ts` also requires
 *   `available = true`. Both are kept as-is to preserve each file's
 *   original behavior; if you want a single shared helper, decide which
 *   availability check is correct for schedule management (a specialist
 *   should probably be able to manage their schedule even while marked
 *   unavailable, which is what THIS file's looser check currently allows).
 */

import type { PoolClient } from "pg";
import { pool } from "../db/supabase";
import type { z } from "zod";
import type { CreateBlockSchema as _CreateBlockSchema } from "../schemas/specialistSchedule.schema";

type CreateBlockInput = z.infer<typeof _CreateBlockSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// User / role resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Resolves a Clerk user ID to the internal `users.id`. Throws `"UserNotFound"` if absent. */
export async function getDbUserId(clerkId: string): Promise<string> {
  const { rows } = await pool.query(
    `select id from public.users where clerk_user_id = $1 limit 1;`,
    [clerkId],
  );
  if (!rows[0]) throw new Error("UserNotFound");
  return rows[0].id as string;
}

/**
 * Throws `"Forbidden"` unless a `specialists` row exists for `userId`.
 * Unlike `specialists.service.ts`'s version, this does NOT require
 * `available = true` — see file header note.
 */
export async function assertSpecialist(userId: string): Promise<void> {
  const { rows } = await pool.query(
    `select user_id from public.specialists where user_id = $1 limit 1;`,
    [userId],
  );
  if (!rows[0]) throw new Error("Forbidden");
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule (bookings grouped by day)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a specialist's bookings between `from` and `to` (inclusive),
 * including patient info and session-report counts.
 *
 * @param from  `YYYY-MM-DD`
 * @param to    `YYYY-MM-DD`
 */
export async function getScheduleBookings(specialistUserId: string, from: string, to: string) {
  const { rows } = await pool.query(
    `select
       b.id,
       b.user_id as patient_id,
       b.specialist_id,
       b.starts_at,
       b.ends_at,
       b.status,
       u.name  as patient_name,
       u.email as patient_email,
       u.profile_image as patient_profile_image,
       coalesce(sr.cnt,0) as reports_count,
       sr.last_at as last_report_at
     from public.bookings b
     join public.users u on u.id = b.user_id
     left join (
       select booking_id, count(*) as cnt, max(report_date) as last_at
       from public.session_reports
       group by booking_id
     ) sr on sr.booking_id = b.id
     where b.specialist_id = $1
       and b.starts_at >= ($2::date)
       and b.starts_at < (($3::date) + interval '1 day')
     order by b.starts_at asc;`,
    [specialistUserId, from, to],
  );
  return rows;
}

/**
 * Groups a flat list of booking rows by calendar day (based on `starts_at`,
 * UTC date portion).
 */
export function groupBookingsByDay(rows: any[]): Array<{ date: string; sessions: any[] }> {
  const map = new Map<string, any[]>();
  for (const r of rows) {
    const day = new Date(r.starts_at).toISOString().slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(r);
  }
  return Array.from(map.entries()).map(([date, sessions]) => ({ date, sessions }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists a specialist's manual schedule blocks, optionally filtered to those
 * overlapping `[from, to]`.
 */
export async function listScheduleBlocks(specialistId: string, from: string | null, to: string | null) {
  let q = `
    select id, specialist_id, starts_at, ends_at, block_type, note, created_at
    from public.specialist_schedule_blocks
    where specialist_id = $1
  `;
  const params: unknown[] = [specialistId];

  if (from) {
    params.push(from);
    q += ` and ends_at >= $${params.length}::timestamptz`;
  }
  if (to) {
    params.push(to);
    q += ` and starts_at <= $${params.length}::timestamptz`;
  }

  q += ` order by starts_at asc`;

  const { rows } = await pool.query(q, params);
  return rows;
}

/**
 * Returns `true` if the given specialist already has a `pending`/`confirmed`
 * booking overlapping `[startsAt, endsAt]`.
 */
export async function hasOverlappingBooking(
  client: PoolClient,
  specialistId: string,
  startsAt: string,
  endsAt: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `select id
     from public.bookings
     where specialist_id = $1
       and status in ('pending', 'confirmed')
       and starts_at < $3::timestamptz
       and ends_at > $2::timestamptz
     limit 1;`,
    [specialistId, startsAt, endsAt],
  );
  return !!rows[0];
}

/** Inserts a new manual schedule block. */
export async function createScheduleBlock(
  client: PoolClient,
  specialistId: string,
  input: CreateBlockInput,
) {
  const { rows } = await client.query(
    `insert into public.specialist_schedule_blocks
       (specialist_id, starts_at, ends_at, block_type, note)
     values
       ($1, $2, $3, $4, $5)
     returning *;`,
    [specialistId, input.starts_at, input.ends_at, input.block_type, input.note ?? null],
  );
  return rows[0];
}

/** Deletes a schedule block, scoped to the owning specialist. Returns `true` if a row was deleted. */
export async function deleteScheduleBlock(blockId: string, specialistId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from public.specialist_schedule_blocks where id = $1 and specialist_id = $2`,
    [blockId, specialistId],
  );
  return (rowCount ?? 0) > 0;
}