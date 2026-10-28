---
name: ai-racecraft
description: "Use when AI cars race badly: overtakes too aggressive or timid, wrong braking or line, ERS use, AI stuck in traffic, walls or the pit lane, or driver ratings. Not for: the player's car → tune-physics; flags or crashes → race-incidents-control; career → career-mode."
---

# AI racecraft — `AiDrive`, not the bicycle model

`js/physics/ai-drive.js` is pure rules: rating → behaviour maps, OT fire
rate, ERS want, multi-sample brake target, slow lane nudge. Callers pass
curvature samples and the already-drawn roll so the seeded stream in
`makeCars()` / `updateCar` stays in `game.js`.

## Owns vs stays in `game.js`

| `AiDrive` | `game.js` |
|---|---|
| stuck threshold, follow gap, contact give, steer damp | O(n) traffic scan (`roomL/R`, blocker, tow, chaser) |
| overtake FIRE rate (situation score) | the OT roll itself |
| ERS deploy want (catch / defend / clear-straight) | speed integration, X-mode arming, collisions |
| brake target + craft late-brake | the Frenet lateral step |

Ratings on the car (`craft` / `awareness` / `experience` / `skill`) come
from `js/data/driver-ratings.js`. Career adds deltas on top (**career-mode**
for the economy; this skill for how those axes drive the field).

## Ratings → behaviour (where each knob lives)

`AiDrive.traits(c)` reads `craft`/`awareness`/`experience`/`skill`/`consistency`/
`aggression`/`optimism` (0.75 mid-grid fallbacks; a reused scratch). Every map
below is in `ai-drive.js`; the game.js caller builds its ctx. Find the caller with
apex-lsp `lsp_references` (skill code-nav) before tuning an `AiDrive` export: some
exports are test-only (`_t`) or have no game.js caller, and tuning one changes nothing.

| Behaviour | Function → game.js caller | Ratings read | Unit pin (`ai-drive.test.mjs`) |
|---|---|---|---|
| OT fire rate (λ, clamp 0.08-2.4) | `otFireRate` / `otShouldFire(roll, dt, ctx)` → `_aiOtFire` with `simRnd()` | craft ↑, awareness ↓, experience ↑, aggression ±22 %; house/team orders | `OT fire rate rises with craft…`, `otShouldFire respects the roll…`, `aggression raises otFireRate…` |
| ERS deploy | `wantBoost` → `aiWantsBoost`; X-mode `wantX` → `c.xOn` | awareness (bank when rich), house style, `ersDeploy`/`ersRegen` | `wantBoost catches and defends…`, `…same at every PACE…`, `ERS map and wantX…` |
| Lane nudge in traffic | `adaptLane(lane, ctx, dt)` → `c.lane` | craft (step size), awareness (commit) | `adaptLane nudges toward the freer side…`, `adaptLane on streets…` |
| Pull out to pass | `otPull` (gated by `otWant`) | craft; street scale | `otPull: a queue-limited car pulls out…`, `otWant: a blocker that is slow but PULLING AWAY…` |
| Let a faster car by | `letPassCase` / `letPassDelay` / `letPassPull` / `letPassEase` | awareness (earlier) | `letPass: awareness commits earlier…` |

To make a rating band more or less aggressive, change that map's lerp endpoints in
`ai-drive.js` (a constant), never add a `simRnd()` draw (the seeded stream is drawn in
game.js). Check `ai-race.mjs ratings` and `tactics` BEFORE and after.

**"Dive-bombs" (late lunges into a corner, esp. turn 1) are NOT `otFireRate`.** `otFireRate`
never reads calm. A dive is decided by: `attackOK`'s quality gate (scaled by `ctx.calm` to
`START_ATTACK` while `startCalm` is on) plus `passReach` (can it be half alongside by the
turn-in), game.js's lunge rule (abandon at `toTurnIn < 6` when not half alongside; find it via
`lsp_references` on `AiDrive.sideLevel`), and the late brake in `brakeTarget` (below). Recipe:
`references/tactics.md` §Lap-1. A per-track (Monza-only) fix is wrong: these are field-wide
rules; prove the fix on two circuits.

## Do not

- Steer the **player** from curvature — arc column is AI-only here
- Touch `PACE` / grip / `ROAD_FOLLOW` → **tune-physics**
- Change caution / VSC / SC / debris → **race-incidents-control**

## Hot path and update order

Every `AiDrive` function runs per car per tick: no per-call object or array
allocation (reuse a module scratch, as `traits()` does). `trailStep` and
`trailYieldStep` read state the same tick's per-car update writes, so keep
game.js's call order when you touch either (pin: `ai-trail-yield-vm.test.mjs`).

