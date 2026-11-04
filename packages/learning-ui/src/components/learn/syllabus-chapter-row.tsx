"use client";

import { CourseLink as Link } from "./course-navigation";
import { CheckCircle2, CircleDot, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import type { SyllabusChapter } from "./course-syllabus";

export function ChapterStatusIcon({
  status,
  locked,
}: {
  status: SyllabusChapter["status"];
  locked?: boolean;
}) {
  if (locked) {
    return <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
  if (status === "COMPLETED") {
    return (
      <CheckCircle2
        className="size-4 shrink-0 text-ok"
        aria-hidden
      />
    );
  }
  if (status === "IN_PROGRESS") {
    return <CircleDot className="size-4 shrink-0 text-primary" aria-hidden />;
  }
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/55"
      aria-hidden
    />
  );
}

function ChapterMeta({ chapter }: { chapter: SyllabusChapter }) {
  if (chapter.locked) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground">
        {chapter.unlocksAfter ? `Unlocks after ${chapter.unlocksAfter}` : "Locked"}
      </span>
    );
  }
  if (chapter.blockCount > 0) {
    return (
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {chapter.blocksCompleted ?? 0}/{chapter.blockCount} checkpoints
      </span>
    );
  }
  return null;
}

function SidebarChapterMeta({ chapter }: { chapter: SyllabusChapter }) {
  if (chapter.locked) {
    return (
      <span className="text-xs text-muted-foreground">
        {chapter.unlocksAfter ? `Unlocks after ${chapter.unlocksAfter}` : "Locked until the previous lesson is complete"}
      </span>
    );
  }
  if (chapter.blockCount > 0) {
    const completed = chapter.blocksCompleted ?? 0;
    const complete = completed === chapter.blockCount;
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-1 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className={cn("block h-full rounded-full", complete ? "bg-ok" : "bg-foreground/45")}
            style={{ width: `${Math.round((completed / chapter.blockCount) * 100)}%` }}
          />
        </span>
        {completed}/{chapter.blockCount} checkpoints
      </span>
    );
  }
  return null;
}

export function SyllabusChapterRow({
  courseSlug,
  chapter,
  variant,
  isActive,
  linkRef,
}: {
  courseSlug: string;
  chapter: SyllabusChapter;
  variant: "syllabus" | "sidebar";
  isActive?: boolean;
  linkRef?: React.Ref<HTMLAnchorElement>;
}) {
  const href = `/courses/${courseSlug}/${chapter.slug}`;

  if (variant === "syllabus") {
    return (
      <Link
        ref={linkRef}
        href={href}
        className={cn(
          "group flex items-center justify-between gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-muted/50",
          chapter.locked && "opacity-90",
          chapter.status === "IN_PROGRESS" && "bg-muted/25",
          chapter.status === "COMPLETED" &&
            "bg-ok-soft"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <ChapterStatusIcon status={chapter.status} locked={chapter.locked} />
          <span
            className={cn(
              "truncate font-medium transition-colors",
              chapter.locked || chapter.status === "COMPLETED"
                ? "text-muted-foreground group-hover:text-foreground/90"
                : "text-foreground"
            )}
          >
            {chapter.title}
          </span>
        </span>
        <ChapterMeta chapter={chapter} />
      </Link>
    );
  }

  return (
    <Link
      ref={linkRef}
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-start gap-2.5 py-2.5 pl-12 pr-4 text-sm transition-colors",
        isActive
          ? "bg-muted font-medium text-foreground before:absolute before:inset-y-1 before:left-3 before:w-0.5 before:rounded-full before:bg-foreground"
          : chapter.locked
            ? "text-muted-foreground hover:bg-muted/60 hover:text-muted-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <ChapterStatusIcon status={chapter.status} locked={chapter.locked} />
      <span className="min-w-0 flex-1">
        <span className="block break-words leading-5">{chapter.title}</span>
        <span className="mt-1 block">
          <SidebarChapterMeta chapter={chapter} />
        </span>
      </span>
    </Link>
  );
}
