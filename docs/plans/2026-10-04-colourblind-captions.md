# Colour-blind-safe mode + complete captions — plan (2026-10-04)

Date: 2026-10-04
Status: **PLAN** — docs-only; implement as five draft PRs against
`claude/f1-game-project-26h3ng`, one slice each, in the order below. Do not merge.
Scope: (A) one global colour-vision system that every colour source (CSS tokens,
2D canvas, GLSL/WGSL/TSL uniforms, 3D vertex colours) reads from a single palette
module, plus a non-colour cue for each colour-only meaning; (B) a captions pass so
every spoken or audio-cued line has on-screen text with a speaker label and
player-set size / position / opacity. Presentation only: no physics, no AI, no
`js/game.js` growth.

A path written `js/<new>/…` is a PROPOSED file (drop the `<new>/` segment when
creating it). Backticked paths without `<new>` already exist on disk.

## Related (do not duplicate)

| Doc / code | What it already covers | What is still open (this plan) |
|---|---|---|
| `docs/notes/PRODUCT-BRAINSTORM-2026-09-16.md` L138 (item 13) | "Colourblind palette and a settings search box", M, scored 1.2, never built as a system | The system; the search box is NOT in this plan |
| `docs/plans/2026-09-30-player-a11y.md` | Grip steer, dock reposition, audio driving cues, share codes, comfort block. Its slice 5 lists "accessibility colourblind palette (#13)" as **Not in this slice** | This plan is that deferred item; it does not touch slices 1-5 |
| `docs/research/CONTROLS-RESEARCH-2026-09-14.md` | XAG 103/104/107/108/117/118 for CONTROLS: handedness, resize/opacity, latch, comfort, DOM names | No colour or caption guidance there; this plan cites XAG only where it adds colour/caption evidence |
| `docs/notes/DRIVING-LINE-RESEARCH.md` L45, L108 | Driving-line colour-blind variants (IBM triple) | Line palette is a SEPARATE toggle today (`pm-linecolor`); unify under the global mode |
| `js/ui/appearance-opts.js` L21, L34, L84, L268, L422-457 | SHIPPED: `cvdMode` (`off`/`deutan`/`protan`/`tritan`), row `pm-cvd` "COLOUR VISION", `data-cvd` on `<html>`, SPEC row | Do not re-add the toggle or the key. Extend what it drives |
| `css/tokens.css` L1031-1051 | SHIPPED: `--faster --slower --sec-slow --sec-best --you --red` remapped under `data-cvd` | Hand-picked, not validated by a CVD simulation; tritan uses the same tokens with weaker evidence; 2D/GL consumers bypass it |
| `tests/unit/apca-timing.test.mjs`, `tests/unit/nontext-contrast.test.mjs` | Lightness/contrast of the remapped inks on the HUD plate (APCA, WCAG 1.4.11) | Neither measures *distinguishability under CVD*; that is the new test |
| `js/audio/driving-cues.js` (shipped slice 3 of the a11y plan) | Assist-gated braking tone + L/R corner calls, audio only | Has no visual twin; captions slice adds one (see Design B3) |

Net of that table: the **toggle, key and basic token remap already exist**. The
open work is validation, coverage of non-CSS colour sources, missing redundant
cues, and the whole captions half.

## Goal

1. A player with deuteranopia, protanopia or tritanopia can read every
   colour-coded game state without relying on hue, from a palette that a node
   test proves distinguishable under a standard CVD simulation.
2. Every line the game speaks, and every audio-only cue that carries state, has a
   caption with a speaker label, sized/positioned/faded by the player.
3. One palette module is the only place a semantic colour is defined for JS.

## Non-goals

- A full-scene post filter (the existing choice, `appearance-opts.js` L26-28, is to
  keep the road/scenery untouched; we keep it).
- Re-skinning team liveries or the 3D world; team colours stay team colours (they
  are identified by the code/number text next to them).
- Speech-to-text of the Kokoro voice (we caption the SOURCE text, never audio).
- New spoken content; settings search box; any physics or AI change.
- Raising any ratchet, quarantining a test, or loosening a tolerance.

