# Adding Mosport as circuit 52 — research and plan

**Status:** plan. Nothing implemented. Written 2026-09-14, after the eleven-circuit
OSM round landed (`docs/notes/TRACK-ROSTER-RESEARCH-2026-09-14.md`).

## 1. Why this circuit, and why it is different from the last eleven

The eleven circuits added this session came out of a sweep of every World
Championship venue OSM could give us a lap for. That sweep also measured what was
left (research note §6), and the answer was blunt: of the ten remaining venues
with any usable data, **nine are modern rebuilds of a circuit Formula One no
longer would recognise**, and Mosport is the tenth.

| venue | GPs | stitched | vs target | the layout F1 raced? |
|---|---|---|---|---|
| **Mosport** | 8 | 3.948 km | −0.24% | **yes** |
| Le Mans Bugatti | 1 | 4.168 km | −0.40% | no — F1 ran 4.430 km in 1967 |
| Jarama | 9 | 3.910 km | +1.56% | no — F1 ran 3.312 km |
| Charade | 4 | 3.943 km | −0.79% | no — F1 ran the 8.055 km road course |
| Aintree | 5 | 2.453 km | +0.11% | no — that is the club circuit, not the 4.828 km perimeter |
| Sebring | 1 | 5.872 km | −2.45% | no — F1 ran 8.356 km in 1959 |

Wikipedia's Canadian Tire Motorsport Park article states it plainly: *"Unlike many
historic motorsport venues, Mosport's track layout has remained mostly unchanged
from its original form."* The infobox calls the configuration **"Clockwise Grand
Prix Circuit (1961–present)"**. That is the single fact this plan rests on. It is
why Mosport does not need the layout caveat that `brands_hatch` (3.908 km modern
vs 4.207 km F1) and `zolder` (4.010 km modern vs 4.262 km F1) both carry in
`tools/track/osm-circuits.json`.

