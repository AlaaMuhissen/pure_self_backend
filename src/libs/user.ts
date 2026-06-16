import { getAuth } from "@clerk/express";
import type { Request } from "express";
import { pool } from "../db/supabase";

/**
 * Extracts the Clerk user ID from the request, throwing 401 if absent.
 * Use this in any route handler before touching the database.
 */
export function getClerkUserId(req: Request): string {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Unauthorized");
  return auth.userId;
}

/**
 * Resolves a Clerk user ID to the internal database UUID.
 * Throws a 404-friendly error if the user has no DB row yet.
 */
export async function getDbUserId(clerkUserId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  if (!rows[0]) throw new Error("User not found");
  return rows[0].id;
}

/**
 * Asserts the user has the 'admin' role.
 * Throws Forbidden if not — caught as a 403 by the error handler.
 */
export async function assertAdmin(clerkUserId: string): Promise<void> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  if (!rows[0]) throw new Error("User not found");
  if (rows[0].role !== "admin") throw new Error("Forbidden");
}

/**
 * Asserts the user has a specialist profile row.
 * Throws Forbidden if not.
 */
export async function assertSpecialist(userId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT user_id FROM public.specialists WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!rows[0]) throw new Error("Forbidden");
}
