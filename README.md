<div align="center">

<img src="assets/revel-R-gradient-padded.png" alt="Revel" width="120" />

# revel-demos

**The free, open-source event platform for communities, clubs and independent venues.**

Everything needed to record narrated demo videos of Revel — on your own machine,
with no accounts, no keys, and nothing to set up by hand.

</div>

---

## What this is

Making a product video normally means running the whole product first. This repo
removes that step.

`docker compose up -d` gives you a complete, private copy of Revel — the app, its
API, its database, and a mail catcher — already filled with believable demo data:
real-looking organizations, events, members, tickets and questionnaires. Then a
script drives that app in a real browser while a computer voice narrates, and the
whole thing comes out as an MP4.

Nothing here touches the live service. No real people, no real data, no real
money. You can break it as often as you like — `docker compose down -v` puts it
back.

**About Revel:** it is where a club, collective, studio or venue runs its events —
publishing them, taking RSVPs and ticket sales, managing memberships and
member-only pricing, screening attendees with questionnaires when a space needs
care about who comes, coordinating potlucks, and checking people in at the door.
Open source, self-hostable, and built for small organizations rather than
stadiums. `USER_JOURNEYS.md` maps the whole thing, persona by persona.

## Before you start (Ubuntu)

```bash
# Docker, with the compose plugin
sudo apt update
sudo apt install -y docker.io docker-compose-v2 ffmpeg
sudo usermod -aG docker "$USER"    # then log out and back in

# Node.js 20 or newer — check what you have:
node --version
# if it is older than v20, install a current one:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

On macOS the equivalents are Docker Desktop and `brew install ffmpeg node`.

Revel is published for Intel/AMD only, so on an Apple-Silicon Mac the stack runs
emulated. `docker-compose.yml` already asks for that, and nothing extra is
needed — but expect the first boot to take roughly ten minutes rather than
three. Ubuntu on ordinary server hardware is the fast path, and the one this kit
is written for.

Then, in this repository:

```bash
npm install
npx playwright install chromium --with-deps
```

The last command installs the browser that does the recording, plus its system
libraries. It asks for your password.

## Quickstart

```bash
# 1. Start Revel. The first run downloads about 1.5 GB and seeds the
#    database, so give it a few minutes.
docker compose up -d
docker compose ps                    # wait until every service says "healthy"

# 2. Check everything is ready.
npm run doctor

# 3. Record a video.
npm run pipeline -- clip-intro

# 4. Watch it.
ffplay -autoexit videos/clip-intro.mp4      # or just open videos/clip-intro.mp4
```

That is the whole loop. While it is running you can open the app yourself at
**http://localhost:5173** and click around — it is the same copy the videos are
recorded from.

| | |
| --- | --- |
| The app | http://localhost:5173 |
| API | http://localhost:8000 |
| Mailpit — every email the app sends | http://localhost:8025 |

Everything is seeded and ready. Sign in with any account below.

## Everyday commands

```bash
npm run doctor                     # is everything running? — start here when something is odd
npm run pipeline -- <clip-name>    # record one clip end to end
npm run validate:all               # check every clip's scenes still line up
npm run stitch -- film.mp4 clip-intro clip-a clip-b clip-outro
npm run purge-clips -- <clip-name> # forget cached narration audio
npx argo preview                   # a browser dashboard of every clip

