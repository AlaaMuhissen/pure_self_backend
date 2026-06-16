/**
 * @file landing.controller.ts
 * @description
 *   Request handlers for the landing page's quote section and "why choose
 *   us" cards (`landing_why` table).
 *
 *   Handlers validate input, enforce admin-only access where required, and
 *   delegate to `landing.service` for DB work. No SQL lives here.
 */

import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import {
  getOrCreateQuote,
  buildQuotePatch,
  updateQuote,
  listWhyCards,
  createWhyCard,
  updateWhyCard,
  deleteWhyCard,
  reorderWhyCards,
  hasUpdatableWhyCardFields,
  validateCard,
  type UpdateQuoteInput,
  type UpsertWhyCardInput,
  type UpdateWhyCardInput,
  type ReorderItem,
} from "../services/landing.service";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Returns `{ userId, role }` or throws/returns a 401/403 response via the caller. */
function getAuthInfo(req: Request) {
  const userId = (req as AuthedRequest).auth?.userId;
  const role   = (req as AuthedRequest).auth?.role;
  return { userId, role };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /landing/quote — public
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuoteHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const quote = await getOrCreateQuote();
    return res.json({ quote });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /landing/quote — admin only
// ─────────────────────────────────────────────────────────────────────────────

export async function patchQuoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = getAuthInfo(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const body = req.body as UpdateQuoteInput;
    const built = buildQuotePatch(body);

    if (built.error) return res.status(400).json({ error: built.error });
    if (built.updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    const quote = await updateQuote(built.updates, built.values);
    return res.json({ quote });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /landing/why — public
// ─────────────────────────────────────────────────────────────────────────────

export async function listWhyCardsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await listWhyCards();
    return res.json({ items });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /landing/why — admin only
// ─────────────────────────────────────────────────────────────────────────────

export async function createWhyCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = getAuthInfo(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { icon, title, description, sort_order } = req.body as UpsertWhyCardInput;

    const errors = validateCard({ icon, title, description });
    if (errors.length > 0) return res.status(400).json({ error: errors.join("; ") });

    const item = await createWhyCard({ icon, title, description, sort_order });
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /landing/why/:id — admin only
// ─────────────────────────────────────────────────────────────────────────────

export async function updateWhyCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = getAuthInfo(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { id } = req.params;
    const patch  = req.body as UpdateWhyCardInput;

    if (!hasUpdatableWhyCardFields(patch)) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const item = await updateWhyCard(id, patch);
    if (!item) return res.status(404).json({ error: "Card not found" });

    return res.json({ item });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /landing/why/:id — admin only
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteWhyCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = getAuthInfo(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { id } = req.params;
    const deletedId = await deleteWhyCard(id);

    if (!deletedId) return res.status(404).json({ error: "Card not found" });
    return res.json({ deleted: true, id: deletedId });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /landing/why/reorder — admin only
// Body: { items: [{ id: string, sort_order: number }] }
// ─────────────────────────────────────────────────────────────────────────────

export async function reorderWhyCardsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = getAuthInfo(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { items } = req.body as { items: ReorderItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }

    const updatedItems = await reorderWhyCards(items);
    return res.json({ items: updatedItems });
  } catch (err) {
    next(err);
  }
}