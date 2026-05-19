import { Request, Response, NextFunction } from "express";
import * as S from "../services/specialist.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

// export async function listSpecialists(req: Request, res: Response, next: NextFunction) {
//   try {
//     const result = await S.getSpecialists(req.query as any);
//     res.json({ success: true, ...result } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function getSpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getSpecialistByUserId(req.params.user_id);
    if (!data) { res.status(404).json({ success: false, error: "Specialist not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getMySpecialistProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getSpecialistByUserId(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function upsertMySpecialistProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.upsertSpecialist(userId, req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function upsertSpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.upsertSpecialist(req.params.user_id, req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function setAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.setAvailability(userId, req.body.available);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteSpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deleteSpecialist(req.params.user_id);
    res.json({ success: true, message: "Specialist profile deleted." } satisfies ApiResponse);
  } catch (e) { next(e); }
}