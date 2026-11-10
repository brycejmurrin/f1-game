# UI history — the scaling and layout ledger since the sheet rebuild (2026-07-31 → 2026-11-06)

Kind: incident · Re-measure-by: 2027-02-01

Issue #5153, part 1 ("History first"). Companion: [UI-CONTRACT-2026-11-06.md](UI-CONTRACT-2026-11-06.md) (the
contract and the ranked gaps). Range `bae5b6f9` (2026-07-31, "rebuild every menu on the sheet system") → `94fb81c2`
(2026-11-06, merge of #5151, the full-tree rollback to `d921fd52`). The tree equals `d921fd52` (Mon Nov 2, 23:53 PT)
plus one allow-list line, so **"in tree" below means "in d921fd52"**; everything merged after 2026-11-03 07:53Z is out.
About 5,100 commits touched css/, index.html and js/ui/ in the range; this ledger keeps the ones that changed a
mechanism, grouped into dated episodes. Short shas; "PR" is the merge that carried the commit (before mid-August most
work was pushed straight to the deploy branch).

## 0. How to read this

- Bryce and every agent post to GitHub as the same login, so his words survive only as quotes inside agent-written
  issue and PR bodies. §6 lists them with the item that quotes him; a row marked *paraphrase* is the agent's wording.
- Two facts the rest of the repo keeps getting wrong, verified on the tree: the body's compact threshold is **600**,
  not 380 (`body { --compact-at: 600px }` css/menus.css:291, since f102c29e 2026-08-11; 380 is only the `@property`
  initial for sheets that declare nothing, tokens.css:174) — so a landscape phone is compact at every UI SIZE ≥ 66 %;
  and **no CSS rule has ever keyed on `display-mode: standalone`** (`git log -S` is empty across css/), so the Home
  Screen app and a Safari tab share one layout and differ only by height, insets and the launch bug in §7.

## 1. The mechanism arc — how sizing works and how it got here (core files)

| Date | SHA (PR) | What changed | Why (commit) | In tree? |
|---|---|---|---|---|
| 07-31 | a718fd01 | `--sal/--sar/--sat/--sab` from `env()`, `--gut`, `--safe-*` (`viewport-fit=cover`) | menus sat under the island, "crammed" | yes tokens.css:241-276 |
| 07-31 | bae5b6f9 | every menu is `.screen > .sheet` (head / body / foot, one scroller); responsive.css cut to a handful of rules | the title stays put; the primary action is always reachable | yes (structure) |
| 08-04 | b90365cf | **sheetshape.js born**: per-sheet `data-shape` tall/wide from a JS measurement, replacing `@media (orientation)`; `.pane-pair` + `--pair-at` → `data-pair` | a landscape-shaped sheet in a portrait window took the band layout and left the list 2 px | yes (js/ui/sheet-shape.js since 5bd4fa68 09-03) |
| 08-05 | fcc3b8d4 | touch ladder on `body:not(.desktop)`: tap 52 / chip 46 / tap-sm 36 | "a phone was being handed the mouse floor" | yes, reshaped tokens.css:700-713 |
| 08-05 | **c2880246** | **ZOOM INTRODUCED**: `zoom: var(--ui-scale)` on `.sheet`, `#overlay > *`, HUD clusters; UI SIZE 90–130; coarse default **1.15** | Bryce (3×): menus "slightly too small on an iPhone"; 314 of 359 font sizes were raw px, so zoom was the only lever | zoom yes; 1.15 no |
| 08-05 | 26a61bae | `--ui-scale` (sheets) split from `--hud-scale` (HUD + dock) | menu type is read at rest, the HUD is glanced at | yes |
| 08-05 | **af21acdb** | `--vwz/--vhz/--svhz` = 1v* ÷ `--ui-scale`; 30 viewport-unit sites converted | "78vw inside zoom 1.3 renders as 101.4vw" | yes tokens.css:752-756 |
| 08-05 | **aeb918d7** | `svh` is the house unit for caps; `dvh` banned | iOS toolbar: `vh` is the large viewport; dvh re-lays-out mid-scroll | yes tokens.css:255-262 |
| 08-11 | ff2b8e10 … **f102c29e** | **compact density tier**: SheetShape divides height by zoom → `[data-density=compact]`; `@property --compact-at` 380 `inherits: false`; **`body { --compact-at: 600px }`**; height media queries move onto density | at UI 150 % head + foot ate 68 % of the garage; with 380 "the phone-landscape title lost its two-column layout" | yes menus.css:291 |
| 08-11 | 29eb9f94 | tap floor `max(Npx, 24px / --ui-scale)` | 36 WCAG 2.5.8 misses at UI 80 % | yes |
| 08-12 | **c2ea3a66** | coarse default **1.15 → 1.0**, floor 80 % | "Phones still read as zoomed-in… SETTINGS buttons filled the landscape viewport" | superseded 09-08 |
| 08-12 | cd4b756a | js/ui/css-zoom.js (zoom ↔ viewport ↔ local); `.dh-card` gains zoom | mixed-space bugs (A13); the hub ignored UI SIZE | yes |
| 08-13 | **0c440b96** | **index.html inline pre-paint script** stamps `body[data-density]` from `innerHeight / --ui-scale` vs body `--compact-at` | title CLS 0.52 → 0.06 | yes index.html:579-585 |
| 08-14 | 7eaf012e | UI / HUD SIZE range **40–200 %**, step 0.25 | finer sliders | yes scale.js:83-84 |
| 08-18 | **2087d15f** | **fit cap**: `--fit-at` + `classifyFit` writes `--sheet-scale`; `.sheet { zoom: var(--sheet-scale, var(--ui-scale)) }` | dense list/detail panels collapsed to zero content at high UI SIZE | yes components.css:183 |
| 08-18 | **8150f225** | compact-Home zoom cap: brand `min(ui, 1)`, doors `min(ui, 1.25)` under `(max-width: 899px), (max-height: 699px)` | 200 % on a phone showed only brand + CAREER | yes menus.css:823-852 |
| 08-19 | 14439865 | `body[data-shape]` tall/wide from zoom-corrected dims; `@media (orientation)` leaves menus.css | combinable with density in one selector | yes; survivors in track-detail.css:119-188, dialogs.css:252,311 |
| 08-21 | bb218c41 | `--kb` keyboard inset (visualViewport) as `.screen` padding-bottom | sheets under the iOS keyboard | yes components.css:87 (but see §5 #5097) |
| 08-26 | **721c65f0** | `.sheet` re-derives `--vwz/--svhz` against the fit-CAPPED zoom; HUD bands against `--hud-z` | 78vw buttons painted 12–29 % under at a capped zoom | yes |
| 08-29 | **d93425f3** | pre-paint also stamps `body[data-shape]`; `--tall-at` 1.05 declared once | shape landed +419 ms after FCP → 0.61 CLS | yes index.html:586-598 |
| 09-02 | 27c2568b | density judged by the ROOM the host gives (`roomOwn`), not the sheet's content height | a desktop RACE SETTINGS measured itself compact forever | yes |
| 09-04 | 343d74ad | BUTTON SIZE gets its own slider (`--hud-btn-scale`) | "the simple HUD was 40 % zoom, LAYOUT did nothing" | yes |
| 09-08 | **2953f79a** | coarse defaults from Bryce's export: **`--ui-scale 1.09`**, `--hud-scale 1.24`, buttons ×1.4536 | "the owner's settings file becomes the shipped defaults" | 1.09 yes (tokens.css:745); the rest reverted 09-14 |
| 09-14 | **12094f07** | `--hud-scale` back to 1, buttons **1.25** (`--hud-btn-mult`); `--ui-scale` stays 1.09 | ≈ 34 mm pedals covered the minimap and sectors; "no published guidance prescribes a coarse-pointer scale multiplier" | yes tokens.css:745-747 |
| 09-27 | **627ff8ab** | TEXT SIZE (`data-text-size` large/larger re-states `--fs-*`) and HIGH CONTRAST (`data-ui-contrast`) | Appearance › READABILITY | yes tokens.css:843-932 |
| 09-29 | 21decd7b | viewport events re-ask at 250 / 700 / 1500 ms (`SETTLE_MS`) | iOS, "Home-Screen PWA most of all", fires rotation while `inner*` are stale | yes sheet-shape.js:642 |
| 09-30 | 6d5c8a15 → a1c9e21c | title-layout editor; pre-paint `apex26.titleLayout` → `--tl-*`; **third zoom** `calc(--ui-scale × --tl-*-size)`; v2 `{wide, tall}` per orientation | per-orientation title layout | yes index.html:611-630, responsive.css:240 |
| 09-30 | 808a8f22 | stylesheet split (dialogs, settings, settings-controls, select, race-setup; touch-controls out of overlays) | module refactor | yes (file layout) |
| 10-01 | 114936b0 | **ScreenLooks**: `html[data-look-<screen>-<k>]`; `density: roomy/tight` forces `--compact-at: 1px / 99999px` | "a look for every major screen" | yes overlays.css:1160-1171 |
| 10-05 | f411e44e, 160368f7 | `--tap-paint` (52 painted at any UI SIZE); `--chip-h` arm `min(52/s, 52·s)` | 734×343 audit: compact controls painted 26–50 px | yes tokens.css:704-709 |
| 10-05 | db34174c | post-title responsive rules move from blocking responsive.css into deferred overlays.css | blocking CSS byte ceiling | yes (why select/pause/looks rules live in overlays.css) |
| 10-06 | 00fad3f7 (#1023) | Bryce's 10-05 export committed as tests/data/settings-defaults-export.json; **textSize large, uiContrast high, ember ship to everyone** | "product 2026-10-05" | yes settings-defaults.js:81-83 |
| 10-10 | 60933593 (#1346) | compact `.sheet` zoom capped at `--ui-compact-scale` (1.25) on short viewports | keep secondary rows reachable at 150 %+ | yes menus.css:860-868 |
| 10-14 | c4985882 (#1835) | `--safe-w/--safe-h` usable-box tokens; menu caps wired to them | "respect safe-area insets on non-HUD menus" | yes tokens.css:285-286 |
| 10-14 | f185834d (#1742) | BUTTON SIZE default independent of HUD SIZE (1.25) | "keep driving controls stable" | yes scale.js:104 (settings-export.js:96 still says "follows hudScale") |
| 10-29 | d54b3dd4 | `--safe-w` 100vw → 100svw; width tiers `--bp-*`, `UiScale.layoutOf` → `html[data-layout]` | "wide title columns", shared foundation | yes; **852 px is "tablet"; no CSS reads it** |
| 10-30 | 67e89061, a24bf190 (#4260) | LayoutPresets SHIPPED / THUMB / COMPACT / BIG; look values that are no-ops at this size marked DEAD (41 of 127 at 844×390) | Bryce: "Fix all approved" | yes layout-presets.js, look-avail.js |
| 11-02 | b4e57eb3 (#4495) | BUTTON SIZE "fits N %" follows cap changes; `syncLayout` per rAF | — | yes (last UI commit in the tree) |

In three months no commit replaced `zoom` with `transform` or `font-size` for sheets; everything was stacked on top of
it: the fit cap (08-18), the compact cap (08-18), the title-layout multiply (09-30). Moves use `translate`, sizes use
`zoom`. The coarse default went 1.15 (08-05) → 1.0 (08-12) → **1.09** (09-08, one phone's export) and stayed.

## 2. Menu shell and dialogs — episodes that still shape the phone

| Date | SHA (PR) | What | Why | In tree? |
|---|---|---|---|---|
| 08-04 | 3483c91e | RACE SETTINGS 3 columns, no scrolling, under `max-height: 500px` | "Scrolling a settings screen is how you miss a setting" | no — rows since fb704757 (09-06); today 1 col or 2 at `@container (min-width: 640px)` race-setup.css:501 |
| 08-12 | dc9e8852 … | `--pair-at` in local units; density classified before pair; compact title `#menu-buttons` capped to `--svhz` and scrolls | title clipped at 150 % on 852×393 | yes |
| 08-17/18 | 8150f225, 2087d15f, 238d66bb | `--fit-at` / `data-fit`; compact cap; journey screens use local density | | yes; nothing in CSS reads `data-fit` today (only the inline `--sheet-scale`) |
| 09-03/04 | 11f4c330 … 71441d84 | compact landscape title doors fit; Settings becomes a door-index stack, not tabs | | partly (title superseded in October) |
| 09-05 | 55594bc4 | circuit picker redesign: flag strip over an in-game hero | | yes select.css:428-598 |
| 10-04/05 | 42cb42fb … (#924) | "Give phone menus their height back" (garage, select, title, results, quali, season); taps lifted to 52 on short landscape | layout audit at 734×343 / 393×659 | partly |
| 10-07 | 2aefa52c (#1235) | `html[data-home-live]` stamped pre-paint; `(max-height: 660px)` tightening | "stop title menu layout jump" | yes menus.css:293-326 |
| 10-14 | 9ad0ecd6 (#1483) | pause at `(max-height: 400px)`: 2-column tray, card `min(100%, 100·--svhz − 24px)` | "bare 100dvh inside zoom… never capped" | yes dialogs.css:274-295 |
| 10-16 | 4b62a4a0 (#2447) | Home regrouped into destination groups; menu-destinations.css created | | yes |
| 10-17 | 29f82756 (#2611) → 4c31c567 (#2633) → 2da85257 (#2669) → 4d3c203f (#2744) | four title-fit rounds in one day: 4-row compact Home; reverted to the Oct-15 CONTINUE-era landscape; utility chips under the door stack; portrait + desktop fit | Bryce's words, §6 | yes (all four) — "fits 844×390 and 932×430 with no scroll" was measured **without** notch insets |
| 10-17 | 56b4fedd (#2744) | dense Home grid for `min-height: 520px` or portrait; sticky utility row | | yes menu-destinations.css:74,108,230 |
| 10-18 | 87454ee5 (#2916) | adaptive Race Setup (`@container` 480/360/640); `@container title-menu`; the `data-title-btnw` compact WIDTH stack is born | "preserve requested UI size, adapt controls to local width" | yes |
| 10-19 | 8051ad2c (#2943) | `(min-width: 700px) and (max-height: 500px)`: phone-landscape title as two columns `.8fr / 1.2fr` | "fit title destinations on full landscape phone screens" | yes menu-destinations.css:152-163 |
| 10-20/21 | 4f8332cd → abc37eae (#3402) | landscape title tap-floor CSS added, then dropped | Bryce 06:42Z: "Fit wins, drop bigger taps" | floor removed |
| 10-29 | 7fcc4555 (#4179) | tall Home names its play doors `(min-width: 700px) and (min-height: 720px)` | | yes :208 |
| 10-30 | 1f810874 (#4213), 3bb574dd (#4260) | pause SPLIT CARD on compact-wide body; thumb-reach RESUME bar; results podium pinned | "every door on screen at 844×390, no scroll (was 420 wide with QUIT at y 500 of 390)" | yes overlays.css:1096+, dialogs.css:298-326, :1474 |
| 10-30/31 | 592674e2 (#4297) | grouped Home gated to `(min-height: 1000px) and (min-aspect-ratio: 1/1)` | "so Home keeps fitting" | yes :282 |

Raw viewport bands that fire on an 852×393 phone today: `max-height` 400 / 460 / 500 / 520 / 660 / 699 in
menu-destinations.css:45,50,152; dialogs.css:252,274,311; overlays.css:1087; photo-studio.css:124,130;
watch-transport.css:73,94; menus.css:322,399,841. On the Safari tab (283) every one of them fires.

## 3. Race HUD and touch dock — episodes

| Date | SHA (PR) | What | Why | In tree? |
|---|---|---|---|---|
| 08-04 | f0339c5f, dff17114, 5af07d6a | dock rebuild: one grid, then "one flex bar, with no coordinates" (`#hud-dock` = left dock / cluster / right dock); held 72, tapped 54 | "a column of five 76 px circles ate two thirds of a 390 px screen"; "absolute positioning makes overlap possible by construction" | yes touch-controls.css:14-24 |
| 08-12 → 08-27 | 91f59108, 9cac5785, 952111d2 | fitHud: fit each band to the viewport, not just to HUD SIZE; HUD joins the density ladder | past ~150 % the clusters went off-screen | yes hud.js:946-1005 |
| 09-04 | 343d74ad | BUTTON SIZE slider; fitHud floor fix (a hidden sector box had put the cap at 0.4) | | yes |
| 09-08 → 09-14 | 2953f79a → 12094f07, ace829b8 | owner's export as defaults (HUD 124, btn ×1.4536) → corrected to HUD 1, btn 1.25; "chose vs inherited" readout | pedals 130 px over `#minimap` and the sectors at 852×393 | yes |
| 09-28 | c6d69b4b (#389) | BUTTON SIZE max **300 %** | "at 200 % the dock was still small in the hand"; "the slider is the wish and the cap the fit" | yes |
| 10-02 | 113d0ce1 (#764), 53b7cb8e (#795) | MOVE & SIZE per-element HUD position (x/y share of screen, size 50–200); HUD SIZE floor 70 % | | yes |
| 10-04 | 0a73e181 (#843) | `apex26.hudLayout` v3 keyed by HUD style × camera set | | migrated to v4 |
| 10-13/14 | 26d3af89 (#1460) | phone HUD sizing pass: 168 hud-mock cells 86 → 22 red, 40 → 0 capped docks, 56 → 0 sub-10 px text; `--hud-text-boost` wired to speed and value | HUD-ADAPT-2026-10-14 | yes |
| 10-14 | b5785db2 (#1490) | ARRANGE HUD drag / pinch editor on the pause card | | yes |
| 10-14 | f185834d (#1742) | BUTTON SIZE independent of HUD SIZE | "keep driving controls stable" | yes |
| 10-18/19 | d7e4882f (#2802), f40dc93b (#2941), 41a96d60 (#2956) | controls never off-screen; monotonic HUD SIZE fit; v4 "clean" layouts (arranged widgets own unrestricted geometry) | at BUTTON 175 "BOOST at y −14"; HUD 200 painted the tower smaller than HUD 100 | yes `data-hl-v4` |
| 10-21 | de895b29 (#3445) | BIG / CORNERS / CLEAN presets hidden on touch | Bryce: "hide them on touch rather than design phone twins"; 10 overlaps at 844×390 | yes hud-layout.js:162 |
| 10-30 | 45e10e09 (#4220), dbf8a079 (#4295) | steer dock gets its own cap `--hud-z-dock-l`; BUTTON SIZE never shrinks the speed/gear cluster below shipped | on the owner's export (BUTTON 245, HUD 155) steer arrows grew to 175 px and SPEED painted at 10.1 px | yes hud.js:960, :1336 |
| 10-30 | 0e451e64 (#4245) | design pass 2A: fused timing strip, one instrument plate, 40 px speed; 0 collisions in Bryce's cell before and after | the picture, not geometry | yes |
| 10-31 | HUD-F07 (#4318) | ≈ 58 forced layouts/s on the owner's export; fixed only hud-inputs.js | batching landed in #4719 and was rolled back | partly |

## 4. Settings that drive layout — ranges, defaults, plumbing

| Knob | Today | How it got here |
|---|---|---|
| UI SIZE `apex26.uiScale` | 40–200 %, default 109 touch / 100 pointer; null stored = CSS default | 90–130 (08-05) → 50–175 → 40–200 (08-14); default 1.15 → 1.0 → 1.09 |
| HUD SIZE `apex26.hudScale` | 70–200 %, default 100 | 80–150 (08-05); 124 (09-08) → 100 (09-14); floor 40 → 70 (10-02, "5–6 px glyphs") |
| BUTTON SIZE `apex26.hudBtnScale` | 40–300 %, default 125 touch | own slider 09-04; 300 max 09-28; follows HUD SIZE until 10-14 |
| TEXT SIZE / HIGH CONTRAST / ACCENT | large / high / ember **for everyone** | 09-27 created; 10-06 Bryce's export promoted to shipped defaults (#1023) |
| Per-screen looks `apex26.look*` | 8 screens, CORE `w density btn corners dim head` + bespoke | 10-01 (#622); DEAD marking 10-30 |
| Pause / title layouts | `pauseLayout/Side/Dim`; `titleLayout {v:2, wide, tall}` | 09-30 (#541, #528) |
| Pre-paint inline boot | motion, focusRing, cbCues, titleIntro, menuWash, titleArt, pause*, menuHelp, density, shape, titleLayout, homeScene | **never** UI SIZE, TEXT SIZE, theme, contrast or accent: first paint uses the CSS defaults; stored values arrive with the deferred scale.js / appearance-opts.js |

Bryce's profile (tests/data/settings-defaults-export.json, exported 2026-10-05 18:13Z, build 14012, iPhone): `uiScale`
null, `hudScale` 155.25, `hudBtnScale` 245, both opacities 65, `textSize` large, `uiContrast` high, pause grid /
centre / full, `titleLayout.wide.btns {x −2, y −2, size 91, width 20}`, looks for pause (btn 115, w 130), select (w 115,
sharp, tile 160), race (w 105), career (density **roomy**, round, head left), garage (btn 125, pw 135, solid).

## 5. Rolled back — Nov 3–6 (none in the tree)

Order of events on 2026-11-06 UTC: targeted reverts #5140 (→ #5136, 08:21Z), #5142 (→ #5138, #5127, 09:09Z), #5143
(→ #4982, #4897, 09:25Z), #5144 (→ #4906, #4865, 09:46Z); then the full-tree rollbacks #5147 → `e2d1574b` (Nov 4 09:32
PT; 292 files), #5149 → `1ea1366a` (Tue Nov 3 night; 228), #5151 → `d921fd52` (Mon Nov 2 night; 432). The PR head
branches are **deleted** on origin; their work survives only as merge commits in deploy history. Live related
branches: `cursor/title-reference-7c1a` (reference screenshots), `cursor/title-fit-5150-a3f9` (open #5152),
`cursor/title-width-device-5134`, `cursor/ui-regress-sweep-5139-f1a9` (draft #5141, the phone-layout pin).

| PR | Merged (UTC) | Merge | What it did | Verdict for the rebuild |
|---|---|---|---|---|
| #4840 title WIDTH floor | 11-04 12:39 | 4cea608e | `--_tl-bw: max(16.5rem, W·--vwz/size)`; `#menu-hero` wraps; CAREER basis 8.5rem (menu-destinations.css, responsive.css) | superseded by #5152's fit-by-construction; do not re-land |
| #4865 title WIDTH anchor | 11-04 18:15 | a208bfcc | cluster spans the overlay, pinned to its outer edge (Chromium only) | same |
| #4897 per-orientation appearance (#4529) | 11-04 21:56 | 090ace2f | `apex26.appearanceShapes {v, split, live, park}`: UI / HUD / BUTTON size, opacities, pause and all `look*` parked and swapped on a `body[data-shape]` flip; SEPARATE by default | **the "squished / zoom remapped" suspect** (#5143): a Home-Screen launch that reports portrait, or any rotation, loaded parked defaults. Re-land only on the ICB classifier (contract §3.1) and SHARED by default |
| #4906 title WIDTH WebKit | 11-05 04:46 | ef5b24bc | WIDTH rule widened from compact-only to every density; LEFT/RIGHT as a clamped end margin; its comment blames "Bryce's normal density" (false at 852×393: body is compact) | do not re-land |
| #4982 orientation fixes | 11-05 06:30 | dfae07fc | rotation clears UNDO; SHARED keeps the park | with #4897 |
| #5127 title layers (#5126) | 11-05 18:01 | aaf2dd77 | art and cluster as independent layers; X as % of screen (`xUnit: "screen"`), inline-boot migration | the #5139 sweep measured the cluster 34 px off at 852×393; superseded |
| #5136 appearance batch (#5092) | 11-05 20:15 | c6fe5de8 | presets and snapshot restores keep sizes, layouts, app icon; profiles carry `{wide, tall}` | the first thing Bryce asked to revert ("feel weird today"); re-land only after #4897's question is settled |
| #5138 title cluster / SW (#5134) | 11-06 08:04 | f7761eee | length-only cluster `(100svw − --ov-pl − --ov-pr)/(ui × size)`; self-healing PWA shell | superseded by #5152; the SW part is a separate question |

Also wiped by `d921fd52`, not in the list of eight: **#5097 / #5124** (`dialog.screen` keyboard inset `--kb`, sticky
START RACE at 200 %, late rotation settle) — **#5067 is live again** and the `--kb` line is the one cherry-pick the
contract justifies (gap 5); #4843 (`--tap-hud` floors), #4754 (PAUSE circle, POS contrast exception), #4712 (MOVE &
SIZE overlap warning), #4719 / #4636 (HUD write batching), #5125 (dock rotation latch), #4841 (garage PANEL HEIGHT
knob), #4952 (garage anim editor phone layout), #4790 (BUTTON SIZE readout outside a race), #4707 (`--hud-strip-bg`
token). None of the Nov 3–6 merges changed a slider range, a coarse default, `--compact-at` / `--tall-at`, or the
density / shape lines of the inline boot.

## 6. What Bryce said, dated (verbatim as quoted in agent-written bodies; the item that quotes him)

| Date (UTC) | Where | Words | What landed | In tree? |
|---|---|---|---|---|
| 08-05 | c2880246 (×3, relayed) | menus "slightly too small on an iPhone" | UI SIZE as zoom, default 1.15 | zoom yes |
| 08-12 | c2ea3a66 | "Phones still read as zoomed-in" | default 1.0 | superseded |
| 09-29 | PR #481 *paraphrase* | still a title-menu bug rotating portrait ↔ landscape | #427, #472, #481 rotation re-fit | yes |
| 10-17 | PR #2611 | "Some recent ui work changed the title screen and now they don't all fit on mobile and I have to scroll." | #2611 4-row compact Home | yes, superseded same day |
| 10-17 | PR #2633 | rejected #2611: "it used to look so much better"; chose "when we had the continue button"; "remove the little label text like play" | #2633 restores the Oct-15 landscape title | yes |
| 10-17 | PR #2669 (852×393) | "our ui is not fitting on mobile and is scrollable"; "Those should be below the right button stack" | utility chips under the door stack; an unreproduced "whole page drawn at ~70 % and shifted left" noted | yes |
| 10-17 | PR #2687 | to "the cut-off text at UI size 200 % is fine as it is?": "No" | wrap blurbs at 150 / 200 % | yes |
| 10-17 | PR #2744 | "have an agent fix portrait and desktop" | Home fits portrait + desktop; "phone landscape must not change" | yes |
| 10-17 | PR #2787 | "Data hub on mobile telemetry tab is cut off fix ui" | telemetry fits short landscape | yes |
| 10-19 | PR #2941 | picked "Redesign the fit" | monotonic HUD SIZE fit | yes |
| 10-21 | PR #3402 | "Fit wins, drop bigger taps" | landscape title tap floor dropped | yes |
| 10-21 | de895b29 | "hide them on touch rather than design phone twins" | BIG / CORNERS / CLEAN off touch | yes |
| 10-29 | PR #4193 | "our pause menu buttons the new buttons ones aren't consistent" | one race-tools tray | yes |
| 10-30 | PR #4220 | "on the hud I should be able to change the mainline color, button size and maybe shape?" | BUTTON SIZE that works at 844×390 | yes |
| 10-30 | #4260 | "Fix all approved" | layout presets, DEAD knobs | yes |
| 11-03 | issue #4529 | "make sure ORIENTATION is also configurable (portrait and landscape keep separate appearance values on the same device)" | #4897, #4982, #5136 | **no** |
| 11-04 10:46 | PR #4840 | "In landscape I can change the size of the cluster but not the width" | WIDTH floor | **no** |
| 11-04 ~16:00 | issue #4862 *paraphrase* | the WIDTH slider "moves the cluster left and right, but does not change its width" (seven screenshots: width constant 719 px, clipped at 50 %) | #4865, #4906 | **no** |
| 11-05 ~05:15 | issue #5126 | "The width PR didn't fully work, now I can't slide the buttons to the right fully. Really reconsider the design to make the title drawing and buttons independent." | #5127 | **no** |
| 11-05 | issue #5134 | "the title screen width fix didn't work; now WIDTH and the LEFT/RIGHT slider both move the button cluster left/right, and neither changes the width." | bridge #5135/#5137 (device: Safari 852×283, insets 67, `--ui-scale` 1.09, body compact+wide), #5138 | **no** |
| 11-06 ~08:05 | issue #5139, PR #5140 | "Title screen and all screens feel weird today. Let's review the history and fix or revert." / "let's revert the appearance batch" | #5140 | — |
| 11-06 ~08:50 | PR #5142 | "can we revert other UI changes today asap"; #4897/#4982 "not yet" | #5142 | — |
| 11-06 ~09:05 | PR #5143 *paraphrase* | screens "feel squished, as if the UI zoom were remapped"; "yes revert them" | #5143 | — |
| 11-06 ~09:30 | PR #5144 | "Yes do all" | #5144 | — |
| 11-06 ~16:45 | PR #5147 | "we really just need to fully checkout a commit from yesterday morning at this point before we broke all this" | rollback to e2d1574b | superseded |
| 11-06 ~17:40 | PR #5149 | "reset the game to the exact commit end of day Wednesday evening, we've really messed things up still" | rollback to 1ea1366a | superseded |
| 11-06 ~19:05 | issue #5150 | "Things are still broken. Let's reconsider from scratch. The title page should not be scrollable." (on b0027115) | #5152 (open) | — |
| 11-06 ~19:15 | PR #5151 | "Can we revert even further back, I feel like things are really messed up." | rollback to d921fd52 | **this tree** |
| 11-06 20:08–20:20 | issue #5153 | "Let's reconsider this whole menu and UI again, to fix from scratch; re-read the code — this is the goal." / "Not just the title screen but the full UI fixes and scaling issues; really dive deep into git history and the code." | this ledger and the contract | — |

"Squished" is the #5143 agent's paraphrase; "weird" (#5139) and "should not be scrollable" (#5150) are his.

## 7. What the fallout tells us (the findings this ledger leads to)

1. **The same loop ran twice.** Oct 17: four title-fit rounds in one day (#2611 → #2633 → #2669 → #2744). Nov 4–5: five
   title-WIDTH rounds (#4840 → #4865 → #4906 → #5127 → #5138). Each passed in a Chromium or WebKit container and failed
   on the phone; #5134 says it: "The device behaviour has diverged from the specs three times." The spec cells never
   carried the 59/21/59 insets, the 283-tall Safari window, or Bryce's stored layout.
2. **The Home Screen app's wrong title has a mechanism now** (#5152's reproduction, 2026-11-06): a standalone landscape
   launch can keep `innerWidth/innerHeight` at the portrait numbers (393×852) with no resize following, while CSS lays
   out 852×393; the inline boot and `classifyBody` then write `data-shape=tall data-density=normal` and the title paints
   the tall + normal layout into a landscape box. The same classification feeds every screen that reads body flags.
   The fix (classify from `documentElement.clientWidth/Height`) belongs to #5152; the contract makes it the one input.
3. **"Squished" sits next to the per-orientation swap (#4897), not next to a threshold change.** The 1.09 default,
   `--compact-at` 600, `--tall-at` 1.05 and the slider ranges did not move in November. A classifier that briefly says
   "portrait" at launch is exactly what #4897 keyed its size swap on.
4. **Code rollbacks cannot undo stored settings.** Bryce's `titleLayout.wide.btns.width = 20` (and WIDTH 40 + STACK
   during the Nov 4–5 rounds) was written by the sliders and survives every rollback; the #5139 sweep traced the "broken"
   title to it. A stored value must be a request clamped by the box (contract §3.3).
5. **Standalone and Safari were never told apart in CSS**, so "right in Safari, wrong in the app" could only come from
   height, insets and the launch bug — never from a rule.
6. **The one justified cherry-pick** from the rolled-back window is #5097's `dialog.screen` keyboard inset (gap 5).
   Nothing else is re-landed wholesale; §5 says per PR why.
7. **2026-11-10, #5199: three gates were selecting three titles on one phone.** The upright flat doors came from #4291
   (`2ceaa3795`, 2026-10-30) plus the `html[data-home-live]` rules; the uneven 11-row column is the base layout a
   landscape phone falls to at `body[data-density="normal"]`; a fresh profile and a stored WIDTH got different row
   counts. PR #5213 replaced the gates with one viewport-keyed block (UI contract §4.1) and made the TITLE LAYOUT
   sliders stop at the box edge. Not established: which stored value put the phone at density `normal`.
8. **2026-11-10, the touch paint floor (PR #5213).** With the phone's stored UI SIZE 61 % and BUTTONS SIZE 60 the
   eight rows painted 16.8-22.2 px tall with 6.1-8.9 px labels (852×393, 852×368, 844×390). Under `(pointer: coarse)`
   the doors' combined zoom now has a floor: a SIZE under 100 paints as 100, a door is 44 px there and a label 12. Fit
   still wins the height, by re-flowing first: `fit()` tries eight rows, then seven (CAREER on the retention row), then
   five (play doors four-up), and only when none takes the floor (a STACK, Safari's 246 px box at UI SIZE 109 % with
   CONTINUE) turns it off (`[data-home-floor="off"]`) and zooms the unfloored eight rows down. So a touch phone at
   393 px shows seven rows, a 430 px one all eight. Storage is not rewritten; BUTTONS SIZE's low end is the floor and
   its number the painted size. A mouse is unchanged.
