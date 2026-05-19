import z from "zod";

const UpdateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(4).max(64).optional(),
  email: z.string().email().optional(),
  palette_id: z.string().max(40).optional(),
  profile_image: z.string().nullable().optional(),
});

export type UpdateMeSchema = z.infer<typeof UpdateMeSchema>;