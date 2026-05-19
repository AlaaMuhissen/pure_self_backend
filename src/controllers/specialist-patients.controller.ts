import { Request, Response, NextFunction } from "express";
import * as S from "../services/specialist-patients.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

export async function getPatientsForSpecialist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getPatientsForSpecialist(req.params.specialist_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getMyPatients(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getPatientsForSpecialist(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function getSpecialistsForPatient(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getSpecialistsForPatient(req.params.patient_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function addPatient(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.addPatientToSpecialist(req.params.specialist_id, req.body.patient_id);
    res.status(201).json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function removePatient(req: Request, res: Response, next: NextFunction) {
  try {
    await S.removePatientFromSpecialist(req.params.specialist_id, req.params.patient_id);
    res.json({ success: true, message: "Patient removed." } satisfies ApiResponse);
  } catch (e) { next(e); }
}