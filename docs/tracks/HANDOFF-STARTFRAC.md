# Handoff — fix `startFrac` on all 40 circuits

You are picking up work on **Apex 26**, an unofficial WebGL2 F1 fan game at
`brycejmurrin/f1-game`. Read `CLAUDE.md` first — it is the engineering
reference and its rules are binding (no ES modules, `?v=N` cache bumps,
`tools/manifest.cjs` load order, ratcheted geometry baselines).

Work on branch `claude/tinyfish-mcp-track-research-o1w4lk`. The deploy branch is
`claude/f1-game-project-26h3ng` — **do not push there without the geometry
sweeps green**, and expect races: several agents push to it and each push
cancels the previous CI run.

---

## The task

**22 of 40 circuits place their start/finish line inside a corner.** A start
line is always on a straight, so those are provably wrong. `startFrac` is the
def field that positions the line.

This one field drives three separate symptoms:

1. **Turn numbering rotates.** Trackside corner boards are numbered by array
   index (`signBoard(c.k, outside, 3.5, "corner", idx + 1)` in `js/track/tracks.js`),
   and Turn 1 means "first curated apex after the line". Move the line, every
   number shifts.
2. **albert_park and silverstone sort their final turn BEFORE T1**, so the last
   board is passed first.
3. **Aero-zone boundaries cannot be authored by turn number** — see "what
   already failed" below.

### Why the current values are untrustworthy

20 circuits carry a GPS-derived value with its own confidence in the comment,
and the confidences are poor: shanghai **0.117**, hungaroring 0.185,
albert_park 0.201, bahrain 0.208, mexico 0.212, qatar 0.212. Only jeddah
(0.696), montreal (0.661) and singapore (0.566) are moderate. The other 18 are
hand-set round numbers (`0.0`, `0.03`, `0.96`) — placeholders. No tool in the
repo reproduces the derivation; whatever produced it is gone.

---

## The method (established, not speculative)

`startFrac` is an **index fraction**, not an arc-length fraction. `resolve()` in
`js/track/tracks.js` uses `offset = round(wrap01(startFrac) * n)` as a node
index. And `CircuitPaths[id].pts.length === geojson.coordinates.length - 1`
(the closing duplicate vertex is dropped), so **indices map 1:1 between the
pinned GeoJSON and the game path**. Verified on monza, silverstone, singapore,
monaco, suzuka.

So:

1. Take the real start-line lat/lon (table below).
2. Find the nearest vertex on that circuit's feature in
   `tests/data/f1-circuit-reference.geojson` (real lon/lat, already in-repo).
3. `startFrac = vertexIndex / pts.length`.

Granularity is ~46 m at Monza's 125 points — ample to place a line between the
last corner and Turn 1.

### Verification that can actually fail

Do **not** verify by re-deriving. Two independent checks:

- **Line must be on a straight.** Sample `|curvature|` over the 120 m centred on
  racing s=0. `> 0.004` mean means the line is in a corner — still wrong.
  A working probe is described under "scripts" below.
- **First apex must match the real Turn 1's known hand.** Marina Bay T1 is a
  sharp LEFT, Silverstone's Abbey a RIGHT, **Montreal's T1 is a LEFT despite the
  circuit being clockwise** (deliberate trap — keep it in the set).

---

## The data — start/finish coordinates

Cross-checked across OpenStreetMap `raceway=start/finish` nodes and the Podium
timing database, then reverse-looked-up against pit lanes and grandstands.

| circuit | lat | lon | conf |
|---|---|---|---|
| monza | 45.61896 | 9.28117 | high |
| cota | 30.13189 | -97.63983 | high |
| spa | 50.44406 | 5.96516 | high |
| zandvoort | 52.38899 | 4.54088 | high |
| imola | 44.34400 | 11.71669 | high |
| silverstone | 52.06826 | -1.02349 | high |
| monaco | 43.73503 | 7.42127 | high |
| baku | 40.37259 | 49.85291 | high |
| singapore | 1.29169 | 103.86421 | high |
| vegas | 36.10866 | -115.16256 | high |
| redbull | 47.22030 | 14.76673 | high |
| albert_park | -37.85006 | 144.96898 | high |
| miami | 25.95909 | -80.23738 | med-high |
| catalunya | 41.57004 | 2.26123 | med-high |
| suzuka | 34.84480 | 136.53885 | medium |
| montreal | 45.50010 | -73.52272 | medium |
| mexico | 19.40617 | -99.09380 | medium |
| interlagos | -23.70369 | -46.69995 | medium |
| abudhabi | 24.46994 | 54.60522 | medium |
| qatar | 25.48904 | 51.44970 | med-low |
| hungaroring | 47.57904 | 19.24813 | **low-med — sources disagree by 250 m** |
| shanghai | 31.33800 | 121.22413 | **low-med — sources disagree by 175 m** |
| bahrain | — | — | **NOT LOCATED** |
| jeddah | — | — | **NOT FOUND** |

**Do not guess bahrain or jeddah.** Leave their current values and say so.
Bahrain is bounded: OSM pit lane way 187123422 runs 26.02985,50.51052 →
26.03420,50.51071; main grandstand way 187123419 centres 26.03207,50.51014; the
line is between them at lon ≈ 50.5103. That is a bound, not a coordinate.

