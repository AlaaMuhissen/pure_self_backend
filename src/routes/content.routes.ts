// src/routes/content.routes.ts
import { Router, Response } from "express";
import { z } from "zod";
import { pool, supabase } from "../db/supabase";
import { PoolClient } from "pg";
import multer from "multer";
import { canAccessContent } from "../controllers/content-access.controller";
import { AuthedRequest, clerkAuth } from "../middleware/clerkAuth.middleware";
import { optionalClerkAuth } from "../middleware/optional auth.middleware";


const router = Router();

const ContentType = z.enum(["video", "book", "article", "session"]);

const baseItemSchema = z.object({
  type: ContentType,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().default("JD").optional(),
  is_free: z.boolean().default(false).optional(),
  preview_body: z.string().nullable().optional(),
  content_body: z.string().nullable().optional(),
  is_published: z.boolean().default(true).optional(),
});

const videoDetailsSchema = z.object({
  video_url: z.string().url(),
  video_seconds: z.number().int().nullable().optional(),
  provider: z.string().nullable().optional(),
});

const bookDetailsSchema = z.object({
  pdf_url: z.string().url().nullable().optional(),
  pages: z.number().int().nullable().optional(),
  isbn: z.string().nullable().optional(),
});

const articleDetailsSchema = z.object({
  source_url: z.string().url().nullable().optional(),
  reading_minutes: z.number().int().nullable().optional(),
  author: z.string().nullable().optional(),
  pdf_url: z.string().url().nullable().optional(),
});

const sessionDetailsSchema = z.object({
  therapist_id: z.string().uuid().nullable().optional(),
  session_minutes: z.number().int().nullable().optional(),
  meeting_type: z.enum(["zoom", "in_person"]).nullable().optional(),
});

const createSchema = z.object({
  item: baseItemSchema,
  details: z
    .union([videoDetailsSchema, bookDetailsSchema, articleDetailsSchema, sessionDetailsSchema])
    .optional(),
});

const patchSchema = z.object({
  item: baseItemSchema.partial().optional(),
  details: z
    .union([
      videoDetailsSchema.partial(),
      bookDetailsSchema.partial(),
      articleDetailsSchema.partial(),
      sessionDetailsSchema.partial(),
    ])
    .optional(),
});

type ContentRow = {
  id: string;
  type: "video" | "book" | "article" | "session";
  title: string;
  description: string | null;
  image_url: string | null;
  price: string | null;
  currency: string;
  is_free: boolean;
  preview_body: string | null;
  content_body: string | null;
  is_published: boolean;
  created_at: string;
};

async function updateContent(id: string, body: any, isFullReplace: boolean) {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid payload");

  const patch = parsed.data;

  const currentRes = await pool.query<ContentRow>(
    `SELECT * FROM public.content_items WHERE id = $1`,
    [id]
  );

  if (currentRes.rowCount === 0) throw new Error("Not found");

  const current = currentRes.rows[0];

  return withTx(async (c) => {
    if (patch.item?.type && patch.item.type !== current.type)
      throw new Error("Changing type not supported");

    if (isFullReplace && !patch.item?.title)
      throw new Error("PUT requires full item data (title missing)");

    if (patch.item) {
      const item = patch.item;
      await c.query(
        `UPDATE public.content_items
         SET
           title        = COALESCE($2, title),
           description  = COALESCE($3, description),
           image_url    = COALESCE($4, image_url),
           price        = COALESCE($5, price),
           currency     = COALESCE($6, currency),
           is_free      = COALESCE($7, is_free),
           preview_body = COALESCE($8, preview_body),
           content_body = COALESCE($9, content_body),
           is_published = COALESCE($10, is_published)
         WHERE id = $1`,
        [
          id,
          item.title ?? null,
          item.description ?? null,
          item.image_url ?? null,
          item.price ?? null,
          item.currency ?? null,
          item.is_free ?? null,
          item.preview_body ?? null,
          item.content_body ?? null,
          item.is_published ?? null,
        ]
      );
    }

    return true;
  });
}

