# Cockpit — 2026 halo furniture

Category: `cockpit` · aliases: `cockpitStyle` / `design.cockpit` ·
defaults: `buildCockpitParts` @ `js/car/car3d.js:1260`.

## Scope

Recipe-gated furniture around the **chase** halo only. First-person
(`opts.cockpit`) already zeroes every knob — that stays. The beveled titanium
hoop at `part("halo")` (`addBeveledSpan`, ~2247) is left alone. Vanity hood /
bolsters are **not** touched (they are not cockpit-recipe gated).

## Current draw sites

| Piece | File:line | Today |
|---|---|---|
| Defaults | `car3d.js:1260–1261` | `{ haloBlade:0, haloWing:0, camPods:0, screen:0 }` |
| Dark chase hoop + opening | `car3d.js:2115–2122` | always-on chase silhouette (not recipe) |
| FP halo (settings) | `car3d.js:2123–2136` | opt-in `opts.halo` only |
| **haloBlade** | `car3d.js:2140–2147` | 2× rectangular `addLoft` over the dark hoop |
| **haloWing** | `car3d.js:2148–2150` | single flat `addBox` |
| **camPods** | `car3d.js:2154–2159` | chunky dual `addBox` per pod |
| **screen** | `car3d.js:2160–2162` | one dark `addLoft` |
| Titanium halo (bevelled) | `car3d.js:2243–2253` | **do not undo** |

Registry already lists the four knobs (`parts.js` `VISUAL_FIELD_REGISTRY.geometry.cockpit`).
Catalog options + all eleven `sig_*_cpit` SIGNATURE entries already set them.

## 2026 look being matched

FIA 2026 Section C / `docs/COCKPIT-DATUMS.md`:

- Halo fairings sit **above Z = 695** (`y ≥ 0.695`) outside the helmet volume
  (C3.13.3).
- Real cars carry an **aero-section sleeve** on the titanium tube (not a second
  square loft), a small **upper winglet** on the rear-arc crown, broadcast
  **T-cams** as tiny stalk+pod+lens units on the rear hoop, and an optional
  **windscreen / deflector fairing** that tapers into the front pillar.

## Proposal (same knobs, better WHAT EXISTS)

No new knobs. Defaults stay `0` → **byte-identical** shipped cockpit.

1. **haloBlade 1/2** — `addBeveledSpan` sleeves along the **same stations** as
   the titanium halo arcs (front + rear per side), proud of the tube so the
   metal bevel still reads. Level 2 adds a centre crown fairing over the pillar
   junction and thickens the section.
2. **haloWing** — thin cambered `addBeveledSpan` winglet + tiny end fences
   (planform reads as a wing, not a plank).
3. **camPods 1–2** — `addBeamBetween` stalk + compact pod + glass lens (T-cam
   silhouette).
4. **screen** — carbon surround loft + inset `VISOR` panel + side returns to
   the front-arc roots.

## Triangle budget (validated in-memory patch, 2026-08-18)

Default body @0 and cockpit-only are **byte-identical** to stock
(`neutral identical? true`). Beveled titanium halo still present.

| Build | Tris | Ceiling | Notes |
|---|---|---|---|
| Default body `noWheels` | **2392** | 2400 | only 8 free — no always-on faces |
| Cockpit-only | **1264** | 1500 | furniture forced off under `ckpt` |
| Proposed knobs@0 | **2392** | — | **default-body delta 0** |

| Knob set | Stock Δ | Proposed Δ | Abs body |
|---|---|---|---|
| haloBlade 1 | +24 | **+64** | 2456 |
| haloBlade 2 | +24 | **+80** | 2472 |
| haloWing | +12 | **+40** | 2432 |
| camPods 2 | +48 | **+72** | 2464 |
| screen | +12 | **+48** | 2440 |
| full shroud knobs | +96 | **+240** | 2632 ≪ 1.6×2392 |

Cockpit-only stays **1264** → **−236 vs 1500** (236 headroom).

## SIGNATURE tagging

`parts-delta.json` re-states furniture knobs for all eleven `sig_*_cpit`
options (mesh-only; cost/stats already match `equivalent`). No new catalog
rows — every knob is already reachable via universal options.
