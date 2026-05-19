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