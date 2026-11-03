# Design pass 3, lane B — title subtitles and dead CSS (#4263, PR #4303)

## Decisions
- **Fix the tile in CSS, not the copy.** `index.html` is in open draft #4227's diff.
- **RACE A FRIEND** (`#mb-vs .mb-sub`): deleted the `@media (max-width: 1679px)` nowrap + ellipsis override in
  `css/menu-destinations.css`. The tall-Home block already lets the other play-door subtitles wrap on spaces and the
  tile has `height: auto`, so this one now wraps like them. Pass #1's 3-up grid, CONTINUE stacking and 40px utility row
  are untouched: the block only applies at `min-width: 700px and min-height: 720px`.
- **CAREER MODES** (`#mb-career .mb-sub`): `white-space: normal; text-wrap: balance` outside `data-density="compact"`,
  so 844x390 (compact, subtitle hidden or nowrap) is unchanged. No orientation + max-height query.
- **`.dh-developer-tools`**: deleted the three base rules in `css/menu-destinations.css` (the Data Hub moved the control
  into the ⋯ header menu in #4244), then the `padding: 0 !important` override in `css/data.css`. The remaining
  `.sheet-head > .dh-developer-tools` rules stay: `js/data/hub.js` still creates the element.
- `#title-car` crop at desktop sizes: no action, looks intended.

## Evidence
- `layout-audit --screens=title --viewports='ios-iphone-landscape-844,ios-ipad-*,desktop-*' --scale=100,150`:
  truncation 7 cells → 0; `--diff` against the before run: 0 new. `clipped 12` on desktop cells is pre-existing.
- Blocking CSS: menu-destinations.css 20646 → 20355 B, data.css 79172 → 79149 B: **−314 B** of headroom freed.
