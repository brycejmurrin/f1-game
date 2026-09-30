# Broadcast feel — TV director, instant replay, results highlights

Status: **PLAN** (docs-only first). Workstream owned by the Cloud Agent on
`cursor/broadcast-feel-*`. Ship branch: `claude/f1-game-project-26h3ng`.

A path written `js/<new>/camera/x.js` (or `tests/unit/<new>/x.test.mjs`) is a
PROPOSED file — the real path is the same without `<new>/`, and it does not
exist until that slice lands (same convention as the flyby plan).

Grounded in the flyby plan §§4.2–4.3 / 4.5 / 4.11
([`2026-09-24-flyby-improvements.md`](2026-09-24-flyby-improvements.md)), the
racing-depth register's "Result cards/highlights" row
([`2026-09-15-racing-depth.md`](2026-09-15-racing-depth.md) L51), and the live
code cited below. Sizes are S/M (independently shippable). Do **not** merge;
Bryce's merge worker lands one PR at a time. Sync to ship only on conflict or a
red required check (AGENTS.md §Git branch & deploy / Concurrent PRs).

## Goal

Promote the existing Data Hub / REAL RACE **broadcast brain** into three player-
facing solo presentation features:

1. A live **TV-director camera mode** that cuts like a broadcast during a race
   the player is driving (and auto-spectates after retire / finish).
2. A **20-second instant replay / last-incident scrubber** on the pause card,
   driven by a deterministic in-memory ring buffer of the race just driven.
3. A **chequered-flag results orbit** and a short **highlights** montage over
   the results sheet.

Solo only: pause must not touch netplay sim authority; career settlement must
not double-fire on scrub. Any new `Tracks.curvature()` / racing-line read is
**broadcast-only** and lands a row in `docs/PHYSICS.md` before merge.

## Current state (file / line evidence)

### What already exists

| Piece | Where | What it does today |
|---|---|---|
| AUTO director + timing tower | `js/race/broadcast.js` (342 lines) | Pure helpers `battles`, `nextEvent`, `shotFor`, `pipPick`, `towerAt` (L90–144) and a live `Broadcast.create(G, replay)` that cuts every `SHOT_MIN_S`…`SHOT_MAX_S` wall seconds (L4–16, L262–283). **Only** wired into RealReplay WATCH / HIGHLIGHTS. |
| Real-replay clock + puppets | `js/race/real-replay.js` | Owns OpenF1 traces, reel cuts (`highlightsFor` / `reelFor`, L135–168), follow keys; constructs Broadcast at create time (L205–206). Not a live-race camera. |
| CAM_MODES (append-only) | `js/camera/mode-switch.js` L8–23 | 14 modes (`chase`…`visor`). Index **is** `apex26.camMode` — append, never reorder. WATCH's AUTO is **not** a CAM_MODES entry (L30–37, L127–139): picker injects "AUTO · TV DIRECTOR" only while RealReplay runs. |
| Vantage solver | `js/camera/vantage.js` | `vantage(track, mode, s, x, …)` for any car pose. Curvature channel: **broadcast-only** (`docs/PHYSICS.md` L970). |
| Free / photo cam | `js/camera/free-cam.js`, `photo-cam.js` | Pause-docked fly-cam writing `G.dbgCam`. Pattern to copy for "a camera module that owns dbgCam without bloating game.js". |
| Ghost (best-lap only) | `js/car/ghost.js` | 20 Hz `t/s/x` sample of the **player's** lap (`HZ=20`, L12); `at(t)` binary-search interpolate (L338+). localStorage budget **512 KiB** (`MAX_STORE_BYTES`, L8–11). No multi-car ring, no last-N-seconds buffer. |
| Race insights journal | `js/race/race-insights.js` | Bounded event stream (`event` / `journal`, ≤128 rows, L65–71, L511–537): contact, pit, penalty, practice drills. Pause SESSION REVIEW already surfaces it — good tag source for "last incident" and highlights. |
| Pause sim gate | `js/game.js` ~L8676, `setPaused` ~L9363 | `if (paused && !netPlay.active())` freezes the solo sim; netplay keeps stepping with paused input. Instant replay **must** stay behind the same solo gate. |
| Career settle | `js/game.js` `endRace` ~L3202 / L3313–3326; `Career.settleRound` in `js/career/career.js` L1071+ | Settlement runs once when results open. Scrub/replay restore **must not** re-enter `endRace` / `settleRound`. |
| Results freeze | `js/game.js` `endRace` clears `dbgCam` (L3331); results sheet in `js/ui/results-sheet.js` | No orbit, no chequered cut, no highlights montage. Racing-depth L51 still **Pending**. |
| Tick hook for a director | `js/game.js` L8671 `onboard.tick(dt)` | Flyby plan 4.2: chain the live director here (reads reports / field only, never mutates car forces). |
| Tests already covering Broadcast pure API | `tests/unit/real-replay-vm.test.mjs` L230+ | `battles` / `nextEvent` / tower / PiP / manual hand-off. Live-race director has **no** twin yet. |

