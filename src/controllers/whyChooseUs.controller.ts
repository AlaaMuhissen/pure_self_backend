/**
 * @file whyChooseUs.controller.ts
 * @description
 *   Request handlers for the "Why Choose Us" cards.
 *
 * ⚠️ PERMISSIONS NOTE — preserved from the original file, NOT fixed here:
 *   The router's own comment block says:
 *     POST/PATCH /:id  → admin only
 *     DELETE /:id      → specialist OR admin
 *   But every handler below actually checks `role !== "specialist"` and
 *   returns 403 otherwise — meaning admins currently CANNOT create, edit,
 *   or delete cards, only specialists can. This looks like a bug relative
 *   to the stated permissions, but the check is left exactly as-is to avoid
 *   changing behavior. If admins should also have access, change each
 *   `role !== "specialist"` check to something like
 *   `role !== "specialist" && role !== "admin"`.
 */

import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import {
  listCards,
  createCard,
  updateCard,
  deleteCard,
  validateCard,
  hasUpdatableCardFields,
  type CreateCardInput,
  type UpdateCardInput,
} from "../services/whyChooseUs.service";

// ─────────────────────────────────────────────────────────────────────────────
// GET /why-choose-us  — public
// ─────────────────────────────────────────────────────────────────────────────

export async function listCardsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await listCards();
    return res.json({ items });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /why-choose-us  — specialist only (see permissions note above)
// ─────────────────────────────────────────────────────────────────────────────

export async function createCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role   = (req as AuthedRequest).auth?.role;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "specialist") return res.status(403).json({ error: "Specialist only" });

    const { icon, title, description, sort_order } = req.body as CreateCardInput;

    const errors = validateCard({ icon, title, description });
    if (errors.length > 0) return res.status(400).json({ error: errors.join("; ") });

    const item = await createCard({ icon, title, description, sort_order }, userId);
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /why-choose-us/:id  — specialist only (see permissions note above)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role   = (req as AuthedRequest).auth?.role;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "specialist") return res.status(403).json({ error: "Specialist only" });

    const { id } = req.params;
    const patch  = req.body as UpdateCardInput;

    if (!hasUpdatableCardFields(patch)) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const item = await updateCard(id, patch);
    if (!item) return res.status(404).json({ error: "Item not found" });

    return res.json({ item });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /why-choose-us/:id  — specialist only (see permissions note above)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role   = (req as AuthedRequest).auth?.role;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "specialist") return res.status(403).json({ error: "Specialist only" });

    const { id } = req.params;
    const deletedId = await deleteCard(id);

    if (!deletedId) return res.status(404).json({ error: "Item not found" });

    return res.json({ deleted: true, id: deletedId });
  } catch (err) {
    next(err);
  }
}