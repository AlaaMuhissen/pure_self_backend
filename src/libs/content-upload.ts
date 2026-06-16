/**
 * @file content-upload.ts
 * @description
 *   Multer configuration for the public content router.
 *   Accepts a single PDF file under the `pdf` field (book / article uploads).
 */

import multer from "multer";

export const contentUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});