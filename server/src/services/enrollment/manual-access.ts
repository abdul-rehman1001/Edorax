import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "../admin/audit.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
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
  if (!recipients.length) throw new UnprocessableError("No administrator email is configured.");
  const text = `Course access request\n\nLearner: ${enrollment.user.name ?? ""} (${enrollment.user.email})\nCourse: ${enrollment.course.title}\nPrice: ${enrollment.payment?.amountCents ?? enrollment.course.priceCents} cents ${enrollment.payment?.currency ?? enrollment.course.currency}\n\nReview: ${appBaseUrl()}/admin/course-access`;
  const results = await Promise.all(recipients.map(to => sendEmail({ to, subject: `Course access request: ${enrollment.course.title}`, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` })));
  if (!results.some(result => result.sent)) throw new UnprocessableError("Could not send your request. Please try again later.");
}

export async function approveManualAccess(enrollmentId: string, actor: AdminActor) {
  await prisma.$transaction(async tx => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId }, include: { payment: true } });
    if (!enrollment || enrollment.lifecycle !== "PAYMENT_REQUIRED" || !enrollment.payment) throw new ConflictError("This enrollment is not awaiting access.");
    const updated = await tx.enrollment.updateMany({ where: { id: enrollmentId, lifecycle: "PAYMENT_REQUIRED" }, data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: enrollment.startedAt ?? new Date() } });
    if (!updated.count) throw new ConflictError("This enrollment is no longer awaiting access.");
    await tx.payment.update({ where: { enrollmentId }, data: { status: "SUCCEEDED", provider: "manual", paidAt: new Date() } });
    await recordAdminAction(tx, { actor, action: ADMIN_AUDIT_ACTIONS.MANUAL_ACCESS_APPROVE, targetType: "Enrollment", targetId: enrollmentId, summary: "Confirmed manual payment and granted course access." });
  });
}
