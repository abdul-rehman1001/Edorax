import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDotVoiceEnabled, playDotVoice } from "@/lib/engagement/dot-voice";

describe("dot-voice", () => {
  let mockSpeechSynthesis: {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
  };
  let windowTarget: EventTarget;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map<string, string>();
    windowTarget = new EventTarget();

    mockSpeechSynthesis = {
      speak: vi.fn((utterance) => {
        utterance.onstart?.();
        utterance.onend?.();
      }),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
    };

    const mockLocalStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    const mockWindow = Object.assign(windowTarget, {
      speechSynthesis: mockSpeechSynthesis,
      localStorage: mockLocalStorage,
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
      dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
    });

    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        rate = 1;
        pitch = 1;
        volume = 1;
        voice = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("checks whether voice is enabled via storage", () => {
    expect(isDotVoiceEnabled()).toBe(false);
    storage.set("buildment:dot-voice", "on");
    expect(isDotVoiceEnabled()).toBe(true);
    storage.set("buildment:dot-voice", "off");
    expect(isDotVoiceEnabled()).toBe(false);
  });

  it("stays silent when there is no recorded clip", () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    playDotVoice(undefined, { onStart, onEnd });

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("plays recorded audio clip when URL is provided", () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const addEventListenerMock = vi.fn((event: string, handler: () => void) => {
      if (event === "playing") handler();
      if (event === "ended") handler();
    });

    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        preload = "";
        addEventListener = addEventListenerMock;
        removeEventListener = vi.fn();
        play = playMock;
        pause = vi.fn();
        constructor(src: string) {
          this.src = src;
        }
      }
    );

    const onStart = vi.fn();
    const onEnd = vi.fn();

    playDotVoice("/brand/dot/voice/lesson-done.mp3", { onStart, onEnd });

    expect(playMock).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("stays silent when a recorded clip fails to load", () => {
    const addEventListenerMock = vi.fn((event: string, handler: () => void) => {
      if (event === "error") handler();
    });

    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        preload = "";
        addEventListener = addEventListenerMock;
        removeEventListener = vi.fn();
        play = vi.fn().mockResolvedValue(undefined);
        pause = vi.fn();
        constructor(src: string) {
          this.src = src;
        }
      }
    );

    playDotVoice("/brand/dot/voice/streak-7.mp3");

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("cancels active speech and cleans up on return callback", () => {
    const pauseMock = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        preload = "";
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        play = vi.fn().mockReturnValue(new Promise(() => {}));
        pause = pauseMock;
        constructor(src: string) {
          this.src = src;
        }
      }
    );

    const cleanup = playDotVoice("/brand/dot/voice/you-passed.mp3");
    cleanup();

    expect(pauseMock).toHaveBeenCalledOnce();
  });
});
