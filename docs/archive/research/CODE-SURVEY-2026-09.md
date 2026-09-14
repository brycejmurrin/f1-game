# Code survey — dead code, bugs, performance (2026-09)

Whole-tree survey run by the `code-survey` workflow (`.claude/workflows/code-survey.js`,
run `wf_6e796843-7e4`). **125 agents, 0 errors, 3 rounds, 2 h 10 m wall clock, 15.7 M
subagent tokens.** 68 findings confirmed after adversarial verification:
39 bug, 22 dead-code, 7 perf; 2 high, 26 medium, 40 low.

Findings per round: 44 / 12 / 12 — the loop never went dry inside its 3-round cap,
so a fourth round would likely still have yielded. §Coverage says where to point it.

Method: 3 haiku recon agents run the static checkers and hand every finder the real
global-reference graph → 29 model-tiered scope finders (haiku on data-shaped scopes,
sonnet on domains, opus on game.js/physics/renderers/net/audio) → two
perspective-diverse sonnet skeptics per batch (REACHABILITY, INTENT) with an opus
tiebreak on high-severity splits; high needs two refutes to die, medium/low dies on
one → opus completeness critic drives the gap rounds → opus perf triage → opus
synthesis. Machine-readable findings: `raw/2026-09-code-survey.json`.

§Frame budget defers to the performance triage, reproduced in full as Appendix A.

---

# Whole-tree survey — synthesis (68 confirmed findings)

## Verdict

