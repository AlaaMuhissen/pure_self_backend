import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import { assertAdminByClerkId } from "../guard/admin.guard";
import { createCalendarEvent, deleteCalendarEvent } from "../libs/googleCalendar";
import { sendBookingConfirmation } from "../libs/mailer";


// ---------- Router ----------
export const bookingsRouter = Router();

// ---------- Helpers ----------
function clerkUserIdOrThrow(req: any) {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) throw new Error("Unauthorized");
  return clerkUserId;
}

async function getAppUserByClerkId(client: any, clerkUserId: string) {
  const { rows } = await client.query(
    `select id, role from public.users where clerk_user_id = $1 limit 1;`,
    [clerkUserId]
  );
  return rows[0] ?? null;
}

function canCancel(status: string) {
  return status === "pending" || status === "approved";
}

// ---------- Schemas ----------
const ISODate = z.string().datetime(); // expects ISO like 2026-03-01T10:00:00.000Z

const BookingStatus = z.enum(["pending", "approved", "rejected", "cancelled", "completed" , "confirmed"]);

const CreateBookingSchema = z.object({
  specialist_id: z.string().uuid(),
  starts_at: ISODate,
  ends_at: ISODate,
  payment_id: z.string().uuid().optional().nullable(),
});

const SetStatusSchema = z.object({
  status: BookingStatus,
});

// ---------- USER ROUTES ----------

/**
 * POST /api/bookings
 * Create booking as pending
 */
bookingsRouter.post("/", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const body = CreateBookingSchema.parse(req.body);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    // validate time
    const starts = new Date(body.starts_at);
    const ends = new Date(body.ends_at);
    if (!(starts instanceof Date) || isNaN(starts.getTime())) return res.status(400).json({ error: "Invalid starts_at" });
    if (!(ends instanceof Date) || isNaN(ends.getTime())) return res.status(400).json({ error: "Invalid ends_at" });
    if (ends <= starts) return res.status(400).json({ error: "ends_at must be after starts_at" });

    const insertQ = `
      insert into public.bookings
        (user_id, specialist_id, starts_at, ends_at, status, payment_id)
      values
        ($1, $2, $3, $4, 'pending', $5)
      returning id, user_id, specialist_id, starts_at, ends_at, status, payment_id, created_at;
    `;

    const { rows } = await client.query(insertQ, [
      appUser.id,
      body.specialist_id,
      body.starts_at,
      body.ends_at,
      body.payment_id ?? null,
    ]);

    await client.query("commit");
    return res.status(201).json({ ok: true, booking: rows[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    if (e?.code) return res.status(400).json({ error: "DB error", code: e.code, detail: e.detail });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * GET /api/bookings/my
 * List my bookings (as user)
 */
bookingsRouter.get("/my", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const q = `
      select b.*
      from public.bookings b
      where b.user_id = $1
      order by b.starts_at desc;
    `;
    const { rows } = await client.query(q, [appUser.id]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});


/**
 * GET /bookings/specialist/:id/day?date=YYYY-MM-DD
 * Returns unavailable ranges for one specialist on one day:
 * - existing bookings
 * - schedule blocks / holidays
 */
bookingsRouter.get("/specialist/:id/day", async (req, res) => {
  try {
    const specialistId = z.string().uuid().parse(req.params.id);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(String(req.query.date ?? ""));

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // existing bookings that should block availability
    const bookingsQ = `
      select
        id,
        starts_at,
        ends_at,
        status,
        'booking'::text as source
      from public.bookings
      where specialist_id = $1
        and starts_at <= $3::timestamptz
        and ends_at >= $2::timestamptz
        and status in ('pending', 'confirmed')
    `;

    // manual blocks + holidays
    const blocksQ = `
      select
        id,
        starts_at,
        ends_at,
        block_type as status,
        'block'::text as source
      from public.specialist_schedule_blocks
      where specialist_id = $1
        and starts_at <= $3::timestamptz
        and ends_at >= $2::timestamptz
    `;

    const [bookingsRes, blocksRes] = await Promise.all([
      pool.query(bookingsQ, [specialistId, startOfDay, endOfDay]),
      pool.query(blocksQ, [specialistId, startOfDay, endOfDay]),
    ]);

    const items = [...bookingsRes.rows, ...blocksRes.rows].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );

    return res.json({ ok: true, items });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", issues: e.issues });
    }
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});


/**
 * GET /api/bookings/:id
 * Read a booking if you are the user or specialist or admin
 */
bookingsRouter.get("/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const bookingId = z.string().uuid().parse(req.params.id);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const { rows } = await client.query(`select * from public.bookings where id=$1 limit 1;`, [bookingId]);
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: "Not found" });

    const isOwner = booking.user_id === appUser.id;
    const isSpecialist = booking.specialist_id === appUser.id;

    if (!isOwner && !isSpecialist && appUser.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ ok: true, booking });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/bookings/:id/cancel
 * User cancels own booking (pending/approved)
 */
bookingsRouter.patch("/:id/cancel", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const bookingId = z.string().uuid().parse(req.params.id);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const { rows } = await client.query(`select * from public.bookings where id=$1 limit 1;`, [bookingId]);
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: "Not found" });

    if (booking.user_id !== appUser.id) return res.status(403).json({ error: "Forbidden" });
    if (!canCancel(booking.status)) return res.status(400).json({ error: `Cannot cancel when status=${booking.status}` });

    const { rows: updated } = await client.query(
      `update public.bookings set status='cancelled' where id=$1 returning *;`,
      [bookingId]
    );

    await client.query("commit");
    return res.json({ ok: true, booking: updated[0] });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});


