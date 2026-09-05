---
description: Create one new short demo clip of a Revel feature — storyboard it first, then build and render it
argument-hint: "[feature or flow to show] [--voice <voice>] [--tts elevenlabs]"
---

Build a single narrated clip. What to show (may be empty — then ask): $ARGUMENTS

Clips are the unit of work here: 30–90 seconds, one idea, one persona's point
of view. Compilations are made later by stitching clips, so never try to cram
a whole tour into one file.

## Steps

1. **Load the `demo-video` skill via the Skill tool** and follow it exactly.
   It holds the pipeline, the environment bring-up, the voice config, and the
   traps table. Do not improvise around it.

2. **Storyboard FIRST — no code until the user says yes.** In chat, present:
   - the one idea this clip lands, and who it is for;
   - the persona(s) on screen and whether the clip needs an account switch
     (each switch costs an interstitial — two personas is the practical max);
   - a numbered scene list: for each scene, the on-screen action AND the draft
     narration line, written in the house voice (warm, human, honest — see the
     skill's tone rules). Read the lines aloud in your head: they are spoken,
     not printed;
   - the backend state to arrange — prefer a fresh org/event built through
     `demos/arrange-lib.mjs` over the seeded fixtures, so the clip is
     re-runnable after any reseed;
   - the estimated runtime (sum the narration at ~2.5 words/second).

   **Wait for approval.** Revising a storyboard is free; revising a render is
   twenty minutes.

3. **Environment.** `npm run doctor` must be green before anything else. If the
   stack is down, `docker compose up -d` and wait for healthy (see the skill).

4. **Probe before you render.** Copy the closest file in `probes/` and adapt
   it: a headless script that walks every selector the clip will touch and
   prints what it found, in well under a minute. Iterate there — a wrong
   selector found in a probe costs seconds, found in a render costs the whole
   take. Only continue once the probe prints its pass line.

5. **Write the two files**: `demos/<name>.demo.ts` (script) and
   `demos/<name>.scenes.json` (manifest). Import the shared helpers from
   `demos/clip-helpers.ts` — `gotoClean`, `waitClientAuth`, `uiLogin`,
   `switchUser`, `showInterstitial`, `slowScroll` — rather than re-implementing
   the waits. Then:

   ```bash
   npx argo validate <name>       # scene names must match the marks
   npm run pipeline -- <name>     # local Kokoro voice, free
   ```

6. **Verify, then report.** Check the scene report for runaway clip durations,
   extract a frame at each story beat and Read it, and only then tell the user
   the clip is ready — with its path under `videos/`, its duration, and the
   rough edges you would fix in a second pass.

Draft in the local voice. Re-voice with `/revoice <name>` only once the user
has signed off on the words.
