import { pool } from "../db/supabase";

export async function canAccessContent(userId: string, contentId: string): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT
      c.is_free,
      u.subscription_active,

      EXISTS (
        SELECT 1
        FROM public.user_content_purchases p
        WHERE p.user_id = u.id
        AND p.content_id = c.id
      ) as purchased

    FROM public.users u
    CROSS JOIN public.content_items c

    WHERE u.id = $1
    AND c.id = $2
    `,
    [userId, contentId],
  );

  const row = result.rows[0];

  if (!row) {
    return false;
  }

  return row.is_free || row.subscription_active || row.purchased;
}
