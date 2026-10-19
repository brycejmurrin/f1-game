# js-debugger improvements — 2026-10-19

Session: debugger-A (PR #2967, `Closes #2957`). Brief from Bryce, 2026-10-19 ~04:46Z: test the
js-debugger hard, research how to improve it (parallel work, fewer tool calls), and build the
high-value fixes. Measured on Node v22.22.0 and the container's Chromium 1194 (`debug-chrome.mjs`,
software GL). Tool reference: `docs/research/AGENT-JS-DEBUGGER-MCP.md` §Node tests and processes.

## Bugs found (live, with repro)

| # | Bug | Repro | Status |
|---|---|---|---|
| B1 | #2957: Node inspectors invisible | `node --inspect-brk=127.0.0.1:9301 x.cjs`; `debugger_targets {endpoint:"http://127.0.0.1:9301"}` returned `[]` (filter knew only page/worker/service_worker; attach refused `file://`) | **Fixed**: `type:"node"` in the default listing; attach allows `file://`; attach sends `Runtime.runIfWaitingForDebugger`, so an `--inspect-brk` process stops at `Break on start` |
| B2 | Logpoint expressions naming `G`, `R`, `L`, `v`, `s` or `e` read the WRONG variable | `debugger_logpoint` at `js/agent/apex.js:382` with `G.state` recorded `"undefined"` three times: the condition declared `var G=globalThis,R,L,v,s` around the expression, shadowing the game's `G` façade (every module's `G`) | **Fixed**: helpers `__apexDbg`-prefixed, expression in an arrow; regression over nine names (`js-debugger-node` test) |
| B3 | A pause caused by another client looks like your own | Two clients (stdio MCP + HTTP daemon) on one page with the same breakpoint: B's `debugger_run` paused A too, A's state showed it as a normal pause, and A's resume would release B | **Fixed**: every pause has `cause` (`breakpoint` / `step` / `exception` / `start` / `unowned: … ANOTHER debugger client`); attach warns when another live js-debugger session registered on the target (page-global registry with pid liveness). `Target.getTargets` `attached` was tried first and rejected: `debug-chrome.mjs _hold` keeps its own socket, so it is always true |
| B4 | A dedicated worker with `url:""` refused | `debugger_targets targetType:"all"` listed `type:"worker", url:""`; attach: "Refusing to attach : the debugger only attaches pages…" | **Fixed** the gate. That particular worker then answered no CDP command, direct or through `Target.attachToTarget {flatten:true}` (neither game worker has an empty URL; it looks like a worker that never finished loading). Attach now says so instead of a bare timeout. **Not fixed**: no way to debug such a worker |
| B5 | Step / pause replies carry no pause | `debugger_control over` returned `paused:false`; the next `debugger_state` showed the new pause. One wasted call per step, and agents misread the ack | **Fixed**: steps and `pause` wait up to `waitMs` (default 1500) for the new pause and return its token |
| B6 | Operation status contradicts pause state after a step | After `over`, the reply said `paused:false` while `operations[0].status:"paused"` | **Fixed** (`markOperations` on the local reset) |
| B7 | Exact-URL breakpoints break on the cache-busting query | `js/agent/apex.js?v=dev` (shell) vs `?v=1695` (deferred); `debugger_source {url:"…apex.js?v=dev"}` failed although the script was parsed | **Fixed**: a URL without a query (or a bare `js/agent/apex.js`) becomes a `urlRegex` matching any `?v=`; `debugger_source` ignores the query too |
| B8 | Idle service worker vanishes; error said "Unknown page targetId" | SW listed, then gone ~30 s later | Message fixed (names SW idling / Node exits). Behaviour is Chrome's |
| B9 | `debugger_state` is ~3 KB per pause | Every scope handle of every frame, plus the breakpoint list, on each read | **Mitigated**: `debugger_break` returns stack strings and locals as values. State unchanged (contract) — see next ideas |
| B10 | Stale ops survive detach | `debugger_state` after detach still lists the previous target's operations | Not fixed (cosmetic) |
| B11 | Shell client deadline 35 s | A long `call` timed out client-side | Fixed for `debugger_node_test` (660 s); others unchanged |

Checked and fine: conditional breakpoints, stale-token refusal after a step, `debugger_properties`
pagination, uncaught-exception pause, daemon SIGTERM cleanup (`cleanupErrors: []`), detach/reattach.

Found while building `debugger_node_test` (fixed before push): a probe pause shared by two probes at
one resolved location credited the wrong probe; a spawned run inherited the parent's
`NODE_TEST_CONTEXT` (inside `node --test`, the child reported to a runner that was not there); a
single stderr chunk carrying the inspector URL was missed (listener order).

## Research (sources)

Full digest with every claim sourced: `scratch/js-debugger-research.md` (git-ignored; this section
keeps what was used).

- **Node inspector.** `/json/list` returns `type:"node"`, a UUID `id`, `file://` url and
  `webSocketDebuggerUrl`; `--inspect=0` picks a port printed only on stderr
  (`Debugger listening on ws://…`); `--inspect-publish-uid=http` hides that line.
  https://nodejs.org/api/cli.html · https://nodejs.org/api/debugger.html
