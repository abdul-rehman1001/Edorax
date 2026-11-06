import { enrollmentLabel } from "@buildment/learning-ui/components/learn/enrollment-badge";
import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { CourseCategory } from "@/shared/domain/enums";
import { getSessionUser } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { COURSE_CATEGORY_INFO, categoryFromParam } from "@/lib/course-categories";
import { CatalogCourseCard } from "@/components/learn/catalog-course-card";
import { CatalogCategoryTiles } from "@/components/learn/catalog-category-tiles";
import { Dot } from "@/components/brand/dot";

function CourseGrid({ courses }: { courses: CatalogCourseSummary[] }) {
  return (
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const enrolledLabel = enrollmentLabel(course.enrollmentLifecycle);

        return (
          <li key={course.id}>
            <CatalogCourseCard
              slug={course.slug}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
              difficulty={course.difficulty}
              estimatedHours={course.estimatedHours}
              pricingType={course.pricingType}
              priceCents={course.priceCents}
              currency={course.currency}
              instructorName={course.instructorName}
              enrolledLabel={enrolledLabel}
            />
          </li>
        );
      })}
    </ul>
  );
}

export const metadata: Metadata = {
  title: "Explore courses",
  description: "Explore courses in tech and soft skills: networking, system design, product sense, communication and more.",
  alternates: { canonical: "/catalog" },
  openGraph: { title: "Courses on Edorax", url: "/catalog", images: [SITE_SHARE_IMAGE] },
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await getSessionUser();
  const { courses } = await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog");
  const active = categoryFromParam((await searchParams).category);

  const counts = { TECH: 0, SOFT_SKILLS: 0 } as Record<CourseCategory, number>;
  for (const course of courses) counts[course.category] += 1;

  // "All" shows every category as its own section; a tile shows one category on its own.
  const sections = COURSE_CATEGORY_INFO.filter((category) => active === null || category.value === active)
    .map((category) => ({ ...category, courses: courses.filter((course) => course.category === category.value) }))
    .filter((section) => section.courses.length > 0 || active !== null);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Explore courses</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
          {user ? "Explore the catalog and find the next course for your learning goals." : "Look inside any course. You only need an account to enroll."}
        </p>
        {courses.length > 0 ? <CatalogCategoryTiles counts={counts} total={courses.length} active={active} /> : null}
      </header>

      {courses.length === 0 ? (
        <div className="mt-10 flex flex-col items-center border border-border bg-card px-6 py-14 text-center">
          <Dot mood="sleep" size={112} />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">No courses yet</h2>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">New courses show up here when they are published.</p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.value} aria-labelledby={`catalog-${section.param}`} className="mt-10">
            <h2 id={`catalog-${section.param}`} className="text-2xl tracking-[-0.02em]">
              {section.label}
            </h2>
            <p className="mt-1 text-base text-muted-foreground">{section.description}</p>
            {section.courses.length > 0 ? (
              <CourseGrid courses={section.courses} />
            ) : (
              <p className="mt-5 text-base text-muted-foreground">No courses in this category yet.</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
