# Agent JavaScript debugger MCP

`tools/mcp/js-debugger-mcp.mjs` supplies the source debugger operations missing
from the existing Chrome DevTools MCP: breakpoints, pause/resume, step
over/into/out, call-frame evaluation, scope descriptors and exception pauses.
It attaches to one existing Chrome page through CDP. It never launches Chrome,
closes the browser, starts a test group, or edits application source.

## Setup

Requires Node 22+ (native WebSocket/fetch) and Bash for the shell wrapper; no
additional npm package or build. The direct Node stdio entrypoint remains
available on machines without Bash.
The project registers `js-debugger` in Claude Code's root `.mcp.json` and
Cursor's `.cursor/mcp.json`. Claude's enabled-server list, Cursor Cloud's launch
allowlist and Codex's `.codex/config.toml` mirror the same entry. Reload the MCP
client after pulling this change; workspace trust and Cloud dashboard attachment
still apply (see `docs/AGENT-SURFACE.md`). The server starts unattached and never
launches Chrome by itself.

For another project, copy the entry from `tools/mcp/js-debugger-mcp.json` into
its local MCP configuration. Use an absolute script path if the client's
working directory is not the repository root:

```json
{
  "mcpServers": {
    "js-debugger": {
      "type": "stdio",
      "command": "bash",
      "args": ["/absolute/path/to/f1-game/tools/mcp/js-debugger-mcp.sh", "serve"]
    }
  }
}
```

Serve the local game using the usual repository workflow. Start a dedicated
Chrome with remote debugging, using your platform's Chrome executable:

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir=/absolute/path/to/f1-game/scratch/debug-chrome
```

In the Cloud container use the discovered Chromium (`node tools/lib/chromium-path.mjs --path`,
normally `/opt/pw-browsers/chromium-*/chrome-linux/chrome`), headless and without a sandbox:

```sh
"$(node tools/lib/chromium-path.mjs --path)" --headless=new --no-sandbox --remote-debugging-port=9222 \
  --user-data-dir=scratch/debug-chrome http://127.0.0.1:3456/ &
