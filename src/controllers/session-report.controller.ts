import { Request, Response, NextFunction } from "express";
import * as S from "../services/session-report.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

// export async function listReports(req: Request, res: Response, next: NextFunction) {
//   try {
//     const result = await S.getSessionReports(req.query as any);
//     res.json({ success: true, ...result } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getSessionReportById(req.params.id);
    if (!data) { res.status(404).json({ success: false, error: "Report not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function reportsByPatient(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getReportsByPatient(req.params.patient_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function reportsBySpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getReportsBySpecialist(req.params.specialist_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function myReports(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getReportsByPatient(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function createReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.createSessionReport(req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.updateSessionReport(req.params.id, req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteReport(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deleteSessionReport(req.params.id);
    res.json({ success: true, message: "Report deleted." } satisfies ApiResponse);
  } catch (e) { next(e); }
}