# Apex 26 — verified bugs (2026-09-24 hunt)

Findings from a read-of-code + targeted-test architecture pass on tip of
`claude/f1-game-project-26h3ng`. Only defects defended from current source are
listed. Speculative rewrites are out of scope. Historical fixed defects live in
[notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md).

Contributor map: [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md). Module contract:
[ARCHITECTURE.md](ARCHITECTURE.md). Scenery pipeline:
[SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md).

**Severity key:** critical = data loss / unplayable for many; high = common path
broken; medium = wrong outcome on a reachable path; low = cosmetic or rare.

---

## Fixed in this PR

### B1 — Wheel-wizard axis capture survived settings close / resume
**Severity:** high · **Status:** FIXED here

**Where:** `js/ui/key-binds.js` (`disarmAll`), `js/game.js` (`setPaused`)

**What:** `SET UP A WHEEL` calls `Input.beginAxisCapture`. While armed,
`pollGamepad` zeroes throttle/brake/steer every frame. Resume paths hid
`#pmsettings` without calling `closeSettings()`, so an armed pad-capture slot
could survive.

**Fix:** `disarmAll` aborts the wizard (`beginAxisCapture(null)`). `setPaused(false)`
calls `closeSettings()` so every resume path disarms.

**Test:** `tests/unit/key-binds.test.mjs` — disarm clears axis capture.

### B2 — Time trial still ran the +5 s track-limits ladder
**Severity:** low · **Status:** FIXED here

**Where:** `js/game.js`

**What:** TT invalidates the lap on the first counted cut, but the fourth cut
still did `penalty += 5` and announced `+5s TRACK LIMITS PENALTY`.

**Fix:** Gate the ladder on `!isTimeTrial()` (now `!isTimeTrial() && !isQuali()`).

**Test:** `tests/unit/tt-lap-validity-vm.test.mjs` — fourth cut leaves `penalty` at 0.

### B3 — Lobby READY is not host-relayed (3–4 player guest UI lies)
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/net/lobby.js` READY handler

**What:** HELLO was relayed with `from`; READY keyed only by connection `id`. On
a guest that is always the host peer, other guests' READY never arrived.

**Fix:** Host relays `{ ready, from }`; guests key `_ready` by `from || id`
(same pattern as HELLO).

**Test:** `tests/unit/net-lobby-lifecycle.test.mjs` — READY relay + `from` keying.

### B4 — Championship points / FL / countback for cars that never finished
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/career/season-cal.js` `award()`; `js/game.js` `endRace` FL from
`fin` only

**What:** `award()` zeroed only `c.retired`. Still-running cars on a time-cap /
early end took table points, finishes histogram entries, and could take FL.

**Fix:** Require `c.finished && !c.retired` for points, finishes countback, and
FL. `endRace` picks FL among classified finishers only.

**Test:** `tests/unit/season-cal.test.mjs` — unfinished take no points/finishes/FL.

**Correction (2026-09-24):** the `c.finished` half over-reached. `endRace`
ends the session 2.2 s after the last human crosses the line
(`RaceControl.finishDelay`) and classifies every running car by progress, so a
car still on track at the flag is the normal case, not a time-cap corner — from
this fix on, most of the field scored 0 in an ordinary season race while the
results sheet still printed their points. `award()` now classifies every
car by position (`c.classified`, set by `endRace` under the FIA 90 % rule, so a
classified retirement past 90 % of the winner's laps also scores; an
unclassified one does not), and the fastest-lap point no longer requires
`c.finished` either — it needs `classified && !c.retired`, so a car still running at the
flag may take it. The tests assert that instead (`tests/unit/season-cal.test.mjs`).

### B5 — Cross-tab + quota can overwrite a newer mirror-only save
**Severity:** high · **Status:** FIXED here · **Confidence:** medium-high

**Where:** `js/core/store.js` IDB flush

**What:** Tab A's quota-refused (`lsOk:false`) row is the only durable copy of
V2. Tab B, never seeing `storage`, could flush `lsOk:true` with older V1 and
replace it.

**Fix:** Refuse `lsOk:false` → `lsOk:true` when the payloads differ. Same-value
upgrade (boot healed disk) still lands.

**Test:** `tests/unit/store-cross-tab.test.mjs` — older `lsOk:true` refused.

