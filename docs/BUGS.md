# Apex 26 — verified bugs (2026-09-24 hunt)

Findings from a read-of-code + targeted-test architecture pass on tip of
`claude/f1-game-project-26h3ng`. Only defects defended from current source are
listed. Speculative rewrites are out of scope. Historical fixed defects live in
[notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md).

Contributor map: [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md). Module contract:
[ARCHITECTURE.md](ARCHITECTURE.md).

**Severity key:** critical = data loss / unplayable for many; high = common path
broken; medium = wrong outcome on a reachable path; low = cosmetic or rare.

---

## Fixed in this PR

### B1 — Wheel-wizard axis capture survived settings close / resume
**Severity:** high · **Status:** FIXED here

**Where:** `js/ui/key-binds.js` (`disarmAll`), `js/game.js` (`setPaused`)

**What:** `SET UP A WHEEL` calls `Input.beginAxisCapture`. While armed,
`pollGamepad` zeroes throttle/brake/steer every frame. The 2026-09-22 rebind fix
taught `disarmAll` to clear key/pad *button* slots, but not the wizard. Resume
paths (`HUD OFF`, `RECALIBRATE TILT`, and any `setPaused(false)`) hid
`#pmsettings` without calling `closeSettings()`, so an armed pad-capture slot
could also survive.

**Repro (before):** Pause → Settings → CONTROLS → SET UP A WHEEL → Esc/Back or
HUD OFF → resume. Stick/triggers do nothing until CANCEL (or forever if the
button is gone).

**Fix:** `disarmAll` aborts the wizard (`beginAxisCapture(null)`). `setPaused(false)`
calls `closeSettings()` so every resume path disarms.

**Test:** `tests/unit/key-binds.test.mjs` — disarm clears axis capture.

### B2 — Time trial still ran the +5 s track-limits ladder
**Severity:** low · **Status:** FIXED here (was OPEN in defect ledger)

**Where:** `js/game.js` (~4786)

**What:** TT invalidates the lap on the first counted cut (`incidentInvalidLap`),
but the fourth cut still did `penalty += 5` and announced `+5s TRACK LIMITS
PENALTY` in a mode with no race classification.

**Repro (before):** Time Trial → four counted cuts → false +5s banner.

**Fix:** Gate the ladder on `!isTimeTrial()`.

**Test:** `tests/unit/tt-lap-validity-vm.test.mjs` — fourth cut leaves `penalty` at 0.

---

## Open (verified, not fixed here)

### B3 — Lobby READY is not host-relayed (3–4 player guest UI lies)
**Severity:** medium · **Confidence:** high

**Where:** `js/net/lobby.js` READY handler (~443) vs HELLO relay (~426)

**What:** HELLO is relayed with `from` / `rank` so guests learn each other.
READY updates `_ready` keyed only by the direct connection `id`. On a guest that
is always the host peer, other guests' READY never arrives — their row stays
"choosing". Host START still works (`peersReady` on the host is correct).

**Repro:** Host + 2 guests; guest B taps READY; guest A's row for B stays
"choosing".

**Fix direction:** Mirror HELLO — host relays `{ ready, from }`; guests key
`_ready` by `from || id`.

### B4 — Championship points / FL / countback for cars that never finished
**Severity:** medium · **Confidence:** high (behavior); medium (design intent)

**Where:** `js/career/season-cal.js` `award()` (~317); feed `js/game.js` `endRace`
(`order = fin.concat(run, out)`)

**What:** `award()` zeros only `c.retired`. Still-running cars in `run` receive
table points, finishes histogram entries, and can take the fastest-lap bonus.
Reachable when the hard time cap ends a race (`raceT > 360 * lapsTarget`) or
when humans finish and the 2.2 s end delay cuts off backmarkers far from the line.

**Fix direction:** Require `c.finished` (or an explicit classified flag) for
points, finishes countback, and FL eligibility. Keep retirements at 0. Confirm
product intent for time-cap classification before changing standings.

### B5 — Cross-tab + quota can overwrite a newer mirror-only save
**Severity:** high · **Confidence:** medium-high

