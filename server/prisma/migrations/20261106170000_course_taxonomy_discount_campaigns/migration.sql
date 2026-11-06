ALTER TABLE "Course" ADD COLUMN "subcategory" TEXT;
ALTER TABLE "Course" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TYPE "DiscountTargetScope" AS ENUM ('ALL', 'CATEGORY', 'SUBCATEGORY', 'TAG', 'SELECTED_COURSES');

DROP INDEX "InstructorCoupon_code_key";
CREATE UNIQUE INDEX "InstructorCoupon_courseId_code_key" ON "InstructorCoupon"("courseId", "code");
ALTER TABLE "InstructorCoupon" ADD COLUMN "campaignId" TEXT;

CREATE TABLE "CourseDiscountCampaign" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "code" TEXT,
  "scope" "DiscountTargetScope" NOT NULL,
  "category" "CourseCategory",
  "subcategory" TEXT,
  "tag" TEXT,
  "courseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "percentOff" INTEGER NOT NULL,
  "maxRedemptions" INTEGER NOT NULL,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "autoApply" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseDiscountCampaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseDiscountCampaign_code_key" ON "CourseDiscountCampaign"("code");
CREATE INDEX "CourseDiscountCampaign_active_scope_idx" ON "CourseDiscountCampaign"("active", "scope");
CREATE INDEX "CourseDiscountCampaign_category_active_idx" ON "CourseDiscountCampaign"("category", "active");
CREATE INDEX "CourseDiscountCampaign_subcategory_active_idx" ON "CourseDiscountCampaign"("subcategory", "active");
ALTER TABLE "CourseDiscountCampaign" ADD CONSTRAINT "CourseDiscountCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorCoupon" ADD CONSTRAINT "InstructorCoupon_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CourseDiscountCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
