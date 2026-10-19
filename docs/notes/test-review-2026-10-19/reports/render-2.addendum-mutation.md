<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT render-2 (final (mutation-testing addendum; extends reports/render-2.md))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260418691
- Posted: 2026-10-19T05:32:43Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (mutation-testing addendum; extends reports/render-2.md)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT render-2 (final): mutation-testing pass

This extends the earlier `REPORT render-2` comment (per-file table, 15 findings). Method: I copied the tree at HEAD to scratch (`git archive`, repo untouched), broke the code under test in 255 specific ways, and re-ran the batch's own test files against each mutant. A KILLED mutant means a test failed, so the assertion really guards that behaviour. A SURVIVED mutant means every test in the batch still passed with the code broken. Harness, mutation lists and raw TSVs are in `artifacts/test-review/render-2/` (`mutate2.mjs`, `muts1-8.json`, `out1-8.tsv`).

**Totals:** 172 killed, 75 survived, 7 had a find-string that did not match once (5 re-run as corrected mutants, 2 not re-run). The survived set includes a few I judge equivalent or near-equivalent (listed below); the rest are real coverage holes. Debugger evidence stays as in the first report (CDP hits / V8 coverage).

## Corrections to the first report
- Finding 4 (`light-presets.test.mjs:212-231` re-implements the resolver) is **confirmed**: dropping the shared `*|tod|wx` stamp from `LightStore` (`profiles.js:157`, `sharedCond` returns null) survives all 9 lighting tests in this batch. It is caught only by `weather-blend.test.mjs` outside the batch.
- Finding 5 (`render-rate.test.mjs:252-258`) is **narrowed**: dropping the carried time in the common ungated branch is killed by "it leaves when the cadence slows, and flushes the carried time". What survives is dropping the carry only when exiting via `presenting` (RR11), which is exactly what the immersive test's title claims to cover.
- Finding 6 (results-cam): the `PerfGov.tier() >= 2` branch survives as predicted (RC1b).

## Tests that really do guard what they claim (killed)
`render-rate` (8 of 10 mutants), `glx-failure-paths`, `glx-resource-balance` (VAO/IB leak, fail-closed), `glx-occlusion` state restore (the black-sky `LESS` bug, colorMask, program, cull), `lamp-chunks` (sort, cap floor, cache invalidation, in-place refill), `lamp-bake` (10 of 13), `renderer-boot-timeout` (6 of 7), `memory-sync` and `road-lut-frame` (first-to-arrive cell fill, nearest eviction), `hunt-tlx-create-undo` (all three `_createUndo` pushes), `lighting-reapply` / `lighting-rebuild` static scans, `light-presets*` data lints (orphan id, out-of-range, crushed `*|dawn|dry`, missing grid key), `render-final-contracts` (6 of 8), `s8-once-per-frame` (all 12), `perf-governor` + `perf-sentinel` (13 of 16), `mem-census-growth`, `lap-format-rollover` (7 of 7).

