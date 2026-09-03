---
name: ai-racecraft
description: Use when AI racecraft is wrong — overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck, driver ratings craft/awareness/experience, or js/physics/ai-drive.js. Do not change player physics (tune-physics) or race-control flags (race-incidents-control).
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

## Do not

- Steer the **player** from curvature — arc column is AI-only here
- Touch `PACE` / grip / `ROAD_FOLLOW` → **tune-physics**
- Change caution / VSC / SC / debris → **race-incidents-control**

```sh
node --test tests/unit/ai-drive.test.mjs
node tools/test-bg.mjs driving
```
