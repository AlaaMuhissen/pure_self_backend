import { Router }                 from "express";
import { requireAuth, getAuth }   from "@clerk/express";
import { z }                      from "zod";
import { pool, supabase }         from "../db/supabase";
import { assertAdminByClerkId }   from "../guard/admin.guard";
import multer                     from "multer";
import crypto                     from "crypto";

export const adminContentRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Multer — memory storage, accepts PDF and image files
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", ...ALLOWED_IMAGE_TYPES];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/**
 * Used on POST and PATCH so both routes accept:
 *   - "pdf"   field  (book / article PDF)
 *   - "image" field  (cover image — replaces image_url string)
 */
const uploadFields = upload.fields([
  { name: "pdf",   maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a buffer to Supabase Storage and returns the public URL.
 *
 * @param buffer    raw bytes from multer
 * @param mimeType  file MIME type (e.g. "image/jpeg", "application/pdf")
 * @param folder    sub-folder inside the bucket  (e.g. "images", "books")
 * @param bucket    Supabase bucket name (default "content-files")
 */
async function uploadToSupabase(
  buffer:   Buffer,
  mimeType: string,
  folder:   string,
  bucket    = "content-files",
): Promise<string> {
  const ext      = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  const filePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, { contentType: mimeType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// File extraction helper
// multer.fields() puts files in req.files as { pdf: [...], image: [...] }
// ─────────────────────────────────────────────────────────────────────────────

function extractFiles(req: any): {
  pdfFile?:   Express.Multer.File;
  imageFile?: Express.Multer.File;
} {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    pdfFile:   files?.pdf?.[0],
    imageFile: files?.image?.[0],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Body parser helper
// Supports JSON body (PATCH without files) and FormData body (POST / PATCH
// with files). When FormData is used, "item" and "details" are JSON strings.
// ─────────────────────────────────────────────────────────────────────────────

function parseBody(req: any): Record<string, unknown> {
  if (typeof req.body.item === "string") {
    const item    = JSON.parse(req.body.item);
    const details = req.body.details ? JSON.parse(req.body.details) : {};
    return { ...item, ...details };
  }
  return req.body;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

const ContentType = z.enum(["video", "book", "article", "session"]);

const BaseCreateSchema = z.object({
  type:         ContentType,
  title:        z.string().min(1),
  description:  z.string().optional().nullable(),
  image_url:    z.string().url().optional().nullable(),
  price:        z.number().min(0).optional().nullable(),
  currency:     z.string().min(1).optional().nullable().default("SAR"),
  is_free:      z.boolean().default(false),
  preview_body: z.string().optional().nullable(),
  content_body: z.string().optional().nullable(),
  is_published: z.boolean().default(true),
});

const DetailsCreateSchema = z.object({
  video_url:       z.string().url().optional().nullable(),
  video_seconds:   z.number().int().min(0).optional().nullable(),
  provider:        z.string().optional().nullable(),
  source_url:      z.string().url().optional().nullable(),
  reading_minutes: z.number().int().min(0).optional().nullable(),
  author:          z.string().optional().nullable(),
  therapist_id:    z.string().uuid().optional().nullable(),
  session_minutes: z.number().int().min(0).optional().nullable(),
  meeting_type:    z.string().optional().nullable(),
});

const CreateSchema = BaseCreateSchema.merge(DetailsCreateSchema);

const PatchSchema = z
  .object({
    title:        z.string().min(1).optional(),
    description:  z.string().optional().nullable(),
    image_url:    z.string().url().optional().nullable(),
    price:        z.number().min(0).optional().nullable(),
    currency:     z.string().min(1).optional().nullable(),
    is_free:      z.boolean().optional(),
    preview_body: z.string().optional().nullable(),
    content_body: z.string().optional().nullable(),
    is_published: z.boolean().optional(),
  })
  .merge(DetailsCreateSchema.partial());

const PutSchema = BaseCreateSchema.merge(DetailsCreateSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function adminAuthOrThrow(req: any): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

async function getContentRow(client: any, contentId: string) {
  const { rows } = await client.query(
    `select id, type, title, description, image_url,
            price, currency, is_free,
            preview_body, content_body,
            is_published, created_at
     from public.content_items
     where id = $1 limit 1;`,
    [contentId],
  );
  return rows[0] ?? null;
}

async function getDetailsRow(client: any, type: string, contentId: string) {
  if (type === "video") {
    const { rows } = await client.query(
      `select content_id, video_url, video_seconds, provider
       from public.content_video_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }
  if (type === "article") {
    const { rows } = await client.query(
      `select content_id, source_url, reading_minutes, author
       from public.content_article_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }
  if (type === "session") {
    const { rows } = await client.query(
      `select content_id, therapist_id, session_minutes, meeting_type
       from public.content_session_details where content_id=$1 limit 1;`,
      [contentId],
    );
    return rows[0] ?? null;
  }
  return null; // book has no separate details table
}

async function ensureDetailsRow(client: any, type: string, contentId: string) {
  if (type === "video") {
    await client.query(
      `insert into public.content_video_details (content_id, video_url, video_seconds, provider)
       values ($1, '', null, null) on conflict (content_id) do nothing;`,
      [contentId],
    );
  } else if (type === "article") {
    await client.query(
      `insert into public.content_article_details (content_id, source_url, reading_minutes, author)
       values ($1, null, null, null) on conflict (content_id) do nothing;`,
      [contentId],
    );
  } else if (type === "session") {
    await client.query(
      `insert into public.content_session_details (content_id, therapist_id, session_minutes, meeting_type)
       values ($1, null, 60, 'zoom') on conflict (content_id) do nothing;`,
      [contentId],
    );
  }
}

/**
 * updateDetails — updates type-specific detail tables for a content item.
 *
 * pdfUrl is optional: when a new PDF was uploaded it is a string (overwrites);
 * when no new PDF was sent it is null (coalesce keeps the existing DB value).
 */
async function updateDetails(
  client: any,
  type: string,
  contentId: string,
  patch: any,
  pdfUrl?: string | null,
) {
  if (type === "video") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      `update public.content_video_details
       set video_url     = coalesce($2, video_url),
           video_seconds = coalesce($3, video_seconds),
           provider      = coalesce($4, provider)
       where content_id = $1;`,
      [
        contentId,
        patch.video_url?.trim() || null,
        typeof patch.video_seconds !== "undefined" ? patch.video_seconds : null,
        patch.provider ?? null,
      ],
    );
  }
  if (type === "article") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      // pdf_url: new upload → pdfUrl is a string (overwrites via coalesce)
      //          no new file → pdfUrl is null (coalesce keeps existing value)
      `update public.content_article_details
       set source_url      = coalesce($2, source_url),
           reading_minutes = coalesce($3, reading_minutes),
           author          = coalesce($4, author),
           pdf_url         = coalesce($5, pdf_url)
       where content_id = $1;`,
      [
        contentId,
        patch.source_url      ?? null,
        typeof patch.reading_minutes !== "undefined" ? patch.reading_minutes : null,
        patch.author          ?? null,
        pdfUrl                ?? null,
      ],
    );
  }
  if (type === "book") {
    await client.query(
      `update public.content_book_details
       set pdf_url = coalesce($2, pdf_url),
           pages   = coalesce($3, pages),
           isbn    = coalesce($4, isbn)
       where content_id = $1;`,
      [
        contentId,
        pdfUrl             ?? null,
        patch.pages        ?? null,
        patch.isbn?.trim() || null,
      ],
    );
  }
  if (type === "session") {
    await ensureDetailsRow(client, type, contentId);
    await client.query(
      `update public.content_session_details
       set therapist_id    = coalesce($2, therapist_id),
           session_minutes = coalesce($3, session_minutes),
           meeting_type    = coalesce($4, meeting_type)
       where content_id = $1;`,
      [
        contentId,
        patch.therapist_id    ?? null,
        typeof patch.session_minutes !== "undefined" ? patch.session_minutes : null,
        patch.meeting_type    ?? null,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/content
 */
adminContentRouter.get("/content", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await assertAdminByClerkId(userId);

    const { rows } = await pool.query(
      `select id, type, title, description, image_url,
              price, is_free, is_published, created_at
       from public.content_items
       order by created_at desc;`,
    );
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * GET /admin/content/:id  (includes type-specific details)
 */
adminContentRouter.get("/content/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = adminAuthOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const contentId = z.string().uuid().parse(req.params.id);
    const base      = await getContentRow(client, contentId);
    if (!base) return res.status(404).json({ error: "Not found" });

    const details = await getDetailsRow(client, base.type, contentId);
    return res.json({ ok: true, item: { ...base, details } });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/content
 *
 * Accepts multipart/form-data with:
 *   item    — JSON string (base content fields)
 *   details — JSON string (type-specific fields)
 *   image   — file (optional) — uploaded to Supabase, overwrites image_url
 *   pdf     — file (optional, book/article only) — uploaded to Supabase
 */
adminContentRouter.post(
  "/content",
  requireAuth(),
  uploadFields,         // ← replaced upload.single("pdf")
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await assertAdminByClerkId(userId);

      // Parse body — supports both FormData (item/details strings) and JSON
      const Body = CreateSchema.extend({
        price:           z.coerce.number().optional().nullable(),
        is_free:         z.coerce.boolean().default(false),
        is_published:    z.coerce.boolean().default(true),
        video_seconds:   z.coerce.number().int().min(0).optional().nullable(),
        reading_minutes: z.coerce.number().int().min(0).optional().nullable(),
        pages:           z.coerce.number().int().min(0).optional().nullable(),
        session_minutes: z.coerce.number().int().min(0).optional().nullable(),
        pdf_url:         z.string().url().optional().nullable(),
        pages2:          z.coerce.number().int().min(0).optional().nullable(),
        isbn:            z.string().optional().nullable(),
      });

      const b = Body.parse(parseBody(req));
      const { pdfFile, imageFile } = extractFiles(req);

      // Upload cover image — file always wins over a pasted URL
      let imageUrl: string | null = b.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadToSupabase(
          imageFile.buffer,
          imageFile.mimetype,
          "images",
        );
      }

      // Upload PDF for book / article
      let pdfUrl: string | null = (b as any).pdf_url ?? null;
      if ((b.type === "book" || b.type === "article") && pdfFile) {
        pdfUrl = await uploadToSupabase(
          pdfFile.buffer,
          pdfFile.mimetype,
          `${b.type}s`,
        );
      }

      await client.query("begin");

      const { rows: itemRows } = await client.query(
        `insert into public.content_items
           (type, title, description, image_url,
            price, currency, is_free,
            preview_body, content_body, is_published)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id;`,
        [
          b.type,
          b.title,
          b.description   ?? null,
          imageUrl,                   // ← Supabase URL or null
          b.price         ?? null,
          b.currency      ?? "SAR",
          b.is_free,
          b.preview_body  ?? null,
          b.content_body  ?? null,
          b.is_published,
        ],
      );

      const contentId = itemRows[0].id as string;

      if (b.type === "video") {
        await client.query(
          `insert into public.content_video_details
             (content_id, video_url, video_seconds, provider)
           values ($1,$2,$3,$4);`,
          [contentId, b.video_url ?? null, b.video_seconds ?? null, b.provider ?? null],
        );
      }

      if (b.type === "article") {
        await client.query(
          `insert into public.content_article_details
             (content_id, source_url, reading_minutes, author, pdf_url)
           values ($1,$2,$3,$4,$5);`,
          [contentId, b.source_url ?? null, b.reading_minutes ?? null, b.author ?? null, pdfUrl],
        );
      }

      if (b.type === "book") {
        await client.query(
          `insert into public.content_book_details
             (content_id, pdf_url, pages, isbn)
           values ($1,$2,$3,$4);`,
          [contentId, pdfUrl, (b as any).pages ?? null, (b as any).isbn ?? null],
        );
      }

      if (b.type === "session") {
        await client.query(
          `insert into public.content_session_details
             (content_id, therapist_id, session_minutes, meeting_type)
           values ($1,$2,$3,$4);`,
          [contentId, b.therapist_id ?? null, b.session_minutes ?? 60, b.meeting_type ?? "zoom"],
        );
      }

      await client.query("commit");
      return res.json({ ok: true, contentId, image_url: imageUrl, pdf_url: pdfUrl });
    } catch (e: any) {
      await client.query("rollback").catch(() => {});
      console.error("CREATE CONTENT ERROR:", e);
      const msg    = e?.message ?? "Bad request";
      const status = msg === "Forbidden" ? 403 : 400;
      return res.status(status).json({ error: msg });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /admin/content/:id
 *
 * Partial update. Type cannot be changed.
 *
 * Now accepts multipart/form-data OR plain JSON:
 *   - JSON only  → no files, update text fields
 *   - FormData   → may include "image" file to replace cover image
 *
 * When an "image" file is present it is uploaded to Supabase and its
 * public URL overwrites the existing image_url — no other changes required.
 */
adminContentRouter.patch(
  "/content/:id",
  requireAuth(),
  uploadFields,         // ← added (was missing — PATCH previously JSON only)
  async (req, res) => {
    const client = await pool.connect();
    try {
      const clerkId = adminAuthOrThrow(req);
      await assertAdminByClerkId(clerkId);

      const contentId = z.string().uuid().parse(req.params.id);

      // parseBody handles both JSON and FormData gracefully
      const patch = PatchSchema.parse(parseBody(req));

      const { imageFile, pdfFile } = extractFiles(req);

      const current = await getContentRow(client, contentId);
      if (!current) return res.status(404).json({ error: "Not found" });

      // Upload new cover image if one was attached
      let imageUrl: string | null | undefined = patch.image_url;
      if (imageFile) {
        imageUrl = await uploadToSupabase(
          imageFile.buffer,
          imageFile.mimetype,
          "images",
        );
      }

      // Upload new PDF if one was attached (book / article only)
      let pdfUrl: string | null = null;
      if ((current.type === "book" || current.type === "article") && pdfFile) {
        pdfUrl = await uploadToSupabase(
          pdfFile.buffer,
          pdfFile.mimetype,
          `${current.type}s`,
        );
      }

      const normalizedPrice =
        patch.is_free === true         ? 0
        : typeof patch.price !== "undefined" ? patch.price
        : null;

      await client.query("begin");

      await client.query(
        `update public.content_items
         set title        = coalesce($2,  title),
             description  = coalesce($3,  description),
             image_url    = coalesce($4,  image_url),
             price        = coalesce($5,  price),
             currency     = coalesce($6,  currency),
             is_free      = coalesce($7,  is_free),
             preview_body = coalesce($8,  preview_body),
             content_body = coalesce($9,  content_body),
             is_published = coalesce($10, is_published)
         where id = $1;`,
        [
          contentId,
          patch.title        ?? null,
          patch.description  ?? null,
          imageUrl           ?? null,
          normalizedPrice,
          patch.currency     ?? null,
          typeof patch.is_free      === "boolean" ? patch.is_free      : null,
          patch.preview_body ?? null,
          patch.content_body ?? null,
          typeof patch.is_published === "boolean" ? patch.is_published : null,
        ],
      );

      if (patch.is_free === true) {
        await client.query(
          `update public.content_items set price = 0 where id = $1;`,
          [contentId],
        );
      }

      await updateDetails(client, current.type, contentId, patch, pdfUrl);
      await client.query("commit");

      const updated = await getContentRow(client, contentId);
      const details = await getDetailsRow(client, current.type, contentId);
      return res.json({ ok: true, item: { ...updated, details } });
    } catch (e: any) {
      await client.query("rollback").catch(() => {});
      const msg    = e?.message ?? "Bad request";
      const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
      return res.status(status).json({ error: msg });
    } finally {
      client.release();
    }
  },
);

/**
 * PUT /admin/content/:id
 *
 * Full replace. Also updated to accept an image file via FormData.
 */
adminContentRouter.put(
  "/content/:id",
  requireAuth(),
  uploadFields,         // ← added for consistency
  async (req, res) => {
    const client = await pool.connect();
    try {
      const clerkId = adminAuthOrThrow(req);
      await assertAdminByClerkId(clerkId);

      const contentId = z.string().uuid().parse(req.params.id);
      const body      = PutSchema.parse(parseBody(req));

      const { imageFile } = extractFiles(req);

      const current = await getContentRow(client, contentId);
      if (!current) return res.status(404).json({ error: "Not found" });

      if (body.type !== current.type) {
        return res.status(400).json({ error: "Changing content type is not supported via PUT" });
      }

      // Upload new image if provided
      let imageUrl: string | null = body.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadToSupabase(
          imageFile.buffer,
          imageFile.mimetype,
          "images",
        );
      }

      const normalizedPrice    = body.is_free ? 0 : (body.price ?? null);
      const normalizedCurrency = body.currency ?? "SAR";

      await client.query("begin");

      await client.query(
        `update public.content_items
         set type=$2, title=$3, description=$4, image_url=$5,
             price=$6, currency=$7, is_free=$8,
             preview_body=$9, content_body=$10, is_published=$11
         where id=$1;`,
        [
          contentId,
          body.type,
          body.title,
          body.description  ?? null,
          imageUrl,
          normalizedPrice,
          normalizedCurrency,
          body.is_free,
          body.preview_body ?? null,
          body.content_body ?? null,
          body.is_published,
        ],
      );

      if (body.type === "video") {
        await ensureDetailsRow(client, body.type, contentId);
        await client.query(
          `update public.content_video_details
           set video_url     = case when $2::text is not null then $2 else video_url end,
               video_seconds = case when $3::int  is not null then $3 else video_seconds end,
               provider      = case when $4::text is not null then $4 else provider end
           where content_id = $1;`,
          [
            contentId,
            typeof body.video_url     !== "undefined" ? body.video_url     : null,
            typeof body.video_seconds !== "undefined" ? body.video_seconds : null,
            typeof body.provider      !== "undefined" ? body.provider      : null,
          ],
        );
      } else if (body.type === "article") {
        await ensureDetailsRow(client, body.type, contentId);
        await client.query(
          `update public.content_article_details
           set source_url=$2, reading_minutes=$3, author=$4
           where content_id=$1;`,
          [contentId, body.source_url ?? null, body.reading_minutes ?? null, body.author ?? null],
        );
      } else if (body.type === "session") {
        await ensureDetailsRow(client, body.type, contentId);
        await client.query(
          `update public.content_session_details
           set therapist_id=$2, session_minutes=$3, meeting_type=$4
           where content_id=$1;`,
          [contentId, body.therapist_id ?? null, body.session_minutes ?? 60, body.meeting_type ?? "zoom"],
        );
      }

      await client.query("commit");

      const updated = await getContentRow(client, contentId);
      const details = await getDetailsRow(client, body.type, contentId);
      return res.json({ ok: true, item: { ...updated, details } });
    } catch (e: any) {
      await client.query("rollback").catch(() => {});
      const msg    = e?.message ?? "Bad request";
      const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
      return res.status(status).json({ error: msg });
    } finally {
      client.release();
    }
  },
);

/**
 * DELETE /admin/content/:id
 * Relies on ON DELETE CASCADE for detail rows.
 */
adminContentRouter.delete("/content/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await assertAdminByClerkId(userId);

    const contentId = z.string().uuid().parse(req.params.id);
    await pool.query(`delete from public.content_items where id = $1;`, [contentId]);
    return res.json({ ok: true });
  } catch (e: any) {
    const msg    = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
});