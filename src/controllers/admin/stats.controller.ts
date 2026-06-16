/**
 * @file admin/stats.controller.ts
 * @description
 *   Request handlers for admin dashboard statistics.
 *   All handlers assert admin privileges before returning data.
 */

import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/clerkAuth.middleware";
import { assertAdmin } from "../../libs/user";
import { countActiveSubscribers, countTodaySessions } from "../../services/admin/stats.service";

/**
 * GET /admin/stats/subscribers
 * Returns the total number of users with an active subscription.
 */
export async function getSubscriberStatsHandler(req: AuthedRequest, res: Response) {
  try {
    const clerkId = req.auth!.clerkUserId;
    await assertAdmin(clerkId);

    const total = await countActiveSubscribers();
    return res.json({ ok: true, total });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

/**
 * GET /admin/stats/today-sessions
 * Returns the number of confirmed/completed sessions scheduled for today
 * (Asia/Jerusalem timezone).
 */
export async function getTodaySessionsStatsHandler(req: AuthedRequest, res: Response) {
  try {
    const clerkId = req.auth!.clerkUserId;
    await assertAdmin(clerkId);

    const total = await countTodaySessions();
    return res.json({ ok: true, total });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}