// ---------- SPECIALIST ROUTES ----------

/**
 * GET /api/bookings/specialist
 * List bookings where I am the specialist
 */
bookingsRouter.get("/specialist/list", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const q = `
      select b.*
      from public.bookings b
      where b.specialist_id = $1
      order by b.starts_at desc;
    `;
    const { rows } = await client.query(q, [appUser.id]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Specialist updates status for own bookings
 */
bookingsRouter.patch("/:id/status", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    const bookingId = z.string().uuid().parse(req.params.id);
    const body = SetStatusSchema.parse(req.body);

    await client.query("begin");

    const appUser = await getAppUserByClerkId(client, clerkId);
    if (!appUser) return res.status(404).json({ error: "User not found in DB" });

    const booking = await client.query(
      `SELECT b.*, 
          u.email AS patient_email, 
          u.name  AS patient_name,
          su.name AS specialist_name
      FROM bookings b
      JOIN users u  ON u.id = b.user_id
      JOIN users su ON su.id = b.specialist_id
      WHERE b.id = $1`,
      [bookingId]
    );
    console.log("Fetched booking for status update:", booking.rows[0]);
    const row = booking.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "Booking not found" });

    // ✅ Bug 3 fix — verify specialist owns this booking
    if (row.specialist_id !== appUser.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ✅ Bug 1 fix — use body.status (the NEW status), not row.status (the OLD one)
    if (body.status === "confirmed" && !row.google_event_id) {
      const { googleEventId, googleMeetUrl, calendarProvider } = await createCalendarEvent({
        patientEmail: row.patient_email,
        patientName:  row.patient_name,
        startsAt:     row.starts_at,
        endsAt:       row.ends_at,
        bookingId:    bookingId
      });

      await client.query(
        `UPDATE bookings 
        SET status = $1, google_event_id = $2, google_meet_url = $3, calendar_provider = $4,
            payment_status = 'paid'
        WHERE id = $5`,
        [body.status, googleEventId, googleMeetUrl, calendarProvider, bookingId]
      );
      await sendBookingConfirmation({
        eventId: googleEventId,
        patientEmail: row.patient_email || null,
        patientName:  row.patient_name,
        startsAt:     row.starts_at,
        endsAt:       row.ends_at,
        meetUrl:      row.googleMeetUrl,
        spesialistName: row.specialist_name
      }).catch(err => console.error('Email send failed:', err)); // don't block if email fails
      console.log("Booking confirmed, calendar event created with ID:", googleEventId);
      await client.query("commit");
      return res.json({
        ok: true,
        booking: { ...row, status: body.status, google_event_id: googleEventId, google_meet_url: googleMeetUrl, payment_status: 'paid' },
      });

    }

    if (body.status === "rejected" && row.google_event_id) {
      await deleteCalendarEvent(row.google_event_id);

      await client.query(
        `UPDATE bookings 
         SET status = $1, google_event_id = NULL, google_meet_url = NULL
         WHERE id = $2`,
        [body.status, bookingId]
      );

      await client.query("commit");
      
    }

    // any other status
    await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [body.status, bookingId]);
    await client.query("commit");
    return res.json({ ok: true, booking: { ...row, status: body.status } });

  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    console.error("Booking status error:", e); 
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 
                : msg === "Unauthorized" ? 401 
                : msg === "Not Found" ? 404     
                : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});


// ---------- ADMIN ROUTES ----------

/**
 * GET /api/admin/bookings
 */
export const adminBookingsRouter = Router();

adminBookingsRouter.get("/", requireAuth(), async (req, res) => {
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const { rows } = await pool.query(
      `select * from public.bookings order by created_at desc;`
    );
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * PATCH /api/admin/bookings/:id/status
 */
adminBookingsRouter.patch("/:id/status", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const bookingId = z.string().uuid().parse(req.params.id);
    const body = SetStatusSchema.parse(req.body);

    const { rows } = await client.query(
      `update public.bookings set status=$2 where id=$1 returning *;`,
      [bookingId, body.status]
    );

    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true, booking: rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Validation error", issues: e.issues });
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/admin/bookings/:id
 */
adminBookingsRouter.delete("/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = clerkUserIdOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const bookingId = z.string().uuid().parse(req.params.id);

    const { rowCount } = await client.query(`delete from public.bookings where id=$1;`, [bookingId]);
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