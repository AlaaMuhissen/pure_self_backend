import { Router } from "express";
import { googleOAuthCallback, startGoogleConnect } from "../controllers/google.controller";
import { requireAuth } from "@clerk/express";


const router = Router();

router.get("/connect", requireAuth(), startGoogleConnect);
router.get("/oauth/callback", googleOAuthCallback);

export default router;