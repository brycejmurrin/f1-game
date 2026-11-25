# QUEUE-FINAL — overnight 2026-11-25 (built on OVERNIGHT-QUEUE.md + critic + tonight's changes)

As of ~11:05Z (03:05 PT). Bryce is back ~15:00Z (07:00 PT). Grants: Board #1780 ~10:45Z (≤ 12 live workers, ~6
launches/h, orchestrator picks within limits, protected work stops at draft-green). #6572 = A (×1.0 parity, ~10:43Z).
Critic fixes: all 24 in OVERNIGHT-QUEUE.md were checked and are kept. Six more are new here and marked ⊕.

**Live state, checked at 11:05Z (GitHub reads)**
- **ready+land 14:** train #6580's 6 open cars (#6514 #6527 #6531 #6532 #6535 #6538), plus #6593 #6592 #6579 #6578 #6572
  #6568 #6564 #6525. Drafts 5: #6595 #6594 #6591 #6586 #6539. #6590 is ready with `config-ok` but has no `land`.
- **Merged, not in the given list:** #6589 (land.yml thinning) at 10:54Z, and #6466 at 10:57Z. #6466 merged outside train
  #6580 while it was still one of its cars.
- **New PRs:**
  - #6594 (draft, owner wgT2 = Bryce's link session, stacked on #6586): READ/ACTION concurrency plus `plan`
    (ttEndGarage, raceSample, hudAudit). That is the #6582 "plan runner", so it is COVERED.
  - #6595 (draft, owner yA1W, PROTECTED): the #6469 A+B hooks plus the #6451 gardener contract row.
- **Launch rate this hour:** about 4 merged last hour + (12 − 14)/2 ≈ 3. Fix workers wait until ready+land < 10 (after the
  train). Browser lane ≤ 6 open; it is ~10 now with train cars counted.

**Launch header (every child, unchanged):** `create_session` with `environment_id: env_01T3kL7W7688bnn8RpTx8GsY`,
`permission_mode: auto`, `tags: ["apex-orchestrator-2026-11-24"]`. One PR per worker. The prompt opens with the brief and
ends "load skill steward §Lane". The tests/groups.json exception applies (insert sorted, sync on conflict).
- **Profile line for every UI/HUD/emulation brief:** Bryce's newest export `tests/data/settings-live-export-2026-11-25.json`
  (UI SIZE shipped, BUTTON 130, contrast high, pace notch 17). It was exported in landscape: top level = landscape,
  `appearanceShapes.park` = portrait.
- **Emulation recipe:** `openBrycePhone` (`tools/lib/bryce-phone.mjs`), iPhone 15 852×393 @3x, per
  https://github.com/brycejmurrin/f1-game/pull/6518#issuecomment-7159572851.

## 1. Launch list, NEXT 2 HOURS (11:05Z → 13:05Z): 8 launches, strict order

- **Order and lanes.** The order is strict within each lane. A row held by its lane cap or gate does not block the other
  lane. Never skip a launchable row for a later one in the same lane.
- **Slots.** 11 of 12 live: one is free now, and more free as #6572 #6568 #6564 #6579 #6525 #6593 merge (archive their
  workers in the same cycle).
- **Expected:** row 3 now, rows 2 and 4 within the hour, the browser rows after the train lands.

