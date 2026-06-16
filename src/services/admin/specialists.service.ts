/**
 * @file admin/specialists.service.ts
 * @description
 *   Data-access layer for admin CRUD on the `specialists` table.
 *   No HTTP logic lives here.
 */

import type { PoolClient } from "pg";
import { pool } from "../../db/supabase";
import type { z } from "zod";
import type {
  CreateSpecialistSchema as _CreateSpecialistSchema,
  PatchSpecialistSchema as _PatchSpecialistSchema,
} from "../../schemas/specialists.schema";

type CreateSpecialistInput = z.infer<typeof _CreateSpecialistSchema>;
type PatchSpecialistInput  = z.infer<typeof _PatchSpecialistSchema>;

/**
 * Creates or updates a specialist row (upsert on `user_id`).
 */
export async function upsertSpecialist(client: PoolClient, input: CreateSpecialistInput) {
  const { rows } = await client.query(
    `insert into public.specialists (user_id, available, bio, tags, hourly_price)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id)
     do update set
       available    = excluded.available,
       bio          = excluded.bio,
       tags         = excluded.tags,
       hourly_price = excluded.hourly_price
     returning *;`,
    [input.user_id, input.available, input.bio ?? null, input.tags ?? [], input.hourly_price ?? 0],
  );
  return rows[0];
}

/** Lists all specialists joined with basic user info, newest user first. */
export async function listAllSpecialists() {
  const { rows } = await pool.query(
    `select s.*, u.name, u.email, u.profile_image
     from public.specialists s
     join public.users u on u.id = s.user_id
     order by u.created_at desc;`,
  );
  return rows;
}

/** Fetches one specialist (admin view) by user ID. Returns `null` if not found. */
export async function getSpecialistByIdAdmin(userId: string) {
  const { rows } = await pool.query(
    `select s.*, u.name, u.email, u.profile_image
     from public.specialists s
     join public.users u on u.id = s.user_id
     where s.user_id = $1
     limit 1;`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Applies a partial update to a specialist row. Returns `null` if not found. */
export async function patchSpecialistAdmin(
  client: PoolClient,
  userId: string,
  patch: PatchSpecialistInput,
) {
  const { rows } = await client.query(
    `update public.specialists
     set
       available    = coalesce($2, available),
       bio          = coalesce($3, bio),
       tags         = coalesce($4, tags),
       hourly_price = coalesce($5, hourly_price)
     where user_id = $1
     returning *;`,
    [
      userId,
      typeof patch.available === "boolean" ? patch.available : null,
      patch.bio ?? null,
      patch.tags ?? null,
      typeof patch.hourly_price === "number" ? patch.hourly_price : null,
    ],
  );
  return rows[0] ?? null;
}

/** Deletes a specialist row by user ID. Returns `true` if a row was deleted. */
export async function deleteSpecialistAdmin(client: PoolClient, userId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `delete from public.specialists where user_id = $1;`,
    [userId],
  );
  return (rowCount ?? 0) > 0;
}