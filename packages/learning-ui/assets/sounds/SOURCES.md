# Learner feedback sounds

Mapped in `packages/learning-ui/src/lib/sound-feedback.ts` → `FEEDBACK_AUDIO`. One line there swaps any cue.

These are **short, trimmed, peak-normalized** clips chosen for a quiet tactile feel (not musical stingers).

## Files

| File | Role | Source |
|------|------|----------------|
| `tick.wav` | Checklist item | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-button-press-382713/) |
| `check.wav` | Read / mandatory ack | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-click-button-140881/) |
| `submit.wav` | Submit cue | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-level-up-03-199576/) |
| `notification.wav` | Open question / softer quiz result | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-new-notification-028-383966/) |
| `success.wav` | Correct block | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-success-221935/) |
| `celebration.wav` | Full checklist / perfect quiz | Generated with Gemini
| `completion.wav` | Chapter complete (~240ms soft thud) | Generated with Gemini
| `error.wav` | Wrong / validation | `Pixabay` — (https://pixabay.com/sound-effects/film-special-effects-error-126627/)

## Replace a sound

Drop a new `.wav` in this folder and change the matching path in `FEEDBACK_AUDIO`.

## Licenses

**Pixabay Content: Pixabay Content License**
- Free use is permitted under the Pixabay Content License.
- Attribution is not required, although credit is appreciated.
- Content may be modified or adapted, subject to the license's prohibited uses and any additional rights that may apply.
- License: https://pixabay.com/service/license-summary/

**Gemini-generated audio**
- `celebration.wav` and `completion.wav` were generated with Gemini.
- These files are not sourced from a third-party audio library.
