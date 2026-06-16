/**
 * @file admin/bookings.controller.ts
 * @description
 *   Request handlers for the admin bookings API.
 *   All handlers assert admin privileges before touching any data.
 */

import type{ Request, Response } from "express";
import { getAuth }           from "@clerk/express";
import { z }                 from "zod";
import { pool }              from "../../db/supabase";
import { assertAdmin }       from "../../libs/user";
import {
  getAllBookings,
  setBookingStatus,
  deleteBooking,
} from "../../services/booking.service";
import { SetStatusSchema }   from "../booking.controller";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

async function ensureAdmin(req: Request): Promise<string> {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  await assertAdmin(userId);
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/bookings
 * Returns all bookings across the platform, newest first.
 */
export async function adminListBookingsHandler(req: Request, res: Response) {
  try {
    await ensureAdmin(req);

    const items = await getAllBookings();
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}

/**
 * PATCH /admin/bookings/:id/status
 * Overrides the status of any booking regardless of ownership.
 */
export async function adminSetBookingStatusHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await ensureAdmin(req);

    const bookingId = z.string().uuid().parse(req.params.id);
    const body      = SetStatusSchema.parse(req.body);

    const booking = await setBookingStatus(client, bookingId, body.status);
    if (!booking) return res.status(404).json({ error: "Not found" });

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
 * DELETE /admin/bookings/:id
 * Permanently removes a booking. Returns 404 when no row was deleted.
 */
export async function adminDeleteBookingHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await ensureAdmin(req);

    const bookingId = z.string().uuid().parse(req.params.id);
    const deleted   = await deleteBooking(client, bookingId);

    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
}