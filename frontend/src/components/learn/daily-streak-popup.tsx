"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Flame, Share2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import type { StreakPopupDayView, StreakPopupView } from "@/shared/api/learner";
import { streakDaySummary } from "@/shared/lib/streak-popup";

const STORAGE_PREFIX = "buildment:streak-popup-seen:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readSeenLocally(userId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeSeenLocally(userId: string, day: string) {
  try {
    window.localStorage.setItem(storageKey(userId), day);
  } catch {
    /* Optional preference. */
  }
}

async function shareStreak(streakCount: number) {
  const title = streakCount === 1 ? "1 day learning streak" : `${streakCount} day learning streak`;
  const text = streakCount <= 0
    ? "I'm learning on Edorax."
    : `I'm on a ${streakCount}-day learning streak on Edorax!`;
  const url = typeof window !== "undefined" ? window.location.origin : "https://edorax.com";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
  } catch {
    /* Share is best-effort. */
  }
}

function FlameRings({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto flex size-28 items-center justify-center", className)} aria-hidden>
      <span className="absolute inset-0 rounded-full border border-primary/20 motion-safe:animate-[streak-ring_2.4s_ease-out_infinite] motion-reduce:animate-none" />
      <span className="absolute inset-3 rounded-full border border-primary/35 motion-safe:animate-[streak-ring_2.4s_ease-out_infinite] motion-safe:[animation-delay:0.35s] motion-reduce:animate-none" />
      <span className="absolute inset-6 rounded-full bg-primary/15" />
      <span className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Flame className="size-7" strokeWidth={2.25} />
      </span>
    </div>
  );
}

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: StreakPopupDayView;
  selected: boolean;
  onSelect: () => void;
}) {
  const label =
    day.status === "today"
      ? `${day.weekday}, today`
      : day.status === "completed"
        ? `${day.weekday}, completed`
        : `${day.weekday}, missed`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1.5 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{day.weekday}</span>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full border-2",
          day.status === "completed" && "border-primary bg-primary text-primary-foreground",
          day.status === "missed" && "border-border bg-muted/40 text-muted-foreground",
          day.status === "today" && "border-primary bg-card text-primary",
          selected && "ring-2 ring-ring ring-offset-2 ring-offset-card"
        )}
      >
        {day.status === "completed" ? (
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
        ) : day.status === "today" ? (
          <Flame className="size-4" aria-hidden />
        ) : (
          <X className="size-3.5" strokeWidth={2} aria-hidden />
        )}
      </span>
    </button>
  );
}

export function DailyStreakPopup({ userId }: { userId: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [payload, setPayload] = useState<StreakPopupView | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const localSeen = readSeenLocally(userId);

    void (async () => {
      try {
        const data = await apiFetch<StreakPopupView>("/api/v1/learner/streak-popup");
        if (cancelled) return;
        if (localSeen === data.today || !data.show) {
          setPayload(data);
          return;
        }
        setPayload(data);
        setSelectedDay(data.today);
        setOpen(true);
      } catch {
        /* Popup is non-critical; skip on API failure. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  async function dismiss() {
    const today = payload?.today;
    setOpen(false);
    if (today) writeSeenLocally(userId, today);
    try {
      await apiFetch<{ seenOn: string }>("/api/v1/learner/streak-popup/dismiss", { method: "POST" });
    } catch {
      /* Local dismiss still keeps it hidden this session/day. */
    }
  }

  async function onShare() {
    const count = payload?.streakCount ?? 0;
    await shareStreak(count);
    setShareNote("Streak link ready to share");
    window.setTimeout(() => setShareNote(null), 2500);
  }

  const selected = payload?.week.find((day) => day.day === selectedDay) ?? null;
  const subtitle = payload?.todayActive
    ? "Today is locked in. See you tomorrow."
    : "Open a lesson today to lock in your streak.";
  const primaryLabel = payload?.todayActive ? "Checked in today · Ready" : "Got it · Keep learning";
  const streakLabel =
    !payload || payload.streakCount <= 0
      ? "Start your streak"
      : payload.streakCount === 1
        ? "1 day streak"
        : `${payload.streakCount} day streak`;

  return (
    <>
      <style>{`
        @keyframes streak-ring {
          0% { transform: scale(0.92); opacity: 0.85; }
          70% { transform: scale(1.08); opacity: 0; }
          100% { transform: scale(1.08); opacity: 0; }
        }
      `}</style>
      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          void dismiss();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-foreground/35 sm:p-7"
      >
        {open && payload ? (
          <div className="flex flex-col items-center text-center">
            <FlameRings />
            <h2 id={titleId} className="mt-5 font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {streakLabel}
            </h2>
            <p id={descriptionId} className="mt-2 max-w-[18rem] text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>

            <div className="mt-6 flex w-full items-start justify-between gap-0.5 px-0.5" role="list" aria-label="Last seven days">
              {payload.week.map((day) => (
                <div key={day.day} role="listitem">
                  <DayCell
                    day={day}
                    selected={selectedDay === day.day}
                    onSelect={() => setSelectedDay(day.day)}
                  />
                </div>
              ))}
            </div>

            <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground" aria-live="polite">
              {selected && payload
                ? streakDaySummary(selected, payload.today)
                : "Tap a day to see how it went"}
            </p>

            <Button
              type="button"
              variant="outline"
              className="mt-4 h-12 w-full rounded-full border-primary text-primary hover:bg-primary/10"
              onClick={() => void dismiss()}
              autoFocus
            >
              <Zap className="size-4" aria-hidden />
              {primaryLabel}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-11 w-full text-muted-foreground hover:text-foreground"
              onClick={() => void onShare()}
              aria-label="Share streak"
            >
              <Share2 className="size-4" aria-hidden />
              Share streak
            </Button>
            {shareNote ? (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {shareNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
