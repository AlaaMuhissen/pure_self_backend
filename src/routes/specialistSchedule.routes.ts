/**
 * @file specialistSchedule.routes.ts
 * @description
 *   `specialistScheduleRouter` — wiring only.
 *
 *   Resulting endpoints:
 *     GET    /schedule
 *     GET    /schedule/blocks
 *     POST   /schedule/blocks
 *     DELETE /schedule/blocks/:id
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  getScheduleHandler,
  listScheduleBlocksHandler,
  createScheduleBlockHandler,
  deleteScheduleBlockHandler,
} from "../controllers/specialistSchedule.controller";

export const specialistScheduleRouter = Router();

specialistScheduleRouter.get   ("/schedule",            requireAuth(), getScheduleHandler);
specialistScheduleRouter.get   ("/schedule/blocks",     requireAuth(), listScheduleBlocksHandler);
specialistScheduleRouter.post  ("/schedule/blocks",     requireAuth(), createScheduleBlockHandler);
specialistScheduleRouter.delete("/schedule/blocks/:id", requireAuth(), deleteScheduleBlockHandler);