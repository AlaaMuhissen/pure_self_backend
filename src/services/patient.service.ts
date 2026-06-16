/**
 * @file patient.service.ts
 * @description
 *   Data-access layer for a patient's own profile and session reports.
 *   No HTTP logic lives here.
 */

import type { PoolClient } from "pg";
import { pool } from "../db/supabase";
import type { z } from "zod";
import type { PatchPatientProfileSchema as _PatchPatientProfileSchema } from "../schemas/patient.schema";

type PatchPatientProfileInput = z.infer<typeof _PatchPatientProfileSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the patient's own profile row.
 * Returns `null` if no row exists yet (caller falls back to a default shape).
 */
export async function getOwnPatientProfile(userId: string) {
  const { rows } = await pool.query(
    `select user_id, notes, default_session_link, specialist_id
     from public.patient_profiles
     where user_id=$1
     limit 1;`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Upserts the patient's own profile (`notes` / `default_session_link`).
 * `coalesce` preserves existing values when a field isn't provided.
 */
export async function upsertOwnPatientProfile(
  client: PoolClient,
  userId: string,
  patch: PatchPatientProfileInput,
) {
  const { rows } = await client.query(
    `insert into public.patient_profiles (user_id, notes, default_session_link)
     values ($1, $2, $3)
     on conflict (user_id) do update set
       notes                 = coalesce($2, patient_profiles.notes),
       default_session_link  = coalesce($3, patient_profiles.default_session_link),
       updated_at            = now()
     returning user_id, notes, default_session_link, specialist_id;`,
    [userId, patch.notes ?? null, patch.default_session_link ?? null],
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reports
// ─────────────────────────────────────────────────────────────────────────────

/** Lists all session reports for the patient, including specialist display info, newest first. */
export async function listOwnReports(userId: string) {
  const { rows } = await pool.query(
    `select
       r.id,
       r.patient_id,
       r.specialist_id,
       u.name  as specialist_name,
       u.email as specialist_email,
       u.profile_image as specialist_image,
       r.booking_id,
       r.report_date,
       r.summary,
       r.recommendations,
       r.created_at
     from public.session_reports r
     join public.users u on u.id = r.specialist_id
     where r.patient_id = $1
     order by r.report_date desc, r.created_at desc;`,
    [userId],
  );
  return rows;
}

/** Fetches a single session report by ID, scoped to the requesting patient. Returns `null` if not found. */
export async function getOwnReportById(reportId: string, userId: string) {
  const { rows } = await pool.query(
    `select
       r.id,
       r.patient_id,
       r.specialist_id,
       u.name  as specialist_name,
       u.email as specialist_email,
       u.profile_image as specialist_image,
       r.booking_id,
       r.report_date,
       r.summary,
       r.recommendations,
       r.created_at
     from public.session_reports r
     join public.users u on u.id = r.specialist_id
     where r.id = $1 and r.patient_id = $2
     limit 1;`,
    [reportId, userId],
  );
  return rows[0] ?? null;
}