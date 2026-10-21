# CI wall time and reliability: hunt results (2026-10-21)

Data only. Asked for by OrchB 24 (Bryce: "have idle hunters keep hunting new areas"); read-only apart from the
`merge-gate` change in the same PR (F6). Sources: `tests/data/spec-timings.json` (1164 llvmpipe samples),
`tests/helpers/fixtures.js`, `js/render/gfx.js`, `docs/notes/CI-RENDERING-PERFORMANCE.md`, the job timings of Pages
run 39512813834 and the last 25 `pages.yml` runs (#3846-#3870, 2026-10-20). Every number below was read or measured;
what was not measured is marked UNMEASURED.

## Retracted: unpinned specs are not a wall-time lever (was F1/F2)

39 of 162 specs import `test` from `@playwright/test` instead of `tests/helpers/fixtures.js`, so they skip
`installMocks` (the `apex26.gfxBackend=webgl2` pin, `__TEST_MODE`, the tyre-wear-OFF pin, the API mocks). They are 36 %
of the median spec wall time (4051 s of 11250 s; `hud-layout` 1468 s, `career` 406, `career-season` 403,
`vr-emulated` 322, `career-hub` 263, `time-trial` 214; the 11 foundation specs only 200 s). The hypothesis was that
they boot the default TLX and are slower under software GL. It does not hold on CI:

- `js/render/gfx.js` (`Gfx.create`) resolves `null`, and the caller falls back to GLX, when there is no
  `navigator.gpu`. `CI-RENDERING-PERFORMANCE.md` records that llvmpipe exposes none.
- Probed here (SwiftShader), unpinned vs `apex26.gfxBackend=webgl2`: both log `[gfx] GLX context ready`. Unpinned also
  loads and preloads the three.js bundle and never uses it (browser warning "preloaded ... not used"). Boot to
  `__apex`: 2.9-3.2 s unpinned vs 2.4-2.5 s pinned (n=2 each), about 0.6 s per page, so about 18 s of `hud-layout`'s
  1468 s (1.2 %).
- `race("monza")` build, n=3 each: unpinned 18.9 / 18.4 / 5.5 s, pinned 7.0 / 17.9 / 17.8 s. Bimodal (5-7 s vs 18 s)
  and not correlated with the pin; box load was 3-4 during the runs.
- The one assertion that looks backend-specific (`hud-layout.spec.js:1707`, spies on `window.GLX.draw`) works in both
  modes: `GLX` is a facade present either way.

Left over, a determinism point rather than a speed one: those 39 specs also lack the tyre-wear-OFF pin and the API
mocks, so their baselines inherit product defaults.

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

## `node --test` inside a node test exits 0 on a failure

`node --test` started from a process that is itself a node test inherits `NODE_TEST_CONTEXT` and exits 0 even when the
nested test fails (measured: inherited exit 0, stripped exit 1). Anything that shells out to `node --test` from a test
must delete that variable from the child env; `ratchetsOnMerge` does.

## Not done

- The `hud-layout` A/B on remote CI (retracted premise; about 3 runners x 25 min for a roughly 1 % effect).
- `hud-layout` is split three ways in `select-specs.mjs`; four shards is the lever for F3, not touched here.
- F5 (batching merges between game trains) is the orchestrator's policy call.
