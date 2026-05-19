import { pool } from "../db/supabase";


export async function assertAdminByClerkId(clerkUserId: string) {
  const q = `select role from public.users where clerk_user_id = $1 limit 1;`;
  const { rows } = await pool.query(q, [clerkUserId]);

  const role = rows[0]?.role;
  if (!role) throw new Error("User not found");
  if (role !== "admin") throw new Error("Forbidden");
}