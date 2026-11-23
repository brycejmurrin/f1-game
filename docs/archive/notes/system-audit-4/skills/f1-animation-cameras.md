VERDICT: FIX — sound and small, but cut-jump.md's owner list misses 9 of 28 js/camera files (incl. drive-chase.js, which the description sells), and lag has no single owner line.
METRICS: SKILL.md 23 lines / 1709 B / description 392 chars / 5 references (118 lines, 9.6 KB). All under limits.
PATHS: OK for every js/, tools/, tests/ path named. Checked: js/camera/{mode-switch,vantage,extra-rigs,director,drive-broadcast,cam-avoid,cam-comfort,offsets,tuner-panel,cam-tuner-boot,feel,flyby-*,trackside,free-cam,replay-buf}.js; js/garage/{arrival,setup-camera}.js; js/race/{real-replay,pit-lane}.js; js/ui/watch-transport.js; 12 unit tests; skill-smoke, doctor, frame-report, replay-camera-probe, wait-polling-lint; playwright-probe/references/cameras.md. Test name "replay fixture plan is offline and bounded" exists (capture-tools-regressions.test.mjs:305). `G.cameraDampingState` at game.js:3424 (previousAnchor/nextAnchor at :3426); `__apex.cameraState`/`previewCam`/`camState` in js/agent/apex-cam.js:33,52,159.
COMMANDS: OK. replay-camera-probe `--seed` and `--plan` both parse (tools/shot/capture-contract.mjs:15-16,20,28; seed is uint32, default 1). `--fixture/--backend/--viewport/--frames/--timeout-ms` are passed as extras (replay-camera-probe.mjs:194). skill-smoke `--skill NAME --check` valid (skill-smoke.mjs:18-19). Not run: nothing here is side-effect-free except --plan, and I did not run it.
WALKTHROUGH (task hint: WATCH/HIGHLIGHTS replay camera snap after seek)
- SKILL.md:13-16 -> replay.md steps 1-2 (offline) run cleanly. Step 3 puts the browser run with the parent. The ffmpeg install block is in replay-diagnosis.md:25.
- Diagnosis path is accurate: reposition() skips setFollow when picture.locked/manual (real-replay.js:421). setLocked is real-replay.js:744, which delegates to the Broadcast object `bc`; the file that actually holds the lock state is not named in replay-diagnosis.md:5 (js/camera/director.js? no - the Broadcast module). Agent has to grep `Broadcast.create` (real-replay.js:264).
- "Chase camera too laggy": SKILL.md:15-16 sends modes/lag to playwright-probe, but the description lists "chase rigs" and "camera tuners" as its own. The skill-routing fixture (queries/f1-animation-cameras.json:11) puts "add a lag slider" here and :63 "measure lag" in playwright-probe. Consistent, but the split is only implied.
- Dead end: cut-jump.md recipe never mentions the chase rig file; the agent must find drive-chase.js alone.
STRUCTURE
- js/camera has 28 files; cut-jump.md:3-16 omits cam-groups, cockpit-finishes, cockpit-opts, cockpit-preview, drive-chase, drive-onboard, fov-fit, flyby-sight, photo-cam, photo-kit, results-cam (11 files). The 22 commits in 14 days touched all of them (git log -- js/camera lists each repeatedly). [NEW]
- game.md:1-8 and replay.md:3 contain a stale-date note ("Folded 2026-10-14") - harmless history; could go.
- game.md:20-21 test string quotes a test title "…backs into the bay and parks"; fragile but present in garage-arrival test (not verified word-for-word). [NEW, low]
- Description 392 chars, third person, WHAT+WHEN present; the last clause routes away. Good.
- replay-workflow.md:12 and replay-diagnosis.md:23 repeat the ffmpeg/timeout bounds; mild duplicate of replay.md:16-22.
- Phone: replay.md uses 640x360 software smoke - not the 844x390 touch profile (AGENTS.md "Bryce plays on a phone"). Add `--viewport 844x390` as the second run. [NEW]
ENFORCEMENT
- Subagent browser ban restated only as a pointer to parent ownership (SKILL.md:19-20, replay.md:25); OK, hook-enforced (AGENTS.md rule 10).
- `snapCam()` must not follow `orbit()` (game.md:26-28): prose only, no test. Low value for a hook.

CAMERA-LAG OWNERSHIP (the four descriptions, verbatim, with one proposed owner line each)
1. playwright-probe: "...camera modes (cockpit/chase), or lag/framing. Not garage catalog, UI matrix, live canvas (mcp-probe)."
   -> add: "Owns MEASURING camera lag/framing (camState fracs, stills); changing the rig -> f1-animation-cameras."
2. f1-animation-cameras: "Use when animation or camera motion needs work: garage pit-work arrivals, Flyby, broadcast cameras, follow-target blends, chase rigs, camera tuners, cuts that jump, WATCH/HIGHLIGHTS replay camera snaps, a stale follow anchor after a seek, follow change or exit. Lag measurement, stills, camera modes → playwright-probe."
   -> keep; change tail to "Owns CHANGING camera code/lag tuning; measuring lag, stills, mode catalogue -> playwright-probe."
3. tune-physics: "...Shake/juice → game-feel; camera lag → playwright-probe; steer sliders → input-controls; AI → ai-racecraft."
   -> "camera lag: measure -> playwright-probe, fix -> f1-animation-cameras."
4. game-feel: "...Car behaviour wrong → tune-physics; camera lag → playwright-probe."
   -> same pair; game-feel keeps shake/kick only (its body :41 already says "Camera lag or framing → playwright-probe").
Budget: all four are one clause each; combined description budget (1,536) not at risk. Routing fixtures: fixture :11 (lag slider) and :63 (measure lag) already separate fix from measure, so the owner lines match the tests. A near-miss risk remains for "chase camera lags": a "lag" with no verb. [pass3 S10 STILL OPEN; playwright-probe GAP2 agrees]

js/camera PATHS for WATCH/HIGHLIGHTS: replay-diagnosis.md:6 names js/camera/director.js and replay-buf.js - both exist. Also real-replay.js, watch-transport.js exist. No named path is missing. But the replay-specific camera code lives in the Broadcast module reached via real-replay.js:264, not in the list. results-cam.js (new in the list of 28) is plausible for HIGHLIGHTS end-of-run but unreferenced. [NEW]

GAPS (ranked)
1. .claude/skills/f1-animation-cameras/references/cut-jump.md:3-16 - add the 11 missing js/camera owners (drive-chase.js first, then drive-onboard, fov-fit, flyby-sight, cam-groups, photo-cam/photo-kit, results-cam, cockpit-*), one line each; add a "when js/camera changes, re-diff this list" test or pointer to a gen list.
2. SKILL.md:3 and SKILL.md:15-16 - make the owner line explicit ("fix here, measure in playwright-probe"), then the same one-clause edit in playwright-probe, tune-physics and game-feel descriptions (4 one-line edits, one PR).
3. references/replay-diagnosis.md:5 - name where lock state lives (Broadcast module; real-replay.js:264,744) so the grep is not needed.
4. references/replay.md:16 - add an 844x390 touch second run for Bryce's setup.
5. references/replay.md:3 and game.md - drop the 2026-10-14 provenance line.
OUT OF SCOPE
- .claude/skills/playwright-probe/SKILL.md:3 - description lacks "measure" for lag; fix lives in that unit.
- .claude/skills/tune-physics/SKILL.md:3, .claude/skills/game-feel/SKILL.md:3 - redirect-only "camera lag" clauses, see owner lines above.
