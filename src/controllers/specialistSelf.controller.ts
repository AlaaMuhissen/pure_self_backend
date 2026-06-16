/**
 * @file specialistSelf.controller.ts
 * @description
 *   Request handlers for `specialistSelfRouter`.
 *
 * ⚠️ DUPLICATE ROUTE WARNING:
 *   These two handlers (`GET /bookings`, `PATCH /bookings/:id`) implement
 *   the SAME functionality as `listMyBookingsHandler` and
 *   `patchMyBookingStatusHandler` in `specialists.controller.ts`
 *   (`specialistsRouter`'s `GET /bookings` and `PATCH /bookings/:id`).
 *
 *   The only difference: this version uses `getDbUserId` + `assertSpecialist`
 *   as two separate calls (with the error-message → status mapping inlined),
 *   while `specialists.controller.ts` wraps both in `specialistIdFromReq()`.
 *   The underlying SQL is byte-for-byte identical
 *   (`getOwnBookings` / `updateOwnBookingStatus` in `specialists.service.ts`).
 *
 *   Both routers/files are preserved here because the original source had
 *   them as separate exports (`specialistSelfRouter` vs `specialistsRouter`),
 *   and it's unclear which one your app actually mounts. Recommend checking
 *   your main app file for both router names — if only one is mounted,
 *   delete the other router + its routes file entirely.
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import { SpecialistUpdateBookingSchema } from "../schemas/specialists.schema";
import {
  getDbUserId,
  assertSpecialist,
  getOwnBookings,
  updateOwnBookingStatus,
} from "../services/specialists.service";

/** Extracts the Clerk user ID from the request. Throws `"Unauthorized"` if absent. */
function getClerkUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function statusForError(msg: string): number {
  if (msg === "Forbidden")    return 403;
  if (msg === "Unauthorized") return 401;
  if (msg === "UserNotFound") return 404;
  return 400;
}

/**
 * GET /specialist/bookings
 * Specialist sees her own sessions.
 */
export async function getSelfBookingsHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const specialistUserId = await getDbUserId(clerkId);
    await assertSpecialist(specialistUserId);

    const items = await getOwnBookings(specialistUserId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

/**
 * PATCH /specialist/bookings/:id
 * Specialist updates status (accept/cancel/complete).
 */
export async function patchSelfBookingStatusHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);
    const specialistUserId = await getDbUserId(clerkId);
    await assertSpecialist(specialistUserId);

    const bookingId = z.string().uuid().parse(req.params.id);
    const body = SpecialistUpdateBookingSchema.parse(req.body);

    await client.query("begin");

    const result = await updateOwnBookingStatus(client, bookingId, specialistUserId, body.status);

    if ("notFound" in result) {
      await client.query("rollback");
      return res.status(404).json({ error: "Not found" });
    }
    if ("finalized" in result) {
      await client.query("rollback");
      return res.status(400).json({ error: "Cannot update finalized booking" });
    }

    await client.query("commit");
    return res.json({ ok: true, item: result.item });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  } finally {
    client.release();
  }
}