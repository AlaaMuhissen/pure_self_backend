import { Request, Response, NextFunction } from "express";
import * as S from "../services/schedule-block.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

// export async function listBlocks(req: Request, res: Response, next: NextFunction) {
//   try {
//     const result = await S.getScheduleBlocks(req.query as any);
//     res.json({ success: true, ...result } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function getBlock(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getScheduleBlockById(req.params.id);
    if (!data) { res.status(404).json({ success: false, error: "Block not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function blocksBySpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await S.getBlocksBySpecialist(req.params.specialist_id, from, to);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function myBlocks(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await S.getBlocksBySpecialist(userId, from, to);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function createBlock(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.createScheduleBlock(req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function updateBlock(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.updateScheduleBlock(req.params.id, req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteBlock(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deleteScheduleBlock(req.params.id);
    res.json({ success: true, message: "Schedule block deleted." } satisfies ApiResponse);
  } catch (e) { next(e); }
}