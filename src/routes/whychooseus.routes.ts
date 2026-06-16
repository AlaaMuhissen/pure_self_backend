/**
 * @file whyChooseUs.routes.ts
 * @description
 *   "Why Choose Us" cards router — wiring only.
 *
 *   Mount in app.ts:
 *     import whyChooseUsRouter from "./routes/whyChooseUs.routes";
 *     app.use("/why-choose-us", whyChooseUsRouter);
 *
 *   Resulting endpoints:
 *     GET    /why-choose-us       — public
 *     POST   /why-choose-us       — specialist only
 *     PATCH  /why-choose-us/:id   — specialist only
 *     DELETE /why-choose-us/:id   — specialist only
 *
 *   See `whyChooseUs.controller.ts` for a note on the permissions mismatch
 *   between the original comments and the actual role checks.
 */

import { Router }   from "express";
import { clerkAuth } from "../middleware/clerkAuth.middleware";
import {
  listCardsHandler,
  createCardHandler,
  updateCardHandler,
  deleteCardHandler,
} from "../controllers/whyChooseUs.controller";

export const whyChooseUs = Router();

whyChooseUs.get   ("/",     listCardsHandler);
whyChooseUs.post  ("/",     clerkAuth, createCardHandler);
whyChooseUs.patch ("/:id",  clerkAuth, updateCardHandler);
whyChooseUs.delete("/:id",  clerkAuth, deleteCardHandler);