import Link from "next/link";
import { AdminCourseCouponsPanel, type AdminCourseCoupon } from "@/components/admin/admin-course-coupons-panel";
import { AdminBackLink, AdminPageHeader } from "@/components/admin/admin-ui";
import { serverApiFetchOrNotFound } from "@/lib/api-server";

export default async function AdminCourseCouponsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const view = await serverApiFetchOrNotFound<{ course: { id: string; title: string; slug: string; pricingType: string }; coupons: AdminCourseCoupon[] }>(
    `/api/v1/admin/courses/${encodeURIComponent(courseId)}/coupons`
  );
  return <div>
    <AdminBackLink href="/admin/courses">← Courses</AdminBackLink>
    <div className="mt-4"><AdminPageHeader eyebrow="Course discounts" title={view.course.title} description="Create shareable coupon codes or automatic discounts. The best available automatic offer is applied when a learner enrolls." /></div>
    {view.course.pricingType !== "PAID" ? <p className="mt-6 rounded-xl border p-4 text-sm text-muted-foreground">This course is free. Set it as paid before creating discounts.</p> : <AdminCourseCouponsPanel courseId={courseId} coupons={view.coupons} />}
  </div>;
}
