// Mount in your main app:
//   import specialistProfileRouter from "./routes/specialistProfile.router";
//   app.use("/me/specialist-profile", requireAuth, specialistProfileRouter);
//
// Assumes:
//   - requireAuth middleware attaches req.userId (the internal UUID from your users table)
//   - db is your pg Pool / Drizzle / Knex instance — swap the query helpers as needed
//   - The specialists table schema:
//       user_id      uuid  FK → users.id  (PK)
//       available    bool  DEFAULT true
//       bio          text  NULLABLE
//       tags         text[]  DEFAULT '{}'
//       hourly_price numeric NULLABLE

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/supabase";
import { clerkAuth } from "../middleware/clerkAuth.middleware";

/* ─── Inject your DB pool here ─── */
// adjust path to wherever you export your pg Pool

export const specialistProfileRouter = Router();

/* ════════════════════════════════════════════════════
   Shared helper — fetch or auto-create the row
════════════════════════════════════════════════════ */
async function getOrCreateSpecialist(userId: string): Promise<SpecialistRow> {
  // Try to fetch existing row
  const existing = await pool.query<SpecialistRow>(
    `SELECT user_id, available, bio, tags, hourly_price
     FROM specialists
     WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows.length > 0) return existing.rows[0];

  // Row doesn't exist yet — create with defaults
  const inserted = await pool.query<SpecialistRow>(
    `INSERT INTO specialists (user_id, available, bio, tags, hourly_price)
     VALUES ($1, true, NULL, '{}', NULL)
     RETURNING user_id, available, bio, tags, hourly_price`,
    [userId]
  );

  return inserted.rows[0];
}

/* ════════════════════════════════════════════════════
   GET /me/specialist-profile
   Returns the specialist row for the authed user
════════════════════════════════════════════════════ */
specialistProfileRouter.get(
  "/", clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {

        const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;

        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if (role !== "specialist") {
        return res.status(403).json({ error: "Specialist only" });
        }

      const specialist = await getOrCreateSpecialist(userId);

      return res.json({ specialist: normalizeRow(specialist) });
    } catch (err) {
      next(err);
    }
  }
);

/* ════════════════════════════════════════════════════
   PATCH /me/specialist-profile
   Updates available, bio, tags, hourly_price
   Only updates fields that are present in the body
════════════════════════════════════════════════════ */
specialistProfileRouter.patch(
  "/",clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
    const userId = (req as AuthedRequest).auth?.userId;
    const role = (req as AuthedRequest).auth?.role;

    if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
    }

    if (role !== "specialist") {
    return res.status(403).json({ error: "Specialist only" });
    }

      // Validate + extract only the fields we allow
      const { available, bio, tags, hourly_price } = req.body as PatchBody;

      const errors = validatePatch({ available, bio, tags, hourly_price });
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join("; ") });
      }

      // Ensure the row exists (upsert pattern)
      await getOrCreateSpecialist(userId);

      // Build the SET clause dynamically from provided fields
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (available !== undefined) {
        updates.push(`available = $${idx++}`);
        values.push(available);
      }
      if (bio !== undefined) {
        updates.push(`bio = $${idx++}`);
        values.push(bio === "" ? null : bio);
      }
      if (tags !== undefined) {
        updates.push(`tags = $${idx++}`);
        values.push(tags); // pg driver sends JS string[] as text[]
      }
      if (hourly_price !== undefined) {
        updates.push(`hourly_price = $${idx++}`);
        values.push(hourly_price === null ? null : Number(hourly_price));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(userId); // last placeholder = WHERE user_id = $N

      const result = await pool.query<SpecialistRow>(
        `UPDATE specialists
         SET ${updates.join(", ")}
         WHERE user_id = $${idx}
         RETURNING user_id, available, bio, tags, hourly_price`,
        values
      );

      return res.json({ specialist: normalizeRow(result.rows[0]) });
    } catch (err) {
      next(err);
    }
  }
);

/* ════════════════════════════════════════════════════
   Types
════════════════════════════════════════════════════ */
interface SpecialistRow {
  user_id:      string;
  available:    boolean;
  bio:          string | null;
  tags:         string[];
  hourly_price: string | number | null; // pg returns numeric as string
}

interface PatchBody {
  available?:    boolean;
  bio?:          string | null;
  tags?:         string[];
  hourly_price?: number | null;
}

interface AuthedRequest extends Request {
  auth?: {
    clerkUserId: string;
    userId: string;
    role: "user" | "specialist" | "admin";
  };
}
/* ════════════════════════════════════════════════════
   Helpers
════════════════════════════════════════════════════ */

/** Normalize DB row before sending to client */
function normalizeRow(row: SpecialistRow) {
  return {
    user_id:      row.user_id,
    available:    row.available,
    bio:          row.bio ?? null,
    tags:         row.tags ?? [],
    hourly_price: row.hourly_price != null ? Number(row.hourly_price) : null,
  };
}

/** Basic validation — returns array of error strings */
function validatePatch(body: PatchBody): string[] {
  const errors: string[] = [];

  if (body.available !== undefined && typeof body.available !== "boolean") {
    errors.push("available must be a boolean");
  }

  if (body.bio !== undefined && body.bio !== null && typeof body.bio !== "string") {
    errors.push("bio must be a string or null");
  }
  if (typeof body.bio === "string" && body.bio.length > 600) {
    errors.push("bio must be 600 characters or fewer");
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      errors.push("tags must be an array of strings");
    } else if (body.tags.some((t) => typeof t !== "string")) {
      errors.push("every tag must be a string");
    } else if (body.tags.length > 20) {
      errors.push("maximum 20 tags allowed");
    }
  }

  if (body.hourly_price !== undefined && body.hourly_price !== null) {
    const n = Number(body.hourly_price);
    if (isNaN(n) || n < 0) {
      errors.push("hourly_price must be a non-negative number or null");
    }
  }

  return errors;
}

