import { z } from "zod";

export const addPatientSchema = z.object({
  patient_id: z.string().uuid(),
});

export const specialistPatientsParamSchema = z.object({
  specialist_id: z.string().uuid(),
});

export const removePatientParamSchema = z.object({
  specialist_id: z.string().uuid(),
  patient_id: z.string().uuid(),
});

export type AddPatientInput = z.infer<typeof addPatientSchema>;