// import { Request, Response, NextFunction } from "express";
// import * as S from "../services/content.service";
// import { ApiResponse } from "../types";

// export async function listContent(req: Request, res: Response, next: NextFunction) {
//   try {
//     const result = await S.getContentItems(req.query as any);
//     res.json({ success: true, ...result } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function getContent(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.getContentItemById(req.params.id);
//     if (!data) { res.status(404).json({ success: false, error: "Content not found" }); return; }
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function getContentWithDetails(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.getContentItemWithDetails(req.params.id);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function createContent(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.createContentItem(req.body);
//     res.status(201).json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function updateContent(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.updateContentItem(req.params.id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function deleteContent(req: Request, res: Response, next: NextFunction) {
//   try {
//     await S.deleteContentItem(req.params.id);
//     res.json({ success: true, message: "Content deleted." } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// // Details
// export async function upsertArticleDetails(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.upsertArticleDetails(req.params.id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function upsertBookDetails(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.upsertBookDetails(req.params.id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function upsertVideoDetails(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.upsertVideoDetails(req.params.id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }

// export async function upsertSessionDetails(req: Request, res: Response, next: NextFunction) {
//   try {
//     const data = await S.upsertSessionDetails(req.params.id, req.body);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) { next(e); }
// }