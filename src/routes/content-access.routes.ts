import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
// import { grantContentAccessSchema } from "../schemas/content-access.schema";
import { z } from "zod";
import * as C from "../controllers/content-access.controller";

const router = Router();
router.use(requireAuth);

// GET  /content-access/me                        — my accessible content
// GET  /content-access/check/:content_id         — does current user have access?
// GET  /content-access/user/:user_id             — all access for a user (admin)
// GET  /content-access/content/:content_id       — all users with access to an item
// POST /content-access                           — grant access
// DELETE /content-access/:user_id/:content_id   — revoke access

router.get("/me", C.myAccess);
router.get("/check/:content_id", validate(z.object({ content_id: z.string().uuid() }), "params"), C.checkAccess);
router.get("/user/:user_id", validate(z.object({ user_id: z.string().uuid() }), "params"), C.accessByUser);
router.get("/content/:content_id", validate(z.object({ content_id: z.string().uuid() }), "params"), C.accessByContent);
// router.post("/", validate(grantContentAccessSchema), C.grantAccess);
router.delete(
  "/:user_id/:content_id",
  validate(z.object({ user_id: z.string().uuid(), content_id: z.string().uuid() }), "params"),
  C.revokeAccess,
);

export default router;