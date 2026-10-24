# Perf governor: the quantum probe, one-frame stalls, thermal-drift default (2026-10-23)

A·W40 (Fleet A, "Phone perf" lane). Three items from
`docs/notes/PERF-KNOWN-WINS-2026-10-23.md`: row 6 (a scale step that cannot
cross a vsync quantum), #3657 (the visor makes WebGL2 shed tiers), and row 5
(thermal drift → 45 fps on by default?). Every number below is a Node replay of
the real `js/perf/governor.js` / `js/perf/thermal-drift.js`, using the same
harness as `tests/unit/perf-governor.test.mjs` (fake `setRenderScale` with the
GLX 0.02 dead zone, vsync quantisation at 60 Hz). None of it is device evidence.

## 1. Row 6: the probe now goes to the scale floor

Row 6 was partly stale. `1eec73be` (2026-10-21) had already added one bigger
probe after a failed 0.1 cut, to `prev × √½` (half the pixels). The replay
sweep shows where that stops working. Cost model `c × (f + (1−f)·s²)`, f = fixed
share, 7200 frames:

| f | c (ms at scale 1) | best scale for 60 | before: scale / moves | after: scale / moves |
|---|---|---|---|---|
| 0.4 | 19–22 | 0.75–0.85 | 0.754–0.8 / 9 | 0.763–0.8 / 11 |
| 0.4 | 23 | 0.7 | 0.707 / 8 | 0.725 / 10 |
| 0.4 | **24–30** | 0.5–0.7 | **1 / 3, floor 33.3 (30 fps)** | 0.5–0.65 / 9–10, floor 16.7 |
| 0.4 | 31–33 | none | 1 / 3 (futile) | 1 / 3 (futile) |
| 0.25 | **27–34** | 0.55–0.65 | **1 / 3 (30 fps); 0.9 / 21 at 34** | 0.5–0.65 / 9–10 |
| any | LPM 33.3 flat, CPU-bound 18 | — | 1 / 3 (futile) | 1 / 3 (futile) |

Half the pixels crosses a quantum only while the fixed share leaves room, so
24–30 ms phones (f = 0.4) still sat at 30 fps where 0.5–0.65 holds 60.

**Change:** the single probe goes to the 0.5 floor, the one probe that can
answer "can the scale lever cross a quantum at all". The ceiling (one step under
the cut that missed) and the verified halving climb then search back up for the
highest scale that holds. Two alternatives were replayed and dropped:

- **Two probes (√½, then 0.5):** the same scales, but every Low Power Mode or
  CPU-bound phone pays one more reallocation per race (3 → 4 moves). That is
  the commonest futile case in the field.
- **Probe to 0.5 on the old 0.5 ms margin:** on the CPU-bound test device
  (`43 − 7·tier` ms with a 10 ms frame every 20th) the evaluation phase moves
  the EMA by ±1 ms, so the floor probe "verified" on noise and parked the scale
  at 0.5. The old √½ probe had the same flaw, only slower: by frame 1329 it had
  walked 0.707 → 0.607 → 0.5. The unit test sampled at frame 1200 and passed by
  one ULP (`0.5000000000000001 > 0.5`).
  So **the floor probe must buy back half the miss**
  (`max(0.5, (ema − floor) / 2)`). A real crossing moves the average by a whole
  vsync, about 16 ms.

Cost: phones that the √½ probe already fixed (c ≈ 19–23 ms) spend two more
verified climb moves in a race (9 → 11) and end on the same or a slightly
higher scale. Pins changed, with reasons in the test: Eq/Eq2 `moves <= 10` →
`<= 12`. The CPU-bound test now feeds 1500 frames and asserts
`scale > 0.5 + 1e-6`; the pre-change code fails it. New: replay Eq4
(c = 24/26/28/30 must hold 60 within one step of the best scale).

`driftStep()` still steps 0.1 with no verify. It is a bet on future heat, not a
quantum crossing, so it is left alone.

## 2. #3657: one-frame stalls, and what actually trips the ladder

**Mechanism found:** a single 50–100 ms frame (anything under `SPIKE_MS`)
raises `_frameEMA` by 3–8 ms, and the rise decays over about 10 frames. Landing just
before an evaluation, it can cross `degradeAt`. The cut is then priced against
the inflated EMA, and 75–135 frames later the EMA has relaxed back, so the step
"verifies" by regression to the mean. On a phone, a verified tier shed latches
`_phoneSlowLatch` for the session.

