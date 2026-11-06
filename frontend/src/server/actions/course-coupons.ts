"use server";

import { revalidatePath } from "next/cache";
import { teachCall } from "./teach-call";

export type CourseCouponRow = {
  id: string; code: string; label: string; maxRedemptions: number; redemptionCount: number;
  remaining: number; active: boolean; expiresAt: string | null; createdAt: string;
};

export async function createCourseCoupon(input: { courseId: string; courseSlug: string; code: string; label: string; maxRedemptions: number; expiresAt: string | null }) {
  const { courseId, courseSlug, ...body } = input;
  const result = await teachCall<CourseCouponRow>(`/api/v1/teach/courses/${encodeURIComponent(courseId)}/coupons`, { method: "POST", json: body });
  if (!result.ok) return result;
  revalidatePath(`/courses/${courseSlug}/settings`);
  return { ok: true as const, coupon: result.data };
}

export async function setCourseCouponActive(input: { courseId: string; courseSlug: string; couponId: string; active: boolean }) {
  const result = await teachCall<void>(`/api/v1/teach/courses/${encodeURIComponent(input.courseId)}/coupons/${encodeURIComponent(input.couponId)}`, { method: "PATCH", json: { active: input.active } });
  if (!result.ok) return result;
  revalidatePath(`/courses/${input.courseSlug}/settings`);
  return { ok: true as const };
}
