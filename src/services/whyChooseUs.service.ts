/**
 * @file whyChooseUs.service.ts
 * @description
 *   Data-access layer for the "Why Choose Us" cards shown on the public site.
 *   Covers listing, creating, partial-updating, and deleting cards, plus the
 *   shared `validateCard` helper used on create.
 */

import { pool } from "../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WhyChooseUsRow {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  sort_order:  number;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
}

export interface CreateCardInput {
  icon:        string;
  title:       string;
  description: string;
  sort_order?: number;
}

export interface UpdateCardInput {
  icon?:        string;
  title?:       string;
  description?: string;
  sort_order?:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a card's required fields and length limits. Returns a list of error messages (empty = valid). */
export function validateCard(body: { icon?: string; title?: string; description?: string }): string[] {
  const errors: string[] = [];
  if (!body.icon?.trim())        errors.push("icon is required");
  if (!body.title?.trim())       errors.push("title is required");
  if (body.title && body.title.length > 120)            errors.push("title max 120 chars");
  if (!body.description?.trim()) errors.push("description is required");
  if (body.description && body.description.length > 400) errors.push("description max 400 chars");
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all cards ordered by `sort_order`, then `created_at`. */
export async function listCards(): Promise<WhyChooseUsRow[]> {
  const { rows } = await pool.query<WhyChooseUsRow>(
    `SELECT id, icon, title, description, sort_order, created_at, updated_at
     FROM why_choose_us
     ORDER BY sort_order ASC, created_at ASC`,
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** Inserts a new card. Trims string fields and defaults `sort_order` to 0. */
export async function createCard(input: CreateCardInput, createdBy: string): Promise<WhyChooseUsRow> {
  const { rows } = await pool.query<WhyChooseUsRow>(
    `INSERT INTO why_choose_us (icon, title, description, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.icon.trim(), input.title.trim(), input.description.trim(), input.sort_order ?? 0, createdBy],
  );
  return rows[0];
}

/**
 * Applies a partial update to a card. Only fields present in `input` are
 * updated; string fields are trimmed.
 *
 * @returns the updated row, or `null` if:
 *   - `input` has no updatable fields (caller should return 400), or
 *   - no card matches `id` (caller should return 404).
 *
 * Use {@link hasUpdatableFields} to distinguish the two `null` cases if needed.
 */
export async function updateCard(id: string, input: UpdateCardInput): Promise<WhyChooseUsRow | null> {
  const updates: string[] = [];
  const values:  unknown[] = [];
  let idx = 1;

  if (input.icon !== undefined) {
    updates.push(`icon = $${idx++}`);
    values.push(input.icon.trim());
  }
  if (input.title !== undefined) {
    updates.push(`title = $${idx++}`);
    values.push(input.title.trim());
  }
  if (input.description !== undefined) {
    updates.push(`description = $${idx++}`);
    values.push(input.description.trim());
  }
  if (input.sort_order !== undefined) {
    updates.push(`sort_order = $${idx++}`);
    values.push(Number(input.sort_order));
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<WhyChooseUsRow>(
    `UPDATE why_choose_us
     SET ${updates.join(", ")}
     WHERE id = $${idx}
     RETURNING *`,
    values,
  );

  return rows[0] ?? null;
}

/** Returns `true` if the patch body contains at least one updatable field. */
export function hasUpdatableCardFields(input: UpdateCardInput): boolean {
  return (
    input.icon !== undefined ||
    input.title !== undefined ||
    input.description !== undefined ||
    input.sort_order !== undefined
  );
}

/** Deletes a card by ID. Returns the deleted card's ID, or `null` if not found. */
export async function deleteCard(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `DELETE FROM why_choose_us WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows[0]?.id ?? null;
}