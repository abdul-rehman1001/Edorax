// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Dot's recorded voice: twelve short clips (Kai on ElevenLabs), served by the web app from
// /brand/dot/voice/<key>.mp3, or from MASCOT_ASSET_BASE_URL when the API sets it, and listed with
// their wording in frontend/public/brand/dot/manifest.json.
// A rule names its clip (EngagementRule.clip) and then says exactly the clip's words, so what the
// learner reads and hears always match. Rules without a clip show their line silently.
// Sound rules: off until the learner turns it on, never during a quiz, once per moment.

export const DOT_CLIPS = {
  welcome: "Hey, welcome to Edorax! I'm Dot, your learning buddy!",
  yep: "Yep!",
  "got-it": "You got it!",
  "not-quite": "Hmm, not quite!",
  "need-a-hint": "Need a hint?",
  "want-to-listen": "Want to listen?",
  "look-again": "Let's look again!",
  "you-passed": "You passed!",
  "lesson-done": "Lesson done!",
  "streak-7": "Seven days! Wow!",
  "missed-you": "You're back! I missed you!",
  "you-did-it": "You did it!",
} as const;

export type DotClip = keyof typeof DOT_CLIPS;

/** App-relative URL of a clip. */
export function dotClipUrl(clip: DotClip): string {
  return `/brand/dot/voice/${clip}.mp3`;
}