function detailsTable(type: ContentRow["type"]) {
  switch (type) {
    case "video":   return { table: "public.content_video_details",   pk: "content_id" };
    case "book":    return { table: "public.content_book_details",    pk: "content_id" };
    case "article": return { table: "public.content_article_details", pk: "content_id" };
    case "session": return { table: "public.content_session_details", pk: "content_id" };
  }
}

async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf")
      return cb(new Error("Only PDF files are allowed"));
    cb(null, true);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// STATIC / COLLECTION ROUTES  (must come before /:id)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /content
 */
router.get("/", async (req, res) => {
  try {
    const type      = req.query.type      ? String(req.query.type)      : undefined;
    const published = req.query.published ? String(req.query.published) : undefined;
    const freeOnly  = req.query.freeOnly  ? String(req.query.freeOnly)  : undefined;
    const q         = req.query.q         ? String(req.query.q)         : undefined;

    const rawLimit  = Number(req.query.limit  ?? 20);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit     = Number.isFinite(rawLimit)  ? Math.min(Math.max(rawLimit,  1), 100) : 20;
    const offset    = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0)               : 0;

    const allowedTypes = new Set(["video", "book", "article", "session"]);
    if (type && !allowedTypes.has(type))
      return res.status(400).json({ error: "Invalid type" });

    const where: string[]  = [];
    const params: unknown[] = [];

    if (type) {
      where.push(`type = $${params.length + 1}`);
      params.push(type);
    }
    if (published !== undefined) {
      where.push(`is_published = $${params.length + 1}`);
      params.push(published === "true");
    }
    if (freeOnly === "true") {
      where.push(`(is_free = true OR COALESCE(price, 0) = 0)`);
    }
    if (q) {
      where.push(`(title ILIKE $${params.length + 1} OR COALESCE(description,'') ILIKE $${params.length + 1})`);
      params.push(`%${q}%`);
    }

    const sql = `
      SELECT * FROM public.content_items
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);
    return res.json({ success: true, data: rows, limit, offset });
  } catch (e: any) {
    console.error("PG ERROR:", e);
    return res.status(500).json({
      success: false,
      error: "DB connection failed",
      details: e?.errors?.map((x: any) => x?.message) ?? e?.message,
    });
  }
});

/**
 * POST /content
 */
router.post("/", upload.single("pdf"), async (req, res) => {
  try {
    const body = {
      item:    JSON.parse(req.body.item),
      details: req.body.details ? JSON.parse(req.body.details) : undefined,
    };

    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { item, details } = parsed.data;
    let uploadedPdfUrl: string | null = null;

    if ((item.type === "book" || item.type === "article") && req.file) {
      const fileName = `${item.type}s/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("content-files")
        .upload(fileName, req.file.buffer, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("content-files").getPublicUrl(fileName);
      uploadedPdfUrl = data.publicUrl;
    }

    const created = await withTx(async (c) => {
      const insertItem = await c.query<ContentRow>(
        `INSERT INTO public.content_items
           (type,title,description,image_url,price,currency,is_free,preview_body,content_body,is_published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          item.type, item.title, item.description ?? null, item.image_url ?? null,
          item.price ?? null, item.currency ?? "SAR", item.is_free ?? false,
          item.preview_body ?? null, item.content_body ?? null, item.is_published ?? true,
        ]
      );

      const newItem = insertItem.rows[0];

      if (details) {
        const { table } = detailsTable(newItem.type);

        if (newItem.type === "video") {
          const d = videoDetailsSchema.parse(details);
          await c.query(
            `INSERT INTO ${table} (content_id,video_url,video_seconds,provider) VALUES ($1,$2,$3,$4)`,
            [newItem.id, d.video_url, d.video_seconds ?? null, d.provider ?? null]
          );
        }
        if (newItem.type === "book") {
          const d = bookDetailsSchema.parse(details);
          await c.query(
            `INSERT INTO ${table} (content_id,pdf_url,pages,isbn) VALUES ($1,$2,$3,$4)`,
            [newItem.id, uploadedPdfUrl ?? d.pdf_url ?? null, d.pages ?? null, d.isbn ?? null]
          );
        }
        if (newItem.type === "article") {
          const d = articleDetailsSchema.parse(details);
          await c.query(
            `INSERT INTO ${table} (content_id,source_url,reading_minutes,author,pdf_url) VALUES ($1,$2,$3,$4,$5)`,
            [newItem.id, d.source_url ?? null, d.reading_minutes ?? null, d.author ?? null, uploadedPdfUrl]
          );
        }
        if (newItem.type === "session") {
          const d = sessionDetailsSchema.parse(details);
          await c.query(
            `INSERT INTO ${table} (content_id,therapist_id,session_minutes,meeting_type) VALUES ($1,$2,$3,$4)`,
            [newItem.id, d.therapist_id ?? null, d.session_minutes ?? null, d.meeting_type ?? null]
          );
        }
      }

      return newItem;
    });

    res.status(201).json({ item: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create content" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS ROUTES  (/:id/reviews* — must come before plain /:id handlers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /:id/reviews
 */
router.get("/:id/reviews", async (req, res) => {
  const { id } = req.params;
  const limit  = Math.min(Number(req.query.limit)  || 20, 50);
  const offset = Number(req.query.offset) || 0;

  const [reviews, stats] = await Promise.all([
    supabase
      .from("content_reviews")
      .select("id, user_id, internal_user_id, display_name, rating, comment, created_at, updated_at")
      .eq("content_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("content_review_stats")
      .select("avg_rating, review_count")
      .eq("content_id", id)
      .single(),
  ]);

  return res.json({
    reviews: reviews.data ?? [],
    stats:   stats.data  ?? { avg_rating: null, review_count: 0 },
  });
});

/**
 * POST /:id/reviews
 * Only users who have access to the content can review it.
 */
router.post("/:id/reviews", clerkAuth, async (req: AuthedRequest, res) => {
  const { id }                            = req.params;
  const clerkUserId                       = req.auth!.clerkUserId;
  const { rating, comment, display_name } = req.body;

  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: "rating must be 1-5" });

  // Resolve internal user from Clerk ID
  const userRes = await pool.query(
    `SELECT id, role, subscription_active FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  const appUser = userRes.rows[0];
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  // Check content exists and if it is free
  const contentRes = await pool.query(
    `SELECT id, is_free, price FROM public.content_items WHERE id = $1`,
    [id]
  );
  if (contentRes.rowCount === 0) return res.status(404).json({ error: "Content not found" });
  const content = contentRes.rows[0];

  const isFree   = content.is_free || Number(content.price ?? 1) === 0;
  const isAdmin  = appUser.role === "admin";
  const isSubbed = Boolean(appUser.subscription_active);

  // Check individual purchase
  const purchaseRes = await pool.query(
    `SELECT 1 FROM public.user_content_purchases WHERE user_id = $1 AND content_id = $2 LIMIT 1`,
    [appUser.id, id]
  );
  const hasPurchase = (purchaseRes.rowCount ?? 0) > 0;

  if (!isFree && !isAdmin && !isSubbed && !hasPurchase)
    return res.status(403).json({ error: "You must have access to this content before reviewing it" });

  const { data, error } = await supabase
    .from("content_reviews")
    .insert({
      content_id:       id,
      user_id:          clerkUserId,  // kept for existing rows
      internal_user_id: appUser.id,   // internal uuid used for frontend matching
      rating,
      comment,
      display_name,
    })
    .select()
    .single();

  if (error?.code === "23505")
    return res.status(409).json({ error: "already_reviewed" });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ review: data });
});

/**
 * PUT /:id/reviews/mine
 */
router.put("/:id/reviews/mine", clerkAuth, async (req: AuthedRequest, res) => {
  const { id }              = req.params;
  const clerkUserId         = req.auth!.clerkUserId;
  const { rating, comment } = req.body;

  if (rating && (rating < 1 || rating > 5))
    return res.status(400).json({ error: "rating must be 1-5" });

  // Resolve internal user id
  const userRes = await pool.query(
    `SELECT id FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  const appUser = userRes.rows[0];
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  const { data, error } = await supabase
    .from("content_reviews")
    .update({ rating, comment })
    .eq("content_id", id)
    .eq("internal_user_id", appUser.id)
    .select()
    .single();

  if (!data)  return res.status(404).json({ error: "review not found" });
  if (error)  return res.status(500).json({ error: error.message });

  return res.json({ review: data });
});

/**
 * DELETE /:id/reviews/mine
 */
router.delete("/:id/reviews/mine", clerkAuth, async (req: AuthedRequest, res) => {
  const { id }      = req.params;
  const clerkUserId = req.auth!.clerkUserId;

  // Resolve internal user id
  const userRes = await pool.query(
    `SELECT id FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  const appUser = userRes.rows[0];
  if (!appUser) return res.status(403).json({ error: "User not registered" });

  const { error } = await supabase
    .from("content_reviews")
    .delete()
    .eq("content_id", id)
    .eq("internal_user_id", appUser.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

/**
 * DELETE /:id/reviews/:reviewId  — admin only, delete any review by its id
 */
router.delete("/:id/reviews/:reviewId", clerkAuth, async (req: AuthedRequest, res) => {
  const { id, reviewId } = req.params;
  const clerkUserId      = req.auth!.clerkUserId;
 
  // Verify caller is admin
  const userRes = await pool.query(
    `SELECT id, role FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  const caller = userRes.rows[0];
  if (!caller || caller.role !== "admin")
    return res.status(403).json({ error: "Admins only" });
 
  const { error } = await supabase
    .from("content_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("content_id", id);
 
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});
// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC /:id ROUTES  (last, so they don't shadow the routes above)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /:id
 */
router.get("/:id", optionalClerkAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const contentId = req.params.id;

    const itemRes = await pool.query<ContentRow>(
      `SELECT * FROM public.content_items WHERE id = $1`,
      [contentId]
    );

    if (itemRes.rowCount === 0)
      return res.status(404).json({ success: false, error: "Not found" });

    const item = itemRes.rows[0];

    const preview = {
      id: item.id, type: item.type, title: item.title,
      description: item.description, image_url: item.image_url,
      price: item.price, currency: item.currency, is_free: item.is_free,
      preview_body: item.preview_body,
    };

    const clerkUserId = req.auth?.clerkUserId;

    if (!clerkUserId)
      return res.status(200).json({ success: true, access: false, reason: "unauthenticated", item: preview });

    const userRes = await pool.query(
      `SELECT id, subscription_active FROM public.users WHERE clerk_user_id = $1 LIMIT 1`,
      [clerkUserId]
    );

    const appUser = userRes.rows[0];

    if (!appUser)
      return res.status(200).json({ success: true, access: false, reason: "user_not_registered", item: preview });

    const hasAccess = await canAccessContent(appUser.id, contentId);

    if (!hasAccess)
      return res.status(200).json({ success: true, access: false, reason: "no_access", item: preview });

    const { table } = detailsTable(item.type);
    const detailsRes = await pool.query(`SELECT * FROM ${table} WHERE content_id = $1`, [contentId]);

    return res.status(200).json({ success: true, access: true, item, details: detailsRes.rows[0] ?? null });
  } catch (e: any) {
    console.error("GET CONTENT DETAILS ERROR:", e);
    return res.status(500).json({ success: false, error: "Failed to load content", details: e?.message });
  }
});

/**
 * PATCH /:id
 */
router.patch("/:id", async (req, res) => {
  try {
    await updateContent(req.params.id, req.body, false);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * PUT /:id
 */
router.put("/:id", async (req, res) => {
  try {
    await updateContent(req.params.id, req.body, true);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE /:id
 */
router.delete("/:id", async (req, res) => {
  const id  = req.params.id;
  const del = await pool.query(`DELETE FROM public.content_items WHERE id = $1 RETURNING id`, [id]);
  if (del.rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, id });
});

export default router;