This tree is healthy in the places that carry the game and frayed in the places that shadow it. `js/game.js` — the 8.5k-line file everyone expects to be the problem — produced six findings in 68, and its extracted-module seam (`Module.create(G)`, 36 modules, 242 members) came back mechanically clean under `check-gctx.mjs`. The rot instead concentrates in the **renderer ports**: WGX and TLX account for 17 findings, and eleven of those are one shape — shader math that drifted away from the GLSL source of truth during the port (missing overcast damping, wrong noise family, a dropped `pow()` epsilon, an early-out that never landed, a modulation scoped into the wrong `if`). The default backend players actually run, GLX, is the cleanest large subsystem in the tree; five separate finders read its shaders in full and found nothing worth reporting. The dominant problem is neither dead weight nor frame budget: all 22 dead-code findings are "low" and tiny (write-only locals, orphaned exports, one duplicate object key), and the perf pass found no allocation storm — the loops are pooled, the caches are real. What it is, is **defects that hide behind correct-sounding comments**: at least six findings are code whose own comment describes behaviour the code does not have (`gfxBackendWas` "so RESET RENDERER can offer it back", the music resume-offset that `stopInternal` erases first, `gfx.js`'s "there is deliberately NO `lampShadowKeep`" beside three implementations of it, `ALT_INSIDE`'s three-line rationale over an empty object, `params4.z`'s "carReflect needs no such gate"). The two highest-severity findings are both player-facing and both in shipped defaults: the cockpit camera — `CAM_MODES[3]`, the default — `continue`s past the entire particle-FX emitter block, so the player car emits no tyre smoke, sparks, gravel or spray, and it is the *second* instance of the exact `continue`-before-FX trap the code already fixed once for skid stamps; and an unvalidated peer `d.at` on `EV.START` wedges a VS FRIEND guest on the grid forever, two lines below a `d.hold` that is carefully clamped.

## Fix now

Every finding here is kind `bug` (dead-code → §3, perf → §4), so grouping is by severity band. Lines marked `[non-js]` are tools/tests/docs/types and get no deploy rewrite; every `js/` and `css/` line ships with `?v=dev` untouched — **no cache bump** (AGENTS.md §Critical conventions).

**High — commit first**

- `js/game.js:6957` — cockpit view (the shipped default camera) `continue`s before the transient-FX block, so the player emits no tyre smoke, sparks, kickup or spray → move the emitter block above the `if (c.isPlayer && cockpitRigOnly) … continue;`, as was already done for `skids.stamp`.
- `js/net/netplay.js:359` — peer-supplied `d.at` on `EV.START` is unvalidated; NaN or absurd values wedge the guest on the grid permanently → coerce and bound `at` like `hold` already is (`Number.isFinite` + a few-seconds sanity window) before `armStart`.

**Medium**

- `js/game.js:7082` — `_hazeStr` is only assigned inside the block cockpit view skips, so exhaust haze freezes at its last external-camera value and warps a fixed world point forever → reset `_hazeStr = 0` before the car loop each frame.
- `js/game.js:3027` — `drivingLineApi` caches `vTop()` keyed on the track object only, so moving OVERALL SPEED leaves the racing line and the brake beep on the old pace → refresh `vTop`/`grip` every call and add `vTop` to `DrivingLine`'s cache key.
- `js/game.js:3177` — `quitToMenu()` hides `#announce` but never clears `announceT`/`_annPri`/`_annQueue`, so a queued race banner repaints over the title screen → clear all three beside the hide (and in `endRace`).
- `js/ui/hud.js:868` — a non-finite ghost `s` returns out of `drawMinimap` entirely, killing the player's own white marker → guard only the ghost fill, not the whole function.
- `js/physics/brake-cue.js:60` — lookahead clamped to a bare 120 m written on the PACE-1 scale, so above PACE 1 the cue fires long after the braking point (and the top slider notches are indistinguishable even at PACE 1) → scale the clamp bounds by the speed envelope via a cfg-supplied pace factor.
- `js/render/glx/post.js:967` — under spatial upscale the headless soft-present reads a render-size FBO with present-size dimensions, so captured overlays are the scene in a corner of black → set `_softReadFB = null` on the upscale path, or give `softBlit` the post chain's real read-buffer size. (This one corrupts the container's own evidence channel — fix it before trusting a soft-present capture.)
- `js/render/webgpu/wgx.js:4238` — a failed `envInit()` latches the flag and then dereferences the now-null `envFaceViews` in the same call, throwing out of the render loop with `frame` permanently rewritten to the probe camera → return null immediately when `_envInitFailed || !envFaceViews`.
- `js/render/three/tlx.js:2937` — the WebGPU path hands the post chain `inv(Z01·P)` while `tsl-post` still applies the GL `d*2-1` remap, reconstructing every SSAO/SSR position at ~half depth → leave `_postF.invProj = frame.invProj`, matching the sibling `invVP`.
- `js/render/three/tlx.js:2116` — TLX never clamps the drawing buffer to `maxTextureDimension2D`, the exact overflow WGX fixed and whose comment names TLX as unpatched → mirror WGX's uniform `k = min(maxDim/pw, maxDim/ph)` clamp.
- `js/render/three/tsl-fx.js:212` — the shared decal node graph bakes the first non-zero `glow` it is built with, so garage-then-night-race lifts car decals by 0.62 instead of 0.35 → make `glow` a per-draw `uniform()` in `decalMaterialFor`.
- `js/net/session.js:61` — the 8-entry ping window is only 800 ms wide pre-sync, so any link above ~800 ms RTT rejects every PONG and never syncs ("connected, no rival") → age `sentPings` by time (`MAX_PLAUSIBLE_RTT_MS`) instead of count.
- `js/audio/engine.js:2044` — `stopInternal()` clears the resume state before the tab-return path can use it, so the resume-offset never applies on the path it was written for → capture the offset in `onVisibility` before `stopMusic()`.
- `js/audio/engine.js:1389` — turning SFX off mid-race strands the rev-keyed music duck, leaving music up to 25 % quieter for the rest of the race → release the duck in `setSfxEnabled` the way `stopEngine` does.
- `js/agent/agentview.js:1899` — `rollout({input})` without a policy never restores `G._testInput`, so the live loop keeps applying the rollout's constant input after it returns → make the restore unconditional.
- `css/tuner.css:901` — three narrow/compact `#pc-toggle` overrides sit in `@layer components` under an unconditional `hud.css` rule, so layer order defeats them regardless of specificity → move the base rule into `components` (or the overrides into `hud`). Also covers `tuner.css:612` and `:704-707`.
- **One commit, WGSL/TSL parity against the GLSL source of truth** — `js/render/webgpu/wgsl-chunks.js:1050` repair-patch roughness is scoped inside `if (iriSurface)`, so WGX tarmac loses the ±0.08 gloss variation → hoist it to top level under `detail > 0.0`; `:1528` ground mist samples 4-octave `fbm` instead of the 2-octave `cloudFBM` GLX/TLX use → swap the call; `:1854` `coronaDamp` drops the overcast factor, so WGX paints a full-brightness sun disc through a solid overcast lid → `(1.0 - overcast*0.92) * (1.0 - nightSky)`; `:1901` the city-skyglow cloud-belly pickup term is absent entirely → port the two lines from `glsl-sky.js:415-417`; `js/render/webgpu/wgsl-post.js:614` and `js/render/three/tsl-post.js:779` floor the contrast `pow` base at 0.0 instead of 1e-6, re-opening the documented `pow(0,n)` mobile NaN on every black pixel → restore the epsilon in both.

**Low**

