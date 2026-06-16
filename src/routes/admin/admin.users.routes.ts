/**
 * @file users.routes.ts
 * @description
 *   Admin users router — route declarations only.
 *
 *   Mount in your Express app:
 *     app.use("/admin/users", adminUsersRouter);
 *
 *   Resulting endpoints:
 *     GET    /admin/users/search
 *     PATCH  /admin/users/:id/subscription
 *     POST   /admin/users/:userId/content/:contentId/access
 *     DELETE /admin/users/:userId/content/:contentId/access
 *     GET    /admin/users/:userId/content-access
 *     PATCH  /admin/users/:userId/content-access
 */

import { Router }         from "express";
import { clerkAuth }      from "../../middleware/clerkAuth.middleware";
import {
  searchUsersHandler,
  updateSubscriptionHandler,
  grantAccessHandler,
  revokeAccessHandler,
  getContentAccessHandler,
  patchContentAccessHandler,
} from "../../controllers/admin/users.controller";

const adminUsersRouter = Router();

// ── Search ────────────────────────────────────────────────────────────────────
adminUsersRouter.get("/search", clerkAuth, searchUsersHandler);

// ── Subscription ──────────────────────────────────────────────────────────────
adminUsersRouter.patch("/:id/subscription", clerkAuth, updateSubscriptionHandler);

// ── Content access (by route params) ─────────────────────────────────────────
adminUsersRouter.post  ("/:userId/content/:contentId/access", clerkAuth, grantAccessHandler);
adminUsersRouter.delete("/:userId/content/:contentId/access", clerkAuth, revokeAccessHandler);

// ── Content access (by body) ──────────────────────────────────────────────────
adminUsersRouter.get  ("/:userId/content-access", clerkAuth, getContentAccessHandler);
adminUsersRouter.patch("/:userId/content-access", clerkAuth, patchContentAccessHandler);

export default adminUsersRouter;