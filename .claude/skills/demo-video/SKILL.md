---
name: demo-video
description: Use when asked to create, re-render, or re-voice a Revel product demo video, feature tour, marketing screen recording, or "argo" video — or when a demo render fails (wrong voice per scene, runaway TTS clip, missing overlays, CSP errors, banner in frame).
---

# Demo Video Production (argo pipeline)

Produce narrated product videos of Revel: Playwright drives the real app running
in Docker, a text-to-speech engine narrates, and argo composes the MP4.
Everything needed lives in this repository.

## Non-negotiable workflow order

1. **Brainstorm first.** Before any code: agree with the user on the story arc,
   audience and format, a scene list with draft narration lines, the personas
   and data to arrange, and the voice. Present the storyboard in chat and get a
   yes. Revising words is free; revising a render is twenty minutes.
2. **Environment up.** Run `npm run doctor` — it checks the host tools, all
   three services, demo mode, the fake SSO provider, and the selected TTS
   engine, and tells you what is wrong. If the stack is down:
   ```bash
   docker compose up -d
   docker compose ps          # wait until every service reports healthy
   ```
   Seeding runs automatically on first boot (`docker compose logs bootstrap`).
   Never restart a service that is already healthy mid-session.
3. **Probe before render.** Copy the closest file in `probes/` and adapt it: a
   headless script that walks every selector of the planned flow in well under a
   minute. Only render once the probe passes. A wrong selector found in a probe
   costs seconds; found in a render, it costs the whole take.
4. **Write the demo** — `demos/<name>.demo.ts` + `demos/<name>.scenes.json` —
   then `npx argo validate <name>`, then `npm run pipeline -- <name>`.
5. **Verify the output.** Read the scene report for runaway durations, extract
   frames at every story beat (`ffmpeg -ss <t> -i videos/<name>.mp4 -frames:v 1
   /tmp/f.png`) and actually Read them, before telling the user it is done.

## The environment

| Service | URL | What it is |
| --- | --- | --- |
| frontend | http://localhost:5173 | the app being filmed |
| API | http://localhost:8000 | Django backend; `/api/version` is the health probe |
| Mailpit | http://localhost:8025 | catches every email; demo scripts read verification links from its API |

Health checks, in order of usefulness:

```bash
curl -s localhost:8000/api/version                        # {"version":…,"demo":true,"sso_providers":[…]}
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173/  # 200
curl -s localhost:8025/api/v1/info                        # Mailpit alive
```

