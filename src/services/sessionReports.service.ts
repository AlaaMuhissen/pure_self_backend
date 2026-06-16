/**
 * @file sessionReports.service.ts
 * @description
 *   Data-access layer for session reports and specialist booking lookups.
 *
 * ⚠️ DUPLICATE ROUTER WARNING:
 *   This file backs TWO routers from the original source —
 *   `sessionsRouter` and `specialistReportsRouter` — which implement
 *   overlapping/duplicate endpoints for `session_reports`:
 *     - GET    /patients/:patientId/reports   (both routers)
 *     - GET    /reports/:reportId             (both routers)
 *     - POST   /patients/:patientId/reports   (both routers)
 *     - PATCH  /reports/:reportId             (both routers)
 *
 *   The two implementations differ in HOW the specialist's internal user ID
 *   is resolved:
 *     - `sessionsRouter`            → resolves via `getDbUserId(clerkId)` / Clerk auth
 *     - `specialistReportsRouter`   → reads `req.appUserId`, set by an
 *                                       unspecified upstream middleware
 *                                       that does not appear to exist yet
 *                                       ("لازم يكون عندك middleware سابق")
 *
 *   Both routers and all their functions are preserved below so nothing
 *   breaks, but you almost certainly only want ONE of these mounted.
 *   Recommend removing `specialistReportsRouter` once you confirm
 *   `sessionsRouter` is the one wired into your app — search your app.ts
 *   for both router names to check which is actually mounted.
 */

