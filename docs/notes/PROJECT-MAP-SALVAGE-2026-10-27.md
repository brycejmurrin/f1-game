# Project map salvage, 2026-10-27

What was worth keeping from the closed project-map PR #3922 (branch
`cursor/project-map-a84f`, head `b075ac28`, 325 commits, +723,832 lines in 495
files, all but one under `docs/project-map/`). The branch is kept; any file
quoted here can be read with
`git show origin/cursor/project-map-a84f:docs/project-map/<file>`.

**Headline: the map is a read-attestation ledger, not a navigation aid. Its one
durable product is a backlog of ~125 comment-vs-code discrepancies, which this
note carries; everything structural already lives in `docs/ARCHITECTURE.md`,
`tools/manifest.cjs` and apex-lsp.**

## What the map contains

- **How it was made:** by hand-driven LLM reading lanes (its `GOAL.md`: "fresh
  GPT-6.1 Sol agents", LSP for relationships), one commit per report. There is
  **no generator script** on the branch; nothing can re-run it.
- **Bulk (~95 % of the bytes):** proof that each file was read — `coverage.tsv`
  (one row per tracked entry: bytes, SHA-256, read method), and ~170 JSON
  ledgers (`retained-output-evidence.json` 3.7 MB, `retained-identity-closure.json`
  2.1 MB, `snapshot-*-evidence.json`, `tests-*-evidence.json`) holding chunk
  intervals and hashes. These attest coverage of snapshot `ae73c676`; they say
  nothing about how the game behaves.
- **~320 Markdown reports**, one per area (`physics-complete.md`,
  `net-input-complete.md`, `tests-unit-NN-complete.md` …): a coverage table, a
  short "architecture and contracts" paragraph, and a **"verified comment
  discrepancies"** list.
- **`PROJECT.md`:** a directory-ownership table and a runtime-flow diagram.
- **`comment-cleanup.md`:** a central register of 29 corroborated comment drifts
  (CC-01…CC-29) with quotes and suggested wording.

## Spot-check against the deploy tip `01e64933`

| Claim | Result |
|---|---|
| 5,109 tracked entries at `ae73c676` | exact (tip now 5,187, 95 commits later) |
| 561 `js/**/*.js`, 34 stylesheets, 38 symlinks, 582 `tools/` paths | all exact at the snapshot (tools/ is 574 at the tip) |
| 20 physics files fully read | exact: `js/physics/` has 20 |
| `js/core/log.js` first, `types/game-ctx.d.ts`, `tools/manifest.cjs` as the roster | all hold |
| CC-01, 03, 06, 07, 08, 10, 13, 18, 27, 29 (re-read against source) | 10 confirmed |
| CC-11 ("the last 200 per URL" vs ETAG_CACHE_MAX 256) | **refuted** — 200 is the HTTP status |
| CC-28 (`webkit-leg.yml:30`) | **stale** — the workflow no longer exists |
| 28 of 29 register quotes still at the cited line | yes (±3 lines) |
| `ai-drive.js` aggression ±35 % vs `0.22`; `debris-world.js:61` "never touches grip" vs `marbleGrip` in `player-forces.js` | both confirmed |
| `interlagos.js:16` "0.92 … below Japan 0.85" | confirmed |
| `CarDraw.create` use at `game.js:3522` | drifted: line numbers in `game.js` have moved; use apex-lsp |

## Stale or noise

- Every line number is pinned to `ae73c676` and drifts with each merge;
  the per-area tables of "file — full body and comments" carry no information
  beyond the file list.
- The JSON ledgers, `coverage.tsv`, `snapshot-*`, `retained-*` and
  `coverage-audit*` files only certify the reading campaign. Not worth a
  release asset either: nothing downstream consumes them, and the branch
  already preserves them.
- `PROJECT.md`'s runtime-flow section restates `docs/ARCHITECTURE.md` and the
  AGENTS.md Layout section at lower resolution.

## What the repo lacked

1. **The comment-drift backlog** below — not in `docs/notes/DEFECT-LEDGER.md`
   or any hunt register. Mostly comments that state an old number or a removed
   mechanism; a few mislead about physics (marble grip, aggression scale) and
   CI (`baseline-trial` is named non-blocking but `ci-verdict.mjs` has an empty
   `ADVISORY` set). Re-verify each with agent `finding-verifier` before editing.
2. **The top-level directories outside `js/`** — `docs/ARCHITECTURE.md` never
   names them. `desktop/`, `mobile/` and `worker/` have their own README;
   the rest only had this map:

| Directory | Role (from the map's `PROJECT.md`) |
|---|---|
| `desktop/` | Electron shell: app-origin protocol, preload and permissions, packaging; packages the same web runtime |
| `mobile/` | Capacitor Android shell, native file/share bridges, Gradle; packages the same web runtime |
| `worker/` | Optional Cloudflare Durable Object mailbox for sealed rendezvous offers/answers with TTL; not a game server |
| `examples/`, `sites/`, `spike/`, `design-preview/` | Demos, design prototypes and retained investigations |
| `plugins/`, `cursor-plugins/` | Project plugins for Claude Code and Cursor |

Nothing else is new: per-symbol "who calls what" is answered live by apex-lsp
(skill `code-nav`), the module roster by `tools/manifest.cjs`, the `__apex`
surface by `docs/agent-index.json`, and the tool catalogue by `tools/README.md`.
A re-run would be another LLM read campaign; if one is wanted, ask for the
discrepancy lists only.

## Comment-drift register (CC-01…CC-29)

Line numbers are at `ae73c676`. "quote present" = the quoted comment is still
at that line on `01e64933`; the claim itself was not re-checked.

| Id | Pri | Source | What the code does | Verdict 2026-10-27 |
|---|---|---|---|---|
| CC-01 | P2 | `js/car/car3d.js:25–26` | Williams has noseTipZ -0.10, not +0.10; the livery example at 1147 also calls Williams long. | **confirmed** |
| CC-02 | P1 | `js/car/car-body-geom.js:295–295` | frontBakedCount retains at least one cascade element; the first is the main plane. | quote present |
| CC-03 | P3 | `js/car/car-draw.js:10–11` | The same sentence lists six injected helpers. | **confirmed** |
| CC-04 | P2 | `js/car/liverytex.js:657–658` | crestKeepsPlate and the bare/keepPlate condition preserve selected authored plate/disc details. | quote present |
| CC-05 | P1 | `js/track/tracks.js:195–216` | This block is immediately followed by racing-line baking; the next pit explanation says widening is gone and the pit is a separate ribbon. | quote present |
| CC-06 | P2 | `js/track/core/pit.js:38–40` | SIGN is 1024×1024 and lower crest rows start at y512. | **confirmed** |
| CC-07 | P2 | `js/track/core/hidden-faces.js:17–18` | Bottom tests check three vertices plus centroid and three edge midpoints: seven positions. | **confirmed** |
| CC-08 | P1 | `tools/ci/deploy.mjs:12–12` | plan immediately invokes git fetch and checks mergeability. | **confirmed** |
| CC-09 | P1 | `tools/ci/deploy.mjs:232–234` | Missing workflow, missing named step, and zero parsed scripts all throw. | quote present |
| CC-10 | P2 | `tools/ci/github-token.mjs:10–10` | Each tokenless resolver invocation calls its gh provider; there is no resolver-level cache. | **confirmed** |
| CC-11 | P3 | `tools/ci/ci-watch.mjs:86–87` | The imported cache bound is ETAG_CACHE_MAX=256. | **refuted**: `200` is the HTTP status (cache the last 200 response per URL), not a count |
| CC-12 | P1 | `tools/ci/live-run-check.mjs:4–7` | The push hook already invokes the tool with a five-second outer timeout. | quote present |
| CC-13 | P1 | `tools/ci/flake-tally.mjs:7–10` | --issue reaches issue create/update/close helpers; it also writes local diagnostic/cache outputs. | **confirmed** |
| CC-14 | P2 | `tools/check/extract-module.mjs:5–7` | The selected range is parsed raw; parse failure requests whole functions/statements and exits. | quote present |
| CC-15 | P1 | `tools/check/trim-comments.mjs:22–22` | narrativeOkForFile rejects every matching WebGPU path, including explicitly selected ones. | quote present |
| CC-16 | P1 | `tools/check/twin-fidelity.mjs:23–23` | The dry branch validates needles and returns before mutate is called. | quote present |
| CC-17 | P2 | `tools/check/html-sink-lint.mjs:20–22` | isConstantHtml accepts templates whose substitutions are recursively constant, plus supported numeric/string literals. | quote present |
| CC-18 | P1 | `tools/check/shader-validate.mjs:32–33` | The explicit CLI exit expression selects only 0 or 1. | **confirmed** |
| CC-19 | P2 | `tests/unit/shared-math.test.mjs:19–22` | PRIVATE_DEF and the ratchet test cover clamp/lerp, not a general private-wrap ban. | quote present |
| CC-20 | P2 | `tests/unit/shared-math.test.mjs:205–205` | Assertions prove left/right identity and order-sensitive composition, not three-operand associativity. | quote present |
| CC-21 | P2 | `tests/unit/shared-track-foundation-characterization.test.cjs:2–3` | The current case explicitly asserts that recordBarrier(0,1) covers a full lap. | quote present |
| CC-22 | P3 | `tests/unit/settings-reload-vm.test.mjs:15–15` | This is the only case in the file; its own assertions boot fresh VMs on copied storage. | quote present |
| CC-23 | P2 | `tests/unit/settings-open-perf.test.mjs:302–303` | The top-level assert enforces a real lazy-audio roster-size invariant. | quote present |
| CC-24 | P1 | `tests/unit/settings-export.test.mjs:646–647` | The same case asserts unlimitedBudget is accepted and persisted; only somethingElse is absent. | quote present |
| CC-25 | P3 | `tests/unit/setup-preview-hull.test.mjs:32–35` | ENUM_GEOM immediately lists eight geometry field families. | quote present |
| CC-26 | P3 | `tests/unit/setup-screens-state.test.mjs:6–7` | The fixture constructs CareerScreen.create; historical prose uses the older module name. | quote present |
| CC-27 | P1 | `.github/workflows/ci.yml:2937–2946` | The golden test step has no continue-on-error; baseline-trial is a ci-verdict dependency and ADVISORY is empty. Only artifact upload is best effort. | **confirmed** |
| CC-28 | P2 | `.github/workflows/webkit-leg.yml:30–30` | The workflow passes APEX_WEBKIT_TRACK and the spec uses that environment variable with a Montreal fallback. | **stale**: `webkit-leg.yml` no longer exists |
| CC-29 | P2 | `.github/workflows/pages.yml:447–447` | The failure issue hardcodes four minutes, but verification is delegated and the job cap is fifteen minutes. A failure need not mean a four-minute polling expiry. | **confirmed** |

## Runtime comment drifts by area (unverified)

Copied verbatim from each area report's "verified comment discrepancies"
list (`docs/project-map/<area>-complete.md` on the branch); paths are relative
to that area's directory. Not re-checked here beyond the spot-checks above.
The `tests/` and `tools/` lists stay on the branch.

#### `physics`
- ai-drive.js:459 says aggression changes probability by ±35%; expression at 461 uses ±22%.
- ai-drive.js:909 says yield lift 6%; TRAIL_YIELD_EASE=.90 represents 10% before further yield.
- tyre-model.js:77 says front utilization uses nominal peak; player-forces.js:351 uses front-specific peak.
- tyre-model.js:65 describes former front curve values; current front branch at 104 rescales peak and uses Gaussian falloff.
- aero-zones.js:44 says counts only and no turn-pair encoding; authored AERO_ZONE_TURNS at 106 is resolved first at 184.
- debris-world.js:64/488 says cosmetic marbles never affect grip; marbleGrip at 1160 is applied by PlayerForces.
- player-forces.js:151 claims marble grip does not affect longitudinal path; optional WheelState capG includes marbleMu at 247.
- collide.js:568 calls shapes capsules; implementation uses boxes/SAT. Absolute no-overlap wording exceeds finite solver guarantee.
- debris-world.js:1224 references xMesh wrappers; per-body fallback now lives in DebrisDraw poolMesh.

#### `net-input`
- steer-tuning.js:420 describes obsolete absolute-nearest pace migration; actual log-distance at 445 maps old 10 to 19.
- bindings.js:105 says malformed saved slots fall back to defaults; actual existing-array slots become null (118/122).
- sdp.js:160 says eight of each candidate kind; combined budget is eight (193).
- input.js:1521 calls Start fixed, while pause is remappable; 1539 describes document dispatch and local helpers now in PadMenu with focused target.
- pad-menu.js:21 points below for a note actually above, partly describing superseded dispatch behavior.
- input.js:1946 calls look-back held/key-pad-only despite toggle modes and remote held support.
- input.js:2094 calls linearity 5 shipped; effective tuning default is 6.
- steer-tuning.js:75 says adaptive buttons default 6; effective default/preset is 5.
- haptics.js:59 calls priming zero-length/frame lifetime; actual vibrate(1), latched for page lifetime.
- phone-pad.js:723 promises pointerleave release for held controls; actual hold release uses up/cancel/lost-capture/safety nets; pointerleave applies to edge controls.
- input.js:1825 incorrectly describes pedals-only phones entering remote sensor path; they skip it.

#### `data-career`
- legends.js:279 says team ID remains custom; body returns legends at 291.
- regulations.js:14 says AI always factory; Career.aiSetup returns developed fitted bag.
- real-race-tab.js:734 says nine requests; fetchRaw launches eleven plus optional meeting.
- career.js:1810 says era strips illegal AI fitted parts; scrub preserves ownership and selectively shelves/replaces, runtime resolves banned fitted IDs.
- career.js:982/career-ui.js:1087 say factory never runs out; FACILITY_MAX is 8 and upgrade refuses at cap. Related guide strings also stale.
- telemetry-model.js:240 calls lanes 3/4 speed-marker-only; renderer draws full speed polylines and deltas.
- results.js:5 says duration shape picks layout; metadata kindOf selects columns, shape only extracts values.
- hub header omits registered WATCH & DRIVE tab.

#### `camera`
- CamComfort says stored choice always wins/already-set boot is no-op; boot removes saved on for non-touch.
- Director decideCut doc says battle waits for max unless explicit event kind; body cuts new battles between min/max and accepts no event-kind argument.
- CamGroups says helmet floating speed paints; mode-switch LCD marker and touch CSS hide it.
- Vantage curvature comment lists only three modes while condition includes others; onboard-attitude comment omits visor/helmet/tcam; corner lead shipped .35 conflicts default .4; two-neighbor floor wording precedes four-point interpolation.
- Offsets says only chase/far use cornerLead while droneFollow does too; moved-from-default count actually counts explicit default keys.
- FlybyPanel duration sum exactly one claim ignores six-decimal rounding.
- FlybySeq default/variation headers say nine shots, actual default has eleven.

#### `garage`
- `scene-prims.js:168–170` says shared material ids are read lazily and need no HARD_EDGES pair. The following top-level `const MAT` reads TrackGeom immediately, and `tools/manifest.cjs:767` explicitly lists that eval dependency. The file header already states eval-time behavior correctly.
- `pit-signs.js:154–155` calls the second mesh RED aspects drawn only under a red flag. `draw` at 197–198 instead overlays it when `called` is true, and the atlas/signal comments specify GREEN call-in aspects. The upload comment describes the opposite behavior.
- `scene.js:1352–1355` says the pruning pass uses four axis-extreme points and a quadrilateral. The body at 1362 onward uses `M = 8`, eight directions and octagon edge tests; the adjacent newer comment explains why four retained too many corners.
- `setup-camera.js:345–347` says default orbit/aim reproduce old separate offset numbers exactly. The next explanatory block and `SP_CAR_CTR = [0, 0.45, 0.245]` instead deliberately unify orbit and aim at the measured car center. The introductory compatibility statement is superseded.
- `setup-camera.js:177` calls drive-out advancement clamped frame dt. `stepDriveOut` at 185 derives `gap` from `performance.now()` and caps wall-gap credit to 0.1 s. Its following comment documents the newer wall-clock behavior correctly. Explicit preview remains render-dt based, unlike the current sheet-arrival wall-gap hybrid, so `225–226`'s “as the WORK ON CAR arrival runs” comparison is also stale.
- `scene-dress.js:289–290` promises the same stat numbers as the DOM panel. `boardInfo` at 48 resolves parts without the optional tune argument; `setup-sheet.js:29–30` passes `SetupTune.mods(team.id)` into the DOM stat calculation. LSP's `Parts.resolveSetup` body confirms tune is applied only when supplied. Therefore the promise is not generally true after mechanical tuning; this is a concrete contract discrepancy requiring a scoped follow-up, not a measured rendering claim.
- GameCtx's `spEffFit` comment (`types/game-ctx.d.ts:562`) says the telemetry is before its cap/clamp, while `setup-camera.js:786` assigns the already `Math.min(SP_FIT_DIST_MAX, …)`-capped fit (or capped Home fit) to `_spEffFit`. The report records the source behavior rather than the declaration comment.

#### `perf`
- governor sentinel comment near 345 says menu world builds arm active; game 1964–2040 gates arming to count/race and explicitly excludes menu.
- governor near 1138 says tier not touched, though preceding quality-raise branch resets measured tier/shedding. Narrow the condition described.
- bench-capture.js:14 says no URLs beyond path; clean() retains scheme/host/path, dropping query/hash.
- phone-recorder.js:15 claims only counter cost per callback; actual callback observes rate and serializes mode state, with periodic recording/painting.
- metrics-overlay.js:18 calls rAF tick about 4Hz; rAF callback runs at display cadence, paint is throttled to 250ms.
- BenchRun header says final reload only if renderer changed; finishPlan unconditionally reloads for fresh title.

#### `editor`
- `custom-tracks.js:8` says the online lobby sees none of custom tracks; `designer.js:76` tells players there is no online play on their circuits. The lobby settings payload/install and host publish paths above implement custom friend-race sharing. These statements are stale; this lane did not test a network session.
- `codec.js:107–111` describes the registry fraction sanitizer as rounding up to and keeping 1.0. Actual `custom-tracks.js:46` uses modulo 65535 after rounding, so that result wraps to 0; props use the same wrap. The decoder's quarter-step handling still serves the separate full-lap width sentinel (`HWZ_FULL_END`). Comment should distinguish legacy explanation from current behavior.
- `validate.js:7` describes an 8% grade cap. Actual limits at lines 20–21 gate red at 15% and advise at 8%; the following detailed source comment already explains this fleet-based policy. `stamps.js:16` says the validator reds below the 15 m hairpin floor, while validator radius red is 9 m and 15 m is amber. Stamp minimum 15 m is intentional authoring policy, not the validator gate.
- `designer.js:7` says preview is never mid-drag. Canvas explicitly handles an earlier edit's scheduled preview landing mid-drag (`canvas.js:729–732`), retaining stale-road display after a moved drag. The stronger header statement should say a drag commits its edit on release.
- `insight.js:286–287` promises START FROM produces 60–120 points. The main trace only searches epsilon when above 120 and does not enforce a 60-point minimum; the alternative authored-path fallback does enforce 60–120. This is an upper-target heuristic, not a universal output invariant.
- `designer.js:1300` calls shareCode an APXT1 code and `:1414` describes only bare APXT1 imports. Actual codec emits/accepts APXT2 for props. The codec header already documents both versions.

#### `three`
- `tsl-sky.js:19` describes backgroundNode delivery; `tlx.js:1783–1829,5921–5932` installs and arms a late depth-tested far-plane triangle instead.
- `tlx-chunked.js:620–650` and `tlx.js:4109` describe zero-length views; implementations at chunk release and `releaseGeoMirrors` assign null. Later local comments acknowledge the reversal. The bounds/upload/gating restrictions remain significant.
- `tlx-post.js:7,767` says nearest twelve godray lamps; selection at :791 uses six, matching its immediately following explanation.
- `tlx.js:217` says the vendor carries two patches; its own later paths require patches 17/18 and the current vendor patch document enumerates many more. The nearby r185 data-engine label is historical and is not the installed vendor version.
- `tlx.js:858–879` says WebKit automatic selection is WebGL2 by construction, while `forceWebGL` at :431–433 allows automatic WebGPU and :420 onward explicitly documents that policy change.
- The narrative before `softContent` says the software verdict should avoid carrying an unused WebGPU adapter into WebGL2 classification; actual `softwareGL` at :988 is `_softAdapter || (live WebGL backend && detectSoftwareGL())`. The prose no longer states the expression that executes; this inspection does not establish which affected hardware exists.
- `tlx.js:1346,6306` says post reconstruction waits for target reallocation; `begin()` at :5822 and `_postRetryAt` at :6314 also permit a two-second delayed reconstruction without resize.
- `tlx.js:6378` describes three static-sweep gates including the env gate; the executed call at :6408 deliberately lets the opt-in bypass that gate. Mobile and mirror-use restrictions remain separate.

#### `shaders`
- `tsl-lit.js:6,1861` says a 32-lamp loop; the factory at :70 and loops use MAX_LIGHTS, with caller choosing LightBudget.LITE/MAX (16/48).
- `tsl-lit.js:240,601` describes fixed R=3 without a blocker. Executed fallback at :666–672 scales it by pcssPen/80; the header already explains the newer behavior.
- `tsl-lit.js:1141,1151` says step is absent from the TSL destructure; :83 includes step and the ripple helper uses it at :1799.
- `tsl-lit.js:1464` and `wgsl-chunks.js:1114` say carbon weave fades over 8–16 m; executed fade is `(distance - 10)/10`, meaning 10–20 m.
- `tsl-lit.js:1497` and `wgsl-chunks.js:1154` say carbon lacquer “min 0.42”; both implementations use min(clearcoat, .42), an upper cap rather than a floor.
- `tsl-lit.js:2610` says three shared graphs; :2648 allocates six, and the graph index at :2660 includes the base/fx dimension.
- `tsl-lit.js:997–1001` describes a hoisted material-array sample required by uniformity. The actual un-var'd texture samples at :1026 and :1060 are consumed inside live/fade branches, with :1024 explicitly describing lazy emission there. The older hoisting rationale contradicts the current graph construction; no generated shader was inspected here.
- `tsl-post.js:307` says nearest twelve godray lamps; GR_MAX_LIGHTS at :8 and march loop at :423 cap six. Its nearby :418 correctly says six.
- `wgsl-chunks.js:1514` describes 3×3 PCF; executed static sampling at :1579 onward is four Poisson taps plus four near taps.
- `wgsl-chunks.js:2235` calls the blocker r16float; its binding at :601 describes r32float and `wgx.js:1278` corroborates an unfilterable-float/r32float binding. The exact target allocation was not reread in this lane, so this is a conflicting comment pair, not independent format verification.
- `wgsl-post.js:253` says five .04 m contact steps reach approximately .32 m; the loop reaches .20 m along the supplied sunVS vector.
- `wgsl-post.js:1149` allows SSR consumption by “COMPOSITE or the LIT pass”; the actual LIT closing note at `wgsl-chunks.js:2077` explicitly forbids the previous-frame sample and composite reads ssrPostTex at `wgsl-post.js:743`. The same SSR comment's one-line 10%/.92 consumer example describes road only; composite also selects the .22/.88 car substitution.

#### `lighting-fx`
- `knobs.js:4` names `light-store.js`; the fully inspected profile owner is `js/lighting/profiles.js`. `tuner-panel.js:349,365` similarly names the old `light-presets.js`; current manifest path is `js/lighting/presets.js` and manifest rename map retains the old path. Update paths while retaining historical measurement context.
- `profiles.js:4–5,121,377–380` describes a quality-gated conditional layer / resolution through GfxQuality. The actual `condLayer` (122–145) uses only track/TOD and `G.gfx.hasPerChunkLights`; GfxQuality.set still calls reapply but is not the resolver gate. Describe capability resolution and distinguish the remaining hook from a quality-dependent layer.
- `frame-lights.js:493` says “Sort just those 32”; the heap length is CAP, derived from lampCull/device/backend/shed and can reach 48. Use “selected lamps” or CAP.
- `particles.js:44–46` says stationary rain stops re-uploading and does not dirty every falling step. The later rainUpdate explicitly forces dirty near 30 Hz (608–612); the current behavior is bounded refresh, not a frozen upload at rest.
- `visor-optics.js:21` claims ≤14 gradients per repaint. `_paint` can draw eight glints, each `_glow` creating two gradients when bloom is on, already 16 before sun, rim, haze, beams and stars. Replace the obsolete upper bound with a measured/current cost description or calculate a valid bound.
- `visor-optics.js:21,385` says “1 css px per device px”; `_size` uses window.innerWidth/innerHeight directly as canvas backing dimensions with no devicePixelRatio multiplier. Describe one backing pixel per CSS pixel.
- `atmosphere.js:577–578` says fogWxMul “has just TRIPLED” density; current default is 1.5 and the effective density is band-clamped at 559–568. This present-tense numeric description no longer matches the code. Retain history only if explicitly marked historical.

#### `circuit-defs`
- js/circuits/interlagos.js:16 says severity 0.92 is below Japan 0.85; js/circuits/suzuka.js:31 confirms 0.85. The inequality is reversed.
- js/circuits/hockenheim.js:16 describes 0.72 as below Monza 0.55; js/circuits/monza.js:17 confirms 0.55. Again, 0.72 is greater.
- The “No researched sectors — consumers fall back to thirds” comments in the 28 files listed below are stale as statements of current behavior: every one now explicitly supplies two sectors, and TrackDef.fromRaw:232 copies them rather than substituting thirds. Their adjacent comments correctly qualify them as snapped approximations, not FIA-published splits.
- The generic “curated FIA-aligned sector splits” header is overbroad for those same explicitly approximate sector rows. It does not establish FIA provenance.
- js/circuits/korea.js:22–24 copies a clockwise-circuit winding explanation while its own header (:2) explicitly says Korea runs anti-clockwise. reverse:false can remain intentional; the copied explanation is internally inconsistent.
- js/circuits/singapore.js:47–59 refers to “the comment above” and cityFront calls “below”; the definition contains no cityFront calls after the split to scenery/singapore.js. Similarly Montreal:23 and Qatar:25 refer to bespoke parkland/masts “below” which live in their scenery files. These are stale local-location pointers, not evidence that the scenery is absent.

#### `game-boot`
- game.js:2468 says asynchronous only to await scenery and all callers ignore result. Actual race body awaits multiple prerequisites and startRace explicitly retains rejecting promise for awaiting callers at 2770.
- Catch-up comment around 1001 contains duplicated and stranded fragments.
- Renderer selection comment at 44–48 requires RendererBoot body corroboration before correction.
- Extracted tuning declarations left confusing orphan commentary near 405–412; actual values are sourced through DriveTune.

#### `game-middle`
- The large bicycle introduction at 5222–5234 says position advances directly in track coordinates and world position is only a derived mirror. The actual human branch at 6174–6190 advances `px/pz` in world space and reads `s/x` back through `trackFrom`; its nearby comments state that world pose is truth. The introduction describes an earlier integration design.
- The PlayerForces bridge comment at 6152 calls the remaining writeback “Frenet world writeback (px/pz → s,x)”: the operation is world-to-track projection, rather than a write into world position. The code unambiguously updates world position first.

#### `game-tail`
- 7144–7157: per-chunk lamps described as experimental and shedding at tier 1; current expression scales at tier 1 and disables at tier 2, excluding preset floor.
- 9009–9017: completed qualifying BACK described as hidden; current code makes it MENU with leave handling and friend confirmation.
- 9339–9345: gears described as tilt-only; actual disabled condition restricts touch non-tilt while desktop keyboard remains eligible.
