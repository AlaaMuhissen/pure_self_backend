import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
// import { upsertPatientProfileSchema, patientProfileParamSchema } from "../schemas/patient-profile.schema";
import * as C from "../controllers/patient-profile.controller";

const router = Router();
router.use(requireAuth);

// GET  /patient-profiles              — list all (optionally filter by specialist_id)
// GET  /patient-profiles/me           — current user's profile
// PUT  /patient-profiles/me           — create/update current user's profile
// GET  /patient-profiles/:user_id     — get by user id
// PUT  /patient-profiles/:user_id     — admin upsert
// DELETE /patient-profiles/:user_id  — delete

router.get("/",      C.listPatientProfiles);
router.get("/me",    C.getMyProfile);
// router.put("/me",    validate(upsertPatientProfileSchema), C.upsertMyProfile);
// router.get("/:user_id",    validate(patientProfileParamSchema, "params"), C.getPatientProfile);
// router.put("/:user_id",    validate(patientProfileParamSchema, "params"), validate(upsertPatientProfileSchema), C.upsertPatientProfile);
// router.delete("/:user_id", validate(patientProfileParamSchema, "params"), C.deletePatientProfile);

export default router;