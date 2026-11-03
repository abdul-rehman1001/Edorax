import type { ProgressStatus } from "../../generated/prisma/index.js";
import { flattenChapterIds, lockedChapterIds } from "./rules.js";
import type { SyllabusChapter, SyllabusModule } from "../../types/syllabus.js";

type ModuleInput = {
  id: string;
  order: number;
  title: string;
  chapters: Array<{
    id: string;
    slug: string;
    title: string;
    order: number;
    blockCount: number;
    blocksCompleted?: number;
  }>;
};

export function decorateSyllabus(args: {
  modules: ModuleInput[];
  progressByChapter: Map<string, ProgressStatus>;
  sequential: boolean;
  bypassLocking?: boolean;
}): SyllabusModule[] {
  const orderedIds = flattenChapterIds(args.modules);
  const sequential = args.bypassLocking ? false : args.sequential;
  const lockedIds = lockedChapterIds(orderedIds, args.progressByChapter, sequential);
  const titleById = new Map(args.modules.flatMap((mod) => mod.chapters.map((chapter) => [chapter.id, chapter.title])));
  const unlocksAfterById = new Map<string, string>();
  for (let index = 1; index < orderedIds.length; index += 1) {
    const previousTitle = titleById.get(orderedIds[index - 1]!);
    if (previousTitle) unlocksAfterById.set(orderedIds[index]!, previousTitle);
  }

  return args.modules.map((mod) => {
    const chapters: SyllabusChapter[] = mod.chapters.map((chapter) => ({
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      order: chapter.order,
      status: args.progressByChapter.get(chapter.id) ?? "NOT_STARTED",
      blockCount: chapter.blockCount,
      blocksCompleted: chapter.blocksCompleted ?? 0,
      locked: lockedIds.has(chapter.id),
      unlocksAfter: lockedIds.has(chapter.id) ? unlocksAfterById.get(chapter.id) ?? null : null,
    }));
    return {
      id: mod.id,
      order: mod.order,
      title: mod.title,
      chapters,
      completedCount: chapters.filter((chapter) => chapter.status === "COMPLETED").length,
    };
  });
}
