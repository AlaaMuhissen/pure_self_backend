// routes/whyChooseUs.router.ts
//
// Mount in app.ts:
//   import whyChooseUsRouter from "./routes/whyChooseUs.router";
//   app.use("/why-choose-us", whyChooseUsRouter);
//
// Permissions:
//   GET    /                — public (no auth required)
//   POST   /                — admin only
//   PATCH  /:id             — admin only
//   DELETE /:id             — specialist OR admin
//
// Assumes requireAuth, requireAdmin, requireSpecialistOrAdmin
// middleware attach req.userId and req.userRole.

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/supabase";
import { AuthedRequest, clerkAuth } from "../middleware/clerkAuth.middleware";


export const whyChooseUs = Router();

/* ═══════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════ */
interface WhyChooseUsRow {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  sort_order:  number;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
}


/* ═══════════════════════════════════════════════════
   GET /why-choose-us
   Public — no auth required
═══════════════════════════════════════════════════ */
whyChooseUs.get(
  "/",

  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<WhyChooseUsRow>(
        `SELECT id, icon, title, description, sort_order, created_at, updated_at
         FROM why_choose_us
         ORDER BY sort_order ASC, created_at ASC`
      );
      return res.json({ items: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/* ═══════════════════════════════════════════════════
   POST /why-choose-us
   Admin only — create a new card
═══════════════════════════════════════════════════ */
whyChooseUs.post(
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
      const { icon, title, description, sort_order } = req.body as {
        icon: string;
        title: string;
        description: string;
        sort_order?: number;
      };

      const errors = validateCard({ icon, title, description });
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join("; ") });
      }

      const result = await pool.query<WhyChooseUsRow>(
        `INSERT INTO why_choose_us (icon, title, description, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [icon.trim(), title.trim(), description.trim(), sort_order ?? 0, userId]
      );

      return res.status(201).json({ item: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/* ═══════════════════════════════════════════════════
   PATCH /why-choose-us/:id
   Admin only — update icon, title, description, sort_order
═══════════════════════════════════════════════════ */
whyChooseUs.patch(
  "/:id",
  clerkAuth,
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
      const { id } = req.params;
      const { icon, title, description, sort_order } = req.body as Partial<{
        icon: string;
        title: string;
        description: string;
        sort_order: number;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (icon !== undefined)        { updates.push(`icon = $${idx++}`);        values.push(icon.trim()); }
      if (title !== undefined)       { updates.push(`title = $${idx++}`);       values.push(title.trim()); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
      if (sort_order !== undefined)  { updates.push(`sort_order = $${idx++}`);  values.push(Number(sort_order)); }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      const result = await pool.query<WhyChooseUsRow>(
        `UPDATE why_choose_us
         SET ${updates.join(", ")}
         WHERE id = $${idx}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.json({ item: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/* ═══════════════════════════════════════════════════
   DELETE /why-choose-us/:id
   Specialist OR admin — no ownership check needed
   (any specialist can delete any card, as specified)
═══════════════════════════════════════════════════ */
whyChooseUs.delete(
  "/:id",
  clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
       const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "specialist") ) {
         return res.status(403).json({ error: "Specialist only" });
       }
      
      const { id } = req.params;

      const result = await pool.query(
        `DELETE FROM why_choose_us WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.json({ deleted: true, id });
    } catch (err) {
      next(err);
    }
  }
);

/* ═══════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════ */
function validateCard(body: { icon?: string; title?: string; description?: string }): string[] {
  const errors: string[] = [];
  if (!body.icon?.trim())        errors.push("icon is required");
  if (!body.title?.trim())       errors.push("title is required");
  if (body.title && body.title.length > 120)   errors.push("title max 120 chars");
  if (!body.description?.trim()) errors.push("description is required");
  if (body.description && body.description.length > 400) errors.push("description max 400 chars");
  return errors;
}

