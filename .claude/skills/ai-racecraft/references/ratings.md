# Ratings, ownership and the hot path

Read from the ai-racecraft SKILL.md before tuning any `AiDrive` export.

## Owns vs stays in `game.js`

`js/physics/ai-drive.js` is pure rules: rating → behaviour maps, OT (overtake) fire
rate, ERS want, multi-sample brake target, slow lane nudge. Callers pass curvature
samples and the already-drawn roll so the seeded stream in `makeCars()` / `updateCar`
stays in `game.js`.

| `AiDrive` | `game.js` |
|---|---|
| stuck threshold, follow gap, contact give, steer damp | O(n) traffic scan (`roomL/R`, blocker, tow, chaser) |
| overtake FIRE rate (situation score) | the OT roll itself |
| ERS deploy want (catch / defend / clear-straight) | speed integration, X-mode (low-drag active aero) arming, collisions |
| brake target + craft late-brake | the Frenet lateral step |

Ratings on the car (`craft` / `awareness` / `experience` / `skill`) come from
`js/data/driver-ratings.js`. Career adds deltas on top (career-mode owns the economy;
ai-racecraft owns how those axes drive the field).

## Ratings → behaviour (where each knob lives)

`AiDrive.traits(c)` reads `craft`/`awareness`/`experience`/`skill`/`consistency`/
`aggression`/`optimism` (0.75 mid-grid fallbacks; a reused scratch). Every map below is
in `ai-drive.js`; the game.js caller builds its ctx. Find the caller with apex-lsp
`lsp_references` (skill code-nav) before tuning an `AiDrive` export: some exports are
test-only (`_t`) or have no game.js caller, and tuning one changes nothing.

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

## Hot path and update order

Every `AiDrive` function runs per car per tick: no per-call object or array allocation
(reuse a module scratch, as `traits()` does). `trailStep` and `trailYieldStep` read state
the same tick's per-car update writes, so keep game.js's call order when you touch either
(pin: `ai-trail-yield-vm.test.mjs`).
