"use client";

import { createContext, useContext } from "react";

export type QuizBlockGrade = {
  selected: string[];
  isCorrect: boolean | null;
  explanation?: string;
  /** Present once the learner is allowed to see the right answer. */
  correctOptionIds?: string[];
};

export type QuizSessionContextValue = {
  chapterTitle: string;
  questionTotal: number;
  reviewMode: boolean;
  dirtyBlockIds: ReadonlySet<string>;
  blockGrades: Record<string, QuizBlockGrade>;
  /** Advance the proctored attempt after a wrong LLM short-answer try. */
  reportWrongAttempt?: () => void;
};

export const QuizSessionContext = createContext<QuizSessionContextValue | null>(null);

export function useQuizSession() {
  return useContext(QuizSessionContext);
}
