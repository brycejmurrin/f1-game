# AI solo-pace calibration (#5330, 2026-11-18)

Summary: the AI field's solo order followed aero load, not the teams; five AI-only terms now make it follow team tier, then driver skill, at a ~3.5 % NORMAL spread with the field median held.

Kind: measurement · Re-measure-by: 2027-02-18

Instrument: `node tools/check/ai-solo.mjs --all --laps 3 --json` (each car alone, seed 1, NORMAL, wear off; best of
three flying laps). "Before" is the deploy tip `ab21df75`, "after" is PR #5686. `rho` is the Spearman rank
correlation of solo pace against the scripted `tierV x skill` order; "tiers in order" means every tier's mean lap is
slower than the tier above it. Code: `js/physics/ai-drive.js` (`AERO_LOAD_GRIP`, `aeroDragMul`, `aiErs`, `paceTrim`,
`laneClear`), call sites in `js/game.js`.

## What set the order before (one car, Red Bull Ring unless named)

| lever | effect on a solo lap |
|---|---|
| aero load 0 -> 1 (grip +-8 %, no drag) | 5.2 % RBR, 5.7 % Monza, 3.6 % Monaco |
| ERS deploy 0 -> 1 (cost-free efficiency) | 1.1 % RBR, 1.0 % Monza, 2.1 % Monaco |
| tierV +-2 % (top speed only) | 1.5 % RBR, 1.9 % Monza, 1.1 % Monaco |
| neutral setups, traits kept | spread 2.44 %, rho -0.08: house-style `hold` braked the top teams early |
| neutral setups and traits, home lanes kept | rho 0.79; lanes zeroed: rho 0.99 |

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

## All 52 circuits

**52 circuits**, NORMAL, seed 1, best of 3 flying solo laps. Spread median 6.65 % → **3.60 %** (range 4.70–9.05 % → 2.87–4.86 %); rho median 0.19 → **0.95**; tiers in order 0/52 → **51/52**; field median lap Δ median -0.28 % (range -1.17 to 0.81 %). In 3–4 %: 40/52; under 3 %: 4; over 4 %: 8.

