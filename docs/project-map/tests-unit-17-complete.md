# Unit group 17 — complete semantic source map

Read-only inventory, 2026-10-27. All 19 manifest files (4,840 lines) fully read; initial truncated combined reads were repaired by bounded smaller reads. No tests, browsers, source edits or commits. Ranges are one-based inclusive and hashes are SHA-256 of the snapshot. Each row covers one test declaration; dynamic titles expand as stated in fixture notes. assertionSpans gives complete assertion-call ranges (including nested callbacks), never predicate dumps. Helper assertions outside a case are listed separately. File fixture/limits notes apply to all its rows.

Navigation evidence: local shell fallback `bash tools/mcp/lsp-mcp.sh` outlines resolved FlybySeq (65 exports), Forecast (11), CamFovFit (5), FlyingStart (6). Definitions resolved FlybySeq.poseFromWorld at flyby-seq.js:812-833; planShot at :1890 (module-file fallback explicitly leaves export/caller coverage unverified); introPrepare at game.js:3821-3854 and menuFinish at :2214-2234. FlybyPanel/FlybySight compact outlines expose zero exports because of their object-return shapes: direct bounded source reads establish their operations instead. These lookups are navigation evidence, not execution.

## tests/unit/flaky-quarantine.test.mjs

Read: 1-306; SHA-256: `4c11d17a93a2a2a9ca6740b8f5c2744f916cf12b503bd433640140f0621d233d`.

Target: tests/helpers/flaky-policy.mjs; tests/helpers/live-reporter.js; tools/ci/select-specs.mjs; tools/ci/run-playwright.mjs; .github/workflows/ci.yml.

Fixtures / limits: Live quarantine JSON and Playwright collection via --list (no browser); owned temporary ledger rows; reporter doubles with captured lines; synthetic planner timing DB. Exact spec+title+optional first-error signature, inclusive expiry and fail-closed metadata are policy; planner spec membership alone never waives a verdict. Synthetic spec/location keys are descriptive fixtures, not live repository references. Source guards prove wiring only.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| every quarantine row names a spec that exists and carries since/owner/why | 18-38 | 19, 22-26, 29-30, 32, 35-36 | File target above. every quarantine row names a spec that exists and carries since/owner/why. |
| every exact quarantine title is collected by the real browser runner | 40-63 | 47, 60-61 | File target above. every exact quarantine title is collected by the real browser runner. |
| the loader returns the quarantined spec paths, and an empty set for a missing file | 65-71 | 67-70 | File target above. the loader returns the quarantined spec paths, and an empty set for a missing file. |
| verdict: a quarantined flake is reported, an unlisted one blocks, none means pass | 73-87 | 79, 81-82, 84-86 | File target above. verdict: a quarantined flake is reported, an unlisted one blocks, none means pass. |
| the switch is APEX_FAIL_ON_FLAKY=1 and nothing else | 89-94 | 90-93 | File target above. the switch is APEX_FAIL_ON_FLAKY=1 and nothing else. |
| ci.yml arms the policy on every browser job that retries | 96-102 | 100-101 | File target above. ci.yml arms the policy on every browser job that retries. |
| the live reporter reads the verdict from the policy module, not from a CLI flag | 104-110 | 106-107, 109 | File target above. the live reporter reads the verdict from the policy module, not from a CLI flag. |
| the reporter keys a test on its SPEC, not on the file that declared it | 112-138 | 125-126, 130-132, 136-137 | File target above. the reporter keys a test on its SPEC, not on the file that declared it. |
| the verdict line counts skips apart, and a run that executed nothing is RED | 140-164 | 158-160, 162-163 | File target above. the verdict line counts skips apart, and a run that executed nothing is RED. |
| the selected gate honours the quarantine: its specs get a leg of their own with one retry, nothing else is retried | 166-205 | 178, 180-181, 183, 185, 195, 202-204 | File target above. the selected gate honours the quarantine: its specs get a leg of their own with one retry, nothing else is retried. |
| a quarantine row waives its exact title only, and only through its inclusive expiry | 223-238 | 228, 230, 232, 234, 236 | File target above. a quarantine row waives its exact title only, and only through its inclusive expiry. |
| a one-test quarantine cannot waive sibling tests of the same spec | 240-251 | 247 | File target above. a one-test quarantine cannot waive sibling tests of the same spec. |
| invalid quarantine identity or review metadata cannot waive a failure | 253-266 | 262, 264 | File target above. invalid quarantine identity or review metadata cannot waive a failure. |
| a signature row waives only its own failure: the same test failing with another message still blocks | 268-292 | 276-283, 288, 291 | File target above. a signature row waives only its own failure: the same test failing with another message still blocks. |
| the reporter hands the first failed attempt's error to the verdict | 294-306 | 305 | File target above. the reporter hands the first failed attempt's error to the verdict. |

## tests/unit/flicker-metric.test.mjs

Read: 1-203; SHA-256: `dec2ddf5e4844460a6ab335f725f1dcdbfbc0646e4f250c9dcb3bf6274a3bd13`.

Target: tools/lib/flicker-metric.mjs; tools/shot/flicker-gate.mjs.

Fixtures / limits: 96×64 synthetic gradient/edge frames, deterministic mulberry32 fights and isolated pixels; site-table filesystem checks. Measures Rec.601 luma, >48 flip threshold, 2-of-4 flips and 8-connected cluster floor; arithmetic and CLI selection only, no GPU z-fight evidence.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| luma is Rec.601 and rejects a short buffer | 53-57 | 55-56 | File target above. luma is Rec.601 and rejects a short buffer. |
| flip mask, frame delta and 8-connected clusters | 59-72 | 61-62, 67-68, 71 | File target above. flip mask, frame delta and 8-connected clusters. |
| a stable scene scores zero and passes | 74-80 | 77-79 | File target above. a stable scene scores zero and passes. |
| a z-fight region re-rolling on every jitter frame is found and fails its ceiling | 82-95 | 89-91, 93-94 | File target above. a z-fight region re-rolling on every jitter frame is found and fails its ceiling. |
| the rejected AND-of-two-moves design would have erased the same fight (why 2-of-4) | 97-105 | 104 | File target above. the rejected AND-of-two-moves design would have erased the same fight (why 2-of-4). |
| a sub-pixel edge shift (real geometry under a tiny dolly) is not counted | 107-122 | 120-121 | File target above. a sub-pixel edge shift (real geometry under a tiny dolly) is not counted. |
| isolated speckle below the cluster floor is dropped | 124-134 | 132-133 | File target above. isolated speckle below the cluster floor is dropped. |
| A != A2 (an unfrozen time source) is its own failure, even with no fight | 136-146 | 141-142, 144-145 | File target above. A != A2 (an unfrozen time source) is its own failure, even with no fight. |
| frame-size and jitter-count mismatches throw instead of scoring garbage | 148-152 | 150-151 | File target above. frame-size and jitter-count mismatches throw instead of scoring garbage. |
| the gate's site table is well-formed and names real circuits | 154-169 | 155, 158-165, 167-168 | File target above. the gate's site table is well-formed and names real circuits. |
| dolly moves eye and target together along the view ray | 171-178 | 173-177 | File target above. dolly moves eye and target together along the view ray. |
| inexactSites lists the sites whose A and A2 differ, worst first; exact and skipped sites are not listed | 182-187 | 184-186 | File target above. inexactSites lists the sites whose A and A2 differ, worst first; exact and skipped sites are not listed. |
| --a3 is an opt-in flag; extra settle rounds are on unless --no-settle | 189-194 | 190-193 | File target above. --a3 is an opt-in flag; extra settle rounds are on unless --no-settle. |
| chooseSites runs --site in the order given; no --site is the whole table | 198-203 | 199-202 | File target above. chooseSites runs --site in the order given; no --site is the whole table. |

## tests/unit/floodmast-lamp-register.test.mjs

Read: 1-110; SHA-256: `65ef1d00765088c50d444d10bc19bbb464b0f413f7d63cf751c2b818b5351f80`.

Target: js/track/scenery/build-props.js; js/track/scenery/identity.js; js/circuits/scenery/singapore.js; js/circuits/scenery/bahrain.js; js/circuits/scenery/qatar.js; js/circuits/scenery/hungaroring.js; js/circuits/scenery/imola.js; tools/track/verify-track.cjs.

Fixtures / limits: Real night track builds for Singapore/Bahrain/Qatar/Hungaroring/Imola. Fresh wrapped scenery intercepts lampPost registration; over-cap fixture adds 200 ordinary and six always lamps. Holds registration, 160 cap and warning policy; no rendered pools or luminance.

Harness assertionSpans: 23 (harness existence/setup and callback contract checks, inherited by cases using that harness).

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| singapore floodMastRing registers mast lamps (floodlights excluded) | 29-37 | 33-34, 36 | File target above. singapore floodMastRing registers mast lamps (floodlights excluded). |
| bahrain floodMastRing registers mast lamps (floodlights excluded) | 39-44 | 42-43 | File target above. bahrain floodMastRing registers mast lamps (floodlights excluded). |
| qatar Musco masts register as the night lighting rig | 46-54 | 49-50, 53 | File target above. qatar Musco masts register as the night lighting rig. |
| hungaroring: every lampPost() call is lit, braking-zone clusters included (S1) | 75-82 | 79-81 | File target above. hungaroring: every lampPost() call is lit, braking-zone clusters included (S1). |
| a circuit within the cap keeps its lamp set whole (imola) | 84-88 | 86-87 | File target above. a circuit within the cap keeps its lamp set whole (imola). |
| over the cap: always-on lamps survive, the rest thin, one warning | 90-110 | 104-109 | File target above. over the cap: always-on lamps survive, the rest thin, one warning. |

## tests/unit/flyby-audit-rules.test.mjs

