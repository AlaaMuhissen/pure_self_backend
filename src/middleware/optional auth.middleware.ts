import { clerkMiddleware, getAuth } from "@clerk/express";
import { Request, Response, NextFunction } from "express";

/**
 * clerkAuth — hard guard, rejects with 401 if no valid session.
 * Use on routes that should NEVER be accessible to guests.
 */
export const clerkAuth = [
  clerkMiddleware(),
  (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    (req as any).auth = { clerkUserId: auth.userId };
    next();
  },
];

/**
 * optionalClerkAuth — soft guard, lets guests through.
 * req.auth will be undefined for guests and populated for signed-in users.
 * Use on routes that serve different content based on auth state (e.g. content preview vs full).
 */
export const optionalClerkAuth = [
  clerkMiddleware(),
  (req: Request, _res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    if (auth?.userId) {
      (req as any).auth = { clerkUserId: auth.userId };
    }
    // Always call next — guests are allowed through
    next();
  },
];