"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Volume2, VolumeX, X } from "lucide-react";
import type { MascotReaction } from "@/shared/engagement/engine";
import { playDotVoice, useDotVoice } from "@/lib/engagement/dot-voice";
import { useMascotReactions } from "@/lib/engagement/use-mascot";
import { requestAskHelp } from "@/lib/engagement/ask-help";
import { Dot } from "@/components/brand/dot";
import { dotMoodForState } from "@/components/mascot/dot-mood";
import { cn } from "@/lib/utils";

// The one place mascot reactions are drawn. Everything above it (rules, cooldowns, which mascot
// plays which role) lives in shared/engagement; swapping the drawing for a Rive animation later
// only touches this folder. The bubble is non-modal, never takes focus, and sits bottom-centre: the
// corners already hold toasts, the reader's focus dock, the quiz camera preview and sidebars.
//
// Mascots with a rig are drawn live (blinking, glancing, talking while their line types out
// and for as long as its voice clip plays);
// others show their still image. With reduced motion the pose and line simply appear.
//
// Reactions often land together with a modal (the chapter-complete <dialog> opens right after
// "Mark complete"). A modal <dialog> lives in the browser's top layer, above any z-index, so the
// bubble is a manual popover — also top layer — and is re-raised whenever a dialog opens after it.
// A centred modal would crowd a bottom bubble onto its backdrop, so while one is open the bubble
// moves to the top-centre. It stays up meanwhile; its 3.5 s only count once the modal closes.
// A modal <dialog> also makes everything outside it inert, top layer included, so while one is
// open the bubble is rendered inside it; otherwise its close and voice buttons could not be used.
//
// A reaction can offer one next step (ask a mentor, open a reply, continue a chapter). It stays a
// little longer so there is time to take it, and taking it closes the bubble.
//
// Dot's voice follows the brand sound rules: off until the learner turns it on (the bubble's
// speaker button or profile settings), never during a quiz (a quiz's reaction waits until the quiz
// closes), once per reaction, and the words always show too. The clip plays from here rather than the bubble because the bubble remounts when it
// moves into a modal, which would restart it; the bubble stays up until the clip ends.

const VISIBLE_MS = 3_500;
const VISIBLE_WITH_ACTION_MS = 8_000;
const TICK_MS = 250;
/** The line types out over at most this long, so short and long lines both feel spoken. */
const TYPE_MAX_MS = 1_100;
const TYPE_STEP_MS = 28;
const MODAL_SELECTOR = "dialog[open], [role='dialog'][aria-modal='true']";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function modalOpen(): boolean {
  return document.querySelector(MODAL_SELECTOR) !== null;
}

/** The full-screen quiz session is open (quiz-chapter-session-client.tsx). */
function quizOpen(): boolean {
  return document.getElementById("quiz-chapter-session") !== null;
}

/** The open modal <dialog>, which makes the rest of the page inert, or null. */
function modalDialog(): HTMLDialogElement | null {
  try {
    return [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")].at(-1) ?? null;
  } catch {
    // :modal unsupported: the bubble stays where it is and only its buttons are out of reach.
    return null;
  }
}

/** Top-centre while a modal holds the middle of the screen, bottom-centre otherwise. */
function place(element: HTMLElement) {
  element.dataset.placement = modalOpen() ? "top" : "bottom";
}

/** Shows the popover, or moves it back to the top of the top layer if it is already showing. */
function raise(element: HTMLElement) {
  if (typeof element.showPopover !== "function") return;
  try {
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
  } catch {
    // Popover API unavailable or the element is detached: the fixed-position fallback still shows.
  }
}

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  );
}

const ACTION_BUTTON =
  "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const BUBBLE_BUTTON =
  "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** One reaction: the character and its speech bubble. Mounted fresh (keyed) for every reaction. */
