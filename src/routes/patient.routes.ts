/**
 * @file patient.routes.ts
 * @description
 *   `patientRouter` — wiring only.
 *
 *   Resulting endpoints:
 *     GET   /profile
 *     PATCH /profile
 *     GET   /reports
 *     GET   /reports/:id
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  getOwnProfileHandler,
  patchOwnProfileHandler,
  listOwnReportsHandler,
  getOwnReportHandler,
} from "../controllers/patient.controller";

export const patientRouter = Router();

patientRouter.get  ("/profile", requireAuth(), getOwnProfileHandler);
patientRouter.patch("/profile", requireAuth(), patchOwnProfileHandler);

patientRouter.get("/reports",     requireAuth(), listOwnReportsHandler);
patientRouter.get("/reports/:id", requireAuth(), getOwnReportHandler);