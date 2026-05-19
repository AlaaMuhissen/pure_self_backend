import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import { assertAdminByClerkId } from "../guard/admin.guard";
import { attachUserUuid } from "../middleware/attachUserUuid.middleware";


export const specialistsRouter = Router();        // public
export const adminSpecialistsRouter = Router();   // admin
export const specialistSelfRouter = Router();
// ---------------- Helpers ----------------

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
    `select user_id from public.specialists where user_id = $1 and available = true limit 1;`,
    [userId]
  );
  if (!rows[0]) throw new Error("Forbidden"); // not a specialist
}
function clerkUserIdOrThrow(req: any) {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) throw new Error("Unauthorized");
  return clerkUserId;
}

const TagsSchema = z.array(z.string().min(1)).optional();

// ---------------- Schemas ----------------
const CreateSpecialistSchema = z.object({
  user_id: z.string().uuid(),
  available: z.boolean().default(true),
  bio: z.string().optional().nullable(),
  tags: TagsSchema.default([]),
  hourly_price: z.coerce.number().min(0).default(0), // coerce so "250" works too
});

const PatchSpecialistSchema = z.object({
  available: z.boolean().optional(),
  bio: z.string().optional().nullable(),
  tags: TagsSchema.optional(),
  hourly_price: z.coerce.number().min(0).optional(),
});

const BookingStatusSchema = z.enum(["pending", "confirmed", "cancelled", "completed"]);
const PatchBookingStatusSchema = z.object({ status: BookingStatusSchema });

const SpecialistUpdateBookingSchema = z.object({
  status: BookingStatusSchema,
});
// ---------------- PUBLIC ----------------

/**
 * GET /api/specialists
 * list available specialists (joined with users)
 */
