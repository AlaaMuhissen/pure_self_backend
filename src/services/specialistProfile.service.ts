/**
 * @file specialistProfile.service.ts
 * @description
 *   Data-access layer for a specialist's own profile (`specialists` table).
 *
 *   Covers fetch-or-create (auto-provisioning a row on first access),
 *   partial updates, response normalization, and patch validation.
 *
 *   `specialists` schema:
 *     user_id      uuid    FK → users.id  (PK)
 *     available    bool    DEFAULT true
 *     bio          text    NULLABLE
 *     tags         text[]  DEFAULT '{}'
 *     hourly_price numeric NULLABLE
 */

import { pool } from "../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecialistRow {
  user_id:      string;
  available:    boolean;
  bio:          string | null;
  tags:         string[];
  hourly_price: string | number | null; // pg returns numeric as string
}

export interface PatchSpecialistProfileInput {
  available?:    boolean;
  bio?:          string | null;
  tags?:         string[];
  hourly_price?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads / fetch-or-create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the specialist row for `userId`, creating it with default values
 * (`available = true`, `bio = NULL`, `tags = '{}'`, `hourly_price = NULL`)
 * if it doesn't exist yet.
 */
export async function getOrCreateSpecialist(userId: string): Promise<SpecialistRow> {
  const existing = await pool.query<SpecialistRow>(
    `SELECT user_id, available, bio, tags, hourly_price
     FROM specialists
     WHERE user_id = $1`,
    [userId],
  );

  if (existing.rows.length > 0) return existing.rows[0];

  const inserted = await pool.query<SpecialistRow>(
    `INSERT INTO specialists (user_id, available, bio, tags, hourly_price)
     VALUES ($1, true, NULL, '{}', NULL)
     RETURNING user_id, available, bio, tags, hourly_price`,
    [userId],
  );

  return inserted.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a partial update to the specialist's profile.
 * Only fields present in `input` are updated.
 *
 * @returns the updated row, or `null` if `input` has no updatable fields
 *          (caller should return 400). Use {@link hasUpdatableProfileFields}
 *          to check before calling.
 */
export async function updateSpecialistProfile(
  userId: string,
  input: PatchSpecialistProfileInput,
): Promise<SpecialistRow | null> {
  const updates: string[] = [];
  const values:  unknown[] = [];
  let idx = 1;

  if (input.available !== undefined) {
    updates.push(`available = $${idx++}`);
    values.push(input.available);
  }
  if (input.bio !== undefined) {
    updates.push(`bio = $${idx++}`);
    values.push(input.bio === "" ? null : input.bio);
  }
  if (input.tags !== undefined) {
    updates.push(`tags = $${idx++}`);
    values.push(input.tags); // pg driver sends JS string[] as text[]
  }
  if (input.hourly_price !== undefined) {
    updates.push(`hourly_price = $${idx++}`);
    values.push(input.hourly_price === null ? null : Number(input.hourly_price));
  }

  if (updates.length === 0) return null;

  values.push(userId); // last placeholder = WHERE user_id = $N

  const result = await pool.query<SpecialistRow>(
    `UPDATE specialists
     SET ${updates.join(", ")}
     WHERE user_id = $${idx}
     RETURNING user_id, available, bio, tags, hourly_price`,
    values,
  );

  return result.rows[0];
}

/** Returns `true` if the patch body contains at least one updatable field. */
export function hasUpdatableProfileFields(input: PatchSpecialistProfileInput): boolean {
  return (
    input.available !== undefined ||
    input.bio !== undefined ||
    input.tags !== undefined ||
    input.hourly_price !== undefined
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Normalizes a DB row before sending it to the client (coerces numeric/nullable fields). */
export function normalizeSpecialistRow(row: SpecialistRow) {
  return {
    user_id:      row.user_id,
    available:    row.available,
    bio:          row.bio ?? null,
    tags:         row.tags ?? [],
    hourly_price: row.hourly_price !== null ? Number(row.hourly_price) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a profile patch body. Returns a list of error messages (empty = valid). */
export function validateSpecialistProfilePatch(body: PatchSpecialistProfileInput): string[] {
  const errors: string[] = [];

  if (body.available !== undefined && typeof body.available !== "boolean") {
    errors.push("available must be a boolean");
  }

  if (body.bio !== undefined && body.bio !== null && typeof body.bio !== "string") {
    errors.push("bio must be a string or null");
  }
  if (typeof body.bio === "string" && body.bio.length > 600) {
    errors.push("bio must be 600 characters or fewer");
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      errors.push("tags must be an array of strings");
    } else if (body.tags.some((t) => typeof t !== "string")) {
      errors.push("every tag must be a string");
    } else if (body.tags.length > 20) {
      errors.push("maximum 20 tags allowed");
    }
  }

  if (body.hourly_price !== undefined && body.hourly_price !== null) {
    const n = Number(body.hourly_price);
    if (isNaN(n) || n < 0) {
      errors.push("hourly_price must be a non-negative number or null");
    }
  }

  return errors;
}