import type { PrismaClient } from "../../generated/prisma/index.js";
import { assignmentForNewEnrollment } from "../courses/variant-assignment.js";
import { lifecycleForSignedInEnrollment } from "./lifecycle.js";

export class SelfEnrollmentError extends Error {
  readonly code:
    | "COURSE_NOT_FOUND"
    | "NOT_PUBLISHED"
    | "ALREADY_ENROLLED"
    | "PAYMENT_PENDING"
    | "COUPON_INVALID"
    | "COUPON_EXHAUSTED"
    | "COUPON_NOT_APPLICABLE";
  constructor(code: SelfEnrollmentError["code"], message: string) {
    super(message);
    this.name = "SelfEnrollmentError";
    this.code = code;
  }
}

export type SelfEnrollmentResult = {
  enrollmentId: string;
  courseSlug: string;
  lifecycle: ReturnType<typeof lifecycleForSignedInEnrollment>;
  created: boolean;
  couponApplied?: boolean;
};

export async function createSelfEnrollment(
  db: PrismaClient,
  input: { userId: string; courseId: string; couponCode?: string }
): Promise<SelfEnrollmentResult> {
  const course = await db.course.findUnique({
    where: { id: input.courseId },
    select: {
      id: true,
      slug: true,
      status: true,
      pricingType: true,
      priceCents: true,
      currency: true,
    },
  });
  if (!course) throw new SelfEnrollmentError("COURSE_NOT_FOUND", "Course not found.");
  if (course.status !== "PUBLISHED") {
    throw new SelfEnrollmentError("NOT_PUBLISHED", "This course is not open for enrollment.");
  }

  const couponCode = input.couponCode?.trim().toUpperCase();
  const defaultLifecycle = lifecycleForSignedInEnrollment(course.pricingType);

  const result = await db.$transaction(async (tx) => {
    let lifecycle = defaultLifecycle;
    const existing = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: input.userId } },
      include: { payment: true },
    });
    if (existing && (!couponCode || existing.lifecycle !== "PAYMENT_REQUIRED")) {
      if (existing.lifecycle === "PAYMENT_REQUIRED") {
        throw new SelfEnrollmentError("PAYMENT_PENDING", "Complete payment or apply a coupon to access this course.");
      }
      throw new SelfEnrollmentError("ALREADY_ENROLLED", "You are already enrolled in this course.");
    }

    let coupon: { id: string; percentOff: number } | null = null;
    let amountCents = course.priceCents;
    if (couponCode) {
      if (course.pricingType !== "PAID") throw new SelfEnrollmentError("COUPON_NOT_APPLICABLE", "Coupons are only available for paid courses.");
      const found = await tx.instructorCoupon.findUnique({ where: { code: couponCode } });
      if (!found || found.courseId !== course.id || !found.active || (found.expiresAt && found.expiresAt <= new Date())) {
        throw new SelfEnrollmentError("COUPON_INVALID", "This coupon is invalid or expired.");
      }
      const reserved = await tx.instructorCoupon.updateMany({
        where: { id: found.id, active: true, redemptionCount: { lt: found.maxRedemptions }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        data: { redemptionCount: { increment: 1 } },
      });
      if (!reserved.count) throw new SelfEnrollmentError("COUPON_EXHAUSTED", "This coupon has no redemptions remaining.");
      coupon = { id: found.id, percentOff: found.percentOff };
      amountCents = Math.round(course.priceCents * (100 - found.percentOff) / 100);
      lifecycle = found.percentOff === 100 ? "ACTIVE" : "PAYMENT_REQUIRED";
    }

    if (existing) {
      const accessGranted = lifecycle === "ACTIVE";
      const row = await tx.enrollment.update({ where: { id: existing.id }, data: {
        lifecycle, status: accessGranted ? "IN_PROGRESS" : "ASSIGNED", startedAt: accessGranted ? existing.startedAt ?? new Date() : null,
      } });
      if (existing.payment) await tx.payment.update({ where: { enrollmentId: existing.id }, data: accessGranted
        ? { amountCents: 0, status: "SUCCEEDED", provider: "coupon", paidAt: new Date() }
        : { amountCents, status: "PENDING", provider: null, paidAt: null } });
      else if (!accessGranted) await tx.payment.create({ data: { enrollmentId: existing.id, amountCents, currency: course.currency, status: "PENDING" } });
      if (coupon) await tx.instructorCouponRedemption.create({ data: { couponId: coupon.id, enrollmentId: existing.id, userId: input.userId, percentOff: coupon.percentOff } });
      return { row, lifecycle, created: false, couponApplied: Boolean(coupon) };
    }

    const assignment = await assignmentForNewEnrollment(tx, course.id);
    const row = await tx.enrollment.create({
      data: {
        ...assignment,
        courseId: course.id,
        userId: input.userId,
        source: "SELF",
        lifecycle,
        status: lifecycle === "ACTIVE" ? "IN_PROGRESS" : "ASSIGNED",
        startedAt: lifecycle === "ACTIVE" ? new Date() : null,
      },
    });

    if (lifecycle === "PAYMENT_REQUIRED") {
      await tx.payment.create({
        data: {
          enrollmentId: row.id,
          amountCents,
          currency: course.currency,
          status: "PENDING",
        },
      });
    }

    if (coupon) await tx.instructorCouponRedemption.create({ data: { couponId: coupon.id, enrollmentId: row.id, userId: input.userId, percentOff: coupon.percentOff } });

    return { row, lifecycle, created: true, couponApplied: Boolean(coupon) };
  });

  return {
    enrollmentId: result.row.id,
    courseSlug: course.slug,
    lifecycle: result.lifecycle,
    created: result.created,
    couponApplied: result.couponApplied,
  };
}
