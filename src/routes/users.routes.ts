import { Router } from "express";
import {
  me,
  getDbUserId,
  getUser,
  listUsers,
  updateUserRole,
  updateMyProfile,
} from "../controllers/users.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get("/me", requireAuth, me);
router.get("/me/db-id", requireAuth, getDbUserId);
router.patch("/me", requireAuth, updateMyProfile);

router.get("/", requireAuth, listUsers);
router.get("/:id", requireAuth, getUser);
router.patch("/:id/role", requireAuth, requireRole("admin"), updateUserRole);

export default router;