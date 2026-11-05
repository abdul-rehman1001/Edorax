// String unions mirroring the Prisma enums in server/prisma/schema.prisma.
// The server pins them against the generated client in a type test, so a schema
// change that forgets this file fails `tsc` instead of drifting silently.

export const ROLES = ["MENTEE", "MENTOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const BLOCK_TYPES = [
  "QUIZ",
  "TEST",
  "MUST_READ",
  "OPEN_QUESTION",
  "CODE",
  "STEPS",
  "PROJECT_PREVIEW",
  "LEARNING_OBJECTIVES",
  "CHAPTER_RECAP",
  "PREDICT",
  "VIDEO",
  "VISUAL_WALKTHROUGH",
  "VISUAL_DIAGRAM",
  "ROADMAP",
  "AI_INTERVIEW",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const RESPONSE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "AUTO_GRADED",
  "PENDING_REVIEW",
  "REVIEWED",
  "NEEDS_REVISION",
] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const PROGRESS_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export const ENROLLMENT_LIFECYCLES = [
  "PENDING_ACCOUNT",
  "PAYMENT_REQUIRED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type EnrollmentLifecycle = (typeof ENROLLMENT_LIFECYCLES)[number];

export const STUDY_SESSION_STATUSES = ["RUNNING", "PAUSED", "ENDED"] as const;
export type StudySessionStatus = (typeof STUDY_SESSION_STATUSES)[number];

export const ENROLL_STATUSES = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "DROPPED"] as const;
export type EnrollStatus = (typeof ENROLL_STATUSES)[number];

export const HELP_THREAD_STATUSES = ["OPEN", "RESOLVED"] as const;
export type HelpThreadStatus = (typeof HELP_THREAD_STATUSES)[number];

export const WEEKLY_GOAL_KINDS = ["SESSIONS", "CHAPTERS", "MINUTES"] as const;
export type WeeklyGoalKind = (typeof WEEKLY_GOAL_KINDS)[number];

export const GOAL_PERIODS = ["DAILY", "WEEKLY"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const REVIEW_VERDICTS = ["APPROVED", "NEEDS_REVISION"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const COURSE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_CATEGORIES = ["TECH", "SOFT_SKILLS", "CLOUD_DEVOPS"] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

/** How course.yaml spells each category (`category: cloud-devops`). */
export const COURSE_CATEGORY_SOURCE_VALUES = ["tech", "soft-skills", "cloud-devops"] as const;
export type CourseCategorySource = (typeof COURSE_CATEGORY_SOURCE_VALUES)[number];

/** The stored category for a course.yaml value; anything missing or unknown is Tech. */
export function courseCategoryFromSource(value: string | undefined | null): CourseCategory {
  if (value === "soft-skills") return "SOFT_SKILLS";
  if (value === "cloud-devops") return "CLOUD_DEVOPS";
  return "TECH";
}

export const COURSE_PRICING_TYPES = ["FREE", "PAID"] as const;
export type CoursePricingType = (typeof COURSE_PRICING_TYPES)[number];

export const CHAPTER_READER_MODES = ["DEFAULT", "QUIZ"] as const;
export type ChapterReaderMode = (typeof CHAPTER_READER_MODES)[number];

/** Shared by organisation course requests and instructor access requests. */
export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Types of notifications that can be sent to users. */
export const NOTIFICATION_TYPES = [
  "HELP_THREAD_MESSAGE",
  "HELP_THREAD_RESOLVED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
