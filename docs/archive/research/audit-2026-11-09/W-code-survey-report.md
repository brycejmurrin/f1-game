# code-survey workflow report

Verbatim report as received on 2026-11-10 UTC (audit of commit e8082307). Rows that describe unpatched security or gate-bypass detail are withheld from this public repo at the owner's request.

## Verdict

The tree is in reasonable health, but real defects outnumber everything else: 30 of the 45 confirmed findings are bugs, 9 are dead code and 6 are performance. None of the performance findings costs real frame time. Two patterns run through most of the bugs, and the file list would not show either of them.

- **Sibling fixes never spread.** A fix was applied to one site and its twins were left alone:
  - the rear-end contact path got `firstPairFx`, but the oriented contact path did not (collide.js);
  - H27 gave the wall mass `massBox`, but the facade details did not get it (city.js);
  - `tree()` and `lobedTree()` stopped reserving their spot before landing, but `pine()` and `grandstandEx` still do (nature.js);
  - `materialFor` memoises its key, but `decalMaterialFor` does not;
  - the GLX SGSR and SSAO defects were copied into TLX and the WGX fallback.
- **The unit VMs are kinder than the browser.** Several tests model the browser in a way that hides the bug:
  - they inject a global `G` that the page never has (visor-optics);
  - they stub `getElementById` with an arrow function, so the unbound call that throws in a real browser passes (loop-health);
  - the loopback transport delivers events queued before a close, but rtc drops them;
  - they boot audio with no `ErsLayer`;
  - they pin "retired → PIT" in the overlay publisher test;
  - they feed tv-graphics a hand-built row.

Both boot-time "cover" gates in `js/perf/` (race-entry-profile and loop-health) are partly dead in the browser for this reason.

The rot is concentrated in four places:
- the post shaders in `js/render/*/` (7 bugs);
- `js/track/scenery/` (4 bugs);
- save ingress in `js/career/` (3 bugs);
- `js/data/` (3 findings).

Dead weight is small. It is mostly leftovers from module extraction and stale comments, and the only meaningful one is an ERS audio chain that renders at gain 0 for the whole race.

## Fix now

All of these are bugs. They are ordered by severity, then by how cheap the fix is. Files under js/ need no cache bump, because the deploy rewrites `?v=dev`. Before pushing any batch, run `node tools/ci/pick-tests.mjs` and then `node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet`.

