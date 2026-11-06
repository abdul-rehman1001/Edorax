"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction, type AdminActionState } from "./action-result";

export async function approveCourseAccessAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing enrollment." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/manual-access/${encodeURIComponent(id)}/approve`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Payment confirmed and access granted.";
  });
}

export async function markInstructorPayoutPaidAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing enrollment." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/manual-payouts/${encodeURIComponent(id)}/paid`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Instructor payout marked paid.";
  });
}