- `js/game.js:7042` — the amber mirror-lamp gate applies `vStd()` to the constant, inverting the PACE scaling (the lint only flags speed-vs-literal, so it passes) → `vStd(c.speed) < 5.56`.
- `js/game.js:8203` — a camera-picker hide statement was swallowed into a trailing `//` comment, so the picker's open state survives a HUD hide → put it back on its own line.
- `js/audio/engine.js:1358` — `rebuildCtx()` never resets `overrunT`, so after an iOS rebuild the overrun layer is silent and cannot self-heal → add `overrunT = 0; pullT = 0;` to the reset block.
- `js/audio/spotify.js:861` — `check()`'s `/me` is the one Spotify fetch with no AbortController, against the module's own stated rule → route it through `api("/me")`.
- `js/circuits/scenery/cota.js:497` — a `return` inside `for (const side of [-1,1])` exits the whole `along()` callback, silently skipping the opposite side's lamp post → `continue`.
- `js/render/webgpu/wgsl-chunks.js:1808` — the WGSL cloud-thickness FBM drops the `evo` time-warp, so cloud shape never evolves on WGX → declare `evo = cT * 0.00035` and use it. (Fold into the parity commit above.)
- `js/render/webgpu/wgsl-post.js:1311` — SSR normalizes a possibly-degenerate cross product unguarded; a NaN normal silently disables the self-hit reject → use GLSL's length-guarded form. (Same commit.)
- `js/render/gfx.js:88` `[doc-in-js]` — the seam contract says there is "deliberately NO `lampShadowKeep`" while all three backends implement it and the shared pass calls it every frame → replace the paragraph with the real contract.
- `tools/manifest.cjs:667` `[non-js]` — four MOVED entries point at a doubled `docs/archive/docs/archive/...` path that does not exist → single-prefix all four (also `:669`, `:702`, `:707`).
- `types/game-ctx.d.ts:524` `[non-js]` — `announce` is declared with two params; the real function takes a third `kind` that `js/ui/onboard.js:54` passes → add `kind?: string`.
- `types/game-ctx.d.ts:278` `[non-js]` — `ReliabilityLevel` documents `"normal" | "high"`, which do not exist, and omits `"real"` → rewrite to `"off" | "low" | "real"`.
- `types/game-ctx.d.ts:237` `[non-js]` — `GameEls` omits `hudLimits` (read at ten sites in `hud.js`) with no index signature to cover it → add it, plus `lighting`/`camtune`.

**Verification.** `tools/manifest.cjs` and `types/game-ctx.d.ts` are proved by `npm run test:tooling-fast` alone (the types leg runs `node tools/check/check-gctx.mjs`). The `js/game.js`, `js/ui/hud.js`, `js/physics/brake-cue.js` and `css/` edits: run `node tools/ci/pick-tests.mjs` and take the two most specific browser groups it names, naming the rest not-run in the PR; `tests/specs/physics-characterization.spec.js` is the master gate for the brake-cue and game.js physics-adjacent lines. `js/circuits/scenery/cota.js` → `node tools/track/verify-track.cjs cota`. Every renderer edit (GLX post, WGX, TLX, and all six shader-parity lines) needs the path-scoped boot-evidence check in `.claude/rules/render-wgx.md` / `render-tlx.md` — a unit test is not evidence the backend runs — and any claim about a real GPU needs `gpu-census.yml` dispatched on `macos-latest`, not a software probe.

## Delete

All 22 dead-code findings, batched one commit per subsystem. `npm run test:guards` gates **every** batch (the commit hook runs it). Additional guards noted per batch.

**1. WGX write-only state** — `wgx.js:3397` FrameU lanes `params4.z`/`.w` packed every frame and every probe face with no shader reader (drop the writes and the misleading "carReflect needs no such gate" rationale at 3389-3391); `wgx.js:1088` `_envStr` declared, never assigned or read; `wgx.js:1119` `matPlaceView` declared, never used (the live ones are `matPlaceAlbedoView`/`matPlaceNormalView`); `wgx.js:2142` `_softBlitGen = seq` is a dead write whose only reader sits on a branch that can never see a non-zero value. → also `node tools/check/ratchets.mjs --update` (wgx.js is a ratcheted big module), and the WGX boot-evidence check, since these lines sit in the per-frame writer.

**2. TLX write-only state** — `tlx.js:3580` `backendState()` declares `gpuErrFrames` twice in one literal, the first key dead (note `node tools/check/dup-keys.mjs` does **not** catch it — worth a follow-up on the guard itself); `tlx.js:1467` `poolUsed` incremented per acquired mesh every frame, reset in four places, read nowhere (`gfx-backend-canary` only asserts it is *not* used as an index). → `ratchets.mjs --update`; TLX boot evidence.

**3. GLX post/seam** — `glx/post.js:970` the `else if (toLdr)` arm is unreachable by construction (`toLdr` requires `useFxaa || useUpscale`, the arm requires neither) → fold into the final `else`; `glx.js:2335` `opts.str` on `drawDrivingLine` is supplied by no producer, so `uStr` is a hard-coded 1.6 in all three backends → drop the opt from GLX/WGX/TLX and correct the `gfx.js:111` contract line to the opts actually sent (`{speed, cornersOnly, palette, opacity}`). → touches all three backends: `tests/unit/backend-surface-parity.test.mjs` and `tests/unit/driving-line.test.mjs` are the cheap gates, plus boot evidence per backend.