## Brake target (AI brakes too early / late)

`AiDrive.brakeTarget(ctx)` (ai-drive.js) = min over look-ahead samples of
`sqrt(vC² + 2·brake·0.85·d)`, `vC = cornerSpeed(k, latMax·bank·grip)·skill·diffCorner`
(`latMax` carries the aeroLoad scale), then multiplied by house `hold`, the craft
LATE-BRAKE (attacking with room > 1.6 m: up to ×`lerp(1, 1.07, craft)` × house attack),
`optimism` (±1.2 %) and `errMul` (a missed marker). "Dives too deep" = the late-brake /
optimism terms; "brakes too early" = low `vC` or `hold`/`errMul`.
`brakeDecision` turns `speed - vLim` into a pedal (soft/full band from `consistency`).
Samples and ctx are built in `game.js` (`_aiBr`, grep `AiDrive.brakeDecision`): node-aligned
`pushLook` from the car out to `look`, on-line uses `TrackLine.pathK`. Early braking = too
low `vC` (k, grip, `diffCorner`, `skill`), too small `0.85`, or `errMul`/`hold`. Unit pins:
`ai-drive.test.mjs` (`brakeTarget: a cached bank grip…`, `brakeDecision: no pedal under the
envelope…`, `brakeDecision's P trim…`, `craft late-brake raises the limit…`, `optimism raises
brakeTarget…`, `brake planner carries the public corner envelope…`). No CLI prints the brake
point itself: `ai-race.mjs pace` (lap time) and `line` (approach/apex) are the closest VM
proxies; for the exact point probe `__apex` live (browser, `mcp-probe`).

## Field pace (scripted vs catch-up band, `ai-band.js`)

Not racecraft: `references/pace.md`.

## Traffic tactics (bunching, passing, defending, the player)

Recipe and the Lap-1 / Turn-1 melee case: `references/tactics.md`. STREETS (`track.street`) keep the old metre gap and pass gates; measure with `ai-race.mjs tactics`.

## Stuck / unstuck (AI wedged, never recovers)

Discriminator: `__apex.caution().level` 0 with `speed < 7` and `stuckT` growing is this skill; level != 0 or `caution().sinceT` growing is **race-incidents-control**. Timers, rescue rules and checks: `references/stuck.md`.

Which check for which edit (node, subagent-safe unless marked):

| Edit | Gate |
|---|---|
| OT fire, ERS, lane nudge, brake target | `node --test tests/unit/ai-drive.test.mjs` (~1 s) |
| otWant / pass latch / side yield | `ai-racecraft-vm.test.mjs` (read its header) |
| pass / defend / tactics | `ai-pass-complete.test.mjs` + `ai-pass-defend-vm.test.mjs` + `ai-trail-yield-vm.test.mjs` |
| stuck / rescue | `ai-stuck-vm.test.mjs` + `ai-pack-stuck-vm.test.mjs` |
| pace band | `ai-band.test.mjs` |
| field effect | `ai-race.mjs tactics` / `stuck` `--runs 5` (VM, below) |

`pick-tests` names the browser groups for an `ai-drive.js` edit (physics-core);
`collisions` is optional browser evidence, session only, in the background.

```sh
# Field instruments (VM, no browser) — one dispatcher:
node tools/check/ai-race.mjs pace    [--track monza] [--diff normal]
node tools/check/ai-race.mjs field   [--track monza] [--seconds 240] [--runs 5]
node tools/check/ai-race.mjs tactics [--track monza] [--laps 8] [--runs 5] [--mode human --pace 0.97]  # intervals (s), stuck, swap-backs, lap 1
node tools/check/ai-race.mjs line    [--track monza]
node tools/check/ai-race.mjs human   [--track monza] [--runs 3]   # vs a PLAYER, not itself
node tools/check/ai-race.mjs ratings [--json]                     # Pearson / style zero-mean (no race)
node tools/check/ai-race.mjs stuck   [--track monza] [--seconds 240] [--runs 3]    # per-car stuckT episodes + rescue teleports (not dwell)
node tools/check/ai-race.mjs band    [--track monza] [--diff normal] [--seconds 90]  # catch-up rubber-band profile (forces aiPace=catchup)
# Race subcommands take --wear off|light|real (default off: no pits/deg, so the pit-lane rescue never runs).
# Direct: ai-pace/ai-field/ai-line/ai-human/ai-ratings/ai-band/ai-stuck.mjs;
# tyre strategy over a race, wear real (default --track bahrain --laps 10):
node tools/check/ai-strategy-census.mjs --track redbull --laps 10 [--json]
```
