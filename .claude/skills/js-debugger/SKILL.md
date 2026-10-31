---
name: js-debugger
description: "Use when debugging JavaScript via js-debugger: conditional source breakpoints, stepping into/over, call frame scopes, locals, pause tokens, exception pauses, heap/CPU/hitch profiling. Not poking the live page → mcp-probe."
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

- Session only: `mcp-browser-guard.sh` refuses every `mcp__js-debugger__*` call
  inside a subagent, status reads included (AGENTS.md rule 10); a subagent may use
  only the shell `list-tools` / `status` below.
- One browser at a time: never beside a Playwright test run, `playwright-official`
  `browser_*` or chrome-devtools. Attached here, profile with `debugger_profile`
  (cpu / heap / hitch; references/tools.md) instead of opening chrome-devtools.

Daemon, bootstrap, tool-schema listing and the Chrome launch line (`debug-chrome.mjs start --headless-game`):
[references/setup.md](references/setup.md). Prefer attached `debugger_*` tools when the session lists them.

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
- A `condition` is an expression evaluated IN the paused frame: write `c.speed`, not `speed`. A
  condition that throws never pauses, and `debugger_break` just times out (default 10 s, max
  `timeoutMs:30000`), so dry-run it with `debugger_collect` (same expression as a logpoint) first.
  A per-car function (`updateCar` runs for every car, every tick) needs `c.isPlayer &&` (a VS FRIEND rival is also `c.human`); worked
  in-race example: [references/step-loop.md](references/step-loop.md) §Pause the player at a speed.
- "How often, with what values" on a running page → `debugger_collect {logpoints, trigger}`.
- When the next step depends on what a pause shows: the step-by-step loop (targets → attach →
  source → breakpoint → run → state/token → control → resume), the in-race pause recipe and
  side-effect rules → [references/step-loop.md](references/step-loop.md).

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
For shell sessions, call `bash tools/mcp/js-debugger-mcp.sh call debugger_detach '{}'`,
then stop the owned `serve-http` terminal with Ctrl-C (or SIGTERM to its recorded
PID). Stop a browser launched here with `node tools/mcp/debug-chrome.mjs stop`;
verify with `node tools/mcp/debug-chrome.mjs status` and daemon `status` (down is
expected after shutdown). Never stop an inherited controller or browser.

Save bounded evidence under `artifacts/`: source SHA/dirty diff, page identity,
trigger, breakpoint/stack/locals, result, expected versus actual, and cleanup.
Label synthetic packets/replay samples and source/VM/software-browser evidence.
No physical-device, GPU-performance or long-session claim follows from these.

Offline skill contract: `node tools/check/skill-smoke.mjs --skill js-debugger --check`.
Native debugger transport/lifecycle check: `bash tools/mcp/js-debugger-mcp.sh smoke`
(parent-only, serialized; it launches its own fixture browser).
