# OVERNIGHT QUEUE — 2026-11-25 (final: planner draft + critic fixes + 10:45Z grants)

As of 10:50Z (02:50 PT; Z − 8 = Pacific). Bryce is back about 15:00Z (07:00 PT). Deploy tip `930c54b2` (#6522 merge).
Sources: the 9 slice scopes in `scratch/scope/`, the critic pass, the live PR list (10:45Z) and Board #1780 (the 10:40Z
grants and the 10:41Z #6572 update). Files are under `js/` unless they start with `css/ tests/ tools/ docs/ .claude/ .github/`
or are root files. Waves are gated by queue health and file order, not by the clock.

**Live state, 10:45Z**
- **ready+land 13** (7 ride train #6580: #6466 #6514 #6527 #6531 #6532 #6535 #6538, CI green; outside it #6589 #6578 #6572
  #6568 #6564 #6525). #6579 has Bryce's re-tick (10:50Z) and land, for the next train. After the train: about 7.
- **Drafts 5:** #6592 (6569-A1a), #6591 (two trains, Bryce re-ticked 10:45Z on 7421a3df), #6590, #6586, #6539.
- **Merged since the scopes ran:** #6562 #6567 #6561 #6541 #6549 #6566 #6530 #6436 #6574 #6431 #6522 #6537.
- **#6572 is A** (Bryce, about 10:43Z: ×1.0 parity), so it is a merge, not a decision; its worker is fixing its own reds.
  #6564 has 3 reds of its own (GRID-default fixtures).
- **Live workers 11 of 12** (10:53Z), so one launch fits now. Not counted: parked owners (#6525 vdTf, #6539 yvA5, hooks
  yA1W), the 3 report-only watchers (y2jC, zd9A, wgGs) and Bryce's link session wgT2.

## 1. Summary

| READY | BLOCKED | NEEDS-BRYCE | COVERED | DONE | STALE | duplicate ids merged |
|---|---|---|---|---|---|---|
| 100 | 101 | 103 | 27 | 8 | 8 | 51 |

- Distinct units after the dedupe map and the critic's changes:
  - Status moves: 6573-snap BLOCKED (on #6572's merge); 6516-P1 READY; COVERED: 6569-A1a/A2/A5/A6/A7 and 6557-P2/P2b/P2c/P7
    (yiEjP1k1NXZoyBCCM), HUDFIT-PROBE and 6536-land-thin (#6589).
  - Splits: 6544-U8a/b, 6478-U23a/b, 6461-U30a/b. New: bryce-profile-switch, 6582-U4..U10, 6484-6b, #6456-10.
- **Waves:** 0-13 plus 8b (#6582).
- **Launches:** 114 rows in §2. 106 open PRs: 53 single, 27 batch, 21 chain and 5 rows of 2-5 singles each. The other 8 are
  2 research, 3 acts and 3 messages.
- **Expected reach by 15:00Z:** about 16-20 launches (≤ 6/h, 12-live cap). Browser: 6573-snap plus wave-1 rows 1-10, of
  which about 5-6 merge (a slot turns over in about 2.2 h). Fast: the 6 draft-only rows, 6552-hB and 6557-P5a. Research: 2.
  Not before morning: ready stops, waves 4, 5 and 10 (picks), most of 2-3 and 9-13 (slots), and 8b (#6586 first).

## 2. Waves

**Launch header (every child):** `create_session` with `environment_id: env_01T3kL7W7688bnn8RpTx8GsY`,
`permission_mode: auto`, `tags: ["apex-orchestrator-2026-11-24"]`. One PR per worker; the prompt opens with the brief line
and ends "load skill steward §Lane". Briefs carry the `tests/groups.json` exception (insert at the sorted position, sync on
conflict; exempt from the same-files rule). "UI SIZE 70 / BUTTON 143" in any brief now reads "Bryce's newest
settings-live-export (11-25: UI SIZE shipped, BUTTON 130, contrast high; portrait in appearanceShapes.park)". Physics: notch 17.

**Rules (each :19 FULL and :49 LIGHT cycle)**
1. **Gate 0:** live workers < 12. Launches per hour ≈ merged last hour + (12 − ready+land)/2, at most about 6 (≈4 browser,
   2 fast). Archive the worker of every merged PR in the same cycle.
2. **Fix workers, both lanes:** launch only while ready+land < 10. A *draft-only* fast row launches now but STOPS AT draft
   while ready+land ≥ 10 and flips ready only below 10. These lift drafts from 5 toward 8-14: 6556-U1+U0, 6547-S1, 6484-4a
   and 6563-R1a now; 6545-P1 and 6559-S1 once #6564 merges. Research and acts launch any time.
3. **Browser lane** (js/, css/, index.html, sw.js, tests/specs). At most 6 open PRs; fill one freed slot per merge with the
   first launchable row in table order. A row is launchable when every "after" in its row has merged and no open PR shares
   its files (§2 Chains). Never skip a launchable row for a later one.
4. **Ready stops:** hold at most 2 browser PRs at a ready stop overnight. While 2 are held, a ready-stop row is not
   launchable. A row that stops at land with an emulation check runs `apex_ui_fit`/`apex_hud_mock` at the 11-25 profile in
   the PR and lands on green (Bryce's rule: UI and layout by emulation; the phone is only for GPU, Safari or touch).
5. **Fast fillers** (wave 13 F) launch only when no F row in waves 2-12 is launchable.
6. **Gardener lane:** one Gardener PR open across all plans; it opens when #6539 lands. Only items with Bryce's own pick
   (a `ready` click or a `decision:` comment) or named in the #6495 D1-D8 relay; one carve per PR; ready+land ≤ 10, green tip.
7. **Config:** protected paths build to ready, alone, and wait for Bryce's own `config-ok`. Routine config (tools/ci,
   tools/mcp, package.json, a new workflow): the orchestrator adds `config-ok` once draft CI is green. `ratchet-raise` for
   eagerScripts +1 (6545-P7, then P2, one at a time) and for tree pin rows is the orchestrator's tap (D2(a), D-042).
8. **Batches:** before a batch row launches, file one batch issue (≤ 3 same-area items, each linked to its source row).
9. **Grant-2 picks** are listed at the end of §3; log each as "orchestrator pick under Bryce's 10:45Z grant".

Key: kind 1 = single PR, b = batch PR, ch = chain (one PR at a time), R = research (issue or comment only), A = act,
M = message. Lane B = browser, F = fast, G = gardener. Stop: land, ready (morning window) or ready-tap (Bryce's `config-ok`).

| W | start when | id | kind | lane | files | brief → stop |
|---|---|---|---|---|---|---|
| 0 | now | ACT-house | A | – | – | Post the twinned-spec cost on #6552. Close the §6 list. File the wave-1 batch issues, #6459 rows 6/7/9 and 8, #6461 row 6a, a #6504 PR 2/3 tracker and #6577 A/B. Remove #6516's stale `needs-decision` if an agent set it. Check that the #6572 A pick and the Monza numbers are on #6572 |
| 0 | now | ACT-3117 | A | – | – | #3117 F4: read the next ~5 tip CI runs; close it if slow/page-a max ≤ ~360 s |
| 0 | now | ACT-6536 | A | – | – | `cancel_workflow_run` on phone-shots 43097279571 and 43098589151 only; stop at the first refusal. Run deletes and the 11-11 zombies go to morning M15 (the hook denial is final; MCP has no delete-run) |
| 0 | now | MSG-survey | M | – | – | To xoTjU4NPLbS6wqpUs: add #5783 L1, #5775 R9, #5901 13b/A9/A30 and #6588, seeded from appearanceShapes.park in settings-live-export-2026-11-25.json. One fix issue per clip, or "not reproduced". Replaces HUDFIT-PROBE |
| 0 | after #6592 | MSG-trims | M | – | – | To yiEjP1k1NXZoyBCCM, CONTINUE one PR at a time: A2(+R5b, owns the vm-filename "two walks") → A6 → A7 → R4a → 6557-P2 → P2b/P2c → P7 (after #6579) → A5 (after A2 and 6556-U2, no ratchets.mjs) |
| 0 | #6466 merges | MSG-hooks | M | – | – | To yA1W9dp6SqaTdGRWz: add #6458-2 and the #6544 bash-guard row (6544-U14) to its #6469 PR. This is the one 4-item protected exception. Never .claude/settings.json (#5318) → ready-tap |
| 0 | live < 12 | 4270-VERIFY | R | – | – | Finding-verifier table for #4270 §5/§7; one issue per confirmed row |
| 0 | live < 12 | 6557-P4a | R | – | – | Delta between the over-road browser specs and their node twins, posted on #6557 (feeds M13) |
| 0 | #6590 merges | bryce-profile-switch | 1 | F | tools/lib/bryce-phone.mjs, tests/unit/phone-tools*.test.mjs | `live` profile → the 11-25 export. Every emulation, HUD and UI row waits on it → land |
| 1 | #6572 merges | 6573-snap | 1 | B | physics/player-forces.js, tests/unit/trail-brake-turnin.test.mjs, docs/PHYSICS.md | ×1.0 car: rear slip ≤ 8°, yaw rise ≤ 15 % braking mid-corner; then the absolute pin gate. Takes the first slot → ready (iPhone feel) |
| 1 | #6527 | 6546-P2 | 1 | B | race/damage.js, physics/collide.js | Damage cool-down books only the excess; side-rub rate → land |
| 1 | #6538 #6564 #6572 merged | 6544-U8a | b | B | game.js + 3 new VM tests | #6546 P3 (rescue only while not gaining; vStd stoppedOnTrack), P4 (BOOST cleared on ersHeld), #6544-2 (pause RESTART throw-safe) → land |
| 1 | – | 6544-U7 | b | B | career/career-backup.js, career-ui.js, ui/settings-export-body.js | #6544-1/3 + #6478 R4. **Closes #6587.** Newer-version stays an all-or-nothing refusal. Use #6587's test: 1 good + 1 string slot → skipped: 1; numeric career.myteam.2 resolves → land |
| 1 | profile switch | 6570-U1 | b | B | css/components, dialogs, overlays.css, index.html | #6570-1/8: lone BACK/CLOSE in the sheet head; Duel picker CLOSE → land (emulation) |
| 1 | profile switch | 6570-U2 | b | B | css/tokens, carsetup, settings-controls.css | #6570-2/3: --label on the type scale; dep-reason at --fs-micro → land (emulation) |
| 1 | U1, U2 | 6570-U3 | b | B | css/career, carsetup, data, overlays, tuner.css | #6570-4/5 + #6461-9: menu px fonts to rungs; tuner foot fold → land (emulation) |
| 1 | 6546-P2 | batch-6546-2 | b | B | physics/collide.js, debris-world.js | P5 yielder guard, P7 PACE-scaled sev, P8 firstPairFx → land |
| 1 | – | 6546-P6 | 1 | B | physics/wall-clamp.js | Reverse-into-wall first hit → land |
| 1 | – | 6544-U9 | b | B | data/hub.js, ics.js, live.js | #6544-4/6/10: errorBlock, .ics TBC race, LIVE pad → land |
| 1 | – | 6544-U10 | b | B | audio/engine.js | #6544-7/8: crowd silence on stop; gravel trough ≥ 0 → land |
| 1 | – | 6544-U11 | b | B | input/input.js, pad-menu.js | #6447 + #6544-9: coarse-pointer device switch; pad-menu RT consumed → ready (Mac pad) |
| 1 | #6538 | 6544-U12 | b | B | net/session, netplay, interp, handshake.js | #6544-5/11: clock-step interp; CORRUPT on an Array payload → land |
| 1 | #6525 | 6544-U13 | 1 | B | sw.js | #6544-12 packNetworkFirst try → land |
| 1 | U13 | 4274-SW | 1 | B | sw.js, ui/update-check.js, tests/unit/service-worker.test.mjs, version.json | #4274 item 17a-e (moved up from 13; S11a needs it) → land |
| 1 | #6525, #6535 | batch-6577-A | b | B | render/three/tlx.js, tsl-lit.js, glx/glx.js | #6577 rows 2/5/6: blob/decal range re-arm; split updateFrame; glow dirty key → land |
| 1 | – | batch-6506-1 | b | B | race/spotter.js, race-facts.js, ui/hud-tyres.js | #6506 rows 3/4/5: spotter closures, rank() insertion sort, TYRES aria key → land |
| 1 | U8a | 6544-U8b | b | B | game.js, race/stopped-cars.js | #6443 ttGarageDoor + #6480 K7 (IncidentSim reset at endRace), K8 (lane retirement) → land |
| 1 | – | 6480-RC | b | B | race/race-control.js | #6480 K5/K6: capHoldT pays down; guest ages flag clocks → land |
| 1 | #6568, #6527 | 6546-P10 | 1 | B | physics/ai-drive.js | passReach closing test, the 80 m scaled → land |
| 1 | – | 6489-P1 | 1 | B | camera/flyby-seq.js, flyby-sight.js | Resumable planShot, terrainAt memo. No game.js (menuFinish joins the chain after 6493-P4 if needed) → land |
| 1 | profile switch | 6507-U31 | b | B | ui/title-layout.js, scroll-fade.js | #6507 rows 3/4: title fit memo; ScrollFade scoped → land (emulation) |
| 1 | #6564 | 6446-U15 | 1 | B | ui/settings-export.js, touch-button-settings.js | Import legacyClaimed; Gamepad preset guard → land |
| 1 | – | 6459-U19 | 1 | B | ui/learn-door.js | #6459 row 8: Aero Lab restore puts flow/session back → land |
| 1 | – | 6445-U20 | 1 | B | ui/photo-studio-ui.js | Depth focus Off skips DOF → ready (GPU capture) |
| 1 | U7, U15 | 6478-U22 | b | B | ui/settings-export-body.js, settings-export.js | #6478 R1/R3/R8: garage reset/load rollback; size check → land |
| 1 | – | 6478-U23a | b | B | career/career.js | R5/R6 + qualiSeat: rollover rollback; useSlot; orphan qualiSeat → land |
| 1 | – | 6478-U24+U25 | b | B | core/store.js, editor/custom-tracks.js | R7/R9/R2: store tombstone; dangling class; custom tracks kept → land |
| 1 | U23a | 6478-U23b | b | B | career/career.js, career-planning.js | R10 + #5653 Free Money: lock retry, checked write, legacy key → land |
| 1 | U10 | 6448-U18 | 1 | B | core/lazy-bundles.js, audio/stub.js, engine.js | iPhone first-tap primer AudioContext → ready (cold tap) |
| 1 | – | 6449-U16 | b | B | input/phone-pad-page.js, phone-pad.js | #6449 + #6460-3: pad peerId persists; silent stale answers → ready (reload) |
| 1 | U16 | 6459-U17 | b | B | input/phone-pad-page.js | #6459 rows 6/7/9: pad roll, pressLatch result, redial backoff → land |
| 1 | U8b, 6489-P1 | 6493-P4 | 1 | B | camera/flyby-seq.js, render/shared/lamp-chunks.js, game.js | Flyby/lamp caches keyed by circuit id → land |
| 1 | U9 | 6461-U28 | 1 | B | data/hub.js | #6461 row 6b only (Data Hub tab keys); #6507 row 2 is done in #6520 → land |
| 1 | #6525 | 6461-U29 | 1 | B | ui/desktop-graphics.js | #6461 row 7: steppers by width → land (emulation) |
| 1 | – | 6461-U27 | 1 | B | ui/modal.js, garage/ | #6461 row 6a: ghost-tap shield on the garage's first frame → ready (double tap) |
| 1 | survey findings | 6461-U30a | 1 | B | css/hud.css | Row 10 MacBook energy overflow + #6588 ERS/OT 2 px → land (emulation at 11-25 and 1728×1117) |
| 1 | – | 6461-U30b | 1 | B | ui/results-sheet.js | Row 11 results double summary; before 6548-6 → land |
| 1 | 6493-P4, batch-6546-2 | 6480-RESCUE | b | B | game.js, physics/collide.js | #6480 K2-K4: AI rescue occupancy + vStd gate → land |
| 1 | 6480-RC, RESCUE | 6506-P2 | b | B | race/race-control.js, pace-math.js, game.js | #6506 rows 2/6: per-step memo, paceVmax stamp → land |
| 1 | U22 | 6478-U26 | 1 | B | ui/settings-export-body.js | R11: CAREER_EXTRA_KEYS 'records' → land |
| 1 | 6577-A | batch-6577-B | b | B | render/glx/ (particle, line), SSGI comment | #6577 rows 7/8 → land |
| 1 | 6547-S4 if open | 6516-P1 | 1 | B | car/parts.js, locales/en.json, locales/manifest.json, physics/tyre-model.js | Fictional tyre names (decision (a)); part ids unchanged; no #6572 gate → land |
| 2 | #6564 | 6545-P1 | 1 | F | tests/unit/settings-schema-consistency.test.mjs, tests/data/settings-schema-drift.json | Schema pin, draft-only → land |
| 2 | – | 6545-P7 | 1 | B | race/game-modes.js (new eager), ui/title-flow.js, game.js (1 line), tools/manifest.cjs | GameModes descriptor; orchestrator adds ratchet-raise → land |
| 2 | P7, #6538, #6572, U19 | 6545-P8 | 1 | B | net/lobby.js, race/real-race.js, ui/learn-door.js, race/daily-challenge.js | Flow writers through GameModes; fold the dead cooldown-lap.js:21 test → land |
| 2 | game.js chain | 6545-P9a→P9b→P12a | ch | B | race/game-modes.js, game.js, ui/results-sheet.js, ui/menu-quit-tail.js | Routing, results modes, teardown order; P9b and P12a share game-modes.js → land |
| 2 | P12a, #6454-8 carve | 6545-P10a→P10b→P11a | ch | B | ui/layers.js, modal.js, game.js, key-binds.js | Screens.go; P11a also needs gardener #6455-1 (M3) → land |
| 2 | #6532 | 6545-domkit | b | B | ui/dom.js + scrollIntoView sites (see brief) | Dom.reveal + ApexEvents.NAMES. The 19 sites are in settings-tabs, modal, menu-nav, screen-arranger, sheet-shape (ui/), garage/setup-sheet, editor/designer + workspace, career/season-ui, lighting/ + camera/tuner-panel and net/phone-pairing-ui. settings-search.js's 3 sites are left to P4. Before P10a → land |
| 2 | P7 merged, P1, #6564, U15 | 6545-P2→P3→P4→P5→P6a | ch | B | data/settings-schema.js (new eager); P2 settings-export, manifest, index.html; P3 settings-export-body; P4 settings-search; P5 settings-defaults, appearance-studio, a11y-opts; P6a setting-row, hud-layout, screen-looks | SPEC into SettingsSchema, one raise at a time. P5's golden reads the 11-25 fixture → P2-P4 land; P5, P6a ready (settings read) |
| 2 | P6a | 6545-P6b | ch | B | ui/setting-row.js, ui/, index.html | Owns #6455 item 4; ≤ 3 PRs → land (emulation) |
| 3 | now | 6547-S1 | 1 | F | tools/perf/lod-census.mjs, tests/data/lod-census.json | Census + the first README regen, draft-only → land |
| 3 | – | 6547-S8a | 1 | B | render/three/tlx-chunked.js, render/shared/chunk-bins.js | Pure chunk-bins move; before S6 → land |
| 3 | #6525 | batch-6547-A | b | B | track/scenery/data.js, perf/quality-preset.js, scenery/detail.js, nature.js | Steps 2+3: LodLadder → land |
| 3 | A, #6539 | 6547-S5 | 1 | B | track/scenery/graph.js, build-props.js | LOD meta → land |
| 3 | A, #6572 | 6547-S4 | 1 | B | car/field-lod.js, parts.js, car-draw.js | Field LOD → land |
| 3 | S5, S8a, #6535 | 6547-S6 | 1 | B | render/shared/chunk-bins.js, glx/glx.js, perf/governor.js | LodSelect → land |
| 3 | #6525 | 6509-I8a | 1 | B | render/shared/assets.js, three/tlx.js, assets/pack/uhd-spike/ | ASTC spike (encode hand-off); before S7a → ready (Mac Chrome + Safari) |
| 3 | S6, I8a | 6547-S7a→S10 | ch | B | three/tlx.js, perf/quality-preset.js; S10 governor, apex.js | TLX cull, then the GPU shed → S7a land; S10 ready (MacBook) |
| 3 | S6 | 6547-S7b→S8b | ch | B | webgpu/wgx.js, wgx-chunked.js, glx/chunked.js | WGX cull, then index ranges → land |
| 3 | S1, S5, S6, S7a | 6547-S9→S11b→S12b | ch | B | track/scenery/lod-kinds.js, tools/manifest.cjs | Kinds, HD kinds, auto-decimate → S9 ready (Mac); rest land |
| 3 | 4274-SW, I8a, S9 | 6547-S11a, S11c, S10p, S12a (F), S12c | ch | B | tools/manifest.cjs, sw.js, assets.js, ui/desktop-graphics.js | HD pack chain; S12a in the README chain → land |
| 4 | M2 pick, lane free | 6552 carves | ch | G | tests/unit/*, tools/* per item | Order 1a-1f → 3a → 3c → 4 (after 6556-U1+U0, R5-basered) → 5 → 2 (after 6556-U3/U4/U6/U7) → 6 (after U6) → 7 (after 4) → 8 → 9 (README chain). 3b after 6556-U4, and only with a ratchets.mjs tap → land |
| 5 | M3 pick, lane free | 6548 + 6455 carves | ch | G | css/*, ui/* per item | 6548-3, 1, 2, 6 (after U30b), batch-ui-pins, 6455-2a, 1a, 6548-5 (after #6586), 6455-12b, 2b, 5a, 1b, 11, 6548-4, 8, 9, 6455-7ab, 9 (ready), 12a/d, 10b, 12e, 6548-12, 10, 6455-7c, 6548-7b, 6455-8a, 5b; **6548-11 last** → land |
| 5 | M3 + M1 tap | ratchet PR | 1 | G | tools/check/tree-counts.mjs, ratchets.mjs (protected), tests/data/ratchets.d/ | 6570-U4 + 6455-12f → ready-tap |
| 6 | now | 6556-U1+U0 | b | F | tools/gen/ 4 writers, tests/unit/tools-help-ratchet.test.mjs, tests/data/tools-help-offenders.d/<dir>.json, tests/helpers/no-side-effects.mjs | The 6 writers + the --help ratchet. The offenders go in one fragment per tools/ dir (the ratchets.d pattern), so U2-U8 never share a file. Draft-only → land |
| 6 | – | 6556-U9 | 1 | F | tools/lib/survey-scenarios.mjs, tools/shot/shot-survey.mjs | Shot-survey lazy build → land |
| 6 | – | 6536-R5-basered | 1 | F | .github/workflows/flake-tally.yml, tip-alarm.yml, tools/ci/flake-tally.mjs, tip-alarm.mjs | Moved up from 13: before 6556-U4 and 6552-4 → land |
| 6 | U1+U0 | 6556-U2, U3, U5 | 1 each | F | tools/check/, tools/gen/, tools/perf/ + own fragment | Each deletes its own offender block (serial if the fragments do not land) → land |
| 6 | U1+U0, R5-basered | 6556-U4 | 1 | F | tools/ci/child-health, poll-live-shell, run-node-group, behind-ship | Before 6552-3b (branch-audit.mjs) → land |
| 6 | U1+U0 | 6556-U6→U7→U10+U11 | ch | F | tools/shot/, tools/track/, deletions, tools/README.md | README chain; orphan deletions A+B last (U11 routes browser) → land |
| 6 | U1+U0 | 6556-U8 | 1 | F | .claude/settings.json, tools/check/merge-hygiene.mjs, tools/gen/gen-test-groups.mjs | Protected → ready-tap |
| 7 | 6573-snap | 6553-P1 | 1 | B | input/bindings.js, haptics.js, physics/brake-cue.js, player-forces.js | DualSense polish → ready (hands-on) |
| 8 | #6579 | 6552-hB | 1 | F | tools/ci/pick-unit-slices.mjs, .github/workflows/ci.yml (comment) | Unit slices → land |
| 8 | – | docs-drift-labels | 1 | F | .claude/skills/steward/references/labels.md | Moved up: the steward chain → land |
| 8 | docs-drift-labels | 6557-P5a | 1 | F | .claude/skills/steward/SKILL.md (+ mirror) | Steward guidance → land |
| 8b | #6586 + #6581 part 2 | 6582-U4→U6→U5→U7→U8→U9 | ch | per pick-tests | agent/apex-bridge.js, tests/unit/apex-bridge.test.mjs; U5 tools/bridge/; U7 agent/bridge-plans.js (lazy), manifest | settings read/diff/snapshot → nav routes → dom + SVG overlay → plan runner → soakRestarts → driver lease (D1-D5 relayed) → land |
| 8b | – | 6582-U10 | 1 | F | tools/bridge/watch.mjs, .claude/skills/phone-bridge/ | Session-side watcher → land |
| 9 | #6525 #6531 #6539 | 6515-P1 | 1 | B | track/core/geom.js, scenery/city.js, three/tsl-lit.js, tlx-chunked.js | Facade surface id; before 6479-6 → land |
| 9 | now | 6484-4a | 1 | F | tests/unit/terrain-sampler-pin.test.mjs | Terrain-sampler pin, draft-only → land |
| 9 | lane free | D1-D8 carves | ch | G | per item | In order: 6483-1b (after 6480-RESCUE), 6484-4b (after S5, 4a), 6484-6b, 6504-P2 (after domkit), 6479-4, 6479-6 (after 6515-P1), 6479-2 (after 6577-B). Then, at their game.js chain slots: 6454-2 → 6482-11 → 6483-1a → 6483-1c → land |
| 10 | M8, P7 + P9a merged | 6542-LO1→LO2→LO3 | ch | B | race/last-out.js, game-modes.js, ui/results-sheet.js, ui/hud-readouts.js, css/hud.css | Core → entry/results (after P9b) → HUD → LO1 land; LO2, LO3 ready |
| 11 | – | 6560-L1 | 1 | B | race/driving-coach.js, driving-coach-boot.js, agent/apex.js | Restore round-trip pin → land |
| 11 | #6564 | 6559-S1 | 1 | F | tools/lib/game-vm.cjs | Fast game-vm stub DOM, draft-only → land |
| 11 | U19 | 6559-S0a | 1 | B | ui/drill-registry.js, core/save-schema-registry.js, ui/progress-backup.js, tools/manifest.cjs | Step 0a → land |
| 11 | – | 6559-S15a | 1 | B | race/weather-arc.js | Weather hold → land |
| 11 | 6506-P2 | 6559-S6a | 1 | B | game.js, race/pace-math.js | ERS pure → land |
| 11 | S0a, L1, S6a | 6559-S0b→S0c→B2 | ch | B | game.js, ui/learn-door.js, drill-registry.js, core/lazy-bundles.js, tools/manifest.cjs; B2 race/drill-fork.js | Step 0; B2 after S0c and L1 → land |
| 11 | S0c | 6559-S2+S5 | 1 | B | ui/drill-card.js, drill-registry.js, learn-drills/aero.js, css (lazy sheet) | Drill card → ready |
| 11 | S2+S5 | drills, ≤ 2 open | ch | B | learn-drills/<id>.js, learn/<id>/lab.js, tools/manifest.cjs (LAZY_LEARN), docs/agent-index.json (npm run gen), tests/unit/learn-curriculum.test.mjs | S4 → S6b → S7 → S8 → S9 → S10 → S14a → S15b, then S11+S12, S13a, S13b, S14b, S16, S17; S18 after AI3 and R1b2 → land |
| 12 | now | 6563-R1a | 1 | F | tools/check/corner-speeds.mjs, tests/data/corner-speed-refs.json, tools/README.md (gen) | Instrument, draft-only; README chain → land |
| 12 | 6546-P10, 6553-P1 | 6563-R1b1 | 1 | B | physics/ai-drive.js, brake-cue.js | Brake-target characterization → land |
| 12 | #6568, #6572 | 6565-AI1 | 1 | B | physics/consts.js, race/quali-model.js, tests/data/quali-calibration.json | Difficulty pace; R1b2 needs it → land |
| 12 | AI1, R1b1, 6553-P1 | 6563-R1b2→R1c | ch | B | physics/consts.js, player-forces.js, ai-drive.js, race/quali-model.js, tests/data/physics-baseline.json | v²-keyed lateral μ (never curvature). Bless serial with 5652-BAH → ready (iPhone HARD, notch 17) |
| 13 | fillers | 5777-DOCS, 4680-NOTE, 5653-LEDGER, 5329-SEED, 6509-S0 | 1 each | F | docs/ARCHITECTURE.md, docs/notes/, docs/archive/…/ROLLBACK-RELAND.md, tools/shot/apex-eval.mjs | Docs and seed; 5329 in the README chain → land |
| 13 | fillers | lsp-1→lsp-2, ci-status-tools, verify-fast-honesty, 6536-wf-hygiene | 1 each | F | tools/mcp/lsp-mcp.mjs, tools/ci/ci-watch.mjs, tools/ci/pick-tests.mjs, .github/workflows/perf-census-webgpu.yml | Tooling; verify-fast-honesty before 6552-3a and 6569-A3 → land |
| 13 | R1b2 | 6575-AI3→6565-AI4 | ch | B | physics/ai-drive.js, data/driver-ratings.js, game.js (AI4), quali-calibration.json | Field spread, then ratings; AI4 at the end of the game.js chain → land |
| 13 | – | 5372-LORE, 5316-META | 1 each | B | data/circuit-lore.js, circuits/, tools/track/startline-snap.cjs | Lore + startline re-check → LORE ready (listen); META land |
| 13 | R1b2 merged | 5652-BAH | 1 | B | circuits/bahrain.js, tests/data/physics-baseline.json | T5-T7 esses survey; bless after R1b2 → land |
| 13 | – | 4274-PACE | 1 | B | circuits/scenery/ (2-3 heaviest) | Scenery step pacing → land |
| 13 | 6483-1b | 4270-WALL | 1 | B | physics/collide.js, wall-clamp.js | Skip wallLimits on contact-free steps, pit-wall proof → land |
| 13 | – | 5651-SGSR→SSAO→GLXP | ch | B | three/tsl-post.js, webgpu/wgsl-post.js, glx/glsl-post.js, glx/ | GLX-05 folds into SGSR; GLXP last → land |
| 13 | #6525, 6577-A | 5315-LAB→5777-TLXS→6486-SAFARI | ch | B | three/tlx.js, tsl-lit.js, tlx-chunked.js, ui/desktop-graphics.js | Lab switch, TLX remap, Safari split (SAFARI after U29) → land |
| 13 | – | 6509-I5a, I9, I10, S6 | 1 each | B | tools/gen/assets.mjs, car/car-hero.js, track/terrain-macro.js, circuits/ | HD content → land |
| 13 | U30a | 4448-S8→5653-HUDPERF | ch | B | css/hud.css, ui/hud*.js | F-13 fold with a hud-mock table; verify-then-reland → land |

### Chains (one open PR per file group, in this order)
- **game.js** (this order beats wave order): #6572 #6564 #6538 open → 6544-U8a → U8b → 6493-P4 → 6480-RESCUE → 6506-P2
  → 6559-S6a → 6545-P9a → P12a → P10a → P10b → 6454-2 → 6482-11 → 6483-1a → LO1 → 6559-S0b → 6565-AI4.
  6545-P7 and 6553-P1 are one-line handoffs and may run beside the chain.
- **Physics:**
  - collide.js: #6527 → 6546-P2 → batch-6546-2 → 6480-RESCUE → 6483-1b → 4270-WALL.
  - ai-drive.js: #6568 → 6546-P10 → R1b1 → R1b2 → AI3 → AI4.
  - player-forces.js / brake-cue.js: #6572 → 6573 → 6553-P1 → R1b1/R1b2.
  - quali-calibration.json: #6568 → AI1 → R1b2 → AI4. physics-baseline.json blesses: R1b2 → 5652-BAH.
  - parts.js: #6572 → S4 → 6516-P1 (if S4 is open). lobby.js: #6572 → P8.
- **Settings and saves:**
  - settings-export(-body).js: 6544-U7 → 6446-U15 → 6478-U22 → U26 → 6545-P2 → P3 → 6548-11.
  - settings-schema.js: P2 → P3 → P4 → P5 → P6a. career.js: U23a → U23b. eagerScripts: P7 → P2.
- **Modes and UI:**
  - game-modes.js: P7 → P9a → P9b → P12a → LO1. modal.js / screen-arranger.js: domkit → P10a → P11a.
  - Menu CSS: U1 ∥ U2 → U3 → the ratchet PR → gardener CSS. hud.css: U30a → 6548-1 → 4448-S8 → LO3.
  - results-sheet.js: U30b → 6548-6 → P9b → LO2. dom.js: #6532 → domkit → 6504-P2 → gardener Dom helpers.
  - desktop-graphics.js: #6525 → U29 → SAFARI → S11c → 6515-P2.
- **Audio, data, input, net:** engine.js U10 → U18; hub.js U9 → U28; phone-pad-page.js U16 → U17; net #6538 → U12 → 6482-11;
  sw.js #6525 → U13 → 4274-SW → S11a; flyby-seq.js 6489-P1 → 6493-P4; pace-math.js 6506-P2 → S6a → 6483-1a → 1c.
- **Render:**
  - tlx.js / tsl-lit.js: #6525 → 6577-A → I8a → S7a → 6515-P1 → 5315-LAB → TLXS → SAFARI.
  - glx.js: #6535 → 6577-A → 6577-B → S6 → 6479 carves.
  - chunk-bins S8a → S6; quality-preset S7a → S10; wgx-chunked S7b → S8b; lod-kinds S9 → S11b → S12b;
    tlx-chunked 6515-P1 → 6479-6; glsl-post SGSR → SSAO → GLXP.
- **Drills and agent:** learn-door.js U19 → S0a → S0b → S0c → P8; apex.js L1 → S0b → S10; manifest.cjs + lazy-bundles.js
  S0c → B2 → drills, one at a time; apex-bridge.js #6586 → #6581 part 2 → 6582-U4 … U9 → 6548-5.
- **Tools:**
  - tools/README.md: S1 → U6 → U7 → U10+U11 → R1a → 5329 → 6552-9 → S12a. Steward skill: docs-drift-labels → P5a.
  - tools/ci: tip-alarm R5-basered → U4; branch-audit U4 → 6552-3b; flake-tally R5-basered → 6552-4 → 6552-7;
    pick-tests verify-fast-honesty → 6552-3a / 6569-A3; select-specs #6579 → P7 → 6552-3b.

## 3. Morning list for Bryce (AskUserQuestion, up to 4 per batch, in this order; ★ = recommended)

Issue links are `https://github.com/brycejmurrin/f1-game/issues/<n>`. FYI, with no question: #6572 is A (10:43Z) and a HARD race confirms it in the window.

| # | issue | question | options | rec |
|---|---|---|---|---|
| M1 | [#6469](https://github.com/brycejmurrin/f1-game/issues/6469) [#6556](https://github.com/brycejmurrin/f1-game/issues/6556) [#6456](https://github.com/brycejmurrin/f1-game/issues/6456) [#6583](https://github.com/brycejmurrin/f1-game/issues/6583) | Protected `config-ok` taps | Hooks PR (#6469 A/B, #6458-2, #6544 bash-guard); 6556-U8; the land.yml push trigger for trains (after #6589/#6591); the ratchet PR (if M3 = yes); #6456-10 land.yml inline bash (D8-granted, after #6589); #6590 if its label is not his own re-tick | ★ tap each one whose CI is green |
| M2 | [#6552](https://github.com/brycejmurrin/f1-game/issues/6552) | Gardener plan for tools/tests | ★ items 1-9 in plan order, one carve at a time / top 3 / none. Sub-calls: item 5 empty median → null ★; item 4 empty name → "" ★; item 7 one retry policy, 4 tries at 90 s ★; item 9 archive ★; 3b with ratchets.mjs (tap) / out ★ | all ★ |
| M3 | [#6548](https://github.com/brycejmurrin/f1-game/issues/6548) [#6455](https://github.com/brycejmurrin/f1-game/issues/6455) | Q-UIG: UI gardener | ★ ordered list / pins + ratchet rows + metrics move only / none. Sub-calls: 7b stricter share-code enum ★yes; 12 tokens constant (white on red in every theme) ★ / follow the light theme / skip; keep the name fonts-hud.css ★; 6455-11 DETAILS-aware focus predicate ★; 6455-12e literals follow the CVD palette ★yes | all ★ |
| M4 | [#6495](https://github.com/brycejmurrin/f1-game/issues/6495) | Gardener lane width | 1 open PR across plans (today) / ★ 2 open when their plans and files are disjoint | ★ 2 |
| M5 | [#6495](https://github.com/brycejmurrin/f1-game/issues/6495) [#6456](https://github.com/brycejmurrin/f1-game/issues/6456) [#6479](https://github.com/brycejmurrin/f1-game/issues/6479) | The rest of the master plan | Orders 9 (#6456-1 loadJs VM loader), 11 (#6483-3 vRef), 13 (#6483-8), 14 (#6484-7), 15 (#6482-8/9/10), 16 (#6454-5 input.js), 17 (#6482-4), 20 (#6454-7); #6454-3..7/9; the D8 "apex.js frac on undefined = 0"; #6456-2 gh() clones (dedupe with #6552-7); the ungranted #6479 1b/1c/3/5/8/9a/9b/10/11/12 and 6504-P3 wrapS. ★ queue all in #6495 order after the D1-D8 items / pick some / later | ★ queue all |
| M6 | [#6570](https://github.com/brycejmurrin/f1-game/issues/6570) | R6 and R7 UX rules | R6: Season Setup chips → SettingRow, folded into 6545-P6b ★ / record the exception in COMPONENTS.md. R7: a commit sheet focuses its primary unless destructive, Back is always Escape/B, Duel gets autofocus ★ / leave it | ★ both |
| M7 | [#6546](https://github.com/brycejmurrin/f1-game/issues/6546) | P9: an OT allowance granted while OT is off (SC, low grip) lapses at the next line | ★ hold it like the lap-1 grant (`_otHold`) / keep the lapse (rule text) | ★ hold |
| M8 | [#6542](https://github.com/brycejmurrin/f1-game/issues/6542) | LAST OUT rules + door | Cadence: ★ 40 s timer, paused under race control / each lap line. Field: ★ the Race Settings grid / a fixed 10. Door: ★ a FORMAT row in Race Settings beside DUEL (GameModes) / its own title tile | ★ all |
| M9 | [#5777](https://github.com/brycejmurrin/f1-game/issues/5777) [#3115](https://github.com/brycejmurrin/f1-game/issues/3115) [#5651](https://github.com/brycejmurrin/f1-game/issues/5651) | D-WGX | ★ freeze WGX (opt-in; crash and validation fixes only; parity rows close) / keep parity work / retire | ★ freeze |
| M10 | [#6486](https://github.com/brycejmurrin/f1-game/issues/6486) | D-6486-APEX | ★ a new APEX tier above EXTREME (desktop TLX WebGPU only, CINEMA renumbered) and accept the GFX-CONTRACT carve-out / fold the extras into EXTREME | ★ APEX |
| M11 | [#6515](https://github.com/brycejmurrin/f1-game/issues/6515) [#6519](https://github.com/brycejmurrin/f1-game/issues/6519) [#6485](https://github.com/brycejmurrin/f1-game/issues/6485) | Render small calls | Facade pilot circuit: ★ Monaco (Monza has few blocks) / Monza. #6519/6479-7: choose the one shadow predicate (worker lists both with A/B shots). 6485-P3 decal rebind on photo mode: ★ fix / close | ★ |
| M12 | [#6543](https://github.com/brycejmurrin/f1-game/issues/6543) [#6553](https://github.com/brycejmurrin/f1-game/issues/6553) | Q-FEEL (multiSelect) + iOS version | ★ I1 + I2 + I3 / I4 / I5 / I7 / I8 / I11 / I12 / later. His iOS version (Settings › General › About) for I6 and #6553 §4 | ★ I1-I3 |
| M13 | [#6557](https://github.com/brycejmurrin/f1-game/issues/6557) [#6569](https://github.com/brycejmurrin/f1-game/issues/6569) | CI and test calls | P4b over-road browser specs only on mesh diffs + nightly: ★ yes if the P4a delta is mesh-capture only / no. P5 pre-push nudge (protected): yes / ★ no. A3: ★ option B (tier move) / A. A4: ★ yes, one file at a time, same seed before/after / skip. #6552-10 twin-spec retire: ★ after P4a | ★ |
| M14 | [#6556](https://github.com/brycejmurrin/f1-game/issues/6556) [#6458](https://github.com/brycejmurrin/f1-game/issues/6458) | Tools + worker env | g2-handoff (3 pid-tree walkers → one): ★ yes as a carve / no. #6458-6 lean worker env: turn off BrowserStack, Drive, TinyFish, Docs, Academy for worker sessions ★ yes (≈35 % of a worker's cost) / keep | ★ |
| M15 | [#6536](https://github.com/brycejmurrin/f1-game/issues/6536) [#5410](https://github.com/brycejmurrin/f1-game/issues/5410) | His hands in the Actions UI | Delete the ghost-registration runs and the 11-11 zombie queued Land runs (the hook refused the agent cancel; MCP has no delete); WORKER_FIRE_* secrets if not yet gone; D-5318 settings.json rows: apply / ★ skip | ★ |
| M16 | [#6049](https://github.com/brycejmurrin/f1-game/issues/6049) | Device window time | ★ 30 min phone + 15 min Mac in one window (§4) / split | ★ one window |

**Orchestrator picks overnight under grant 2** (reversible; no feel, defaults, saves or coverage change; logged for
morning review): D-3665-BOARD, D-4785-CLOUD and D-5212-CLOSE close; D-4798-DEFER leave the trap and close; D-4272-MIRROR
keep every frame; D-4274-MUSIC keep decoding; #2631 folds into #6547; #6556 merges (6 thin aliases + the menu-fit port,
3 F rows after 6556-U10+U11); 6569-A1b no new cron (the trims worker states it).

## 4. Morning device window (one phone link + one Mac link; hands-off unless marked ✋)

**Phone** (TLX WebGPU, Claude Link, 25-step batches once #6586 lands; results go in a docs/notes DEVICE-CHECKS file):
- **Race:** a HARD race on ×1.0 after #6572 + #6568 (pace notch 17); GRID › QUALIFYING (#6564); the #6573 feel, and
  6563-R1b2 if reached. #6378: #5835 step 2 (limiter, HUD lane cue, lap invalid) and #6366 touch crossover.
- **Only if the survey could not settle them by emulation:** #5775 R9, #5783 L1, #5901 13b.
- **Render and boot:** #5777 R11 (overcast day, gpuErrors + snap); #5315 row 4 (memState tlxMirror) and row 2
  (portrait→landscape, a portrait hold); #5218 F5 (Safari tab, race + pause geom, checked against the #6590 export);
  #4798 row 3 (boot marks); #4274 device row (time-to-race ×3, reload/crash); 6565-DEV.
- **✋ PRs held at ready:** 6448-U18 cold first tap; 6449-U16 reload; 6461-U27 double tap; 6545-P5/P6a settings read;
  6455-9; 5372-LORE listen.
- **✋ Other hands-on:** #4273 (edge-swipe BACK, double-tap shield, VoiceOver, backgrounding); #5218 Home Screen app
  reading; the #6049 rows #5236, #5328, #5649, #5541 (two phones); #4270 §4 ears (rivalEps, noiseBurst); #5901 A9/A30;
  the 5496 two-device VS FRIEND check, then close #1576.

**Mac** (desktop Claude Link #6416/#6417):
- **Render:** #6486 check 0 (Chrome EXTREME + MAX: the #6523 shed note, rAF rate, maxLights); #6525 Monza close-up at
  desktop EXTREME; #5777 R12b (GLX garage floor, `?renderer=glx`); #5315 row 4 on desktop; the 5651/5777 look A/Bs once built.
- **Network, HD and layout:** #5712 nostr relays from his network; 6509-S0 HD baseline; 6509-I8a ASTC (Chrome + Safari);
  6547-S9/S10 GPU shed; 6445-U20 DOF capture; 6461-U30a at 1728×1117 (sign-off only; emulation passed in the PR).
- **✋ Controllers:** 6553-S0 WebHID spike with the DualSense; the 6553-P1 hands-on; the 6544-U11 pad.
- **After the window:** tick #6049, #6416, #6417 and #6378.

## 5. Not scheduled

- **COVERED by live work** (never relaunch):
  - Workers: #6581/#6586 (xVz1sin6D5iGmF7qm, #6582 units 1-3 + 11); #6583/#6590 (vZGPyxcq2j82miEQK); #6584/#6591
    (zoPL3nGzF9gpP5Gu5, protected, tapped); #6585 same-tree reuse (zFEZHfwn2JSuxp3Jm); #6576/#6579 (wZBDroDTrJ7p3MfBF);
    #6536 R3/#6589 (tapped 10:33Z); #6569 + the #6557 trims (yiEjP1k1NXZoyBCCM, #6592 = A1a); the UI framing survey
    (xoTjU4NPLbS6wqpUs) covers HUDFIT-PROBE.
  - PRs: 6509-I12; 6557-P1/P6/P9; 6536 items 1, 2, 4-6; 6494-worktree (#6514); 6436-sync (#6436); 6455-3/4; 6504-P1; 6479-1a;
    6481-K1; 6565-PARTS/GRID/HARD (#6572/#6564/#6568); 6546-P1 (#6568); #6506 row 1 (#6541); GARDENER-CARVES (train
    #6580); 6556-cmt.
- **DONE:** 5496-verify (#6511); 6545-D1; 6509-I3; 6528-orphan (#6561); 6463-queue; 6432-decision; 6560-B1 (#6567);
  #6485 rows 1-2 (#6517); #6493 rows 1-2 (#6529, #6521); #6507 rows 1-2 (#6520). #6571 is closed.
- **STALE:** 6556-ready-sweep; 6557-P3 and P8 (superseded by #6574/#6579); 6439-basered; the hunterR placeholder (it is
  #6577 now); 6565-EXPERT and the 6563/6542 NOTCHOSEN rows.
- **Declined or not chosen:** #6536 P8 runner lanes; #6559 3b (not now); #6563 #2-#12 (only #1); #6565 EXPERT/ALIEN;
  6557-P5b (folded into M13 P5).
- **BLOCKED past tonight:** 5316-ZAN (L); 6509-I5b/I5c/I6/I7/I8b (after I5a/I8a); 6509-I4b = 6515-P2 (M11); 6552-10b
  (after P4a + M13); 6557-P1b and P3b (after #6579 and the P3a note); 6553-S0/H1/H2 (the morning WebHID spike); 6565-DEV
  (the window); 3115-F5W (D-WGX); 6543-I* (M12).
- **Parked by Bryce:** #2945, #1607, #1566.
- **Trackers kept open:** #1780, #2394, #6049, #6495, #6416, #6417, #6378, #6582, and #4785 until D-4785 is picked.
  #6550, #6551, #6554, #6555 are per-drill specs: close each when its drills land.
- **Close once their units land** (not tonight): #6459, #6460, #6461, #6507, #6544, #6478, #6570.

## 6. Stale or duplicate issues to close (orchestrator, with a comment each)

| issue | evidence | action |
|---|---|---|
| #6528, #6463, #6432, #5810 | #6528 fixed by #6561; #6463's queue change is on the tip; #6432 decision A applied; #5810's phone part is done | close, completed |
| #6439, #5420, #3899, #6362 | #6439 is a stale base-red (flake-tally would auto-close it); dispatch.yml was deleted by #6549; #6362 not reproduced (#6370 closed) | close, not planned |
| #3104 | Only F6 (upstream three.js #30560) is left | close, with a vendor-upgrade note to re-check on the next three bump |
| #2631 | §3 is ticked by 4680-NOTE; the mesh-preprocessing pilot folds into #6547 (far proxies auto:decimate + detail-0 census) | close after 4680-NOTE, with a fold note (grant 2) |
| #4680 | The 54-cell chunk-merge A/B is recorded in 4680-NOTE | close when 4680-NOTE lands |
| #5901 | Every child is closed; 13b/A9/A30 move to the survey worker | close after the survey files or settles them |
| #6587 | The same defect as #6544 items 1/3 (reproduced on f5396219) | keep open; 6544-U7's PR says "Closes #6587" |
| #1576 | All 7 children are closed; only the 5496 two-device check is left | close after the morning VS FRIEND check |
| #3117 | F4 only: the slow/page-a max | close if ≤ ~360 s over ~5 tip runs (ACT-3117) |
| #4274 rows 1-3/5-8, #4270 §5 | Superseded by #6493; "contain" cannot be done at zero visual change | tick with a note, do not close the parents |
| #6571 | Already closed 10:21Z (#6396, #6529 PASS) | none |
