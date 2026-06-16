/**
 * @file me.service.ts
 * @description
 *   Data-access layer for the authenticated user's own profile.
 *
 *   Covers building/executing the dynamic `UPDATE public.users` statement
 *   used by `PATCH /me`. No HTTP logic lives here.
 */

import { pool } from "../db/supabase";
import type { z } from "zod";
import type { UpdateMyProfileSchema } from "../schemas/user.schema"; 

type UpdateMyProfileInput = z.infer<typeof UpdateMyProfileSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Profile update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the SET clause + parameter list for a partial profile update.
 * Only fields present in `body` are included.
 *
 * @returns `null` when `body` contains no updatable fields.
 */
function buildProfileUpdate(body: UpdateMyProfileInput): { setClause: string; values: unknown[] } | null {
  const updates: string[] = [];
  const values:  unknown[] = [];
  let idx = 1;

  const fields: Array<keyof UpdateMyProfileInput> = [
    "name",
    "username",
    "email",
    "palette_id",
    "profile_image",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) return null;

  return { setClause: updates.join(", "), values };
}

/**
 * Applies a partial update to `public.users` for the given Clerk user.
 * Returns the updated row, or `null` if:
 *   - `body` has no updatable fields (caller should return 400), or
 *   - no user row matches `clerkUserId` (caller should return 404).
 *
 * Use {@link hasUpdatableFields} to distinguish the two `null` cases if needed.
 */
export async function updateMyProfile(clerkUserId: string, body: UpdateMyProfileInput) {
  const built = buildProfileUpdate(body);
  if (!built) return null;

  const { setClause, values } = built;
  values.push(clerkUserId);

  const { rows } = await pool.query(
    `UPDATE public.users
     SET ${setClause},
         updated_at = NOW()
     WHERE clerk_user_id = $${values.length}
     RETURNING *;`,
    values,
  );

  return rows[0] ?? null;
}

/** Returns `true` if the patch body contains at least one updatable field. */
export function hasUpdatableFields(body: UpdateMyProfileInput): boolean {
  return buildProfileUpdate(body) !== null;
}