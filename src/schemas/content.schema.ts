
/**
 * @file content.schema.ts
 * @description
 *   Zod schemas and shared types for the content domain.
 *   Used by both the content controller (create/update) and the
 *   content service (type-specific detail validation).
 */


import { z } from "zod";

export const ContentType = z.enum(["video", "book", "article", "session"]);

const BaseSchema = z.object({
  type: ContentType,
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  price: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().min(1).optional().nullable().default("SAR"),
  is_free: z.coerce.boolean().default(false),
  preview_body: z.string().optional().nullable(),
  content_body: z.string().optional().nullable(),
  is_published: z.coerce.boolean().default(true),
});

const DetailsSchema = z.object({
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

export const CreateContentSchema = BaseSchema.merge(DetailsSchema);
export const PatchContentSchema = BaseSchema.omit({ type: true }).partial().merge(DetailsSchema.partial());
export const PutContentSchema = BaseSchema.merge(DetailsSchema);
export const ContentIdSchema = z.object({ id: z.string().uuid() });

export type CreateContentInput = z.infer<typeof CreateContentSchema>;
export type PatchContentInput = z.infer<typeof PatchContentSchema>;
export type PutContentInput = z.infer<typeof PutContentSchema>;


// ─────────────────────────────────────────────────────────────────────────────
// Base item schema
// ─────────────────────────────────────────────────────────────────────────────

export const baseItemSchema = z.object({
  type:         ContentType,
  title:        z.string().min(1),
  description:  z.string().nullable().optional(),
  image_url:    z.string().url().nullable().optional(),
  price:        z.number().nullable().optional(),
  currency:     z.string().default("JD").optional(),
  is_free:      z.boolean().default(false).optional(),
  preview_body: z.string().nullable().optional(),
  content_body: z.string().nullable().optional(),
  is_published: z.boolean().default(true).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-specific detail schemas
// ─────────────────────────────────────────────────────────────────────────────

export const videoDetailsSchema = z.object({
  video_url:     z.string().url(),
  video_seconds: z.number().int().nullable().optional(),
  provider:      z.string().nullable().optional(),
});

export const bookDetailsSchema = z.object({
  pdf_url: z.string().url().nullable().optional(),
  pages:   z.number().int().nullable().optional(),
  isbn:    z.string().nullable().optional(),
});

export const articleDetailsSchema = z.object({
  source_url:      z.string().url().nullable().optional(),
  reading_minutes: z.number().int().nullable().optional(),
  author:          z.string().nullable().optional(),
  pdf_url:         z.string().url().nullable().optional(),
});

export const sessionDetailsSchema = z.object({
  therapist_id:    z.string().uuid().nullable().optional(),
  session_minutes: z.number().int().nullable().optional(),
  meeting_type:    z.enum(["zoom", "in_person"]).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined request schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createSchema = z.object({
  item: baseItemSchema,
  details: z
    .union([videoDetailsSchema, bookDetailsSchema, articleDetailsSchema, sessionDetailsSchema])
    .optional(),
});

export const patchSchema = z.object({
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

// ─────────────────────────────────────────────────────────────────────────────
// Row type
// ─────────────────────────────────────────────────────────────────────────────

export type ContentRow = {
  id:           string;
  type:         "video" | "book" | "article" | "session";
  title:        string;
  description:  string | null;
  image_url:    string | null;
  price:        string | null;
  currency:     string;
  is_free:      boolean;
  preview_body: string | null;
  content_body: string | null;
  is_published: boolean;
  created_at:   string;
};

/** Maps a content type to its details table name and primary key column. */
export function detailsTable(type: ContentRow["type"]) {
  switch (type) {
    case "video":   return { table: "public.content_video_details",   pk: "content_id" };
    case "book":    return { table: "public.content_book_details",    pk: "content_id" };
    case "article": return { table: "public.content_article_details", pk: "content_id" };
    case "session": return { table: "public.content_session_details", pk: "content_id" };
  }
}