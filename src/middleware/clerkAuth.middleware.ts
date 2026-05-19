import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";

export type AuthedRequest = Request & {
  auth?: { clerkUserId: string };
};

export async function clerkAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: "Missing Bearer token" });

    const token = match[1];

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return res.status(500).json({ error: "Missing CLERK_SECRET_KEY" });

    const payload = await verifyToken(token, { secretKey });
    const clerkUserId = payload?.sub;
    if (!clerkUserId) return res.status(401).json({ error: "Invalid token" });

    req.auth = { clerkUserId };
    next();
  } catch (e: any) {
    return res.status(401).json({ error: "Unauthorized", details: e?.message });
  }
}