/**
 * @file admin/specialists.routes.ts
 * @description
 *   `adminSpecialistsRouter` — wiring only.
 *
 *   Resulting endpoints:
 *     POST   /admin/specialists
 *     GET    /admin/specialists
 *     GET    /admin/specialists/:userId
 *     PATCH  /admin/specialists/:userId
 *     DELETE /admin/specialists/:userId
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  createOrUpdateSpecialistHandler,
  listSpecialistsAdminHandler,
  getSpecialistAdminHandler,
  patchSpecialistAdminHandler,
  deleteSpecialistAdminHandler,
} from "../../controllers/admin/specialists.controller";

export const adminSpecialistsRouter = Router();

adminSpecialistsRouter.post  ("/",          requireAuth(), createOrUpdateSpecialistHandler);
adminSpecialistsRouter.get   ("/",          requireAuth(), listSpecialistsAdminHandler);
adminSpecialistsRouter.get   ("/:userId",   requireAuth(), getSpecialistAdminHandler);
adminSpecialistsRouter.patch ("/:userId",   requireAuth(), patchSpecialistAdminHandler);
adminSpecialistsRouter.delete("/:userId",   requireAuth(), deleteSpecialistAdminHandler);