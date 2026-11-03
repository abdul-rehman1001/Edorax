"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SyllabusModule } from "../../shared/api/syllabus";

type ChapterLinkContextValue = {
  courseSlug: string;
  resolveChapterUrl: (lessonLabel: string) => string | null;
};

const ChapterLinkContext = createContext<ChapterLinkContextValue | null>(null);

export function useChapterLink() {
  return useContext(ChapterLinkContext);
}

function canonicalLessonLabel(label: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})$/.exec(label.trim());
  if (!match) return null;
  return `${Number(match[1])}.${Number(match[2])}`;
}

function buildChapterMap(modules: SyllabusModule[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const module of modules) {
    for (let i = 0; i < module.chapters.length; i++) {
      const chapter = module.chapters[i];
      if (!chapter) continue;
      const chapterOrder = (chapter as { order?: number }).order ?? i + 1;
      const label = canonicalLessonLabel(`${module.order}.${chapterOrder}`);
      if (label) map.set(label, chapter.slug);
    }
  }
  return map;
}

export function ChapterLinkProvider({
  courseSlug,
  modules,
  children,
}: {
  courseSlug: string;
  modules: SyllabusModule[];
  children: ReactNode;
}) {
  const chapterMap = useMemo(() => buildChapterMap(modules), [modules]);

  const value = useMemo<ChapterLinkContextValue>(
    () => ({
      courseSlug,
      resolveChapterUrl: (lessonLabel: string) => {
        const slug = chapterMap.get(canonicalLessonLabel(lessonLabel) ?? "");
        if (!slug) return null;
        return `/courses/${courseSlug}/${slug}`;
      },
    }),
    [courseSlug, chapterMap]
  );

  return <ChapterLinkContext.Provider value={value}>{children}</ChapterLinkContext.Provider>;
}