| # | unit(s) | issue(s) | lane | files | brief → stop | depends-on | config-ok |
|---|---|---|---|---|---|---|---|
| 1 | 6573-snap | #6573 | B | js/physics/player-forces.js, tests/unit/trail-brake-turnin.test.mjs, docs/PHYSICS.md | ISSUE 6573: ×1.0 pin + shipped seat braking mid-corner, rear slip ≤ 8°, yaw rise ≤ 15 %, turn-in ≥ 0.6× coasting, then the absolute pin gate; no tolerance widened → **ready** (morning HARD race) | **#6572 merged.** Reserved: the first free slot after that merge, ahead of every row. A ready stop adds nothing to ready+land, so it is exempt from the < 10 hold | no |
| 2 | bryce-profile-switch | #6583 (follow-up to #6590) | F | tools/lib/bryce-phone.mjs, tests/unit/phone-tools.test.mjs | `live` → settings-live-export-2026-11-25.json (landscape = top level, portrait = `appearanceShapes.park`); every emulation row reads it → land | #6590 merged. Send it as a CONTINUE to vZGPyxcq2j82miEQK (no new slot); launch only if that worker is gone | no |
| 3 | 6556-U1+U0 | #6556 | F | tools/gen/{bake-elevation,bake-flyby,voice-corpus}.mjs, tools/gen/trees/install-trees.mjs, tools/ci/spec-timings.mjs, tools/shot/gen-scenery-locations.cjs, tests/unit/{game-tools-help,tools-help-ratchet}.test.mjs, tests/data/tools-help-offenders.d/<dir>.json, tests/helpers/no-side-effects.mjs, tests/groups.json | ISSUE 6556 U1+U0: the 6 tracked-file writers refuse `--help`/stray argv. Add a roster `--help` ratchet with one offender fragment per tools/ dir. Import `exitIfHelp`; never edit tools/lib/cli-args.mjs (PROTECTED). Draft-only while ready+land ≥ 10 → land | none: launch NOW | **routine**: the orchestrator adds it when draft CI is green |
| 4 | 6582-U10 (adaptive polling, agent side) | #6582 | F | tools/bridge/watch.mjs (new), tests/unit/bridge-watch.test.mjs, tests/groups.json, .claude/skills/phone-bridge/SKILL.md (one recipe line; not references/commands.md, which #6594 owns) | ISSUE 6582 unit 10: session-side watcher (Monitor recipe) that reacts within ~10 s, with a back-off on a low rate limit. Draft-only while ≥ 10 → land | none | no (the package.json test:* regen is exempt) |
| 5 | 6544-U7 | #6587, #6544 items 1/3, #6478 R4 | B | js/career/career-backup.js, js/career/career-ui.js, js/ui/settings-export-body.js, tests/unit/career-backup.test.mjs | ISSUE 6587: a corrupt slot is skipped (1 good + 1 string slot → `skipped: 1`); newer-version stays an all-or-nothing refusal; a numeric career.myteam.2 resolves; "Closes #6587" → land | ready+land < 10; head of the settings-export-body chain | no |
| 6 | 6461-U30a + #6588 | #6461 row 10, #6588 | B | css/hud.css, tests/unit/hud-metrics-layout.test.mjs (or the HUD layout unit that owns ERS/OT/AERO) | batch: #6461 row 10 + #6588 (+ up to 1 hud.css clip from the survey). No HUD readout overlaps on the 11-25 export in portrait and landscape, or at 1728×1117. Measured by emulation (rect table in the PR); pinned in a unit. hud.css is at line slack 0: net-zero or a hook raise → land | row 2 merged; ready+land < 10; **head of chain B (css/)** | no |
| 7 | 6546-P2 | #6546 P2 | B | js/race/damage.js, js/physics/collide.js, tests/unit | ISSUE 6546 P2: the damage cool-down books only the excess; side-rub rate → land | #6527 merged (train); ready+land < 10 | no |
| 8 | 6544-U8a | #6546 P3, P4; #6544 item 2 | B | js/game.js + 3 VM tests | batch: rescue only while not gaining (vStd stoppedOnTrack); BOOST cleared on ersHeld; pause RESTART throw-safe → land | #6538 (train) + #6564 + #6572 merged; ready+land < 10; **head of chain A (game.js)** | no |

**Acts and messages this cycle** (reversible, logged, not launches):
1. Archive the owners of #6466 (session_017Yzwxxgnu3pQVEsRDdDFVs) and #6589.
2. ⊕ **#6580.** Car #6466 merged outside it at 10:57Z. Expect a stale close and a rebuild (#6561 re-snap). If it is
   unchanged at 11:49Z with no Land run in flight, dispatch land.yml for it.
3. ⊕ **#6595.** It carried `config-ok` from creation (10:59Z), while its body says "an agent never adds it". Read the PR
   log. If an agent set the label, remove it and list the PR in M1.
4. **MSG-hooks** (gate met: #6466 merged) to yA1W9dp6SqaTdGRWz: add #6458-2 (session-start.sh `orchestrator: yes/no`)
   and 6544-U14 (bash-guard refuses offline-precache-check from a subagent) to #6595. Never touch the #5318
   settings.json rows. Build to draft-green, then wait for Bryce's tap.
5. ⊕ **MSG-survey** to xoTjU4NPLbS6wqpUs.
   - **Fix the seeding.** Landscape = the top level (`live: "wide"`), portrait = `appearanceShapes.park`. The old message
     seeded `park` for every check.
   - **Rows.** #5783 L1, #5775 R9, #5901 13b, #6588 (to confirm it), and #5835 step 2 (limiter, HUD lane cue, lap
     invalid: by emulation plus `__apex`).
   - **Output.** One fix issue per clip, or "not reproduced". The hud.css clips feed the "framing-survey fixes" slot in
     chain B.
