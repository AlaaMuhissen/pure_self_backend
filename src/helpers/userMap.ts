import { pool } from "../db/supabase";

export async function getAppUserIdByClerkId(clerkUserId: string): Promise<string> {
  const { rows } = await pool.query(
    `select id from public.users where clerk_user_id = $1 limit 1;`,
    [clerkUserId]
  );
  if (!rows[0]) throw new Error("User not found");
  return rows[0].id as string;
}