**Medium, js/**
- js/perf/loop-health.js:137 — `slowPathCover` calls `document.getElementById` unbound. That throws "Illegal invocation", the catch swallows it, and the #carsetup and #race-settings stall covers never match, so a slow device can reload mid-garage → use `g.call(document, …)` or call `document.getElementById` directly, as governor.js:1281 does. Make the stub in loop-health.test.mjs throw when its `this` is wrong. Verify: `node --test tests/unit/loop-health.test.mjs`.
- js/render/glx/shaders/glsl-post.js:1446 — SGSR_FS takes `vUV` at mediump, so on phone GPUs the UV is quantised to fp16 before `imgCoord` is computed → declare `in highp vec2 vUV;`. Spatial upscale ships OFF, so this is cheap insurance. Check whether TLX's SGSR copy has the same qualifier (find3:gap3 found no mediump on TLX).
- js/fx/visor-optics.js:310 — `readScene()` reads a global `G` that only exists inside game.js's async IIFE, so the helmet visor glint never paints on the Pages build → have game.js bind a scene getter (`VisorOptics.bindScene(...)`), and load the test without an injected `G`. Verify: `node --test tests/unit/visor-optics.test.mjs`.
- js/lighting/atmosphere.js:575 — in FOG weather, the FOG DENSITY slider works until the next `applyRaceSettings`, which divides the live multiplier back out and resets it. A saved value never survives a reload → option (b) is the cheapest honest fix: add `fogDensityMul` to `APPLY_RACE_IDS` in profiles.js. Option (a) gives better semantics: divide out only the shipped base multiplier. Pick one in the PR. Verify with the weather-blend.test.mjs row described in the finding.
- js/physics/collide.js:358 — on an oriented contact (yaw past 20°), collide FX fires only on the last relaxation pass, so a 24 m/s crash gives severity 0.173. Under about 10 cm of penetration it does not fire at all → gate `collideFx` on `firstPairFx(a,b)` while `j.closing > 0`, as the rear-end path does. Add the collision-contact-vm.test.mjs row (≥ 0.5 severity, fired once per step).
- js/track/scenery/city.js:53 — instanced facade rails, mullions, panes and neon go through `unitBox`, which never calls `rec.mat`, so in a browser they draw with material 0 → key the model by material (`matBox(m)`, with key `UNIT_BOX + ":" + mat`) and add a material assertion to graph-parity. Verify: `node tools/track/verify-track.cjs <id>` for each city circuit that pick-tests names, plus `tools/track/graph-parity.cjs`.
- js/net/transport.js:249 — on a local quit, `shutdown("local")` empties `eventOut` and calls `pc.close()` straight away, so the BYE that `NetPlay.stop` just sent is lost. The peer then sees a 2 s ghost rival → flush the queue, close the channels, and defer `pc.close()` until `bufferedAmount` reaches 0 or a cap of about 500 ms. The smaller alternative is a short close timer in `NetPlay.stop`, as lobby `removeGuest` uses. Add the net-transport.test.mjs backpressure-then-close test.

**Low, js/** (cheapest first)
- js/game.js:4703 — `update()` falls through after `endRace()`, so a brake-cue blip, pitGun or rival SFX can play over the results sheet → add `return;` after `endRace()`. game.js changes get the characterization gate on the PR.
- js/game.js:1952 — `dropTrackWorld()` runs after the `warmSettled` await without a re-check of `live()`, so a stale build can free the world a newer selection wants → add `if (!live()) return false;` before `dropTrackWorld()`.
- js/career/season-cal.js:242 — `Number()` on a stored object with non-callable `valueOf`/`toString` throws inside `SeasonCal.load()` at boot, so one corrupt season key stops the game booting → coerce only numbers and strings in `scoreMap`, or export SaveMigrate's `scalarNumber`. Add the resume test from the finding.
- js/career/career-backup.js:312 — the recovery import rejects `v: "2"`, which the normal envelope path accepts → route the check through `SaveMigrate.careerVersion`. Add the recoveryEnvelope test.
- js/career/save-migrate.js:362 — `facility` is not clamped at migrate time, so the offer preview can print "level -3" → clamp it to 0–8 through `LIMITS`. Add the save-migrate.test.mjs rows.
- js/ui/onboard.js:174 — REPEAT CONTROL REMINDERS also re-arms the harvest mark and wipes `onboardRaces` → add a `resetControls()` that clears only bits brake, ot and aero (`shown &= ~7`) and leaves `races` alone.
- js/perf/race-entry-profile.js:263 — `stallHandoffCover` reads bare `G.state` and `loadingScreen`, so the countdown and software-GL cover branches are dead in the browser → inject a probe with `RaceEntryProfile.bindGame({...})`, then drop `G` and `loadingScreen` from the global-registry.test.mjs whitelist. Verify: `node --test tests/unit/global-registry.test.mjs`.
- js/race/tv-graphics.js:12 — nothing ever sets `c.fastest`, so the broadcast FASTEST LAP banner never appears → pass in the holder that broadcast.js:120 already computes from `script.fastest`. Add a test that drives a real Broadcast state, next to overlay-feed.test.mjs.
- js/track/scenery/identity.js:151 — `ledFacadeBands` passes the band midpoint to a frustum that is anchored at its base. The stack sits half a band high, and the top overshoots Miami's core by about 1.4 m → anchor each band at its base and make neighbouring band radii meet. Verify: `node tools/track/verify-track.cjs bahrain` and `miami`, including the ground and float audits.
- js/track/scenery/nature.js:202 — `pine()` reserves its spot, facets and note before the instance lands, so a dropped pine blocks its neighbours → check without reserving, then reserve only when it lands and unnote on failure, as `tree()` does. The baked-pine branch at :216–222 needs the same order. Verify with verify-track on fuji.
- js/track/scenery/nature.js:949 — `grandstandEx` records its barrier and solid before either suppression exit, which can leave an invisible wall (Bahrain T1) → move both after the `bankPlaced === 0` check. Verify with verify-track on bahrain, comparing the noteSuppressed "grandstand" counts.
- js/data/live.js:280 — the "updated" stamp comes from cached weather or drivers keys, and can never see positions or intervals → stamp `Date.now()` when a position or interval request settles ok, and drop the localStorage scan. Commit this together with live.js:206 (see Frame budget). Verify with the data-hub unit tests.
- js/data/export.js:293 — any unrelated `F1API.cancelAll()` aborts the roughly 10-minute EXPORT gather with "Cancelled — data hub closed." → retry once while `hubOpen()` is true, or keep the partial result and fix the message. A per-caller cancel scope is the cleaner later fix.

**Low, tests/**
- tests/specs/menu-keyboard.spec.js:217 — every UI scale can `continue` and the test still passes, and the wait before it cannot fail → count the scales actually measured, assert the count is above 0, and use a wait that can fail. CI runs this; never run browser specs locally.

## Delete

Each batch keeps `npm run test:guards` green, and the commit hook runs it.

1. **game.js extraction leftovers** (js/game.js:1840). Remove the unused bindings from the four destructurings:
   - CarMesh: 10 names;
   - PhysicsConsts: 10 names at :326–333;
   - `cockpitBodyMesh` at :3510;
   - `enterPhotoMode` at :4143;
   - `applySteerTuning` at :4152.

   Keep the `CarMesh.init(gfx)` and `SteerTuning.create(G)` calls. Run `node --test tests/unit/physics-rows-vm.test.mjs`. `tests/data/impact-map.json` is generated, so rebuild it with `npm run gen` and do not hand-edit it. The game.js line count drops, so run `node tools/check/ratchets.mjs --update`.
2. **Legacy ERS whine chain** (js/audio/engine.js:1285). Delete the `ersOsc`/`ersHp`/`ersGain` build, start, teardown and dead-list entries, and the unreachable else branch at 2002–2013. Make `ersLevel()` return `ErsLayer.deployLevel()`, falling back to 0. Update any audio-tune.test.mjs case that boots without `ErsLayer`. Verify: `node --test tests/unit/audio-tune.test.mjs`. If engine.js has a size ratchet, update it.
3. **WGX** (js/render/webgpu/wgx-shadow.js:96 and js/render/webgpu/wgx.js:6009):
   - delete `blockerSampler`: its declaration at :54, the `createSampler` at :96–101 and the getter at :518;
   - replace the stale "updateInstances NOT IMPLEMENTED" comment with a pointer to the implementation at about :5218.

   Verify: `node tools/gfx/wgx-validate.mjs --static` and webgpu-lifecycle.test.mjs.
4. **Shared render** (js/render/shared/gltf.js:58 and js/render/shared/post-common.js:179):
   - delete the unexported, uncalled `mPoint` at :57–66;
   - move the misplaced comment at :179–181 to above `roadReflection` (:204) and add the 180 ms / 400 ms ramps.

   These are IIFE-internal, so `scan-globals.mjs --check` is not affected.
5. **Quali net flag** (js/race/quali-net.js:37). Delete `iDone`, its reset and its write. Then either keep `markDone()` as a documented no-op, or remove it together with its two game.js calls (2937, 9018) and its two calls in net-lobby-friend-quali.test.mjs. Making `canLeave()` read `iDone` instead is a behaviour change and needs a decision. Verify: `node --test tests/unit/net-lobby-friend-quali.test.mjs`.
6. **Physics comments** (js/physics/debris-world.js:487). Reword "cosmetic only; the sim never reads them back into grip" to name the B3 `marbleGrip` exception (bounded at 7%, `apex26.marbleGrip`). Point player-forces.js:292 at that seam. This touches comments only, but it matters for the curvature-channel audit in docs/PHYSICS.md.
7. **Interlagos rejected assemblies** (js/circuits/scenery/interlagos.js:861). Re-seat or delete the four calls that are rejected on every build: `crowdBank` at :861 and :862, `favelaPatch` at :544, and `arquibancada` 'interlagos-arq-senna' at :433. Verify: `node tools/track/verify-track.cjs interlagos` must no longer list "footprint rejected" for them. A follow-up ratchet that fails on any non-pit "footprint rejected" modelGroup would stop this coming back.

## Frame budget

None of the six performance findings would move a frame-time profile. The largest per-frame cost still in the tree is known item 1 (hud.js laneRect / clearReadouts, 1.4 ms per tick), which is out of scope here. The six new rows are small allocations, each costing microseconds or less.

The only performance finding a player would feel is not frame time at all. The first LIVE refresh downloads and parses the whole position and interval history of a completed session (several MB, estimated) on every hub visit. On Bryce's phone that means mobile data and a main-thread long task.

Follow the dedicated triage ranking as given:
- **Free win:** js/game.js:5233 (the TT recorder's `Object.assign` literal). Fold it into the first game.js Fix-now commit; the characterization gate should pass bit-identical.
- **Worth doing:** js/data/live.js:206 (the uncached, unfiltered first LIVE fetch). Commit it with live.js:280, add a unit test for cursor seeding, and check the real body size once in the network panel when verifying.
- **Only if profiling confirms:** js/render/three/tsl-fx.js:329 (the `decalMaterialFor` key string) and js/car/car-draw.js:1669 / :1694 (the player mesh key strings and closures). Both need TLX boot evidence, plus the garage and livery specs.
- **Not worth it:** js/physics/ai-strategy.js:335 (the `strategyTemper` object, a pooling alias risk) and js/car/car-draw.js:802 (`dropSupersededFittedAtlases`). That sweep is the guard against the #3609 iPhone OOM, so keep it as is.

## Defer

- **SGSR gather emulation samples texel corners through linear filtering:**
  - js/render/glx/shaders/glsl-post.js:1466 (low)
  - js/render/three/tsl-post.js:1155 (medium, TLX is the default backend)
  - js/render/webgpu/wgsl-post.js:1049 (low, the WGX 4-tap fallback only)

  Reason: spatial upscale ships OFF (opt-in `apex26.spatialUpscale`). The fix changes the upscaled image on three backends at once, so it needs a real-GPU visual A/B, which no agent here can run. Write the checkerboard gather unit test first, then fix all three in one commit. This becomes blocking before anyone promotes spatial upscale. Fix the "parity" comments at wgsl-post.js:1007 and :1110 then too.
- **SSAO's 8 taps cover a 210° arc:**
  - js/render/glx/shaders/glsl-post.js:223
  - js/render/webgpu/wgsl-post.js:181
  - js/render/three/tsl-post.js:228 (also folded into the godray alpha)

  Reason: an even 45° ring changes the AO look on every backend and probably needs the 2.4 gain retuned. The noise cost is unmeasured. Do it as one commit across all three backends with a lighting A/B (skill `lighting-tuner`).
- **js/physics/wheel-state.js:123** — both axles use the front-shaped curve, and the peak normalisation is wrong. Reason: WheelState is opt-in and OFF by default, and the fix changes how that model handles. It needs the tune-physics A/B and the new "|fx| peaks at kn = 1" unit row. Do it before WheelState is ever promoted.
- **js/overlay/publisher.js:28** — a retired car shows "PIT" in the stream overlay. Reason: overlay-publisher.test.mjs pins this, so the intent is unclear. It needs the `needs-decision` label and one comment for Bryce before anyone changes the labels. It affects the stream overlay only.
- **js/ui/css-zoom.js:37** — on engines without `currentCSSZoom`, the local-rect fallback is a no-op. Reason: PLAUSIBLE only. Nobody checked which engines return local rects but lack `currentCSSZoom`, and the branch may be dead. Establish engine support first, then either derive the zoom from computed style or delete the branch.

## Coverage and blind spots

**Surveyed, in round 1:**
- game.js, read in full across two finders (1–4809 and 4790–9588);
- js/physics/ named slice: collide, incident-sim, brake-cue, body-attitude, aero-zones;
- js/render/webgpu: wgx.js, shadow, chunked, post and debug-labels in full;
- js/render/three: tsl-fx, tlx-chunked, tsl-chunks, tsl-viewport in full, the rest in part;
- js/render/shared in full, and the five GLX shader files in full, with a mechanical uniform diff;
- js/net in full, except about half of lobby.js and qr.js;
- js/data: 18 files in full;
- js/ui: ui-a 7 files and ui-b 14 files;
- js/race core, js/core log, store, mat4 and hash32;
- js/career save paths;
- the lighting module and presets, checked by key-set VM;
- the slice's car-draw.js and ghost.js;
- tests/helpers: 6 helpers;
- circuit scenery: mechanical scans of all 52 files plus a headless `verify-track --all` for 20 of them.

**What later rounds added:**
- Round 2 (gaps 1, 2, 3, 6 and 7) covered race modules, lifecycle pairs, the second half of ai-drive.js, the remaining physics files, the editor, share and overlay code, and the camera and input files. It added tv-graphics, wheel-state, the debris-world comment, the ai-strategy perf row and the publisher bug.
- Round 3 (find3:gap3) checked the GLX post defects for parity on WGX and TLX. It added the four SGSR and SSAO twins, and it cleared the fog, lamp-loop and sun-shadow lit-shader code of drift.
- No coverage notes from find2:gap4 or gap5 reached this synthesis. Whether they ran is unknown.

**Finders admitted partial reads:**
- wgsl-chunks.js: about 2,600 lines unread;
- tsl-lit.js: almost all unread;
- wgsl-post.js and tsl-post.js: only the SSAO and SGSR blocks read;
- tlx.js: lines 1–1959, 3085–3825, 4577–5559 and 6718–7152 unread;
- tlx-post.js, tlx-shadow.js and tsl-sky.js: their halves unread;
- wgx-roadlut.js: unread.

The WGSL-versus-GLSL comparison is still the most likely source of future findings: wet SSR gating, tonemap and exposure order, and the car-shadow block were not compared.

More partial reads:
- engine.js, about 40% unread, plus 13 other audio files (spotify, announcer, radio-voice, soundtrack and others);
- circuit defs: only 4 of 40 read in full;
- circuit scenery bodies: covered by scans only, with the qatar and shanghai `sl()` code and redbull `rbSpan` named as risk sites;
- in js/track/scenery: models.js 420–803, most of build-props.js, and all of stands.js and pits.js;
- in js/car: car3d.js, most of liverytex.js, and parts.js;
- career-ui.js, about 1,700 lines;
- most of js/garage;
- settings-export.js 450–1060;
- input.js 1–1100;
- flyby-sight.js;
- debris-world.js 1212–1304.

**Unsurveyed:**
- tools/ (no finder had it);
- the GLX JS files (glx.js, post.js, shadow.js, chunked.js), since the shaders were read but not their hosts;
- js/agent/apex.js;
- js/xr and js/workers beyond the lifecycle pairs;
- the rest of js/core (lazy-bundles, script-loader);
- the HUD satellite files in js/ui (hud-layout, hud-arrange, dock-layout, title-menu and others);
- index.html, css/, sw.js and manifest.json, which got a 17-id spot check only;
- about 170 of the Playwright specs and about 75 of the test helpers;
- no browser or GPU measurement was taken anywhere, so every cost above is an estimate.

**Updates to the known list for the next run:**
- The car finder says known 14 (uncapped ghost store) is fixed at HEAD: there is a 512 KiB `MAX_STORE_BYTES` with LRU eviction.
- The net finder says the netplay half of known 12 is fixed: pooled relay entries.
- The input-perf-cam finder says known 4 (C6) is mostly fixed: `refreshStoredContext` is now gated on rev. The "short-lived arrays" half is still live, because `get()` and `mergedProf()` build a 4-element `layers` array on each call.
- Known 5, 1, 13 and the AI brake-look half of 12 are confirmed still live.

**Not acted on:** your request to message every session to use Opus subagents instead of Fable ones. This step is a read-only synthesis, so the main session has to send that message.
