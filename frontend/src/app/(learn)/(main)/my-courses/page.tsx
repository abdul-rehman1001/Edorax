import type { Metadata } from "next";
import Link from "next/link";
import { Dot } from "@/components/brand/dot";
import { CoursesTabs } from "@/components/learn/courses-tabs";
import { buttonVariants } from "@/components/ui/button";
import { MenteeCourseList } from "@/components/learn/dashboard/mentee-dashboard";
import type { MenteeDashboardViewModel } from "@/shared/api/learner";
import { requireLearnSurface } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";

export const metadata: Metadata = { title: "My courses" };

export default async function MenteeCoursesPage() {
  await requireLearnSurface();
  const model = await serverApiFetch<MenteeDashboardViewModel>("/api/v1/learner/dashboard");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">My courses</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">Pick up where you left off, review your lessons, or open a course you have joined.</p>
        <div className="mt-6">
          <CoursesTabs active="mine" />
        </div>
      </header>

      {model.courses.length > 0 ? (
        <div className="mt-8">
          <MenteeCourseList courses={model.courses} showHeading={false} primaryCourseId={model.primaryCourse?.id} />
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center border border-border bg-card px-6 py-14 text-center">
          <Dot mood="sleep" size={112} />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">You have not joined a course yet</h2>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">
            Pick one from the list. If a mentor sent you a link, open it to join.
          </p>
          <Link href="/catalog" className={buttonVariants({ className: "mt-6" })}>
            Browse courses
          </Link>
        </div>
      )}
    </div>
  );
}
