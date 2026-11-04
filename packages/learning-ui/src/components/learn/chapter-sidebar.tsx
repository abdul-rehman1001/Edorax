"use client";

import { useState, useEffect, useRef } from "react";
import { CourseLink as Link } from "./course-navigation";
import { CheckCircle2, ChevronDown, ChevronRight, Menu, X, LayoutDashboard } from "lucide-react";
import { cn } from "../../lib/utils";
import type { SyllabusModule } from "./course-syllabus";
import { SyllabusChapterRow } from "./syllabus-chapter-row";

export type ChapterSidebarProps = {
  courseSlug: string;
  courseTitle: string;
  modules: SyllabusModule[];
  currentChapterSlug: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileSheet?: boolean;
  width?: number;
  onWidthChange?: (width: number) => void;
};

function SidebarPanel({
  courseSlug,
  courseTitle,
  modules,
  activeSlug,
  activeLinkRef,
  openModules,
  toggleModule,
  onToggle,
}: {
  courseSlug: string;
  courseTitle: string;
  modules: SyllabusModule[];
  activeSlug: string;
  activeLinkRef: React.RefObject<HTMLAnchorElement | null>;
  openModules: Set<string>;
  toggleModule: (id: string) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Link
          href={`/courses/${courseSlug}`}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          onClick={onToggle}
        >
          <LayoutDashboard className="size-3.5" />
          Curriculum
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
        >
          <X className="size-4" />
        </button>
      </div>
      <Link
        href={`/courses/${courseSlug}`}
        className="block border-b border-border bg-card px-4 py-3 text-sm font-bold leading-5 text-foreground hover:text-primary"
        onClick={onToggle}
      >
        {courseTitle}
      </Link>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Course chapters">
        {modules.map((mod) => {
          const isOpen = openModules.has(mod.id);
          const moduleHasActive = mod.chapters.some((ch) => ch.slug === activeSlug);
          const moduleComplete =
            mod.chapters.length > 0 && mod.completedCount === mod.chapters.length;

          return (
            <div key={mod.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleModule(mod.id)}
                aria-label={`${mod.title}: ${mod.completedCount} of ${mod.chapters.length} lessons complete${moduleComplete ? ", module complete" : ""}`}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                  moduleHasActive && "bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold tabular-nums",
                    moduleComplete
                      ? "bg-ok-soft text-ok"
                      : moduleHasActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {String(mod.order).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground/90">
                  {mod.title}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {mod.completedCount}/{mod.chapters.length}
                  </span>
                  {moduleComplete ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : null}
                  {isOpen ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <ul className="border-t border-border/60">
                  {mod.chapters.map((chapter) => {
                    const isCurrent = chapter.slug === activeSlug;
                    return (
                      <li key={chapter.id}>
                        <SyllabusChapterRow
                          courseSlug={courseSlug}
                          chapter={chapter}
                          variant="sidebar"
                          isActive={isCurrent}
                          linkRef={isCurrent ? activeLinkRef : undefined}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

export function ChapterSidebar({
  courseSlug,
  courseTitle,
  modules,
  currentChapterSlug,
  collapsed,
  onToggle,
  mobileSheet = false,
  width,
  onWidthChange,
}: ChapterSidebarProps) {
  const activeSlug = currentChapterSlug;
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  const [openModules, setOpenModules] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const mod of modules) {
      if (mod.chapters.some((ch) => ch.slug === activeSlug)) {
        open.add(mod.id);
        break;
      }
    }
    return open;
  });

  const activeModuleId = modules.find((mod) =>
    mod.chapters.some((ch) => ch.slug === activeSlug),
  )?.id;
  const [previousActiveModuleId, setPreviousActiveModuleId] = useState(activeModuleId);
  if (activeModuleId !== previousActiveModuleId) {
    setPreviousActiveModuleId(activeModuleId);
    if (activeModuleId) setOpenModules((prev) => new Set([...prev, activeModuleId]));
  }

  useEffect(() => {
    if (collapsed) return;
    activeLinkRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [activeSlug, collapsed]);

  useEffect(() => {
    if (!mobileSheet || collapsed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSheet, collapsed]);

  const toggleModule = (moduleId: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  if (collapsed) return null;

  const panelProps = {
    courseSlug,
    courseTitle,
    modules,
    activeSlug,
    activeLinkRef,
    openModules,
    toggleModule,
    onToggle,
  };

  if (mobileSheet) {
    return (
      <>
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-foreground md:hidden"
          onClick={onToggle}
        />
        <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-card text-card-foreground md:hidden">
          <SidebarPanel {...panelProps} />
        </aside>
      </>
    );
  }

  return (
    <aside
      className="relative hidden w-72 shrink-0 flex-col border-r border-border bg-card text-card-foreground md:flex"
      style={width ? { width, maxWidth: "calc(100vw - 320px)" } : undefined}
    >
      <SidebarPanel {...panelProps} />
      {width && onWidthChange && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize curriculum sidebar"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={560}
          aria-valuenow={width}
          title="Drag to resize curriculum (double-click to reset)"
          className="absolute inset-y-0 right-0 w-2 cursor-col-resize bg-transparent hover:bg-primary/20 focus-visible:bg-primary/20"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
            onWidthChange(
              Math.max(
                240,
                Math.min(560, window.innerWidth - 320, Math.round(event.clientX - left)),
              ),
            );
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            onWidthChange(
              Math.max(
                240,
                Math.min(
                  560,
                  window.innerWidth - 320,
                  width + (event.key === "ArrowRight" ? 20 : -20),
                ),
              ),
            );
          }}
          onDoubleClick={() => onWidthChange(288)}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border" />
        </div>
      )}
    </aside>
  );
}

export function SidebarToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-11 place-items-center rounded-md text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-yellow"
      aria-label={collapsed ? "Show contents" : "Hide contents"}
    >
      {collapsed ? <Menu className="size-5" /> : <X className="size-5" />}
    </button>
  );
}
