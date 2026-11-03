"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, CloudOff, Loader2, NotebookPen, Save } from "lucide-react";
import { AnswerTextareaWithMic } from "@buildment/learning-ui/components/learn/answer-textarea-with-mic";
import { cn } from "../../lib/utils";
import { inlineMarkdownToText, parseInlineMarkdown } from "../../lib/inline-markdown";

type LearningLogAnswers = Record<string, string>;

export type LearningLogQuestionData = {
  id: string;
  title: string;
  hint?: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const VARIANT_STYLES = {
  gate: {
    border: "border-border",
    headerBg: "border-b border-border bg-muted/35",
    headerText: "text-foreground",
    subText: "text-muted-foreground",
    iconBg: "border border-border bg-background",
    bodyBg: "bg-card",
    progress: "bg-muted",
    progressFill: "bg-foreground",
    badge: "bg-muted text-muted-foreground",
    questionRing: "focus-visible:ring-foreground/15",
    questionBorder: "border-border focus-visible:border-foreground/40",
  },
  default: {
    border: "border-border",
    headerBg: "bg-muted/50 border-b border-border",
    headerText: "text-foreground",
    subText: "text-muted-foreground",
    iconBg: "border border-border bg-background",
    bodyBg: "bg-card",
    progress: "bg-muted",
    progressFill: "bg-foreground",
    badge: "bg-muted text-muted-foreground",
    questionRing: "focus-visible:ring-foreground/15",
    questionBorder: "border-border focus-visible:border-foreground/40",
  },
} as const;

function LearningLogQuestion({
  index,
  question,
  value,
  onChange,
  styles,
}: {
  index: number;
  question: LearningLogQuestionData;
  value: string;
  onChange: (text: string) => void;
  styles: (typeof VARIANT_STYLES)[keyof typeof VARIANT_STYLES];
}) {
  const answered = value.trim().length > 0;

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums",
            answered
              ? "bg-ok-soft text-ok ring-1 ring-ok"
              : "bg-muted text-muted-foreground"
          )}
        >
          {answered ? <CheckCircle2 className="size-4" aria-hidden /> : index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[15px] font-semibold leading-snug text-foreground">
              {parseInlineMarkdown(question.title)}
            </p>
            {question.hint ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {parseInlineMarkdown(question.hint)}
              </p>
            ) : null}
          </div>
          <AnswerTextareaWithMic
            value={value}
            onChange={onChange}
            enableSpeech
            placeholder="Write what you learned…"
            rows={4}
            ariaLabel={inlineMarkdownToText(question.title)}
            className={cn(
              "placeholder:text-muted-foreground/70",
              styles.questionBorder,
              styles.questionRing
            )}
          />
        </div>
      </div>
    </li>
  );
}

