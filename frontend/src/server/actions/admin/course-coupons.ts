"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction } from "./action-result";

export type AdminCourseCouponInput = {
  courseId: string; code: string | null; label: string; percentOff: number;
  maxRedemptions: number; expiresAt: string | null; autoApply: boolean;
};

export async function createAdminCourseCoupon(input: AdminCourseCouponInput) {
  return runAdminAction(async () => {
    await adminCall(`/api/v1/admin/courses/${encodeURIComponent(input.courseId)}/coupons`, {
      method: "POST",
      json: { code: input.code, label: input.label, percentOff: input.percentOff, maxRedemptions: input.maxRedemptions, expiresAt: input.expiresAt, autoApply: input.autoApply },
    });
    revalidatePath(`/admin/courses/${input.courseId}/coupons`);
    return input.autoApply ? "Automatic discount created." : "Coupon created.";
  });
}

export async function setAdminCourseCouponActive(input: { courseId: string; couponId: string; active: boolean }) {
  return runAdminAction(async () => {
    await adminCall(`/api/v1/admin/courses/${encodeURIComponent(input.courseId)}/coupons/${encodeURIComponent(input.couponId)}`, {
      method: "PATCH", json: { active: input.active },
    });
    revalidatePath(`/admin/courses/${input.courseId}/coupons`);
    return `Discount ${input.active ? "activated" : "paused"}.`;
  });
}