### What does **not** exist

- `js/<new>/camera/director.js` (planned).
- `js/<new>/camera/replay-buf.js` (planned; flyby plan called this L, sized **M** here by scoping to pose restore + scrub UI, not a full highlight editor).
- A `tv` (or equivalent) entry in `CAM_MODES`.
- Pause-card REPLAY / scrubber DOM.
- ResultsCam / highlights reel for the race the player just drove.

### Constraints that bind every slice

| Constraint | Source | Consequence |
|---|---|---|
| `js/game.js` at ceiling | `tests/data/ratchets.json` — lines 9909 / codeLines 5282 / gMembers 279 / topLets 159 | Logic in new modules; game.js gets **call sites only**. Extract equal bulk if a hook needs more than a few lines. Prefer rewrite an existing G member line over adding one. |
| Shell / CSS ratchets | shellNodes 2037 (slack 25), cssClasses 610 (slack 5) | Prefer JS-built DOM (FreeCam pattern) and reuse `.sheet` / `.set-row` / existing pause buttons. Count every new static `index.html` node. |
| Ghost localStorage 512 KiB | `ghost.js` L8–11 | Ring buffer is **RAM only** for the live race. Never write replay frames into `apex26.ghost.v1`. Ghost API is a sampling / `at(t)` reference only. |
| Budget ~0.7 MB / 22 cars / 20 s | Measured sketch | 30 Hz × 20 s = 600 frames. 8 Float32/car → 0.40 MB; 10 Float32/car → 0.50 MB. Headroom for a small event-tag parallel array stays under 0.7 MB. |
| Curvature / line | `docs/PHYSICS.md` §Curvature channels; `curvature-channels.test.mjs` | Director / replay cam reads go through `GameCams.vantage` / `FlybySeq` only; new sites need a **broadcast-only** row. No sim RNG draws. |
| Solo / netplay | AGENTS + flyby 4.x + `setPaused` gate | Replay entry, scrub, and time-scale live only when `!netPlay.active()`. Netplay pause already does not stop the world — do not invent a second pause authority. |
| Career double-settle | `endRace` / `settleRound` | Replay mode sets a flag (`replayLive` / similar) that blocks `endRace`, career score, and ghost `finishLap` side-effects. Restoring the live snapshot is bit-exact for the fields we capture. |
| CAM_MODES append-only | `mode-switch.js` L3–6 | New `tv` mode is appended; never reorder. |

## Design

### Shared brain

Keep `Broadcast`'s **pure** helpers as the single cut-policy source. Live
`director.js` and RealReplay's AUTO both call them (extract to a tiny shared
surface if duplication bites — prefer importing the existing `Broadcast.battles`
/ `nextEvent` / `shotFor` exports first; they are already on the frozen module
return at L340).

Live director responsibilities (vs Broadcast-in-WATCH):

- Subject = a live `cars[]` entry (player or rival), not a RealReplay puppet.
- Shot = `CamModes` id via `G.setCamMode(i, { persist: false })` **or** a
  trackside / heli pose written to `G.dbgCam` when the shot needs a fixed
  vantage (FlybySeq `posePoint` / `clearEye` for corner cams — same as flyby 4.2).
- Follow battles from live progress/speed (`Broadcast.battles` shape:
  `{key, prog, speed}`), plus RaceInsights journal kinds for "incident worth a
  cut" (contact / retirement) without OpenF1's future-looking event list.
