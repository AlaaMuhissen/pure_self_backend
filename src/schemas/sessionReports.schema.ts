import { z } from "zod";

export const createSessionReportSchema = z.object({
  specialist_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  booking_id: z.string().uuid().optional(),
  report_date: z.string().datetime().optional(),
  summary: z.string().min(1),
  recommendations: z.string().optional(),
});

export const updateSessionReportSchema = createSessionReportSchema.partial();

export const sessionReportIdSchema = z.object({ id: z.string().uuid() });

export const sessionReportQuerySchema = z.object({
  specialist_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateSessionReportInput = z.infer<typeof createSessionReportSchema>;
export type UpdateSessionReportInput = z.infer<typeof updateSessionReportSchema>;
export type SessionReportQuery = z.infer<typeof sessionReportQuerySchema>;

/**
 * @file sessionReports.schema.ts
 * @description
 *   Zod schemas shared by `sessionsRouter` and `specialistReportsRouter`.
 */


export const ScheduleQuerySchema = z.object({
  from: z.string().min(10), // "YYYY-MM-DD"
  to:   z.string().min(10),
});

export const CreateReportSchema = z.object({
  booking_id:       z.string().uuid().optional().nullable(),
  report_date:      z.string().optional(), // ISO
  summary:          z.string().min(1),
  recommendations:  z.string().optional().nullable(),
});

export const PatchReportSchema = z.object({
  summary:          z.string().min(1).optional(),
  recommendations:  z.string().optional().nullable(),
});

export const PatchReportWithDateSchema = PatchReportSchema.extend({
  report_date: z.string().optional().nullable(),
});

export const PatchBookingSchema = z.object({
  status: z.enum(["pending", "approved", "cancelled", "completed"]).optional(),
});