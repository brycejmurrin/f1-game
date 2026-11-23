# Bug hunt, 2026-10-10 — six read-only Opus agents on deploy tip 78cb4831be

Bryce asked to "pull deploy and use opus agents to hunt for bugs or improvements", one
agent per area. Each agent read the code at the deploy tip and reported ranked findings
with file:line, a failure scenario, a fix and a test. The reports are summarised here so
the follow-up branches have one place to start; each item keeps the hunter's own
confidence: CONFIRMED (reproduced or arithmetic checked), CODE-TRACED (a real caller
read end to end, not executed), PLAUSIBLE (reading only).

Hunters 3–5 lost Bash partway through (the worktree-isolation hook refused their shell
once this session entered `.claude/worktrees/race-runtime-hunt`), so their items are
reading-only unless marked.

## Status

| area | branch / PR | state |
|---|---|---|
| race runtime (intro, pause, spotter) | `cursor/race-runtime-hunt-7a1d` | fixed, this PR |
| renderer (mirror pass) | — | items 1–2 confirmed, fix pending |
| HUD band allocator | `cursor/hud-band-allocator-5e2c` | agent still running at the time of writing |
| track engine / circuits | — | items 1–3 confirmed, fix pending |
| physics / AI | — | all PLAUSIBLE, needs a VM run per item |
| menus / input / a11y | — | all CODE-TRACED, needs a spec per item |
| persistence / PWA / net | — | stopped by Bryce, not relaunched |

## 1. Race runtime — FIXED in this PR

1. **Intro caps ran on the wall clock while hidden.** The shader warm and the garage
   drive-out advance only on rendered frames (rAF stops in a hidden tab) while
   `awaitIntroWarm`, `studioDone` and the lamp bake capped at 30 s of `performance.now()`.
   START, 30 s in another app during a cold build → "Shader preparation timed out" →
   PREPARATION FAILED. Fix: `introNow()` in game.js, a clock that freezes while hidden;
   every intro cap reads it.
2. **A hidden tab reaching `run()` started the flyby, the announcer and the radio check
   unseen** (speechSynthesis speaks in a hidden tab; iOS synthesis then breaks until
   reload). Fix: `loading-screen.js run()` gives a hidden tab the 700 ms card;
   `Announcer.speak` refuses a new read while hidden.
3. **The pit garage (WORK ON CAR) ran the FULL pause on hidden tab / blur / rotate.**
   `setPaused(true)` stacked the pause card over the garage; QUIT from it left
   `#carsetup` open on the title (RETURN TO RACE charged a dead race and droned the
   engine); RESUME + RETURN TO RACE raced with the wake lock released. Fix: `setPaused`
   leaves the garage's own pause alone on the way in as it already did on the way out;
   `quitToMenu` takes the garage down; `closePitWork` re-holds the lock.
4. **Spotter idle churn**: every physics step with the spotter OFF, in the menu or in the
   pits allocated a fresh state and called `pack.stop("spotter")` (600 steps → 601
   stops). Fix: reset only when the state was in use or a clip was handed to the pack.

Tests: `tests/unit/loading-card.test.mjs` (hidden-tab card, introNow pins),
`tests/unit/pause-silence.test.mjs` (hidden refuses a read), `tests/unit/wake-lock-vm.test.mjs`
(two pit-garage pause tests in the game VM), `tests/unit/voice-pack.test.mjs` (stop count).

## 2. Renderer — `js/render/shared/mirror-pass.js` and friends

1. **CONFIRMED** Mirror quality rung on phones reads `PerfGov.tier()`, which includes
   the preset floor, so a phone on a HIGH preset gets the desktop mirror. Fix: pick the
   rung from `autoTier` with a LOW floor. Test: `{tier:2, autoTier:0, userTier:2,
   mobile:true}` → "lite" in `mirror-pass.test.mjs`.
2. **CONFIRMED** Stale mirror frame on the first look-back after the mirror was off:
   `render()` compares `want !== _shown` but keeps `_lastW`, so the first frame draws
   nothing new. Fix: `if (want) _lastW = 0;` in that block. Test: look-back first frame
   draws.
3. PLAUSIBLE Metrics overlay sorts `frameStats` every frame.
4. PLAUSIBLE The mirror defeats the instanced-batch cache on desktop (two camera passes
   share one cache key).
5. PLAUSIBLE `assets.js` keeps a scratch GL context and readback buffers alive for the
   session.
6. PLAUSIBLE `Q_DWELL` is counted in frames, not ms, so quality dwell scales with fps.

## 3. Track engine and circuit data

Script evidence (before Bash was refused) in the hunter's `inv.cjs`: ids, LIST order,
sectors, turns, lengthKm, pit `sIn`/`sOut`, bank zones, bridges, `sample()` wrap and
AeroZones all sound for 52 circuits.

1. **CONFIRMED (geometry)** Grid slots fall inside corners: `gridSlot` places 24 slots
   over 198 m behind the line but only ±60 m is ever checked. magny_cours slots 5–13 at
   |k| ≤ 0.053 (R ≈ 19 m), silverstone 10–15 at R ≈ 40 m, vegas 5–8 at R ≈ 73 m, jeddah
   already documented as wrong. Fix: re-derive magny_cours `startFrac` (`startline-probe
   --frac`, then `rotate-markings --write`); add a fleet invariant in
   `tests/unit/grid-boxes.test.mjs` (max |k| over the grid span ≤ 0.0035, allowlist).
