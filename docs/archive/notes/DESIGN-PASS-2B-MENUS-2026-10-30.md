# Design pass #2b — garage, circuit picker, career hub, settings — 2026-10-30

Lane 2b of design pass #2 (issue #4239, PR #4242; pass #1: `DESIGN-PASS-1-2026-10-30.md`). Quality pass on
Bryce's cell, iPhone 13 landscape 844x390 touch: do the GARAGE, CIRCUIT PICKER, CAREER HUB and SETTINGS look
and feel premium? Living gallery (republished each round, same URL):
https://claude.ai/artifact/CwMWjmWRMwLSPB6X878Jre

## Method
- Pass #1's research and method reused (its note's Research section); nothing re-fetched.
- Audit: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --shots --dom` over the lane's 25 screens
  (select, garage + livery/team/wheels, career, careerhub/history/offers/guide, settings + 13 pages,
  racesettings, customize). All 25 measured, none skipped. Baseline: `artifacts/layout-audit/audit.before.json`.
- Variants: CSS (and for the hub one line of JS) injected into the live page after the screen opens, shot at
  844x390 at 2x (`scratch/design-2b/capture.mjs`, `variants.mjs`). Pixel diff = pixels whose RGB moves more
  than 48 against the shipped shot. Trap found and fixed in the harness: `resetToTitle` does not reload the
  page, so a `<style>` from one variant stayed for the next; each variant now removes its predecessor's.

## Scorecard (844x390, before)
1 = poor, 5 = premium.

| screen | hierarchy | density | consistency | contrast | type | touch | copy | worst problem |
|---|---|---|---|---|---|---|---|---|
| circuit picker | 4 | 4 | 4 | 4 | 4 | 4 | 4 | — (flag strip, preview and the three-door foot read well) |
| garage (all tabs) | 3 | 2 | 2 | 4 | 4 | 4 | 4 | part comparison card 131 of the list's 209 px, so one part shows; upgraded tabs in cyan ink beside red; 1 tapSoft per tab (the edge peek tab) |
| career hub | 3 | 3 | 2 | 3 | 3 | 4 | 4 | "YOU · HAAS" in brand red as text; stat labels spaced at `--ls-5`; CAREER RECORD clipped (4 of 5 jump chips) |
| career setup | 4 | 3 | 4 | 4 | 4 | 4 | 4 | — |
| settings index | 3 | 2 | 4 | 4 | 4 | 4 | 4 | search block (label, field, hint, rule) fills the first screen: 2 of 10 doors visible |
| settings pages | 4 | 3 | 4 | 4 | 4 | 4 | 4 | APPEARANCE scrolls 15.7 screens, GRAPHICS 9.6 (long by content, not by waste) |
| career guide | 4 | 3 | 4 | 4 | 4 | n/a | 4 | 19.1 screens of reading (a document, scroll is right) |

The garage, the career hub and the settings index were the three worst, and got variants.

## Decisions (Bryce delegates open decisions — recorded here)
- **Garage: A, quiet chrome.** Upgraded categories keep white labels with a 3 px cyan underline
  (`css/carsetup.css`), so the strip is one ink plus the red active tab; the comparison card folds to one
  65 px row on compact wide sheets, name and note left, INSPECT right (`css/garage-experience.css`), and the
  next two parts come into view. B (flat broadcast tabs) lost the plate every other chip in the game has;
  C (each tab names the fitted part) fit only 3 tabs in the strip.
- **Settings index: A, slim search, three-up.** On a compact sheet the search is one field (its own
  `aria-label` names it), the hint shows only once a query is typed (it then counts matches), and the doors
  go three-up from 40rem (`css/settings-controls.css`). 6 of 10 doors on the first screen, from 2. B (doors
  first, search last) buried the fastest route to a deep option; C (one-line rows) wrapped long titles to
  two lines and clipped the value.
- **Career hub: B, broadcast line.** Title, team and the three numbers share one row split by hairlines;
  the header drops 127 → 95 px and all five jump chips fit (`css/career.css`, chips grow to fill in
  `css/career-experience.css`). The team colour becomes a skewed 4 px stripe before white ink
  (`js/career/career-ui.js` sets `--cr-team` and `data-team` instead of the text colour). Narrower
  compact sheets (below 660 px of sheet; the 844 sheet is 672 px under UI zoom 1.09) keep the stacked header. A (stripe only) moved 2.4 % of pixels,
  too close to shipped to matter; C (stat plates) grew the header to 162 px.

## Not changed, proposals
- `css/tokens.css` (lane 2d): none needed by this lane. The cyan `#4df` upgrade colour is a raw literal in
  `carsetup.css`; a token (`--upgrade`) would let the HUD and garage share it.
- `--dim` text that carries meaning in this lane's screens (for lane 2d's proposed lift to about #b4b4c2,
  APCA Lc 62, `UI-DESIGN-RESEARCH-2026-10-30.md`): the career hub meter labels (BALANCE, REPUTATION,
  ROUND), the garage comparison note ("Fitted · inspect…"), the settings search hint and its match count.
  Not worked around per file.
- Second cue for colour states: the garage upgrade mark is an underline present only on upgraded tabs, so it
  reads without its hue; the active tab keeps its plate and red edge.
- Text size: APPEARANCE's door already names "UI size"; no change needed for the adjustable-text ask.
- APPEARANCE (15.7 screens): its length is the per-screen look matrix; a later pass could collapse each
  screen's looks into a disclosure. Not attempted here.

## Before / after (844x390, measured by `scratch/design-2b/capture.mjs`)
| screen | before | after | px moved |
|---|---|---|---|
| garage | comparison card 131 px of a 209 px list; upgraded tabs in cyan ink | card 65 px; white labels, 3 px cyan underline | 9.9 % |
| settings index | 2 of 10 doors fully on screen | 6 of 10 | 7.0 % |
| career hub | header 127 px; 4 of 5 jump chips; team name in rgb(218,41,28) | header 95 px; 5 of 5; white ink after a team stripe | 25 % |

`layout-audit --diff=audit.before.json` after the build: `= diff ok: 25 cells compared, 0 new, 0 fixed, 0 skipped`.
Every tab, chip and door stays at 52 px or more. `menu-baseline.spec.js` goldens re-blessed in the same PR
(the garage moves on both shapes).
