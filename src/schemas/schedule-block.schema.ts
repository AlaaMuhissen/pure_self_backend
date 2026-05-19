import { z } from "zod";

export const blockTypeEnum = z.enum(["manual", "booking", "vacation", "break"]);

export const createScheduleBlockSchema = z.object({
  specialist_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  block_type: blockTypeEnum.default("manual"),
  note: z.string().optional(),
});

export const updateScheduleBlockSchema = createScheduleBlockSchema.partial();

export const scheduleBlockIdSchema = z.object({ id: z.string().uuid() });

export const scheduleBlockQuerySchema = z.object({
  specialist_id: z.string().uuid().optional(),
  block_type: blockTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateScheduleBlockInput = z.infer<typeof createScheduleBlockSchema>;
export type UpdateScheduleBlockInput = z.infer<typeof updateScheduleBlockSchema>;
export type ScheduleBlockQuery = z.infer<typeof scheduleBlockQuerySchema>;