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
| + corner ease, side away (shipped) | see the PR body's 15-seed table | |

The full 15 × 8 before/after table, with AI-AI contact, is in the PR body.
