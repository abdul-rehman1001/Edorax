import type { CourseCategory } from "@/shared/domain/enums";

/** Catalog categories in display order, with the URL value used by `?category=`. */
export const COURSE_CATEGORY_INFO: Array<{
  value: CourseCategory;
  param: string;
  label: string;
  description: string;
}> = [
  {
    value: "TECH",
    param: "tech",
    label: "Tech",
    description: "Build and ship real software projects.",
  },
  {
    value: "SOFT_SKILLS",
    param: "soft-skills",
    label: "Soft skills",
    description: "Decide, communicate and work well with people.",
  },
  {
    value: "CLOUD_DEVOPS",
    param: "cloud-devops",
    label: "Cloud and DevOps",
    description: "Containers, cloud services and the systems that keep software running.",
  },
];

export function categoryFromParam(param: string | undefined): CourseCategory | null {
  return COURSE_CATEGORY_INFO.find((category) => category.param === param)?.value ?? null;
}
