/**
 * @file content.routes.ts
 * @description
 *   Admin content router.
 *
 *   This file is intentionally thin: it only declares routes, applies
 *   middleware (auth + multer), and delegates to the controller. No business
 *   logic or SQL lives here.
 *
 *   Mount this router in your Express app:
 *     app.use("/admin", adminContentRouter);
 *
 *   Resulting endpoints:
 *     GET    /admin/content
 *     GET    /admin/content/:id
 *     POST   /admin/content
 *     PATCH  /admin/content/:id
 *     PUT    /admin/content/:id
 *     DELETE /admin/content/:id
 */

import { Router }       from "express";
import { requireAuth }  from "@clerk/express";
import { uploadFields } from "../../libs/supabase-storage";
import {
  listContent,
  getContent,
  createContent,
  patchContent,
  putContent,
  deleteContent,
} from "../../controllers/admin/content.controller";

export const adminContentRouter = Router();

// ── List ──────────────────────────────────────────────────────────────────────
adminContentRouter.get("/content",     requireAuth(), listContent);

// ── Single item ───────────────────────────────────────────────────────────────
adminContentRouter.get("/content/:id", requireAuth(), getContent);

// ── Create ────────────────────────────────────────────────────────────────────
adminContentRouter.post("/content",     requireAuth(), uploadFields, createContent);

// ── Partial update ────────────────────────────────────────────────────────────
adminContentRouter.patch("/content/:id", requireAuth(), uploadFields, patchContent);

// ── Full replace ──────────────────────────────────────────────────────────────
adminContentRouter.put("/content/:id",   requireAuth(), uploadFields, putContent);

// ── Delete ────────────────────────────────────────────────────────────────────
adminContentRouter.delete("/content/:id", requireAuth(), deleteContent);