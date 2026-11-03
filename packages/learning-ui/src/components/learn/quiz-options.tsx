"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export type QuizOption = { id: string; label: string };

type QuizOptionsProps = {
  options: QuizOption[];
  selected: string[];
  onToggle: (optionId: string) => void;
  disabled?: boolean;
  multiple?: boolean;
  incorrectOptionIds?: string[];
  correctOptionIds?: string[];
  showAnswerState?: boolean;
};

/**
 * Answer choices. One answer is a radio group and several answers are checkboxes, so a screen reader
 * announces them correctly. Each row is a full-width target of at least 56px with 17px text.
 */
export function QuizOptions({
  options,
  selected,
  onToggle,
  disabled = false,
  multiple = false,
  incorrectOptionIds = [],
  correctOptionIds = [],
  showAnswerState = false,
}: QuizOptionsProps) {
  const incorrectSet = new Set(incorrectOptionIds);
  const correctSet = new Set(correctOptionIds);

  return (
    <div role={multiple ? "group" : "radiogroup"} className="flex flex-col gap-3">
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        const isIncorrect = showAnswerState && incorrectSet.has(option.id);
        const isCorrect = showAnswerState && correctSet.has(option.id);
        const plain = !isIncorrect && !isCorrect;

        return (
          <button
            key={option.id}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={isSelected}
            onClick={() => !disabled && onToggle(option.id)}
            disabled={disabled}
            className={cn(
              "flex min-h-14 w-full items-center gap-3.5 rounded-md border-2 px-4 py-3 text-left text-[17px] leading-snug outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
              plain && !isSelected && "border-border bg-card text-foreground",
              plain && !isSelected && !disabled && "cursor-pointer hover:border-primary",
              plain && isSelected && "border-primary bg-secondary font-bold text-foreground",
              disabled && plain && !isSelected && "cursor-default text-muted-foreground",
              isIncorrect && "border-foreground bg-brand-yellow/15 text-foreground",
              isCorrect && "border-ok bg-ok-soft font-bold text-foreground"
            )}
          >
            <span aria-hidden className="shrink-0">
              <span
                className={cn(
                  "flex size-6 items-center justify-center border-2 transition-colors",
                  multiple ? "rounded-sm" : "rounded-full",
                  isIncorrect && "border-foreground bg-foreground/10",
                  isCorrect && "border-ok bg-ok",
                  plain && (isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground bg-card")
                )}
              >
                {isSelected ? (
                  multiple ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke={isCorrect ? "white" : "currentColor"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        isCorrect ? "bg-white" : isIncorrect ? "bg-foreground" : "bg-primary-foreground"
                      )}
                    />
                  )
                ) : null}
              </span>
            </span>
            <span className="min-w-0 flex-1">{option.label}</span>
            {isIncorrect ? <XCircle className="size-5 shrink-0 text-foreground" aria-label="Not right" /> : null}
            {isCorrect ? <CheckCircle2 className="size-5 shrink-0 text-ok" aria-label="Right" /> : null}
          </button>
        );
      })}
    </div>
  );
}
