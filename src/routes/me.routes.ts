import { Router } from "express";
import { z } from "zod";

import { clerk } from "../config/clerk"; // adjust path
import { AuthedRequest, clerkAuth } from "../middleware/clerkAuth.middleware";
import { getUserAccessByClerkId, upsertUser } from "../services/users.service";
import { requireAuth } from "../middleware/auth.middleware";
import { clerkUserIdOrThrow } from "../config/auth";
import { assertAdminByClerkId } from "../guard/admin.guard";
import { pool } from "../db/supabase";
import { UpdateMyProfileSchema } from "../schemas/user.schema";
; // adjust path



export const meRouter = Router();

/**
 * GET /api/me
 * Requires Authorization: Bearer <clerk_token>
 * Returns the app user from DB (upserted if missing)
 */
meRouter.get("/", clerkAuth, async (req: AuthedRequest, res) => {
  try {
    const clerkUserId = req.auth!.clerkUserId;

    // fetch from Clerk
    const user = await clerk.users.getUser(clerkUserId);

    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? null;

    // upsert into DB
    const dbUser = await upsertUser({
      clerk_user_id: user.id,
      email: primaryEmail,
      name: user.fullName ?? user.firstName ?? null,
      profile_image: user.imageUrl ?? null, // Clerk uses imageUrl (camelCase)
      // keep role + subscription_active as defaults in DB if not provided
    });

   return res.json({
    success: true,
    data: dbUser,
  });
  } catch (e: any) {
    return res.status(500).json({ error: "Failed to load user", details: e?.message });
  }
});

meRouter.patch("/", clerkAuth, async (req: AuthedRequest, res) => {
  try {
    const clerkUserId = req.auth!.clerkUserId;
    const body = UpdateMyProfileSchema.parse(req.body);

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    
    if (body.name !== undefined) {
      console.log("Updating name to:", body.name);
      updates.push(`name = $${idx++}`);
      values.push(body.name);
    }

    if (body.username !== undefined) {
      updates.push(`username = $${idx++}`);
      values.push(body.username);
    }

    if (body.email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push(body.email);
    }

    if (body.palette_id !== undefined) {
      updates.push(`palette_id = $${idx++}`);
      values.push(body.palette_id);
    }

    if (body.profile_image !== undefined) {
      updates.push(`profile_image = $${idx++}`);
      values.push(body.profile_image);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }
   
    
      if (body.name !== undefined || body.username !== undefined) {

        console.log("Updating Clerk profile for user:", clerkUserId);
        console.log("new data: ", body)
        const res = await clerk.users.updateUser(clerkUserId, {
          firstName: body.name?.trim().split(" ")[0],
          lastName: body.name?.trim().split(" ").slice(1).join(" ") || undefined,
          username: body.username?.trim() || undefined,
        });
        console.log("Clerk update result:", res);
      }
    values.push(clerkUserId);
    console.log("Executing update with values:", values);
    console.log("clerk_user_id for update:", clerkUserId);
      const result = await pool.query(
      `
      UPDATE public.users
      SET ${updates.join(", ")},
          updated_at = NOW()
      WHERE clerk_user_id = $${idx}
      RETURNING *;
      `,
      values
    );

    console.log("ROW COUNT:", result.rowCount);
    console.log("ROWS:", result.rows);

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
    console.error("UPDATE ME ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update profile",
    });
  }
});

meRouter.get("/access", clerkAuth, async (req: AuthedRequest, res) => {
  try {
    const clerkUserId = req.auth!.clerkUserId;

    const dbUser = await getUserAccessByClerkId(clerkUserId);

    if (!dbUser) {
      return res.status(404).json({ error: "User not found in DB" });
    }

    return res.json({
      role: dbUser.role,
      subscription_active: dbUser.subscription_active,
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to get user access",
      details: e?.message,
    });
  }
});

// GET /api/admin/stats/subscribers
meRouter.get("/stats/subscribers", clerkAuth, async (req: AuthedRequest, res) => {
  try {
    const clerkId = req.auth!.clerkUserId;
    await assertAdminByClerkId(clerkId);

    const { rows } = await pool.query(`
      select count(*)::int as total
      from public.users
      where subscription_active = true;
    `);

    return res.json({ ok: true, total: rows[0].total });
  } catch (e: any) {
    const msg = e?.message ?? "Bad request";
    return res.status(400).json({ error: msg });
  }
});

// GET /api/admin/stats/today-sessions
meRouter.get("/stats/today-sessions", clerkAuth, async (req: AuthedRequest, res) => {
  try {
    const clerkId = req.auth!.clerkUserId;
    await assertAdminByClerkId(clerkId);

    const { rows } = await pool.query(`
      select count(*)::int as total
      from public.bookings
      where
        status in ('confirmed', 'completed')
        and date(starts_at at time zone 'Asia/Jerusalem') = date(now() at time zone 'Asia/Jerusalem');
    `);

    return res.json({ ok: true, total: rows[0].total });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});
