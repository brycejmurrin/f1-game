# Design pass #3 — the remaining long menus — 2026-10-30

Follow-up to lane 2b (`DESIGN-PASS-2B-MENUS-2026-10-30.md`, PR #4242). Issue #4276. Quality pass on Bryce's
iPhone, 844x390 landscape, touch, TLX/WebGPU: do the long or never-scored menu screens feel premium?
Living gallery (same URL as 2b, republished this round): https://claude.ai/artifact/CwMWjmWRMwLSPB6X878Jre

## Method
- 2b's method and harness (`scratch/design-3/capture.mjs`, fetched from the gallery's `src/`), rules from
  `UI-DESIGN-RESEARCH-2026-10-30.md` §3.
- Baseline: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --shots --dom` →
  `artifacts/layout-audit/audit.before.json` (14 screens: career, careerhub/history/offers/guide,
  garage + livery/team/wheels, racesettings, season-setup, trackdetail, select, settings). All 14 measured.
- Variants: CSS (and for the guide a few lines of JS) injected after the screen opens, shot at 844x390 @2x;
  pixel diff = share of pixels whose RGB moves more than 48 against the shipped shot.

## Scorecard (844x390, before)
1 = poor, 5 = premium.

| screen | hierarchy | density | consistency | contrast | type | touch | copy | worst problem |
|---|---|---|---|---|---|---|---|---|
| career guide | 3 | 1 | 4 | 4 | 4 | 4 | 4 | 19.1 screens of open prose; the 55 px jump strip names 6 of 19 sections |
| garage part list (wheels/engine) | 3 | 2 | 4 | 4 | 4 | 4 | 4 | 8.3 (wheels) and 9.1 (engine) screens; one part fully visible under the inspection card |
| season setup | 3 | 3 | 4 | 4 | 3 | 4 | 4 | calendar 5.1 + pool 5.8 screens; "2026 REAL" wraps |
| career offers | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 5 screens; prose heads the three promise cards |
| garage team | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 5.8 screens; "Fixed by your career" twice |
| track detail | 3 | 3 | 4 | 4 | 4 | 4 | 4 | the map fills 12 % of its box (not this lane: `css/track-detail.css`) |
| race settings | 4 | 4 | 4 | 4 | 3 | 4 | 4 | TIME OF DAY wraps to two lines |
| select, settings, career, hub, history | 4 | 4 | 4 | 4 | 4 | 4 | 4 | — (pass 2b) |

The career guide and the garage part list were the worst and got variants; lane 2c's crossfade was built
as proposed (motion has no still to diff).

## Decisions (Bryce delegates open decisions — recorded here)
- **Career guide: B, folds.** Every section is a `<details>` whose summary is the heading; the folds share
  a `name`, so one is open at a time, the first on entry. 19.1 → 4.5 screens, every heading a 52 px row with
  ▾/▴ beside the red slash. On a compact wide sheet the jump strip folds away (the headings are the
  contents); elsewhere it stays and a jump opens the fold it lands on. A (quiet text tabs, frameless prose)
  saved 1.6 screens and read as the same page; C (a sideways pager, one section per page) was 15.6 screens
  of width and showed one heading at a time.
- **Garage part list: A, two-up.** On a compact wide sheet the part rows sit two a row; wheels 8.3 → 3.7
  screens, engine 9.1 → 4.6, four parts on screen where one was. The badge wraps instead of clipping.
  B (one-line rows, badge inline) and C (badge as plain caps) each moved under 5 % of pixels and saved
  nothing: the rows were already at the 52 px floor, so height had to come from width.
- **Crossfade (lane 2c's proposal): built.** A coarse pointer still skips the View Transition snapshot (the
  1.2 s iPhone hitch), but whatever screen a swap reveals now fades in over 120 ms with a decelerate curve
  (`js/ui/select-screen.js`). Reduced motion keeps the hard cut.

## Not changed, proposals
- Season setup (third worst): the calendar row could put its three move buttons on the name's line; left
  for a pass that owns `css/race-setup.css`'s calendar tests.
- Track detail: the corner-speed map fills 12 % of its box (`css/track-detail.css`, not this lane).
- APPEARANCE (15.7) and GRAPHICS (9.6): wait for #4268 (it owns `js/ui/screen-looks.js`). The guide's fold
  pattern would suit APPEARANCE's per-screen look matrix.
- Contrast (#4258): the fold's ▾/▴ is red ink on the card; it is a second cue, not the only one.
