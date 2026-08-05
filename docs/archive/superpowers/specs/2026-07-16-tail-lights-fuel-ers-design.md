# Rear-light state cues: fuel-tinted exhaust, ERS-driven LED brightness, real-F1 deploy flash

Date: 2026-07-16
Status: design — awaiting user review

## Problem

The player reports: the rear tail-light **brightness doesn't change**, only its
**color** changes when they hit BOOST. They asked whether the color could depend
on **fuel or ERS**, and whether **OVERTAKE (OT)** should change the rear signal.

### What actually happens today (verified in `js/game.js` ~4060–4112, `js/game/carmesh.js`)

The player car's rear has four separate emissive quads:

| Element | Mesh (carmesh.js) | Color today | When drawn |
|---|---|---|---|
| Rain-light LED | `getRainLight` | red `[2.4,0.10,0.08]` | steady at night; 4.4 Hz strobe when wet |
| ERS strip | `getErsLight` | cyan `[0.25,2.2,2.0]` | **only when `c.boostOn`** — dim armed, strobing on deploy |
| Boost flame | `getBoostFlame` | blue-white `[0.65,1.7,3.0]` | while deploying (any time of day) |
| Exhaust glow | `getExhaustFlame` | amber `[2.6,1.05,0.25]` | night only, on throttle |

So pressing BOOST **adds** the cyan ERS strip + blue-white boost flame on top of
the steady red LED. The red LED's own brightness never changes → the player
correctly perceives "color shifts on boost, brightness doesn't."

### Key constraints discovered

- **There is no live "fuel level."** Fuel is only a parts-catalog *spec*
  (`Parts.CATALOG.fuel`: `standard` / `biofuel` / `quali_mix`), static per car.
  So "fuel" can drive a **fixed tint**, not a depleting gauge.
- **ERS `energy` IS live** — a per-car 0–1 charge that drains on deploy and
  recharges. This is the real dynamic quantity (present on AI cars too).
- **`gfx.draw` has no color-tint parameter** — vertex color is baked into the
  mesh; only `emissive` and `alpha` are per-draw scalars. Brightness-by-state is
  a scalar tweak; hue-by-state needs pre-colored cached meshes.
- The rear **red LED is FIA-mandated** in real F1, and the thing that *flashes*
  in reality is that red light (wet safety + ERS-harvest signal). So the design
  keeps the LED red and reuses its flash for the deploy signal.

## Decisions (from brainstorming)

1. **Fuel spec → exhaust flame hue** (static). Rear LED stays regulation red.
2. **ERS `energy` → rear LED brightness** (live). Dims when depleted, brightens
   as it recharges.
3. **OT / deploy → real-F1 flash** of the red rear LED (reuse the rain-light
   strobe pattern; no invented color).

## Design

All changes are **rendering-only** in the per-car rear-effects block of
`renderCars`/`render` (`js/game.js` ~4060–4112) plus pre-colored flame meshes in
`js/game/carmesh.js`. No physics, gameplay, or state changes.

### 1. Exhaust flame tinted by fuel spec

`carmesh.js` currently caches ONE `exhaustMesh` (amber). Replace with a small
per-fuel-tier cache so the flame color reads the car's chosen fuel:

- `standard`  → amber `[2.6, 1.05, 0.25]` (unchanged baseline)
- `biofuel`   → cooler green-amber, e.g. `[1.7, 1.9, 0.55]`
- `quali_mix` → hotter blue-white, e.g. `[1.5, 1.7, 2.4]`

`getExhaustFlame(fuelId)` returns/creates the mesh for that tier (cache keyed by
id). The draw site looks up the car's fuel spec once. AI cars whose parts are
unset resolve to `standard`.

**Fuel lookup:** the player's fuel id comes from `getTeamParts(team.id).fuel`
(default `"standard"`). Resolve to the tier at car-build time and store on the
car (`c.fuelId`) so the per-frame draw doesn't re-read localStorage.

