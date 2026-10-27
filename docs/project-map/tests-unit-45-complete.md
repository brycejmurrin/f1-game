# Unit group 45 — complete static map

Read-only mapping of all 18 manifest files (3,946 physical lines). Every test file was read from line 1 through EOF in individually returned, untruncated slices of at most 100 lines and 10,000 characters. No tests, browser sessions, production edits or commits were run. Assertion locations below are call-expression spans, not predicate dumps. Case ranges include registration; assertions inside callbacks/loops count at their source span. The Jerez template registers three concrete cases (`clear`, `road`, `unsupported`) from one source row.

Production navigation: code-nav skill read; local apex-lsp resolved/outlined RivalAudio, PostCommon.roadReflection, SaveMigrate, GameStore, CareerRestorePoints, SaveHealth, SaveSchemaRegistry, UiScale, GarageLive, GarageScene.ctxKey, DrivingCoach and TrackBuildProps. Bounded direct production reads corroborated rivals 100–163, post-common 189–210, restore-points 132–175, save-migrate 287–386, road-position-checks 1–89, run-pid 1–86, road-lut-census 1–100, footprint-support 125–186, ground-audit 120–217 and Cursor edit adapter 1–92. Production ranges are navigation/behavior anchors, not claims to have read every dependency in full. One initially capped RivalAudio.create LSP body was not treated as a full read; test-file completeness relies exclusively on bounded source reads.

## rival-passby-pool.test.mjs

Full read: `tests/unit/rival-passby-pool.test.mjs:1–218`. SHA-256 `10ca4e958dada05b60520c409ae0e078d093ee83ff4cb23954939c9296b737ad`.

Production: `js/audio/rivals.js:53-72,100-159,209-334`.

Fixtures 19-94: fake-audio-vm.cjs, counted node constructors and AudioParam targets; 1 km synthetic lap and plain cars. Boot attach assertion 85 applies to every booted case.

Fake audio observes graph/state and calls; it cannot establish audible quality or actual browser scheduling.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| gain falls with distance on the attached pass-by pool | 97–110 | 103, 108, 109 | rival-passby-pool production above | 6 m to 80 m attenuation without silence |
| Doppler raises pitch when approaching and lowers it when receding | 112–124 | 118, 122, 123 | rival-passby-pool production above | Closing/opening pitch direction |
| pan follows lateral position: left negative, right positive, ahead near centre | 126–142 | 132, 136, 141 | rival-passby-pool production above | Lateral sign and centred forward pan |
| the pool is a fixed size and tick creates no nodes | 144–164 | 150, 151, 158, 159, 162, 163 | rival-passby-pool production above | Four prebuilt voices and no creation over 30 collects; unattached collection remains usable |
| voice stealing is by distance: a closer newcomer takes the farthest slot | 166–181 | 173, 178, 179–180 | rival-passby-pool production above | A 5 m newcomer displaces the farthest bound voice |
| aim uses setTargetAtTime with a tau, never a raw per-frame value poke | 183–203 | 189, 191, 192, 193, 194, 195, 198, 202 | rival-passby-pool production above | Gain/rate/pan use timed ramps and re-aim after movement |
| pass-by hiss is softer alongside and follows relative motion | 206–218 | 212, 215, 217 | rival-passby-pool production above | Stationary neighbour stays quiet; passing motion increases bounded low-pass hiss |

## road-lut-frame.test.mjs

Full read: `tests/unit/road-lut-frame.test.mjs:1–93`. SHA-256 `f4ad0896e8ea63d1c728330728e30dab38dd9d137756b3b3a2a854ce734381f3`.

Production: `tools/gfx/road-lut-census.mjs:68-94,101-233 → js/render/webgpu/wgx-roadlut.js`.

Imports real WGX bake and arithmetic shader-search census; monza/baku/singapore and a 60-station straight ribbon with no zero-lateral column.

Device-free subset; no shader execution, GPU validation or complete fleet sweep.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| the road LUT never hands the shader a rotated track frame | 48–63 | 53, 59–62 | road-lut-frame production above | Each circuit supplies >200 samples and no >75° worst reconstructed-frame rotation |
| the road LUT samples the centreline at lat 0, not the -0.30 m centre-line column | 65–93 | 86, 89, 91–92 | road-lut-frame production above | Baked straight samples lie on the true axis despite ±0.30 m nearest mesh columns |

## road-position-checks.test.mjs

Full read: `tests/unit/road-position-checks.test.mjs:1–71`. SHA-256 `807c4aae7258aaba638a79e063e3c41cb42044850df8ee0b14622df2d1c474d3`.

Production: `tools/lib/road-position-checks.cjs:12-87; js/track/core/mesh.js`.

Real track-build VM; Monza plus Monaco. copy() at 20-24 privately clones only road positions for destructive injected geometry.

Position metrics and named fixtures only; intentionally permits zero-area fold/pit triangles.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| an unmodified circuit passes, with fleet-like margins | 28–33 | 29, 31, 32 | road-position-checks production above | Sound Monza metrics and both skirt pairs per node |
| a fold-clamped street circuit with coincident rails passes | 35–37 | 36 | road-position-checks production above | Fold-clamped Monaco stays accepted |
| a running-surface section collapsed to zero width is rejected | 39–45 | 44 | road-position-checks production above | 18 rows collapsed across road produce width finding |
| a section collapsed along the lap (consecutive rows coincide) is rejected | 47–51 | 50 | road-position-checks production above | Six coincident rows produce longitudinal finding |
| skirts collapsed onto their tops are rejected | 53–58 | 57 | road-position-checks production above | Collapsed skirt bottoms produce depth finding |
| a skirt top detached from the ribbon edge is rejected | 60–64 | 63 | road-position-checks production above | Displaced skirt top produces attachment finding |
| a main-road vertex lifted 50 m is rejected | 66–71 | 70 | road-position-checks production above | 50 m lifted running vertex produces local continuity finding |

## road-reflection-transition.test.mjs

Full read: `tests/unit/road-reflection-transition.test.mjs:1–96`. SHA-256 `a9240123822df11d463da379be15a4b6f08c297a2f07ae2694a3d72ab52e9151`.

Production: `js/render/shared/post-common.js:189-210; js/perf/governor.js`.

rig at 10-16 owns transition state/options; final case evaluates real governor with seedLogGlobal/seedStoreGlobal, mobile low render floor and 650 simulated frames.

Arithmetic policy checks; no SSR rendering, measured frame costs or device performance.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| measured cuts and recovery are continuous, bounded and refresh-rate independent | 18–40 | 21, 22, 26, 29, 30, 34, 37, 38 | road-reflection-transition production above | 30/60/120 Hz fades decrease to zero in 180 ms and recover in 400 ms without transition-frame pops |
| manual off, dry shedding and crash safety do not wait for the fade | 42–53 | 45, 46, 47, 48, 49, 50, 51, 52 | road-reflection-transition production above | Manual zero/dry/emergency switches apply immediately, emergency exit recovers gradually |
| caller reset starts at the new policy without stale strength; invalid clocks do not corrupt state | 55–67 | 59, 61, 63, 64, 65, 66 | road-reflection-transition production above | NaN reset chooses current target; invalid/backwards clocks cannot double-count elapsed time |
| a real LOW governor cut reaches zero before its rejected-cut verification and recovers | 69–96 | 86, 87, 92, 93–94, 95 | road-reflection-transition production above | Real governor transitions [0,4,0] leave >1 s at zero before rejected-cut recovery |

## road-under-floor.test.mjs

Full read: `tests/unit/road-under-floor.test.mjs:1–82`. SHA-256 `0a9a790e4595d6fa25601f2f97c82f8b075c5f78cec5a094978a37b7b45bad5a`.

Production: `js/track/core/surface.js:34-174; js/track/core/mesh.js`.

Real track-build VM and lowestVisibleRoadY at 34-48; optional APEX_CIRCUITS narrows roster; trim releases per-circuit instrumentation.

Checks slab separation against sufficiently horizontal triangle normals (absolute ny), excluding skirts; no image/occlusion proof.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| the world floor slab never covers the road surface | 50–82 | 79, 80–81 | road-under-floor production above | Every scoped built circuit has surface and measurable road, with floor at least 5 cm below visible-road minimum |

## rulebook-guards.test.mjs

Full read: `tests/unit/rulebook-guards.test.mjs:1–105`. SHA-256 `68feb84100342719edf2db2bfa01945ccaaa21c6c7bc1196e789e4097b179d15`.

Production: `AGENTS.md; .claude/rules/; .claude/skills/; .claude/agents/; .claude/memory/; docs/WORKERS.md`.

instructionFiles 20-37 scans selected roots recursively, skips symlinks, only Markdown; CANON 42-56 and RETIRED/HISTORY 69-81 define text rules.

Regex sentence governance rather than semantic instruction equivalence; history lines exempt; no instruction execution.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| each canonical rule sentence lives in its home and at most one other file | 58–66 | 65 | rulebook-guards production above | Each canonical sentence occurs in home and at most two files total |
| no instruction file teaches a retired mechanism | 83–94 | 93 | rulebook-guards production above | Retired mechanism wording is absent outside same-line history exemption |
| the scan covers the surfaces it claims (a moved tree must not turn this into a no-op) | 96–101 | 99, 100 | rulebook-guards production above | Named instruction surfaces and >50 scanned files prevent vacuity |
| AGENTS.md stays under Codex's native 32 KiB cap | 103–105 | 104 | rulebook-guards production above | AGENTS UTF-8 bytes remain below 32 KiB |

## run-pid.test.mjs

Full read: `tests/unit/run-pid.test.mjs:1–67`. SHA-256 `9d02369c3b14a24b76c6e54ed96430cc7c5a072f9fe2b4e80b665ed3441a76f0`.

