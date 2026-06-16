/**
 * @file specialists.routes.ts
 * @description
 *   `specialistsRouter` — wiring only.
 *
 * ⚠️ ROUTE ORDER IS CRITICAL:
 *   `/:userId` and `/:userId/bookings` are catch-all single/double-segment
 *   routes. They MUST be declared AFTER all literal-segment routes like
 *   `/patients`, `/patients/:patientId`, `/patients/:patientId/profile`,
 *   `/patients/:patientId/reports`, `/reports/:id`, and `/bookings`,
 *   `/bookings/:id` — otherwise Express would match e.g. `GET /patients`
 *   against `GET /:userId` with `userId = "patients"` first.
 *
 *   The original file declared `/:userId` in TWO different positions across
 *   its two duplicate blocks — sometimes before, sometimes after the
 *   `/patients/*` routes. This file places all `/:userId*` routes LAST,
 *   which is the only ordering that works correctly for every route above it.
 *
 * ⚠️ DUPLICATE WITH specialistSelfRouter:
 *   `GET /bookings` and `PATCH /bookings/:id` below are functionally
 *   identical to `specialistSelfRouter`'s `GET /bookings` and
 *   `PATCH /bookings/:id` (see `specialistSelf.controller.ts`). If both
 *   routers are mounted at overlapping base paths, whichever is mounted
 *   FIRST in your app will handle these requests. Confirm only one is
 *   actually needed.
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  listSpecialistsHandler,
  getSpecialistProfileHandler,
  getSpecialistDayBookingsHandler,
  listMyPatientsHandler,
  getMyPatientHandler,
  patchMyPatientProfileHandler,
  listMyPatientReportsHandler,
  createMyPatientReportHandler,
  patchMyReportHandler,
  deleteMyReportHandler,
  listMyBookingsHandler,
  patchMyBookingStatusHandler,
} from "../controllers/specialists.controller";

export const specialistsRouter = Router();

// ── Patients (self-service) ──────────────────────────────────────────────────
specialistsRouter.get   ("/patients",                          requireAuth(), listMyPatientsHandler);
specialistsRouter.get   ("/patients/:patientId",               requireAuth(), getMyPatientHandler);
specialistsRouter.patch ("/patients/:patientId/profile",       requireAuth(), patchMyPatientProfileHandler);
specialistsRouter.get   ("/patients/:patientId/reports",       requireAuth(), listMyPatientReportsHandler);
specialistsRouter.post  ("/patients/:patientId/reports",       requireAuth(), createMyPatientReportHandler);

// ── Reports (self-service) ───────────────────────────────────────────────────
specialistsRouter.patch ("/reports/:id", requireAuth(), patchMyReportHandler);
specialistsRouter.delete("/reports/:id", requireAuth(), deleteMyReportHandler);

// ── Bookings (self-service) — see duplicate warning above ────────────────────
specialistsRouter.get   ("/bookings",     requireAuth(), listMyBookingsHandler);
specialistsRouter.patch ("/bookings/:id", requireAuth(), patchMyBookingStatusHandler);

// ── Public listing ────────────────────────────────────────────────────────────
specialistsRouter.get("/", listSpecialistsHandler);

// ── Catch-all :userId routes — MUST be last ──────────────────────────────────
specialistsRouter.get("/:userId/bookings", requireAuth(), getSpecialistDayBookingsHandler);
specialistsRouter.get("/:userId",          getSpecialistProfileHandler);