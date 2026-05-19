import { z } from "zod";

export const upsertGoogleTokenSchema = z.object({
  specialist_id: z.string().uuid(),
  google_access_token: z.string().min(1),
  google_refresh_token: z.string().optional(),
  google_expiry_date: z.number().int().optional(),
});

export const googleTokenParamSchema = z.object({
  specialist_id: z.string().uuid(),
});

export type UpsertGoogleTokenInput = z.infer<typeof upsertGoogleTokenSchema>;