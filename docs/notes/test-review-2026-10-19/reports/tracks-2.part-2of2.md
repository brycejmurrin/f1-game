<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tracks-2 (final (continuation; closes the open items of part 1/n and the spec addendum))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261284192
- Posted: 2026-10-19T06:38:36Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (continuation; closes the open items of part 1/n and the spec addendum)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks
- Normalized (only change to the body): files that do not exist yet (reviewer proposals) are unquoted or written `dir/<new:name>.ext`, so docs-integrity does not read a proposal as a claim: docs/notes/test-review-2026-10-19/helpers/tracks-2/<new:run-specs>.sh

---

REPORT tracks-2 (continuation)

Closes the open items from the partial report (#issuecomment-6260849328) and addendum (#issuecomment-6260935083). Only those rows changed; all other rows stand as reported.

## Solo re-runs (one Playwright process, `--retries=0`, headless SwiftShader, no /dev/dri)
| file | prior | solo re-run | class |
|---|---|---|---|
| specs/livery-sidewall | FAIL test 2 (timeout) | **pass 2/2, 121 s** (t1 2.7 s, t2 1.7 min) | environment/slow. Test 2 took ~102 s against the 120 s cap, so it is 18 s from failing even solo. Not a product defect. |
| specs/track-designer | FAIL 2/19 (timeout x2) | **18/19 pass, 639 s; 1 fail**: test 3 `workspace organization preserves controls and scroll across modes and library` (spec:92) timed out at 2.1 min; first error `expect(locator('[data-role="look-summary"]')).toContainText("AUTO")` got `""` at spec:131 | test 3 is **reproducible** (failed in both runs), so it is not flaky: its body is over 120 s here, and the assertion is just where the clock ran out. The multi-viewport test (t1) passed at 1.9 min, 6 s under the cap, so it is flaky/borderline. Fix: `test.slow()` or split per viewport cell. Whether the AUTO assertion would hold given more time was not tested. |
| specs/props-over-road (tail) | PARTIAL 46/52 | tail run with `APEX_CIRCUITS=spa,suzuka,vegas,watkins_glen,zandvoort,zolder`: **6/6 pass, 230 s** | pass. Together with the earlier 46, all 52 circuits have now passed. |

## Debugger (browser)
The js-debugger MCP attached to headless Chrome on :9222 (`debug-chrome start`, after the test runs; nothing ran beside it). I put logpoints on the code under test and ran the specs' own `__apex` calls on the debug page. This proves the entry points are reachable through the spec call path. It does not prove the Playwright spec itself reached them.
- `js/agent/apex-track.js:87` `trackGeometry(keep)`, the entry used by props-over-road and the `*-foundation` specs: **hit 1x** (`keep=true`).
- `js/physics/wall-clamp.js:41`, the `ContactGeometry.wallLimits` call used by tracks-walls*/offtrack: **hit 2684x** in 120 steps after `race("montreal","day","dry")`, `go()`, `setPhysics({drift:0.3})`. The caller is the AI field.
- A first attempt used `race({track:"monza"})`, which left the state at `menu` with `track: null` and no `wallLimits` hits. `race()` takes positional `(id, tod, weather)`, so a wrong-form call fails silently.
- Detached with no cleanup errors; debug-chrome stopped.

Per-spec hit status for the 26 specs: **tracks-walls*, offtrack (wallLimits) and the trackGeometry users (props-over-road + foundation specs): reachable, hit**. **Not done per spec** (no per-spec breakpoints): the remaining specs, namely track-designer, livery-sidewall, scenery-kits, track-switch-release, f1-track-accuracy and elevation-tracks. Their "debugger" cell stays `not done` in the earlier table, except livery-sidewall t1/t2, which ran in Playwright but were not breakpointed.

## Top findings added or changed
| file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|
| specs/track-designer.spec.js:92 | Test 3 is over 120 s here on every run (2.1 min x2); t1 passes at 1.9 min | A slow runner turns this red with an unrelated-looking assertion (spec:131) | `test.slow()` or split per mode/viewport; keep spec:131 as the state assertion | high |
| specs/livery-sidewall.spec.js:64 | Test 2 takes ~102 s solo against a 120 s cap | It flakes under any load, and it only checks a class removal | Delete t1 (unit twin); assert real ink on the wheel in t2 and speed up its Click steps | high |
| specs/props-over-road.spec.js:82 | The 52-circuit browser run passes with `BASELINE.miami = 4.2`; the node twin has `{}` | The browser copy hides a regression the VM test rejects | Share one baseline table | high |
| specs/hungaroring-foundation:21,64 (+abudhabi, suzuka) | Terrain probes at lat -6..6 are inside the carved road, so null passes | The terrain-over-road check cannot fail | Probe lat >= 10 and require a number | high |
| specs/tracks-walls.spec.js:69 | "stops bounded and recovers" never checks recovery | Title overpromises | Assert re-entry | high |

The earlier ranked list (qatar relief, trackside CAM_MODES, tracks-walls-a/b merge, f1-track-accuracy `LIST.length === 52`, ui-fit toolbar CSS scan, track-validate-fleet logged-only reds, foundation-spec boilerplate) is unchanged.

## Gaps
- js-debugger MCP attaches to Chrome only; Node units were done with `node:inspector` and V8 coverage (partial report).
- No per-spec browser breakpoints for the specs listed above.

## Not run
- Nothing else. All 26 specs now have a recorded pass except track-designer test 3, which fails on the 120 s timeout.

Helpers: branch `cursor/test-review-helpers-tracks-2` (42b8367c, no PR): `docs/notes/test-review-2026-10-19/helpers/tracks-2/<new:run-specs>.sh` (sequential solo runner) and `debug-logpoints.md` (browser recipe). Logs are container-local in `artifacts/test-review/tracks-2/`.

---
_Generated by [Claude Code](https://claude.ai/code)_
