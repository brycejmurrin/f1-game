# Loading-screen flyby — improvement plan (2026-09-24)

Status: **IN PROGRESS** — Phase 0.2, 0.3 and 0.5 done on the follow-up branch (see below). Built from the shipped rework (`c001f01`, "Flyby: reframe the
pre-race loading shots") and four research passes run in parallel worktrees.
Sections marked *PENDING* are still being measured and will be filled in when
those passes report. A path written `js/<new>/camera/x.js` is a PROPOSED file (the path without `<new>/`), not one that exists yet.

## Completed on `claude/flyby-followups-ttcaik` (follow-up PR)

Headless only (node VM, `tools/lib/flyby-audit.cjs`); nothing below has been
rendered. Fleet sweep, 52 circuits x 400 samples, before -> after:

| metric | before | after |
|---|---|---|
| max one-step vertical jump | 7.9 m (madrid lm2), 6.3 (vegas lm1), 5.3 (sochi mid) | 2.2 m (mont_tremblant late) |
| max planned lift | 47.4 m (madrid lm2), 40.2 (vegas lm1), 33.2 (sochi mid) | 20.8 m (mont_tremblant late), 12.1 (sochi mid), 11.2 (abudhabi lm2) |
| eye underground | redbull lm1, 6.1 m | none |
| grid sightline past the road edge | bahrain 13.6 m, magny_cours 7.5, jeddah 7.3, silverstone 7.1 | magny_cours 1.7 m (verge), all others on the road |
| peak pan rate | 206 deg/s (bahrain late), 152 (monaco mid), 142 (nurburgring late) | 43 deg/s max; 40 target |
| eye inside a tall tree | 16 circuits (hockenheim 44 samples, monza turn-first 38) | 3 samples fleet-wide |

- [x] 0.2 item 1 (pop): lift planned per shot (PR #245) plus floorEye in the profile, valley bridging, and a sample-gap margin, so the per-frame safety net never pops
- [x] 0.2 item 2 (corner eyes in buildings): step-in, then step-out, then an arc slide; least lift wins
- [x] 0.2 item 3 (landmark overshoot): reach capped at `max(60, near + 40)` m, a quarter rate beyond; landmark eyes also step in/swing
- [x] 0.2 item 4 (grid sightline): `planLook` shortens the look lead until the chord is within 1 m of the road edge
- [x] 0.2 item 5 / 0.5 (wide look target): `distR`/`yR` of 0 is the centroid
- [x] 0.2 item 7 (corner roles): nearest corner turning >= 35 deg net over +-40 m (a chicane needs 45)
- [x] 0.2 item 8 (landmarks): no gantries, nothing within 5 m of the road edge, heights from `max(bottom, ground)`, missing ranks become a whole-circuit shot from an unused side
- [x] the no-landmark look-straight-up bug; bake keeps DEFAULT's comments; editor corner picker 1-18, duration max 1, HEIGHT OFFSET label
- [x] pan budget: <= 40 deg/s at FLY_MS by squeezing a shot's travel; trees (>= 8 m) are obstacles to the plan
- [x] 0.3 tool commits, the free-camera inverse (`00c2f4e`) and frame-report (`cd0ede2`) cherry-picked
- [ ] still open: 0.2 items 6 (dead slider ranges), 9 (fence cap between endpoints); mont_tremblant turn-late crane over a pine wood at the fence (20.8 m); sochi turn-mid 12 m over a sparse hull; 0.4

## Next steps (as of 2026-09-24 04:20 UTC)

### Shipped / in flight
| Item | State |
|---|---|
| PR #245 — shot rework + planned lift + corner step-in | **merged** to the deploy branch (`5269cb5`); CI running; Pages dispatched manually (#35954916425) |
| Road depth-bias fix (0.1) | branch `claude/road-depth-bias-ttcaik` (`0304aa3`), pushed, **no PR yet**; GPU census running (#35954601399) |
| Follow-up PR (0.2–0.5, tools, converter, frame-report, plan doc) | being built on `claude/flyby-followups-ttcaik` in a worktree |

### Now → next hour
1. **Confirm live.** Pages #35954916425 green → check the live `version.json` / `apex-sha` contains `5269cb5` (deploy-research agent). Only then call it live. If the ci.yml push run goes red, triage with ci-red-triage before touching anything.
2. **Depth-bias PR.** Read the census Verdict (macOS Metal, Monza: grid visible from ahead on GLX and both TLX legs; no start-line/grid-box z-fight; chevrons on all backends). Then run the TLX gate locally (`gfx-probe --backend three --tlx-webgpu --lavapipe montreal`, and with `--ls apex26.tlxForceHw=env`, 0 `gpuErrors`) and a GLX look at a hilly verge (Spa). Green → open the PR, CI, merge. Red → report the exact failing check; don't loosen anything.
3. **Follow-up PR.** When the agent reports: review its commits, render the frames it flags (`flyby.mjs --track a,b,c` in one browser), run `deploy.mjs --pr`, merge on green CI.
4. **After depth bias ships.** Restore the front-of-grid closing shot (looking back at the front row, long lens) and update the stale comment at the grid shots.

### Then (by value)
5. **Phase 1 batch** — end on the player's car in its real slot; corners by character (slowest / fastest / the one the announcer names); a varied flyby per load. ~10 game.js lines; logic in `flyby-seq.js`.
6. **Agent tooling** — wrap `frame-report.mjs` as an `apex_frame_report` MCP tool; add a fleet sweep diff; then an auto-search that tunes a shot's parameters against the framing score.
7. **Free camera MVP** (Phase 5) — pause-card entry, dock, roll, snaps, COPY AS FLYBY POSE, `__apex.freeCam()`. Budget first: game.js, apex.js, shell nodes and CSS classes are all at their ceilings. Merge with the photo-mode kit (4.1).
8. **Presentation quick wins** — announcer's last line on the grid shot, letterbox, skip hint / shorter flyby for habitual skippers, look presets, start-light grid shots.
9. **Separate WGX bug** — `wgx.js` ~1925 swaps GL's factor/units into `depthBias`/`depthBiasSlopeScale`; its own PR + census.
10. **Larger** — TV director camera → instant replay → results orbit / highlights; night/wet shot variants; per-circuit signature shots; a car driving through the corner shots.

### Housekeeping
- Remove the temporary worktrees (`.claude/worktrees/fix12`, `depthbias`, agent worktrees) once their branches are merged or abandoned.
- Commit this plan to `docs/plans/` (the follow-up PR carries it).

## Where we are

`js/camera/flyby-seq.js` plays nine shots over `FLY_MS` (24 s): wide, wide2,
landmark1, landmark2, turn-first, turn-mid, turn-late, grid-crane, grid. Poses
are relative (bearing 0 = track side; a corner's +x = its outside; street
circuits cap corner eyes at the barrier), so one list frames the same subject
at every circuit. It was verified visually on Monza, Monaco and Bahrain only.

Constraints any change below must respect:

| Constraint | Where | Consequence |
|---|---|---|
| `js/game.js` ratchet has ~1 line of headroom (9089 / 9090) | `tests/data/ratchets.json` | Logic goes in `flyby-seq.js` / `loading-screen.js`; game.js gets call sites only. The commit hook absorbs ≤ 40 lines, so budget is tight across the whole plan. |
| Seating the menu grid must not spend sim RNG draws | `menuGridCars()`, guarded by `flyby-shots.test.mjs` | Any re-seating keeps the snapshot/restore. |
| Editing `js/circuits/` triggers the full sweep suite (~700 s) | `tools/ci/geometry-paths.mjs` | Per-circuit flyby data lives in `js/data/`, never in circuit files. |
| New curvature/racing-line reads need a broadcast-only row | `docs/PHYSICS.md` curvature table | Any idea reading the line or curvature adds a row. |
| New DOM nodes count against the index.html node ratchet | shell | Prefer CSS pseudo-elements and redrawing existing canvases. |
| A saved editor list (`apex26.flybyShots`) must play as authored | `flyby-panel.js` | Variation/selection only applies when no saved list exists. |
| The road's slope-scaled depth bias hides distant cars from ANY direction | road `depthBias [-8,-16]` | Grid shots stay close/forward until 0.1 lands; it affects racing too, not just the flyby. |

## Phase 0 — fix what is broken (before any new shots)

| # | Item | Files | Effort | Verify |
|---|---|---|---|---|
| 0.1 | **Road depth bias hides cars** — see §0.1 below. Candidate patch `e1ff1a5` (local branch `investigate-road-bias`, unverified on GPU). | `js/game.js` `_wmRoad*`/`_wmTerrain*`/`_startBias`, `js/render/three/tsl-fx.js`, `tests/unit/gfx-backend-canary.test.mjs` | M | see §0.1 |
| 0.2 | Fleet-wide shot defects — see §0.2 (52 circuits swept headlessly). Two fixes committed locally on `audit-flyby-fleet` (`865b1ff`, `7a4b75e`). | `flyby-seq.js`, `js/agent/apex.js` | M | fleet sweep script → a fleet-wide unit test; sheets for shanghai, vegas, jeddah, redbull |
| 0.3 | Authoring-tool fixes — see §0.3. Four local commits on `review-flyby-tools` (`d6cbd0d`, `2ffc5fe`, `49aa35f`, `1e25c0a`), unit-tested, NOT browser-run. | `tools/shot/flyby.mjs`, `js/agent/apex.js`, `flyby-panel.js`, `bake-flyby.mjs` | S | one `flyby.mjs --track monza,bahrain` run in a browser |
| 0.5 | **Wide shots aim off-centre**: a `centre` LOOK pose `{distR: 0, yR: 0}` is clamped by `posePoint` to 200 m out (start-line side) and 55 m up, so both establishing shots aim there, not at the centroid. Fix: apply the helicopter clamps only when `distR > 0` / `yR > 0` (a zero means "the centroid"), then re-render the wides. | `flyby-seq.js` `posePoint` | S | unit test: `{at:"centre",distR:0,yR:0}` resolves to `bounds()` centroid; wide sheets |
| 0.4 | `flyby.mjs` cannot render night/wet and renders the RACE grid, not the menu grid | `tools/shot/flyby.mjs` | S | add `--tod`, `--weather`, `--seed`; sheet at Bahrain night |

### §0.2 Fleet audit (all 52 circuits, headless game-vm, 201–400 samples each)

Committed locally (unverified in a browser):
- `865b1ff` `floorEye()`: an off-road eye stays ≥ 1.5 m above terrain/road.
  Red Bull's rank-0 landmark is a tower in a valley — `landmark1` put the eye
  6.1 m UNDER the start straight on every sample. Only that shot changes fleet-wide.
- `7a4b75e` `__apex.flybyCam` stops flagging on-road grid shots as INSIDE
  (false alarms at 11 circuits). Overlaps the tooling review's `2ffc5fe` — merge one.

Unfixed, ranked:

| # | Problem | Measured | Fix |
|---|---|---|---|
| 1 | **Clearance lift pops in one frame** mid-shot: `clearEye` runs per frame, so the eye jumps the instant it enters a box | 27 circuits; shanghai turn-mid 53.8 m, madrid lm2 47.4, vegas lm1 40.2, and the signed-off **monza turn-late 17.1 m / monaco turn-late 12.2 m** — the unit test's N=120 sampling hides it (at N=400: 17.3 m vs a 2.3 m average step) | solve ONE lift per shot (sample ~24 points once, cache on the track), hold or ease it; test the vertical step against the lift |
| 2 | Corner eyes land in buildings on OPEN circuits (no fence cap there) | 7 circuits exceed the test's lift < 25: shanghai 53.8, madrid 47.4, vegas 40.2, mexico 37.9, sochi 33.2/27.1, miami 29.2 | before lifting, step \|x\| inward until clear (or the barrier cap everywhere); add these circuits to the test |
| 3 | Landmark eye crosses the track into another tower | vegas lm1 eye 157–170 m on the far side (1.7 × 148 m ≈ 251 m for a tower 75 m from the track) | cap distance at ~`near + 40` m, or measure from the track |
| 4 | Grid sightline leaves the road — grid sits on the final bend | jeddah grid 45.8 m (heading turns 136° from grid−16 to start+40), bahrain crane 13.4, magny_cours 6.9, silverstone 4.4 | aim along the track with a shorter offset / clamp the chord; check jeddah/bahrain grid placement data |
| 5 | Wide shots' look target is not the centroid (= item 0.5) | all 52 | clamp only eyes |
| 6 | `yR`/`distR` sliders are mostly dead | yR pinned at 190 m on 46/52, distR at 850 m on 23; Monaco yR only live in 0.09–0.32 of 0–1.5 | show metres, or limit slider range per circuit |
| 7 | Corner role lands on a chicane or a kink | mont_tremblant first (S-bend, the only side disagreement), montreal late, jeddah late (17°), sochi first (21°), buenos_aires mid (21°) | skip role corners turning < ~35° over ±40 m |
| 8 | Landmark shortfalls | kyalami, mosport: 1 landmark (8 m) → landmark2 repeats; 5 circuits have 2; buenos_aires lm2 is the start gantry 0 m from the track | drop gantries / anything < 5 m from the track; swap landmark2 for another shot when < 2 |
| 9 | Street fence cap drifts on bends between endpoints | baku turn-first reaches lat 9.9 vs cap 8.4 (and lifts 16 m); no eye lands over another road anywhere | also cap at the interpolated arc, or accept |
| 10 | Endpoints authored inside solid props | 10 cases (monaco late+20, hockenheim/istanbul/indianapolis mid, sochi, jacarepagua, jerez, mont_tremblant) | same as 2/3 |

Code bugs: `posePoint`'s no-landmark fallback makes look poses start+20 m while
the eye is start+12 m → camera looks straight up (not hit today; fall back to
`centre`); `FlybySeq.reset()` is never called; `bake-flyby.mjs` `render()`
deletes the rationale comments inside `DEFAULT` on every bake; editor `CORNER_NS`
gaps and a misleading "HEIGHT" label on centre/landmark `y`. Caches all live on
the track object (none outlive a rebuild); `s` wrap is correct; no NaN anywhere.

### §0.3 Authoring tools — bugs found and fixed (local, unverified in a browser)

| Bug | Fix |
|---|---|
| `flyby.mjs`: fixed port 3491 (two runs clash); hand-rolled server crashes on a malformed URL, `startsWith(ROOT)` lets `f1-game-x` through, serves `.git`; no shutdown on Ctrl-C/error | shared harness server on a free port, clean shutdown (`49aa35f`) |
| a wrong `--track` waits 180 s; `--backend` unvalidated | args validated before boot; exit 2 = usage/boot (`49aa35f`) |
| `eval` fallback with `process` in scope (tool and bake); the editor's `// THIS LIST WILL NOT BAKE` header hid the `FlybyShots` name | empty `vm` context with a 1 s timeout; warning lines skipped (`d6cbd0d`) |
| INSIDE flagged by `inside` alone — Bahrain's grandstand box over the straight was a false failure (tool and editor status line) | the unit test's on-road rule; lift ≥ 25 m is a warning (`49aa35f`, `1e25c0a`) |
| `__apex.flybyCam(u)` previewed DEFAULT, not the list a race flies; `lift` computed but never returned | defaults to the flown list; returns `lift`, `onRoad`, `lat` (`2ffc5fe`) |
| saved lists unversioned — a pre-rework list plays from the wrong side | stored as `{v: 2, shots}`; older ones ignored and logged, not deleted (`1e25c0a`) |
| `loadSaved()` returned the store's cached object, shared with the flown list | returns a copy (`1e25c0a`) |

Also added: `--track a,b,c` in one browser session, `<track>-flyby.json` beside
the sheet. Remaining: validators check only `at` (not numeric fields, corner
`n`, landmark `rank`); corner picker lacks 7, 9, 11, 13, 15, 17; the duration
slider's max of 0.6 can't hold a normalised one-shot list; two validator copies (a
test keeps them in agreement); record the DEFAULT hash a saved list was edited
from so the player can be told it went stale; tests for the new `flybyCam`
fields, `onRoadPose`'s shape, and a saved list through `flyby-shots`.

### §0.1 Root cause (measured by CPU simulation against Monza's real road triangles)

The road's `polygonOffset(-8, -16)` is SLOPE-scaled: it pulls each road fragment
toward the camera by 8 px worth of the road's own screen-space depth gradient.
Any car pixel within ~8 px of its ground contact loses the depth test against
the road behind it, so a car under ~8 px tall vanishes and nearer ones look
sunk. In world terms, at 45 m with a 1.5 m eye the road jumps ~15.6 m toward the
camera; a 0.95 m car is 14.6 px tall at 45 m and 6.6 px (gone) at 100 m. Near
and far planes cancel, so gameplay and the cine lens behave the same; a smaller
render buffer (headless, dynamic resolution) makes it worse.

- NOT direction-dependent: looking back from +2…+45 m hides 44–56 of 66 car
  sample points, looking forward from behind the last row hides 44/66. The
  earlier "from behind it renders" view was a camera INSIDE the grid, where the
  near cars are tall on screen. Racing chase cams hide distant cars too.
- GLX (`glx.js` draw + `chunked.js` drawChunked) and TLX (`tsl-lit.js`) apply
  it; WGX already dropped it for the road (`wgx.js` ~3842, "those bury tyres")
  and pushes terrain away instead.
- `91cbc8f` made it worse: `_startBias [-12,-24]` is an opaque, depth-writing
  mesh under the grid.
- Units-only bias hides 0/66; even factor -1 hides 2–6/66. Any slope factor on a
  surface cars stand on buries them.
- Side finding: the GLX fx decals (`ROAD_BIAS [-4,-8]`: driving line, blob
  shadows, skids) have been losing to the road on GLX; stale comments in
  `tsl-fx.js` and the defect ledger say "GLX draws the road unbiased".
- Separate WGX bug (not patched): `wgx.js` ~1925 maps GL's factor to
  `depthBias` and GL's units to `depthBiasSlopeScale` — swapped.

**Patch `e1ff1a5`**: remove the road bias (all four `_wmRoad*`), terrain gets
`depthBias [2, 4]` (away from camera, still ahead of the floor's `[4, 8]`),
`_startBias` `[-12,-24]` → `[-2,-4]`, TLX fx decal offset `-12/-24` → `-4/-8`,
canary test re-pinned. Risks: terrain crest/prop-base bleed of ~2 px at grazing
angles, verge-edge flicker at range if `[2,4]` is weak, start-line shimmer.

**Verification it still needs** (none done in a browser):
1. `npm run test:tooling-fast`, `node tools/ci/deploy.mjs --gate-only`
2. GLX live (mcp-probe): camera 15/45 m past the line looking back — all 22 cars;
   driving line / blob shadows / skids now visible on GLX; verge edge on Spa
3. TLX gate (`.claude/rules/render-tlx.md`): `gfx-probe --backend three
   --tlx-webgpu --lavapipe montreal` and with `--ls apex26.tlxForceHw=env`, 0 gpuErrors
4. `gpu-census.yml` on `macos-latest`: grid visible from ahead on GLX + both TLX
   legs, no start-line/grid-box z-fight at range, chevrons on all three backends
5. `pick-tests` groups (≤ 2); `ci.yml` with `renderer_macos: true` if a gfx spec moves

Once 0.1 ships, restore a **front-of-grid closing shot** (looking back at the
front row, long lens) — it was authored and removed because of 0.1.

## Phase 1 — the high-value, small batch

All three land mostly in `flyby-seq.js`, ~10 game.js lines total.

### 1.1 End on the player's own car
The last shot settles behind the player's car in the slot the race will start
it from (P12 in free play via `gridUp()`'s splice; the quali order when one
exists). Today `menuGridCars()` seats in team order, so the flyby grid is not
the race grid.

- `menuGridCars()`: seat in race order, record `flybyCtx.playerSlot`; keep the
  RNG snapshot/restore.
- `FlybySeq`: new anchor `{ at: "slot", n: "player" | k }`; `solve(track, u,
  shots, ctx)` takes an optional ctx.
- New closing shot `grid-mine`, forward-facing (see 0.1).
- Test: slot anchor vs `TrackMesh.gridSlot(track, 11)`; the RNG test stays green.
- Check: `quali.results()` is populated before `raceIntro()` in career.

### 1.2 Pick corners by character
Roles `"slowest"`, `"fastest"`, `"lore"` in `cornerS()`, from the `v`/`cls`
fields `TrackMaps.corners()` already carries, and an optional `cornerN` in
`js/data/circuit-lore.js` so the corner the announcer names is the one shown.
`turn-mid` → `lore` (fallback `slowest`), `turn-late` → `fastest`. Add the roles
to the editor's `CORNER_NS`. Test: Monaco `slowest` is the hairpin; all three
reference circuits still pass the inside/fence tests.

### 1.3 A different flyby each load
`FlybySeq.vary(list, seed)`: jitter establishing bearings, sometimes swap
landmark rank, draw corner roles without repeats, sometimes reverse a pan; grid
finale fixed. Seed = hash(track id + per-session load count), **never
`simRnd`**. Only when no saved list. Test: seeds 0–31 × 3 circuits pass
`shotErrors`, containment and continuity. `flyby.mjs --seed`.

Gate for the batch: `npm run test:tooling-fast`, the flyby unit files, sheets
for monza/monaco/bahrain (and one seed sweep sheet).

## Phase 2 — presentation

| # | Item | Plugs in | Effort | Risk / note |
|---|---|---|---|---|
| 2.1 | "Let's go racing" lands on the grid shot | `announcer.js` `speak()` — delay the final part to `budget − duration(last) − 600 ms` | S | speech-rate estimate; `play()` only |
| 2.2 | Camera marker on the card's lap map | `solve()` exports anchor `s`; `TrackMaps.draw(opts.marker)`; redraw on the existing 100 ms timer | S–M | redraw one canvas (node ratchet) |
| 2.3 | Letterbox bars that open at race start | `css/overlays.css` `#loading::before/::after` on `data-phase="run"`, landscape only | S | card overlap at default Y |
| 2.4 | Soft dip at cuts (~150 ms) | `FlybySeq.boundaries()`; `data-dip` from `flyT0` | S–M | off / slower under reduce motion |
| 2.5 | Drone drift + reduce-motion stills | optional per-shot `sway`, `ctx.still` from `motionReduced` | S | keep < continuity limit (4× avg step) |
| 2.6 | Sector reveal on the card map during the wides | `TrackMaps.draw(opts.sectors)` progress-gated | S | distraction |
| 2.7 | Skip hint; shorten to 12 s for habitual skippers | `loading-screen.js` `onSkip`/`run`, `apex26.flySkips`, CSS hint | S | durations are fractions, so shots and announcer follow |

## Phase 3 — larger pieces

| # | Item | Plugs in | Effort | Risk / note |
|---|---|---|---|---|
| 3.1 | Night / wet shot variants | `when: {night, wet}` on shots, `select(list, info)` in `raceIntro()`; closer, lower night shots (lamps are picked near the camera) | M | editor schema + `shotErrors` accept `when`; needs 0.4 |
| 3.2 | A car driving through the corner shots | new `js/<new>/camera/flyby-hero.js` (manifest + gen-shell); one menu car on `TrackLine.at` at `DrivingLine.speedAt`, apex mid-shot | M–L | 550 m car cull is player-relative; PHYSICS.md row; mobile draw cost; ~10 game.js lines |
| 3.3 | Per-circuit signature shots (Monaco tunnel exit, Eau Rouge from below…) | new `js/<new>/data/flyby-overrides.js`, patch by shot id; precedence saved list > override > DEFAULT | M | each override must pass `shotErrors` + containment on its circuit |

## Phase 5 — free camera (design done; pure converter built)

Photo mode is already a free camera (`photo-cam.js`: WASD/R/F, mouse/arrow
look, Shift boost, FOV, touch sticks, hide HUD/panel) but it is reachable only as
the "FREE CAMERA" button inside the Lighting Tuner, and lacks gamepad, roll,
orbit, snaps, bookmarks, export, screenshot and an `__apex` hook.

**Built (local `00c2f4e`, branch `design-freecam`, unit-tested):**
`FlybySeq.poseFromWorld(track, p)` / `shotFromView(track, eye, target, fov)` —
world pose → track-relative flyby pose (corner within 150 m → `corner` with +x
= outside; off-road > 80 m → `landmark` or `centre`; else `start`), with 4
refinement steps against `posePoint` (plain `Tracks.project` missed by 0.8 m at
18 m out in a corner) and a returned round-trip `err`.
Test: `tests/unit/flyby-pose-inverse.test.mjs`.

**MVP (~1 day):** `#pm-freecam` on the pause card's Advanced Visuals → a
`#freecam` dock (new `js/<new>/camera/free-cam.js`, created from `Photomode.create`
so game.js gains no line) around the existing flight; the paused-render gate
gains `photoMode ||`; roll (`camRoll = (dbgCam && dbgCam.roll) || 0`); speed
slider + wheel; snap to car / corner; COPY `__apex.view(...)`; COPY AS FLYBY
POSE; `__apex.freeCam(opts)`; RACE vs FLYBY lens toggle (FLYBY = `cine:true`,
so the copy looks the way the loading screen renders it).
**Phase 2:** bookmarks (`apex26.freecamMarks`, per track, world + relative
pose), orbit (car / apex / landmark), landmark snaps, SEND TO EDITOR.
**Phase 3:** gamepad (needs a "claim the gamepad" flag in `js/input/input.js` —
menu navigation would steal the sticks), pinch FOV, HUD-free screenshot on all
backends (same-task capture; `preserveDrawingBuffer` is off), title/menu use.

Budget is the real constraint: game.js 9089/9090, `apex.js` 3165/3166 (one-line
delegates only), index.html elements 1790 at ceiling (the dock is ~25 — trim or
raise with a reason), CSS classes 567/567 (reuse `.sheet`/`.tune-row`/`pc-*`,
style by id), `G` members ratcheted. Tests: `free-cam.test.mjs` (VM, like
`photomode-hold.test.mjs`); later single specs `camera-hooks`, `menu-keyboard`,
`ui-button-touch`, `camera-tuner`. Merge with 4.1 (photo-mode kit): same engine.

## Phase 4 — cameras and presentation beyond the flyby

Existing: 13 append-only `CAM_MODES` (index persisted as `apex26.camMode`);
`vantage.js` solves any (s, x), not just the player; photo mode already has a
FREE CAMERA but it is buried (Pause → Settings → Display → Advanced Visuals →
LIGHTING TUNER), with no roll, grid or save; no replay (the ghost stores only
the player's best lap); results freeze the last frame; the start lights are
DOM over the player's own camera. Also ratcheted: the `G` façade member count
(267) — hook in by rewriting an existing line, not adding one. Replay/photo
features are solo-only (a pause does not stop netplay's sim).

| # | Item | Player sees | Plugs in | Effort |
|---|---|---|---|---|
| 4.1 | Photo mode kit | PHOTO MODE on the pause card; roll; thirds/golden grid; SAVE PHOTO | `photo-cam.js`; `camRoll = (dbgCam && dbgCam.roll) \|\| 0` (one-token game.js edit); `RendererPicker.saveScreenshot()`; DOM built in JS | S–M |
| 4.2 | TV director camera (new mode `tv`, auto-spectate after retiring/finishing) | cuts between trackside corner cams, heli, TV side and rival onboards, following battles/leader | new `js/<new>/camera/director.js` using `FlybySeq.posePoint`/`clearEye` + `G.camVantage` for rivals, writing `G.dbgCam`; ticked by chaining on `onboard.tick(dt)` | M |
| 4.3 | Instant replay (last 20 s, scrub, 0.25–1×) | REPLAY on the pause card; slow motion lives here | new `js/<new>/camera/replay-buf.js`: 30 Hz Float32 ring (~0.7 MB / 22 cars); restore car fields bit-exactly on exit | L |
| 4.4 | Look presets for photo mode | Clean TV / Film / Noir / Golden / Neon Night / 70s | new `photo-looks.js` over existing tuner knobs via `G.setLightTune`; snapshot/restore, never persisted | S |
| 4.5 | Chequered-flag cam + results orbit | finish-line trackside cut for the 2.2 s window; slow orbit behind the results sheet | keyed on `player.finished`; results early-return gains `&& !ResultsCam.live()`; 30 fps cap, off on mobile/low tier | S/M |
| 4.6 | Start-sequence shots | lights 1–3 on the flyby's grid shots, player cam by light 4 | `FlybySeq.solve(track, u, gridShots)` driven by `lightsLit` (not `countT`) | S |
| 4.7 | More onboards | rear T-cam, front wing, halo, sidepod | append `CAM_MODES`; `vantage.js` branches | S each |
| 4.8 | Camera feel options | shake strength, FOV stretch, cockpit g-force head, horizon-follows-bank | new `cam-feel.js` (CockpitOpts pattern); head motion from acceleration, never curvature | S |
| 4.9 | Time-trial "watch best lap" | ghost's best lap under director cams | `Ghost.at(t)` + director; smooth the 20 Hz trace | M |
| 4.10 | Broadcast graphics | overtake lower-thirds, battle gap bar, fastest-lap banner | new `js/<new>/ui/tv-graphics.js` diffing `G.ranked`; broadcast HUD profile only | M |
| 4.11 | Post-race highlights | 60 s montage of tagged overtakes/incidents | needs 4.3 + event tags | L |
| 4.12 | Per-circuit TV camera sets | real trackside positions for 4.2/4.3 | authored in the flyby editor; stored in `js/data/` (not circuit files — see constraints) | M |

Order: 4.1, 4.4, 4.6, 4.7, 4.8 are independent quick wins; 4.2 is the shared
camera brain for 4.3, 4.5, 4.9, 4.11. Acceptance for 4.3: a before/after
`physState`/field-hash equality test plus a netplay-disabled check. New camera
reads of corners/curvature/line need a broadcast-only `docs/PHYSICS.md` row;
camera code never touches the sim RNG.

## Rejected

- Depth of field — no backend has it.
- True crossfade / whip blur — needs a retained previous frame in GLX, TLX and WGX.
- Ghost-replay laps — only the player's own time-trial best exists; 3.2 covers it.

## Verification ladder (every phase)

1. `node --test tests/unit/flyby-shots.test.mjs tests/unit/flyby-panel.test.mjs tests/unit/loading-card.test.mjs`
2. `npm run test:tooling-fast`
3. `node tools/shot/flyby.mjs --track <id>` sheets: monza, monaco, bahrain (+ the worst three from the fleet audit)
4. Renderer changes only (0.1): the path-scoped rule's checks and `gpu-census.yml`
5. Ship via `node tools/ci/deploy.mjs` (or `--pr`)

## Suggested order

0.1 → 0.2/0.3/0.4 (parallel) → 1.1 + 1.2 + 1.3 → restore front-of-grid shot →
2.1, 2.3, 2.5, 2.7 → 2.2, 2.4, 2.6 → 3.1 → 3.3 → 3.2.