**4. Audio** — `engine.js:340` `currentUrl` assigned in four places, read nowhere; `engine.js:2034` `src.loop = PLAYLIST.length < 2` is structurally always false (five builtins, and only `user:`-prefixed ids can be removed); `spotify.js:700` `cycleRepeat` exported and called from nowhere since the word-button repeat control became a SettingRow. → `node tools/check/scan-globals.mjs --check` (the `spotify.js` export surface changes).

**5. Net** — `nostr.js:5` + `:444` `APP_ID`, a leftover of the deleted Trystero `joinRoom` path; `lobby.js:39` `codeEntry` resolves `#vs-code-entry` on every `els()` call and is never read (the element is styled but never toggled). → `scan-globals.mjs --check` for the `nostr.js` return-object change.

**6. Car / livery** — `liverytex.js:3118-3127` trim the ~26 exported names with zero external readers (`MARK_FLOOR`, `numCrestBox`, `drawLogoImage`, `sunColour`, `FLANK_*`, `CRESTS`, `coverBindOf`, … — keep `drawCrest`, which `tools/car/crest-sweep.mjs` uses); `liverytex.js:346` `GAP_MIN` and `:112` `INK_FLOOR` computed and exported, referenced only by comments explaining that *other* floors are used instead; `car-mesh.js:559` the 7-segment `SEG7` table and its layout array are defined byte-identically twice (`getGearDigit` and `getSpeedDigit`) → hoist one shared table. → `scan-globals.mjs --check` (export surface) and `ratchets.mjs --update` (liverytex.js is large); `tests/unit/crest-marks.test.mjs` and `cover-legibility.test.mjs` are the relevant unit gates, both inside `test:tooling-fast`.

**7. Entry + settings contracts** — `game.js:265` `apex26.gfxBackendWas` is written with a comment promising RESET RENDERER can offer the pick back; nothing reads it (the only other hits are the *clear* list and a test asserting it is cleared) → delete the write and the comment, or implement the offer in `renderer-picker.js`; `js/race/race-settings.js:22` `getWxArcPlan` is destructured out of the hooks bag game.js never supplies — a permanently-undefined binding no parity gate covers (`check-gctx.mjs` only checks `X.create(G)` modules). → `ratchets.mjs --update` if game.js shrinks.

**8. Data / track / shared** — `js/data/api.js:406` `lastRace()`/`lastRaceOf()` build a full last-GP classification with no production caller since the LAST RACE tab was removed (RESULTS uses `sessionResult()`); delete both plus the export **and** the `docs/ARCHITECTURE.md:979` entry that still documents it. `js/track/tracks.js:2119` + `:2133` the `concrete` palette colour, threaded through both default palettes and explicitly overridden in five circuits (`abudhabi`, `jeddah`, `monaco`, `qatar`, `bahrain`), is read nowhere and reachable by no dynamic key walk → drop the field and the five overrides. `js/render/shared/gltf.js:267` the `swapYZ` option and the triangle-rewind/normal-swap code it gates is never passed truthy by either call site → delete the option and its branch. → this batch touches `js/circuits/*.js`, so `node tools/track/verify-track.cjs abudhabi` (and `jeddah`, `monaco`, `qatar`, `bahrain`) before the guards; `tests/specs/data-lifecycle.spec.js` and `telemetry-compare.spec.js` stub `lastRace` pre-emptively and will need their stubs trimmed with it.

## Frame budget

There is no frame-budget crisis here, and the honest headline is that the survey looked hard for one and did not find it. The per-frame paths are pooled where it matters — `vantage.js` writes into `_vantP`/`_vantEyeW`/`_aheadOut`, `ai-drive.js` takes pooled ctx bags, `mesh.js`'s per-frame entries all take an `out`, and `wgx.js` already pooled away its option-bag churn. The two-stage `PerfGov` ladder (resolution scale, then feature tiers) genuinely gates the post stack, SSR, lamp shadows and the env probe, and the env-cube probe's `(_frameNo & 3) === 0 && tier() < 1` gate means `begin()` runs about twice a frame in a race, not the eight the worst case suggests — which deflates two of the seven findings before anyone touches them. The codebase also prices its own uniform-hygiene class at "~0.05 ms — hygiene, not a GPU win" (`glx.js:227-236`), and two findings sit inside that yardstick.

