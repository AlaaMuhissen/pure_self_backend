/**
 * @file specialists.controller.ts
 * @description
 *   Request handlers for `specialistsRouter`:
 *     - Public specialist listing/profile
 *     - Specialist self-service: own patients, patient profiles, session
 *       reports, own bookings
 *
 *   Admin handlers live in `admin/specialists.controller.ts`.
 *   `specialistSelfRouter` handlers (GET/PATCH bookings) live in
 *   `specialistSelf.controller.ts` — preserved as a separate router since
 *   the original file kept them separate despite overlapping with routes
 *   here (see routes file for the resulting duplication note).
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import {
  CreateReportSchema,
  PatchReportSchema,
  PatchPatientBySpecialistSchema,
  PatchBookingStatusSchema,
} from "../schemas/specialists.schema";
import {
  getDbUserId,
  assertSpecialist,
  listAvailableSpecialists,
  getSpecialistProfile,
  getSpecialistBookingsForDay,
  getOwnBookings,
  updateOwnBookingStatus,
  listOwnPatients,
  patientLinkExists,
  getOwnPatientDetail,
  upsertPatientProfile,
  listReportsForOwnPatient,
  createReportForOwnPatient,
  updateOwnReport,
  deleteOwnReport,
} from "../services/specialists.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk user ID from the request. Throws `"Unauthorized"` if absent. */
function getClerkUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/** Resolves the request to an internal specialist user ID, asserting the specialist role. */
async function specialistIdFromReq(req: Request): Promise<string> {
  const clerkId = getClerkUserId(req);
  const specialistId = await getDbUserId(clerkId);
  await assertSpecialist(specialistId);
  return specialistId;
}

/** Maps known error messages to HTTP status codes, used across this controller. */
function statusForError(msg: string): number {
  if (msg === "Unauthorized") return 401;
  if (msg === "Forbidden")    return 403;
  if (msg === "UserNotFound") return 404;
  return 400;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists — list available specialists
// ─────────────────────────────────────────────────────────────────────────────

export async function listSpecialistsHandler(_req: Request, res: Response) {
  try {
    const items = await listAvailableSpecialists();
    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/:userId — public specialist profile
// ─────────────────────────────────────────────────────────────────────────────

export async function getSpecialistProfileHandler(req: Request, res: Response) {
  try {
    const userId = z.string().uuid().parse(req.params.userId);

    const item = await getSpecialistProfile(userId);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/:userId/bookings — public day availability
// ─────────────────────────────────────────────────────────────────────────────

export async function getSpecialistDayBookingsHandler(req: Request, res: Response) {
  try {
    const userId = z.string().uuid().parse(req.params.userId);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);

    const items = await getSpecialistBookingsForDay(userId, date);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/patients — list my patients
// ─────────────────────────────────────────────────────────────────────────────

export async function listMyPatientsHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);

    const u = await pool.query(`select id from public.users where clerk_user_id = $1 limit 1;`, [clerkId]);
    if (!u.rows[0]) {
      return res.status(404).json({ error: "User not found in DB (missing users row for this clerk_user_id)" });
    }

    const specialistId = u.rows[0].id as string;
    const items = await listOwnPatients(specialistId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/patients/:patientId — get one patient
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyPatientHandler(req: Request, res: Response) {
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    if (!(await patientLinkExists(pool, specialistId, patientId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const item = await getOwnPatientDetail(patientId);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /specialists/patients/:patientId/profile
// ─────────────────────────────────────────────────────────────────────────────

export async function patchMyPatientProfileHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const patch = PatchPatientBySpecialistSchema.parse(req.body);

    if (!(await patientLinkExists(client, specialistId, patientId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await client.query("begin");
    const item = await upsertPatientProfile(client, patientId, specialistId, patch);
    await client.query("commit");

    return res.json({ ok: true, item });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function listMyPatientReportsHandler(req: Request, res: Response) {
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    if (!(await patientLinkExists(pool, specialistId, patientId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const items = await listReportsForOwnPatient(specialistId, patientId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /specialists/patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function createMyPatientReportHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    if (!(await patientLinkExists(client, specialistId, patientId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const item = await createReportForOwnPatient(client, patientId, specialistId, body);
    return res.status(201).json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /specialists/reports/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function patchMyReportHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const reportId = z.string().uuid().parse(req.params.id);
    const patch = PatchReportSchema.parse(req.body);

    const item = await updateOwnReport(client, reportId, specialistId, patch);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /specialists/reports/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteMyReportHandler(req: Request, res: Response) {
  try {
    const specialistId = await specialistIdFromReq(req);
    const reportId = z.string().uuid().parse(req.params.id);

    const deleted = await deleteOwnReport(reportId, specialistId);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /specialists/bookings — own bookings list
// ─────────────────────────────────────────────────────────────────────────────

export async function listMyBookingsHandler(req: Request, res: Response) {
  try {
    const specialistId = await specialistIdFromReq(req);
    const items = await getOwnBookings(specialistId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /specialists/bookings/:id — own booking status update
// ─────────────────────────────────────────────────────────────────────────────

export async function patchMyBookingStatusHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const bookingId = z.string().uuid().parse(req.params.id);
    const body = PatchBookingStatusSchema.parse(req.body);

    await client.query("begin");

    const result = await updateOwnBookingStatus(client, bookingId, specialistId, body.status);

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
    return res.status(statusForError(e?.message ?? "Bad request")).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}