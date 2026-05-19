import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool } from "../db/supabase";
import { getInternalUserIdByClerkId } from "../config/auth";


export const progressRouter = Router();

/**
 * POST /api/progress
 * Upsert progress + add history event
 */
progressRouter.post("/progress", requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth.userId;
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const Body = z.object({
      contentId: z.string().uuid(),
      status: z.enum(["not_started", "in_progress", "completed"]).optional(),
      progressPercent: z.number().int().min(0).max(100).optional(),
      lastPositionSeconds: z.number().int().min(0).nullable().optional(),
      lastReadingLocation: z.string().nullable().optional(),
    });

    const body = Body.parse(req.body);

    const userId = await getInternalUserIdByClerkId(clerkUserId);

    const status = body.status ?? "in_progress";
    const progressPercent = body.progressPercent ?? 0;
    const lastPositionSeconds = body.lastPositionSeconds ?? null;
    const lastReadingLocation = body.lastReadingLocation ?? null;

    // 1) UPSERT progress (latest state)
    const upsertSql = `
      insert into public.user_content_progress
        (user_id, content_id, status, progress_percent, last_position_seconds, last_reading_location, started_at)
      values
        ($1, $2, $3, $4, $5, $6,
         coalesce(
           (select started_at from public.user_content_progress where user_id=$1 and content_id=$2),
           case when $3 <> 'not_started' then now() else null end
         )
        )
      on conflict (user_id, content_id)
      do update set
        status = excluded.status,
        progress_percent = excluded.progress_percent,
        last_position_seconds = excluded.last_position_seconds,
        last_reading_location = excluded.last_reading_location,
        completed_at = case when excluded.status='completed' then now() else public.user_content_progress.completed_at end,
        updated_at = now()
      returning *;
    `;

    const { rows: progressRows } = await pool.query(upsertSql, [
      userId,
      body.contentId,
      status,
      progressPercent,
      lastPositionSeconds,
      lastReadingLocation,
    ]);

    // 2) Insert history event (timeline)
    const eventType =
      status === "completed"
        ? "completed"
        : progressPercent > 0 || lastPositionSeconds !== null || lastReadingLocation !== null
        ? "progress_update"
        : "opened";

    const meta = {
      status,
      progressPercent,
      lastPositionSeconds,
      lastReadingLocation,
    };

    const historySql = `
      insert into public.user_content_history (user_id, content_id, event_type, meta)
      values ($1, $2, $3, $4::jsonb)
      returning id, created_at;
    `;
    const { rows: historyRows } = await pool.query(historySql, [
      userId,
      body.contentId,
      eventType,
      JSON.stringify(meta),
    ]);

    return res.json({
      ok: true,
      progress: progressRows[0],
      history: historyRows[0],
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

/**
 * GET /api/content/:contentId/progress
 * Get progress row for current user + content
 */
progressRouter.get("/content/:contentId/progress", requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth.userId;
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const contentId = z.string().uuid().parse(req.params.contentId);
    const userId = await getInternalUserIdByClerkId(clerkUserId);

    const sql = `
      select *
      from public.user_content_progress
      where user_id = $1 and content_id = $2
      limit 1;
    `;
    const { rows } = await pool.query(sql, [userId, contentId]);

    return res.json({ ok: true, progress: rows[0] ?? null });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

/**
 * GET /api/progress/continue?limit=20
 * List latest in-progress/completed recently joined with content_items
 */
progressRouter.get("/continue", requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth.userId;
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const userId = await getInternalUserIdByClerkId(clerkUserId);

    const limit = Math.min(Number(req.query.limit ?? 20), 50);

    const sql = `
      select
        p.content_id,
        p.status,
        p.progress_percent,
        p.last_position_seconds,
        p.last_reading_location,
        p.updated_at,
        c.type,
        c.title,
        c.description,
        c.image_url,
        c.is_free,
        c.is_published
      from public.user_content_progress p
      join public.content_items c on c.id = p.content_id
      where p.user_id = $1
        and c.is_published = true
        and p.status <> 'not_started'
      order by p.updated_at desc
      limit $2;
    `;

    const { rows } = await pool.query(sql, [userId, limit]);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

/**
 * GET /api/content/:contentId/history?limit=50
 * Timeline events
 */
progressRouter.get("/content/:contentId/history", requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth.userId;
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const contentId = z.string().uuid().parse(req.params.contentId);
    const userId = await getInternalUserIdByClerkId(clerkUserId);

    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const sql = `
      select id, event_type, meta, created_at
      from public.user_content_history
      where user_id = $1 and content_id = $2
      order by created_at desc
      limit $3;
    `;
    const { rows } = await pool.query(sql, [userId, contentId, limit]);

    return res.json({ ok: true, events: rows });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});