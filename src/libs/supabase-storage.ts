/**
 * @file supabase-storage.ts
 * @description
 *   Multer configuration (memory storage, 20 MB cap, PDF + image types only)
 *   and a single `uploadToSupabase` helper that uploads a raw buffer to a
 *   Supabase Storage bucket and returns the resulting public URL.
 *
 *   Kept isolated so any route that needs file-upload handling can import
 *   just the pieces it requires without pulling in route/controller logic.
 */

import multer  from "multer";
import crypto  from "crypto";
import { supabase } from "../db/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const ALLOWED_MIME_TYPES = ["application/pdf", ...ALLOWED_IMAGE_TYPES];

// ─────────────────────────────────────────────────────────────────────────────
// Multer instance — shared across all admin content routes
// ─────────────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/**
 * Middleware that accepts two optional file fields:
 *   - `pdf`   — book / article PDF
 *   - `image` — cover image (replaces the `image_url` string field)
 */
export const uploadFields = upload.fields([
  { name: "pdf",   maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Storage helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a buffer to Supabase Storage and returns the public URL.
 *
 * @param buffer    Raw bytes from multer.
 * @param mimeType  File MIME type (e.g. `"image/jpeg"`, `"application/pdf"`).
 * @param folder    Sub-folder inside the bucket (e.g. `"images"`, `"books"`).
 * @param bucket    Supabase bucket name — defaults to `"content-files"`.
 */
export async function uploadToSupabase(
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
// Request helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the `pdf` and `image` multer file objects from `req.files`.
 * Returns `undefined` for each field when no file was uploaded.
 */
export function extractFiles(req: any): {
  pdfFile?:   Express.Multer.File;
  imageFile?: Express.Multer.File;
} {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    pdfFile:   files?.pdf?.[0],
    imageFile: files?.image?.[0],
  };
}

/**
 * Normalises the request body for both JSON and multipart/form-data requests.
 *
 * When FormData is used the `item` and `details` fields are JSON strings
 * that must be parsed before schema validation.
 */
export function parseBody(req: any): Record<string, unknown> {
  if (typeof req.body.item === "string") {
    const item    = JSON.parse(req.body.item);
    const details = req.body.details ? JSON.parse(req.body.details) : {};
    return { ...item, ...details };
  }
  return req.body;
}