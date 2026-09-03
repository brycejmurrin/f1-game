# New-track workflow and gotchas

Load from the SKILL.md index when the task needs this detail.

## Workflow

1. **Create / edit** `js/circuits/<id>.js` with the schema above. Copy a similar
   existing track (`js/circuits/spa.js` for a green/forest road course,
   `js/circuits/monaco.js` for a street circuit, `js/circuits/monza.js` for a parkland
   layout) and adapt it — don't start from a blank file.

   **Real-world centreline (OSM)**: don't hand-author `segs` for a real circuit
   if a trace can be imported. `tools/import-circuit-path.mjs` pulls centrelines
   from `bacinger/f1-circuits` (ODbL-1.0) into `CircuitPaths` in
   `js/track/geo-paths.js` — the same projection the committed traces already
   use (verify with `--self-check` before trusting a new entry):
   ```sh
   node tools/import-circuit-path.mjs --self-check            # sanity-check the projection against every committed path
   node tools/import-circuit-path.mjs <gameId>:<featureId>     # emit one new geo-paths.js entry
   node tools/import-circuit-path.mjs --classics               # emit all 16 retired-circuit traces at once
   ```
   Paste the emitted line into `js/track/geo-paths.js` under the new id — the
   trace wins over `segs` (see Gotchas below), so `segs` in the def only needs
   to be a rough closed-loop fallback.

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
     4. Remove its `CircuitPaths` entry in `js/track/geo-paths.js`, if any.
     Then add the new circuit's four matching pieces. Skipping any one of the
     four leaves a dangling reference that `tests/unit/load-order.test.mjs` or the
     40-cap test will catch — but don't rely on the test to tell you which
     file you forgot; delete all four together.
   Verify with `__apex.tracks()` that the id appears.
3. **Headless build guard** — the fast pre-push check that needs no browser:
   ```sh
   node tools/verify-track.cjs <id>
   ```
   Success prints `OK <id>: props X verts (road Y, terrain Z)`. A non-zero exit
   means the spline/road/terrain build or the `scenery(api)` callback **threw** —
   which in the running game would strand the player on the menu. Fix before
   pushing. Common causes: a missing destructure (`out` not pulled from `api`), a
   node index out of range, or bad track data.
4. **Bump the cache version** (`node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`)) — you edited
   `index.html` and/or a JS file.
5. **Visual check** — load and screenshot it (use the `playwright-probe` skill's `shot.mjs`):
   ```js
   __apex.race("<id>"); __apex.park(0.1);          // stationary at 10% lap
   __apex.orbit(0.1, 45, 15, 40);                  // inspect from all sides
   __apex.trackProfile();                          // [{frac,y,k,hw,slope}] elevation/curvature sanity
   ```
6. **Tests**:
   ```sh
   node tools/verify-track.cjs <id>
   node tools/test-bg.mjs circuits   # walls + autopilot + elevation (includes tracks-walls.spec.js)
   ```
   The `terrain-over-road.spec.js` audit (part of the full suite) catches terrain
   triangles rendering above the racing line — re-run it if you changed elevation
   or a street/terrain flag.

## Gotchas

- **The loop must close.** The engine distributes any residual position/elevation
  around the lap and applies mild Laplacian smoothing, but wildly unclosed
  `segs` produce kinks. Keep cumulative turn near a multiple of 360°.
- **OSM trace wins over `segs`.** If `js/track/geo-paths.js` has a path for this id, your
  `segs` are ignored for the centreline (still useful as a fallback). Use
  `reverse`/`startFrac` to orient a trace, not `segs` rewrites.
- **Cloning an OSM-backed track:** you **must** copy the `CircuitPaths` entry in
  `js/track/geo-paths.js` under the new id. Without it the build silently falls
  back to coarse `segs` — the game loads, but the layout is wrong and hard to spot.
- **`CircuitMarkings` covers the 24 season rounds only** (`js/track/markings.js`).
  Classics and new tracks without an entry fall back to **curvature-peak**
  `__apex.corners()` for turn lists — not the curated FIA apex fractions.
- **`apex26.track` is a positional index** into `Tracks.LIST` (same order as
  `tools/manifest.cjs` `CIRCUITS`). Do not reorder the circuit block casually —
  saved track picks and season routing will point at the wrong def.
- **`street: true` removes the terrain ribbon** — barriers must line the edge or
  the road floats over the floor slab.
- For the `scenery(api)` body (trees, buildings, barriers, mountains), use the
  dedicated **scenery-dress** skill.
