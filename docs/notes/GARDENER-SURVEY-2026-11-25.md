# Gardener survey: a ranked structure-cleanup plan for js/, 2026-11-25

Kind: survey · Re-measure-by: 2027-01-15

Asked by Bryce through the orchestrator (session `session_017Yzwxzch8ixiVZuLUxQGt6`, 2026-11-25 ~02:15Z):
"it's actually more like a hunter but it doesn't focus on bugs or improvements or optimizations, it focuses on
cleaning up code, making things clearer, cleaner, decoupling, structure etc". At ~02:17Z he added: "The gardener can
also use the lsp mcp/tools heavily." Read-only run. No `js/` edits, no browser.

Base: `d0d1c21d` (`origin/claude/f1-game-project-26h3ng`). How it was made:
- six `code-hunter` agents, one per slice: `js/game.js`; `js/ui/`; `js/input/` + `js/net/`;
  `js/race/` + `js/career/` + `js/physics/`; `js/render/` + `js/car/` + `js/garage/` + `js/camera/`;
  `js/agent/` + `js/perf/` + `js/data/` + `js/audio/` + `js/lighting/` + `js/core/`;
- one `prior-art-scout`, and one `finding-verifier` pass on the cited rows;
- apex-lsp (`lsp_symbols`, `lsp_references --files`, `lsp_outline`) for fan-in;
- a façade census of `types/game-ctx.d.ts` against `js/` (in `scratch/`, not committed);
- `tools/check/extract-module.mjs` for free-name counts.

The fan-in figures are lower bounds wherever a module destructures `const {…} = G`: the generated
`artifacts/gctx/usage.ts` does not lift those. Every "1 module" figure below was re-checked by text.

**Not re-reported (known):**
- [G-FACADE-REVIEW-2026-11-20.md](G-FACADE-REVIEW-2026-11-20.md), decision **E-then-A**. A is one domain at a
  time, only where a lane already works there. Items 2–4 below are A-shaped, so they need that lane.
- DEFECT-LEDGER §8: the TUNE_DEFS hand-mirrors (still live: glx.js has ~22 `T && T.x != null ? T.x : literal`
  reads) and M4 `clamp`/`lerp` (done).
- The `updateCar()`/`render()` fence (ARCHITECTURE.md §Extraction lessons).
- #6388 `G.setupCam`.

**Verification.** A `finding-verifier` pass re-read 15 of the cited claims on `d0d1c21d`. 13 were confirmed; 2
were corrected in place (item 1's lap-formatter count, and item 3's `setLightTune`). Rows the verifier did not
re-read are marked PLAUSIBLE by their hunter: items 6 (hold-core), 9, 11 (Compounds) and the next tier. Re-read
those with `finding-verifier` before the carve.

## What keeps pushing the ratchets up

`game.js` lines, codeLines, gMembers and topLets, `hud.js`, `apex.js`, `agentview.js`, `car3d.js`, `glx.js`,
`lobby.js` and `tracks.js` all sit at **slack 0** (`ratchets.mjs --json`). CEILING-HISTORY's raisers in the last
three weeks were all features landing inside `game.js`:
- #5953 makeCars seatPlayer;
- #6003 desktop tiers;
- #5793 the TIME TRIAL end path;
- #5951 setCinema;
- #5971 a G bind line.

Two of today's open PRs carry `ratchet-raise`: #6375 and #6419.

Three structural causes:
1. **game.js is still where a new feature's glue goes**, because the state it needs lives in its closure. 97 of
   the 304 `GameCtx` rows have exactly one consumer module. 36 of those 97 exist only for `js/agent/apex.js`.
   A feature that needs one more flag adds a `let`, a G pair and a `.d.ts` row.
2. **input.js has no ratchet at all.** 2,974 lines; `tests/data/ratchets.json` has no `files` entry for it. Its
   last 15 commits are PR merges, each adding guard state to one closure. Paired-phone fence, pad takeover,
   key ownership and the Pause yield all landed there.
3. **Copies instead of helpers.** The tree has:
   - 5 lap-formatter copies beside `Dom.fmtLap`, 5 gap formatters, 6 `wrapS` and ~111 inline `((x % L) + L) % L` shapes;
   - 325 raw `localStorage.*Item` calls in 68 files;
   - 4 arm-then-confirm machines and 6 SKIP builds.

   Each new site copies the nearest one, and the copies drift.

