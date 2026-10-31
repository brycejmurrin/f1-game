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
   (or a bare `js/agent/apex.js`) matches every `?v=`, so a `?v=dev` or deferred script resolves.
3. Set `debugger_breakpoint` at that URL/line, optionally with a condition
   isolating the reproduction from background animation calls. Conditions run
   code in the paused frame (its locals and closure: `c.speed`, not `speed`); one
   that throws never pauses, so a typo reads as a timeout. Break on the first body
   statement past the early returns you care about, not the `function` header. Trigger with `debugger_run`; use `awaitPromise:true` for an async flow.
   It returns an operation ID immediately, so the next request can inspect it.
4. Read `debugger_state`. A pending operation is not a completed reproduction.
   When paused, copy the current `pause.token`. Use `debugger_evaluate` in its
   frame or `debugger_properties` on a current scope/object ID. Properties are
   descriptors: getters are not invoked. Lexical globals such as `PhonePad`
   need not be properties of `window`.
5. `debugger_control` supports `over`, `into`, `out`, `resume`, `pause` and `cancel`. A step waits
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
argument returns false, `race(id)` returns a promise (the circuit hydrates lazily),
and `go()` before it settles leaves zero cars. The Cloud Chromium launch line is in
[setup.md](setup.md) §Get a Chrome to attach to.

## Pause the player at a speed

"Break in `updateCar` when speed > 80": `updateCar(c, dt, ranked)` is a local in
`js/game.js` (code-nav: bare name, not `G.updateCar`) called once per car per tick,
so scope the condition to the player and give the player speed; with no input the
car never gets there. `c.speed` is ground speed in m/s. The dash shows
`dashKph(v) = vStd(v) × 3.6` (game.js), which equals `c.speed × 3.6` at the default
PACE 1.0 only (AGENTS.md §Physics: PACE scales ground speed). So "80" read as dash
km/h is `c.speed > 80 / 3.6` (22.2) at default PACE; quote the converted threshold
back to the user.

```js
debugger_break {breakpoints:[{url:"js/game.js", line:<first body line past the early returns>,
  condition:"c.isPlayer && c.speed > 22.2"}],
  trigger:"(async()=>{ __apex.headless(true); await __apex.race('bahrain','day','dry'); __apex.go(); __apex.jump(0.02, 30); __apex.setInput({throttle:true}); __apex.step(1/60, 5); })()",
  awaitPromise:true, timeoutMs:30000}
```

`jump(frac, speed)` sets the player's ground speed in m/s; `setInput({throttle:true})`
keeps it there (`clearInput()` after). Without `jump`, hold throttle and allow
`timeoutMs:30000` or `keep:true` and re-wait. Get the line from `lsp_definition
{symbol:"updateCar", body:true}`, never from this file. Under software GL, `attach`, `detach`
and `debugger_exceptions` can time out yet apply; `__apex.headless(true)` makes
them take about 0.2 s. A run stopped at a breakpoint reads `paused`, not `unknown`.

Paused evaluation blocks side effects by default. Only use
`allowSideEffects:true` or mutating `debugger_run` for the intended local
reproduction. For async race setup and an immediate dependent probe, await
both in one expression; the countdown advances between separate commands.
`headless(true)` suppresses drawing, not simulation.
