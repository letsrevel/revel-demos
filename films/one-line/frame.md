# frame.md — "One Line" design truth

Brand truth for every composition in this project. When this file and a skill's
house style disagree, this file wins.

## Concept angle
One unbroken rope runs through the whole film. It gathers a community, gets cut
up by fees and data harvesting, comes back whole with Revel, ties a knot at the
door of a rope workshop, becomes a ring of 24 people, and finally traces the
Revel R. The camera follows the rope; it never cuts away from it unless the music
cuts.

## Canvas
1920×1080, 60 fps, 95.0 s. Rendered with `--resolution 4k` (Chrome DPR 2), so
author in 1080p pixels and keep hairlines ≥ 1.5 px.

## Palette (brand — never invent other hues)
| token | hex | use |
| --- | --- | --- |
| purple | `#8C3CDD` | Hearty Purple — rope start, accents, primary buttons |
| crimson | `#E6332A` | Light Crimson — rope end, the R gradient's base |
| lavender | `#AB82DB` | secondary type, soft surfaces |
| peri | `#9AB2FF` | cool accent (people discs, links) |
| amber | `#F9B233` | warm accent (people discs, highlights, money) |
| ink | `#0D1E1C` | text on light |
| paper | `#F1ECFA` | default light surface (lavender paper) |
| paper2 | `#E7DEF6` | paper shadow tone |
| night | `#160B24` | dark surface (dusk / breakdown) |
| plum | `#2A1340` | dark surface, lifted |
| concrete | `#C9CAD0` / `#8E9098` | the "platforms" section only — cold, desaturated |

The R mark is a vertical gradient crimson (bottom) → purple (top). No other
gradient text. No neon, no cyan.

## Light per section (the grade travels with the story)
| section | film time | surface | key light |
| --- | --- | --- | --- |
| intro | 0 – 13.09 | paper, warm | low warm key from upper left, soft |
| platforms | 13.09 – 21.82 | concrete, desaturated | flat cold overhead; colour drains |
| drop / verse | 21.82 – 39.27 | brand gradient on the drop, then alternating paper / plum per beat | bright, clean |
| breakdown | 39.27 – 56.72 | night → plum, dusk violet | single warm practical (the workshop door), deep vignette |
| build | 56.72 – 65.45 | plum lifting toward warm | warm glow grows |
| climax | 65.45 – 82.90 | paper, bright and warm | full, even |
| outro | 82.90 – 95.0 | paper, quiet | soft, centred |

## Type
| role | face | weight | size (1080p) |
| --- | --- | --- | --- |
| Display (statements) | Bricolage Grotesque | 700–800, tracking -0.02em | 72–140 px |
| Intimate lines (care, trust, breakdown) | Instrument Serif, italic | 400 | 56–88 px |
| UI (cards that mimic the Revel app) | Nata Sans | 400–700 | 14–28 px |
| Code / data | JetBrains Mono | 400 / 600 | 14–20 px |

Fonts ship in `assets/fonts/` (woff2, latin + latin-ext). Every composition that
names a family declares its own `@font-face` pointing there. Never set the
"let's revel." wordmark in a font — use `assets/brand/Revel_Logo_Gradient_Wordmark.svg`
(or the White / Inverted variants on dark).

## Words follow his voice
Narration is a human actor (Tobias Fischbach). On-screen statements appear word
by word **at the word's spoken start time** (`TIMING.lines[i].words[j].s`), with
`soft-blur-in`: opacity 0→1, blur 10px→0, y +14→0, 0.45 s, `power3.out`. Never
put the whole sentence on screen before he says it. Never caption every line —
type only the words that carry the scene (the storyboard says which).

## Motion language
- Ease family: `power3.out` / `expo.out` for arrivals, `power2.inOut` for camera
  and travel, `back.out(1.6)` only for small UI pops. No linear motion except
  drift.
- Exits are quicker than entrances (≈ 0.6×).
- Everything on screen breathes: decoratives drift 4–12 px over their life.
- Cards (Revel UI): 16 px radius, white `#FFFFFF` on light / `#1E1030` on dark,
  layered shadow `0 1px 2px rgba(13,30,28,.06), 0 12px 32px rgba(44,16,72,.14),
  0 40px 80px rgba(44,16,72,.10)`, no borders except a 1 px `rgba(140,60,221,.12)`
  inner hairline.

## Finish (global, handled by the finish layer — scenes do not add their own)
Fine animated grain (stronger in dark sections), radial vignette tinted plum,
1.1 s fade-in from near-black at the head, 1.5 s fade to near-black at the tail.

## Credit
"Voice: Tobias Fischbach" — Nata Sans 500, 18 px, 70 % opacity of the section's
text colour, bottom-left, 48 px from left and bottom edges, 0.8 s → 6.5 s with
0.6 s fades. Handled by the credit layer in `index.html`.

## Claims (do not add or alter)
MIT licence · buyers pay the ticket price, no fee on top · money goes straight to
the organizer · no ads, no trackers, data never sold · questionnaire reviewed by
a real person (no AI anywhere on screen) · six languages. Seeded names: Shibari
Circle Vienna, "Intro to Shibari — Rope & Trust", The Velvet Cellar, Noa
Beckmann (applicant), Ren (organizer/reviewer).

The tagline is verbatim: "The free, open-source event platform for communities,
clubs and independent venues."