Read: 1-88; SHA-256: `e7f4d1515e6b59adcd9b21688cc40298e1b08ea66aa68d59331e3083b4ccd300`.

Target: tools/lib/flyby-audit.cjs; tests/helpers/flyby-audit-rules.mjs.

Fixtures / limits: Flat stub world, 10m road half-width, marked inside-prop height, scripted sequencer and 400/200 samples. Negative controls show one matching finding for each injected defect; no real geometry or image quality.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| a smooth, grounded shot yields no findings (the control's control) | 47-49 | 48 | File target above. a smooth, grounded shot yields no findings (the control's control). |
| a vertical pop between two samples is reported as a jump | 51-54 | 53 | File target above. a vertical pop between two samples is reported as a jump. |
| a crane-high planned lift is reported | 56-59 | 58 | File target above. a crane-high planned lift is reported. |
| an eye below the ground is reported as underground | 61-64 | 63 | File target above. an eye below the ground is reported as underground. |
| a grid shot looking across the infield is reported as a sightline off the road | 66-69 | 68 | File target above. a grid shot looking across the infield is reported as a sightline off the road. |
| a whip pan faster than 45 deg/s is reported; a 25 deg/s pan (the planner's PAN_MAX) is not | 71-77 | 75-76 | File target above. a whip pan faster than 45 deg/s is reported; a 25 deg/s pan (the planner's PAN_MAX) is not. |
| an eye inside a solid prop is reported | 79-82 | 81 | File target above. an eye inside a solid prop is reported. |
| the varied-load rules report the same defects, with the seed in the message | 84-88 | 87 | File target above. the varied-load rules report the same defects, with the seed in the message. |

## tests/unit/flyby-fleet.test.mjs

Read: 1-44; SHA-256: `cf335dd06b9c609fd39072b5a6023be6fbf4e6d33fff05f453da8f1aa6ac64d2`.

Target: js/camera/flyby-seq.js; tools/lib/flyby-audit.cjs; tests/helpers/flyby-audit-rules.mjs.

Fixtures / limits: One real game VM reraced per circuit, always closed. FLEET has 12 named circuits at 400 samples; VARIED has Monza/Monaco/Mont-Tremblant, seeds 0–5 at 200. Shared rules: jump >4m, lift >=25m, underground >0, grid sightline >2m past edge, pan >45deg/s, non-road containment. Varied rules omit jump/gridOff. Sampling/box model cannot establish all intervening frames or GPU appearance.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| fleet: no pop, no crane, no eye underground, grid sightline on the road, no whip pan | 36-39 | 38 | File target above. fleet: no pop, no crane, no eye underground, grid sightline on the road, no whip pan. |
| varied flybys hold the fleet audit too (seeds 0-5 on three circuits) | 41-44 | 43 | File target above. varied flybys hold the fleet audit too (seeds 0-5 on three circuits). |

## tests/unit/flyby-frame-report.test.mjs

Read: 1-79; SHA-256: `103e9258ce122ddf8a9794eaee79f6c3b765b6855fa6a3afc20e2fbf40211fc7`.

Target: tools/shot/frame-report.mjs; js/camera/flyby-seq.js; js/camera/flyby-sight.js.

