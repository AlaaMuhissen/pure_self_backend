/**
 * @file admin/stats.service.ts
 * @description
 *   Data-access layer for admin dashboard statistics.
 */

import { pool } from "../../db/supabase";

/** Returns the total number of users with an active subscription. */
export async function countActiveSubscribers(): Promise<number> {
  const { rows } = await pool.query(
    `select count(*)::int as total
     from public.users
     where subscription_active = true;`,
  );
  return rows[0].total;
}

/**
 * Returns the number of confirmed/completed bookings scheduled for "today",
 * where "today" is calculated in the Asia/Jerusalem timezone.
 */
export async function countTodaySessions(): Promise<number> {
  const { rows } = await pool.query(
    `select count(*)::int as total
     from public.bookings
     where
       status in ('confirmed', 'completed')
       and date(starts_at at time zone 'Asia/Jerusalem') = date(now() at time zone 'Asia/Jerusalem');`,
  );
  return rows[0].total;
}