# Perf survey — boot, CSS critical path, race start (2026-10-06)

Report-only. **No code fixes in this PR.** Ship tip surveyed:
`45e434b5ccca903758ee041bb889006995da7347` (`claude/f1-game-project-26h3ng`).

OWNED path: this file. Instruments: static byte census (`stat` over `index.html`
`src=` / `rel=stylesheet`, the honest boot-wall instrument in
[`docs/notes/PERF-FINDINGS.md`](../notes/PERF-FINDINGS.md) §0), roster sizes from
`tools/manifest.cjs`, and **already-measured** ms from that ledger plus
[`docs/notes/PERF-OPTIONS-2026-09-16.md`](../notes/PERF-OPTIONS-2026-09-16.md).
This box did **not** re-run chrome-devtools LCP or Metal race-entry traces
(SwiftShader frame ms are not player evidence; §0).

| Instrument | This pass |
|---|---|
| Boot script wall | **Yes** — 313 tags, **7,211,247 B (7.21 MB)** uncompressed |
| CSS blocking vs `print→all` | **Yes** — 28 sheets, **955,427 B (933 KB)** |
| LCP / DCL | **Not re-traced.** Last chrome-devtools: DCL 4712 ms, LCP 2306 ms on a **5.47 MB / 146-tag** wall (ledger 2026-08-13). Bytes have grown; do not quote 2306 ms as current LCP. |
| Race-entry freeze | **Cited, not re-probed.** Metal GLX (vegas): **2193 ms contiguous / 4856 ms total**; track build **23 %**. In-tree `RaceEntryProfile` comment (2026-10-05): `loadTrack` **1273 ms**, `warmCarAssets` **1187 ms**. |
| Governor hitch counts | **Cited** from `js/perf/governor.js` comments (simulated tick, not this SHA’s GPU). |

Gzip on Pages is smaller; LCP is still parse/execute + render-delay, not
transfer. Do not discount uncompressed bytes.

### Source map (ship tip line refs)

| symbol / surface | path | lines |
|---|---|---|
| CSS preload + critical vs `print→all` | `index.html` | 79–138 |
| SW register after `load` (comment still says 3.5 MB) | `index.html` | 142–256 (esp. 181–188) |
| First-paint density/shape stamp | `index.html` | 419–494 |
| `@gen-shell:scripts` wall start | `index.html` | 3441–3473 |
| `loadTrackStepped` | `js/game.js` | 2104–2133 |
| `loadTrack` / sentinel across build | `js/game.js` | 2134–2157 |
| `_loadTrackBody` | `js/game.js` | 2165–2244 |
| `MENU_IDLE_MS` / `menuFinish` / `warmPrograms` | `js/game.js` | 2284–2353 |
| `scheduleFlybyTrack` (`prepareTrack`) | `js/game.js` | 2362–2408 |
| `startRaceBody` | `js/game.js` | 2567–2776 |
| `startRace` → `RaceEntryProfile.runSession` | `js/game.js` | 2790–2801 |
| `prepareTrack: scheduleFlybyTrack` façade | `js/game.js` | 8397 |
| `HomeWorld.begin` → `prepareTrack` | `js/ui/home-world.js` | 4–5, 45–57, 72–80 |
| Experience wires HomeWorld | `js/ui/experience.js` | 84–87, 223–227 |
| Title RACE/TT schedules flyby | `js/ui/title-flow.js` | 8–14, 25–34 |
| `PerfGov` header / settle vs hunt | `js/perf/governor.js` | 1–30, 50–61 |
| `OPEN_FRAMES` / `openWindow` | `js/perf/governor.js` | 342–355, 880–882 |
| `sentinelArm` race-start reset | `js/perf/governor.js` | 444–465 |
| First-cut window / `tick` | `js/perf/governor.js` | 507–583, 650–658 |
| Title `@font-face` | `css/tokens.css` | 15–97 |
| `--compact-at` / `--tall-at` | `css/tokens.css` | 191–209 |
| `CSS_PRELOAD` / `CSS_DEFERRED` | `tools/manifest.cjs` | 411–448 |
| `LAZY_*` orchestration | `js/core/lazy-bundles.js` | 7–52, 170+ |
| `buildPaced` 8 ms | `js/track/tracks.js` | 422–433 |
| `warmCarAssets` | `js/car/car-draw.js` | 424–466 |
| Race-entry stopwatch | `js/perf/race-entry-profile.js` | 1–13, 133–187 |
| Three.js modulepreload | `js/render/renderer-boot.js` | 12–20 |