**Bugs this structure caused today.** `docs/notes/MERGED-REVIEW-2026-11-25.md` (PR #6422, not yet merged)
lists six rows:
- Rows 2, 3, 5 and 6 are interactions of shared closure state in `js/input/input.js` and
  `js/input/phone-pad-page.js`: remote fence × invalidate, HOLD latch × releaseControls, `localDriveEngaged`
  reading raw keys, `remoteDriveEngaged` missing `remoteDriveReady`.
- Row 4 (`pit-lane.js` `held()` vs `onClosedLane`) is one concept answered by two predicates.
- Row 1 is two owners of the photo FOV (`game.js` render vs `setup-camera.js`).

Items 5–6 and 3 target exactly those shapes.

## The plan (ranked by payoff ÷ risk, quiet-queue order)

Each item says:
- **What / where**;
- **Hurts**: why it hurts, and today's bugs if any;
- **Shape**: the target shape;
- **PRs**: small behaviour-preserving PRs, one carve each;
- **Pin first**: the characterization tests to land before the move;
- **Frees**: the ratchet lines and bytes it would free;
- **Risk**;
- **Collides**: the open PRs that touch the same files. Skip those files until they land.

### 1. One home for lap time, gap and lap-wrap formatting

- **What / where:** `Dom.fmtLap` `js/ui/dom.js:39` is the most general lap formatter. `lsp_symbols fmtLap` lists
  6 more names. The verifier read the bodies: **5 are independent copies** of the round-then-split logic:
  - `data/real-race-script.js:412`;
  - `editor/designer.js:108`;
  - `input/phone-pad-codec.js:159`;
  - `race/real-replay.js:249`;
  - `perf/metrics-panel.js:344` (`fmtTime`).

  `data/results.js:27` already delegates to `Dom.fmtLap`. The copies carry their own "never 1:60.000" comments.
  - `fmtGap` ×5 names: `hud-readouts.js:54`, `hud-relative.js:72`, `replay-broadcast.js:168`, `results.js:38`,
    `real-race-script.js:417`. Their bodies and signatures differ: one rule spelled several ways, not one copy.
    `hud-relative.js:73` delegates to `HudReadouts.fmtGap` when it exists.
  - `wrapS` ×6 with 3 signatures: `(s)` `game.js:1019`; `(track, s)` `extra-rigs.js:31`, `flyby-seq.js:239`,
    `trackside.js:22`; `(L, s)` `line.js:640`; `(s, L)` `editor/insight.js:34`. Plus `_vWrapS` `vantage.js:33`
    and ~111 inline positive-modulo shapes, 12+ of them in `js/race/`.

  `M4` has `wrapDelta` but no positive wrap.
- **Hurts:** a carry fix (the 1:60.000 class) has to be made up to 6 times. Gap sign, "+" and decimals can differ
  between HUD, replay and results. A `wrapS(s, L)` passed where `(L, s)` is expected is silent.
- **Shape:**
  - `M4.wrap(x, L)` next to `M4.wrapDelta` in `js/core/mat4.js`;
  - `Dom.fmtLap(t, empty, digits)` as the one lap formatter, moved to `js/core/` if `data/*` loads before
    `ui/dom.js` (check `tools/manifest.cjs`);
  - one `fmtGap(sec, {profile, empty})` beside `HudReadouts.gapDecimals`.

  `game.js:1012` `fmtTime` stays as the 2-decimal HUD variant, renamed to say so.
- **PRs:**
  1. `M4.wrap` plus the `js/race/` inline sites.
  2. The camera/editor `wrapS` copies become aliases.
  3. The lap formatter.
  4. The gap formatter.

  Each is one carve.
- **Pin first:** a unit table per helper.
  - Lap: 119.9996, 69.9996, 59.123 (Dom prints `59.123`, the copies may print `0:59.123`; record that before
    unifying), `null`, 0.
  - Gap: the HUD profiles.
  - Wrap: −0.1, `L`, `2L+ε`.
- **Frees:** ~100 lines across js/, nothing in game.js.
- **Risk:** low (pure functions).
- **Collides:** none. #6403 touches `free-cam.js`/`vantage.js`, so leave `_vWrapS` until it lands.

### 2. Photo-mode state off G, into photo-cam.js

- **What / where:** `js/game.js:765-775` declares 7 state cells for another module: `_photoPrevScale`,
  `photoKeys`, `photoMove`, `photoLook`, `photoMouse`, `photoAlt`, `photoVertT`. Their accessors are at
  `:3324-3330`. `game.js` never reads them. `lsp_references G.photoKeys --files`: 27 refs in 2 files (`.d.ts` +
  `js/camera/photo-cam.js`). Tests: `photomode-hold`, `photo-kit`, `free-cam` and the `ui-button-touch` spec.
- **Hurts:** this is G-FACADE-REVIEW cost C3, "modules park private state on G": 7 members, 7 `.d.ts` rows and
  3 top-level lets for state with one owner.
- **Shape:** module-private state inside `PhotoCam.create(G)`. `G.photoMouse` survives only if a spec reads it;
  `ui-button-touch.spec.js` does, so expose it as `PhotoCam.state()` for the spec instead.
- **PRs:** one. Move the cells, re-point the test fakes, then `ratchets.mjs --update --lower-only`.
- **Pin first:** `photomode-hold.test.mjs` and `photo-kit.test.mjs` already drive these through fake G. Land one
  assertion that photo mode's key/mouse state resets on exit, before the move.
- **Frees:** ~10 game.js lines, ~7 gMembers, ~3 topLets.
- **Risk:** low.
- **Collides:** #6403 (`game.js`, `free-cam.js`, `photo-studio-ui.js`) and #6427 (`photo-studio-ui.js`). Wait
  for both.

### 3. One light-tune store member and one GFX latch owner

- **What / where:**
  - `js/game.js:6717-6736`: five wrappers (`ltKey`, `applyLightTune`, `persistLightTune`, `copyLightTune`,
    `restoreLightTune`) only forward to `ltStore`. A sixth, `setLightTune` (`:6724-6730`), builds a
    `LightTuneEdit.set` ctx over game.js's `_perChunkOff`/`_envProbeOff`, which is the latch below. The comment's
    reason ("call sites here read unchanged") is stale. `G._ltStore` (`:3329`) is a raw pipe beside them. Fan-in by
    `lsp_references --files`: `setLightTune` 3 files, `persistLightTune` 3, `_ltStore` 3, `ltKey` 2.
    `extract-module` 6717-6740 gives **6 free names**, the lowest in the file.
  - The `apex26.envProbeOff` / `apex26.perChunkOff` latch: 41 raw read/write sites in 11 files (game.js,
    loop-health, tuner-panel, light-tune-edit, photo-studio-ui, apex, glx, wgx, tlx, renderer-picker,
    save-schema-registry). No module defines what "held" means.
- **Hurts:** two hops to reach `js/lighting/profiles.js`, and 7 flat G rows for one sub-interface. A latch
  semantics change (#6404-class perf work) has to be made 11 times, and the three `webglcontextlost` handlers each
  carry their own try/catch.
- **Shape:**
  - `G.lightStore` (typed `ReturnType<typeof LightStore.create>`), the same move as #6388's `G.setupCam`;
  - `GfxLatch` (`js/perf/gfx-latch.js`: `isOn/set/clear/both`, non-throwing) read by the three backends and
    game.js.
- **PRs:**
  1. `G.lightStore`.
  2. `GfxLatch` with the sites outside render.
  3. The three backends.
- **Pin first:**
  - `lighting-tuner-reset-weather.test.mjs` and `ui-improve-pass.test.mjs` already pin the store;
  - a new grep guard: no `envProbeOff|perChunkOff` string outside `js/perf/gfx-latch.js` and `save-schema-registry.js`.
- **Frees:** ~14 game.js lines, ~6 gMembers, ~40 lines across the latch sites.
- **Risk:** low for the store, low-med for the latch (context-loss handlers).
- **Collides:** #6371 (`glx.js`, `tlx.js`) and #6424 (`apex.js`). PR 3 waits for #6371.

### 4. The agent surface becomes one `G.agent` member

- **What / where:** 36 GameCtx rows have `js/agent/apex.js` as their only consumer. 18 are setup-camera rows,
  which #6388 folds into `G.setupCam`. The other 18 are `qualiSim`, `armReliability`, `skyViewOverride`,
  `menuPrep`, `recomputePlayerMods`, `aeroDfMult`, `drainFor`, `regenFor`, `otTimeFor`, `pitCrewDrawn`,
  `raceProfile`, `redFlagRestart`, `invalidateFactoryMeshCaches`, `setCautionEnabled`, `setScale`,
  `resetEpisodeOwners`, `saveTeamParts` and `tickUi`. `tickUi` is NOT apex-only: it is also read by
  `select-screen.js` and `audio/engine.js`. Keep it flat.

  Spot checks with `lsp_references --files`: `qualiSim`, `drainFor`, `otTimeFor`, `redFlagRestart`, `setScale`
  and `menuPrep` each show `apex.js` + `.d.ts` only. `apex.js:120-122` destructures ~20 more that the shadow
  misses, e.g. `LONG_GRIP`, which is already `PhysicsConsts.LONG_GRIP`.
- **Hurts:** ~17 debug-only names in a 297-member product namespace. Each costs a G line and a `.d.ts` row, and
  the gMembers ceiling (slack 0) is spent on debug hooks instead of product seams.
- **Shape:** one `G.agent = { qualiSim, drainFor, … }` built in the G literal and typed as its own interface in
  `types/game-ctx.d.ts`. `apex.js` reads `G.agent.*`. `LONG_GRIP` goes to `PhysicsConsts`.
- **PRs:**
  1. Move the 17 members.
  2. Drop the destructured members that have a real home (`LONG_GRIP`, `GAME_LAPS`/`TT_LAPS` if consts).
- **Pin first:**
  - `Object.keys(__apex)` and every hook's arity snapshot (a unit test over the VM build: `apex_eval {vm:true}`
    shape);
  - `game-ctx-surface` parity.
- **Frees:** ~17 gMembers (≈ 0 lines net). This is the item that gives the gMembers ratchet real headroom.
- **Risk:** low-med (hook names must stay stable; `__apex` tests).
- **Collides:** #6388 and #6424 (`apex.js`). Do it after #6388 lands.

  This is Bryce's call under E-then-A, because no product lane works in `apex.js`: `decision:` needed.

### 5. input.js: carve the pad-calibration block

- **What / where:** `js/input/input.js` (2,974 lines, one IIFE) does ~15 jobs. The hunter's job map:
  - tilt 250-600 and remote intake 365-525;
  - key ramp 590-665 and device arbitration 665-770;
  - **pad calibration and shaping 774-1170 (~400 lines)**;
  - `onKey` 1175-1349 and touch steer 1349-1600;
  - pad select 1613-1780 and `pollGamepad` 1782-2018;
  - resolution and `consume*` latches 2018-2260;
  - 25 setters 2325-2440;
  - `init` 2506-2721, `reset` 2721-2820, and a ~150-line export.

  Pad calibration crosses the rest through ~8 names (`padIsWheel`, `padRestOffset`, `padPedalSeen`, `padAxisMap`,
  `axisCaptureCb`, …). `wheelFirst()` is the one back-edge.
- **Hurts:** see "Bugs this structure caused today" above. The wheel and controller-profile fixes (#6290, #6285)
  landed in this block, and there is no ratchet to stop the next one.
- **Shape:** `js/input/pad-calibration.js`, `PadCalibration.create(ctx)` exposing `padStick`, `padPedalAxis`,
  `padAxisShape`, `calibratePad`, `resetControllerProfile`, `beginAxisCapture`, `pollPedalCapture`,
  `pollAxisCapture` and `effectivePadDeadzone`.

  Also fold the duplicated defaults into one `INPUT_DEFAULTS`. Today `PAD_DZ_DEFAULT` 0.05 vs steer-tuning's
  `?? 5`, `TRIGGER_DEADZONE` 0.12 vs `12` ×4, and `store.get("steerExpo", 6)` vs `STEER_DEFAULTS.steerExpo`
  (`input.js:123,1100` vs `steer-tuning.js:388,607,671-674,881,911-912`).
- **PRs:**
  1. Add `js/input/input.js` to `ratchets.json` at its current size (a new ceiling, not a raise).
  2. `INPUT_DEFAULTS`.
  3. The carve, with `--update --lower-only`.
- **Pin first:**
  - the wheel/axis-capture unit tests;
  - a characterization test that feeds a recorded pad sample series through `padStick` and `padPedalAxis` and
    snapshots the output;
  - a defaults-parity test (steer-tuning slider default / 100 == Input default).
- **Frees:** ~380 lines from input.js.
- **Risk:** med.
- **Collides:** #6429, #6410 and #6368 (all edit `input.js`). This is the first item to take once those three
  land.

### 6. input.js and phone-pad: one remote-drive owner and one hold/toggle machine

- **What / where:**
  - The phone-remote intake (`input.js:365-525`) shares One-Euro state (`oePrev`, `oeDPrev`, `oeInit`,
    `tiltSmoothed`) with the local gyro. `oneEuro` (`:254-267`) and `dragFilter` (`:1434-1446`) are the same
    filter body twice.
  - Hold vs toggle is three parallel machines: keys (`keyLookBack`, `throttleIsToggle`), pad
    (`padThrottleToggle`, `padLookBackToggle`) and touch (`throttleLatched`). `phone-pad-page.js:222-330`
    `hold()` is a second copy of `hold-buttons.js` `wireHold`, by its own comment.
  - The gyro attach/permission lifecycle is duplicated: `phone-pad-page.js:160-200` vs `input.js:269-300`.
- **Hurts:** MERGED-REVIEW rows 2, 3, 5 and 6 are all this shape. A fence or release fix reaches one machine and
  not its twin.
- **Shape:**
  - `js/input/one-euro.js` (`OneEuro.create({minCutoff, dCutoff, beta})` with `.step`/`.clear`);
  - `js/input/remote-drive.js` (owns the `rem*` state; exposes `active`, `steers`, `sample` and `clear`);
  - a DOM-free `js/input/hold-core.js` used by `hold-buttons.js`, `phone-pad-page.js` and the three toggle
    machines;
  - `TiltRoll.attach(onRoll)`.
- **PRs:**
  1. `OneEuro` (pure).
  2. `TiltRoll.attach`.
  3. `js/input/remote-drive.js`.
  4. `js/input/hold-core.js`.

  Four PRs. Do not batch them.
- **Pin first:**
  - a OneEuro equivalence test on a sample series;
  - the MERGED-REVIEW rows 2/3/5/6 as regression unit tests (they are the characterization);
  - `phone-pad.test.mjs`.
- **Frees:** ~500 lines from input.js and ~120 from phone-pad-page.
- **Risk:** med-high (bit-identical behaviour on the phone).
- **Collides:** #6429, #6408, #6368 and #6410. Start only after item 5.

### 7. One storage gateway, and dev flags in one registry

- **What / where:** 325 raw `localStorage.get/set/removeItem` calls in 68 files. About 12 files redefine a local
  `store()` accessor: captions, layout-presets, progress-backup, appearance-studio, apex-bridge, pedal-travel,
  career-backup, bench-run, title-warm, xr-opts, … The "GameStore raw lane if present, else localStorage" wrapper
  is written ≥6 times: `apex-bridge.js:251`, `bench-run.js:67,392`, `bench-capture.js:245,344`,
  `phone-recorder.js:195`, `lazy-bundles.js:901`.

  Four persistence styles coexist:
  - `GameStore.store.get/set`;
  - `store.raw*`;
  - `DevFlags.storageGet` (REGISTRY of 8);
  - ad-hoc `query || localStorage`: `renderer-picker.js:284`, `render-rate.js:57`, `loop-health.js:95`,
    `three-inspector.js:29`, `gfx-debug-overlay.js:41-63`, `soundtrack.js:36`.

  Boolean flags are parsed three ways.
- **Hurts:** direct calls bypass the store's quota, tombstone and `_rawOverrides` handling, and an ad-hoc flag is
  invisible to the export, backup and schema paths.
- **Shape:** non-throwing `GameStore.rawGet/rawSet/rawDel` that work before the store is ready. The perf/gfx
  flags move into the `DevFlags` REGISTRY.
- **PRs:**
  1. Add the helpers and a new **shrink-only tree ratchet `rawLocalStorage`** (`tools/check/tree-counts.mjs`,
     `slack: 0`) at today's 325. This needs `config-ok` if the counter lands in tools.
  2. Then one directory per PR (perf/, agent/, ui/ …), each lowering the ratchet.
- **Pin first:** the ratchet itself, plus `save-schema-registry` coverage of every `apex26.*` key read raw.
- **Frees:** ~120 lines, and a falling count.
- **Risk:** med (`lazy-bundles` and renderer boot run before GameStore).
- **Collides:** per directory. #6424 (`perf/`), #6425 (`agent/`, `perf/`) and #6435 (`perf/`, `agent/`).
  `ui/` and `career/` are clear today.

### 8. UI kit: arm-confirm, flash label, and a single Escape route

- **What / where:**
  - Arm-then-confirm, four ways:
    - `G.armConfirm` (`game.js:4240`; results-sheet, setup-sheet, season-ui), with no timeout and no
      double-tap guard;
    - `pause-opts.js:207-240` (`ARM_MIN_MS` 350, `ARM_MAX_MS` 5000, ARIA);
    - `settings-export-body.js:816/860/1135` (own `ARM_MS`, no aria);
    - `tuner-panel.js:146`.
  - Flash-into-label, three timer models: a per-button Map in `settings-export-body.js:813`, `btn._fbT` in
    `flyby-editor.js:602`, and one module timer in `tuner-panel.js:141`. The last re-creates the clobber that
    `settings-export-body.js:811` documents fixing.
  - Escape handled twice: `data-esc-close` plus a private handler in `dock-toolbar.js:131/413`,
    `hud-arrange.js:165/775` and `screen-arranger.js:125/537`. This is the second close path `modal.js:59-69`
    warns against.
- **Hurts:** the double-tap and expiry fix exists only in pause-opts. The two Escape paths are a known
  regression shape.
- **Shape:**
  - `ArmConfirm.create({minMs, maxMs, armedText, aria})` in `js/ui/`, with `G.armConfirm` wrapping it;
  - `Dom.flashLabel(btn, msg, ms)` with WeakMap timers;
  - `data-esc-close` as the only Escape route.
- **PRs:** three, one per helper.
- **Pin first:**
  - double tap within 350 ms fires nothing, on every caller;
  - two buttons flashed at once both restore;
  - a menu-a11y-audit case: Escape on each editor with a layer above.
- **Frees:** ~70 lines and ~1 gMember once `armConfirm` lives in `js/ui`.
- **Risk:** low-med.
- **Collides:** #6427 (`photo-studio-ui.js`, not touched here). Clear.

### 9. One SKIP control and one arrange-editor kit

- **What / where:**
  - SKIP is built ~6 ways:
    - `loading-screen.js:480/699` (whole screen, own `SKIP_GRACE_MS`, 100 ms pad poll);
    - `cooldown-lap.js:174` (`max(var(--tap),44px)`);
    - `parc-ferme.js:168` (`var(--tap,44px)`, `tap*2.5`);
    - `retired-card.js:27` (no tap floor);
    - `garage/arrival.js:814-850` (`data-esc-close`);
    - `index.html:958` `#pm-skip-results`.

    That is three tap-floor formulas, a ghost-tap guard that duplicates TopModal `SHIELD_MS`, and Escape on only
    some of them.
  - Four arrange editors each build the same toolbar, undo ring, nudge, Fine/Coarse and key map: `hud-arrange.js`,
    `dock-toolbar.js`, `title-layout.js` and `screen-arranger.js`. They disagree:
    - the undo cap is 64/50/50/80;
    - Ctrl+Z works in one editor only;
    - ArrowUp is y−1 in hud-arrange but y+1 in dock-toolbar;
    - `hud-arrange` `stepSize` has no clamp, unlike `dock-layout.sizeStep`.
- **Hurts:** each new screen's SKIP copies the nearest one. #6435 is adding another SKIP right now. Arrange-mode
  keys behave differently per screen.
- **Shape:**
  - `SkipButton.mount(host, {id, label, onSkip, escDoor})`, with the loading screen's any-key skip kept as its
    own documented mode;
  - `ArrangeKit.create({bar, cap, onNudge, onUndo})`;
  - one pure `step(v, dir, {step, lo, hi, snap})`.
- **PRs:**
  1. `SkipButton` plus an audit check.
  2. `step()`.
  3. `ArrangeKit`, one editor per PR.
- **Pin first:**
  - a `ui-sheets-audit` row: every `[id$=-skip]` is ≥44 px and has an Esc route;
  - per-editor key → step snapshots, recorded BEFORE unifying (the ArrowUp sign difference is a behaviour, so
    Bryce decides whether to keep it).
- **Frees:** ~200 lines.
- **Risk:** med (bridge actions use the skip ids: `apex-bridge.js:373-375`).
- **Collides:** #6435 (`loading-screen.js`). Take `SkipButton` after #6435 lands and fold its new SKIP in.

### 10. Renderer plumbing triplicated across GLX, TLX and WGX

- **What / where:**
  - `cullInstances`: `glx.js:2230`, `tlx.js:2626`, `wgx.js:5137`. ~120 lines each; only the upload differs, and
    they already drift (`tb` vs `batch`; glx-only `_passBatch`/`_mirFreeze`).
  - Lamp glare maths: `glx.js:2612` `drawGlow`, `tlx.js:6785`, `wgx.js:5439`.
  - Env-probe face save/restore and `ENV_CULL_M = 150`: `glx.js:1557-1615`; tlx 1625/4235/5926; wgx 3964.
  - The soft-present waiter queue is byte-identical in tlx and wgx.
- **Hurts:** three edits per policy change, and `glx.js` sits at slack 0.
- **Shape:** `InstCells.cullPack(batch, planes, opts)` returning `{n, dirty, shadow}`; `GlowLamps.collect`,
  `EnvFace.open/close` and `SoftPresent.create` in `js/render/shared/`. The backends keep only the GPU calls.
- **PRs:** four, smallest first: `SoftPresent`, `EnvFace`, `GlowLamps`, `cullPack`.
- **Pin first:** per-helper unit tests on synthetic batches, plus the existing `_cullPlanes` canary.
- **Frees:** ~400 lines across the three backends, ~130 of them from `glx.js`.
- **Risk:** med (hot path; parity is skill `renderer-debug`'s Parity snapshot).
- **Collides:** #6371 (`glx.js`, `tlx.js`). Wait.

### 11. Race and career: one scoring rule, one compound registry, no forwarding layer

- **What / where:**
  - The "scored" predicate `c.classified != null ? !!c.classified : !c.retired` is copied at `career.js:1259`,
    `experience.js:118` and `season-cal.js:506`. career.js adds `&& !c.dsq`, so the copies already differ.
  - The race points table is selected four ways: `SeasonCal.pointsTable()`, `career.js:1356`
    `payTable(Teams.POINTS,"race",run)`, `experience.objectiveStatus` inline, and `results-sheet.js:352`. The HUD
    objective chip can disagree with `settleRound`.
  - Compound names use ≥4 vocabularies: "inter" / "intermediate" / "full wet" / "wet". Sites:
    `real-race-pace.js:18,170`, `pit-lane.js:1222`, `ai-strategy.js:32,165`, `loading-card.js:79`,
    `announcer.js:284` and `hub.js:35`.
  - `ai-drive.js:1314`: ten one-line `bindStrat(); return AiStrategy.x(...)` wrappers whose only product caller is
    `pit-lane.js`.
- **Hurts:** a scoring-rule change (DNF-classified, DSQ) needs three edits. The objective chip and the payout can
  disagree.
- **Shape:**
  - `SeasonCal.scored(car)` and `SeasonCal.tableFor(mode, scoring, run)`;
  - a `Compounds` table in `js/data/` (id, code, short and long name, class) that the others map from. The physics
    numbers stay where they are;
  - `pit-lane.js` calls `AiStrategy` directly.
- **PRs:** four: scored, tableFor, AiDrive wrappers, Compounds.
- **Pin first:**
  - objective-chip points == `settleRound` points for a shortRun and a classified-DNF car;
  - a key-set test against the compound registry (save and replay keys are load-bearing: never rename a stored
    key).
- **Frees:** ~70 lines.
- **Risk:** low for 1–3, med for Compounds.
- **Collides:** #6426 (`pit-lane.js`): AiDrive wrappers wait. #6375 (`ai-drive.js`) waits too.

### 12. car3d.js: data out, then the cohesive part builders

- **What / where:** `js/car/car3d.js` `buildOne` is one closure over ~245-2873: 2,630 of 2,929 lines, ~56
  two-sided loops. Pure style data (`DEFAULT_STYLE`, `TEAM_STYLE`, `CONCEPT_SCULPT`, `BODY_STYLES`,
  `BODY_STYLE_IDS`, lines 43-165) sits on top. The comments already mark cohesive jobs:
  - suspension 2691-2840;
  - exhaust 1695-1960;
  - cockpit, mirror and wheel 1488-1700;
  - rear fins and scoop 2573-2690.
- **Hurts:** slack 0. Any car-part feature is blocked or forces a raise, and a review has to read a 2,600-line
  function.
- **Shape:**
  - `js/car/car-styles.js` (data);
  - `js/car/car-susp.js`, `js/car/car-exhaust.js` and `js/car/car-cockpit-parts.js` on the existing `CarBodyGeom.create(...)` factory
    pattern (`car3d.js:204`), taking a kit `{out, part, zone, anchors, …}`.
- **PRs:**
  1. The data move (zero logic).
  2. Suspension.
  3. Exhaust.
  4. Cockpit.
- **Pin first:** `node tools/car/parts-ladder.mjs --json` and the fit-audit output as golden snapshots (vertex and
  index counts per part, per team), compared byte-for-byte after each PR.
- **Frees:** ~620 lines from car3d.js.
- **Risk:** med (shared closure vars).
- **Collides:** none open today on `car3d.js`. #6403 and #6419 touch `car-draw.js` only.

### Next tier (measured, not ranked)

- **`js/net/lobby.js`** (2,387 lines, slack 0): seats 1018-1200 → `js/net/lobby-seats.js`, the code exchange 1458-2036
  (check `lobby-codes.js`), and `onConnected` (~280 lines) → a handler table. Also three wake-lock machines
  (`lobby.js:2036-2078`, `phone-pad-page.js:780-815`, `core/wake-lock.js`) that have diverged: only lobby re-arms
  on `visibilitychange`.
- **`js/agent/apex.js`** (2,540, slack 0): continue the `apex-*.js` split (`apex-career`, `apex-perf`,
  `apex-shots`). `obs()` and `physState` (`apex.js:1735`, `:604`) re-derive slip twice.
- **game.js controller blocks:**
  - the quali-sheet controller `9003-9126` (24 free names, ~110 lines) → `QualiFlow.create(G, …)`;
  - `renderLightingPrep` `7018-7279` (~40 names; needs an explicit frame/LT/sky context);
  - menu/flyby `2098-2297` (33 names);
  - `startRaceBody` (150+ names) and `update()` (~110): not candidates.
- **Small dedupes:**
  - `arrToHex`/`hexToArr` (`game.js:4232`) vs `GameStore.rgbToHex/hexToRgb` (2 gMembers);
  - `Teams.LIST.find(t => t.id === id)` at ~15 sites → `Teams.byId`;
  - `photo-studio-ui.js:32-50` re-defines five helpers from `photo-studio.js`, and its export lists 8 unused
    members;
  - ~15 private element factories beside `Dom.el` (418 refs).

## The role: Gardener

**Name.** *Gardener* fits: it prunes, it does not plant. The alternative, *Pruner*, says the same with less
warmth. Keep Gardener.

**Defined around apex-lsp** (Bryce, 02:17Z). Each tool has one job:

| tool | job |
|---|---|
| `lsp_outline` | each module's shape, the map of a file's jobs |
| `lsp_references` / `lsp_callers` `files: true` | fan-in and fan-out, and `G.<member>` use |
| `lsp_symbols` | same-named copies across files: the duplicate finder (it found every `fmtLap`/`fmtGap`/`wrapS` row above in three calls) |
| `lsp_definition body: true` | suspected twins side by side |
| `lsp_hover` | implicit-`any` seams |
| `lsp_diagnostics` | the proposed move type-checks before the floor |

grep is only for text shapes: inline modulo, storage keys, CSS. Every plan item carries its measured numbers
(callers, files, free names).

**When it runs.**
- Quiet queue only: no `deploy:red`, and the open-PR count under the dispatcher's launch threshold.
- One cleanup PR open at a time.
- A survey like this one about monthly. The `Re-measure-by:` line is the reminder.

**Rules.**
1. **Behaviour-preserving.** No feature, no bug fix riding along. A bug found while carving is an issue, not a
   hunk.
2. **Characterization tests first**, in their own commit before the move: the test passes on the old code and
   unchanged on the new.
3. **Ratchets only go down.** Every carve ends `ratchets.mjs --update --lower-only`. A Gardener PR never carries
   `ratchet-raise`. It may ADD a new shrink-only ceiling (items 5 and 7).
4. **No overlap with open feature PRs.** Before starting, `git diff --name-only` every open non-docs PR. Skip a
   file any of them touches until it lands. This is stricter than D-033's parallel-edit rule, on purpose: a
   cleanup that conflicts with a feature costs the feature.
5. **One carve per PR**, with skill `slim-bloat`'s leftover grep (ARCHITECTURE.md §Extraction lessons).
6. **G-façade items follow E-then-A.** A sub-façade move (items 2–4) needs either a lane already in that domain
   or Bryce's `decision:`.

**Where it lives.**
- Skill `dispatcher`: a launch rule, "Gardener: one at a time, quiet queue only, from the top unblocked item of the
  newest `GARDENER-SURVEY-*` note".
- Skill `steward` §Lane: a short Gardener paragraph naming rules 1–6.
- The survey recipe: skill `slim-bloat` (it already owns `code-hunter focus: dead-code`). Add the `lsp_symbols`
  duplicate pass and the open-PR collision check there.

Nothing in this PR edits a skill; that is the follow-up once Bryce picks.

## Collision map used (open non-docs PRs at survey time)

| PR | js/css files |
|---|---|
| #6435 | `js/game.js`, `loading-screen.js`, `apex-bridge.js`, `race-entry-profile.js`, `css/loading.css` |
| #6429 | `input.js`, `phone-pad-page.js` |
| #6427 | `photo-studio-ui.js` |
| #6426 | `pit-lane.js` |
| #6425 | `agentview.js`, `apex-bridge.js`, `soak-run.js`, `session-stub.js` |
| #6424 | `apex.js`, `governor.js`, `render-rate.js` |
| #6419 | `car-draw.js`, `js/game.js`, `setup-camera.js`, `race-entry-profile.js` |
| #6410 | `input.js`, `pad-menu.js`, `learn-door.js` |
| #6408 | `phone-pad-page.js` |
| #6403 | `js/game.js`, `free-cam.js`, `vantage.js`, `car-draw.js`, `visor-optics.js`, `photo-studio-ui.js`, `css/photo-studio.css` |
| #6388 | `js/game.js`, `apex.js`, `prebuild.js`, `setup-sheet.js` |
| #6387 | `css/hud.css` |
| #6375 | `js/game.js`, `ai-drive.js`, `collide.js`, `jump-start-penalty.js` |
| #6371 | `governor.js`, `glx.js`, `tlx.js` |
| #6368 | `js/game.js`, `cam-picker.js`, `mode-switch.js`, `input.js`, `pad-menu.js`, `phone-pad-codec.js`, `phone-pad-page.js` |

Items 1, 8, 11 (scored/tableFor) and 12 are free to start today. Five open PRs touch `js/game.js`, so the
game.js-side moves (items 2–4) wait for them anyway.
