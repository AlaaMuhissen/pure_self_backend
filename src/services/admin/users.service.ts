/**
 * @file users.service.ts
 * @description
 *   Data-access layer for admin user management.
 *   All SQL for searching users, managing subscriptions,
 *   and granting/revoking content access lives here.
 *
 *   Every function accepts a query string or uses the shared pool directly.
 *   No HTTP logic lives in this file.
 */

import { pool } from "../../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full-text search across name, username, and email (case-insensitive).
 * Returns at most 20 results ordered by creation date (newest first).
 */
export async function searchUsers(q: string) {
  const { rows } = await pool.query(
    `SELECT
       id, name, username, email, profile_image,
       subscription_active, role, created_at
     FROM public.users
     WHERE
       name     ILIKE $1
       OR username ILIKE $1
       OR email    ILIKE $1
     ORDER BY created_at DESC
     LIMIT 20;`,
    [`%${q}%`],
  );
  return rows;
}

/**
 * Toggles the `subscription_active` flag for a user.
 * Returns the updated row, or `null` if no user was found.
 */
export async function updateUserSubscription(
  userId: string,
  subscriptionActive: boolean,
) {
  const { rows } = await pool.query(
    `UPDATE public.users
     SET subscription_active = $1,
         updated_at          = NOW()
     WHERE id = $2
     RETURNING *;`,
    [subscriptionActive, userId],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all content items a user has access to, including whether
 * access was granted by an admin.
 */
export async function getUserContentAccess(userId: string) {
  const { rows } = await pool.query(
    `SELECT
       p.content_id,
       c.title,
       c.type,
       c.price,
       c.is_free,
       p.granted_by_admin,
       p.granted_at
     FROM public.user_content_purchases p
     JOIN public.content_items c ON c.id = p.content_id
     WHERE p.user_id = $1
     ORDER BY p.granted_at DESC;`,
    [userId],
  );
  return rows;
}

/**
 * Grants a user access to a content item.
 * Uses upsert so calling this multiple times is safe.
 * Returns the inserted/updated row.
 */
export async function grantContentAccess(userId: string, contentId: string) {
  const { rows } = await pool.query(
    `INSERT INTO public.user_content_purchases
       (user_id, content_id, granted_by_admin, granted_at)
     VALUES ($1, $2, true, NOW())
     ON CONFLICT (user_id, content_id)
     DO UPDATE SET
       granted_by_admin = true,
       granted_at       = NOW()
     RETURNING *;`,
    [userId, contentId],
  );
  return rows[0];
}

/**
 * Revokes a user's access to a content item.
 * Silent no-op when the row doesn't exist.
 */
export async function revokeContentAccess(userId: string, contentId: string) {
  await pool.query(
    `DELETE FROM public.user_content_purchases
     WHERE user_id = $1 AND content_id = $2;`,
    [userId, contentId],
  );
}