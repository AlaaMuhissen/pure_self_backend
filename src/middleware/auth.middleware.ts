import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse, AuthenticatedRequest } from "../types";

export const clerkInit = clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    const body: ApiResponse = {
      success: false,
      error: "Unauthorized — valid Clerk session required.",
    };
    res.status(401).json(body);
    return;
  }

  (req as AuthenticatedRequest).auth = {
    userId: auth.userId,
    sessionId: auth.sessionId ?? "",
    orgId: auth.orgId ?? undefined,
    orgRole: auth.orgRole ?? undefined,
  };

  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);

    if (!auth?.userId) {
      const body: ApiResponse = {
        success: false,
        error: "Unauthorized — valid Clerk session required.",
      };
      res.status(401).json(body);
      return;
    }

    const typedReq = req as AuthenticatedRequest;
    typedReq.auth = {
      userId: auth.userId,
      sessionId: auth.sessionId ?? "",
      orgId: auth.orgId ?? undefined,
      orgRole: auth.orgRole ?? undefined,
    };

    if (typedReq.auth.orgRole !== role) {
      const body: ApiResponse = {
        success: false,
        error: `Forbidden — role '${role}' required.`,
      };
      res.status(403).json(body);
      return;
    }

    next();
  };
}
