import type { Checkout } from "../../shared/api/catalog.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { enrollmentGrantsContentAccess } from "./lifecycle.js";

export async function loadCheckout(courseSlug: string, userId: string): Promise<Checkout> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, slug: true, title: true, pricingType: true, priceCents: true, currency: true, status: true },
  });
  if (!course || course.status !== "PUBLISHED") throw new NotFoundError("Course not found");
  const { status: _status, ...courseFields } = course;

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId } },
    select: { id: true, lifecycle: true, payment: { select: { amountCents: true } } },
  });
  if (!enrollment) return { course: courseFields, enrollment: null, state: "no_enrollment" };
  if (enrollmentGrantsContentAccess(enrollment.lifecycle)) {
    return { course: courseFields, enrollment, state: "already_paid" };
  }
  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") throw new NotFoundError("Enrollment is not awaiting payment");
  return { course: { ...courseFields, priceCents: enrollment.payment?.amountCents ?? course.priceCents }, enrollment, state: "payment_required" };
}
