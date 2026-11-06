"use client";

import { useBrowserStorage } from "@/lib/use-browser-storage";

const DOT_VOICE_KEY = "buildment:dot-voice";
const DOT_VOICE_VOLUME = 0.7;

export function isDotVoiceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DOT_VOICE_KEY) === "on";
  } catch {
    return false;
  }
}

export function useDotVoice(): [enabled: boolean, setEnabled: (enabled: boolean) => void] {
  const [value, setValue] = useBrowserStorage(DOT_VOICE_KEY, "off");
  return [value === "on", (enabled) => setValue(enabled ? "on" : "off")];
}

/** A recorded clip waiting for the browser's next user gesture after autoplay was denied. */
let pendingGesturePlayback: (() => void) | null = null;
let gestureListenerRegistered = false;

function ensureGestureUnlocker() {
  if (gestureListenerRegistered || typeof window === "undefined") return;
  gestureListenerRegistered = true;
  const onUserGesture = () => {
    const playback = pendingGesturePlayback;
    pendingGesturePlayback = null;
    playback?.();
  };
  window.addEventListener("pointerdown", onUserGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onUserGesture, { capture: true, passive: true });
  window.addEventListener("click", onUserGesture, { capture: true, passive: true });
}

export type DotSpeechCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
};

/** Plays Dot's recorded clip only. Missing or failed clips stay silent. */
export function playDotVoice(voiceUrl?: string, callbacks?: DotSpeechCallbacks): () => void {
  if (typeof window === "undefined") return () => {};
  if (!voiceUrl) {
    callbacks?.onEnd?.();
    return () => {};
  }

  ensureGestureUnlocker();
  let cancelled = false;
  let audio: HTMLAudioElement | null = null;
  const cleanup = () => {
    cancelled = true;
    pendingGesturePlayback = null;
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    callbacks?.onEnd?.();
  };

  try {
    audio = new Audio(voiceUrl);
    const current = audio;
    current.preload = "auto";
    current.volume = DOT_VOICE_VOLUME;
    current.addEventListener("playing", () => {
      if (!cancelled) callbacks?.onStart?.();
    }, { once: true });
    current.addEventListener("ended", () => {
      if (audio === current) audio = null;
      if (!cancelled) callbacks?.onEnd?.();
    }, { once: true });
    current.addEventListener("error", () => {
      if (audio === current) audio = null;
      if (!cancelled) callbacks?.onEnd?.();
    }, { once: true });
    current.play().catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        pendingGesturePlayback = () => {
          if (!cancelled) current.play().catch(() => callbacks?.onEnd?.());
        };
      } else {
        if (audio === current) audio = null;
        callbacks?.onEnd?.();
      }
    });
  } catch {
    callbacks?.onEnd?.();
  }

  return cleanup;
}