## Surviving mutants (the test did not notice), ranked
| id | mutant (file) | test that should have caught it | why it matters | verdict |
|---|---|---|---|---|
| TL1 | densify insert count `floor((span-1)/gap)` -> `floor(span/gap)-1` (`track-lights.js:~197`) | lamp-density test 2 ("gap dead-band") | re-introduces the silent no-op the test's own comment describes (monza density 1→2 baked 292 both ways) | **real gap, high**: fixture never hits span in [gap, 2·gap) |
| LS10/LS11/LS12 | `apply()` never flags `rebuild`; `set()` runs no live effects; `rebuild` never nulls `track._lights` (`profiles.js:~212,~257`) | lighting-rebuild, lighting-reapply | these two tests only scan source for `rebuild:true` / APPLY_RACE_IDS; nothing runs the flag → invalidate chain, so a lamp slider can go dead with every lighting test green | **real gap, high** |
| LS1, LS2, LS7 | shared stamp ignored by resolver; `base()` ignores shared stamp / player `*` layer (`profiles.js`) | light-presets, light-store-* | resolver and `put()/copy` baseline diverge silently (`apply()` and `base()` duplicate the same layering) | **real gap, high** (LS1 only caught outside batch by weather-blend) |
| G6, G13, G14c | desktop stamps the crash sentinel; `cleanRace` never pays a strike; floor drop does not release tier (`governor.js:~467,~490,~515`) | perf-sentinel, perf-governor | desktop players get safe-mode strikes; a phone stays degraded for the session after clean races | **real gap, high**: `cleanRace` is called by no test in the batch |
| SP3, SP4, SP5 | lamp-shadow pick scores on flickered level; tail lights eligible; small movers eligible (`shadow-pass.js:~535-540`) | lamp-shadow-pick | SP3 is the original flicker bug: the 1.2 hysteresis alone hides it because fixture flicker amplitude is < 20 % | **real gap, high** (SP3 masked by SP1/SP2 redundancy) |
| RC10, RC9, RC11, RC12, RC4, RC17, RC18, RC1b | orbit frozen; chequered cut skipped; 30 fps cap removed; reset leaves results camera installed; retired car can be subject; out-of-window tags kept; highlights re-entrant; PerfGov tier gate off (`results-cam.js`) | results-cam | 8 of 19 mutants survive, mostly on timing / lifecycle paths, so the file is stronger on pure helpers than on `tick()` | **real gap, high** |
| LB6, LB10 | near clamp ignored; back-facing surfaces lit (`lamp-bake.js:~329,~345`) | lamp-bake | LAMP NEAR CLAMP is a player knob; the oracle test never sets a clamp that matters | **real gap, med** |
| TL2, TL3, TL7, TL9, TL10, TL8b | density boundary `<` vs `<=`; fill lamps all one side; thinning wrap; fill copies `signal` kind; densify wrap-around span | lamp-density | pit-entrance red pool class of defect has no test | real gap, med |
| GX1 / GX2 alone, GX9 | each hysteresis snap alone (killed together); maxDim clamp only on width (`glx.js:1160-1180`) | glx-resize-hysteresis | at `renderScale = 1` the two snaps overlap, so each is individually untested; `maxDim` clamp has no test | real gap, med |
| CH1, CH4, CH5, OC5, OC8, OC9, OC10, OC13 | `UNSIGNED_INT` stride; per-group light-set re-upload; multi-draw lamp-shadow slot; out-of-frustum stale HIDDEN; null query; `endQuery` after throwing draw; one query in flight; `freeChunkedMesh` VAO leak (`chunked.js`) | glx-multidraw, glx-occlusion | the strongest-looking files still miss 8 of 19 chunked.js mutants, mostly error paths and `freeChunkedMesh` | real gap, med |
| RR9, RR10, RR11 | fast-cadence counter never reset; tier-path dt clamp; carry dropped when exiting via `presenting` (`render-rate.js`) | render-rate | see "Corrections" | real gap, med |
| PF1, PF2, PF3, PF5, PF6 | quantile ceil; hitch filter; insufficient-frames guard; longTasks / heap regressions never fire (`perf-frametime.mjs`) | perf-frametime | confirms "weak" verdict: the perf-regression lane's helper can lose half its checks unnoticed | **real gap, high** |
| DM1, DM5 | `NaN` preset value; crushed `ambientMul` on a two-part cond layer (`presets.js`) | light-presets-knob-range, light-presets | confirms finding 14: both slip past the data lints | real gap, med |
| TP1, TP3, TP4, PT1, RF5, RF8, GI6, PK6, GO3 | autoClear left false after throwing present; godray/bloom targets never shed; sky drawn twice; drop queue never emptied; retry keeps old strike count; Proxy `__element`; webgpu diagnostics; `?gfxdebug=0` arms overlay | renderer-soft-lifecycle, perf-try, render-final-contracts, gfx-debug-overlay | TP1 (smeared canvas until reload) and PT1 (double sky draw) are the notable ones | real gap, med |
| RL3, RL4, RL6, RL7 | centreline interpolation `t=0.5`; no neighbour-cell binning; no LUT padding; spacing = max gap (`wgx-roadlut.js`) | road-lut-frame | the 3-circuit census detects cell fill and eviction (RL1, RL2, RL5 killed) but not sideways shift (the 0.3 m bug it was written for) | real gap, med |
| SPn6, SPn8, RB3, TS4, TS6, MC1 | span `reset` keeps loaf; `end()` without `begin()`; spec may lower boot cap; sweep verdict ignores noise ×3; `softwareGl2` option; warm-up interval included | perf-spans, renderer-boot-timeout, lighting-tuner-sweep, mem-census-growth | MC1 is near-equivalent (including the warm-up interval can only lower `min`) | mixed |

**Judged equivalent / near-equivalent:** LC2 (`<=` vs `<` on a measure-zero boundary), LC4 (`slice` vs `subarray` only matters if a consumer writes), LS9 (`put()` clamp, every caller already clamps), LB12 (reach radius ×2: `win` is already 0 beyond the radius), MC1.

## Method notes and what did not finish
- Cross-check of survivors against the 800+ other unit tests was started (`genx.mjs`, `outX.tsv`) and **stopped at the orchestrator's request**. It is incomplete, and several kills in `outX.tsv` (`ci-coverage`, `docs-integrity`) are invalid: those two tests are red in the scratch copy regardless of mutation (the copy has no `.git` / `artifacts`). Valid so far: LS1 is killed by `weather-blend`; RR9, RR10, LS2, LS7, LS9 survive the other tests too. So "survived" above means "survived this batch", not "survives the whole suite".
- Not run: the "throw at the start of every function that coverage says was never called" pass (`muts9.json`, 40 mutants, glx.js / chunked.js / shadow-pass / lamp-bake / profiles / gfx-debug-overlay); governor.js is excluded because its tests `eval` the source so line numbers do not map. Raw V8 coverage under-reports for the same reason, so I did not use it to claim "never called".
- Not mutated: `lamp-fixture-anchor` (~110 s per run), most of `gfx-backend-canary`'s 252 tests (only the GLX, picker-storage and TLX teardown paths above), `shader-validate` (no lint binaries here), `perf-try` beyond three draw-order mutants.
- Flakiness was not measured beyond one run per file (no repeat loop).
- Consistency observation, not a defect: `perf-governor.test.mjs:40-60` hard-copies GLX's 0.02 `setRenderScale` dead zone; TLX (`tlx.js:4313`) and WGX carry their own copies and nothing ties the three together.

🤖 Generated with [Claude Code](https://claude.ai/code)

---
_Generated by [Claude Code](https://claude.ai/code)_
