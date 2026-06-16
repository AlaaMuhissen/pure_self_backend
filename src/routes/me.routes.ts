/**
 * @file me.routes.ts
 * @description
 *   Authenticated user "me" routes — wiring only.
 *
 *   Mount in your Express app:
 *     app.use("/me", meRouter);
 *
 *   Resulting endpoints:
 *     GET   /me
 *     PATCH /me
 *     GET   /me/access
 *     GET   /me/stats/subscribers     ⚠️ see note below
 *     GET   /me/stats/today-sessions  ⚠️ see note below
 *
 *  ⚠️ NOTE: the two stats routes are admin-only (they call `assertAdmin`)
 *     but are mounted under `/me/...` because that's how the original
 *     file had them. The route comments in the original said
 *     "GET /admin/stats/...", which doesn't match this mount path.
 *
 *     Left as-is to avoid breaking the frontend, but consider moving these
 *     two routes into your admin router (e.g. `routes/admin/stats.routes.ts`)
 *     so the URL matches the access level. They are kept here, unchanged,
 *     until the frontend is updated to call the new path.
 */

import { Router }      from "express";
import { clerkAuth }   from "../middleware/clerkAuth.middleware";
import {
  getMeHandler,
  patchMeHandler,
  getMyAccessHandler,
} from "../controllers/me.controller";
import {
  getSubscriberStatsHandler,
  getTodaySessionsStatsHandler,
} from "../controllers/admin/stats.controller";

export const meRouter = Router();

// ── Profile ───────────────────────────────────────────────────────────────────
meRouter.get  ("/",       clerkAuth, getMeHandler);
meRouter.patch("/",       clerkAuth, patchMeHandler);
meRouter.get  ("/access", clerkAuth, getMyAccessHandler);

// ── Admin stats (see note above) ────────────────────────────────────────────────
meRouter.get("/stats/subscribers",    clerkAuth, getSubscriberStatsHandler);
meRouter.get("/stats/today-sessions", clerkAuth, getTodaySessionsStatsHandler);