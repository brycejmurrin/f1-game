# New-track workflow and gotchas

Load from the SKILL.md index when the task needs this detail.

## Contents
- Workflow
- Editing an existing circuit (no browser)
- Adding a bridge or an elevation bump to an existing def
- Gotchas

## Workflow

0. **Already registered?** Before adding anything:
   `ls js/circuits/<id>.js; grep -n '"<id>"' tools/manifest.cjs; grep -n '<id>' tools/track/import-circuit-path.mjs`
   and read `docs/tracks/<id>.md` if it exists. If the id is present (madrid, for one), skip to
   "Editing an existing circuit" below.

1. **Create / edit** `js/circuits/<id>.js` with the schema above. Copy a similar
   existing track (`js/circuits/spa.js` for a green/forest road course,
   `js/circuits/monaco.js` for a street circuit, `js/circuits/monza.js` for a parkland
   layout) and adapt it — don't start from a blank file.

   **Real-world centreline (OSM) — `path` is REQUIRED.** `tools/track/import-circuit-path.mjs`
   pulls the centreline from `bacinger/f1-circuits` (ODbL-1.0) in the same
   projection the committed `path`s use (verify with `--self-check`
   before trusting a new entry):
   ```sh
   node tools/track/import-circuit-path.mjs --self-check            # re-projects the ids in COMMITTED + CLASSICS, not every circuit
   node tools/track/import-circuit-path.mjs <gameId>:<featureId>     # emit one new `path:` line
   node tools/track/import-circuit-path.mjs --classics               # emit every CLASSICS trace at once
   ```
   **Not in bacinger (e.g. Portimão)?** bacinger's 40 features are all shipped,
   so a further circuit comes from OpenStreetMap: add a row to
   `tools/track/osm-circuits.json` `circuits` (`name`, `country`, `bbox`
   `[s,w,n,e]`, `target` = the real lap length in metres of the configuration
   F1 raced, from its Wikipedia infobox — a wrong number picks a wrong layout; where the
   venue was rebuilt the row's `_doc` says to use the CURRENT length — plus `location` and `gp` years), then
   ```sh
   node tools/track/stitch-osm-ring.mjs <id>     # ad hoc instead: --bbox <s,w,n,e> --target <m>
   node tools/track/import-circuit-path.mjs --source artifacts/osm-rings.geojson <id>:<id>
   ```
   (header of `stitch-osm-ring.mjs`: its output file and the shape-error gate).
   `bake-elevation.mjs` reads the same row for an SRTM profile.

   Paste the emitted `path: { len, pts }` line into the new def. Then author
   `turns` (and `sectors` if researched), `furniture`, `kit`, `standSet` and —
   for street/modern circuits — `barrier` / `cityStyle`; copy a sibling's rows
   as the starting point.

   **1b. The scenery file — a circuit is a PAIR.** `LAZY_SCENERY` in `tools/manifest.cjs` maps EVERY
   `CIRCUITS` id to `js/circuits/scenery/<id>.js`, so create it in the same commit: copy a sibling's
   scenery file and rename its `(window.TrackScenery = window.TrackScenery || {})["<id>"]` key. The
   body (trees, stands, barriers) → skill scenery-dress.

   **Designer presets from TUMFTM (optional, not a shipped def).** For layouts
   Apex does not carry (Norisring, Moscow Raceway, Oschersleben, Nürburgring
   DTM), convert the LGPL [racetrack-database](https://github.com/TUMFTM/racetrack-database)
   CSV into a TRACK DESIGNER import envelope — do **not** paste it into
   `js/circuits/` without a full authoring pass:
   ```sh
   node tools/track/tumftm-import.mjs --missing
   node tools/track/tumftm-import.mjs Norisring --fetch -o artifacts/tumftm/
   ```
   Licence, overlap table, and why racelines stay offline:
   `docs/notes/TUMFTM-RACETRACK-DATABASE.md`.

2. **Register it** (new tracks only): add the id to the `CIRCUITS` array in
   `tools/manifest.cjs` (the roster source of truth), then run `npm run gen`. A circuit
   has NO `<script>` tag: `gen-circuit-meta.mjs` (first step of `npm run gen`) rewrites the
   picker roster `js/track/circuit-meta.js`, and the full def hydrates per pick via
   `LAZY_CIRCUIT` / `ensureCircuit`. `circuit-meta.js` is GENERATED (AGENTS.md rule 11):
   never hand-edit it; `npm run gen:check` names drift, and `tests/unit/circuit-meta.test.mjs`
   fails on it. Never hand-edit a `?v=` tag ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump).
   `CIRCUITS` order == `Tracks.LIST` == picker order:

   - **Always APPEND the id at the END of `CIRCUITS`**, never interleave: a stored
     `apex26.track` is a positional index, so an insert re-points every saved pick
     below it (the comment above `CIRCUITS` in `manifest.cjs`).
   - **`classic` decides SEASON membership, position does not.** `Tracks.SEASON` is
     `LIST.filter(t => !t.classic)` (istanbul and portimao already sit among the
     classics). Not a current-season round → set `classic: true` in the def; a
     missing flag adds a 25th round and breaks `SEASON.length`.
   - **The roster count is asserted.** It is a forcing function, not a budget — raise
     it deliberately, in the commit that adds the circuit, and say why. Adding a circuit
     means updating, in the same commit:
     1. `index.html`'s `<meta name="description">` "Drive N real circuits" (a plain line,
        not a `@gen-shell` block; `tests/unit/circuit-count-shell.test.mjs` pins it to
        `Tracks.LIST.length`; `SEASON.length` stays 24),
     2. `tests/specs/f1-track-accuracy.spec.js` — a `CIRCUIT_MAP` row AND a matching feature
        in `tests/data/f1-circuit-reference.geojson` (its count derives from the map). The spec
        asserts the game's circuits and the map are the same SET, so a circuit with no
        reference feature fails outright.
     3. `tools/check/offline-precache-check.cjs` — the literal scenery-file count in its
        `installed.scenery !== N` line (a browser tool: the parent runs it),
     4. `js/ui/flags.js` if the country is new — `tests/unit/flags.test.mjs`
        fails on a circuit whose country has no drawn flag,
     5. `tests/data/landmarks/<id>.json` for a hero landmark (`js/circuits/AGENTS.md`),
        and a `docs/tracks/<id>.md` note,
     6. the `tools/track/*-baseline.json` audits (clip, coplanar, float; props-tris is a ratchet) at EXACTLY the measured
        value. A cap above the measurement fails as loudly as one below, and an
        absent id means a cap of 0 — so omit the row when the circuit measures
        clean rather than writing a 0,
     7. `tests/data/def-factory-golden.json` `hashes` — one row per shipped circuit
        (`tests/unit/track-def-factory.test.mjs` fails "no golden row" and asserts rows ==
        shipped circuits). To capture it, add the row with a placeholder value, run that
        test, and paste the hash its `<id>: <hash> != golden …` line prints.
     Optional per-id tables (absent = the default; no unit test was found requiring a
     row on 2026-10-27): `js/lighting/presets.js` `"<id>|tod|wx"` rows, `js/data/circuit-lore.js`,
     `tools/shot/scenery-locations.json`.
     Removing a circuit instead is a FOUR-file pass, not the three this file
     used to name: `js/circuits/<id>.js`, `js/circuits/scenery/<id>.js`, its
     `CIRCUITS` entry, and every row above; then `npm run gen` (circuit-meta).