The real story is **asymmetry, not waste**: `js/fx/particles.js` reads *nothing* from the governor, so a device already stripped to tier 4 — bloom, SSAO, god-rays, lamp shadows and SSR all shed — still pays full rain every frame on the default GLX path. That is the only finding in the set that lands on every device on the shipping backend, and the file's own comment already calls it the wrong shape. Second: the largest *time* cost in the seven is not the player's, it is the maintainer's — 19 full page boots in one spec inside a real CI gate group, in a repo where a browser group costs 10-40 minutes of serialized SwiftShader.

All seven perf findings are accounted for by the dedicated triage above; do not re-rank them. Take them in its order: **free** — `tsl-post.js:724` sun-shaft outer early-out (one line, bit-identical output, best ms-per-line in the set, TLX-only); **worth doing** — `particles.js:239` rain (drop the backing-store resolution at high shed, not just the drop count; visual-only, no physics gate, cheapest verification story here), `tests/specs/menu-keyboard.spec.js:63` (convert the pure DOM/keyboard tests to `sharedTest`, leave the five race-entering ones on plain `test` — the naive conversion the finding proposes will assert menu state against a live race), `glx.js:2268` polygon-offset thrash (prefer the value cache on `setPolyOffset`, matching `setBlend`/`setDepthMask`, and make `resetDrawState` invalidate it — it also fixes `drawMark`); **drive-by** — `wgx.js:5358` `for...of` → indexed loop, copied from the GLX twin, not worth its own boot-evidence run; **gated on profiling** — `wgx.js:1950` string pipeline key, where the repo already shipped a bug re-doing this with a packed int, so take a `profile-gameloop.mjs` flame chart of a WGX Monza frame first and close it out if minor GC is not visible; **leave it** — `glx.js:1296` unconditional material-map bind, where the proposed cross-pass texture-unit cache risks silently sampling the wrong array for a sub-0.05 ms gain.

## Defer

- `js/track/scenery/nature.js:307` (bug, medium) — `broadleafFall`'s clearance guard, its `ctx.note` bbox and `canopyR`'s estimate all omit the lobe's radial offset (`rr = h*0.16*spread`), understating the real canopy reach by a third; the fix is correct but widening the radius in all three places moves trees on every circuit that plants them, so it needs a `verify-track` sweep across the affected circuits plus a rendered check — not a cheap commit, and nothing currently clips visibly enough to have been reported.
- `js/car/liverytex.js:501` (bug, medium) — `ALT_INSIDE` is a documented-but-empty table, so `markPalette`'s alt-inside scoring branch and two `crest-marks.test.mjs` assertions never run for any team. The finding proves the branch is dead; it does not prove the current Cadillac output is wrong (the comment says the grey ramp "answered"). Adding `cadillac: true` changes a shipped livery, so this wants a livery render and a product call, not a blind commit.
- `js/circuits/scenery/vegas.js:223` (bug, low) — the skyscraper beacon takes `[3.2, 0.4, 0.3]` as a colour, shaped and scaled like the size triples on neighbouring lines and far outside the [0, 1.4] range every other emissive in the corpus uses. Almost certainly a paste error, but the *correct* value is a visual judgement; defer to whoever next dresses Vegas at night.
- `js/audio/engine.js:273` (bug, low) — `queueDying`'s single 450 ms timeout flushes the whole `_dying` array, cutting a second batch's 0.35 s fade to 50 ms. Real, but it needs per-batch capture semantics and only bites on a fast pause/resume/pause or a sample-upgrade restart; audibly it is one clipped tail.

## Coverage and blind spots

**Surveyed in full, line by line:** all of `js/game.js` (split across two finders, 1-4349 and 4300-8522); all of `js/physics/`, `js/net/` (12 files, 5639 lines), `js/audio/` (5 files), `js/track/core/` + `tracks.js`, `js/track/scenery/` (10 files), `js/render/shared/` (8 files, 1938 lines), `js/render/glx/` (5 JS files) and all four GLSL shader files; all of `js/render/webgpu/` (4 files, ~10k lines) and `js/render/three/` (9 files, ~8.7k lines); all 40 circuit data files and all 40 circuit scenery files; `js/data/`, `js/lighting/` (including a programmatic validation of all 805 presets against 183 knob ids), `js/career/` + `js/garage/`, `js/race/` + `js/core/`, `js/input/` + `js/perf/` + `js/camera/` + `js/fx/`, both `js/ui/` halves (22 files), `js/agent/` (3 files, 5956 lines), `types/game-ctx.d.ts`, `index.html`, `sw.js`, all 11 CSS files (11k lines), all 21 `tests/helpers/`, and `tools/ci/` in full.

