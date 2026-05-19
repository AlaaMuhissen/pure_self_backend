import { Request, Response, NextFunction } from "express";
import * as S from "../services/patient-profile.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

export async function listPatientProfiles(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getAllPatientProfiles(req.query.specialist_id as string | undefined);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getPatientProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getPatientProfileByUserId(req.params.user_id);
    if (!data) { res.status(404).json({ success: false, error: "Profile not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getPatientProfileByUserId(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

// export async function upsertMyProfile(req: Request, res: Response, next: NextFunction) {
//   try {
//     const { userId } = (req as AuthenticatedRequest).auth;
//     const data = await S.upsertPatientProfile(userId, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function upsertPatientProfile(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.upsertPatientProfile(req.params.user_id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function deletePatientProfile(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deletePatientProfile(req.params.user_id);
    res.json({ success: true, message: "Profile deleted." } satisfies ApiResponse);
  } catch (e) { next(e); }
}