```

Navigate that browser to `http://127.0.0.1:3456/`. Only attach to an authorized
local reproduction in this dedicated profile. The debugger supports HTTP
loopback pages, `about:blank`, their workers and service workers, and local Node
inspectors (`node --inspect-brk=PORT`, see [Node](#node-tests-and-processes)); not GitHub Pages,
browser extensions or remote hosts. `debugger_targets` lists candidate page IDs;
`debugger_attach` requires the exact ID. Discovery and the page WebSocket must
use the same loopback host/port; redirects and credential-bearing URLs fail.

This is local stdio, not a hosted ChatGPT connector. Configure/reload the MCP
client to make its tools available; starting a subprocess alone does not add
tools to an already-running chat. No account plugin upload is required.

## Separate server with the project wrapper pattern

The debugger is its own server, with its own `debugger_*` namespace. It is not
embedded in `apex-tools`, and does not change that server's catalog or session.
The wrapper resolves its repository root so it also works from another working
directory:

```sh
./tools/mcp/js-debugger-mcp.sh help
./tools/mcp/js-debugger-mcp.sh list-tools
./tools/mcp/js-debugger-mcp.sh serve       # MCP client owns this stdio process
```

When the host cannot load a custom MCP catalog, shell commands use a persistent
loopback daemon. Start it in a dedicated terminal and keep it running:

```sh
./tools/mcp/js-debugger-mcp.sh serve-http
```

Then make separate calls from the agent's shell:

```sh
./tools/mcp/js-debugger-mcp.sh status
./tools/mcp/js-debugger-mcp.sh call debugger_targets '{"endpoint":"http://127.0.0.1:9222"}'
./tools/mcp/js-debugger-mcp.sh call debugger_attach '{"endpoint":"http://127.0.0.1:9222","targetId":"<returned page id>"}'
./tools/mcp/js-debugger-mcp.sh call debugger_state '{}'
./tools/mcp/js-debugger-mcp.sh call debugger_detach '{}'
```

The daemon owns one `DebugSession`; each `call` is only a client. Attachments,
breakpoints, pending operations and pause tokens therefore survive the shell
client exiting. A missing daemon is an error, never an implicit new session.
`list-tools` is local and needs no daemon; `status` checks the daemon. Tool errors
produce a nonzero shell exit and JSON error details.

The bridge binds only `127.0.0.1:3714`, leaving the existing project ports alone.
Set `APEX_DEBUGGER_PORT` consistently on daemon and callers to change it. It
rejects browser Origin headers, non-loopback Host headers, non-JSON POST bodies
and oversized requests. `/healthz` reports health; `/mcp` accepts JSON-RPC POSTs.
No SSE stream or remote hosting is provided. The local agent and daemon share
one debugger controller; this is not a multi-user service.

Use either stdio or daemon mode for a target; starting both creates independent
controllers. Neither launches Chrome or acquires ownership of an existing
browser. Respect the parent's browser lock, detach when finished, then stop the
daemon with Ctrl-C/SIGTERM. Shutdown attempts breakpoint/exception cleanup and
resume before closing CDP, and reports failures. Abrupt process termination
cannot guarantee cleanup.

## Tool reference

These are the names exposed by the separate `js-debugger` server. In shell
mode, pass the same name and a JSON argument object to the wrapper's `call`.

| Tool | Use |
| --- | --- |
| `debugger_targets` | List targets at a loopback Chrome or Node inspector endpoint. Default: pages and `node` targets; `targetType: service_worker\|worker\|node\|all` (each has its own WebSocket; attach works the same, `blob:` and url-less worker URLs included). |
| `debugger_attach` | Attach the exact selected target ID (page, worker, service worker, Node); does not launch Chrome. Warns when another client already holds the page (`Target.getTargets` `attached`). A Node `--inspect-brk` process is released and stops at `Break on start`. |
| `debugger_break` | **Workflow, one call:** set breakpoints, run an optional `trigger`, wait for the first pause, return `cause`, `stack` and the top frames' locals as values. Leaves the target paused with `token`, or `resume:true` resumes and removes them. Replaces breakpoint → run → state → state → properties. |
| `debugger_collect` | **Workflow, one call:** set logpoints, run `trigger`, wait, return hit counts and values, remove the logpoints. |
| `debugger_node_test` | **Workflow, no attach:** run up to 8 Node test files under the inspector in parallel with probes (counts, values, locals captures) and exception records; returns exit code, TAP pass/fail and failing test names. See [Node](#node-tests-and-processes). |
| `debugger_state` | Read attachment, current pause token/stack/scopes and background operation status. Adds `detached: "target gone: …"` after a lost target and `pageUnresponsive` (+`pageNote`) when a run pending > 2 s blocks the page. |
| `debugger_incident` | After an exception, save its latest log entry, current `__apex` scene state, and a JPEG of the attached local page in `scratch/debug-incidents/`. Returns links to the image and JSON report. It rechecks the current URL before and after capture, refusing a page that navigated away from loopback. The page must be running; the image is taken *after* the exception, so it is not the failing frame. No browser is launched. |
| `debugger_scripts` | Find parsed script IDs. Named URLs first; anonymous/eval scripts hidden unless `includeAnonymous:true`; `filter` is a substring (`regex:true` for a regex). Reports `total` and `truncated` (200-row cap). |
| `debugger_source` | Read a bounded source excerpt using one-based line numbers. Needs a `scriptId` (from `debugger_scripts`, or a stack frame in `pause.frames[].scriptId`), never a URL. |
| `debugger_breakpoint` | Set an exact-URL breakpoint with one-based line/column and optional condition. Setting the same location again removes the old CDP breakpoint by id first. `locations:[]` returns a `warning` with the exact parsed URLs to try. |
| `debugger_remove_breakpoint` | Remove a breakpoint owned by this debugger session. |
| `debugger_control` | Request pause, resume, step over/into/out, or `cancel` (`Runtime.terminateExecution`: ends the running script, marks pending ops `cancelled`); inspect state afterward. |
| `debugger_exceptions` | Set exception pauses to `none`, `uncaught` or `all`. |
| `debugger_evaluate` | Inspect an expression in a paused frame; side effects require explicit opt-in. |
| `debugger_properties` | Read current-pause object property descriptors without invoking getters. |
| `debugger_run` | Trigger JavaScript without blocking later inspect/resume calls. **Always mutating**: it has no `allowSideEffects` (only `debugger_evaluate` has one, default off). A new run abandons a pending/unknown one. |
| `debugger_logpoint` | Non-pausing breakpoint recording an expression per hit into a bounded page-side ring (NaN tracing in hot loops). |
| `debugger_logpoint_read` | Read (optionally clear) logpoint hits: total count plus the newest values. |
| `debugger_exception_log` | `start`/`read`/`clear`/`stop`: collect caught and uncaught exceptions without pausing (auto-resume). |
| `debugger_listeners` | Count event listeners by type on `window`, `document` or a selector. |
| `debugger_instances` | Count live objects for a constructor/prototype expression (`Runtime.queryObjects`). |
| `debugger_detach` | Remove owned breakpoints, reset exception mode, release objects and attempt resume/detach. |

For game bugs, first reproduce with `__apex` hooks (see `docs/DEBUG-HOOKS.md`).
Use this debugger when the next useful evidence is a branch decision, stack or
local variable. A breakpoint pauses page JavaScript, so animation, UI updates
and other page evaluations may wait until resume. Do not queue browser actions
that depend on the page's event loop while it is paused.

## Agent workflow

For the task workflow and measured traps, load the project skill
[JavaScript debugger](../../.claude/skills/js-debugger/SKILL.md).

1. `debugger_targets {endpoint:"http://127.0.0.1:9222"}`; then
   `debugger_attach {endpoint:"http://127.0.0.1:9222",targetId:"<id>"}`.
2. `debugger_scripts {filter:"game.js"}` and `debugger_source` identify a
   statement. Set `debugger_breakpoint {url:"<exact script URL>",line:123}`.
   All source lines/columns are **one-based**; frame indices are **zero-based**.
3. Trigger the action with `debugger_run {expression:"<authorized JS>"}`.
   This returns immediately with an operation ID. A breakpoint inside the
   expression must not prevent the next agent request from running.
   Set `awaitPromise:true` to wait for an async expression in that background
   operation. Without it, completed means the expression returned, not that
   every task or returned Promise has finished.
4. Read `debugger_state`. When paused, use the returned `pause.token` with
   `debugger_evaluate`, `debugger_properties`, and `debugger_control`.
   Inspect scope objects via their `objectId`; property getters are not invoked.
5. `debugger_control {action:"over",pauseToken:"<current token>"}` steps.
   Read state again: acknowledgments are not pause evidence. A new pause has a
   new token. Resume, reload, context destruction and detach invalidate handles.
   If an iframe is destroyed while paused, the replacement token remains
   resumable but has no inspectable frames; resume and pause again to refresh.
6. `debugger_exceptions {state:"all"}` pauses on caught exceptions too;
   `uncaught` and `none` are also supported. Direct inspector evaluation catches
   its exception for the CDP response; test uncaught behavior with a real task.
7. Always call `debugger_detach`. It removes owned breakpoints, resets exception
   mode, releases evaluation groups, resumes when paused, disables and detaches.
   Check `cleanupErrors`; command acknowledgment and an observed resumed event
   are reported separately. Unexpected socket loss cannot guarantee a resume.

### Starting a pause in the game

`race()` with no argument returns `false`, and `go()` alone leaves
`state:"race"` with zero cars (#2532), so no breakpoint in the car loop fires.
Start a real race first, in one `debugger_run`, then break in the tick:

```js
debugger_run {expression:"(async()=>{ __apex.headless(true); const r = __apex.race('bahrain','day','dry'); await __apex.go(); return r; })()", awaitPromise:true}
debugger_breakpoint {url:"<game.js URL from debugger_scripts>", line:<a line in the tick>}
```

Read `debugger_state` until `paused:true`. `race()` returns `false` when the
circuit id is unknown; check `__apex.info().track` before trusting a pause.

### Slow commands under software rendering

With full software GL (SwiftShader, no GPU) each frame takes long enough that
`attach`, `detach` and `debugger_exceptions` can answer
`response timed out; execution may still be active` **although the command
applied**. Read `debugger_state` (or re-send the idempotent command) rather than
assuming failure. Call `__apex.headless(true)` first: commands then take about
0.2 s. A `Debugger.disable` timeout during `debugger_detach` is reported as
`cleanupWarnings` (closing the CDP session disables the domain anyway); a failed
`setPauseOnExceptions`, `removeBreakpoint` or `resume` stays a `cleanupErrors`
entry and `isError`.

### Lessons from real game sessions

- Discover the exact loaded URL, including its query string; a script can use a
  build suffix while another still uses `?v=dev`. Do not guess it from the file path.
- Inspect the returned line **and column** after every step. Chrome may stop at
  several executable positions on one line; one step need not finish that line.
  Resolved breakpoint locations use the same one-based `line`/`column` fields.
- Trigger an asynchronous action and its dependent probe in the same awaited
  expression when order matters. The race countdown continues while an agent
  prepares another command; `headless(true)` suppresses drawing, not simulation.
- After reload, discover scripts again and obtain fresh pause/object handles.
  Exact-URL breakpoints persist; script IDs and scoped handles do not.
  Breakpoint resolutions clear with expired scripts and update from Chrome's
  `scriptParsed.resolvedBreakpoints` or legacy `breakpointResolved` events.
  A still-unloaded matching script has no current resolved location.
- Use real game functions with explicit synthetic inputs for branch inspection,
  and label that evidence separately from a physical device or user interaction.

## Non-pausing tools (logpoints, exception log, counts)

For hot code and leak hunts, where a pause at 60 fps is useless. All run on the
attached page and need it **running** (resume first).

- **`debugger_logpoint {url,line,expression}`**: `Debugger.setBreakpointByUrl` with a
  generated condition that pushes `expression`'s value (evaluated in the frame, so
  locals work) into `globalThis.__apexDbgLog[id]` and returns `false`, so it never
  pauses. Ring size `maxHits` (default 100, max 300), values truncated at `maxChars`
  (default 200); non-finite numbers are kept as `"NaN"`/`"Infinity"`, a throwing
  expression records `!err: …`. Read with `debugger_logpoint_read {id?,clear?,limit?}`
  (`hits` is the total, `items` the newest retained). Remove with
  `debugger_remove_breakpoint {id:<breakpointId>}`. The ring dies with a reload; the
  breakpoint survives and starts a new ring.
- **`debugger_exception_log`**: `start {state:"all"|"uncaught", max}` sets
  pause-on-exceptions and auto-resumes every `exception`/`promiseRejection` pause
  (recording message, `url:line`, top-5 stack, `uncaught`, and per-message counts).
  `read`, `clear`, `stop` (resets pause-on-exceptions to `none`). While active, exception
  pauses never surface, so do not use `debugger_exceptions` for manual pauses.
- **`debugger_listeners {target,detail?}`**: `DOMDebugger.getEventListeners` on `window`,
  `document` or `document.querySelector(target)`; returns `byType` counts. Compare across restarts.
- **`debugger_instances {expression}`**: evaluates a constructor (uses `.prototype`) or
  prototype expression, then `Runtime.queryObjects` plus a `.length` read; V8 collects
  garbage first, subclasses count, the object group is released.

CDP contracts used (all from the protocol viewer
<https://chromedevtools.github.io/devtools-protocol/>; the pages are a script app,
so the machine-readable
[js_protocol.json](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json) and
[browser_protocol.json](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json)
were read for parameters):
[`Debugger.setBreakpointByUrl`/`paused`/`resume`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
(`paused.reason` includes `exception` and `promiseRejection`),
[`DOMDebugger.getEventListeners {objectId,depth?,pierce?}`](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/#method-getEventListeners),
[`Runtime.queryObjects {prototypeObjectId,objectGroup?}`](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-queryObjects),
[`Runtime.callFunctionOn`/`releaseObjectGroup`](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/).

## Node tests and processes

Added 2026-10-19 (#2957; measurements and sources: `docs/notes/JS-DEBUGGER-IMPROVEMENTS-2026-10-19.md`).

**One call per question: `debugger_node_test`.** It needs no attach and runs beside an
attached page session:

```json
{"files": ["tests/unit/js-debugger-trace.test.mjs", "tests/unit/js-debugger-node.test.mjs"],
 "probes": [{"file": "tools/x.mjs", "line": 42, "expression": "({row, n})", "captureLocals": 2},
            {"line": 17, "condition": "i === 3"}],
 "testNamePattern": "parses", "timeoutMs": 60000}
```

- Each file runs as `node --inspect-brk=127.0.0.1:0 <file>` (node:test runs a file's tests when it is
  the entry script) on its own kernel-chosen port and CDP socket, so files run in parallel
  (`concurrency`, default 4, at most 8 files). `runner:"test"` runs the real `node --test <file>`.
- A probe is a conditional breakpoint whose condition counts the hit and streams `expression` through
  `Runtime.addBinding` (exact final counts arrive from an exit hook). It never pauses unless
  `captureLocals: N`, which pauses the first N hits to read locals and the stack, then resumes.
  `probe.file` defaults to each run's test file; a probe that never resolves gets a `warning`.
- **Game code under vm.** Repo harnesses load `js/` files with `vm.runInContext(src, ctx, {filename})`, and
  the script URL is whatever filename they pass (`file:///abs/js/x.js`, `js/x.js`, a bare `x.js`) or
  nothing (`evalmachine.<anonymous>`). A probe's `file` is matched against every named form, and an
  unnamed script is matched by content (line count, first 400 chars after the harnesses' `^const`→`var`
  rewrite) and bound by scriptId (`boundBy: "source (unnamed vm script)"`). The entry process does this
  inside a pause before each script runs (`Debugger.setInstrumentationBreakpoint`, armed at Break on
  start), so a call in the load's own tick still hits; `vmTopLevel:false` skips the pauses. Every script
  execution pauses while armed, so it stops after `vmPauseBudget` (default 300) and says so in
  `vmNote` (a heavy game-vm test: 121 s uncapped, 42 s capped, 38 s without). Each vm
  context counts separately (`contexts: N`). Prefer line-only probes: the rewrite shifts columns on
  top-level `const` lines. A function's header line never hits on a call; probe its first body line.
- `children:true` (implied by `runner:"test"`) auto-attaches every Node process the test spawns: a
  `NODE_OPTIONS=--require tools/mcp/js-debugger-boot.cjs` bootloader opens an inspector on a free
  port, reports it, and waits until the runner has set the probes (VS Code js-debug's design).
  Values and captures then carry the `pid`.
- Exceptions (`exceptions: uncaught|all|none`) are recorded with message and stack, never left paused.
  A hung test is killed with its process group at `timeoutMs`.
- The reply: per file `exitCode`, `summary` (TAP `pass`/`fail`, failing test names), probe results,
  `stdoutTail` (longer when something failed) and `stderrTail`.

**Interactive Node session.** `node --inspect-brk=127.0.0.1:9229 tests/unit/js-debugger-trace.test.mjs` (or
`node --inspect-brk=127.0.0.1:9229 --test tests/unit/js-debugger-trace.test.mjs`: the runner hands the port to its child and
runs files one at a time), then `debugger_targets {endpoint:"http://127.0.0.1:9229"}`, attach the
`node` row: the process stops at `Break on start` (`cause:"start"`). `debugger_breakpoint` and
`debugger_break` take a repo path on a Node target. Node keeps the process alive until the client
detaches, so always `debugger_detach`.

**Fewer round trips on any target.** `debugger_break` and `debugger_collect` above; `debugger_control`
steps now wait (`waitMs`, default 1500) and return the new token; a breakpoint URL without a query
matches every `?v=` (so `js/agent/apex.js` works for a deferred `?v=1695` script); every pause carries
`cause` (`breakpoint`, `step`, `exception`, `start`, or `unowned`: another client, a `debugger`
statement or a pause request).

## Starting the browser: `debug-chrome.mjs`

The debugger never launches Chrome. The parent can use a CLI (not an MCP tool):

```sh
node tools/mcp/debug-chrome.mjs start [--port 9222] [--url http://127.0.0.1:3456/] [--webgpu] [--device phone-landscape|desktop] [--headless-game]
node tools/mcp/debug-chrome.mjs status   # endpoint, PIDs, page targets
node tools/mcp/debug-chrome.mjs stop     # kills exactly the PIDs it recorded
```

`start` runs `python3 -m http.server 3456` (unless something already serves it) and
Chromium with `--headless=new --no-sandbox --remote-debugging-port=9222
--remote-debugging-address=127.0.0.1 --user-data-dir=scratch/debug-chrome
--use-angle=swiftshader --enable-unsafe-swiftshader --window-size=844,390`. PIDs and logs
live in `artifacts/debug-chrome/`. It refuses to start while a `playwright test`/test-bg
run is live or `loadavg >= 3`. `stop` checks each PID's command line still carries the
launch marker before signalling its process group, so a reused PID is skipped.

## Limits and ownership

- Parent owns the one browser. Never run this beside a Playwright test group or
  launch a second Chrome MCP browser. Attach does not reserve or launch Chrome;
  the existing owner controls its lifetime. Use only one debugger controller.
- Evaluation is code execution. Paused evaluation defaults to
  `throwOnSideEffect:true`; `allowSideEffects:true` (a `debugger_evaluate` flag only),
  `debugger_run` (always mutating, no flag; passing one is an error) and breakpoint
  conditions can mutate state. This is not a sandbox or an authorization layer.
- CDP command deadlines do not cancel JavaScript. A running evaluation returns
  `unknown` if its response times out (10 minutes). A new `debugger_run` is then
  allowed and marks the old operation `abandoned` (its late result is dropped; the
  page JavaScript it started keeps running: there is no `cancel`, and no
  `Runtime.terminateExecution`). A run is still refused while the page is paused.
  A run stopped at a breakpoint reports `paused`, and `pending` again after resume.
  No automatic `Runtime.terminateExecution` is used.
- Keep captures bounded: first10 frames/6 scopes per frame,200 script rows,
  100 breakpoints (first 20 summarized), 10 operation rows (only the newest carries its
  result, so a response does not re-send old ones), 4KB per stored result,
  128KB per tool response, and8MiB per CDP message. Large results are explicitly
  truncated so they cannot hide the pause token needed to resume.
- JS heap/profiling remains in Chrome DevTools MCP. This debugger does not
  measure GPU performance. Hardware timing requires a real GPU; software
  renderer stalls are not player-performance conclusions.

## Field notes 2026-10-16

Defects the live-debugger fleet hit (issue #2534 and the lane reports), each with its fix and the
test that fails on the #2535 head and passes now (`tests/unit/js-debugger-mcp.test.mjs` unless noted;
`smoke` = `bash tools/mcp/js-debugger-mcp.sh smoke`).

| # | Problem | Fix | Test |
|---|---|---|---|
| T1 | The 200-row `debugger_scripts` cap filled with anonymous scripts and dropped `game.js`; breakpoint `locations` came back `[]` | `filter` (+`regex`), `includeAnonymous:false` default, named URLs first, `total`/`truncated`; anonymous scripts evicted first from the 2000-row table; empty `locations` returns a `warning` with the exact parsed URLs | `T1:` ×2, smoke |
| T2 | `debugger_state` replayed every past result | Fixed in #2535 (latest op only); confirmed, size pinned | `T2:` |
| T4 | Remove, then set again left the old condition armed | A same-location set removes the old CDP breakpoint by id first (also when unresolved) and refuses if that fails. The exact Chrome trigger was not reproduced; this is defensive | `T4:` |
| T5 | A timed-out/unknown run blocked every run until detach | A new run marks it `abandoned` (late result dropped). There is no cancel of the *abandoned* op; see `cancel` below | `T5:`, smoke |
| T6 | `allowSideEffects` only on `debugger_evaluate`; asymmetry easy to trip on | Documented in both descriptions; `debugger_run` is always mutating and rejects the flag with a pointer | `T6:` |
| T7 | Service-worker and worker targets were invisible | `targetType` on `debugger_targets`; attach accepts them | `T7:`, smoke |
| T8 | A run pending across a reload never completed | `executionContextsCleared`/`globalObjectCleared`/disconnect mark it `aborted: context destroyed` | `T8:`, smoke |
| T9 | `awaitPromise` past the deadline read `unknown`, result lost | `timeoutMs` per call; the op stays tracked with `timedOut:true`, and a late result is recorded (`late:true`). Page JS is **not** cancelled by a timeout or detach | `T9:` ×2, smoke |
| T10 | A long loop wedged the page and the tool | `debugger_state` probes the page when a run is pending > 2 s and reports `pageUnresponsive`; `debugger_control cancel` ends the script | `T10:`, smoke |
| T11 | Attachment lost when Chrome died/the container resumed, silently | `detached: "target gone: <reason>"` in state; `debug-chrome status` reports `chromeAlive`, `cdpResponding`, `viewport` | `T11:`, smoke |
| T12 | Guessable parameters cost failed calls (`endpoint` again, `frameIndex`, `mode`, `source` by URL) | `attach` remembers the last endpoint; aliases `frameIndex`→`frame`, `mode`→`state`, `token`→`pauseToken`; `debugger_source {url,startLine,endLine}`; every rejection lists the valid argument names and a missing one is described | `T12:`, smoke |
| T13 | After a timed-out evaluate, detach/attach failed and needed a daemon restart | `detach` always drops the local session under one 4 s deadline (reports `cleanupErrors`, never waits behind a stuck command) so the daemon stays attachable | `T13:` |
| T14 | (a) A stale pause blocked `debugger_run`; (b) a `localStorage` read was refused with no hint | (a) `debugger_run` probes the pause (`evaluateOnCallFrame`, or `resume` for a frameless one) and clears it when the page is no longer stopped; (b) the refusal carries a `hint` to retry with `allowSideEffects:true` (V8 treats storage reads as side-effecting) | `T14a:`, `T14b:`, smoke |
| V | `--window-size=844,390` gave an 844x198 viewport | `debug-chrome start --device phone-landscape\|desktop` runs a holder holding `Emulation.setDeviceMetricsOverride` + touch emulation, and prints the measured `innerWidth x innerHeight` | `tests/unit/debug-chrome.test.mjs` |

**Chunk long loops.** A run that holds the main thread (a `race()` loop, `headless(false)` for
minutes) blocks every `Runtime.evaluate`, so state reads show `pageUnresponsive`. Run work in bounded
chunks (one `debugger_run` per few seconds of simulation, `awaitPromise` for each), and use `cancel` as
the escape hatch; it can leave game state half-updated, so reload after it.

**Keep `headless(true)` for logic hunts.** Un-headless software GLX pegs the GPU process at about
350% CPU and CDP stops answering, so every tool times out. `__apex.headless(true)` suppresses drawing,
not simulation, and keeps the page responsive; only turn drawing on for a visual question.

**Reloading the game.** Reloading mid-render pegs the SwiftShader GPU process (load average 17 seen).
`debug-chrome start --headless-game` launches on `about:blank`, navigates to the game, then calls
`__apex.headless(true)` as soon as `__apex` exists. To reload by hand, do the same sequence:
`about:blank`, the game URL, `__apex.headless(true)`.

**Local pages only.** `debugger_attach` refuses any page not served from `127.0.0.1`, `localhost` or
`[::1]` (and `about:blank`): this debugger is for local repros, never the deployed site. The refusal
says so and points at `debug-chrome start`.

**Keep the page visible.** A hidden or backgrounded tab gets no animation frames, so `race()` and any
`requestAnimationFrame`-driven wait never finish. Do not background the debug page; `debug-chrome`'s
holder also sets `Emulation.setFocusEmulationEnabled`. A script filter that matches nothing returns
`total:0`, never the full list.

**Emulation lifetime.** CDP emulation overrides end with the session that set them. The holder process
keeps one session open for that reason; `stop` ends it with the browser.

## Validation

```sh
node --test tests/unit/js-debugger-mcp.test.mjs
./tools/mcp/js-debugger-mcp.sh list-tools
./tools/mcp/js-debugger-mcp.sh smoke
node --test tests/unit/debug-chrome.test.mjs
```

The last command is **parent-only**, acquires the repository browser lock,
launches one native Chromium and a tiny HTTP fixture, and drives the actual MCP
subprocess over stdio. It exercises breakpoint/local/property inspection,
side-effect rejection and opt-in mutation, stepping, reload, exceptions,
nonblocking evaluation, cleanup and target closure. It also checks independent
shell callers sharing a native attachment and paused frame, step/resume across
processes, and daemon SIGTERM while paused. Receipt:
`artifacts/js-debugger/smoke.json`. It is a debugger test, not a graphics gate.

## Primary contracts consulted

- [CDP Debugger](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
- [CDP Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [Official protocol schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP tools/error results](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Chrome debugging profile requirement](https://developer.chrome.com/blog/remote-debugging-port)
- [Node HTTP server shutdown](https://nodejs.org/api/http.html#serverclosecallback)
