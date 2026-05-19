import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { pool, supabase } from "../db/supabase";
import { assertAdminByClerkId } from "../guard/admin.guard";
import multer from "multer";
import crypto from "crypto";


export const adminContentRouter = Router();

// ---------- Schemas ----------
const ContentType = z.enum(["video", "book", "article", "session"]);

const BaseCreateSchema = z.object({
  type: ContentType,
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),

  // new fields from your table
  price: z.number().min(0).optional().nullable(),
  currency: z.string().min(1).optional().nullable().default("SAR"),

  is_free: z.boolean().default(false),

  preview_body: z.string().optional().nullable(),
  content_body: z.string().optional().nullable(),

  is_published: z.boolean().default(true),
});


const DetailsCreateSchema = z.object({
  // video
  video_url: z.string().url().optional().nullable(),
  video_seconds: z.number().int().min(0).optional().nullable(),
  provider: z.string().optional().nullable(),

  // article
  source_url: z.string().url().optional().nullable(),
  reading_minutes: z.number().int().min(0).optional().nullable(),
  author: z.string().optional().nullable(),

  // session
  therapist_id: z.string().uuid().optional().nullable(),
  session_minutes: z.number().int().min(0).optional().nullable(),
  meeting_type: z.string().optional().nullable(),
});

const CreateSchema = BaseCreateSchema.merge(DetailsCreateSchema);


const PatchSchema = z
  .object({
    // ❗️do NOT allow changing type in PATCH (unless you implement type migration)
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    image_url: z.string().url().optional().nullable(),

    price: z.number().min(0).optional().nullable(),
    currency: z.string().min(1).optional().nullable(),

    is_free: z.boolean().optional(),

    preview_body: z.string().optional().nullable(),
    content_body: z.string().optional().nullable(),

    is_published: z.boolean().optional(),
  })
  .merge(DetailsCreateSchema.partial()); // keep your details schemas as before

const PutSchema = BaseCreateSchema.merge(DetailsCreateSchema);

