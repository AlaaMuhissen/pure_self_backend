import { z } from "zod";

// ===== ENUMS =====

export const bookingStatusEnum = z.enum([
  "pending",
  "confirmed",
  "cancelled",
  "completed",
]);

export const paymentStatusEnum = z.enum([
  "unpaid",
  "paid",
  "failed",
]);

export const bookingIdSchema = z.object({
  id: z.string().uuid(),
});
// ===== BASE =====

const isoDateString = z.string().datetime();

// ===== CREATE =====

export const createBookingSchema = z.object({
  specialist_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  status: bookingStatusEnum.optional(),
  payment_status: paymentStatusEnum.optional(),
  payment_id: z.string().uuid().optional(),
  price: z.coerce.number().optional(),
  google_meet_url: z.string().url().optional(),
  calendar_provider: z.string().optional(),
  meeting_status: z.string().optional(),
  google_event_id: z.string().optional(),
})
  .refine(
    (data) => new Date(data.ends_at) > new Date(data.starts_at),
    {
      message: "ends_at must be after starts_at",
      path: ["ends_at"],
    }
  );

// ===== UPDATE =====

export const updateBookingSchema = z.object({
  starts_at: isoDateString.optional(),
  ends_at: isoDateString.optional(),

  status: bookingStatusEnum.optional(),
  payment_status: paymentStatusEnum.optional(),

  payment_id: z.string().uuid().optional(),
  price: z.coerce.number().optional(),

  google_meet_url: z.string().url().optional(),
  calendar_provider: z.string().optional(),
  meeting_status: z.string().optional(),
  google_event_id: z.string().optional(),
});

// ===== QUERY =====

export const BookingQuery = z.object({
  user_id: z.string().uuid().optional(),
  specialist_id: z.string().uuid().optional(),

  status: bookingStatusEnum.optional(),
  payment_status: paymentStatusEnum.optional(),

  from: isoDateString.optional(),
  to: isoDateString.optional(),

  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ===== TYPES =====

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type BookingQuery = z.infer<typeof BookingQuery>;