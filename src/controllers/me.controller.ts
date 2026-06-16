/**
 * @file me.controller.ts
 * @description
 *   Request handlers for the authenticated user's own profile
 *   (`GET /me`, `PATCH /me`, `GET /me/access`).
 *
 *   `GET /` syncs the Clerk user into the local `users` table (upsert) and
 *   returns the resulting row. `PATCH /` updates local profile fields and,
 *   when `name` or `username` changes, also pushes those changes to Clerk.
 */

import type { Response } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import { clerk } from "../config/clerk";
import { getUserAccessByClerkId, upsertUser } from "../services/users.service";
import { updateMyProfile, hasUpdatableFields } from "../services/me.service";
import { UpdateMyProfileSchema } from "../schemas/user.schema";

// ─────────────────────────────────────────────────────────────────────────────
// GET /me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user from Clerk, upserts them into the local DB,
 * and returns the local row.
 */
export async function getMeHandler(req: AuthedRequest, res: Response) {
  try {
    const clerkUserId = req.auth!.clerkUserId;

    const user = await clerk.users.getUser(clerkUserId);

    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;

    const dbUser = await upsertUser({
      clerk_user_id: user.id,
      email:         primaryEmail,
      name:          user.fullName ?? user.firstName ?? null,
      profile_image: user.imageUrl ?? null, // Clerk uses imageUrl (camelCase)
      // role + subscription_active are left as DB defaults when not provided
    });

    return res.json({ success: true, data: dbUser });
  } catch (e: any) {
    return res.status(500).json({ error: "Failed to load user", details: e?.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the current user's profile.
 *
 * When `name` or `username` is included, also syncs those fields to Clerk
 * (Clerk stores `firstName`/`lastName` separately, so `name` is split on
 * the first space).
 */
export async function patchMeHandler(req: AuthedRequest, res: Response) {
  try {
    const clerkUserId = req.auth!.clerkUserId;
    const body = UpdateMyProfileSchema.parse(req.body);

    if (!hasUpdatableFields(body)) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    // Sync name/username changes to Clerk before updating the local row.
    if (body.name !== undefined || body.username !== undefined) {
      await clerk.users.updateUser(clerkUserId, {
        firstName: body.name?.trim().split(" ")[0],
        lastName:  body.name?.trim().split(" ").slice(1).join(" ") || undefined,
        username:  body.username?.trim() || undefined,
      });
    }

    const updated = await updateMyProfile(clerkUserId, body);
    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("UPDATE ME ERROR:", error);

    // Clerk SDK error — pass the message through as-is.
    const clerkMsg = error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message;
    if (clerkMsg) {
      return res.status(422).json({ success: false, error: clerkMsg });
    }

    // Zod validation error — pass the first issue message through.
    if (error?.name === "ZodError") {
      const first = error.errors?.[0];
      return res.status(400).json({ success: false, error: first?.message ?? "Validation error" });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /me/access
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the current user's role and subscription status. */
export async function getMyAccessHandler(req: AuthedRequest, res: Response) {
  try {
    const clerkUserId = req.auth!.clerkUserId;
    const dbUser = await getUserAccessByClerkId(clerkUserId);

    if (!dbUser) {
      return res.status(404).json({ error: "User not found in DB" });
    }

    return res.json({
      role: dbUser.role,
      subscription_active: dbUser.subscription_active,
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Failed to get user access", details: e?.message });
  }
}