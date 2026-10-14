# ARCHITECTURE — how "One Line" is put together

Read with `frame.md` (design truth) and `STORYBOARD.md` (what each frame shows).

## Layers (index.html is GENERATED — run `node tools/build-index.mjs`, never hand-edit)

| z | layer | file | window | owner |
| --- | --- | --- | --- | --- |
| 1 | world: paper/light, 3D rope, people beads, camera | `compositions/world.html` | whole film | spine |
| 10–14 | scene layers: type + Revel UI | `compositions/s1-origins.html` … `s5-everything.html` | per section | scene authors |
| 90 | finish: grain, vignette, head/tail fades | `compositions/finish.html` | whole film | spine |
| 95 | voice credit "Voice: Tobias Fischbach" | in index.html | 0.8–7.2 s | done |

Scene layer windows (film seconds): s1 0–19.2 · s2 19.0–39.67 · s3 39.27–57.12 ·
s4 56.72–71.6 · s5 71.4–95.0. A scene layer's timeline runs in **local** time
(0 = its data-start). `FILM.T.lines` and every helper speak **film** time — subtract
your layer's start.

## Shared runtime — `lib/film.js` → `window.FILM` (loaded in index head)

- `FILM.T` timing (`data/timing.json`): `lines[]` with `start/end/words[{w,s,e}]` in
  film time; `sections`; `montage[]` (beat times of the six feature panels).
- `FILM.revealWords(tl, el, lineId, layerStart, opts)` — voice-synced word reveal.
- `FILM.wordAt(lineId, indexOrText)` — film time a word is spoken.
- `FILM.rope.section({ id, from, to, frame(t), camera(t) })` — register rope choreography.
- `FILM.camera(t)` / `FILM.toScreen(t, x, y)` / `FILM.cameraCSS(t)` /
  `FILM.followCamera(tl, el, layerStart, from, to)` — the one camera.
- maths: `clamp lerp prog E.* spring rng noise1 spline measure pointAt resample svgPathPoints`, colours `FILM.C`.
- `window.RPATH` (the R mark path, old film units), `window.CODE` (real evaluator.py lines, AI lines removed).

## World coordinates
World px, 1920×1080 at camera zoom 1, origin top-left, **y down**, z toward the
viewer (0 = the paper; the rope lies at z≈0–30, beads sit on the paper). This is the
old Canvas film's space, so its paths port directly. The camera is
`{x, y, zoom, rot}` = world point at screen centre. With no camera function the
camera is `{960, 540, 1, 0}` and world px = screen px.

## Rope modules — `rope/<layer-id>.js`
Pure functions of **film** time; no DOM, no THREE. Register exactly one section per
module whose `[from, to)` equals the layer window (the world draws every active
section; overlapping windows both draw — fade your strands out in the overlap).
Strand / bead / camera shapes are documented at the top of the rope block in
`lib/film.js`. Keep strand point counts sane (≤ 400 control points after your own
sampling; the renderer smooths).

## Seams between sections
| seam | film t | rule |
| --- | --- | --- |
| s1 → s2 | 19.2 | hard cut on the music dip. s1 world elements gone at 19.2; s2 starts from its own state. |
| s2 → s3 | 39.27 | dissolve to dusk (world light changes). s2 rope exits right by 39.3; s3 rope enters from the left. |
| s3 → s4 | 56.72 | camera whip right. At t = 56.72 both sections draw ONE straight rope `[[-200,540],[2120,540]]`, camera `{960,540,1,0}`. s3 whips into it from 56.3, s4 whips out of it until 57.1. |
| s4 → s5 | 71.4–71.6 | the ring hands over: 24 beads evenly on a circle centre (960,540) r 300, bead 0 at the top, going clockwise, rope = the closed circle through them; camera `{960,540,1,0}`. s4 arrives there by 71.4 and holds; s5 starts from exactly that and transforms it. |

## Rules every layer follows
- HyperFrames contract: `<template>` sub-composition, root `id="root"` styled by
  `#root`, one paused timeline at `window.__timelines['<layer-id>']`, `fromTo` tweens,
  no tween of display/visibility/autoAlpha on `.clip`, no clocks / Math.random /
  network. Prefix every id inside a layer with the layer id (`#s2-price`).
- Fonts: declare `@font-face` in your template pointing at `assets/fonts/*.woff2`
  (latin files are enough; see `frame.md` Type table).
- Words appear when he says them (`FILM.revealWords`), never earlier.
- Don't add grain, vignette or global fades — the finish layer does that.
- The bottom-left 360×90 px is the credit's area for 0.8–7.2 s; keep it clear then.
- Verify with `npx hyperframes lint` and `npx hyperframes snapshot --at … --no-end
  --describe false -o .snap/<layer-id>` (look at every frame you capture).
  Never run `render`.
