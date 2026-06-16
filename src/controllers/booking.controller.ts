/**
 * @file bookings.controller.ts
 * @description
 *   Request handlers for user-facing and specialist-facing booking endpoints.
 *
 *   Handlers validate input, enforce ownership/access rules, delegate DB work
 *   to `bookings.service`, and trigger side-effects (calendar, email) when a
 *   booking is confirmed or rejected.
 *
 *   Admin handlers live separately in `admin/bookings.controller.ts`.
 */

import type { Request, Response } from "express";
import { getAuth }           from "@clerk/express";
import { z }                 from "zod";
import { pool }              from "../db/supabase";
import { createCalendarEvent, deleteCalendarEvent } from "../libs/googleCalendar";
import { sendBookingConfirmation }                  from "../libs/mailer";
import {
  getAppUserByClerkId,
  getBookingById,
  getBookingWithParties,
  getBookingsByUserId,
  getBookingsBySpecialistId,
  getSpecialistDayAvailability,
  createBooking,
  cancelBooking,
  confirmBookingWithCalendar,
  rejectBookingClearCalendar,
  setBookingStatus,
  canCancel,
} from "../services/booking.service";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const ISODate = z.string().datetime();

const BookingStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "confirmed",
]);

export const CreateBookingSchema = z.object({
  specialist_id: z.string().uuid(),
  starts_at:     ISODate,
  ends_at:       ISODate,
  payment_id:    z.string().uuid().optional().nullable(),
});

export const SetStatusSchema = z.object({
  status: BookingStatus,
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk user ID from the request. Throws `"Unauthorized"` if absent. */
function getClerkUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// User handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /bookings
 * Creates a booking with status `pending`.
 */
export async function createBookingHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);
    const body    = CreateBookingSchema.parse(req.body);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    // Validate time window
    const starts = new Date(body.starts_at);
    const ends   = new Date(body.ends_at);
    if (isNaN(starts.getTime())) return res.status(400).json({ error: "Invalid starts_at" });
    if (isNaN(ends.getTime()))   return res.status(400).json({ error: "Invalid ends_at" });
    if (ends <= starts)          return res.status(400).json({ error: "ends_at must be after starts_at" });

    const booking = await createBooking(client, {
      userId:       appUser.id,
      specialistId: body.specialist_id,
      startsAt:     body.starts_at,
      endsAt:       body.ends_at,
      paymentId:    body.payment_id,
    });

    await client.query("commit");
    return res.status(201).json({ ok: true, booking });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code)
      return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /bookings/my
 * Returns all bookings for the authenticated user.
 */
export async function getMyBookingsHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const items = await getBookingsByUserId(client, appUser.id);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /bookings/:id
 * Returns a single booking. Accessible by the booking owner, the specialist,
 * or an admin.
 */
export async function getBookingHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId   = getClerkUserId(req);
    const bookingId = z.string().uuid().parse(req.params.id);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const booking = await getBookingById(client, bookingId);
    if (!booking) return res.status(404).json({ error: "Not found" });

    const isOwner      = booking.user_id      === appUser.id;
    const isSpecialist = booking.specialist_id === appUser.id;
    if (!isOwner && !isSpecialist && appUser.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ ok: true, booking });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * PATCH /bookings/:id/cancel
 * Allows a user to cancel their own booking when it is `pending` or `approved`.
 */
export async function cancelBookingHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId   = getClerkUserId(req);
    const bookingId = z.string().uuid().parse(req.params.id);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const booking = await getBookingById(client, bookingId);
    if (!booking) return res.status(404).json({ error: "Not found" });

    if (booking.user_id !== appUser.id)
      return res.status(403).json({ error: "Forbidden" });
    if (!canCancel(booking.status))
      return res.status(400).json({ error: `Cannot cancel when status=${booking.status}` });

    const updated = await cancelBooking(client, bookingId);

    await client.query("commit");
    return res.json({ ok: true, booking: updated });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialist handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /bookings/specialist/list
 * Returns all bookings where the authenticated user is the specialist.
 */
export async function getSpecialistBookingsHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const items = await getBookingsBySpecialistId(client, appUser.id);
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /bookings/specialist/:id/day?date=YYYY-MM-DD
 * Returns unavailable time ranges (bookings + schedule blocks) for one
 * specialist on the given calendar day.
 */
export async function getSpecialistDayHandler(req: Request, res: Response) {
  try {
    const specialistId = z.string().uuid().parse(req.params.id);
    const date         = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(req.query.date ?? ""));

    const items = await getSpecialistDayAvailability(specialistId, date);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

/**
 * PATCH /bookings/:id/status
 * Allows a specialist to update the status of their own bookings.
 *
 * Side-effects:
 *   - `confirmed` → creates a Google Calendar event + sends confirmation email
 *   - `rejected`  → deletes the associated Google Calendar event (if any)
 */
export async function updateBookingStatusHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId   = getClerkUserId(req);
    const bookingId = z.string().uuid().parse(req.params.id);
    const body      = SetStatusSchema.parse(req.body);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const row = await getBookingWithParties(client, bookingId);
    if (!row) return res.status(404).json({ ok: false, error: "Booking not found" });

    // Only the assigned specialist may change the status.
    if (row.specialist_id !== appUser.id)
      return res.status(403).json({ error: "Forbidden" });

    // ── Confirmed: create calendar event + notify patient ─────────────────────
    if (body.status === "confirmed" && !row.google_event_id) {
      const { googleEventId, googleMeetUrl, calendarProvider } = await createCalendarEvent({
        patientEmail: row.patient_email,
        patientName:  row.patient_name,
        startsAt:     row.starts_at,
        endsAt:       row.ends_at,
        bookingId,
      });

      await confirmBookingWithCalendar(client, bookingId, body.status, {
        googleEventId,
        googleMeetUrl,
        calendarProvider,
      });

      // Fire-and-forget — a failed email must not roll back the booking.
      sendBookingConfirmation({
        eventId:       googleEventId,
        patientEmail:  row.patient_email ?? null,
        patientName:   row.patient_name,
        startsAt:      row.starts_at,
        endsAt:        row.ends_at,
        meetUrl:       googleMeetUrl,
        specialistName: row.specialist_name,
      }).catch((err) => console.error("Email send failed:", err));


      await client.query("commit");
      return res.json({
        ok: true,
        booking: {
          ...row,
          status:          body.status,
          google_event_id: googleEventId,
          google_meet_url: googleMeetUrl,
          payment_status:  "paid",
        },
      });
    }

    // ── Rejected: delete calendar event if one exists ─────────────────────────
    if (body.status === "rejected" && row.google_event_id) {
      await deleteCalendarEvent(row.google_event_id);
      await rejectBookingClearCalendar(client, bookingId, body.status);
      await client.query("commit");
      return res.json({ ok: true, booking: { ...row, status: body.status } });
    }

    // ── All other status transitions ──────────────────────────────────────────
    await setBookingStatus(client, bookingId, body.status);
    await client.query("commit");
    return res.json({ ok: true, booking: { ...row, status: body.status } });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    console.error("Booking status error:", e);
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg    = e?.message ?? "Bad request";
    const status =
      msg === "Forbidden"     ? 403 :
      msg === "Unauthorized"  ? 401 :
      msg === "Not Found"     ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}