---

## Ranked findings (impact first)

### 1. Boot script wall is 7.21 MB / 313 deferred IIFEs — largest remaining LCP driver

**Measured (this SHA):** every `index.html` `@gen-shell:scripts` `src=` summed.

| bucket | bytes | files | share |
|---|---:|---:|---:|
| `js/car/` | 981,423 | 17 | 13.6% |
| `js/ui/` | 896,182 | 49 | 12.4% |
| `js/track/` | 826,684 | 25 | 11.5% |
| `js/race/` | 586,738 | 27 | 8.1% |
| `js/game.js` | 586,687 | 1 | 8.1% |
| `js/audio/` | 445,912 | 15 | 6.2% |
| `js/camera/` | 442,268 | 24 | 6.1% |
| `js/physics/` | 377,054 | 15 | 5.2% |
| `js/garage/` | 308,996 | 11 | 4.3% |
| `js/circuits/` (defs only) | 305,127 | 52 | 4.2% |
| `js/career/` | 281,077 | 11 | 3.9% |
| `js/lighting/` (not presets) | 246,365 | 8 | 3.4% |
| rest (`render` shared, `input`, `perf`, `data` remainder, `editor`, `xr`, …) | ~1.93 MB | — | ~27% |

Largest files: `js/game.js` 587 KB, `js/car/car3d.js` 207 KB, `js/car/liverytex.js` 162 KB,
`js/track/scenery/build-props.js` 135 KB.

**Already off the wall (do not redo):** `LAZY_SCENERY` 1.95 MB / 52 files;
`LAZY_RACE` `js/lighting/presets.js` 361 KB; `LAZY_NET` 392 KB; `LAZY_DATA` 257 KB;
`LAZY_AGENT` 318 KB (github.io skips); `LAZY_EDITOR` 277 KB.
Circuit **defs** stayed eager (305 KB). Historical V8 compile of 148 files was
**97.3 ms** and 40 circuit IIFEs **2.5 ms** — bytes still matter for fetch
queueing and the serial `defer` execute order, but circuit parse is not the
2.3 s LCP bucket.

**Plus after the wall:** default TLX modulepreloads
`vendor/three-0.186.0/three.webgpu.min.js` **710 KB** + `three.tsl.min.js`
**25 KB** (`js/render/renderer-boot.js` `preloadThreeVendor`). GLX/TLX/WGX
implementations have no shell tags (injected from `ApexRoster.DEFERRED`).

**Where:** `index.html` `@gen-shell:scripts` starting at the `js/core/log.js`
tag; `tools/manifest.cjs` `FULL` (313 files = this wall); `js/core/lazy-bundles.js`
(`LAZY_RACE` / `LAZY_SCENERY` comments).

**Suggested fix (next PR, not this one):** lift the next unused-on-title
directories the way DATA/NET already lifted — strongest candidates by bytes
and “title never names them”: `js/editor/` still on FULL (71 KB here; roster
also has `LAZY_EDITOR` 277 KB — confirm drift), `js/xr/`, camera-tuner / flyby
editor, career **UI** until CAREER is opened (`js/career/career-ui.js` 76 KB).
Do not lazy `js/data/teams.js` / `legends.js` / `driver-ratings.js` (roster
identity; still on the wall by design). Split `js/game.js` only with a ratchet
reason — 587 KB is one compile unit on every boot.

---

### 2. Race start: three-quarters of the freeze is not `loadTrack`; car-asset warm is a second ~1.2 s task

**Measured (cited):**

- Real Apple/Metal, vegas, GLX (`PERF-OPTIONS-2026-09-16.md`): **2193 ms**
  one long task / **4856 ms** total blocking. Track build **~1114 ms (23 %)**.
  Uploads 119–318 ms. Scenery fetch **ruled out** (11–38 ms). `makeCars` 2.7–4.7 ms.
