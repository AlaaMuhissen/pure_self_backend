/**
 * @file progress.controller.ts
 * @description
 *   Request handlers for user content progress and history.
 *
 *   Handlers validate input, resolve the Clerk user to an internal user ID,
 *   and delegate to `progress.service` for DB work. No SQL lives here.
 */

import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { getDbUserId } from "../libs/user";
import { UpsertProgressSchema } from "../schemas/progress.schema";
import {
  upsertProgress,
  insertHistoryEvent,
  resolveEventType,
  withProgressDefaults,
  getProgress,
  getContinueItems,
  getHistoryEvents,
} from "../services/progress.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the Clerk user ID from the request. Returns `null` if absent. */
function getClerkUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /progress
 * Upserts the latest progress for a content item and records a history event.
 */
export async function upsertProgressHandler(req: Request, res: Response) {
  try {
    const clerkUserId = getClerkUserId(req);
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const body = UpsertProgressSchema.parse(req.body);
    const userId = await getDbUserId(clerkUserId);

    const { status, progressPercent, lastPositionSeconds, lastReadingLocation } =
      withProgressDefaults(body);

    const progress = await upsertProgress(
      userId,
      body.contentId,
      status,
      progressPercent,
      lastPositionSeconds,
      lastReadingLocation,
    );

    const eventType = resolveEventType(status, progressPercent, lastPositionSeconds, lastReadingLocation);

    const history = await insertHistoryEvent(userId, body.contentId, eventType, {
      status,
      progressPercent,
      lastPositionSeconds,
      lastReadingLocation,
    });

    return res.json({ ok: true, progress, history });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
}

/**
 * GET /content/:contentId/progress
 * Returns the current user's progress for one content item.
 */
export async function getProgressHandler(req: Request, res: Response) {
  try {
    const clerkUserId = getClerkUserId(req);
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const contentId = z.string().uuid().parse(req.params.contentId);
    const userId = await getDbUserId(clerkUserId);

    const progress = await getProgress(userId, contentId);
    return res.json({ ok: true, progress });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
}

/**
 * GET /progress/continue?limit=20
 * Returns the user's most recently updated in-progress/completed content.
 */
export async function getContinueHandler(req: Request, res: Response) {
  try {
    const clerkUserId = getClerkUserId(req);
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const userId = await getDbUserId(clerkUserId);
    const limit = Math.min(Number(req.query.limit ?? 20), 50);

    const items = await getContinueItems(userId, limit);
    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
}

/**
 * GET /content/:contentId/history?limit=50
 * Returns the timeline of history events for one content item.
 */
export async function getHistoryHandler(req: Request, res: Response) {
  try {
    const clerkUserId = getClerkUserId(req);
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    const contentId = z.string().uuid().parse(req.params.contentId);
    const userId = await getDbUserId(clerkUserId);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const events = await getHistoryEvents(userId, contentId, limit);
    return res.json({ ok: true, events });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
}