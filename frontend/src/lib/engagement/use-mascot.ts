"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createMascotHooks } from "@buildment/learning-ui/mascot/hooks";
import type { MascotReaction } from "@/shared/engagement/engine";
import {
  announceMessages,
  reportPendingEngagement,
  startEngagementSession,
  startStudyStretchClock,
  subscribeToMascotReactions,
  trackEngagement,
  watchChapterLingering,
} from "@/lib/engagement/client";

export type { MascotControls, UseMascotOptions } from "@buildment/learning-ui/mascot/hooks";

// The shared mascot hooks on the web's client (client.ts).
const hooks = createMascotHooks({
  track: trackEngagement,
  subscribe: subscribeToMascotReactions,
  startSession: startEngagementSession,
  announceMessages,
  startStudyClock: startStudyStretchClock,
  watchChapter: watchChapterLingering,
});

export const useMascot = hooks.useMascot;

/**
 * For the one mascot player. Also reports a moment a server redirect left behind, on mount and
 * after each navigation (see pending-event.ts).
 */
export function useMascotReactions(onReaction: (reaction: MascotReaction, seq: number) => void): void {
  hooks.useMascotReactions(onReaction);
  const pathname = usePathname();

  // After the subscription above, so on mount a pending moment is reported once someone listens.
  useEffect(() => {
    reportPendingEngagement();
  }, [pathname]);
}
