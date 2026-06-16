/**
 * @file content.routes.ts
 * @description
 *   Public/admin content router — wiring only.
 *
 *   Mount in your Express app:
 *     app.use("/content", contentRouter);
 *
 *   ⚠️  ROUTE ORDER IS CRITICAL — preserved exactly from the original file:
 *
 *     1. Static/collection routes  (/, POST /)
 *     2. Reviews routes            (/:id/reviews*)
 *     3. Dynamic /:id routes        (GET/PATCH/PUT/DELETE /:id)
 *
 *   Reviews routes must come before the plain /:id handlers, otherwise
 *   Express would match "/:id/reviews" against "GET /:id" first and the
 *   review endpoints would never be reached. Do not reorder these blocks.
 */

import { Router } from "express";
import { clerkAuth }         from "../middleware/clerkAuth.middleware";
import { optionalClerkAuth }  from "../middleware/optional auth.middleware";
import { contentUpload }      from "../libs/content-upload";
import {
  listContentHandler,
  createContentHandler,
  getContentHandler,
  patchContentHandler,
  putContentHandler,
  deleteContentHandler,
} from "../controllers/content.controller";
import {
  getReviewsHandler,
  createReviewHandler,
  updateOwnReviewHandler,
  deleteOwnReviewHandler,
  deleteReviewAsAdminHandler,
} from "../controllers/reviews.controller";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// STATIC / COLLECTION ROUTES  (must come before /:id)
// ─────────────────────────────────────────────────────────────────────────────

router.get ("/", listContentHandler);
router.post("/", contentUpload.single("pdf"), createContentHandler);

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS ROUTES  (/:id/reviews* — must come before plain /:id handlers)
// ─────────────────────────────────────────────────────────────────────────────

router.get   ("/:id/reviews",            getReviewsHandler);
router.post  ("/:id/reviews",            clerkAuth, createReviewHandler);
router.put   ("/:id/reviews/mine",       clerkAuth, updateOwnReviewHandler);
router.delete("/:id/reviews/mine",       clerkAuth, deleteOwnReviewHandler);
router.delete("/:id/reviews/:reviewId",  clerkAuth, deleteReviewAsAdminHandler);

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC /:id ROUTES  (last, so they don't shadow the routes above)
// ─────────────────────────────────────────────────────────────────────────────

router.get   ("/:id", optionalClerkAuth, getContentHandler);
router.patch ("/:id", patchContentHandler);
router.put   ("/:id", putContentHandler);
router.delete("/:id", deleteContentHandler);

export default router;