"use client";

import { useBrowserStorage } from "@/lib/use-browser-storage";

// Whether Dot speaks its lines aloud. Off until the learner turns it on, kept per device (the brand
// sound rule: sound follows the device, like a phone's silent mode). The settings switch and the
// bubble's speaker button share this key, so flipping one updates the other.

const DOT_VOICE_KEY = "buildment:dot-voice";

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

/** Keep active utterance in memory to avoid garbage collection bug in Chromium. */
let activeUtterance: SpeechSynthesisUtterance | null = null;

/** Pending speech to trigger on the very first user interaction if blocked by autoplay. */
let pendingGestureSpeech: (() => void) | null = null;
let gestureListenerRegistered = false;

function ensureGestureUnlocker() {
  if (gestureListenerRegistered || typeof window === "undefined") return;
  gestureListenerRegistered = true;

  const onUserGesture = () => {
    if (pendingGestureSpeech) {
      const speech = pendingGestureSpeech;
      pendingGestureSpeech = null;
      try {
        speech();
      } catch {
        /* Speech attempt is best-effort. */
      }
    }
  };

  window.addEventListener("pointerdown", onUserGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onUserGesture, { capture: true, passive: true });
  window.addEventListener("click", onUserGesture, { capture: true, passive: true });
}

export type DotSpeechCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
};

/**
 * Speaks Dot's line aloud.
 * 1. If a recorded clip is provided, plays the audio file.
 * 2. If blocked by browser autoplay policy, registers a user-gesture handler to resume as soon as the user touches/clicks anywhere.
 * 3. If no recorded clip exists or if audio loading fails, falls back to Web Speech Synthesis.
 *
 * Returns a cancel function to stop playback immediately.
 */
export function playDotVoice(
  message: string,
  voiceUrl?: string,
  callbacks?: DotSpeechCallbacks
): () => void {
  if (typeof window === "undefined") return () => {};

  ensureGestureUnlocker();

  let cancelled = false;
  let activeAudio: HTMLAudioElement | null = null;
  let stopSpeechSynth: (() => void) | null = null;

  const cleanup = () => {
    cancelled = true;
    if (pendingGestureSpeech) {
      pendingGestureSpeech = null;
    }
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = "";
      } catch {
        /* ignore */
      }
      activeAudio = null;
    }
    if (stopSpeechSynth) {
      stopSpeechSynth();
      stopSpeechSynth = null;
    }
    callbacks?.onEnd?.();
  };

  const speakSynthesis = () => {
    if (cancelled) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      callbacks?.onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      activeUtterance = utterance;
      utterance.rate = 1.05;
      utterance.pitch = 1.2;
      utterance.volume = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.includes("Natural") ||
              v.name.includes("Google") ||
              v.name.includes("Samantha") ||
              v.name.includes("Jenny"))
        ) ?? voices.find((v) => v.lang.startsWith("en"));

      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        if (cancelled) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* ignore */
          }
          return;
        }
        callbacks?.onStart?.();
      };

      const finish = () => {
        activeUtterance = null;
        callbacks?.onEnd?.();
      };

      utterance.onend = finish;
      utterance.onerror = () => {
        finish();
      };

      window.speechSynthesis.speak(utterance);

      stopSpeechSynth = () => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
        activeUtterance = null;
      };
    } catch {
      callbacks?.onEnd?.();
    }
  };

  // If a pre-recorded clip is available, try audio first
  if (voiceUrl) {
    try {
      const audio = new Audio(voiceUrl);
      activeAudio = audio;
      audio.preload = "auto";

      const start = () => {
        if (!cancelled) callbacks?.onStart?.();
      };
      const done = () => {
        if (activeAudio === audio) activeAudio = null;
        if (!cancelled) callbacks?.onEnd?.();
      };

      audio.addEventListener("playing", start, { once: true });
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", () => {
        // Audio asset failed (e.g. 404 or format); fall back to speech synthesis
        if (!cancelled) {
          speakSynthesis();
        }
      }, { once: true });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: unknown) => {
          if (cancelled) return;
          // Autoplay rejected: queue for the next user interaction
          if (err instanceof Error && err.name === "NotAllowedError") {
            pendingGestureSpeech = () => {
              if (cancelled) return;
              audio.play().catch(() => speakSynthesis());
            };
          } else {
            // Other error; fall back to speech synthesis
            speakSynthesis();
          }
        });
      }
    } catch {
      speakSynthesis();
    }
  } else {
    // No pre-recorded clip; speak the message directly with synthesis
    try {
      speakSynthesis();
    } catch {
      pendingGestureSpeech = () => speakSynthesis();
    }
  }

  return cleanup;
}