- In-tree stopwatch (`js/game.js` comment + `js/perf/race-entry-profile.js`):
  sync `loadTrack` + `warmCarAssets` was **one ≤3 s long task** —
  `loadTrack` **1273 ms**, `warmCarAssets` **1187 ms** (2026-10-05).
- TLX program warm **after** flyby used to hold the card **17 s** SwiftShader /
  **~7 s** Metal cold; menu `warmPrograms()` + skip at lights cut that to
  **9.2 s = one SwiftShader race frame** / **33 ms** CPU in `startRaceBody`
  when the menu already warmed (`PERF-FINDINGS.md` §2al, 2026-09-28).
  `gpu-census` `__apex.race()` **never** takes the menu path — census ~7 s is
  the cold number.

**Where:**

- `loadTrackStepped` — `js/game.js` (stepped `Tracks.buildPaced`, 8 ms/frame default in `js/track/tracks.js` `buildPaced`).
- Short-circuit when `builtTrackId` / night / grid slots match; else
  `dropTrackWorld()` then worker (default OFF) or paced build.
- `scheduleFlybyTrack` — 400 ms settle if `settle`, else 120 ms; build starts
  immediately (not after `MENU_IDLE_MS`); warms still wait **1200 ms** idle
  (`MENU_IDLE_MS`).
- `startRaceBody` — `RaceEntryProfile` laps `scenery` / `resets` / `loadTrack` /
  `makeCars` / `settings` / `gridUp` / `finish`; `scheduler.yield()` after
  loadTrack and before `warmCarAssets`; `RaceEntryProfile.requestWarm` skipped
  when `_warmKey === menuKey(trackIdx)`.
- `warmCarAssets` — `js/car/car-draw.js` (field meshes, casters, FieldLod wheels,
  `Car3D.aeroFlaps` per rival).
- Home title can **force the same build**: `HomeWorld.begin` → `deps.prepareTrack()`
  which is `scheduleFlybyTrack` (`js/game.js` façade `prepareTrack: scheduleFlybyTrack`;
  `js/ui/experience.js` wires it; `js/ui/home-world.js`). `TitleFlow` also calls
  `scheduleFlybyTrack(true)` on RACE / TT.

**Suggested fix:** keep the yield already in `startRaceBody`; **slice
`warmCarAssets` the way `prepareMenuCarAssets` already slices** so a RACE! that
beats menu idle does not glue 1.2 s onto lights. Do not re-request TLX `gfx.warm()`
when `_warmKey` matches (already skipped). Extend loading **handoff** until
`gfx.warming()` is false rather than shortening flyby (plan in
`docs/plans/2026-09-30-load-download-weight.md`). Next Metal probe:
`__apex.raceProfile()` + `RaceEntryProfile` snapshot (`legs`, `marks`,
`longTasks`) on a **menu-settled** RACE! vs `__apex.race()` cold — those two
legs are different products.

---

### 3. CSS: 933 KB shipped; 225 KB still render-blocking; preload fetches 79 KB of non-title sheets

**Measured (this SHA):**

| class | bytes | files |
|---|---:|---:|
| All `rel=stylesheet` | 955,427 (933 KB) | 28 |
| Render-blocking (no `media=print`) | **229,773 (224 KB)** | 5: `tokens`, `components`, `title`, `menus`, `responsive` |
| `print→all` deferred | 725,654 (709 KB) | 23 |
| `CSS_PRELOAD` (high-priority fetch) | **213,936 (209 KB)** | 6 |

Blocking set is the real title paint: `#overlay` / `#title` / `#menu-buttons`.
`print→all` is already applied to HUD, garage, tuner, data, career, select,
dialogs, settings, etc. (`index.html` `@gen-shell:css`; source
`tools/manifest.cjs` `CSS_DEFERRED`).

**Conflict:** `CSS_PRELOAD` still lists `dialogs.css` (30.6 KB), `settings.css`
(17.8 KB), `settings-controls.css` (26.5 KB), `dialog-platform.css` (4.2 KB) —
**79 KB** that do not paint `#title`, fetched at preload priority **and** as
`print→all`. Manifest comment: FOUC guard for a fast SETTINGS tap. That is a
bandwidth fight with the title-critical 224 KB + three font preloads (28 KB).