3. **Headless build guard and generated-file sync** — the fast pre-push checks, no browser:
   ```sh
   node tools/track/verify-track.cjs <id>     # OK <id>: props X verts (road Y, terrain Z); --all for the fleet
   npm run gen:check                          # circuit-meta + shell drift after a manifest change (?v=dev, no bump)
   ```
   A non-zero `verify-track` exit means the spline/road/terrain build or the
   `scenery(api)` callback **threw** — which in the running game would strand the
   player on the menu. Common causes: a missing destructure (`out` not pulled
   from `api`), a node index out of range, or bad track data.

4. **Visual check** — `__apex.tracks()` lists the id; then load and screenshot it
   (the `playwright-probe` skill's `shot.mjs`):
   ```js
   __apex.race("<id>"); __apex.park(0.1);          // stationary at 10% lap
   __apex.orbit(0.1, 45, 15, 40);                  // inspect from all sides
   __apex.trackProfile();                          // [{frac,y,k,hw,slope}] elevation/curvature sanity
   ```

5. **Tests** — `node tools/ci/pick-tests.mjs` names the groups. The single
   browser check is that circuit's `tests/specs/<id>-foundation.spec.js`
   (AGENTS.md verification table; hyphenated file names, e.g. `albert-park-`), run alone via
   `node tools/ci/test-bg.mjs --spec tests/specs/<id>-foundation.spec.js` (AGENTS.md rules 4-5; a
   subagent reports it not run; a whole group → `node tools/ci/remote-group.mjs <group>` on the pushed branch). A NEW `<id>-foundation.spec.js` needs no `tests/groups.json` row: the
   `test:circuits` group globs `tests/specs/*-foundation.spec.js`; only a new non-glob test file needs a
   groups row + TESTING.md §5 row + `npm run gen`. Not every circuit has one (madrid does not):
   with none, run what `pick-tests` names, plus `tests/specs/f1-track-accuracy.spec.js` and
   `terrain-over-road.spec.js` (terrain above the racing line) when geometry, elevation or a
   street/terrain flag moved. A whole group is the parent's call.

## Editing an existing circuit (no browser)

Before an edit, read `docs/tracks/<id>.md` (and `docs/tracks/START-LINES.md`); a hero-landmark edit also touches
`tests/data/landmarks/<id>.json` (rules in `js/circuits/AGENTS.md`). Then:
```sh
node tools/track/verify-track.cjs <id>                 # seconds; OK line + guard drops (monza: suppressed 2 is the baseline, not a fail)
node tools/track/clip-audit.cjs <id>                   # severe-spot count vs tools/track/clip-baseline.json
node tools/track/coplanar-audit.cjs <id>               # z-fight count vs coplanar-baseline.json
node tools/track/float-audit.cjs <id>                  # floating props vs float-baseline.json (absent id = 0)
node tools/track/props-tris.cjs <id>                   # tris vs props-tris-baseline.json (ratchet: tests/unit/props-tri-ratchet.test.mjs)
node tools/track/rotate-markings.cjs --check           # read-only proposed transformation; NOT a stale/fresh verdict and NOT idempotent; verify Turn 1/apex evidence before scoped --write
```
Green = each count equals its `"<id>"` row in `tools/track/{clip,coplanar,float}-baseline.json` (an absent float row = 0); `props-tris-baseline.json` is a ratchet ceiling, so a lower measure is fine. Read the rows, never a number quoted in prose. Re-run after the edit;
a geometry/scenery edit that moves a count means updating that baseline row to the measured value, in the same commit.
`import-circuit-path.mjs --self-check` can exit 1 on a known committed-path drift row (see `docs/plans/skilltest-content-pipeline.md`); a FAIL row for the circuit you touched is yours.

## Adding a bridge or an elevation bump to an existing def

Both are cosine bumps `{ s, halfM, rise }` (full width 2 x halfM, peak `rise` m), added to the road height in `buildCenterline` (`js/track/tracks.js` (`buildCenterline`)).
- **`elevations`** — terrain follows the road.
  - Silently DROPPED (`js/track/core/def.js` `fromRaw`) when the id has a profile in `js/track/circuit-elevations.js` (SRTM bake).
  - Then edit the bake (`tools/gen/bake-elevation.mjs`), not the def. Check first: `grep -c "^    <id>:" js/track/circuit-elevations.js`.
- **`bridges`** — the road lifts.
  - `profile()` in `js/track/core/surface.js` (`if (def.bridges)`) carves the ground back flat under the deck.
  - The `const brs = def.bridges` block in `js/track/scenery/build-props.js` adds four pillar pairs.
  - Only suzuka has one; pick `s` from the real crossover (a bridge over nothing is a bare hump), and keep `halfM` short.
- **`s` frame:** authored against `sceneryStartFrac` (else `startFrac`), remapped to racing frac by `materializeListPoints`, then shifted by `def._sceneryShift` at every consumer (road, ground carve, pillars).
  - `_sceneryShift` is nonzero ONLY when the def names `sceneryStartFrac`; with none, `s` is a plain racing-lap fraction.
  - With it: `racing = authored + _sceneryShift - sceneryStartFrac` (read imola's def for a worked case).
  - Never add `sceneryStartFrac` to compensate; never read `b.s`/`e.s` raw in new code, add `+ (def._sceneryShift || 0)`.
- **Audits that move** (no browser): `verify-track <id>` (throws); `clip-audit` and `coplanar-audit` (a bridge deck adds overhead faces: `--overhead`); `float-audit` and `props-tris` (pillars, re-seated props); `tests/unit/elevation-smoothness.test.mjs` (grade cap; baked ids only, skips bridge windows); `tests/unit/track-foundation.test.mjs` / `circuit-def-fields.test.mjs` (def shape).
  - Baselines: the `"<id>"` rows of `tools/track/*-baseline.json` (props-tris is a ceiling; float absent = 0).
  - Node-VM twin (heavy, ~200 s, load < 3): `tests/unit/elevation-tracks-vm.test.mjs`.
  - Browser-only: `terrain-over-road.spec.js`, `elevation-tracks.spec.js`, `<id>-foundation.spec.js`; name them not-run in the PR when skipped.
  - `undulate` ripple is added after the bumps, so measure `py` from `Tracks.build(def)`, not the numbers you typed.
- **Reading heights/curvature with no browser:** `require("tools/lib/track-build-vm.cjs").buildContext().Tracks.buildCenterline(def)` returns `{n,total,py,curv,...}` (`py[k]`, `curv[k]` per point; `__apex.trackProfile()` is the browser twin). Mutating `def.elevations` on the VM's def before the call previews a bump without editing the circuit.
- **Hand-off note** to leave in the PR: which key, `s`/`halfM`/`rise`, the measured audit counts before and after, and which baseline rows you updated.

## Gotchas

- **`path` is the geometry, full stop.** There is no hand-authored segment
  fallback any more: a def without `path` fails the build with an error naming
  the circuit (`verify-track` shows it). Use `reverse`/`startFrac` to
  orient a trace and `hwZones` to narrow it — never edit `path.pts` by hand
  (`realPoints()` keeps the trace index-for-index; `startFrac` counts in it).
- **Cloning a track:** copy the whole def — `path`, `turns`, `furniture`,
  `kit`, `standSet` and the rest come with it, because the def is the single
  home. Nothing in `js/track/` is keyed by circuit id.
- **`turns` are RACING-LAP fractions**, never fmap'd: when `startFrac` moves the
  line, re-seat them with `tools/track/rotate-markings.cjs --check` / `--write` (once
  per circuit). A def without `turns` falls back to **curvature-peak**
  `__apex.corners()` for corner boards — not the curated FIA apexes. The
  `classic: true` circuits carry `turns` (the N strongest curvature peaks,
  N = the real turn count). Every def now carries `sectors`; where no FIA
  split was researched they sit at ~1/3 and ~2/3, snapped to the nearest
  straight (a missing key still falls back to thirds). (`import-circuit-path --classics` covers only
  the subset that tool holds traces for, not the classic roster.)
- **`apex26.track` is a positional index** into `Tracks.LIST` (same order as
  `tools/manifest.cjs` `CIRCUITS`). Do not reorder the circuit block casually —
  saved track picks and season routing will point at the wrong def.
- **`street: true` removes the terrain ribbon** — barriers must line the edge or
  the road floats over the floor slab.
- For the `scenery(api)` body (trees, buildings, barriers, mountains), use the
  dedicated **scenery-dress** skill.
