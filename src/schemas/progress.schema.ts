/**
 * @file progress.schema.ts
 * @description
 *   Zod schemas for the user content progress/history domain.
 */

import { z } from "zod";

export const UpsertProgressSchema = z.object({
  contentId:           z.string().uuid(),
  status:              z.enum(["not_started", "in_progress", "completed"]).optional(),
  progressPercent:     z.number().int().min(0).max(100).optional(),
  lastPositionSeconds: z.number().int().min(0).nullable().optional(),
  lastReadingLocation: z.string().nullable().optional(),
});

export type UpsertProgressInput = z.infer<typeof UpsertProgressSchema>;