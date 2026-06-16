/**
 * @file specialists.schema.ts
 * @description
 *   Zod schemas for the specialists domain (public listing, self-service
 *   booking/report management, and admin CRUD).
 *
 * ⚠️ DEDUPLICATION NOTE: the original file defined `CreateReportSchema` and
 *   `PatchReportSchema` TWICE with different shapes. Only the second
 *   definition (using `z.coerce.date()` for `report_date`) was actually
 *   used by any route — the first definition was dead code and has been
 *   removed.
 */

import { z } from "zod";

export const upsertSpecialistSchema = z.object({
  bio: z.string().optional(),
  tags: z.array(z.string()).default([]),
  hourly_price: z.number().nonnegative().default(0),
  available: z.boolean().default(true),
});

export const specialistParamSchema = z.object({
  user_id: z.string().uuid(),
});

export const specialistQuerySchema = z.object({
  available: z.coerce.boolean().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type UpsertSpecialistInput = z.infer<typeof upsertSpecialistSchema>;
export type SpecialistQuery = z.infer<typeof specialistQuerySchema>;


// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

const TagsSchema = z.array(z.string().min(1)).optional();

export const BookingStatusSchema = z.enum(["pending", "confirmed", "cancelled", "completed"]);

// ─────────────────────────────────────────────────────────────────────────────
// Specialist profile (admin CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateSpecialistSchema = z.object({
  user_id:      z.string().uuid(),
  available:    z.boolean().default(true),
  bio:          z.string().optional().nullable(),
  tags:         TagsSchema.default([]),
  hourly_price: z.coerce.number().min(0).default(0), // coerce so "250" works too
});

export const PatchSpecialistSchema = z.object({
  available:    z.boolean().optional(),
  bio:          z.string().optional().nullable(),
  tags:         TagsSchema.optional(),
  hourly_price: z.coerce.number().min(0).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────────────────────────────────────────

export const PatchBookingStatusSchema = z.object({ status: BookingStatusSchema });

export const SpecialistUpdateBookingSchema = z.object({
  status: BookingStatusSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient profile (managed by specialist)
// ─────────────────────────────────────────────────────────────────────────────

export const PatchPatientBySpecialistSchema = z.object({
  notes:                 z.string().optional().nullable(),
  default_session_link:  z.string().url().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Session reports (specialist self-service)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateReportSchema = z.object({
  report_date:      z.coerce.date(), // accepts "2026-03-01"
  summary:          z.string().min(1),
  recommendations:  z.string().optional().nullable(),
});

export const PatchReportSchema = z.object({
  report_date:      z.coerce.date().optional(),
  summary:          z.string().min(1).optional(),
  recommendations:  z.string().optional().nullable(),
});