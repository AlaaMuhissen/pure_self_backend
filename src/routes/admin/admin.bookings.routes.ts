/**
 * @file admin/bookings.routes.ts
 * @description
 *   Admin booking routes — wiring only.
 *
 *   Mount in your Express app:
 *     app.use("/admin/bookings", adminBookingsRouter);
 *
 *   Resulting endpoints:
 *     GET    /admin/bookings
 *     PATCH  /admin/bookings/:id/status
 *     DELETE /admin/bookings/:id
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  adminListBookingsHandler,
  adminSetBookingStatusHandler,
  adminDeleteBookingHandler,
} from "../../controllers/admin/bookings.controller";

export const adminBookingsRouter = Router();

// ── Admin routes ──────────────────────────────────────────────────────────────
adminBookingsRouter.get   ("/",           requireAuth(), adminListBookingsHandler);
adminBookingsRouter.patch ("/:id/status", requireAuth(), adminSetBookingStatusHandler);
adminBookingsRouter.delete("/:id",        requireAuth(), adminDeleteBookingHandler);