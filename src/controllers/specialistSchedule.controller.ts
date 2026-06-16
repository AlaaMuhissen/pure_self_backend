/**
 * @file specialistSchedule.controller.ts
 * @description
 *   Request handlers for a specialist's schedule (bookings grouped by day)
 *   and manual availability blocks.
 *
 *   Handlers validate input, resolve the Clerk user to an internal
 *   specialist ID, and delegate to `specialistSchedule.service` for DB work.
 *   No SQL lives here.
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import { CreateBlockSchema } from "../schemas/specialistSchedule.schema";
import {
  getDbUserId,
  assertSpecialist,
  getScheduleBookings,
  groupBookingsByDay,
  listScheduleBlocks,
  hasOverlappingBooking,
  createScheduleBlock,
  deleteScheduleBlock,
} from "../services/specialistSchedule.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk user ID from the request. Throws `"Unauthorized"` if absent. */
function getClerkUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function statusForError(msg: string): number {
  if (msg === "Unauthorized") return 401;
  if (msg === "Forbidden")    return 403;
  if (msg === "UserNotFound") return 404;
  return 400;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the specialist's bookings between `from` and `to`, grouped by day. */
export async function getScheduleHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);

    const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from);
    const to   = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to);

    const u = await pool.query(`select id from public.users where clerk_user_id=$1 limit 1;`, [clerkId]);
    const specialistUserId = u.rows?.[0]?.id;
    if (!specialistUserId) return res.status(404).json({ error: "User not found" });

    const rows = await getScheduleBookings(specialistUserId, from, to);
    const days = groupBookingsByDay(rows);

    return res.json({ ok: true, from, to, days });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /schedule/blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Lists the specialist's manual schedule blocks, optionally filtered by date range. */
export async function listScheduleBlocksHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const specialistId = await getDbUserId(clerkId);
    await assertSpecialist(specialistId);

    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to   = typeof req.query.to   === "string" ? req.query.to   : null;

    const items = await listScheduleBlocks(specialistId, from, to);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /schedule/blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a manual schedule block (e.g. a holiday or unavailable period).
 * Refuses to create a block that overlaps an existing pending/confirmed booking.
 */
export async function createScheduleBlockHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);
    const specialistId = await getDbUserId(clerkId);
    await assertSpecialist(specialistId);

    const body = CreateBlockSchema.parse(req.body);

    const starts = new Date(body.starts_at);
    const ends   = new Date(body.ends_at);
    if (ends <= starts) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    if (await hasOverlappingBooking(client, specialistId, body.starts_at, body.ends_at)) {
      return res.status(400).json({ error: "There is already a booking in this time range" });
    }

    const item = await createScheduleBlock(client, specialistId, body);
    return res.status(201).json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /schedule/blocks/:id
// ─────────────────────────────────────────────────────────────────────────────

/** Deletes a manual schedule block, scoped to the owning specialist. */
export async function deleteScheduleBlockHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const specialistId = await getDbUserId(clerkId);
    await assertSpecialist(specialistId);

    const blockId = z.string().uuid().parse(req.params.id);

    const deleted = await deleteScheduleBlock(blockId, specialistId);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}