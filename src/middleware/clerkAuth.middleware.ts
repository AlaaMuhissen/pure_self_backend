import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";


import { pool } from "../db/supabase";

export type AuthedRequest = Request & {
  auth?: {
    clerkUserId: string;
    userId: string;
    role: string;
  };
};

export async function clerkAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    const token = match[1];

    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({ error: "Missing CLERK_SECRET_KEY" });
    }

    const payload = await verifyToken(token, { secretKey });

    const clerkUserId = payload?.sub;

    if (!clerkUserId) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // 🔥 get user from DB
    const result = await pool.query(
      `
      SELECT id, role
      FROM users
      WHERE clerk_user_id = $1
      LIMIT 1
      `,
      [clerkUserId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    req.auth = {
      clerkUserId,
      userId: user.id,
      role: user.role,
    };

    next();
  } catch (e: any) {
    return res.status(401).json({
      error: "Unauthorized",
      details: e?.message,
    });
  }
}