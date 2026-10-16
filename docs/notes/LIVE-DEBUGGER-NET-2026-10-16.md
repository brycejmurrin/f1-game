# Live debugger hunt: multiplayer and net (2026-10-16)

Lane `cursor/live-debug-net-4e7a` (PR #2552). Driven with the js-debugger MCP against a
headless Chromium (CDP :9222, two tabs of `http://127.0.0.1:3456/`), source SHA = the
branch tip. The loopback transport and in-page `NetSession`s stood in for the second peer;
the guest end of every pair was a real `NetSession` pumped on the same virtual clock.
Software-browser / source evidence only: nothing here speaks for a real network, a phone
or a GPU. Exception pausing was `all` (caught and uncaught) for the whole sweep.

## Verdicts

| id | claim | verdict |
|---|---|---|
| N1 | `netplay.js` guest BYE with other guests present: `s.close()` runs `onClose("local")` synchronously, so `EV.LEFT` goes out `why:"local"` | **CONFIRMED-LIVE, fixed here** |
| N2 | `lobby.js` `pollTimer` never nulled after `clearInterval`, so `watcherArmed` stays true and an expired empty code room shows the wrong copy | **CONFIRMED-LIVE** (fix owned by the sibling `cursor/hunt-debugger-fixes-*`) |
| N3 | same `close()` artefact on the host's incompatible-build drop (`EV.MODEL`, `netplay.js` ~625) | **found + fixed here** (unit-proved; the MODEL path is the twin of N1) |

### N1 evidence
Host on monza with two loopback guests (A, B). Guest A sends `bye`. Breakpoint at
`netplay.js:597` (the LEFT broadcast) paused with the stack
`onClose <- NetSession.close (session.js:326) <- BYE handler (netplay.js:652) <- onEventJson <- transport pump`
and locals `why="local"`, `carFor=1`, `active=true`, `sessions.size=1`. Guest B then
received `{wire:1, why:"local"}` while the host's own `status().reason` read `"bye"`.
Fix: `closeWhy` map (peer id -> reason) set around the self-initiated `s.close()`;
`onClose` takes the mapped reason. Test `a guest BYE tells the other guests why:"bye"`
in `tests/unit/net-authority.test.mjs` fails without the change and passes with it.

### N2 evidence
`__apex.lobbyCodeHost()` with a breakpoint at `rendezvous.js` `hostRoom` entry captured the
real `opts.onFail` closure of `codeHost`.
* Control: with `pollTimer === null`, `onFail({error:"expired"})` shows the host copy
  "The room code expired — tap NEW CODE for another."
* Stale: `waitForOpen()` armed the poll (`pollTimer=116`), the transport was closed so the
  poll cleared itself (`clearInterval`, no null). `onFail({error:"expired"})` paused after
  `const watcherArmed = !!pollTimer`: **`watcherArmed=true`, `pollTimer=116`, `sessions=0`,
  `transport=null`** -> the "INVITE ANOTHER" branch is taken for a room nobody is in.
  Caveat: `hostRoom`'s own `onTick` repainted the status line afterwards, so the evidence is
  the locals and the branch, not a screenshot.
* Fix direction (for the lobby owner): null `pollTimer` after every `clearInterval(pollTimer)`
  (lobby.js 321, 345, 411, 451, 459, 470, 2192 and `dropPending`), or derive `watcherArmed`
  from a flag the poll maintains.

## Scenario sweep

| scenario | how | result |
|---|---|---|
| host + two guests, warm-up | 120 frames @16 ms, virtual clock | both synced, rtt 16 ms, no pauses |
| guest leaves (BYE), others present | N1 above | LEFT reason defect (fixed) |
| guest leaves (BYE), then rejoin / third guest | `start()` adopts its sessions once; there is no mid-race add API | not drivable from netplay: both are lobby-phase (`lobbyInviteAnother`), needs real signalling. Static only. |
| 5 s packet stall on one guest | guest B stops pumping while A and the host run | tolerated (session timeout is raised for a race); no drop, no stale rival, resumes clean |
| long stall | B silent 31 s | dropped at the ~30 s race timeout; the other guest got `LEFT {wire:2, why:"timeout"}` (correct reason) |
| tab hidden on every peer | `document.hidden` forced true, 500 ms pumps for 20 s | both guests stay synced and active; a guest that is truly silent while hidden is still dropped (`timeout`), no stall forgiveness |
| host leaves mid-race (guest role) | far end sends `bye` | guest ends with `reason:"bye"`, `onStop` untouched |
| malformed events (11 payload shapes x every event type) at a guest | `null, {}, NaN wire, "x", NaN/1e300 at+hold, negative wire, non-string why, [], "str", 5` | no exception (caught or uncaught), session survives, `startPending` stays false |
| late ARM | host `hostStart()`, guest A arms, B arms ~6.4 s later | both guests receive the same named `at`; `startPending` true after the late arm. (ARM wait is 45 s; the post-deadline path was not reached live.) |
| goLocal / goWire handover | guest speaks 1.4 s, silent 3.2 s, speaks again | `stale` 0 -> 1 (`owns=false`, `human=false`, car back to the local AI) -> 0 (`owns=true`, `human=true`) |
| snapshot NaN/Infinity | NaN, +-Infinity in every field through `encodeSnapshot -> decodeSnapshot` | cannot reach the receiver: `||0` and the integer clamp make the wire finite (s saturates 42949672.95, x +-327.68, lap 255, gear 15). A NaN-conditional breakpoint has nothing to catch. |
| snapshot tick wrap / out of order / duplicate | pushes around 2^32 | wrapped tick accepted in order, out-of-order inserted, duplicate rejected, sample finite |
| code expiry | N2 above | wrong copy branch (stale `pollTimer`) |
| lap gate | read-only | host clamps a rival's predicted lap to `car.lap + 1` (`gateLap` bound); not exercised separately |
| phone-pad pairing (invite/QR) | `tests/unit/phone-pad*.test.mjs` | 501 net + phone-pad unit tests pass; the QR/scan leg needs a camera and a second device: not driven |

Every debugger pause was triaged: breakpoint pauses were the N1/N2 targets; the exception
pausing never fired in any scenario (no caught or uncaught throw in `js/net/**` under the
sweep).

## Debugger / harness notes
* `debugger_run` takes no `allowSideEffects` (only `debugger_evaluate`); frame selection on
  `debugger_evaluate` is `frame` (zero-based).
* A run that times out ("unknown") blocks the next `debugger_run` until detach + attach;
  attaching again clears the operation list, which is also the cheapest way to shrink
  `debugger_state`, which replays every earlier operation.
* `G` is not a global: pause once in a closure that has it and assign `window.__G = G`.
* A virtual clock must start at `performance.now()`; starting at a constant makes the
  session read the first pump as ancient and time out (harness artefact, not a defect).
* `codeHost()` took about 40 s to reach `hostRoom` offline (ICE gathering without STUN).
