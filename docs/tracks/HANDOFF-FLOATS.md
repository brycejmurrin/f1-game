# HANDOFF — fleet float-elimination campaign

Goal: **zero floating scenery on all 40 circuits.** `tools/float-baseline.json`
is the scoreboard; every entry must reach 0 and the two-sided ratchet in
`tests/unit/scenery-grounding.test.mjs` locks each step down (it fails when a
measured count moves ABOVE its cap **or** below it — lower the baseline with
every fix, same as `tools/coplanar-baseline.json`).

State when written (2026-08-13, build 1194): 39/40 circuits float, ~430
clusters. Ranking: monaco 42 (all small — the big ones are fixed), sochi 34,
interlagos 23, cota 20, indianapolis 20, singapore 19, baku 17, vegas 15,
jeddah 15, paul_ricard 14, mugello 13, madrid 12, hungaroring 11, istanbul 11,
bahrain 10, kyalami 9, then a long tail of 1–7. `catalunya`/`miami`/`imola`/
`watkins_glen` are one cluster each — good warm-ups.

## Orchestration

Run one **Sonnet subagent per circuit** (`model: "sonnet"` on the Agent tool —
the work is mechanical once attributed; save the strong model for the main
loop and for clusters a subagent bounces off). Batch 3–4 circuits at a time,
each agent in its **own worktree** (`isolation: "worktree"`; the rules are in
`docs/PARALLEL-WORK.md`). This parallelizes safely because the whole loop is
VM-only — no browser, no GPU:

- Subagents may run: `tools/float-audit.cjs`, `tools/verify-track.cjs`,
  `tools/coplanar-audit.cjs`, `node --test tests/unit/scenery-grounding.test.mjs`.
- Subagents may **NEVER** run Playwright, `test-bg.mjs`, or anything that
  launches a browser. Flat prohibition, not a load threshold (CLAUDE.md).
- Subagents do **not** bump `?v=`/`version.json` — the integrator bumps ONCE
  after merging a batch, then runs `npm run test:tooling-fast`.

The main agent merges each worktree branch sequentially, re-runs
`node tools/float-audit.cjs <ids…>` on the merged tree (fixes can interact),
then commits per batch. Push to
`claude/<your-branch>`; push to the deploy branch
(`claude/f1-game-project-26h3ng`) only when the user says so.

## The per-circuit loop (proven on Monaco, 47→42)

1. `node tools/float-audit.cjs <id> --why` — every cluster prints gap, frac,
   lat, dims, and the **emitting source line** (`js/circuits/<id>.js:NNN`).
   Trust `--why` over any inference from prop bounding boxes.
2. Read the emitter and classify the cause. The known classes, by frequency:
   - **Mixed coordinate spaces** (the Monaco disease, 5 confirmed instances):
     a block authored in OLD-RACING fracs (pre-7a17351, origin =
     `sceneryStartFrac`) but resolved as SOURCE (or double-mapped). Symptoms:
     the object sits ~0.03 laps / a wrong section away from its authored
     intent. Fixes, by call path:
     * raw `px[K(s)]` readers → `KOLD(s)` (hoisted in monaco.js:~95 with the
       legend; replicate the pattern in other circuit files that need it);
     * wrapped emitters given `KR(...)` → usually plain `K(...)` (the engine's
       shift-only wrapper ALREADY applies the old→new renumbering — KR on top
       double-converts; this was the Tabac terrace);
     * wrapped emitters given raw-intent ks → re-anchor raw with KOLD + a
       manual frame (the pool, the Rock — see monaco.js for both worked
       examples, including `groundYAt` seating and full-footprint guards).
   - **Overhanging decoration**: cornices/decks/turrets reaching past the body
     beneath them (the Palace crown). Pull offsets inside the supporting
     footprint.
   - **Fixed-height stacks over dropped terrain**: pieces at `a.c + const`
     where the anchor grounds but the terrain under an overhang falls away.
3. Re-run `float-audit <id>` — the count must DROP. If it does not, your edit
   is not the fix; revert and re-diagnose (see the Vegas warning below).
4. Lower the circuit's entry in `tools/float-baseline.json` to the measured
   count. Run `node --test tests/unit/scenery-grounding.test.mjs` (sweeps the
   whole fleet, ~70 s, catches cross-circuit fallout).
5. `node tools/verify-track.cjs <id>` and `node tools/coplanar-audit.cjs <id>`
   — geometry moves can change the coplanar count; if it drops, lower
   `tools/coplanar-baseline.json` too (two-sided, it WILL fail CI otherwise —
   this bit us: "monaco: baseline 9 but measured 8 — lower it").

## Hard-won warnings — read before editing

- **Vegas frac 0.858 (the skyline ring tower, gaps to 184 m): the obvious fix
  does not work.** Insetting the proud floor rims (`bw*1.02 → 0.98`) and
  shrinking the crown to `min(bw,bd)` changed the audit dims but removed ZERO
  flags — the floats come from the audit's support model around that anchor
  (large boxes emit corner vertices only; support search may not see a body's
  faces). Before touching vegas.js, read float-audit's support/`bigGrounded`
  logic (tools/float-audit.cjs:~300-330) and decide whether this is a tool
  false-positive class to fix IN THE TOOL. Do not re-try the rim inset blind.
- **`graph-parity` is blind to raw/overheadSpan geometry** (Monaco's graph is
  15 models). It is not a gate for these fixes; float-audit is.
- **`--why` needs the flagged-first pass**; it is a second deterministic
  build. ~2× cost, still seconds.
- **Do not "fix" a float by widening a baseline.** The baseline only ever goes
  down. If a cluster is genuinely intended (a bridge, a gantry, a cantilever),
  the audit already has allowances — read its header before concluding that.
- The authored fracs in circuit files often do NOT equal racing positions
  (monaco.js's legend documents the measured landmarks). When a fix needs a
  position, measure it (curvature peak-pick via `__apex`/`apex-eval`, or
  `TrackSpace` math) — never trust a sector comment.
- Comments lie, tests don't: several stale-baseline and label lies were found
  this way. When your measurement disagrees with a comment, believe the
  measurement and fix the comment in the same commit.

## Definition of done

`node tools/float-audit.cjs --all` prints `0/40 circuits have unsupported
floating clusters`, every `float-baseline.json` entry is 0, the fleet sweep is
green, `test:tooling-fast` is green, and the per-circuit fixes are committed
with the cause class named in each message.
