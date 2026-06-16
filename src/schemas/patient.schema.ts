/**
 * @file patient.schema.ts
 * @description
 *   Zod schemas for the patient self-service domain.
 */

import { z } from "zod";

export const PatchPatientProfileSchema = z.object({
  default_session_link: z.string().url().optional().nullable(),
  notes:                 z.string().optional().nullable(),
});