**Mosport is the last venue left that is both importable and genuinely the circuit
Formula One raced.** After it, the remaining gap is street circuits (Adelaide,
Long Beach, Detroit, Dallas, Las Vegas '81) and road courses that no longer exist
(Zeltweg airfield, East London, the old Charade), none of which the stitcher can
reach — they need a centreline digitised from historical maps.

## 2. Research — what the circuit is

**Canadian Tire Motorsport Park**, Clarington (Bowmanville), Ontario, ~75 km east
of Toronto. Opened June 1961; architect Alan Bunting. "Mosport" is a contraction
of **Mo**tor **Sport**. Renamed Canadian Tire Motorsport Park in 2012; still
universally called Mosport.

- **Length 3.957 km (2.459 mi), 10 turns, clockwise.** FIA Grade 2.
- Repaved in 2001 to FIA specification and widened to 13 m. The operator records
  that *"drivers were consulted to ensure the character of the 'old' track was
  kept"* — a resurface, not a redesign.
- **Eight World Championship Canadian Grands Prix**: 1967, 1969, 1971, 1972,
  1973, 1974, 1976, 1977. (1968 and 1970 went to Mont-Tremblant, which the game
  now ships; 1978 onward went to Montréal, which it also ships — so adding
  Mosport completes the Canadian GP's whole venue history.)
- Winners: Brabham 1967, Ickx 1969, Stewart 1971 and 1972, Revson 1973,
  Fittipaldi 1974, Hunt 1976, Scheckter 1977.
- F1 left after 1977 on safety grounds: the circuit is fast, narrow by modern
  standards, and has almost no run-off. Manfred Winkelhock was killed there in a
  1985 sports car race; Jeff Green died at turn 8 in 2018.

### Named features, for the §4 landmark table

- **Turn One** — a long, fast, downhill right off the pit straight.
- **Clayton Corner** (turn 2).
- **Quebec Corner** (turn 3/4 complex).
- **Moss Corner** (turns 5a/5b) — a double-apex left, named for Stirling Moss,
  who suggested splitting the original single hairpin.
- **Mario Andretti Straightaway** — the back straight out of Moss, the fastest
  part of the lap.
- **The Esses** — the downhill flick after turn 8.
- **Whites Corner** (turn 10) — the last corner, with a spectator tunnel under it.
- The **Event Centre** building, and heavy mature Ontario mixed woodland on
  every outside edge. The site sits in rolling drumlin country: the elevation
  change is real and is the circuit's signature, the same way Craner is
  Donington's.

### Corner positions and elevation — MEASURED, not guessed (2026-09-14)

OSM carries Mosport's corners as individually NAMED ways, which almost no other
circuit in this round did. Querying them and projecting each onto the stitched
ring gives the lap fractions directly, with no curvature-peak guessing:

| lap frac | elevation | feature |
|---|---|---|
| 0.000 | 336 m | start/finish, on the pit straight — **the highest point of the lap** |
| 0.185 | 308 m | **Clayton Corner** (T2) |
| 0.307 | 310 m | **Quebec Corner** (T3) |
| 0.461 | **291 m** | the low point of the lap |
| 0.491 | 299 m | **Moss Corner** (T5a/5b) |
| 0.660 | 322 m | **Mario Andretti Straight** |
| 0.873 | 335 m | **Esses** (after T8) |
| 0.937 | 334 m | **Whites Corner** (T10) |

Elevation is SRTM 30 m sampled at all 107 ring vertices from Open Topo Data, the
same source `tools/gen/bake-elevation.mjs` already uses.

**Total relief 47 m over a 3.95 km lap, and the shape is the circuit's whole
character.** The line sits at the top; the track falls continuously for the
first half to 45 m below the start line just before Moss, then climbs without
relief for the second half all the way back. That is a measured confirmation of
how the circuit is always described — "a tale of two tracks, an accelerated fast
descent for the first 2 km followed by an unceasing uphill endurance test back
to the finish line". The descent measures 1.82 km and the climb 2.13 km.

The steepest single pitch is the drop into Clayton, and the corner the drivers
talk about, which the ring samples at up to -16.7% over one 30 m step — SRTM at
30 m posts will overstate a local gradient, so take the 47 m range and the
half-lap shape as the reliable figures and treat any single step as indicative.

Two caveats worth writing down rather than discovering later:

- The **start/finish fraction is good to about ±50 m.** The nearest ring vertex
  to the Pit Lane way's centre is 146 m away, because the pit lane runs parallel
  to and offset from the track. Every other named corner lands within 18-60 m.
- The **ring's own vertex 0 is not the start line** — it sits at ring fraction
  0.664. `startFrac` has to carry that, and every fraction in the table above is
  already expressed in lap coordinates, not ring coordinates.

**A correction to the tooling docs while here:** `bake-elevation.mjs`'s header
says api.opentopodata.org "is firewalled in the Claude Code web sandbox, so this
is meant to be run on an unrestricted machine". That is no longer true — it
answers fine through the agent proxy, which is how the profile above was
measured. The note should be updated when the baker is next touched, because it
currently discourages exactly the measurement that works.

### What else is inside the bbox (and must be filtered out)

- the **Driver Development Centre** (2.9 km),
- the **kart complex** (1.5 km),
- the former **0.805 km oval**, closed 2013.

The stitcher's existing name/tag filters already drop the kart complex; the DDC
and the oval survive as separate rings, which is why the run reports **2 candidate
rings** and why `target` must be right.

## 3. The measurement

Re-run today, reproducible in one command:

```sh
node tools/track/stitch-osm-ring.mjs mosport \
  --bbox=44.0331,-78.6922,44.0691,-78.6562 --target 3957
# OK mosport  9-way cycle, 3.948 km vs researched 3.957 (-0.24%), 106 pts, 2 candidate ring(s)
```

−0.24% is the second-best delta of any circuit added this session (only
`okayama` at +0.02% is tighter) and 106 points sits mid-fleet for vertex density.
Nine ways, one clean cycle, zero dangling ends. There is no judgement call here.

## 4. Plan

### Commit 1 — the circuit

**a. Provenance row.** Add to `tools/track/osm-circuits.json` `circuits`:

```json
"mosport": {
  "name": "Mosport International Raceway",
  "location": "Bowmanville, Ontario",
  "country": "Canada",
  "bbox": [44.0331, -78.6922, 44.0691, -78.6562],
  "target": 3957,
  "gp": "Canadian GP 1967, 1969, 1971-1974, 1976-1977. The layout is UNCHANGED from the F1 era — the circuit's own infobox reads 'Clockwise Grand Prix Circuit (1961-present)'. Resurfaced and widened to 13 m in 2001 with the corner geometry deliberately preserved. Unlike brands_hatch and zolder, this trace IS the configuration Formula One raced."
}
```

Once that row exists the stitch is `node tools/track/stitch-osm-ring.mjs mosport`
with no flags, and anyone can re-derive it.

**b. The def** — `js/circuits/<id>.js` with id `mosport`, matching the eleven just added:
`classic: true`, `reverse: false`, `path` from the stitch
(`import-circuit-path.mjs` consumes the emitted Feature directly), then `turns`
= **10** in lap order, seated against the six NAMED corners in §2 rather than
taken blind from curvature, `pal` (12 keys), `elevations`,
`hwZones`, `bankZones`, `theme`, `baseHW`, `furniture.tree`, `kit.rail`,
`standSet` of 3. No `sectors` — all 27 classics skip them and consumers fall back
to thirds. Record the −0.24% delta in the header comment: that, not the shape
test, is the accuracy evidence.

Two things to get right and one trap:
- **`startFrac` is NOT 0.** The eleven circuits added this round all took
  `startFrac: 0.0000` because nothing better was known. Here it is measured: the
  stitched ring's vertex 0 sits at ring fraction 0.664, so the start line is
  0.664 round the ring, not at its head. Shipping 0 would put the grid on the
  approach to the Andretti Straight — the lowest-value place on the lap — and
  would rotate every corner fraction in §2 by two-thirds of a lap.
- **Winding.** The empirically calibrated rule from this session: a projected
  **CCW** ring is a **clockwise** real circuit. Mosport is clockwise, so expect
  CCW out of the stitcher and `reverse: false`. Verify against the named-corner
  order (Turn One → Moss → Andretti Straightaway → Esses → Whites), do not assume.
- **Elevation is the circuit, and it is now measured** — §2 has the profile.
  47 m of relief, the line at the top, a continuous fall to -45 m just before
  Moss at lap frac 0.461 and an unbroken climb back. Author `elevations` to
  that shape; do not ship a flat Mosport.
- **`turns` needs no curvature guessing.** OSM names the corners, so the §2
  table gives Clayton, Quebec, Moss, the Andretti Straight, the Esses and Whites
  at real lap fractions. Seat the remaining turns of the 10 from curvature peaks
  and check them against these six rather than the other way round.
- `baseHW` should read narrow. 13 m is the *modern* width; in the F1 era it was
  tighter, and the circuit's reputation is built on that.

**c. Raise the cap 51 → 52**, at all seven registration points now documented in
`.claude/skills/new-track/references/workflow.md` §2:

1. `tests/unit/shared-track-foundation-characterization.test.cjs` and
   `tests/unit/circuit-def-fields.test.mjs` — `Tracks.LIST.length` (`SEASON`
   stays 24);
2. `tests/specs/f1-track-accuracy.spec.js` — the `waitForFunction` count, a
   `CIRCUIT_MAP` row, **and** a matching feature in
   `tests/data/f1-circuit-reference.geojson` (the spec asserts the two are the
   same SET, so a circuit with no feature fails outright);
3. `tools/check/offline-precache-check.cjs` — the scenery-file count;
4. `tests/unit/lighting-campaign.test.mjs` — `TRACKS.length`, `rows.length`
   (52 × 20 = 1040, in two tests), the unique-key sets, `SHARDS.flat()`, and the
   `rows.slice(-6)` literal, which pins whichever circuit is LAST and breaks
   purely from appending;
5. `tools/lighting/campaign/config.mjs` — `TRACKS`, one `SHARDS` entry, three
   `CAMERA_FRACTIONS`;
6. `js/ui/flags.js` — **nothing to do.** `"Canada": "ca"` is already in `CODES`
   with a drawn recipe (Montréal and Mont-Tremblant both use it). This is the
   first circuit of the round that needs no flag work.
7. the three `tools/track/*-baseline.json` audits at **exactly** the measured
   value — a cap above the measurement fails as loudly as one below, and an
   absent id means a cap of 0, so omit the row entirely if it measures clean.

**d. Registration** — append `mosport` to `CIRCUITS` in `tools/manifest.cjs`
after the last classic, then `node tools/gen/gen-shell.mjs`. **Append, never
insert:** `apex26.track` is a positional index into `Tracks.LIST` and inserting
repoints every saved pick. `index.html`, `sw.js` and `js/roster.js` are generated
and hook-blocked — regenerate, never hand-edit.

**e. Reference feature.** Add the stitched ring to
`tests/data/f1-circuit-reference.geojson` as its own ODbL feature, exactly as the
eleven were. Be honest in the commit about what it buys: for these OSM circuits
the reference and the def come from the same extract, so the shape test checks
that the build pipeline (Catmull-Rom, `startFrac`, `reverse`) does not distort the
ring it was handed — it catches an orientation or rotation mistake, and it is not
independent accuracy evidence.

**f. Docs** — `docs/tracks/<id>.md` in the fleet's 8-section brief shape, with
a §4 landmark table of 15–17 rows keyed on lap fraction and side. §2 of this
file is the source material for it. Plus the `docs/tracks/START-LINES.md` row and
the count prose gated by `docs-integrity.test.mjs` (`README.md`, and the ungated
prose in `js/circuits/CLAUDE.md`, `docs/ARCHITECTURE.md`).

### Commit 2 — the scenery

`js/circuits/scenery/<id>.js`, written against the §4 table, same as the
eleven. The identity to build for: **closed Ontario mixed woodland on every
outside edge, a modest club-scale paddock, and terrain that actually falls.**
Nothing about Mosport is a Grand Prix facility — it should read closer to
Donington than to Fuji.

Note for whoever writes it — four emitter signatures cost every scenery agent
this round a build cycle, because a wrong shape ships `invalid` diagnostics while
`verify-track` still prints `OK`:

- `groundPatch(k, side, gap, sz, col)` — `sz` is a **3-vector** `[w, thickness, d]`;
  a scalar silently invalidates the patch.
- `motorhome(k, side, gap, w, h, d, opts)` — w/h/d are required.
- `building(k, side, gap, w, h, d, opts)` — `w` is the across-track depth, `d` the
  run along track; the wall tint goes in `opts.wall`, a bare colour array is ignored.
- `grandstandEx(s, side, gap, len, shell, crowd)` — `shell`/`crowd` are **colour
  arrays**, not indices. Pass `null`. A number here fails `validateGeometry` and
  drops the entire prop mesh.

Read the diagnostics line, not just the exit code.

### Verification

- `node tools/track/verify-track.cjs mosport` → `OK` with a non-zero prop count,
  under the 1.1 M **per-circuit** vertex cap, `invalid 0`.
- `npm run test:guards`, then `npm run test:tooling-fast`.
- `node tools/ci/test-bg.mjs tiny`, then `circuits` — one group per batch,
  `/proc/loadavg < 3` first. All source edits finished before any run starts.
- Re-measure the clip / coplanar / float baselines; they move, and the guard
  rejects a mismatch in either direction.

## 5. Risks

0. **Published lap lengths disagree, and the measurement breaks the tie.**
   racingcircuits.info gives 2.549 mi / 4.102 km where Wikipedia and the circuit
   give 2.459 mi / 3.957 km — a transposed digit in one of them. The stitch
   measures 3.948 km, which settles it at 3.957 and is why `target` is not taken
   on trust from a single page.
1. **The 2-candidate-ring ambiguity.** The DDC (2.9 km) and the old oval
   (0.805 km) are both in the bbox. The −0.24% hit is decisive against a 3.957 km
   target, but if a future OSM edit changes the tagging, a wrong `target` silently
   selects a wrong layout. The `gp` note is the defence.
2. **Elevation is guessable and shouldn't be.** A flat Mosport is a wrong
   Mosport. If the elevation research does not land, say so in the def header
   rather than shipping invented numbers.
3. **This is the end of the line for the stitcher.** After Mosport, the remaining
   venues need a different tool entirely. That is a finding, not a failure — worth
   recording in the research note so the next session does not re-run the sweep.
