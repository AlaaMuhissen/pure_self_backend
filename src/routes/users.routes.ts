/**
 * @file users.routes.ts
 * @description
 *   Users router — wiring only.
 *
 *   Resulting endpoints:
 *     GET   /users/me          — own Clerk-synced user row
 *     GET   /users/me/db-id   — resolve own internal UUID
 *     PATCH /users/me         — update own profile
 *     GET   /users            — list all users (authenticated)
 *     GET   /users/:id        — get one user (authenticated)
 *     PATCH /users/:id/role   — update role (admin only)
 */

import { Router }                 from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  me,
  getDbUserId,
  getUser,
  listUsers,
  updateUserRole,
  updateMyProfile,
} from "../controllers/users.controller";

const router = Router();

// ── Own profile ───────────────────────────────────────────────────────────────
router.get  ("/me",        requireAuth, me);
router.get  ("/me/db-id",  requireAuth, getDbUserId);
router.patch("/me",        requireAuth, updateMyProfile);

// ── User lookup ───────────────────────────────────────────────────────────────
router.get  ("/",          requireAuth,                     listUsers);
router.get  ("/:id",       requireAuth,                     getUser);
router.patch("/:id/role",  requireAuth, requireRole("admin"), updateUserRole);

export default router;