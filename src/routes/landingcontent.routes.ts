// routes/landingContent.router.ts
//
// Mount in app.ts:
//   import landingContentRouter from "./routes/landingContent.router";
//   app.use("/landing", landingContentRouter);
//
// Endpoints:
//   GET    /landing/quote          — public
//   PATCH  /landing/quote          — admin only
//
//   GET    /landing/why            — public
//   POST   /landing/why            — admin only
//   PATCH  /landing/why/:id        — admin only
//   DELETE /landing/why/:id        — admin only
//   PATCH  /landing/why/reorder    — admin only (bulk sort_order update)

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/supabase";
import { AuthedRequest, clerkAuth } from "../middleware/clerkAuth.middleware";
import cluster from "cluster";


export const landingPageContent = Router();


/* ═══════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════ */
interface QuoteRow {
  id:         number;
  quote_text: string;
  author:     string;
  updated_at: string;
}

interface WhyRow {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  sort_order:  number;
  created_at:  string;
  updated_at:  string;
}

/* ═══════════════════════════════════════════════════
   QUOTE — GET (public)
═══════════════════════════════════════════════════ */
landingPageContent.get(
  "/quote",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<QuoteRow>(
        `SELECT id, quote_text, author, updated_at FROM landing_quote WHERE id = 1`
      );
      // Auto-create if missing
      if (result.rows.length === 0) {
        const inserted = await pool.query<QuoteRow>(
          `INSERT INTO landing_quote (id, quote_text, author)
           VALUES (1, '', 'أنا')
           RETURNING *`
        );
        return res.json({ quote: inserted.rows[0] });
      }
      return res.json({ quote: result.rows[0] });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   QUOTE — PATCH (admin only)
═══════════════════════════════════════════════════ */
landingPageContent.patch(
  "/quote",
  clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
               const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "admin") ) {
         return res.status(403).json({ error: "Admin only" });
       }
      const { quote_text, author } = req.body as { quote_text?: string; author?: string };

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (quote_text !== undefined) {
        if (typeof quote_text !== "string" || quote_text.trim().length === 0) {
          return res.status(400).json({ error: "quote_text cannot be empty" });
        }
        if (quote_text.length > 500) {
          return res.status(400).json({ error: "quote_text max 500 chars" });
        }
        updates.push(`quote_text = $${idx++}`);
        values.push(quote_text.trim());
      }

      if (author !== undefined) {
        updates.push(`author = $${idx++}`);
        values.push(author.trim() || "أنا");
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);

      const result = await pool.query<QuoteRow>(
        `UPDATE landing_quote
         SET ${updates.join(", ")}
         WHERE id = 1
         RETURNING *`,
        values
      );

      return res.json({ quote: result.rows[0] });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   WHY CARDS — GET (public)
═══════════════════════════════════════════════════ */
landingPageContent.get(
  "/why",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<WhyRow>(
        `SELECT id, icon, title, description, sort_order, created_at, updated_at
         FROM landing_why
         ORDER BY sort_order ASC, created_at ASC`
      );
      return res.json({ items: result.rows });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   WHY CARDS — POST (admin only)
═══════════════════════════════════════════════════ */
landingPageContent.post(
  "/why",
 clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
               const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "admin") ) {
         return res.status(403).json({ error: "Admin only" });
       }
      const { icon, title, description, sort_order } = req.body as {
        icon: string; title: string; description: string; sort_order?: number;
      };

      const errors = validateCard({ icon, title, description });
      if (errors.length > 0) return res.status(400).json({ error: errors.join("; ") });

      const result = await pool.query<WhyRow>(
        `INSERT INTO landing_why (icon, title, description, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [icon.trim(), title.trim(), description.trim(), sort_order ?? 0]
      );

      return res.status(201).json({ item: result.rows[0] });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   WHY CARDS — PATCH /:id (admin only)
═══════════════════════════════════════════════════ */
landingPageContent.patch(
  "/why/:id",
  clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
               const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "admin") ) {
         return res.status(403).json({ error: "Admin only" });
       }
      const { id } = req.params;
      const { icon, title, description, sort_order } = req.body as Partial<{
        icon: string; title: string; description: string; sort_order: number;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (icon !== undefined)        { updates.push(`icon = $${idx++}`);        values.push(icon.trim()); }
      if (title !== undefined)       { updates.push(`title = $${idx++}`);       values.push(title.trim()); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
      if (sort_order !== undefined)  { updates.push(`sort_order = $${idx++}`);  values.push(Number(sort_order)); }

      if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

      updates.push(`updated_at = now()`);
      values.push(id);

      const result = await pool.query<WhyRow>(
        `UPDATE landing_why SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) return res.status(404).json({ error: "Card not found" });

      return res.json({ item: result.rows[0] });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   WHY CARDS — DELETE /:id (admin only)
═══════════════════════════════════════════════════ */
landingPageContent.delete(
  "/why/:id",
  clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
       const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "admin") ) {
         return res.status(403).json({ error: "Admin only" });
       }
      const { id } = req.params;
      const result = await pool.query(
        `DELETE FROM landing_why WHERE id = $1 RETURNING id`, [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Card not found" });
      return res.json({ deleted: true, id });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   WHY CARDS — PATCH /why/reorder (admin only)
   Body: { items: [{ id: string, sort_order: number }] }
═══════════════════════════════════════════════════ */
landingPageContent.patch(
  "/why/reorder",
 clerkAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as AuthedRequest).auth?.userId;
        const role = (req as AuthedRequest).auth?.role;
       
        if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
        }
       
        if ((role !== "admin") ) {
         return res.status(403).json({ error: "Admin only" });
       }
      const { items } = req.body as { items: { id: string; sort_order: number }[] };

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }

      // Bulk update using unnest
      await pool.query(
        `UPDATE landing_why AS w
         SET sort_order = v.sort_order::integer
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::integer[]) AS sort_order) AS v
         WHERE w.id = v.id`,
        [items.map(i => i.id), items.map(i => i.sort_order)]
      );

      const result = await pool.query<WhyRow>(
        `SELECT * FROM landing_why ORDER BY sort_order ASC`
      );

      return res.json({ items: result.rows });
    } catch (err) { next(err); }
  }
);

/* ═══════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════ */
function validateCard(body: { icon?: string; title?: string; description?: string }): string[] {
  const errors: string[] = [];
  if (!body.icon?.trim())        errors.push("icon is required");
  if (!body.title?.trim())       errors.push("title is required");
  if (body.title && body.title.length > 120) errors.push("title max 120 chars");
  if (!body.description?.trim()) errors.push("description is required");
  if (body.description && body.description.length > 400) errors.push("description max 400 chars");
  return errors;
}

