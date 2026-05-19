import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";


export const specialistScheduleRouter = Router();

function clerkUserIdOrThrow(req: any) {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) throw new Error("Unauthorized");
  return clerkUserId;
}

async function getUserUuidByClerkId(clerkId: string): Promise<string> {
  const { rows } = await pool.query(
    `select id from public.users where clerk_user_id = $1 limit 1;`,
    [clerkId]
  );
  if (!rows[0]) throw new Error("UserNotFound");
  return rows[0].id as string;
}

async function assertSpecialistByUserId(userId: string) {
  const { rows } = await pool.query(
    `select user_id from public.specialists where user_id = $1 limit 1;`,
    [userId]
  );
  if (!rows[0]) throw new Error("Forbidden");
}

const CreateBlockSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  block_type: z.enum(["manual", "holiday"]).default("manual"),
  note: z.string().optional().nullable(),
});

specialistScheduleRouter.get("/schedule", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);

    const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from);
    const to = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to);

    // get specialist user_id from users table by clerk_user_id
    const u = await pool.query(
      `select id from public.users where clerk_user_id=$1 limit 1;`,
      [clerkId]
    );
    const specialistUserId = u.rows?.[0]?.id;
    if (!specialistUserId) return res.status(404).json({ error: "User not found" });

    const q = `
      select
        b.id,
        b.user_id as patient_id,
        b.specialist_id,
        b.starts_at,
        b.ends_at,
        b.status,
        u.name as patient_name,
        u.email as patient_email,
        u.profile_image as patient_profile_image,
        coalesce(sr.cnt,0) as reports_count,
        sr.last_at as last_report_at
      from public.bookings b
      join public.users u on u.id = b.user_id
      left join (
        select booking_id, count(*) as cnt, max(report_date) as last_at
        from public.session_reports
        group by booking_id
      ) sr on sr.booking_id = b.id
      where b.specialist_id = $1
        and b.starts_at >= ($2::date)
        and b.starts_at < (($3::date) + interval '1 day')
      order by b.starts_at asc;
    `;

    const { rows } = await pool.query(q, [specialistUserId, from, to]);

    // group by day
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const day = new Date(r.starts_at).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }

    const days = Array.from(map.entries()).map(([date, sessions]) => ({ date, sessions }));

    return res.json({ ok: true, from, to, days });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

specialistScheduleRouter.get("/schedule/blocks", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const specialistId = await getUserUuidByClerkId(clerkId);
    await assertSpecialistByUserId(specialistId);

    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;

    let q = `
      select id, specialist_id, starts_at, ends_at, block_type, note, created_at
      from public.specialist_schedule_blocks
      where specialist_id = $1
    `;
    const params: any[] = [specialistId];

    if (from) {
      params.push(from);
      q += ` and ends_at >= $${params.length}::timestamptz`;
    }
    if (to) {
      params.push(to);
      q += ` and starts_at <= $${params.length}::timestamptz`;
    }

    q += ` order by starts_at asc`;

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

specialistScheduleRouter.post("/schedule/blocks", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const specialistId = await getUserUuidByClerkId(clerkId);
    await assertSpecialistByUserId(specialistId);

    const body = CreateBlockSchema.parse(req.body);

    const starts = new Date(body.starts_at);
    const ends = new Date(body.ends_at);

    if (ends <= starts) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    // Optional: prevent blocking a time that already has pending/confirmed bookings
    const overlapQ = `
      select id
      from public.bookings
      where specialist_id = $1
        and status in ('pending', 'confirmed')
        and starts_at < $3::timestamptz
        and ends_at > $2::timestamptz
      limit 1;
    `;
    const overlap = await client.query(overlapQ, [specialistId, body.starts_at, body.ends_at]);
    if (overlap.rows[0]) {
      return res.status(400).json({ error: "There is already a booking in this time range" });
    }

    const q = `
      insert into public.specialist_schedule_blocks
        (specialist_id, starts_at, ends_at, block_type, note)
      values
        ($1, $2, $3, $4, $5)
      returning *;
    `;
    const { rows } = await client.query(q, [
      specialistId,
      body.starts_at,
      body.ends_at,
      body.block_type,
      body.note ?? null,
    ]);

    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

specialistScheduleRouter.delete("/schedule/blocks/:id", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const specialistId = await getUserUuidByClerkId(clerkId);
    await assertSpecialistByUserId(specialistId);

    const blockId = z.string().uuid().parse(req.params.id);

    const { rowCount } = await pool.query(
      `delete from public.specialist_schedule_blocks where id = $1 and specialist_id = $2`,
      [blockId, specialistId]
    );

    if (!rowCount) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    const msg = e?.message ?? "Bad request";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});