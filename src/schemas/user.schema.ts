import { z } from "zod";

export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export const UpdateMyProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(4).max(64).optional(),
  email: z.string().email().optional(),
  palette_id: z.string().max(40).nullable().optional(),
  profile_image: z.string().nullable().optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(["user", "specialist", "admin"]),
});
