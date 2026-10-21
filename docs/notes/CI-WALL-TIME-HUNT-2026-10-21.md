# CI wall time and reliability: hunt results (2026-10-21)

Data only. Asked for by OrchB 24 (Bryce: "have idle hunters keep hunting new areas"); read-only apart from the
`merge-gate` change in the same PR (F6). Sources: `tests/data/spec-timings.json` (1164 llvmpipe samples),
`tests/helpers/fixtures.js`, `js/render/gfx.js`, `docs/notes/CI-RENDERING-PERFORMANCE.md`, the job timings of Pages
run 39512813834 and the last 25 `pages.yml` runs (#3846-#3870, 2026-10-20). Every number below was read or measured;
what was not measured is marked UNMEASURED.

## Unpinned specs boot TLX on CI and pay the rig warm (F1/F2, corrected twice)

39 of 162 specs import `test` from `@playwright/test` instead of `tests/helpers/fixtures.js`, so they skip
`installMocks` (the `apex26.gfxBackend=webgl2` pin, `__TEST_MODE`, the tyre-wear-OFF pin, the API mocks). They are 36 %
of the median spec wall time (4051 s of 11250 s; `hud-layout` 1468 s, `career` 406, `career-season` 403,
`vr-emulated` 322, `career-hub` 263, `time-trial` 214; the 11 foundation specs only 200 s).

What each host does with an UNPINNED page (measured, not inferred):

- **This container (SwiftShader):** `navigator.gpu` exists but `requestAdapter()` resolves null, so the page binds GLX
  (`[gfx] GLX context ready`) and the three.js bundle is preloaded and never used (browser warning "preloaded ... not
  used"; H8's commit `2629e559` records the same). Boot 2.9-3.2 s unpinned vs 2.4-2.5 s pinned (n=2 each);
  `race("monza")` build 18.9 / 18.4 / 5.5 s unpinned vs 7.0 / 17.9 / 17.8 s pinned (n=3 each), bimodal and not
  correlated with the pin. So no pin effect on a SwiftShader host. An earlier version of this note generalised that to
  CI; that was wrong.
- **CI runner (llvmpipe), `browser-group.yml` group `circuits`, 1 worker, probe spec `zzbackend-foundation` on throwaway
  branches, never merged:** the unpinned page binds TLX. Both refs log `[gfx] [TLX] three backend: WebGPU (forceWebGL
  false pin null isMobile false)`, `TLX bind ok`, `Gfx.bind backend=three`; `navigator.gpu` is an object.

| ref | monza-foundation | redbull-foundation | probe | `race("monza")` build |
|---|---|---|---|---|
| deploy tip `3b3074718` (run 39527557109) | 35.0 s | 62.9 s | 29.1 s | 22.96 s, 23.90 s (two attempts) |
| #3356 head `89f6207b6` (run 39527559333) | 12.4 s | 9.6 s | 8.7 s | 4.49 s |

Reading: the 20 s rig warm lands on the first race build of every unpinned spec on CI, and #3356 removes most of it
(monza 2.8x, redbull 6.5x, race build 5x). Caveats: one run per ref (two attempts for the tip's probe); #3356's branch
forks from an older base, so a small part of the delta could be other commits; with one worker the first race in a
process pays a cold build that later ones do not. Pinning `webgl2` in those specs would also avoid the warm, but it
trades away TLX coverage in them: a coverage decision, not taken here.

`hud-layout.spec.js:1707` spies on `window.GLX.draw`; `GLX` is a facade present on either backend. No assertion in
`hud-layout` names TLX, three or WebGPU. A separate determinism point: the 39 specs also lack the tyre-wear-OFF pin and
the API mocks, so their baselines inherit product defaults.

## Findings that stand

| # | Kind | Finding | Evidence |
|---|---|---|---|
| F3 | wall | The Linux critical path of a Pages run is the `hud-layout` oversize shards (14.8 and 13.6 min), behind the macOS Metal leg (17.6 min). The median selected leg is about 7 min. | run 39512813834 job durations |
| F4 | wall | The two `hud-layout` shards took 28.4 min for 2/3 of its 30 tests, vs a 24.5 min recorded median for the whole spec: about 1.7x per test. A runner-speed or load signal, not a backend one (see above). | same run vs `spec-timings.json` |
| F5 | waste | 5 of the last 25 Pages trains were cancelled by a newer push (#3855, #3861, #3862, #3863, #3870; three within 2-10 min of starting) and 5 failed (#3846, #3847, #3859, #3860, #3864): 40 % published nothing. Bursts of merges replace the running train each time. | `pages.yml` run list |
| F6 | reliability | #3859 and #3860 were both red from one base overage (`assert.match` 7317 > 7316): #3236 and #3237 were each at or under the ceiling on their own base and together one over. The gate checked the head, not the merge result against the moved base. Fixed in `tools/ci/merge-gate.mjs` (`ratchetsOnMerge`, row `ratchets`), tested with that exact shape. | `tests/unit/merge-gate.test.mjs` |
| F7 | reliability | Pages run #3864 (the #3231 merge) failed on `selected-9` (32 tests, `multiplayer-scan.spec.js` first) on BOTH attempts, at 5.5 and 5.0 min: a failure, not a slow leg. #3247 and #3300 passed afterwards. The failing assertion is not in the log tail reachable without a token; the artifact is `playwright-artifacts-selected-selected-9-8` (id 12307034873). UNMEASURED: flake vs a real red. | jobs 118939521813, 118947452771 |
| F8 | data gap | `spec-timings.json` holds 1164 `llvmpipe` samples and 1 `local`: this container (SwiftShader) has no history, so local budgets for a browser group are a rule of thumb (AGENTS.md: 10-40 min), not a measurement. H11 also reports new-format keys (`specs/x.spec.js > title`) beside the bare titles, which splits a test's history. | `spec-timings.json` |
| F9 | dev loop | Container restarts killed three 20-minute background `tooling-fast` runs. Sharded foreground runs (`--shard=1/2`, `2/2`, about 9 min each at `--jobs=4`) finished. | session record |
| F10 | wall | `hud-layout` is split three ways in `select-specs.mjs`; two of its shards are the Linux critical path (14.8 and 13.6 min vs a 7 min median leg). A four-way split is the lever; not touched here. | run 39512813834 |
| F11 | budget | `menu-traversal.spec.js:253` "MUSIC & SOUND" has p90 107.7 s against its 120 s limit (0.90), the only spec within 20 % (B·H11's hunt). Split it per fold or reuse one boot; never raise the timeout. | H11 report |
| F12 | data | `spec-timings.json` carries new-format keys (`specs/x.spec.js > title`) beside old bare titles, so each test's history is split and near-limit and packing read only part of the samples. Normalise the keys in the timings merge (`bot/spec-timings`), with a unit test. | H11 report |

## `node --test` inside a node test exits 0 on a failure

`node --test` started from a process that is itself a node test inherits `NODE_TEST_CONTEXT` and exits 0 even when the
nested test fails (measured: inherited exit 0, stripped exit 1). Anything that shells out to `node --test` from a test
must delete that variable from the child env; `ratchetsOnMerge` does.

## Not done

- The pin A/B on `hud-layout` itself (the probe above measures boot and race build, not the whole spec).
- F10-F12 are rows only; nothing was changed for them.
- F5 (batching merges between game trains) is the orchestrator's policy call.