**Five circuits have separate start and finish lines. Snap to the FINISH
(timing) line — the values above already are:**
silverstone (start 52.06934,-1.02215, 170 m away), redbull (47.22001,14.76520,
130 m), vegas (36.10928,-115.16188, 85 m), zandvoort (52.38945,4.54118, 60 m),
imola (44.34441,11.71402, 215 m).

**Traps:** `tobi/track-atlas` is wrong at several circuits — 1.36 km off at COTA
(lands on Turn 10), 630 m at Monaco (off-circuit), 700 m at Bahrain. Do not use
it unchecked. Spa OSM node 1404684961 tagged `raceway=start-finish` is the
**karting** circuit, 1.3 km from the F1 pit straight — ignore it.

---

## What already failed — do not retry these

- **Authoring aero zones as (fromTurn, toTurn) pairs.** 35 of 68 resolved spans
  came out short or curved (catalunya T3→T4 as 26 m, abudhabi T5→T6 as 45 m),
  because `def.turns` numbers corners as "the N strongest curvature peaks in lap
  order", which is not FIA turn numbering. **This becomes viable only after
  startFrac is fixed** — that is the main prize here.
- **Deriving Turn 1's hand from `track.curv` at `def.turns[0]`.** Scored 4/9
  and 4/10 against known corners, both polarities ≈ coin-flip. `def.turns[0]`
  is not Turn 1 after `startFrac` rotation. Whole-lap integrals (shoelace
  winding, net heading change) are reliable; per-corner probes are not.
- **Snapping scattered turn tables to the nearest curvature peak.** Moved
  apexes onto weak bends; floats went 40 → 36, i.e. nothing. Regenerating from
  the N strongest peaks with N = the real turn count worked (40 → 1).

---

## Hard-won traps in this codebase

- **`resolve()` copies the def FIELD BY FIELD.** A new def field that is not
  added there reads `undefined` at every consumer, silently, because the
  fallbacks are all legitimate values. There is a comment naming five prior
  victims; I was the sixth. If you add a def field, add it to `resolve()`.
- **`addBox` is centre-anchored; `addCyl`/`addCone`/`addFrustum`/`addPrism` are
  BASE-anchored** (`js/track/geom.js:196`). Mixing them up puts a prop half its
  own height in the air, and it can hide for months if other scenery happens to
  sit underneath — that is exactly what Singapore's supertrees did.
- **Raw basis vectors are not remapped.** `transformSceneryApi` remaps
  `anchor()`, node indices, fractions, ranges and `side` — but `a.r`/`a.u`/`a.t`
  and raw `px/py/pz` reads are NOT. On a reversed lap `a.r` is negated, so a
  hand-rolled `vadd(a.c, a.r, off)` spreads the wrong way. Fold lateral offsets
  into the anchor's own `dist`.
- **`modelGroup` fails closed silently.** `verify-track` still prints OK. Read
  `track.modelDiagnostics` — `suppressed`/`invalid`/`unsafe` with `required:true`
  is a hard failure. A vertex-count delta is often the only signal.
- **Ratcheted baselines** (`tools/{clip,coplanar,float}-baseline.json`) fail in
  BOTH directions — a cap above the measured count is as much a failure as one
  below. Lower them when geometry improves. Do not raise one to make a test
  pass without proof the geometry did not get worse.
- **Curvature sign: `+k = LEFT`** per CLAUDE.md, but it has shipped backwards
  before. Calibrate any handedness measurement against circuits whose answer is
  not in dispute; never reason it out from axis handedness.
- **`grep`/`pgrep` self-matching.** A watcher whose command line contains its own
  pattern matches itself. I hit this three times. Key watchers on output-file
  contents, not process names.
- **Never `| tail` a live background run** — tail buffers to EOF and the log
  looks empty.
- **Do not chain a test and a push.** A failing guard reached the remote that way.

---

## Useful commands

```sh
node tools/verify-track.cjs <id>          # ~5 s build check, ALSO read diagnostics
node tools/verify-track.cjs --all         # all 40
node tools/float-audit.cjs <id> --json    # floating scenery, with coordinates
npm run test:sweeps                       # the 12-test geometry ratchet (~6 min)
npm run test:tooling-fast                 # 362 structural guards (~1 min)
node tools/pick-tests.mjs --staged        # which groups this change needs
```

`buildContext(rootOverride)` from `tools/verify-track.cjs` builds any checkout in
one process — use it with `git worktree` to compare before/after without
stashing the working tree (a stash that gets backgrounded can strand it).

Scripts worth rebuilding (they lived in a scratch dir and are gone): a start-line
validity probe (mean `|curvature|` over ±60 m of racing s=0, flag `> 0.004`), and
an all-40 per-circuit vertex+diagnostics dump for before/after diffing.

---

## State when this was written

Branch `claude/tinyfish-mcp-track-research-o1w4lk`, cache **1113**.
Landed and verified: Singapore now races anti-clockwise (it was mirrored);
turn tables on all 40 circuits with apexes-on-straight-road down 40 → 1; real
aero-zone COUNTS (baku 8→2, qatar 4→1, imola 7→1, monaco 0 — correct, 2026
switches active aero off there entirely); barGrid −15% prop build; supertrees
grounded (floats 37 → 18).

Aero **boundaries** are still "the N longest straights" — that is what fixing
`startFrac` unblocks.
