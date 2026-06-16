/**
 * @file specialistSchedule.schema.ts
 * @description
 *   Zod schemas for the specialist schedule / availability-block domain.
 */

import { z } from "zod";

export const ScheduleQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CreateBlockSchema = z.object({
  starts_at:  z.string().datetime(),
  ends_at:    z.string().datetime(),
  block_type: z.enum(["manual", "holiday"]).default("manual"),
  note:       z.string().optional().nullable(),
});