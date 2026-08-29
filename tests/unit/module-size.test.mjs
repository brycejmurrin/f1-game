/* module-size.test.mjs — a RATCHET on the files that only ever grow.
 *
 * docs/ARCHITECTURE.md records that the July reorg took js/game.js from 8,955
 * lines to ~4,700, and that it is back over 8,000: "extraction moved code out
 * once and nothing stopped it accumulating again, because no guard bounds the
 * file."
 *
 * This session watched that happen in miniature. Two extractions
 * (js/game/aerozones.js, js/game/skidmarks.js) took 91 lines out of game.js,
 * and a concurrent branch put 130 back in over the same period. Nobody did
 * anything wrong — there was simply nothing that would notice, and the net
 * direction of an unbounded file is always up.
 *
 * So: a ceiling per file, and the rule that you LOWER it when you extract.
 * Raising one is allowed — this is a ratchet, not a cap on doing work — but it
 * has to be a deliberate edit here with a reason in the commit message, which
 * is the whole point. A number nobody can raise gets deleted the first time it
 * is inconvenient; a number you must look at gets thought about.
 *
 * Same idiom as tools/clip-baseline.json and tools/coplanar-baseline.json, and
 * as the FLOOR in tools/fixture-consumer-audit.mjs.
 *
 * Run: node --test tests/unit/module-size.test.mjs   (npm run test:tooling)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lines = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").length;

// file -> ceiling. LOWER these when you extract. Raising one is a deliberate
// act: say why in the commit message.
const CEILINGS = {
  // The monolith. Every line removed here is the point of the extraction work;
  // js/game/ is where it goes. Do not raise this to land a feature — put the
  // feature in a module. (7970 -> 7975 in the 2026-08 audit fix train: net +3
  // after dead-code removals, from comments explaining real fixed bugs at
  // their sites — the quali-Escape guard, the DRIZZLE gates, the vLat basis
  // label. Bug-explaining comments are the one growth the ratchet tolerates.)
  // Lowered from 7975 after the R1 audio-panel extraction (AUDIT-SYNTHESIS)
  // took the MUSIC & SOUND panel out — the ratchet follows the file down.
  // 7795 -> 7804 for aTop(): the ground-truth acceleration next to vTop(), plus
  // the comment recording the mismatch it fixes (js/game/quali.js modelled the
  // field at pace-5 acceleration into a pace-scaled ceiling). It belongs beside
  // vTop()/vStd()/aStd() and nowhere else, so this is a bug-explaining growth of
  // exactly the kind the note above tolerates — not a feature.
  // 7804 -> 7810 for the G.netNow accessor + backing store + the comment saying
  // why: netplay/apex wrote G.netNow at four sites and this file declared it
  // NOWHERE, so it existed only as an expando (the countT bug's shape, and what
  // would make an Object.seal(G) throw). Declaring a member the façade already
  // pretends to own is the ratchet-tolerated growth, not a feature.
  // 7810 -> 7826 for the garage turntable's fit-to-visible-region distance, plus
  // the comment recording what was wrong: SP_DIST_DEF framed the car against the
  // WHOLE frustum while the docked panel covers a third of it, so every broadside
  // swing ran the wings off both edges. The lens shift that creates the visible
  // region already lives here, three lines up, and the fit is the same
  // measurement — splitting them would put two halves of one framing rule in two
  // files. Bug-explaining growth at the site of the bug, not a feature.
  // 7896 -> 7912 for the ACTIVE AERO flap distance gate, plus the comment
  // recording why its radius differs from the brake rings' 40 m twelve lines
  // above. The flaps were the one per-car detail draw with no distance test —
  // ~84 draws a frame for the field, each a VAO bind the cache always misses,
  // because every flap element is its own mesh. The gate belongs beside the
  // draw it guards and beside the ring gate it mirrors; moving it out would
  // separate two halves of one "how far do small car details stay worth
  // drawing" rule. Bug-explaining growth at the site of the bug.
  // game.js: concurrent camera/preview work + wheel-to-wheel racecraft.
  // 7896 -> 7928 for the bug-hunt fix train: the sector-PB incident-invalid gate,
  // the offT grace-sentinel two-sided decay, the ghost-recorder reset on a backward
  // line crossing, the G.seasonRound accessor (quali round resolved as reliability
  // does), the reliability `networked` build-relief opt, and the aero-flap livery
  // finish thread — each landed with the comment recording the bug it fixes at its
  // site, the one growth this ratchet tolerates.
  // Merged with the ACTIVE AERO flap distance gate from the other branch;
  // the file carries both sets of lines, so neither side's number fits it.
  // Set from the merged file: 7944.
  // 7944 -> 7949 for the lighting tuner's COPY ALL: two more thin passes through
  // to js/game/light-store.js (copyToTracks/restore) beside the four that were
  // already here, plus the comment saying what the two modes mean. The operation
  // itself is 40 lines and landed in the store, which is the shape this ratchet
  // is asking for — what stayed is the façade line the other five files reach.
  // 7949 -> 7955 for the applyScale() clamp fix: the CSS custom property that
  // actually sets the on-screen UI/HUD size was reading the RAW stored percentage
  // instead of the already-clamped one computed two lines above it for the
  // slider's own label, so an out-of-range apex26.uiScale/hudScale applied
  // unclamped on every boot while the slider quietly showed something else.
  // 7955 -> 7970 for UI/HUD SIZE step 0.5: scaleSnap / scaleLabel / SCALE_STEP
  // beside applyScale so the slider lattice and the stored value stay one
  // function (and the clamp comment above still applies — snap is the clamp).
  // 7980 -> 7997: RENDER DISTANCE knob threading farPlane/cullDist, the
  // moonGate escape hatch for MOON SHADOWS above 0.5 (prop + car shadow night
  // gates), and the SHADOW DISTANCE-scaled car shadow box — all tightly
  // coupled to the existing camera/shadow-pass code already in this file.
  // 7997 -> 8002: threading a carBoxScale ratio (cBox/42) through to
  // gfx.carShadowBegin so lit.js can scale the dynamic car-shadow depth bias
  // with it — the SHADOW DISTANCE-scaled car shadow box above widens the car
  // shadow map's real-world texel size at a fixed 1024² resolution, and the
  // bias wasn't scaling with it, which produced visible self-shadow acne on
  // the car above the default SHADOW DISTANCE (confirmed via MCP screenshot,
  // not caught by the numeric-only apex-eval.mjs check from the prior pass).
  // 8003 -> 8009: PER-CHUNK LAMPS hands the renderer frame.allLights (the full
  // baked lamp list) beside the globally-culled frame.lights, so GLXChunked can
  // bind each chunk its own nearest-32. Six lines at the existing setFrameLights
  // call site, which is where the frame's light state is already assembled.
  // 8009 -> 8015: recording frame.tailStart/tailCount around the
  // appendCarTailLights call, so PER-CHUNK LAMPS can add the per-frame car
  // tail-lights to each chunk's set. They are appended to frame.lights AFTER
  // the static cull, so a set built from track._lights alone silently dropped
  // them — a regression the knob introduced. Sits at the call site that already
  // assembles the frame's light state.
  // 8013 -> 8035: PER-CHUNK ROAD. The road is a single mesh, so it can only
  // carry the one global set of 32 lamps — the reason the far road stays dark
  // while the buildings beside it light up. Drawing it chunked routes it
  // through the same GLXChunked per-chunk path. Lazy-built at the existing road
  // draw site (nothing else knows the knob state at build time), and the
  // comment records why _keepPositions is mandatory: createChunkedMesh nulls
  // its source arrays and debrisworld.js + __apex.geo() still read roadGeo.
  // 8035 -> 8036: one comment line at the po.lampVol assignment, paying for a
  // TIER-4 CORRECTNESS FIX rather than a feature. lampVol was shed only by the
  // hard !gfx.mobileTier gate where _lampVol is derived, so the BOTTOM rung of
  // the feature ladder did not actually drop the heaviest night pass on a
  // struggling DESKTOP: haveGR is `sunGR || lampVol > 0`, so a non-zero lampVol
  // kept the whole half-res god-ray march + 4 blurs alive after po.godray had
  // already gone to 0.
  // 8036 -> 8018: LOWERED, not raised. The mobile-only GRAPHICS toggle (22
  // lines of button wiring + the apex26.gfxHigh boot bit) moved out to
  // js/game/gfx-quality.js, which owns #pm-gfx for every device now. This is
  // the direction the ratchet exists to push: a feature landed and game.js got
  // SMALLER, because the preset's tier floor goes into PerfGov.tier()'s max()
  // instead of rewriting the eight PerfGov.tier() gates in the render path.
  // 8018 -> 8033 to take the synchronous track build OFF the boot path. Boot's
  // last statement was `loadTrack(trackIdx)` — a Tracks.build() measured at
  // 938 ms (monaco) to 3284 ms (vegas), mean ~2.1 s over 8 circuits, inside a
  // measured DCL of 4712 ms. It now calls scheduleFlybyTrack(), the deferral
  // this file already used for every other menu track change, and render()'s
  // (previously dead) null-track branch returns instead of presenting a clear.
  // 8033 -> MERGED: PerfTry.skyLate landed on the other branch over the same
  // period. The reorder is two edited lines; the rest is the comment recording
  // the GLOW hazard, which is why it could not be a one-line move — drawGlow is
  // additive with depthMask off, so it writes no depth and leaves the
  // background at 1.0 where it painted, which a later depth-1.0 sky with blend
  // OFF would erase. The sky-late path draws the world WITHOUT glow, then the
  // sky, then the glow. Neither branch's number fits the merged file; this one
  // is set FROM it, the same way the earlier flap-gate merge above was.
  // 8050 -> 8064: pooling the DebrisWorld.tyreMarble argument. The literal was
  // built per car per physics step on BOTH the player and AI paths -- 20 cars x
  // 60 Hz, ~1200 short-lived objects/s -- and tyreMarble discards it on the
  // speed gate, the hot gate, or the 0.25 rate limit, so nearly all of them at
  // cruising speed. A measured CPU profile put the collector at 2.8% of physics
  // time; this is one of the sites paying into it. The growth is the pooled
  // declaration plus the comment recording why sharing one object is safe (the
  // callee is read-only and spawnMarble retains nothing) -- the ratchet-tolerated
  // kind, since the alternative is a reader re-deriving that safety argument.
  // 8064 -> 8079: an EXACT cheap reject in pairContact before the wrap. The
  // wrap-normalise ran for every ordered pair on every relaxation pass (20 cars
  // = 190 pairs x 5 passes = ~950 calls per physics step) and a 3M-pair
  // equivalence sweep put acceptance at 0.18%, so ~99.8% of those two float
  // modulos existed only to prove "not touching". The growth is the comment
  // carrying the proof -- that |wrapped| <= LCAR iff |dProg| <= LCAR or
  // |dProg| >= L - LCAR, hence the new test discards exactly the same pairs in
  // the same order. Without that written down the next reader cannot tell an
  // exact reject from a conservative pre-filter, and this sits inside collision
  // resolution where a wrong guess changes racing.
  // Merged the range-pass branch (SCALE consts + comments) with deploy's
  // 8050-era work — the file carries both sides' lines, so neither side's
  // number fits it. Set from the merged file: 8054.
  // MERGED AGAIN: both lineages raised this over the same window (8079 here
  // for the pairContact proof, 8054 on the deploy side for the range-pass
  // work). The file carries both sides' lines, so neither number fits it —
  // set FROM the merged file, the resolution this file already records twice.
  // -> 8122: two render-path gates from the 2026-08-14 hunt, both of the
  // "work multiplied by zero" kind this ratchet's header calls the tolerated
  // growth. (a) The STATIC SUN SHADOW producer now matches its consumer:
  // lit.js opens sampleShadow with `if (uShadowStr <= 0.0) return 1.0;`, so on
  // an overcast/wet/foggy night nothing reads the map, yet the frame still paid
  // a 2048² clear + the full terrain and road ribbons cast unchunked (44,826
  // verts on vegas) + a 512² PCSS blocker pass, 300+ times a lap. (b) Car
  // shadow CASTERS are now distance-culled against the volume's corner radius.
  // Both comments carry the reasoning that makes the gate reviewable — the
  // shadow one records WHY the snap cache must be invalidated when the gate
  // closes, and the caster one records why the radius is hypot(cBox, 170) and
  // not cBox, which is the difference between a correct cull and deleting long
  // low-sun shadows.
  // -> 8145: two more of the same "work multiplied by zero" kind. (a) po.contact
  // now sheds at tier 4 alongside po.ssao — glx/post.js arms the SSAO pass on
  // `aoStr > 0 || contactStr > 0`, so a tier-4 daytime frame kept running the
  // pass and both its blurs after po.ssao had already gone to zero. This is
  // literally the bug the line above it records being fixed for lampVol against
  // haveGR's identical `||`; the SSAO half was missed. (b) The LAMP shadow pass
  // now distance-culls its car casters, the twin of (and cross-referenced from)
  // the sun pass's _csR — the sun comment already says the field pays the caster
  // cost twice at night, and this was the untouched half. The comment there
  // carries the load-bearing part: the bound is the lamp RADIUS on a
  // shadow-rays-travel-outward argument, NOT the frustum, whose 149-degree far
  // corners reach ~5x its far plane and would make a frustum-radius cull wrong.
  // -> 8150: PER-CHUNK LAMPS stops being a toggle. frame.perChunkLights now
  // carries the knob's 0..1 VALUE instead of `? 1 : 0`, because the feature
  // genuinely delivers more light per fragment (each chunk binds 32 lamps that
  // actually reach it, instead of the whole scene sharing one global 32) and so
  // needs a dimmer to be usable at the shipped LAMP LEVEL — reported from the
  // live game as "all the lamps are way too powerful". Five lines are the
  // comment recording why the value must not be coerced here, which is exactly
  // the mistake the old line made.
  // -> 8178: PER-CHUNK LAMPS joins the PerfGov shed ladder at tier 1. It was
  // the ONE discretionary renderer feature with no tier gate at all, and its
  // cost is per-fragment and unbounded rather than a fixed pass, so it needs
  // the earliest rung rather than the latest. The comment carries the measured
  // evidence — cockpit + night + perChunk held 380% CPU for 22 minutes on 40
  // frames where every other camera mode did 20 frames in seconds — and the
  // reason a GPU watchdog reset presents to a player as a crash rather than as
  // slowness. That is the bug-explaining growth this ratchet tolerates: the
  // gate is one line, the rest is why it is at tier 1 and not tier 4.
  // -> 8186: the _perChunkOff latch, read beside _envProbeOff and consumed in
  // the same expression as the tier gate. It is the LOOP-BREAKER the crash
  // sentinel cannot be — that ledger is mobile-only by design (perf.js gates
  // it on gfx.isMobile so the desktop suite never enters safe mode), so on
  // desktop a GPU context loss leaves no trace and the persisted knob comes
  // straight back into the configuration that just killed the context. The
  // comment records why the tier gate alone is insufficient: it needs PerfGov
  // to have WATCHED slow frames, and a watchdog reset can land in one.
  // 8186 -> 8199: the chase-camera fore/aft jitter fix. Exponential damping
  // toward a moving target lags v/lambda - v*dt/2, so the car-to-camera
  // distance breathed with frame time (28.7 cm at 320 km/h under a 16-38 ms
  // wobble). Damping the OFFSET in the car's frame cancels it to 0.0000 cm.
  // Bug-explaining growth at the site of the bug — the one kind this tolerates.
  // -> 8231 on the career/race branch: three DEFECT fixes, mostly the comment
  // explaining the rule each restores. (1) MY TEAM's second car now runs the
  // career build — `mate` in makeCars plus buildPace(), folding the four parts
  // axes into the one scalar tierV already carries, so no AI gains a parts
  // branch on the physics path (the guide claimed "Both cars run your build"
  // all along). (2) Track limits are three warnings, one penalty, RESET: the
  // old rule charged +5s for every cut from the fourth on and stopped
  // announcing past three, and it feeds the career `clean` objective — `cutWarn`
  // sits beside `cuts` because `cuts` is the lifetime total the objective reads.
  // (3) FULL race distance is the circuit's own gpLaps, not a flat 57 on all
  // forty, plus the clamp that keeps a chip lit when FULL moves with the track.
  // -> 8243 on the deploy merge: BOTH lineages' additions land in one file — the
  // chase-camera OFFSET damping and the three career/race fixes — so neither
  // side's number fits the union. Set from the merged file: 8244 (split-newline count, the ceiling test's own measure). Both sides are
  // bug-explaining growth, not a feature in the wrong file.
  // -> 8246 for the frame.exposure initialiser and the two comment lines saying
  // why: loadTrack()'s frame literal had no `exposure`, applyRaceSettings() is its
  // ONLY writer and runs at startRace(), so the MENU FLYBY uploaded
  // `undefined * exposureMul` = NaN and the composite's `c *= uExposure` rendered
  // the attract screen BLACK. Measured either side of the one-word fix by wrapping
  // GLX.present() and reading the framebuffer: centre-64px mean luminance
  // 1.06/255 -> 84.39. Exactly the "bug-explaining comment at its site" growth the
  // header above says this ratchet tolerates; the fix itself is a single field.
  // 8246 -> 8259 for the sun shadow anchor's bias DIRECTION: it followed the camera
  // look vector, so uShadowCtr swung around a 2*fBias circle on a pure yaw and the
  // shader's distance fade changed a stationary shadow's strength when the player
  // only turned. Measured on bahrain/day with the eye pinned and the aim swept +-40
  // degrees: a shadow 70 m ahead swung edgeFade 0.625..0.986, 58% of its strength,
  // while 40 m and 60 m were flat. One line of code (bias along the car's heading
  // instead) plus the comment recording the measurement and why the coverage
  // guarantee is untouched — the same bug-explaining growth the header tolerates.
  // 8259 -> 8242: RENDERER cycle extracted to gfx-quality.js (same home as
  // GRAPHICS). game.js keeps the boot canary; the button is DOMContentLoaded.
  // 8242 -> 8251: Safari WebGPU create-fail must not persist webgl2 (session
  // claim-fail skip, disarm leftover probe, keep the user's THREE/WEBGPU pick).
  // 8251 -> 8258: the claim-fail reload now reads the session skip BACK before
  // reloading — with sessionStorage blocked the old path removed the probe
  // (killing the canary revert) and reloaded into the identical claim-and-die
  // boot forever. Bug-explaining growth at the site of the bug.
  // 8201 -> 8210: three lighting/graphics fixes from the mechanism-sliced survey,
  // three lines of "why" each. (1) The god-ray horizon cutoff was a STEP off
  // 2.26x its own midday strength, so one 0.1-degree notch of SUN ELEVATION
  // deleted full-strength shafts in a single frame; now a fade. (2) The fog
  // scenery cull read the raw frame.fogDensity while the shader renders that
  // times FOG DENSITY, so at FOG DENSITY 0 ("off") a night-fog preset still
  // hard-culled chunked scenery at 250 m with no fog drawn at all. (3)
  // PER-CHUNK ROAD gated on the raw knob instead of the tier- and latch-resolved
  // state, building a second GPU copy of the road ribbon on every device where
  // per-chunk lamps are held off. Same category as the two entries above: growth
  // at the site of the bug, explaining the bug. No extraction is worth 9 lines.
  // -> 8257 on this merge: the deploy lineage (frame.exposure/menu-flyby) and the
  // lighting-survey lineage (god-ray fade, fog cull, per-chunk road) both grew the
  // file, so neither 8246 nor 8210 fits their union. Measured on the merged tree
  // with the ceiling test's own metric (split-newline count), per the deploy-merge
  // rule that baselines are re-measured on the union and never inherited.
  // -> 8270 on this merge: both lineages grew game.js again (their sun-shadow
  // aim fix and TLX/WGX parity work; my god-ray fade, fog cull and per-chunk
  // road gate), so neither 8259 nor 8257 fits the union. Re-measured on the
  // merged tree with the ceiling test's own metric, per the deploy-merge rule.
  // -> 8270 on this merge: both lineages grew game.js again (their sun-shadow
  // aim fix and TLX/WGX parity work; my god-ray fade, fog cull and per-chunk
  // road gate), so neither 8259 nor 8257 fits the union. Re-measured on the
  // merged tree with the ceiling test's own metric, per the deploy-merge rule.
  // -> 8293 PERF-FINDINGS Δprog 5.01% / sand audit (pre-reject, cull hoist, shared player anchor, invert/LED gates).
  // -> 8311 PERF-FINDINGS shadow ribbon chunk: road+terrain castShadowChunked vs
  // sun ortho (~89% tris culled; depth bit-identical) + freeChunkedMesh on reload.
  // -> 8333 perf-hunt: S3 propBatches draw/free/shadow + envCull road chunk.
  // -> 8321 bug-hunt: qualiRivalDriverIds() before NetPlay hand-off (+10).
  // -> 8361 smarter AI drivers: wire AiDrive (OT/ERS/brake/lane + rating axes)
  // into updateCar. Decision math lives in js/game/ai-drive.js (188 lines);
  // this raise is call-site glue + nearbyN / soft brakeLvl path.
  // -> 8377 deploy∪perf-hunt∪WGX-present: AiDrive + energy short-circuit +
  // propBatches/envCull + WGX software-present merge (split-newline count).
  // -> 8451 GLX survey bugs: lit/env terrainChunked (roadChunked mirror) +
  // _castPropBatchesShadow (light-frustum cull before castShadowInstanced).
  // -> 8475 merge(deploy): survey∪soft-present∪render-audit (split-newline).
  // -> 8467 merge-conflict cleanup (dedupe terrain chunk block).
  // -> 8470 deploy∪TLX-load: their 8467 plus park()/frozen env-probe cadence
  // (one cube face per frame when physics is frozen). Re-measured on the
  // union with the ceiling test's own split-newline metric.
  // -> 8544 collision arc-bucket broadphase (helpers + bucketed pair walks).
  // -> 8547 deploy∪TLX-load∪collision: 8544 plus the frozen env-face gate.
  // -> 8584 TLX/WGX deferred IIFEs load as a DAG (BACKEND_EDGES) plus
  // modulepreload of the three vendor when the pick is already "three".
  // -> 8593 field cars share the player world-pose + planted-wheel draw path
  // (drop the leftover xVis 16/s lag; AI no longer draws baked wheels on
  // the chassis attitude matrix). Split-newline count after the pose mirror
  // moved to the end of updateCar so it follows the s advance.
  // -> 8606 factory-signature field wheels (tyre/brake/rim from getFactorySetup)
  // on the planted spinning path — the old baked AI look, without gluing
  // tyres to chassis attitude.
  // -> 8607: startRace refuses a requested quali grid that quali.order() cannot
  // map (roster mismatch) instead of gridUp's silent P12 tier shuffle.
  // 8607 -> 8601: deploy dropped PerfTry; leftover hunt stayed same-line.
  // 8601 -> 8604: HUD refreshHud for headless teleport (deploy).
  // 8604 -> 8605: title quit closes the camera picker and cancels friend-quali
  // instead of abortQuali-unhiding the lobby.
  // 8605 -> 8599: extract street OT/defend/tow/queue-brake/sep/wall into AiDrive.
  // 8599 -> 8601: union with leftover hunt (skip finished neighbours + idle re-buckets).
  // 8601 -> 8600: factory aero/ERS on AI + houseStyle call sites (net −1).
  // Union with snapGameCam soft-present invalidate measured 8600.
  // 8600 -> 8635: lazy AGENT_FILES / wantAgentSurface() / bootAgentSurface.
  // The three files left FULL (~350 KB) so github.io players never parse them;
  // the loader table + gate have to live next to BACKEND_FILES (same DAG
  // injector). window.__apex = null is the eval-time latch the global
  // registry pins on this file; ApexApi.create stays call-time after the
  // inject. Bug-explaining growth at the boot site, not a feature.
  // 8635 -> 8512: UI SIZE / HUD SIZE + RESOLUTION moved to js/game/ui-scale.js
  // (UiScale.create(G)). 0 new physics; one deferred G.updateTrackPreview
  // beside buildSelect. Comments moved with the block.
  // 8512 -> 8533: pool the 8 AiDrive ctx literals in updateCar onto reused
  // scratches (_aiBoost / _aiOtFire / _aiBr / _aiLane / _aiWantX / _aiOtPull /
  // _aiDefend / _aiBoxed). Same pairContact/_ct contract; ~8 × 20 cars × 60 Hz
  // objects gone. simRnd() stays behind the otArmed short-circuit. The growth
  // is the pooled declarations plus the field-fills that replace the literals
  // — the ratchet-tolerated kind, since the alternative is a reader re-deriving
  // that the callee is read-only.
  // 8533 -> 8548: AI car 8 m frustum-sphere cull after the behind-camera /
  // near-eye tests. Player never culled. Same planes as propBatches.
  // 8548 -> 8550: side-frustum continue moved AFTER _shadowCount++ so an
  // off-FOV rival still casts into the ±42 m car map (look-wrong the first
  // hoist introduced). Growth is the relocated block plus the shadow-keep
  // comment — bug-explaining, the ratchet-tolerated kind.
  // Union with d6614cf (env probe 4-frame cadence, car/lamp shadow skip,
  // drawGlow PerfGov gate): 8550 + 7 = 8557 on the merged tree.
  // 8557 -> 8558: 0d973bf cadences instanced prop sun shadows (skip the
  // snap-cached sun/moon `_castPropBatchesShadow` on odd frames at
  // PerfGov.tier() >= 1). One gate line at the function it belongs to.
  // Remeasured on the e9d847b union (split-newline count).
  // 8558 -> 8574: merge of G.setTimeOfDay + G.weather on the façade (16 lines)
  // into the deploy lineage (setTimeOfDay was already added on that side as the
  // same fix; union takes the larger).
  // 8574 -> 8577: pass slip/ax/onKerb/wet to GameAudio.setEngine for
  //   traction-load character, brake intake growl, and wet-surface tyre audio.
  // 8577 -> 8580: syncRotateBlocker reads the blocker's computed display
  //   instead of duplicating css/responsive.css's portrait+coarse+743px
  //   condition — the two copies could drift (blocker painting while
  //   aria-hidden). Three lines of why at the site of the de-duplication.
  // 8580 -> 8621: the menus-UX round pays for three wiring sites that cannot
  //   leave this file — armConfirm (the shared career DELETE? idiom, exposed
  //   through G to setup-ui/season-ui, so the assembly and the helper both
  //   live where G is built), czPreview's live-3D draft override plus its
  //   clear on save/cancel (livDraftOverride is closure-local here), and the
  //   quali .q-done Escape flash (the handler is here). All three fix
  //   recorded UX defects at their existing sites. 8621 -> 8627: the vt()
  //   View-Transition wrap of the title/select/garage spine — the swap
  //   handlers live here, the helper in js/game/menus.js.
  // 8627 -> 8635: syncRotateBlocker learns the pause-card/blocker exclusion
  //   (one line + the bug comment): #pausemenu is a modal <dialog> now, so an
  //   open card out-layers the z-9000 blocker and refuses focus to its
  //   buttons — rotation-recovery's OPEN CONTROLS roundtrip caught it.
  // 8635 -> 8658 for the perf/bug round: the race-start Input.clearEdges (the
  // RESUME latch bug's menu→race seam), the pooled setEngine arg, the
  // els.lighting/camtune cache, the shadow-basis up consts, the seam-sliver
  // collision-bucket floor (with its adjacency-guarantee why), the endRace
  // raceCtl.reset (the unreachable in-update reset), and the measured noseIn
  // sign flip with its live-verification record — every line a fix plus the
  // comment recording the bug at its site, not a feature.
  // 8658 -> 8670: the audio-identity round — GameAudio.setVoice(player.team
  //   .engine) at both engine-start seams, ERS deploy/energy/ersDeploy through
  //   the pooled setEngine arg (the continuous deploy whine + low-battery sag
  //   live in audio.js), and the X-mode latch click on the local flap command.
  // + the deploy side's per-chunk frame-fields clear (allLights/perChunkLights/
  //   tailStart/tailCount reset every frame before the flood branch: `frame`
  //   outlives a night->day ToD flip, so chunked geometry kept binding
  //   per-chunk night lamps in daylight).
  // + the TLX-fix side's claim-fail ONE-reload bound (a latch already set at
  //   boot start means the previous reload's GLX.init failed too — measured
  //   236 reloads/64 s before the guard; falls through to #nogl).
  // Three lineages grew the file, so no side's number fits the union —
  // re-measured on the merged tree (split-newline count): 8675.
  // 8675 -> 8694 for the total-audit fix train (all bug-explaining comments at
  // the site of the bug, the one growth this ratchet tolerates): the pace-0
  // NaN floor on the throttle integrator, DebrisWorld.reset() in startRace so
  // a same-circuit restart stops inheriting last race's shards, the stranded
  // netStart cleared in quitToMenu (a solo race after an aborted countdown ran
  // with no lamps), Array.isArray on the host's RESULT payload, and the
  // paused-at-the-flag clear in endRace.
  // 8694 -> 8715: the garage-preview fix — SP_CAR_CTR (orbit and aim were
  // DIFFERENT points, so the turntable swung the car across the frame instead
  // of rotating it, and both sat behind the measured car centre), plus the
  // studio backdrop colour, the floor draw and its material opts. The floor
  // MESH itself went to js/game/carmesh.js, which is where the geometry
  // belongs and which this ratchet does not bound. Measured 8709.
  // 8715 -> 8721: frame.roadChunkLamps, the RESOLVED per-chunk-road state.
  // PER-CHUNK ROAD could not change any outcome before it: the road is drawn
  // chunked on most devices for the cull alone, and chunked.js bound per-chunk
  // lamps to anything chunked. The field carries the knob to the backends so
  // the lamps follow it while the culling stays put.
  "js/game.js": 8721,
  // Cohesive-today files (a dev API, an agent view, a procedural mesh), so
  // these are drift alarms rather than extraction targets. Note game.js is NOT
  // the largest file in the repo — js/game/light-presets.js is (see below).
  // 3050 -> 3055 for __apex.lightCopy, the headless door onto that same COPY ALL
  // — a dev-API hook growing the dev API is the file doing its job.
  // 3055 -> 3060 for lightState.bakedLights/lampPosts — MCP dens=1 vs dens=2 was
  // a false no-op when it only read numLights (nearest-N cull).
  // 3060 -> 3075 for lightState.meanLampRGB (lampTemp warmth probe / cdmcp-lamps-tune).
  // 3075 -> 3080 for lightState.cullDist/moonK/moonGate/lampCull — direct reads
  // of the internal gates RENDER DISTANCE / SHADOW DISTANCE / MOON SHADOWS
  // actually drive, so an MCP session can confirm a slider's effect numerically
  // instead of only eyeballing a screenshot (which cost a lot of back-and-forth
  // chasing a black-frame red herring that was actually a broken canvas-readback
  // sampler, not a render bug).
  // 3080 -> 3106 for lazyTrackEnsure: the boot deferral above means window.__apex
  // can exist with G.track === null, and ~180 hooks (plus 105 of 112 spec files)
  // assume the synchronous world boot used to guarantee. One wrapper at the API
  // boundary restores it for the dev API only — the alternative was a guard at
  // every staging hook, which is the shape that rots. Not a new hook, so nothing
  // joins docs/DEBUG-HOOKS.md. Nine of the 26 lines are the wrapper; the rest
  // record the placement constraint, which is real: quoting the api literal's
  // opening text in that comment moved hooks-documented.test.mjs's slice point
  // and invented a hook called `for`.
  // -> 3109 perf-hunt: __apex.perf() + autoTier/userTier on renderScale report.
  // -> 3112 carAt exposes craft/awareness/experience/lane for AI racecraft probes.
  // -> 3115 deploy∪perf-hunt merge (split-newline count).
  // 3115 -> 3119: carAt AI intent peek (stuckT/deploying) for probes.
  // 3120 -> 3128: openf1/jolpica missing-path guards (typed {ok:false} instead
  // of fetching a garbage URL / throwing on HTML 404) + fetchTrackOutline
  // comment moved onto the function it describes.
  // Lowered after trim-comments pass (measured 2419 / 2433).
  // 2429 -> 2444: lightState now reports the RESOLVED per-chunk lamp state and
  // names the gate holding it (backend / tier / latch / day). Three gates could
  // each silently zero the feature and nothing outside the renderer could see
  // which — "per-chunk lamps do nothing on my machine" was undiagnosable, and
  // the probe written to verify the PER-CHUNK ROAD fix could not observe it
  // either. The hook is the assertable surface the repo prefers over pixels.
  "js/game/apex.js": 2444,
  "js/game/agentview.js": 2443,
  // 2700 -> 2711: the cockpit build needed its own monocoque rear station. The
  // shared span's closed rear cap at z 0.05 sat 0.23 m from the driver's eye and
  // covered 55% of the steering wheel (depth-raster measured); ckpt now ends the
  // monocoque at z 0.45 and drops the seat-surround span. Raised deliberately.
  // 2711 -> 2723: the OPT-IN cockpit halo (SETTINGS > COCKPIT, default OFF).
  // It could not reuse the chase hoop — that geometry sits below a seated eye
  // — so the ckpt branch carries its own ring + pillar built against the eye,
  // plus the comment recording why the two cannot share. A real feature behind
  // a real switch, raised deliberately.
  // 2723 -> 2734: a cockpit-only front wing. The shared cascade is invisible
  // from a seated eye (12.9 deg down, under the hood crest at 9.8 — 0.01% of
  // frame), and the first-person body is its own mesh, so it carries its own
  // wing at a height the driver can actually see. Raised deliberately.
  // 2734 -> 2739: the cockpit wing's placement is now a recorded measurement
  // (screen rect at canvas res + what ate the other 13k px), not a guess.
  // 2739 -> 2741: lifecycle Log.info at car mesh build (ns "car").
  // 2741 -> 2757: sharper wing foil (knife-TE sample + outboard span split) and
  // beveled endplates/canards — same mesh for GLX/WGX/TLX, paid from the 2.4k
  // default-body headroom. Raised deliberately.
  // 2757 -> 2766: thinner foil sections (~25%) + foil T-wing + beveled vanes.
  // 2766 -> 2800: 2026 realism — extra sidepod stations, floor LE teeth,
  // underwing fences, reverse-P inlet, beveled halo. Still under 2400/1500.
  // 2800 -> 2851: recipe-gated duct / wakeboard / floor-slot kits.
  // 2851 -> 2887: recipe-gated 2026 halo furniture (beveled blade, winglet,
  // T-cam stalks, windscreen fairing). Defaults stay 0 / 2392 body.
  // 2887 -> 3322: recipe-gated part-realism (exhaust lip/shield, fuel hatch/vent,
  // gearbox casing, floor plank/gurney/scroll, ERS blister, engine scoopLip,
  // faired wishbones, wheel gun-nut / tyre fillet, Brembo caliper).
  // Lowered after trim-comments pass (measured 2652).
  // 2662 -> 2850: the ROUND halo — addTube (smooth swept tube, the addDome
  // pattern along a polyline) + sampleCurve (Catmull through the regulation
  // datums), both hoops (chase + first-person) rebuilt as tubes, and six new
  // recipe-gated knobs (cockpit halo profile/fences, headrest, front-wheel
  // deflector, ERS cooler intake, fuel breather, tyre sidewall rings).
  // Defaults stay 0; measured 2834 on the raise. Raised deliberately.
  // 2850 -> 2860: the pillar V-brace — the real halo strut splits into a V
  // at the top, meeting the ring either side of the apex (two beams + the
  // why). Measured 2853.
  // 2895 -> 2925: the endplate/suspension detail round — front-plate gills and
  // the plate-to-plane fillet (both gated on plate >= 2, so the DEFAULT body is
  // untouched) and the inboard damper/rocker-link hardware on the existing
  // `rocker` knob. Measured 2915.
  // 2860 -> 2895: the accuracy round — SEG 24 tyres (comment), regulation
  // mirror housing (toe cant block, winglet, outer stay), and the PLATE
  // rolled-top outwash row with its curled-lip span. Measured 2883.
  // 2925 -> 2947: the cockpit pale-surface round. A near-white livery accent
  // (ferrari c2 is [1,1,1]) turned every cockpit trim element into a flat pale
  // slab; the fix is _ckAcc at the one point livery colours are derived, plus
  // a !ckpt gate on the pale sponsor board and dark glass for the cockpit
  // mirror face. Each carries the measurement that justifies it — cockpit view
  // rays landing on a pale surface went 96 -> 0 (artifacts/pale-sweep.mjs) and
  // every EXTERNAL build hashes byte-identical (artifacts/build-parity.mjs).
  // 2947 -> 2960: FINISH_SURFACE grew from two rows to six (matte, brushed,
  // pearl, carbon) plus the note explaining that a finish costs a SURFACE ID
  // in the shaders' 20-30 classification chain rather than a material uniform.
  // 2960 -> 2966: the cockpit accent dimming reaches every livery paint that
  // lands in the driver's view (nose, pod, halo, stripe, noseStripe), not just
  // c2/accent/wing/fin. 32 of 152 shipped liveries put a pale non-body surface
  // in the cockpit before this; 0 after. The added lines are the comment
  // recording which paint is dimmed and why c1 stays exempt — bug-explaining
  // growth at the site of the bug.
  "js/car/car3d.js": 2966,
  // Raised 2600 -> 2670 for the start-line origin shift: buildCenterline's
  // arc-length lookup, the dressingExclusions shift, and the shift-only remaps
  // for the six emitters transformSceneryApi never covered (groundPatch,
  // overheadSpan, circuitKit, groundedSegments, waterField, frameAt). Mostly
  // the comments explaining why the shift is an ARC-LENGTH fraction and not
  // `startFrac - sceneryStartFrac` — the trap that cost a full debugging pass.
  // Raised again 2670 -> 2725: elevation/bridge anchors were remapped against
  // `startFrac` instead of the authoring origin, sliding the road surface
  // vertically under its own dressing (measured up to 43 m at Spa) — fixed by
  // freezing that remap at `sceneryStartFrac` and rotating the bumps and the
  // undulation ripple by the same arc-length shift in buildCenterline.
  // Raised again 2725 -> 2750: floodMast/floodMastRing registered fixtures as
  // customLamps only, so circuits that skip the generic floodlights pass
  // (Singapore, Bahrain) fell back to synthetic lights with no matching mast.
  // registerMastLamp() gives those masts their own 512-cap budget, separate
  // from the 96-cap tunnel/soffit customLamps list.
  // -> 2785 (+18, net of a deleted accumulator): barrierClear()'s grid sweep no
  // longer widens by the index's largest half-width. barGridInsert already
  // buckets every record by its INFLATED bounds, so the allowance was counted on
  // both sides of the lookup and the sweep ran 4-9 cells where 1-4 suffice — on
  // clearTreeDist's up-to-9 walk-outs per tree and hedge()'s per-step probe. All
  // 18 lines are the proof that reach = r misses nothing; it is an equivalence
  // claim, so it is the kind that has to be written down and tested as one.
  // Verified: prop-clipping + coplanar-faces + scenery-grounding all pass over
  // the 40-circuit build INCLUDING their anti-vacuity guards, which assert the
  // baseline caps are tight — i.e. the placement counts are exactly unchanged.
  // Lowered after trim-comments pass (measured 2309).
  // 2319 -> 2350: tri-state verdict cache on the six guarded emitters (the
  // graph fuse replay reuses dry-run guard verdicts; vegas build 1.66 -> 1.51 s,
  // 40/40 graph parity). Gates compressed to 2 lines each before raising.
  // 2350 -> 2349: R6 truth pass deleted the dead `remapK` (the sceneryLapMirror
  // helpers that stay shift-only do so ON PURPOSE — singapore's KOLD legend).
  // 2350 -> 2355 on the deploy side for the sign-safe seam wrap in
  // scanBarrier/indexSolid (the negative-k silent no-op, 10 circuits hit it).
  // Union re-measured: 2354.
  // 2354 -> 2358 (R9): the pit-straight crowd tint read the AUTHORED def.night
  // instead of the build's NIGHT override that every neighbouring branch uses,
  // so a day race at a night circuit (or the reverse) wore the wrong tint. The
  // four lines are the comment recording it at the site — bug-explaining growth.
  "js/track/tracks.js": 2359,
  // ── Round-6 additions: the unguarded giants, set AT measured (test metric,
  // split-newline count) so any growth is a deliberate raise here. Each line
  // says why the file is its size today; none is an extraction target yet.
  // THE largest file in the repo: ~8.6k lines of it are data (per-track
  // lighting presets exported by the bake-lighting skill), not logic.
  "js/game/light-presets.js": 8683,
  // The whole WGX backend in one IIFE by design (deferred inject, no tag).
  // 5179 -> 5365 on the deploy union: their half-res SSR + chunk-AABB
  // lamp-mask cull rounds landed on the other lineage (re-measured).
  // 5365 -> 5423 (deploy lineage): the road's shared vertex buffer. Per-piece
  // buffers made drawChunked's run merge (keyed on buffer identity) dead code
  // for the road, so it paid one setVertexBuffer + one draw per visible chunk
  // in every pass. The added lines are the single-buffer staging loop and the
  // three reasons the merge is allowed to fire (contiguous, vertex_index dead,
  // no lamp mask bound) — each one is load-bearing and documented where it sits.
  // 5365 -> 5453 (R8 lineage): overflow sentinel remembered, per-chunk hoisted
  // above the !cull fast path, SSR consume lanes gated on _ssrRan, lampVol mist
  // gate ported from GLX/TLX, full-res depth texel for the SSR normal stride,
  // both merge-run paths pooled to module scope, lamp masks generation-cached,
  // and the F7 packed-upload deferral written where dead DRAW_FLOATS used to be.
  // UNION: the file carries BOTH sets, so neither lineage's number fits it.
  // Re-measured on the merged tree (AGENTS.md: re-measure, never max).
  // 5516 -> 5523: the road half of the PER-CHUNK ROAD gate (frameRoadChunkLamps
  // + the surfaceId-16 test), mirroring the GLX side.
  "js/render/webgpu/wgx.js": 5523,
  // TLX backend shell; grows only with GLX-parity features.
  // 2095 -> 2099 on the union: deploy's hasPerChunkLights:false backend flag
  // (descriptor-copy would inherit GLX's true) + the TLX-fix side's dropTo
  // instanced-rung retarget with its fallbackMat-contract comment.
  // 2099 -> 2111: the deferred material dispose() unlocked by the vendored
  // #33952 backport (_matDispose queue + present() flush + the PATCHES.md
  // pointer note) — the eviction paths stopped leaking instead of skipping
  // dispose, each line beside the eviction it completes.
  // 2111 -> 2123 for the apex26.tlxForceBatches escape + skipBatches(): the
  // instanced-draw skips were gated on softGpu(), so the code path REAL GPUs
  // take was the one nothing in CI ever executed — the three.js WebGPU black
  // screen shipped through that hole. The switch lets a software run exercise
  // the real-GPU path against the same Dawn, with the comment recording why.
  // 2123 -> 2155 for the GPU error capture WGX has always had and this backend
  // never did: onuncapturederror + the tally + gpuErrors()/gpuFirstError()
  // exports, with the comment recording that a black WebGPU frame was chased
  // for a session against probes that could only ever report null.
  // 2155 -> 2159: the soft blit and capturePixels ask presentedTarget() so the
  // ?viz= bisect reads the RT the frame actually wrote — viz writes its image
  // to the blit dest and never touches ldrRT, so every viz mode showed a stale
  // frame on the one backend the bisect exists to debug.
  // 2159 -> 2232 (R6): the whole reason a real-GPU black frame was
  // unreproducible in CI. apex26.tlxForceHw=<sky|env|chunked|batches|shadow>
  // turns each software CONTENT skip back into the path a player's GPU takes,
  // one gate at a time; the env-probe face that throws is no longer counted
  // (six swallowed throws latched envReady over a cube nothing wrote); and
  // attachKey() puts the fragment-output count back into the node cache key
  // the compile-storm fix had stripped — without it Dawn rejected the
  // 2-target scene program in the 1-target probe pass (290 uncaptured errors,
  // measured 2026-08-28) and every probe face came back black. Each addition
  // carries the measurement that found it.
  // 2232 -> 2270 (R7): Dawn does not THROW when it rejects a pipeline, so the
  // faceOk guard above cannot see a discarded probe. The probe now baselines
  // the uncaptured-error tally at its first face and refuses to bind the cube
  // when errors landed during the capture, standing down after three passes
  // instead of lighting the world from black forever. envState() reports it,
  // because the overlay is the only way a player can tell us.
  "js/render/three/tlx.js": 2270,
  // GLX core (passes live in glx/, shaders in shaders/) — the core stays thin.
  "js/render/glx.js": 1929,
  // WGSL-as-data for the chunked path; grew with R5 per-chunk lamps.
  // 1855 -> 1902: the four new livery finishes (matte 28, brushed 29, pearl 30,
  // carbon 31)
  // added to the surface-classification chain, plus the pearlescent albedo
  // term. Mirrors the same edit in js/render/shaders/lit.js and tsl-lit.js — a
  // finish implemented on one backend only is invisible on the other two and
  // nothing in the suite would catch it.
  "js/render/webgpu/wgsl-chunks.js": 1902,
  // three.js TSL lit-material port; tracks lit.js feature-for-feature.
  // 1725 -> 1768: the same four finishes, the pearlescent term and the carbon
  // weave, in TSL.
  "js/render/three/tsl-lit.js": 1768,
  // Multiplayer lobby UI + flow; all of js/net/'s DOM lives here.
  // 1618 -> 1624 (R8): the peer-close handler closes the transport BEFORE the
  // map delete, with the leak-class comment — bug-explaining growth.
  // 1624 -> 1672 (R8): every lobby timer gained an owner (codeReopen stored +
  // cleared with its generation captured outside; the connect deadline applies
  // while the transport never materialises; grace timers tracked via
  // clashDrop/clashClear) and the seat-clash move is pinned in-memory-only —
  // bug-explaining growth, no new features.
  "js/net/lobby.js": 1672,
};

test("the big modules are not growing unnoticed", () => {
  const over = [];
  for (const [file, ceiling] of Object.entries(CEILINGS)) {
    const n = lines(file);
    if (n > ceiling) over.push(`${file}: ${n} lines, ceiling ${ceiling} (+${n - ceiling})`);
  }
  assert.deepEqual(over, [],
    "a module grew past its ceiling — extract something into js/game/, or raise the ceiling in " +
    "tests/unit/module-size.test.mjs deliberately and say why in the commit");
});

test("a ceiling is not left far above the file it guards", () => {
  // The other failure mode: extract 500 lines, never lower the ceiling, and the
  // ratchet silently stops ratcheting. A ceiling more than 400 lines above its
  // file has lost its grip and should be pulled down.
  const slack = [];
  for (const [file, ceiling] of Object.entries(CEILINGS)) {
    const n = lines(file);
    if (ceiling - n > 400) slack.push(`${file}: ${n} lines but ceiling is ${ceiling} — lower it`);
  }
  assert.deepEqual(slack, [],
    "a ceiling drifted far above its file — lower it so the ratchet keeps working");
});
