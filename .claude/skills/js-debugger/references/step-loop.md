# Reproduce, pause, inspect, resume

## Reproduce → pause → inspect → resume

1. Call `debugger_targets` with the real CDP `endpoint`; attach its exact
   `targetId` using `debugger_attach`. On a game page establish identity with
   `__apex.info()` and call `__apex.agentHelp()` once per page session.
2. Find the function through `code-nav` (`lsp_definition {symbol, body:true}`;
   fallback `bash tools/mcp/lsp-mcp.sh def Ghost.snapshot --body`), then narrow
   `debugger_scripts` by the returned file name, then use `debugger_source` with
   that row's `scriptId` (or its exact `url`) to find the statement. Preserve the returned URL including its query suffix.
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
