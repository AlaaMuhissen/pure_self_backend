/**
 * @file progress.routes.ts
 * @description
 *   User content progress / history routes — wiring only.
 *
 *   Mount in your Express app (note the mixed base paths, preserved from
 *   the original router — both `/progress/*` and `/content/*`
 *   prefixes are produced depending on how this router is mounted):
 *     app.use("", progressRouter);
 *
 *   Resulting endpoints:
 *     POST /progress
 *     GET  /content/:contentId/progress
 *     GET  /progress/continue
 *     GET  /content/:contentId/history
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  upsertProgressHandler,
  getProgressHandler,
  getContinueHandler,
  getHistoryHandler,
} from "../controllers/progress.controller";

export const progressRouter = Router();

progressRouter.post("/progress",                     requireAuth(), upsertProgressHandler);
progressRouter.get ("/content/:contentId/progress",  requireAuth(), getProgressHandler);
progressRouter.get ("/continue",                      requireAuth(), getContinueHandler);
progressRouter.get ("/content/:contentId/history",   requireAuth(), getHistoryHandler);