## Current state (evidence)

### A. Where colour carries meaning

"Cue" = a non-colour channel already present. Line numbers measured 2026-10-04.

| # | Semantic | Defined / drawn at | Non-colour cue today? |
|---|---|---|---|
| 1 | Sector time: session best (purple) / PB (green) / slower (yellow) | `js/ui/hud.js` L1172-1195 → `--sec-best/--faster/--sec-slow` (`css/tokens.css` L591-625) | YES: glyphs ★ ▼ ▲ (L1180) |
| 2 | Sector identity S1/S2/S3 on minimap + circuit detail | `js/ui/hud.js` L1330 (`TrackMaps.sectorColors`), `js/ui/track-maps.js` L24-33 (gold/silver/bronze) | **NO** (HUD labels carry no colour; map has no S1/S2/S3 text) |
| 3 | Lap delta fast/slow | `css/hud.css` L454-456; `js/ui/results-sheet.js` L413 | YES: signed number |
| 4 | Slipstream/tow on gap row | `css/hud.css` L123 (`text-shadow` `--faster`) | **NO** |
| 5 | Tyre compound on HUD chip | `js/ui/hud.js` L955 (`#hud-tyre-code`) | YES: letter S/M/H/I/W |
| 6 | Tyre compound in broadcast tower | `css/hud.css` L1593-1597 (hard-coded hex) | YES: letter, but hex is outside any palette |
| 7 | Tyre compound on results stint strip | `js/ui/results-sheet.js` L122 | **NO** (`title` tooltip only, not shown on touch) |
| 8 | Tyre compound band on the 3D car | `js/physics/tyre-model.js` L523-532, `js/car/car-draw.js` L811 | **NO** (cosmetic; race-critical only via #5) |
| 9 | Tyre temperature cold/hot | `css/hud.css` L445-449 | YES: ❄ / ▲ (L449-450) |
| 10 | Tyre wear warn/gone | `css/hud.css` L515-522 | PARTIAL: bar width = life, pulse on gone; no text threshold |
| 11 | Flags yellow/VSC/SC/red/blue | `css/hud.css` L792-800; text at `js/ui/hud.js` L1226-1231 | YES: chip text ("BLUE FLAG VER") + `#announce-live` (L1257) |
| 12 | Overtake chip off/armed/active/cool | `css/hud.css` L645-648; class at `js/ui/hud.js` L1033 | PARTIAL: `otText` (L1062) and aria-label; armed vs active relies on fill + pulse |
| 13 | Active-aero chip armed/open/none | `css/hud.css` L659-660, L667 | PARTIAL: `ax-none` is struck through; armed vs open is fill only |
| 14 | DRS/aero zone on minimap | `js/ui/hud.js` L1349 (`rgba(38,165,245,.9)`) | **NO** |
| 15 | Ghost dot on minimap | `js/ui/hud.js` L1441 (cyan) | **NO** |
| 16 | Pit-entry window on minimap | `js/ui/hud.js` L1457-1460 (`--you` stroke); pit lane dashed L1371 | PARTIAL: dashed lane = shape; window stroke colour only |
| 17 | Team identity (gap stripe, minimap dots, grid) | `css/hud.css` L121; `js/ui/hud.js` L1420 | PARTIAL: three-letter code beside gap rows; minimap dots **NO** |
| 18 | Driving-line speed cue (on pace / lift / brake) | `js/render/shared/driving-line.js` L69; `js/render/glx/shaders/glsl-fx.js` L207, L225-232; WGX/TLX twins | **NO** (chevrons mark direction only); has its own `safe` palette |
| 19 | Fastest lap in broadcast tower | `css/hud.css` L1599 (`--sec-best` on `.bc-code`) | **NO** |
| 20 | Radio channel (race control / coach / commentary / penalty) | `css/hud.css` L1062-1070 | YES: WHO line text (`js/game.js` L1049-1055) |
| 21 | Weather | `js/race/race-settings.js` L8 | YES: emoji + word |
| 22 | Pit window suffix on gap rows | `css/hud.css` L505-506 | YES: text IN / lap count |

Totals: 22 semantics; **9 colour-only** (rows 2, 4, 7, 8, 14, 15, 18, 19, and
minimap dots from 17); 5 partial (10, 12, 13, 16, 17); 8 already carry a cue.
Not verified: damage and track-limits dots (`js/ui/hud.js` L1201 mentions four
dots) were not traced to a colour source; slice 1 audits them first.

Structural finding: colour is defined in **six** places — `css/tokens.css`,
hard-coded hex in `css/hud.css` (L792-800, L1593-1597, L646-660), literals in
`js/ui/hud.js` canvas code (L1349, L1371, L1441), per-shader constants (GLSL / WGSL /
TSL), and `js/physics/tyre-model.js` — and only the first is reached by
`data-cvd`. `js/ui/hud.js` L1386 already shows the right pattern for ONE token
(`_mmYou` read via `getComputedStyle`), but stale-caches it.

### B. Captions: what exists

- **The radio card is the caption layer.** `showAnnounce` (`js/game.js` L1041-1075)
  draws every `G.announce()` line with a WHO speaker line and car-number plate, and
  mirrors it to `#announce-live` for screen readers. `radioVoice.say` is called from
  the same function (L1083), so engineer, race control, coach and in-race
  commentary are captioned **by construction**: the text is the source, the voice
  (browser TTS or the Kokoro-82M pack, `js/audio/voice-pack.js` L12) reads it.
- Size already follows TEXT SIZE (`--fs-3`, `css/hud.css` L1014-1035) and HUD SIZE
  (`zoom: var(--hud-z)`, L56); plate opacity follows PANEL OPACITY
  (`--hud-panel-a-eff`, L1022). Position has one automatic switch
  (`body.hud-radio-top`, `js/ui/hud.js` L404-413). There are **no caption-specific
  settings**: no size/position/opacity of their own, no on/off.
- Replay commentary uses `G.announce` with a 3 s caption (`js/race/real-replay.js`
  L11, L410, L424).

Spoken or audio-cued with **no text** today:

| Source | Evidence | Gap |
|---|---|---|
| Spotter "Car left / right / three wide / clear / still there" | `js/race/spotter.js` L24-27, L115 call `pack.speak` directly; header says "Audio only" | No caption, no side indicator |
| Pre-race ANNOUNCER over the loading screen | `js/audio/announcer.js` L739-804 speaks scripted lines via `synth.speak` / `RecordedAnnouncer` (`js/audio/announcer-recorded.js` L53) | Text is not drawn by the speak path (verify on the loading screen in slice 4) |
| Lines the game drops visually but may speak | `announce()` returns false in TV cameras for `info`/`coach` (`js/game.js` L1169-1190) and is also silent then, so consistent; but a queue overflow evicts a line from the card while its engineer call is re-offered | Needs a caption-history so nothing "spoken" is unreadable |
| Audio-cue state: braking tone, L/R corner call, brake pulse, rival proximity, start-light beeps, radio squelch | `js/audio/driving-cues.js`, `js/audio/engine.js` L1901 (`brakeCue`), L1561 (`lightOn`), `radioSting`; `js/audio/rivals.js` | No visual twin; these are WCAG 1.2.x "meaningful sound effects" |
| Driving-coach text | `js/race/driving-coach.js` L246, L356 via `G.announce` | Captioned (not a gap) |

## Research (cited)

- **WCAG 2.2 SC 1.4.1 Use of Color (A)**: colour must not be the only visual means of conveying information. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- **SC 1.4.11 Non-text Contrast (AA)**: 3:1 for UI components and required graphics. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- **SC 1.2.2 Captions (Prerecorded, A)**: captions identify who is speaking and include meaningful sound effects. https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html (1.2.4 Live is AA and 1.2.1 is audio-only; both are web-media criteria used here by analogy, a game is not "synchronized media". Not fetched this session.)
- **Game Accessibility Guidelines** (via the IGDA GASIG top ten summary): no essential information by colour alone — reinforce with a symbol or offer alternative colours; subtitles in a readable default size, <= 38 characters per line, dark box behind light text, speaker always indicated; size/contrast adjustable. https://igda-gasig.org/how/game-accessibility-top-ten-se/ and the guideline pages at https://gameaccessibilityguidelines.com/ (the `/dont-rely-on-colour-alone...` URL tried returned 404; confirm the exact entry URLs before quoting in a PR).
- **Machado, Oliveira & Fernandes 2009** CVD simulation, one 3x3 matrix per type and severity; severity 1.0 values fetched from https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html : protan `[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]]`, deutan `[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]]`, tritan `[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]`. The page says "RGB"; the paper applies them to **linear** RGB, so the test must decode sRGB first (confirm against the paper before merging). The tritan matrix is the least validated of the three — treat tritan results as advisory in the PR.
- **Okabe-Ito palette** (Okabe & Ito, "Color Universal Design", https://jfly.uni-koeln.de/color/ ; Wong, Nature Methods 8:441, 2011): vermilion rather than red, bluish green rather than green, no yellow-green pairs. The page fetched shows the palette only as an image, so the hex values in Design A1 are **from memory and must be checked** against a printed source before the slice lands. The repo already uses the IBM triple (`#648FFF #FE6100 #DC267F`, `js/render/glx/shaders/glsl-fx.js` L227) and Tol-style hues (`css/tokens.css` L1031).
- **CIEDE2000** (Sharma, Wu & Dalal 2005) as the distance metric: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/ (not fetched; implement from the paper's test vectors, which belong in the unit test as a self-check). Threshold: pairwise dE00 >= 10 between the simulated colours of any two states that share a view (a conservative "clearly different at a glance" bar; the literature quotes ~2.3 as just-noticeable, so 10 is a design choice recorded as an open question).

## Design

### A1. One palette module — `js/<new>/ui/cvd-palette.js` (`window.CvdPalette`)

- Pure IIFE, no DOM at eval. Owns the semantic table: `STATE = { good, ok, warn, bad, best, you, info, zone, ghost, sec1, sec2, sec3, cmpS, cmpM, cmpH, cmpI, cmpW }`, each with `{ off, deutan, protan, tritan }` hex. `off` equals today's values, so default players see **no change** (pin with a test).
- API: `mode()`, `set(mode)`, `hex(key)`, `rgb01(key)` (for uniforms / vertex colours), `css(key)`, `onChange(fn)`, `STATE`, `simulate(rgb, type)`, `dE2000(a, b)` (the last two exported for the test, not used at runtime).
- Reads `cvdMode` through `GameStore.store` (key already `apex26.cvdMode`, schema unchanged; `settings-export.js` L188 already carries it). `AppearanceOpts.setCvdMode` (`js/ui/appearance-opts.js` L354) calls `CvdPalette.set(v)` — one added line there, none in `game.js`.
- CSS: `CvdPalette.set` writes the SAME `--faster/--slower/--sec-*/--you` tokens it already remaps, as inline custom properties on `<html>`, so tokens.css L1036-1051 collapses to a fallback (slice 2 deletes the duplicate tables only after the test proves parity). New tokens `--cmp-s/m/h/i/w`, `--zone`, `--ghost` replace the hex in `css/hud.css` L792-800 (flags keep their legally-meaningful yellow/red but gain an outline and text, below), L1593-1597, L646-660.
- Canvas: `js/ui/hud.js` L1349, L1371, L1441 and `TrackMaps.sectorColors` read `CvdPalette.css(key)`; the minimap background is rebuilt on `onChange` (it already rebuilds on livery change, keyed on `store.rev`, L1420).
- GL: `driving-line.js` keeps its `palette()` API; `DrivingLineOpts` L48-52 `LINE COLOUR` becomes AUTO (follows the global mode: `off` -> f1, any CVD -> safe) with the two explicit values kept, so no stored value breaks. Vertex colours for the tyre band (`tyre-model.js` L523) stay as data; the renderer reads `CvdPalette.rgb01("cmp"+code)` through the existing `c.tyre.colour` path only when a CVD mode is on.
- Manifest: new file goes in `tools/manifest.cjs` before `js/ui/hud.js`, then `node tools/gen/gen-shell.mjs`.

### A2. Palettes

Rules: semantic states are separated on **blue-vs-orange/vermilion** and on
**lightness**, never on red-vs-green; every pair that can sit on screen together
must pass the simulation test for ALL three types (so `off` is exempt, the CVD
palettes must pass under their own type and, as a stricter bar, the other two).
Candidate seed values (Okabe-Ito family, to be tuned by the test, not trusted):
good `#56B4E9`, warn `#E69F00`, bad `#D55E00`, best `#F0E442`/white-edge, you
`#CC79A7`; compounds S `#D55E00`, M `#F0E442`, H `#FFFFFF`, I `#009E73`, W `#0072B2`.
Lightened for the dark HUD plate exactly as `css/tokens.css` L1031-1035 explains
(white-paper hexes measure ~3:1; the HUD ink needs 4.5:1 per `apca-timing.test.mjs`).

### A3. Redundant non-colour cues (the 9 colour-only rows)

| Row | Cue |
|---|---|
| 2 sector identity | "1/2/3" numeral drawn at each sector start on the minimap; dash pattern per sector (solid / long dash / dot) |
| 4 tow | `"≈"` suffix on the gap row (`data-tow` -> `::after`) |
| 7 stint strip | letter inside each segment (the race-settings strip already does this, L282) |
| 8 3D tyre band | none needed in-world; HUD letter carries it (document, no change) |
| 14 zone | hatched stroke + "DRS"/"AX" label at zone start |
| 15 ghost dot | hollow ring, `"G"` |
| 18 line cue | chevron density/size by pace (tight on pace, wide when over) — small shader change in all three backends, behind the existing palette flag |
| 19 fastest lap | "FL" badge in the tower row |
| minimap dots | player = ring + larger; rivals unchanged (code text exists in gap rows) |
| partials 10, 12, 13, 16 | text token in the chip (e.g. `OT ON` vs `OT ARMED`), wear "LOW" word below threshold, pit window "PIT" label on the map |
| flags (row 11) | add a pattern/outline to the chip (stripes for VSC, border for blue) so the chip identity survives greyscale; text already exists |

All cues are ALWAYS on (not gated behind the mode): they cost no colour and satisfy
SC 1.4.1 for everyone; a mode-gated cue would fail the criterion for players who
never found the setting. Chip text must fit the fixed HUD geometry (check `hud-layout`).

### B. Captions

1. `js/<new>/ui/captions.js` (`window.Captions`): a ring of the last N caption records `{ t, who, text, kind }`, fed by `showAnnounce` (one call added in place of nothing — and `game.js` loses an equal number of lines by moving the `radioWho` table into the module) and by non-`announce` sources below. Renders into the EXISTING `#announce` node for radio lines (no new shell node), and into one new `#captions` strip only for non-radio sources.
2. **Spotter**: `js/race/spotter.js` L115 calls `G.caption("SPOTTER", KEYS[key], "spotter")` next to `pack.speak`; text is the key text already in `KEYS`. A left/right chevron gives the side redundantly (shape, not colour).
3. **Audio-cue visualiser (optional, slice 5)**: a small HUD glyph row driven by cue events — `◀ ▶` corner calls from `DrivingCues`, a pulsing bar for the brake tone/brake pulse (`engine.js` L1901), `● ● ●` start lights (L1561), and a proximity arc from `RivalAudio` (`js/audio/rivals.js`) when a car is alongside. Events come from a tiny `Captions.cue(kind, data)` call at each existing audio trigger; it is display-only and never reads curvature itself (the cue modules already did, assist-gated, per `docs/PHYSICS.md` §Curvature channels).
4. **Pre-race announcer**: draw each scripted line during playback in the loading screen, speaker label "ANNOUNCER" (verify first; if already drawn, skip).
5. **Settings** (APPEARANCE tab, directly under COLOUR VISION, same `SettingRow` pattern, `pm-` ids): CAPTIONS (ON / OFF / SPOKEN-ONLY), CAPTION SIZE (follows TEXT SIZE x S/M/L multiplier), CAPTION POSITION (TOP / BOTTOM / BESIDE MIRROR — replaces the implicit `hud-radio-top` rule with a player choice, AUTO default), CAPTION BACKGROUND (opacity 40-100 %, default = today's 0.82 plate, ties to PANEL OPACITY unless set), SPEAKER COLOUR (ON/OFF; speakers always have text labels, so this is decoration). Keys: `apex26.captions`, `captionSize`, `captionPos`, `captionBg`, `captionSpeakerInk`; each gets a SPEC row in `js/ui/settings-export.js` (group `appearance`), and a default in the SPEC only (not `SettingsDefaults`, which is a separate list — check `tests/unit/settings-defaults.test.mjs` before adding).
6. Size defaults honour GAG: default >= current `--fs-3`; max line 38 characters is achieved by `max-width` in `ch`, not by rewording.
7. Screen readers: `#announce-live` already speaks radio lines; the new strip is `role="status"` with the same clear-then-set pattern (`js/game.js` L1058-1060), never a second live region fighting the first.

### C. Test design

- `tests/unit/<new>/cvd-palette.test.mjs` (node, no browser): (1) `off` palette equals today's token values (golden); (2) Machado simulation of each CVD palette for the three types, linear-RGB, severity 1.0; (3) CIEDE2000 with Sharma's published test vectors as a self-check; (4) every pair in a declared "co-visible" list (sector trio, compound five, good/warn/bad, zone vs ghost vs you) has min dE00 >= 10 under its own type and >= 6 under the other two; (5) each ink clears 4.5:1 on the HUD plate (reuse the OKLab resolver from `tests/unit/nontext-contrast.test.mjs`); (6) source regex: no `#rrggbb` literal remains in the listed canvas/CSS sites.
- Gameplay isolation: source-regex test that `cvd-palette.js` and `captions.js` do not reference `Tracks`, `curvature`, `physics`, `player.` (same pattern as the grip-steer test in the a11y plan); `physics-characterization.spec.js` must stay bit-identical.

## Slices

Each slice is one draft PR; `js/game.js` lines/codeLines **must not grow** (a ratchet
raise is out of scope); every PR names its not-run groups.

### Slice 1 — Palette module + validation test (S-M)

Files: `js/<new>/ui/cvd-palette.js`, `tools/manifest.cjs` + `npm run gen`,
`tests/unit/<new>/cvd-palette.test.mjs`, `tests/groups.json` + TESTING.md §5 row,
`js/ui/appearance-opts.js` (one call). No visible change for `off`.
Verification: `node --test` the new file; `npm run test:tooling-fast`; `deploy.mjs
--gate-only` before push. Also audits damage / track-limit dot colours (unverified rows).
Ratchet: `game.js` 0; `shellNodes` 0; `cssClasses` 0.

### Slice 2 — Wire every colour source to the module (M)

Files: `css/tokens.css` (drop duplicate remap after parity test), `css/hud.css`
(L646-660, L792-800, L1593-1597 -> tokens), `js/ui/hud.js` (canvas sites),
`js/ui/track-maps.js`, `js/ui/results-sheet.js`, `js/ui/driving-line-opts.js` (AUTO),
GLX/TLX/WGX uniform feed. Verification: `ui-scale.spec.js` + `hud-audit.spec.js` as
single specs; renderer edits follow `.claude/rules/render-wgx.md` / `render-tlx.md`
(software probes are not GPU evidence: dispatch `gpu-census.yml` on `macos-latest`,
read its Verdict). `driving-line` characterisation unchanged for `f1` palette.
Ratchet: `hud.js` may shrink (literals removed); `game.js` 0.

### Slice 3 — Redundant non-colour cues (M)

Files: `js/ui/hud.js`, `css/hud.css`, `js/ui/track-maps.js`, `js/ui/results-sheet.js`,
chip text in `index.html` only if a node is already there (prefer `::after` / existing
nodes: `shellNodes` slack is 25, `cssClasses` slack is 5 per the a11y plan's table —
re-measure at the tip). Verification: `node tools/ui/layout-audit.mjs --list`, then the
survey-ui-matrix matrix for `hud` screens (`--screen=` cells at 852x393 and portrait,
UI scale 100 and max, touch + mouse) to prove new chip text clips nowhere; `hud-layout`
spec; greyscale screenshot comparison (CSS `filter: grayscale(1)` in the probe, not in
the shipped CSS) as visual sign-off only. Deploy-gate: `npm run test:sweeps` NOT needed
(no geometry).

### Slice 4 — Captions: spotter, announcer, settings (M)

Files: `js/<new>/ui/captions.js`, `js/race/spotter.js`, `js/audio/announcer.js`,
`js/ui/appearance-opts.js` (rows), `index.html` (rows reuse `SettingRow.build`, as
`pm-cvd` does at L422-433, so near-zero shell nodes), `css/hud.css`,
`js/ui/settings-export.js` SPEC rows, `docs/UI-MAP.md` Settings values row.
Verification: unit (record ring, speaker table, no `Tracks` reads); `settings-export`
round-trip test; `survey-ui-matrix` on the APPEARANCE tab and the in-race HUD with
CAPTION SIZE max x UI scale max (the combination most likely to clip); `ui-menu-a11y`
checklist for the new rows (keyboard, selected-state announcement). Moves `radioWho`
out of `js/game.js` in the same commit (net negative).

### Slice 5 — Audio-cue visualiser (S-M, optional)

Files: `js/<new>/ui/cue-glyphs.js`, hooks in `js/audio/driving-cues.js`,
`js/audio/engine.js`, `js/audio/rivals.js` (event emit only). Default OFF; one SPEC
key `apex26.cueGlyphs`. Verification: unit (cue events -> glyph state, no curvature
read, no listener when off); a VM test that audio counters are unchanged with it on
(display-only). Not for the first release if slices 1-4 are late.

## Risks

1. **Palettes pass the simulation but not real eyes.** Machado is a model; tritan is weakest; dE00 >= 10 is our own bar. Mitigation: ship the test as a floor, keep the OFF default untouched, ask for player feedback, never claim certification.
2. **Hard-coded colours hide in shaders and canvas code.** The inventory is from grep; an unseen consumer stays un-remapped. Mitigation: the source-regex test lists the allowed literals; slice 1 audits damage/track-limit colours first.
3. **Layout regressions from new chip text/labels** at 852x393 and big UI scale; the HUD is fitted to fixed geometry (`js/ui/hud.js` fit code). Mitigation: slice 3 matrix run; text uses existing chip nodes.
4. **Caption duplication/noise**: radio card + strip + live region could speak twice to a screen reader. Mitigation: one live region, strip is `aria-hidden` when the card shows the same record.
5. **Shell/CSS budgets** (`shellNodes` slack 25, `cssClasses` slack 5 as last measured in the a11y plan; not re-measured today). Mitigation: attribute selectors, reuse nodes.
6. **Driving-line AUTO** changes a stored `f1` default for CVD players on first load; schema-neutral but visible. Mitigation: only when the player set a CVD mode.

## Open questions for the owner

1. Is dE00 >= 10 (own type) / 6 (other types) the right distinguishability bar, or should it be looser for tritan?
2. Ship cues always-on (recommended, SC 1.4.1) or only with a CVD mode / a "SYMBOLS" toggle?
3. Should `LINE COLOUR` remain a separate player choice, or be absorbed into COLOUR VISION with AUTO (this plan assumes AUTO + keep explicit values)?
4. Caption default: ON for everyone (it already is, for radio) — should SPOTTER captions default ON, or opt-in because the spotter fires often?
5. Is the audio-cue visualiser (slice 5) wanted at all, or are the L/R corner calls already the visual twin you want?
6. May `#announce` be repositioned by the player (TOP/BOTTOM) given mirror and flag chip layout rules at `css/hud.css` L731-790, L937-941?

## Effort

Slice 1 S-M, 2 M, 3 M, 4 M, 5 S-M. Whole feature **L** (about 5 PRs); slices 1-3
alone (colour half) are **M-L**; captions half (4) is **M**.
