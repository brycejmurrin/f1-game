# Test truth hunt — which tests protect a player? (2026-11-09)

Kind: measurement · Re-measure-by: 2026-12-09

Hunter lane for orchestrator `session_01BEw9UJmEwfcqKAJBDp6TYy`, tree `e808230`. The question: of the
unit files and browser specs, which can actually fail when the game breaks for the owner on his phone.
Nothing here is taken from a comment, a test name or a PR body: each row is a mutation that was run, a
selector replay, a CI log, or a live measurement. Method and scripts are at the end.

**The owner's phone** (issues #5198–#5206): iPhone Home Screen app, landscape 852×393 CSS px, safe-area
insets 59/21/59, WebGPU three.js path, profile `tests/data/settings-defaults-export.json`
(HUD 155 %, BUTTON 245 %, large text, high contrast).

## Summary

| # | Class | Verdict | Fixed here |
|---|---|---|---|
| T1 | Unit tests over CSS are text scans: none measures what a player sees | CONFIRMED by mutation | partly (browser cell added) |
| T2 | Browser specs assert a rect or a `.click()`, at the house viewport and default profile | CONFIRMED live | partly (owner cell added) |
| G1 | A CSS-only diff selects the 844×390 smoke and nothing that measures layout; a unit test pinned that | CONFIRMED by replay | yes |
| G2 | The CI select step dirties the tree it diffs, so `reason=infra` on every PR and "unmatched → fail closed" is unreachable | CONFIRMED on 20 of 20 PR logs | yes |
| G3 | A browser spec dropped as "covered by its VM twin" can run in neither place | CONFIRMED on 11 of 20 PRs | no (issue) |
| G4 | Routing sends some files to specs that do not exercise them (`js/fx/`, `sw.js`, 22 boot-only files) | CONFIRMED by replay | no (issue) |
| G5 | `ci-verdict` / `selected-gate-verdict` / `merge-gate` accept skipped, empty and re-run-to-green states | CONFIRMED by crafted input | no (issue) |
| S1 | Silent soft-skips: a test that returns before its first assertion and reports a pass | 2 confirmed (1 fixed here, 1 is #5014) | 1 |
| S2 | A tolerance 240× wider than the effect it guards | CONFIRMED | no (noted) |

## T1 — the unit suite cannot see the screen

Counts (`scratch/scan2.mjs`, regex over `tests/unit/`): 1096 unit files; 187 read `css/` or `index.html`
as text; 8209 of 71 772 assertions are `assert.match` / `doesNotMatch`. The mutations below were applied
in a detached worktree (`scratch/mut`, never pushed) and every unit file naming the mutated surface was run.

| Mutation (the player-visible defect) | Unit files run | Red | What went red |
|---|---|---|---|
| M1 RESUME collapsed to 0 height on the phone-landscape pause sheet (`css/overlays.css:1145`, the #5200 shape) | 58 | **0** | — |
| M2 `#pausemenu #pm-resume { display: none }` (`css/dialogs.css:239`) | 58 | **0** | — |
| M8 `<button id="pm-resume" hidden>` in `index.html:866` | 37 | **0** | — |
| M3 CAM/PAUSE chrome `--hud-chrome-h: 44px` → `130px` (the #5179 shape) | 33 | 1 | `phone-touch-surface.test.mjs:119`, a pin on the literal `"44px"` |
| M9 four overrides appended to three sheets: RESUME hidden, PAUSE 130×130 in a race, every title door 8 px tall and clipped, pedals translated off-screen | 127 | 1 | `css-layers.test.mjs` (the text was outside an `@layer`: a structure lint, not the defect) |
| M9b the same four overrides written inside each sheet's closing `@layer` | 127 | **0** | — |
| M4 size sliders inverted (`js/ui/scale.js` `pct / 100` → `100 / pct`, the #5206 shape) | 38 | 1 | `appearance-studio.test.mjs:72` — a real behavioural catch (runs `scale.js` in a VM and reads the CSS variable) |
| M5 size sliders dead (always `1`) | 38 | 1 | the same test |
| M10 the selector returns no browser spec for a CSS diff | 17 | 1 | `select-specs.test.mjs` "a css edit selects the small CSS set" — behavioural |

Reading: M3's one catch is the test added as the fix proof for #5179 (#5194). It parses the first rule
that matches and compares a declaration to a string, so M9b's later rule `body.in-race #pausebtn
{ width: 130px }` — the same on-screen defect — passes it. No unit test can go red on "RESUME is not on
screen". M4/M5 show the opposite case honestly: where a test executes the module, the mutation dies; that
test stops at the CSS variable, and whether the variable makes anything bigger is CSS again.

**Fix shape.** A CSS regex is not evidence about layout; the evidence is a browser cell. One is added here
(T2). Rewriting 187 files is not the fix: stop adding regex pins as the proof of a UI fix, and require the
fix PR to name the browser assertion that fails before it.

## T2 — the browser specs measure the wrong phone, and mostly existence

Read from the spec code by a read-only sub-hunt; the rows marked *live* I measured myself on `e808230`
(Chromium, 852×393, CDP insets, touch emulation, export seeded, TLX).

- 179 spec files: 94 name a phone-landscape size (mostly 844×390), 77 name none and run at desktop
  1280×720, 16 name 852×393, 3 use real `env()` insets (CDP `setSafeAreaInsetsOverride`); the rest fake
  them as `:root{--sal}` so `env()` stays 0. 7 seed the export. **0 emulate `display-mode: standalone`.**
- `tests/helpers/fixtures.js:133` pins `gfxBackend=webgl2` for every spec; the owner plays the three.js
  WebGPU path. 8 specs force DPR 1; one test uses DPR 3.
- `clickLive` (`fixtures.js:57`) is `el.click()`: 50 call sites, plus 99 `getElementById(..).click()` in 28
  specs. A DOM click succeeds on an invisible, clipped or covered control.
- *live*, #5200: at UI SIZE 50 `#pm-resume` has rect 271×52 at (297,309), `display:block`, inside the
  window — and `elementFromPoint` at its centre returns `.sheet`. `ui-resize.spec.js:764-828` (the owner
  cell for the pause sheet) opens the sheet with `hidden = false`, judges doors by rect, and asserts
  `--ui-scale` is `1.09`; every one of those passes on the broken build.
- *live*, same session: after UI SIZE went 50 → 109 the pause `.sheet-body` scrolls (301 in 195) though
  it fitted (191 in 191) at the same 1.09 on first open. The layout depends on slider history. Paths
  belong to #5207.
- *live*: on `e808230` PAUSE is 44×44 and CAM 78×44 at the owner's sizes (the #5194 fix holds), pedals
  85×85 and steer pads 140×140 inside the safe box, all hit-testable.

| Phone bug | Test that should have caught it | Why it did not |
|---|---|---|
| #5165 HUD rebuild wrong on phone | `hud-layout.spec.js:532-616` | the PR rewrote its own oracles (+156 lines); nothing compares the HUD to the layout before |
| #5166 pixelated | `scale-defaults.test.mjs:256-282` | asserted the default as a constant, so it agreed with the bug; no spec at DPR 3 on his path |
| #5179 CAM/PAUSE too large | `hud-layout.spec.js:929`, `ui-scale.spec.js:325-360` | overlap and invariance only, never a maximum; owner cell asserts the sector plate |
| #5198 ARRANGE bar covers the race | `ui-button-touch.spec.js:935` | `height < 80` on the default profile; `:970` pins the font scaling that caused it |
| #5199 title look, dead width control | `title-fit.spec.js`, `tests/helpers/title-fit.mjs:226` | asserts fit, not look; `judgeStored` pins the cluster width, i.e. WIDTH as a no-op |
| #5200 no RESUME | `ui-resize.spec.js:764-828` | above: `hidden=false`, rect not hit-test, one UI SIZE |
| #5202 garage buttons too big | `garage-aero.spec.js:250-258` | floors ≥ 44 only; `lookGarage` never seeded; `#cs-photo` in no spec |
| #5206 sliders backwards | `sliders.spec.js`, `ui-scale.spec.js:925-950` | steering sliders only; size sliders assert "stored == given", never that the named rect grows |

**Fixed here.** `tests/specs/css-player-smoke.spec.js` gains the owner cell: 852×393, CDP insets 59/21/59,
export seeded, PAUSE 44–48 px and square, CAM the same height, pedals inside the safe box, the pause sheet
opened by a trusted tap and every door (`pm-resume`, `pm-restart`, `pm-settings`, `pm-quit`) hit-tested,
sheet body `scrollHeight ≤ clientHeight`. It runs on every CSS diff (G1). Not asserted there, on purpose:
RESUME at UI SIZE 50 (red until #5207 lands; that PR owns `ui-resize.spec.js`), standalone (not emulable).

**Left for the owners of those paths** (each is one assertion): slider direction as a monotonic measured
rect per `input[type=range]`; `ui-resize` to open through `#pausebtn`, hit-test, and loop UI SIZE
40/51/109/130; a maximum and equal heights for the garage overlay buttons with `lookGarage` seeded; the
ARRANGE bar ≤ 56 px with zero cover of the selected widget at the owner cell; a drawing-buffer floor at
DPR 3.

## G1 — a CSS-only diff ran no layout spec (fixed)

`node tools/ci/select-specs.mjs --files css/hud.css --json` on `e808230` selects
`css-player-smoke` and nothing else; `css/touch-controls.css` and `css/settings.css` the same;
`dialogs`, `tokens`, `title` add `menu-baseline` only (`select-specs.mjs:1418` `cssSpecs`). The specs that
measure those sheets (`hud-layout`, `ui-scale`, `ui-resize`, `title-fit`) are scheduled for a JS diff only.
`tests/unit/select-specs.test.mjs:1806` asserted exactly that:
`assert.deepEqual(cssSpecs(["css/hud.css"]), [smoke])` and `!menu.includes("hud-layout")` — a test that
enforced the hole, and ended in a regex over the selector's own source.

In CI the narrowing was masked by G2 (the diff always carried a non-CSS path, so `kind` was `code` and
the whole routed group ran). Fixing G2 alone would have switched it on. Fix: `CSS_LAYOUT_SPECS` routes
each sheet to the spec that measures it; every `css/*.css` must be in that table or in `CSS_SMOKE_ONLY` by
name; the test drives `select()` instead of reading its text. Cost: a `css/hud.css`-only diff goes from 1
leg to 7 (`hud-layout` ×4, `ui-scale` ×2, the smoke).

## G2 — the select step made every PR an "infra" diff (fixed)

`tools/ci/ci-select-specs-step.sh:9` ran `chmod +x tools/ci/ci-resolve-before.sh`. The helper is committed
`100644`, so git reported it modified in the diff `select-specs` reads; it matches `TRACKED`, so
`select-specs.mjs:1483` chose `reason=infra` before `unmatched` could be reached. All 20 sampled PR select
logs list that file as changed; none of the 20 touched it. Consequence: `controller.html`, `overlay.html`
and `bench.html` (unmatched when replayed alone) get an empty plan and a green in CI, and
`selected-gate-verdict` calls an empty plan a pass. Fix: the chmod is gone (the helper is run through
`bash`); a test runs the real step in a throwaway repo and asserts its diff lists only the commit's files.

## G3–G5 — gate holes not fixed here (one issue)

- **G3.** `select-specs.mjs:610` removes specs with a VM twin from the browser plan with no dropped count;
  the twin runs only in `adapted-specs.test.mjs` on node slices `page-a/b`, which
  `pick-unit-slices.mjs:213` often does not allocate. On 11 of 20 merged PRs at least one such spec ran in
  neither (e.g. #5197: `albert-park-`, `cota-`, `imola-foundation`, `autopilot`, `logging`). Repro:
  `node scratch/gate-hunt/proof-nodeplan.mjs`.
- **G4.** `pick-tests.mjs:239` routes `js/fx/` to `ui`; the only spec asserting skid marks is
  `tlx-probes.spec.js` in `test:gfx` — #5181 changed `js/fx/skidmarks.js` and ran 60 specs, not that one.
  `sw.js` alone routes to zero browser specs (`perf-sw-cache-hit.spec.js` did not run on #5187/#5188).
- **G5.** `ci.yml:3139` `REQUIRE_SUCCESS` omits `selected`, `selected-verdict`, `node-suites`, and
  `ci-verdict.mjs` counts skipped as pass (latent: they ran on all 20). `selected-gate-verdict.mjs:177`
  passes an empty plan even with guards red. `merge-gate.mjs` `ciVerdict` reads the newest attempt, so
  red → re-run → green lands (#5190, run 42730286157, red on `perf-hot-bench.test.mjs`); AGENTS.md rule 9
  calls that a red. `ready-gate` passes on `Structural guards` alone.

What held: on all 20 PRs every spec the selector put on a browser leg ran and passed on the merged head
in a full-tier run; none merged on a draft-only or cancelled run.

## S1, S2 — soft-skips and tolerances

AST scan (`scratch/scan3.mjs`) for a `return` before the first assertion: 18 sites, 16 of them explicit
`t.skip(reason)` or legitimately empty. Two report a pass without running:

- `tests/unit/frame-hotpath-alloc.test.mjs:150` returned when `gc()` was absent; no runner passes
  `--expose-gc` (probe M11: a `fail()` placed after the guard stayed green). **Fixed**: it takes `gc()` the
  way `frame-lights-shed.test.mjs` does. S2: now that it runs it reads 272 B vs 16 B against a 64 KiB
  slack, on two loops written in the test — it measures V8, not the game, and cannot fail. Left as is.
- `tests/unit/title-home-scene-prepaint.test.mjs:109` is #5014 (batched in #5118), not repeated here.
- `tests/unit/garage-looks.test.mjs:102` (`if (!sa) return`) does run today (`buildStatic` is exported);
  it would pass silently if the export were renamed. Owned by #5183.

`tools/ci/assert-audit.mjs` reports 0 vacuous specs and `test-honesty.mjs` 0 unexplained skips; both are
right about what they look for and neither can see T1 or T2.

Quarantine (`tests/data/flaky-quarantine.json`): the two `hud-layout.spec.js` "monotonic HUD SIZE" rows
expired 2026-11-09 with their review step not done; `image-grade-visual` expired 2026-11-04. Expired rows
block again by design; not re-verified on CI here.

## Method

- Mutation harness `scratch/mutate.mjs` + `scratch/m1.json`, `m2.json`, `m3.json`; logs
  `artifacts/logs/mut-m*.log`. Baseline (no mutation) on the same 54 files: 0 red.
- Selector replays: `node tools/ci/select-specs.mjs --files <a,b> --json` (the list is comma-separated).
- Gate sample: the 20 most recent merged PRs touching `js/`, `css/` or `index.html`; job logs and
  crafted-input proofs under `scratch/gate-hunt/` (`proofs.mjs`, `proof-nodeplan.mjs`).
- Live measurement: one interactive Chromium through the Playwright MCP, `scratch/poke1.js`.
- Not done: no browser spec was mutation-tested (agents run no browser tests locally); T2's per-spec rows
  beyond the *live* ones are code reading, not execution.