6. **MSG-trims** to yiEjP1k1NXZoyBCCM, CONTINUE one PR at a time:
   - A2 (+R5b) → A6 → A7 → R4a → 6557-P2 (decision C: measure option B first) → P2b/P2c → P7 (after #6579) → A5
     (PROTECTED, its own PR).
   - P5 pre-push (PROTECTED) is its own PR and is never mixed.
   - While CI runs, post the 6557-P4a over-road delta on #6557.
7. ⊕ **MSG-6591** to zoPL3nGzF9gpP5Gu5: once #6591 merges, build the land.yml push-trigger follow-up (6584-PT). It goes
   alone on land.yml and stops at draft-green.
8. **ACT-house**, **ACT-3117** and **ACT-6536**, as in OVERNIGHT-QUEUE §2 wave 0.
   - ACT-6536 is limited to the two phone-shots `cancel_workflow_run` calls, stopping at the first refusal.
   - ACT-house also files the batch issues for rows 6 and 8, and a fmtLap/wrapS tracker before #6532 closes #6504.

## 2. Waves after that (compact; "after" = merged)

**Rules (each :19 FULL and :49 LIGHT cycle).**
- **Gate 0.** Live workers < 12. Launches per hour ≈ merged last hour + (12 − ready+land)/2, at most ~6 (≈ 4 browser, 2 fast).
- **Fix workers** launch only while ready+land < 10. Fast draft-only rows launch any time and stop at draft while ≥ 10.
- **Ready stops.** At most 2 browser PRs held at ready overnight.
- **Lanes.** Browser ≤ 6 open. Gardener: one PR, opening only after #6539 lands, and only for Bryce's picks.
- **PR size.** 1 unit per PR, < 400 lines. Batch 2–3 units only when they share a lane and files.
- **Protected work.** Builds alone, to draft-green, never further.
- ⊕ **Hot files at a ready stop.** A ready-stop PR never holds a hot file overnight: it goes last in its chain, or the
  hot line splits out.

**Wave 1 browser, in this order after the §1 rows:**
1. 6516-P1 (fictional tyre names; regen locales) and batch-6577-A (#6577 rows 2/5/6; after #6525 + #6535; chain G).
2. 6544-U9, 6544-U10, 6546-P6, 6480-RC and batch-6506-1.
3. 6489-P1 (no game.js), 6459-U19, 6478-U23a and 6478-U24+U25.
4. ⊕ 6577-R4a: the decode starts before the race-entry window, plus a spec that `_unfilterRows` doesn't run after
   `state=race` with the worker on. No default flip.
5. 6544-U12 (after #6538) and 6544-U13 (after #6525; chain D).
6. ⊕ **SURVEY-FIX, reserved:** "framing-survey fixes, filed later", in chain B after U30a, by emulation, ≤ 3 clips per PR.
7. The emulation rows:
   - 6570-U1 → U2 → U3 (chain B, serial: css/ is hot);
   - 6507-U31;
   - 6461-U29 (after #6525).
8. 6461-U30b; then 6446-U15 (after #6564, U7) → 6478-U22 → U26; then 6478-U23b (after U23a).
9. batch-6546-2 (after P2); 6546-P10 (after #6568); ⊕ 6575-AI3a (#6575 lap-1 headway only, after P10 + #6564).
10. Chain A after U8a: 6545-P7 → 6544-U8b → 6493-P4 → 6480-RESCUE → 6506-P2.
11. 4274-SW (after U13); batch-6577-B (rows 7 stale comment + 8); ⊕ 6577-R1L (#6577 row 1 as an opt-in 30 Hz mirror rung
    behind a lab flag, default unchanged, CPU A/B in the PR; chain G after batch-A); 6485-P3 (grant pick, fix).
12. **Ready stops (≤ 2 held), true device only:** 6544-U11 (Mac pad), 6449-U16 (paired reload), 6448-U18 (cold tap),
    6445-U20 (GPU DOF), 6461-U27 (double tap; after domkit, so modal.js isn't held), and 6459-U17 after U16 (lands).

**Wave 1 fast** (draft-only while ≥ 10): 6547-S1, 6484-4a, 6563-R1a, 6536-R5-basered (routine config-ok) and 6556-U9.
Research: 4270-VERIFY (after 13:00Z).

**Waves 2–13**
- **W2 #6545.**
  - P1 (F, after #6564); P7 (chain A + E, ratchet-raise); domkit (after #6532; its 13 files, not settings-search).
  - P8 (after P7, #6538, #6572, U19).
  - P2→P3→P4→P5→P6a. P2–P4 land; P5/P6a stop at ready (settings read on device). P6b lands by emulation.
  - P9a→P9b→P12a→P10a→P10b→P11a.
- **W3 #6547 / #6509.**
  - S8a; batch-6547-A (after #6525); S5 (after A, #6539); S4 (after A, #6572).
  - S6 (after S5, S8a, #6535).
  - ⊕ I8a lands default-off (opt-in ASTC path, pixel-identical default), and the Mac checks the opt-in path in the
    window, so chain G never stalls. Then S7a→S10, with S10 at ready, last in chain F.
  - S7b→S8b; S9→S11b→S12b (S9 at ready, Mac); S11a / S11c / S10p / S12a (F, README chain) / S12c.
- **W4/W5 gardener** (#6552, #6548 + #6455, the ratchet PR): only after Bryce's M2/M3. No carve without his pick.
- **W6 #6556 (fast).**
  - U1+U0 (§1) → U2, U3, U5 (one fragment each).
  - U4 (after R5-basered, before 6552-3b).
  - U6 → U7 → U10+U11 (README chain).
  - ⊕ U8 (PROTECTED): merge-hygiene.mjs + gen-test-groups.mjs `--help` ONLY. No .claude/settings.json: :104 stays
    (#5318), and :205 is a skipped cosmetic row (D-5318 pick).
  - 6556-merges + g2-handoff (grant picks) after U10+U11.
- **W7.** 6553-P1 after 6573 lands (morning), → ready (hands-on). ⊕ Its game.js kerb line splits out as 6553-P1k, a
  chain-A link, so the ready stop holds no hot file.
- **W8 fast.** 6552-hB (after #6579, routine config-ok); docs-drift-labels → 6557-P5a.
- **W8b #6582 (fast lane per the 10:08Z relay; CI routes test:hooks/test:tiny), chain J, in the ranked order:**
  1. ⊕ 6582-AP-b: phone-side adaptive polling, ~1 s busy / 4 s idle / rate-limit back-off.
  2. Plan runner = #6594 (COVERED). Its extra plans (raceFull, settings sweep, soakRestarts) = 6582-U8, after U4.
  3. ⊕ 6582-MD: one bridge issue per device (iPhone / Mac Chrome / Mac Safari), each with its own lease.
  4. U4 settings read / diff / snapshot / restore.
  5. U6 nav route table.
  6. U5 DOM dump + SVG overlay.
  7. U9 driver lease. Fold the Cursor/Codex section into MULTI-AGENT-CODEX-CURSOR (#6431 merged).
  - Gate for every unit: after #6586 → #6594 → #6581 part 2.
- **W9.** 6515-P1 (after #6525 #6531 #6539). D1–D8 carves in the gardener lane: 6483-1b, 6484-4b, 6484-6b, 6504-P2,
  6479-4, 6479-6, 6479-2. Then the chain-A carves 6454-2 → 6482-11 → 6483-1a → 6483-1c.
- **W10.** LAST OUT LO1→LO2→LO3, after M8 + P9b. ⊕ LO3 (hud.css) lands by emulation and does not stop at ready.
- **W11.** 6560-L1; 6559-S1 (F, after #6564); S0a; S15a; S6a (chain A); S0b (after L1, S6a); S0c → B2.
  ⊕ S2+S5 (drill card) lands by emulation. ⊕ Drills: ONE open at a time (manifest.cjs is hot): S4 → S6b → S7 → S8 → S9 →
  S10 → S14a → S15b → …
- **W12.** 6563-R1b1 (after P10, 6553-P1); 6565-AI1 (after #6568 #6572); R1b2→R1c, with R1b2 at ready (iPhone HARD).
- **W13.**
  - Fillers: 5777-DOCS, 4680-NOTE, 5653-LEDGER, 5329-SEED, 6509-S0, lsp-1→lsp-2, ci-status-tools, verify-fast-honesty,
    6536-wf-hygiene.
  - ⊕ 6575-AI3b (race-pace part, after R1b2) → 6565-AI4.
  - 5372-LORE (ready, listen); 5316-META; 5652-BAH (after R1b2); 4274-PACE; 4270-WALL.
  - SGSR→SSAO→GLXP; LAB→TLXS→SAFARI (chain G); I5a / I9 / I10 / S6; 4448-S8 (chain B) → 5653-HUDPERF (chain C).

**Serial chains (one open PR each; the hot files from THROUGHPUT plus the ones above)**
- **A js/game.js:** #6572 #6564 #6538 → 6544-U8a → 6545-P7 → U8b → 6493-P4 → 6480-RESCUE → 6506-P2 → 6559-S6a → 6545-P9a →
  P12a → P10a → P10b → 6553-P1k → 6454-2 → 6482-11 → 6483-1a → LO1 → 6559-S0b → 6565-AI4.
- **B css/ (all sheets, hud.css included):** U30a+#6588 → SURVEY-FIX → 6570-U1 → U2 → U3 → (M3 gardener css) → 4448-S8 →
  6542-LO3.
- **C js/ui/hud.js:** (M3) 6455-2a → dom-helpers → 6455-2b → 5653-HUDPERF → (M12) 6543-I2 → I11.
- **D sw.js:** #6525 → 6544-U13 → 4274-SW → 6547-S11a.
- **E tools/manifest.cjs:** one open, first-ready first: 6545-P7, 6559-S0a, 6545-P2, S0c, B2, drills, 6547-S9 → S11b →
  S12b, S11a.
- **F js/agent/apex.js:** #6564 → 6560-L1 → 6559-S0b → 6547-S10 (ready stop, last).
- **G js/render/three/tlx.js + tsl-lit.js:** #6525 → 6577-A → 6577-R1L → 6509-I8a → S7a → 6515-P1 → 5315-LAB → 5777-TLXS
  → 6486-SAFARI.
- **H tests/data/ratchets.d:** one fragment per branch. The PROTECTED ratchet PR (6570-U4 + 6455-12f) goes alone.
- **I land.yml (PROTECTED):** #6591 → 6584-PT → #6456-10.
- **J js/agent/apex-bridge.js:** #6586 → #6594 → #6581 part 2 → AP-b → U8 → MD → U4 → U6 → U5 → U9 → 6548-5.
- **K .claude/hooks + settings.json (PROTECTED):** #6595 (+#6458-2, 6544-U14).
- **By file, unchanged from OVERNIGHT-QUEUE §2 Chains:**
  - collide.js: #6527 → P2 → batch-2 → RESCUE → 6483-1b → 4270-WALL.
  - ⊕ ai-drive.js: #6568 → 6546-P10 → 6575-AI3a → R1b1 → R1b2 → 6575-AI3b → AI4.
  - player-forces.js: #6572 → 6573 → 6553-P1 → R1b1 / R1b2.
  - quali-calibration: #6568 → AI1 → R1b2 → AI4. physics-baseline: R1b2 → 5652-BAH.
  - settings-export(-body): U7 → U15 → U22 → U26 → P2 → P3 → 6548-11. modal.js: domkit → 6461-U27 → P10a → P11a.
  - The rest as in OVERNIGHT-QUEUE §2 Chains: results-sheet, dom.js, desktop-graphics, engine, hub, phone-pad-page,
    net, flyby, pace-math, glx, chunk-bins, quality-preset, wgx-chunked, lod-kinds, tlx-chunked, glsl-post, learn-door,
    tools/README and tools/ci.

## 3. Morning list for Bryce (AskUserQuestion, ≤ 4 per batch, in this order; ★ = recommended)

**FYI, no question:** #6572 = A. A HARD race confirms #6572 + #6568 + #6573 in the window, then he taps land on 6573.

**Protected `config-ok` taps** (each built to draft-green overnight, never further):

| M1 | PR / unit | state expected at 15:00Z |
|---|---|---|
| a | #6595 hooks (#6469 A+B, #6451 gardener row, + #6458-2, 6544-U14) | draft-green. Check the label provenance first (§1 act 3) |
| b | #6591 two trains | re-ticked 10:45Z on 7421a3df; a new push needs his re-tick |
| c | 6584-PT, the land.yml push trigger for trains | draft-green if #6591 merges overnight |
| d | #6557 P5 pre-push (.githooks) | in flight (trims worker) |
| e | #6456-10 land.yml inline bash (D8-granted) | after 6584-PT (chain I); likely a morning launch |
| f | 6556-U8 (merge-hygiene, gen-test-groups `--help`) | after U1+U0 |
| g | 6569-A5 parse cache (ratchets.mjs) | trims worker, last |
| h | the ratchet PR (6570-U4 + 6455-12f) | only if M3 = yes |

**Decisions outside the grant:**

| # | issue | question | options (★ pick) |
|---|---|---|---|
| M2 | #6552 | Gardener plan for tools/tests | ★ items 1–9 in plan order, one carve at a time / top 3 / none. Sub-calls: median of an empty list returns null ★; empty name → "" ★; one retry policy, 4 tries at 90 s ★; archive item 9 ★; 3b out ★ |
| M3 | #6548 #6455 | UI gardener | ★ ordered list / pins + ratchet rows + metrics move only / none. Sub-calls: 7b stricter share-code enum ★; tokens stay constant (white on red in every theme) ★; keep the name fonts-hud.css ★; 6455-11 DETAILS-aware focus ★; 6455-12e CVD palette ★ |
| M4 | #6495 | Gardener lane width | 1 open (today) / ★ 2 when plans and files are disjoint |
| M5 | #6495 #6456 #6479 | The rest of the master plan: orders 9, 11, 13–17, 20; #6454-3..7/9; D8 frac=0; #6456-2 (dedupe with #6552-7); the ungranted #6479 rows and 6504-P3 | ★ queue all in #6495 order after D1–D8 / pick some / later |
| M6 | #6570 | R6 Season chips → SettingRow (fold into P6b) ★ / record an exception. R7 a commit sheet focuses its primary unless destructive ★ / leave it | ★ both |
| M7 | #6546 | P9: an OT allowance granted while OT is off lapses at the next line | ★ hold it like `_otHold` / keep the lapse |
| M8 | #6542 | LAST OUT | ★ 40 s timer, paused under race control; ★ the Race Settings grid; ★ a FORMAT row beside DUEL / per-lap, a fixed 10, its own tile |
| M9 | #5777 #3115 #5651 | D-WGX | ★ freeze (opt-in; crash and validation fixes only) / keep parity / retire |
| M10 | #6486 | APEX tier | ★ a new APEX tier above EXTREME (desktop TLX WebGPU) + accept the GFX-CONTRACT carve-out / fold into EXTREME |
| M11 | #6515 #6519 | Facade pilot circuit; the one lamp-shadow predicate | ★ Monaco / Monza; predicate: ★ IS_MOBILE everywhere (the worker shows A/B shots) / MOBILE_TIER |
| M12 | #6543 #6553 | Q-FEEL multiSelect; his iOS version | ★ I1 + I2 + I3 / I4 / I5 / I7 / I8 / I11 / I12 / later; iOS version from Settings › General › About |
| M13 | #6557 #6569 #6552 | Test coverage calls | P4b (over-road browser specs only on mesh diffs + nightly): ★ yes if the P4a delta is mesh-capture only. A3: ★ B tier move / A cache. A4 VM boot reuse: ★ one file at a time, same seed / skip. #6552-10 twin-spec retire: ★ after P4a |
| M14 | #6458 | Lean worker env (connector settings) | ★ turn off BrowserStack, Drive, TinyFish, Docs, Academy for workers / keep |
| M15 | #6536 #5410 | His hands in the Actions UI | ★ delete the ghost-registration runs, the 11-11 zombie queued runs and the WORKER_FIRE_* secrets / leave |
| ⊕ M16 | #6577 (#4272) | Render-perf defaults after the device A/Bs | Row 1, phone mirror at 30 Hz on TLX (the R1L flag): ★ flip the default if fps gains and the look passes / keep every frame. Row 4, packDecodeWorker: ★ ON after the phone A/B / off. Row 7, SSGI skip-when-dim or quarter-res on EXTREME: ★ after the Mac GPU ms / leave. Row 3, the three.js for-of patch: ★ only if the iPhone allocation profile shows the same loops / skip |
| M17 | #6049 | Device window time | ★ 30 min phone + 15 min Mac in one window / split |

**Phone window** (TLX WebGPU, Claude Link, 25-step batches and #6594 plans; results go in a docs/notes DEVICE-CHECKS
file). Only true device items; layout went to emulation.
- **Feel:**
  - HARD race at ×1.0, notch 17 (#6572 + #6568 + #6564 grid), with the ✋ 6573 brake mid-corner tap.
  - 6565-DEV HARD laps; 6563-R1b2 if reached.
- **GPU and perf:**
  - #6577 row 1 (R1L flag A/B fps), row 2 (writeBuffer bytes with the mirror on and off), row 4 (worker decode A/B).
  - #5777 R11 (overcast day, gpuErrors + snap); #5315 row 4 (memState tlxMirror).
  - #4798 row 3 (boot marks); #4274 (time-to-race ×3, reload/crash).
- **Safari / iOS only:** #5218 F5 (Safari tab, race + pause geom); #5218 Home Screen app reading; #5901 A9 (first-visit
  banner); #5315 row 2 (rotation, portrait hold).
- **✋ Touch, haptics, audio:**
  - 6448-U18 cold first tap; 6461-U27 double tap; #6366 touch crossover (#6378).
  - #4273 (edge-swipe BACK, double-tap shield, VoiceOver, backgrounding); #5901 A30 (edge swipe).
  - #4270 §4 ears; 5372-LORE listen.
- **✋ Paired phones:** 6449-U16 reload; the #6049 rows #5236, #5328, #5649, #5541; the 5496 VS FRIEND check, then close #1576.
- **Only if the survey couldn't settle them:** #5775 R9, #5783 L1, #5901 13b.

**Mac window** (#6416/#6417):
- **GPU:**
  - #6486 check 0 (Chrome EXTREME + MAX: shed, rAF, maxLights); #6525 Monza close-up EXTREME; #5777 R12b
    (`?renderer=glx` garage floor); #5315 row 4 desktop.
  - 6509-S0 HD baseline; 6509-I8a ASTC opt-in (Chrome + Safari); 6445-U20 DOF; #6577 row 7 SSGI GPU ms.
  - ✋ #6577 row 3: Safari Web Inspector JS allocations, iPhone on a cable. 6547-S9/S10 if reached; the 5651/5777 look A/Bs.
- **Network:** #5712 nostr relays.
- **✋ Controllers:** 6553-S0 WebHID spike; 6544-U11 pad.
- **Afterwards:** tick #6049, #6416, #6417, #6378.

## 4. Orchestrator picks it MAY make overnight (Bryce's 10:45Z grant)

Each one is logged as "orchestrator pick under Bryce's 10:45Z grant". Every pick is reversible (reopen, revert, flip a
flag) and changes no physics feel, no default he plays with, no save and no test coverage.

| pick | decision → choice | why it is within the grant |
|---|---|---|
| G1 | D-3665-BOARD → close #3665 | The 8 MiB cap shipped (#6183). Nothing changes; reopen restores it |
| G2 | D-4785-CLOUD → close #4785 as superseded by the Claude Link windows | No secrets or workflow added; no coverage removed (nothing ran) |
| G3 | D-5212-CLOSE → close the 11-09 orchestration redesign as superseded (#6561, #6589, trains) | Process record only |
| G4 | D-4798-DEFER → leave the feel.js/xr-opts.js defer trap; #4798 stays open for its row 3 | No CAMERA FEEL or VR row moves: defaults unchanged |
| G5 | D-4274-MUSIC → keep decoding on desktop | Status quo |
| G6 | D-5318-SETTINGS → skip the cosmetic settings.json rows; close #5318 with "reopen to apply" | No change. ⊕ 6556-U8 also drops settings.json (:104 kept, :205 skipped) |
| G7 | #2631 → fold into #6547 (auto:decimate + detail-0 census already accepted); close after 4680-NOTE | Tracking only |
| G8 | #6556 merges → the 6 thin aliases + the menu-fit port; near-dups later | Tool entry points only; coverage unchanged |
| G9 | g2-handoff → yes, one carve (3 pid-tree walkers → one) | Tools refactor; reversible; not a gardener-plan item |
| G10 | 6569-A1b → no new cron; A1a's coverage test trips and the tripping PR refreshes | Adds nothing; coverage unchanged |
| G11 | 6485-P3 decal rebind in photo mode → fix | A bug fix; no default or look choice |
| G12 | ⊕ #6577 row 1 → build 6577-R1L as an opt-in lab flag; **D-4272-MIRROR is not closed** and goes to M16 | Default unchanged. The queue's "keep every frame / close" is withdrawn on #6577's 40–53 % CPU evidence |
| G13 | ⊕ 6509-I8a → land default-off (pixel-identical default) | No default change; it unblocks chain G |
| G14 | #6582 units in the fast lane | Bryce's own 10:08Z relay; listed for the log |

**Not picked** (feel, defaults, saves or coverage): M2–M16. The gardener rule also needs his own pick. #6573's land tap
is his feel call.

## 5. Close list (orchestrator, one comment each with the evidence)

| issue | evidence | action |
|---|---|---|
| #6528 #6463 #6432 #5810 | #6561 fixed #6528; #6463's rule is on the tip; #6432 decision A applied; #5810's phone part is done | close completed |
| #6439 #5420 #3899 #6362 | stale base-red; dispatch.yml deleted (#6549); #6362 not reproduced (#6370 closed) | close not planned |
| #3104 | only F6 is left (upstream three #30560) | close with a re-check note for the next three bump |
| #3665 #4785 #5212 #5318 | G1, G2, G3, G6 | close, each note naming the grant pick |
| ⊕ #6460 | all 3 rows live elsewhere: row 1 = #6448, rows 2/3 = #6449 | close as tracked in #6448/#6449 |
| #2631, #4680 | 4680-NOTE records the 54-cell A/B | close when 4680-NOTE lands |
| #5901 | every child is closed | move 13b (survey) and A9/A30 (#6049) first, then close |
| #3117 | F4 only | close if the slow/page-a max is ≤ ~360 s over ~5 tip runs |
| #6587 | the same defect as #6544 items 1/3 | keep open; the 6544-U7 PR says "Closes #6587" |
| #6504 | closes with #6532 (train) | file the fmtLap/wrapS tracker first (ACT-house) |
| #1576 | only the 5496 two-device check is left | close after the morning check |
| ticks only | #4274 rows 1-3/5-8 and #4270 §5 (superseded); #6536 R3 done by #6589; #6458 items 1, 3, 4, 5, 7–10 | tick with a note |
| #6571 | already closed 10:21Z | none |

**Keep open:**
- **Trackers:** #1780, #2394, #6049, #6495, #6416, #6417, #6378, #6582, #6577 and #4272 (→ M16).
- **Epics:** #6545, #6547, #6559, #6509.
- **Per-drill specs:** #6550, #6551, #6554, #6555.
- **Parked:** #2945, #1607, #1566.
- **Close as their units land:** #6459, #6461, #6507, #6544, #6478, #6570, #6546, #6480, #6506, #6493, #6485, #6573,
  #6575, #6583 (#6590), #6584 (#6591 + PT), #6585 (#6593), #6576 (#6579), #6581 (part 2).

## 6. Counts

- **Units:** OVERNIGHT-QUEUE's list had 398 rows (347 distinct + 51 dup ids). Tonight adds 8: 6582-AP-b, 6582-MD,
  6577-R1L, 6577-R4a, 6575-AI3b (6575-AI3 → AI3a), 6553-P1k, SURVEY-FIX and 6584-PT. **406 rows.**
- **Status after tonight's changes:**

  | READY | BLOCKED | NEEDS-BRYCE | COVERED | DONE | STALE | PICKED (no build) | dup |
  |---|---|---|---|---|---|---|---|
  | 104 | 108 | 91 | 23 | 14 | 8 | 7 | 51 |

  - DONE +6: 6536-land-thin (#6589), 6436-sync (#6436), 6536-items-1/2/4-6 (#6549), 6455-3 (#6530), 6557-P1/P6/P9
    (#6574), 6481-K1 (#6522).
  - COVERED +2: 6582-U7 (#6594), 6557-P5 (trims).
  - NEEDS-BRYCE −12: 10 grant picks (7 need no build; 3 become READY: 6556-merges, g2-handoff, 6485-P3); 6557-P5 is now
    COVERED; 6456-10 is now BLOCKED (granted; chain I).
- **Next 2 hours:** 8 launches (5 browser, 3 fast; row 2 by CONTINUE if vZGP is live), 4 messages and 6 acts. Expected
  reach by 15:00Z: ~16–20 launches.
- **Protected at draft-green by morning:** up to 4 (#6595, #6591, 6584-PT, the P5 pre-push). 8 taps listed in M1.
- **Morning:** 16 decisions (M2–M17) plus M1. Phone window 25 items + 3 conditional (11 ✋), Mac window 14 items (3 ✋).
- **Grant picks:** 14. **Close now:** 14 issues; 7 conditional closes; 4 tick-only rows.
