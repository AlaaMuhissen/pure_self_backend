/**
 * @file reviews.service.ts
 * @description
 *   Data-access layer for content reviews.
 *
 *   Covers: fetching reviews + rating stats for a content item, resolving
 *   the internal app user from a Clerk ID, checking content access
 *   eligibility for reviewing, and CRUD on `content_reviews` via Supabase.
 *
 *   No HTTP logic lives here.
 */

import { pool, supabase } from "../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// User resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  role?: string;
  subscription_active?: boolean;
}

/**
 * Resolves a Clerk user ID to the internal app user row.
 * `includeAccessFields` also selects `role` and `subscription_active`
 * (needed for the review-eligibility check on POST).
 */
export async function getAppUserByClerkId(
  clerkUserId: string,
  includeAccessFields = false,
): Promise<AppUser | null> {
  const columns = includeAccessFields ? "id, role, subscription_active" : "id";
  const { rows } = await pool.query<AppUser>(
    `SELECT ${columns} FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  return rows[0] ?? null;
}

/** Returns `true` if the given Clerk user is an admin. */
export async function isAdminUser(clerkUserId: string): Promise<boolean> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  return rows[0]?.role === "admin";
}

// ─────────────────────────────────────────────────────────────────────────────
// Access eligibility
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentAccessInfo {
  id:       string;
  is_free:  boolean;
  price:    string | null;
}

/** Fetches the fields needed to determine whether content is free. Returns `null` if not found. */
export async function getContentAccessInfo(contentId: string): Promise<ContentAccessInfo | null> {
  const { rows } = await pool.query<ContentAccessInfo>(
    `SELECT id, is_free, price FROM public.content_items WHERE id = $1`,
    [contentId],
  );
  return rows[0] ?? null;
}

/** Returns `true` if the user has an individual purchase record for this content. */
export async function hasUserPurchasedContent(userId: string, contentId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM public.user_content_purchases WHERE user_id = $1 AND content_id = $2 LIMIT 1`,
    [userId, contentId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Determines whether a user is allowed to leave a review for a content item.
 * A user can review if the content is free, they're an admin, they have an
 * active subscription, or they've individually purchased the content.
 */
export async function canReviewContent(appUser: AppUser, content: ContentAccessInfo): Promise<boolean> {
  const isFree   = content.is_free || Number(content.price ?? 1) === 0;
  const isAdmin  = appUser.role === "admin";
  const isSubbed = Boolean(appUser.subscription_active);

  if (isFree || isAdmin || isSubbed) return true;

  return hasUserPurchasedContent(appUser.id, content.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews — reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of reviews for a content item, along with
 * aggregate rating stats.
 */
export async function getContentReviews(contentId: string, limit: number, offset: number) {
  const [reviews, stats] = await Promise.all([
    supabase
      .from("content_reviews")
      .select("id, user_id, internal_user_id, display_name, rating, comment, created_at, updated_at")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("content_review_stats")
      .select("avg_rating, review_count")
      .eq("content_id", contentId)
      .single(),
  ]);

  return {
    reviews: reviews.data ?? [],
    stats:   stats.data ?? { avg_rating: null, review_count: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews — writes
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateReviewInput {
  content_id:       string;
  clerk_user_id:    string;
  internal_user_id: string;
  rating:           number;
  comment?:         string;
  display_name?:    string;
}

/**
 * Inserts a new review.
 * Returns `{ data, error }` — callers check `error.code === "23505"` for
 * the unique-constraint "already reviewed" case.
 */
export async function createReview(input: CreateReviewInput) {
  return supabase
    .from("content_reviews")
    .insert({
      content_id:       input.content_id,
      user_id:          input.clerk_user_id,    // kept for existing rows
      internal_user_id: input.internal_user_id, // internal uuid for frontend matching
      rating:           input.rating,
      comment:          input.comment,
      display_name:     input.display_name,
    })
    .select()
    .single();
}

/** Updates the caller's own review for a content item. */
export async function updateOwnReview(
  contentId: string,
  internalUserId: string,
  changes: { rating?: number; comment?: string },
) {
  return supabase
    .from("content_reviews")
    .update(changes)
    .eq("content_id", contentId)
    .eq("internal_user_id", internalUserId)
    .select()
    .single();
}

/** Deletes the caller's own review for a content item. */
export async function deleteOwnReview(contentId: string, internalUserId: string) {
  return supabase
    .from("content_reviews")
    .delete()
    .eq("content_id", contentId)
    .eq("internal_user_id", internalUserId);
}

/** Admin-only: deletes any review by its ID, scoped to a content item. */
export async function deleteReviewByIdAsAdmin(contentId: string, reviewId: string) {
  return supabase
    .from("content_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("content_id", contentId);
}