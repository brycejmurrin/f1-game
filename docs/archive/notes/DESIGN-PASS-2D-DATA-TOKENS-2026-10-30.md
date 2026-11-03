# Design pass #2d — Data Hub, overlays, tokens, audit coverage (2026-10-30)

Lane 2d of design pass #2 (issue #4241; pass #1: `DESIGN-PASS-1-2026-10-30.md`, PR #4213). Cell: iPhone 13
landscape 844x390, touch, TLX/WebGPU. Question: do the Data Hub, the dialogs/overlays and track detail look
like a premium F1 game on a phone, and can every layout-audit cell be measured?

## Method
- Pass #1's method reused: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*' --shots --dom`
  before any CSS edit (`artifacts/layout-audit/audit.before.json`), the same run plus `--diff` after.
- Token census: `scratch/design-pass-2d/census.mjs` (raw colour literals outside `tokens.css`, `var(--`
  uses, literals that equal a token value).

## Token census (before)
Raw colour literals 322, `var(--` uses 5,571, raw `font-size` literals 65. Worst files: `hud.css` 73,
`carsetup.css` 59, `data.css` 48, `touch-controls.css` 47, `overlays.css` 22.

Living gallery (republished each round, same URL): https://claude.ai/artifact/GypuKLyW9WgirG2CWbjPye

## Part 1 — audit coverage: the 8 skipped cells
Pass #1 recorded 8 cells at `ios-iphone-landscape-844` as "skipped by harness timeouts". Reproduced on this tree:
the same 8 skipped in a full sweep (`waitForSelector` 15 s, `waitForFunction` 30 s). Run alone, the first four
measured and the four Data Hub tabs that ran after `photocontrols` still skipped, so it was order-dependent.
A probe (`scratch/design-pass-2d/probe-skip.mjs`) opened `photocontrols`, applied the audit's reset, and
clicked `#mb-data`: the button was sized, hittable and not inert, `DataHub.isOpen()` was false, and nothing
opened. Cause: `openDataHub` in `js/game.js` returns early unless `state === "menu"`, and a cell that built a
race left the state machine at `race`. The DOM-only reset could not see that. Fix (`tools/ui/layout-audit.mjs`,
`tools/ui/menu-capture.mjs`): the title counts as usable only when `__apex.info().state === "menu"`; otherwise
the existing reload fallback runs. The 8 cells re-run: 8 measured, 0 skipped. The fresh title reports `menu`
(`let state = "menu"`), so ordinary cells do not reload.

## Scorecard (844x390, before) — 1 = poor, 5 = premium
| screen | hierarchy | density | consistency | contrast | type | touch | worst problem |
|---|---|---|---|---|---|---|---|
| Data Hub (every tab) | 2 | 1 | 3 | 4 | 4 | 4 | title bar + tab plates + a "Developer tools" row take ~45 % of the height before any data; standings show 5 rows |
| Data Hub schedule | 3 | 2 | 3 | 4 | 3 | 4 | session times wrap a lone "UTC" onto its own line |
| track detail | 3 | 3 | 4 | 4 | 4 | 4 | map height-limited with empty margins; legend row overran its wrap by 2 px (UI-HUNT L2) |
| in-race championship | 3 | 2 | 3 | 4 | 4 | 4 | SHARE CARD above an empty round-0 table (a harness state; not a layout defect) |

## Variants and picks
Shot live at 844x390 @2x (`scratch/design-pass-2d/capture.mjs` + `variants.mjs`). "px moved" = pixels whose
summed RGB delta against the shipped shot exceeds 48.

**Data Hub — pick B, one broadcast bar.** Title, underline tabs, a ⋯ developer menu and ✕ share one 52 px row.
| variant | panel share | standings rows in view | px moved (standings) |
|---|---|---|---|
| shipped | 56 % | 5 | — |
| A content first (dev tools to a footer, tighter head) | 54 % | 4 | 15.3 % |
| **B one bar** | **86 %** | **9** | 19.1 % |
| C side rail | 86 % | 9 | 22.1 % |
C matched B's height but truncated every driver name ("Andrea Kimi An…"), its session times overlapped, and six
tabs cannot all sit at the 52 px touch floor down a 390 px rail (WATCH & DRIVE fell off). A gained 43 px only.
Built in `js/data/hub.js` (the strip and the `<details>` move into `.sheet-head`; the summary reads ⋯ with
`aria-label="Developer tools"`) and `css/data.css`. Constraints kept: the dialog's name stays "F1 DATA HUB"
(`data-lifecycle`, `browser-ui-hunt` specs), and `.dh-tabs` keeps `flex-wrap: wrap` (`meeting-picker-labels`),
so where the row cannot hold the strip (narrow, big UI SIZE) it drops under the title, which is the old layout.

