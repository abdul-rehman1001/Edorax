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
    select: { id: true, lifecycle: true, payment: { select: { amountCents: true } }, instructorCouponRedemption: { select: { id: true } } },
  });
  const enrollmentView = enrollment ? { id: enrollment.id, lifecycle: enrollment.lifecycle } : null;
  const automaticCoupon = (!enrollment || (enrollment.lifecycle === "PAYMENT_REQUIRED" && !enrollment.instructorCouponRedemption)) && course.pricingType === "PAID"
    ? await prisma.instructorCoupon.findMany({
        where: { courseId: course.id, active: true, autoApply: true, redemptionCount: { lt: 1000000 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ percentOff: "desc" }, { createdAt: "asc" }],
        select: { percentOff: true, label: true, maxRedemptions: true, redemptionCount: true },
      }).then((offers) => {
        const coupon = offers.find((offer) => offer.redemptionCount < offer.maxRedemptions);
        return coupon ? { percentOff: coupon.percentOff, label: coupon.label } : null;
      })
    : null;
  if (!enrollment) return { course: courseFields, enrollment: null, state: "no_enrollment", automaticDiscount: automaticCoupon };
  if (enrollmentGrantsContentAccess(enrollment.lifecycle)) {
    return { course: courseFields, enrollment: enrollmentView, state: "already_paid", automaticDiscount: null };
  }
  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") throw new NotFoundError("Enrollment is not awaiting payment");
  return { course: { ...courseFields, priceCents: enrollment.payment?.amountCents ?? course.priceCents }, enrollment: enrollmentView, state: "payment_required", automaticDiscount: automaticCoupon };
}
