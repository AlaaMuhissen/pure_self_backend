/**
 * @file users.controller.ts
 * @description
 *   Request handlers for the admin users API.
 *
 *   Handlers validate input, delegate to the service layer for DB work,
 *   and shape the HTTP response. No SQL lives here.
 */

import type { Response }               from "express";
import { z }                      from "zod";
import type { AuthedRequest }     from "../../middleware/clerkAuth.middleware";
import { assertAdmin }            from "../../libs/user";
import {
  searchUsers,
  updateUserSubscription,
  getUserContentAccess,
  grantContentAccess,
  revokeContentAccess,
} from "../../services/admin/users.service";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const PatchContentAccessSchema = z.object({
  content_id: z.string().uuid(),
  has_access: z.boolean(),
});

const UpdateSubscriptionSchema = z.object({
  subscription_active: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Asserts the request belongs to an admin. Throws on failure. */
async function ensureAdmin(req: AuthedRequest) {
  const clerkId = req.auth?.clerkUserId;
  if (!clerkId) throw new Error("Unauthorized");
  await assertAdmin(clerkId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/users/search?q=…
 * Searches users by name, username, or email.
 */
export async function searchUsersHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const q = String(req.query.q ?? "").trim();
    const data = await searchUsers(q);

    return res.json({ success: true, data });
  } catch (error) {
    console.error("ADMIN SEARCH USERS ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to search users",
    });
  }
}

/**
 * PATCH /admin/users/:id/subscription
 * Toggles a user's subscription status.
 */
export async function updateSubscriptionHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const userId = String(req.params.id);
    const body   = UpdateSubscriptionSchema.parse(req.body);

    const user = await updateUserSubscription(userId, body.subscription_active);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error("UPDATE SUBSCRIPTION ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update subscription",
    });
  }
}

/**
 * POST /admin/users/:userId/content/:contentId/access
 * Grants a user access to a specific content item.
 */
export async function grantAccessHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const { userId, contentId } = req.params;
    const data = await grantContentAccess(userId, contentId);

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to grant access",
    });
  }
}

/**
 * DELETE /admin/users/:userId/content/:contentId/access
 * Revokes a user's access to a specific content item.
 */
export async function revokeAccessHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const { userId, contentId } = req.params;
    await revokeContentAccess(userId, contentId);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove access",
    });
  }
}

/**
 * GET /admin/users/:userId/content-access
 * Returns all content items a user currently has access to.
 */
export async function getContentAccessHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const { userId } = req.params;
    const data = await getUserContentAccess(userId);

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET USER CONTENT ACCESS ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get user content access",
    });
  }
}

/**
 * PATCH /admin/users/:userId/content-access
 * Grants or revokes access based on the `has_access` flag in the body.
 * Acts as a single toggle endpoint instead of separate POST/DELETE calls.
 */
export async function patchContentAccessHandler(req: AuthedRequest, res: Response) {
  try {
    await ensureAdmin(req);

    const { userId } = req.params;
    const body = PatchContentAccessSchema.parse(req.body);

    if (body.has_access) {
      const data = await grantContentAccess(userId, body.content_id);
      return res.json({ success: true, data });
    }

    await revokeContentAccess(userId, body.content_id);
    return res.json({ success: true, data: null });
  } catch (error) {
    console.error("PATCH USER CONTENT ACCESS ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update content access",
    });
  }
}