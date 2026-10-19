# AI pass completion — attack-zone pull (#2356)

Hunter session 2026-10-19 on tip `a51c6cc84`. Continues
`docs/notes/AI-PASS-COMPLETE-LONGEST-EPISODE-2026-10-16.md`.

## Tip baseline (before)

`node tools/check/ai-race.mjs tactics --track <id> --laps 8 --runs 3 --json`

| track | seed | longest | AI-AI contact |
|---|---|---|---|
| monza | 1 | HAM&lt;HAD 231 s +0.41 % | 30 |
| monza | 2 | VER&lt;ALO 147 s +0.78 % | 16 |
| monza | 3 | ANT&lt;HUL 118 s +1.13 % | 16 |
| silverstone | 1 | VER&lt;HAD 132 s +0.31 % | 53 |
| silverstone | 2 | ALB&lt;BOT 222 s +0.44 % | 20 |
| silverstone | 3 | ANT&lt;ALB 129 s +0.82 % | 31 |

Monza max / median longest: **231 / 147 s**. Silverstone: **222 / 132 s**.
Done-when is ≤ 60 s on every seed of 15×8 on both tracks.

## Diagnosis

Longest pairs sit 15–45 m back. `otPull` returned 0 for gap ≥ 16 m; latch in
`game.js` is also 16 m (`AI_PASS_LATCH_M`, forbidden this PR). `queueT` only
builds inside `max(16, follow+6)` m, so hunger/concede stay inert.

## Change (ai-drive only)

Aside-first attack-zone pull for a soft pace edge (≥ ~0.3 %, `PULL_EDGE`):

- `otWant` trailPull: soft edge + clear side + gap ∈ (0, 34) m
- `otPull` reach extends to 34 m when soft (streets stay 14 m; equal pace 16 m)
- `attackOK` edgeDrive so matched live speeds still clear the utility gate
- `passReach` aside-first: gap ≤ 34 m needs ≥ 80 m to turn-in

`passHunger` / `towGain` / `otFireRate` / `coverConcede` / streets unchanged.

### Negative results this session (reverted)

| variant | monza max/med | silver max/med | note |
|---|---|---|---|
| soft tow (+0.28×softN) | 224 / 121 | 131 / 131 | monza seed-2 worse |
| soft coverConcede | 329 / 166 | 224 / 139 | monza seed-3 329 s |
| trailPull only gap∈(16,34) | 342 / 181 | 147 / 116 | monza much worse |
| softLean fade at gap&gt;16 | 229 / 123 | 213 / 135 | erased the monza win |

## After (landed shape = after1/after4)

| track | seed | longest | AI-AI contact |
|---|---|---|---|
| monza | 1 | RUS&lt;GAS 99 s +0.88 % | 19 |
| monza | 2 | OCO&lt;PER 91 s +0.34 % | 29 |
| monza | 3 | VER&lt;GAS 164 s +0.55 % | 25 |
| silverstone | 1 | LEC&lt;HAD 97 s +0.53 % | 73 |
| silverstone | 2 | ALB&lt;BOT 222 s +0.44 % | 20 |
| silverstone | 3 | ANT&lt;ALB 129 s +0.82 % | 31 |

Monza max / median: **164 / 99 s** (−67 / −48 vs tip). Silverstone max / median:
**222 / 129 s** (flat / −3). Contact avg monza 24.3 vs tip 20.7; silver 41.3 vs
34.7 (seed 1 spike).

## Gap to done-when

≤ 60 s on every seed of 15×8 on both tracks is still far off. The latch window
lives in `js/game.js` (`AI_PASS_LATCH_M = 16`); without widening it, ai-drive
can only start the aside move — not finish the pass from 20–45 m. Further work
needs that wiring or a different close model.

## CI follow-up (2026-10-19)

Full-tier `quali-pace-parity-vm` monza failed: fixed 34 m reach at PACE 0.44 made
driven laps too fast vs the model (−3.3 % off PACE-1 ratio). `pullReachM(vTop)`
now scales reach with OVERALL SPEED (floor 16 m, cap 34 m); trailPull requires
`reach > 16.5`. Monaco unchanged.
