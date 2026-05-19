import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSubscriptionSchema, updateSubscriptionSchema, subscriptionIdSchema, subscriptionQuerySchema } from "../schemas/subscription.schema";
import * as C from "../controllers/subscription.controller";

const router = Router();
router.use(requireAuth);

// GET  /subscriptions             — list with filters
// GET  /subscriptions/me/active   — my active subscription
// GET  /subscriptions/:id         — single subscription
// POST /subscriptions             — create
// PATCH /subscriptions/:id        — update
// PATCH /subscriptions/:id/cancel — cancel
// DELETE /subscriptions/:id       — delete

// router.get("/",           validate(subscriptionQuerySchema, "query"), C.listSubscriptions);
router.get("/me/active",  C.myActiveSubscription);
router.get("/:id",        validate(subscriptionIdSchema, "params"), C.getSubscription);
router.post("/",          validate(createSubscriptionSchema), C.createSubscription);
router.patch("/:id",      validate(subscriptionIdSchema, "params"), validate(updateSubscriptionSchema), C.updateSubscription);
router.patch("/:id/cancel", validate(subscriptionIdSchema, "params"), C.cancelSubscription);
router.delete("/:id",     validate(subscriptionIdSchema, "params"), C.deleteSubscription);

export default router;