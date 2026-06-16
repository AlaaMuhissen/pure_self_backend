/**
 * @file admin/specialists.controller.ts
 * @description
 *   Request handlers for admin CRUD on the `specialists` table.
 *   All handlers assert admin privileges before touching any data.
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../../db/supabase";
import { assertAdmin } from "../../libs/user";
import { CreateSpecialistSchema, PatchSpecialistSchema } from "../../schemas/specialists.schema";
import {
  upsertSpecialist,
  listAllSpecialists,
  getSpecialistByIdAdmin,
  patchSpecialistAdmin,
  deleteSpecialistAdmin,
} from "../../services/admin/specialists.service";

/** Extracts the Clerk user ID and asserts admin privileges. */
async function ensureAdmin(req: Request): Promise<string> {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  await assertAdmin(userId);
  return userId;
}

function statusForError(msg: string): number {
  if (msg === "Forbidden")    return 403;
  if (msg === "Unauthorized") return 401;
  return 400;
}

/**
 * POST /admin/specialists
 * Creates or updates a specialist row (upsert on `user_id`).
 */
export async function createOrUpdateSpecialistHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await ensureAdmin(req);

    const body = CreateSpecialistSchema.parse(req.body);
    const item = await upsertSpecialist(client, body);

    return res.status(201).json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /admin/specialists
 * Lists all specialists.
 */
export async function listSpecialistsAdminHandler(req: Request, res: Response) {
  try {
    await ensureAdmin(req);
    const items = await listAllSpecialists();
    return res.json({ ok: true, items });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

/**
 * GET /admin/specialists/:userId
 */
export async function getSpecialistAdminHandler(req: Request, res: Response) {
  try {
    await ensureAdmin(req);

    const userId = z.string().uuid().parse(req.params.userId);
    const item = await getSpecialistByIdAdmin(userId);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  }
}

/**
 * PATCH /admin/specialists/:userId
 */
export async function patchSpecialistAdminHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await ensureAdmin(req);

    const userId = z.string().uuid().parse(req.params.userId);
    const patch = PatchSpecialistSchema.parse(req.body);

    const item = await patchSpecialistAdmin(client, userId, patch);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item });
  } catch (e: any) {
    if (e?.name === "ZodError")
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * DELETE /admin/specialists/:userId
 */
export async function deleteSpecialistAdminHandler(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await ensureAdmin(req);

    const userId = z.string().uuid().parse(req.params.userId);
    const deleted = await deleteSpecialistAdmin(client, userId);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(statusForError(msg)).json({ error: msg });
  } finally {
    client.release();
  }
}