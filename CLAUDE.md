# CLAUDE.md

Guidance for Claude Code working in this repository.

## Who you are working with

The person using this repo makes **social media and marketing videos**. They are
not a developer, and they should not need to become one. Consequences:

- **Explain in plain language.** "The app isn't running yet, I'll start it"
  rather than a stack trace. Keep Docker, npm and ffmpeg details in the
  background unless they are the actual problem.
- **Do the mechanical work yourself.** Starting services, writing scripts,
  running the pipeline, checking output frames. Ask them for judgement calls —
  story, wording, voice, what looks good — not for commands.
- **Show, don't describe.** When a render finishes, extract a frame and look at
  it. Tell them what is actually on screen, then hand them the file path.
- **Never spend their money silently.** ElevenLabs is billed per character.
  Draft everything on the free local voice and ask before switching.

## What Revel is

**The free, open-source event platform for communities, clubs and independent
venues.** — that is the tagline, and it is used **verbatim**, never reworded.

Revel is where a club, collective, studio or venue runs its events: publishing
them, taking RSVPs and ticket sales, managing memberships and member-only
pricing, screening attendees with questionnaires when a space needs care about
who comes, coordinating potlucks, and checking people in at the door. It is open
source and self-hostable, and it is built for small organizations rather than
stadiums.

`USER_JOURNEYS.md` in this repo is the full map of what the platform does,
persona by persona. Read the relevant journey before storyboarding a feature you
have not filmed before — it will tell you what the flow actually contains.

## What this repository is

A self-contained kit for producing **narrated demo videos of Revel**.

It brings up a complete, private copy of the platform in Docker, seeded with
believable demo data, then drives it with a real browser while a text-to-speech
voice narrates — and composes the result into an MP4. Nothing here talks to the
live production service, and no real user data is ever involved.