specialistsRouter.get("/", async (req, res) => {
  try {
    const q = `
      select
        s.user_id,
        s.available,
        s.bio,
        s.tags,
        s.hourly_price,
        u.name,
        u.email,
        u.profile_image,
        u.palette_id
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.available = true
      order by u.created_at desc;
    `;
    const { rows } = await pool.query(q);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ✅ list my patients (using specialist_patients link)
specialistsRouter.get("/patients", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req); // user_...
    
    // ✅ map clerk -> users.id(uuid)
    const u = await pool.query(
      `select id from public.users where clerk_user_id = $1 limit 1;`,
      [clerkId]
    );
    if (!u.rows[0]) {
      return res.status(404).json({ error: "User not found in DB (missing users row for this clerk_user_id)" });
    }

    const specialistId = u.rows[0].id as string; // ✅ uuid

    const q = `
      select
        sp.patient_id,
        u.name,
        u.email,
        u.profile_image,
        (
          select count(*)::int
          from public.session_reports r
          where r.specialist_id = $1 and r.patient_id = sp.patient_id
        ) as reports_count
      from public.specialist_patients sp
      join public.users u on u.id = sp.patient_id
      where sp.specialist_id = $1
      order by u.created_at desc;
    `;

    const { rows } = await pool.query(q, [specialistId]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    // إذا عندك Zod error من مكان ثاني
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

/**
 * GET /api/specialist/bookings
 * Specialist sees her sessions
 */
specialistSelfRouter.get("/bookings", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const specialistUserId = await getUserUuidByClerkId(clerkId);

    await assertSpecialistByUserId(specialistUserId);

    const q = `
      select
        b.id,
        b.user_id,
        b.specialist_id,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at,
        u.name as user_name,
        u.profile_image as user_image
      from public.bookings b
      join public.users u on u.id = b.user_id
      where b.specialist_id = $1
      order by b.starts_at desc;
    `;

    const { rows } = await pool.query(q, [specialistUserId]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status =
      msg === "Forbidden" ? 403 :
      msg === "Unauthorized" ? 401 :
      msg === "UserNotFound" ? 404 :
      400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * PATCH /api/specialist/bookings/:id
 * Specialist updates status (accept/cancel/complete)
 */
specialistSelfRouter.patch("/bookings/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const specialistUserId = await getUserUuidByClerkId(clerkId);

    await assertSpecialistByUserId(specialistUserId);

    const bookingId = z.string().uuid().parse(req.params.id);
    const body = SpecialistUpdateBookingSchema.parse(req.body);

    await client.query("begin");

    // ensure booking belongs to this specialist
    const { rows: checkRows } = await client.query(
      `select id, status from public.bookings where id=$1 and specialist_id=$2 limit 1;`,
      [bookingId, specialistUserId]
    );
    if (!checkRows[0]) {
      await client.query("rollback");
      return res.status(404).json({ error: "Not found" });
    }

    // optional: rules (don’t allow editing cancelled/completed)
    const currentStatus = checkRows[0].status as string;
    if (currentStatus === "cancelled" || currentStatus === "completed") {
      await client.query("rollback");
      return res.status(400).json({ error: "Cannot update finalized booking" });
    }

    const { rows } = await client.query(
      `update public.bookings
       set status = $2
       where id = $1 and specialist_id = $3
       returning *;`,
      [bookingId, body.status, specialistUserId]
    );

    await client.query("commit");
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });

    const msg = e?.message ?? "Bad request";
    const status =
      msg === "Forbidden" ? 403 :
      msg === "Unauthorized" ? 401 :
      msg === "UserNotFound" ? 404 :
      400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * GET /api/specialists/:userId
 * read one specialist profile (public)
 */
specialistsRouter.get("/:userId", async (req, res) => {
  try {
    const userId = z.string().uuid().parse(req.params.userId);

    const q = `
      select
        s.user_id,
        s.available,
        s.bio,
        s.tags,
        s.hourly_price,
        u.name,
        u.email,
        u.profile_image,
        u.palette_id
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.user_id = $1
      limit 1;
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

specialistsRouter.get("/:userId/bookings", requireAuth(), async (req, res) => {
  try {
    const userId = z.string().uuid().parse(req.params.userId);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);

    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;

    const { rows } = await pool.query(
      `
      select id, starts_at, ends_at, status
      from public.bookings
      where specialist_id = $1
        and starts_at >= $2::timestamptz
        and starts_at <= $3::timestamptz
        and status in ('pending', 'confirmed')
      order by starts_at asc
      `,
      [userId, start, end]
    );

    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});
// ---------------- ADMIN CRUD ----------------



/**
 * POST /api/admin/specialists
 * Create specialist row (upsert-safe)
 */
adminSpecialistsRouter.post("/", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const body = CreateSpecialistSchema.parse(req.body);

    const q = `
      insert into public.specialists (user_id, available, bio, tags, hourly_price)
      values ($1, $2, $3, $4, $5)
      on conflict (user_id)
      do update set
        available = excluded.available,
        bio = excluded.bio,
        tags = excluded.tags,
        hourly_price = excluded.hourly_price
      returning *;
    `;

    const { rows } = await client.query(q, [
      body.user_id,
      body.available,
      body.bio ?? null,
      body.tags ?? [],
      body.hourly_price ?? 0,
    ]);

    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/specialists
 * list all specialists (admin)
 */
adminSpecialistsRouter.get("/", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const q = `
      select
        s.*,
        u.name, u.email, u.profile_image
      from public.specialists s
      join public.users u on u.id = s.user_id
      order by u.created_at desc;
    `;
    const { rows } = await pool.query(q);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * GET /api/admin/specialists/:userId
 */
adminSpecialistsRouter.get("/:userId", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);

    const q = `
      select
        s.*,
        u.name, u.email, u.profile_image
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.user_id = $1
      limit 1;
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * PATCH /api/admin/specialists/:userId
 */
adminSpecialistsRouter.patch("/:userId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);
    const patch = PatchSpecialistSchema.parse(req.body);

    const q = `
      update public.specialists
      set
        available = coalesce($2, available),
        bio = coalesce($3, bio),
        tags = coalesce($4, tags),
        hourly_price = coalesce($5, hourly_price)
      where user_id = $1
      returning *;
    `;

    const { rows } = await client.query(q, [
      userId,
      typeof patch.available === "boolean" ? patch.available : null,
      patch.bio ?? null,
      patch.tags ?? null,
      typeof patch.hourly_price === "number" ? patch.hourly_price : null,
    ]);

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/admin/specialists/:userId
 */
adminSpecialistsRouter.delete("/:userId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);

    const { rowCount } = await client.query(`delete from public.specialists where user_id = $1;`, [userId]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});


const PatchPatientBySpecialistSchema = z.object({
  notes: z.string().optional().nullable(),
  default_session_link: z.string().url().optional().nullable(),
});

const CreateReportSchema = z.object({
  report_date: z.coerce.date(), // accepts "2026-03-01"
  summary: z.string().min(1),
  recommendations: z.string().optional().nullable(),
});

const PatchReportSchema = z.object({
  report_date: z.coerce.date().optional(),
  summary: z.string().min(1).optional(),
  recommendations: z.string().optional().nullable(),
});


async function specialistIdFromReq(req: any) {
  const clerkId = clerkUserIdOrThrow(req);
  const specialistId = await getUserUuidByClerkId(clerkId);
  await assertSpecialistByUserId(specialistId);
  return specialistId;
}


// ---------------- PUBLIC ----------------

/**
 * GET /api/specialists
 * list available specialists (joined with users)
 */
specialistsRouter.get("/", async (req, res) => {
  try {
    const q = `
      select
        s.user_id,
        s.available,
        s.bio,
        s.tags,
        s.hourly_price,
        u.name,
        u.email,
        u.profile_image,
        u.palette_id
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.available = true
      order by u.created_at desc;
    `;
    const { rows } = await pool.query(q);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ✅ get one patient
specialistsRouter.get("/patients/:patientId", requireAuth(), async (req, res) => {
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    // ensure relationship exists
    const { rows: link } = await pool.query(
      `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
      [specialistId, patientId]
    );
    if (!link[0]) return res.status(403).json({ error: "Forbidden" });

    const q = `
      select
        u.id,
        u.name,
        u.email,
        u.profile_image,
        pp.notes,
        pp.default_session_link
      from public.users u
      left join public.patient_profiles pp on pp.user_id = u.id
      where u.id=$1
      limit 1;
    `;
    const { rows } = await pool.query(q, [patientId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

// ✅ patch patient profile (by specialist)
specialistsRouter.patch("/patients/:patientId/profile", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const patch = PatchPatientBySpecialistSchema.parse(req.body);

    const { rows: link } = await client.query(
      `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
      [specialistId, patientId]
    );
    if (!link[0]) return res.status(403).json({ error: "Forbidden" });

    await client.query("begin");

    const q = `
      insert into public.patient_profiles (user_id, specialist_id, notes, default_session_link)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update set
        specialist_id = $2,
        notes = coalesce($3, patient_profiles.notes),
        default_session_link = coalesce($4, patient_profiles.default_session_link),
        updated_at = now()
      returning user_id, specialist_id, notes, default_session_link;
    `;
    const { rows } = await client.query(q, [
      patientId,
      specialistId,
      patch.notes ?? null,
      patch.default_session_link ?? null,
    ]);

    await client.query("commit");
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

// ✅ list reports for a patient
specialistsRouter.get("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    const { rows: link } = await pool.query(
      `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
      [specialistId, patientId]
    );
    if (!link[0]) return res.status(403).json({ error: "Forbidden" });

    const { rows } = await pool.query(
      `select id, patient_id, specialist_id, report_date, summary, recommendations, created_at
       from public.session_reports
       where patient_id=$1 and specialist_id=$2
       order by report_date desc, created_at desc;`,
      [patientId, specialistId]
    );

    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

// ✅ create report
specialistsRouter.post("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    const { rows: link } = await client.query(
      `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
      [specialistId, patientId]
    );
    if (!link[0]) return res.status(403).json({ error: "Forbidden" });

    const q = `
      insert into public.session_reports (patient_id, specialist_id, report_date, summary, recommendations)
      values ($1,$2,$3,$4,$5)
      returning *;
    `;
    const { rows } = await client.query(q, [
      patientId,
      specialistId,
      body.report_date,
      body.summary,
      body.recommendations ?? null,
    ]);

    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

// ✅ update report
specialistsRouter.patch("/reports/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const reportId = z.string().uuid().parse(req.params.id);
    const patch = PatchReportSchema.parse(req.body);

    const q = `
      update public.session_reports
      set
        report_date = coalesce($2, report_date),
        summary = coalesce($3, summary),
        recommendations = coalesce($4, recommendations)
      where id=$1 and specialist_id=$5
      returning *;
    `;
    const { rows } = await client.query(q, [
      reportId,
      patch.report_date ?? null,
      patch.summary ?? null,
      patch.recommendations ?? null,
      specialistId,
    ]);

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

// ✅ delete report
specialistsRouter.delete("/reports/:id", requireAuth(), async (req, res) => {
  try {
    const specialistId = await specialistIdFromReq(req);
    const reportId = z.string().uuid().parse(req.params.id);

    const { rowCount } = await pool.query(
      `delete from public.session_reports where id=$1 and specialist_id=$2;`,
      [reportId, specialistId]
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

// ✅ specialist bookings list
specialistsRouter.get("/bookings", requireAuth(), async (req, res) => {
  try {
    const specialistId = await specialistIdFromReq(req);

    const q = `
      select
        b.id,
        b.user_id,
        b.specialist_id,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at,
        u.name as user_name,
        u.profile_image as user_image
      from public.bookings b
      join public.users u on u.id = b.user_id
      where b.specialist_id = $1
      order by b.starts_at desc;
    `;
    const { rows } = await pool.query(q, [specialistId]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  }
});

// ✅ specialist booking status update
specialistsRouter.patch("/bookings/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = await specialistIdFromReq(req);
    const bookingId = z.string().uuid().parse(req.params.id);
    const body = PatchBookingStatusSchema.parse(req.body);

    await client.query("begin");

    const { rows: check } = await client.query(
      `select id, status from public.bookings where id=$1 and specialist_id=$2 limit 1;`,
      [bookingId, specialistId]
    );
    if (!check[0]) return res.status(404).json({ error: "Not found" });

    // optional rules
    if (check[0].status === "cancelled" || check[0].status === "completed") {
      return res.status(400).json({ error: "Cannot update finalized booking" });
    }

    const { rows } = await client.query(
      `update public.bookings set status=$2 where id=$1 and specialist_id=$3 returning *;`,
      [bookingId, body.status, specialistId]
    );

    await client.query("commit");
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg === "UserNotFound" ? 404 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});
/**
 * GET /api/specialists/:userId
 * read one specialist profile (public)
 */
specialistsRouter.get("/:userId", async (req, res) => {
  try {
    const userId = z.string().uuid().parse(req.params.userId);

    const q = `
      select
        s.user_id,
        s.available,
        s.bio,
        s.tags,
        s.hourly_price,
        u.name,
        u.email,
        u.profile_image,
        u.palette_id
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.user_id = $1
      limit 1;
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ---------------- ADMIN CRUD ----------------

/**
 * POST /api/admin/specialists
 * Create specialist row (upsert-safe)
 */
adminSpecialistsRouter.post("/", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const body = CreateSpecialistSchema.parse(req.body);

    const q = `
      insert into public.specialists (user_id, available, bio, tags, hourly_price)
      values ($1, $2, $3, $4, $5)
      on conflict (user_id)
      do update set
        available = excluded.available,
        bio = excluded.bio,
        tags = excluded.tags,
        hourly_price = excluded.hourly_price
      returning *;
    `;

    const { rows } = await client.query(q, [
      body.user_id,
      body.available,
      body.bio ?? null,
      body.tags ?? [],
      body.hourly_price ?? 0,
    ]);

    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/specialists
 * list all specialists (admin)
 */
adminSpecialistsRouter.get("/", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const q = `
      select
        s.*,
        u.name, u.email, u.profile_image
      from public.specialists s
      join public.users u on u.id = s.user_id
      order by u.created_at desc;
    `;
    const { rows } = await pool.query(q);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * GET /api/admin/specialists/:userId
 */
adminSpecialistsRouter.get("/:userId", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);

    const q = `
      select
        s.*,
        u.name, u.email, u.profile_image
      from public.specialists s
      join public.users u on u.id = s.user_id
      where s.user_id = $1
      limit 1;
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * PATCH /api/admin/specialists/:userId
 */
adminSpecialistsRouter.patch("/:userId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);
    const patch = PatchSpecialistSchema.parse(req.body);

    const q = `
      update public.specialists
      set
        available = coalesce($2, available),
        bio = coalesce($3, bio),
        tags = coalesce($4, tags),
        hourly_price = coalesce($5, hourly_price)
      where user_id = $1
      returning *;
    `;

    const { rows } = await client.query(q, [
      userId,
      typeof patch.available === "boolean" ? patch.available : null,
      patch.bio ?? null,
      patch.tags ?? null,
      typeof patch.hourly_price === "number" ? patch.hourly_price : null,
    ]);

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/admin/specialists/:userId
 */
adminSpecialistsRouter.delete("/:userId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const userId = z.string().uuid().parse(req.params.userId);

    const { rowCount } = await client.query(`delete from public.specialists where user_id = $1;`, [userId]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