import { pool } from "../db/supabase";
import type { PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateReportInput {
  booking_id?:       string | null;
  report_date?:      string;
  summary:           string;
  recommendations?:  string | null;
}

export interface PatchReportInput {
  summary?:          string;
  recommendations?:  string | null;
}

export interface PatchReportWithDateInput extends PatchReportInput {
  report_date?: string | null;
}

export interface PatchBookingInput {
  status?: "pending" | "approved" | "cancelled" | "completed";
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialist / booking lookups (sessionsRouter)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolves the internal `users.id` for a Clerk user ID. Returns `null` if not found. */
export async function getUserIdByClerkId(clerkUserId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select id from public.users where clerk_user_id = $1 limit 1`,
    [clerkUserId],
  );
  return rows[0]?.id ?? null;
}

/**
 * Fetches a booking owned by the given specialist, including patient info
 * and a count of session reports linked to it.
 */
export async function getSpecialistBookingDetail(bookingId: string, specialistUserId: string) {
  const { rows } = await pool.query(
    `select
       b.id,
       b.user_id as patient_id,
       b.specialist_id,
       b.starts_at,
       b.ends_at,
       b.status,
       b.created_at,
       u.name  as patient_name,
       u.email as patient_email,
       u.profile_image as patient_profile_image,
       coalesce(count(sr.id), 0)::int as reports_count
     from public.bookings b
     join public.users u on u.id = b.user_id
     left join public.session_reports sr on sr.booking_id = b.id
     where b.id = $1
       and b.specialist_id = $2
     group by b.id, u.id`,
    [bookingId, specialistUserId],
  );
  return rows[0] ?? null;
}

/**
 * Updates a booking's status. Scoped to the given specialist — returns
 * `null` if no matching booking is found.
 */
export async function patchBookingStatus(
  bookingId: string,
  specialistUserId: string,
  status: PatchBookingInput["status"] | undefined,
) {
  const { rows } = await pool.query(
    `update public.bookings
     set status = coalesce($3, status)
     where id = $1 and specialist_id = $2
     returning *;`,
    [bookingId, specialistUserId, status ?? null],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reports — reads (sessionsRouter)
// ─────────────────────────────────────────────────────────────────────────────

/** Lists session reports for a patient, written by the given specialist, newest first. */
export async function listReportsForPatient(specialistUserId: string, patientId: string) {
  const { rows } = await pool.query(
    `select id, specialist_id, patient_id, booking_id, report_date, summary, recommendations, created_at
     from public.session_reports
     where specialist_id = $1 and patient_id = $2
     order by report_date desc;`,
    [specialistUserId, patientId],
  );
  return rows;
}

/**
 * Fetches a single session report by ID, scoped to the given specialist,
 * including patient info and the linked booking's schedule/status.
 */
export async function getReportDetail(reportId: string, specialistUserId: string) {
  const { rows } = await pool.query(
    `select
       r.id,
       r.specialist_id,
       r.patient_id,
       r.booking_id,
       r.report_date,
       r.summary,
       r.recommendations,
       r.created_at,
       pu.name  as patient_name,
       pu.email as patient_email,
       pu.profile_image as patient_profile_image,
       b.starts_at,
       b.ends_at,
       b.status as booking_status
     from public.session_reports r
     left join public.users pu on pu.id = r.patient_id
     left join public.bookings b on b.id = r.booking_id
     where r.id = $1
       and r.specialist_id = $2
     limit 1;`,
    [reportId, specialistUserId],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reports — writes (sessionsRouter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that a booking belongs to the given specialist + patient.
 * Throws if `bookingId` is set but doesn't match.
 * Must be called inside an open transaction.
 */
export async function assertBookingBelongsToPair(
  client: PoolClient,
  bookingId: string,
  specialistUserId: string,
  patientId: string,
): Promise<void> {
  const { rows } = await client.query(
    `select id from public.bookings where id=$1 and specialist_id=$2 and user_id=$3 limit 1;`,
    [bookingId, specialistUserId, patientId],
  );
  if (!rows[0]) throw new Error("Invalid booking_id for this patient/specialist");
}

/**
 * Inserts a new session report.
 * Must be called inside an open transaction.
 *
 * @param reportDate  ISO timestamp; defaults to "now" if not provided.
 */
export async function insertReport(
  client: PoolClient,
  specialistUserId: string,
  patientId: string,
  input: CreateReportInput,
) {
  const reportDate = input.report_date
    ? new Date(input.report_date).toISOString()
    : new Date().toISOString();

  const { rows } = await client.query(
    `insert into public.session_reports
       (specialist_id, patient_id, booking_id, report_date, summary, recommendations)
     values ($1,$2,$3,$4,$5,$6)
     returning *;`,
    [specialistUserId, patientId, input.booking_id ?? null, reportDate, input.summary, input.recommendations ?? null],
  );
  return rows[0];
}

/**
 * Updates `summary`/`recommendations` on a session report, scoped to the
 * given specialist. Returns `null` if no matching report is found.
 * Must be called inside an open transaction.
 */
export async function patchReportSummary(
  client: PoolClient,
  reportId: string,
  specialistUserId: string,
  patch: PatchReportInput,
) {
  const { rows } = await client.query(
    `update public.session_reports
     set
       summary          = coalesce($2, summary),
       recommendations  = coalesce($3, recommendations)
     where id = $1
       and specialist_id = $4
     returning *;`,
    [reportId, patch.summary ?? null, patch.recommendations ?? null, specialistUserId],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reports — reads/writes (specialistReportsRouter)
// ─────────────────────────────────────────────────────────────────────────────

/** Lists ALL columns of session reports for a patient, scoped to specialist. */
export async function listReportsForPatientFull(specialistId: string, patientId: string) {
  const { rows } = await pool.query(
    `select r.*
     from public.session_reports r
     where r.specialist_id = $1 and r.patient_id = $2
     order by r.report_date desc, r.created_at desc;`,
    [specialistId, patientId],
  );
  return rows;
}

/** Fetches a single session report (all columns) by ID, scoped to specialist. */
export async function getReportById(reportId: string, specialistId: string) {
  const { rows } = await pool.query(
    `select r.*
     from public.session_reports r
     where r.id = $1 and r.specialist_id = $2
     limit 1;`,
    [reportId, specialistId],
  );
  return rows[0] ?? null;
}

/**
 * Inserts a new session report. `report_date` defaults to `now()` in SQL
 * when not provided.
 */
export async function insertReportWithDefaultDate(
  client: PoolClient,
  specialistId: string,
  patientId: string,
  input: CreateReportInput,
) {
  const { rows } = await client.query(
    `insert into public.session_reports
       (specialist_id, patient_id, booking_id, report_date, summary, recommendations)
     values
       ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6)
     returning *;`,
    [specialistId, patientId, input.booking_id ?? null, input.report_date ?? null, input.summary, input.recommendations ?? null],
  );
  return rows[0];
}

/**
 * Updates `summary`/`recommendations`/`report_date` on a session report,
 * scoped to specialist. Returns `null` if no matching report is found.
 */
export async function patchReportFull(
  client: PoolClient,
  reportId: string,
  specialistId: string,
  patch: PatchReportWithDateInput,
) {
  const { rows } = await client.query(
    `update public.session_reports
     set
       summary          = coalesce($3, summary),
       recommendations  = coalesce($4, recommendations),
       report_date      = coalesce($5::timestamptz, report_date)
     where id = $1 and specialist_id = $2
     returning *;`,
    [reportId, specialistId, patch.summary ?? null, patch.recommendations ?? null, patch.report_date ?? null],
  );
  return rows[0] ?? null;
}

/** Deletes a session report, scoped to specialist. Returns `true` if a row was deleted. */
export async function deleteReport(reportId: string, specialistId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from public.session_reports where id=$1 and specialist_id=$2;`,
    [reportId, specialistId],
  );
  return (rowCount ?? 0) > 0;
}