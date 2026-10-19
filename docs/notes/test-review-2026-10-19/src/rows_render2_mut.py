# Rows for the render-2 mutation-testing addendum (extends the render-2 rows R2-01..R2-21 in rows.py).
# Synth checks run against HEAD @ 83328f1b.
#
# ---- render-2 mutation addendum (REPORT final, comment c6260418691)
# status: FINAL (addendum). Method: tree at HEAD copied to scratch with `git archive` (repo untouched), 255 targeted
#   mutants of the code under test, the batch's own test files re-run per mutant. KILLED = some test failed;
#   SURVIVED = every batch test stayed green with the code broken. Harness and raw TSVs: artifacts/test-review/render-2/
#   (mutate2.mjs, muts1-8.json, out1-8.tsv).
# mutated: track-lights.js (densify), lighting/profiles.js (LightStore resolver, base(), apply/set/rebuild),
#   perf/governor.js (sentinel, cleanRace, floor release), shared/shadow-pass.js (lamp-shadow pick), camera/results-cam.js,
#   lighting/lamp-bake.js, glx/glx.js (resize hysteresis), glx/chunked.js (multidraw, occlusion), perf/render-rate.js,
#   tests/helpers/perf-frametime.mjs, lighting/presets.js, renderer soft-lifecycle / perf-try / gfx-debug-overlay paths,
#   webgpu/wgx-roadlut.js, perf spans, boot timeout, lighting-tuner sweep, mem-census.
# survival: 172 killed, 75 survived, 7 find-strings did not match (5 re-run as corrected mutants, 2 not re-run).
#   "survived" = survived THIS batch, not the whole suite (the cross-suite check was stopped at the orchestrator's
#   request; valid so far: LS1 killed by weather-blend; RR9, RR10, LS2, LS7, LS9 survive the other tests too).
# equivalent / near-equivalent (no row): LC2 (<= vs < on a measure-zero boundary), LC4 (slice vs subarray), LS9 (put()
#   clamp; every caller clamps), LB12 (reach radius x2; win is 0 beyond it), MC1 (warm-up interval can only lower min).
# strong (killed): render-rate 8/10, glx-failure-paths, glx-resource-balance, glx-occlusion state restore, lamp-chunks,
#   lamp-bake 10/13, renderer-boot-timeout 6/7, memory-sync, road-lut-frame fill/eviction, hunt-tlx-create-undo (all 3
#   _createUndo pushes), lighting-reapply/-rebuild scans, light-presets* data lints, render-final-contracts 6/8,
#   s8-once-per-frame 12/12, perf-governor+perf-sentinel 13/16, mem-census-growth, lap-format-rollover 7/7.
# re-confirms / corrects (rows below carry dup_of when the mutation adds a result):
#   R2-04 confirmed (LS1, row R2-24); R2-05 narrowed, not wrong (RR11, row R2-34); R2-06 confirmed (RC1b, row R2-29);
#   R2-14 confirmed (DM1/DM5, row R2-37); R2-17 confirmed and raised to high (PF1-PF6, row R2-36);
#   R2-20 confirmed (LS10-LS12, row R2-23).
#   re-confirms R2-16 (mutation: RB3 "spec may lower boot cap" survives renderer-boot-timeout) -- folded into R2-40.
#   re-confirms R2-19 (mutation: GO3 "?gfxdebug=0 arms overlay" survives; gfx-debug-overlay.test.mjs only regex-scans
#   wanted()/install()) -- folded into R2-38. NOTE: R2-19's file "js/render/gfx-debug-overlay.js" does not exist; the
#   module is js/perf/gfx-debug-overlay.js.
#   re-confirms R2-03 (mutation: only GLX / picker-storage / TLX teardown paths of gfx-backend-canary were mutated; no
#   new result) -- no row.
# not run: muts9.json (40 "throw at entry of never-called function" mutants); governor.js excluded from that pass because
#   its tests eval the source with no filename, so V8 coverage lines do not map (vm-no-filename; cf. DBG-01/DBG-02).
#   Not mutated: lamp-fixture-anchor (~110 s/run), most of gfx-backend-canary's 252 tests, shader-validate (no lint
#   binaries), perf-try beyond three draw-order mutants. One run per file; flakiness not measured.
# observation (no row, not a defect): perf-governor.test.mjs:40-60 hard-copies GLX's 0.02 setRenderScale dead zone; TLX
#   (tlx.js:4313) and WGX carry their own copies and nothing ties the three together.