**Stale ledger:** `PERF-FINDINGS.md` “lazy CSS never applied” still says
**558 KB / 11 files / all eager**. That census is **wrong on this tip** (28 files,
933 KB, most `print→all`). The **offline/FOUC blockers** in that paragraph still
apply: `sw.js` essential-set from `rel=stylesheet`; `career.css` styles `#quali`
outside CAREER.

Deferred-but-large (still downloaded for first visit / SW): `css/hud.css` 110 KB,
`css/carsetup.css` 100 KB, `css/tuner.css` 76 KB, `css/data.css` 62 KB,
`css/career.css` 47 KB — **386.9 KB** together.

**Where:** `index.html` preload block, stylesheet block, comments on title LCP;
`css/tokens.css` first-loaded sheet; `tools/manifest.cjs` `CSS` / `CSS_PRELOAD` /
`CSS_DEFERRED`.

**Suggested fix:** drop the four non-title sheets from `CSS_PRELOAD` (keep
`tokens` + `components` only, or add `title.css`/`menus.css` if LCP trace shows
they discover late). Do **not** remove `rel=stylesheet` for deferred sheets
without an SW essential-set change (ledger blocker). Optional: split
`tokens.css` so HUD `@font-face` (Barlow) is not in the first 82 KB sheet.

---

### 4. `tokens.css` @font-face wall: 8 faces / 118 KB in the blocking sheet; title uses 3

**Measured:** `css/tokens.css` **82,496 B**, 1373 lines. Eight `woff2` files
**118,216 B**. Title preloads only Titillium 600, Titillium 700 italic, Saira
subset (**12.1 + 13.4 + 2.4 = 27.9 KB**). Remaining five faces (Barlow 500/600/700
**66.2 KB**, Titillium 400/700) are still declared in the **first** stylesheet with
`font-display: swap` — they do not block first paint, but the CSS parser
discovers them during the style phase of LCP.

Inline density stamp in `index.html` already fixed the CLS that was **not**
fonts (comment: faces land ~126 ms; CLS cause was `body[data-density]`). Keep
that stamp.

**Where:** `css/tokens.css` `@font-face` block; `index.html` font preload
comments.

**Suggested fix:** move Barlow (+ unused Titillium weights) to `css/hud.css`
or a `fonts-hud.css` loaded `print→all`. Keep the three title preloads.

---

### 5. Title Home / picker prep races the boot wall (same `loadTrackStepped`)

`HomeWorld` never starts a race; it **does** call `prepareTrack()` on `begin`
when the context key changes (`js/ui/home-world.js`). That dep is
`scheduleFlybyTrack` (`js/game.js`). Title RACE/TT also schedules a 400 ms
settled build (`js/ui/title-flow.js`). Ambient home is capped at **24 fps**
(`FPS = 24`, `needsFrame` credit).

So a cold boot that paints Home-as-track starts: serial IIFE wall → renderer
+ three.js modulepreload → scenery fetch → paced build (8 ms slices) →
`menuFinish` program warm (hidden) → garage prewarm. That is **good** for a
later RACE! (`_warmKey` skip) and **bad** for time-to-title-interactive if
Home defaults to `track`/`pitlane`.

**Suggested fix:** delay `scheduleFlybyTrack` until `requestIdleCallback` /
title intro finished unless Home mode is track; keep 24 fps cap. Do not build
on `signature` churn from pane/resize (`viewKey` includes pane rectangle —
resize retriggers `begin` → `prepareTrack` only when `deps.prepareTrack` sees
a key change; `menuKey` is circuit/time/weather/grid, so resize should not
rebuild — verify before “fixing” resize).

---

### 6. Governor: opening window is ~frames 10–95; scale reallocs are the hitch, not boot LCP

Not a boot-byte problem. Race **entry** quality:

- `startRaceBody` calls `PerfGov.sentinelArm(true)` and may pre-drop scale to
  0.85 / 0.7 on crash strikes (`js/game.js`).
- `loadTrackStepped` / `loadTrack` also arm the sentinel across the build
  (menu jetsam), then disarm if not in `race`/`count`.
