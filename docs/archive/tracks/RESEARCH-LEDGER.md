# Track research & scenery-density campaign — ledger

Goal: research every one of the 40 circuits against real-world reference
(TinyFish web search + targeted page fetches), fold the findings into that
circuit's brief, then **dress the circuit** so it reads as the real place.

This file is the resumable state. A track is DONE only when all four of its
columns are ticked and the commit landed. A track with no row below has not
been started; a partially-ticked row means the session was interrupted mid-track
and that track should be redone from its first unticked column.

## The step this campaign skipped, and what it cost

**Run `node tools/pick-tests.mjs --staged` before committing.** CLAUDE.md says
so; three batches went in without it, and CI then failed on two ratcheted
suites that `verify-track` cannot see:

- `tests/unit/coplanar-faces.test.mjs` — monza 22 (cap 8), montreal 8 (7),
  suzuka 4 (3), zandvoort 4 (3)
- `tests/unit/prop-clipping.test.mjs` — silverstone 21 severe (cap 19)

`verify-track` printed `OK` for every one of them. It proves a circuit *builds*;
it says nothing about whether the geometry fights itself. The audits behind
those suites — `tools/coplanar-audit.cjs <id>` and `tools/clip-audit.cjs <id>`
— run in ~1–3 min per circuit and are the actual gate for scenery work.

### The failure modes, all of which recurred

1. **Arc compression on the inside of a bend.** A fixed-length prop stepped
   along an arc at nominal centreline spacing OVERLAPS its neighbour wherever
   the anchors compress — and two overlapping same-colour boxes put their long
   side faces on one plane, facing the same way. That is a guaranteed z-fight.
   It hit Monza's park wall (8 → 22 spots) and Silverstone's campsite columns.
   **Fix: use the engine's `wall()`/`along()` emitters, which carry the
   along-track length in the node SCALE, or measure the real anchor step.**
2. **Props grown through existing foliage.** Silverstone's tents (prisms) vs
   the authored treeline (cones). Circuit files *cannot* reserve a footprint —
   `indexSolid` is engine-internal and not on the 110-member api. **Fix: place
   beyond the authored planting** (the campsites now sit at gap 192–208, past
   everything). Stripping near-track foliage via `dressingExclusions` would
   have been a much worse trade.
3. **Near-coplanar parallel faces inside one model.** `GAP_MAX` is **20 mm**,
   so two plates whose half-thicknesses differ by less than that fight. Bit the
   Calder's discs (15 mm apart) and its four converging legs.
4. **Shared emitters can carry their own coplanar geometry.** Adding
   `ferrisWheel()` to Zandvoort took it 3 → 4 spots and 3 → 15 pairs, and no
   gap or radius helped: the fight is *internal to the emitter*. Changing a
   shared emitter used by Suzuka, Vegas and Montreal is not a circuit-file
   change, so the wheel was dropped instead.
5. **`waterSurface()` does not tile.** Water finds its level, so every sheet
   sits at the SAME height — put ~40 of them across a lap and their faces share
   planes. Shanghai's rice paddies used one sheet per paddy and went 5 → 14
   spots; a bisect with the sheets disabled and every paddy box still in place
   read 5, which isolated it exactly. **Use one real sheet per water body and
   fill the rest with plain sunk boxes.** The boxes lose the sky mirror, which
   is a real downgrade, but 40 z-fighting sheets is not a trade worth making.

