/**
 * @file specialistSelf.routes.ts
 * @description
 *   `specialistSelfRouter` — wiring only.
 *
 * ⚠️ See `specialistSelf.controller.ts` for a duplicate-route warning vs
 *    `specialists.routes.ts`'s `/bookings` and `/bookings/:id`.
 */

import { Router }      from "express";
import { requireAuth } from "@clerk/express";
import {
  getSelfBookingsHandler,
  patchSelfBookingStatusHandler,
} from "../controllers/specialistSelf.controller";

export const specialistSelfRouter = Router();

specialistSelfRouter.get  ("/bookings",     requireAuth(), getSelfBookingsHandler);
specialistSelfRouter.patch("/bookings/:id", requireAuth(), patchSelfBookingStatusHandler);