/**
 * @file content.controller.ts
 * @description
 *   Request handlers for public content browsing and admin CRUD.
 *
 *   Handlers validate input, delegate to `content.service` for DB work, and
 *   to `content-access.controller` for access-gating on the detail view.
 *   No SQL lives here.
 */

import type { Response } from "express";
import type { AuthedRequest } from "../middleware/clerkAuth.middleware";
import { canAccessContent } from "./content-access.controller";
import { createSchema } from "../schemas/content.schema";
import {
  listContent,
  getContentItem,
  getContentDetails,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  uploadContentPdf,
} from "../services/content.service";
import {
  getAppUserByClerkId as getReviewUser,
} from "../services/reviews.service";

// ─────────────────────────────────────────────────────────────────────────────
// GET /content — list with filters
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set(["video", "book", "article", "session"]);

export async function listContentHandler(req: AuthedRequest, res: Response) {
  try {
    const type      = req.query.type      ? String(req.query.type)      : undefined;
    const published = req.query.published ? String(req.query.published) : undefined;
    const freeOnly  = req.query.freeOnly  ? String(req.query.freeOnly)  : undefined;
    const q         = req.query.q         ? String(req.query.q)         : undefined;

    const rawLimit  = Number(req.query.limit  ?? 20);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit  = Number.isFinite(rawLimit)  ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0)              : 0;

    if (type && !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    const rows = await listContent({ type, published, freeOnly, q, limit, offset });
    return res.json({ success: true, data: rows, limit, offset });
  } catch (e: any) {
    console.error("PG ERROR:", e);
    return res.status(500).json({
      success: false,
      error: "DB connection failed",
      details: e?.errors?.map((x: any) => x?.message) ?? e?.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /content — create
// ─────────────────────────────────────────────────────────────────────────────

export async function createContentHandler(req: AuthedRequest, res: Response) {
  try {
    const body = {
      item:    JSON.parse(req.body.item),
      details: req.body.details ? JSON.parse(req.body.details) : undefined,
    };

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { item } = parsed.data;

    let uploadedPdfUrl: string | null = null;
    if ((item.type === "book" || item.type === "article") && req.file) {
      uploadedPdfUrl = await uploadContentPdf(item.type, req.file);
    }

    const created = await createContentItem(parsed.data, uploadedPdfUrl);
    return res.status(201).json({ item: created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create content" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — single item with access-gated details
// ─────────────────────────────────────────────────────────────────────────────

export async function getContentHandler(req: AuthedRequest, res: Response) {
  try {
    const contentId = req.params.id;

    const item = await getContentItem(contentId);
    if (!item) return res.status(404).json({ success: false, error: "Not found" });

    const preview = {
      id:           item.id,
      type:         item.type,
      title:        item.title,
      description:  item.description,
      image_url:    item.image_url,
      price:        item.price,
      currency:     item.currency,
      is_free:      item.is_free,
      preview_body: item.preview_body,
    };

    const clerkUserId = req.auth?.clerkUserId;
    if (!clerkUserId) {
      return res.status(200).json({ success: true, access: false, reason: "unauthenticated", item: preview });
    }

    const appUser = await getReviewUser(clerkUserId);
    if (!appUser) {
      return res.status(200).json({ success: true, access: false, reason: "user_not_registered", item: preview });
    }

    const hasAccess = await canAccessContent(appUser.id, contentId);
    if (!hasAccess) {
      return res.status(200).json({ success: true, access: false, reason: "no_access", item: preview });
    }

    const details = await getContentDetails(contentId, item.type);
    return res.status(200).json({ success: true, access: true, item, details });
  } catch (e: any) {
    console.error("GET CONTENT DETAILS ERROR:", e);
    return res.status(500).json({ success: false, error: "Failed to load content", details: e?.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — partial update
// ─────────────────────────────────────────────────────────────────────────────

export async function patchContentHandler(req: AuthedRequest, res: Response) {
  try {
    await updateContentItem(req.params.id, req.body, false);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id — full replace
// ─────────────────────────────────────────────────────────────────────────────

export async function putContentHandler(req: AuthedRequest, res: Response) {
  try {
    await updateContentItem(req.params.id, req.body, true);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteContentHandler(req: AuthedRequest, res: Response) {
  const deletedId = await deleteContentItem(req.params.id);
  if (!deletedId) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true, id: deletedId });
}