- **`node --test` + inspector.** Inspector flags force concurrency 1; each child gets
  `--inspect-port` = parent debug port + counter and the runner relays the children's banner lines.
  Measured: with `--inspect-brk=PORT --test`, the child listens on PORT, the parent does not.
  https://raw.githubusercontent.com/nodejs/node/main/lib/internal/test_runner/runner.js ·
  https://raw.githubusercontent.com/nodejs/node/main/lib/internal/util/inspector.js ·
  https://nodejs.org/api/test.html
- **Child processes.** `NodeWorker.*` covers worker_threads only; `Target.setAutoAttach` in Node is
  behind `--experimental-worker-inspection` and answered -32601 on 22.22.
  https://raw.githubusercontent.com/nodejs/node/main/src/inspector/domain_node_worker.pdl ·
  https://raw.githubusercontent.com/nodejs/node/main/src/inspector/domain_target.pdl
- **VS Code js-debug auto-attach.** `NODE_OPTIONS=--require bootloader`; the bootloader opens the
  inspector on a random port, reports it, waits for the debugger.
  https://raw.githubusercontent.com/microsoft/vscode-js-debug/main/src/targets/node/bootloader.ts ·
  https://raw.githubusercontent.com/microsoft/vscode-js-debug/main/src/targets/node/bootloader/environment.ts ·
  breakpoint pre-resolution: https://raw.githubusercontent.com/microsoft/vscode-js-debug/main/src/adapter/breakpointPredictor.ts
- **CDP.** `setBreakpointByUrl` (`url`/`urlRegex`, `condition`), `Runtime.addBinding` →
  `Runtime.bindingCalled` (measured: works in Node and survives process exit),
  `Profiler.takePreciseCoverage` returns character ranges (needs a line table),
  `Target.setAutoAttach {autoAttach, waitForDebuggerOnStart, flatten, filter}` is not recursive.
  https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/js_protocol.pdl ·
  https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl
- **Other debugger MCPs.** Batching exists in a few (`setBreakpointsBatch`, binding logpoints,
  replayable action sequences); none had a run-tests-with-probes call.
  https://github.com/VitalyOstanin/mcp-chrome-debugger-protocol · https://github.com/debugmcpdev/mcp-debugger ·
  https://github.com/InDate/cdp-tools-mcp · https://github.com/qckfx/node-debugger-mcp ·
  https://github.com/johngrimes/mcp-js-debugger · https://github.com/ScriptedAlchemy/devtools-debugger-mcp ·
  https://github.com/Digital-Defiance/mcp-debugger-server ·
  Chrome DevTools MCP has no breakpoint tools: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- **Agent practice.** debug-gym: pdb access raised a strong model's SWE-bench Lite score
  (37.2 % → 48.4 %, 52.1 % when unlocked after edits) while weaker models did worse with it from
  the start — tool access helps only when each call answers a question.
  https://www.microsoft.com/en-us/research/blog/debug-gym-an-environment-for-ai-coding-tools-to-learn-how-to-debug-code-like-programmers/ ·
  https://arxiv.org/html/2503.21557 · ChatDBG (one query fixed 67 %): https://arxiv.org/html/2403.16354v2

## What was built and why

1. **Node targets (#2957)** — the 11 #2952 reviewers were hand-rolling CDP clients for this.
2. **`debugger_node_test`** — the reviewers' real question ("which lines ran, how often, with what
   values, did the test pass") in ONE call, for up to 8 files at once. Each file gets its own
   kernel-chosen inspector port and socket (no port races, true parallelism). Probes are
   conditional breakpoints that count and emit through `Runtime.addBinding`; an exit hook flushes
   exact counts; `captureLocals` pauses only the first N hits. `runner:"test"` and `children:true`
   reuse js-debug's bootloader design (`tools/mcp/js-debugger-boot.cjs`; it skips when its owner
   pid is dead, so a crashed runner cannot hang a test). Measured live: two repo test files
   (`js-debugger-trace`, `js-debugger-lifecycle-fixes`) in parallel, ~0.5 s each, exact counts,
   locals of `recordException`.
3. **`debugger_break`** — set → run → (state)×2 → properties → resume was 5–6 calls; now 1, with
   values instead of handles. On a paused target without a trigger it runs to the next pause (the
   attach → Break on start → first hit path for Node).
4. **`debugger_collect`** — logpoint + trigger + read + remove in one call.
5. **B2–B7 fixes** above.

Round trips, measured on the tasks this session ran: page "stop in `info()` and show locals"
6 → 1; Node test "count hits and values in two files" (impossible before, hand-rolled CDP) → 1;
interactive Node child attach → targets, attach, break, detach = 4.

## Ranked next ideas

1. **Coverage in one call** — `Profiler.startPreciseCoverage {callCount, detailed}` around a
   `debugger_node_test` run, mapped to lines with a line-start table: "which branches of this file
   did the test hit". Highest value for test reviews.
2. **Compact `debugger_state`** (B9) — stack strings + top-frame scope ids by default, full frames
   on `detail:true`; most reads only need the token and location.
3. **Named sessions in one daemon** — a `session` argument so parallel agents (or one agent with a
   page and a Node process) each hold an attached target without a second daemon port.
4. **Blackbox `node:` internals** (`Debugger.setBlackboxPatterns`) so `into` never lands in the
   test runner.
5. **Page workers via `Target.setAutoAttach`** on the page session (flatten), covering workers
   that cannot be reached through their own socket (B4).
6. **`debugger_node_test` exceptions → captures** (locals at the throw site), and a
   `breakOnFailure` that captures the failing assertion's frame.
7. Clear operations on detach (B10).