- Auto-spectate: when `player.finished || player.retired`, force AUTO/TV if the
  player had not locked a manual cam this session (mirror Broadcast `manual()`).

### Instant replay ring

```
ReplayBuf  (js/<new>/camera/replay-buf.js)
  sample(cars, raceT, tags?)   // 30 Hz, solo race only
  window() -> { t0, t1, bytes }
  at(t) -> per-car pose snapshot   // interpolate like Ghost.at
  pushTag(kind, t, car?)           // from RaceInsights.event mirror
  beginScrub / apply / endScrub    // restore live snapshot bit-exactly
```

Captured fields (Float32 per car, proposal — pin in the unit test):
`s, x, yaw(=head), speed, px, py, pz` (+ optional `steer`). Status bits
(retired / finished / pit phase) as a parallel Uint8 lane so restore does not
re-run settlement. **No** localStorage. Cap enforced: `byteLength <= 720*1024`
(0.7 MB) or the buffer drops oldest frames / thins Hz — never grows past budget.

UI: one pause-card button `REPLAY` (JS-injected next to RESUME when
`ReplayBuf.window()` ≥ ~3 s and `!netPlay.active()`). Scrub sheet: timeline,
0.25× / 0.5× / 1×, jump-to-last-tag. Exit restores the paused live field and
leaves `paused === true`.

### Results orbit / highlights

Depends on director + buffer:

- **Chequered cut** (flyby 4.5): for ~2.2 s after `player.finished`, director
  holds a finish-line trackside shot; then a slow orbit behind the results
  sheet (`ResultsCam`), 30 fps cap, off on mobile / low `PerfGov` tier.
- **Highlights** (flyby 4.11, scoped M): 30–60 s montage of tagged buffer
  windows (overtake / contact / pit from journal + battle proximity), cut by
  the same director shot policy. Class-labeled export stays deferred (racing-
  depth L51 partial: capture first, export later).

## Ordered slices

### Slice A — Live TV director (M) — ship first

**PR:** `cursor/broadcast-feel-director-4776` (code) after this plan PR.

**Deliver**

- New `js/<new>/camera/director.js` (`Director.create(G)`), manifest + `gen-shell`.
- Append `{ id: "tv", label: "TV", cut: 0.5 }` to `CAM_MODES`.
- Wire `Director.tick(dt)` next to `onboard.tick` (one call site).
- Auto-spectate on player finish/retire (solo).
- PHYSICS.md row if director adds any curvature/line read beyond vantage.
- `__apex` status hook (`director()` or extend camera status) — document in
  `DEBUG-HOOKS.md` / hooks-documented test.

**Tests / measurements**

| Check | Pass criterion |
|---|---|
| `tests/unit/<new>/director.test.mjs` | Pure: battle pick, min/max dwell, manual lockout, finish→auto; **fails** if cut policy ignores `SHOT_MIN_S`. |
| `tests/unit/curvature-channels.test.mjs` | Still green; new file classified broadcast-only if it reads curvature. |
| `tests/unit/camera-defaults.test.mjs` / mode-switch twin | `tv` is last CAM_MODES entry; saved index still maps. |
| `npm run test:tooling-fast` | Green. |
| Optional single spec | `camera-hooks` or a thin VM: set mode `tv`, step field, `status().shot` changes after max dwell. |
| Measurement | Wall-time between cuts in a 60 s AI-only Monza VM: median in `[SHOT_MIN_S, SHOT_MAX_S]`; zero cuts while manual. Record in PR body. |

**Not in A:** pause REPLAY UI, ring buffer, results orbit, broadcast tower in live race, PiP.

### Slice B — Instant replay ring + pause scrubber (M)

**PR:** `cursor/broadcast-feel-replay-4776`

**Deliver**

- `js/<new>/camera/replay-buf.js` + pause REPLAY UI module (JS-built DOM).
- Sample every live solo race frame (throttled 30 Hz); clear on `startRace` /
  quit.
- Scrub apply/restore; rate 0.25–1×; jump to last RaceInsights tag in window.
- Hard solo gate; career / `endRace` / ghost-finish guards while scrubbing.
- Unit test with **before/after field-hash equality** (flyby 4.3 acceptance).

