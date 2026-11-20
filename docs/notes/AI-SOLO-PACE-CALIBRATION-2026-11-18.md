# AI solo-pace calibration (#5330, 2026-11-18)

Summary: the AI field's solo order followed aero load, not the teams; AI-only terms now make it follow team tier, then driver skill, at a ~4 % NORMAL spread with the field median held (re-measured 2026-11-20 on the merge with #5791).

Kind: measurement · Re-measure-by: 2027-02-18

Instrument: `node tools/check/ai-solo.mjs --all --laps 3 --json` (each car alone, seed 1, NORMAL, wear off; best of
three flying laps). "Before" is the deploy tip (`ab21df75` for the first pass, `357821a7` for the 52-circuit table
below), "after" is PR #5686. `rho` is the Spearman rank
correlation of solo pace against the scripted `tierV x skill` order; "tiers in order" means every tier's mean lap is
slower than the tier above it. Code: `js/physics/ai-drive.js` (`aiErs`, `paceTrim`, `laneClear`; the wing grip is #5791's `AERO_GRIP_K`), call
sites in `js/game.js`.

## What set the order before (one car, Red Bull Ring unless named)

| lever | effect on a solo lap |
|---|---|
| aero load 0 -> 1 (grip +-8 %, no drag) | 5.2 % RBR, 5.7 % Monza, 3.6 % Monaco |
| ERS deploy 0 -> 1 (cost-free efficiency) | 1.1 % RBR, 1.0 % Monza, 2.1 % Monaco |
| tierV +-2 % (top speed only) | 1.5 % RBR, 1.9 % Monza, 1.1 % Monaco |
| neutral setups, traits kept | spread 2.44 %, rho -0.08: house-style `hold` braked the top teams early |
| neutral setups and traits, home lanes kept | rho 0.79; lanes zeroed: rho 0.99 |

## Calibration after #5791 (2026-11-20)

#5791 (Bryce decision B) landed first: AI wing grip 0.16 -> 0.055 per load (`AERO_GRIP_K`) and AI X-mode reads the
neutral wing. This PR's `aeroDragMul` (base vmax scaled so every wing reached the same X-mode top speed) assumed X-mode
followed the wing, so on the merge it penalised big wings twice (RBR rho 0.82, Monza 0.62, tiers out of order). It is
dropped, and `PACE_REF` re-centred 0.9302 -> 0.9332 to hold the NORMAL solo median. The wing's +-2.75 % grip is now
free, so the field spread is a little wider than the first pass. Solo, NORMAL, seed 1, 2 laps:

| | RBR spread / rho / tiers | Monza | Monaco |
|---|---|---|---|
| PR head 67c97789 (before #5791) | 3.49 % / 0.99 / yes | 3.55 % / 0.97 / yes | 3.20 % / 0.92 / yes |
| tip 357821a7 | 4.63 % / -0.14 / no | 2.78 % / 0.13 / no | 4.02 % / -0.08 / no |
| merge, aeroDragMul kept | 4.24 % / 0.82 / no | 4.59 % / 0.62 / no | 3.13 % / 0.93 / yes |
| merge, aeroDragMul dropped, PACE_REF 0.9332 | 3.90 % / 0.91 / yes | 3.93 % / 0.93 / yes | 4.10 % / 0.80 / ties* |

\* Monaco tiers 0/1 within 0.07 %, order may flip by seed. PACE_GAIN 2.0/2.25 narrowed the spread but broke Monaco's
tiers outright. The difficulty and racecraft rows below were measured on the first pass (before #5791).

## Difficulty held (solo median, after vs before)

| | easy | normal | hard |
|---|---:|---:|---:|
| Red Bull Ring | +0.24 % | +0.02 % | -0.20 % |
| Monaco | +0.40 % | +0.19 % | +0.31 % |
| Monza | -0.10 % | -0.28 % | -0.63 % |

## Racecraft (ai-tactics, 5 laps, 3 seeds, before -> after)

Monza: side-by-side resolved as a pass 55.1 -> 55.5 %, AI-AI contact episodes 27 -> 23 (ranges 22-36 / 11-31),
longest stuck 44 -> 47 s. Red Bull Ring: 56.9 -> 54.4 %, 22 -> 26 (21-38 / 16-33), 38 -> 42 s.

## Races still spread wider than solo

A 3-lap AI-only race at Red Bull Ring (NORMAL, seed 1, `scratch/solo/race.mjs` shape: every real car AI) gives a
best-lap spread of 11.0 % after (14.3 % before), p90/p10 7.9 % (9.7 %), median 103.18 s (103.82 s): most cars get one
or two green laps, often in a train, and NORMAL's mistake rate gives 0-3 mistakes a car, so the race spread is
traffic and mistakes, not pace. The front is now the top teams (RUS, VER, PIA, COL, HAM; before ALO, VER, HUL, STR,
LAW). A tighter RACE spread is a racecraft question (trains, mistakes), not this calibration's.

## All 52 circuits (after #5791, 2026-11-20)

**52 circuits**, NORMAL, seed 1, best of 3 flying solo laps. Spread median 3.30 % → **4.06 %** (range 1.98 %–4.63 % → 3.24 %–4.84 %); rho median 0.03 → **0.89**; tiers in order 0/52 → **48/52**; field median lap Δ median -0.46 % (range -1.33 % to 0.45 %). In 3–4 %: 24/52; under 3 %: 0; over 4 %: 28.

| circuit | spread before | spread after | rho before | rho after | tiers in order b→a | median Δ | fastest before → after |
|---|---:|---:|---:|---:|:---:|---:|---|
| abudhabi | 2.76 % | 4.48 % | 0.11 | 0.86 | ✗→✓ | +0.20 % | ALO (astonmartin) → RUS (mercedes) |
| albert_park | 3.45 % | 3.79 % | 0.11 | 0.92 | ✗→✓ | -0.94 % | ALO (astonmartin) → RUS (mercedes) |
| anderstorp | 4.08 % | 4.43 % | 0.01 | 0.86 | ✗→✗ | -0.19 % | ALO (astonmartin) → RUS (mercedes) |
| bahrain | 4.25 % | 3.75 % | 0.00 | 0.89 | ✗→✓ | -0.45 % | ALO (astonmartin) → RUS (mercedes) |
| baku | 2.62 % | 4.15 % | 0.05 | 0.91 | ✗→✓ | -0.34 % | STR (astonmartin) → RUS (mercedes) |
| brands_hatch | 3.37 % | 4.25 % | 0.22 | 0.87 | ✗→✓ | -0.42 % | ALO (astonmartin) → RUS (mercedes) |
| buddh | 2.76 % | 3.96 % | -0.01 | 0.86 | ✗→✓ | -1.14 % | ALO (astonmartin) → LEC (ferrari) |
| buenos_aires | 3.63 % | 4.06 % | -0.02 | 0.84 | ✗→✓ | -0.27 % | ALO (astonmartin) → LEC (ferrari) |
| catalunya | 2.99 % | 4.46 % | -0.31 | 0.89 | ✗→✓ | -1.33 % | ALO (astonmartin) → LEC (ferrari) |
| cota | 3.25 % | 3.47 % | 0.04 | 0.86 | ✗→✓ | -0.42 % | STR (astonmartin) → RUS (mercedes) |
| dijon | 2.13 % | 4.57 % | 0.26 | 0.93 | ✗→✓ | -0.28 % | ALO (astonmartin) → RUS (mercedes) |
| donington | 3.11 % | 4.05 % | 0.18 | 0.87 | ✗→✓ | -0.68 % | ALO (astonmartin) → RUS (mercedes) |
| estoril | 3.98 % | 4.06 % | 0.04 | 0.87 | ✗→✓ | -0.63 % | ALO (astonmartin) → LEC (ferrari) |
| fuji | 3.29 % | 3.69 % | -0.11 | 0.89 | ✗→✓ | -0.96 % | ALO (astonmartin) → RUS (mercedes) |
| hockenheim | 3.63 % | 3.75 % | 0.24 | 0.89 | ✗→✓ | -0.95 % | ALO (astonmartin) → RUS (mercedes) |
| hungaroring | 3.45 % | 4.30 % | -0.28 | 0.84 | ✗→✓ | -1.26 % | ALO (astonmartin) → LEC (ferrari) |
| imola | 3.14 % | 3.94 % | 0.06 | 0.90 | ✗→✓ | -0.08 % | STR (astonmartin) → RUS (mercedes) |
| indianapolis | 1.98 % | 3.94 % | -0.02 | 0.90 | ✗→✓ | -0.16 % | STR (astonmartin) → RUS (mercedes) |
| interlagos | 2.85 % | 4.11 % | -0.27 | 0.90 | ✗→✓ | -0.87 % | ALO (astonmartin) → RUS (mercedes) |
| istanbul | 3.54 % | 4.13 % | -0.08 | 0.87 | ✗→✓ | -0.45 % | STR (astonmartin) → RUS (mercedes) |
| jacarepagua | 2.69 % | 4.34 % | 0.03 | 0.86 | ✗→✓ | -1.14 % | ALO (astonmartin) → RUS (mercedes) |
| jeddah | 2.57 % | 4.24 % | 0.08 | 0.92 | ✗→✓ | -0.46 % | STR (astonmartin) → RUS (mercedes) |
| jerez | 3.93 % | 4.30 % | -0.04 | 0.86 | ✗→✓ | -0.83 % | ALO (astonmartin) → RUS (mercedes) |
| korea | 3.50 % | 3.76 % | 0.00 | 0.87 | ✗→✓ | -0.85 % | ALO (astonmartin) → RUS (mercedes) |
| kyalami | 3.59 % | 3.93 % | 0.01 | 0.90 | ✗→✓ | -0.95 % | STR (astonmartin) → RUS (mercedes) |
| madrid | 3.26 % | 3.65 % | -0.05 | 0.88 | ✗→✗ | -0.69 % | STR (astonmartin) → LEC (ferrari) |
| magny_cours | 3.76 % | 3.97 % | 0.18 | 0.87 | ✗→✓ | -0.22 % | ALO (astonmartin) → RUS (mercedes) |
| mexico | 3.32 % | 3.67 % | 0.16 | 0.90 | ✗→✓ | -0.47 % | ALO (astonmartin) → RUS (mercedes) |
| miami | 2.61 % | 3.89 % | 0.03 | 0.92 | ✗→✓ | -0.34 % | ALO (astonmartin) → RUS (mercedes) |
| monaco | 4.02 % | 4.10 % | -0.07 | 0.78 | ✗→✗ | +0.14 % | STR (astonmartin) → NOR (mclaren) |
| mont_tremblant | 2.82 % | 4.08 % | -0.03 | 0.88 | ✗→✓ | -0.03 % | ALO (astonmartin) → RUS (mercedes) |
| montreal | 3.59 % | 3.24 % | 0.13 | 0.87 | ✗→✓ | -0.23 % | ALO (astonmartin) → PIA (mclaren) |
| monza | 2.78 % | 3.93 % | 0.12 | 0.93 | ✗→✓ | -0.89 % | ALO (astonmartin) → RUS (mercedes) |
| mosport | 2.34 % | 4.37 % | 0.19 | 0.93 | ✗→✓ | +0.45 % | ALO (astonmartin) → RUS (mercedes) |
| mugello | 2.73 % | 4.72 % | -0.02 | 0.89 | ✗→✓ | -0.57 % | ALO (astonmartin) → LEC (ferrari) |
| nurburgring | 3.12 % | 4.09 % | -0.08 | 0.89 | ✗→✓ | -0.69 % | ALO (astonmartin) → RUS (mercedes) |
| okayama | 3.55 % | 4.19 % | -0.09 | 0.83 | ✗→✗ | -0.72 % | ALO (astonmartin) → LEC (ferrari) |
| paul_ricard | 2.60 % | 4.12 % | 0.05 | 0.92 | ✗→✓ | -0.51 % | ALO (astonmartin) → LEC (ferrari) |
| portimao | 3.66 % | 3.86 % | 0.06 | 0.86 | ✗→✓ | -0.07 % | ALO (astonmartin) → RUS (mercedes) |
| qatar | 3.73 % | 4.45 % | -0.11 | 0.87 | ✗→✓ | -1.12 % | ALO (astonmartin) → RUS (mercedes) |
| redbull | 4.63 % | 3.90 % | -0.13 | 0.91 | ✗→✓ | -0.32 % | ALO (astonmartin) → RUS (mercedes) |
| sepang | 3.43 % | 3.66 % | -0.05 | 0.87 | ✗→✓ | -1.08 % | ALO (astonmartin) → RUS (mercedes) |
| shanghai | 3.74 % | 3.66 % | -0.01 | 0.89 | ✗→✓ | -0.93 % | STR (astonmartin) → RUS (mercedes) |
| silverstone | 3.03 % | 4.84 % | 0.16 | 0.85 | ✗→✓ | -0.73 % | ALO (astonmartin) → RUS (mercedes) |
| singapore | 2.92 % | 3.79 % | -0.07 | 0.87 | ✗→✓ | -0.18 % | ALO (astonmartin) → RUS (mercedes) |
| sochi | 4.46 % | 3.67 % | 0.30 | 0.88 | ✗→✓ | -0.42 % | ALO (astonmartin) → RUS (mercedes) |
| spa | 3.30 % | 4.49 % | 0.12 | 0.95 | ✗→✓ | -0.67 % | ALO (astonmartin) → RUS (mercedes) |
| suzuka | 2.36 % | 4.19 % | 0.18 | 0.91 | ✗→✓ | -0.23 % | ALO (astonmartin) → RUS (mercedes) |
| vegas | 2.63 % | 3.85 % | 0.22 | 0.95 | ✗→✓ | -0.39 % | ALO (astonmartin) → RUS (mercedes) |
| watkins_glen | 2.47 % | 4.26 % | 0.33 | 0.92 | ✗→✓ | -0.29 % | ALO (astonmartin) → RUS (mercedes) |
| zandvoort | 3.54 % | 4.40 % | 0.17 | 0.91 | ✗→✓ | +0.03 % | ALO (astonmartin) → RUS (mercedes) |
| zolder | 4.13 % | 3.95 % | -0.12 | 0.84 | ✗→✓ | -1.01 % | STR (astonmartin) → RUS (mercedes) |

The four tier misses (anderstorp, madrid, monaco, okayama) are each tier 1 ahead of tier 0 by 0.03 s or less.
The first pass (before #5791) had spread median 3.60 %, rho 0.95, tiers in order 51/52.
