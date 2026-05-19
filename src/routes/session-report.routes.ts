import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { getAppUserIdByClerkId } from "../helpers/userMap";
import { pool } from "../db/supabase";

export const sessionsRouter = Router();

function clerkIdOrThrow(req: any) {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Unauthorized");
  return auth.userId;
}
function getClerkUserId(req: any) {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Unauthorized");
  return auth.userId;
}


// -------------------- SCHEMAS --------------------
const ScheduleQuerySchema = z.object({
  from: z.string().min(10), // "YYYY-MM-DD"
  to: z.string().min(10),
});

// -------------------- ROUTES --------------------

/**
 * GET /api/specialist/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
 * "برنامج الأيام" كامل للمختصة
 */

function clerkUserIdOrThrow(req: any) {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) throw new Error("Unauthorized");
  return clerkUserId;
}


sessionsRouter.get("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getAppUserIdByClerkId(clerkId);

    const patientId = z.string().uuid().parse(req.params.patientId);

    const q = `
      select id, specialist_id, patient_id, booking_id, report_date, summary, recommendations, created_at
      from public.session_reports
      where specialist_id = $1 and patient_id = $2
      order by report_date desc;
    `;
    const { rows } = await pool.query(q, [specialistUserId, patientId]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

const CreateReportSchema = z.object({
  booking_id: z.string().uuid().optional().nullable(),
  report_date: z.string().optional(), // ISO
  summary: z.string().min(1),
  recommendations: z.string().optional().nullable(),
});

sessionsRouter.post("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getAppUserIdByClerkId(clerkId);

    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    await client.query("begin");

    // optional: validate booking belongs to specialist + patient
    if (body.booking_id) {
      const { rows } = await client.query(
        `select id from public.bookings where id=$1 and specialist_id=$2 and user_id=$3 limit 1;`,
        [body.booking_id, specialistUserId, patientId]
      );
      if (!rows[0]) throw new Error("Invalid booking_id for this patient/specialist");
    }

    const q = `
      insert into public.session_reports
        (specialist_id, patient_id, booking_id, report_date, summary, recommendations)
      values ($1,$2,$3,$4,$5,$6)
      returning *;
    `;
    const reportDate = body.report_date ? new Date(body.report_date).toISOString() : new Date().toISOString();

    const { rows } = await client.query(q, [
      specialistUserId,
      patientId,
      body.booking_id ?? null,
      reportDate,
      body.summary,
      body.recommendations ?? null,
    ]);

    await client.query("commit");
    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
});

const PatchBookingSchema = z.object({
  status: z.enum(["pending", "approved", "cancelled", "completed"]).optional(),
});

sessionsRouter.patch("/bookings/:id", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkIdOrThrow(req);
    const specialistUserId = await getAppUserIdByClerkId(clerkId);

    const bookingId = z.string().uuid().parse(req.params.id);
    const patch = PatchBookingSchema.parse(req.body);

    const q = `
      update public.bookings
      set status = coalesce($3, status)
      where id=$1 and specialist_id=$2
      returning *;
    `;
    const { rows } = await pool.query(q, [
      bookingId,
      specialistUserId,
      patch.status ?? null
    ]);

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

sessionsRouter.get(
  "/bookings/:bookingId",
  requireAuth(),
  async (req, res) => {
    try {
      // ✅ Validate UUID
      const bookingId = z.string().uuid().parse(req.params.bookingId);

      const clerkUserId = getClerkUserId(req);

      // get specialist user_id from users table
      const userResult = await pool.query(
        `select id from public.users where clerk_user_id = $1 limit 1`,
        [clerkUserId]
      );

      const specialistUserId = userResult.rows?.[0]?.id;
      if (!specialistUserId) {
        return res.status(404).json({ error: "Specialist not found" });
      }

      // get booking + patient info + reports count
      const query = `
        select
          b.id,
          b.user_id as patient_id,
          b.specialist_id,
          b.starts_at,
          b.ends_at,
          b.status,
          b.created_at,

          u.name as patient_name,
          u.email as patient_email,
          u.profile_image as patient_profile_image,

          coalesce(count(sr.id), 0)::int as reports_count

        from public.bookings b
        join public.users u on u.id = b.user_id
        left join public.session_reports sr on sr.booking_id = b.id

        where b.id = $1
          and b.specialist_id = $2

        group by b.id, u.id
      `;

      const { rows } = await pool.query(query, [
        bookingId,
        specialistUserId,
      ]);

      if (!rows[0]) {
        return res.status(404).json({ error: "Booking not found" });
      }

      return res.json({
        ok: true,
        booking: rows[0],
      });
    } catch (e: any) {
      if (e?.name === "ZodError") {
        return res.status(400).json({
          error: "Validation error",
          issues: e.issues,
        });
      }

      const msg = e?.message ?? "Bad request";
      const status = msg === "Unauthorized" ? 401 : 400;

      return res.status(status).json({ error: msg });
    }
  }
);
// GET /specialist/reports/:reportId
sessionsRouter.get("/reports/:reportId", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    // جيبي user_id تبع specialist من جدول users حسب clerk_user_id
    const { rows: uRows } = await pool.query(
      `select id from public.users where clerk_user_id = $1 limit 1`,
      [clerkId]
    );
    const specialistUserId = uRows[0]?.id;
    if (!specialistUserId) return res.status(404).json({ error: "User not found" });

    const q = `
      select
        r.id,
        r.specialist_id,
        r.patient_id,
        r.booking_id,
        r.report_date,
        r.summary,
        r.recommendations,
        r.created_at,

        pu.name as patient_name,
        pu.email as patient_email,
        pu.profile_image as patient_profile_image,

        b.starts_at,
        b.ends_at,
        b.status as booking_status
      from public.session_reports r
      left join public.users pu on pu.id = r.patient_id
      left join public.bookings b on b.id = r.booking_id
      where r.id = $1
        and r.specialist_id = $2
      limit 1;
    `;

    const { rows } = await pool.query(q, [reportId, specialistUserId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, report: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// PATCH /specialist/reports/:reportId
// body: { summary?: string; recommendations?: string }
sessionsRouter.patch("/reports/:reportId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);

    const reportId = z.string().uuid().parse(req.params.reportId);

    const PatchReportSchema = z.object({
      summary: z.string().min(1).optional(),
      recommendations: z.string().optional().nullable(),
    });

    const patch = PatchReportSchema.parse(req.body);

    await client.query("begin");

    // const userId = req.user.id; // هذا UUID من جدول users

    const q = `
      update public.session_reports
      set
        summary = coalesce($2, summary),
        recommendations = coalesce($3, recommendations)
      where id = $1
        and specialist_id = $4
      returning *;
    `;

    const { rows } = await client.query(q, [
      reportId,
      patch.summary ?? null,
      patch.recommendations ?? null,
      ,
    ]);

    if (!rows[0]) {
      await client.query("rollback");
      return res.status(404).json({ error: "Report not found (or not yours)" });
    }

    await client.query("commit");
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    return res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});


export const specialistReportsRouter = Router();

// لازم يكون عندك middleware سابق يضيف req.appUserId (uuid من جدول users)
// مثال: req.appUserId = '04fb1862-f5fd-40f0-83cc-80188a0b90d4'
function specialistIdOrThrow(req: any) {
  const id = req.appUserId; // <-- أهم سطر
  if (!id) throw new Error("Unauthorized");
  return id as string; // uuid
}


const PatchReportSchema = z.object({
  summary: z.string().min(1).optional(),
  recommendations: z.string().optional().nullable(),
  report_date: z.string().optional().nullable(),
});

specialistReportsRouter.get("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  try {
    const specialistId = specialistIdOrThrow(req);
    const patientId = z.string().uuid().parse(req.params.patientId);

    // تأكد إن المريضة تابعة للمختصة (أو على الأقل عندها bookings معها)
    const q = `
      select r.*
      from public.session_reports r
      where r.specialist_id = $1 and r.patient_id = $2
      order by r.report_date desc, r.created_at desc;
    `;
    const { rows } = await pool.query(q, [specialistId, patientId]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

specialistReportsRouter.get("/reports/:reportId", requireAuth(), async (req, res) => {
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    const q = `
      select r.*
      from public.session_reports r
      where r.id = $1 and r.specialist_id = $2
      limit 1;
    `;
    const { rows } = await pool.query(q, [reportId, specialistId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

specialistReportsRouter.post("/patients/:patientId/reports", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const patientId = z.string().uuid().parse(req.params.patientId);
    const body = CreateReportSchema.parse(req.body);

    const q = `
      insert into public.session_reports
        (specialist_id, patient_id, booking_id, report_date, summary, recommendations)
      values
        ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6)
      returning *;
    `;
    const { rows } = await client.query(q, [
      specialistId,
      patientId,
      body.booking_id ?? null,
      body.report_date ?? null,
      body.summary,
      body.recommendations ?? null,
    ]);

    return res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
});

specialistReportsRouter.patch("/reports/:reportId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);
    const patch = PatchReportSchema.parse(req.body);

    const q = `
      update public.session_reports
      set
        summary = coalesce($3, summary),
        recommendations = coalesce($4, recommendations),
        report_date = coalesce($5::timestamptz, report_date)
      where id = $1 and specialist_id = $2
      returning *;
    `;
    const { rows } = await client.query(q, [
      reportId,
      specialistId,
      patch.summary ?? null,
      patch.recommendations ?? null,
      patch.report_date ?? null,
    ]);

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
});

specialistReportsRouter.delete("/reports/:reportId", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const specialistId = specialistIdOrThrow(req);
    const reportId = z.string().uuid().parse(req.params.reportId);

    const { rowCount } = await client.query(
      `delete from public.session_reports where id=$1 and specialist_id=$2;`,
      [reportId, specialistId]
    );

    if (!rowCount) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
});