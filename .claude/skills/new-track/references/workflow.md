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

2. **Register it** (new tracks only): add `<script src="js/circuits/<id>.js?v=N"></script>`
   to `index.html` in the circuit block (before `js/track/tracks.js`) **and add the
   matching entry to the `CIRCUITS` array in `tools/manifest.cjs`** — the load-order
   single source of truth; `tests/unit/load-order.test.mjs` (`npm run test:tooling`) fails
   if the two diverge. Tag order == `Tracks.LIST` == picker/season order:
   - **Season circuits** (24 rounds): append in calendar order at the end of the
     season block (before the `classic: true` section).
   - **Retired circuits**: set `classic: true` in the def and append after the 24
     season rounds (see the `// ── retired / off-calendar ──` comment in
     `manifest.cjs`).
   - **Roster is capped at 40 circuits** — `tests/unit/shared-track-foundation-characterization.test.cjs`
     asserts `Tracks.LIST.length === 40`. Adding a new circuit at 40 means
     **replacing** an existing `classic: true` one, not "retiring" it further —
     e.g. `jacarepagua` (`js/circuits/jacarepagua.js`) is **already**
     `classic: true` (last Brazilian GP 1989), so swapping it out for a new
     circuit is a **delete**, done in one pass:
     1. Delete `js/circuits/jacarepagua.js`.
     2. Remove its `<script>` tag from `index.html`.
     3. Remove its entry from the `CIRCUITS` array in `tools/manifest.cjs`.
     (Its centreline, markings and dressing rows are keys of that one file —
     nothing else in `js/track/` names the circuit.)
     Then add the new circuit's three matching pieces. Skipping one leaves a
     dangling reference that `tests/unit/load-order.test.mjs` or the 40-cap
     test will catch — but don't rely on the test to tell you which file you
     forgot; delete all three together.
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
4. **Bump the cache version** (`node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`)) — you edited
   `index.html` and/or a JS file.
5. **Visual check** — load and screenshot it (use the `playwright-probe` skill's `shot.mjs`):
   ```js
   __apex.race("<id>"); __apex.park(0.1);          // stationary at 10% lap
   __apex.orbit(0.1, 45, 15, 40);                  // inspect from all sides
   __apex.trackProfile();                          // [{frac,y,k,hw,slope}] elevation/curvature sanity
   ```
6. **Tests**:
   ```sh
   node tools/track/verify-track.cjs <id>
   node tools/ci/test-bg.mjs circuits   # walls + autopilot + elevation (includes tracks-walls.spec.js)
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
