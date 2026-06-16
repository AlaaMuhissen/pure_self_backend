/**
 * @file specialistProfile.routes.ts
 * @description
 *   Specialist's own profile router — wiring only.
 *
 *   Mount in your main app:
 *     import specialistProfileRouter from "./routes/specialistProfile.routes";
 *     app.use("/me/specialist-profile", specialistProfileRouter);
 *
 *   Resulting endpoints:
 *     GET   /me/specialist-profile   — specialist only
 *     PATCH /me/specialist-profile   — specialist only
 */

import { Router }    from "express";
import { clerkAuth } from "../middleware/clerkAuth.middleware";
import {
  getSpecialistProfileHandler,
  patchSpecialistProfileHandler,
} from "../controllers/specialistProfile.controller";

export const specialistProfileRouter = Router();

specialistProfileRouter.get  ("/", clerkAuth, getSpecialistProfileHandler);
specialistProfileRouter.patch("/", clerkAuth, patchSpecialistProfileHandler);