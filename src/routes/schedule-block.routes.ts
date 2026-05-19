import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";


export const specialistRouter = Router();

function clerkIdOrThrow(req: any) {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Unauthorized");
  return auth.userId;
}

async function getMyUserIdByClerkId(clerkUserId: string) {
  const r = await pool.query(
    `select id from public.users where clerk_user_id=$1 limit 1;`,
    [clerkUserId]
  );
  return r.rows?.[0]?.id ?? null;
}

specialistRouter.get(
  "/bookings/:bookingId/reports",
  requireAuth(),
  async (req, res) => {
    try {
      const bookingId = z.string().uuid().parse(req.params.bookingId);

      const clerkId = clerkIdOrThrow(req);
      const specialistId = await getMyUserIdByClerkId(clerkId);
      if (!specialistId) return res.status(404).json({ error: "Specialist not found" });

      // ✅ تأكدي إن الحجز فعلاً للمختصّة
      const b = await pool.query(
        `select id from public.bookings where id=$1 and specialist_id=$2 limit 1;`,
        [bookingId, specialistId]
      );
      if (!b.rows[0]) return res.status(404).json({ error: "Booking not found" });

      const q = `
        select
          id,
          specialist_id,
          patient_id,
          booking_id,
          report_date,
          summary,
          recommendations,
          created_at
        from public.session_reports
        where booking_id = $1
        order by report_date desc, created_at desc;
      `;
      const { rows } = await pool.query(q, [bookingId]);

      return res.json({ ok: true, bookingId, reports: rows });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
      const msg = e?.message ?? "Bad request";
      const status = msg === "Unauthorized" ? 401 : 400;
      return res.status(status).json({ error: msg });
    }
  }
);

specialistRouter.get(
  "/patients/:patientId/reports",
  requireAuth(),
  async (req, res) => {
    try {
      const patientId = z.string().uuid().parse(req.params.patientId);

      const clerkId = clerkIdOrThrow(req);
      const specialistId = await getMyUserIdByClerkId(clerkId);
      if (!specialistId) return res.status(404).json({ error: "Specialist not found" });

      // ✅ تأكدي العلاقة موجودة (specialist_patients) أو في الأقل وجود bookings بينهم
      const rel = await pool.query(
        `select 1 from public.specialist_patients where specialist_id=$1 and patient_id=$2 limit 1;`,
        [specialistId, patientId]
      );
      if (!rel.rows[0]) return res.status(403).json({ error: "Forbidden" });

      const q = `
        select
          sr.id,
          sr.booking_id,
          sr.report_date,
          sr.summary,
          sr.recommendations,
          sr.created_at,
          b.starts_at,
          b.ends_at,
          b.status
        from public.session_reports sr
        left join public.bookings b on b.id = sr.booking_id
        where sr.specialist_id = $1 and sr.patient_id = $2
        order by sr.report_date desc, sr.created_at desc;
      `;
      const { rows } = await pool.query(q, [specialistId, patientId]);

      return res.json({ ok: true, patientId, reports: rows });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
      const msg = e?.message ?? "Bad request";
      const status = msg === "Unauthorized" ? 401 : 400;
      return res.status(status).json({ error: msg });
    }
  }
);