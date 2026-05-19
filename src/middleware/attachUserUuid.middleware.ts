import { getAuth } from "@clerk/express";
import { pool } from "../db/supabase";

export async function attachUserUuid(req: any, res: any, next: any) {
  try {
    const auth = getAuth(req);
    const clerkUserId = auth.userId;
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });

    // map clerk -> users.id (uuid)
    const { rows } = await pool.query(
      `select id from public.users where clerk_user_id = $1 limit 1;`,
      [clerkUserId]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "User not found in DB",
        hint: "Insert user row in public.users with clerk_user_id first",
      });
    }

    req.userUuid = rows[0].id; // ✅ uuid
    req.clerkUserId = clerkUserId;
    next();
  } catch (e: any) {
    return res.status(500).json({ error: "Server error", detail: e?.message });
  }
}