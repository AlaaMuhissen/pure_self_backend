import { z } from "zod";

export const subscriptionStatusEnum = z.enum(["active", "cancelled", "expired", "trialing", "past_due"]);

export const createSubscriptionSchema = z.object({
  user_id: z.string().uuid(),
  plan: z.string().min(1),
  status: subscriptionStatusEnum.default("active"),
  current_period_start: z.string().datetime().optional(),
  current_period_end: z.string().datetime().optional(),
  stripe_subscription_id: z.string().optional(),
});

export const updateSubscriptionSchema = createSubscriptionSchema.partial();

export const subscriptionIdSchema = z.object({ id: z.string().uuid() });

export const subscriptionQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  plan: z.string().optional(),
  status: subscriptionStatusEnum.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;