**Track detail — pick A, the legend as a key on the map.** The map is height-limited in its wrap (193x285 in
438x314), so the legend row under it cost map height while the wrap's margins sat empty. As a plated key in the
corner it costs nothing; legend overrun 2 px → 0. B (facts as an uppercase Barlow readout) made a long sentence
harder to read; C (rail widened to half) made the canvas refit to 106x157.

**Schedule:** wide shapes keep each session time on one line (`body[data-shape="wide"]`).

## Part 3 — tokens
- Blocking-CSS headroom: `css/tokens.css` was 76 % comments (63 KB of 82 KB) in the blocking set, 49 B under
  the 239,000 B ceiling. The 13 longest rationale comments moved verbatim to `docs/notes/TOKENS-RATIONALE.md`
  with one-line pointers: blocking set 238,951 → 216,732 B. The ceiling stays, so the 22 KB is headroom for every
  lane of the pass.
- New `--hairline: color-mix(in oklab, var(--text) 8%, transparent)` (30 % under HIGH CONTRAST): one
  theme-relative row rule for the ~12 hand-written `rgba(255,255,255,.05–.09)` hairlines, which are invisible on
  the light theme. In this PR it rules only the track key's plate; the swaps (and wins `#f6d200` → `var(--gold)`,
  legible `#7a5600` on light) wait on #4257, see below.
- Reduced-motion backstop: `animation-delay: 0s !important` (lane 2c's proposal).
- After-audit, 61 cells at 844: 0 skipped, 0 findings; `--diff` vs before: 53 compared, 0 new, 3 fixed (the
  track detail canvas/legend/li clips), 8 before-side cells had no baseline to compare.
- Value-equal is not meaning-equal: the census matches `#fff` to `--focus` and `#00e0c0` to `--faster`, but
  `--focus` flips in the light theme and `--faster` equals `#00e0c0` only in a colour-vision palette. Those stay.

## Ratchet decision — literal swaps deferred (parent, 2026-10-30 ~10:35Z)
Swapping the 13 literals took tree `rawColor` 334 → 321 under a slack-0 ceiling. `ratchets.test.mjs`'s
one-slack rule is fatal locally and on a PR, and a topic fragment never lowers a tree ceiling (#3996), so no
sanctioned route lands an improvement there (`--update --fragment` is hook-refused; `--lower-only --absolute`
would also snap `js/game.js` / `js/agent/apex.js` to base drift, the #3996 sibling-OVER bug). The parent chose
to drop the swaps from this PR and filed the tooling gap as #4257. `--hairline` stays, with one new use that
replaces no literal (the track key's plate rule).

**Deferred until #4257 lands** (tracked in #4258; re-apply, then `--update --lower-only`):
- `css/data.css`: the `border*: 1px solid rgba(255,255,255,.05|.06|.08|.09)` row and section rules (11 sites:
  `.dh-tabs`, `.dh-footnote`, the standings and table row rules, the legend item/line rules, the speed-trace
  card, the race-list head, and the two landscape split borders) → `var(--hairline)`.
- `css/overlays.css`: `#htp-contents`' `border-right` → `var(--hairline)`.
- `css/data.css` `.dh-wins` `#f6d200` → `var(--gold)`.

## Token proposals from the other lanes — decisions
| from | proposal | decision | why |
|---|---|---|---|
| parent research | lift `--dim` #9a9aa8 (APCA Lc 48.2) to #b4b4c2 (Lc 62.3) | deferred, #4258 | moves most secondary labels on every screen; needs the menu-baseline goldens refreshed, the light theme's `--dim` re-checked, and 2b's list of meaning-bearing `--dim` sites reviewed first. Not something to fold into a 2d build |
| parent research | text-ink token for `--slower` (#ff3b30 is Lc 40.3 as text) | deferred, with the `--dim` lift | must stay inside the 20 Lc band `apca-timing.test.mjs` pins for the timing family; one change, one golden refresh |
| parent research / 2c | exit (accelerate) easing token | declined | 2c says it does not need one; no consumer |
| parent research | `--touch-label-floor` 10 px → 11 pt | deferred, with the `--dim` lift | a type-size change on every floor-sized label; same golden refresh |
| parent research | Material 3 tone surfaces | recorded, no change | useful if `--surf-*`/`--plate*` are rationalised; nothing here needs it |
| 2c (#4254) | name the View Transition durations as tokens | deferred | 2c owns the motion work and its sheets; a token with one consumer adds bytes for no reuse. Revisit if a second consumer appears |
| 2c (#4254) | zero `animation-delay` in the reduced-motion backstop | **landed** | a staggered row (results `.res-row`) still waited its delay under reduce; `animation-delay: 0s !important` beside the existing duration/iteration overrides |
| 2b (#4242) | `--upgrade` token for the garage's raw cyan `#4df` | deferred until #4257 | replacing the literal lowers tree `rawColor`, which is the blocked path above; an unused token fails `css-tokens.test.mjs` |
