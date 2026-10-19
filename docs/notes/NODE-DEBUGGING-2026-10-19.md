# Debugging Node, and what a breakpoint debugger cannot reach (2026-10-19)

Bryce asked on 2026-10-19 (~04:46Z): "consider how we should be debugging node and what parts of our project can
we not debug with a debugger and have it do web research to help". The trigger was #2952: 11 test-review sessions
found that the js-debugger MCP (#2957) attaches to Chrome pages only. To debug Node tests they hand-rolled CDP
clients and NODE_V8_COVERAGE.

This note covers three questions:
- Q1: how to debug Node here, measured on real `tests/unit` files.
- Q2: a gap map of what a breakpoint debugger cannot debug well, per subsystem.
- Q3: ranked recommendations, each filed as an issue.

All measurements were taken on Node v22.22.0 in the cloud container with a scratch CDP client
(`artifacts/node-debugging/cdp-probe.mjs`). The client spawns `node --inspect-brk=0`, connects over the global
`WebSocket`, calls `Debugger.setBreakpointByUrl`, resumes, and records the scripts it sees, the hits and the
locals. Scratch files are not committed; the recipes below reproduce every number.

## Q1 — how to debug Node here (measured)

### How the URL is chosen (this decides everything)

V8 reports a vm script under exactly the `filename` it was given. Node turns an absolute path into a `file://`
URL and leaves anything else alone.

| how the source is loaded | example in tree | `Debugger.scriptParsed.url` | `url: file:///…` breakpoint | `urlRegex` breakpoint | `--experimental-test-coverage` lists the file |
|---|---|---|---|---|---|
| absolute `filename` | `tools/lib/game-vm.cjs:549` | `file:///home/user/f1-game/js/game.js` | **hits** (1281 hits, game-vm.test) | hits | **yes** |
| relative `filename: "js/…"` | `tests/helpers/seed-*.mjs`, `ai-drive.test.mjs:18` | `js/physics/ai-drive.js` | 0 hits | hits | no |
| bare `filename: "rivals.js"` | `audio-tune.test.mjs:2405` | `rivals.js` | 0 hits | hits | no |
| no `filename` | `brake-cue.test.mjs:18`, `cam-avoid.test.mjs:14` | `evalmachine.<anonymous>` (shared by every unnamed script) | 0 hits | only `^evalmachine`, which matches *every* unnamed script | no |
| `//# sourceURL=/abs/path` appended | prototype | `/home/…/brake-cue.js` (raw, no `file://`) | 0 hits | hits | no |
| absolute path given as `url` without `file://` | game-vm | — | 0 hits | — | — |
| any form, including none: `Debugger.setInstrumentationBreakpoint("beforeScriptExecution")`, then on each pause match `Debugger.getScriptSource` against the repo file (raw or after the `^const`→`var` rewrite; 400-character prefix) and `Debugger.setBreakpoint` by scriptId | brake-cue, cam-avoid | (no URL needed) | — | — | no (coverage still unmapped) |

Measured:
- `game-vm.test.mjs`, breakpoint at `js/game.js:4342`, resolved to `4344` inside `update()`, with
  `dt=0.016666666666666666` in scope.
- `ai-drive.test.mjs`, `js/physics/ai-drive.js:18`, in `traits(c)`.
- `brake-cue.test.mjs`, `urgencyOf` line 29, with all six arguments readable.

The `cachedData` path in `tools/lib/vm-script-cache.cjs` does not get in the way: breakpoints bound and hit with the
V8 code cache in use.

How the tree loads source today:

| count | what |
|---|---|
| 1998 | `vm.runInContext` calls |
| 196 | `vm.runInNewContext` calls |
| 10 | `vm.runInThisContext` calls |
| 4 | `new vm.Script` calls |

| count | `filename:` value | |
|---|---|---|
| 289 | `"js/…"` literal | relative |
| 173 | other literal, bare or relative | |
| 183 | a variable | |
| 4 | a computed absolute path | the game-vm family |

About 700 source-loading calls pass no `filename` at all, and 178 files call vm without ever passing one. These
are grep heuristics; the recipe is in §Reproduce. **Only the game-vm family is debuggable or coverable by file
path today.**

A client that knows the repo can still break inside unnamed vm code without any test change. The orchestrator
relayed this, measured by reviewer physics-1 in #2952 (64/68 files). I reproduced it:

| test | instrumentation pauses | bound by scriptId | hits |
|---|---|---|---|
| `brake-cue` | 3 | 2 | 64 |
| `cam-avoid` | 7 | 6 | 7 |

The cost is one pause per script parse (a few ms each). The binding lasts one process only. It gives no help to
coverage, editors or `url` breakpoints, which is why the filename fix (R1/R2) is still worth doing. It is the right
fallback for the MCP (R3).

Two more facts:
- **Columns are off by 2** on top-level `const` lines, because every harness rewrites `^const` to `var`. Line
  numbers are exact, so set line breakpoints.
- **The test runner's coverage report silently drops vm-loaded source.**
  `node --test --experimental-test-coverage tests/unit/ai-drive.test.mjs` reports only `seed-log.mjs` and the test
  file itself. With an absolute filename, the same `brake-cue.js` shows up (40.97 % lines in the one-test
  prototype, 88.19 % through the real test plus the preload below).

  This is why the #2952 reviewers fell back to raw `NODE_V8_COVERAGE`. Its JSON does list `js/core/log.js`,
  `js/physics/ai-drive.js` and `evalmachine.<anonymous>` entries, but under unresolvable URLs.

### Running a test under the inspector

| recipe | result on v22.22.0 |
|---|---|
| `node --inspect-brk=0 tests/unit/<f>.test.mjs` (no `--test`) | **Best.** One process, one ws URL on stderr, and the `node:test` harness still runs and reports (`# pass 108`). |
| `node --inspect-brk=0 --test <one file>` | Warns "Using the inspector with --test forces running at a concurrency of 1". The file runs in a child (`node --inspect-brk=0 --inspect-port=0 <file>`, seen in strace), and the child's "Debugger listening" line is forwarded to the parent's stderr. Attaching to that single URL works. |
| `node --inspect-brk=0 --test <two files>` | **Hangs** for a single-attach client. File 2's child waits at brk on a new port, and its URL appears on stderr only after file 1 detaches. A client must attach to each forwarded URL in turn. |
| `--experimental-test-isolation=none` | Single process, works (64 hits). `--test-isolation=none` is a **bad option on v22** (it was renamed in v23.6). |
| process exit with a client still attached | Node prints "Waiting for the debugger to disconnect..." and **hangs** until the client closes. A client must watch for that line. |
| two `--inspect-brk=0` runs at once | Distinct random ports, both hit (4 and 64 hits). Port 0 removes the 9229 collision; `--inspect` inside `NODE_OPTIONS` would make every child fight for one port. |

Version note: the v24 runner source gives each child `process.debugPort + N` and no longer forces concurrency 1
(per the research pass). Re-measure when the container moves off v22.

### What breakpoints cost

All three runs are `game-vm.test.mjs` with a breakpoint in `update()`, which is hit 1281 times:

| run | wall time |
|---|---|
| no inspector | 25.9 s |
| `--inspect=0`, no client | 23.0 s |
| client attached, breakpoint with condition `false` | 27.5 s |
| client attached, pause then auto-resume on every hit | **84.0 s** (about 44 ms per round trip) |

So a logpoint has to be a condition that logs and returns `false`, as DevTools' own logpoints are. It must never be
a pause followed by a resume.

V8 coverage and breakpoints coexist: `NODE_V8_COVERAGE` with a client attached gave 4 hits plus a coverage file.
`Profiler.startPreciseCoverage` "prevents running optimized code" (CDP), so it changes timing; best-effort coverage
does not.

### The fix, prototyped: an opt-in preload, no test edits

`artifacts/node-debugging/proto/vm-debug-preload.cjs` is about 60 lines, and the full text is in §Appendix. It
wraps `vm.runInContext`, `runInNewContext`, `runInThisContext` and `vm.Script`, then calls
`syncBuiltinESMExports()` so ESM `import vm from "node:vm"` sees the wrapped functions too. It rewrites the
filename two ways:
- **A relative filename that exists** under the repo root, or under `js/`, becomes absolute.
- **No filename:** the source's sha1, computed both raw and after the `^const`→`var` rewrite, is looked up in an
  index of `js/**/*.js`. When the harness appends text (for example `cam-avoid`'s `\nthis.exported = CamAvoid;`),
  the lookup uses a hash of the first 400 characters instead. A match becomes absolute.

It is opt-in through `NODE_OPTIONS=--require=…`, so CI and every unmodified run behave exactly as before. Results
of `url: file:///…` breakpoints:

| test | without preload | with preload | preload counters |
|---|---|---|---|
| `brake-cue` (no filename) | 0 hits | **64** | hashFixed 2 |
| `ai-drive` (relative) | 0 hits | **4** | relFixed 26, hashFixed 1, unknown 8 |
| `audio-tune` (bare `rivals.js`) | 0 hits | **1** (top-level line 26) | relFixed 209, hashFixed 4, unknown 107 |
| `cam-avoid` (no filename + appended export) | 0 hits | hashFixed 6, unknown 0 | — |

The "unknown" scripts are short expressions such as `vm.runInContext("Tracks.LIST", ctx)` and snippets cut out of
a file. They are not whole files and do not need a name.

With the preload, test-runner coverage lists `brake-cue.js`. Every test passed with and without the preload; the
sample sweep is in §Sweep.

**Recommendation:** ship the preload as `vm-debug-preload.cjs` (proposed home: `tools/lib/`) with an `npm run debug:unit -- <file>`
wrapper. It is cheap, needs no test edits, and serves both the debugger and coverage. Then migrate the shared
helpers to absolute filenames (`path.join(ROOT, rel)`), so that ordinary runs and CI coverage get file URLs too.
That second step touches `tests/**`, so it is a pass-2 lane (issue below).

The hand-patch for helpers, as a proposed patch (not committed):

```diff
--- a/tests/helpers/seed-log.mjs
+++ b/tests/helpers/seed-log.mjs
-  vm.runInContext(LOG_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/log.js" });
+  vm.runInContext(LOG_JS.replace(/^const\b/gm, "var"), ctx, { filename: path.join(ROOT, "js/core/log.js") });
```

The same one-token change applies to the other 289 `"js/…"` literals; the 173 bare names need their real path.
A guard (`vm-filename-lint.mjs`, proposed under `tools/check/`) should then require an absolute filename on any vm call whose source
argument came from `readFileSync`, so new tests do not regress.

### How to debug a Node test today (until the MCP lands)

```sh
# 1. one file, no --test, random port; stderr prints the ws URL
NODE_OPTIONS=--require=$PWD/tools/lib/<vm-debug-preload>.cjs \
  node --inspect-brk=0 tests/unit/brake-cue.test.mjs
# 2. attach: chrome://inspect → Configure → 127.0.0.1:<port>, or VS Code "Attach" with that port,
#    or a CDP client (setBreakpointByUrl with url: file:///…/js/<path>.js, or urlRegex '(^|/)js/<path>\.js$')
# 3. narrow with --test-name-pattern only under `node --test`; a direct `node file` runs every test in it
```

The preload path in step 1 is the proposed home, not a file that exists yet (issue below). Until then, use the
scratch copy or `urlRegex`.

## Q2 — the gap map: what a breakpoint debugger cannot debug well

"Breakpoint verdict": **works** means pausing shows the bug; **partial** means it pauses at the JS call site but
the defect lives elsewhere; **useless** means pausing changes or hides the behaviour.

| subsystem | where in tree | verdict | why | use instead (exists today) | would need to build |
|---|---|---|---|---|---|
| vm-loaded game source in Node tests | 480 files calling vm; helpers in `tests/helpers/`, `tools/lib/*-vm.cjs` | **partial → works with the preload** | relative/missing `filename` gives URLs a file-path breakpoint never matches (Q1) | `urlRegex`; game-vm family already absolute | the preload (#2960), the helper migration (#2961), MCP Node targets (#2957) |
| `node --test` multi-file runs | every `npm test:*` node suite | **partial** | each file is a new child on a new port, run serially; single-attach clients hang | run one file directly with `node --inspect-brk=0` | MCP follows forwarded "Debugger listening" lines (sent to DEBUGGER-A as R3) |
| source-text-scan tests | ~206 `tests/unit` files read source and assert on text, not behaviour | **useless** (nothing executes) | the "code under test" is a string; a breakpoint can only stop in the test's regex | read the regex and failing line; `fn-source.mjs` / `game-source.mjs` helpers | a failure message that prints the matched span (lint-style), not a debugger |
| generated files | `index.html` gen-shell blocks, `sw.js`, `js/roster.js`, `js/track/circuit-meta.js`, `version.json`, … | **partial** | a breakpoint in a generated file shows output, not the generator's decision; edits are refused | break in the generator (`tools/gen/*.mjs`, plain Node: debuggable as above); `npm run gen:check` names drift | none — debug the generator |
| GLSL shaders (GLX, TLX/three) | `js/render/glx/shaders`, three's ShaderMaterial chunks | **useless inside the shader**, partial at the GL call | GPU code has no JS frames; GL errors are async and `getError` stalls | `getShaderInfoLog`; `WEBGL_debug_shaders.getTranslatedShaderSource`; Spector.js capture (`captureCanvas`); webgl-lint for NaN/unset uniforms | a dev-only `__apex.glCapture()` that injects Spector into the debug Chrome; a `glLint` toggle that loads webgl-lint |
| WGSL / WebGPU (WGX) | `js/render/webgpu/*.js` (19 error-scope / compilation-info sites already) | **partial** | validation errors resolve later on the GPU timeline; the paused call site rarely shows the cause; no WGSL printf | `pushErrorScope`/`popErrorScope`, labels + `pushDebugGroup`, `getCompilationInfo`; Dawn `--enable-dawn-features=dump_shaders,disable_symbol_renaming`; webgpu-inspector capture; `gpu-census.yml` on real GPUs | labels on every WGX object (cheap, shippable); a debug-storage-buffer "printf" pattern for one shader at a time |
| SwiftShader-only behaviour | every CI and container render | **partial** | the software rasteriser differs from real GPUs in precision, limits and timing; pausing proves nothing about a player's GPU (AGENTS.md) | `chrome://gpu`, `GL_RENDERER` string; `gpu-census.yml` on macOS | nothing local — dispatch real-GPU runners |
| Rapier wasm (debris) | `js/physics/debris-world.js` → `vendor/rapier-0.19.3/rapier.mjs` | **useless inside wasm**, works at the JS boundary | no DWARF and no name section; DevTools only steps disassembly; DevTools-open wasm runs in an unoptimised tier, which skews timing | assert on JS-visible world state; Rapier `world.debugRender()` lines; `DebrisWorld` hooks via `__apex` | a `__apex.debris()` snapshot of body poses per step; repro in Rust upstream only if needed |
| WebAudio graph and timing | `js/audio/*.js` (no AudioWorklet in tree) | **partial** | a main-thread pause does not stop the audio render thread, so scheduled ramps keep playing and the paused state is not what the ear hears | DevTools WebAudio panel (render capacity); `about://tracing` `webaudio`/`audio-worklet` categories; the vm `fake-audio` harness; `OfflineAudioContext` sample assertions | an `OfflineAudioContext` render test for engine pitch and layers |
| WebRTC / Nostr netplay timing | `js/net/*.js` | **partial** (signalling logic fine, live link not) | pausing stalls app heartbeats and the Nostr websocket; the remote peer times out; ICE consent expires 30 s after the last check (RFC 7675) | logpoints; `chrome://webrtc-internals` dump; `getStats()` series; `tests/helpers/network-adversary.mjs` | a `__apex.netTrace()` ring buffer of messages with timestamps |
| Service worker | `sw.js` (generated block) | **works, awkwardly** | a separate target that the browser stops when idle; generated cache list | DevTools Application panel, `chrome://serviceworker-internals`; Playwright `context.serviceWorkers()`; js-debugger worker targets (#2534 T7) | `Target.setAutoAttach{waitForDebuggerOnStart}` in the MCP for SW start |
| Web Workers | `js/track/build-client.js`, `js/workers/bitmap-decode-client.js` | **works** | ordinary JS targets; break at start needs auto-attach | js-debugger worker targets; DevTools Threads pane | none beyond auto-attach |
| rAF frame loop, live driving | `js/game.js` `tick`/`tickBody`/`update` | **useless live**, works when stepped | a pause makes the next rAF delta huge, so physics catch-up, audio sync and net timers all jump | `__apex.freeze()` + `headless()` + `step()` (deterministic stepping, DEBUG-HOOKS §Physics control); logpoints; `performance.measure` / `console.timeStamp` custom tracks; Playwright `page.clock` | `console.timeStamp` tracks around update/render phases (4 mark sites today) |
| physics VM determinism | `tests/unit/*determinism*-vm`, `agent-determinism.spec.js` | **partial** | a breakpoint shows one step; divergence is a difference between two runs | diff two post-reset snapshots (DEBUG-HOOKS); the game-vm harness, which is debuggable by file URL today | a per-step state-hash trace with a first-divergent-step bisect tool |
| WebXR | `js/xr/*.js` | **partial** | a real immersive session drops frames while paused; no headset in CI | IWER emulation (`tests/helpers/iwer-install.mjs`); Quest remote `chrome://inspect/#devices` | IWER-recorded input playback for XR specs |
| Playwright spec code (Node side) | `tests/specs/*.spec.js` | **works** for the spec, partial for the page | page code needs CDP or headed mode; pausing a spec stalls a SwiftShader frame budget | trace viewer (`trace: 'retain-on-failure'`), `DEBUG=pw:api`, `page.pause()` (headed only) | none — keep traces as the CI artifact |

## Q3 — ranked recommendations

| # | recommendation | value | cost | owner area | model | issue |
|---|---|---|---|---|---|---|
| R1 | ship the opt-in `vm-debug-preload.cjs` (proposed home: `tools/lib/`) and `npm run debug:unit -- <file>` (prototype above) | high: every vm test becomes file-path debuggable and coverable, with no test edits | S (~60 lines plus one unit test) | tools/lib | Sonnet | #2960 |
| R2 | migrate the shared helpers and `"js/…"` literals to absolute filenames, plus a `vm-filename-lint` guard | high: CI coverage of vm code and debuggable ordinary runs | M (~460 call sites, mechanical; one codemod) | tests/helpers, tests/unit | Sonnet | #2961 |
| R3 | js-debugger MCP Node targets: launch `--inspect-brk=0`, auto-detach on "Waiting for the debugger to disconnect", follow `--test` children, `urlRegex` file matching, condition-based logpoints, resolved-location reporting | high: replaces the hand-rolled CDP clients | M | tools/mcp (DEBUGGER-A, #2957) | Opus | sent to DEBUGGER-A, tracked in #2957 |
| R4 | agent guidance: a "Debug a Node test" section in the js-debugger skill and `docs/TESTING.md` (the recipe above, the URL table, the cost table) | med: stops re-discovery | S | .claude/skills, docs | Sonnet | #2962 |
| R5 | determinism bisect: per-step state-hash trace in game-vm plus a first-divergent-step finder | med: determinism reds are the hardest to debug | M | tools/lib/game-vm.cjs, tools/check | Opus | #2963 |
| R6 | GPU capture hooks: label every WGX object, and a dev-only Spector/webgl-lint loader for the debug Chrome | med: shader and GL-state bugs have no tool today | M | js/render (renderer lanes) | Opus | #2964 |
| R7 | timeline instrumentation: `performance.measure` with `detail.devtools` tracks around update/render/audio phases | low–med: frame-loop timing without pausing | S | js/game.js (claim needed) | Opus | #2965 |
| R8 | `OfflineAudioContext` render test for engine pitch and layers | low–med | S | tests/unit, js/audio | Sonnet | #2966 |

R1, R2 and R3 together close the #2952 gap. The rest map the remaining blind spots to the tools that see them.

## Sweep

Sweep in progress: every 12th `tests/unit` file (71 files), each run with and without the preload; results land at the next push.

## Reproduce

```sh
# URL forms and hits (scratch client; any CDP client works)
node --inspect-brk=0 tests/unit/ai-drive.test.mjs   # stderr: ws://127.0.0.1:<port>/<uuid>
# filename census
grep -rhoE "filename: *[^,})]+" tests tools | sort | uniq -c | sort -rn | head
# coverage drop
node --test --experimental-test-coverage tests/unit/ai-drive.test.mjs | sed -n '/# file/,/# all files/p'
```

## Appendix — the preload prototype

```js
"use strict";
// Prototype (not committed): opt-in preload that makes vm-loaded game source debuggable.
//   NODE_OPTIONS="--require ./tools/lib/<vm-debug-preload>.cjs" node --inspect-brk=0 tests/unit/<file>.test.mjs
// 1. relative filename that exists under ROOT  -> absolute (V8 reports file:// URL)
// 2. no filename: sha1 of the source (raw or `const`->`var`) matched against js/**/*.js -> absolute
// Line numbers are unchanged; columns shift by 2 on top-level `const` lines (the harness rewrite).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { syncBuiltinESMExports } = require("module");

const ROOT = path.resolve(__dirname, process.env.APEX_VM_DEBUG_ROOT || "../..");
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");
let index = null;
function byHash(src) {
  if (!index) {
    index = new Map();
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!/vendor|three/.test(e.name)) walk(p); continue; }
        if (!e.name.endsWith(".js")) continue;
        const t = fs.readFileSync(p, "utf8");
        for (const v of [t, t.replace(/^const\b/gm, "var")]) { index.set(sha(v), p); if (v.length > 400) index.set("p:" + sha(v.slice(0, 400)), p); }
      }
    };
    walk(path.join(ROOT, "js"));
  }
  const s = String(src);
  return index.get(sha(s)) || (s.length > 400 ? index.get("p:" + sha(s.slice(0, 400))) : undefined);
}
const stats = { abs: 0, relFixed: 0, hashFixed: 0, unknown: 0 };
function fix(src, opts) {
  const o = typeof opts === "string" ? { filename: opts } : { ...(opts || {}) };
  const f = o.filename;
  if (f && path.isAbsolute(f)) { stats.abs++; return o; }
  if (f && !/^evalmachine/.test(f)) {
    for (const cand of [path.join(ROOT, f), path.join(ROOT, "js", f)]) {
      if (fs.existsSync(cand)) { o.filename = cand; stats.relFixed++; return o; }
    }
  }
  const hit = typeof src === "string" && src.length > 200 ? byHash(src) : null;
  if (hit) { o.filename = hit; stats.hashFixed++; } else stats.unknown++;
  return o;
}
const wrap = (name, argIdx) => {
  const orig = vm[name];
  vm[name] = function (...a) { a[argIdx] = fix(a[0], a[argIdx]); return orig.apply(this, a); };
};
wrap("runInContext", 2);
wrap("runInNewContext", 2);
wrap("runInThisContext", 1);
const OrigScript = vm.Script;
vm.Script = class Script extends OrigScript { constructor(src, opts) { super(src, fix(src, opts)); } };
syncBuiltinESMExports();
if (process.env.APEX_VM_DEBUG_STATS) process.on("exit", () => process._rawDebug("vm-debug-preload " + JSON.stringify(stats)));
```

## Sources

Node.js:
- CLI flags (`--inspect*`, `--test-isolation`, `NODE_V8_COVERAGE`, `NODE_OPTIONS`): https://nodejs.org/api/cli.html
- inspector module, same-thread Session caveat: https://nodejs.org/api/inspector.html
- test runner, `inspectPort`, coverage: https://nodejs.org/api/test.html
- vm `filename`, `cachedData`, `sourceMapURL`: https://nodejs.org/api/vm.html
- `node inspect`, and the v26.1 `--probe`: https://nodejs.org/api/debugger.html
- debugging guide, `/json/list`, chrome://inspect: https://nodejs.org/en/learn/getting-started/debugging
- runner source (inspector port per child, filtered args): https://raw.githubusercontent.com/nodejs/node/v24.x/lib/internal/test_runner/runner.js and https://raw.githubusercontent.com/nodejs/node/v20.x/lib/internal/test_runner/runner.js
- runner utils (concurrency): https://raw.githubusercontent.com/nodejs/node/v24.x/lib/internal/test_runner/utils.js
- NodeWorker, Target and NodeRuntime domains: https://raw.githubusercontent.com/nodejs/node/v24.x/src/inspector/domain_node_worker.pdl, https://raw.githubusercontent.com/nodejs/node/v24.x/src/inspector/domain_target.pdl, https://raw.githubusercontent.com/nodejs/node/v24.x/src/inspector/domain_node_runtime.pdl
- vm debugger support history: https://github.com/nodejs/node/issues/7593

Chrome DevTools Protocol, V8 and DevTools:
- protocol: https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json, https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json, https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl, https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl
- V8 code coverage: https://v8.dev/blog/javascript-code-coverage
- breakpoints and logpoints: https://developer.chrome.com/docs/devtools/javascript/breakpoints
- Sources reference: https://developer.chrome.com/docs/devtools/javascript/reference
- Performance panel: https://developer.chrome.com/docs/devtools/performance/reference
- extensibility tracks: https://developer.chrome.com/docs/devtools/performance/extension

Editors and other runners:
- VS Code Node debugging: https://code.visualstudio.com/docs/nodejs/nodejs-debugging
- js-debug options: https://raw.githubusercontent.com/microsoft/vscode-js-debug/main/OPTIONS.md
- js-debug bootloader: https://raw.githubusercontent.com/microsoft/vscode-js-debug/main/src/targets/node/bootloader.ts
- VS Code DWARF: https://github.com/microsoft/vscode-dwarf-debugging
- Jest: https://jestjs.io/docs/troubleshooting
- Vitest: https://vitest.dev/guide/debugging

Agent debugger MCPs:
- https://github.com/ScriptedAlchemy/devtools-debugger-mcp
- https://glama.ai/mcp/servers/qckfx/node-debugger-mcp
- https://github.com/ChromeDevTools/chrome-devtools-mcp

WebGL:
- https://github.com/BabylonJS/Spector.js
- https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_shaders/getTranslatedShaderSource
- https://github.com/greggman/webgl-lint
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/debugging_gpu_related_code.md
- https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
- https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ
- https://github.com/google/swiftshader
- https://developer.chrome.com/blog/supercharge-web-ai-testing

WebGPU:
- https://toji.dev/webgpu-best-practices/error-handling
- https://developer.mozilla.org/en-US/docs/Web/API/GPUShaderModule/getCompilationInfo
- https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/debugging.md
- https://github.com/brendan-duncan/webgpu_inspector
- https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips

WebAssembly:
- https://developer.chrome.com/blog/wasm-debugging-2020
- https://developer.chrome.com/docs/devtools/wasm
- https://developer.chrome.com/blog/wasm-debugging-2019
- https://rustwasm.github.io/docs/book/reference/debugging.html
- https://rapier.rs/docs/user_guides/javascript/getting_started_js/

Audio:
- https://developer.chrome.com/docs/devtools/webaudio
- https://web.dev/articles/profiling-web-audio-apps-in-chrome
- https://developer.chrome.com/blog/audio-worklet
- https://developer.chrome.com/blog/audio-worklet-design-pattern
- https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext

WebRTC:
- https://webrtc.ventures/2025/02/a-quick-tour-of-webrtc-internals-a-powerful-webrtc-debugging-tool/
- https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats
- https://github.com/fippo/webrtc-dump-importer
- https://github.com/rtcstats/rtcstats
- https://www.rfc-editor.org/rfc/rfc7675

Workers and service workers:
- https://developer.chrome.com/docs/devtools/progressive-web-apps
- https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker
- https://playwright.dev/docs/service-workers
- https://playwright.dev/docs/api/class-worker

Playwright:
- https://playwright.dev/docs/debug
- https://playwright.dev/docs/trace-viewer
- https://playwright.dev/docs/api/class-tracing
- https://playwright.dev/docs/test-ui-mode
- https://playwright.dev/docs/release-notes
- https://playwright.dev/docs/api/class-browsertype
- https://playwright.dev/docs/api/class-cdpsession
- https://playwright.dev/docs/api/class-coverage
- https://playwright.dev/docs/api/class-clock

Timing and determinism:
- https://gafferongames.com/post/fix_your_timestep/
- https://gafferongames.com/post/deterministic_lockstep/
- https://docs.replay.io/
- https://rr-project.org/

WebXR:
- https://github.com/meta-quest/immersive-web-emulator
- https://meta-quest.github.io/immersive-web-emulation-runtime/
- https://github.com/MozillaReality/WebXR-emulator-extension
- https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/
