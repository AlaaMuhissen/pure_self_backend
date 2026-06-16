/**
 * @file bookings.service.ts
 * @description
 *   Data-access layer for the bookings domain.
 *
 *   Covers all SQL for creating, reading, and updating bookings, as well as
 *   fetching specialist availability (bookings + schedule blocks).
 *
 *   All functions that participate in a transaction accept a pg `PoolClient`
 *   so the caller controls the transaction boundary. Read-only helpers that
 *   don't need a transaction use the shared `pool` directly.
 *
 *   No HTTP logic, no calendar calls, no email calls live here.
 */

import { pool } from "../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingRow {
  id:              string;
  user_id:         string;
  specialist_id:   string;
  starts_at:       string;
  ends_at:         string;
  status:          string;
  payment_id:      string | null;
  payment_status:  string | null;
  google_event_id: string | null;
  google_meet_url: string | null;
  calendar_provider: string | null;
  created_at:      string;
}

export interface BookingWithParties extends BookingRow {
  patient_email:   string;
  patient_name:    string;
  specialist_name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// User lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a Clerk user ID to the app's internal user row.
 * Returns `null` when no matching user is found.
 */
export async function getAppUserByClerkId(client: any, clerkUserId: string) {
  const { rows } = await client.query(
    `SELECT id, role FROM public.users WHERE clerk_user_id = $1 LIMIT 1;`,
    [clerkUserId],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookings — reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches a single booking by ID.
 * Returns `null` when not found.
 */
export async function getBookingById(
  client: any,
  bookingId: string,
): Promise<BookingRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM public.bookings WHERE id = $1 LIMIT 1;`,
    [bookingId],
  );
  return rows[0] ?? null;
}

/**
 * Fetches a booking together with patient and specialist display info.
 * Used when the status update handler needs to send emails or create
 * calendar events.
 */
export async function getBookingWithParties(
  client: any,
  bookingId: string,
): Promise<BookingWithParties | null> {
  const { rows } = await client.query(
    `SELECT
       b.*,
       u.email AS patient_email,
       u.name  AS patient_name,
       su.name AS specialist_name
     FROM public.bookings b
     JOIN public.users u  ON u.id  = b.user_id
     JOIN public.users su ON su.id = b.specialist_id
     WHERE b.id = $1
     LIMIT 1;`,
    [bookingId],
  );
  return rows[0] ?? null;
}

/**
 * Returns all bookings for a given user, newest first.
 */
export async function getBookingsByUserId(client: any, userId: string): Promise<BookingRow[]> {
  const { rows } = await client.query(
    `SELECT b.*
     FROM public.bookings b
     WHERE b.user_id = $1
     ORDER BY b.starts_at DESC;`,
    [userId],
  );
  return rows;
}

/**
 * Returns all bookings where the user is the specialist, newest first.
 */
export async function getBookingsBySpecialistId(
  client: any,
  specialistId: string,
): Promise<BookingRow[]> {
  const { rows } = await client.query(
    `SELECT b.*
     FROM public.bookings b
     WHERE b.specialist_id = $1
     ORDER BY b.starts_at DESC;`,
    [specialistId],
  );
  return rows;
}

/**
 * Returns all bookings across all users (admin only), newest first.
 */
export async function getAllBookings(): Promise<BookingRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM public.bookings ORDER BY created_at DESC;`,
  );
  return rows;
}

/**
 * Returns unavailable time ranges for a specialist on a given calendar day.
 * Combines active bookings (`pending` | `confirmed`) with manual schedule
 * blocks, sorted chronologically.
 *
 * @param specialistId  UUID of the specialist.
 * @param date          Calendar date in `YYYY-MM-DD` format.
 */
export async function getSpecialistDayAvailability(specialistId: string, date: string) {
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay   = `${date}T23:59:59.999Z`;

  const bookingsQ = `
    SELECT
      id, starts_at, ends_at, status,
      'booking'::text AS source
    FROM public.bookings
    WHERE specialist_id = $1
      AND starts_at <= $3::timestamptz
      AND ends_at   >= $2::timestamptz
      AND status IN ('pending', 'confirmed');`;

  const blocksQ = `
    SELECT
      id, starts_at, ends_at,
      block_type AS status,
      'block'::text AS source
    FROM public.specialist_schedule_blocks
    WHERE specialist_id = $1
      AND starts_at <= $3::timestamptz
      AND ends_at   >= $2::timestamptz;`;

  const [bookingsRes, blocksRes] = await Promise.all([
    pool.query(bookingsQ, [specialistId, startOfDay, endOfDay]),
    pool.query(blocksQ,   [specialistId, startOfDay, endOfDay]),
  ]);

  return [...bookingsRes.rows, ...blocksRes.rows].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookings — writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new booking with status `pending`.
 * Must be called inside an open transaction.
 */
export async function createBooking(
  client: any,
  params: {
    userId:       string;
    specialistId: string;
    startsAt:     string;
    endsAt:       string;
    paymentId?:   string | null;
  },
): Promise<BookingRow> {
  const { rows } = await client.query(
    `INSERT INTO public.bookings
       (user_id, specialist_id, starts_at, ends_at, status, payment_id)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING id, user_id, specialist_id, starts_at, ends_at,
               status, payment_id, created_at;`,
    [
      params.userId,
      params.specialistId,
      params.startsAt,
      params.endsAt,
      params.paymentId ?? null,
    ],
  );
  return rows[0];
}

/**
 * Sets a booking's status to `cancelled`.
 * Must be called inside an open transaction.
 */
export async function cancelBooking(client: any, bookingId: string): Promise<BookingRow> {
  const { rows } = await client.query(
    `UPDATE public.bookings SET status = 'cancelled' WHERE id = $1 RETURNING *;`,
    [bookingId],
  );
  return rows[0];
}

/**
 * Confirms a booking by setting its status and attaching Google Calendar /
 * Meet details. Also marks the payment as `paid`.
 * Must be called inside an open transaction.
 */
export async function confirmBookingWithCalendar(
  client: any,
  bookingId: string,
  newStatus: string,
  calendarDetails: {
    googleEventId:    string;
    googleMeetUrl:    string | null;
    calendarProvider: string;
  },
): Promise<void> {
  await client.query(
    `UPDATE public.bookings
     SET status            = $1,
         google_event_id   = $2,
         google_meet_url   = $3,
         calendar_provider = $4,
         payment_status    = 'paid'
     WHERE id = $5;`,
    [
      newStatus,
      calendarDetails.googleEventId,
      calendarDetails.googleMeetUrl,
      calendarDetails.calendarProvider,
      bookingId,
    ],
  );
}

/**
 * Rejects a booking by clearing its Google Calendar association.
 * Must be called inside an open transaction.
 */
export async function rejectBookingClearCalendar(
  client: any,
  bookingId: string,
  newStatus: string,
): Promise<void> {
  await client.query(
    `UPDATE public.bookings
     SET status          = $1,
         google_event_id = NULL,
         google_meet_url = NULL
     WHERE id = $2;`,
    [newStatus, bookingId],
  );
}

/**
 * Sets a booking status without touching any other fields.
 * Suitable for simple status transitions (pending → approved, etc.).
 * Must be called inside an open transaction.
 */
export async function setBookingStatus(
  client: any,
  bookingId: string,
  newStatus: string,
): Promise<BookingRow | null> {
  const { rows } = await client.query(
    `UPDATE public.bookings SET status = $1 WHERE id = $2 RETURNING *;`,
    [newStatus, bookingId],
  );
  return rows[0] ?? null;
}

/**
 * Deletes a booking by ID.
 * Returns `true` when a row was deleted, `false` when no matching row existed.
 */
export async function deleteBooking(client: any, bookingId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM public.bookings WHERE id = $1;`,
    [bookingId],
  );
  return (rowCount ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Returns `true` when a booking can still be cancelled by the user. */
export function canCancel(status: string): boolean {
  return status === "pending" || status === "approved";
}