Seeded accounts: the `@example.com` users, password `password123` (the login
page's demo picker lists them). `docker compose down -v` wipes everything;
`npm run reseed` re-runs seeding without a wipe.

**Demo-environment fakes worth knowing.** SSO and wallet passes are configured
with believable fake values so the buttons render on camera:

- The login and register pages show a real **"Continue with Google"** button.
  On `/login` it sits behind the "use a real account" toggle, because demo mode
  shows the account picker first — `/register` shows it immediately. The button
  is for filming; clicking it fails, so do not film the click.
- Tickets and membership cards show **"Add to Apple Wallet"** and **"Add to
  Google Wallet"**. Same rule: film the buttons, not the download.

## Voice & TTS

Configured in `argo.config.mjs`. Select with the `ARGO_TTS` environment
variable; override the speaker with `ARGO_VOICE`.

| `ARGO_TTS` | Engine | Cost | Runs on |
| --- | --- | --- | --- |
| *(unset)* / `kokoro` | Kokoro-82M, voice `af_heart` | free | anywhere — pure Node |
| `elevenlabs` | ElevenLabs, voice "Will" | **billed per character** | anywhere, needs a key |
| `mlx` | mlx-audio / Qwen3, voice `aiden` | free | Apple Silicon Macs only |

**The doctrine: draft local, finish cloud.** Every iteration — wording, timing,
scene order — happens on Kokoro, which is free and unlimited. Only when the
user has signed off on the exact words do you re-voice with ElevenLabs. Use the
`/revoice` command for that; it enforces the steps below.

- **The clip cache does not key on the engine or the voice.** argo caches TTS
  audio at `.argo/<demo>/clips/`, hashed on the scene *text* alone. Switching
  engines therefore reuses the old audio and hands you a video in the wrong
  voice while reporting success. After ANY change to the TTS config:
  ```bash
  npm run purge-clips -- <demo>     # then re-run the full pipeline
  ```
  Re-run `pipeline`, not just `tts generate` — recording holds are timed to
  clip durations, so new audio needs a new recording.
- **Check every clip duration before exporting**: `ffprobe` the files in
  `.argo/<demo>/clips/`. A one-line scene that produced 90 seconds of audio is
  a runaway generation, not a long line.
- The `mlx` engine keeps a `maxTokens: 300` guard (~25s ceiling) for exactly
  that reason — a short outro line once came back as 96 seconds. Do not remove
  it. Its valid speakers, for this checkpoint only, are `serena vivian uncle_fu
  ryan aiden ono_anna sohee eric dylan`; an unknown name is **not** rejected, it
  silently samples a random speaker per clip, so the voice changes every scene.
- ElevenLabs voices are **IDs, not names**. List the account's roster with
  `GET https://api.elevenlabs.io/v1/voices` (header `xi-api-key`). Only roster
  voices work — argo's own default (Rachel) is a shared library voice that
  returns 402 on most plans.
- **Voice auditions**: generate one line per candidate into `tts-samples/`, then
  let the *user* listen — `ffplay -autoexit -nodisp <file>` (on a Mac, `afplay
  <file>` also works). Never claim to have judged audio yourself.

## Recording traps (each one cost a failed take)

| Trap | Rule |
| --- | --- |
| Nonce CSP blocks argo's GSAP overlays | `test.use({ bypassCSP: true })` in every demo script |
| Demo-mode chrome in frame | /login hides the form behind a "Show login form" toggle; hide the banner with `div[role="alert"]:has(a[href*="mailpit"]){display:none!important}` and **re-apply after every full `page.goto`**. `gotoClean()` in `demos/clip-helpers.ts` does both |
| Clicks lost pre-hydration | wait for `body[data-hydrated="true"]` after every full load, and for the "Open notifications" bell before any mutation (`waitHydrated` / `waitClientAuth`) |
| One screencast, one page | `startRecording(page)` can never switch pages. Cut to another view with a full-screen interstitial painted on `about:blank`, do the account switch on a second **unrecorded** page in the same context (`page.context().newPage()`: /logout → UI login), then `page.goto` the target. `showInterstitial` + `switchUser` implement the pattern |
| `showOverlay` BLOCKS for its whole duration | anything written after `showOverlay(page, scene, durationFor(scene))` runs only once the narration has ended. Use `withOverlay(page, scene, async () => {…})` for every scene that *does* something; `showOverlay` only for pure holds (intro, outro). `durationFor` means "remaining from now" — never subtract manually |
| Text that exists twice on the page | `getByText(...)` can resolve to a hidden duplicate (mobile and desktop both render) and time out — add `.filter({ visible: true })` |
| Mark placed before a cut | narration starts at `mark()`, so a mark before an interstitial + account switch + load narrates over the interstitial. Change the content FIRST, then `mark()`, and pad the interstitial hold (silence is speed-ramped 2×) |
| A never-matching locator hangs the take | `actionTimeout: 15_000` in `playwright.config.ts` — keep it. `.catch()` on an action does **not** rescue endless waiting, only rejection. Verify with `count()`/`isVisible()` before acting |
| Interactions during query-settling get dropped | after landing on a form, `waitForLoadState('networkidle')` and verify typed values before submitting |
| The API silently drops unknown fields | a misspelled request field (`waives_membership` vs the real `waives_membership_required`) fails **silently** — the call succeeds and nothing happens. Verify arranged state in the probe; check the API schema for exact field names |
| Collapsible sections may start OPEN | the potluck section is expanded for attendees who have RSVP'd — check `aria-expanded` before toggling, or you close it on camera |
| Camera-permission surfaces error in headless capture | QR-scanner views (member verification) show a camera error — avoid them, or fake a camera with Playwright launch args |
| Seeded personas already own tickets | a persona holding a ticket shows no purchase UI. Prefer arranging a FRESH org/event through `demos/arrange-lib.mjs` |
| Stale state across takes | make demos self-healing: release leftover holds and recreate state in setup, before `startRecording` |
| Clip cache vs. engine | see "Voice & TTS" above — purge on every engine or voice change |

## Tone & brand

- **Narration is warm, human and honest** — like explaining something to a
  friend, not reading ad copy. No hype adjectives, no superlatives. Say what the
  feature does and why someone would care. Spell speakables phonetically for the
  engine ("lets revel dot io").
- **The tagline is fixed.** Always, verbatim:
  *"The free, open-source event platform for communities, clubs and independent
  venues."* Never invent an alternative.
- **Use the real logo, never argo's placeholder tile.** The `logo-outro` block
  takes `logo` / `title` / `tagline` / `accentColor`. `logo` renders in a
  hard-sized 72×72 square, so pass the square mark
  `assets/revel-R-gradient-padded.png` — the wide lockup would squash — and it
  MUST be a `data:` URI (base64 it into the scenes.json prop; the overlay renders
  inside the recorded page, so file paths never resolve).
  `assets/revel-R-gradient-padded.png.b64` is the pre-encoded copy.
- **Never hand-set the "let's revel." wordmark** in a system font. Either use a
  real logo asset or use no wordmark.
- **Interstitials and end cards use soft brand surfaces** — lavender paper, gentle
  gradients — not loud saturated walls. This applies to surfaces you paint
  yourself; argo's own overlay cards pick their theme automatically from the
  sampled background and are not controllable.
- **Dress the data.** Arrange steps should set a real venue and address — a bare
  event page shows "Location TBD" on camera — and give organizations and events
  descriptions that read like a real community wrote them.

## Working in this repo

- `demos/*.demo.ts` + `demos/*.scenes.json` — one pair per clip.
- `demos/clip-helpers.ts` — the shared waits and cuts. Import these rather than
  re-implementing: `gotoClean`, `waitHydrated`, `waitClientAuth`, `uiLogin`,
  `switchUser`, `showInterstitial`, `slowScroll`.
- `demos/arrange-lib.mjs` — build backend state through the API: register a
  Mailpit-verified user, create an organization and event, add ticket tiers,
  memberships, questionnaires, potluck items. Prefer this over seeded data, so
  clips survive a reseed.
- `probes/` — headless selector-walkers, one per flow. Start from the closest one.
- `scripts/` — `doctor.mjs`, `purge-clips.mjs`, `validate-all.mjs`,
  `bootstrap-demo.sh`, `make-fake-secrets.sh`.

Useful commands:

```bash
npm run doctor                       # environment check — run this first
npx argo validate <name>             # scene names match the marks (offline, instant)
npm run validate:all                 # every demo
npm run pipeline -- <name>           # tts → record → align → export
npm run purge-clips -- <name>        # drop cached audio (before a re-voice)
npm run stitch -- out.mp4 a b c      # join clips into one video
npx argo preview                     # browser dashboard of every demo
```

Working examples to learn the shape from: `demos/clip-intro.*` (painted card),
`demos/clip-user-tickets-member.*` (two-actor cut with an interstitial),
`demos/clip-org-questionnaire-insights.*` (admin flow),
`demos/logo-check.*` (the real-logo outro card). argo's own API reference is
`node_modules/@argo-video/cli/README.md`.

## Iterating

- TTS clips are cached by text hash, so rewording one scene re-synthesizes only
  that clip. Timing changes need a full `pipeline` re-run.
- Each demo arranges fresh state, so retakes are free. A full reset is
  `docker compose down -v && docker compose up -d`.
- Build long videos as several short clips and join them with `npm run stitch`.
  Then a bad take costs one clip, not the whole film. Keep `clip-intro` first
  and `clip-outro` last.