**What the round-2 and round-3 critics added** (28 of the 68, and disproportionately the severe ones): the cross-backend parity pass produced the TLX `maxTextureDimension2D` gap and the `gfx.js` contract lie; the frame-budget pass produced the cockpit-FX high; the `G`-contract pass produced the three `types/` drifts that `check-gctx.mjs` structurally cannot see (call arity, `els.<prop>` walks, prose enums); the round-3 full-shader read produced all eight WGSL/TSL parity bugs, which no round-1 finder claimed to have checked. Several round-3 passes returned **zero** findings and said so honestly — determinism/RNG, boot cost, untrusted-input handling, reachability of screens and settings, `tests/unit`, resource lifetime across boot→race→garage→quit (every per-track allocation traced to a matching free on both deferred backends), and duplicate-logic drift (the two `mulberry32`s are byte-identical; the hex↔RGB pair is mathematically identical over the inputs its callers pass).

**Admitted partial reads.** `js/car/car3d.js` (4136) and `js/car/liverytex.js` (3129) were read in full only on the second pass, and their geometry/colour tuning constants were never validated against a render. `tools/` is the weakest surface: `tools/check/` was read in full across two finders, but `tools/car`, `tools/gfx`, `tools/shot`, `tools/mcp`, `tools/ui`, `tools/lighting`, `tools/net`, `tools/lib` (~100 files) got only a mechanical consumer-existence sweep and a path-literal grep — no per-file bug reading. In `tests/unit` (232 files, ~58.5k lines) roughly 20 small files were read in full plus a large slice of `gfx-backend-canary`; the other ~210 were covered only by signature greps (duplicate titles, `.skip`/`.only`, empty catches, tautological asserts, import-path resolution). In `tests/specs` (116 files) only a handful were read in full; the rest were read at structure level for the per-test-boot pattern, since game-semantics assertions were explicitly out of scope. `js/lighting/presets.js` (17,317 lines) was validated programmatically, not read.

**Genuinely unsurveyed.** The vendored three.js island (out of scope by rule). Anything requiring runtime or GPU evidence: nothing in this report was observed in a browser — the TLX `invProj` finding is proven arithmetically in node, the `broadleafFall` geometry by hand, and every shader-parity claim by source diff against GLSL. Claims resting on what a backend *packs* into a uniform slot were deliberately not reported when the JS uploader was out of the reader's scope (e.g. WGSL's `ShadowU.size.zw` blob constants). A localStorage-parsing sweep across the ~20 files that touch it directly, and colour-space code in garage/liverytex beyond the hex pair, were both scoped out. Three known issues were deliberately not re-reported and remain open in the docs: TLX's sky-first `backgroundNode` full-screen overdraw (recorded as confirmed and left unlanded pending a real-GPU A/B), per-peer reliability/AI divergence in VS FRIEND (acknowledged in `results-sheet.js` and `lobby.js`), and the double AI-mistake roll at a turn 1 within ~1.2 s of the start line.

**Cheapest next run.** Point it at `tools/` bodies (the one directory with a real read deficit), at `tests/specs` semantics (explicitly excluded twice now), and at a live-GPU pass that can actually settle the eight shader-parity findings and the TLX overdraw question — this read-only surface has exhausted what static reading can prove about the renderers.

---

# Appendix A — performance triage

## Performance triage — 7 findings ranked by impact-per-unit-effort

Context I verified before ranking (it moves three of these):

- **Per-frame budget.** `js/game.js:7461` `tick` → `tickBody` → `render()` → `gfx.present()`; `PerfGov.tick(ms)` drives a two-stage ladder (resolution scale, then feature tiers). The env-cube probe is gated at `js/game.js:6725` on `(_frameNo & 3) === 0` **and** `PerfGov.tier() < 1`, so `begin()` typically runs ~2×/frame in a race, not the 8 the worst case implies.
- **What already adapts.** `PerfGov.tier()/autoTier()/autoShed()` gate the post stack, SSR, lamp shadows and the env probe. `js/fx/particles.js` reads **none** of them — the only consumer of the governor outside `js/game.js`'s `render()` is nothing. That asymmetry is the single biggest real finding here.
- **What the codebase already prices.** `glx.js:227-236` puts the whole per-`begin()` uniform-hygiene class at "**~0.05 ms — hygiene, not a GPU win**." That is the repo's own measured yardstick, and findings 1 and 2 sit inside it.

---

### Free wins

**1. `js/render/three/tsl-post.js:724` — missing sun-shaft outer early-out (finding 7)**

