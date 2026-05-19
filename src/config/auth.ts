import { getAuth } from "@clerk/express";
import { pool } from "../db/supabase";


export async function getInternalUserIdByClerkId(clerkUserId: string): Promise<string> {
  const q = `select id from public.users where clerk_user_id = $1 limit 1;`;
  const { rows } = await pool.query(q, [clerkUserId]);

  if (!rows[0]?.id) {
    // If you prefer auto-create user row, tell me and I’ll add it.
    throw new Error("User not found in public.users for this clerk_user_id");
  }
  return rows[0].id as string;
}


export function clerkUserIdOrThrow(req: any) {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Unauthorized");
  return auth.userId;
}

export async function getUserUuidByClerkId(clerkId: string): Promise<string> {
  const { rows } = await pool.query(
    `select id from public.users where clerk_user_id=$1 limit 1;`,
    [clerkId]
  );
  if (!rows[0]) throw new Error("UserNotFound");
  return rows[0].id as string;
}

export async function assertSpecialistByUserId(userId: string) {
  const { rows } = await pool.query(
    `select user_id from public.specialists where user_id=$1 limit 1;`,
    [userId]
  );
  if (!rows[0]) throw new Error("Forbidden");
}