function adminAuthOrThrow(req: any) {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ---------- Helpers ----------
async function getContentRow(client: any, contentId: string) {
  const q = `
    select
      id, type, title, description, image_url,
      price, currency,
      is_free,
      preview_body, content_body,
      is_published, created_at
    from public.content_items
    where id = $1
    limit 1;
  `;
  const { rows } = await client.query(q, [contentId]);
  return rows[0] ?? null;
}

async function getDetailsRow(client: any, type: string, contentId: string) {
  if (type === "video") {
    const { rows } = await client.query(
      `select content_id, video_url, video_seconds, provider from public.content_video_details where content_id=$1 limit 1;`,
      [contentId]
    );
    return rows[0] ?? null;
  }
  if (type === "article") {
    const { rows } = await client.query(
      `select content_id, source_url, reading_minutes, author from public.content_article_details where content_id=$1 limit 1;`,
      [contentId]
    );
    return rows[0] ?? null;
  }
  if (type === "session") {
    const { rows } = await client.query(
      `select content_id, therapist_id, session_minutes, meeting_type from public.content_session_details where content_id=$1 limit 1;`,
      [contentId]
    );
    return rows[0] ?? null;
  }
  // book: no details table in your schema snippet
  return null;
}

async function ensureDetailsRow(client: any, type: string, contentId: string) {
  // creates an empty detail row if not exists (for update safety)
  if (type === "video") {
    await client.query(
      `
      insert into public.content_video_details
        (content_id, video_url, video_seconds, provider)
      values
        ($1, '', null, null)
      on conflict (content_id) do nothing;
      `,
      [contentId]
    );
  } else if (type === "article") {
    await client.query(
      `insert into public.content_article_details (content_id, source_url, reading_minutes, author)
       values ($1, null, null, null)
       on conflict (content_id) do nothing;`,
      [contentId]
    );
  } else if (type === "session") {
    await client.query(
      `insert into public.content_session_details (content_id, therapist_id, session_minutes, meeting_type)
       values ($1, null, 60, 'zoom')
       on conflict (content_id) do nothing;`,
      [contentId]
    );
  }
}

async function updateDetails(client: any, type: string, contentId: string, patch: any) {
  if (type === "video") {
    await ensureDetailsRow(client, type, contentId);

    await client.query(
      `
      update public.content_video_details
      set
        video_url = coalesce($2, video_url),
        video_seconds = coalesce($3, video_seconds),
        provider = coalesce($4, provider)
      where content_id = $1;
      `,
      [
        contentId,
        patch.video_url?.trim() || null,
        typeof patch.video_seconds !== "undefined" ? patch.video_seconds : null,
        patch.provider ?? null,
      ]
    );
  }

  if (type === "article") {
    await ensureDetailsRow(client, type, contentId);

    await client.query(
      `
      update public.content_article_details
      set
        source_url = coalesce($2, source_url),
        reading_minutes = coalesce($3, reading_minutes),
        author = coalesce($4, author)
      where content_id = $1;
      `,
      [
        contentId,
        patch.source_url ?? null,
        typeof patch.reading_minutes !== "undefined" ? patch.reading_minutes : null,
        patch.author ?? null,
      ]
    );
  }

  if (type === "session") {
    await ensureDetailsRow(client, type, contentId);

    await client.query(
      `
      update public.content_session_details
      set
        therapist_id = coalesce($2, therapist_id),
        session_minutes = coalesce($3, session_minutes),
        meeting_type = coalesce($4, meeting_type)
      where content_id = $1;
      `,
      [
        contentId,
        patch.therapist_id ?? null,
        typeof patch.session_minutes !== "undefined" ? patch.session_minutes : null,
        patch.meeting_type ?? null,
      ]
    );
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

// ---------- Routes ----------

/**
 * GET /api/content
 */
adminContentRouter.get("/content", requireAuth(), async (req, res) => {
    try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await assertAdminByClerkId(userId);

    const sql = `
      select
        id,
        type,
        title,
        description,
        image_url,
        price,
        is_free,
        is_published,
        created_at
      from public.content_items
      order by created_at desc;
    `;
    const { rows } = await pool.query(sql);
    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
});

/**
 * GET /api/content/:id  (includes details)
 */
adminContentRouter.get("/content/:id", requireAuth(), async (req, res) => {
  try {
    const clerkId = adminAuthOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const contentId = z.string().uuid().parse(req.params.id);

    const client = await pool.connect();
    try {
      const base = await getContentRow(client, contentId);
      if (!base) return res.status(404).json({ error: "Not found" });

      const details = await getDetailsRow(client, base.type, contentId);
      return res.json({ ok: true, item: { ...base, details } });
    } finally {
      client.release();
    }
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
});

adminContentRouter.post(
  "/content",
  requireAuth(),
  upload.single("pdf"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await assertAdminByClerkId(userId);

      const Body = z.object({
        type: z.enum(["video", "book", "article", "session"]),
        title: z.string().min(1),
        description: z.string().min(1).optional().nullable(),
        image_url: z.string().url().optional().nullable(),

        price: z.coerce.number().optional().nullable(),
        currency: z.string().optional().nullable(),

        is_free: z.coerce.boolean().default(false),
        is_published: z.coerce.boolean().default(true),

        preview_body: z.string().optional().nullable(),
        content_body: z.string().optional().nullable(),

        video_url: z.string().url().optional().nullable(),
        video_seconds: z.coerce.number().int().min(0).optional().nullable(),
        provider: z.string().optional().nullable(),

        source_url: z.string().url().optional().nullable(),
        reading_minutes: z.coerce.number().int().min(0).optional().nullable(),
        author: z.string().optional().nullable(),

        pdf_url: z.string().url().optional().nullable(),
        pages: z.coerce.number().int().min(0).optional().nullable(),
        isbn: z.string().optional().nullable(),

        therapist_id: z.string().uuid().optional().nullable(),
        session_minutes: z.coerce.number().int().min(0).optional().nullable(),
        meeting_type: z.string().optional().nullable(),
      });

      let rawBody: any;

      if (typeof req.body.item === "string") {
        const item = JSON.parse(req.body.item);
        const details = req.body.details ? JSON.parse(req.body.details) : {};

        rawBody = {
          ...item,
          ...details,
        };
      } else {
        rawBody = req.body;
      }

      const b = Body.parse(rawBody);

      let pdfUrl: string | null = b.pdf_url ?? null;

      if ((b.type === "book" || b.type === "article") && req.file) {
        const safeName = req.file.originalname.replace(/\s+/g, "-");
        const filePath = `${b.type}s/${Date.now()}-${crypto.randomUUID()}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from("content-files")
          .upload(filePath, req.file.buffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("content-files")
          .getPublicUrl(filePath);

        pdfUrl = data.publicUrl;
      }

      await client.query("begin");

      const insertItem = `
        insert into public.content_items
          (
            type,
            title,
            description,
            image_url,
            price,
            currency,
            is_free,
            preview_body,
            content_body,
            is_published
          )
        values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning id;
      `;

      const { rows: itemRows } = await client.query(insertItem, [
        b.type,
        b.title,
        b.description ?? null,
        b.image_url ?? null,
        b.price ?? null,
        b.currency ?? "SAR",
        b.is_free,
        b.preview_body ?? null,
        b.content_body ?? null,
        b.is_published,
      ]);

      const contentId = itemRows[0].id as string;

      if (b.type === "video") {
        await client.query(
          `
          insert into public.content_video_details
            (content_id, video_url, video_seconds, provider)
          values
            ($1, $2, $3, $4);
          `,
          [
            contentId,
            b.video_url ?? null,
            b.video_seconds ?? null,
            b.provider ?? null,
          ]
        );
      }

      if (b.type === "article") {
        await client.query(
          `
          insert into public.content_article_details
            (content_id, source_url, reading_minutes, author, pdf_url)
          values
            ($1, $2, $3, $4, $5);
          `,
          [
            contentId,
            b.source_url ?? null,
            b.reading_minutes ?? null,
            b.author ?? null,
            pdfUrl,
          ]
        );
      }

      if (b.type === "book") {
        await client.query(
          `
          insert into public.content_book_details
            (content_id, pdf_url, pages, isbn)
          values
            ($1, $2, $3, $4);
          `,
          [
            contentId,
            pdfUrl,
            b.pages ?? null,
            b.isbn ?? null,
          ]
        );
      }

      if (b.type === "session") {
        await client.query(
          `
          insert into public.content_session_details
            (content_id, therapist_id, session_minutes, meeting_type)
          values
            ($1, $2, $3, $4);
          `,
          [
            contentId,
            b.therapist_id ?? null,
            b.session_minutes ?? 60,
            b.meeting_type ?? "zoom",
          ]
        );
      }

      await client.query("commit");

      return res.json({
        ok: true,
        contentId,
        pdf_url: pdfUrl,
      });
    } catch (e: any) {
      await client.query("rollback").catch(() => {});

      console.error("CREATE CONTENT ERROR:", e);

      const msg = e?.message ?? "Bad request";
      const status = msg === "Forbidden" ? 403 : 400;

      return res.status(status).json({ error: msg });
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/content/:id
 * partial update (base fields + details)
 * NOTE: we block changing `type` in PATCH for safety.
 */
adminContentRouter.patch("/content/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = adminAuthOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const contentId = z.string().uuid().parse(req.params.id);
    const patch = PatchSchema.parse(req.body);

    await client.query("begin");

    const current = await getContentRow(client, contentId);
    if (!current) return res.status(404).json({ error: "Not found" });


    const normalizedPrice =
    patch.is_free === true ? 0
    : (typeof patch.price !== "undefined" ? patch.price : null);

    await client.query(
    `
    update public.content_items
    set title = coalesce($2, title),
        description = coalesce($3, description),
        image_url = coalesce($4, image_url),

        price = coalesce($5, price),
        currency = coalesce($6, currency),

        is_free = coalesce($7, is_free),

        preview_body = coalesce($8, preview_body),
        content_body = coalesce($9, content_body),

        is_published = coalesce($10, is_published)
    where id = $1;
    `,
    [
        contentId,
        patch.title ?? null,
        patch.description ?? null,
        patch.image_url ?? null,

        normalizedPrice,
        patch.currency ?? null,

        typeof patch.is_free === "boolean" ? patch.is_free : null,

        patch.preview_body ?? null,
        patch.content_body ?? null,

        typeof patch.is_published === "boolean" ? patch.is_published : null,
    ]
    );

    // extra safety
    if (patch.is_free === true) {
    await client.query(`update public.content_items set price = 0 where id = $1;`, [contentId]);
    }

    // details update
    await updateDetails(client, current.type, contentId, patch);

    await client.query("commit");

    const updated = await getContentRow(client, contentId);
    const details = await getDetailsRow(client, current.type, contentId);
    return res.json({ ok: true, item: { ...updated, details } });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/content/:id
 * full replace:
 * - requires all base fields
 * - replaces details (sets unspecified details to NULL/default)
 */
adminContentRouter.put("/content/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const clerkId = adminAuthOrThrow(req);
    await assertAdminByClerkId(clerkId);

    const contentId = z.string().uuid().parse(req.params.id);
    const body = PutSchema.parse(req.body);

    await client.query("begin");

    const current = await getContentRow(client, contentId);
    if (!current) return res.status(404).json({ error: "Not found" });

    if (body.type !== current.type) {
      return res.status(400).json({ error: "Changing content type is not supported via PUT" });
    }

    const normalizedPrice = body.is_free ? 0 : (body.price ?? null);
    const normalizedCurrency = body.currency ?? "SAR";

    await client.query(
    `
    update public.content_items
    set type=$2,
        title=$3,
        description=$4,
        image_url=$5,
        price=$6,
        currency=$7,
        is_free=$8,
        preview_body=$9,
        content_body=$10,
        is_published=$11
    where id=$1;
    `,
    [
        contentId,
        body.type,
        body.title,
        body.description ?? null,
        body.image_url ?? null,
        normalizedPrice,
        normalizedCurrency,
        body.is_free,
        body.preview_body ?? null,
        body.content_body ?? null,
        body.is_published,
    ]
    );
    // details replace (set values, not coalesce)
    if (body.type === "video") {
   await ensureDetailsRow(client, body.type, contentId);

    await client.query(
      `
      update public.content_video_details
      set
        video_url = case when $2::text is not null then $2 else video_url end,
        video_seconds = case when $3::int is not null then $3 else video_seconds end,
        provider = case when $4::text is not null then $4 else provider end
      where content_id = $1;
      `,
      [
        contentId,
        typeof body.video_url !== "undefined" ? body.video_url : null,
        typeof body.video_seconds !== "undefined" ? body.video_seconds : null,
        typeof body.provider !== "undefined" ? body.provider : null,
      ]
    );
  } else if (body.type === "article") {
      await ensureDetailsRow(client, body.type, contentId);
      await client.query(
        `
        update public.content_article_details
        set source_url=$2, reading_minutes=$3, author=$4
        where content_id=$1;
        `,
        [contentId, body.source_url ?? null, body.reading_minutes ?? null, body.author ?? null]
      );
    } else if (body.type === "session") {
      await ensureDetailsRow(client, body.type, contentId);
      await client.query(
        `
        update public.content_session_details
        set therapist_id=$2, session_minutes=$3, meeting_type=$4
        where content_id=$1;
        `,
        [
          contentId,
          body.therapist_id ?? null,
          body.session_minutes ?? 60,
          body.meeting_type ?? "zoom",
        ]
      );
    }

    await client.query("commit");

    const updated = await getContentRow(client, contentId);
    const details = await getDetailsRow(client, body.type, contentId);
    return res.json({ ok: true, item: { ...updated, details } });
  } catch (e: any) {
    await client.query("rollback").catch(() => {});
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 400;
    return res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/content/:id
 * If you don't have ON DELETE CASCADE on detail tables, delete them first.
 */
adminContentRouter.delete("/content/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await assertAdminByClerkId(userId);

    const contentId = z.string().uuid().parse(req.params.id);

    // If FK constraints exist with ON DELETE CASCADE, this is enough.
    // Otherwise you'll need to delete from detail tables first.
    const q = `delete from public.content_items where id = $1;`;
    await pool.query(q, [contentId]);

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    const status = msg === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: msg });
  }
});



