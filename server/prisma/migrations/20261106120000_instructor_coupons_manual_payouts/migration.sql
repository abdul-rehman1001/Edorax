CREATE TYPE "InstructorPayoutStatus" AS ENUM ('NOT_DUE', 'PENDING', 'PAID');

CREATE TABLE "InstructorCoupon" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "maxRedemptions" INTEGER NOT NULL,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstructorCoupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstructorCoupon_code_key" ON "InstructorCoupon"("code");
CREATE INDEX "InstructorCoupon_courseId_active_idx" ON "InstructorCoupon"("courseId", "active");
ALTER TABLE "InstructorCoupon" ADD CONSTRAINT "InstructorCoupon_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorCoupon" ADD CONSTRAINT "InstructorCoupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstructorCouponRedemption" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstructorCouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstructorCouponRedemption_enrollmentId_key" ON "InstructorCouponRedemption"("enrollmentId");
CREATE INDEX "InstructorCouponRedemption_couponId_redeemedAt_idx" ON "InstructorCouponRedemption"("couponId", "redeemedAt");
ALTER TABLE "InstructorCouponRedemption" ADD CONSTRAINT "InstructorCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "InstructorCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorCouponRedemption" ADD CONSTRAINT "InstructorCouponRedemption_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorCouponRedemption" ADD CONSTRAINT "InstructorCouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "instructorShareCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "instructorPayoutStatus" "InstructorPayoutStatus" NOT NULL DEFAULT 'NOT_DUE';
ALTER TABLE "Payment" ADD COLUMN "instructorPayoutPaidAt" TIMESTAMP(3);
