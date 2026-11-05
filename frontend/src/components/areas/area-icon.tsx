import { BookOpenText, FlaskConical, ListChecks, Mic, Puzzle, Sparkles, Terminal, Workflow, type LucideIcon } from "lucide-react";
import type { LabKindId, LearnAreaId } from "@/lib/learn-areas";

export const AREA_ICON: Record<LearnAreaId, LucideIcon> = {
  courses: BookOpenText,
  labs: FlaskConical,
  practice: Sparkles,
  puzzles: Puzzle,
  voice: Mic,
};

export const LAB_KIND_ICON: Record<LabKindId, LucideIcon> = {
  visual: Workflow,
  guided: ListChecks,
  shell: Terminal,
};
