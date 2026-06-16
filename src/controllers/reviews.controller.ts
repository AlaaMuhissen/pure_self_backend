/**
 * @file reviews.controller.ts
 * @description
 *   Request handlers for content reviews (read, create, update own,
 *   delete own, admin delete-any).
 *
 *   Handlers validate input, enforce access/ownership rules, and delegate
 *   to `reviews.service` for DB work. No SQL lives here.
 */

import type { Response } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import {
  getAppUserByClerkId,
  isAdminUser,
  getContentAccessInfo,
  canReviewContent,
  getContentReviews,
  createReview,
  updateOwnReview,
  deleteOwnReview,
  deleteReviewByIdAsAdmin,
} from "../services/reviews.service";

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/reviews
// ─────────────────────────────────────────────────────────────────────────────

export async function getReviewsHandler(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const limit  = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  const { reviews, stats } = await getContentReviews(id, limit, offset);
  return res.json({ reviews, stats });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/reviews
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a review. Only users with access to the content (free content,
 * admins, active subscribers, or individual purchasers) may review it.
 */
export async function createReviewHandler(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const clerkUserId = req.auth!.clerkUserId;
  const { rating, comment, display_name } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be 1-5" });
  }

  const appUser = await getAppUserByClerkId(clerkUserId, true);
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  const content = await getContentAccessInfo(id);
  if (!content) return res.status(404).json({ error: "Content not found" });

  const allowed = await canReviewContent(appUser, content);
  if (!allowed) {
    return res.status(403).json({ error: "You must have access to this content before reviewing it" });
  }

  const { data, error } = await createReview({
    content_id:       id,
    clerk_user_id:    clerkUserId,
    internal_user_id: appUser.id,
    rating,
    comment,
    display_name,
  });

  if (error?.code === "23505") return res.status(409).json({ error: "already_reviewed" });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ review: data });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id/reviews/mine
// ─────────────────────────────────────────────────────────────────────────────

export async function updateOwnReviewHandler(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const clerkUserId = req.auth!.clerkUserId;
  const { rating, comment } = req.body;

  if (rating && (rating < 1 || rating > 5)) {
    return res.status(400).json({ error: "rating must be 1-5" });
  }

  const appUser = await getAppUserByClerkId(clerkUserId);
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  const { data, error } = await updateOwnReview(id, appUser.id, { rating, comment });

  if (!data) return res.status(404).json({ error: "review not found" });
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ review: data });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id/reviews/mine
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteOwnReviewHandler(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const clerkUserId = req.auth!.clerkUserId;

  const appUser = await getAppUserByClerkId(clerkUserId);
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  const { error } = await deleteOwnReview(id, appUser.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id/reviews/:reviewId — admin only
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteReviewAsAdminHandler(req: AuthedRequest, res: Response) {
  const { id, reviewId } = req.params;
  const clerkUserId = req.auth!.clerkUserId;

  const isAdmin = await isAdminUser(clerkUserId);
  if (!isAdmin) return res.status(403).json({ error: "Admins only" });

  const { error } = await deleteReviewByIdAsAdmin(id, reviewId);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true });
}