**Where:** `js/core/store.js` IDB flush (~275)

**What:** Single-tab boot/re-save of a quota-refused key was fixed (2026-09-22,
`lsOk`). Cross-tab remains: a failed `setItem` does not fire `storage`, so Tab B
never invalidates. Tab B's later successful save can queue `lsOk:true` with the
old value and replace Tab A's newer `lsOk:false` IDB row — the only durable copy
of the new save.

**Repro:** Two tabs; fill quota; save career in A (disk fails, mirror has V2);
act/save in B still on V1 → mirror becomes V1.

**Fix direction:** Refuse replacing `lsOk:false` with older `lsOk:true`; or stamp
generations / `BroadcastChannel` so peers learn about mirror-only writes.

### B6 — AI launch / tyre-class / mistake hashes omit race + season dimensions
**Severity:** medium (launch/tyre) / low–medium (mistakes) · **Confidence:** high

**Where:** `js/game.js` launch plan (~2174); mistake roll (~4899);
`js/race/weather-arc.js` `planFor` (~84)

**What:** Reliability and qualifying luck mix year via `Career.seasonSeed()` and
include round. Launch/`phaseRoll`/`tyreClass` hash only `simSeed + slot + skill`.
Mistake rolls key `simSeed + gridPos + lap + corner` with no round/season.
Changeable weather in career hashes session `simSeed` / `raceRound`, not
`seasonSeed()`. Stable grids replay the same launch/compound and corner mistakes
every race (and across career years while `simSeed` stays default).

**Fix direction:** Include championship draw round and, in career,
`Career.seasonSeed()` — same contract as `armReliability`.

### B7 — Settings import: `steerMode` (and peers) lack `oneOf`
**Severity:** medium · **Confidence:** high (malicious / hand-edited file)

**Where:** `js/ui/settings-export.js` SPEC; `js/game.js` / `js/input/input.js`
steer mode writers

**What:** `difficulty` is allowlisted; `steerMode` is not. `Input.setSteerMode`
coerces unknowns to `"tilt"`, but game.js can keep the raw string for HUD /
touch / calib, so UI and Input disagree after LOAD SETTINGS with
`"steerMode":"nope"`.

**Fix direction:** Add `oneOf: ["tilt","buttons","touch"]` (and peers such as
`hudProfile` / `drivingLine`); validate in game.js `setSteerMode` too.

### B8 — Garage `customLogo` import accepts any string
**Severity:** low · **Confidence:** medium

**Where:** `js/ui/settings-export.js`; sink `js/car/liverytex.js` (`img.src = src`)

**What:** Liveries/parts are shape-checked; `customLogo` only requires
`typeof === "string"`. No `data:image/...` prefix or size cap → storage abuse
via a huge or non-image data URL. XSS via `<img>` is unlikely.

**Fix direction:** Require `^data:image/(png|jpeg|webp);base64,` and a max length
matching the upload canvas path.

---

## Scenery / track build (2026-09-24 audit)

Pipeline for contributors: [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md).
Helper catalogue: [SCENERY-API.md](SCENERY-API.md).

Code-verified against tip; measurements in
`artifacts/scenery-audit-measurements.log`. Prefer OPEN items still true in
current code. `scenery(api)` surface is frozen at **112 members** by
`tests/unit/scenery-api-contract.test.mjs` (keys + size + sorted; wrapped
reverse/source defs keep the same keys; `api.K` wraps negative fracs into
`[0,n)`).

### S1 — `along()` + wrapped helpers double-apply `_sceneryShift`
**Severity:** high · **Status:** OPEN · **Confidence:** high

**Where:** `js/track/tracks.js` `transformSceneryApi` (~404–407 wraps `along`
via `sceneryRange`; ~366–371 wraps `anchor`/`tree`/`place`/… via `sceneryNode`);
`js/track/scenery/structures.js` `along` (~76) hands the callback engine-frame
`k`.