**Scope note:** the exhaust flame is currently **night + on-throttle + player
only**. Fuel-tinting rides that existing gate — no change to when it shows. (If
we later want AI exhausts, that's a separate follow-up; keeping player-only here
matches today's behavior and vertex budget.)

### 2. Rear LED brightness ← live ERS charge

The steady night rain-light LED (`getRainLight`, drawn at ~4068 for `!wet &&
night`) currently draws at fixed `emissive: 1.0`. Scale its `emissive` (and/or
`alpha`) by ERS charge:

```
const en = clamp(c.energy || 0, 0, 1);
const ledEmis = 0.45 + 0.55 * en;   // dim floor when flat, full when charged
```

- Never fully dark (keeps the FIA anchor-light role that stops a car ahead from
  being a pitch-black void — the reason the steady LED exists).
- Applies to any car with known `energy`; AI start full so they read bright.
- Wet-strobe path keeps its own timing; only the steady-night path gets the
  charge-driven brightness (a wet race is a safety strobe, not an ERS gauge).

### 3. OT / deploy → real-F1 flash of the red LED

Real F1: the rear light **flashes** while the car is harvesting/deploying. Reuse
the existing rain-light strobe *pattern* on the red LED when OT is active
(`c.otT > 0`) or ERS is actively deploying, independent of the cyan ERS strip:

- When `c.otT > 0` (or `deploy > 0`) and **not wet**: drive the red LED with the
  same ~4 Hz duty the wet path uses (`(raceT * 4.4) % 1 < 0.55`), instead of
  steady. So from behind, a car on a push/OT lap **flashes red** — the authentic
  cue — while its steady brightness still reflects charge.
- Wet already strobes; if wet AND deploying, leave the wet strobe as-is (safety
  signal wins; no double-pattern).
- The existing cyan ERS strip + blue-white boost flame (`c.boostOn` block) are
  **unchanged** — they remain the "I'm on boost" cockpit-facing cue. The new
  flash is the *rear-facing* real-F1 signal that also fires for OT even when the
  BOOST toggle is off (OT deploys on its own per `wantBoost`).

### Data flow

```
car build  →  c.fuelId = getTeamParts(team.id).fuel || "standard"
                                   │
per frame, per car (rear-effects block):
  exhaust   →  getExhaustFlame(c.fuelId)      // hue by fuel (static)
  rear LED  →  emissive = f(c.energy)         // brightness by ERS (live)
              +  strobe if (c.otT>0 || deploying) && !wet   // real-F1 flash
```

## What is explicitly NOT changing

- Rear LED **stays red** (FIA convention) — fuel does not recolor it.
- No new fuel *gauge* / depletion mechanic — fuel remains a static parts spec.
- Physics, ERS drain/recharge, AI deploy logic — untouched.
- The cyan ERS strip and boost-flame quads keep their current color/behavior.

## Testing

Rendering feature, so verify by observation + a couple of state assertions
(house style: relative/behavioural, not pixel magnitudes):

- **Visual (playwright-probe / car-viewer):** screenshot the player rear at night
  at ERS full vs near-empty → LED visibly dimmer when flat. Screenshot each fuel
  spec on-throttle at night → distinct exhaust-flame hue. Screenshot with OT
  active → LED flashing (capture two frames across the duty cycle).
- **State (`__apex`):** confirm `c.fuelId` resolves per car; confirm the LED
  emissive expression is monotonic in `energy` (unit check, not a render check).
- **Regression:** `verify-track` (build guard) + a smoke that the rear-effects
  block throws on no car/edge state. Bump cache version (shipped JS).

## Files touched

- `js/game/carmesh.js` — per-fuel exhaust-flame mesh cache + `getExhaustFlame(fuelId)`.
- `js/game.js` — rear-effects block: fuel lookup at build (`c.fuelId`),
  ERS-scaled LED emissive, OT/deploy red-LED strobe.
- `index.html` + `version.json` — cache bump.

## Risk / coordination

`js/game.js` and `js/game/carmesh.js` are in the parallel session's active edit
set. Apply on a clean checkout of those files and commit promptly to minimize
collision (per the pattern established earlier this session).
