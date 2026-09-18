# Bug hunt pass 3 — 2026-09-18

Source-only audit of ship tip `cceb9d615` on
`claude/f1-game-project-26h3ng`, followed by re-checks after PR #148 and PR
#156 landed. The latest re-check uses full deploy tip
`73b1a1f03f5ae749d490edbe65eabfcae6577e99`. This pass did not modify or
deploy product source.

## Executive summary

Five findings survived independent re-verification on the original audited tip:

| Severity | Count |
|---|---:|
| High | 1 |
| Medium | 4 |
| Low | 0 |

All five findings are now fixed. PR #148 fixed finding 1, the High solo
red-flag path. PR #156 fixed findings 2–5: foundation diagnostics now await
their requested race rebuilds, ghost storage has a bounded failure-reporting
write path, custom voice tuning round-trips through settings export, and
spatial-upscale writes report persistence failures. All four Medium fixes are
present on deploy tip `73b1a1f03f5ae749d490edbe65eabfcae6577e99`.

Four source-only re-verifiers checked the candidate ledger by race/pit,
records/storage, async test honesty, and net/UI/persistence. They rejected 16
claim or site checks. The focused existing unit suites for race control, ghosts,
and Daily passed 32/32 on the original tip; that run did not cover provenance,
capacity, or cross-subsystem persistence-health gaps. PR #148 added the
single-source race-control regression case, and PR #156 added the Medium-fix
coverage cited in the re-check below.

## Re-check after #148 and #156 landed

Fetched `origin/claude/f1-game-project-26h3ng` at full tip
`73b1a1f03f5ae749d490edbe65eabfcae6577e99`. PR #148's merge commit and PR
#156's merge commit are both ancestors of that tip. Current status:

| Finding | New-tip verdict | Current evidence |
|---|---|---|
| 1. Solo standing red from one car's mixed debris | **FIXED via #148** | Wall impacts now stamp one source and car impacts stamp both sources (`js/physics/debris-world.js:461-477`); slots retain the source list (`js/physics/debris-world.js:638-642`). `hazards()` initializes `redTotal` to zero and only promotes it after at least two distinct source cars (`js/physics/debris-world.js:958-996`). Race control applies `RED_MIN` to `redTotal`, while the mixed `total` still drives lower cautions (`js/race/race-control.js:187-200`). The unit case pins 17 single-source hazards to Safety Car rather than RED (`tests/unit/race-control.test.mjs:370-382`). |
| 2. Foundation specs inspect the previous race build | **FIXED-ON-TIP via #156** | The affected callbacks now await `window.__apex.race(...)` before reading diagnostics: Bahrain (`tests/specs/bahrain-foundation.spec.js:184-190`), Montreal (`tests/specs/montreal-foundation.spec.js:76-88`), Monaco day/night and prop audit (`tests/specs/monaco-foundation.spec.js:25-29`, `tests/specs/monaco-foundation.spec.js:72-73`, `tests/specs/monaco-foundation.spec.js:179-183`), Madrid (`tests/specs/new-hooks.spec.js:895-901`), and Shanghai (`tests/specs/new-hooks.spec.js:915-917`). Verified at `73b1a1f03f5ae749d490edbe65eabfcae6577e99`. |
| 3. Ghost traces grow without a budget and bypass save health | **FIXED-ON-TIP via #156** | Ghost storage now has a 512 KiB budget, evicts least-recently-used entries, thins an oversized remaining trace, and writes through `GameStore.store.write` so durability failures reach store health (`js/car/ghost.js:9-11`, `js/car/ghost.js:86-121`, `js/car/ghost.js:148-162`). Verified at `73b1a1f03f5ae749d490edbe65eabfcae6577e99`. |
| 4. Settings export drops custom radio-voice tuning | **FIXED-ON-TIP via #156** | The audio export/import `SPEC` now includes `voiceTune` with an effective `{}` default beside `radioVoice` and `volRadio` (`js/ui/settings-export.js:65-67`). Verified at `73b1a1f03f5ae749d490edbe65eabfcae6577e99`. |
| 5. Spatial-upscale persistence failures are swallowed | **FIXED-ON-TIP via #156** | Settings and the dev API now persist through `GameStore.store.rawSet` (`js/ui/scale.js:228-238`, `js/agent/apex.js:1877-1886`), while GLX, TLX, and WGX setters only change renderer state (`js/render/glx/glx.js:930-943`, `js/render/three/tlx.js:840-852`, `js/render/webgpu/wgx.js:2239-2248`). Verified at `73b1a1f03f5ae749d490edbe65eabfcae6577e99`. |

Finding 1's original one-car path is closed. The landed implementation sets
`redTotal = total` once two source cars exist, so furniture can still contribute
to a genuinely multi-car picture; that is a narrower calibration question, not
evidence that the original solo finding survives, and is not promoted here
without a separate reproduction.