Fixtures / limits: Child Node JSON report on Spa/Monza/Monaco with thumbnails disabled. Per-shot flags and score floors, landmark coverage and lap visibility pinned to measured regression evidence. Scores are regression floors, not universal visual requirements; box-model analysis does not render the game.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| frame report: the subject landmark stays in the scene (Spa's stands framed, not 0 %); Spa's wide shots see more lap | 43-60 | 46-48, 55-57, 59 | File target above. frame report: the subject landmark stays in the scene (Spa's stands framed, not 0 %); Spa's wide shots see more lap. |
| frame report: Monza's wide shots tilt the horizon down out of the lawn; Monaco's grid walk steps off its barrier | 62-78 | 65-66, 68-70, 76 | File target above. frame report: Monza's wide shots tilt the horizon down out of the lawn; Monaco's grid walk steps off its barrier. |

## tests/unit/flyby-intro.test.mjs

Read: 1-722; SHA-256: `f5b34e9e5f26ff8e061932b05431fd0457b2dbacb4b500b7df83a0897fac3945`.

Target: js/game.js; js/perf/race-entry-profile.js; js/lighting/lamp-bake.js; js/lighting/atmosphere.js.

Fixtures / limits: gameSource union and symbolSource preserve carved modules; source-order guards plus extracted real functions in controlled VM contexts. Deferred planner/compiler promises, fake 3ms active CPU clock, delayed timers, ownership flags, lamp slices and profile passthrough. Matrices include ready/slow/quit/supersede/settings/cancel/timeout/fetch failure, both cold paths and authored shots. Covers ownership and preparation barriers; stubs do not compile shaders or drive a real garage animation.

Harness assertionSpans: 300, 310, 315, 321 (harness existence/setup and callback contract checks, inherited by cases using that harness).

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| the menu build warms its shaders BEFORE the slow extras (lamp pre-bake, flyby plans) | 29-54 | 34, 36-37, 42-43, 48-53 | Operations: planSteps. the menu build warms its shaders BEFORE the slow extras (lamp pre-bake, flyby plans). |
| RACE! before the menu's build: prepare under the card, then drive out and fly | 56-82 | 59, 64-70, 72-75, 78-81 | File target above. RACE! before the menu's build: prepare under the card, then drive out and fly. |
| introBuild awaits a mismatched-tier picker abort before its own loadTrackStepped | 84-142 | 111-112, 129-131, 134, 138-141 | File target above. introBuild awaits a mismatched-tier picker abort before its own loadTrackStepped. |
| intro builds cancel at async boundaries and never fly over pending compilation | 144-208 | 175, 187-189, 191-193, 195-196, 203-206 | File target above. intro builds cancel at async boundaries and never fly over pending compilation. |
| cold intros await compilation before drive-out and cut directly afterward; cancellation, failure and skip omit motion | 210-259 | 226, 231, 233, 238, 240-241, 247, 251, 253-256 | File target above. cold intros await compilation before drive-out and cut directly afterward; cancellation, failure and skip omit motion. |
| raceIntro reuses identically authored prepared shots but honours edits made after planning | 261-274 | 271-272 | File target above. raceIntro reuses identically authored prepared shots but honours edits made after planning. |
| every flyby run opens on a CUT: FlybySeq.reset() before the run and before hidden warm frames | 276-282 | 279, 281 | Operations: reset. every flyby run opens on a CUT: FlybySeq.reset() before the run and before hidden warm frames. |
| the world key includes the grid size, and a failed build does not keep the old id | 284-290 | 286-289 | File target above. the world key includes the grid size, and a failed build does not keep the old id. |
| cold intro planning and compilation overlap and both must finish before readiness | 345-360 | 349-352, 354, 356-358 | File target above. cold intro planning and compilation overlap and both must finish before readiness. |
| intro preparation that already owns compilation does not request another warm | 362-370 | 365-367, 369 | File target above. intro preparation that already owns compilation does not request another warm. |
| an intro canceled before shader kickoff never requests a stale warm | 372-379 | 375-376, 378 | File target above. an intro canceled before shader kickoff never requests a stale warm. |
| cancellation during overlapped preparation retires both continuations | 381-389 | 384-385, 387-388 | File target above. cancellation during overlapped preparation retires both continuations. |
| immediate planning failure prevents shader kickoff and is handled | 391-396 | 394-395 | File target above. immediate planning failure prevents shader kickoff and is handled. |
| failure in either preparation branch retires its sibling and handles late rejection | 398-412 | 403-405, 409-410 | File target above. failure in either preparation branch retires its sibling and handles late rejection. |
| skipped shot planning still waits for required shader preparation | 414-420 | 417, 419 | File target above. skipped shot planning still waits for required shader preparation. |
| night lamp preparation overlaps shaders but readiness waits for its final slice | 422-436 | 425-427, 429, 431, 433-435 | File target above. night lamp preparation overlaps shaders but readiness waits for its final slice. |
| warm-ready garage preparation finishes partial lamps without another shader request | 438-445 | 441-442, 444 | File target above. warm-ready garage preparation finishes partial lamps without another shader request. |
| existing compilation releases the scene before lamp inputs are resolved | 447-457 | 450-452, 454, 456 | File target above. existing compilation releases the scene before lamp inputs are resolved. |
| canceling a lamp slice cannot run or install its queued continuation | 459-465 | 463-464 | File target above. canceling a lamp slice cannot run or install its queued continuation. |
| lamp failure retires planning and shader continuations with no unhandled late failure | 467-475 | 470-471, 474 | File target above. lamp failure retires planning and shader continuations with no unhandled late failure. |
| prepared night lamps make the actual synchronous flyby bake a cache hit | 477-504 | 494, 497-499, 501-503 | File target above. prepared night lamps make the actual synchronous flyby bake a cache hit. |
| intro planning completes every cheap shot despite long compiler delays between slices | 537-544 | 540-543 | File target above. intro planning completes every cheap shot despite long compiler delays between slices. |
| intro planning retains an 800ms active work budget and yields only when more work is allowed | 546-551 | 548-550 | File target above. intro planning retains an 800ms active work budget and yields only when more work is allowed. |
| one indivisible expensive shot cannot trigger another step beyond the planning budget | 553-558 | 555-557 | File target above. one indivisible expensive shot cannot trigger another step beyond the planning budget. |
| intro planning rechecks cancellation after a delayed yield; a garage skip keeps planning (the flyby still flies it) | 560-568 | 562-564, 566-567 | File target above. intro planning rechecks cancellation after a delayed yield; a garage skip keeps planning (the flyby still flies it). |
| finished cold compilation retires hidden frames while shot planning is still pending | 571-582 | 576, 578-579, 581 | File target above. finished cold compilation retires hidden frames while shot planning is still pending. |
| an obsolete cold compilation cannot retire its successor's hidden frame allowance | 584-594 | 590, 592-593 | File target above. an obsolete cold compilation cannot retire its successor's hidden frame allowance. |
| a noncold preparation branch cannot retire another owner's hidden frames | 596-603 | 600, 602 | File target above. a noncold preparation branch cannot retire another owner's hidden frames. |
| intro planning batches cheap shots without per-shot timer latency | 606-612 | 608-611 | File target above. intro planning batches cheap shots without per-shot timer latency. |
| intro planning yields after 3ms active batches, excluding delayed timers | 614-620 | 616-619 | File target above. intro planning yields after 3ms active batches, excluding delayed timers. |
| intro planning checks ownership between cheap steps in one batch; a garage skip does not cancel it | 622-630 | 624-626, 628-629 | File target above. intro planning checks ownership between cheap steps in one batch; a garage skip does not cancel it. |
| intro planning still yields after every indivisible 50ms cold shot | 632-638 | 634-637 | File target above. intro planning still yields after every indivisible 50ms cold shot. |
| menu planning batches cheap shots but gives queued world warming one render opportunity | 670-679 | 673-678 | File target above. menu planning batches cheap shots but gives queued world warming one render opportunity. |
| menu planning yields at 3ms active batches despite long timer delays | 681-688 | 684-687 | File target above. menu planning yields at 3ms active batches despite long timer delays. |
| menu planning checks ownership between cheap steps and never publishes abandoned plans | 690-696 | 693-695 | File target above. menu planning checks ownership between cheap steps and never publishes abandoned plans. |
| menu planning rechecks ownership after yielding before any more shot work | 698-704 | 701-703 | File target above. menu planning rechecks ownership after yielding before any more shot work. |
| menu planning retains full completion beyond the intro's 800ms active budget | 706-713 | 709-712 | File target above. menu planning retains full completion beyond the intro's 800ms active budget. |
| menu planning rechecks ownership after its final warm rendering opportunity | 716-722 | 719-721 | File target above. menu planning rechecks ownership after its final warm rendering opportunity. |

## tests/unit/flyby-lighting.test.mjs

Read: 1-170; SHA-256: `0e7b1081223d92d9f268d30d89ac3e2d416780ba7b0edd8059dd7835172fec94`.

Target: js/game.js; js/camera/flyby-seq.js; js/agent/apex-cam.js.

Fixtures / limits: Raw game source sliced with brace balancing and comments stripped; standalone sequencer export evaluation. Source pins settings before loading and after sync/stepped rebuild, and common cinematic lens/roll/fog/cull flags. Does not verify rendered lighting; notably unlike gameSource-based guards it reads game.js directly.

Harness assertionSpans: 45 (harness existence/setup and callback contract checks, inherited by cases using that harness).

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| raceIntro lights the scene before the loading screen runs | 57-68 | 61-67 | File target above. raceIntro lights the scene before the loading screen runs. |
| startRace still re-applies after its rebuild | 70-86 | 82-85 | File target above. startRace still re-applies after its rebuild. |
| the cinematic's render numbers live in one place, as numbers | 105-120 | 115-119 | File target above. the cinematic's render numbers live in one place, as numbers. |
| one flag decides the whole lens, and the preview carries it | 122-150 | 128-129, 134-146, 149 | File target above. one flag decides the whole lens, and the preview carries it. |
| both the live screen and the editor's preview read them | 152-170 | 154-158, 161-162, 166, 168-169 | File target above. both the live screen and the editor's preview read them. |

## tests/unit/flyby-panel.test.mjs

Read: 1-714; SHA-256: `40d44dfdd30271a28918c2bd6f9e005c516c38429286f5de83a8c3171d64506a`.

Target: js/camera/flyby-panel.js; js/camera/flyby-editor.js; js/camera/cam-tuner-boot.js; js/core/script-loader.js; tools/gen/bake-flyby.mjs; js/camera/flyby-seq.js; js/game.js.

Fixtures / limits: Standalone real panel pure operations; minimal two-shot goodList and poisoned variants; Map-backed saved storage; Proxy DOM/free-camera actions; real ScriptLoader with deferred delivery and editor doubles; MutationObserver queue/takeRecords simulation. Both camera and flyby facades expand dynamic cases, route hides expand two settings ancestors. Covers data algebra, validators, bake replacement/comment preservation, persistence, retry/cancellation; no actual editor layout, browser MutationObserver timing or framing pixels.

Harness assertionSpans: 49 (harness existence/setup and callback contract checks, inherited by cases using that harness).

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| flyby shot tabs label the shared rows panel after rebuilds | 31-39 | 33-38 | File target above. flyby shot tabs label the shared rows panel after rebuilds. |
| the pickers reach every corner, a normalised one-shot list, and name the height offset | 68-75 | 69, 71-74 | Operations: normaliseDurs, fieldLabel. the pickers reach every corner, a normalised one-shot list, and name the height offset. |
| #1575: radius-authored editor fields display their live metre equivalent | 77-81 | 78-80 | Operations: metricValue. #1575: radius-authored editor fields display their live metre equivalent. |
| the module freezes and exports its pure operations | 83-89 | 84, 87 | File target above. the module freezes and exports its pure operations. |
| add inserts AFTER the selection and never collides an id | 91-103 | 94-96, 102 | Operations: addShot, validateShots, normaliseDurs. add inserts AFTER the selection and never collides an id. |
| duplicate copies the shot and renames the copy | 105-111 | 107-108, 110 | Operations: duplicateShot. duplicate copies the shot and renames the copy. |
| delete removes one shot and refuses the last | 117-122 | 119, 121 | Operations: deleteShot. delete removes one shot and refuses the last. |
| reorder moves a shot and ignores a move off either end | 124-129 | 126-128 | Operations: moveShot. reorder moves a shot and ignores a move off either end. |
| normalise rescales durations to sum to exactly 1 | 131-137 | 135-136 | Operations: normaliseDurs. normalise rescales durations to sum to exactly 1. |
| switching a pose's anchor carries what the new anchor can still use | 139-147 | 142-146 | Operations: switchPoseAt. switching a pose's anchor carries what the new anchor can still use. |
| COPY VALUES emits the one name bake-flyby.mjs accepts | 151-157 | 153-154, 156 | Operations: toBlob, normaliseDurs. COPY VALUES emits the one name bake-flyby.mjs accepts. |
| the panel's validator and the bake tool's validator agree | 159-175 | 172-173 | Operations: normaliseDurs, validateShots. the panel's validator and the bake tool's validator agree. |
| a good blob validates | 177-186 | 178, 183, 185 | Operations: normaliseDurs. a good blob validates. |
| the panel's pose-number rules accept the shipped DEFAULT, fields it leaves out included | 188-193 | 192 | Operations: shotErrors. the panel's pose-number rules accept the shipped DEFAULT, fields it leaves out included. |
| a present pose field must be a finite number inside its slider range | 195-203 | 197-202 | Operations: shotErrors. a present pose field must be a finite number inside its slider range. |
| a shot's fov must sit inside the FOV slider's range | 207-213 | 209-212 | Operations: shotErrors. a shot's fov must sit inside the FOV slider's range. |
| a saved fov outside the slider is clamped on load, the rest of the list kept | 217-229 | 223-226, 228 | Operations: normaliseDurs, savedForm. a saved fov outside the slider is clamped on load, the rest of the list kept. |
| SET SHOT START from a 110° free-camera view saves a shot that passes shotErrors | 233-268 | 262, 266-267 | Operations: savedForm, normaliseDurs, fromSaved, shotErrors. SET SHOT START from a 110° free-camera view saves a shot that passes shotErrors. |
| n and rank must name a corner, a slot and a landmark | 270-282 | 272-281 | Operations: shotErrors. n and rank must name a corner, a slot and a landmark. |
| loadSaved() refuses a damaged file instead of flying non-finite frames | 284-292 | 289-290 | Operations: normaliseDurs, savedForm. loadSaved() refuses a damaged file instead of flying non-finite frames. |
| a DELTA-named blob is refused, with the reason | 294-302 | 296-301 | Operations: toBlob, normaliseDurs. a DELTA-named blob is refused, with the reason. |
| an unknown pose anchor is refused | 304-311 | 308-310 | Operations: normaliseDurs, toBlob. an unknown pose anchor is refused. |
| durations that do not sum to 1 are refused | 313-324 | 317-318, 323 | File target above. durations that do not sum to 1 are refused. |
| the bake replaces the DEFAULT literal and nothing else | 328-341 | 332-335, 338-340 | Operations: normaliseDurs. the bake replaces the DEFAULT literal and nothing else. |
| a bake keeps DEFAULT's rationale comments | 343-358 | 349, 352-353, 356-357 | File target above. a bake keeps DEFAULT's rationale comments. |
| solve() is handed the saved list, not just a track and a progress | 404-412 | 406, 408-410 | Operations: solve. solve() is handed the saved list, not just a track and a progress. |
| the panel saves on every edit, and a pristine list clears the key | 414-422 | 416-421 | File target above. the panel saves on every edit, and a pristine list clears the key. |
| a saved list is read back through shotErrors, not the bake's sum rule | 424-438 | 432-434, 436-437 | Operations: normaliseDurs, shotErrors, validateShots, savedForm. a saved list is read back through shotErrors, not the bake's sum rule. |
| a saved list round-trips only in the current pose meaning | 457-473 | 460, 465-472 | Operations: normaliseDurs, savedForm. a saved list round-trips only in the current pose meaning. |
| loadSaved hands out a copy, not the store's cached object | 475-485 | 483-484 | Operations: savedForm, normaliseDurs. loadSaved hands out a copy, not the store's cached object. |
| an invalid copy's warning header does not hide the reasons | 489-501 | 498-500 | Operations: validateShots, toBlob. an invalid copy's warning header does not hide the reasons. |
| the literal fallback is data only: no process, no hang | 503-510 | 504-506, 509 | File target above. the literal fallback is data only: no process, no hang. |
| the structural half agrees too — what a PREVIEW is held to | 512-528 | 522-523, 525-526 | Operations: shotErrors. the structural half agrees too — what a PREVIEW is held to. |
| the preview flies a COPY re-taken when the list's contents change | 530-538 | 535-537 | File target above. the preview flies a COPY re-taken when the list's contents change. |
| a camera-editor retry after a partial load failure injects only the file that failed (3-F1) | 543-575 | 569-570, 572-574 | File target above. a camera-editor retry after a partial load failure injects only the file that failed (3-F1). |
| ′${kind} delayed UI open cannot survive close and resume′ | 653-656 | 655 | File target above. ${kind} delayed UI open cannot survive close and resume. |
| ′${kind} pending UI open is cancelled by ${route} hide and reopen′ | 658-663 | 662 | File target above. ${kind} pending UI open is cancelled by ${route} hide and reopen. |
| ′${kind} queued route records cancel fulfillment before observer delivery′ | 665-676 | 671-673, 675 | File target above. ${kind} queued route records cancel fulfillment before observer delivery. |
| ′${kind} only the latest pending open owns the panel′ | 678-681 | 680 | File target above. ${kind} only the latest pending open owns the panel. |
| ′${kind} cached UI opener keeps cancellation after editor handler replacement′ | 683-691 | 685, 687, 689-690 | File target above. ${kind} cached UI opener keeps cancellation after editor handler replacement. |
| ′${kind} explicit API opens outside Settings remain supported and cancellable′ | 693-698 | 696-697 | File target above. ${kind} explicit API opens outside Settings remain supported and cancellable. |
| ′${kind} failed delayed load can be retried′ | 700-705 | 702-704 | File target above. ${kind} failed delayed load can be retried. |
| the latest delayed tuner UI door owns the shared editor load | 709-714 | 713 | File target above. the latest delayed tuner UI door owns the shared editor load. |

## tests/unit/flyby-pose-inverse.test.mjs

Read: 1-100; SHA-256: `fad183d4da1f33228813b0a20b4da6b1b723c4b24e4c627c29bc07d5533ee73c`.

Target: js/camera/flyby-seq.js.

Fixtures / limits: Built Monza via real game VM, closed in finally. Forty near-road points, explicit outside-T1, centre/high/too-near, conditional landmark and held view. Tolerance 0.25m; solver eye error subtracts reported clearance lift. Conditional landmark assertions require available landmarks; no all-circuit inverse guarantee.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| poseFromWorld round-trips every anchor kind on a built circuit | 20-100 | 38-40, 42, 50-53, 59-61, 65, 69-70, 78-79, 87, 90, 92-93, 97-98 | Operations: posePoint, sample, poseFromWorld, cornerS, cornerSide, bounds, landmarks, shotFromView. poseFromWorld round-trips every anchor kind on a built circuit. |

## tests/unit/flyby-shots.test.mjs

Read: 1-1227; SHA-256: `a6cbe3dbce716256c8ae1254fb6e669cfd806b453ff3f47f1e0c1c1fb3e668d2`.

Target: js/camera/flyby-seq.js; js/camera/flyby-sight.js; js/data/flyby-overrides.js; js/race/start-lights.js; js/game.js; js/track/core/mesh.js; js/net/lobby.js; js/ui/loading-screen.js; tools/shot/flyby.mjs; tools/shot/frame-report.mjs; tools/lib/flyby-audit.cjs.

Fixtures / limits: Shared real circuit VMs with setPlayerSlot(11,22)/reset before borrowing; memo caches intentionally retained. Cold-cache/timer tests use fresh VM; after closes pinned and roaming VMs. CLI child --help/invalid args ends before browser boot. Sampled geometry/box audits, synthetic runtime hero/light fixtures, extracted grid-order functions, source wiring guards and CPU-time cache budgets. Monza/Monaco/Bahrain primary containment at 120 samples; additional named tracks and 400-sample audits target known defects. CPU thresholds (<20/<25ms) classify supplied cache hits, not player framerate; no GPU image proof.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| flyby CLI advertises and validates condition and variation flags before browser boot | 97-119 | 99, 101-106, 113-117 | File target above. flyby CLI advertises and validates condition and variation flags before browser boot. |
| saved shots beat circuit overrides, which patch DEFAULT by shot id without mutation | 129-145 | 135-142 | Operations: resolve. saved shots beat circuit overrides, which patch DEFAULT by shot id without mutation. |
| every signature list is playable and keeps its camera out of solid scenery | 147-173 | 153-155, 169 | Operations: resolve, patches, reset, solve, onRoadPose, insideProp. every signature list is playable and keeps its camera out of solid scenery. |
| select honours when:{night,wet} and prefers the most specific match | 175-214 | 185-199, 202-205, 209-210 | Operations: catalog, select, isNight, isWet, whenMatch, resolve, setSession, vary. select honours when:{night,wet} and prefers the most specific match. |
| shotErrors accepts when:{night,wet} and names bad when values | 216-234 | 221-225, 227, 229, 231 | File target above. shotErrors accepts when:{night,wet} and names bad when values. |
| #1571: the flyby hero reaches the apex at mid-shot on the racing line | 245-271 | 264-270 | Operations: driveHero. #1571: the flyby hero reaches the apex at mid-shot on the racing line. |
| #1572: lights 1-3 select grid shots and light 4 restores the player camera | 273-302 | 292-295, 298, 301 | File target above. #1572: lights 1-3 select grid shots and light 4 restores the player camera. |
| #1575: boundaries drive a 150 ms dip, slower under reduced motion, and expose wide-sector progress | 304-322 | 311, 315-321 | Operations: boundaries, setDuration, presentation. #1575: boundaries drive a 150 ms dip, slower under reduced motion, and expose wide-sector progress. |
| #1575: a per-shot sway is optional and disabled under reduced motion | 324-329 | 326-328 | Operations: swayAt. #1575: a per-shot sway is optional and disabled under reduced motion. |
| the shipped flyby never puts the eye inside a building | 331-366 | 364 | Operations: reset, solve, onRoadPose, insideProp. the shipped flyby never puts the eye inside a building. |
| clearance lifts a shot, it does not relocate one | 368-388 | 384-386 | Operations: reset, solve. clearance lifts a shot, it does not relocate one. |
| hidden picker warm sits on turn-first, not the horizon-levelled wide shot | 390-399 | 394-397 | Operations: warmProgress, shotAt. hidden picker warm sits on turn-first, not the horizon-levelled wide shot. |
| each shot is continuous, and only a shot BOUNDARY is a cut | 401-432 | 419, 429 | Operations: reset, solve. each shot is continuous, and only a shot BOUNDARY is a cut. |
| airCorner names the turn a corner shot films, and 0 for every other shot | 434-453 | 442, 444-445, 448, 450 | Operations: reset, solve, airCorner. airCorner names the turn a corner shot films, and 0 for every other shot. |
| the grid anchor matches the grid the race actually forms on | 455-468 | 462, 465-467 | File target above. the grid anchor matches the grid the race actually forms on. |
| sparse scenery hulls are not treated as solid | 470-487 | 477-480, 482-484 | Operations: isSolid, blockers. sparse scenery hulls are not treated as solid. |
| seating the menu grid costs the sim stream nothing | 489-509 | 499, 501-508 | File target above. seating the menu grid costs the sim stream nothing. |
| the flyby editor keeps the world rendering while it is open | 511-533 | 521, 523, 526-527, 529-530, 532 | File target above. the flyby editor keeps the world rendering while it is open. |
| resuming releases the flyby editor's parked camera | 535-551 | 542, 544, 549-550 | File target above. resuming releases the flyby editor's parked camera. |
| a corner's +x is its OUTSIDE, whichever way it turns | 553-574 | 572 | Operations: cornerS, cornerSide. a corner's +x is its OUTSIDE, whichever way it turns. |
| a landmark bearing of 0 is the TRACK side of it | 576-599 | 597 | Operations: bounds, landmarks, posePoint. a landmark bearing of 0 is the TRACK side of it. |
| on a street circuit a corner camera stands at the fence, not in a building | 601-617 | 611-612 | Operations: anchorS, posePoint. on a street circuit a corner camera stands at the fence, not in a building. |
| the clearance lift is PLANNED: no pop inside a shot, and corners step in before they lift | 619-643 | 641 | Operations: reset, solve. the clearance lift is PLANNED: no pop inside a shot, and corners step in before they lift. |
| fleet rules on monza: no pop, no crane, no eye underground, grid sightline on the road, no whip pan | 665-668 | 667 | File target above. fleet rules on monza: no pop, no crane, no eye underground, grid sightline on the road, no whip pan. |
| the pan budget's clock is the loading screen's | 670-678 | 673, 676-677 | File target above. the pan budget's clock is the loading screen's. |
| a centre pose of distR 0 / yR 0 is the centroid, not the clamp | 680-692 | 684-685, 688-689 | Operations: bounds, posePoint. a centre pose of distR 0 / yR 0 is the centroid, not the clamp. |
| landmarks: no gantries, nothing on the road, heights above ground; missing ranks become centre shots | 694-728 | 727 | Operations: landmarks, lmBase, landmarkFallback, posePoint. landmarks: no gantries, nothing on the road, heights above ground; missing ranks become centre shots. |
| a corner ROLE lands on a real corner, not a kink or a chicane flick | 730-746 | 745 | Operations: cornerTurn, cornerS. a corner ROLE lands on a real corner, not a kink or a chicane flick. |
| a planned eye is not inside a tree canopy (Monza turn-first, the frame report's find) | 748-755 | 752 | File target above. a planned eye is not inside a tree canopy (Monza turn-first, the frame report's find). |
| the player's slot anchor is gridSlot()'s own slot: same arc, same stagger | 757-775 | 764, 766, 769, 772 | Operations: setPlayerSlot, slotIndex, anchorS, posePoint, project. the player's slot anchor is gridSlot()'s own slot: same arc, same stagger. |
| corners by character: slowest / fastest / lore resolve to filmable corners | 777-792 | 791 | Operations: cornerS. corners by character: slowest / fastest / lore resolve to filmable corners. |
| vary: one seed, one sequence; every variant is a valid list that keeps the grid close | 794-813 | 798, 802-804, 806, 809-810 | Operations: vary. vary: one seed, one sequence; every variant is a valid list that keeps the grid close. |
| varied flybys hold the fleet audit too (seeds 0-5 on monza) | 815-818 | 817 | File target above. varied flybys hold the fleet audit too (seeds 0-5 on monza). |
| a corner eye in canopy falls back to the road edge (Mont-Tremblant turn-late) | 820-827 | 824 | File target above. a corner eye in canopy falls back to the road edge (Mont-Tremblant turn-late). |
| no racing line in a flyby frame | 829-838 | 835-837 | File target above. no racing line in a flyby frame. |
| one corner, one shot: no flyby films the same corner twice | 840-857 | 856 | Operations: bindCorners, vary, cornerS. one corner, one shot: no flyby films the same corner twice. |
| a NUMBERED corner is the author's: bindCorners never moves it, roles steer around it | 859-872 | 867, 869 | Operations: bindCorners, cornerS. a NUMBERED corner is the author's: bindCorners never moves it, roles steer around it. |
| the clearance grid index finds exactly what a full scan finds | 874-894 | 888, 891 | Operations: blockers, bounds, insideProp. the clearance grid index finds exactly what a full scan finds. |
| the flyby's plans are made before it plays, not at each cut | 896-900 | 899 | Operations: warm. the flyby's plans are made before it plays, not at each cut. |
| the menu grid seats YOUR car where the race will start it, in every mode | 902-941 | 910, 930-932, 934-938, 940 | File target above. the menu grid seats YOUR car where the race will start it, in every mode. |
| a random grid's flyby leaves out the shot of your car | 943-957 | 949-950, 952-954 | Operations: setPlayerSlot, vary, slotKnown. a random grid's flyby leaves out the shot of your car. |
| a duel never leaks into a championship round, a time trial or a quali lap | 959-970 | 964, 967, 969 | File target above. a duel never leaks into a championship round, a time trial or a quali lap. |
| the loading screen flies only the world built for THIS selection | 972-983 | 978-979, 982 | Operations: warm. the loading screen flies only the world built for THIS selection. |
| warm() plans the opening shots at once and the rest in slices, never through solve() | 994-1010 | 1000-1001, 1007 | Operations: vary, reset, solve, warm. warm() plans the opening shots at once and the rest in slices, never through solve(). |
| a grid too small to fill a numbered slot leaves that shot out (time trial, duel) | 1012-1023 | 1015, 1018-1019 | Operations: setPlayerSlot, vary, withoutSlot. a grid too small to fill a numbered slot leaves that shot out (time trial, duel). |
| the menu plans the flyby; the loading screen reuses every plan (no planning mid-flyby) | 1025-1046 | 1036-1037, 1039, 1043 | Operations: setPlayerSlot, vary, planSteps, withoutSlot, bindCorners, reset, solve. the menu plans the flyby; the loading screen reuses every plan (no planning mid-flyby). |
| plans are reused when they still hold, and re-planned when they do not | 1048-1069 | 1057-1058, 1060, 1065 | Operations: setDuration, setPlayerSlot, bindCorners, planShot. plans are reused when they still hold, and re-planned when they do not. |
| the grid's back is the grid that is there: a time trial is not filmed from 19 empty rows | 1071-1086 | 1080, 1084 | Operations: setPlayerSlot, anchorS. the grid's back is the grid that is there: a time trial is not filmed from 19 empty rows. |
| warm() can be retired, and the race start retires it | 1088-1095 | 1090, 1092, 1094 | Operations: setDuration, warm. warm() can be retired, and the race start retires it. |
| withoutGrid: a real race joined mid-race or watched back films no standing grid | 1097-1116 | 1101-1103, 1107-1109, 1111-1113 | Operations: withoutGrid, withoutSlot. withoutGrid: a real race joined mid-race or watched back films no standing grid. |
| FlybySight: a box between the eye and a point hides it; a box the point sits in hides only the DRAWN share | 1128-1148 | 1136-1138, 1140-1141, 1145 | Operations: transmit, camera, nearThirds. FlybySight: a box between the eye and a point hides it; a box the point sits in hides only the DRAWN share. |
| frame-report casts the planner's own box model (FlybySight), not a copy | 1150-1156 | 1152-1155 | File target above. frame-report casts the planner's own box model (FlybySight), not a copy. |
| FlybySight.offRoad: a box across the road at running height is dropped, a bridge-height one and a tree part kept; the planner's scene applies it | 1158-1177 | 1168-1170, 1172-1174 | Operations: offRoad, propBoxes, sceneOf, spanBoxes. FlybySight.offRoad: a box across the road at running height is dropped, a bridge-height one and a tree part kept; the planner's scene applies it. |
| the planner frames its subject: Monza's turn-first clears the grandstand, the grid walk holds the field | 1179-1213 | 1193, 1207, 1209-1210 | Operations: bindCorners, reset, solve, nearThirds, camera, anchorS, posePoint, project. the planner frames its subject: Monza's turn-first clears the grandstand, the grid walk holds the field. |
| FlybySight.mix: the frame's sky / ground / prop shares and their cost | 1215-1227 | 1219, 1221-1224 | Operations: bounds, mix, camera, mixCost. FlybySight.mix: the frame's sky / ground / prop shares and their cost. |

## tests/unit/flying-start.test.mjs

Read: 1-135; SHA-256: `20b12c012c80ea39266a2244875da7e6bb4e2ef77c5ba6f85495dd2fe325be17`.

Target: js/race/flying-start.js; js/race/quali-model.js; js/agent/apex.js.

Fixtures / limits: Real FlyingStart in isolated VM with straight +z track sample, fixed drop speed, controlled state/role callbacks and 1/60s updates. Proves before-line placement, AI-to-human handover and reset policy on supplied states; source checks simulated qualifying and apex.go wiring. Does not integrate actual lap timing, AI or input hardware.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| qualifying: the first countdown frame drops the car in at speed before the line, the AI driving | 45-62 | 49-51, 53-61 | Operations: runUpMetres. qualifying: the first countdown frame drops the car in at speed before the line, the AI driving. |
| the hand-over counts down on the plate, then GO gives the wheel back and recalibrates | 64-74 | 68-71, 73 | File target above. the hand-over counts down on the plate, then GO gives the wheel back and recalibrates. |
| time trial gets the same flying start; a race, practice and a Data Hub real race do not | 76-87 | 79-80, 84-85 | File target above. time trial gets the same flying start; a race, practice and a Data Hub real race do not. |
| RESTART re-arms: every new countdown is a new rolling start | 89-98 | 95-97 | File target above. RESTART re-arms: every new countdown is a new rolling start. |
| stop() hands the wheel back at once (__apex.go() and quitting to the menu) | 100-109 | 103, 105-108 | File target above. stop() hands the wheel back at once (__apex.go() and quitting to the menu). |
| a session quit mid-countdown (update() never runs in the menu) does not hide the next session's start | 111-120 | 114, 118-119 | File target above. a session quit mid-countdown (update() never runs in the menu) does not hide the next session's start. |
| the run-up is clamped: never closer than the floor, never most of a short lap | 122-126 | 124-125 | Operations: runUpMetres. the run-up is clamped: never closer than the floor, never most of a short lap. |
| the qualifying model is a flying lap too: no standing start charged | 128-135 | 130, 132, 134 | File target above. the qualifying model is a flying lap too: no standing start charged. |

## tests/unit/followup-platform.test.mjs

Read: 1-56; SHA-256: `a64cdd8123a96b9bb16bd379d3aab2b5dad772fab2c8671a03d61d6b733f6355`.

Target: js/ui/platform-session.js; desktop/main.js; sw.js.

Fixtures / limits: Extracted install IIFEs, fake iPhone/native flag, Electron EventEmitter windows/dialogs, service-worker Request/Response and Map caches. Native/web cases expand twice. Covers prompt policy, single-instance/crash recovery and offline status/retry; no native process, browser install or real cache/network lifecycle. Hostile URL in fixture summary is inert descriptive test data.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| ′web install guidance native=${native}′ | 11-18 | 16-17 | File target above. web install guidance native=${native}. |
| desktop secondary exits before creating any window | 27-27 | 27 | File target above. desktop secondary exits before creating any window. |
| desktop focuses primary, explicit crash recovery preserves bundled origin and coalesces | 28-35 | 29-34 | File target above. desktop focuses primary, explicit crash recovery preserves bundled origin and coalesces. |
| desktop ignores retired dialog and clean exits | 36-36 | 36 | File target above. desktop ignores retired dialog and clean exits. |
| offline status distinguishes core, optional misses and cache eviction | 47-51 | 48-50 | File target above. offline status distinguishes core, optional misses and cache eviction. |
| offline retry coalesces in one generation and records downloaded coverage | 52-55 | 53-54 | File target above. offline retry coalesces in one generation and records downloaded coverage. |
| offline status rejects hostile summary instead of fetching arbitrary URLs | 56-56 | 56 | File target above. offline status rejects hostile summary instead of fetching arbitrary URLs. |

## tests/unit/followup-update-check.test.mjs

Read: 1-49; SHA-256: `a0f89e2833489ebcc9b99b1a029cbc9173aae9154f89345137d1dde82df0920a`.

Target: js/ui/update-check.js.

Fixtures / limits: Real module with synthetic timers/clock and injected fetch or response-body promises; fetch/body × AbortController present/absent expands four timeout cases. Pins 15s deadline, 30s cooldown, promise coalescing, late-build isolation and timer cleanup; no network/SW update activation.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| ′hung ${mode} recovers with abort=${abort} and ignores late build′ | 24-41 | 31, 33-35, 38-39 | File target above. hung ${mode} recovers with abort=${abort} and ignores late build. |
| successful and rejected reads release their deadline | 43-49 | 46-47 | File target above. successful and rejected reads release their deadline. |

## tests/unit/font-digits.test.mjs

Read: 1-170; SHA-256: `7ee274ab3ea4ec424bf4598063ae7df91f3a6f84fb87024e5de8e4553224a5e9`.

Target: tests/data/font-digits.json; css/tokens.css; css/hud.css; tools/check/font-digits.py.

Fixtures / limits: Reads all top-level CSS and shipped woff2 names against measured ledger. Effective advances prefer tnum substitutions; HUD lead and Titillium fallback must be uniform; Barlow size-adjust derives 0.643/0.700, speed slot three adjusted tabular advances and >=30 declaration count. Ledger is not recomputed and font bytes are not hashed by these tests, so stale measurements for replaced same-name fonts can escape; no live browser shaping measurement.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| every shipped font is in the measured ledger | 55-68 | 58-63, 65-66 | File target above. every shipped font is in the measured ledger. |
| every shipped face has uniform digits — natively or through tnum | 70-83 | 76-81 | File target above. every shipped face has uniform digits — natively or through tnum. |
| the HUD stack LEADS with a face whose digits hold still | 85-110 | 87, 91-94, 96-99, 106-108 | File target above. the HUD stack LEADS with a face whose digits hold still. |
| the size-adjust that matches cap height is pinned to its derivation | 112-126 | 118, 120, 122-125 | File target above. the size-adjust that matches cap height is pinned to its derivation. |
| #hud-speed's fixed slot is three TABULAR advances, not three ′ch′ | 128-158 | 137-140, 146, 153-157 | File target above. #hud-speed's fixed slot is three TABULAR advances, not three ′ch. |
| the tabular-nums declarations are load-bearing now — keep them | 160-170 | 167-169 | File target above. the tabular-nums declarations are load-bearing now — keep them. |

## tests/unit/forecast.test.mjs

Read: 1-291; SHA-256: `85fc9200f2e7913bcc1fefc592e872fce31eabcfb2fb3a2df1f04f847421873b`.

Target: js/race/forecast.js; js/race/weather-arc.js; js/race/engineer.js; js/physics/tyre-model.js; js/race/rain-cells.js; js/core/hash32.js; tools/manifest.cjs.

Fixtures / limits: Real weather/tyre/forecast/engineer modules and seeded Log; fixed 90s/4050m lap, warm fresh tyres, per-second race and captured accepted announcements. Arcs and seeds exercise timeline lag, uncertainty, deterministic preview and bucketed calls; local-shower preview also loads real Hash32/RainCells. No audio/banner delivery, real weather or complete multiplayer synchronization.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| the timeline is the arc's: dry→rain gives rain then heavy, rain→dry easing then drying, at the tread crossings | 60-82 | 65-66, 69, 72-74, 76-78, 81 | Operations: timeline, treadFor, wetAt, compute. the timeline is the arc's: dry→rain gives rain then heavy, rain→dry easing then drying, at the tread crossings. |
| drift guard: Forecast's road model is WeatherArc's — the real weather-arc.js, sampled through four arcs | 84-97 | 92, 96 | Operations: wetAt. drift guard: Forecast's road model is WeatherArc's — the real weather-arc.js, sampled through four arcs. |
| the stated time is inside a bound that grows with lead, never exact far out, and converges monotonically | 101-126 | 112-113, 115-116, 122-125 | Operations: timeline, compute, errBound, confidenceFor. the stated time is inside a bound that grows with lead, never exact far out, and converges monotonically. |
| one seed + one arc = one forecast; seeds differ; the pre-race plan forecast IS the green's | 130-142 | 133, 136, 140-141 | Operations: compute. one seed + one arc = one forecast; seeds differ; the pre-race plan forecast IS the green's. |
| no forecast in a stable-weather race; a lateral walk says no rain | 146-157 | 147-148, 150-151, 155-156 | Operations: compute. no forecast in a stable-weather race; a lateral walk says no rain. |
| dry→rain: an early call, ~2 laps, ~1 lap, then RAIN IS HERE — BOX FOR INTERS; never twice per bucket | 190-213 | 196-199, 201, 203-208, 211-212 | Operations: treadFor, current. dry→rain: an early call, ~2 laps, ~1 lap, then RAIN IS HERE — BOX FOR INTERS; never twice per bucket. |
| a car already on inters hears RAIN IS HERE as confirmation, not a box call | 215-222 | 219-221 | File target above. a car already on inters hears RAIN IS HERE as confirmation, not a box call. |
| rain→dry on full wets: RAIN EASING — INTERS, then IT'S DRYING — SLICKS IN ~N LAPS, then the box call | 224-239 | 229, 236-238 | Operations: timeline, optTemp. rain→dry on full wets: RAIN EASING — INTERS, then IT'S DRYING — SLICKS IN ~N LAPS, then the box call. |
| wet→rain on inters: HEAVY RAIN IN ~N LAPS — FULL WETS NEXT, then the box call for wets | 241-248 | 246-247 | Operations: timeline. wet→rain on inters: HEAVY RAIN IN ~N LAPS — FULL WETS NEXT, then the box call for wets. |
| rain before the planned stop names the box lap and the tread treadFor wants, once per bucket | 250-262 | 255-256, 260-261 | File target above. rain before the planned stop names the box lap and the tread treadFor wants, once per bucket. |
| source: the engineer reads Forecast through a typeof guard, and the lap-count lines key on buckets | 264-269 | 266-268 | File target above. source: the engineer reads Forecast through a typeof guard, and the lap-count lines key on buckets. |
| the real derived local-shower preview equals the green forecast without arming race state | 272-291 | 283-284, 288-290 | File target above. the real derived local-shower preview equals the green forecast without arming race state. |

## tests/unit/foundation-core-vm.test.mjs

Read: 1-113; SHA-256: `16c9a9921a9bdf46f48342bce47b73d08af79a42ac318a7427781f4033ca9cc8`.

Target: tools/lib/game-vm.cjs; tools/track/verify-track.cjs; js/agent/apex-track.js; js/track/tracks.js; js/track/core/mesh.js.

Fixtures / limits: ROSTER dynamically derives every Tracks.LIST circuit; spec stems map Albert Park alias. One VM reraced, go/jump before geometry/wall/model diagnostics. Runtime cases expand once per current roster id; no fixed invented test paths. Holds >5 geometry entries, all finite/ok, finite nonempty barriers and no failed required models. Despite header claim it DOES NOT bound minOverHw; bespoke foundation thresholds remain in browser specs.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| the whole roster is covered, and every foundation spec names a real circuit | 63-71 | 65-66, 68-69 | File target above. the whole roster is covered, and every foundation spec names a real circuit. |
| ′${id}: the shared foundation contract holds′ | 74-112 | 80, 85, 90-93, 105, 110-111 | File target above. ${id}: the shared foundation contract holds. |

## tests/unit/fov-fit.test.mjs

Read: 1-136; SHA-256: `f8dec231c48fcae487e1bbd769afaf687101d814e4766a91ab6085ea0c453599`.

Target: js/camera/fov-fit.js; js/game.js.

Fixtures / limits: Standalone real helper VM; explicit old cap-only reference formula and landscape/ultrawide/square/portrait/cinematic/invalid-value matrices. Holds portrait-only floor/ceiling and positive finite fallback; source pins pure dependencies and integration. Mathematical projection policy only, no canvas resize or visual sign-off.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| 16:9 landscape: bit-identical to the old HFOV_MAX cap | 31-40 | 38 | Operations: fitFovY. 16:9 landscape: bit-identical to the old HFOV_MAX cap. |
| 21:9 ultrawide: cap unchanged vs old formula | 42-52 | 47, 51 | Operations: fitFovY, hfovFromVfov. 21:9 ultrawide: cap unchanged vs old formula. |
| square and near-landscape keep authored telephoto framing | 54-63 | 59-60 | Operations: fitFovY. square and near-landscape keep authored telephoto framing. |
| portrait floor remains active up to the square boundary | 65-72 | 70 | Operations: fitFovY. portrait floor remains active up to the square boundary. |
| 0.46 portrait: HFOV floor widens VFOV (chase / cockpit range) | 74-90 | 81-82, 87-88 | Operations: fitFovY, hfovFromVfov. 0.46 portrait: HFOV floor widens VFOV (chase / cockpit range). |
| cine passthrough: authored VFOV untouched on every aspect | 92-101 | 97-98 | Operations: fitFovY. cine passthrough: authored VFOV untouched on every aspect. |
| reduce-motion is irrelevant: helper has no motion / store / DOM dependency | 103-111 | 105, 110 | Operations: fitFovY. reduce-motion is irrelevant: helper has no motion / store / DOM dependency. |
| game.js calls CamFovFit.fitFovY; no inline HFOV_MAX block remains | 113-118 | 116-117 | File target above. game.js calls CamFovFit.fitFovY; no inline HFOV_MAX block remains. |
| bad aspect / FOV never yields 0 or NaN (resize / orientation edge) | 120-136 | 125-126, 129, 132, 135 | Operations: fitFovY. bad aspect / FOV never yields 0 or NaN (resize / orientation edge). |

## tests/unit/frame-fleet.test.mjs

Read: 1-127; SHA-256: `230ba717cc5bebe221846cf36642cf595da7315b7e946f4d205a6caab5078786`.

Target: tools/lib/frame-fleet.mjs.

Fixtures / limits: Handbuilt complete per-frame report records with shot/position/u, flags, subject, nearest, car count and thumbnails; compaction then synthetic old/new fleets. Pins identity, noise threshold, flags by name, added/removed/error circuits, formatted diffs and sorted worst summary. No real report quality or file I/O.

| Case name | Range | assertionSpans | Target / meaning |
|---|---|---|---|
| flagName strips the measurement: detail drift is not flag churn | 18-22 | 19-21 | Operations: flagName. flagName strips the measurement: detail drift is not flag churn. |
| frameKey: shot@pos, shot@u for explicit u, #n for repeats | 24-30 | 26-29 | Operations: frameKey. frameKey: shot@pos, shot@u for explicit u, #n for repeats. |
| compactReport keeps the diffable fields and drops the thumbnail | 32-40 | 34-39 | File target above. compactReport keeps the diffable fields and drops the thumbnail. |
| diffFleet: score moves, flag names gained/lost, below-threshold noise hidden | 42-71 | 56-64, 67-68, 70 | Operations: diffFleet. diffFleet: score moves, flag names gained/lost, below-threshold noise hidden. |
| diffFleet: frames and circuits that appear, vanish or error | 73-97 | 86-92, 94-96 | Operations: diffFleet, formatDiff. diffFleet: frames and circuits that appear, vanish or error. |
| formatDiff names each changed frame and collapses unchanged circuits | 99-106 | 103-105 | Operations: formatDiff, diffFleet. formatDiff names each changed frame and collapses unchanged circuits. |
| worstFrames / formatSummary: lowest score first, errors listed | 108-121 | 115, 117-120 | Operations: worstFrames, formatSummary. worstFrames / formatSummary: lowest score first, errors listed. |
| assertFleet refuses a single-circuit report and junk | 123-127 | 124-126 | Operations: assertFleet. assertFleet refuses a single-circuit report and junk. |

## Supporting source and fixture snapshot

These full-file ranges/hashes identify target bytes, not a claim that every production line was read. Production was followed through bounded definitions and relevant source, while every unit-file line above was read. Includes reusable helpers and direct target/config/data inputs; transitively loaded game modules and circuit assets retain their owning project-map reports. Literal fake filesystem locations, dummy spec identities, malicious sample origins and sentinel shot ids in fixtures are descriptive data, not live path references.

| Source / fixture | Range | SHA-256 |
|---|---|---|
| .github/workflows/ci.yml | 1-3143 | `d615b39496e01177025a6dde9dbdd6edd5d8314942a9adaca3cb8ead2bf0f1d6` |
| css/hud.css | 1-2526 | `ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1` |
| css/tokens.css | 1-1361 | `baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a` |
| desktop/main.js | 1-223 | `a5b296107a0cf10d882cd6db4f8d17aea714923da86402bccd7efb56633a37ad` |
| js/agent/apex-cam.js | 1-368 | `5314cdd69c30468bb05f88a0f8795210af2add8e0d71bd83b1552915ce649a5f` |
| js/agent/apex-track.js | 1-149 | `275050e7855d328662285b66cd1aa13911a18e167def621eb76cd4f242c4f23e` |
| js/agent/apex.js | 1-2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| js/camera/cam-tuner-boot.js | 1-34 | `ab45f58b44b70ca5988fdb8d59ca3ddfae8d5504db9d8d4dd1989dd9c49eea25` |
| js/camera/flyby-editor.js | 1-666 | `33b78b91d38f6fe96126b67c4b2a49193c514c8df810c300922a9603d0dce487` |
| js/camera/flyby-panel.js | 1-387 | `f7079f941a13a8139cdf1a0784b3a438553921b19cb46d9b12af70ebc199b1c8` |
| js/camera/flyby-seq.js | 1-2145 | `8341ed7ed0f871ae5f90bab851dc3f1a9628122972ee54e32c7b8480591b9d97` |
| js/camera/flyby-sight.js | 1-606 | `10da211ec693f246c1c58be3de47e5e8b2fc17b0c1d5bb4f2901c038ccb0614a` |
| js/camera/fov-fit.js | 1-82 | `f20d8d79f38dd42187f481990209bceb3e01cd4dacefd581f2ce7d38b2615cde` |
| js/circuits/scenery/bahrain.js | 1-1203 | `43b2886e64b71aac74fd6381bfaee5dbad2e45340cf0a159b4a80bead3978355` |
| js/circuits/scenery/hungaroring.js | 1-879 | `b82a4eb96859a1024445d3b636672ed501321d3ebf0970a535b2766c6fad378c` |
| js/circuits/scenery/imola.js | 1-885 | `005467474ffae4828e72f51c6f43662d5907c27965d65633ba98c653e9211257` |
| js/circuits/scenery/qatar.js | 1-747 | `3374a9f82097a5899e7d7518f54072c82fb602af22128eac02ff77c6544f979f` |
| js/circuits/scenery/singapore.js | 1-1176 | `760a431cae7c43f1b72101be72bb7e918cba5cb7ad8cb85e0e8dd3f8d8ae435c` |
| js/core/hash32.js | 1-31 | `aaaf3c18de712a7226b8a312c2b0a757879b264dcc40bbd37e4165a16ebd1369` |
| js/core/script-loader.js | 1-254 | `4fa6f897fc043cf45ffc0b564ac03d9b50a5510e7442289ddd0c0c02d4d22762` |
| js/data/flyby-overrides.js | 1-144 | `d9b44100dcb3f72856291496ab57e2d195aa67bbefdb87ac172163fd194ecdb0` |
| js/game.js | 1-9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/lighting/atmosphere.js | 1-852 | `ec92281afd7017ffa361419ca0d9f226a88a5923e3ae582a106f52b8e2077982` |
| js/lighting/lamp-bake.js | 1-559 | `45d2bc33ba3557469a6aa7e77d98a03b81c559163a500a2444e5f9143bebdeeb` |
| js/net/lobby.js | 1-2293 | `91ef67f43cc1b03488a2a3dff6f83ada24c459fd2638cf51ccbb026ca496d110` |
| js/perf/race-entry-profile.js | 1-453 | `34aeba8a5d0bc643aa5b886369c5096176b4d1e31a4bf5ffa952562128a7715e` |
| js/physics/tyre-model.js | 1-1072 | `e106913104138c815ed086a6ba34753b3393770de166e1a80d3eb9404c98aea1` |
| js/race/engineer.js | 1-537 | `cd435157a1c854c286818c26cfec5cae0ef0e1af7509ca8cf79faeaeb14d6d87` |
| js/race/flying-start.js | 1-119 | `c32320254a9a594d2c6a5183ff7d7b5cbb6b149cd6703d1925bda15ef771a4fe` |
| js/race/forecast.js | 1-191 | `85384c353a09f017411a6f42c4843aa2c465dd18e983ec2f9eddfc05378f6205` |
| js/race/quali-model.js | 1-463 | `862483da27e204ea2224d9b408971948e4f0822d88f93cdb81e26f364b7cd205` |
| js/race/rain-cells.js | 1-159 | `cd852c75a88704ff7abd3ca53ddd65016f2075633fa8cf3de3bb129e8bc2b675` |
| js/race/start-lights.js | 1-145 | `e3f10e1f92d33b14eb2adc63102f62293c459f853f01b6e5ec4b1a1c83077392` |
| js/race/weather-arc.js | 1-527 | `f37f07774dd376bb19dfaa88c0894b099cb7b542b46caf8ebbd81f2370bc8b1f` |
| js/track/core/mesh.js | 1-1575 | `8e73c2816f2fa9bf1c711813533e7c87c89a551be7556b90469364b308f8585c` |
| js/track/scenery/build-props.js | 1-2290 | `8b508e1c98ee00ab02a88acd6843371a6fa6c8414837eea86f775a5936eb785c` |
| js/track/scenery/identity.js | 1-449 | `59794921b71390b85f70296aa2151ebd46687983e81237a6a6bcc59cd25f7ff0` |
| js/track/tracks.js | 1-860 | `62abbda18aae41e6e016b4fdc1a6dbd346810f72c92058521405fd0b7149f9bb` |
| js/ui/loading-screen.js | 1-998 | `10e41fe7df89e96271b724ecfb35c433f67b46a05bdf3a1a9d14e8e14614c2a5` |
| js/ui/platform-session.js | 1-488 | `a95c6d6cc78b4f9241e50f5bd1996f5dca89179471fc2a0415e6f8ebd3862658` |
| js/ui/update-check.js | 1-276 | `2f7aef8d69903bb320d82620a24a89fb284c76843a1528d3c6bab0da975385bf` |
| sw.js | 1-1177 | `c0a67ac4c85a33b9bf764670f196421f4fddbe20760ac18e8e54b84b54b4f164` |
| tests/data/flaky-quarantine.json | 1-129 | `061335a90fbd5b62c133b80a71b0a82fd5c3871ae91f905e5c3a8a490bc09f7c` |
| tests/data/font-digits.json | 1-340 | `beb3baa9b6c8088a09b1285dede4f379088b8181587ff58685fbb5033d6a534a` |
| tests/helpers/abs-src.mjs | 1-8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| tests/helpers/flaky-policy.mjs | 1-81 | `a75f6af473c98a531283c7997546c6d5a5bcbc5e7540a28d907b9324555a103c` |
| tests/helpers/flyby-audit-rules.mjs | 1-64 | `266d5de40b2facbfa06d60df78d2a8691be6dec003c612d11b7a47f5dd63f907` |
| tests/helpers/fn-source.mjs | 1-45 | `3f40d63e82348c9e48ed950481386b75d3f8c17c03502748aa600d1444ae9e19` |
| tests/helpers/game-source.mjs | 1-84 | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| tests/helpers/live-reporter.js | 1-319 | `87c24a9f6bafd16b3a6a3c9fa52a7ad10ade3f0e61e9ada912179aed20615f7e` |
| tests/helpers/seed-log.mjs | 1-35 | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tools/check/font-digits.py | 1-126 | `68b373c23da868ccd972f3b2c45d26bcd742bd51f7e92a16965f39d03ece6ee7` |
| tools/ci/run-playwright.mjs | 1-285 | `4fbb69dbc8a8aaa76046511ba1da3acfa105084dea826d97da40ef68e2bbc164` |
| tools/ci/select-specs.mjs | 1-1573 | `9484cda6a9a781373b6356c75075c7ccd3d46417a41b10717742cd9b9cca2cfd` |
| tools/gen/bake-flyby.mjs | 1-236 | `ef0d37e0adf9e72e5dc32f2f4a6748a4c25f767e15bd9ba7db803fa7e8f73649` |
| tools/lib/flicker-metric.mjs | 1-167 | `989e0d4e6336e1c77f40634cd15c8d5d266b76f9ec42ebd142ea5d8a582afeae` |
| tools/lib/flyby-audit.cjs | 1-149 | `96bd3d2e55ae3829d4b8a5523575e78870dc54b436a45f614e9c4d7123efc7eb` |
| tools/lib/frame-fleet.mjs | 1-183 | `6beac398d04c2afc5e51dace83e00cc063abfe5efaebd4e33c48ff425e38c97d` |
| tools/lib/game-vm.cjs | 1-880 | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tools/manifest.cjs | 1-1691 | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| tools/shot/flicker-gate.mjs | 1-370 | `521369b17c970c07a6aa695d81d3f53ce98cdaa9668e77bcdb606f3ba3765845` |
| tools/shot/flyby.mjs | 1-237 | `fd6b60ce0f1d1d53114c75dc644109fe2e2880b6f6ffad84a83292edb974d879` |
| tools/shot/frame-report.mjs | 1-561 | `cf6713dd628a5e45c0e613cf0e62541e309fd12ebb4689e9a244fb4f03cfffcf` |
| tools/track/verify-track.cjs | 1-458 | `6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b` |

Declaration inventory: 243 test declarations. Loops expand native flags, timeout modes, camera/flyby × route and whole circuit roster at collection/runtime; declarations are not mistaken for the expanded runtime count. Assertion scopes include multiple scenarios and assertions inside loops; not-run throughout.

## Production symbol ranges

Bounded LSP navigation plus source structure identifies the following declaration ranges. These complement the file-level target lists and hash ledger; repeated internal names belong to their enclosing module. A symbol list is a navigation index, not extra executed coverage.

| File | Definitions / inclusive ranges |
|---|---|
| js/camera/flyby-seq.js | setPlayerSlot 65-68; slotKnown 69-69; slotIndex 75-75; isSolid 111-115; blockers 119-126; insideProp 172-182; onRoadPose 192-195; clearEye 202-210; landmarks 276-328; lmBase 333-341; bounds 348-369; cornerS 381-393; bindCorners 431-467; cornerTurn 480-492; anchorS 536-548; lmFace 558-570; cornerSide 600-616; posePoint 646-707; poseFromWorld 812-833; shotFromView 839-854; gridProgress 1042-1045; driveHero 1075-1091; warm 1107-1118; cancelWarm 1121-1121; planSteps 1125-1135; withoutSlot 1136-1136; withoutGrid 1143-1143; shotAt 1149-1161; warmProgress 1168-1180; solve 1181-1223; airCorner 1229-1229; landmarkFallback 1353-1369; setDuration 1481-1481; boundaries 1482-1490; presentation 1492-1503; swayAt 1504-1507; planShot 1890-2011; isNight 2029-2032; isWet 2033-2036; whenMatch 2037-2043; select 2063-2090; setSession 2096-2096; vary 2106-2129; reset 2133-2133; solve 2136-2136; shotAt 2136-2136; warmProgress 2136-2136; airCorner 2136-2136; reset 2136-2136; clearEye 2136-2136; insideProp 2136-2136; blockers 2136-2136; isSolid 2136-2136; onRoadPose 2136-2136; landmarks 2137-2137; bounds 2137-2137; lmBase 2137-2137; landmarkFallback 2137-2137; planShot 2137-2137; anchorS 2138-2138; posePoint 2138-2138; cornerS 2138-2138; cornerSide 2138-2138; cornerTurn 2138-2138; lmFace 2138-2138; poseFromWorld 2139-2139; shotFromView 2139-2139; select 2139-2139; setSession 2139-2139; whenMatch 2139-2139; isNight 2139-2139; isWet 2139-2139; vary 2139-2139; setPlayerSlot 2139-2139; slotIndex 2139-2139; slotKnown 2139-2139; withoutSlot 2139-2139; withoutGrid 2139-2139; bindCorners 2139-2139; warm 2139-2139; cancelWarm 2139-2139; setDuration 2139-2139; planSteps 2139-2139; boundaries 2140-2140; presentation 2140-2140; swayAt 2140-2140; driveHero 2140-2140; gridProgress 2140-2140 |
| js/camera/flyby-sight.js | propBoxes 34-74; offRoad 85-102; spanBoxes 108-126; sceneOf 149-169; transmit 237-277; camera 282-291; project 292-298; nearThirds 305-368; mix 395-438; mixCost 447-450; mix 602-602; mixCost 602-602; propBoxes 605-605; offRoad 605-605; spanBoxes 605-605; sceneOf 605-605; transmit 605-605; nearThirds 605-605; mix 605-605; mixCost 605-605; camera 605-605; project 605-605 |
| js/camera/flyby-panel.js | fieldLabel 67-69; metricValue 72-75; switchPoseAt 80-91; addShot 113-118; duplicateShot 120-128; deleteShot 134-139; moveShot 141-147; normaliseDurs 152-163; poseErrors 169-183; shotErrors 191-215; validateShots 220-227; toBlob 232-243; savedForm 256-256; fromSaved 262-267; fieldLabel 271-271; metricValue 271-271; switchPoseAt 271-271; savedForm 271-271; fromSaved 271-271; addShot 272-272; duplicateShot 272-272; deleteShot 272-272; moveShot 272-272; normaliseDurs 272-272; shotErrors 272-272; validateShots 272-272; toBlob 272-272; ensureCamEditor 279-297; createEditorOpener 302-345; create 348-383; loadSaved 352-361; loadSaved 380-380; create 385-385; ensureCamEditor 385-385; createEditorOpener 385-385 |
| js/camera/flyby-editor.js | persist 48-53; playable 123-127; edited 212-212; refreshChips 402-443; closeFlyby 546-580; closeFlyby 661-661 |
| js/game.js | duelOn 886-886; motionReduced 948-951; gridRule 1611-1614; gridOrderFor 1615-1644; menuKey 2161-2161; menuWorld 2165-2165; warmPrograms 2213-2213; menuFinish 2214-2234; startRaceBody 2471-2719; quitToMenu 3455-3455; raceIntro 3456-3456; render 3533-3533; raceIntro 3601-3601; menuGridCars 3624-3646; flybyGridOrder 3654-3670; afterGarageOut 3723-3732; introPlan 3803-3818; introPrepare 3821-3854; introBuild 3881-3922; introWarm 3931-3964; raceIntro 4029-4095; clearMenuScreens 4263-4271; quitToMenu 4340-4421; render 7239-8457; setPaused 8689-8689; setPaused 8855-8855; setPaused 9249-9282 |
| js/race/forecast.js | wetAt 46-54; timeline 68-95; errBound 105-108; confidenceFor 110-113; compute 149-182; publish 186-186; current 187-187; compute 189-189; timeline 189-189; wetAt 189-189; errBound 189-189; confidenceFor 189-189; publish 189-189; current 189-189 |
| js/race/flying-start.js | runUpMetres 22-25; wanted 38-41; place 43-63; arm 65-76; tick 78-93; release 95-99; stop 102-102; update 105-112; update 114-114; stop 114-114; runUpMetres 117-117 |
| js/camera/fov-fit.js | hfovFromVfov 37-39; fitFovY 52-72; fitFovY 75-75; hfovFromVfov 76-76 |
| js/data/flyby-overrides.js | patches 123-125; resolve 127-134; catalog 137-141; patches 143-143; resolve 143-143; catalog 143-143 |
| js/race/start-lights.js | create 52-141; update 123-138; update 140-140; create 143-143 |
| js/track/scenery/build-props.js | lampPost 1938-1947; selectCustomLamps 1958-1987; registerMastLamp 1988-1993; lampPost 2065-2065 |
| js/track/scenery/identity.js | floodMast 62-122; floodMastRing 124-131; floodMast 442-442; floodMastRing 442-442 |
| js/ui/update-check.js | create 57-238; check 111-133; check 232-232; stop 234-234; create 274-274 |
| desktop/main.js | createWindow 95-197 |
| js/ui/platform-session.js | iosInstallNudge 88-106; installChip 116-150 |
| js/race/engineer.js | create 78-533; callFor 255-260; senseOf 263-263; forecast 468-468; update 489-530; update 532-532; callFor 532-532; senseOf 532-532; forecast 532-532; create 535-535 |
| js/agent/apex-track.js | wallStats 48-77; modelDiagnostics 78-81; geometryDiagnostics 82-85 |
| js/track/core/mesh.js | gridSlot 1200-1205; gridSlot 1572-1572 |