docker compose logs -f frontend    # or: web, worker, bootstrap, mailpit
npm run reseed                     # top up the demo data (skips what already exists)
docker compose down                # stop, keep the data
docker compose down -v             # stop and wipe everything
```

`npm run reseed` is deliberately conservative: it re-runs the demo-video
scenarios, but leaves an already-seeded database alone. To throw the seeded
world away and build it again from nothing:

```bash
FORCE_RESEED=1 docker compose run --rm bootstrap
```

Finished videos land in `videos/`.

## The demo world

Every account uses the password **`password123`**.

Five scenarios are seeded for filming. Each is one organization and one event,
with a cast whose situations differ — most of these stories are told by opening
the same page as two different people.

| Scenario | Event page | Who to sign in as |
| --- | --- | --- |
| **Shibari Circle Vienna** — the flagship: a questionnaire gates the event, and the organizer screens who comes | `/events/shibari-circle-vienna/intro-to-shibari-rope-and-trust` | `ren.owner@` reviews the three waiting applications · `noa.attendee@` has not applied, for the gate → apply → approve arc |
| **The Velvet Cellar** — members-only pricing: one event, two prices | `/events/the-velvet-cellar/basement-sessions-live-and-loud` | `lena.member@` sees a free members' tier · `paul.guest@` sees only the €15 door tier |
| **Sunday Slow Picnic Club** — potluck coordination, who is bringing what | `/events/sunday-slow-picnic-club/picnic-in-the-park` | `ana.owner@` put up the suggestions · `jonas.guest@` is attending having claimed nothing, for the claim-an-item shot |
| **Analog Photo Walks** — the organizer's side: questionnaire insights across ten applicants | `/events/analog-photo-walks/golden-hour-photo-walk` | `kaia.owner@` opens the insights |
| **Paper Hearts Book Club** — eligibility gates, and why someone is turned away | `/events/paper-hearts-book-club/monthly-reading-circle` | `bea.outsider@` is blocked by both gates · `hugo.member@` by the questionnaire alone · `clara.invited@` walks straight through |

Those addresses all end in **`@demovideo.example.com`** — the first one in full
is `ren.owner@demovideo.example.com`. Every organization also has a page of its
own at `/org/` plus the same slug.

**None of them are in the login page's one-click picker.** That picker lists the
standard `@example.com` cast only — `alice.owner@example.com`,
`bob.staff@example.com`, `charlie.member@example.com` and a dozen more, covering
owner, staff, member and attendee points of view. To sign in as any of the
scenario accounts above, click **"Show login form"** and type the address.

The seeder prints the whole cast, every persona's situation spelled out. That
output is the authoritative version — it always matches the running database:

```bash
docker compose logs bootstrap | sed -n '/DEMO VIDEO SEED/,$p'
```

Two things in this environment are deliberately faked so they photograph
correctly: the **"Continue with Google"** sign-in button, and the **"Add to
Apple Wallet" / "Add to Google Wallet"** buttons on tickets. Both render exactly
as they do in production.

Film the buttons rather than the click. The Google one genuinely does not work —
the credentials behind it are invented, and clicking ends at a Google error
page. The wallet buttons do respond (the throwaway certificates in
`fake-secrets/` are there so that a click returns a real, if worthless, pass
rather than a 500), but what comes back is signed by nobody and no phone will
accept it, so there is nothing worth filming past the click.

Two places to know about when framing a shot: `/login` hides the sign-in form,
and the Google button with it, behind a **"Show login form"** toggle, because
demo mode leads with the account picker. `/register` needs no toggle but opens
behind a **"This is a demo"** dialog — dismiss it with "Register anyway" first.

## The voice

Videos are narrated by a text-to-speech engine, and there are two worth knowing:

**Kokoro** is the default. It runs on your own machine, it is free, and you can
re-render as many times as you like. Every draft uses it.

**ElevenLabs** is the polished one, and it is billed per character. It is for the
final pass, once the words are settled.

```bash
npm run pipeline -- my-clip                       # draft, free

npm run purge-clips -- my-clip                    # ← do not skip this
ARGO_TTS=elevenlabs npx argo pipeline my-clip     # final, paid
```

That middle line matters. Narration audio is cached by the *text* of each line —
not by which voice said it — so without purging first, the "final" render quietly
reuses the free voice and tells you it succeeded. Ask Claude for `/revoice` and
it handles this for you.

Using ElevenLabs needs a key in `.env` (copy `.env.example` first). That file is
never committed.

## Working with Claude

This repo is set up for Claude Code, which knows how to do all of the above.
`CLAUDE.md` is its briefing; three commands are ready to use:

| | |
| --- | --- |
| `/new-clip <what to show>` | storyboard and build one new clip |
| `/demo-video <feature>` | plan and produce a full video |
| `/revoice <clip>` | re-record a finished clip in the paid voice |

Each one starts by proposing a storyboard and waiting for you to say yes — so
you shape the story in chat, before anything is rendered.

## Keeping it current

Revel ships new releases regularly. To move the demo environment to a newer one,
edit `.env` (copy it from `.env.example` if you have not yet):

```bash
REVEL_BACKEND_TAG=2.8.0
REVEL_FRONTEND_TAG=v2.8.0
```

then `docker compose pull && docker compose up -d`.

Backend versions have no `v` in front; frontend versions do. Current tags are
listed at https://github.com/orgs/letsrevel/packages.

## Something went wrong

**`npm run doctor` first.** It checks every service, the demo data and the voice
engine, and names what is broken.

| Symptom | Fix |
| --- | --- |
| `docker compose ps` shows a service unhealthy | `docker compose logs <service>` — it will say why |
| Seeding warned about `bootstrap_demo_video` | the backend image is older than that scenario data — raise `REVEL_BACKEND_TAG` in `.env`, then `docker compose pull && docker compose up -d && npm run reseed` |
| The app loads but has no data | `npm run reseed` |
| A render fails on a missing button | the app changed. Run the matching script in `probes/` to see what is on the page now |
| The video came out in the wrong voice | you skipped `npm run purge-clips` before switching engines |
| Everything is confusing | `docker compose down -v && docker compose up -d` — a full reset, five minutes |

## Licence

MIT.
