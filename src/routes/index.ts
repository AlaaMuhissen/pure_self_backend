import { Router } from "express";
import contentRoutes        from "./content.routes";
import contentAccessRoutes  from "./content-access.routes";
import patientProfileRoutes from "./patient-profile.routes";
// import paymentRoutes        from "./payment.routes";

import googleTokenRoutes    from "./google-token.routes";
import subscriptionRoutes   from "./subscription.routes";
import usersRoutes          from "./users.routes";
import { meRouter } from "./me.routes";
import { adminContentRouter } from "./admin.content.routes";
import { bookingsRouter } from "./booking.routes";
import {  specialistSelfRouter, specialistsRouter } from "./specialist.routes";
import { patientRouter } from "./specialist-patients.routes";
import { progressRouter } from "./progress.routes";
import { sessionsRouter } from "./session-report.routes";
import { specialistScheduleRouter } from "./specialistSchedule.routes";
import adminUsersRouter from "./admin.users.routes";
import { specialistProfileRouter } from "./specialistProfile.routes";
import { whyChooseUs } from "./whychooseus.routes";
import { landingPageContent } from "./landingcontent.routes";

const router = Router();

// Health check (public)
router.get("/health", (_req, res) => {
  res.json({ success: true, message: "OK", timestamp: new Date().toISOString() });
});

// router.use("/bookings",           bookingRoutes);
router.use("/content",            contentRoutes);
router.use("/me",          meRouter);
router.use("/me/specialist-profile", specialistProfileRouter);
router.use("/content-access",     contentAccessRoutes);
router.use("/patient-profiles",   patientProfileRoutes);
router.use("/admin",              adminContentRouter); // avoid circular import
router.use("/admin/users",              adminUsersRouter); // avoid circular import
router.use("/bookings",           bookingsRouter); // avoid circular import
// router.use("/payments",           paymentRoutes);
// router.use("/session-reports",    sessionReportRoutes);
router.use("/specialist",        specialistsRouter);
// router.use("/specialist-patients", specialistPatientsRoutes);
router.use("/sessions",    specialistSelfRouter);
router.use("/specialistSessions", sessionsRouter);
router.use("/specialistSchedules",              specialistScheduleRouter); // avoid circular import
router.use("/patient",        patientRouter); // avoid circular import
router.use("/google-tokens",      googleTokenRoutes);
router.use("/subscriptions",      subscriptionRoutes);
router.use("/users",              usersRoutes); // avoid circular import
router.use("/progress",        progressRouter); // avoid circular import
router.use("/why-choose-us",        whyChooseUs);
router.use("/landing", landingPageContent);

export default router;