## Original confirmed findings

### 1. One car's mixed debris can trigger a solo standing red flag

**Severity: High**

**Post-#148 status: FIXED-ON-TIP at `cd82107d9`; the evidence below describes
the original `cceb9d615` audit.**

**Repro / evidence**

1. Impact provenance reaches `spawnImpact` as `carIdx`, but is used for seeded
   scatter and diagnostics only; live debris slots retain no source-car identity
   (`js/physics/debris-world.js:610-635`).
2. `hazards()` increments one `total` for every settled live shard, disturbed
   cone, and broken panel on the racing surface
   (`js/physics/debris-world.js:948-980`).
3. Race control raises RED solely when that mixed `total` reaches 16
   (`js/race/race-control.js:187-199`), then requests a standing restart after
   the stop/hold procedure (`js/race/race-control.js:157-169`;
   `js/game.js:1946-1949`, `js/game.js:3812`).
4. The multiplayer downgrade to Safety Car is the only provenance-adjacent
   guard. Solo has no distinct-source check.

The existing Monaco reproduction in `docs/notes/DEFECT-LEDGER.md:904-991`
already measured one deliberately wide-running car producing 17 hazards and a
standing restart. The originally audited source still permitted that path.

**Why it matters**

A solo wall scrape can stop and re-grid the whole race. Cones and panels count
toward the most severe flag after one car disturbed them, although the intended
red-flag story is a multi-car blocked track.

**Suggested fix sketch**

