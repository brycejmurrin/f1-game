---
name: js-debugger
description: "Use when debugging JavaScript via js-debugger: conditional source breakpoints, stepping into/over, call frame scopes, locals, stale pause tokens, debugger daemon, exception pauses. Heap/CPU profiling → mcp-probe."
---

# Source debugging with the separate debugger MCP

Use `__apex` to establish a small reproduction first. Load this skill when a
branch decision, call stack or local variable is the next useful evidence.
[Setup, tool schemas and limits](../../../docs/research/AGENT-JS-DEBUGGER-MCP.md)
are the reference; `docs/AGENT-SURFACE.md` maps the surrounding agent tools.

## Own one local page

The parent owns one browser group (`debug-chrome start` refuses beside a test run).
Reuse the parent's authorized local Chrome page and dedicated debug profile.
The debugger attaches; it never launches a browser. Browser setup and canvas
inspection belong to `mcp-probe`.

Prefer the attached `debugger_*` tools. If this host cannot load them, use the
same tools through the shell wrapper. First run:

```sh
bash tools/mcp/js-debugger-mcp.sh status
bash tools/mcp/js-debugger-mcp.sh list-tools
bash tools/mcp/js-debugger-mcp.sh call debugger_targets '{"endpoint":"http://127.0.0.1:9222"}'
```

A missing daemon needs one explicitly owned `serve-http` process. Keep it
alive between independent `call <tool> '<JSON object>'` clients. Do not start a
second controller. `APEX_DEBUGGER_PORT` selects the bridge port on daemon and
callers; the Chrome CDP endpoint is a separate address supplied by its owner.
Starting a process does not attach tools to the chat; project MCP changes need
client reload/trust. Never edit global agent instructions for this workflow.

## Get a Chrome to attach to

```sh
node tools/mcp/debug-chrome.mjs start     # static server 3456 + headless Chromium on 9222, 844x390 phone-landscape
                                          # (--device desktop = 1280x720); refuses beside a test run
node tools/mcp/debug-chrome.mjs status    # endpoint + targets;  stop: kills only its own PIDs
```

Not an MCP tool: the debugger still never launches Chrome.

## Without pausing, long runs, workers

Logpoints, exception logs, listener/instance counts, `debugger_run` side effects,
`timeoutMs`, `pageUnresponsive`, `sw.js`/worker targets and `--device` →
[references/tools.md](references/tools.md).

## One call first

- A Node test or tool question → `debugger_node_test` (no attach, files in parallel, probes return
  counts, values and locals). Interactive Node: [references/tools.md](references/tools.md).
  Which vm filenames bind, breakpoint cost and the hang-on-exit trap: `docs/TESTING.md` §Debug a Node test.
- "Stop here and show me the locals" → `debugger_break {breakpoints, trigger}`: stack, cause and
  locals in one reply, paused with a token (or `resume:true`).
- "How often, with what values" on a running page → `debugger_collect {logpoints, trigger}`.
- Use the step-by-step loop below when the next step depends on what a pause shows.

## Reproduce → pause → inspect → resume

1. Call `debugger_targets` with the real CDP `endpoint`; attach its exact
   `targetId` using `debugger_attach`. On a game page establish identity with
   `__apex.info()` and call `__apex.agentHelp()` once per page session.
2. Find the function first (`Grep` `js/` for its symbol), then narrow `debugger_scripts` by that file name, then use `debugger_source` (it needs
   that row's `scriptId`, not a URL) to find the statement. Preserve the returned URL including its query suffix.
   Source lines/columns are one-based; frame indices are zero-based. A URL without a query
   (or a bare `js/agent/apex.js`) matches every `?v=`, so a deferred `?v=1695` script resolves.
3. Set `debugger_breakpoint` at that URL/line, optionally with a condition
   isolating the reproduction from background animation calls. Conditions run
   code. Trigger with `debugger_run`; use `awaitPromise:true` for an async flow.
   It returns an operation ID immediately, so the next request can inspect it.
4. Read `debugger_state`. A pending operation is not a completed reproduction.
   When paused, copy the current `pause.token`. Use `debugger_evaluate` in its
   frame or `debugger_properties` on a current scope/object ID. Properties are
   descriptors: getters are not invoked. Lexical globals such as `PhonePad`
   need not be properties of `window`.
5. `debugger_control` supports `over`, `into`, `out` and `resume`. A step waits
   (`waitMs`, default 1500) and returns the new pause; without one, read state again:
   acknowledgments are not pause evidence. A pause with `cause:"unowned"` is not yours
   (another client on the target, or a `debugger` statement): its resume is theirs. A step
   can stop at another column on the same line; follow the returned location,
   not an assumed number of steps. Always use the new token and handles.
6. Use `debugger_exceptions` with `all` to inspect caught errors, `uncaught`
   for real task exceptions, or `none` to stop pausing. Inspector evaluation
   catches its own thrown expression; that is not an uncaught task repro.
7. Resume before browser actions that require page JavaScript. Read the
   operation's final result in state; a timeout leaves execution unknown and
   does not cancel JavaScript. Detach before trying a new run in that case.

To get a pause in the game, start a real race inside the run: `race()` with no
argument returns false and `go()` alone leaves zero cars. Recipe and the Cloud
Chromium launch line are in the reference. Under software GL, `attach`, `detach`
and `debugger_exceptions` can time out yet apply; `__apex.headless(true)` makes
them take about 0.2 s. A run stopped at a breakpoint reads `paused`, not `unknown`.

Paused evaluation blocks side effects by default. Only use
`allowSideEffects:true` or mutating `debugger_run` for the intended local
reproduction. For async race setup and an immediate dependent probe, await
both in one expression; the countdown advances between separate commands.
`headless(true)` suppresses drawing, not simulation.

## Confirm a bug and finish

Establish expected behavior from source/tests/contracts, record the smallest
actual failure, and challenge synthetic inputs against the real calling path.
Check ownership and existing fixes before changing source. Follow `steward`
and `check-changes` for a verified fix/PR; debugger poking is not a push gate.
Keep rejected hypotheses and operator mistakes separate from software defects.
If expected scripts do not return within a bounded reload probe, inspect state,
broader scripts and page lifecycle; a timeout alone establishes neither a bug nor a pass.

Reload requires fresh script IDs and pause/object handles. Exact-URL
breakpoints persist. Remove unused breakpoints with `debugger_remove_breakpoint`,
then always `debugger_detach`; record `cleanupErrors` and any observed resume.
The parent stops its owned bridge/browser and verifies no run remains.

Save bounded evidence under `artifacts/`: source SHA/dirty diff, page identity,
trigger, breakpoint/stack/locals, result, expected versus actual, and cleanup.
Label synthetic packets/replay samples and source/VM/software-browser evidence.
No physical-device, GPU-performance or long-session claim follows from these.

Offline skill contract: `node tools/check/skill-smoke.mjs --skill js-debugger --check`.
Native debugger transport/lifecycle check: `bash tools/mcp/js-debugger-mcp.sh smoke`
(parent-only, serialized; it launches its own fixture browser).