**`grep -i` under-detects: names are localised.** `grep -i biosphere` misses
`Biosphère` and `grep -i castle` misses `Burg` — both nearly cost a duplicate
build of a landmark that was already there (Montreal's dome, the Nürburg). Grep
for the LOCAL word too, and check `modelGroup` ids.

**The structural gap — now fixed.** A circuit file could not reserve ground
before building on it: `indexSolid` was engine-internal. It is now on the
scenery api (contract 107 → 108), remapped for reverse/source circuits like
`recordBarrier`, whose signature it shares. Safe to expose because the foliage
pass is **already deferred until after `def.scenery()`** — the engine does that
so the tree guard sees every barrier a circuit registers — so anything reserved
is in the index before a single tree is placed.

**Mugello's casali are back because of it**, at their original gap 98–116, with
`clip 17 = cap 17` and `coplanar 0 = cap 0`. The vertex count actually *fell*:
the scatter routes around the reserved yards.

**What it does not fix, measured.** It steers what is placed *afterwards*.
It does **not** remove planting the circuit's own `scenery()` already did
earlier in the same callback. Silverstone's campsites stay at gap 192–208:
tried at 134–152 *with* the reservation, they went clip 19 → 21 severe and
coplanar to 14, because the trees they hit are this circuit's own
`hedge()`/`forestEdge()` runs, made before the campsite code. **Against
authored planting, distance is still the fix.**

**Bisect rather than reason.** Every one of these was found by disabling one
emitter and re-measuring, and in four cases (Zandvoort's stage, Montreal's
Floralies, Suzuka's shrine, Shanghai's paddy boxes) the part that *looked*
guilty was innocent. A measurement costs 1–3 min; a wrong theory costs an hour.
Seven consecutive theories about Montreal's Calder were all wrong.

### What got given up, honestly

- **Zandvoort's Ferris wheel** — real, documented, and removed. The Fanzone
  stage carries the festival read alone.
- **Montreal's Calder** — kept, but simplified to rounded members and a single
  disc after seven failed attempts to keep the plate-steel form clean. Calder's
  real stabile is plate steel; this is not.

**No baseline was raised.** The ratchet exists to stop exactly this drift, and
decorative scenery is not worth spending the budget it protects.

## Racing direction — the audit, and the one circuit that was backwards

A second campaign asked a different question: does each circuit run the way the
real one does? **39 of 40 did. Singapore did not** — Marina Bay races
anti-clockwise and the game drove it clockwise, so the whole lap played
mirrored: measured **11 right / 6 left** against a real 12 left / 7 right.

**`tests/specs/f1-track-accuracy.spec.js` could not see it, and passed.** It
compares the game against a pinned `bacinger/f1-circuits` GeoJSON and checks
`directionMatch` — but the game's path was IMPORTED from that dataset, so when
the upstream line is drawn backwards both sides are backwards together and
agree. The spec's own comment admits the premise: *"GeoJSON line order is not a
race-direction guarantee."* Real-world direction enters at exactly one place,
`RACE_DIRECTION_OVERRIDES`, which covered three circuits. It now covers four.

**How the outlier was isolated, without trusting a sign convention.** Run the
same `signedArea()` over the same frame for all eleven circuits that are
anti-clockwise in reality: ten compute anti-clockwise, `sg-2008` alone computes
clockwise. That is calibrated in-frame, so it cannot be a convention error —
and this repo has shipped a curvature sign backwards for months before, so
"calibrate, never reason about handedness" is the rule that found this.

**Two probes that did NOT work, recorded so nobody rebuilds them.** Deriving
Turn 1's hand from `track.curv` at `def.turns[0]` scored 4/9 against circuits
whose Turn 1 is not in dispute; redoing it with a heading-derived measure scored
4/10. Both polarities were ~coin-flip, so both were discarded rather than
picking the one that flattered the conclusion. The likely cause is that
`def.turns[0]` is not Turn 1 after `startFrac` rotation — Montreal and COTA both
read ≈0.01, i.e. straight road. **Whole-lap integrals (shoelace winding, net
heading change) are reliable here; per-corner probes are not.**

**Suzuka is a figure-of-eight and has no single direction.** Wikipedia's list is
the only compound entry in 77 circuits: *"Part clockwise and part anti-clockwise
(figure of eight)."* The geometry proves it — every other circuit measures
netLaps ±1.00, **Suzuka measures −0.00**, because the two lobes cancel, and its
signed area is 0.060 of its bounding box, 2.6× smaller than the next lowest. Any
automated CW/CCW audit is asking Suzuka a question it cannot answer, which is
what the `was auto-audit reverse:true` comment in its def is a scar from. It is
right-dominant (measured 9R/7L, real 10R/8L) and already correct. **Do not
"fix" it.**

**Sources: do not trust one dataset, or even one tier.** A re-verification pass
deliberately avoiding Wikipedia's list found `lapmeta` has Miami clockwise
(wrong) and `worldsbk.com` — an official series site — has Portimão
anti-clockwise (wrong). All three of Miami, Portimão and Mugello are correct in
this repo. Prefer the circuit operator: Monza's own site states *"Direction of
travel: clockwise"*, the Hungaroring's track-use terms state *"Traffic on the
Track is one-way, moving clockwise."*

**Kyalami's direction is era-dependent and the repo is right.** The operator
records the 1961–87 circuit as clockwise and says the track was *"flipped"* in
1989 to anti-clockwise. The game models the classic layout, and `reverse: true`
plus the `za-1961` override give it clockwise. A naive pass that reads only the
current circuit would break this.

### What reversing a circuit actually costs

Flipping `reverse` is never a one-line change, because RACING-space coordinates
are tied to the direction of travel:

- **`startFrac` does NOT move.** `toSourceFrac` maps racing 0 to source `phi`
  under both branches, so the start line stays put. Verified, not assumed.
- **`CircuitMarkings` must be mirrored by hand** (`f → 1-f`, re-sorted). The
  header says sectors/turns are authored in racing space and never fmap'd, so
  all 19 Singapore apexes would otherwise sit on the wrong corners.
- **Racing-space scenery must be mirrored**, or every landmark lands on the far
  side of the lap. `sceneryCoordinates: "racing"` cannot simply flip meaning:
  kyalami and paul_ricard author against the lap they already drive reversed,
  while singapore authored against its forward one. Hence `sceneryLapMirror`,
  which mirrors `s → -s`, `k → -k` and swaps ranges. Sides need no help —
  `transformSceneryApi` already negates `side` for reversed defs, which is
  exactly the flip a mirrored anchor needs to land back on the same kerb.

### Two bugs the Singapore fix uncovered

1. **`resolve()` silently dropped `sceneryLapMirror`.** The def is copied
   field-by-field, so a new field that isn't listed reads `undefined` at every
   consumer — and `lapMirror()`'s fallback (`false`) is a legitimate value, so
   nothing complained. The scenery placed unmirrored and Marina Bay Sands landed
   in the road, where `modelGroup` suppressed it as `"footprint rejected"`.
   There is already a comment there naming five earlier victims of this exact
   trap; this was the sixth. **Any new def field must be added to that copy.**
   The vertex delta was the only signal — 958,411 → 910,037.
2. **`waterBand`/`waterSurface` were absent from `transformSceneryApi`.** A
   latent gap for any reversed circuit using water; Singapore is the first, with
   four Marina Bay bands. Added to the range and node+side lists.

## Method (per circuit)

1. **Research** — TinyFish `search` for trackside landmarks/grandstands/setting,
   then `fetch_content` on the 1–2 best sources (Wikipedia, racingcircuits.info,
   circuit guides). Capture *named, specific* things: grandstand names, building
   names, terrain, vegetation species, signage, skyline.
2. **Brief** — fold findings into `docs/tracks/<id>.md`: expand the
   landmarks-by-lap-position table, sharpen the palette and elevation notes.
3. **Dress** — add the missing geometry to `scenery(api)` in
   `js/circuits/<id>.js` using the `docs/SCENERY-API.md` toolkit.
4. **Verify** — `node tools/verify-track.cjs <id>` must print `OK`, then commit.

Cache-bust (`?v=N` + `version.json`) is bumped ONCE at the end of a batch, not
per track — it is the last edit before a commit that ships JS.

## Where this stands

- **Fully done** (researched → brief → dressed → `verify-track` OK → committed),
  **24 circuits — all of the season rounds**: bahrain, monaco, silverstone,
  spa, monza, suzuka, singapore, cota, interlagos, vegas, madrid, zandvoort,
  jeddah, albert_park, shanghai, miami, imola, montreal, redbull, hungaroring,
  baku, mexico, qatar, abudhabi.
- **All 40 circuits are now through the loop.**

**The classics were already dressed.** Of the 16, only **Mugello** (vine quilt)
and **Portimão** (montado — cork oak and olive) needed geometry; the other 14
were verified complete against research and their briefs record what was
checked. That is the honest headline of this campaign: the repo was already
close, and most of the value was in the *second look* — finding the specific
thing a place has that the circuit didn't — plus fixing the six geometry
regressions the additions introduced.

Where a circuit needed nothing, its brief says so and says why, so a later pass
does not redo the research or add something plausible-but-wrong.

**A pattern worth carrying forward.** In the second batch of nine, *most* banked
findings turned out to be **already implemented** — Zandvoort had all four,
COTA had both landmarks, Jeddah's 312 m fountain and Albert Park's golf course
and CBD skyline were all there. The value came from the second look: audit
first, and when the obvious landmark is already built, ask what the *place*
has that the circuit doesn't (Al-Balad's roshan, Imola's vine rows, Interlagos'
unpainted blockwork, the Floralies parterres). Grep before you build — and note
that `grep -i biosphere` misses `Biosphère`, which nearly cost a duplicate.

