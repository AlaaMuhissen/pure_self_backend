/**
 * @file bookings.routes.ts
 * @description
 *   User and specialist booking routes — wiring only.
 *
 *   Mount in your Express app:
 *     app.use("/bookings", bookingsRouter);
 *
 *   Resulting endpoints:
 *     POST   /bookings
 *     GET    /bookings/my
 *     GET    /bookings/specialist/list
 *     GET    /bookings/specialist/:id/day
 *     GET    /bookings/:id
 *     PATCH  /bookings/:id/cancel
 *     PATCH  /bookings/:id/status
 *
 *  ⚠️  Route order matters: static segments (/my, /specialist/list)
 *     must be declared before param segments (/:id) to avoid Express
 *     treating "my" or "specialist" as a booking UUID.
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  createBookingHandler,
  getMyBookingsHandler,
  getBookingHandler,
  cancelBookingHandler,
  getSpecialistBookingsHandler,
  getSpecialistDayHandler,
  updateBookingStatusHandler,
} from "../controllers/booking.controller";

export const bookingsRouter = Router();

// ── User routes ───────────────────────────────────────────────────────────────
bookingsRouter.post("/",          requireAuth(), createBookingHandler);
bookingsRouter.get ("/my",        requireAuth(), getMyBookingsHandler);

// ── Specialist routes ─────────────────────────────────────────────────────────
// Static paths first — must come before /:id to avoid route shadowing.
bookingsRouter.get ("/specialist/list",    requireAuth(), getSpecialistBookingsHandler);
bookingsRouter.get ("/specialist/:id/day",               getSpecialistDayHandler);

// ── Shared / parameterised routes ─────────────────────────────────────────────
bookingsRouter.get  ("/:id",        requireAuth(), getBookingHandler);
bookingsRouter.patch("/:id/cancel", requireAuth(), cancelBookingHandler);
bookingsRouter.patch("/:id/status", requireAuth(), updateBookingStatusHandler);