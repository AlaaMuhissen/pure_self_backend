/**
 * @file users.controller.ts
 * @description
 *   Request handlers for user management.
 *
 *   `me` syncs the Clerk user into the local DB on every call (upsert
 *   pattern) and returns the resulting row. All other handlers delegate
 *   to `users.service` for DB work — no SQL lives here.
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiResponse, AuthenticatedRequest } from "../types";
import { clerk }                from "../config/clerk";
import * as UserService         from "../services/users.service";
import {
  IdParamSchema,
  UpdateMyProfileSchema,
  UpdateUserRoleSchema,
} from "../schemas/user.schema";

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user from Clerk, then upserts them into the local DB.
 * Creates a new row on first sign-in; updates `email`, `name`, and
 * `profile_image` on subsequent calls to stay in sync with Clerk.
 */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;

    const clerkUser    = await clerk.users.getUser(clerkUserId);
    const email        = clerkUser.emailAddresses?.[0]?.emailAddress;
    const firstName    = clerkUser.firstName ?? "";
    const lastName     = clerkUser.lastName  ?? "";
    const name         = `${firstName} ${lastName}`.trim() || clerkUser.username || undefined;
    const profile_image = clerkUser.imageUrl ?? undefined;

    const existing = await UserService.getUserByClerkId(clerkUserId);

    const user = existing
      ? await UserService.updateUser(existing.id, { email, name, profile_image })
      : await UserService.createUser({ clerk_user_id: clerkUserId, email, name, profile_image, role: "user" });

    res.json({ success: true, data: user } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/me/db-id
// ─────────────────────────────────────────────────────────────────────────────

/** Resolves the authenticated user's internal UUID from their Clerk ID. */
export async function getDbUserId(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;
    const dbUserId = await UserService.getDbUserIdFromClerkId(clerkUserId);

    res.json({ success: true, data: { id: dbUserId } } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/:id
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a single user by their internal UUID. */
export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const user   = await UserService.getUserById(id);

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" } satisfies ApiResponse);
      return;
    }

    res.json({ success: true, data: user } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all users. */
export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await UserService.listUsers();
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /users/me
// ─────────────────────────────────────────────────────────────────────────────

/** Updates the authenticated user's own profile fields. */
export async function updateMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;
    const dbUser  = await UserService.requireDbUserByClerkId(clerkUserId);
    const payload = UpdateMyProfileSchema.parse(req.body);
    const updated = await UserService.updateUser(dbUser.id, payload);

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /users/:id/role
// ─────────────────────────────────────────────────────────────────────────────

/** Updates a user's role (admin only — enforced at the route level). */
export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id }   = IdParamSchema.parse(req.params);
    const { role } = UpdateUserRoleSchema.parse(req.body);
    const updated  = await UserService.updateUser(id, { role });

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}