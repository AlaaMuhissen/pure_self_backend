import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clerkClient } from "@clerk/express";
import { ApiResponse, AuthenticatedRequest } from "../types";
import * as UserService from "../services/users.service";
import { createClerkClient } from "@clerk/backend";
import { IdParamSchema, UpdateMyProfileSchema, UpdateUserRoleSchema } from "../schemas/user.schema";


export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;

    const client = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const clerkUser = await client.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    const firstName = clerkUser.firstName ?? "";
    const lastName = clerkUser.lastName ?? "";
    const name = `${firstName} ${lastName}`.trim() || clerkUser.username || undefined;
    const profile_image = clerkUser.imageUrl ?? undefined;

    const existing = await UserService.getUserByClerkId(clerkUserId);

    const user = existing
      ? await UserService.updateUser(existing.id, {
          email,
          name,
          profile_image,
        })
      : await UserService.createUser({
          clerk_user_id: clerkUserId,
          email,
          name,
          profile_image,
          role: "user",
        });

    res.json({ success: true, data: user } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function getDbUserId(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;
    const dbUserId = await UserService.getDbUserIdFromClerkId(clerkUserId);

    res.json({
      success: true,
      data: { id: dbUserId },
    } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const user = await UserService.getUserById(id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      } satisfies ApiResponse);
      return;
    }

    res.json({ success: true, data: user } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await UserService.listUsers();
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function updateMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;
    const dbUser = await UserService.requireDbUserByClerkId(clerkUserId);

    const payload = UpdateMyProfileSchema.parse(req.body);
    const updated = await UserService.updateUser(dbUser.id, payload);

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { role } = UpdateUserRoleSchema.parse(req.body);

    const updated = await UserService.updateUser(id, { role });

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}