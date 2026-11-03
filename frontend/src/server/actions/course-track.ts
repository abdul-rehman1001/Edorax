"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UpdateCourseTrackResult } from "@/shared/api/catalog";
import { serverApiFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api-client";

// Variant and specialisation choices for a course in a family. Both land back on
// the course home, which is themed by the variant the learner just picked.

function readField(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export async function chooseCourseVariantAction(formData: FormData): Promise<void> {
  const courseSlug = readField(formData, "courseSlug");
  const variantSlug = readField(formData, "variantSlug");
  let result: UpdateCourseTrackResult;
  try {
    result = await serverApiFetch<UpdateCourseTrackResult>(
      `/api/v1/courses/${encodeURIComponent(courseSlug)}/track/variant`,
      { method: "PUT", json: { variantSlug } }
    );
  } catch (error) {
    // The variant is fixed once a chapter is started (or the course is finished). Another tab or a
    // stale page can still send the form, so go to the course instead of showing an error page.
    if (error instanceof ApiError && error.status === 409) redirect(`/courses/${courseSlug}`);
    throw error;
  }
  revalidatePath(`/courses/${result.courseSlug}`, "layout");
  // A variant is chosen before the first chapter, so go straight into it.
  redirect(`/courses/${result.courseSlug}?start=1`);
}

export async function chooseCourseSpecialisationAction(formData: FormData): Promise<void> {
  const courseSlug = readField(formData, "courseSlug");
  const specialisationSlug = readField(formData, "specialisationSlug");
  const result = await serverApiFetch<UpdateCourseTrackResult>(
    `/api/v1/courses/${encodeURIComponent(courseSlug)}/track/specialisation`,
    { method: "PUT", json: { specialisationSlug } }
  );
  revalidatePath(`/courses/${result.courseSlug}`);
  redirect(`/courses/${result.courseSlug}#specialisation`);
}

export async function upgradeCourseCurriculumAction(courseSlug: string): Promise<void> {
  await serverApiFetch<{ success: boolean; releaseId: string }>(
    `/api/v1/courses/${encodeURIComponent(courseSlug)}/upgrade-curriculum`,
    { method: "POST" }
  );
  revalidatePath(`/courses/${courseSlug}`);
}
