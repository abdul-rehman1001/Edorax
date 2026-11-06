import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "../admin/audit.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { appBaseUrl, sendEmail } from "../email/send.js";
import { escapeHtml } from "../email/format.js";

/** The enrollment is the durable request. Sending can be retried if email fails. */
export async function requestManualAccess(enrollmentId: string, userId: string) {
  const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, userId }, include: { user: true, course: true, payment: true } });
  if (!enrollment || !enrollment.user) throw new NotFoundError("Enrollment not found");
  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") throw new ConflictError("This enrollment is not awaiting access.");
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  const { env } = await import("../../config/env.js");
  const recipients = [...new Set([...admins.map(a => a.email), ...env.ADMIN_NOTIFY_EMAIL].map(e => e.trim().toLowerCase()).filter(Boolean))];
  const text = `Course access request\n\nLearner: ${enrollment.user.name ?? ""} (${enrollment.user.email})\nCourse: ${enrollment.course.title}\nPrice: ${enrollment.payment?.amountCents ?? enrollment.course.priceCents} cents ${enrollment.payment?.currency ?? enrollment.course.currency}\n\nReview: ${appBaseUrl()}/admin/course-access`;
  const results = await Promise.allSettled(recipients.map(to => sendEmail({ to, subject: `Course access request: ${enrollment.course.title}`, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` })));
  // The PAYMENT_REQUIRED enrollment is already the durable admin queue item. A mail
  // outage or an unconfigured local email provider must not discard the request.
  return { requested: true, emailSent: results.some(result => result.status === "fulfilled" && result.value.sent) };
}

export async function approveManualAccess(enrollmentId: string, actor: AdminActor) {
  await prisma.$transaction(async tx => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId }, include: { payment: true } });
    if (!enrollment || enrollment.lifecycle !== "PAYMENT_REQUIRED" || !enrollment.payment) throw new ConflictError("This enrollment is not awaiting access.");
    const updated = await tx.enrollment.updateMany({ where: { id: enrollmentId, lifecycle: "PAYMENT_REQUIRED" }, data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: enrollment.startedAt ?? new Date() } });
    if (!updated.count) throw new ConflictError("This enrollment is no longer awaiting access.");
    await tx.payment.update({ where: { enrollmentId }, data: {
      status: "SUCCEEDED", provider: "manual", paidAt: new Date(),
      instructorShareCents: Math.floor(enrollment.payment.amountCents / 2),
      instructorPayoutStatus: enrollment.payment.amountCents > 0 ? "PENDING" : "NOT_DUE",
    } });
    await recordAdminAction(tx, { actor, action: ADMIN_AUDIT_ACTIONS.MANUAL_ACCESS_APPROVE, targetType: "Enrollment", targetId: enrollmentId, summary: "Confirmed manual payment and granted course access." });
  });
}

export async function listManualInstructorPayouts() {
  const payments = await prisma.payment.findMany({
    where: { status: "SUCCEEDED", provider: "manual", instructorPayoutStatus: { in: ["PENDING", "PAID"] } },
    orderBy: [{ instructorPayoutStatus: "asc" }, { paidAt: "desc" }],
    select: {
      amountCents: true, currency: true, instructorPayoutStatus: true, instructorShareCents: true, instructorPayoutPaidAt: true, paidAt: true,
      enrollment: { select: { id: true, user: { select: { name: true, email: true } }, course: { select: { title: true, mentor: { select: { name: true, email: true } } } } } },
    },
  });
  return payments.map(({ enrollment, ...payment }) => ({ id: enrollment.id, ...payment,
    learner: enrollment.user, course: enrollment.course.title, instructor: enrollment.course.mentor,
    instructorPayoutPaidAt: payment.instructorPayoutPaidAt?.toISOString() ?? null,
  }));
}

export async function markManualInstructorPayoutPaid(enrollmentId: string, actor: AdminActor) {
  await prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { enrollmentId }, include: { enrollment: { include: { course: true } } } });
    if (!payment || payment.status !== "SUCCEEDED" || payment.provider !== "manual" || payment.instructorPayoutStatus !== "PENDING") {
      throw new ConflictError("This manual instructor payout is not pending.");
    }
    const updated = await tx.payment.updateMany({ where: { enrollmentId, instructorPayoutStatus: "PENDING" }, data: { instructorPayoutStatus: "PAID", instructorPayoutPaidAt: new Date() } });
    if (!updated.count) throw new ConflictError("This instructor payout was already recorded.");
    await recordAdminAction(tx, { actor, action: ADMIN_AUDIT_ACTIONS.MANUAL_INSTRUCTOR_PAYOUT_PAID, targetType: "Payment", targetId: payment.id,
      summary: `Recorded manual instructor payout of ${payment.instructorShareCents} ${payment.currency} cents for ${payment.enrollment.course.title}.` });
  });
}
