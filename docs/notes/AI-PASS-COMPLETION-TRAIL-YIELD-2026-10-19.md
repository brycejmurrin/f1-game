# AI pass completion — push, then yield (#2356)

Worker session 2026-10-19 (A·W6·L21) on tip `dc3222f0`. Continues
`AI-PASS-COMPLETION-2026-10-19.md` and `AI-PASS-COMPLETE-LONGEST-EPISODE-2026-10-16.md`.

## Why the longest episodes never closed (probe)

The probe stepped the VM and printed every faster-behind-slower pair older than
40 s (`scratch/`, not committed; fields gap, dx, speeds, vmax, queueT, passOf,
wake, tow, ERS). Monza seed 1 showed three blockers:

1. **The gap.** The pairs sat 30–45 m back at ~0.9 s. That is outside the 34 m
   traffic scan, the tow and the 16 m latch, so `queueT` stayed 0 and no queue
   knob reached them.
2. **Pace phase and ERS.** `pacePhase` swings vmax ±0.5–1.6 % over 24–60 s,
   more than a 0.3–0.9 % edge. "Catching" ERS needs a tow car inside 28 m, so
   a car 37 m back banked while the leader deployed "rich". Live speeds were
   equal (RUS<GAS 49.1 vs 49.6 m/s).
3. **The half pull.** `otPull` at 20–30 m left the follower at |dx| 1.8 m,
   inside the 2.2 m blocker box, so it stayed queue-capped in the wake.

Even after pushing, the follower loses 15–20 m on most corner exits: it is in
dirty air and off-line in the pass lane. A +0.3–0.9 % car cannot finish a pass
on its own within a minute, so a bound needs the car ahead to cooperate.

## Change

`AiDrive.trailStep` (called beside `pacePhase`) times how long a car has held
within 1.2 s of the SAME scripted-slower car directly ahead in rank.
Conditions: permanent circuit, green race, never a human ahead, pace edge
> 0.25 %.

- **Push** (from 6 s, full at 20 s): +2 % vmax, ERS counts as catching, and
  `otPull` reaches the whole window and pulls a full lane (`trailN`).
- **Yield** (`trailYieldStep`, from 8 s): the car ahead runs `letPass`. Its
  lift deepens from the blue-flag ease to 10 % vmax over 6 s, and its corner
  authority to 3.5 %. It steps AWAY from the attacker's side; the freer side
  was often the attacker's own and put it in the run-off (silverstone BEA<PER).

Streets, Monaco, the player and cars behind a human are unchanged. There is no
`simRnd()` draw and no curvature read.

## Iterations (monza seeds 1–2, longest s)

| variant | seed 1 | seed 2 |
|---|---|---|
| base | 109 | 172 |
| push only | 141 | 114 |
| + full pull, otWant margin | 142 | 112 |
| + ERS catching | 184 | 193 |
| + yield at 30 s (blue-flag ease) | 125 | 102 |
| + 6 % lift | 76 | 79 |
| yield at 20 s | 71 | 68 |
| + 10 % lift | 54 | 65 |
| yield at 14 s (4 seeds max 68) | 65 | 68 |
| yield at 8 s (4 seeds max 62) | 40 | 45 |
| + corner ease, yielder steps away | 64 (15-seed max) | 61 |

## 15 seeds × 8 laps (`ai-race.mjs tactics --laps 8`, seeds 1–15)

| | Monza longest max / median | Monza AI-AI contact mean | Silverstone max / median | Silverstone contact mean |
|---|---|---|---|---|
| base `dc3222f0` | 252 / 139 s | 27.3 | 239 / 119 s | 42.5 |
| `ed4bb0c3` (push + yield) | 64 / 46 s (4 seeds > 60) | 27.4 | 90 / 61 s (8 seeds > 60) | 39.4 |

The done-when (≤ 60 s on every seed) is NOT met. Two later changes are on
the branch with only 4-seed evidence: the trail pull is clamped to the road,
and the yield lift goes in before `_vmaxNow`. Silverstone seeds 3/5/9 went
from 81/77/76 s to 64/98/43 s, and Monza seed 1 to 43 s. They are unverified
at 15 seeds.

## What the remaining long episodes are (episode summaries)

- **Chains.** In a chain A>B>C with C quickest, B lifts for C and so cannot
  pass A (BEA<STR, 84–98 s). A rule "a pushing car does not yield" made it
  worse (silverstone seed 15: 91/85/84 s; reverted). Chains need a
  front-first resolution that does not stall the back.
- **Lap-1 trains.** SAI<COL starts at t = 3 s, with the yield on 90 % of the
  time and still 64 s: the yielder is boxed in a train and has nowhere to lift
  into.
- A synthetic duel VM test (two cars alone, 0.6 % edge, 30 m) did not pass
  within 60 s even with the yield firing. Debug it before relying on it as the
  biting test.
