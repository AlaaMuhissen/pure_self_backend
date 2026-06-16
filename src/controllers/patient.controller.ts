/**
 * @file patient.controller.ts
 * @description
 *   Request handlers for a patient's own profile and session reports.
 *
 *   Handlers validate input, resolve the Clerk user to an internal user ID,
 *   and delegate to `patient.service` for DB work. No SQL lives here.
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { getClerkUserId, getDbUserId } from "../libs/user";
import { pool } from "../db/supabase";
import { PatchPatientProfileSchema } from "../schemas/patient.schema";
import {
  getOwnPatientProfile,
  upsertOwnPatientProfile,
  listOwnReports,
  getOwnReportById,
} from "../services/patient.service";

function statusForError(msg: string): number {
  if (msg === "Unauthorized") return 401;
  if (msg === "UserNotFound") return 404;
  return 400;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the patient's own profile. If no row exists yet, returns a
 * front-friendly default shape instead of 404.
 */
export async function getOwnProfileHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const userId = await getDbUserId(clerkId);

    const item = await getOwnPatientProfile(userId);

    return res.json({
      ok: true,
      item: item ?? { user_id: userId, notes: null, default_session_link: null },
    });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /profile
// ─────────────────────────────────────────────────────────────────────────────

/** Updates (or creates) the patient's own profile (`notes` / `default_session_link`). */
export async function patchOwnProfileHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const clerkId = getClerkUserId(req);
    const userId = await getDbUserId(clerkId);
    const patch = PatchPatientProfileSchema.parse(req.body);

    await client.query("begin");
    const item = await upsertOwnPatientProfile(client, userId, patch);
    await client.query("commit");

    return res.json({ ok: true, item });
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /reports
// ─────────────────────────────────────────────────────────────────────────────

/** Lists all of the patient's own session reports, newest first. */
export async function listOwnReportsHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const userId = await getDbUserId(clerkId);

    const items = await listOwnReports(userId);
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /reports/:id
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a single session report owned by the patient. */
export async function getOwnReportHandler(req: Request, res: Response) {
  try {
    const clerkId = getClerkUserId(req);
    const userId = await getDbUserId(clerkId);
    const reportId = z.string().uuid().parse(req.params.id);

    const item = await getOwnReportById(reportId, userId);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}