NEW = [
("R2-22","render-2","tests/unit/lamp-density.test.mjs","73-106","vacuous","high","high",
 "mutant TL1 (track-lights.js insert count floor((span-1)/gap) -> floor(span/gap)-1) survives: the 'gap dead-band' fixture uses span=2, gap=1, where both formulas give 1, so it never hits span in [gap, 2*gap)",
 "the silent density no-op the test's own comment describes (Monza density 1->2 baked 292 lamps both ways) can return green",
 "add a fixture with span in (gap, 2*gap), e.g. span=3 gap=2, and assert the insert count","S","lighting",R,
 "confirmed@83328f1b: track-lights.js:182 nFill=floor((span-1)/targetGap); lamp-density.test.mjs:83 forces span=2/target=1, where floor(1/1)=floor(2/1)-1=1",
 "player",[],None),
("R2-23","render-2","tests/unit/lighting-rebuild.test.mjs","","source-scan","high","high",
 "mutants LS10/LS11/LS12 (apply() never flags rebuild; set() runs no live effects; rebuild never nulls track._lights, profiles.js ~212/~257) survive: lighting-rebuild and lighting-reapply only scan source for rebuild:true / APPLY_RACE_IDS",
 "a lamp slider can go dead (no flag -> invalidate chain) with every lighting test green",
 "drive LightStore.set() on a rebuild knob through the light-store-copy harness and assert track._lights is invalidated and the live effect runs","M","lighting",R,None,
 "player",["source-scan"],"R2-20"),
("R2-24","render-2","tests/unit/light-presets.test.mjs","212-231","over-mock","high","high",
 "mutant LS1 (LightStore drops the shared *|tod|wx stamp; sharedCond returns null, profiles.js:157) survives all 9 batch lighting tests; only weather-blend.test.mjs outside the batch kills it",
 "confirms the re-implemented resolver in light-presets cannot catch a real resolver bug",
 "as R2-04: run the real LightStore per track/tod/wx","M","lighting",R,None,
 "player",["stub-copy"],"R2-04"),
("R2-25","render-2","tests/unit/light-store-copy.test.mjs","","gap","high","high",
 "mutants LS2/LS7 (base() ignores the shared stamp / the player '*' layer, profiles.js) survive the batch AND the rest of the unit suite: apply() and base() duplicate the same layering and nothing compares them",
 "the put()/copy baseline and the live resolver can diverge silently (tuner COPY VALUES writes the wrong baseline)",
 "assert base(id) === resolved LT[id] across shared/pin/'*' layers, or make apply() and base() share one layering function","S","lighting",R,None,
 "player",[],None),
("R2-26","render-2","tests/unit/perf-sentinel.test.mjs","","gap","high","high",
 "mutants G6 (desktop stamps the crash sentinel), G13 (cleanRace never pays a strike), G14c (floor drop does not release _perfTier) survive (governor.js ~458-517); cleanRace() is called by no test in the batch",
 "desktop players can collect safe-mode strikes; a phone stays degraded for the whole session after clean races",
 "call cleanRace() after a strike and assert strikes--, the floor and tier() drop; assert SENT_ACTIVE is never written with isMobile=false","S","render-perf",R,
 "confirmed@83328f1b: governor.js:493-517 cleanRace pays a strike and releases _perfTier; :458/:482 mobile guards; grep finds cleanRace only in comments of perf-governor.test.mjs (:835 'Mirror cleanRace()')",
 "player",[],None),
("R2-27","render-2","tests/unit/lamp-shadow-pick.test.mjs","96","over-mock","high","high",
 "mutants SP3 (pick scores the flickered level), SP4 (tail lights eligible), SP5 (small movers eligible) survive (shadow-pass.js ~535-544); SP3 is the original flicker bug, hidden because fixture flicker amplitude is < 20 % so the 1.2 hysteresis alone holds the lamp",
 "the lamp-shadow flood can again jump sides several times a second with the car parked (full prop rebuild per trade)",
 "use two near-equal floods with flicker > 20 % so only lampLum scoring holds the pick; add a tail-light and a small-mover record and assert neither is picked","S","lighting",R,
 "confirmed@83328f1b: shadow-pass.js:539 tail skip, :540 L[o+6]<12 small-mover skip, :535/:544 lampLum score; test re-declares LAMP_HANDOVER=1.2 locally (lamp-shadow-pick.test.mjs:96)",
 "player",["stub-copy"],None),
("R2-28","render-2","tests/unit/results-cam.test.mjs","","gap","high","high",
 "8 of 19 results-cam mutants survive, mostly tick()/lifecycle: RC10 orbit frozen, RC9 chequered cut skipped, RC11 30 fps cap removed, RC12 reset leaves the camera installed, RC4 retired car can be subject, RC17 out-of-window tags kept, RC18 highlights re-entrant",
 "results-screen camera freezes, skips the finish cut, redraws at full rate or sticks after reset with the file green",
 "assert orbitYaw advances, phase passes through chequered, draw count <= 30/s, reset() uninstalls, retired subject rejected, reel within window, second highlights() refused","M","camera",R,
 "partly@83328f1b: the test does drive tick()/reset() (results-cam.test.mjs:71-77,:154-159), so the paths execute; results-cam.js:14 FRAME_DT=1/30, :130 retired skip and :179 re-entry guard have no asserting check; mutants not re-run",
 "player",[],None),
("R2-29","render-2","tests/unit/results-cam.test.mjs","26","over-mock","high","high",
 "mutant RC1b (PerfGov.tier()>=2 gate removed, results-cam.js:19) survives as R2-06 predicted",
 "confirms the tier gate is unguarded","as R2-06: stub tier 2 and assert onFlag()===false","S","camera",R,None,
 "player",["stub-copy"],"R2-06"),
("R2-30","render-2","tests/unit/lamp-bake.test.mjs","","gap","med","high",
 "mutants LB6 (LAMP NEAR CLAMP ignored, lamp-bake.js ~329) and LB10 (back-facing surfaces lit, ~345) survive; the oracle never sets a clamp that matters or a back-facing normal",
 "a player knob (LAMP NEAR CLAMP) and the back-face cull of the bake can break unnoticed",
 "add a near-lamp case where the clamp changes the result and a back-facing surface asserting zero","S","lighting",R,None,
 "player",[],None),
("R2-31","render-2","tests/unit/lamp-density.test.mjs","","gap","med","high",
 "mutants TL2/TL3/TL7/TL9/TL10/TL8b (density boundary < vs <=, fill lamps one side, thinning wrap, fill copies the signal kind, densify wrap-around span) survive",
 "the pit-entrance red-pool class of defect (fill lamp copying kind 'signal') has no test",
 "assert fill lamps alternate sides, never carry kind 'signal'/aimAt, and the wrap-around gap is filled","S","lighting",R,None,
 "player",[],None),
("R2-32","render-2","tests/unit/glx-resize-hysteresis.test.mjs","","gap","med","high",
 "GX1/GX2 each survive alone (killed only together: at renderScale=1 the two snaps overlap); GX9 maxDim clamp on width only survives (glx.js 1160-1180)",
 "a resize-thrash or oversize-backbuffer regression on one axis passes",
 "test each snap at renderScale != 1 and a tall viewport over maxDim","S","render",R,None,
 "player",[],None),
("R2-33","render-2","tests/unit/glx-occlusion.test.mjs","","gap","med","high",
 "8 of 19 chunked.js mutants survive glx-multidraw/glx-occlusion: CH1 UNSIGNED_INT stride, CH4 per-group light-set re-upload, CH5 multi-draw lamp-shadow slot, OC5 stale HIDDEN out of frustum, OC8 null query, OC9 endQuery after a throwing draw, OC10 one query in flight, OC13 freeChunkedMesh VAO leak",
 "error paths and teardown of the GLX chunk renderer are unpinned (VAO leak, stuck query, popping chunks)",
 "add a 32-bit index fixture, a throwing draw, createQuery()->null and a freeChunkedMesh balance check to the GLX mock","M","render",R,None,
 "player",[],None),
("R2-34","render-2","tests/unit/render-rate.test.mjs","99-105","wrong-target","med","high",
 "mutant RR11 (carry dropped only when exiting via presenting) survives, while dropping the carry in the common ungated branch is killed: R2-05 is correct but narrower than first reported",
 "XR-exit carry loss passes; the ordinary cadence carry is guarded",
 "as R2-05: follow the presenting run with non-presenting frames and assert drawnDt pays the carry","S","render-perf",R,None,
 "player",[],"R2-05"),
("R2-35","render-2","tests/unit/render-rate.test.mjs","","gap","med","high",
 "mutants RR9 (fast-cadence counter never reset) and RR10 (tier-path dt clamp removed) survive the batch and the rest of the unit suite (render-rate.js)",
 "cadence can stick slow or pay an unclamped dt after a tier change",
 "a slow->fast->slow sequence asserting the counter resets; a tier-gated frame with a huge dt asserting the clamp","S","render-perf",R,None,
 "player",[],None),
("R2-36","render-2","tests/unit/perf-frametime.test.mjs","12-22","tautology","high","high",
 "mutants PF1/PF2/PF3/PF5/PF6 (quantile ceil, hitch filter, insufficient-frames guard, longTasks and heap regressions never fire; tests/helpers/perf-frametime.mjs) all survive",
 "the perf-regression lane's helper can lose half its checks unnoticed",
 "as R2-17: fixture series per branch","S","render-perf",R,None,
 "pipeline",["tautology"],"R2-17"),
("R2-37","render-2","tests/unit/light-presets-knob-range.test.mjs","42-46","vacuous","med","high",
 "mutants DM1 (a NaN preset value) and DM5 (crushed ambientMul on a two-part cond layer, presets.js) survive the data lints",
 "confirms a NaN or crushing cond layer can ship","as R2-14: Number.isFinite and cover two-part cond layers","S","lighting",R,None,
 "player",["condition-wrapped"],"R2-14"),
("R2-38","render-2","tests/unit/renderer-soft-lifecycle.test.mjs","","gap","med","high",
 "surviving TP1 (autoClear left false after a throwing present), TP3/TP4 (godray/bloom targets never shed), PT1 (sky drawn twice, perf-try), PK6, RF5/RF8 (retry keeps old strike count; Proxy __element, render-final-contracts), GI6 (webgpu diagnostics), GO3 (?gfxdebug=0 arms the overlay, gfx-debug-overlay)",
 "TP1 leaves a smeared canvas until reload; PT1 doubles the sky draw cost; GO3 re-confirms R2-19 (wanted() only regex-scanned)",
 "throw from present() and assert autoClear restored; count drawSky per frame in perf-try; run wanted() with ?gfxdebug=0","M","render",R,None,
 "player",[],None),
("R2-39","render-2","tests/unit/road-lut-frame.test.mjs","","wrong-target","med","high",
 "mutants RL3/RL4/RL6/RL7 (centreline interpolation t=0.5, no neighbour-cell binning, no LUT padding, spacing = max gap; wgx-roadlut.js) survive; the 3-circuit census kills fill/eviction (RL1/RL2/RL5) but not a sideways shift",
 "the 0.3 m lateral road-LUT bug the test was written for can return green",
 "assert sampled lateral offset against the centreline within a tolerance at known points","S","render-wgx",R,None,
 "player",[],None),
("R2-40","render-2","tests/unit/perf-spans.test.mjs","","gap","low","high",
 "mixed survivors: SPn6 (span reset keeps loaf), SPn8 (end() without begin()), RB3 (spec may lower the boot cap, renderer-boot-timeout; re-confirms R2-16), TS4/TS6 (sweep verdict ignores noise x3; softwareGl2 option, lighting-tuner-sweep); MC1 judged near-equivalent",
 "small diagnostic and tooling paths unpinned",
 "add reset/unbalanced-end cases to perf-spans; make renderer-boot-timeout fail on a lowered cap; assert the x3 noise rule","S","tooling",R,None,
 "hygiene",[],None),
]
