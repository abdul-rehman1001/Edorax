"use client";

import { useBrowserStorage } from '../lib/use-browser-storage';

// Whether Dot speaks its lines aloud. Off until the learner turns it on, kept per device (the brand
// sound rule: sound follows the device, like a phone's silent mode). The settings switch and the
// bubble's speaker button share this key, so flipping one updates the other.

const DOT_VOICE_KEY = 'buildment:dot-voice';

export function useDotVoice(): [enabled: boolean, setEnabled: (enabled: boolean) => void] {
  const [value, setValue] = useBrowserStorage(DOT_VOICE_KEY, 'off');
  return [value === 'on', (enabled) => setValue(enabled ? 'on' : 'off')];
}
