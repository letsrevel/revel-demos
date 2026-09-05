---
description: Re-record a finished clip's narration in the paid ElevenLabs voice, once the script is frozen
argument-hint: "<clip-name> [<clip-name> ...] [--stitch <out.mp4>]"
---

Re-voice already-finished clips with ElevenLabs. Clips: $ARGUMENTS

**Only do this when the narration text is FINAL.** ElevenLabs is billed per
character, and every re-voice pays for the whole script again. Drafting,
timing tweaks, and wording changes all happen on the free local Kokoro engine
first. If the user asks to re-voice a clip whose wording they are still
editing, say so and offer to wait.

## Steps

1. **Confirm the freeze.** Show the user the exact narration lines that are
   about to be synthesized — read every `text` field out of
   `demos/<clip>.scenes.json` and paste them in chat. Ask: "these are final?"
   Wait for a yes. A typo caught here is free; caught after, it costs another
   full render.

2. **Check the key.** `npm run doctor` with `ARGO_TTS=elevenlabs` — it verifies
   `ELEVENLABS_API_KEY` is present in `.env`. If it is missing, stop and ask
   the user for it; never commit it, `.env` is gitignored.

3. **Purge the clip cache — THIS IS THE STEP EVERYONE FORGETS.**

   ```bash
   npm run purge-clips -- <clip> [<clip> ...]
   ```

   argo caches TTS audio keyed on the scene TEXT alone, not on the engine or
   the voice. Skip this and the pipeline happily reuses the Kokoro audio and
   hands you an identical video, in the wrong voice, having reported success.

4. **Re-run the pipeline per clip**, with the environment up (`npm run doctor`
   must be green first):

   ```bash
   ARGO_TTS=elevenlabs npx argo pipeline <clip>
   ```

   The full pipeline (not just `tts generate`): recording holds are timed to
   clip durations, so new audio lengths need a new recording.

5. **Verify before claiming done.** For every clip:
   - `ffprobe` each file in `.argo/<clip>/clips/` — a scene far longer than its
     line means a runaway generation; re-run that clip.
   - Extract a frame at a couple of story beats
     (`ffmpeg -ss <t> -i videos/<clip>.mp4 -frames:v 1 /tmp/f.png`) and Read
     them — overlays and framing must still be right.
   - Listen-check is the user's job: tell them which files to play
     (`ffplay -autoexit -nodisp videos/<clip>.mp4`, or `afplay` on macOS).
     Never claim to have judged the audio yourself.

6. **Restitch if asked.** With `--stitch <out.mp4>`:

   ```bash
   npm run stitch -- <out.mp4> <clip> [<clip> ...]
   ```

   Keep `clip-intro` first and `clip-outro` last unless the user says otherwise.

7. **Report**: the clip paths under `videos/`, roughly how many characters were
   billed, and anything that needs another pass.
