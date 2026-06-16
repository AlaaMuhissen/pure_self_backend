/**
 * @file sessionReports.controller.ts
 * @description
 *   Request handlers for `sessionsRouter`: specialist-scoped session
 *   reports, booking detail lookup, and booking status updates.
 *
 *   Resolves the specialist's internal user ID via Clerk auth + `getDbUserId`.
 *   See `sessionReports.service.ts` for the duplicate-router warning.
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { getDbUserId } from "../libs/user";
import { pool } from "../db/supabase";
import {
  CreateReportSchema,
  PatchReportSchema,
  PatchBookingSchema,
} from "../schemas/sessionReports.schema";
import {
  getUserIdByClerkId,
  getSpecialistBookingDetail,
  patchBookingStatus,
  listReportsForPatient,
  getReportDetail,
  assertBookingBelongsToPair,
  insertReport,
  patchReportSummary,
} from "../services/sessionReports.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk user ID from the request. Throws `"Unauthorized"` if absent. */
function clerkIdOrThrow(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function listPatientReportsHandler(req: Request, res: Response) {
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getDbUserId(clerkId);

    const patientId = z.string().uuid().parse(req.params.patientId);

    const items = await listReportsForPatient(specialistUserId, patientId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function createPatientReportHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getDbUserId(clerkId);

    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    await client.query("begin");

    if (body.booking_id) {
      await assertBookingBelongsToPair(client, body.booking_id, specialistUserId, patientId);
    }

    const item = await insertReport(client, specialistUserId, patientId, body);

    await client.query("commit");
    return res.status(201).json({ ok: true, item });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /bookings/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function patchBookingHandler(req: Request, res: Response) {
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getDbUserId(clerkId);

    const bookingId = z.string().uuid().parse(req.params.id);
    const patch = PatchBookingSchema.parse(req.body);

    const item = await patchBookingStatus(bookingId, specialistUserId, patch.status);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /bookings/:bookingId
// ─────────────────────────────────────────────────────────────────────────────

export async function getBookingDetailHandler(req: Request, res: Response) {
  try {
    const bookingId = z.string().uuid().parse(req.params.bookingId);
    const clerkUserId = clerkIdOrThrow(req);

    const specialistUserId = await getUserIdByClerkId(clerkUserId);
    if (!specialistUserId) return res.status(404).json({ error: "Specialist not found" });

    const booking = await getSpecialistBookingDetail(bookingId, specialistUserId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    return res.json({ ok: true, booking });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /reports/:reportId
// ─────────────────────────────────────────────────────────────────────────────

export async function getReportDetailHandler(req: Request, res: Response) {
  try {
    const clerkId = clerkIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    const specialistUserId = await getUserIdByClerkId(clerkId);
    if (!specialistUserId) return res.status(404).json({ error: "User not found" });

    const report = await getReportDetail(reportId, specialistUserId);
    if (!report) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, report });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /reports/:reportId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ BUG FIX: the original query referenced `$4` (specialist_id) in its
 * WHERE clause but the params array only passed 3 values plus a trailing
 * comma (producing `undefined` for `$4`). That meant `specialist_id = $4`
 * never matched anything, so this endpoint ALWAYS returned 404 — the
 * specialist could never patch their own reports through this route.
 *
 * Fixed by passing `specialistUserId` as the 4th parameter, matching the
 * SQL's intent (and matching `patchReportSummary`'s signature).
 */
export async function patchReportHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getUserIdByClerkId(clerkId);
    if (!specialistUserId) return res.status(404).json({ error: "User not found" });

    const reportId = z.string().uuid().parse(req.params.reportId);
    const patch = PatchReportSchema.parse(req.body);

    await client.query("begin");

    const item = await patchReportSummary(client, reportId, specialistUserId, patch);

    if (!item) {
      await client.query("rollback");
      return res.status(404).json({ error: "Report not found (or not yours)" });
    }

    await client.query("commit");
    return res.json({ ok: true, item });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}