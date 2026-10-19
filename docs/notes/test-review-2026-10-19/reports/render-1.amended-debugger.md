<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT render-1 (final (amended debugger column; supersedes the debugger column of reports/render-1.md))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260879946
- Posted: 2026-10-19T06:10:34Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (amended debugger column; supersedes the debugger column of reports/render-1.md)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT render-1 (amended)

Supersedes the debugger column of my earlier REPORT render-1 (comment 6259831013); that comment's findings, gaps and Not run still stand except where noted below. Debugger check now covers **all 25 files**.

**Method.** The js-debugger MCP can't attach to node (it lists only page targets). I drove the node inspector over CDP myself (`artifacts/test-review/render-1/cdp.mjs`): `node --inspect-brk=0 <test>`, `Debugger.enable`, a `beforeScriptExecution` instrumentation pause on every script (so vm-evaluated code is covered too), `Debugger.setBreakpoint` on the first statement of each code-under-test target found by source text, resume, and count `hitBreakpoints`. No conditions, so hit counts are real pauses. Every row below is `hit (cdp)` unless stated. Runs of cam-avoid-vm, cam-round2, camera-feel, camera-ride and the first flyby-shots run hit the 470 s tool cap under the debugger (hot-path breakpoints pause thousands of times), so their pass counts come from the earlier plain run, but the hits listed are real.

## Debugger column, per file (code under test, hits)
| file | debugger |
|---|---|
| always-lamp-floor | hit: `frame-lights.js:655` (alwaysLampFloor apply) x1-2 |
| apex-memory | hit (coverage): the CLI runs as a child process, so CDP sees only the parent; `apex-memory.mjs:37`, `:62` covered |
| appearance-sunlight-chrome | hit: `tests/helpers/css-rules.mjs:25` `cssRules` x3. The code under test is CSS text, so no JS runs for the assertions that matter (contrast/tokens): n.a. there, as in the earlier finding |
| assets-pack | hit: `assets.js:38` manifest x33, `gltf.js:123` parseGLB x12 |
| cam-avoid-vm | hit: `cam-avoid.js:60` roadClear x46, `:72` freeEye x7954 |
| cam-avoid | hit: `cam-avoid.js:60` x1, `:72` x3. A breakpoint on the early-return line `:70` showed not-hit while `:71` hit (V8 resolves an `if (...) return` line to the return), so I don't read that as dead code |
| cam-comfort | hit: `cam-comfort.js:48` memo x7. **not-hit: `fxSet` (`:73`)**: confirms the earlier gap |
| cam-motion | hit: `feel.js:204` drive x40 |
| cam-round2 | hit: `vantage.js:307` bendHang x8910, `:918` ground floor x1500 |
| camera-defaults | hit: `offsets.js:584` decodeShare x10 |
| camera-feel | hit: shake `feel.js` (vm :403) x10645. `resetSmoothing` never reached before the debug-run cap, so not confirmed under the debugger |
| camera-ride | hit: `vantage.js:442` x5299, `:918` softFloor x5298 |
| camera-tuner-a11y | **n.a.: no script contains `tuner-panel.js` code.** Neither breakpoint target (`sm.mode.setAttribute`, `b.dataset.scope`) exists in any script the process loaded: a pure source-text scan, checked against the file text only. Finding stands (F1) |
| census-verdict | hit: `census-verdict.mjs:101` x80 |
| elev-presets | hit: `elev-presets.js:23` sanitize x9, `:100` grade cap x14 |
| floodmast-lamp-register | hit: `build-props.js:1908` selectCustomLamps early return x6, `:1921` thinning loop x174 |
| flyby-fleet | hit: `flyby-audit.cjs:34` auditTrack x30, `flyby-seq.js:1182` solve x8430 |
| flyby-lighting | hit: `flyby-seq.js:94` FAR x1 only. **`game.js` is never executed: it is read as text, so the ordering assertions (F6) check source text, not behaviour** |
| flyby-panel | hit: `flyby-panel.js:192` shotErrors x66, `:221` validateShots x18, `:353` loadSaved x1 (plus `bake-flyby.mjs:50`, `:76`) |
| flyby-shots | hit: `flyby-seq.js:173` insideProp x8279, `:1182` solve x656, `game.js:3817` introBuild x17, `game.js:3619` x26 (slice harnesses do run production text) |
| frame-fleet | hit: `frame-fleet.mjs:112` diffFleet x5 |
| frame-hitch-analyse | hit: `frame-hitch.mjs:134` periodic x4, `:858` analyseHeap x3 |
| frame-hotpath-alloc | hit: `car-mesh.js:1791` drawAeroEdge x4000, `:1764` drawRearLights x2. **`tlx.js` `poolModelMat` / `cullInstances`: no script containing them was ever loaded**, so those checks are regexes on source text (F7 stands, and is now debugger-confirmed) |
| frame-math | hit: `frame-math.mjs:392` judge x3, `:191` transmittance x5 |
| free-cam | hit: `free-cam.js:73` cornerPose x12, `:280` decorate x32 |

## New or changed findings
- **Debugger-confirmed text-only checks** (no code reached): `camera-tuner-a11y` (all of it), the game.js ordering tests in `flyby-lighting`, and the tlx.js assertions in `frame-hotpath-alloc`. These are the clearest examples of "tests the source text, not behaviour".
- `cam-comfort.js fxSet`: confirmed never executed by the test.
- Everything else in the original REPORT's per-file table and findings 1-15 is unchanged.
- The "debugger: n.a." marks in the earlier table are replaced by the column above.

## Gaps (addition)
- **Tooling:** the js-debugger MCP lists only Chrome page targets, so it cannot attach to `node --inspect`. Pass-2 tooling fix: add node-target support, or ship `artifacts/test-review/render-1/cdp.mjs` as a tool. A fresh `consider`-style race (breakpoints set from `scriptParsed` after a vm script already ran) cost me a few false "not-hit" rows until I serialized it with the `beforeScriptExecution` pause.
- Plain breakpoints on an `if (...) return x;` line may report not-hit although the function ran; target a plain statement.

## Not run
- The five hot-path runs above are time-capped under the debugger (see Method); their pass counts are from the plain runs.
- `camera-feel` `resetSmoothing` not reached under the debugger.
- Flake sampling still not done.

Artifacts (scratch): `artifacts/test-review/render-1/` (`cdp.mjs`, `runall.mjs`, `cdp-results.txt`, `cdp-results2.txt`).

---
_Generated by [Claude Code](https://claude.ai/code)_
