/**
 * @file sessions.routes.ts
 * @description
 *   `sessionsRouter` — wiring only.
 *
 *   See `sessionReports.service.ts` for the duplicate-router warning vs
 *   `specialistReports.routes.ts`.
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  listPatientReportsHandler,
  createPatientReportHandler,
  patchBookingHandler,
  getBookingDetailHandler,
  getReportDetailHandler,
  patchReportHandler,
} from "../controllers/sessionReports.controller";

export const sessionsRouter = Router();

sessionsRouter.get  ("/patients/:patientId/reports", requireAuth(), listPatientReportsHandler);
sessionsRouter.post ("/patients/:patientId/reports", requireAuth(), createPatientReportHandler);

sessionsRouter.patch("/bookings/:id",         requireAuth(), patchBookingHandler);
sessionsRouter.get  ("/bookings/:bookingId",  requireAuth(), getBookingDetailHandler);

sessionsRouter.get  ("/reports/:reportId", requireAuth(), getReportDetailHandler);
sessionsRouter.patch("/reports/:reportId", requireAuth(), patchReportHandler);