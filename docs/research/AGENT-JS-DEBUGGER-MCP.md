# Agent JavaScript debugger MCP

`tools/mcp/js-debugger-mcp.mjs` supplies the source debugger operations missing
from the existing Chrome DevTools MCP: breakpoints, pause/resume, step
over/into/out, call-frame evaluation, scope descriptors and exception pauses.
It attaches to one existing Chrome page through CDP. It never launches Chrome,
closes the browser, starts a test group, or edits application source.

## Setup

Requires Node 22+ (native WebSocket/fetch); no additional npm package or build.
Keep the default three-server project catalog. Merge the **opt-in** entry from
`tools/mcp/js-debugger-mcp.json` into the MCP client's local configuration when
debugging. Use an absolute script path if the client's working directory is not
the repository root. The command is:

```json
{
  "mcpServers": {
    "js-debugger": {
      "command": "node",
      "args": ["/absolute/path/to/f1-game/tools/mcp/js-debugger-mcp.mjs"]
    }
  }
}
```

Serve the local game using the usual repository workflow. Start a dedicated
Chrome with remote debugging, using your platform's Chrome executable:

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir=/absolute/path/to/f1-game/scratch/debug-chrome
```

Navigate that browser to `http://127.0.0.1:3456/`. Only attach to an authorized
local reproduction in this dedicated profile. The debugger supports HTTP
loopback pages and `about:blank`, not GitHub Pages, browser extensions, workers,
Node Inspector or remote hosts. `debugger_targets` lists candidate page IDs;
`debugger_attach` requires the exact ID. Discovery and the page WebSocket must
use the same loopback host/port; redirects and credential-bearing URLs fail.

This is local stdio, not a hosted ChatGPT connector. Configure/reload the MCP
client to make its tools available; starting a subprocess alone does not add
tools to an already-running chat. No account plugin upload is required.

## Agent workflow

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

## Limits and ownership

- Parent owns the one browser. Never run this beside a Playwright test group or
  launch a second Chrome MCP browser. Attach does not reserve or launch Chrome;
  the existing owner controls its lifetime. Use only one debugger controller.
- Evaluation is code execution. Paused evaluation defaults to
  `throwOnSideEffect:true`; `allowSideEffects:true`, `debugger_run` and breakpoint
  conditions can mutate state. This is not a sandbox or an authorization layer.
- CDP command deadlines do not cancel JavaScript. A running evaluation returns
  `unknown` if its response times out; another run is refused until detach.
  No automatic `Runtime.terminateExecution` is used.
- Keep captures bounded: first10 frames/6 scopes per frame,200 script rows,
  100 breakpoints (first20 summarized),10 operation results,4KB per stored result,
  128KB per tool response, and8MiB per CDP message. Large results are explicitly
  truncated so they cannot hide the pause token needed to resume.
- JS heap/profiling remains in Chrome DevTools MCP. This debugger does not
  measure GPU performance. Hardware timing requires a real GPU; software
  renderer stalls are not player-performance conclusions.

## Validation

```sh
node --test tests/unit/js-debugger-mcp.test.mjs
node tools/mcp/js-debugger-mcp.mjs --list-tools
node tools/mcp/js-debugger-smoke.mjs
```

The last command is **parent-only**, acquires the repository browser lock,
launches one native Chromium and a tiny HTTP fixture, and drives the actual MCP
subprocess over stdio. It exercises breakpoint/local/property inspection,
side-effect rejection and opt-in mutation, stepping, reload, exceptions,
nonblocking evaluation, cleanup and target closure. Receipt:
`artifacts/js-debugger/smoke.json`. It is a debugger test, not a graphics gate.

## Primary contracts consulted

- [CDP Debugger](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
- [CDP Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [Official protocol schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP tools/error results](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Chrome debugging profile requirement](https://developer.chrome.com/blog/remote-debugging-port)
