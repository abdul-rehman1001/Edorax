import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Headphones, Play } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { COURSE_CATEGORY_INFO } from "@/lib/course-categories";
import { loadListenLibrary, type ListenCourse } from "@/lib/listen-library";
import { formatListenTotal, listenHref } from "@/lib/listen-summary";
import { formatListenMinutes } from "@/lib/narration-format";
import { AreaHero, AreaPage, AreaSection, ComingSoonPanel, StepList } from "@/components/areas/area-page";
import { Dot } from "@/components/brand/dot";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Listen",
  description: "Every Edorax course with listen-along audio, with its chapters and hours. Press play in any chapter and read along.",
  alternates: { canonical: "/listen" },
  openGraph: { title: "Listen on Edorax", url: "/listen", images: [SITE_SHARE_IMAGE] },
};

function ListenCourseCard({ course }: { course: ListenCourse }) {
  const { chapters, totalMinutes } = course.summary;
  const first = chapters[0]!;
  return (
    <li className="flex flex-col border border-border bg-card p-5" data-testid="listen-course">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-primary">
          <Headphones className="size-6" />
        </span>
        <span className="text-sm font-bold tabular-nums text-muted-foreground">
          {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}, {formatListenTotal(totalMinutes)}
        </span>
      </div>
      <h3 className="mt-4 text-xl tracking-[-0.02em]">{course.title}</h3>
      <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-base text-muted-foreground">{course.description ?? ""}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={listenHref(course.slug, first.slug)} className={buttonVariants({ size: "sm" })}>
          <Play className="size-4" aria-hidden />
          Listen from the start
        </Link>
        <Link href={`/catalog/${course.slug}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          About the course
        </Link>
      </div>
      <details className="group mt-4 border-t border-border pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-bold text-primary outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow [&::-webkit-details-marker]:hidden">
          Every chapter
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="mt-1 max-h-72 space-y-0.5 overflow-y-auto pr-1">
          {chapters.map((chapter, i) => (
            <li key={chapter.slug}>
              <Link
                href={listenHref(course.slug, chapter.slug)}
                className="flex min-h-10 items-center gap-3 rounded-sm px-2 text-[15px] outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-brand-yellow"
              >
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatListenMinutes(chapter.minutes)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

export default async function ListenPage() {
  const area = areaById("listen");
  const { courses, catalogReachable } = await loadListenLibrary();
  const chapterCount = courses.reduce((sum, course) => sum + course.summary.chapters.length, 0);
  const minutes = courses.reduce((sum, course) => sum + course.summary.totalMinutes, 0);
  const sections = COURSE_CATEGORY_INFO.map((category) => ({
    ...category,
    courses: courses.filter((course) => course.category === category.value),
  })).filter((section) => section.courses.length > 0);

  return (
    <AreaPage>
      <AreaHero
        eyebrow="Listen"
        title={area.name}
        status={area.status}
        mood="happy"
        intro="Courses read aloud, chapter by chapter. Pick a course, press play and read along, or just listen on a walk. Your place in each chapter is kept on this device."
      >
        {courses.length > 0 ? (
          <dl className="flex flex-wrap gap-x-8 gap-y-3" data-testid="listen-totals">
            {[
              ["Courses", String(courses.length)],
              ["Chapters", String(chapterCount)],
              ["Listening", formatListenTotal(minutes)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums tracking-[-0.02em]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </AreaHero>

      {sections.length > 0 ? (
        sections.map((section) => (
          <AreaSection key={section.value} id={`listen-${section.param}`} title={section.label} intro={section.description}>
            {/* items-start: opening one card's chapter list must not stretch the others in its row. */}
            <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.courses.map((course) => (
                <ListenCourseCard key={course.slug} course={course} />
              ))}
            </ul>
          </AreaSection>
        ))
      ) : (
        <div className="mt-10 flex flex-col items-center border border-border bg-card px-6 py-14 text-center" data-testid="listen-empty">
          <Dot mood="sleep" size={112} />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">
            {catalogReachable ? "No audio yet" : "Courses could not be loaded"}
          </h2>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">
            {catalogReachable
              ? "Courses show up here as soon as their chapters are read aloud."
              : "The course list is not reachable right now. Try again in a moment."}
          </p>
        </div>
      )}

      <AreaSection id="how" title="How listening works">
        <StepList
          steps={[
            { title: "Open a chapter", body: "Every chapter with audio has a Listen player at the top, with its length and download size." },
            { title: "Read along or just listen", body: "The text stays on screen, so you can follow it, or look away and just listen." },
            { title: "Any speed", body: "From 0.75x up to 4x, in quarter steps." },
            { title: "Pick up where you stopped", body: "Stop halfway and the player resumes from that point next time, on the same device." },
          ]}
        />
      </AreaSection>

      <ComingSoonPanel title="Videos are on the way" action={{ href: "/catalog", label: "Browse courses" }}>
        Short videos for the chapters that are easier to see than to read. They will show up here next to the audio.
      </ComingSoonPanel>
    </AreaPage>
  );
}