export function LearningLog({
  title = "Share what you learned",
  instruction,
  questions,
  variant = "default",
  initialAnswers = {},
  onSave,
}: {
  title?: string;
  instruction?: string;
  questions: LearningLogQuestionData[] | string;
  variant?: keyof typeof VARIANT_STYLES;
  initialAnswers?: LearningLogAnswers;
  onSave?: (answers: LearningLogAnswers) => Promise<{ ok: boolean; savedAt?: string }>;
}) {
  // Old snapshots may contain the editor's quoted JSON form. Normalizing at
  // the boundary prevents a malformed prop from crashing `.filter()`/`.map()`.
  const normalizedQuestions = useMemo(() => {
    let value: unknown = questions;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is LearningLogQuestionData =>
      Boolean(item && typeof item.id === "string" && item.id && typeof item.title === "string" && item.title)
    );
  }, [questions]);
  const styles = VARIANT_STYLES[variant];

  const [answers, setAnswers] = useState<LearningLogAnswers>(() => {
    const initial: LearningLogAnswers = {};
    for (const q of normalizedQuestions) {
      initial[q.id] = initialAnswers[q.id] ?? "";
    }
    return initial;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<LearningLogAnswers>({});

  const [previousInitialAnswers, setPreviousInitialAnswers] = useState(initialAnswers);
  if (initialAnswers !== previousInitialAnswers) {
    setPreviousInitialAnswers(initialAnswers);
    setAnswers((prev) => ({ ...prev, ...initialAnswers }));
  }

  const flushSave = useCallback(async () => {
    if (!onSave) return;
    const payload = { ...pendingRef.current };
    pendingRef.current = {};
    if (Object.keys(payload).length === 0) return;

    setSaveStatus("saving");
    const result = await onSave(payload);
    if (result.ok) {
      setSaveStatus("saved");
      setLastSavedAt(result.savedAt ?? null);
    } else {
      setSaveStatus("error");
      pendingRef.current = { ...payload, ...pendingRef.current };
    }
  }, [onSave]);

  const scheduleSave = useCallback(
    (questionId: string, text: string) => {
      pendingRef.current[questionId] = text;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushSave();
      }, 900);
    },
    [flushSave]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void flushSave();
    };
  }, [flushSave]);

  const updateAnswer = useCallback(
    (questionId: string, text: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: text }));
      if (onSave) scheduleSave(questionId, text);
    },
    [onSave, scheduleSave]
  );

  const answeredCount = useMemo(
    () => normalizedQuestions.filter((q) => answers[q.id]?.trim()).length,
    [normalizedQuestions, answers]
  );
  const total = normalizedQuestions.length;
  const progress = total > 0 ? (answeredCount / total) * 100 : 0;
  const allAnswered = total > 0 && answeredCount === total;

  const announcedCompleteRef = useRef(false);
  useEffect(() => {
    if (!allAnswered) {
      announcedCompleteRef.current = false;
      return;
    }
    if (saveStatus !== "saved" || announcedCompleteRef.current) return;
    announcedCompleteRef.current = true;
    window.dispatchEvent(new CustomEvent("buildment:reflection-complete"));
  }, [allAnswered, saveStatus]);

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved to your account"
        : saveStatus === "error"
          ? "Could not save — retrying on next edit"
          : onSave
            ? "Answers save automatically"
            : "Answers stay on this device";

  return (
    <div
      className={cn(
        "not-prose my-8 overflow-hidden rounded-xl border ",
        styles.border,
        styles.bodyBg
      )}
      data-learning-log
      data-learning-log-variant={variant}
    >
      <div className={cn("px-5 py-4", styles.headerBg)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                styles.iconBg
              )}
            >
              <NotebookPen
                className="size-5 text-muted-foreground"
              />
            </div>
            <div>
              <p
                className={cn(
                  "text-xs font-bold uppercase tracking-widest",
                  styles.subText
                )}
              >
                What you learned
              </p>
              <p className={cn("mt-0.5 text-base font-semibold leading-snug", styles.headerText)}>
                {(title || "Share what you learned").replace(/^(learning log|reflect on your work)\s*[—–-]?\s*/i, "") || "Share what you learned"}
              </p>
              {instruction ? (
                <p className={cn("mt-1.5 text-sm leading-relaxed", styles.subText)}>
                  {parseInlineMarkdown(instruction)}
                </p>
              ) : (
                <p className={cn("mt-1 text-sm", styles.subText)}>
                  Capture the decisions, discoveries, and proof from this lesson. Your notes are saved privately.
                </p>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              styles.badge
            )}
          >
            {answeredCount}/{total}
          </span>
        </div>

        <div className={cn("mt-4 h-1.5 overflow-hidden rounded-full", styles.progress)}>
          <div
            className={cn("h-full rounded-full transition-all duration-300 ease-out", styles.progressFill)}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={total}
          />
        </div>

        <div
          className={cn(
            "mt-3 flex items-center gap-1.5 text-xs",
            "text-muted-foreground"
          )}
        >
          {saveStatus === "saving" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : saveStatus === "error" ? (
            <CloudOff className="size-3.5 text-foreground" aria-hidden />
          ) : (
            <Save className="size-3.5 opacity-70" aria-hidden />
          )}
          <span>{saveLabel}</span>
          {lastSavedAt && saveStatus === "saved" ? (
            <span className="opacity-70">
              · {new Date(lastSavedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      </div>

      <ol className="space-y-3 p-4 sm:p-5">
        {normalizedQuestions.map((question, index) => (
          <LearningLogQuestion
            key={question.id}
            index={index}
            question={question}
            value={answers[question.id] ?? ""}
            onChange={(text) => updateAnswer(question.id, text)}
            styles={styles}
          />
        ))}
      </ol>

      {allAnswered ? (
        <div className="border-t border-ok bg-ok-soft px-5 py-3.5" data-learning-log-complete>
          <p className="flex items-center gap-2 text-sm font-medium text-ok">
            <CheckCircle2 className="size-4 shrink-0 text-ok" />
            Reflection saved — you have captured what you learned in this chapter.
          </p>
        </div>
      ) : null}
    </div>
  );
}
