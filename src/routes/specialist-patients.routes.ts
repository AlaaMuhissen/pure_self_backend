import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { z } from "zod";
import { clerkUserIdOrThrow, getUserUuidByClerkId } from "../config/auth";
import { pool } from "../db/supabase";


export const patientRouter = Router();

const PatchPatientProfileSchema = z.object({
  // If you want: only allow session link change for patient
  default_session_link: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});

patientRouter.get("/profile", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const userId = await getUserUuidByClerkId(clerkId);

    const { rows } = await pool.query(
      `select user_id, notes, default_session_link, specialist_id
       from public.patient_profiles
       where user_id=$1
       limit 1;`,
      [userId]
    );

    // if no profile row exists: return empty object (front friendly)
    return res.json({ ok: true, item: rows[0] ?? { user_id: userId, notes: null, default_session_link: null } });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

patientRouter.patch("/profile", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const userId = await getUserUuidByClerkId(clerkId);
    const patch = PatchPatientProfileSchema.parse(req.body);

    await client.query("begin");

    // upsert profile (in case not created yet)
    const q = `
      insert into public.patient_profiles (user_id, notes, default_session_link)
      values ($1, $2, $3)
      on conflict (user_id) do update set
        notes = coalesce($2, patient_profiles.notes),
        default_session_link = coalesce($3, patient_profiles.default_session_link),
        updated_at = now()
      returning user_id, notes, default_session_link, specialist_id;
    `;

    const { rows } = await client.query(q, [
      userId,
      patch.notes ?? null,
      patch.default_session_link ?? null,
    ]);

    await client.query("commit");
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

patientRouter.get("/reports", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const userId = await getUserUuidByClerkId(clerkId);

    const { rows } = await pool.query(
      `
      select
        r.id,
        r.patient_id,
        r.specialist_id,
        u.name as specialist_name,
        u.email as specialist_email,
        u.profile_image as specialist_image,
        r.booking_id,
        r.report_date,
        r.summary,
        r.recommendations,
        r.created_at
      from public.session_reports r
      join public.users u on u.id = r.specialist_id
      where r.patient_id = $1
      order by r.report_date desc, r.created_at desc;
      `,
      [userId]
    );

    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

patientRouter.get("/reports/:id", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const userId = await getUserUuidByClerkId(clerkId);
    const reportId = z.string().uuid().parse(req.params.id);

    const { rows } = await pool.query(
      `
      select
        r.id,
        r.patient_id,
        r.specialist_id,
        u.name as specialist_name,
        u.email as specialist_email,
        u.profile_image as specialist_image,
        r.booking_id,
        r.report_date,
        r.summary,
        r.recommendations,
        r.created_at
      from public.session_reports r
      join public.users u on u.id = r.specialist_id
      where r.id = $1 and r.patient_id = $2
      limit 1;
      `,
      [reportId, userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