Production: `tools/lib/run-pid.mjs:16-85`.

Temporary directory helper and injected alive/cmdline/table/kill/sleep dependencies; synthetic process trees and persisted JSON run records.

No real processes killed; validates dependency-driven stop ordering, not OS delivery/reaping.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| descendants: deepest first, root last, unrelated pids excluded | 11–14 | 13 | run-pid production above | Descendants return deepest-first root-last and exclude unrelated PID |
| register refuses a second live run of the same command, takes over a dead or foreign one; release is owner-only | 16–28 | 19, 21, 22, 23, 25, 27 | run-pid production above | Registration rejects live duplicate, replaces dead/recycled holder, and only owner releases |
| stop: none / stale / stopped; signals the tree leaf-first, SIGKILLs only survivors, never a recycled pid | 30–49 | 32, 41, 42, 43, 44, 48, 48 | run-pid production above | No record/stale/stopped results, leaf-first TERM, survivor-only KILL and no recycled-PID signal |
| stop keeps parents alive until their terminated children have been reaped | 51–67 | 59, 60, 65, 65, 66 | run-pid production above | Each parent waits for its child to disappear; cooperative tree needs no KILL and bystander survives |

## s8-once-per-frame.test.mjs

Full read: `tests/unit/s8-once-per-frame.test.mjs:1–168`. SHA-256 `2eae4e35c878042ac107919cca623d7c444ab450005817a14a2d0f95647b1271`.

Production: `js/game.js and game-source helper; js/race/driving-coach.js:302-382; js/race/race-control.js:361-501; js/race/race-radio.js:573-629`.

Source aggregate plus VM stub DOM/store/debris/insights/cars/input. 43-88 counts insight ticks, 90-122 caution time, 124-168 Input.consumeRadio.

Source-shape flush guard and proxy body counters; no full game loop timing or display-frame/browser execution.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| game.js flushes caution/coach/radio once per frame on _audioParamStep (S8) | 24–41 | 26–27, 28–29, 30–32, 33–34, 35–36, 37–38, 39–40 | s8-once-per-frame production above | Source pins summed dt, last-step gate and published nullable stamp; carSfx remains per-step |
| DrivingCoach.update runs once per G._s8Stamp | 43–88 | 80, 83, 87 | s8-once-per-frame production above | Coach body ticks once per stamp, again on next, every call without stamp |
| RaceControl.update runs once per G._s8Stamp | 90–122 | 108, 115–116, 120–121 | s8-once-per-frame production above | Caution elapsed time advances only once for equal stamp |
| RaceRadio.update runs once per G._s8Stamp | 124–168 | 160, 163, 167 | s8-once-per-frame production above | Radio input consumption follows same stamped/unstamped contract |

## safety-bans-hook.test.mjs

Full read: `tests/unit/safety-bans-hook.test.mjs:1–398`. SHA-256 `7f19961882afc013dd9d82a619db2a6447e6956ca038cdc226a6e444d74b1871`.

Production: `.claude/hooks/bash-guard.sh; .claude/hooks/protect-files.sh; .claude/hooks/protect-files.py:129-241,277 onward; .cursor/hooks/shell-guard.sh; .cursor/hooks/edit-guard.sh:25-92; .cursor/hooks.json`.

17-53 scrub git env, real hook subprocess payload adapters, artifacts temporary Git repositories; PYTHONPATH sitecustomize suppresses /proc; network/PR lists stubbed.

