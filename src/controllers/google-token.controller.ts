import { Request, Response, NextFunction } from "express";
import * as S from "../services/google-token.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

export async function getMyToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getTokenBySpecialist(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getTokenBySpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getTokenBySpecialist(req.params.specialist_id);
    if (!data) { res.status(404).json({ success: false, error: "Token not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function upsertToken(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.upsertGoogleToken(req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteMyToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    await S.deleteGoogleToken(userId);
    res.json({ success: true, message: "Google token removed." } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteToken(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deleteGoogleToken(req.params.specialist_id);
    res.json({ success: true, message: "Google token removed." } satisfies ApiResponse);
  } catch (e) { next(e); }
}