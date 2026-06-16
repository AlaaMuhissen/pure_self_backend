/**
 * @file index.routes.ts
 * @description
 *   Main application router — mounts all domain routers at their base paths.
 *
 *   Import and mount this in your Express app:
 *     import router from "./routes/index.routes";
 *     app.use("", router);
 *
 *   ─────────────────────────────────────────────────────────────
 *   Mounted endpoints overview:
 *   ─────────────────────────────────────────────────────────────
 *
 *   Public
 *     GET  /health
 *     /content/*              content browsing + reviews
 *     /specialist/*           specialist public profiles + self-service
 *     /why-choose-us/*        landing "why choose us" cards
 *     /landing/*              landing quote + landing why-cards
 *
 *   Authenticated (any role)
 *     /me/*                   own user profile + access info
 *     /me/specialist-profile  specialist's own profile (specialist role)
 *     /bookings/*             booking CRUD
 *     /patient/*              patient own profile + session reports
 *     /progress/*             content progress + history
 *     /users/*                user listing
 *
 *   Specialist
 *     /sessions/*             specialist self-service bookings (specialistSelfRouter)
 *     /specialistSessions/*   specialist session reports (sessionsRouter)
 *     /specialistSchedules/*  specialist schedule + availability blocks
 *
 *   Admin
 *     /admin/*                admin content CRUD
 *     /admin/users/*          admin user management
 */

import { Router } from "express";

// ── Public / content ──────────────────────────────────────────────────────────
import contentRoutes               from "./content.routes";
import { whyChooseUs }             from "./whychooseus.routes";
import { landingPageContent }      from "./landingcontent.routes";

// ── Me / profile ──────────────────────────────────────────────────────────────
import { meRouter }                from "./me.routes";
import { specialistProfileRouter } from "./specialistProfile.routes";

// ── Domain routers ────────────────────────────────────────────────────────────
import { bookingsRouter }          from "./booking.routes";
import { specialistsRouter }       from "./specialists.routes";
import { patientRouter }           from "./patient.routes";
import { progressRouter }          from "./progress.routes";
import usersRoutes                 from "./users.routes";

// ── Specialist self-service ───────────────────────────────────────────────────
import { specialistSelfRouter }    from "./specialistSelf.routes";
import { sessionsRouter }          from "./sessions.routes";
import { specialistScheduleRouter } from "./specialistSchedule.routes";

// ── Admin ─────────────────────────────────────────────────────────────────────
import { adminContentRouter }      from "./admin/admin.content.routes";
import adminUsersRouter            from "./admin/admin.users.routes";

// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── Health check ──────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  res.json({ success: true, message: "OK", timestamp: new Date().toISOString() });
});

// ── Public ────────────────────────────────────────────────────────────────────
router.use("/content",        contentRoutes);
router.use("/specialist",     specialistsRouter);
router.use("/why-choose-us",  whyChooseUs);
router.use("/landing",        landingPageContent);

// ── Authenticated ─────────────────────────────────────────────────────────────
router.use("/me",                     meRouter);
router.use("/me/specialist-profile",  specialistProfileRouter);
router.use("/bookings",               bookingsRouter);
router.use("/patient",                patientRouter);
router.use("/progress",               progressRouter);
router.use("/users",                  usersRoutes);

// ── Specialist self-service ───────────────────────────────────────────────────
router.use("/sessions",               specialistSelfRouter);
router.use("/specialistSessions",     sessionsRouter);
router.use("/specialistSchedules",    specialistScheduleRouter);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.use("/admin",                  adminContentRouter);
router.use("/admin/users",            adminUsersRouter);

export default router;