2. **CONFIRMED** `tools/track/startline-probe.cjs` verdict uses only the mean |k| over
   120 m (max is ignored, grid span never reached) and nothing runs it. Fix: fail on max
   |k| > ~0.008 inside ±40 m plus a grid-span check; wire into tooling-fast.
3. **CONFIRMED (arithmetic)** Two Monaco bank zones land on the wrong corners:
   `js/circuits/monaco.js:94-95` fracs 0.1286 and 0.2961 shift by `_sceneryShift` 0.9380
   onto T1 (Ste Devote) and T4 (Casino) instead of Massenet and Mirabeau. Fix:
   `{ turn: 3 }` / `{ turn: 7 }`; one row in `circuit-corner-anchors.test.mjs`.
4. PLAUSIBLE The paced build's first step (`buildCenterline` incl. `TrackLine.bake`,
   0.5–0.75 s on a phone) cannot be sliced → the garage drive-out freezes on a new
   circuit. Fix: `buildCenterline(def,{line:false})`, yield, then bake.
5. PLAUSIBLE `TrackPit.at` allocates per call in a per-car-per-substep path.
6. CONFIRMED (reading) verify-track's GL stub never exercises the chunked ribbon path
   (`createChunkedMesh` / `freeMesh` / `freeChunkedMesh`), which the game takes at tier < 3.
7. PLAUSIBLE `apex26.propsUnchunked=1` frees props through `freeChunkedMesh`.
8. Improvement: `Tracks.project` allocates its return per call (`real-replay.js:92`).
9. CONFIRMED doc drift: `docs/BUGS.md` S3 lists bahrain `_sceneryShift` 0.2703; the build
   measures 0.2609.

## 4. Physics / AI / timing (all PLAUSIBLE — run each in the VM first)

1. ERS deploy has no gate for the pit limiter, the box or a caution cap: BOOST drains
   0.14–0.26/s at the limiter / in the box; AI deploys to its threshold in the lane and
   under SC/VSC. Fix: `ersHeld = pits.held(c) || cautionV >= 0 || c.pitState === "box"`
   gating both the player drain and `aiWantsBoost`.
2. `collide.js:166` `_onTrafO` returns on `o.finished`, so the AI traffic scan cannot
   see finishers coasting past the line and runs into them.
3. **Decision needed:** full wets in rain brake 1.35× `BRAKE` (slicks in rain brake at the
   dry rate); with wear off every AI has `tread: null` = the full-wet column. Fix would be
   `BRAKE * min(1, gripMult(c))`, contradicting PHYSICS.md §Braking — owner call.
4. `player-forces.js:298` raw m/s yaw-damping thresholds escape the PACE lint; steering
   feel in fast corners changes with OVERALL SPEED. Fix: `vStdNow` (bit-identical at PACE 1).
5. AI `accSm` is never negative (written only in the throttle branch) so tyre-model's
   signed longitudinal term never sees AI braking. Fix: read `c.corridorAccel`.
6. More raw m/s literals (`ai-drive.js:350-351`, `:447`, game.js ~5085).
7. `defendPull` reads the chaser's live `.x` (order-dependent); #1289 fixed the same in
   `AiCorridor`. Fix: `_snapX` first.
8. `AiDrive.strategyTemper` allocates per AI per tick when a stop is near.
9. `resolveCollisions` recomputes wall limits for every car every step.

Sound: curvature never reaches the player (every read is AI-only or assist-gated), NaN
guards at zero speed / reverse, lap and sector timing, one `tyres.update` per car per
step, no `Math.random` in the sim.

## 5. Menus, screens, input, a11y (all CODE-TRACED)

1. Holding Escape resumes the race it just paused and walks out of the Settings stack:
   `modal.js onEscape` never checks `e.repeat`. Fix: `if (e.repeat) { preventDefault;
   stopPropagation; return; }`.
2. Focus falls to `<body>` after closing a dialog opened from the title: `sync` runs
   `el.close()` before `syncMenuIsolation()` while `#overlay` is still `inert`.
3. A gamepad can barely move UI SIZE / HUD SIZE / BUTTON SIZE (step 0.25 → 400 presses).
   Fix: `max(step, (max-min)/40)` in `padNavKey`.
4. Escape in the circuit search box closes the whole picker instead of clearing it.
5. Pad Left/Right wraps the LAPS row (3 → FULL); `_srLive.wrap === false` is ignored.
6. `scroll-fade.js` never repaints on `<details>` toggle.
7. RACE IN PORTRAIT (`apex26.portraitOk`) can never be undone: not in the settings-export
   registry, no row clears it.
8. Team picker: `autofocus` on CLOSE; focus drops to `<body>` after a pick.
9. (low) `aria-valuetext` updates a tick after the input event.
10. (low) Holding F on a circuit tile toggles its favourite repeatedly.

Sound: layers ranking, settings back stack, pause menu focus return, `scale.js`,
`setting-row.js`, `hud-elements.js`, `title-fx.js`, race-settings presets and `rsReturn`.

## How to continue

One lane-scoped branch per area (AGENTS.md §Concurrent PRs: `js/car/*` → Cars,
scenery → Tracks, `js/game.js` needs `who-is-on-it --claim`). Verify each cited line on
the current tip first — the hunters read 78cb4831be — then fix CONFIRMED items with the
named test, and run PLAUSIBLE items in the VM (`node tools/shot/apex-eval.mjs <track>
"<expr>" --vm`) before touching code. Physics item 3 waits on Bryce.
