# Qualifying sheet: wing term, centre and per-circuit calibration, 2026-11-18 (#5783 Q1, PR #5786, option 1b)

Kind: measurement · Re-measure-by: 2027-02-18

## Current calibration readout, 2026-11-23 (wing coefficient 0.055)

At deploy revision `ceb304af1a`, `AiDrive.aeroGrip(load)` uses `AI_WING_GRIP = 0.055`. The simulated field's base lap is the integrated lap multiplied by `QUALI_CENTRE` 0.993 and the generated circuit factor. The model applies `AiDrive.paceTrim` to the car's free speed and corner authority and uses the square root of its wing grip in the corner cap. A human row uses the seat's authored wing and pace trim, independent of player setup edits. [Wing change #5854](https://github.com/brycejmurrin/f1-game/pull/5854) · [Pace calibration #5686](https://github.com/brycejmurrin/f1-game/pull/5686)

The current [calibration data](../../tests/data/quali-calibration.json) contains 1,716 paired rows across 52 circuits and three difficulties, 11 sampled grid slots per circuit and difficulty. The recorded laps come from thinned dry races at PACE 0.8396, seed 1, with wear and wind off. Each row stores the best of three timed laps in frames at 60 Hz and the matching uncalibrated model lap in milliseconds. The first 0.055 calendar measurement landed in `0d98e69124`. The checked-in rows come from the subsequent calendar rerun in `0292569af5` after the model adopted pace trim. The latter changed 1,711 driven frame counts and all 1,716 model times relative to the first 0.055 measurement. [First 0.055 measurement](https://github.com/brycejmurrin/f1-game/commit/0d98e69124cd9127e7fa2ab5ddf4d687476b6e03) · [Pace-trim rerun](https://github.com/brycejmurrin/f1-game/commit/0292569af5)

The generator takes the median of the paired driven-to-raw time ratios across all three difficulties for each circuit, then rounds to four decimal places. Factors span 0.9184 at Silverstone to 0.9753 at Imola. The calendar median and fallback for a track without its own factor is 0.9453. [Factor generator](../../tools/gen/gen-quali-calib.mjs) · [Current model](../../js/race/quali-model.js)

The paired ratios below divide each sampled car's calibrated base lap by its driven best. Each circuit contributes the median of its 11 paired ratios for that difficulty. These are summaries of the same sample used to fit the circuit factors. The later pace-trim commit separately reports all five independent parity tests passing. [Pace-trim rerun](https://github.com/brycejmurrin/f1-game/commit/0292569af5) · [Parity test](../../tests/unit/quali-absolute-parity-vm.test.mjs)

| Difficulty | Circuit median ratio, min / median / max |
|---|---|
| Easy | 0.988 / 0.993 / 0.996 |
| Normal | 0.989 / 0.993 / 0.995 |
| Hard | 0.989 / 0.993 / 0.997 |

Hard-difficulty examples from the recorded dry data. Base model times use the stored raw time multiplied by the circuit factor and 0.993. Each set of times is sorted independently.

| Circuit | Factor | Driven best, fastest / median / slowest (s) | Base model, fastest / median / slowest (s) |
|---|---:|---|---|
| Monza | 0.9387 | 116.45 / 119.40 / 123.10 | 115.62 / 118.11 / 119.59 |
| Monaco | 0.9648 | 90.15 / 92.08 / 92.70 | 89.58 / 91.60 / 92.71 |
| Suzuka | 0.9336 | 120.32 / 123.22 / 124.85 | 120.02 / 122.87 / 124.47 |
| Silverstone | 0.9184 | 118.92 / 122.40 / 125.40 | 118.41 / 121.45 / 123.13 |
| Spa | 0.9416 | 140.55 / 143.67 / 145.92 | 139.93 / 143.17 / 145.06 |
| Bahrain | 0.9480 | 122.50 / 125.23 / 127.03 | 122.18 / 124.54 / 125.90 |

The stored sample leaves out the other grid slots, the seeded execution variation and the driver qualifying bias applied by `simLap`. Recreating the historical full-grid placing table and the owner's wear-real table would require separate measurements. The medal pole now uses 0.9915 times the calibrated synthetic top car's lap. Pit loss and replay scaling use the separate neutral-wing reference with `QUALI_TRIM` 0.92. [Stored measurements](../../tests/data/quali-calibration.json) · [Current model](../../js/race/quali-model.js)

## Historical experiment, 2026-11-18 (wing coefficient 0.16)

The original option 1b experiment found a median P12 for a driver matching the AI's pace. P9 to P15 covered 33, 45 and 45 of the 52 circuits on easy, normal and hard respectively. The same comparison gave pole everywhere before the refit and a median P22 in the first refit. The experiment's medal reference and AI pit strategy stayed at the first refit's values. Unless marked relayed, the figures below are from that experiment's VM measurements. In its tables, “today” means the pre-refit revision `9261395b`, and “this tree” means the original option 1b test tree. [First refit measurements](QUALI-REFIT-2026-11-18.md)

### The three parts

1. Wing term. `AiDrive.aeroGrip(load) = 1 + (load - 0.5) x AERO_GRIP_K` (0.16) is the factor the driven AI's lateral grip carries (`js/physics/ai-drive.js` `lateralScale`, `lateralScales`, `brakeTarget`); `carLap` multiplies its corner cap by the square root. One constant, one helper: the model cannot drift from the driver.
   A HUMAN's car (the player, a VS FRIEND rival) reads the neutral wing, factor 1, on purpose: on track a human pays for wing in top speed and the AI does not (#5791), so a simulated human time must not move with a setup slider (maximum wing, SIMULATE, then race on any wing would buy grid places). `tests/unit/quali-persist.test.mjs` pins it: identical at minimum, neutral and maximum wing, and the AI rows do not move with the human's setup.
2. Centre. `QUALI_CENTRE` 0.993, one constant; the model does not read the tyre-wear setting (see Yardstick).
3. Per-circuit factor. `CALIB[id]` in the `@gen-quali-calib` block of `js/race/quali-model.js`, 0.9339 (silverstone) to 0.9792 (imola); a circuit with no row (a TRACK DESIGNER layout) takes the calendar median 0.9590.

### How the factor is made (two stages)

- Measurement, a tool run: `node tools/check/quali-calibrate.mjs --update --jobs 3` writes `tests/data/quali-calibration.json`. Per circuit and level it drives two thinned clear-air AI fields (grid slots `i % 4 == 1` and `3`, 11 cars, best of 3 timed laps, tyre wear and wind off, VM seed 1) and records each car's best lap as an integer frame count (1/60 s) beside the model's uncalibrated lap in integer ms. Each circuit runs in its own process; nothing from the clock, host or order reaches the file. `--verify <id>` re-measures one circuit and compares byte for byte; `--model-only` refreshes the model column without driving. Measured on this 4-core box: 12 min wall, 35 min of CPU at `--jobs 3` for the calendar (`--model-only` 4 min at `--jobs 4`), and the file it wrote was byte-identical to one assembled from an earlier drive that ran the circuits in three long-lived processes in a different order. It is never part of `npm run gen` or CI, and the file is not in `GENERATED_PATHS` (a merge regenerates those).
- Generator, arithmetic: `tools/gen/gen-quali-calib.mjs` (in `npm run gen` and `gen:check`; `tests/unit/generated-docs.test.mjs` runs its `--check`) writes the block: per circuit the median over all measured cars and levels of driven / uncalibrated model, to 4 decimals. It refuses a factor outside [0.9, 1.1] and a file that is not exactly the calendar. The edit hook refuses a hand edit of the block (tried: "the edit touches a generated block").

Re-measure duty: when the AI's driving changes, `tests/unit/quali-absolute-parity-vm.test.mjs` fails; run the tool with `--update`, then `npm run gen`, and commit both files. When only the model's integrated lap changes, the test's third assertion fails and `--model-only` is enough.

### Yardstick: how much quicker is a qualifying lap than a race lap for the same driver

`scratch/yardstick/quali-vs-race.mjs` (a subagent's script, re-run by this lane with identical output): the real qualifying flow in the VM, the AI driver model given the car at the flying-start hand-over; hard; R = the same car's clear-air race best lap; "off" / "real" = tyre wear.

| circuit | car (wing) | Q_off / R_off | Q_real / R_off | Q_real / Q_off | Q_real / R_real |
|---|---|---|---|---|---|
| monza | Aston Martin (1.00) | 0.9983 | 1.0000 | 1.0017 | 0.9883 |
| monza | Mercedes (0.69) | 0.9976 | 0.9993 | 1.0017 | 0.9877 |
| monza | Cadillac (0.04) | 0.9948 | 0.9958 | 1.0010 | 0.9820 |
| monaco | Aston Martin | 0.9887 | 0.9914 | 1.0027 | 0.9774 |
| monaco | Mercedes | 0.9901 | 0.9936 | 1.0035 | 0.9789 |
| monaco | Cadillac | 0.9875 | 0.9905 | 1.0031 | 0.9780 |
| suzuka | Aston Martin | 0.9900 | 0.9915 | 1.0015 | 0.9784 |
| suzuka | Mercedes | 0.9922 | 0.9937 | 1.0015 | 0.9829 |
| suzuka | Cadillac | 0.9919 | 0.9929 | 1.0009 | 0.9803 |

The calibration's reference is the wear-off race lap, so the yardstick is Q / R_off: 0.9875 to 0.9983 with wear off, 0.9905 to 1.0000 with wear real. The earlier "1.3 to 2.0 % with wear real" was Q_real / R_real, against a race lap that wear and fuel had already slowed by 1.1 to 1.5 %. The qualifying lap itself moves 0.1 to 0.35 % with the wear setting. The whole wear-off gain is the flying start (relayed: from 20 % of the lap to the line Q / R is 0.9991 to 1.0007; fuel and tyre-temperature multipliers are exactly 1 with wear off, `js/physics/tyre-model.js`).

Residual left in: the flying-start gain varies by circuit (Monza about 0.3 %, Monaco and Suzuka about 1.0 %), so one centre is off by about ±0.4 % per circuit. Follow-up that would remove it, not built: calibrate on flying laps (the tool stages the qualifying flow per car).

### Where a lap lands on the sheet (52 circuits; pole / P2-8 / P9-15 / P16-21 / behind the 21 AI rows; median place)

Driven laps: this lane's calendar drive (the measurement file's sample). Sheets: `G.qualiSim(0)` on worktrees of `9261395b` (today), `fed34d71` (first refit) and this tree.

| model | level | AI-median race lap | AI-fastest race lap | equal driver's qualifying lap (AI-median x 0.993) | sheet span s, min / med / max | driven span s |
|---|---|---|---|---|---|---|
| today | easy | 51 / 1 / 0 / 0 / 0 (P1) | 52 / 0 / 0 / 0 / 0 | 52 / 0 / 0 / 0 / 0 (P1) | 1.1 / 1.9 / 3.1 | 3.7 / 5.8 / 8.5 |
| today | normal | 52 / 0 / 0 / 0 / 0 (P1) | 52 / 0 / 0 / 0 / 0 | 52 / 0 / 0 / 0 / 0 (P1) | 1.0 / 1.7 / 2.8 | 2.6 / 5.4 / 8.2 |
| today | hard | 52 / 0 / 0 / 0 / 0 (P1) | 52 / 0 / 0 / 0 / 0 | 52 / 0 / 0 / 0 / 0 (P1) | 0.9 / 1.3 / 2.2 | 2.8 / 5.0 / 7.7 |
| first refit | easy | 0 / 0 / 1 / 0 / 51 (P22) | 8 / 1 / 3 / 0 / 40 | 1 / 0 / 2 / 1 / 48 (P22) | 0.9 / 1.3 / 1.9 | as above |
| first refit | normal | 0 / 0 / 0 / 0 / 52 (P22) | 2 / 2 / 3 / 1 / 44 | 0 / 0 / 0 / 3 / 49 (P22) | 0.9 / 1.2 / 1.7 | |
| first refit | hard | 0 / 0 / 0 / 0 / 52 (P22) | 3 / 2 / 1 / 5 / 41 | 0 / 0 / 1 / 2 / 49 (P22) | 0.8 / 1.1 / 1.5 | |
| 1b, centre 0.993 | easy | 0 / 0 / 36 / 16 / 0 (P14) | 30 / 16 / 6 / 0 / 0 | 2 / 15 / 33 / 2 / 0 (P12) | 2.5 / 4.2 / 5.7 | |
| 1b, centre 0.993 | normal | 0 / 0 / 27 / 24 / 1 (P15) | 21 / 14 / 17 / 0 / 0 | 0 / 3 / 45 / 4 / 0 (P12) | 2.4 / 4.1 / 5.6 | |
| 1b, centre 0.993 | hard | 0 / 0 / 22 / 30 / 0 (P16) | 15 / 19 / 18 / 0 / 0 | 0 / 3 / 45 / 4 / 0 (P12) | 2.6 / 4.1 / 5.4 | |
| 1b, centre 0.985 (not built) | easy | 0 / 0 / 5 / 46 / 1 (P16) | 12 / 9 / 31 / 0 / 0 | 0 / 0 / 32 / 20 / 0 (P14) | same | |
| 1b, centre 0.985 (not built) | normal | 0 / 0 / 0 / 49 / 3 (P17) | 5 / 6 / 41 / 0 / 0 | 0 / 0 / 20 / 31 / 1 (P16) | | |
| 1b, centre 0.985 (not built) | hard | 0 / 0 / 0 / 51 / 1 (P17) | 7 / 4 / 34 / 7 / 0 | 0 / 0 / 18 / 34 / 0 (P16) | | |

Per-circuit median of model / driven over the measured cars (min / median / max over circuits): today 0.999 / 1.091 / 1.227, 1.012 / 1.080 / 1.191, 1.012 / 1.057 / 1.155; first refit 0.943 / 0.967 / 0.998, 0.944 / 0.965 / 0.993, 0.945 / 0.963 / 0.992 (the earlier lane's own drive agrees within 0.002 on the medians); 1b 0.987 / 0.995 / 1.001, 0.985 / 0.992 / 0.997, 0.987 / 0.993 / 0.996 (in sample; the test below is the out-of-sample check).

The sheet stays 1 to 1.5 s narrower than the driven field: for the AI a high wing is also worth straight-line time (#5791), which a corner term cannot reproduce. That is why the AI's fastest race lap is still pole at 15 to 30 circuits.

### The test (out of sample: grid slots `i % 4 == 0`, 5 circuits x 3 levels, easy / normal / hard)

| circuit | median model / driven, band [0.978, 1.008]: today | first refit | 1b | fastest model / fastest driven, band [0.968, 1.018]: today | first refit | 1b |
|---|---|---|---|---|---|---|
| monza | 1.153 / 1.130 / 1.091 | 0.955 / 0.949 / 0.948 | 0.983 / 0.981 / 0.982 | 1.181 / 1.161 / 1.117 | 0.983 / 0.979 / 0.973 | 1.004 / 0.999 / 0.993 |
| monaco | 0.992 / 1.003 / 1.001 | 0.940 / 0.943 / 0.940 | 0.983 / 0.989 / 0.986 | 0.991 / 1.005 / 1.005 | 0.940 / 0.946 / 0.944 | 0.975 / 0.980 / 0.977 |
| spa | 1.152 / 1.152 / 1.092 | 0.955 / 0.975 / 0.952 | 0.988 / 0.998 / 0.994 | 1.181 / 1.153 / 1.117 | 0.984 / 0.976 / 0.977 | 1.007 / 0.999 / 0.999 |
| bahrain | 1.073 / 1.070 / 1.043 | 0.956 / 0.966 / 0.967 | 0.998 / 1.002 / 1.004 | 1.086 / 1.081 / 1.053 | 0.970 / 0.976 / 0.977 | 1.007 / 1.012 / 1.013 |
| suzuka | 1.129 / 1.110 / 1.083 | 0.976 / 0.968 / 0.968 | 0.994 / 0.992 / 0.998 | 1.139 / 1.127 / 1.102 | 0.989 / 0.987 / 0.988 | 1.003 / 1.000 / 1.000 |

Today's model fails the median at four circuits (Monaco's median passes; Monaco fails the third assertion, the model column of the measurement file); the first refit fails the median in every cell; 1b passes all three assertions in every cell. The fastest-car band is wider than the median's (one car, and the narrower sheet). It catches today's model and does not catch the first refit (0.940 to 0.989); the median does. Monaco's 0.975 is a known residual: the corner-only wing term overstates wing where there are no straights; revisit when #5791 is decided.

### The owner's settings (export 2026-11-10: hard, OVERALL SPEED 11, tyre wear real; wind off in the VM)

| circuit | AI clear-air race best laps, wear real, fastest / median / slowest | same, wear off | sheet P1 / P11 / P22 today | first refit | 1b | equal driver's qualifying lap lands: today / first refit / 1b |
|---|---|---|---|---|---|---|
| monza | 119.3 / 121.3 / 125.8 | 115.8 / 119.3 / 123.6 | 132.2 / 133.3 / 134.1 | 115.2 / 115.8 / 116.4 | 117.1 / 117.8 / 120.8 | P1 / P22 / P12 |
| monaco | 91.9 / 93.8 / 94.9 | 90.8 / 92.0 / 93.6 | 92.5 / 93.0 / 93.4 | 86.9 / 87.3 / 87.8 | 89.6 / 90.4 / 93.4 | P1 / P22 / P16 |
| suzuka | 124.2 / 124.8 / 129.4 | 121.5 / 122.9 / 126.7 | 134.3 / 135.2 / 136.0 | 120.4 / 121.0 / 121.6 | 121.2 / 122.1 / 126.2 | P1 / P22 / P11 |
| silverstone | 122.9 / 124.5 / 128.9 | 120.3 / 122.6 / 126.8 | 135.4 / 136.3 / 137.1 | 120.9 / 121.5 / 122.1 | 120.1 / 121.1 / 125.5 | P1 / P16 / P12 |

Gold (`referencePole`) is unchanged from the first refit: 112.8, 85.2, 117.8, 118.1.

### What stayed the same in the experiment

A state hash of AI-only races (every car's position, speed, lap, stops and wear every 30 frames for 150 s, plus the pit plans and `pitLossLaps`) is identical between `fed34d71` and this tree in 7 cases: monza hard, suzuka normal and monaco easy with wear off; monza hard (10 laps), redbull hard (20), redbull normal (10) and bahrain hard (20) with wear real. `referencePole` has the same five readers and is untouched, so the stop-count table of the first note stands as measured there. `carLap` has one reader in the game, `simLap`, so what moves is the sheet and what reads it: the grid, `__apex.qualiSim`, and VS FRIEND's SIMULATE time, which for a human's own car does not read the wing level (above).
