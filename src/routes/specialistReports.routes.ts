/**
 * @file specialistReports.routes.ts
 * @description
 *   `specialistReportsRouter` — wiring only.
 *
 * ⚠️ See `specialistReports.controller.ts` for the `req.appUserId`
 *    middleware dependency and duplicate-router warning.
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  listPatientReportsFullHandler,
  getReportByIdHandler,
  createPatientReportFullHandler,
  patchReportFullHandler,
  deleteReportHandler,
} from "../controllers/specialistReports.controller";

export const specialistReportsRouter = Router();

specialistReportsRouter.get   ("/patients/:patientId/reports", requireAuth(), listPatientReportsFullHandler);
specialistReportsRouter.post  ("/patients/:patientId/reports", requireAuth(), createPatientReportFullHandler);

specialistReportsRouter.get   ("/reports/:reportId", requireAuth(), getReportByIdHandler);
specialistReportsRouter.patch ("/reports/:reportId", requireAuth(), patchReportFullHandler);
specialistReportsRouter.delete("/reports/:reportId", requireAuth(), deleteReportHandler);