Command strings are policy inputs; fixture repos are local. Does not execute prohibited shell payloads or prove all shell spellings; live-run safety intentionally disabled.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| ban 1: a ratchets.mjs run that can raise is refused in both doors; the non-raising forms pass | 55–82 | 63, 65, 66, 67, 79, 80 | safety-bans-hook production above | Both host doors deny hand ratchet raise variants and permit read/lower/preview/limited auto-raise forms |
| bans 1 and 2: ratchets.json raises and other branches' fragments are refused, even under allow-protected | 84–149 | 102, 103, 104, 114, 115, 121, 137, 138, 140 | safety-bans-hook production above | Own lowers/reverts permitted; raises, dropped lowerings, foreign fragments, removal/move bypasses and detached ownership rejected |
| ban 3: a push over another author's commits is refused until the owner acknowledges it | 151–209 | 161, 164, 173, 174, 177, 177, 177, 180, 181, 184, 185, 189, 191, 193, 201, 202, 206, 207 | safety-bans-hook production above | Local remote author/session changes block push until own-command acknowledgement; unreadable remote warns and permits |
| ban 4: pkill -f is refused in both doors, with the reason in Cursor's answer | 211–220 | 213, 215, 216, 217, 219 | safety-bans-hook production above | pkill -f spellings denied with Cursor reason, read-only pgrep allowed |
| Cursor's hooks.json runs the edit guard on every preToolUse, failing closed; the script picks the writes | 222–280 | 225, 228, 229, 233, 234, 237, 238, 239, 243, 247, 249, 250, 251, 255, 256, 273, 274, 275, 276, 277 | safety-bans-hook production above | Cursor config fails closed; adapter classifies read/write/delete shapes and root/worktree shared paths |
| edit-guard judges a path key beyond file_path/path/target_file/filePath, and write shapes with no path | 282–298 | 287, 288, 289, 293, 295, 296, 297 | safety-bans-hook production above | Alternative path keys and pathless write shapes cannot bypass edit policy |
| ban 5: turning commit signing off is refused in both doors; reading it and signed commits pass | 300–322 | 308, 309, 311, 312, 313, 319, 320 | safety-bans-hook production above | Signing-disable forms blocked, read/enabled-signing forms allowed |
| ban 6: a git ref written through gh api is refused in both doors, even under APEX_MERGE_DESK; reads pass | 324–347 | 331, 332, 335, 336, 337, 341, 342, 345, 346 | safety-bans-hook production above | gh API ref writes and push deletions blocked; ref reads allowed |
| advisory: a piped ready-gate/merge-gate without pipefail gets a reminder, never a block | 349–364 | 352, 353, 354, 356, 357, 362 | safety-bans-hook production above | Piped gate reminder permits command and disappears for pipefail/read-only text |
| a push to a cursor/* branch whose every PR is merged or closed is refused; an open PR or none passes | 366–393 | 380, 381, 383, 384, 385–386, 387, 388, 389, 390, 391 | safety-bans-hook production above | Closed/merged-only cursor branch refuses push; open/no-PR/own override/error paths permit |
| Q10: the live-run stub hides /proc from the hook's python, so a live browser run cannot flip these tests | 395–398 | 397 | safety-bans-hook production above | sitecustomize hides /proc while preserving ordinary directory listing |

## save-durability.test.mjs

Full read: `tests/unit/save-durability.test.mjs:1–500`. SHA-256 `cd38c0f274b793bd3d44558d1c96f937eca9beddb0bd42176c36f0996cf2f60b`.

Production: `js/core/store.js:29-797; js/career/restore-points.js:8-175; js/ui/save-health.js:24-157; js/career/career.js; js/career/career-backup.js; js/ui/select-screen.js`.

database 12-59 is ordered async staged transactional IDB emulator; boot 60-68 supplies quota-switchable Map storage, seedSaveMigrate, and real store. points 119-124 loads restore/identity; career 327-335 loads real career atop minimal Teams/Tracks/Parts; mini-dom handles UI.

VM/Map/transaction fixture evidence; no actual IndexedDB crash durability, browser locking, multi-tab timing or rendered accessibility. Last case evaluates only extracted retrySave slice.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| foreign writes, deletes and clear supersede failed JSON retry records | 71–82 | 78, 79 | save-durability production above | Foreign write/delete/clear cancels older failed retry ownership |
| foreign ownership also prevents a queued garage mirror from replaying old data | 83–94 | 89, 91, 93 | save-durability production above | Foreign value/tombstone supersedes queued garage mirror and persists across fresh boot |
| garage mirror allowlist restores quota-refused work, including presets, but excludes credentials and caches | 95–103 | 99, 101, 102 | save-durability production above | Authored presets/parts/paint/logo mirror, credentials/caches excluded |
| garage mirrors enforce item, aggregate and key-count limits in transactions | 104–113 | 109, 109, 112, 112 | save-durability production above | Transactional per-item, aggregate-byte and 96-key caps count skipped writes |
| authored mirror catches a foreign write even before its storage event arrives | 114–118 | 117 | save-durability production above | Primary drift before storage event prevents authored mirror stale write |
| storage health and lazy restore history survive denied getters and recover without reload | 125–150 | 136, 137, 139, 140, 144, 147, 148, 149 | save-durability production above | Denied storage getters return explicit health/history refusal and recover without reload |
| restore history is bounded per slot, captures only explicit boundaries and never fills primary storage | 151–160 | 153, 154, 156, 157, 157, 158, 159 | save-durability production above | Only explicit capture boundaries persist; latest three per slot, separate slots and byte/schema refusal |
| restore preview requires its own token and refuses changed raw disk or revision | 161–171 | 165, 167, 169, 170 | save-durability production above | Only issued preview token restores; revision/raw-byte drift refuses overwrite |
| confirmed restore saves a replacement checkpoint and the selected progress, with no active-career overwrite | 172–180 | 176, 177, 177, 178, 179 | save-durability production above | Active career refuses restore; confirmed restore retains current checkpoint and selected round |
| history transaction abort leaves prior points intact and reports unavailable history | 181–186 | 184, 185 | save-durability production above | Aborted history transaction preserves old durable row |
| storage health reports measured categories; cleanup preserves every authored key and failed save | 187–198 | 193, 193, 194, 195, 195, 196, 197 | save-durability production above | Health categorizes usage/failures and cleanup removes only caches while retaining failed-save state |
| storage-health UI does no measurements or prompts until opened, and remains operable | 199–210 | 205, 205, 207, 208, 208, 208, 209, 209 | save-durability production above | Mounted health defers estimate until opened and never automatically prompts persistence |
| storage health tolerates denied storage getters and keeps report and cleanup controls usable | 211–235 | 221, 221, 222, 223, 226, 227, 228, 228, 229, 233, 233, 234 | save-durability production above | Denied providers/throwing history leave refresh and cleanup controls usable |
| history unavailable and active-career preview are explicit refusals | 236–242 | 239, 241 | save-durability production above | History unavailable and active-career preview have explicit refusal reasons |
| engaging a career while pre-restore history commits cannot overwrite the active slot | 245–260 | 255, 256, 257, 258 | save-durability production above | Career engagement during awaited undo checkpoint prevents eventual slot overwrite |
| failed authored mirror cannot replace a newer primary after restart before its writer flushed | 263–272 | 267, 270, 271 | save-durability production above | Failed mirror baseline cannot replace newer primary after reboot |
| failed authored mirror still heals its exact failure baseline and a missing primary | 273–280 | 278 | save-durability production above | Exact old baseline or missing primary may heal from failed mirror |
| legacy failed authored rows without a persisted baseline preserve an existing primary | 281–286 | 285 | save-durability production above | Legacy failed row lacking baseline preserves existing primary |
| capture health is per-slot, bounded, separate from primary durability and clears on success | 288–308 | 290, 292, 293, 293, 294, 296, 298, 300, 300, 301, 303, 306, 306 | save-durability production above | Per-slot bounded detached history health remains independent of primary failures and clears on success |
| older capture completion cannot overwrite newer failure health, and UI labels history independently | 310–324 | 315, 321, 322, 323 | save-durability production above | Older successful completion cannot erase newer invalid-capture health; UI names history separately |
| refused calendar adoption cannot enter the mirror or remove scored progress after recovery and reload | 336–362 | 348, 350, 350, 351, 352, 352, 356, 357, 357, 358, 359 | save-durability production above | Refused calendar adoption cannot alter mirror/scored progress through recovery/reload |
| ordinary quota-refused career saves keep session progress, retry and mirror recovery | 363–374 | 367, 367, 368, 369, 371, 372, 373 | save-durability production above | Ordinary quota refusal retains session career, recoverable mirror and retryable primary |
| supported MY TEAM emblems retain round history and before-restore undo at the identity size limit | 375–396 | 380, 381, 383, 386, 387, 389, 390, 390, 391, 392, 393, 394 | save-durability production above | 400000-character valid identity survives round/undo history within separate identity/progress budgets |
| restoring an older MY TEAM point captures a large current emblem even without a prior large point | 397–409 | 403, 405, 406, 407 | save-durability production above | Before-restore captures large current identity even without earlier large checkpoint |
| history identity allowance rejects invalid or excessive emblems and preserves the progress budget | 410–422 | 419, 420 | save-durability production above | Malformed/oversize/wrong-flavour identity or excessive progress is rejected |
| mirror reopens after unexpected close or an InvalidStateError without losing a quota-refused batch | 424–445 | 429, 432, 433, 434, 436, 437, 438, 440, 441, 443 | save-durability production above | Unexpected IDB close/InvalidStateError reopens and preserves pending failed-save batch; old event cannot poison new handle |
| a non-owning tab cannot restore, mirror, retry, import or checkpoint career saves | 447–467 | 455, 456, 458, 459, 461, 462, 463, 464, 466 | save-durability production above | Non-owner tab cannot publish/restore/checkpoint/import/wipe/retry career; owning mirror remains intact |
| SAVE RETRY heals unrelated settings in a read-only career tab and still retries the owning career | 469–500 | 473, 491, 492, 493, 494, 495, 496, 497 | save-durability production above | Retry action heals settings in viewer tab and only saves career for owner, then clears warning |

## save-migrate.test.mjs

Full read: `tests/unit/save-migrate.test.mjs:1–404`. SHA-256 `37adae8b19efed7eb5c64e394c26b91a8bddab5bfe416bd5128c138845af72f5`.

Production: `js/career/save-migrate.js:8-42,125-171,188-221,287-411; js/career/career.js (limit constants)`.

load 32-39 seeds real migration with two Haas driver codes. RUNG_INPUTS 42-46 cover pre-version v0 and v1; hostile JSON/numeric/map fixtures inline.

Migration mutation/serialization and source-format contracts; no actual Career.load/game boot; introductory future-schema comment 14 is superseded by rejection assertion.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| CAREER_V equals the number of rungs in CAREER_MIGRATIONS (source-slice) | 48–55 | 51, 53, 54 | save-migrate production above | Declared schema version equals counted arrow-function rungs and export |
| a v0 save climbs every rung and lands on CAREER_V with a season | 57–64 | 60, 61, 62, 63 | save-migrate production above | v0 climbs to current schema, season defaults, driver flavour/year |
| migration is idempotent at every rung | 66–79 | 71, 77 | save-migrate production above | Every representative rung stays equal on fresh and in-place second migration |
| legacy code-keyed points remap onto stable ids exactly once | 81–88 | 84, 85, 87 | save-migrate production above | Legacy driver-code points become stable IDs exactly once |
| future schemas are rejected before any normalization, including large versions | 90–99 | 95, 96, 97 | save-migrate production above | Future versions including large integers return null without mutation and fail validation |
| digit-only string versions use their actual rung and malformed explicit versions are refused | 101–124 | 109, 110–111, 112, 114–115, 121, 122 | save-migrate production above | Digit-only string versions accepted; malformed/unsafe explicit versions refuse before mutation |
| junk in, null out: a non-object save is refused rather than repaired | 126–132 | 130 | save-migrate production above | Non-object payloads refused |
| a malformed season (number, string, array) is replaced, never thrown on — Career.load runs at boot | 134–142 | 138, 139, 140 | save-migrate production above | Malformed season replaced with default object |
| a malformed driver identity is repaired so an existing slot remains recoverable | 144–154 | 148, 151, 152–153 | save-migrate production above | Broken driver identity repaired while valid identity retained and idempotent |
| JSON exponent overflow cannot poison career money or contract arithmetic | 157–168 | 161, 162, 163–164, 166, 167 | save-migrate production above | Infinity/exponent overflow cannot poison money/contract or reload |
| finite numeric strings retain career money and contract values | 170–174 | 172, 173 | save-migrate production above | Finite numeric strings retain spelled values |
| MY TEAM roster numbers are sanitised like the contract's: wageBill cannot turn money into NaN | 176–189 | 181, 182, 183, 184, 185, 186, 188 | save-migrate production above | Roster wages/remaining/pending asks become safe finite values |
| invalid driver points and overflowing legacy aliases stay finite and idempotent | 191–202 | 194, 195, 196, 198, 201 | save-migrate production above | Invalid aliases cannot erase valid stable points or overflow sums; idempotent |
| remapPoints: a pts key naming an Object.prototype member stays a finite number | 204–211 | 207, 208, 209, 210 | save-migrate production above | Object.prototype-named point keys stay own finite numeric values |
| a stored display code is never overwritten from the shipped roster on load | 213–227 | 222, 223, 226 | save-migrate production above | Saved display labels survive roster remapping; missing labels backfill |
| each rung climbed is logged once; a newer-build or junk save warns; a missing one is silent | 229–249 | 239–240, 243, 247, 248 | save-migrate production above | Each rung logs once; current/missing silent and invalid/newer warnings in game namespace |
| the career seat is clamped to the team's grid row (MY TEAM: seat 0) | 254–266 | 257, 258, 259, 260, 261, 262, 263, 265 | save-migrate production above | Seat index clamps to team row and MY TEAM always zero |
| hostile tdev / dev / offers / results / seats are coerced to finite, bounded values | 271–297 | 282, 284, 285, 286, 288, 289, 291, 292–293, 294, 296 | save-migrate production above | Development, offers, results and seat records bounded/sanitized with stable second pass |
| SaveMigrate's clamp limits equal career.js's TDEV_MAX / DEV_MAX / EXP_MAX | 299–305 | 303 | save-migrate production above | Migration clamp constants equal career constants |
| a save from before the tally derives it once from its history; a present tally is kept | 307–316 | 311, 313, 315 | save-migrate production above | Tally derives once from history, remains after trim and sanitizes invalid numeric values |
| a missing or junk team defaults as Career.start does, so the title's team.toUpperCase() cannot throw at boot | 318–326 | 321, 322, 324, 325 | save-migrate production above | Driver/MY TEAM team defaults remain safe strings |
| an imported season.config is dropped: a huge round must not make SeasonCal.netPts loop round times | 328–335 | 332, 333, 334 | save-migrate production above | Career drops imported standalone season.config while retaining huge round |
| a deal goal whose type names an Object.prototype member is normalised to champPos; a plain unknown type is kept | 337–344 | 340, 341, 342, 343 | save-migrate production above | Prototype-named deal goal types normalize; plain unknown goal types retained |
| remapPoints leaves season.config alone: the standalone season keeps its frozen rules (only migrateCareer strips it) | 346–354 | 350, 353 | save-migrate production above | Standalone point remap/migration preserves same config |
| JSON objects in numeric leaves cannot throw while opening a career | 356–379 | 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 378 | save-migrate production above | Hostile coercion objects in numeric leaves recover without throw and remain idempotent |
| roundMap and finishMap skip a __proto__ key like the sibling maps | 381–389 | 386, 387 | save-migrate production above | round/finish maps skip prototype pollution key |
| migrateCareer coerces hostile numeric leaves when the version marker is valid (live fuzz 2026-10-16) | 391–404 | 398, 399, 400, 401, 402, 403 | save-migrate production above | Valid-version hostile leaves exercise numeric recovery independently of version rejection |

## save-schema-registry.test.mjs

Full read: `tests/unit/save-schema-registry.test.mjs:1–226`. SHA-256 `3eb9cd458bcbdf5f8ffbb534c7473cc00f18124ac01224831670f3bb7d9241f2`.

Production: `js/core/save-schema-registry.js:14-243; js/ui/settings-export.js; js/career/save-migrate.js:404-411`.

Espree scanStoreCalls 84-130, storageReceiver/jsFiles helper, literal/const aliases and selected template keys; prefix/read exemptions and passthrough lists 19-69. Probe.js under artifacts is synthetic scanner input.

Static inventory bounded to recognized receiver/call/key shapes; dynamic reads ignored, approved dynamic relays/prefixes exempt. Registry classification is not storage durability.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| SettingsExport.SPEC rows are registered after ingest | 137–145 | 139, 142, 143 | save-schema-registry production above | >100 settings rows resolve with matching lane |
| every store/localStorage write in js/ resolves in the manifest | 147–167 | 166 | save-schema-registry production above | Every recognized write/remove resolves or is explicit dynamic/prefix/slot exemption |
| every literal store/localStorage READ in js/ resolves in the manifest (M1-17) | 169–180 | 178, 179 | save-schema-registry production above | >100 literal reads resolve except deliberate writerless/legacy exemptions |
| the read scan sees literal and aliased reads and ignores writes and dynamic keys (positive control) | 182–194 | 191, 192 | save-schema-registry production above | Synthetic scanner sees literal/alias reads, excludes unrelated/dynamic calls and distinguishes writes |
| career validator rejects non-objects and accepts a minimal save | 196–201 | 198, 199, 200 | save-schema-registry production above | Registry accepts null/minimal career and rejects array |
| SaveMigrate.validateCareerSave matches registry career slots | 203–211 | 209, 210 | save-schema-registry production above | SaveMigrate validator accepts minimal object and rejects string |
| the automatic UI flags (designerCoached, camComfortPref) are registered, typed, and device-local (#2320) | 213–226 | 216, 217, 218, 219, 220, 223, 225 | save-schema-registry production above | Local tutorial/camera flags typed and strictly registered but excluded from settings export; typo throws |

## scale-defaults.test.mjs

Full read: `tests/unit/scale-defaults.test.mjs:1–255`. SHA-256 `4c76db9fb48cace4a1ad2b96ca871083677913045584ad566863f45cc44e6959`.

Production: `js/ui/scale.js:9-303; css/tokens.css; css/overlays.css; css/hud.css; js/ui/settings-export.js`.

coarseDefaults 53-64 parses CSS; bootScale 131-165 VM stub elements/style/store; CSS source helper resolves split styles; reference-pixel mm approximation uses previously measured fit factors.

No rendered layout/device-mm guarantee; source text pins and stub style/event round trips.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| css/tokens.css and js/ui/scale.js agree on the touch defaults | 66–80 | 68, 71, 72, 75, 76–77, 78–79 | scale-defaults production above | CSS coarse HUD/UI/button defaults equal JS declarations and independent button token |
| the touch default puts every driving control over the physical floor | 82–110 | 98–102, 103, 105–109 | scale-defaults production above | Derived secondary/pedal sizes clear ~15 mm floor and pedal stays ≤28 mm |
| --hud-scale carries no blanket touch bump, and the old size stays reachable | 112–125 | 114–118, 123, 124 | scale-defaults production above | Readout scale remains 1, slider can reach former 180% and shrink below default |
| PANEL OPACITY: unset writes nothing; the slider clamps to 20-100 and reverts | 167–187 | 169, 170, 171, 172, 174, 175, 176, 177, 178, 180, 182, 183, 184, 186 | scale-defaults production above | Panel opacity writes lazily, clamps 20–100, marks override, reverts and stays separate from button alpha |
| HUD SIZE / BUTTON SIZE / BUTTON + PANEL OPACITY survive a reload with the same CSS value (B·H11 settings audit) | 189–208 | 201, 203, 205, 206 | scale-defaults production above | Four slider writes produce same effective CSS after new VM boot |
| PANEL OPACITY: the HUD plates read the effective token, and HIGH CONTRAST pins it at 1 | 210–231 | 212–213, 215, 220, 222, 224, 227, 228, 229, 230 | scale-defaults production above | HUD plates consume effective floor token; high contrast pins alpha; signal fills excluded; setting export registered |
| UiScale.defaultResMode() answers from the primary pointer, without create(G) | 233–242 | 235, 238, 239, 240, 241 | scale-defaults production above | Primary coarse pointer returns low resolution default, fine/throw returns auto, live row shares helper |
| button default and override survive HUD size changes | 244–255 | 246, 249, 253, 254 | scale-defaults production above | Button default/override remains stable as HUD size changes |

## scene-live.test.mjs

Full read: `tests/unit/scene-live.test.mjs:1–80`. SHA-256 `6755bcd4fe919d827e2a282f7e54e69e406ef0e9e50fa2bf30600b5af700d28f`.

Production: `js/garage/scene-live.js:41-131; js/garage/scene.js:1215-1227`.

Real garage modules loaded at 27-29; fake 2D canvas counts texts/strokes; throwing meta points getter and toggled circuitPayloadResident stub at 19-54.

Painter call/text/key evidence only; proxy swallows drawing and no pixels or actual lazy hydration performed.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| paintLive on an unhydrated stub paints the rest of the atlas instead of throwing | 56–62 | 58, 59, 60, 61 | scene-live production above | Throwing unhydrated points getter skips map but preserves next-race sign/footer |
| paintLive still draws the map once the circuit has points | 64–69 | 68 | scene-live production above | Real points produce map strokes |
| ctxKey changes when the circuit hydrates, so the live atlas repaints | 71–80 | 78, 79 | scene-live production above | Hydration bit changes cache key while stable stub produces same key |

## scenery-api-contract.test.mjs

Full read: `tests/unit/scenery-api-contract.test.mjs:1–262`. SHA-256 `e5bc2107b66e8ac4c274fa8db12991604a57011faf4015a14a4c7694eff91326`.

Production: `js/track/scenery/build-props.js:71-193,215-2282; js/circuits/scenery/; js/track/core/geom.js`.

CONTRACT 26-59 pins 114 names; real track build replaces callback for plain/wrapped defs; tests/data/landmarks/*.json drives required assemblies. Silverstone uses real geometry emitters with proxy API on synthetic slope; Portimao source text.

Surface name census does not prove every helper behavior. Landmark requirements/colors partly regex; Silverstone geometry is isolated fixture rather than full uploaded scene.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| the frozen contract is the size it declares | 61–65 | 62, 63, 64 | scenery-api-contract production above | Contract size, uniqueness and sorting resist accidental coordinated omissions |
| buildProps sceneryApi surface matches the frozen contract | 67–85 | 79, 83, 84 | scenery-api-contract production above | Plain callback receives exact frozen member names |
| reversed/source-coordinate defs get the same surface (wrapped) | 87–100 | 93, 97, 99 | scenery-api-contract production above | Wrapped reversed/source-coordinate callback receives same member names |
| BATCH-01 Must landmarks are explicit required scenery assemblies | 112–143 | 120, 125, 126, 127, 130, 131, 138, 139, 140, 141–142 | scenery-api-contract production above | Per-circuit landmark records valid/unique/required; Monaco text/harbour stations and Singapore cityFront density pinned |
| api.K wraps negative and over-lap fracs into [0, n) | 151–164 | 158, 161, 163 | scenery-api-contract production above | K wraps negative, start/end and over-lap fractions into valid matching indices |
| Silverstone camping preserves every object on grounded running gear and flags meet their poles | 166–241 | 207, 207, 208, 209, 210, 215, 216, 222, 227, 228–229, 233, 235, 235, 239 | scenery-api-contract production above | Camping counts/placement, chassis clearance, wheel contact, model bounds and nine cloth sleeves meet poles on slope |
| portimao Algarve cut banks stay red-dominant terra rossa (#3372) | 243–262 | 249, 252–253, 254, 257, 259, 260–261 | scenery-api-contract production above | Terra rossa palette dominance, ≥5 cut banks and ≥8 verge belts retain grounded dark-earth emission |

## scenery-ground-audit.test.mjs

Full read: `tests/unit/scenery-ground-audit.test.mjs:1–323`. SHA-256 `220124da215aa8733be891a4bd8d5291e1b44ca3b74a7dd7de3ac309bd80ee83`.

Production: `tools/track/ground-audit.cjs:63-270; tools/track/footprint-support.cjs:12-184; tools/lib/track-build-vm.cjs; tools/lib/stale-rows.mjs`.

Scoped roster cached real build and tests/data/scenery-audit-baseline.json; SAMPLE monaco/monza/spa/miami/bahrain. fixture 117-125 emits real TrackGeom boxes and retained primitive metadata, then trims; captured Monaco slab inline.

Baseline counts preserve existing defects; stale policy may advisory-skip other PR circuits; anti-vacuity skips scoped-out sample. Nine-point footprint support is advisory sampling, excludes thin masses, does not prove structural intent.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| baseline names every check and only real circuits | 58–67 | 61, 63, 64 | scenery-ground-audit production above | Baseline tables name only real circuits with nonnegative integer caps |
| every (scoped) circuit stays within the scenery-audit baseline | 69–75 | 70, 71, 73–74 | scenery-ground-audit production above | Every nonempty scoped roster result stays within baseline |
| no stale cap on the measured circuits — a cap above the measured count is a lie | 81–93 | 92 | scenery-ground-audit production above | Measured caps cannot exceed reality for strict diff/local circuits; other stale rows diagnostic |
| anti-vacuity: every check finds something on the sample | 95–101 | 99, 100 | scenery-ground-audit production above | Sample retains findings for every check and >5000 props each, unless scope excludes sample |
| lineOf names the circuit's own scenery line, past emitter plumbing | 103–112 | 109, 110, 111 | scenery-ground-audit production above | Attribution prefers circuit emitter over plumbing, fallback and unknown supported |
| partial footprint: one grounded edge cannot hide the tilted high edge | 127–140 | 134, 135, 136, 137, 138–139 | scenery-ground-audit production above | Tilted high edge flagged despite one grounded edge fooling legacy minimum-gap audit |
| partial footprint: grounded slab and a full foundation stack pass | 142–150 | 143, 147, 148 | scenery-ground-audit production above | Grounded slab and multi-level foundation stack pass independent of emission order |
| footprint support: overlapping foundations and stripped buried faces remain solid | 152–165 | 155, 162, 164 | scenery-ground-audit production above | Overlapping foundations and stripped buried bottom faces still provide solid support |
| footprint support: modelGroup remapping retains exact nonzero vertex ranges | 167–178 | 175, 176, 177 | scenery-ground-audit production above | Shipped model remap preserves nonzero primitive ranges and foundation support |
| footprint support: disconnected baked mesh faces cannot masquerade as a solid column | 180–195 | 188, 189, 190, 191, 193 | scenery-ground-audit production above | Disconnected baked planes produce nine unverified samples rather than false solid column |
| partial footprint: a neighbouring box or a floating foundation cannot supply support | 197–205 | 201, 204 | scenery-ground-audit production above | Adjacent/floating foundation cannot certify mass grounding |
| footprint support: AABB contact cannot hide a completely floating mass | 207–215 | 211, 212, 213, 214 | scenery-ground-audit production above | AABB contact false support is exposed as nine unsupported footprint samples |
| partial footprint: a rotated neighbour's AABB is not a foundation | 217–224 | 222, 223 | scenery-ground-audit production above | Rotated thin neighbour cannot provide support merely through its bounds |
| partial footprint: roof skins, bridge decks and thin cantilever arms stay out of scope | 226–231 | 229, 230 | scenery-ground-audit production above | Actual thin roofs/decks excluded despite tall tilted bounds |
| unsupported: a prop outside the terrain does not certify its neighbour (#1941) | 233–251 | 240, 244, 245, 246, 250 | scenery-ground-audit production above | Unknown-terrain support rescue retained in legacy count but exposed as advisory; grounded neighbour remains valid |
| partial footprint: missing terrain is explicitly unjudged | 253–258 | 255, 256, 257 | scenery-ground-audit production above | Missing terrain records nine unknown samples and no unsupported finding |
| partial footprint: the ground audit includes actual road and water surfaces | 260–270 | 266, 267, 268 | scenery-ground-audit production above | Road/water actual base surfaces support all nine footprint samples |
| partial footprint: an overhead road or water surface cannot ground a floating mass | 272–302 | 285, 286, 287, 288, 289, 290, 291, 294, 296, 299, 301 | scenery-ground-audit production above | Overhead surfaces cannot ground mass or recursive plinth; contact-height tolerance and solid terrain still valid |
| partial footprint: captured Monaco city slab reports the missed nine-metre corner | 304–323 | 311, 313, 314, 318, 319, 320, 321 | scenery-ground-audit production above | Real Monaco terrain yields 9–10 m missed corner, nearest node 288 and three finite-bounds review shots |

## scenery-grounding.test.mjs

Full read: `tests/unit/scenery-grounding.test.mjs:1–249`. SHA-256 `ce5cb87bbfd376828b714bdc3de664935bcea685f2603dac24a528d408dd33c5`.

Production: `tools/track/float-audit.cjs:165 onward,412-478; tools/track/float-baseline.json; tools/lib/stale-rows.mjs; js/circuits/scenery/jerez.js`.

runSweep 109-123 invokes real CLI once and parses JSON even on expected nonzero floater exit; empty output is fatal. Scoped roster/caps; Jerez callback wraps real API; synthetic floating members.

No suite executed for this map. Future sweep preserves legacy capped floaters (including intentional aircraft), scoped stale caps may advisory-only; no pixel judgement.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| floating scenery stays within the per-circuit baseline | 125–144 | 134, 142–143 | scenery-grounding production above | Scoped sweep covers roster and no circuit exceeds its cap (unlisted cap zero) |
| baseline has no stale entries — a cap above the measured count is a lie | 148–163 | 156, 162 | scenery-grounding production above | Measured scoped baseline rows cannot be unknown/stale under strict policy |
| Jerez paddock seats account for anchor embed and retain ${guard} guard | 168–208 | 179, 180, 200, 204, 206 | scenery-grounding production above | Generated clear/road/unsupported Jerez cases account for 0.3 m anchor embed; clear retains eight main plus three support motorhomes with shipped geometry, guards reject blocked seats |
| a low unsupported neighbor cannot hide a genuinely floating primitive | 212–234 | 221, 222, 223, 224, 225, 226, 227, 228, 230, 231–232, 233 | scenery-grounding production above | Cluster keeps 6 m defect beside 1.1 m neighbour independent of order; strict 1.2 m threshold is unrounded |
| float-audit CLI: the circuit is found wherever the flags sit; a bad --top is an error | 236–249 | 239, 240, 241, 242, 243, 244, 245, 247 | scenery-grounding production above | CLI target extraction ignores flag placement and --top validates positive integers |

## scenery-guards.test.mjs

Full read: `tests/unit/scenery-guards.test.mjs:1–349`. SHA-256 `574872b98c25e799c75acc12d5659589082e103a2f819b2dc2916a7ad5d20eee`.

Production: `js/track/scenery/build-props.js:71-193; js/track/scenery/structures.js:39-118,227-328; js/track/scenery/nature.js:167,1241-1431; js/track/scenery/city.js; js/track/scenery/identity.js; js/circuits/scenery/`.

Real verify-track VM counts suppressed kinds, keeps Montreal water geometry, injects Assets.modelSync spy, overrides Madrid/Imola/Spa callbacks; remaining guards inspect emitter/circuit source.

Suppression counters/source guards and model keys establish mechanism/geometry; source formatting dependent checks and albedo arithmetic cannot establish rendered look or GPU z-fighting.

| Case name | Case lines | Assertion spans | Target | Meaning / local limit |
|---|---|---|---|---|
| water occupancy uses world footprints across Montreal's 8 m and 12 m grids | 29–55 | 41, 45–46, 53 | scenery-guards production above | Montreal 8/12 m water grids retain two shore points and upload no overlapping coplanar rectangles |
| Monaco's armco keeps its posts: the guardrail guard margin stays below the gap | 57–61 | 60 | scenery-guards production above | Monaco guardrails suppressed count stays zero |
| billboards with a normal gap are built: Qatar and Monaco lose none to the guard | 63–69 | 67 | scenery-guards production above | Qatar/Monaco billboard suppressed counts stay zero |
| bakedModel rides the scenery transform like the fallback it replaces | 71–90 | 83, 85, 86–87, 88–89 | scenery-guards production above | bakedModel has dedicated id-first transform wrapper outside k-side list |
| every bakedModel call reaches Assets with the model id it asked for | 92–117 | 112, 115–116 | scenery-guards production above | Five circuits reach Assets with nonempty string IDs even when model lookup returns null |
| the backdrop guard RECORDS its drops — it was the one emitter that did not | 119–161 | 138–140, 154–156, 159–160 | scenery-guards production above | Spa backdrop drops observable and exactly 24; Red Bull pre-check leaves zero engine drops |
| a linear run is not re-laid over a span it already covers | 174–186 | 176–177, 185 | scenery-guards production above | All four linear barrier emitters consult containment guard |
| a run that wraps the start line is not read as contained in an earlier run | 188–217 | 215, 216 | scenery-guards production above | Wrapping Madrid guardrail retains every tested non-pit barrier side (>50 checks) |
| one tree per spot | 219–224 | 221, 222–223 | scenery-guards production above | Both pine and tree consult same-position planting guard |
| a facade draws no rail on its bottom face | 226–231 | 229–230 | scenery-guards production above | Facade rail loop omits bottom row |
| a ferris wheel staggers its members either side of the wheel plane | 233–237 | 236 | scenery-guards production above | Shared and Vegas ferris struts alternate wheel-plane offsets |
| layered spectator banks cannot coincide | 239–252 | 246–247, 248–249, 250–251 | scenery-guards production above | Spectator-bank per-call slot separates cross-track and along-track geometry |
| abutting runs do not emit their seam node twice | 254–272 | 263–264, 265–266, 268–269, 270–271 | scenery-guards production above | Tagged along traversal avoids repeating shared seam nodes, including canyon |
| along + wrapped helpers stay on the authored span (imola / spa) | 274–305 | 286, 297, 302–303 | scenery-guards production above | Along callback helper centroid stays within 120 m Imola /40 m Spa authored midpoint |
| transformSceneryApi along hands authored-frame k via sceneryNodeToAuthored | 307–321 | 310, 313–314, 315–316, 317–318, 319–320 | scenery-guards production above | Wrapped along/every convert engine node back to authored before callback |
| tyreWall tecpro/airfence model keys carry the colours their bodies are drawn in | 323–338 | 334, 335, 336 | scenery-guards production above | Tecpro/airfence stacks distinguish both body/top colors while sharing identical top strips |
| abudhabi Yas hotel bridges are pale steel, not near-black (#2258) | 340–349 | 343, 347 | scenery-guards production above | Two Yas hotel bridge albedo means stay in pale-steel 0.4–0.65 range |

## Fixture and dependency evidence

Shared fixture assertions supplement the case-local spans: rival boot 85; scale CSS parser 57 and pointer-query stub 235; scenery requiredLandmark 107–109 (invoked for every required id); scenery counts 24; Jerez wrapper 179–180 and 200 remain inside its case registration. The helper assertions are intentionally mapped as fixture prerequisites rather than duplicate test cases. Inline fixture ranges above are authoritative. Imported helpers seed actual IIFEs rather than mock the named subject; mini-dom and fake-audio intentionally replace browser services. Paths such as `/tmp/x/pin-now.mjs`, `/nonexistent`, synthetic `version.json`, foreign ratchet fragments, a synthetic probe script, and stack-string `js/…:line` examples are descriptive input fixtures, not evidence of those files existing or being executed. `artifacts/footprint-shots/*.jpg` are suggested diagnostic destinations; no images were generated.

Hash ledger below records the mapping snapshot for production, imported helpers, policy adapters and baseline inputs. Listed source ranges cover each complete dependency file for identity only; only explicitly described source slices were read. Circuit scenery and landmark fixture records are included individually because table-driven inputs determine the cases.

| Dependency | File extent | SHA-256 |
|---|---|---|
| `.claude/hooks/bash-guard.sh` | 1–724 | `e5cbc324d0f3f2c2a6f5e24b93fd6bc846fe7b5082776bc12d50c2e352c000b7` |
| `.claude/hooks/protect-files.py` | 1–492 | `2a9640cbbe0c2334e9929fad106fd1d3f2fe2beb70d765c106088a0ce67895ed` |
| `.claude/hooks/protect-files.sh` | 1–40 | `7452a7042869a1ac5288145290cff14ae0c2967ae86851cc5115a5bfb007baba` |
| `.cursor/hooks.json` | 1–14 | `842bd32d576023cf317b019d4c229fd5f352927561e31d02748949c17fab1a99` |
| `.cursor/hooks/edit-guard.sh` | 1–92 | `0e60da907c02f0fcd8f07cf74121a8d371461563a6301bd5b8705ea36b8bc07d` |
| `.cursor/hooks/shell-guard.sh` | 1–56 | `33417298b3836df6f234a86d52f7b63249c60b37659989ac3d49bb8c653f607d` |
| `AGENTS.md` | 1–199 | `b40fcb879153ce1c19bd2fe13aeaa771a21faa31b04d679828b01684b8295422` |
| `css/hud.css` | 1–2526 | `ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1` |
| `css/overlays.css` | 1–1469 | `9b84e3b6694cd8d7798cdd42353791f1dd80e74659dfd09470084bc37f34e101` |
| `css/tokens.css` | 1–1361 | `baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a` |
| `js/audio/rivals.js` | 1–359 | `60f7b6f9f8ccd38412bcdd6dea053d364fce39c452fa4fdbdcd4768c5c57e7b8` |
| `js/career/career-backup.js` | 1–997 | `25d223bc99ff1d74487827ea97a88dbe7cd0bdcde7e40837c0dfc44fa35bff4c` |
| `js/career/career.js` | 1–2028 | `679d9052fa1682c8aacc4df35c35b9142676b78f34349c1853bce274eadd24f8` |
| `js/career/restore-points.js` | 1–181 | `f9595d1da3c9176f1ce62ebbcb69004d5902c0257c5d2b6afb969968c56b301c` |
| `js/career/save-migrate.js` | 1–418 | `4cda0b16446ec654bfdab06d873ef934c45b9bebd8906621b2a908f8896793e7` |
| `js/circuits/scenery/abudhabi.js` | 1–1024 | `5184a7cda03f9ffeb254be56f349148667ad84e4f306f6435a25b7bf3e4dba98` |
| `js/circuits/scenery/albert_park.js` | 1–787 | `cac02663a612de38edf0a46e69ec96039ebe0479f0cb56d7308cd9a16e769138` |
| `js/circuits/scenery/anderstorp.js` | 1–953 | `54d64b718388c3114b352dc0393ae346cb6a52b427520f0c6933bd92c0ba136c` |
| `js/circuits/scenery/bahrain.js` | 1–1203 | `43b2886e64b71aac74fd6381bfaee5dbad2e45340cf0a159b4a80bead3978355` |
| `js/circuits/scenery/baku.js` | 1–870 | `97e87efd76e48ce9bd92cfd4da66ea724d62a342680b2884b5d87dd3e8488038` |
| `js/circuits/scenery/brands_hatch.js` | 1–935 | `cc2394ae1c180dac6f5de36878271b72224aeb729c75cc0596475f1ab1170615` |
| `js/circuits/scenery/buddh.js` | 1–715 | `37360583bfcf68bdc42d1f8ec415c5ab47e1daaed25a6a7533c21029b1964dcf` |
| `js/circuits/scenery/buenos_aires.js` | 1–380 | `17415169fe83e68352b05fdac97afbf25bbd5d96f94c5a29a70fd3ec76805acd` |
| `js/circuits/scenery/catalunya.js` | 1–454 | `a339054419c6b750b7adf95a044fc6797f3935fc2fea89f33132c5f9a98bea70` |
| `js/circuits/scenery/cota.js` | 1–627 | `229d8f739ed8ad4512b849a470a46bcd431d185a381239884780d5e95b429a0e` |
| `js/circuits/scenery/dijon.js` | 1–824 | `0f65b1e925d3c590d7873998396ed10acd0222dcf5214eb50eef44dd6b95ed7c` |
| `js/circuits/scenery/donington.js` | 1–704 | `f820744dbe16ac15e4f80a57e2905e4e18aeaea853db099b83130b1c8d60f186` |
| `js/circuits/scenery/estoril.js` | 1–441 | `226e58490f7918d51f0eb870473f080985b67dc10f5a903436badcc421fa6b79` |
| `js/circuits/scenery/fuji.js` | 1–593 | `ecf8abc94469bfe3c8de20583100a9d179eb020219ee3b140ef93da20beeafce` |
| `js/circuits/scenery/hockenheim.js` | 1–497 | `c7ac8bd6f8eeb894f18c765cc1e9ea5ca28b15e6a22dd9cdb2be47ee38bb8168` |
| `js/circuits/scenery/hungaroring.js` | 1–879 | `b82a4eb96859a1024445d3b636672ed501321d3ebf0970a535b2766c6fad378c` |
| `js/circuits/scenery/imola.js` | 1–885 | `005467474ffae4828e72f51c6f43662d5907c27965d65633ba98c653e9211257` |
| `js/circuits/scenery/indianapolis.js` | 1–559 | `d1ad0b9f3597ceed76bf86b418b8f978df3ec30bdf396173f536b7a2b5f2a540` |
| `js/circuits/scenery/interlagos.js` | 1–1040 | `e09806dcdfb944923f75603651c5a9d2f5b8922cda7a3943120a387b633f152a` |
| `js/circuits/scenery/istanbul.js` | 1–357 | `f17ddcc1b6b91ebcfe5d80cded24a722e96e4334a88e112812c0bd04fe115089` |
| `js/circuits/scenery/jacarepagua.js` | 1–532 | `b8b19fe725bfd5011e74c3628f6c4c14995fed96bdadf4d497db094e693f1b8c` |
| `js/circuits/scenery/jeddah.js` | 1–840 | `684b20348eabad3f3ef72d43d2049a90b2ec81fb4aa6b5ad1b1948c91084e32b` |
| `js/circuits/scenery/jerez.js` | 1–797 | `dea349feb75e826c24dd92a3f70295f24564faffd17017c717f3169966fc093f` |
| `js/circuits/scenery/korea.js` | 1–485 | `e1afe4dd02d55629f172c67bb776bead02978f91fed47bb397a2782767b80d27` |
| `js/circuits/scenery/kyalami.js` | 1–593 | `23759f0442beb731f97ed9b0bc11f5c74bf119f22074f190670ab816b07b128c` |
| `js/circuits/scenery/madrid.js` | 1–1104 | `e7f3f98092e4f145cee2e5bd3410ed7a3a4f005b4c40f78ea704789e1e859727` |
| `js/circuits/scenery/magny_cours.js` | 1–652 | `4b527de2cf4703c9821666be187780846573c62c36a7f127adcd0686fee21caf` |
| `js/circuits/scenery/mexico.js` | 1–1097 | `3892cb16c69db40988e0dd68488107f5f4e334e1ee025be0df9ce7ef15f928df` |
| `js/circuits/scenery/miami.js` | 1–926 | `c3697eb8cd640f3323459311beee0dc66fc7048b32f640c5f081cd3ae82d9a83` |
| `js/circuits/scenery/monaco.js` | 1–1731 | `bafcc09ad5d51bc9a62bb2bbd7b74c7fd11471dbf61130748e763987ade26883` |
| `js/circuits/scenery/mont_tremblant.js` | 1–964 | `021a460fcb545f7cd31a57735bd84f738bc4e084a3fdae6e7245484e37922d5e` |
| `js/circuits/scenery/montreal.js` | 1–1111 | `07ebf410b6464d5e9c2096060883bb49c2723ad17d7a6420f5ab7c4afa649cdc` |
| `js/circuits/scenery/monza.js` | 1–956 | `e1befc0e7691a6ef16a05d55138bd42d7562654860a1b6d89fce054489007a3a` |
| `js/circuits/scenery/mosport.js` | 1–559 | `ae41aa7adab6790e1ccd628ab61ce8f8f2f6039b93b60c1cc76aa7902201bf4e` |
| `js/circuits/scenery/mugello.js` | 1–731 | `ddde9704891bb526ecfb5dbaaadca9eca2f3725c98193e9b9adf8e89ee914c3a` |
| `js/circuits/scenery/nurburgring.js` | 1–508 | `838a479da6a9c3539f12e2971d2e6db59568b8c88b33f78d559a8634d77a86f3` |
| `js/circuits/scenery/okayama.js` | 1–728 | `aec35897905bcee72b13bb5403ef08c822d4f9148a02b467e994e3e97e3c34e5` |
| `js/circuits/scenery/paul_ricard.js` | 1–670 | `57760d07332aa1b0eeb3a998dc1d2c3f764efb366c7b9e423186556600fab2f0` |
| `js/circuits/scenery/portimao.js` | 1–782 | `1e941cea9adacabd32ed90e00fad302eb40cc25818c3e61827fcfc63f996fa84` |
| `js/circuits/scenery/qatar.js` | 1–747 | `3374a9f82097a5899e7d7518f54072c82fb602af22128eac02ff77c6544f979f` |
| `js/circuits/scenery/redbull.js` | 1–674 | `805e3d46c7be3b775e1cd2eb683c432dcd95b0bf68c26bb03a027ec0fc1f06b8` |
| `js/circuits/scenery/sepang.js` | 1–498 | `2e74ce9c6057088ee1b5b448f8ac458456e6c990c194653ac7ae0094c18bf20b` |
| `js/circuits/scenery/shanghai.js` | 1–1091 | `37aa0300b0e7e9b8af0fc6080371a8e879828e668255fcfb0f16cf9ffbfa70bc` |
| `js/circuits/scenery/silverstone.js` | 1–1400 | `286f2c5e839a7107339fea5d1aaf864e9256633a910fc1efcc29c70a3ef91b44` |
| `js/circuits/scenery/singapore.js` | 1–1176 | `760a431cae7c43f1b72101be72bb7e918cba5cb7ad8cb85e0e8dd3f8d8ae435c` |
| `js/circuits/scenery/sochi.js` | 1–578 | `c5be2cc99139da0e7b7872e4025811066ee3407e8a6ad0fe896925d7518cfab0` |
| `js/circuits/scenery/spa.js` | 1–925 | `c1d74bea47c168f437892c8407b9f1150872120cfbeb6e454d4516e2c4afef6a` |
| `js/circuits/scenery/suzuka.js` | 1–993 | `edb15193b84ffa4b13de64b4c6961fbf4cdfee203123b6d796487b7d0eb42777` |
| `js/circuits/scenery/vegas.js` | 1–915 | `35edfe428078ebb2def65ece524d72d44fde264a7dc777842d5741c2b28ea238` |
| `js/circuits/scenery/watkins_glen.js` | 1–664 | `d6edd82c0a56b5609016a056cb06181125aaf77abc2c80645e68c5f1783c71b0` |
| `js/circuits/scenery/zandvoort.js` | 1–897 | `920cae2d16e1ad4b412961ab4fcaba0bee30af9c41b2bba49a82599efb3b5e3f` |
| `js/circuits/scenery/zolder.js` | 1–985 | `8b9ef88b8601e6c19918c935de8a83c67b67d16ced276c1b1c853297a3777678` |
| `js/core/save-schema-registry.js` | 1–252 | `07260aef62338806e9e87179bb43ec5f89450338fe888e0759d585ca06e3b263` |
| `js/core/store.js` | 1–878 | `736b2573d7a8376f5eaa7526486310fa1455e47ee7aa20c510ba4f648f2dda0b` |
| `js/game.js` | 1–9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/garage/scene-live.js` | 1–215 | `f37ab403ccabe33c92bd23d4088a102897dc028541af839213ecbe00195bd5bf` |
| `js/garage/scene.js` | 1–1532 | `43e2ba3b86ea7e2a74cf2d2d14b45a403d5a515320de597c9170a2d7e3fd20d9` |
| `js/perf/governor.js` | 1–1244 | `a243095a7563eb9982aeacbe69dc26ac57aba410b46ead3c582033b0b3dd931f` |
| `js/race/driving-coach.js` | 1–804 | `38493215d619ae6e0c0e8680ffb4e007d529d7de1f19e66df7991aa50e29c127` |
| `js/race/race-control.js` | 1–744 | `1dfaf228a9906bc173fdccad5e6605514cc530fdc48ff9883935813c80dd67ca` |
| `js/race/race-radio.js` | 1–777 | `0a2a4008e68347afffea98bc1b5de29e1dc459c0d98a2431576683535ce12196` |
| `js/render/shared/post-common.js` | 1–215 | `7dc6456d40aa6ef156a3491447fb05a935e9ee8c94708ea3eb0369489474d7a9` |
| `js/render/webgpu/wgx-roadlut.js` | 1–180 | `40c386ce6eb9dff1da9f903e15b5ec4b2c69a1f92692bf1800424508a843bff8` |
| `js/track/core/geom.js` | 1–370 | `b26d3ac24079b41009a095c9ca6f38ac44720d284c376a588932ac160ce0187a` |
| `js/track/core/mesh.js` | 1–1575 | `8e73c2816f2fa9bf1c711813533e7c87c89a551be7556b90469364b308f8585c` |
| `js/track/core/surface.js` | 1–182 | `a727c04aef70838131ea2bcca9751f4ffdb3dc8ffd7e8f5b93591d439aa21653` |
| `js/track/scenery/build-props.js` | 1–2290 | `8b508e1c98ee00ab02a88acd6843371a6fa6c8414837eea86f775a5936eb785c` |
| `js/track/scenery/city.js` | 1–930 | `cd54bb6492f48c13b28fb3939f1f6ce32af59a8fda12497f83f87a564e1843dc` |
| `js/track/scenery/identity.js` | 1–449 | `59794921b71390b85f70296aa2151ebd46687983e81237a6a6bcc59cd25f7ff0` |
| `js/track/scenery/nature.js` | 1–1626 | `1a7da353b988c273362b3121129df92b3e4e252dcdd313f8092b0405eeb19faf` |
| `js/track/scenery/structures.js` | 1–1130 | `28c1d77dcdef94fa5ae828dcf6ea7693cd9aca7878fc12c9320ac8e23942b8b5` |
| `js/ui/save-health.js` | 1–167 | `1cea6dfea0e102222af2afb889c2b278418e4f706485e6e8b3b909c07a4a7029` |
| `js/ui/scale.js` | 1–305 | `64ffdce70e21a437481f4ee17012263928edb9271117214b3b87fcbff09cb412` |
| `js/ui/select-screen.js` | 1–1540 | `ebefdf18b0a6f804f902f4d3737f02cf3bb7414d21d27efa419b91256b14c1ac` |
| `js/ui/settings-export.js` | 1–1348 | `f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3` |
| `tests/data/landmarks/abudhabi.json` | 1–11 | `111cdcb8c73ed05812689227fafd072ce2864dd22302aaa12a3d81891be39da0` |
| `tests/data/landmarks/albert_park.json` | 1–8 | `5c7670736616264fb194d548df4a75cea2f20a67a1777ef24a841310ea07ad69` |
| `tests/data/landmarks/anderstorp.json` | 1–9 | `1d2a0a769691b0b34887b6601b0245172c78469ef3168ca3abc9d11979ff14dd` |
| `tests/data/landmarks/bahrain.json` | 1–11 | `af13cfa10f05e6d87b409f3c7617d355d70cd48b75aa6a39ce5a53a2c57e721b` |
| `tests/data/landmarks/baku.json` | 1–7 | `14d241a895e20c5efa5e5ab3d6ad89fb40ded7b90120be927c697331d2a51ee7` |
| `tests/data/landmarks/brands_hatch.json` | 1–10 | `1c84d8d1622ca68c5706ffd6d0fe4e9d7999529959ad4976c92a92653114d5d1` |
| `tests/data/landmarks/buddh.json` | 1–8 | `93084f6317ef6eab2cb18fa088715cfdc3c455a283ba2b6c68cb42676daa481e` |
| `tests/data/landmarks/buenos_aires.json` | 1–11 | `6db5c507c231f36321cb2d1123d1aa21f5dde53ad93645599815ddb2f59d1c66` |
| `tests/data/landmarks/catalunya.json` | 1–8 | `be60d2a6f1de243a7a8b33c4bc4bfd530cb51b158019dd881908a2c986ba6ea4` |
| `tests/data/landmarks/cota.json` | 1–7 | `8b2aeac1788b5782d8d7064e2a6dfc773144526b63d90988ade8e0e36bfd463c` |
| `tests/data/landmarks/dijon.json` | 1–10 | `83f9391280846e33a483f724283fc49d5bab03542432699ab1776458aebdd52d` |
| `tests/data/landmarks/donington.json` | 1–8 | `bee9544423f9c5cc7493d78f01aac050fe1da14b95383e3d217162e44b4a0660` |
| `tests/data/landmarks/estoril.json` | 1–10 | `e58d3d05756a34693ec1b4069a56ed218eba117b6a3b63c1e92b58dcd3fd95df` |
| `tests/data/landmarks/fuji.json` | 1–7 | `f0322868076553f13d9ed7df852516a4fc6664f6ac3398de9c2b27e35cc0c664` |
| `tests/data/landmarks/hockenheim.json` | 1–11 | `1bed07ab00e4b61da954d0dcb9565c95858412effc598000f655815caf8c536c` |
| `tests/data/landmarks/hungaroring.json` | 1–7 | `bb9b029cf96264d0e07242268cfdb4a40eafbeeeecc8fc1e1938d950d52392e4` |
| `tests/data/landmarks/imola.json` | 1–10 | `b7c85fe9b01627964b3b064db61f6a669817d76e90a63b1d66647b162255946a` |
| `tests/data/landmarks/indianapolis.json` | 1–10 | `ebadb88740c15bfd2699a7b45cda0b783a286371ee3e76d11cdfd69485f92b42` |
| `tests/data/landmarks/interlagos.json` | 1–10 | `892230528538526e2b9189f0eb8c0a055f1572b685d0223ac014de094d7c1b78` |
| `tests/data/landmarks/istanbul.json` | 1–8 | `d579bf239d6de03dc78b8ce11aa1112a1d131bfa7ab0241274ce7ba1a5c26a36` |
| `tests/data/landmarks/jacarepagua.json` | 1–17 | `12b2343481a87e8d036d6a99f81edfb6fa278e58386e270436e488d9bc6df42e` |
| `tests/data/landmarks/jeddah.json` | 1–11 | `bf2bf9f9ae094b12c3ba023c96cac4065b7d1d1905d01eaa00661f38bb052ad9` |
| `tests/data/landmarks/jerez.json` | 1–9 | `d8475ed595158ee78c17a0cac41ca963ac911e75139a3ec2c656815aa56e65b3` |
| `tests/data/landmarks/korea.json` | 1–9 | `57d68f26d5c5b5246d15d5f8ea1e7e76e688fce30ffbc9a18952e30722f52089` |
| `tests/data/landmarks/kyalami.json` | 1–11 | `3d158858157d02d554f3e121fcb5eab2ea1b747cbd160245836e9919222dbae7` |
| `tests/data/landmarks/madrid.json` | 1–7 | `daff4ba852a2e2f5a223034cae8bd7752ce919990d70432691e05fb3d720bcd0` |
| `tests/data/landmarks/magny_cours.json` | 1–11 | `f20387dffc7cad6bfdff811cbcafb7519b6e1d921dee87ee82e5b6f861dbdada` |
| `tests/data/landmarks/mexico.json` | 1–11 | `21cb76f62d18a0f8bc29ff283b1984f5ce71a40bb2d36577748ae84a3c29dc3d` |
| `tests/data/landmarks/miami.json` | 1–9 | `e731f337547ccfdb66f90c1441013510d91aae05172e68927de9878b9202a095` |
| `tests/data/landmarks/monaco.json` | 1–9 | `f6093848280d4260ded6abc6e3ddecd9e33fa1ebb5f79e7b1b299b39b816b013` |
| `tests/data/landmarks/mont_tremblant.json` | 1–10 | `1512014cd0c0281d7fe503c0ea0732990c39d9c8f8f2284944542dbe898c0b81` |
| `tests/data/landmarks/montreal.json` | 1–9 | `1faa64c233982d3b6ab56728920e60ba3811bb234a06c21ca7d0bd8f80e26bc6` |
| `tests/data/landmarks/monza.json` | 1–8 | `3f1a154369d7d6aca7ab1666fa36d7d7a58428786ea889d2deba6f6ab43a484f` |
| `tests/data/landmarks/mosport.json` | 1–9 | `ad0c8f1bb2ae4ac59eea7b28a904a3090ed01610e1ea7b515526fe1328f390ae` |
| `tests/data/landmarks/mugello.json` | 1–8 | `5c07e4690ad15915ddb067f0700f351cda240a250e06bcba5d85e2fec8267a1e` |
| `tests/data/landmarks/nurburgring.json` | 1–8 | `afc2d9460bc94773a4b8609b82c95c08cd6c4c4d4bcae353feb4f68668938bc0` |
| `tests/data/landmarks/okayama.json` | 1–8 | `14656c96b3407f88521787d559e6d8bcbd54630fed285030983b5829c66840d4` |
| `tests/data/landmarks/paul_ricard.json` | 1–13 | `ec0a3c810e1ecbf5f69aa01bf7ab26aa3f435f83ad524e91197673a2a2d5e118` |
| `tests/data/landmarks/portimao.json` | 1–10 | `e381ae6acfda8b1eadbab543b2d86f98c656abe4286393c617e701708d11096c` |
| `tests/data/landmarks/qatar.json` | 1–12 | `80e99259f2e18c973fe3889c54b1a7027884fcb06a32655d428a67cc36ebe914` |
| `tests/data/landmarks/redbull.json` | 1–6 | `fd4fa783b13f8e6ab4dfab0fe948e65ca8c459f219462d82f491f1fd1cfe5f99` |
| `tests/data/landmarks/sepang.json` | 1–10 | `db7b9984a59052df68fc0fdc2c385caa72c261ad4108c03827eb9eade4057e07` |
| `tests/data/landmarks/shanghai.json` | 1–10 | `9047535e977cfbaeaa47a05d0cf5c419ae2fbc54c0ff911547bf5a1d72f65078` |
| `tests/data/landmarks/silverstone.json` | 1–10 | `8b986d676c68ce4bc309ceb5144555fc7f5ff68e7c975a0ce73287e271ce033e` |
| `tests/data/landmarks/singapore.json` | 1–9 | `88bbf769752ffca3b9ffd8b0d479d72f6ac666dd537e27fba0b46efad01ea568` |
| `tests/data/landmarks/sochi.json` | 1–15 | `b3ed07b4721d3b416c59ce96ea3d712733cc00509feaa50a12cbfdc73bd9951c` |
| `tests/data/landmarks/spa.json` | 1–8 | `fade5b14785f91d3419a5c909eefa2ae626c64c97066c9a1c3484bb578702396` |
| `tests/data/landmarks/suzuka.json` | 1–9 | `393042ee1c5305e608495fb33a70a2bd8e2486650fb9adaa4f585dd986ca1085` |
| `tests/data/landmarks/vegas.json` | 1–11 | `ad5a55e263bc64b25537a2d2bb4d6155c11f22deb0324bb8aa1cee72b86cde52` |
| `tests/data/landmarks/watkins_glen.json` | 1–8 | `91941a42b53f9950c79b441d54c702a94c61c2d03d916cb9ca3a09da1b94e23d` |
| `tests/data/landmarks/zandvoort.json` | 1–6 | `ec3d1306e94600d121cbbe44b4e7c47549e58235e5297a9e45c45a249c41a430` |
| `tests/data/landmarks/zolder.json` | 1–9 | `016e8c6142ce6cfe98757403227177075ca8f7a68437aeb5d31c4753273de232` |
| `tests/data/scenery-audit-baseline.json` | 1–74 | `20375f3a84981c57084331882c470de360199613cd08f80e0781d560c0d2d290` |
| `tests/helpers/abs-src.mjs` | 1–8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| `tests/helpers/css-source.mjs` | 1–2 | `434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a` |
| `tests/helpers/game-source.mjs` | 1–84 | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tests/helpers/git-fixture-env.mjs` | 1–64 | `4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82` |
| `tests/helpers/mini-dom.mjs` | 1–186 | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| `tests/helpers/seed-log.mjs` | 1–35 | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| `tests/helpers/seed-save-migrate.mjs` | 1–31 | `01e258dd999942cd1633f79d6ef90b693c2b6529bf11d67ebf7160fd6c505295` |
| `tests/helpers/seed-store.mjs` | 1–46 | `297b0cf94ef8740b5f6dc8cbb2d2fd7e068dd0c7bfb4a5ec53e541864496f6d6` |
| `tests/helpers/store-key-scan.mjs` | 1–37 | `ef5c6d02157ba28b40503743de69e7b88f737a0b31977c2586656eb4d11b80a5` |
| `tests/helpers/tmp-dir.mjs` | 1–24 | `4f84935d6ee62ee07e609587b8d72a5140266327297d271179184a78df46a9d7` |
| `tests/unit/fake-audio-vm.cjs` | 1–36 | `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7` |
| `tools/gfx/road-lut-census.mjs` | 1–265 | `4365525bad72ebd68e5f4584f5a0e3a27d86accf1ce67f140c36a663a5f5ce9e` |
| `tools/lib/circuit-scope.cjs` | 1–52 | `a561a95c3ce392cc43bc648b3e4cf181016cb91ef08771d4e7c122e264399c41` |
| `tools/lib/road-position-checks.cjs` | 1–89 | `851a40751ec7cb8d3aad2755eb753cc42a30605f772f84ed1702a685a541318c` |
| `tools/lib/run-pid.mjs` | 1–86 | `d0cfbaf528ae698255d0bc965218f92fa53a750ac9f7151998cb2a26e41c0f23` |
| `tools/lib/stale-rows.mjs` | 1–35 | `945360da5b48119a02bbf91a71d8bbaad7cf7f84ed0a4e1c925b8caf68d13c1a` |
| `tools/lib/track-build-vm.cjs` | 1–270 | `09e00ae387a0e46bf25c9d7cbe4eb71ab32c891b7aba36e645c5d6614f6f311b` |
| `tools/manifest.cjs` | 1–1691 | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| `tools/track/float-audit.cjs` | 1–795 | `b7a3bb559686d84c889784039676b6be8400d49c2dd8e5a35400ba735893238f` |
| `tools/track/footprint-support.cjs` | 1–186 | `97a10266242664bd899bc8a21c72b17f82a89f0802f471dc2d6cbcb95ba9638d` |
| `tools/track/ground-audit.cjs` | 1–371 | `9afae60024a8d8a2c58cd02c9cb1e418726f45d8bfe0079029ecfd461c3b0e04` |
| `tools/track/verify-track.cjs` | 1–458 | `6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b` |

Total: 165 source registrations; 167 concrete cases after expanding the Jerez three-value loop. These are static coverage findings, not pass verdicts.
