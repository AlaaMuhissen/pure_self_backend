import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, clerkAuth } from "../middleware/clerkAuth.middleware";
import { pool } from "../db/supabase";
import { assertAdminByClerkId } from "../guard/admin.guard";

const adminUsersRouter = Router();

async function ensureAdmin(req: AuthedRequest) {
  const clerkId = req.auth?.clerkUserId;

  if (!clerkId) {
    throw new Error("Unauthorized");
  }

  await assertAdminByClerkId(clerkId);
}

const PatchContentAccessSchema = z.object({
  content_id: z.string().uuid(),
  has_access: z.boolean(),
});

const UpdateSubscriptionSchema = z.object({
  subscription_active: z.boolean(),
});

/* -------------------------------------------------------------------------- */
/*                                    SEARCH                                  */
/* -------------------------------------------------------------------------- */

adminUsersRouter.get(
  "/search",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const q = String(req.query.q || "").trim();

      const result = await pool.query(
        `
        SELECT
          id,
          name,
          username,
          email,
          profile_image,
          subscription_active,
          role,
          created_at
        FROM public.users
        WHERE
          name ILIKE $1
          OR username ILIKE $1
          OR email ILIKE $1
        ORDER BY created_at DESC
        LIMIT 20;
        `,
        [`%${q}%`]
      );

      return res.json({
        success: true,
        data: result.rows,
      });

    } catch (error) {
      console.error("ADMIN SEARCH USERS ERROR:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search users",
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                           UPDATE SUBSCRIPTION                              */
/* -------------------------------------------------------------------------- */

adminUsersRouter.patch(
  "/:id/subscription",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const userId = String(req.params.id);

      const body = UpdateSubscriptionSchema.parse(req.body);

      const result = await pool.query(
        `
        UPDATE public.users
        SET
          subscription_active = $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *;
        `,
        [body.subscription_active, userId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
      });

    } catch (error) {
      console.error("UPDATE SUBSCRIPTION ERROR:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update subscription",
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                                    GRANT ACCESS                             */
/* -------------------------------------------------------------------------- */

adminUsersRouter.post(
  "/:userId/content/:contentId/access",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const { userId, contentId } = req.params;

      const result = await pool.query(
        `
        INSERT INTO public.user_content_purchases
          (user_id, content_id, granted_by_admin)
        VALUES ($1, $2, true)
        ON CONFLICT (user_id, content_id)
        DO UPDATE SET
          granted_by_admin = true,
          granted_at = now()
        RETURNING *;
        `,
        [userId, contentId]
      );

      return res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to grant access",
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                                    REMOVE ACCESS                           */
/* -------------------------------------------------------------------------- */
adminUsersRouter.delete(
  "/:userId/content/:contentId/access",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const { userId, contentId } = req.params;

      await pool.query(
        `
        DELETE FROM public.user_content_purchases
        WHERE user_id = $1 AND content_id = $2;
        `,
        [userId, contentId]
      );

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove access",
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                                     ACCESS                                 */
/* -------------------------------------------------------------------------- */
adminUsersRouter.get(
  "/:userId/content-access",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const { userId } = req.params;

      const result = await pool.query(
        `
        SELECT
          p.content_id,
          c.title,
          c.type,
          c.price,
          c.is_free,
          p.granted_by_admin,
          p.granted_at
        FROM public.user_content_purchases p
        JOIN public.content_items c
          ON c.id = p.content_id
        WHERE p.user_id = $1
        ORDER BY p.granted_at DESC;
        `,
        [userId]
      );

      return res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("GET USER CONTENT ACCESS ERROR:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get user content access",
      });
    }
  }
);
/* -------------------------------------------------------------------------- */
/*                                    UPDATE ACCESS                           */
/* -------------------------------------------------------------------------- */

adminUsersRouter.patch(
  "/:userId/content-access",
  clerkAuth,
  async (req: AuthedRequest, res) => {
    try {
      await ensureAdmin(req);

      const { userId } = req.params;
      const body = PatchContentAccessSchema.parse(req.body);

      if (body.has_access) {
        const result = await pool.query(
          `
          INSERT INTO public.user_content_purchases
            (user_id, content_id, granted_by_admin, granted_at)
          VALUES ($1, $2, true, NOW())
          ON CONFLICT (user_id, content_id)
          DO UPDATE SET
            granted_by_admin = true,
            granted_at = NOW()
          RETURNING *;
          `,
          [userId, body.content_id]
        );

        return res.json({
          success: true,
          data: result.rows[0],
        });
      }

      await pool.query(
        `
        DELETE FROM public.user_content_purchases
        WHERE user_id = $1
        AND content_id = $2;
        `,
        [userId, body.content_id]
      );

      return res.json({
        success: true,
        data: null,
      });
    } catch (error) {
      console.error("PATCH USER CONTENT ACCESS ERROR:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update content access",
      });
    }
  }
);
export default adminUsersRouter;