**What:** On a shifted circuit the wrapper remaps the authored `(s0,s1)` into
engine space, then the callback's wrapped helper remaps that engine `k` again.
Measured mid-span displacement: **imola 1817 m** (`k` 414 vs 986, shift 0.509);
**spa 277 m** (`k` 37 vs 1689, shift 0.957). Live circuit call sites that mix
`along` with wrapped helpers: imola (`anchor`), monaco (`anchor`), qatar
(`floodMast`/`building`/`place`/`billboard`), shanghai (`anchor`/`place`),
silverstone + spa (`bakedModel`). Engine-internal `ctx.along` + local emitters
(e.g. `wall`, `forestEdge`) are single-shifted and fine.

**Repro:** Probe in `def.scenery`: `anchor(K(mid),…)` vs first `along(s0,s1,…)`
callback `anchor(k,…)` on imola/spa; compare world XZ.

**Fix direction:** Hand the callback authored-frame `k`, or skip RK inside
`along`'s span; until then place with a manual `K(…)` loop (skill
`scenery-dress/references/rules.md` §Frames).

### S2 — `furniture.tree: "pine"` silently becomes broadleaf
**Severity:** medium · **Status:** OPEN · **Confidence:** high

**Where:** `js/track/tracks.js` `plantTree` SPECIES (~1911–1927); five defs
(`anderstorp`, `fuji`, `mont_tremblant`, `okayama`, `zolder`); parked in
`tests/unit/circuit-vocab.test.mjs` `KNOWN_UNHANDLED`.

**What:** `"pine"` is not in `SPECIES` / the `palm`/`fir` aliases, so
`plantTree` falls through to `"broad"` → `tree()` (rounded broadleaf). The five
defs still author `furniture.tree: "pine"`. (`forestEdge` still emits real
`pine()` meshes via its own `pineFrac` — that path does not read
`furniture.tree`, so prop-kind tallies mix the two.) Correct species is
`"fir"`, but `canopyR("fir")` is ~half of `canopyR("broad")` at h=12; a prior
fir swap grew prop interpenetration on all five (ledger 2026-09-22).

**Fix direction:** Align `canopyR("fir")` with `conifer()` mesh extent, then
retarget the five defs; do not register `"pine"` in SPECIES without a pine
branch (would keep broadleaf mesh with fir clearance).

### S3 — Fifteen circuits still ship a large `_sceneryShift`
**Severity:** medium (trap / frame debt) · **Status:** OPEN · **Confidence:** high

**Where:** `js/track/tracks.js` `buildCenterline` (~39–44); consumers
`transformSceneryApi`, `dress`, `HKSHIFT`, `bakedModel` path.

**What:** After the 2026-09-22/23 `sceneryStartFrac` campaign, **15** circuits
still build with `|shift| > 0.01` (spa 0.96 … shanghai 0.09), including several
with `sceneryStartFrac: 0` and a moved `startFrac` (jerez/zolder/brands_hatch).
Not itself a placement bug when dressing matches the authored frame — it keeps
S1 live and makes raw-frac / double-wrap mistakes land ~½–1 lap away.

**Fix direction:** Continue per-circuit frame audits (ledger pattern); do not
drop `sceneryStartFrac` without a probe (estoril lesson).

### S4 — `pits.js` `sweep()` geometry is invisible to primitive audits
**Severity:** medium · **Status:** OPEN · **Confidence:** high

**Where:** `js/track/scenery/pits.js` `sweep` (~242–264) pushes `out.pos` /
`out.idx` directly; QA plan workstream B item 7 (~180 spots / 45 circuits).

**What:** Pit wall / cap / outer wall never go through `TrackGeom.emit`, so
clip/coplanar/float attribution cannot name them. The 1.07 m props-over-road
reading on four circuits was this cap (ledger); sampling was fixed, recording
was not.

**Fix direction:** Route sweep through `TrackGeom.emit` (or an equivalent
recorded path).

### S5 — Props flush on terrain / ground fill coplanar fights
**Severity:** medium · **Status:** OPEN · **Confidence:** high (counts from QA)

