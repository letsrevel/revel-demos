# "One Line" — Revel brand film

A ~2-minute narrated motion-graphics film about Revel, built entirely in code:
a deterministic Canvas 2D animation rendered frame-by-frame by headless Chromium,
an original score, a synthetic narrator, and sound design synthesized in numpy.

**Concept.** One unbroken rope runs through the whole film. It draws a community,
gets cut up by fees and data harvesting, returns whole with Revel, ties a knot at
the door of a shibari workshop (the questionnaire gate), becomes a heart, a ring of
24 people, and finally traces the Revel "R".

## Outputs (in `../videos/`)
- `revel-one-line-4k.mp4` — 3840×2160, 60 fps, master
- `revel-one-line.mp4` — 1920×1080, 60 fps, downscaled from the 4K master
- `revel-one-line.srt` / `.vtt` — captions for sound-off autoplay

## Pipeline
```bash
node cues.mjs                 # timing: narration placement + word timings + music grid → cues.json, film/cues.js
node export-sfx.mjs           # scenes register their own sound cues → sfx.json
python mix.py                 # score + narration + synthesized SFX → audio/master.wav (-14 LUFS, -1.2 dBTP)
node render.mjs --scale 2 --mb 4 --crf 14 --out ../videos/revel-one-line-4k.mp4
node captions.mjs             # SRT / VTT
node preview.mjs 12.5 60      # stills;  node preview.mjs --sheet 0 20 1  → contact sheet
open film/index.html          # live preview in a browser (add ?from=44 to start mid-film)
```
`mix.py` and the aligner need a Python env with `numpy scipy soundfile librosa pyloudnorm faster-whisper`.

## Sources
- **Score**: Google Lyria 3 Pro via OpenRouter (`music.mjs`, brief in `music-brief-2.txt`), take v5 of 7.
  110 BPM exactly; the edit is cut to its phrase grid (see `cues.mjs`). Its sidechain "pumping" is part
  of the production, not the mix.
- **Voice**: Gemini 3.8 Flash TTS, voice "Sulafat", via OpenRouter (`vo.mjs`, `script.json`).
  Three takes per line; each take transcribed and rated by an audio model (`pick.mjs`) — this caught
  several takes that hallucinated extra words. Word timings from faster-whisper (`finalize.py`).
- **Type**: Bricolage Grotesque (display), Instrument Serif (the intimate lines), Nata Sans (the Revel UI font), JetBrains Mono.
- **Brand**: the vector R from `revel-frontend/static/logo.svg`; the wordmark cut from `assets/revel-logo-gradient.png`.
- **Code texture**: real lines from `revel-backend/src/questionnaires/evaluator.py`, with every line about automated/LLM evaluation filtered out (no AI on screen, by request).

## Claims on screen (all checked against the repos)
MIT licence · no fee added on top for buyers · money goes straight to the organizer's own Stripe account ·
no ads, no third-party trackers, data never sold · hosted in the EU · export/delete your data ·
self-host for about €20/month · WCAG 2.1 AA · six languages. Questionnaire copy is the seeded
Shibari Circle Vienna scenario. Reviews are shown as human-only by request.

## Changing things
- The feature list (v17) is one take cut into six phrases at its natural pauses; each phrase starts
  50 ms before its first word and sits on its own beat-aligned montage panel (`SPLITS` in `cues.mjs`).
- Words: edit `script.json`, `node vo.mjs 3 <id>`, `node pick.mjs <id>`, `python finalize.py <id>`, then adjust the start time in `cues.mjs`.
- Picture: scenes are `film/scenes-1..4.js`; every frame is a pure function of time.
