import Link from "next/link";
import { redirect } from "next/navigation";
import type { Checkout } from "@/shared/api/catalog";
import {
  requestCourseAccessAction,
  selfEnrollInCourseAction,
} from "@/server/actions/enroll";
import { requireVerifiedUser } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function CourseCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ requested?: string }>;
}) {
  const { courseSlug } = await params;
  const { requested } = await searchParams;
  await requireVerifiedUser();
  const { course, enrollment, state } = await serverApiFetchOrNotFound<Checkout>(
    `/api/v1/courses/${encodeURIComponent(courseSlug)}/checkout`
  );
  if (state === "already_paid") {
    redirect(`/courses/${course.slug}`);
  }

  if (course.pricingType !== "PAID") {
    redirect(`/catalog/${course.slug}`);
  }

  const priceLabel = formatPriceCents(course.priceCents, course.currency);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <Link href={`/catalog/${course.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to course details
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Request course access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Request access to <span className="font-medium text-foreground">{course.title}</span>.
      </p>

      <div className="mt-8 rounded-2xl border bg-card p-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground">Total due</span>
          <span className="text-2xl font-semibold tabular-nums">{priceLabel}</span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          An administrator will contact you to arrange payment and grant access.
        </p>
        {requested === "1" && <p className="mt-4 text-sm">Your request was sent to the administrators.</p>}

        {!enrollment ? (
          <form action={selfEnrollInCourseAction} className="mt-6">
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        ) : (
          <form action={requestCourseAccessAction} className="mt-6">
            <input type="hidden" name="enrollmentId" value={enrollment.id} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <Button type="submit" className="w-full">
              {requested === "1" ? "Send request again" : "Request access"}
            </Button>
          </form>
        )}
      </div>

      <Link href="/my-courses" className={cn(buttonVariants({ variant: "ghost" }), "mt-6 self-center")}>
        My courses
      </Link>
    </div>
  );
}
