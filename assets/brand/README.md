# Official Revel logo (from the designer)

These SVGs are the designer's master files from the brand package
(`~/repos/letsrevel/brand/01_Revel_Logo/`), with ONE deliberate change to the four
`*_Wordmark.svg` files (2026-10-14): the apostrophe in "let's" is a **straight
apostrophe ( ' )**. The designer's files draw it as an opening quote (‘); Revel
changed the brand to a plain apostrophe. The replacement is the U+0027 glyph of
**Nata Sans Light** — the face the styleguide specifies for "let's" (Semibold for
"revel.", tracking +60) — at the wordmark's own scale and spacing. In
`Revel_Logo_Inverted_Wordmark.svg` the apostrophe path had no fill class and drew
black on black; it now carries `st0` (white). Never copy the wordmarks over again
from the brand package without redoing this.

They are the source of truth for every logo raster in `assets/`, in
`manifesto/film/` and in `films/one-line/assets/brand/` (a copy):

| Raster | Built from |
| --- | --- |
| `../revel-logo-gradient.png` (+ `.b64`) — end card | `Revel_Logo_White_Wordmark.svg` on the brand gradient (`#8C3CDD` → `#E6332A`, top to bottom), 3508×2481 |
| `../revel-R-gradient-padded.png` (+ `.b64`) — square mark | `Revel_Logo_White.svg` on the same gradient, 1024×1024 |
| `../../manifesto/film/wordmark-white.png` (+ `wordmark.js`) | the "let's revel." line of `Revel_Logo_White_Wordmark.svg` |

Never re-extract the logo from a PDF or a screenshot. Never type "let's revel." in
a font either — use these files. The apostrophe is always the straight ' .
Rasterise these files instead (`rsvg-convert -w <px> <file>.svg`).
