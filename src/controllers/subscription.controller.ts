import { Request, Response, NextFunction } from "express";
import * as S from "../services/subscription.service";
import { ApiResponse, AuthenticatedRequest } from "../types";

// export async function listSubscriptions(req: Request, res: Response, next: NextFunction) {
//   try {
//     const result = await S.getSubscriptions(req.query as any);
//     res.json({ success: true, ...result } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

export async function getSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.getSubscriptionById(req.params.id);
    if (!data) { res.status(404).json({ success: false, error: "Subscription not found" }); return; }
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function myActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await S.getActiveSubscriptionByUser(userId);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function createSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.createSubscription(req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function updateSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.updateSubscription(req.params.id, req.body);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function cancelSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await S.cancelSubscription(req.params.id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) { next(e); }
}

export async function deleteSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    await S.deleteSubscription(req.params.id);
    res.json({ success: true, message: "Subscription deleted." } satisfies ApiResponse);
  } catch (e) { next(e); }
}