### B6 — Launch / tyre / phase / mistake hashes ignored career season seed
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/game.js` grid arm; `js/race/weather-arc.js`; mistake path

**What:** Reliability used `Career.seasonSeed()` + round; launch/tyreClass/
phaseRoll/mistake hashes used bare `simSeed()` / `raceIndex`.

**Fix:** Career path uses `Career.seasonSeed()` and championship `drawRound`
(same contract as `armReliability`).

### B7 — Settings export lacked oneOf for steer / HUD / driving line
**Severity:** low · **Status:** FIXED here · **Confidence:** high

**Where:** `js/ui/settings-export.js`; `js/game.js` `setSteerMode`

**What:** Unknown strings could be stored; `setSteerMode` now falls back to
`buttons` when the mode is not in `["tilt","buttons","touch"]`.

**Fix:** `oneOf` on `steerMode`, `hudProfile`, `drivingLine`; validate in
`setSteerMode`.

**Test:** `tests/unit/settings-export.test.mjs` — oneOf allowlists.

### B8 — Garage `customLogo` import accepts any string
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/ui/settings-export.js` `garageValue`

**What:** Only type `string` was required; schemes like `javascript:` could land.

**Fix:** Require `^data:image/(png|jpeg|webp);base64,` and length ≤ 400000
(matches upload canvas path).

**Test:** `tests/unit/settings-export.test.mjs` — reject non-image / over-cap.

---

## Scenery / track build

Pipeline: [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md). Helper
catalogue: [SCENERY-API.md](SCENERY-API.md). `scenery(api)` surface frozen at
**114 members** by `tests/unit/scenery-api-contract.test.mjs`.

### S1 — `along()` + wrapped helpers double-apply `_sceneryShift`
**Severity:** high · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/build-props.js` `transformSceneryApi`; `js/track/core/space.js`
`sceneryNodeToAuthored`

**What:** Wrapper remapped `(s0,s1)` into engine space, then callback helpers
remapped engine `k` again. Measured mid-span displacement: imola ~1817 m,
spa ~277 m.

**Fix:** `along` walks the remapped span but hands the callback **authored-frame**
`k` via `sceneryNodeToAuthored`, so wrapped helpers apply `sceneryNode` once.
Engine-internal `ctx.along` (walls/fences) unchanged.

**Test:** `tests/unit/scenery-guards.test.mjs` — imola/spa mid-span vs `K(mid)`
within tens of metres (not kilometres).

### S2 — `furniture.tree: "pine"` silently became broadleaf
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/nature.js` `canopyR`; five circuit defs;
`tests/unit/circuit-vocab.test.mjs`

**What:** `"pine"` was not in `SPECIES`; scatter fell through to broadleaf. A
prior fir retarget grew interpenetration because `canopyR("fir")` was ~half of
broad at h=12.

**Fix:** Inflate `canopyR("fir")` to mesh extent floored near broadleaf keep-out;
retarget anderstorp / fuji / mont_tremblant / okayama / zolder to `"fir"`.
`KNOWN_UNHANDLED` cleared (no fake `"pine"` SPECIES alias).

**Test:** `tests/unit/circuit-vocab.test.mjs` — every `furniture.tree` is a
known species.

### S3 — Large `_sceneryShift` remaining (frame debt)
**Severity:** medium (trap) · **Status:** OPEN (documented) · **Confidence:** high

**Where:** `js/track/tracks.js` `buildCenterline`; consumers
`transformSceneryApi` (build-props.js), dress, `HKSHIFT`, bakedModel path.

**What:** Independent census of racing-forward leftovers with `|shift| > 0.01`:
**13** circuits (not the earlier “15” prose); re-measured 2026-10-10 with `node tools/track/rotate-markings.cjs --check`:
**14**, because bahrain gained the field (`startFrac` 0, `sceneryStartFrac` 0.2250) after the first census. Table:

| id | `_sceneryShift` | notes |
|---|---|---|
| spa | 0.9575 | `sceneryStartFrac` 0.9875 |
| hungaroring | 0.9029 | |
| jerez | 0.8736 | `sceneryStartFrac` 0 (startFrac moved) |
| zolder | 0.8438 | `sceneryStartFrac` 0 |
| vegas | 0.8433 | |
| brands_hatch | 0.8365 | `sceneryStartFrac` 0 |
| qatar | 0.6953 | |
| silverstone | 0.5233 | |
| imola | 0.5094 | |
| mont_tremblant | 0.2834 | `sceneryStartFrac` 0 |
| abudhabi | 0.1015 | |
| donington | 0.0973 | |
| shanghai | 0.0895 | |
| bahrain | 0.2703 | `sceneryStartFrac` 0.2250, `startFrac` 0 (added after the 2026-09-24 census) |

