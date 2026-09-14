# New-track workflow and gotchas

Load from the SKILL.md index when the task needs this detail.

## Workflow

1. **Create / edit** `js/circuits/<id>.js` with the schema above. Copy a similar
   existing track (`js/circuits/spa.js` for a green/forest road course,
   `js/circuits/monaco.js` for a street circuit, `js/circuits/monza.js` for a parkland
   layout) and adapt it — don't start from a blank file.

   **Real-world centreline (OSM) — `path` is REQUIRED.** `tools/track/import-circuit-path.mjs`
   pulls the centreline from `bacinger/f1-circuits` (ODbL-1.0) in the same
   projection every committed `path` already uses (verify with `--self-check`
   before trusting a new entry):
   ```sh
   node tools/track/import-circuit-path.mjs --self-check            # sanity-check the projection against every committed path
   node tools/track/import-circuit-path.mjs <gameId>:<featureId>     # emit one new `path:` line
   node tools/track/import-circuit-path.mjs --classics               # emit all 16 retired-circuit traces at once
   ```
   Paste the emitted `path: { len, pts }` line into the new def. Then author
   `turns` (and `sectors` if researched), `furniture`, `kit`, `standSet` and —
   for street/modern circuits — `barrier` / `cityStyle`; copy a sibling's rows
   as the starting point.

2. **Register it** (new tracks only): add the id to the `CIRCUITS` array in
   `tools/manifest.cjs` (load-order source of truth), then run
   `node tools/gen/gen-shell.mjs` so the `@gen-shell` script block in `index.html`
   picks it up. Never hand-edit a `?v=` tag — committed tags stay `?v=dev`.
   `tests/unit/load-order.test.mjs` fails if manifest and shell diverge.
   Tag order == `Tracks.LIST` == picker/season order:

   - **Season circuits** (24 rounds): append in calendar order at the end of the
     season block (before the `classic: true` section).
   - **Retired circuits**: set `classic: true` in the def and append after the 24
     season rounds (see the `// ── retired / off-calendar ──` comment in
     `manifest.cjs`).
   - **The roster count is asserted, in two places.**
     `tests/unit/shared-track-foundation-characterization.test.cjs` and
     `tests/unit/circuit-def-fields.test.mjs` both pin `Tracks.LIST.length`
     (51 as of 2026-09-14). It is a forcing function, not a budget — raise it
     deliberately, in the commit that adds the circuit, and say why. It read 40
     until eleven circuits were recovered from OpenStreetMap
     (`tools/track/osm-circuits.json`).
     Raising it means updating, in the same commit:
     1. the two `Tracks.LIST.length` assertions (`SEASON.length` stays 24),
     2. `tests/specs/f1-track-accuracy.spec.js` — the `waitForFunction` count, a
        `CIRCUIT_MAP` row, AND a matching feature in
        `tests/data/f1-circuit-reference.geojson`. The spec asserts the game's
        circuits and the map are the same SET, so a circuit with no reference
        feature fails outright.
     3. `tools/check/offline-precache-check.cjs` — the scenery-file count,
     4. `tests/unit/lighting-campaign.test.mjs` — `TRACKS.length`, `rows.length`
        (count x 20, in two tests), the unique-key sets, `SHARDS.flat()`, and the
        `rows.slice(-6)` literal, which pins whichever circuit is LAST and breaks
        purely from appending,
     5. `tools/lighting/campaign/config.mjs` — `TRACKS`, one `SHARDS` entry, and
        three `CAMERA_FRACTIONS`,
     6. `js/ui/flags.js` if the country is new — `tests/unit/flags.test.mjs`
        fails on a circuit whose country has no drawn flag,
     7. the three `tools/track/*-baseline.json` audits at EXACTLY the measured
        value. A cap above the measurement fails as loudly as one below, and an
        absent id means a cap of 0 — so omit the row when the circuit measures
        clean rather than writing a 0.
     Removing a circuit instead is a FOUR-file pass, not the three this file
     used to name: `js/circuits/<id>.js`, `js/circuits/scenery/<id>.js`, its
     `CIRCUITS` entry, and every row above. `index.html` is GENERATED — run
     `node tools/gen/gen-shell.mjs`, never hand-edit the tag.
   Verify with `__apex.tracks()` that the id appears.
3. **Headless build guard** — the fast pre-push check that needs no browser:
   ```sh
   node tools/track/verify-track.cjs <id>
   ```
   Success prints `OK <id>: props X verts (road Y, terrain Z)`. A non-zero exit
   means the spline/road/terrain build or the `scenery(api)` callback **threw** —
   which in the running game would strand the player on the menu. Fix before
   pushing. Common causes: a missing destructure (`out` not pulled from `api`), a
   node index out of range, or bad track data.
4. **Shell sync** — `node tools/gen/gen-shell.mjs --check` (or `gen-shell.mjs`
   after a `tools/manifest.cjs` change). Committed tags stay `?v=dev`; deploy
   stamps hashes. Do not hand-bump numeric `?v=N`.

5. **Visual check** — load and screenshot it (use the `playwright-probe` skill's `shot.mjs`):
   ```js
   __apex.race("<id>"); __apex.park(0.1);          // stationary at 10% lap
   __apex.orbit(0.1, 45, 15, 40);                  // inspect from all sides
   __apex.trackProfile();                          // [{frac,y,k,hw,slope}] elevation/curvature sanity
   ```
6. **Tests**:
   ```sh
   node tools/track/verify-track.cjs <id>   # default gate (no browser)
   # optional parent ship only: node tools/ci/test-bg.mjs circuits
   ```
   The `terrain-over-road.spec.js` audit (part of the full suite) catches terrain
   triangles rendering above the racing line — re-run it if you changed elevation
   or a street/terrain flag.

## Gotchas

- **`path` is the geometry, full stop.** There is no hand-authored segment
  fallback any more: a def without `path` fails the build with an error naming
  the circuit (`verify-track` shows it in 2 s). Use `reverse`/`startFrac` to
  orient a trace and `hwZones` to narrow it — never edit `path.pts` by hand
  (`realPoints()` keeps the trace index-for-index; `startFrac` counts in it).
- **Cloning a track:** copy the whole def — `path`, `turns`, `furniture`,
  `kit`, `standSet` and the rest come with it, because the def is the single
  home. Nothing in `js/track/` is keyed by circuit id.
- **`turns` are RACING-LAP fractions**, never fmap'd: when `startFrac` moves the
  line, re-seat them with `tools/track/rotate-markings.cjs --check` / `--write` (once
  per circuit). A def without `turns` falls back to **curvature-peak**
  `__apex.corners()` for corner boards — not the curated FIA apexes. The 16
  classics carry `turns` (the N strongest curvature peaks, N = the real turn
  count) but no researched `sectors`; every consumer falls back to thirds.
- **`apex26.track` is a positional index** into `Tracks.LIST` (same order as
  `tools/manifest.cjs` `CIRCUITS`). Do not reorder the circuit block casually —
  saved track picks and season routing will point at the wrong def.
- **`street: true` removes the terrain ribbon** — barriers must line the edge or
  the road floats over the floor slab.
- For the `scenery(api)` body (trees, buildings, barriers, mountains), use the
  dedicated **scenery-dress** skill.
