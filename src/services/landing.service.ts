/**
 * @file landing.service.ts
 * @description
 *   Data-access layer for the landing page's "quote" section and "why
 *   choose us" cards (`landing_why` table — distinct from the
 *   `why_choose_us` table used elsewhere).
 *
 *   Covers: get-or-create the singleton quote row, partial quote updates,
 *   listing/creating/updating/deleting why-cards, and bulk reordering.
 *
 *   Card validation (`validateCard`) is shared with `whyChooseUs.service.ts`
 *   and re-exported here for convenience.
 */

import { pool } from "../db/supabase";
import { validateCard } from "./whyChooseUs.service";

export { validateCard };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteRow {
  id:         number;
  quote_text: string;
  author:     string;
  updated_at: string;
}

export interface WhyRow {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  sort_order:  number;
  created_at:  string;
  updated_at:  string;
}

export interface UpdateQuoteInput {
  quote_text?: string;
  author?:     string;
}

export interface UpsertWhyCardInput {
  icon:        string;
  title:       string;
  description: string;
  sort_order?: number;
}

export interface UpdateWhyCardInput {
  icon?:        string;
  title?:       string;
  description?: string;
  sort_order?:  number;
}

export interface ReorderItem {
  id:         string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the singleton quote row (id = 1), creating it with default values
 * if it doesn't exist yet.
 */
export async function getOrCreateQuote(): Promise<QuoteRow> {
  const result = await pool.query<QuoteRow>(
    `SELECT id, quote_text, author, updated_at FROM landing_quote WHERE id = 1`,
  );

  if (result.rows.length > 0) return result.rows[0];

  const inserted = await pool.query<QuoteRow>(
    `INSERT INTO landing_quote (id, quote_text, author)
     VALUES (1, '', 'أنا')
     RETURNING *`,
  );
  return inserted.rows[0];
}

/**
 * Result of validating a quote patch.
 * `error` is set when validation fails (caller should return 400).
 * `error` is `null` and `updates`/`values` are empty when there are no fields to update
 * (caller should also return 400 — distinguish via {@link hasUpdatableQuoteFields}).
 */
export interface QuotePatchResult {
  error?:  string;
  updates: string[];
  values:  unknown[];
}

/**
 * Validates and builds the SET clause + values for a quote update.
 *
 * Validation rules (preserved from original):
 *   - `quote_text`, if provided, must be a non-empty string ≤ 500 chars.
 *   - `author`, if provided, falls back to "أنا" when empty after trimming.
 */
export function buildQuotePatch(body: UpdateQuoteInput): QuotePatchResult {
  const updates: string[] = [];
  const values:  unknown[] = [];
  let idx = 1;

  if (body.quote_text !== undefined) {
    if (typeof body.quote_text !== "string" || body.quote_text.trim().length === 0) {
      return { error: "quote_text cannot be empty", updates: [], values: [] };
    }
    if (body.quote_text.length > 500) {
      return { error: "quote_text max 500 chars", updates: [], values: [] };
    }
    updates.push(`quote_text = $${idx++}`);
    values.push(body.quote_text.trim());
  }

  if (body.author !== undefined) {
    updates.push(`author = $${idx++}`);
    values.push(body.author.trim() || "أنا");
  }

  return { updates, values };
}

/** Applies a pre-built quote patch (from {@link buildQuotePatch}) and returns the updated row. */
export async function updateQuote(updates: string[], values: unknown[]): Promise<QuoteRow> {
  const allUpdates = [...updates, `updated_at = now()`];

  const result = await pool.query<QuoteRow>(
    `UPDATE landing_quote
     SET ${allUpdates.join(", ")}
     WHERE id = 1
     RETURNING *`,
    values,
  );
  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Why cards — reads
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all landing "why" cards ordered by `sort_order`, then `created_at`. */
export async function listWhyCards(): Promise<WhyRow[]> {
  const result = await pool.query<WhyRow>(
    `SELECT id, icon, title, description, sort_order, created_at, updated_at
     FROM landing_why
     ORDER BY sort_order ASC, created_at ASC`,
  );
  return result.rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Why cards — writes
// ─────────────────────────────────────────────────────────────────────────────

/** Inserts a new "why" card. Trims string fields and defaults `sort_order` to 0. */
export async function createWhyCard(input: UpsertWhyCardInput): Promise<WhyRow> {
  const result = await pool.query<WhyRow>(
    `INSERT INTO landing_why (icon, title, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.icon.trim(), input.title.trim(), input.description.trim(), input.sort_order ?? 0],
  );
  return result.rows[0];
}

/**
 * Applies a partial update to a "why" card. Only fields present in `input`
 * are updated; string fields are trimmed.
 *
 * @returns the updated row, or `null` if no card matches `id`
 *          (caller should return 404).
 *
 * Use {@link hasUpdatableWhyCardFields} to check for empty patches before calling.
 */
export async function updateWhyCard(id: string, input: UpdateWhyCardInput): Promise<WhyRow | null> {
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

  updates.push(`updated_at = now()`);
  values.push(id);

  const result = await pool.query<WhyRow>(
    `UPDATE landing_why SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
}

/** Returns `true` if the patch body contains at least one updatable field. */
export function hasUpdatableWhyCardFields(input: UpdateWhyCardInput): boolean {
  return (
    input.icon !== undefined ||
    input.title !== undefined ||
    input.description !== undefined ||
    input.sort_order !== undefined
  );
}

/** Deletes a "why" card by ID. Returns the deleted ID, or `null` if not found. */
export async function deleteWhyCard(id: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `DELETE FROM landing_why WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Bulk-updates `sort_order` for multiple cards in a single query, then
 * returns the full list re-ordered.
 */
export async function reorderWhyCards(items: ReorderItem[]): Promise<WhyRow[]> {
  await pool.query(
    `UPDATE landing_why AS w
     SET sort_order = v.sort_order::integer
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::integer[]) AS sort_order) AS v
     WHERE w.id = v.id`,
    [items.map((i) => i.id), items.map((i) => i.sort_order)],
  );

  const result = await pool.query<WhyRow>(`SELECT * FROM landing_why ORDER BY sort_order ASC`);
  return result.rows;
}