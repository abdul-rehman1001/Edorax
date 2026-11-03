// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Syllabus view model shared by the course overview, progress and reader screens.

export type SyllabusChapter = {
  id: string;
  slug: string;
  title: string;
  /** 1-based order inside the module. Lesson labels such as chapter 1.2 use this with the module order. */
  order?: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  blockCount: number;
  blocksCompleted?: number;
  locked?: boolean;
  unlocksAfter?: string | null;
};

export type SyllabusModule = {
  id: string;
  order: number;
  title: string;
  chapters: SyllabusChapter[];
  completedCount: number;
};