Stamp shard hazards with source-car identity. Return a separate red-eligible
count and source set from `DebrisWorld.hazards()`. Require multi-car provenance
and enough qualifying shards (or cap each car's red contribution), while keeping
all furniture in `total` for Yellow/VSC/Safety Car.

**Re-verifier notes**

Confirmed independently across the complete spawn, hazard-query, flag, and
restart chain. No hidden provenance guard existed on the original audited tip.

### 2. Several foundation specs inspect the previous race build

**Severity: Medium (test honesty)**

**Post-#156 status: FIXED-ON-TIP at `73b1a1f03`; the evidence below describes
the original `cceb9d615` audit.**

**Repro / evidence**

`__apex.race()` returns an awaitable thenable around asynchronous `startRace()`
(`js/agent/apex.js:6-20`, `js/agent/apex.js:1285-1301`), and `startRace()` yields
before rebuilding the track (`js/game.js:2522-2526`,
`js/game.js:2548-2551`). The following callbacks discard that thenable and read
diagnostics synchronously in the same `page.evaluate`:

- Bahrain night rebuild: `tests/specs/bahrain-foundation.spec.js:184-189`
- Montreal night rebuild: `tests/specs/montreal-foundation.spec.js:76-81`
- Monaco day and night inspections: `tests/specs/monaco-foundation.spec.js:11-19`,
  `tests/specs/monaco-foundation.spec.js:54-63`
- Monaco prop-over-road audit: `tests/specs/monaco-foundation.spec.js:149-155`
- Madrid night rebuild: `tests/specs/new-hooks.spec.js:893-901`
- Shanghai night rebuild: `tests/specs/new-hooks.spec.js:915-918`

The day/night cases therefore serialize the already-built day session twice.
The Monaco calls can also overlap and overwrite shared requested time-of-day
state before either asynchronous build resumes.

**Why it matters**

Night-only missing scenery, unsafe models, or geometry drift can ship while the
named night assertion stays green. Monaco's foundation and prop audit may
measure the menu or previous build rather than the requested race.

**Suggested fix sketch**

Make each affected `page.evaluate` callback async and
`await window.__apex.race(...)` before reading diagnostics. Update stale comments
that still present polling as the only way to wait for `race()`.

**Re-verifier notes**

Confirmed only for same-callback reads. Fresh-navigation patterns that wait for
a specific track, and callbacks that directly return the thenable, were rejected
as safe.

### 3. Ghost traces grow without a storage budget and bypass save health

**Severity: Medium**

**Post-#156 status: FIXED-ON-TIP at `73b1a1f03`; the evidence below describes
the original `cceb9d615` audit.**

**Repro / evidence**

1. Every circuit/comparable-context pair gets a distinct full trace entry in the
   single `apex26.ghost.v1` object (`js/car/ghost.js:5`,
   `js/car/ghost.js:74-78`, `js/car/ghost.js:134-136`).
2. No total-byte cap, per-track cap, or eviction policy exists in the load/save
   path (`js/car/ghost.js:41-58`, `js/car/ghost.js:108-121`).
3. The whole object is written directly with `localStorage.setItem`
   (`js/car/ghost.js:53-58`). A failed write logs a warning but cannot set
   `GameStore.store.broken`, which is what `__apex.persistState()` reports
   (`js/agent/apex.js:2862-2877`).
4. The ledger still records the shared-quota issue as open
   (`docs/notes/DEFECT-LEDGER.md:1079-1083`).

**Why it matters**

Changing setup, assists, weather, or controls creates more comparable classes,
each eligible for a roughly full-lap trace. Ghosts share localStorage quota with
six career slots and other player data. Once quota is exhausted, a new personal
best can appear saved for the session but disappear on reload while persistence
health remains green.

**Suggested fix sketch**

Add a measured total-byte budget and LRU eviction by circuit/context. Route the
blob through a `GameStore` structured write lane (with compatibility migration)
so quota failure reaches `broken`/`persistState()`.

**Re-verifier notes**

Confirmed as known-open. The previously failing ghost specs were a separate
deferred-read test problem and now poll correctly
(`tests/specs/time-trial.spec.js:52-72`).

### 4. Settings export drops custom radio-voice tuning

**Severity: Medium**

**Post-#156 status: FIXED-ON-TIP at `73b1a1f03`; the evidence below describes
the original `cceb9d615` audit.**

**Repro / evidence**

1. Settings export includes the radio enable and volume rows, but no `voiceTune`
   row (`js/ui/settings-export.js:57-70`).
2. Export and import enumerate only the `SPEC` allowlist
   (`js/ui/settings-export.js:216-239`, `js/ui/settings-export.js:308-329`).
3. The radio panel exposes player-editable voice selectors/sliders
   (`js/audio/panel.js:288-361`), and the radio module persists their combined
   value under `voiceTune` (`js/audio/radio-voice.js:283-290`).

**Why it matters**

A settings file claims to carry preferences and audio tuning, but restoring it
silently resets the player's chosen engineer/race-control voices and pitch/rate
tuning. The adjacent `radioVoice` and `volRadio` settings round-trip correctly,
which makes the omission harder to notice.

**Suggested fix sketch**

Add `voiceTune` to the audio `SPEC` as a JSON preference with the effective
default shape, and add changed/all export-import round-trip coverage.

**Re-verifier notes**

The earlier claim that radio enable and volume were omitted was rejected on the
current tip. The independent pass found the narrower live omission by comparing
the panel's actual writes with the export allowlist.

### 5. Spatial-upscale persistence failures are swallowed by every renderer

**Severity: Medium**

**Post-#156 status: FIXED-ON-TIP at `73b1a1f03`; the evidence below describes
the original `cceb9d615` audit.**

**Repro / evidence**

1. The settings row delegates an upscale change to the active renderer whenever
   that setter exists (`js/ui/scale.js:230-240`, `js/ui/scale.js:285-290`).
2. GLX, TLX, and WGX each call `localStorage.setItem` directly and swallow any
   failure (`js/render/glx/glx.js:937-942`,
   `js/render/three/tlx.js:847-851`,
   `js/render/webgpu/wgx.js:2241-2247`).
3. `GameStore.store.rawSet()` is the equivalent path that records a failed
   write (`js/core/store.js:97-100`), and `__apex.persistState()` reports that
   store health (`js/agent/apex.js:2862-2877`).

**Why it matters**

On blocked or full storage, UPSCALING changes for the current tab but is lost on
reload. The game's persistence diagnostic still says storage is healthy, so the
player and support tooling receive a false answer.

**Suggested fix sketch**

Make renderer setters state-only and persist once through
`GameStore.store.rawSet("spatialUpscale", ...)` at the owning settings/dev-API
boundary. If renderers must remain callable directly, inject one persistence
callback instead of duplicating direct writes.

**Re-verifier notes**

Confirmed on all three backends. The UI fallback already uses `rawSet`, but it
is unreachable in normal builds because every active backend exports the setter.

## Rejected appendix

The following claims were falsified or narrowed out of the main list:

1. **AI double-stack queue is broken — REJECTED.** `boxBusy()` blocks only an
   occupied box; the second car remains lane-limited and can stop if the box
   clears before it passes, otherwise AI retains its armed plan for the next lap
   (`js/race/pit-lane.js:960-976`, `js/race/pit-lane.js:1159-1169`,
   `js/race/pit-lane.js:1223-1238`).
2. **Daily records need day/plan identity — REJECTED as a defect.** Daily's own
   best remains day-keyed (`js/race/daily-challenge.js:71-90`); personal ghosts
   and TT boards intentionally compare effective performance conditions, not
   entry route (`js/race/session-records.js:21-35`;
   `docs/plans/2026-09-14-mechanics-coherence.md:20-21`,
   `docs/plans/2026-09-14-mechanics-coherence.md:32-39`).
3. **Deferred ghost writes can overwrite another context — REJECTED.**
   `scheduleSave()` captures the key and pending callbacks serialize the current
   shared cache, including later switches or clears (`js/car/ghost.js:74-80`,
   `js/car/ghost.js:108-122`, `js/car/ghost.js:188-197`).
4. **Invite fragments remain after consume/cancel — REJECTED.** Successful
   acceptance and teardown consume only `vs`, preserving unrelated URL state
   (`js/net/lobby.js:213-225`, `js/net/lobby.js:1064-1077`,
   `js/net/handshake.js:301-320`).
5. **Host leave ends messaging while play continues — REJECTED.** The current
   copy says rivals become AI, and netplay performs that handoff
   (`js/net/lobby.js:163-186`, `js/net/netplay.js:351-371`,
   `js/net/netplay.js:466-482`).
6. **Packed handshake mode `s` lacks guards — REJECTED.** Inflated size, payload
   object/array shape, key, and packed SDP are guarded
   (`js/net/handshake.js:40-53`, `js/net/handshake.js:92-122`;
   `js/net/sdp.js:208-235`).
7. **`radioVoice` / `volRadio` do not export — REJECTED.** Both rows now exist
   (`js/ui/settings-export.js:57-70`); finding 4 is the narrower `voiceTune`
   omission.
8. **Current HUD/a11y source chain — REJECTED.** No complete current-tip defect
   was established; alert/status roles and dynamic control state are maintained
   (`index.html:446-469`, `js/ui/hud.js:713-732`).
9. **Career saves ignore durability/conflicts — REJECTED.** Career uses
   structured write results, refuses stale cross-tab writes, and surfaces
   `unsaved` (`js/career/career.js:140-194`,
   `js/career/career.js:763-772`).
10. **Input release/disconnect remains latched — REJECTED.** Menu-focused key
    releases clear held controls, and lifecycle resets clear input state
    (`js/input/input.js:897-904`, `js/input/input.js:1996-2004`,
    `js/input/input.js:2114-2136`).
11. **Fresh-page async waits are all false-green — REJECTED at seven checked
    sites.** Bahrain day returns the thenable; Montreal day, Scenery Kits, and
    Abu Dhabi navigate fresh and wait until the race reports a track; the
    `new-hooks` loader returns the thenable. Those paths are safe, although
    directly awaiting `race()` would be clearer
    (`tests/specs/bahrain-foundation.spec.js:8-13`,
    `tests/specs/montreal-foundation.spec.js:8-14`,
    `tests/specs/scenery-kits.spec.js:80-94`,
    `tests/specs/abudhabi-foundation.spec.js:28-38`,
    `tests/specs/new-hooks.spec.js:9-21`).

## Original verification ledger

These verdicts record the original `cceb9d615` audit. The current post-land
verdicts are in the re-check table.

| Candidate | Verdict | Severity |
|---|---|---:|
| Mixed debris has no red-flag provenance | CONFIRMED | High |
| Teammate pit queue loses a stop incorrectly | REJECTED | — |
| Ghost store is uncapped and bypasses save health | CONFIRMED | Medium |
| Daily route/day must be part of comparable TT identity | REJECTED | — |
| Deferred ghost save writes the wrong context | REJECTED | — |
| Same-callback async race diagnostics read stale builds | CONFIRMED | Medium |
| Fresh-navigation track waits are inherently stale | REJECTED | — |
| Invite consume, host leave, packed `s`, radio toggle/volume regressed | REJECTED | — |
| Radio custom voice tuning round-trips | CONFIRMED (it does not) | Medium |
| Spatial upscale reports failed persistence | CONFIRMED (it does not) | Medium |
| Current HUD, career-save, or input chain found | REJECTED | — |

## Re-verification roster

- Race control and pit queue: `bc-f1b9e08d-fade-5a12-821b-2787036ab240`
- Records, Daily, and ghost storage: `bc-fe8c4b16-79e5-5e62-91f8-961b1f4653f9`
- Async test honesty: `bc-e39bcb75-f24f-5230-bf1a-2d92b3528c8e`
- Net, UI, career, input, and persistence: `bc-21631744-aaf2-5a3f-a808-881a4fcf68b3`

All four were read-only and source-based. None ran a browser group or modified
the worktree.

## Local verification

`node --test tests/unit/race-control.test.mjs tests/unit/ghost.test.mjs
tests/unit/daily-challenge.test.mjs` passed 32/32. This proves the existing
machines still satisfy their encoded contracts; it also exposes the coverage
boundary behind findings 1 and 3: race-control tests inject only a scalar hazard
count on the original tip, and ghost tests do not exercise storage budget or
`GameStore` health. PR #148 subsequently added the single-source `redTotal`
regression case cited in the post-land re-check. PR #156 subsequently added
coverage for the four Medium fixes and all are present at `73b1a1f03`.