function ReactionBubble({
  reaction,
  animate,
  voiceOn,
  onToggleVoice,
  onPause,
  onDismiss,
}: {
  reaction: MascotReaction;
  animate: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  onPause: (paused: boolean) => void;
  onDismiss: () => void;
}) {
  const line = reaction.message;
  const [typed, setTyped] = useState(() => (animate ? 0 : line.length));
  const typing = typed < line.length;

  useEffect(() => {
    if (!typing) return;
    const step = Math.max(1, Math.ceil(line.length / (TYPE_MAX_MS / TYPE_STEP_MS)));
    const timer = window.setInterval(() => setTyped((count) => Math.min(line.length, count + step)), TYPE_STEP_MS);
    return () => window.clearInterval(timer);
  }, [typing, line.length]);

  const action = reaction.action;

  return (
    <div
      className="mascot-enter pointer-events-auto flex max-w-[min(22rem,calc(100vw-2rem))] items-end gap-2"
      onMouseEnter={() => onPause(true)}
      onMouseLeave={() => onPause(false)}
      onFocus={() => onPause(true)}
      onBlur={() => onPause(false)}
    >
      <div className="mascot-body shrink-0">
        <Dot mood={dotMoodForState(reaction.state)} size={72} />
      </div>
      <div
        className={cn(
          "relative mb-2 border border-border bg-card py-2.5 pl-3.5 pr-24 text-base font-medium text-card-foreground"
        )}
      >
        {/* The full line reserves the bubble's size so it does not grow while typing. */}
        <span aria-hidden className="grid">
          <span className="invisible [grid-area:1/1]">{line}</span>
          <span className="[grid-area:1/1]">{line.slice(0, typed)}</span>
        </span>
        {reaction.xp || action ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {reaction.xp ? (
              <span
                aria-hidden
                className={`inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground ${animate ? "mascot-enter" : ""}`}
              >
                +{reaction.xp} XP
              </span>
            ) : null}
            {action && "href" in action ? (
              <Link href={action.href} onClick={onDismiss} className={ACTION_BUTTON}>
                {action.label}
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            ) : null}
            {action && "intent" in action ? (
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  requestAskHelp();
                }}
                className={ACTION_BUTTON}
              >
                {action.label}
                <ArrowRight className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ) : null}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={voiceOn ? "Turn off Dot's voice" : "Turn on Dot's voice"}
            aria-pressed={voiceOn}
            title={voiceOn ? "Turn off Dot's voice" : "Turn on Dot's voice"}
            className={cn(BUBBLE_BUTTON, voiceOn && "bg-primary/10 text-primary")}
          >
            {voiceOn ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
          </button>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss" className={BUBBLE_BUTTON}>
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MascotPlayer() {
  const [shown, setShown] = useState<{ reaction: MascotReaction; seq: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [modalHost, setModalHost] = useState<HTMLDialogElement | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [voiceOn, setVoiceOn] = useDotVoice();
  const [speaking, setSpeaking] = useState(false);
  const [held, setHeld] = useState<{ reaction: MascotReaction; seq: number } | null>(null);

  useMascotReactions((reaction, seq) => {
    // Dot stays out of a quiz: its reaction (and voice) waits until the quiz closes. Only the
    // latest one is kept, so a retake shows how the last attempt went.
    if (quizOpen()) {
      setHeld({ reaction, seq });
      return;
    }
    setPaused(false);
    setShown({ reaction, seq });
  });

  useEffect(() => {
    if (!held) return;
    const observer = new MutationObserver(() => {
      if (quizOpen()) return;
      setPaused(false);
      setShown(held);
      setHeld(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [held]);

  // Speak the line once while its bubble is up; closing the bubble or turning the voice off stops it.
  // Plays Dot's recorded clip only; a missing clip never uses browser speech synthesis.
  useEffect(() => {
    if (!voiceOn || !shown) return;
    const cleanup = playDotVoice(shown.reaction.voice, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
    return () => {
      cleanup();
      setSpeaking(false);
    };
  }, [voiceOn, shown?.seq]);

  // Count down only while nothing modal is open, Dot is not speaking and the learner is not hovering the bubble.
  useEffect(() => {
    if (!shown || paused || speaking) return;
    const visibleMs = shown.reaction.action ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS;
    let remaining = visibleMs;
    const timer = window.setInterval(() => {
      if (modalOpen()) {
        remaining = visibleMs;
        return;
      }
      remaining -= TICK_MS;
      if (remaining <= 0) setShown(null);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [shown, paused, speaking]);

  // Keep the bubble in the top layer, above any dialog that opens while it is showing, and out of
  // the way of a modal as it opens or closes. Moving into or out of a modal remounts the layer, so
  // this runs again for the new element.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !shown) return;
    place(layer);
    raise(layer);
    setModalHost(modalDialog());
    const observer = new MutationObserver((mutations) => {
      place(layer);
      setModalHost(modalDialog());
      if (mutations.some((mutation) => mutation.target instanceof HTMLDialogElement && mutation.target.open)) {
        raise(layer);
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => {
      observer.disconnect();
      try {
        if (layer.matches(":popover-open")) layer.hidePopover();
      } catch {
        // Already hidden.
      }
    };
  }, [shown, modalHost]);

  const reaction = shown?.reaction;

  const layer = (
    <div
      ref={layerRef}
      popover="manual"
      data-placement="bottom"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-45 m-0 flex h-auto w-full justify-center overflow-visible border-0 bg-transparent px-4 data-[placement=top]:bottom-auto data-[placement=top]:top-[max(1.5rem,env(safe-area-inset-top))] not-[&:popover-open]:hidden"
    >
      {shown ? (
        <ReactionBubble
          key={shown.seq}
          reaction={shown.reaction}
          animate={!reducedMotion}
          voiceOn={voiceOn}
          onToggleVoice={() => setVoiceOn(!voiceOn)}
          onPause={setPaused}
          onDismiss={() => {
            setPaused(false);
            setShown(null);
          }}
        />
      ) : null}
    </div>
  );

  return (
    <>
      {/* Announced from outside the popover: a hidden popover is display:none and would not be read. */}
      <p aria-live="polite" className="sr-only">
        {reaction
          ? `Dot says: ${reaction.message}${reaction.xp ? ` You earned ${reaction.xp} XP.` : ""}`
          : ""}
      </p>
      {shown && modalHost?.open ? createPortal(layer, modalHost) : layer}
    </>
  );
}
