# Research C — the areas lane A never reached (2026-11-04)

Kind: research · Re-measure-by: 2027-02-04

Bryce asked (2026-11-04) for two more research lanes over the parts of the tree lane A listed under "Not covered
this round" (`RESEARCH-A-TEST-GAPS-2026-11-04.md`). This is lane C: race and sim (`pit-lane.js`, `race-control.js`
past line 260, `ai-drive.js`, `collide.js`, `tyre-model.js`, `incident-sim.js`, `real-replay.js`, `js/car/*`),
career and persistence (`career.js`, `career-planning.js`, `custom-team.js`, `js/garage/*`, `js/share/*`), the
`js/audio/*` lifecycle, and the CI selection tooling (`select-specs.mjs`, `node-plan.mjs`, `pick-unit-slices.mjs`,
`tests/helpers/*`, the `groups.json` membership question). Lane D (a sibling) owns UI/HUD/CSS, multiplayer and the
render backends; nothing of those is here. Deploy tip `4fac7657`.

Method: five `prior-art-scout` passes seeded the do-not-re-report list (DEFECT-LEDGER, docs/BUGS.md, every
`*HUNT*-2026-11-03` note, lane A's issues #4767–#4775, the flaky quarantine); seven `code-hunter` passes on Opus,
one per slice, each told to RUN a repro (`node -e` against the exported functions, or a VM rig copied from the
nearest unit test) before a row counted; `finding-verifier` on Opus over every row before it was filed; live probes
in Chromium through chrome-devtools at 844×390 touch, DPR 3, iPhone UA, Bryce's settings export applied through
`SettingsExport.applySettings` (152 keys); `deploy-research` plus a `pdftotext` read of the FIA 2026 Section B
regulations (Issue 07) for the sporting-rule edge cases. Every hunter hit its turn cap, so the "still not covered"
list at the end is real.

## Ranked findings

Rank is phone impact × confidence. CONFIRMED-VM = reproduced by a `node -e` run against the exported functions or a
VM rig copied from the nearest unit test, with the output quoted; CONFIRMED = the verifier read the quoted lines on
the tree and ran the repro; CODE-TRACED = the path is traced line by line but no run shows the wrong value;
NEEDS-BROWSER = the code path is confirmed and the remaining question needs a real device. Effort: S < 1 h, M half a
day, L more. Row 9 is a sporting-rule question, not a bug: it is filed `needs-decision`.

| # | Finding | Evidence | Why it matters on the iPhone | Proposed test / fix | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | **RETRY SAVE after a full-storage failure leaves the career's armed revision out of date, so every later career save is refused as a "conflict" with no UI and the session's progress is lost on reload.** `retrySave()` calls `Career.save()` (fails again, `durable:false`, re-arms the revision) and then `store.retryFailed()`, which re-writes `career.driver.N` through `store.write`; that write bumps `_keyRev` as a LOCAL change (even when it fails) and Career's subscriber ignores local changes, so `careerRevision` is stale. Once storage frees, `save()` fails the revision test at `career.js:289`; that branch never sets `careerConflict`, so `blocked()`/`conflicted()` stay false, `grant()` still returns the new balance and the save-health banner (which listens for `durable === false` only) stays quiet. | `js/ui/select-screen.js:81-88`, `js/core/store.js:169,190-196`, `js/career/career.js:289-291`. VM (the `career-cross-tab.test.mjs` rig, `setItem` throwing `QuotaExceededError` on `apex26.career.*`): quota on, `grant(10)` → RAM 110 disk 100 `{ok:true,durable:false}`; `retrySave` body while full → `retryFailed {retried:1}`; quota off, `grant(20)` → RAM 130 **disk 100** `saveStatus {ok:false,reason:"conflict"} conflicted false`; explicit `Career.save()` → refused, disk 100. | Quota failures are a phone problem (small origin quota shared with the mirror, ledger 1782) and RETRY is the button Bryce would tap. After it, a whole career session evaporates on the next reload, silently. | (1) In `save()` set `careerConflict = true` when the revision differs (as `scoreRound` does at `:1367`) so the recovery UI appears; (2) stop the self-inflicted bump: re-arm on a local change to `liveSlotKey()` when the stored object is `career`, or leave the live career key out of `retryFailed` once `Career.save()` ran. Test in `career-cross-tab.test.mjs`: "retrySave under quota then recovery persists the next grant" (disk 130, `saveStatus().ok`). Follow-up: `SeasonCal.save` + `retryFailed` is the same pattern. | S | CONFIRMED-VM |
| 2 | **A diff that edits an ADAPTED spec in vm-page partition A plus anything that routes partition B skips `test:vm-page-b`, and the circuit spec then runs nowhere on the PR.** Once `editedAdapted.length` is non-zero, `node-plan` runs each vm-page script only if its partition holds the edited spec and never consults the normal routing; `select-specs` treats ADAPTED specs as VM-covered. | `tools/ci/node-plan.mjs:230-233`. `plan(['tests/specs/albert-park-foundation.spec.js','js/circuits/imola.js']).run` = `[game-vm-a, game-vm-b1, game-vm-b2, node-slow, vm-page-a]`, why `test:vm-page-b: "edited ADAPTED spec is in another vm-page partition"`; `plan(['js/circuits/imola.js']).run` has `vm-page-b`. `select-specs --files <both> --json` lists `imola-foundation.spec.js` only under `coveredByVmTwin`. `pick-unit-slices` says run page-b, but `ci.yml:1039` gates on `planned test:vm-page-b`. | A circuit edit riding with a spec touch is a normal PR shape; it can go green with its foundation spec never run, on the branch that ships to the phone. | Union instead of override: when a script is in the target set push it, otherwise fall through to the `needs`/`scriptBuilds` routing. Test `node-plan.test.mjs`: the mixed diff contains `test:vm-page-b`; `plan([adapted-a spec,'js/game.js']).run` equals `plan(['js/game.js']).run`. | S | CONFIRMED |
| 3 | **`rollover()` mutates the whole career and ignores its save; a refused save leaves a new season in memory only.** No revision pre-check and no rollback, unlike `acceptOffer` (`:1662`) and `scoreRound` (`:1338-1368`, deep-copy restore). With the revision stale (row 1, or any same-tab write that skips Career's re-arm) it returns a full summary, the disk keeps the old season, `conflicted()` is false and a second `rollover()` advances the year again. `acceptOffer` likewise ignores `save()`'s result at `:1697-1700`. | `js/career/career.js:1727-1728,1865`, caller `js/career/career-ui.js:1793` ignores the return. VM (revision bumped after `load()`): `rollover()` → `{year:2027, offers:[1]}`, RAM year 2027 hist 1 round 0, **DISK year 2026 hist 0 round 24**, `saveStatus {ok:false,reason:"conflict"} conflicted false`; `acceptOffer(0)` → null. | The end-of-season sheet and offers are shown for a year that is not on disk; after a reload the finale comes back and the winter is gone. | Entry guard `currentRevision() !== careerRevision`; snapshot before mutating; on `!lastSave.ok` restore in place (keep the `season` alias), set `careerConflict = true`, return null; `career-ui.js:1793` checks for null. Test `career-cross-tab.test.mjs`: "a rollover whose save is refused leaves RAM equal to disk". | S | CONFIRMED-VM |
| 4 | **A side rub with a net-owned VS FRIEND rival writes speed and `contactT` onto the REMOTE car; the local car pays nothing in half the geometries.** The rear-end branch guards `netPlay.owns` (`:672`, #2164); the side branch has neither guard, and when `sideYieldsA` elects the remote its `speed = scrub(...)` is thrown away by the next packet. | `js/physics/collide.js:612,615-616`. VM (load order of `collision-contact-vm.test.mjs:682`, `netPlay.owns = c => c === remote`): local human prog 103 x 0, remote human prog 100 x 1.8, both 50 m/s → local dv 0.0000, contactT 0.22; remote dv −0.0500, contactT 0.22. | Wheel-to-wheel in VS FRIEND costs the two phones different amounts for the same touch. Not a curvature channel (`k = 0` whenever a human is in the pair). | In the side branch the local car always yields when the other is `netPlay.owns`; gate the `contactT` writes as `:672` does. Test: a side twin of `netRearEnd` (`collision-contact-vm.test.mjs:614-638`). | S | CONFIRMED-VM |
| 5 | **The side-rub yielder can be a parked retired car, so a mover rubbing along a wreck loses nothing and keeps steering into it.** `sepShares` makes a retired car static (`iA = 0`) but `AiDrive.sideYieldsA` picks the yielder by geometry alone; the parked car gets the scrub (speed already 0) and the mover gets no scrub and no `contactT`, so it never goes compliant. Retired `parkedOnRoad` cars do reach the solver (`game.js:4632-4643`). | `js/physics/collide.js:481,615-616`. VM: mover prog 103 x 0 at 50 m/s, retired car prog 100 x 1.8 → mover dv 0.0000, contactT 0; parked contactT 0.22. Mover BEHIND the wreck → dv −0.05, contactT 0.22 (correct). | AI cars passing a parked retirement (#2162) rub along it at full speed, possibly every frame. | Before `sideYieldsA`: `!iA` → b yields, `!iB` → a yields; let `sideYieldsA` decide only when both can move. Test in `collision-contact-vm`: both orderings, assert the mover slows and gets contactT 0.22. | S | CONFIRMED-VM |
| 6 | **A css-only diff throws away the SOURCE_AFFECTED pins and carried-forward failures.** `candidates` is `cssSpecs(changed)` alone for `kind === "css"`; `sourceAffected` is computed at `:1483` and never used; nothing records the drop. | `tools/ci/select-specs.mjs:1497`, pins `:1249-1250` (`css/career.css` → `career.spec.js`, `career-hub.spec.js`). `select-specs --files css/career.css --json` → `matched`, selected = `css-player-smoke.spec.js` only. | The career hub is a phone screen Bryce uses; its CSS can change with no career spec run. | `candidates` = union of `cssSpecs`, `sourceAffected`, `impactAffected`, `changedSpecs`, `failedInScope` for css. Test `select-specs.test.mjs`: `css/career.css` schedules `career-hub.spec.js`. Also row 11 (TRACKED). | S | CONFIRMED |
| 7 | **Two `mini-dom` helper bugs that make unit tests pass for the wrong reason.** (a) `el.matches(sel)` queries the subtree, so it is true when any DESCENDANT matches (the same bug `closest` was fixed for, per the comment at `:116-118`); 79 unit files import mini-dom. (b) `removeEventListener(fn)` for a never-added fn does `l.splice(-1, 1)` and removes the LAST live listener (also the `document` copy at `:175`); `key-binds-rig.mjs:112` already guards. | `tests/helpers/mini-dom.mjs:120,124,175`. A div holding `button.x` → `div.matches('.x') === true`; add fa, fb, remove unknown, click → only fa fires. | A green that never tested what it says is the kind of evidence this repo cites. | `matches: sel.split(",").some(part => matchesSimple(el, part.trim()))`; `const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1)` in both places. Tests: a mini-dom unit file for both. Then re-run the 79 importers: any new red is a real finding. | S | CONFIRMED |
| 8 | **The fuzz harness never generates an OWN `__proto__` key, so the real attack shape (`JSON.parse('{"__proto__":{}}')`) is never tried.** Every "`__proto__` key" mutation uses literal or assignment syntax, which sets the prototype instead; a JSON round-trip then drops it. | `tests/helpers/seeded-fuzz.mjs:89-99,152,166`; corpora `fuzz-untrusted-inputs.test.mjs:343,:381`. 20 000 × `mutate({a:1,b:'s'}, makeRng('x'))` → own 0, deep 0; only the string at `:442` makes a real own key. | The pad wire and share codes are what a stranger's phone can reach; the contract "never throws, never pollutes" is untested for the shape that matters. | Build with `JSON.parse('{"__proto__":{…}}')` or `Object.defineProperty`; assert `({}).polluted === undefined` after each trial. Test: a seeded-fuzz unit asserting some mutation in N = 2000 has `Object.hasOwn(v, '__proto__')`. Lane A's #4775 (pad-wire fuzz) should land on the fixed harness. | S | CONFIRMED |
| 9 | **A red flag neither repairs damage nor changes tyres; the FIA lets teams do both during a suspension (B5.14.4 a.vii–viii).** `redFlagRestart` re-grids only; `Damage.reset` runs from `gridUp`, the pit-out edge and the dev hook, `TyreModel.fit` from `gridUp`, `serviceCar`, `real-race.js:309` and the dev hook. A car short of two compounds must make a full green stop after the restart; with DAMAGE → HANDLING a broken wing still costs grip after the re-grid. The AI cannot use the red either. | `js/game.js:1622-1709` vs `:1756,:1788`; `js/race/damage.js:117-118`; `js/race/pit-lane.js:1129`; FIA 2026 Section B Issue 07 B5.14.4 (text in §Web research). | A red costs the player a 20–30 s stop the regs give free. | Bryce's call (filed `needs-decision`): (a) match the regs — in `redFlagRestart`'s `order.forEach` call `Damage.reset(c)` and one `tyres.fit` (AI: next planned compound when one is still owed; player: `pitNext` or AUTO) without incrementing `pitStops`; `replan`'s `made` fallback (`pit-lane.js:1467`) already tolerates it; or (b) keep arcade semantics and say so in `docs/PHYSICS.md`. Test either way: damage a car, `redFlagRestart`, assert `Damage.state(c).worst`; a one-compound car gets the red fit and `SportingRegs.compoundShort(c.tyreLog) === false`. | M | CODE-TRACED |
| 10 | **An output-device change mid-race rebuilds the AudioContext from a timer, outside any gesture.** `scheduleOutputDeviceRebuild` arms a `setTimeout`; `requestOutputDeviceRebuild`'s only gate is `stickyUserActivation()` (`ua.isActive || ua.hasBeenActive`, true for the rest of the session after the first tap), so `rebuildCtx` closes the running context and `new AudioContext()` runs from the timer. The file's own comment at `:770-773` says such a context "can never be unlocked"; the next `touchend` reaches `resumeIfNeeded` (`:761`). | `js/audio/engine.js:631,656-658,666,691,841,475,522,761-763,790-798`. | AirPods connecting or disconnecting during a race on the iPhone: silence until the next tap (short on touch controls, long with a gamepad). Bryce's export has SOUND off, so this is for the day he turns it on. | Gate on `navigator.userActivation.isActive` (transient) and otherwise only set `deviceRebuildPending`, which `resumeIfNeeded` (`:782-783`) already honours inside the next gesture. Test: `audio-recovery.test.mjs` rig with `userActivation {hasBeenActive:true,isActive:false}` and a stub that stays `suspended` without a gesture; fire `devicechange`, wait out the debounce, assert no new context before a `touchend`. Device evidence: swap AirPods mid-race and log `GameAudio.context().state` before and after the next tap. | S | NEEDS-BROWSER |
| 11 | **`TRACKED` misses four files the selection machinery imports, so an edit there is `matched` with 0 candidates and no infra warning.** | `tools/ci/select-specs.mjs:994` vs its imports at `:32-36`; `node-plan.mjs:37`, `pick-tests.mjs:44`. `select-specs --files tools/ci/change-kind.mjs,tools/ci/spec-timings.mjs,tools/lib/changed-files.mjs,tools/lib/impact-map.mjs --json` → `reason: matched`, tracked `[]`, selected `[]`. | A change-kind or impact-map edit is exactly the change that can mis-route every later PR. | Add the four to TRACKED (allow `tools/lib/`). Test `select-specs.test.mjs`: `reason === 'infra'` for each. | S | CONFIRMED |
| 12 | **`RadioVoice.unlock()` resumes a context that SOUND OFF suspended, and nothing re-suspends it.** It checks only `ctx.state === "suspended"`; `engine.js:493` then clears `mutedSuspended` and `syncMuteSuspend` runs only from `setEnabled`/`createCtx`. Reach is narrow: every caller is one-shot or turns sound on first, so it needs a live mute-suspended context at a one-shot gesture (radio-voice binding lazily after an in-session SOUND OFF). | `js/audio/radio-voice.js:845-848,398-402`; `js/audio/engine.js:259,493,940-951,960`. | A muted context rendering for the whole session is battery on the phone. | Skip the resume when `GameAudio.enabled && !GameAudio.enabled()`, or route through `GameAudio.init()` so the `:779` gate applies. Test: rig with `setEnabled(false)`, wait the 150 ms mute-suspend, fire the prime, assert `ctx.state === "suspended"`. | S | CONFIRMED |
| 13 | **Every named garage setup would vanish as "incompatible" the day a `SetupTune` field or step changes.** `cleanTune` returns null unless every `FIELDS` entry is present and already equal to its clamped, stepped value; `normalize` drops the row; `editable()` then fails and `write` returns `incompatible`. Latent: nothing breaks at HEAD. | `js/garage/setup-presets.js:10-13,44-47,56-59`; `js/garage/setup-tune.js:20,45-46`. | Twelve saved setups disappear after an update although the data is on disk. | Fill a missing field from `SetupTune.defaults(team)` and snap off-step values instead of rejecting, or a v2 migration when FIELDS changes. Test: store `brakeBias 56.25` (off-step) and assert `list()` still returns the row. | S | CONFIRMED (latent) |
| 14 | **A car that retires inside the pit window is parked to whichever side its `x` is on; on a street circuit the wall clamp can leave it on the road in the pit-lane strip as an immovable body.** `retireCar` never reads pit state; `clearArm` clears the car's own stop and `boxBusy` skips retired cars, but whether an AI pitting behind it gets round (`Collide.parkedAhead`) or waits for its stuck/rescue path was not checked. | `js/game.js:6598-6606,6617,6628-6637`; `js/race/pit-lane.js:693`. | A pit lane blocked by a wreck for the rest of the race. | Park a car retired inside the window on the side away from the lane, or outside `laneCentre`'s strip. VM: Monaco, arm an AI stop, retire the car ahead at a box, step 20 s, assert the AI reaches `pitState "out"`. | S | PLAUSIBLE |

Checked and found sound this round (do not re-hunt): quitting mid-pit-stop (`makeCars` at `game.js:2537`, `pits.reset`
`:1776`, `pits.releaseTrack` `:4448`, the pit garage closed `:4367/:4400`, `raceCtl.reset` `:4385/:2496`); a DNF in the pit
lane (`pits.clearArm` `:6617`, `boxBusy` and `scQueueFrac` look past retired cars); a red flag in the countdown
(`race-control.js:389` returns outside `race`; real-race reds only in `race`); a red after any finish (declined, `:1623`,
`resultT` held only while nobody finished `:4687`); a safety car on the last lap (`scQueueFrac` re-picks the leader
`:704-707`, `flagOut`/`settleLine` finish every car at its next crossing, `finishDelay` has no caution term);
`replayOwned` cannot leak (reset on quit, start and `disarm`); replay pause/seek (`real-replay.js:719,411-419`); the tyre
state machine (`fit()` is the only wear reset, `game.js:1775` clears `tyreLog`/`tyreStints`); ghosts on invalid laps and
share codes; the two-compound rule counts every logged fit (B6.3.6 sets no minimum); pit `think`/`replan` last-lap guard
(`pit-lane.js:1571`), `rivalsOf` skips finished/retired; incident-sim counters reset on start/red/quit; jump-start windows
agree (`reactWindowOpen <= REACT_S`, `tickReaction > REACT_S`, `jumpStartFastLaunch >= REACT_S`); the audio
race→menu→race cycle in a VM (1 context, document 1 and window 3 listeners across three cycles, engine voices not
doubled, mute and volume re-applied after `rebuildCtx`, voice-pack clips keyed by `ctxGen`); `career-backup.js` import
(revision pinned at `:926-930` and re-checked `:963-970`, duplicate rows refused, the identity embedded per slot);
`tests/helpers`: `network-adversary` abort after `end()`, `flaky-policy` fails closed, `storage-faults` per-item quota.

Leads, not findings: `select-specs.mjs:1119` `circuitsOf` follows only `../helpers/` imports, not `./sibling` (today
harmless: `circuit-crossovers.js` → `tracks-walls-roster.js` feeds a roster walker); `tyre-model.js:601`
`weatherGrip(tread, NaN)` passes NaN through (no caller hands it NaN today); `real-replay.js:127-133` `trackTrace` after
a long data gap can favour a candidate near +L/2; a WATCH seek into raceT 0–0.2 s reopens the jump-start window
(`real-replay.js:417`); `lazy-bundles.js:640-648` `disarmAudioGesture` never resets `audioGestureArmed` (cosmetic);
with Bryce's steering export applied, the `pit-lane.spec.js` approach recipe (steer gain 0.35 to
`laneX`) stopped 1.35 m off the lane centre at Monza and the stop never latched (the HUD would say SQUARE IT UP), so the
spec's recipe is not robust to his steering settings; `__apex.pit()` in the menu still reports the last race's car
(`state: "lane"`) until `makeCars` runs.

## Coverage map

**Routing.** Every file in this lane's areas routes to a topical group (`pick-tests --json` on `pit-lane`,
`race-control`, `collide`, `tyre-model`, `ai-drive`, `incident-sim`, `engine`, `radio-voice`, `career`,
`career-backup`, `setup-presets`, `share-card`, `real-replay`, `damage`, `node-plan`, `mini-dom`, `seeded-fuzz`: all
`matched`). **groups.json membership (the lane A question): yes.** 1114 unit files on disk; 753 in `toolingFast`,
455 in a `test:*` group, 0 in neither; 27 are in `test:sweeps`/`test:sweeps-parts` only (the circuit sweeps, by design
not on the gate; `gen-ladder-figures` reports gate 1088 of 1114); 110 files sit in two groups (guards ⊂ docs-guards,
desktop/mobile pairs). `groups.json` lists four glob entries for specs (`parts-*.spec.js`, `*-foundation.spec.js`,
`collision*.spec.js`, `physics-*.spec.js`) that a literal-path audit flags as missing: the readers expand them.

**Exports with no test reference** (grep of `tests/` for each name in the module's export bag): `pit-lane` 23/0,
`race-control` 14/0, `collide` 10/0, `incident-sim` 11/0, `reliability` 5/0, `real-replay` 11/0, `career-backup`
14/0, `career-planning` 3/0; `tyre-model` 70 exports, 11 constants unreferenced (`AXLE_LONG brakeBeta brakeFront
T_OPT_MID T_OPT_SPAN TEMP_FLOOR HEAT_K SINK_TRACK AQUA_WET AQUA_RAMP AQUA_LOSS`); `ai-drive` 135/7 (`pairEdgeN
PASS_EDGE_FULL CONCEDE_EDGE_FULL PULL_EDGE_FULL queueFloor unstuckLatFloor passSideBonus`); `engine.js` 62/6
(`radioPresets engineActionGeneration camKind camMix carSfxLast pitGunFired`); `career.js` 49/4 (`budgetMax slotIdx
slotsUsed slotsTotal`). So the gaps in these files are inside functions tests do reach (lane A's function-level
coverage is the finer instrument once #4774 lands), not whole exports.

**Physics contract.** `collide.js:615` passes `k = 0` whenever `a.human || b.human`; `tyre-model.js` reads no
curvature; `ai-drive.js` `sideYieldsA`/`cornerK` get curvature from AI–AI callers only. `physics-contract-auditor` on rows 4–5 and on `paceF`:
curvature-channels pass 3/3, vstd-invariant pass 13/13; `collide.js:615` is AI-only (`k` is the literal 0 for a human
pair, so `sideYieldsA` decides on `dProg` and `|x|`, never curvature) and the proposed fix (yielder by mobility, `netPlay.owns`
gate) is curvature-neutral; `collide.js:612` `contactT` is a surface flag from body overlap; `paceF` is written on the human
but read only by `paceVmax` (`game.js:400`) and its 14 AI-only callers, so it cannot reach the player's forces.

## Live probe log (Chromium, 844×390 touch, DPR 3, iPhone UA, Bryce's export applied: 152 keys; TLX `three` on the soft raster)

Bryce's export itself says: `audio.sound = false`, `music = false`, `sfx = true`; CAUTIONS off (`caution().enabled
false`), so in his own play no flag ever flies; tyre wear `real`; BUTTON SIZE 245. Clean: quit via the pause menu
mid-stop (armed, `inLane`, Suzuka) → MENU → `race("monza")`: `pit().armed false, state none, stops 0`, tyres fresh
(`stints 1, lapsOn 0, wear 0`), caution 0, `terminal() {done:false}`; `__apex.redFlag()` at raceT 3.2 → `count`, 22
cars re-gridded on boxes −14…−182 m all lap 0 (the same slots as the opening grid), `restart-green` resumes at raceT
3.2, no console error; career round trip: `careerReset()` → `career({teamId:"haas", seat:1, seed:4242})` →
`careerSim(2)` → reload → round 2, year 2026, money 2150, slot `driver0`, no warning; the pause menu QUIT with
CONFIRM QUIT on needs two touches (`TAP AGAIN`, `aria-label "Confirm: quit to menu"`) and a bare `click()` does not
arm it (pointer events do); hidden → visible pauses with `why=hidden-tab` and stays paused until RESUME (by design);
10 `visibilitychange` events across two races with no window error; `GameAudio.init()` from script creates a
`suspended` context that no synthetic `touchend` resumes (headless Chrome's gesture policy, not evidence either way).
Not reproduced live: the pit box itself (see Leads), a last-lap safety car (no hook forces an SC level; the hazard
loop needs debris) and a Data Hub replay pause (needs the OpenF1 fixture seeded into the API cache). Browser parked
on `about:blank` after the probes.

## Web research (deploy-research + `pdftotext` of the FIA 2026 Section B regulations, Issue 07, 2026-06-25)

**FIA 2026 Section B** (api.fia.com, `fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf`):
B5.13.8 — SC still deployed at the beginning of the last lap, or deployed during it: it enters the pit lane at the end
of the lap and the cars take the end-of-session signal without overtaking before the Line (the game's `flagOut` +
`scQueueFrac` on the finished leader is the right shape; there is no "race extended" rule). B5.14.2 — RACE SUSPENDED:
overtaking forbidden, pit exit closed, cars line up in the fast lane; the clock does not stop, the suspension is added
to the maximum time; **if the race cannot be resumed the result is taken at the end of the penultimate lap before the
lap during which the signal was given** (the game's declined red classifies on current progress: a sporting-rule
drift to weigh with row 9). B5.14.4 — during a suspension cars may be worked on: wheels and tyres changed (vii),
genuine accident damage repaired (viii); row 9. B5.15.4/B5.15.5 — standing start is the default resumption, rolling
otherwise (the game: standing only). B5.9.5 — each extra formation lap shortens the race by one lap (the game has no
formation lap; `race-control.js:389` makes a red in `count` impossible, so nothing to match). B5.16.2 — an early
end-of-session signal classifies at the leader's last crossing. 2026 change (f1i 556945): a lap crossed after a red
flag is not counted, which is what `redFlagRestart`'s leader rewind does.

**iOS Safari Web Audio.** WebKit bug 291892 (NEW, reported 2025-04, last touched 2025-11): Home Screen web-app audio
silent after returning from background; `resume()` can leave `state === "running"` while silent; an iOS 26 reporter
says `resume()` never returns from a click; "appears fixed" on 26.2 beta 3 is unconfirmed. Related 276687, 295518.
Babylon.js forum (iOS 26.3.1): state becomes `interrupted` on return to the home screen and `suspend()`/`resume()`
throw there. `navigator.audioSession.type = "playback"` keeps Web Audio running in the background per a WebKit commit;
Safari 26 status unconfirmed (MDN lists it experimental). No primary Apple statement on the interrupted-state recovery
recipe was found; the TLX-style "loss within 3 s of return" heuristic is the best the code can do without a device
reading. **Testing techniques.** `fast-check` 4.10.2 is already a devDependency (`package.json:97`) but no unit file
uses `fc.commands`/`modelRun`: the pit state machine (`none → approach → lane → box → out`), the tyre stint log with
the two-compound rule, and `Career.save`/`rollover` under a revision-changing store are natural model-based targets
(rows 1 and 3 are exactly the class a model run finds). StrykerJS 10.1.1 (2026-10-23) runs mutants through a command
runner (`node --test` via TAP), a fresh process per mutant; scope it with `mutate` globs to `tools/ci/node-plan.mjs`,
`select-specs.mjs` and `tests/helpers/mini-dom.mjs` first, where rows 2, 6, 7 and 11 show the tests do not kill the
obvious mutants.

## Still not covered (next hunt)

Every hunter hit its turn cap. Unread: `pit-lane.js` 260–499, 580–684 and 714–1180 (`laneX`, `committing`, `update`
869–1020, `pickFor`, `serviceCar`, `refreshAiNext`); `collide.js` 300–434 (`orientedResponse`); `ai-drive.js` 1–505,
684–1190, 1420–1667 (`otWant`, `attackOK`, `defendPull`, `isBoxed`, `digOut*`); `AiStrategy` (the AI's pit plan
itself); `real-replay.js` 490–679; `js/car/input-ghost.js`, `parts.js` (is every tyre `life` numeric?),
`cockpit-rig.js`, `helmets.js`; `career.js` 430–560, 780–1250, 1990–2055 and `rolloverDrivers/Teams/Hire`;
`career-backup.js` 300–540 (the sanitisers); `setup-sheet.js` (1734 lines), `setup-experiments.js`,
`setup-trials.js` (do they write `setup.<team>` without the revision check `SetupPresets.apply` uses?),
`experience.js`; `share-card.js` and `share-card-layout.js`; audio: `announcer*.js`, `spotify.js`, `music-lib.js`,
`ers-layer.js`, `rivals.js`, `driving-cues.js`, `car-sfx.js`, `mix-duck.js`, `signal.js`, `radio-fx.js` beyond grep,
`panel.js`, and `engine.js` `radioMediaClip@1586`/`radioVoice@1487`/`playIndex@803` (still untested), bfcache
(`engine.js` has no `pagehide` handler), whether `RivalAudio.create`/`CarSfx.create` detach when re-created after
`ensureAudio` (`game.js:4140`); CI: `tests/helpers/vm-page.js`, `race-cycle-memory.mjs`, `perf-session.mjs`,
`key-binds-rig.mjs` (`dispatchEvent` always returns true and ignores `preventDefault`), the `fit()`/`shards()` packing
arithmetic, `--budget-min` with no value (NaN); `SeasonCal.save` + `retryFailed` (row 1's shape); the restore-points
`onRestored` re-arm. Live: the pit box under Bryce's steering settings, a forced last-lap SC, a replay pause.

## Issues filed

All `ready` plus an `area:*` except row 9 (`needs-decision`); PR #4821 carries this note.

| Row | Issue |
|---|---|
| 1 | #4823 career: RETRY SAVE after a full-storage failure leaves every later career save silently refused as "conflict" |
| 2 | #4832 ci: node-plan skips `test:vm-page-b` when a diff edits an ADAPTED spec in partition A plus a change that routes partition B |
| 3 | #4825 career: `rollover()` mutates the whole career and ignores a refused save |
| 4 | #4833 physics: a side rub with a net-owned VS FRIEND rival writes speed and contactT onto the remote car |
| 5 | #4826 ai: the side-rub yielder can be a parked retired car |
| 6, 11 | #4827 ci: select-specs drops the SOURCE_AFFECTED pins on a css-only diff, and TRACKED misses four files it imports |
| 7 | #4828 tests: mini-dom `matches()` is true for any descendant, and `removeEventListener` of an unknown fn removes the last live listener |
| 8 | #4829 tests: the seeded fuzz harness never generates an own `__proto__` key |
| 9 | #4834 race: a red flag neither repairs damage nor changes tyres (B5.14.4) — `needs-decision`, pick (a) |
| 10 | #4830 audio: an output-device change mid-race rebuilds the AudioContext from a timer, outside any gesture |
| 12 | #4831 audio: `RadioVoice.unlock()` resumes a context that SOUND OFF suspended |

Not filed: row 13 (`setup-presets` cleanTune, latent: nothing breaks at HEAD) and row 14 (`retireCar` in the pit strip,
PLAUSIBLE: the VM on Monaco comes first). The `SeasonCal.save` + `retryFailed` twin of row 1 is named in #4823.
