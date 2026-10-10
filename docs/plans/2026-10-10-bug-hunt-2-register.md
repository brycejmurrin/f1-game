# Bug hunt 2 — register (2026-10-10)

Second pass: 21 read-only Sonnet reviewers, each on a slice the first pass (see
`2026-10-09-bug-hunt-plan.md`) covered thinly. Line numbers are at tip `562a95071`.
**V** = the coordinating session re-read the cited lines and the mechanism holds; **U** = reviewer claim,
not yet re-read (verify before fixing). Nothing here is landed. Rows already in the 2026-10-09 register
are not repeated. Batch letters (A–H) group rows by file ownership so one worker can take a batch.

## Bugs (ranked)

| id | sev | V/U | where | what / fix | batch |
|---|---|---|---|---|---|
| H1 | med | V | `js/track/scenery/structures.js:293-300` | `tyreWall` tecpro/airfence model keys omit `cap` (stackKey) / `tyre` (capKey), so later walls reuse the first wall's body colour (albert_park RED then WHITE; cota, madrid, mexico, miami; 12 circuits use tecpro). Add the missing colour to each key (~3 lines); pin in `scenery-guards`/`track-graph` | A scenery |
| H2 | med | V | `js/render/renderer-boot.js:36,96` + `tools/manifest.cjs:1005-1019` | `ApexXR` is LAZY_XR since 36add2960 but `rendererBoot.start()` (game.js:108) runs before `XrBoot.mountUi` (game.js:9137), so `bootPick()`/`detect()` never run: `apex26.xrCaps` is never written, SETTINGS › VR rows stay hidden, an armed VR mode is inert. Probe `isSessionSupported` in `mountUi` + `XROpts.onCaps`; make `bootPick` reachable (~+10) | B xr/boot |
| H3 | med | V | `js/camera/offsets.js:395-412` | `importPack` legacy branch (`modes = raw`) still calls `importGlobal(null)`/`importComfort(null)`: importing a modes-only snippet wipes the GLOBAL baseline and the COMFORT (accessibility) knobs. Only `importModes` in that branch (~3) | C camera |
| H4 | med | U→V* | `js/camera/offsets.js:479-505` | COPY VALUES block (CameraEdits + `//` comments + JSON + `APXC1.` line) cannot be re-imported: `decodeShare` needs the text to start with `APXC1.` or be bare JSON. Find the `APXC1.` token anywhere (~4) | C camera |
| H5 | med | V | `js/net/lobby.js:1409-1418` | `acceptAnswer()` calls `beginOperation()` before its early returns: an empty/invalid CONNECT tap during invite preparation cancels the host's pending invite. Move the bump below validation like `makeAnswer` | D net |
| H6 | med | U | `js/net/lobby.js:1283-1350,1822-1852` | `host()/join()/inviteAnother()/codeHost()` don't reset `#vs-invite`, QR, answer widgets (only `open()` does): a retry shows the previous attempt's code/QR. Extract `resetSteps()` | D net |
| H7 | med | V | `js/editor/stamps.js:36-43` | `arcFor` chords sit at ~8.02 m, the 0.25 m lattice snap leaves 7.8-7.96 m, and the validator reds `spacing` right after a legal stamp (HAIRPIN R=25: 24/24; 2.1 % of 12,384 splices, reviewer-measured). Use `SPACING + 0.5` like `spiralArc` (~3) | E editor |
| H8 | med | U | `js/editor/designer.js:359-361,1798` | `randomise/designed/moreLikeThis` judge candidates against the previous design's heights/zones/baseHW but commit flat: TRACK OF THE DAY seed differs per player. Clean base (~4) | E editor |
| H9 | low-med | U | `designer.js:344,364,1854,1472` | RANDOMISE/DRAW/USE keep `hwZones/bankZones/bridges`; START FROM keeps `props`. Shared `freshLoop()` helper | E editor |
| H10 | low-med | U | `canvas.js` insert / `designer.js commit` | 201st control point accepted; wrong red text; draft then unrecoverable on reload. Refuse insert at `ptsMax` | E editor |
| H11 | med | U | `js/audio/driving-cues.js:122-135` vs `js/input/steer-tuning.js:619-623,713-719` | `#pm-audiocues` is injected after boot, but the handler and first paint are wired only at boot: the AUDIO DRIVING CUES slider does nothing. Wire inside `ensureSlider` (~+10) | F audio |
| H12 | med | U | `js/audio/spotify.js:227-229` | One transient token-refresh failure demotes remote-mode Spotify to `configured` while the backend stays installed: music silent until CONNECT. Keep `connected` or `removeBackend()` (~4) | F audio |
| H13 | med | U | `js/ui/title-flow.js:39-61` | `#ghost=` hashchange outside a race (results, quali sheet, RACE loading plate, career hub) sets `flow="gp"`, `session="tt"` and opens the picker. Defer unless the title is the live layer | G ui |
| H14 | med | V | `js/race/real-replay.js:409` (+`:217`) → `broadcast.js:196-202` | `c.speed` is now scaled by replay rate (from #1278), which skews `battles()`/PiP/director at every rate ≠ 1×. `bcState.running` passes `c.speed / (run.speed \|\| 1)` (1 line) | H race |
| H15 | med | U | `js/game.js:4892-4902` | Deploy block drains the battery and sets `c.deploying` before `braking` is known; thrust only applies on-throttle: a latched BOOST/AI deploy burns charge under braking/lift. **HELD by Bryce (2026-10-10): not landing — physics baseline.** | held |
| H16 | low-med | U | `js/ui/dock-layout.js:70-88` | Dock translate ignores the dock's own CSS `zoom` (≥ 1): moves zoom× the finger. Divide by `CssZoom.of(el)` (~4) | G ui |
| H17 | low-med | U | `js/ui/hud-layout.js:385-393,442-443` | `clearControls` discards `fit()`'s edge-clamp correction when nudging off a touch button | G ui |
| H18 | low-med | U | `js/ui/appearance-opts.js:126-139` | `themeInkPair` cache key ignores the OS colour scheme: SYSTEM theme stale after an OS flip (~2) | G ui |
| H19 | low | U | `js/race/marshal-panels.js:67-95` | Green panels never show after a red-flag restart (`showing()` arms in `count`, draws only in `race`) | H race |
| H20 | low | U | `js/race/driving-coach.js:378` | `DEEP` lacks `"pitPlan"`: practice RETRY/REWIND doesn't roll back the in-place-mutated plan (1 line) | H race |
| H21 | low | U | `js/race/race-insights.js:167-172,410-416` | BACKMARKERS drill counts a spurious "cleared" when a fast car crosses the half-lap wrap | H race |
| H22 | low | U | `js/audio/stub.js:96-105` | First stub SOUND click while the bundle loads enables sound but never starts music | F audio |
| H23 | low | U | `js/audio/panel.js:709-713` / `tone-model.js:65-66` | BOOST/WHINE slider grid (step .25) can't represent shipped 1.12/.62 | F audio |
| H24 | low | U | `js/core/lazy-bundles.js:282-283` | Boot-time volume restore defaults (SFX 1.0, music .5) differ from the panel's (.2/.6) | F audio |
| H25 | low | U | `js/audio/spotify.js:112-122` | `setMode` flips the mode before `teardown()`, old transport not paused | F audio |
| H26 | low | V | `nature.js:484,504,664,733,785,817`, `city.js:505` | **Landed as H26a**: every refused trunk/tower resets `out._mat`. **H26b (follow-up, not landed)**: noting `tree()` only once the trunk lands removes 19 phantom boxes at Monza's pit straight, and `flyby-shots` "frame report: Monza" then reads the wide shots at 81-82 % lawn (limit 80) — the framing was tuned against the phantoms. Land the note ordering together with a Monza wide-shot reframe (camera lane), never by widening `groundMaxPct`. | A scenery / camera |
| H27 | med? | U (verify live) | `city.js:6,47,220,234`, `graph.js:72,93` | Instanced UNIT_BOX masses lose the per-call material in a real browser (`mat = 0`); verify Baku with the pack ON before touching | A scenery |
| H28 | low | U | `js/camera/free-cam.js:68-84` | Free-cam CORNER ‹ › re-plans a full flyby shot every press (cache miss; up to ~650 ms) — memoise per corner | C camera |
| H29 | low | U | `js/perf/renderer-picker.js:133-163`, `build-client.js`, `bitmap-decode-client.js` | In-race RENDERER confirm not bound to its target; worker spawns bypass the mixed-build guard | B xr/boot |
| H30 | low | U | `js/net/lobby.js` finishStart / sealRoom | catch is silent when the lobby is closed; wake lock dropped during friend quali | D net |
| H31 | low | U | various | `ai-drive.js:966-976` splitStints negative drift; game.js stuck detector raw 7/5 m/s (use `vStd`); pass latch vs defendPull; `replay-buf.js:81`; `editor` REVERSE keeps prop `side`; name/originId outside undo; CARD png truncates share link | backlog |

\* H4 mechanism confirmed in code (decodeShare accepts only a leading `APXC1.` or bare JSON); the full COPY → IMPORT round trip was
reproduced by the reviewer in a vm.

## Perf (ranked by value)

| id | where | what | note |
|---|---|---|---|
| P1 | `tlx.js:1584,1647,1894`, `tlx-shadow.js:303` | instanced/stream attributes still `DynamicDrawUsage` → full re-upload per draw (mirror pass = 2 draws/frame) | render lane (sibling VqGa); needs render-tlx gate + census |
| P2 | `tsl-lit.js:1664-1686` | lamp-bake atlas sampled 3×/fragment even with bake off; wrap in `If(bakeOn)` | render lane |
| P3 | `game.js:967` | `camComfort()` → raw localStorage read + closure ×4-7 per rendered frame | compute once per frame (−5 lines) |
| P4 | `xr-boot.js:211-215` | every Chrome/Edge desktop fetches ~42 KB LAZY_XR at boot | shares H2's probe |
| P5 | `race-radio.js` / `race-facts.js` / `spotter.js` | read-only feed runs every physics step (up to 5×/frame) | accumulate dt, call on `_audioParamStep` (+3 lines game.js) |
| P6 | `collide.js:327-335`, `~654-700` | sweepContacts far-apart reject pays 2 `%` + WeakMap per pair; 4 relax passes run when pass 0 touched nothing | bit-identical; ~5-10 µs/step |
| P7 | `offsets.js:164-168` | CamTune `persist()` writes all 3 stores per slider input | |
| P8 | `experience.js:372-380` | title-screen HomeWorld getBoundingClientRect + pane alloc every frame | |
| P9 | `hud-relative.js fitRows` | forced layout every 100 ms on phones with REL on | |
| P10 | `canvas.js controls()` | O(N²) span scan per redraw | |

## Cleanup (mechanical)

- **Dead code census:** `hunt2-deadcode.md` (scratchpad) — 469 zero-reference exports (426 export-only tokens), top deletions D1-D15
  (~120 lines: `PANEL_STYLE`, 11+10+6 unused `game.js` destructures, `alongAdx`, `PhotoKit.deleteMark`, `DataRealRace.lapEvents`,
  `Broadcast.doneBy`, `CarMesh.getBoostFlame`, `TrackMesh.buildPitGarages`, `CamTune` exports, `triggerHapticsEnabled`, dead locals,
  `tc-edge`/`tc-ink` gradients). CSS and DOM ids: nothing dead.
- **`game.js` structural carve-outs** (ratchet headroom, after the live sessions merge): lightning block −68, light-tune helpers −80,
  announce banner −110, record/sector state −10..−15 + topLets −10, tuning lets topLets −5, ten comment blocks −150 `lines`;
  combined ≈ −300 lines / −170 codeLines / −30 topLets / −23 gMembers (`hunt2-gamejs-structural.md`).
- **Other:** `RaceEntryProfile.beginUi/afterPaint` unused (−35), `CamTune` dead flag (−25), `tyreWall` double/pyramid unused (−12),
  `streetLamp`/`gridshellCanopy`/`underpassPortal` dead (−100), three `Drive*` camera modules → one table (−60), NetLobby/NetSession
  zero-consumer members (−15), 90 `waitForTimeout` sleeps and `terrain-over-road.spec.js` (accepts `gap === null` after a fixed sleep),
  `hud-mirror` quarantine still flaky (30 s give-up in `mirror-pass.js:405`).

## Suggested batches
A scenery (H1, H26, H27 after a live check) · B xr/boot (H2, P4, H29) · C camera (H3, H4, H28, P7) · D net (H5, H6, H30) ·
E editor (H7-H10) · F audio (H11, H12, H22-H25) · G ui (H13, H16-H18, P8, P9) · H race (H14, H19-H21).
H15 and anything touching `physics-characterization*` wait for Bryce. P1/P2 and the `game.js` carves belong to the render and
cleanup lanes respectively.
