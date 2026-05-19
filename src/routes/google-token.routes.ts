import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { upsertGoogleTokenSchema, googleTokenParamSchema } from "../schemas/google-token.schema";
import * as C from "../controllers/google-token.controller";

const router = Router();
router.use(requireAuth);

// GET    /google-tokens/me                    — my token
// PUT    /google-tokens                       — upsert token
// DELETE /google-tokens/me                   — delete my token
// GET    /google-tokens/:specialist_id        — admin: get by specialist
// DELETE /google-tokens/:specialist_id        — admin: delete by specialist

router.get("/me",    C.getMyToken);
router.put("/",      validate(upsertGoogleTokenSchema), C.upsertToken);
router.delete("/me", C.deleteMyToken);
router.get("/:specialist_id",    validate(googleTokenParamSchema, "params"), C.getTokenBySpecialist);
router.delete("/:specialist_id", validate(googleTokenParamSchema, "params"), C.deleteToken);

export default router;