**Where:** universal ground slab `js/track/tracks.js` (~983);
`modelGroup` / pit model seats; `docs/notes/SCENERY-QA-PLAN.md` item 2
(2,811 pairs / 1,063 spots / 48 circuits).

**What:** Terrain has no depth bias; large ground slabs and patch tops sit on
the same plane as the ribbon. Audit `FIGHT_MAX` 150 m also drops fights that
remain visible under chase near/far (`coplanar-audit.cjs`).

**Fix direction:** Seat ground slabs ≥2 cm off terrain or give a decal bias;
raise fight window + MIN_SEP in a baseline campaign.

### S6 — Props-over-road blind to solids spanning the whole band
**Severity:** medium · **Status:** OPEN · **Confidence:** high

**Where:** ledger / QA plan after suzuka crossover pillar fix; method samples
faces in `[TOL, CEIL]`.

**What:** A solid whose footprint covers road and whose y-span covers the whole
sample band has no qualifying face — props-over-road never flags it. Suzuka's
RAW pillar was fixed by an `onTrack` skip; the audit gap remains.

**Fix direction:** Flag footprint ∩ road sample with y-overlap of
`[road+TOL, road+CEIL]`.

### S7 — Overlapping `waterBand` slabs
**Severity:** low–medium · **Status:** OPEN · **Confidence:** high (QA counts)

**Where:** `js/track/tracks.js` `waterEmit` / `waterBand` (~1251 / 1275);
QA plan: 114 spots, 5 circuits.

**Fix direction:** Merge adjacent runs or bias water draw; baseline after.

### S8 — `SceneryThemes.variants` tables have zero readers
**Severity:** low · **Status:** OPEN (debt) · **Confidence:** high

**Where:** `js/track/scenery/themes.js` (~16–44); ledger “catalogued dead
exports”.

**What:** `variants.roof|facade|tower` merge into resolved themes but no
`js/track/scenery/*` consumer reads them. Kits use palette/budgets/spacing.

**Fix direction:** Delete or wire into landmark/circuit kits — owner call.

### S9 — Skill doc claimed `bakedModel` never places on shifted circuits
**Severity:** low (docs) · **Status:** FIXED this PR · **Confidence:** high

**Where:** `.claude/skills/scenery-dress/references/rules.md` §Frames;
code `tracks.js` ~385–386 + `tests/unit/scenery-guards.test.mjs`.

**What:** Dedicated `(id,k,side)` wrapper remaps k/side correctly. The old
“ID remapped as node” bug is FIXED. Skill text now points at the live
**`along()` double-shift** trap (S1) instead — including when `bakedModel` is
called *inside* `along()` (spa/silverstone).
### S10 — `bakedModel` road guard + pack-visible node VM (ledger “OPEN” half)
**Severity:** — · **Status:** FIXED · **Confidence:** high

**Where:** `bakedModel` `rejBox` (`tracks.js` ~2088–2120);
`tools/lib/pack-assets.cjs` installed by `track-build-vm.cjs` (~73–76).

**What:** Monza industrial building over the racing line is guarded. Node
audits now see the pack (QA batch corrected the “14 overhang / pack-blind”
ledger claim as a method artifact). Remaining OPEN pieces are S6 (band-spanning
solids) and intentional overhangs, not the missing guard/harness.

---

## Deliberately not listed as defects

- Race-mode cut laps still set `c.best` / FL with +5 s pricing — product ladder,
  recorded in the defect ledger as a balance decision.
- Pit-lane lap setting FL — matches real F1; rejected as a defect.
- Prior 2026-09-22 FIXED batches (ARMED resend, LEFT relay, pose `presentedAt`,
  store boot `lsOk`, red-flag restart, finisher coast, lexical `window.X`) —
  re-checked against the tree; still fixed.

## How this file relates to the ledger

`docs/notes/DEFECT-LEDGER.md` is the long chronological register. This file is
the **current credible shortlist** from the 2026-09-24 architecture/bug-hunt
pass: fixed items B1–B2 and S9–S10; open B3–B8 and scenery/track S1–S8. Prefer
linking here from PRs; promote lasting open items into the ledger when a
campaign owns them.