**Change:** the degrade gate and both ends of every verify read `_evEMA`
instead. It is the same alpha-0.1 average with one difference: a multi-vsync
stall (over 2.5 floors) counts as one missed vsync (2 floors), at most
`STALL_TRIM = 2` per evaluation window. A 16.7/33.3 mixture, which is what
real overload looks like at 60 Hz, is fed unchanged, and so is every stall past
the second. Onset is as fast as the EMA's. The first try was a trimmed boxcar
window mean; it lags a step change in load, and the "slow from lights-out"
replay D device was never cut. The restore gate keeps the plain EMA.

**Model** (`scratch/w40/visor.mjs`, not committed). A CPU-bound WebGL2 phone:
the scale lever buys nothing, a tier saves `g` ms, Gaussian jitter of 2 ms,
quantised. Optional isolated 50/67 ms stalls at 1 frame in 40. 200 seeds,
20 s arms, "trip" = tier ≥ 3 at 20 s:

| base / tier gain / stalls | trip before | trip after |
|---|---|---|
| 15.0 ms / 0 (shed useless) / none | 20 % | 22 % |
| 15.0 / 0 / 1:40 | 28 % | 26 % |
| 16.2 / 0 / none | 26 % | 17 % |
| 16.2 / 0 / 1:40 | 31 % | 28 % |
| 16.2 / 0.6 / 1:40 | 24 % | 13 % |
| 16.2 / 1.5 (shed useful) / 1:40 | 10 % | 2 % |
| 15.0 / 1.5 / none | 0 % | 0 % |

The standard error is about ±3 points per row. Read: the stall trim removes some false
sheds, mainly when stalls are present, and never stops a useful shed. Fps in
the 10–20 s half is unchanged or slightly better in every row. **It does not
explain the device's 6/8.** In this model the larger driver is verify noise.
An EMA over a 16.7/33.3 mixture has about 1.5 ms of noise against a 0.5 ms
`VERIFY_MARGIN`, and a failed tier rung walks on to the next rung against the
same baseline, so one of four rungs often "verifies" by chance. Even with
useless sheds, 20–30 % of arms end at tier ≥ 3. A noise-scaled margin
(`k·σ`, k = 1–3) was replayed and dropped: a stricter margin refuses the early
rungs and the walk accepts a deeper one (useful-shed trips 14 % → 43–53 %).

**What the device data says:** ledger rows 18–20 show the iPhone 14 at 48–56 fps,
p95 23–27 ms, which puts the EMA within about 1 ms of `degradeAt` in every arm. Tier-4
arms ran faster (54–56 fps) than tier-0 arms (48–51), so on this unit the
sheds were not all false. The issue stays open (Refs, not Closes). The device run
that would settle it records `__apex.perf().frameTimes` per arm, to see whether
visor-on arms carry the 50+ ms stalls this trims or only a higher miss share.

## 3. Row 5: thermal drift stays opt-in

The thermal-drift false-positive replay (`scratch/w40/drift.mjs`, not
committed) feeds `ThermalDrift.drift()` 10-minute sessions with no heat at all:
lap-periodic load plus jitter, quantised. 200 seeds each:

| cool session (no heating) | fired |
|---|---|
| light: 13 ms, +2 ms for 30 % of the lap | 0 % |
| near the budget: 14.5 ms, +2 ms for 30 % | **51 %** (first at ~296 s) |
| near the budget, a 12 s heavy sector (+4 ms) per 85 s lap | **100 %** (~177 s) |
| light, one 60 s rain / safety-car load event (+4 ms) at 5 min | **100 %** (~310 s) |
| Low Power Mode, 33.3 flat | 0 % |
| heating, +0.4–0.6 ms per minute (true positive) | 100 % (280–380 s) |

The window statistic is the p50 of vsync-quantised intervals, and that is
bimodal: it reads 16.7 until more than half a 10 s window misses, then 33.3.
One such window lifts the drift EMA by 0.15 × 16.6 ≈ 2.5 ms, which clears both
`OVER` (12 % = 2.0 ms) and `MIN_OVER_MS`. Any 10 s of heavy load (a slow
sector, rain arriving, a safety-car bunch) is read as heat. The response,
`RenderRate.setMode("45")`, never releases for the rest of the session. So
default-on would cap many cool phones near the budget at 45 fps for the rest of
the race, and the misses that trip it are the governor's to handle already.
**Not proposed.** Making it default-able first needs a non-bimodal window
statistic (for example the window mean, or the share of frames over budget) plus
a release path. Then re-run this replay, and do a device soak (#1633).

## Device A/B (A·D1, only with Bryce's "Go")

Before vs after on the iPhone 14 unit pool, WebGL2 and WebGPU, Bahrain night,
`--scenario visor` as in ledger row 20, plus a governor 60 s arm. The PR body
lists the exact URL params.
