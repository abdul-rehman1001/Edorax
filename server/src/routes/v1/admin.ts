import { prisma } from "../../db/prisma.js";
import { approveManualAccess, listManualInstructorPayouts, markManualInstructorPayoutPaid } from "../../services/enrollment/manual-access.js";
import { ok } from "../../utils/responses.js";
import { enrollmentParams } from "../../validations/enrollments.js";
import { Router } from "express";
import { userRateLimit } from "../../middlewares/rate-limit.js";
import * as admin from "../../controllers/admin.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requireAdmin } from "../../middlewares/require-admin.js";
import { validate, validateBody, validateParams, validateQuery } from "../../middlewares/validate.js";
import { appActivityOverviewQuery, appActivityUsersQuery } from "../../validations/activity.js";
import {
  adminProfileBody,
  adminPasswordBody,
  allocationParams,
  allocationsBody,
  approveCourseRequestBody,
  bulkApproveBody,
  bulkIdsOnlyBody,
  bulkSuspendBody,
  courseIdParams,
  courseStatusBody,
  couponPoolActiveBody,
  couponPoolParams,
  createCouponPoolBody,
  createOrganizationBody,
  grantAdminBody,
  grantInstructorBody,
  instructorAccessBody,
  listCoursesQuery,
  listOrganizationsQuery,
  listRequestsQuery,
  listUsersQuery,
  metricsQuery,
  orgIdParams,
  pageQuery,
  requestIdParams,
  suspendUserBody,
  totpCodeBody,
  userIdParams,
} from "../../validations/admin.js";

// Platform administration: organisations and their integration access,
// course requests, accounts and instructor capability.
const router = Router();

router.use(authenticate, requireAdmin);

const profileLimiter = userRateLimit({ scope: "admin-profile", max: 10, windowMs: 15 * 60_000 });
router.patch("/profile", profileLimiter, validateBody(adminProfileBody), admin.updateProfile);
router.patch("/password", profileLimiter, validateBody(adminPasswordBody), admin.updatePassword);

router.get("/manual-access", async (_req, res) => {
  const rows = await prisma.enrollment.findMany({ where: { lifecycle: "PAYMENT_REQUIRED", userId: { not: null } }, select: { id: true, createdAt: true, user: { select: { name: true, email: true } }, course: { select: { title: true } }, payment: { select: { amountCents: true, currency: true } } }, orderBy: { createdAt: "desc" }, take: 500 });
  ok(res, rows);
});
router.post("/manual-access/:enrollmentId/approve", validateParams(enrollmentParams), async (req, res) => {
  await approveManualAccess(req.params.enrollmentId as string, req.user!);
  ok(res, { approved: true });
});
router.get("/manual-payouts", async (_req, res) => ok(res, await listManualInstructorPayouts()));
router.post("/manual-payouts/:enrollmentId/paid", validateParams(enrollmentParams), async (req, res) => {
  await markManualInstructorPayoutPaid(req.params.enrollmentId as string, req.user!);
  ok(res, { paid: true });
});

router.get("/overview", admin.getOverview);
router.get("/metrics", validateQuery(metricsQuery), admin.getMetrics);
router.get("/courses", validateQuery(listCoursesQuery), admin.listCourses);
router.post("/courses/:courseId/status", validate({ params: courseIdParams, body: courseStatusBody }), admin.setCourseStatus);
router.get("/courses/export", validateQuery(listCoursesQuery), admin.exportCoursesCsv);

