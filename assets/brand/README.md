# Official Revel logo (from the designer)

These SVGs are the designer's master files, copied unchanged from the brand
package (`01_Revel_Logo/`). They are the source of truth for every logo raster
in `assets/` and in `manifesto/film/`:

| Raster | Built from |
| --- | --- |
| `../revel-logo-gradient.png` (+ `.b64`) — end card | `Revel_Logo_White_Wordmark.svg` on the brand gradient (`#8C3CDD` → `#E6332A`, top to bottom), 3508×2481 |
| `../revel-R-gradient-padded.png` (+ `.b64`) — square mark | `Revel_Logo_White.svg` on the same gradient, 1024×1024 |
| `../../manifesto/film/wordmark-white.png` (+ `wordmark.js`) | the "let's revel." line of `Revel_Logo_White_Wordmark.svg` |

Never re-extract the logo from a PDF or a screenshot: earlier rasters were cut
from a PDF and set the apostrophe in "let's" as an opening quote (‘).
Rasterise these files instead (`rsvg-convert -w <px> <file>.svg`).
