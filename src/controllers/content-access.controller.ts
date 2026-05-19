import { Request, Response, NextFunction } from "express";
import * as S from "../services/content-access.service";
import { ApiResponse, AuthenticatedRequest } from "../types";
import { pool } from "../db/supabase";



export async function canAccessContent(
  userId: string,
  contentId: string
): Promise<boolean> {

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
    [userId, contentId]
  );

  const row = result.rows[0];

  if (!row) {
    return false;
  }

  return (
    row.is_free ||
    row.subscription_active ||
    row.purchased
  );
}
export async function myAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getAccessByUser(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function accessByUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getAccessByUser(req.params.user_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function accessByContent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getAccessByContent(req.params.content_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function checkAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.checkUserAccess(userId, req.params.content_id);
    res.json({ success: true, data: { has_access: !!data, access: data } } satisfies ApiResponse);
  } catch (e) { next(e); }
}

// export async function grantAccess(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.grantAccess(req.body);
//     res.status(201).json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function revokeAccess(req: Request, res: Response, next: NextFunction) {
  try {
    await S.revokeAccess(req.params.user_id, req.params.content_id);
    res.json({ success: true, message: "Access revoked." } satisfies ApiResponse);
  } catch (e) { next(e); }
}