**"Nothing added" is a legitimate outcome, and it is most of batch three.** Of
the nine season rounds in that batch, **seven were already complete** against
their researched landmark lists — Madrid (IFEMA, La Monumental, both tunnels,
Barajas tower + airliner), Miami, Red Bull, Baku, Mexico, Qatar, Abu Dhabi.
Only Shanghai and Hungaroring needed geometry. Each verified circuit's brief
records what was checked, so a later pass does not redo the research.

**Two deliberate decisions that a naive research pass would undo.** Both are
now recorded in their briefs:
- **Qatar: do not add a mosque.** The hospitality villas explicitly *replaced*
  an earlier "mosque / marquees / Aspire" group recorded in the code as
  **fantasy landmarks**. "Qatar → mosque, minaret" is exactly the instinct that
  put them there the first time.
- **Suzuka: do not add coaster loops.** Removed on purpose so they stop
  competing with the Ferris rim on the main-straight skyline.
- Related trap: **Mexico → cactus is wrong.** The Autódromo is in an urban park
  at 2,240 m, not desert.

Guards last run green at build 1075: `test:tiny` 71/71, `test:tooling-fast`
350/350.

## Status

| # | Circuit | Researched | Brief | Dressed | Verified |
|---|---------|-----------|-------|---------|----------|
| 1 | bahrain | ✓ | ✓ | ✓ | ✓ |
| 2 | monaco | ✓ | ✓ | ✓ | ✓ |
| 3 | silverstone | ✓ | ✓ | ✓ | ✓ |
| 4 | spa | ✓ | ✓ | ✓ | ✓ |
| 5 | monza | ✓ | ✓ | ✓ | ✓ |
| 6 | suzuka | ✓ | ✓ | ✓ | ✓ |
| 7 | singapore | ✓ | ✓ | ✓ | ✓ |
| 8 | cota | ✓ | ✓ | ✓ | ✓ |
| 9 | interlagos | ✓ | ✓ | ✓ | ✓ |
| 10 | vegas | ✓ | ✓ | ✓ | ✓ |
| 11 | madrid | ✓ | ✓ | ✓ | ✓ |
| 12 | zandvoort | ✓ | ✓ | ✓ | ✓ |
| 13 | jeddah | ✓ | ✓ | ✓ | ✓ |
| 14 | albert_park | ✓ | ✓ | ✓ | ✓ |
| 15 | shanghai | ✓ | ✓ | ✓ | ✓ |
| 16 | miami | ✓ | ✓ | ✓ | ✓ |
| 17 | imola | ✓ | ✓ | ✓ | ✓ |
| 18 | montreal | ✓ | ✓ | ✓ | ✓ |
| 19 | redbull | ✓ | ✓ | ✓ | ✓ |
| 20 | hungaroring | ✓ | ✓ | ✓ | ✓ |
| 21 | baku | ✓ | ✓ | ✓ | ✓ |
| 22 | mexico | ✓ | ✓ | ✓ | ✓ |
| 23 | qatar | ✓ | ✓ | ✓ | ✓ |
| 24 | abudhabi | ✓ | ✓ | ✓ | ✓ |
| 25 | hockenheim | ✓ | ✓ | ✓ | ✓ |
| 26 | nurburgring | ✓ | ✓ | ✓ | ✓ |
| 27 | catalunya | ✓ | ✓ | ✓ | ✓ |
| 28 | sepang | ✓ | ✓ | ✓ | ✓ |
| 29 | istanbul | ✓ | ✓ | ✓ | ✓ |
| 30 | paul_ricard | ✓ | ✓ | ✓ | ✓ |
| 31 | portimao | ✓ | ✓ | ✓ | ✓ |
| 32 | sochi | ✓ | ✓ | ✓ | ✓ |
| 33 | mugello | ✓ | ✓ | ✓ | ✓ |
| 34 | magny_cours | ✓ | ✓ | ✓ | ✓ |
| 35 | estoril | ✓ | ✓ | ✓ | ✓ |
| 36 | kyalami | ✓ | ✓ | ✓ | ✓ |
| 37 | watkins_glen | ✓ | ✓ | ✓ | ✓ |
| 38 | indianapolis | ✓ | ✓ | ✓ | ✓ |
| 39 | buenos_aires | ✓ | ✓ | ✓ | ✓ |
| 40 | jacarepagua | ✓ | ✓ | ✓ | ✓ |
