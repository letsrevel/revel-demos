---
description: Create a narrated demo video of the Revel app — brainstorm the scenes, then drive the argo pipeline
argument-hint: "[flow/feature to showcase] [--voice <voice>] [--tts elevenlabs]"
---

Produce a product demo video. What to showcase (may be empty): $ARGUMENTS

## Steps

1. **Load the `demo-video` skill via the Skill tool** and follow it exactly — it
   holds the pipeline, the environment bring-up, the voice config, and the
   recording traps. Do not improvise around it.

2. **Brainstorm the video before touching any code.** From $ARGUMENTS (or by
   asking), settle with the user, in chat:
   - the story arc and target format (length, audience, where it will be
     posted);
   - a scene list: for each scene the on-screen action and a draft narration
     line, in the house voice (warm, human, honest — see the skill's tone
     rules);
   - whether this is one clip or a stitched compilation. Long videos are built
     as several short clips and joined with `npm run stitch` — that way a
     re-record only costs one clip, not the whole thing;
   - what backend state to arrange (a fresh org/event through
     `demos/arrange-lib.mjs`, or the seeded demo scenarios) and which personas
     appear;
   - the voice and engine: the default is **Kokoro `af_heart`**, local and
     free — always draft with it. `--tts elevenlabs` (or an explicit user
     request) selects the paid cloud voice, `--voice` overrides the speaker for
     either. Audition samples if the user wants to hear options first.

   **Present the storyboard and wait for approval before implementing.**

3. **Implement per the skill**: `npm run doctor` green → headless probe until it
   passes → demo script + scenes manifest → `npx argo validate <name>` →
   `npm run pipeline -- <name>` → verify clip durations and frame-check every
   story beat before reporting.

4. **Stitch** if the video is a compilation:
   `npm run stitch -- <out.mp4> clip-intro <clips…> clip-outro`.

5. **Deliver**: the video path under `videos/`, what was verified, and any rough
   edges worth an iteration pass (timing, cuts, overlays). If the narration is
   now final and the user wants broadcast quality, offer `/revoice`.