- **Impact: high (on TLX).** Confirmed the parity gap is real: `js/render/glx/shaders/glsl-post.js:1144` guards with `if (dist > 0.005 && dist * (2.6 / uShaftSpread) < 1.0)`, `js/render/webgpu/wgsl-post.js:814` carries the identical guard with `max(shaftSpread, 1e-3)`. TSL has only the `dist > 0.005` half. The radial term at `tsl-post.js:739` is `clamp(...).oneMinus()` squared — an **exact** 0.0 past the reach, so the 8 dependent bloom taps on the majority of a sunlit full-res frame are multiplied away. That is a per-pixel, full-resolution, bandwidth-bound cost — by far the largest number in this list.
- **Effort: one line.** Add `.and(dist.mul(float(2.6).div(max(C.shaftSpread, 1e-3))).lessThan(1.0))` to the `If` at 724. Note the existing code *already* divides by `C.shaftSpread` unguarded at 739, so adding `max(..., 1e-3)` in the guard introduces no new expression class.
- **Risk: none to behaviour.** The skipped work is multiplied by a literal zero; the output is bit-identical. It is still a renderer edit, so it needs the TLX boot-evidence check in `.claude/rules/render-tlx.md` — the change is free, the *verification* is the cost.
- **Discount:** TLX is opt-in (`apex26.gfxBackend === "three"`, injected from `ApexRoster.DEFERRED`), so the affected population is small. Within that population it is the best ms-per-line in the set.

---

### Worth doing

**2. `js/fx/particles.js:239` — rain survives the whole governor ladder (finding 5)**

- **Impact: medium-high, and it lands on exactly the wrong devices.** This is the only finding that hits the **default GLX path on every device**. Confirmed: `rainDraw` is called from `js/game.js:7442` gated only on `isWetRoad() && Particles.rainActive()` — no `PerfGov` read anywhere in `js/fx/particles.js`. A device the governor has already stripped to tier 4 (bloom, SSAO, god-rays, lamp shadows, SSR all shed) is still paying full rain.
- **One correction to the finding, and it changes the fix.** It is *not* ~500 `stroke()` calls — `rainDraw` issues one `beginPath()`, 500 `moveTo`/`lineTo` pairs, and **one** `stroke()` (particles.js:275-284). So the per-drop CPU is modest. The count-independent costs dominate: a full-viewport `clearRect` plus handing the compositor a second full-screen RGBA layer to blend over `#game` **every frame** (~8 MB at 1920×1080). Scaling `rainCount` by `autoShed()` therefore buys less than the finding implies — the honest shed is to **drop the backing-store resolution** (`_rainCanvas.width/height` are set to `innerWidth/innerHeight` at particles.js:222-223; halving them at high shed is a real bandwidth win and CSS already stretches the element to 100%) and/or skip the overlay entirely at the top rung.
- **Effort: local refactor, not one line.** `rainSeed` runs only on weather change (`js/game.js:370`), so a governor gate needs a re-seed or a per-frame draw-side gate; `rainDraw`'s resize branch already remaps drops proportionally, so a resolution change has a landing spot.
- **Risk: visual only, no physics.** `rainDraw` is explicitly render-only ("reads the handed-in speed, never writes physics state"), so no characterization gate. It is not a renderer-backend edit either — it is a 2D canvas overlay, so no boot-evidence check. Cheapest verification story of any finding here.
- The comment at particles.js:229-238 already documents this as a known wrong shape, so shipping the fix closes a gap the code itself is waiting on.

**3. `tests/specs/menu-keyboard.spec.js:63` — 19 full page boots (finding 6)**

- **Impact: high on iteration, zero on players.** In a repo where AGENTS.md prices one browser group at 10-40 minutes of serialized SwiftShader, 19 boots × BOOT_MS is a straight multi-minute cut off a real CI gate group, repaid on every run forever. `fixtures.js:304-329` documents the same conversion measuring ~40 of 43 minutes on a comparable file.
- **Effort: a local refactor, NOT the one-line import the finding claims.** Five tests enter a live race (`__apex.race("monza")` at lines 283, 319, 419, 524, plus `park`/`jump` follow-ups) and two mutate UI scale (190, 213). `sharedTest`'s reset is documented as deliberately shallow — "held input, headless mode, the frozen flag, open dialogs, log level" — and explicitly does **not** rewind settings or race state. Convert naively and the first menu test after a racing test asserts against a live race.
- **Risk: flake, not product behaviour.** Contained: `npm run test:tooling-fast` plus one run of that group proves it. The safe shape is to convert the pure DOM/keyboard tests and leave the race-entering ones on plain `test`, or add an explicit menu-return in each.

**4. `js/render/glx/glx.js:2268` — per-blob polygon-offset thrash (finding 2)**

- **Impact: low but real and on the default backend.** Confirmed `setPolyOffset` (glx.js:350-358) has no cache while its neighbours `setBlend`/`setDepthMask` do, and `flushBlobs` (shadow-pass.js:142-145, called once per frame from `js/game.js:7184`) drives ~20 calls → ~80 `enable`/`polygonOffset`/`disable` plus 20 `uniform2f` of literal constants. Honestly that is ~0.05-0.1 ms of WebGL call validation — the same order the file's own note prices as "hygiene, not a GPU win." It is on the *shipping* renderer, which is why it outranks the WGX items.
- **Effort: small and localised.** Prefer the **value cache on `setPolyOffset`** over the begin/end hoist the finding suggests: it is the shape the file already uses twice, it needs no new API through `gfx.js`, and it also fixes `drawMark` (glx.js:2274-2288), which has the identical pattern.
- **Risk: low, but not nil.** A stale offset cache means z-fighting between blob shadows/decals and the coplanar road. `resetDrawState` (glx.js:359+) resets `polygonOffset` directly and must invalidate the cache. Renderer edit → boot-evidence check.

