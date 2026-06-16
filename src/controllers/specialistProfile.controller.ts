/**
 * @file specialistProfile.controller.ts
 * @description
 *   Request handlers for a specialist's own profile (`GET` / `PATCH`
 *   `/me/specialist-profile`).
 *
 *   Handlers enforce the `specialist` role, validate the patch body, and
 *   delegate to `specialistProfile.service` for DB work + normalization.
 *   No SQL lives here.
 */

import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import {
  getOrCreateSpecialist,
  updateSpecialistProfile,
  hasUpdatableProfileFields,
  normalizeSpecialistRow,
  validateSpecialistProfilePatch,
  type PatchSpecialistProfileInput,
} from "../services/specialistProfile.service";

// ─────────────────────────────────────────────────────────────────────────────
// GET /me/specialist-profile
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the specialist row for the authenticated user, auto-creating it if missing. */
export async function getSpecialistProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role   = (req as AuthedRequest).auth?.role;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "specialist") return res.status(403).json({ error: "Specialist only" });

    const specialist = await getOrCreateSpecialist(userId);
    return res.json({ specialist: normalizeSpecialistRow(specialist) });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /me/specialist-profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates `available`, `bio`, `tags`, and/or `hourly_price` for the
 * authenticated specialist. Only fields present in the body are updated.
 * Auto-creates the row first if it doesn't exist yet.
 */
export async function patchSpecialistProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role   = (req as AuthedRequest).auth?.role;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "specialist") return res.status(403).json({ error: "Specialist only" });

    const patch = req.body as PatchSpecialistProfileInput;

    const errors = validateSpecialistProfilePatch(patch);
    if (errors.length > 0) return res.status(400).json({ error: errors.join("; ") });

    if (!hasUpdatableProfileFields(patch)) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Ensure the row exists before updating (upsert pattern).
    await getOrCreateSpecialist(userId);

    const updated = await updateSpecialistProfile(userId, patch);
    return res.json({ specialist: normalizeSpecialistRow(updated!) });
  } catch (err) {
    next(err);
  }
}