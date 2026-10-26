# Live debugger hunt: `__apex` hook sweep (#2586), 2026-10-17

Hunter session on the deploy tip (`7d96dc5bf`), js-debugger MCP on the debug Chrome (SwiftShader, headless, 844x600).
Method: every function on `__apex` (223) called with `[] [undefined] [NaN] [null] [-1] [Infinity] ["x"] [{}] [[]] [NaN,NaN] [0,0,0]`;
each return deep-scanned for non-finite numbers, `physState()` re-read after every call to catch state poisoning.
Phases swept: menu, mid-race (`race("suzuka")` + `go()`), garage open. Not swept: mid-countdown, after finish (round 2).
Skipped as unsafe/slow (no bad-arg claim made): net*/lobby*, career reset/delete/sim, rollout, survey, frametimeBench, audio*, race/tt/finishRace.

| id | file | severity | verdict | evidence |
|---|---|---|---|---|
| V1 | `apex.js` `jump` | high (agent loop) | CONFIRMED-LIVE | `jump(Infinity)`, `jump("x")`, `jump({})` left `physState().prog = NaN` (`(Infinity % 1)`); every later `fieldState/world/timing` read NaN and a later `jump(0)` did not heal it (`prog += NaN`). Fixed: refuse non-finite frac/speed/lateral. |
| V2 | `apex.js` `act`/`step`/`garageStep` | high | CONFIRMED-LIVE | `act(NaN, NaN)` -> `update(NaN)` -> `s=NaN` on every car; `n=Infinity` never returns. `garageStep(Infinity)` the same loop. Fixed: `stepArgs()` falls back to one 1/60 s step. (A finite 1e9 still blocks the page; left as the caller's choice.) |
| V3 | `apex.js` `setSpeed`/`spin` | medium | CONFIRMED-LIVE | no-arg call writes `speed=NaN` / `head=NaN` into the player. Fixed. |
| V4 | `apex.js` `nudge`/`aim`/`setLap` | medium | CONFIRMED-LIVE | `Infinity` -> `vLat`/`head`/`lap = Infinity`. Fixed. |
| V5 | `apex.js` `camera` | medium | CONFIRMED-LIVE | `camera(NaN)` passed both range checks (`NaN < 0` is false) and set `G.camMode = NaN`; every later `camera()` threw `reading 'id'`. Fixed (integer check; also rejects 1.5). |
| V6 | `apex.js` `careerGrant` | medium | CONFIRMED-LIVE | `careerGrant(Infinity)` set `career.money = Infinity`, `careerSlots()` then reported `money: Infinity` (JSON null on save). Fixed: non-finite -> the default grant. |
| V7 | `apex.js` `rivals` | low | CONFIRMED-LIVE | `rivals(-1)` threw `forEach is not a function`. Fixed. |
| V8 | `apex.js` `reset`/`seed` | medium | CODE-TRACED | same NaN class (`reset(Infinity)` writes `prog/s = NaN`; `seed(NaN)` makes the episode RNG NaN). Fixed with the same guard; unit-pinned. |
| V9 | `apex.js` `garageParts` | low | CONFIRMED-LIVE / not a crash | `garageParts({aero: Infinity})` persisted `aero: null` in `apex26.parts.<team>`; the garage reopens cleanly (`garageAero` finite, no logged error). Fixed: only non-empty string ids are stored. |
| V10 | `apex.js` `eyeAt`/`groundY`/`projTest`/`scan`/`renderClock` | low | BY-DESIGN | NaN in, NaN out on read-only helpers; no state written. Not changed. |
| V11 | `carState().best` | low | BY-DESIGN | `Infinity` before a first lap (`sectorState` already maps it to null). Not changed. |

## Angles not closed
- **Live F6** (`TLX.create` throw cleanup): NOT-RUN. `_createUndo` is not on the deploy tip (it is in the open #2554 diff), and TLX is deferred, not loaded at the menu. Run it on #2554's branch once it lands: count `ResizeObserver`s and the three listener types before/after a `create` whose `initOwner.check` throws.
- **Garage op-10 NaN lead**: REFUTED at hook level. After `garageTeam/garageFrame/garageParts/garageStep/garageAero` with every bad-arg class, `garageAero()` and `garageCam()` stayed finite. I could not identify what "op-10" referred to; a setup-sheet op below the hook layer is not covered.
- **`reset()` lap-0 prog** (`prog = f01 * L`, engine convention `(lap-1)*L + s`): REPORT ONLY, unchanged (the determinism goldens depend on it).
- Repro: see the unit file `tests/unit/apex-arg-guards.test.mjs` (fails before, passes after).