**Tests / measurements**

| Check | Pass criterion |
|---|---|
| `tests/unit/<new>/replay-buf.test.mjs` | Budget ≤ 0.7 MB at 22 cars / 20 s / 10 floats; wrap drops oldest; `at(t)` interpolates; restore equality on captured fields. |
| Guard test | Entering scrub with a fake `netPlay.active()` is a no-op; scrubbing does not call `Career.settleRound` (spy / counter). |
| Browser (one group max) | Pause → REPLAY → scrub → exit → RESUME continues; name any not-run group in the PR. |
| Measurement | `ReplayBuf.window().bytes` after 20 s on a 22-car grid; PR body before/after (0 → ≤720 KiB). |

**Not in B:** highlights montage, results orbit, writing ghosts, netplay rewind.

### Slice C — Chequered / results orbit + highlights (M)

**PR:** `cursor/broadcast-feel-highlights-4776`

**Deliver**

- Finish-line cut + `ResultsCam` slow orbit (30 fps, mobile/low off).
- Post-race highlights reel from ReplayBuf tags + director cuts (30–60 s).
- Results sheet early-return gains `&& !ResultsCam.live()` (flyby 4.5).

**Tests / measurements**

| Check | Pass criterion |
|---|---|
| Unit | `ResultsCam` start/stop; orbit pose finite; highlights reel length and tag order; disabled on low tier. |
| VM / one browser spec | Finish a short race → orbit visible signal via `__apex` / status; highlights play without re-settling career. |
| Measurement | Peak extra JS heap during highlights; orbit frame time under soft blit (informational). |

**Not in C:** class-labeled export file format (racing-depth leftover), per-circuit TV camera sets (flyby 4.12), broadcast lower-thirds (4.10), time-trial watch-best (4.9).

## Risks

| Risk | Mitigation |
|---|---|
| game.js / G-member ratchet trip | New modules + extract if a hook grows; rewrite an existing façade line. |
| CAM_MODES index breaks saves | Append only; tests pin length and last id. |
| Scrub mutates sim → double career pay | Explicit `scrubbing` flag checked at `endRace` / settle / ghost finish; restore snapshot before clear. |
| Netplay desync if pause/replay touches owned cars | Feature off when `netPlay.active()`; no packet / authority changes. |
| Curvature leak into player path | Only vantage / FlybySeq; physics-contract + curvature-channels tests. |
| Memory on low-end phones | Cap 0.7 MB; disable sampling on lowest PerfGov tier or when `cars.length` huge. |
| Parallel agents touch `mode-switch.js` / pause HTML | Keep diffs minimal; claim paths; sync only when required. |
| Flaky browser camera specs | Prefer unit/VM; one browser group; never loosen tolerances. |

## What this workstream is NOT doing

- Photo-mode kit / look presets (flyby 4.1 / 4.4) — other owners / already partial.
- Start-sequence lights-on-flyby (4.6), more onboard mounts (4.7), cam-feel (4.8).
- Broadcast HUD graphics / lower-thirds (4.10).
- Per-circuit authored TV camera packs (4.12).
- Ghost best-lap "watch" under director (4.9) — later, reuses A+B.
- Changing RealReplay / OpenF1 WATCH behaviour beyond sharing pure cut helpers.
- Raising ratchets, quarantines, timeouts, or skipping tests.
- Merging PRs or force-pushing the deploy branch.

## Verification ladder (every slice)

1. Make **all** source edits, then verify once (AGENTS rule 2).
2. `node tools/ci/pick-tests.mjs` → name groups.
3. `node tools/ci/tooling-fast.mjs --jobs=3` (edit-loop).
4. One browser group via `test-bg.mjs` **or** `remote-group.mjs` on the pushed
   branch when a whole group is needed; else single-spec / unit only.
5. `node tools/ci/deploy.mjs --gate-only` before push.
6. Draft PR → watch CI on exact head → undraft only when full tier is green →
   **do not merge**.

## Final report checklist (end of workstream)

- PR links + head SHAs for plan + A + B + C.
- Shipped vs deferred (table).
- Before/after: cut-interval histogram (A), ring bytes (B), highlights length /
  settle-count (C).
