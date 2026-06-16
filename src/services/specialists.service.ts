/**
 * @file specialists.service.ts
 * @description
 *   Data-access layer for:
 *     - Public specialist listing/profile (`specialistsRouter`)
 *     - Specialist self-service: own bookings, own patients, patient
 *       profiles, and session reports (`specialistsRouter` + `specialistSelfRouter`)
 *
 *   Admin CRUD lives separately in `admin/specialists.service.ts`.
 *   No HTTP logic lives here.
 */

import type { PoolClient } from "pg";
import { pool } from "../db/supabase";
import type {
  CreateReportSchema as _CreateReportSchema,
  PatchReportSchema as _PatchReportSchema,
  PatchPatientBySpecialistSchema as _PatchPatientBySpecialistSchema,
} from "../schemas/specialists.schema";
import type { z } from "zod";

type CreateReportInput = z.infer<typeof _CreateReportSchema>;
type PatchReportInput  = z.infer<typeof _PatchReportSchema>;
type PatchPatientInput = z.infer<typeof _PatchPatientBySpecialistSchema>;

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

/** Throws `"Forbidden"` unless `userId` is an available specialist. */
export async function assertSpecialist(userId: string): Promise<void> {
  const { rows } = await pool.query(
    `select user_id from public.specialists where user_id = $1 and available = true limit 1;`,
    [userId],
  );
  if (!rows[0]) throw new Error("Forbidden");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public listings
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all available specialists joined with basic user info. */
export async function listAvailableSpecialists() {
  const { rows } = await pool.query(
    `select
       s.user_id, s.available, s.bio, s.tags, s.hourly_price,
       u.name, u.email, u.profile_image, u.palette_id
     from public.specialists s
     join public.users u on u.id = s.user_id
     where s.available = true
     order by u.created_at desc;`,
  );
  return rows;
}

/** Returns a single specialist's public profile, or `null` if not found. */
export async function getSpecialistProfile(userId: string) {
  const { rows } = await pool.query(
    `select
       s.user_id, s.available, s.bio, s.tags, s.hourly_price,
       u.name, u.email, u.profile_image, u.palette_id
     from public.specialists s
     join public.users u on u.id = s.user_id
     where s.user_id = $1
     limit 1;`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Returns a specialist's pending/confirmed bookings for a given calendar day.
 * @param date  `YYYY-MM-DD`
 */
export async function getSpecialistBookingsForDay(specialistUserId: string, date: string) {
  const start = `${date}T00:00:00.000Z`;
  const end   = `${date}T23:59:59.999Z`;

  const { rows } = await pool.query(
    `select id, starts_at, ends_at, status
     from public.bookings
     where specialist_id = $1
       and starts_at >= $2::timestamptz
       and starts_at <= $3::timestamptz
       and status in ('pending', 'confirmed')
     order by starts_at asc;`,
    [specialistUserId, start, end],
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialist's own bookings
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all bookings where the given user is the specialist, newest first. */
export async function getOwnBookings(specialistUserId: string) {
  const { rows } = await pool.query(
    `select
       b.id, b.user_id, b.specialist_id, b.starts_at, b.ends_at, b.status, b.created_at,
       u.name as user_name, u.profile_image as user_image
     from public.bookings b
     join public.users u on u.id = b.user_id
     where b.specialist_id = $1
     order by b.starts_at desc;`,
    [specialistUserId],
  );
  return rows;
}

/**
 * Updates a booking's status, scoped to the owning specialist.
 * Refuses to update bookings already `cancelled` or `completed`.
 *
 * @returns `{ notFound: true }`, `{ finalized: true }`, or `{ item }`.
 */
export async function updateOwnBookingStatus(
  client: PoolClient,
  bookingId: string,
  specialistUserId: string,
  status: string,
): Promise<{ notFound: true } | { finalized: true } | { item: any }> {
  const { rows: checkRows } = await client.query(
    `select id, status from public.bookings where id=$1 and specialist_id=$2 limit 1;`,
    [bookingId, specialistUserId],
  );
  if (!checkRows[0]) return { notFound: true };

  const currentStatus = checkRows[0].status as string;
  if (currentStatus === "cancelled" || currentStatus === "completed") {
    return { finalized: true };
  }

  const { rows } = await client.query(
    `update public.bookings
     set status = $2
     where id = $1 and specialist_id = $3
     returning *;`,
    [bookingId, status, specialistUserId],
  );
  return { item: rows[0] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialist's own patients
// ─────────────────────────────────────────────────────────────────────────────

/** Lists patients linked to the specialist via `specialist_patients`, with report counts. */
export async function listOwnPatients(specialistId: string) {
  const { rows } = await pool.query(
    `select
       sp.patient_id,
       u.name, u.email, u.profile_image,
       (
         select count(*)::int
         from public.session_reports r
         where r.specialist_id = $1 and r.patient_id = sp.patient_id
       ) as reports_count
     from public.specialist_patients sp
     join public.users u on u.id = sp.patient_id
     where sp.specialist_id = $1
     order by u.created_at desc;`,
    [specialistId],
  );
  return rows;
}

/** Returns `true` if a `specialist_patients` link exists for this pair. */
export async function patientLinkExists(client: PoolClient | typeof pool, specialistId: string, patientId: string): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
    [specialistId, patientId],
  );
  return !!rows[0];
}

/** Fetches one patient's basic info + profile fields. Returns `null` if not found. */
export async function getOwnPatientDetail(patientId: string) {
  const { rows } = await pool.query(
    `select
       u.id, u.name, u.email, u.profile_image,
       pp.notes, pp.default_session_link
     from public.users u
     left join public.patient_profiles pp on pp.user_id = u.id
     where u.id=$1
     limit 1;`,
    [patientId],
  );
  return rows[0] ?? null;
}

/** Upserts a patient's profile (notes / default session link), set by their specialist. */
export async function upsertPatientProfile(
  client: PoolClient,
  patientId: string,
  specialistId: string,
  patch: PatchPatientInput,
) {
  const { rows } = await client.query(
    `insert into public.patient_profiles (user_id, specialist_id, notes, default_session_link)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       specialist_id          = $2,
       notes                  = coalesce($3, patient_profiles.notes),
       default_session_link   = coalesce($4, patient_profiles.default_session_link),
       updated_at             = now()
     returning user_id, specialist_id, notes, default_session_link;`,
    [patientId, specialistId, patch.notes ?? null, patch.default_session_link ?? null],
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reports (specialist self-service)
// ─────────────────────────────────────────────────────────────────────────────

/** Lists session reports for a patient, written by the given specialist. */
export async function listReportsForOwnPatient(specialistId: string, patientId: string) {
  const { rows } = await pool.query(
    `select id, patient_id, specialist_id, report_date, summary, recommendations, created_at
     from public.session_reports
     where patient_id=$1 and specialist_id=$2
     order by report_date desc, created_at desc;`,
    [patientId, specialistId],
  );
  return rows;
}

/** Inserts a new session report for a patient. */
export async function createReportForOwnPatient(
  client: PoolClient,
  patientId: string,
  specialistId: string,
  input: CreateReportInput,
) {
  const { rows } = await client.query(
    `insert into public.session_reports (patient_id, specialist_id, report_date, summary, recommendations)
     values ($1,$2,$3,$4,$5)
     returning *;`,
    [patientId, specialistId, input.report_date, input.summary, input.recommendations ?? null],
  );
  return rows[0];
}

/** Updates a session report, scoped to the owning specialist. Returns `null` if not found. */
export async function updateOwnReport(
  client: PoolClient,
  reportId: string,
  specialistId: string,
  patch: PatchReportInput,
) {
  const { rows } = await client.query(
    `update public.session_reports
     set
       report_date     = coalesce($2, report_date),
       summary         = coalesce($3, summary),
       recommendations = coalesce($4, recommendations)
     where id=$1 and specialist_id=$5
     returning *;`,
    [reportId, patch.report_date ?? null, patch.summary ?? null, patch.recommendations ?? null, specialistId],
  );
  return rows[0] ?? null;
}

/** Deletes a session report, scoped to the owning specialist. Returns `true` if a row was deleted. */
export async function deleteOwnReport(reportId: string, specialistId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from public.session_reports where id=$1 and specialist_id=$2;`,
    [reportId, specialistId],
  );
  return (rowCount ?? 0) > 0;
}