**5. `js/render/webgpu/wgx.js:5358` — `for...of` over a plain Array in `cullInstances` (finding 3)**

- **Impact: near zero.** Confirmed the GLX twin at glx.js:2043-2046 uses the indexed loop, and the shadow path does bypass both caches (5321/5322/5347), so it runs every frame per batch. But the allocation is **one iterator per cell**, amortised over every instance in that cell — and each instance already does a 16-float copy. V8 routinely escape-analyses array iterators in optimised code. Do not expect a measurable delta.
- **Effort: one line**, copied verbatim from the GLX twin.
- **Risk: none.** Identical iteration order and semantics; it is a parity edit that makes two twinned functions read the same.
- Take it as a drive-by the next time anyone is in `wgx.js` — not worth its own boot-evidence run.

---

### Only if profiling confirms

**6. `js/render/webgpu/wgx.js:1950` — string pipeline key per draw (finding 4)**

- **Impact: low, and the measurement to justify it does not exist yet.** The claim's own numbers are right (~320 draws/frame per the note at wgx.js:3741-3745, `litPipelineStats` saturating at 9 variants), but 320 short-string concats + Map hashes is roughly 0.05 ms/frame of CPU plus young-gen churn the scavenger handles cheaply. It is also WGX-only (opt-in).
- **Effort: moderate**, and it has a **recorded prior failure**. The comment directly above the key at wgx.js:1946-1948 says a packed-int key was already tried and **shipped a bug**: "the packed-int key truncated the bias with `|0` and gave `(bias + 32)` an 8-bit lane, so any `|bias| >= 32` wrapped into its neighbour's lane and two biases could share one pipeline." Re-doing this is re-entering ground the repo already lost once.
- **Risk: real.** A key collision silently hands a draw the wrong blend/bias/sample-count pipeline — a rendering defect that unit tests will not catch. The nested-Map variant the finding suggests does avoid the recorded bug class, but it is a bigger diff than the payoff justifies.
- **Gate it:** take a GC/CPU profile of a WGX Monza race frame first (`profile-gameloop.mjs` per the `playwright-probe` skill). If minor GC is not visible in the flame chart, close this out.

---

### Not worth it

**7. `js/render/glx/glx.js:1296` — unconditional material-map bind + `uMatTexScale` upload (finding 1)**

- **Impact: effectively zero, and lower than the finding assumes.** The claim leans on "begin() runs several times per game frame … six env-cube faces, the shadow pass, the main camera," but the env probe is gated at `js/game.js:6725` on `(_frameNo & 3) === 0` **and** `PerfGov.tier() < 1` — so on a struggling mid-range machine (the population this triage is about) the probe is *off* and `begin()` runs about twice. The redundant work is then ~4 texture binds and 2 × `uniform1fv` of 17 floats per frame. The file itself prices this whole class at ~0.05 ms and calls it hygiene.
- **Risk exceeds the gain.** The proposed fix caches *texture unit bindings* across passes on a generation counter. Unit 10/11 bindings are program/context state that a relink, a context loss (`ctxGone()`), a pack swap, or any future pass touching those units invalidates — and the failure mode is silent: the wrong array, or the dummy grey, sampled across every grass/rock/wall layer. The existing code already carries a careful non-obvious invariant here (the neutral 128-grey dummy for a normal-less pack, glx.js:1288-1292), and the redundancy cache would sit on top of it.
- Leave it. If a future change makes `begin()` genuinely run 8× per frame in a race, revisit — but then fix the cadence, not the bind.

---

**Files referenced:** `/home/user/f1-game/js/render/three/tsl-post.js`, `/home/user/f1-game/js/fx/particles.js`, `/home/user/f1-game/js/render/glx/glx.js`, `/home/user/f1-game/js/render/glx/shaders/glsl-post.js`, `/home/user/f1-game/js/render/webgpu/wgx.js`, `/home/user/f1-game/js/render/webgpu/wgsl-post.js`, `/home/user/f1-game/js/render/shared/shadow-pass.js`, `/home/user/f1-game/js/perf/governor.js`, `/home/user/f1-game/js/game.js`, `/home/user/f1-game/tests/specs/menu-keyboard.spec.js`, `/home/user/f1-game/tests/helpers/fixtures.js`