- `tick()`: first cut of a race is **prompt** (no `DEGRADE_CONFIRM`); later
  cuts need two evaluations. EMA vs derived `_floorMs` only outruns the floor
  for roughly **frames 10–95**; after that a steady 33 ms device looks
  externally capped (`js/perf/governor.js` `_live` / first-cut comments).
- `OPEN_FRAMES = 600` records `openWindow()` for “laggy at first” —
  diagnostic in `__apex.perf()`, not a shed.
- Historical oscillation: **30 reallocations / 300 s race** (median 8.1 s)
  from climb/cut; `_scaleCap` + `CLIMB_SURVIVE_MS = 30000` + futile latches
  are the shipped dampers. Each `setRenderScale` rebuilds HDR/bloom targets.

**Suggested fix:** no boot-path change. If lights-out hitch remains on phones:
confirm `openWindow().maxMs` on-device; do not add a **menu-time**
`setUserTier`/`setAutoRes` cooldown (`_live` already refuses that). Avoid any
new `setRenderScale` in `startRaceBody` besides the strike pre-drop.

---

### 7. `index.html` itself is 338 KB + 26 KB inline scripts

**Measured:** 3760 lines, **338,173 B**; five inline scripts **26,360** chars
(iOS gesture, shell version guard, error/retry, density/shape stamp, plus
importmap). The density stamp is load-bearing for CLS (ledger: inline vs
external **0.06 vs 0.52** CLS). SW registration is correctly deferred to
`window` `load` + idle so it does not compete with the **~7 MB** script wall
(comment still says “3.5 MB” — stale).

**Suggested fix:** none for CLS. Optionally refresh the “3.5 MB” comment when
someone next touches the guard. DOM slimming is a UI-survey job, not this
lane.

---

## What is already taken (do not re-open)

| item | evidence |
|---|---|
| Scenery closures off boot | `LAZY_SCENERY` 1.95 MB; `ensureScenery` at flyby / `startRace` / `openQuali` |
| Lighting presets lazy | `LAZY_RACE` 361 KB |
| `defer` on FULL scripts | every `@gen-shell:scripts` tag |
| Agent surface lazy | `LAZY_AGENT`; not in `index.html` `src=` |
| CSS `print→all` for non-title | 23/28 sheets |
| Font `display: swap` + title subset preload | `tokens.css` / `index.html` |
| First-paint `data-density` / `data-shape` | inline stamp |
| Paced track build | `buildPaced` 8 ms; `loadTrackStepped` |
| Menu TLX warm + skip at lights | `_warmKey` / `warmPrograms` / `RaceEntryProfile.requestWarm` |
| `scheduler.yield` around race-entry legs | `startRaceBody` |
| Governor `_live` so menu quality changes do not eat the opening window | `governor.js` |
| Forced reflow at boot | ledger: **9 ms**, Chrome savings **none** — do not chase |

---

## Ranked next (max 3)

1. **Metal (or DevTools) race-entry snapshot** after a 20 s menu settle vs cold
   `__apex.race()`: `RaceEntryProfile` marks + longtasks. Decide whether
   slicing `warmCarAssets` or first-present/handoff is the remaining 75 %.
2. **Trim `CSS_PRELOAD` to title-critical sheets** and re-trace LCP
   (`performance_start_trace` → RenderBlocking / LCPBreakdown). Expected:
   shorter contention with tokens/components; SETTINGS FOUC is the accept
   test.
3. **Next lazy-FULL slice** by byte and title-reachability (`js/editor` /
   `js/xr` / career UI / flyby editor) — `node` byte census only, then one
   directory per PR. Do not lazy circuit defs for a 2.5 ms parse win.

## Blockers

- **This box:** SwiftShader / no `navigator.gpu`; `__apex.gpuTimer()` is −1;
  local `http.server` Cache/DocumentLatency insights are harness artifacts
  (`PERF-FINDINGS.md` §0). Do not ship a “fix” from frame ms here.
- **SW essential-set:** dropping a `rel=stylesheet` drops offline CSS.
- **`career.css` / `#quali`:** cannot defer with CAREER-only loading.
- **Census vs menu warm:** `gpu-game-check` / `__apex.race()` never runs
  `scheduleFlybyTrack`; do not treat census warm time as the player RACE! path.
- **Lane:** OWNED docs only; any of the suggested JS/CSS edits is a different
  PR with its own claim.