Also still large but outside those 14 (intentional anchors / reverse-source):
monaco 0.938 (`sceneryCoordinates: "source"`, `sceneryStartFrac` 0.28);
singapore 0.530 (`sceneryStartFrac` 0.5075, reverse).

**Not fixed here:** dropping `sceneryStartFrac` without a per-circuit probe is
unsafe (estoril lesson). Prefer frame audits over blanket zeroing. S1 no longer
double-shifts on these; residual shift remains authoring debt.

### S4 — `pits.js` `sweep()` invisible to primitive audits
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/pits.js` `sweep`

**What:** Pit wall/cap/outer wall pushed `out.pos`/`out.idx` directly, so
clip/coplanar/float could not name them.

**Fix:** Record `__blocks` ids on each sweep strip (`pit-wall`,
`pit-wall-cap`, …) so audits can name them. Keep the tip extrusion
winding — routing the mesh through `TrackGeom.emit` coplanar-fought bay
panels (bahrain/istanbul) and left hungaroring entry lamps floating.

### S5 — Coplanar ground slabs vs terrain
**Severity:** medium · **Status:** FIXED (ship tip + here) · **Confidence:** high

**Where:** `js/track/scenery/build-props.js` universal ground / `groundPatch` (`models.js`) / water sheet

**What:** Large ground slabs and patch tops sat on the terrain plane.

**Fix:** Ship tip removed the universal floor slab (`buildFloor` already fills
≥1400 m) and gave `groundPatch` a per-call `MIN_SEP` lift. Here: water sheet
seated 2 cm deeper and `waterOccupied` skips stacked bands (S7). Did **not**
explode `FIGHT_MAX` (no baseline campaign).

### S6 — Props-over-road blind to band-spanning solids
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `tools/track/measure-props-over-road.mjs`;
`tests/specs/props-over-road.spec.js`

**What:** Only faces with interpolated height in `(TOL, CEIL)` counted; a solid
whose y-span covers the whole band had no qualifying face.

**Fix:** Also flag footprint ∩ road when triangle y-span overlaps
`[road+TOL, road+CEIL]`.

### S7 — Overlapping `waterBand` slabs
**Severity:** low–medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/build-props.js` `waterEmit`

**What:** Adjacent/overlapping bands stacked coplanar quads.

**Fix:** `waterOccupied` cell set skips duplicate cells; sheet y biased 2 cm
deeper (pairs with S5).

