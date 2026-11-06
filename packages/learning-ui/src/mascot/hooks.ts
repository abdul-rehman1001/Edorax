"use client";

import { useEffect, useEffectEvent, useRef } from 'react';
import type { EngagementTrackInput, MascotReaction } from '../shared/engagement/engine';
import { ASK_HELP_EVENT } from './ask-help';
import type { MascotRuntime } from './runtime';

// The React side of the mascot runtime. Components say what the mascot should notice and these
// hooks own the effects and their cleanup, so no component wires listeners, timers or subscriptions
// by hand.
//
//   const { track } = useMascot();                                  // report a moment
//   useMascot({ watchChapter: { chapterId, estimatedMinutes } });   // offer a mentor after a while
//   useMascot({ onAskHelp: () => setOpen(true) });                  // answer "Ask a mentor"

export type UseMascotOptions = {
  /**
   * Offers a mentor after a long engaged while on this chapter (see lingeringThresholdMs). Pass
   * null or leave it out when there is nothing to watch, e.g. once the chapter is complete.
   */
  watchChapter?: { chapterId: string; estimatedMinutes?: number | null } | null;
  /** Runs when the learner presses a mascot's "Ask a mentor" button. */
  onAskHelp?: () => void;
};

export type MascotControls = {
  /** Reports a learning moment after the component's own action succeeded. Never throws; do not await. */
  track: (input: EngagementTrackInput) => void;
};

/** An app calls this once with its runtime and exports the two hooks it returns. */
export function createMascotHooks(runtime: Omit<MascotRuntime, 'announces'>) {
  const controls: MascotControls = { track: runtime.track };

  function useMascot(options: UseMascotOptions = {}): MascotControls {
    const { watchChapter, onAskHelp } = options;
    const chapterId = watchChapter?.chapterId;
    const estimatedMinutes = watchChapter?.estimatedMinutes;

    useEffect(() => {
      if (!chapterId) return;
      return runtime.watchChapter(chapterId, estimatedMinutes);
    }, [chapterId, estimatedMinutes]);

    const askHelp = useEffectEvent(() => onAskHelp?.());
    const answersAskHelp = onAskHelp !== undefined;
    useEffect(() => {
      if (!answersAskHelp) return;
      const listener = () => askHelp();
      window.addEventListener(ASK_HELP_EVENT, listener);
      return () => window.removeEventListener(ASK_HELP_EVENT, listener);
    }, [answersAskHelp]);

    return controls;
  }

  /**
   * For the one mascot player: delivers each reaction to `onReaction` and, while mounted, runs the
   * session start, live message announcements and the study-stretch clock.
   */
  function useMascotReactions(onReaction: (reaction: MascotReaction, seq: number) => void): void {
    const present = useEffectEvent(onReaction);
    const seq = useRef(0);

    useEffect(() => {
      const unsubscribe = runtime.subscribe((reaction) => {
        seq.current += 1;
        present(reaction, seq.current);
      });
      runtime.startSession();
      const stopMessages = runtime.announceMessages();
      const stopStretchClock = runtime.startStudyClock();
      return () => {
        unsubscribe();
        stopMessages();
        stopStretchClock();
      };
    }, []);
  }

  return { useMascot, useMascotReactions };
}
