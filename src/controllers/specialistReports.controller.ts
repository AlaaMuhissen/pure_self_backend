/**
 * @file specialistReports.controller.ts
 * @description
 *   Request handlers for `specialistReportsRouter`.
 *
 * ⚠️ See `sessionReports.service.ts` for the duplicate-router warning.
 *
 * ⚠️ AUTH DEPENDENCY: every handler here calls `specialistIdOrThrow(req)`,
 *    which reads `req.appUserId`. This field must be set by an upstream
 *    middleware that does not appear in the original file (its own comment
 *    says "لازم يكون عندك middleware سابق يضيف req.appUserId" — "you must
 *    have a prior middleware that adds req.appUserId"). If that middleware
 *    doesn't exist in your app, every route below will throw "Unauthorized"
 *    and return 401 for every request.
 *
 *    If `sessionsRouter` (sessionReports.controller.ts) is the one actually
 *    wired into your app and working, this entire router/file may be
 *    dead code that was never finished. Confirm before relying on it.
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/supabase";
import {
  CreateReportSchema,
  PatchReportWithDateSchema,
} from "../schemas/sessionReports.schema";
import {
  listReportsForPatientFull,
  getReportById,
  insertReportWithDefaultDate,
  patchReportFull,
  deleteReport,
} from "../services/sessionReports.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the specialist's internal user ID from `req.appUserId`.
 * Throws `"Unauthorized"` if not set by upstream middleware.
 */
function specialistIdOrThrow(req: Request): string {
  const id = (req as Request & { appUserId?: string }).appUserId;
  if (!id) throw new Error("Unauthorized");
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function listPatientReportsFullHandler(req: Request, res: Response) {
  try {
    const specialistId = specialistIdOrThrow(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    const items = await listReportsForPatientFull(specialistId, patientId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /reports/:reportId
// ─────────────────────────────────────────────────────────────────────────────

export async function getReportByIdHandler(req: Request, res: Response) {
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    const item = await getReportById(reportId, specialistId);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /patients/:patientId/reports
// ─────────────────────────────────────────────────────────────────────────────

export async function createPatientReportFullHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    const item = await insertReportWithDefaultDate(client, specialistId, patientId, body);
    return res.status(201).json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /reports/:reportId
// ─────────────────────────────────────────────────────────────────────────────

export async function patchReportFullHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);
    const patch = PatchReportWithDateSchema.parse(req.body);

    const item = await patchReportFull(client, reportId, specialistId, patch);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /reports/:reportId
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteReportHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    const deleted = await deleteReport(reportId, specialistId);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}