router.get("/organizations", validateQuery(listOrganizationsQuery), admin.listOrganizations);
router.post("/organizations", validateBody(createOrganizationBody), admin.createOrganization);
router.get("/organizations/:orgId", validateParams(orgIdParams), admin.getOrganization);
router.post("/organizations/:orgId/credentials/rotate", validateParams(orgIdParams), admin.rotateCredential);
router.put("/organizations/:orgId/allocations", validate({ params: orgIdParams, body: allocationsBody }), admin.upsertAllocations);
router.patch(
  "/organizations/:orgId/allocations/:courseId/leaderboard",
  validate({ params: allocationParams, body: instructorAccessBody }),
  admin.setAllocationLeaderboard
);
router.post(
  "/organizations/:orgId/coupons",
  validate({ params: orgIdParams, body: createCouponPoolBody }),
  admin.createCouponPool
);
router.patch(
  "/organizations/:orgId/coupons/:poolId",
  validate({ params: couponPoolParams, body: couponPoolActiveBody }),
  admin.setCouponPoolActive
);

router.get("/course-requests", validateQuery(listRequestsQuery), admin.listCourseRequests);
router.post("/course-requests/bulk/approve", validateBody(bulkApproveBody), admin.bulkApproveCourseRequests);
router.post("/course-requests/bulk/reject", validateBody(bulkIdsOnlyBody), admin.bulkRejectCourseRequests);
router.post("/course-requests/:requestId/approve", validate({ params: requestIdParams, body: approveCourseRequestBody }), admin.approveCourseRequest);
router.post("/course-requests/:requestId/reject", validateParams(requestIdParams), admin.rejectCourseRequest);

router.get("/users", validateQuery(listUsersQuery), admin.listUsers);
// Declared before "/users/:userId" so the literal segments are not read as ids.
router.post("/users/bulk/suspend", validateBody(bulkSuspendBody), admin.bulkSuspendUsers);
router.post("/users/bulk/reinstate", validateBody(bulkIdsOnlyBody), admin.bulkReinstateUsers);
router.get("/users/export", validateQuery(listUsersQuery), admin.exportUsersCsv);
router.get("/users/:userId", validateParams(userIdParams), admin.getUserDetail);
router.post("/users/:userId/verify-email", validateParams(userIdParams), admin.forceVerifyEmail);
router.post("/users/:userId/revoke-sessions", validateParams(userIdParams), admin.revokeUserSessions);
router.post("/users/:userId/suspend", validate({ params: userIdParams, body: suspendUserBody }), admin.suspendUser);
router.post("/users/:userId/reinstate", validateParams(userIdParams), admin.reinstateUser);
router.post("/users/:userId/reset-mfa", validateParams(userIdParams), admin.resetUserMfa);

router.post("/mfa/enroll", admin.enrollMfa);
router.get("/mfa", admin.getMfa);
router.post("/mfa/activate", validateBody(totpCodeBody), admin.activateMfa);
router.post("/mfa/recovery-codes", validateBody(totpCodeBody), admin.regenerateRecoveryCodes);
router.post("/mfa/disable", validateBody(totpCodeBody), admin.disableMfa);
router.patch("/users/:userId/zip-import", validate({ params: userIdParams, body: instructorAccessBody }), admin.setZipImportAccess);
router.patch("/users/:userId/tester", validate({ params: userIdParams, body: instructorAccessBody }), admin.setTesterAccess);

router.get("/app-activity", validateQuery(appActivityOverviewQuery), admin.getAppActivity);
router.get("/app-activity/users", validateQuery(appActivityUsersQuery), admin.listAppActivityUsers);

router.patch("/users/:userId/instructor-access", validate({ params: userIdParams, body: instructorAccessBody }), admin.setInstructorAccess);
router.post("/users/:userId/revoke-admin", validateParams(userIdParams), admin.revokeAdmin);
router.post("/instructors", validateBody(grantInstructorBody), admin.grantInstructor);
router.post("/admins", validateBody(grantAdminBody), admin.grantAdmin);
router.post("/instructor-access-requests/:requestId/approve", validateParams(requestIdParams), admin.approveInstructorRequest);
router.post("/instructor-access-requests/:requestId/reject", validateParams(requestIdParams), admin.rejectInstructorRequest);

router.get("/audit", validateQuery(pageQuery), admin.listAudit);
router.get("/audit/export", admin.exportAuditCsv);

export default router;
