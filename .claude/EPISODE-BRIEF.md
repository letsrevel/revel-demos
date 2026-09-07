# Brief for an episode author (subagent)

You are producing ONE episode of the "Revel, in depth" series in this repo
(`/Users/biagio/repos/letsrevel/revel-demos`). Other authors are producing
other episodes at the same time against the same running Docker stack, so
stay inside your own files and never touch the stack.

## Read first (in this order)

1. `CLAUDE.md` (repo root) — the whole production doctrine and every recording trap.
2. `EPISODES.md` — the house rules at the top, then YOUR episode's section.
3. `demos/episode-helpers.ts` and `demos/ep-format-check.demo.ts` + `.scenes.json` — the skeleton you copy.
4. `demos/clip-helpers.ts`, `demos/arrange-lib.mjs`.
5. The closest existing clip and probe: `demos/clip-user-tickets-member.*` (two personas, one cut), `demos/clip-org-membership.*` (admin pages), `demos/clip-much-more.*` (time-budgeted montage), `demos/clip-gate-review.*`, `probes/*.mjs`.

Read-only references you may consult for selectors and field names:
- Frontend source: `/Users/biagio/repos/letsrevel/revel-frontend/src/routes/...` and `src/lib/components/...` — the real labels, roles, and routes.
- API schema: `/Users/biagio/repos/letsrevel/revel-backend/.artifacts/openapi.json` — exact request field names (the API silently drops unknown fields).

## Workflow (not optional)

1. **Probe**: write `probes/ep-<slug>.mjs` — a headless Playwright script (see `probes/`) that arranges state through `demos/arrange-lib.mjs`, logs in, and walks EVERY page and selector your scenes will touch, printing what it found. `node probes/ep-<slug>.mjs`. Iterate there until every step passes. Verify arranged state via the API in the probe.
2. **Write** `demos/ep-<slug>.demo.ts` and `demos/ep-<slug>.scenes.json`, copying the skeleton's framing exactly: scene `title` first (title card), your scenes, scene `close` last (end card). Use `withOverlay` for scenes that act, `showOverlay` only for pure holds. Mark AFTER cuts and loads, never before.
3. `npx argo validate ep-<slug>`.
4. **Render**: `npm run episode -- ep-<slug>`. It waits for one of two render slots, then runs the pipeline into `videos/in-depth/`. Run it with `run_in_background: true` and wait for the completion notification (do not poll with sleep). A full render is 5–20 minutes.
5. **Verify before claiming anything**:
   - Scene report: total 60–80 s; no scene wildly longer than its line.
   - `ffprobe -v error -show_entries format=duration -of csv=p=0 .argo/ep-<slug>/clips/*` — a short line that produced 60 s of audio is a runaway.
   - Extract a frame at EVERY story beat (`ffmpeg -ss <t> -i videos/in-depth/ep-<slug>.mp4 -frames:v 1 <scratch>/f-<t>.png`) into your scratchpad directory and **Read every frame**. Look for: the demo banner; a logged-out header ("Login / Sign Up") on an admin page; an empty state or "No … yet"; "Location TBD"; test-fixture names or `demo-xyz-123@` emails on camera; an overlay covering the thing being narrated; narration starting before the page has painted; the cursor parked over the subject.
   - Fix and re-render until it is right. Budget: up to four renders.
6. **Report** (your final message): the output path; total duration; the scene report; one line per beat saying what the frame actually shows; every deviation from the storyboard and why; any state left behind in the stack.

## Rules

- Only create/edit: `demos/ep-<slug>.demo.ts`, `demos/ep-<slug>.scenes.json`, `probes/ep-<slug>.mjs`. If you genuinely need a new generic arrange primitive, APPEND a new exported function to `demos/arrange-lib.mjs` — never modify an existing one. Do not edit `episode-helpers.ts`, `clip-helpers.ts`, `argo.config.mjs`, `playwright.config.ts`, or any other episode's files. Prefer local helpers inside your own demo file.
- Never run `docker compose down|restart|run`, `npm run reseed`, or anything that changes the stack. Never delete other videos or `.argo/` directories other than your own.
- Never set `ARGO_TTS=elevenlabs`. Kokoro only.
- Do not commit.
- Arrange fresh state through the API every run (self-healing). Dress it: addresses, descriptions, human names, human-shaped emails (`registerVerifiedUser(..., { emailLocal })`). Two personas maximum.
- Narration: start from the draft lines in `EPISODES.md`, then tune the words to match what is REALLY on screen. Keep the title line's shape and the close line's exact final sentence: "Revel is free and open source. Find it at lets revel dot io." Warm, plain, spoken; no superlatives; spell "R S V P" and "lets revel dot io" for the engine. One overlay per app scene, four words or fewer, none on title/close.
- Scratch files go under `/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-<slug>/`.
