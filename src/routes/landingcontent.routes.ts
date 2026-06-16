/**
 * @file landing.routes.ts
 * @description
 *   Landing page content router — wiring only.
 *
 *   Mount in app.ts:
 *     import landingContentRouter from "./routes/landing.routes";
 *     app.use("/landing", landingContentRouter);
 *
 *   Resulting endpoints:
 *     GET    /landing/quote        — public
 *     PATCH  /landing/quote        — admin only
 *     GET    /landing/why          — public
 *     POST   /landing/why          — admin only
 *     PATCH  /landing/why/reorder  — admin only (bulk sort_order update)
 *     PATCH  /landing/why/:id      — admin only
 *     DELETE /landing/why/:id      — admin only
 *
 *  ⚠️ ROUTE ORDER: `/why/reorder` is declared BEFORE `/why/:id` so Express
 *     doesn't match "reorder" as a card UUID. Do not reorder these two.
 */

import { Router }     from "express";
import { clerkAuth }  from "../middleware/clerkAuth.middleware";
import {
  getQuoteHandler,
  patchQuoteHandler,
  listWhyCardsHandler,
  createWhyCardHandler,
  updateWhyCardHandler,
  deleteWhyCardHandler,
  reorderWhyCardsHandler,
} from "../controllers/landing.controller";

export const landingPageContent = Router();

// ── Quote ─────────────────────────────────────────────────────────────────────
landingPageContent.get  ("/quote", getQuoteHandler);
landingPageContent.patch("/quote", clerkAuth, patchQuoteHandler);

// ── Why cards ─────────────────────────────────────────────────────────────────
landingPageContent.get  ("/why",         listWhyCardsHandler);
landingPageContent.post ("/why",         clerkAuth, createWhyCardHandler);

// Static path before /:id — see route order note above.
landingPageContent.patch("/why/reorder", clerkAuth, reorderWhyCardsHandler);

landingPageContent.patch ("/why/:id", clerkAuth, updateWhyCardHandler);
landingPageContent.delete("/why/:id", clerkAuth, deleteWhyCardHandler);