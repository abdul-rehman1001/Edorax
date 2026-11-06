import { prisma } from "../../db/prisma.js";
import type { CreateAdminCourseCouponBody } from "../../validations/admin.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";

const normalizeCode = (code: string) => code.trim().toUpperCase();

export async function listAdminCourseCoupons(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, slug: true, pricingType: true } });
  if (!course) throw new NotFoundError("Course not found.");
  const coupons = await prisma.instructorCoupon.findMany({
    where: { courseId }, orderBy: { createdAt: "desc" },
    select: { id: true, code: true, label: true, percentOff: true, autoApply: true, maxRedemptions: true, redemptionCount: true, active: true, expiresAt: true, createdAt: true },
  });
  return {
    course,
    coupons: coupons.map((coupon) => ({ ...coupon, remaining: Math.max(0, coupon.maxRedemptions - coupon.redemptionCount), expiresAt: coupon.expiresAt?.toISOString() ?? null, createdAt: coupon.createdAt.toISOString() })),
  };
}

export async function createAdminCourseCoupon(adminId: string, courseId: string, input: CreateAdminCourseCouponBody) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, pricingType: true } });
  if (!course) throw new NotFoundError("Course not found.");
  if (course.pricingType !== "PAID") throw new UnprocessableError("Coupons can only be created for paid courses.", "COUPON_REQUIRES_PAID_COURSE");
  const code = input.code ? normalizeCode(input.code) : null;
  if (!code && !input.autoApply) throw new UnprocessableError("Enter a coupon code or enable automatic discount.", "VALIDATION_ERROR");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new UnprocessableError("The expiration must be in the future.", "VALIDATION_ERROR");
  try {
    const coupon = await prisma.instructorCoupon.create({
      data: { courseId, createdById: adminId, code, label: input.label, percentOff: input.percentOff, maxRedemptions: input.maxRedemptions, expiresAt, autoApply: input.autoApply },
    });
    return { ...coupon, remaining: coupon.maxRedemptions, expiresAt: coupon.expiresAt?.toISOString() ?? null, createdAt: coupon.createdAt.toISOString() };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("That coupon code is already in use.", "COUPON_CODE_TAKEN");
    throw error;
  }
}

export async function setAdminCourseCouponActive(courseId: string, couponId: string, active: boolean) {
  const updated = await prisma.instructorCoupon.updateMany({ where: { id: couponId, courseId }, data: { active } });
  if (!updated.count) throw new NotFoundError("Course coupon not found.");
}