### S8 — `SceneryThemes.variants` tables unused
**Severity:** low · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/themes.js`

**What:** `variants.roof|facade|tower` merged into themes but no scenery
consumer read them.

**Fix:** Deleted the dead `variants` tables from BASE/THEMES. Kept
`SceneryThemes.variant()` (deterministic picker still used by
`tests/unit/scenery-kits.test.mjs`).

### S9 — Skill doc claimed `bakedModel` never places on shifted circuits
**Severity:** low (docs) · **Status:** FIXED this PR · **Confidence:** high

**Where:** `.claude/skills/scenery-dress/references/rules.md`; code +
`tests/unit/scenery-guards.test.mjs`.

### S10 — `bakedModel` road guard + pack-visible node VM
**Severity:** — · **Status:** FIXED · **Confidence:** high

**Where:** `bakedModel` `rejBox`; `tools/lib/pack-assets.cjs` via
`track-build-vm.cjs`.

---

## Deliberately not listed as defects

- Race-mode cut laps are no longer timed laps: a counted cut sets
  `incidentInvalidLap` in every session (game.js, "A LAP WITH A COUNTED CUT IS
  NOT A TIMED LAP"), so a cut lap cannot be `c.best` or FL; the +5 s ladder
  still prices the classification — product ladder.
- Pit-lane lap setting FL — matches real F1.
- Prior 2026-09-22 FIXED batches — re-checked; still fixed.
- S3 residual `_sceneryShift` — documented above; needs per-circuit probes.

## How this file relates to the ledger

`docs/notes/DEFECT-LEDGER.md` is the long chronological register. This file is
the **current credible shortlist** from the 2026-09-24 architecture/bug-hunt
pass: B1–B8 and S1–S2 / S4–S10 FIXED here; S3 remains OPEN as measured frame
debt. Prefer linking here from PRs; promote lasting open items into the ledger
when a campaign owns them.

## 2026-10-09 bug-hunt backlog (verified, not yet fixed)

From the 2026-10-09 read-only hunt (15 hunters on tip `88f2b21a6`; every row below re-read or reproduced by the parent
session before listing). The full ledger, with the Tier-1 rows and the open-PR verdicts, is the note
`BUG-HUNT-LEDGER-2026-10-09` on branch `cursor/bug-hunt-ledger-88f2` (not on the deploy branch yet). Severity is the
hunt's; line numbers are as of that tip. L9/L12/L13/M36 (tooling) are fixed by the `ci-adapted-guard` PR; M2 and M9, M13-M16
are held by the session that owns them. Rows marked fixed-in-#NNNN are in this session's open PRs; everything else below is **assigned to sibling sessions
2026-10-09**, except the last line, which has no owner yet.

- M19 replay — `clear()` zeroes `prevStatus`, so every retired/finished car re-tags as a fresh event after a timeline discard. `js/camera/replay-buf.js:81` · low
- M20 net — wire `gear` (0-15) unclamped; gear 9-15 makes `rpmFor` NaN for that rival. `js/net/netplay.js:59,396` · low
- M21 net — `EVENT_CRITICAL` omits `quali`/`settings`; a lost QUALI on a backed-up reliable channel wrecks the grid. `js/net/transport.js:454,622` · low
- M24 data hub — switching tabs does not abort the previous tab's OpenF1 requests. `js/data/hub.js:300`, `js/data/telemetry.js:357` · low-med · **fixed in #1284**
- M27 car — daily "standard" class builds the player mesh from SAVED parts under the FACTORY cache key; `visualSetup` is stamped once. `js/game.js:1611,1635`, `js/car/car-draw.js:24-31,915` · low
- M28 car — a custom-emblem image that decodes after CLEAR / a newer upload reinstalls the stale emblem. `js/car/liverytex.js:1148-1160` · low · **fixed in #1284**
- M31 audio — race started with SOUND OFF then on never calls `setVenue`; the panel mid-race path skips `setVoice`. `js/game.js:8875,2809`, `js/audio/panel.js:49` · low
- M32 audio — RivalAudio binds 4 voice slots, the mobile engine has 2; rivals in slots 2-3 swap voices on rank changes. `js/audio/rivals.js:20`, `js/audio/engine.js:106,2125` · low
- M33 AI — mistake/attack zone key `Math.round(c.s + toTurnIn)` is unwrapped; a corner just past S/F rolls the mistake twice. `js/game.js:5397-5399,5479` · low
- M34 AI — `defendPull` compares `chaserSpeed <= speed - 3` with an unscaled 3 m/s (siblings scale by PACE/vTop). `js/physics/ai-drive.js:1399` · low
- M35 race flow — `gridUp` hashes on `raceIndex` before `raceIndex++`, `armReliability` and the AI-mistake hash after it; one-off draws disagree with B6 above. `js/game.js:1979` vs `:2757` · low
- M38 director — after the player retires solo the director forces TV every tick; CAM/C do nothing; `setAutoSpectate` has no caller. `js/camera/director.js:144-172,215` · low
- M39 WGX — `backendState()` returns `lost`, not `ctxLost`, so game.js never sees a WGX device loss. `js/render/webgpu/wgx.js:5722` · low · **fixed in #1281**
- M40 input — stored `steerMode` unvalidated at boot (Input falls back to "tilt", game.js to "buttons"); a `connected===false` pad counts as present. `js/game.js:239`, `js/input/input.js:1598,1913` · low
- M42 player physics — `frontUtil` still normalised by pi/2 after the front peak moved (#1266); toggled BOOST drains while braking; manual RECOVER has no pit-lane guard. `js/physics/player-forces.js:260,273`, `js/game.js:4839-4848,4349` · low
- M37 (presets part) lighting — shared `*|day|*` stamps exist only for dry/wet, so rain/overcast/fog fall through to knob defaults (monaco tunnel lampLevel 0.26 vs 0.13; dawn/rain lampLevel on 47+ circuits). `js/lighting/presets.js:205,223` · low · **unassigned**

## 2026-10-10 round-2 backlog (tooling / CI / hooks; not fixed by `ci-page-sources-guard`)

From the round-2 tooling hunt (`15-tooling-ci`, tip `0f8c88843`). F1-F11 are fixed (or narrowed, below) by the
`ci-page-sources-guard` PR; what that PR deliberately left is listed here. It stays off the merge train.

- 15-F1 (narrowed) `PAGE_SOURCES` is a hand list again (core/log.js, track/core/{space,spline,pit,line}.js, physics/**, agent/**
  plus the two race files). The ADAPTED specs boot the WHOLE manifest in the VM, so a derived "files this spec reads" set would
  be the transitive closure of the manifest; a list is the honest cheap answer. A new ADAPTED spec must add its source to the list
  (`tests/unit/pick-unit-slices.test.mjs` pins the current set). `tools/ci/twinned-specs.mjs` still says the Pages gate runs
  vm-page "UNCONDITIONALLY"; it runs it when the `page` slice is picked. Fix the sentence or the gate. · low
- 15-F2 (narrowed) a selected shard now reds when it reached its run step and left no junit with testcases. A shard killed by its
  job cap AFTER `= run passed` but during the junit upload (the run 37493213168 shape) now reads red too instead of infra-retry;
  that is a rerun, by design, but if it recurs the shard should upload its junit from a step that cannot be cancelled by the cap.
  The `selected-started-*` marker adds one tiny artifact per shard. · low
- 15-F6 (residual) `cd X` inside a `( … )` subshell leaks its cwd to later commands in `shellparse.commands`; a worktree path
  containing a space breaks the `read -r C_RUN C_ALL C_GITDIR C_PATHS` split in `bash-guard.sh`. Both fail toward guarding the
  wrong tree, not toward skipping the guard. · low
- 15-F8 (residual) `Bash(curl http://127.0.0.1:*)` still matches `http://127.0.0.1:80@evil.example/` (userinfo form), because the
  permission glob is a prefix match. The push deny-list still only matches a command that STARTS with `git push`
  (`git -C . push origin HEAD:refs/heads/claude/f1-game-project-26h3ng` and a bare `git push` from a checkout whose upstream is the
  ship branch are not denied; only server-side protection, which is `non_admins`, stands in the way). Proposed: deny
  `Bash(git * push *claude/f1-game-project-26h3ng*)` and `Bash(git push)`. · medium, needs Bryce
- 15-F10 (narrowed) `ratchets --base` now blocks a loosened explicit slack and a deleted entry whose file still exists. A NEW entry
  with an inflated ceiling is still only caught by `--check`'s slack rule (the right place), not by `--base`. · low
- 15-F11 (residual) `ready-full-cap` is still check-then-act: two agents running the check in the same minute both see 2/3 and
  both flip. The flip itself should re-check after marking ready (CI Watch owns the flip). · low
- Observation: `tools/ci/spec-timings.mjs` `parseJunit` feeds the time of FAILED testcases into the rolling record and
  `spec-timings.yml` has no `conclusion == 'success'` filter, so a test that timed out at 180 s is billed at 180 s until the
  samples roll off, which can push its spec over the selected-gate budget (a self-reinforcing drop). · low
- Observation: `pages-reuse-verdict.sh` can only reuse a PR run when a merge COMMIT's parent tree equals its tree; merges are
  SQUASH-only, so the reuse path is effectively dead for PR merges (perf only, fails safe). · low
- Observation: `git diff --name-only` is still used by `pick-tests.mjs:420-435`, `verify-change.mjs:83-87`, `change-kind.mjs:25`
  and the sweeps/parts/ship/xr shell filters in ci.yml, so a `git mv` of a circuit file still hides the source side
  from `pick-tests` and the fleet-sweep filter (#1288 converted only the three PR-gate selectors). · low
- Observation: `conflict-cure.mjs` `resolveGenBlocks` understands only HTML `@gen-shell` spans, so an `sw.js`
  `// @gen-shell:sw-optional` conflict still stops the deploy (fail-safe friction); `deploy.mjs` `ratchetOverruns` skips a
  metric missing from one of its three stages, so a metric newly added on one side is not bounded by the "sum of deliberate
  raises" guard; ci.yml's PR concurrency group is `head.ref` only (two forks with one branch name would cancel each other;
  single-owner repo, unreachable today). · low