The video pipeline is [argo](https://www.npmjs.com/package/@argo-video/cli):
a Playwright script performs the actions, a scenes manifest supplies the
narration, and argo records, aligns the audio, and exports the video.

## Repository layout

```
docker-compose.yml        The whole Revel platform, from published images
scripts/bootstrap-demo.sh Seeding, run automatically at first boot
fake-secrets/             Deliberately fake wallet credentials (see below)

demos/                    One pair of files per clip:
  <name>.demo.ts            the Playwright script (what happens on screen)
  <name>.scenes.json        the narration + overlays for each scene
  clip-helpers.ts           shared waits, logins, cuts — always import these
  arrange-lib.mjs           build backend state through the API
  arrange-qgate.mjs         older per-demo arrange helpers
  arrange-potluck.mjs

probes/                   Headless selector-walkers — run before every render
scripts/                  doctor, purge-clips, validate-all, seeding, fake certs
assets/                   Brand marks (committed — these are inputs)
tts-samples/              Voice audition clips (audio is not committed)
videos/                   Rendered output (not committed)
.argo/                    argo's working cache (not committed)

argo.config.mjs           Video, audio and TTS engine settings
playwright.config.ts      Browser and viewport settings
stitch.mjs                Join finished clips into one video
```

## Bringing the environment up

```bash
docker compose up -d
docker compose ps            # wait until everything says "healthy"
```

First run pulls about 1.5 GB of images and then seeds the database, which takes
a few minutes. Seeding runs by itself; watch it with
`docker compose logs -f bootstrap`.

| | URL |
| --- | --- |
| The app (what you film) | http://localhost:5173 |
| API | http://localhost:8000 |
| Mailpit — every email the app sends | http://localhost:8025 |

Health checks:

```bash
npm run doctor                                             # checks all of the below, and more
curl -s localhost:8000/api/version                         # {"version":…,"demo":true,"sso_providers":[…]}
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173/   # 200
curl -s localhost:8025/api/v1/info                         # Mailpit alive
```

Other useful commands:

```bash
docker compose logs -f <service>   # web, frontend, worker, bootstrap, mailpit
npm run reseed                     # re-run seeding
docker compose down                # stop, keep the data
docker compose down -v             # stop and wipe the database completely
```

**Image versions live in `.env`** (`REVEL_BACKEND_TAG`, `REVEL_FRONTEND_TAG`),
copied from `.env.example`. Backend tags have no leading `v` (`2.8.0`); frontend
tags do (`v2.8.0`). After changing either: `docker compose pull && docker
compose up -d`.

### Seeded demo world

All demo accounts use the password **`password123`**. The login page shows a
one-click picker for them, because the backend runs in demo mode.

The standard seed creates the `@example.com` cast — `alice.owner@example.com`,
`bob.staff@example.com`, `charlie.member@example.com` and others — plus
organizations, events and test scenarios covering every eligibility gate.

On top of that, `bootstrap_demo_video` seeds the scenarios written specifically
for filming:

| Organization | What it demonstrates |
| --- | --- |
| Shibari Circle Vienna | the flagship: a questionnaire-gated event, screening who attends |
| The Velvet Cellar | members-only ticket tiers and member pricing |
| Sunday Slow Picnic Club | potluck coordination |
| Analog Photo Walks | organizer-side questionnaire insights |
| Paper Hearts Book Club | eligibility gates |

If `docker compose logs bootstrap` printed a warning that
`bootstrap_demo_video` does not exist in the image, raise `REVEL_BACKEND_TAG`
in `.env` and re-run `npm run reseed`. Everything else still works meanwhile:
the standard accounts are seeded, and demo scripts that build their own data
through the API do not depend on it at all.

### The deliberate fakes

The demo environment is configured with believable **fake** credentials so that
buttons which normally require corporate accounts still render on camera:

- **"Continue with Google"** on the login and register pages. Configured via
  `OIDC_PROVIDERS=google` plus `OIDC_GOOGLE_ISSUER` / `_CLIENT_ID` /
  `_CLIENT_SECRET` in `docker-compose.yml`. Nothing is verified at startup — the
  app only contacts Google when someone clicks — so fake values boot fine and
  the button renders. **Film the button, not the click**; the click fails.
  On `/login` the button sits behind the "use a real account" toggle, because
  demo mode shows the account picker first. `/register` shows it immediately.
- **"Add to Apple Wallet" / "Add to Google Wallet"** on tickets and membership
  cards. This is global configuration, not per-organization: the app offers a
  wallet pass whenever the `APPLE_WALLET_*` / `GOOGLE_WALLET_*` settings are
  non-empty. It never checks that the certificate files exist. The self-signed
  throwaways in `fake-secrets/` exist so that clicking produces an (invalid)
  pass rather than an error page — regenerate with
  `bash scripts/make-fake-secrets.sh`. Still: film the buttons, not the download.

None of these are secrets. They grant access to nothing. Never point a real
deployment at them.

`fake-secrets/google-wallet-sa.json` is deliberately **not** committed —
GitHub's push protection rejects anything shaped like a Google service-account
key regardless of whether it is real. `npm install` generates it (via the
`postinstall` hook), and `bash scripts/make-fake-secrets.sh` rebuilds it. Its
absence does not hide the wallet buttons; it only makes a click fail.

## The production workflow

Follow this order. It is not optional, and skipping a step reliably costs a
render.

### 1. Brainstorm the storyboard — before any code

Agree with the user, in chat:

- the one idea the video lands, its audience and where it will be posted;
- a numbered scene list: for each scene, the on-screen action AND the draft
  narration line;
- which personas appear, and whether an account switch is needed (each switch
  costs an interstitial — two personas is the practical maximum per clip);
- what backend state to arrange;
- the voice.

**Present it and wait for approval.** Rewriting a storyboard costs a minute;
re-rendering costs twenty.

Build long videos as **several short clips**, joined afterwards. A bad take then
costs one clip instead of the whole film.

### 2. Environment

`npm run doctor` must be green. If it is not, fix what it names.

### 3. Probe

Copy the closest file from `probes/` and adapt it: a headless script that walks
every selector the clip will touch and prints what it found, in under a minute.
Iterate there until it passes. A wrong selector found in a probe costs seconds;
found in a render, it costs the take.

### 4. Write the demo

`demos/<name>.demo.ts` (the script) and `demos/<name>.scenes.json` (narration
and overlays). Import the shared helpers from `demos/clip-helpers.ts` rather
than re-implementing waits. Then:

```bash
npx argo validate <name>        # scene names must match the marks — offline, instant
npm run pipeline -- <name>      # tts → record → align → export
```

### 5. Verify before claiming anything

- Read the scene report for runaway durations.
- `ffprobe` each file in `.argo/<name>/clips/` — a one-line scene that produced
  90 seconds of audio is a runaway generation.
- Extract a frame at every story beat and **actually look at it**:
  `ffmpeg -ss <seconds> -i videos/<name>.mp4 -frames:v 1 /tmp/frame.png`
- Only then report, with the file path and what you verified.

### 6. Stitch

```bash
npm run stitch -- compilation.mp4 clip-intro clip-a clip-b clip-outro
```

Clip names resolve to `videos/<name>.mp4`. Keep `clip-intro` first and
`clip-outro` last unless the user asks otherwise. Output lands in `videos/`.

## Voice & TTS

Set in `argo.config.mjs`, selected with the `ARGO_TTS` environment variable.

| `ARGO_TTS` | Engine | Cost | Runs on |
| --- | --- | --- | --- |
| *(unset)* / `kokoro` | Kokoro-82M, voice `af_heart` | free | anywhere — pure Node, works on Ubuntu |
| `elevenlabs` | ElevenLabs, voice "Will" (`bIHbv24MWmeRgasZH58o`) | **billed per character** | anywhere, needs `ELEVENLABS_API_KEY` in `.env` |
| `mlx` | mlx-audio / Qwen3, voice `aiden` | free | Apple Silicon Macs only |

**The doctrine: draft local, finish cloud.** Every iteration — wording, timing,
scene order — runs on Kokoro, which is free and unlimited. Only once the user has
signed off on the exact words do you re-voice with ElevenLabs, via `/revoice`.

**The trap that catches everyone:** the clip cache is keyed on the scene *text*
alone, not on the engine or the voice. Switching engines silently reuses the old
audio and gives you a video in the wrong voice, having reported success. So:

```bash
npm run purge-clips -- <demo>          # ALWAYS, before a re-voice
ARGO_TTS=elevenlabs npx argo pipeline <demo>
```

Re-run the whole `pipeline`, not just `tts generate` — recording holds are timed
to clip durations, so new audio needs a new recording.

**Voice auditions**: generate one line per candidate into `tts-samples/`, then
let the *user* listen — `ffplay -autoexit -nodisp <file>` (on a Mac, `afplay
<file>` works too). Never claim to have judged audio yourself; you cannot hear it.

ElevenLabs voices are **IDs, not names**; list the account's roster with
`GET https://api.elevenlabs.io/v1/voices` (header `xi-api-key`). Only roster
voices work — argo's default (Rachel) is a shared library voice that returns 402
on most plans.

The `mlx` engine keeps a `maxTokens: 300` guard (~25 second ceiling) because a
short outro line once generated 96 seconds of audio. Do not remove it. Its valid
speakers are `serena vivian uncle_fu ryan aiden ono_anna sohee eric dylan` — an
unknown name is not rejected, it silently samples a random speaker per clip, so
the voice changes every scene.

## Recording traps

Each of these cost a failed take at least once.

| Trap | Rule |
| --- | --- |
| Content security policy blocks argo's overlays | `test.use({ bypassCSP: true })` in every demo script |
| Demo-mode chrome in frame | the login page hides the form behind a "Show login form" toggle; hide the demo banner with `div[role="alert"]:has(a[href*="mailpit"]){display:none!important}` and **re-apply after every full `page.goto`**. `gotoClean()` does both |
| Clicks lost before the page is interactive | wait for `body[data-hydrated="true"]` after every full load, and for the "Open notifications" bell before any action that changes data (`waitHydrated` / `waitClientAuth`) |
| One recording, one page | `startRecording(page)` can never follow a page switch. Cut to another view with a full-screen interstitial painted on `about:blank`, do the account switch on a second **unrecorded** page in the same browser context (`page.context().newPage()`: /logout → log in), then navigate the recorded page. `showInterstitial` + `switchUser` implement this |
| `showOverlay` blocks for its whole duration | anything written after `showOverlay(page, scene, durationFor(scene))` only runs once the narration has finished — so every action lands after its own line. Use `withOverlay(page, scene, async () => {…})` for scenes that *do* something; `showOverlay` only for pure holds. `durationFor` already means "remaining from now" — never subtract manually |
| Text that appears twice on the page | `getByText(...)` can match a hidden duplicate (mobile and desktop layouts both render) and time out — add `.filter({ visible: true })` |
| A narration mark placed before a cut | narration starts at `mark()`, so marking before an interstitial and a page load narrates over the interstitial. Change the content first, then `mark()`, and pad the interstitial hold (silence is sped up 2× automatically) |
| A never-matching locator hangs the whole take | `actionTimeout: 15_000` in `playwright.config.ts` — keep it. `.catch()` does **not** rescue endless waiting, only rejection. Check `count()`/`isVisible()` before acting |
| Interactions dropped while data is still loading | after landing on a form, `waitForLoadState('networkidle')` and verify typed values before submitting |
| The API silently drops unknown fields | a misspelled request field (`waives_membership` instead of `waives_membership_required`) fails **silently**: the call succeeds and nothing happens. Verify arranged state in the probe |
| Collapsible sections may already be open | the potluck section is expanded for attendees who have RSVP'd — check `aria-expanded` before toggling, or you close it on camera |
| Camera-permission surfaces error in a headless browser | QR-scanner views (door check-in, member verification) show a camera error — avoid them, or fake a camera with Playwright launch arguments |
| Seeded personas already own tickets | someone who already has a ticket sees no purchase UI. Prefer arranging a fresh organization and event through `demos/arrange-lib.mjs` |
| Stale state between takes | make demos self-healing: release leftover holds and recreate state in setup, before `startRecording` |
| Clip cache versus engine | purge cached clips on every engine or voice change (see above) |

## Tone & brand

- **Narration is warm, human and honest** — like explaining something to a
  friend, not reading ad copy. No hype adjectives, no superlatives. Say what the
  feature does and why someone would care. Short sentences: they are spoken, not
  read. Spell speakables phonetically for the engine ("lets revel dot io").
- **The tagline is fixed and verbatim**: *"The free, open-source event platform
  for communities, clubs and independent venues."* Never invent an alternative,
  never trim it.
- **Use the real logo assets, never argo's placeholder tile.** The `logo-outro`
  overlay block takes `logo` / `title` / `tagline` / `accentColor`. `logo`
  renders in a hard-sized 72×72 square, so pass the square mark
  `assets/revel-R-gradient-padded.png` — the wide lockup would squash — and it
  must be a `data:` URI, because the overlay renders inside the recorded page
  where file paths do not resolve. `assets/revel-R-gradient-padded.png.b64` is
  the pre-encoded copy.
- **Never hand-set the "let's revel." wordmark** in a system font. Use a real
  logo asset, or no wordmark at all.
- **Interstitials and end cards use soft brand surfaces** — lavender paper,
  gentle gradients — not loud saturated walls. This applies to surfaces you
  paint yourself; argo's own overlay cards choose their theme from the sampled
  background and are not controllable.
- **Dress the data.** Arranged organizations and events need a real address (a
  bare event page shows "Location TBD" on camera) and descriptions that read
  like a real community wrote them.

Brand colors, when you paint a surface yourself:

| | |
| --- | --- |
| Hearty Purple | `#8C3CDD` |
| Light Crimson | `#E6332A` |
| Lavender | `#AB82DB` |
| Periwinkle | `#9AB2FF` |
| Amber | `#F9B233` |
| Ink (text) | `#0D1E1C` |

## Conventions

- **Never commit `.env`.** It holds the ElevenLabs key. It is git-ignored; keep
  it that way.
- **Never commit rendered video.** `videos/`, `.argo/` and audio samples are
  ignored — they are regenerable and large.
- **`assets/` IS committed** — brand marks are inputs, not output.
- Conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`).
- Ask before committing: show `git status` and the draft message first.
- Never put session URLs in commits, pull requests or issues.