| circuit | spread before | spread after | rho before | rho after | tiers in order b→a | median Δ | fastest before → after |
|---|---:|---:|---:|---:|:---:|---:|---|
| abudhabi | 6.26 % | 3.83 % | 0.33 | 0.97 | ✗→✓ | +0.52 % | ALO (astonmartin) → RUS (mercedes) |
| albert_park | 7.16 % | 3.81 % | 0.17 | 0.92 | ✗→✓ | -0.67 % | ALO (astonmartin) → RUS (mercedes) |
| anderstorp | 8.49 % | 3.46 % | 0.19 | 0.99 | ✗→✓ | +0.00 % | ALO (astonmartin) → RUS (mercedes) |
| bahrain | 7.58 % | 3.70 % | 0.13 | 0.91 | ✗→✓ | -0.71 % | ALO (astonmartin) → RUS (mercedes) |
| baku | 5.63 % | 3.93 % | 0.21 | 0.92 | ✗→✓ | -0.25 % | ALO (astonmartin) → RUS (mercedes) |
| brands_hatch | 7.20 % | 3.63 % | 0.17 | 0.96 | ✗→✓ | -0.62 % | ALO (astonmartin) → RUS (mercedes) |
| buddh | 6.70 % | 3.07 % | 0.21 | 0.99 | ✗→✓ | -0.59 % | ALO (astonmartin) → RUS (mercedes) |
| buenos_aires | 7.03 % | 3.24 % | 0.18 | 1.00 | ✗→✓ | +0.13 % | ALO (astonmartin) → RUS (mercedes) |
| catalunya | 5.85 % | 3.82 % | 0.05 | 0.98 | ✗→✓ | -1.03 % | ALO (astonmartin) → RUS (mercedes) |
| cota | 6.35 % | 2.98 % | 0.23 | 0.97 | ✗→✓ | -0.25 % | STR (astonmartin) → RUS (mercedes) |
| dijon | 5.70 % | 4.86 % | 0.35 | 0.85 | ✗→✓ | -0.26 % | ALO (astonmartin) → RUS (mercedes) |
| donington | 6.85 % | 3.37 % | 0.31 | 0.98 | ✗→✓ | -0.22 % | ALO (astonmartin) → RUS (mercedes) |
| estoril | 7.74 % | 3.31 % | 0.19 | 0.96 | ✗→✓ | -0.96 % | ALO (astonmartin) → RUS (mercedes) |
| fuji | 5.93 % | 3.44 % | 0.17 | 0.91 | ✗→✓ | -0.61 % | ALO (astonmartin) → RUS (mercedes) |
| hockenheim | 6.65 % | 3.77 % | 0.27 | 0.87 | ✗→✓ | -0.49 % | ALO (astonmartin) → RUS (mercedes) |
| hungaroring | 7.28 % | 3.37 % | 0.02 | 0.98 | ✗→✓ | -0.70 % | ALO (astonmartin) → RUS (mercedes) |
| imola | 4.70 % | 4.13 % | 0.12 | 0.83 | ✗→✓ | -0.36 % | STR (astonmartin) → RUS (mercedes) |
| indianapolis | 5.40 % | 3.66 % | 0.20 | 0.96 | ✗→✓ | +0.04 % | STR (astonmartin) → RUS (mercedes) |
| interlagos | 5.41 % | 3.98 % | -0.02 | 0.91 | ✗→✓ | -0.89 % | ALO (astonmartin) → RUS (mercedes) |
| istanbul | 5.81 % | 3.86 % | 0.09 | 0.87 | ✗→✓ | -0.29 % | STR (astonmartin) → RUS (mercedes) |
| jacarepagua | 7.32 % | 3.44 % | 0.26 | 0.99 | ✗→✓ | -0.64 % | ALO (astonmartin) → RUS (mercedes) |
| jeddah | 4.91 % | 4.40 % | 0.23 | 0.84 | ✗→✓ | -0.54 % | STR (astonmartin) → RUS (mercedes) |
| jerez | 7.88 % | 3.50 % | 0.08 | 0.97 | ✗→✓ | -0.88 % | ALO (astonmartin) → RUS (mercedes) |
| korea | 7.09 % | 3.20 % | 0.18 | 0.98 | ✗→✓ | -0.87 % | ALO (astonmartin) → RUS (mercedes) |
| kyalami | 6.55 % | 3.42 % | 0.15 | 0.93 | ✗→✓ | -0.29 % | ALO (astonmartin) → RUS (mercedes) |
| madrid | 5.28 % | 3.54 % | 0.05 | 0.82 | ✗→✗ | -0.74 % | STR (astonmartin) → ANT (mercedes) |
| magny_cours | 6.68 % | 3.75 % | 0.30 | 0.91 | ✗→✓ | +0.00 % | ALO (astonmartin) → RUS (mercedes) |
| mexico | 6.27 % | 3.16 % | 0.33 | 0.93 | ✗→✓ | +0.14 % | ALO (astonmartin) → RUS (mercedes) |
| miami | 6.20 % | 3.73 % | 0.26 | 0.95 | ✗→✓ | -0.04 % | ALO (astonmartin) → RUS (mercedes) |
| monaco | 6.10 % | 3.19 % | 0.01 | 0.93 | ✗→✓ | +0.19 % | STR (astonmartin) → RUS (mercedes) |
| mont_tremblant | 5.59 % | 3.79 % | 0.15 | 0.88 | ✗→✓ | +0.02 % | ALO (astonmartin) → RUS (mercedes) |
| montreal | 7.08 % | 2.96 % | 0.28 | 0.94 | ✗→✓ | -0.05 % | ALO (astonmartin) → RUS (mercedes) |
| monza | 7.43 % | 3.55 % | 0.29 | 0.97 | ✗→✓ | -0.28 % | ALO (astonmartin) → RUS (mercedes) |
| mosport | 6.61 % | 4.78 % | 0.35 | 0.94 | ✗→✓ | +0.81 % | ALO (astonmartin) → RUS (mercedes) |
| mugello | 6.77 % | 3.90 % | 0.21 | 0.98 | ✗→✓ | -0.13 % | ALO (astonmartin) → RUS (mercedes) |
| nurburgring | 6.67 % | 3.45 % | 0.18 | 0.98 | ✗→✓ | -0.39 % | ALO (astonmartin) → RUS (mercedes) |
| okayama | 7.17 % | 2.87 % | 0.11 | 0.99 | ✗→✓ | -0.29 % | ALO (astonmartin) → RUS (mercedes) |
| paul_ricard | 6.18 % | 3.60 % | 0.27 | 0.99 | ✗→✓ | -0.34 % | ALO (astonmartin) → RUS (mercedes) |
| portimao | 7.28 % | 3.23 % | 0.19 | 0.96 | ✗→✓ | -0.01 % | ALO (astonmartin) → RUS (mercedes) |
| qatar | 7.67 % | 3.88 % | 0.13 | 0.98 | ✗→✓ | -1.17 % | ALO (astonmartin) → RUS (mercedes) |
| redbull | 9.05 % | 3.37 % | 0.10 | 0.98 | ✗→✓ | +0.02 % | ALO (astonmartin) → RUS (mercedes) |
| sepang | 6.87 % | 2.99 % | 0.13 | 0.96 | ✗→✓ | -1.00 % | ALO (astonmartin) → RUS (mercedes) |
| shanghai | 6.50 % | 3.36 % | 0.10 | 0.94 | ✗→✓ | -0.83 % | STR (astonmartin) → RUS (mercedes) |
| silverstone | 7.61 % | 3.78 % | 0.29 | 0.99 | ✗→✓ | -0.31 % | ALO (astonmartin) → RUS (mercedes) |
| singapore | 6.00 % | 3.04 % | 0.17 | 0.98 | ✗→✓ | +0.28 % | STR (astonmartin) → RUS (mercedes) |
| sochi | 7.33 % | 3.41 % | 0.23 | 0.88 | ✗→✓ | -0.25 % | ALO (astonmartin) → RUS (mercedes) |
| spa | 7.37 % | 4.50 % | 0.20 | 0.94 | ✗→✓ | -0.22 % | ALO (astonmartin) → RUS (mercedes) |
| suzuka | 5.79 % | 4.61 % | 0.30 | 0.89 | ✗→✓ | +0.10 % | ALO (astonmartin) → RUS (mercedes) |
| vegas | 5.95 % | 4.01 % | 0.36 | 0.88 | ✗→✓ | +0.08 % | ALO (astonmartin) → RUS (mercedes) |
| watkins_glen | 6.46 % | 4.00 % | 0.31 | 0.94 | ✗→✓ | +0.03 % | ALO (astonmartin) → RUS (mercedes) |
| zandvoort | 6.46 % | 4.10 % | 0.19 | 0.89 | ✗→✓ | +0.18 % | ALO (astonmartin) → RUS (mercedes) |
| zolder | 6.61 % | 3.29 % | -0.03 | 0.91 | ✗→✓ | -0.44 % | STR (astonmartin) → RUS (mercedes) |
