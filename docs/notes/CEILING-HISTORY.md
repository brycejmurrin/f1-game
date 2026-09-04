# Ceiling history — the module-size ratchet, 2026-08 → 2026-09-03

The line-count ratchet on the big modules lived in the `module-size` unit test
from 2026-08 until 2026-09-03, when it became `tests/data/ratchets.json` +
`tools/check/ratchets.mjs` (Phase 1-lite of `docs/research/TREE-RESTRUCTURE-2026-09.md`).
Every raise and lower was recorded as a comment beside its number; those comments
are preserved here verbatim, per file, as the record of WHY each number moved.
The live numbers are in `ratchets.json`; nothing here is asserted.

## Why a ratchet (the original header)

```
module-size.test.mjs — a RATCHET on the files that only ever grow.
docs/ARCHITECTURE.md records that the July reorg took js/game.js from 8,955
lines to ~4,700, and that it is back over 8,000: "extraction moved code out
once and nothing stopped it accumulating again, because no guard bounds the
file."
This session watched that happen in miniature. Two extractions
(js/physics/aero-zones.js, js/fx/skidmarks.js) took 91 lines out of game.js,
and a concurrent branch put 130 back in over the same period. Nobody did
anything wrong — there was simply nothing that would notice, and the net
direction of an unbounded file is always up.
So: a ceiling per file, and the rule that you LOWER it when you extract.
Raising one is allowed — this is a ratchet, not a cap on doing work — but it
has to be a deliberate edit here with a reason in the commit message, which
is the whole point. A number nobody can raise gets deleted the first time it
is inconvenient; a number you must look at gets thought about.
Same idiom as tools/track/clip-baseline.json and tools/track/coplanar-baseline.json, and
as the FLOOR in tools/ci/fixture-consumer-audit.mjs.
```

## `js/game.js` — last ceiling 9235

- The monolith. Every line removed here is the point of the extraction work;
- js/game/ is where it goes. Do not raise this to land a feature — put the
- feature in a module. (7970 -> 7975 in the 2026-08 audit fix train: net +3
- after dead-code removals, from comments explaining real fixed bugs at
- their sites — the quali-Escape guard, the DRIZZLE gates, the vLat basis
- label. Bug-explaining comments are the one growth the ratchet tolerates.)
- Lowered from 7975 after the R1 audio-panel extraction (AUDIT-SYNTHESIS)
- took the MUSIC & SOUND panel out — the ratchet follows the file down.
- 7795 -> 7804 for aTop(): the ground-truth acceleration next to vTop(), plus
- the comment recording the mismatch it fixes (js/race/quali-model.js modelled the
- field at pace-5 acceleration into a pace-scaled ceiling). It belongs beside
- vTop()/vStd()/aStd() and nowhere else, so this is a bug-explaining growth of
- exactly the kind the note above tolerates — not a feature.
- 7804 -> 7810 for the G.netNow accessor + backing store + the comment saying
- why: netplay/apex wrote G.netNow at four sites and this file declared it
- NOWHERE, so it existed only as an expando (the countT bug's shape, and what
- would make an Object.seal(G) throw). Declaring a member the façade already
- pretends to own is the ratchet-tolerated growth, not a feature.
- 7810 -> 7826 for the garage turntable's fit-to-visible-region distance, plus
- the comment recording what was wrong: SP_DIST_DEF framed the car against the
- WHOLE frustum while the docked panel covers a third of it, so every broadside
- swing ran the wings off both edges. The lens shift that creates the visible
- region already lives here, three lines up, and the fit is the same
- measurement — splitting them would put two halves of one framing rule in two
- files. Bug-explaining growth at the site of the bug, not a feature.
- 7896 -> 7912 for the ACTIVE AERO flap distance gate, plus the comment
- recording why its radius differs from the brake rings' 40 m twelve lines
- above. The flaps were the one per-car detail draw with no distance test —
- ~84 draws a frame for the field, each a VAO bind the cache always misses,
- because every flap element is its own mesh. The gate belongs beside the
- draw it guards and beside the ring gate it mirrors; moving it out would
- separate two halves of one "how far do small car details stay worth
- drawing" rule. Bug-explaining growth at the site of the bug.
- game.js: concurrent camera/preview work + wheel-to-wheel racecraft.
- 7896 -> 7928 for the bug-hunt fix train: the sector-PB incident-invalid gate,
- the offT grace-sentinel two-sided decay, the ghost-recorder reset on a backward
- line crossing, the G.seasonRound accessor (quali round resolved as reliability
- does), the reliability `networked` build-relief opt, and the aero-flap livery
- finish thread — each landed with the comment recording the bug it fixes at its
- site, the one growth this ratchet tolerates.
- Merged with the ACTIVE AERO flap distance gate from the other branch;
- the file carries both sets of lines, so neither side's number fits it.
- Set from the merged file: 7944.
- 7944 -> 7949 for the lighting tuner's COPY ALL: two more thin passes through
- to js/lighting/profiles.js (copyToTracks/restore) beside the four that were
- already here, plus the comment saying what the two modes mean. The operation
- itself is 40 lines and landed in the store, which is the shape this ratchet
- is asking for — what stayed is the façade line the other five files reach.
- 7949 -> 7955 for the applyScale() clamp fix: the CSS custom property that
- actually sets the on-screen UI/HUD size was reading the RAW stored percentage
- instead of the already-clamped one computed two lines above it for the
- slider's own label, so an out-of-range apex26.uiScale/hudScale applied
- unclamped on every boot while the slider quietly showed something else.
- 7955 -> 7970 for UI/HUD SIZE step 0.5: scaleSnap / scaleLabel / SCALE_STEP
- beside applyScale so the slider lattice and the stored value stay one
- function (and the clamp comment above still applies — snap is the clamp).
- 7980 -> 7997: RENDER DISTANCE knob threading farPlane/cullDist, the
- moonGate escape hatch for MOON SHADOWS above 0.5 (prop + car shadow night
- gates), and the SHADOW DISTANCE-scaled car shadow box — all tightly
- coupled to the existing camera/shadow-pass code already in this file.
- 7997 -> 8002: threading a carBoxScale ratio (cBox/42) through to
- gfx.carShadowBegin so lit.js can scale the dynamic car-shadow depth bias
- with it — the SHADOW DISTANCE-scaled car shadow box above widens the car
- shadow map's real-world texel size at a fixed 1024² resolution, and the
- bias wasn't scaling with it, which produced visible self-shadow acne on
- the car above the default SHADOW DISTANCE (confirmed via MCP screenshot,
- not caught by the numeric-only apex-eval.mjs check from the prior pass).
- 8003 -> 8009: PER-CHUNK LAMPS hands the renderer frame.allLights (the full
- baked lamp list) beside the globally-culled frame.lights, so GLXChunked can
- bind each chunk its own nearest-32. Six lines at the existing setFrameLights
- call site, which is where the frame's light state is already assembled.
- 8009 -> 8015: recording frame.tailStart/tailCount around the
- appendCarTailLights call, so PER-CHUNK LAMPS can add the per-frame car
- tail-lights to each chunk's set. They are appended to frame.lights AFTER
- the static cull, so a set built from track._lights alone silently dropped
- them — a regression the knob introduced. Sits at the call site that already
- assembles the frame's light state.
- 8013 -> 8035: PER-CHUNK ROAD. The road is a single mesh, so it can only
- carry the one global set of 32 lamps — the reason the far road stays dark
- while the buildings beside it light up. Drawing it chunked routes it
- through the same GLXChunked per-chunk path. Lazy-built at the existing road
- draw site (nothing else knows the knob state at build time), and the
- comment records why _keepPositions is mandatory: createChunkedMesh nulls
- its source arrays and debrisworld.js + __apex.geo() still read roadGeo.
- 8035 -> 8036: one comment line at the po.lampVol assignment, paying for a
- TIER-4 CORRECTNESS FIX rather than a feature. lampVol was shed only by the
- hard !gfx.mobileTier gate where _lampVol is derived, so the BOTTOM rung of
- the feature ladder did not actually drop the heaviest night pass on a
- struggling DESKTOP: haveGR is `sunGR || lampVol > 0`, so a non-zero lampVol
- kept the whole half-res god-ray march + 4 blurs alive after po.godray had
- already gone to 0.
- 8036 -> 8018: LOWERED, not raised. The mobile-only GRAPHICS toggle (22
- lines of button wiring + the apex26.gfxHigh boot bit) moved out to
- js/perf/quality-preset.js, which owns #pm-gfx for every device now. This is
- the direction the ratchet exists to push: a feature landed and game.js got
- SMALLER, because the preset's tier floor goes into PerfGov.tier()'s max()
- instead of rewriting the eight PerfGov.tier() gates in the render path.
- 8018 -> 8033 to take the synchronous track build OFF the boot path. Boot's
- last statement was `loadTrack(trackIdx)` — a Tracks.build() measured at
- 938 ms (monaco) to 3284 ms (vegas), mean ~2.1 s over 8 circuits, inside a
- measured DCL of 4712 ms. It now calls scheduleFlybyTrack(), the deferral
- this file already used for every other menu track change, and render()'s
- (previously dead) null-track branch returns instead of presenting a clear.
- 8033 -> MERGED: PerfTry.skyLate landed on the other branch over the same
- period. The reorder is two edited lines; the rest is the comment recording
- the GLOW hazard, which is why it could not be a one-line move — drawGlow is
- additive with depthMask off, so it writes no depth and leaves the
- background at 1.0 where it painted, which a later depth-1.0 sky with blend
- OFF would erase. The sky-late path draws the world WITHOUT glow, then the
- sky, then the glow. Neither branch's number fits the merged file; this one
- is set FROM it, the same way the earlier flap-gate merge above was.
- 8050 -> 8064: pooling the DebrisWorld.tyreMarble argument. The literal was
- built per car per physics step on BOTH the player and AI paths -- 20 cars x
- 60 Hz, ~1200 short-lived objects/s -- and tyreMarble discards it on the
- speed gate, the hot gate, or the 0.25 rate limit, so nearly all of them at
- cruising speed. A measured CPU profile put the collector at 2.8% of physics
- time; this is one of the sites paying into it. The growth is the pooled
- declaration plus the comment recording why sharing one object is safe (the
- callee is read-only and spawnMarble retains nothing) -- the ratchet-tolerated
- kind, since the alternative is a reader re-deriving that safety argument.
- 8064 -> 8079: an EXACT cheap reject in pairContact before the wrap. The
- wrap-normalise ran for every ordered pair on every relaxation pass (20 cars
- = 190 pairs x 5 passes = ~950 calls per physics step) and a 3M-pair
- equivalence sweep put acceptance at 0.18%, so ~99.8% of those two float
- modulos existed only to prove "not touching". The growth is the comment
- carrying the proof -- that |wrapped| <= LCAR iff |dProg| <= LCAR or
- |dProg| >= L - LCAR, hence the new test discards exactly the same pairs in
- the same order. Without that written down the next reader cannot tell an
- exact reject from a conservative pre-filter, and this sits inside collision
- resolution where a wrong guess changes racing.
- Merged the range-pass branch (SCALE consts + comments) with deploy's
- 8050-era work — the file carries both sides' lines, so neither side's
- number fits it. Set from the merged file: 8054.
- MERGED AGAIN: both lineages raised this over the same window (8079 here
- for the pairContact proof, 8054 on the deploy side for the range-pass
- work). The file carries both sides' lines, so neither number fits it —
- set FROM the merged file, the resolution this file already records twice.
- -> 8122: two render-path gates from the 2026-08-14 hunt, both of the
- "work multiplied by zero" kind this ratchet's header calls the tolerated
- growth. (a) The STATIC SUN SHADOW producer now matches its consumer:
- lit.js opens sampleShadow with `if (uShadowStr <= 0.0) return 1.0;`, so on
- an overcast/wet/foggy night nothing reads the map, yet the frame still paid
- a 2048² clear + the full terrain and road ribbons cast unchunked (44,826
- verts on vegas) + a 512² PCSS blocker pass, 300+ times a lap. (b) Car
- shadow CASTERS are now distance-culled against the volume's corner radius.
- Both comments carry the reasoning that makes the gate reviewable — the
- shadow one records WHY the snap cache must be invalidated when the gate
- closes, and the caster one records why the radius is hypot(cBox, 170) and
- not cBox, which is the difference between a correct cull and deleting long
- low-sun shadows.
- -> 8145: two more of the same "work multiplied by zero" kind. (a) po.contact
- now sheds at tier 4 alongside po.ssao — glx/post.js arms the SSAO pass on
- `aoStr > 0 || contactStr > 0`, so a tier-4 daytime frame kept running the
- pass and both its blurs after po.ssao had already gone to zero. This is
- literally the bug the line above it records being fixed for lampVol against
- haveGR's identical `||`; the SSAO half was missed. (b) The LAMP shadow pass
- now distance-culls its car casters, the twin of (and cross-referenced from)
- the sun pass's _csR — the sun comment already says the field pays the caster
- cost twice at night, and this was the untouched half. The comment there
- carries the load-bearing part: the bound is the lamp RADIUS on a
- shadow-rays-travel-outward argument, NOT the frustum, whose 149-degree far
- corners reach ~5x its far plane and would make a frustum-radius cull wrong.
- -> 8150: PER-CHUNK LAMPS stops being a toggle. frame.perChunkLights now
- carries the knob's 0..1 VALUE instead of `? 1 : 0`, because the feature
- genuinely delivers more light per fragment (each chunk binds 32 lamps that
- actually reach it, instead of the whole scene sharing one global 32) and so
- needs a dimmer to be usable at the shipped LAMP LEVEL — reported from the
- live game as "all the lamps are way too powerful". Five lines are the
- comment recording why the value must not be coerced here, which is exactly
- the mistake the old line made.
- -> 8178: PER-CHUNK LAMPS joins the PerfGov shed ladder at tier 1. It was
- the ONE discretionary renderer feature with no tier gate at all, and its
- cost is per-fragment and unbounded rather than a fixed pass, so it needs
- the earliest rung rather than the latest. The comment carries the measured
- evidence — cockpit + night + perChunk held 380% CPU for 22 minutes on 40
- frames where every other camera mode did 20 frames in seconds — and the
- reason a GPU watchdog reset presents to a player as a crash rather than as
- slowness. That is the bug-explaining growth this ratchet tolerates: the
- gate is one line, the rest is why it is at tier 1 and not tier 4.
- -> 8186: the _perChunkOff latch, read beside _envProbeOff and consumed in
- the same expression as the tier gate. It is the LOOP-BREAKER the crash
- sentinel cannot be — that ledger is mobile-only by design (perf.js gates
- it on gfx.isMobile so the desktop suite never enters safe mode), so on
- desktop a GPU context loss leaves no trace and the persisted knob comes
- straight back into the configuration that just killed the context. The
- comment records why the tier gate alone is insufficient: it needs PerfGov
- to have WATCHED slow frames, and a watchdog reset can land in one.
- 8186 -> 8199: the chase-camera fore/aft jitter fix. Exponential damping
- toward a moving target lags v/lambda - v*dt/2, so the car-to-camera
- distance breathed with frame time (28.7 cm at 320 km/h under a 16-38 ms
- wobble). Damping the OFFSET in the car's frame cancels it to 0.0000 cm.
- Bug-explaining growth at the site of the bug — the one kind this tolerates.
- -> 8231 on the career/race branch: three DEFECT fixes, mostly the comment
- explaining the rule each restores. (1) MY TEAM's second car now runs the
- career build — `mate` in makeCars plus buildPace(), folding the four parts
- axes into the one scalar tierV already carries, so no AI gains a parts
- branch on the physics path (the guide claimed "Both cars run your build"
- all along). (2) Track limits are three warnings, one penalty, RESET: the
- old rule charged +5s for every cut from the fourth on and stopped
- announcing past three, and it feeds the career `clean` objective — `cutWarn`
- sits beside `cuts` because `cuts` is the lifetime total the objective reads.
- (3) FULL race distance is the circuit's own gpLaps, not a flat 57 on all
- forty, plus the clamp that keeps a chip lit when FULL moves with the track.
- -> 8243 on the deploy merge: BOTH lineages' additions land in one file — the
- chase-camera OFFSET damping and the three career/race fixes — so neither
- side's number fits the union. Set from the merged file: 8244 (split-newline count, the ceiling test's own measure). Both sides are
- bug-explaining growth, not a feature in the wrong file.
- -> 8246 for the frame.exposure initialiser and the two comment lines saying
- why: loadTrack()'s frame literal had no `exposure`, applyRaceSettings() is its
- ONLY writer and runs at startRace(), so the MENU FLYBY uploaded
- `undefined * exposureMul` = NaN and the composite's `c *= uExposure` rendered
- the attract screen BLACK. Measured either side of the one-word fix by wrapping
- GLX.present() and reading the framebuffer: centre-64px mean luminance
- 1.06/255 -> 84.39. Exactly the "bug-explaining comment at its site" growth the
- header above says this ratchet tolerates; the fix itself is a single field.
- 8246 -> 8259 for the sun shadow anchor's bias DIRECTION: it followed the camera
- look vector, so uShadowCtr swung around a 2*fBias circle on a pure yaw and the
- shader's distance fade changed a stationary shadow's strength when the player
- only turned. Measured on bahrain/day with the eye pinned and the aim swept +-40
- degrees: a shadow 70 m ahead swung edgeFade 0.625..0.986, 58% of its strength,
- while 40 m and 60 m were flat. One line of code (bias along the car's heading
- instead) plus the comment recording the measurement and why the coverage
- guarantee is untouched — the same bug-explaining growth the header tolerates.
- 8259 -> 8242: RENDERER cycle extracted to gfx-quality.js (same home as
- GRAPHICS). game.js keeps the boot canary; the button is DOMContentLoaded.
- 8242 -> 8251: Safari WebGPU create-fail must not persist webgl2 (session
- claim-fail skip, disarm leftover probe, keep the user's THREE/WEBGPU pick).
- 8251 -> 8258: the claim-fail reload now reads the session skip BACK before
- reloading — with sessionStorage blocked the old path removed the probe
- (killing the canary revert) and reloaded into the identical claim-and-die
- boot forever. Bug-explaining growth at the site of the bug.
- 8201 -> 8210: three lighting/graphics fixes from the mechanism-sliced survey,
- three lines of "why" each. (1) The god-ray horizon cutoff was a STEP off
- 2.26x its own midday strength, so one 0.1-degree notch of SUN ELEVATION
- deleted full-strength shafts in a single frame; now a fade. (2) The fog
- scenery cull read the raw frame.fogDensity while the shader renders that
- times FOG DENSITY, so at FOG DENSITY 0 ("off") a night-fog preset still
- hard-culled chunked scenery at 250 m with no fog drawn at all. (3)
- PER-CHUNK ROAD gated on the raw knob instead of the tier- and latch-resolved
- state, building a second GPU copy of the road ribbon on every device where
- per-chunk lamps are held off. Same category as the two entries above: growth
- at the site of the bug, explaining the bug. No extraction is worth 9 lines.
- -> 8257 on this merge: the deploy lineage (frame.exposure/menu-flyby) and the
- lighting-survey lineage (god-ray fade, fog cull, per-chunk road) both grew the
- file, so neither 8246 nor 8210 fits their union. Measured on the merged tree
- with the ceiling test's own metric (split-newline count), per the deploy-merge
- rule that baselines are re-measured on the union and never inherited.
- -> 8270 on this merge: both lineages grew game.js again (their sun-shadow
- aim fix and TLX/WGX parity work; my god-ray fade, fog cull and per-chunk
- road gate), so neither 8259 nor 8257 fits the union. Re-measured on the
- merged tree with the ceiling test's own metric, per the deploy-merge rule.
- -> 8270 on this merge: both lineages grew game.js again (their sun-shadow
- aim fix and TLX/WGX parity work; my god-ray fade, fog cull and per-chunk
- road gate), so neither 8259 nor 8257 fits the union. Re-measured on the
- merged tree with the ceiling test's own metric, per the deploy-merge rule.
- -> 8293 PERF-FINDINGS Δprog 5.01% / sand audit (pre-reject, cull hoist, shared player anchor, invert/LED gates).
- -> 8311 PERF-FINDINGS shadow ribbon chunk: road+terrain castShadowChunked vs
- sun ortho (~89% tris culled; depth bit-identical) + freeChunkedMesh on reload.
- -> 8333 perf-hunt: S3 propBatches draw/free/shadow + envCull road chunk.
- -> 8321 bug-hunt: qualiRivalDriverIds() before NetPlay hand-off (+10).
- -> 8361 smarter AI drivers: wire AiDrive (OT/ERS/brake/lane + rating axes)
- into updateCar. Decision math lives in js/physics/ai-drive.js (188 lines);
- this raise is call-site glue + nearbyN / soft brakeLvl path.
- -> 8377 deploy∪perf-hunt∪WGX-present: AiDrive + energy short-circuit +
- propBatches/envCull + WGX software-present merge (split-newline count).
- -> 8451 GLX survey bugs: lit/env terrainChunked (roadChunked mirror) +
- _castPropBatchesShadow (light-frustum cull before castShadowInstanced).
- -> 8475 merge(deploy): survey∪soft-present∪render-audit (split-newline).
- -> 8467 merge-conflict cleanup (dedupe terrain chunk block).
- -> 8470 deploy∪TLX-load: their 8467 plus park()/frozen env-probe cadence
- (one cube face per frame when physics is frozen). Re-measured on the
- union with the ceiling test's own split-newline metric.
- -> 8544 collision arc-bucket broadphase (helpers + bucketed pair walks).
- -> 8547 deploy∪TLX-load∪collision: 8544 plus the frozen env-face gate.
- -> 8584 TLX/WGX deferred IIFEs load as a DAG (BACKEND_EDGES) plus
- modulepreload of the three vendor when the pick is already "three".
- -> 8593 field cars share the player world-pose + planted-wheel draw path
- (drop the leftover xVis 16/s lag; AI no longer draws baked wheels on
- the chassis attitude matrix). Split-newline count after the pose mirror
- moved to the end of updateCar so it follows the s advance.
- -> 8606 factory-signature field wheels (tyre/brake/rim from getFactorySetup)
- on the planted spinning path — the old baked AI look, without gluing
- tyres to chassis attitude.
- -> 8607: startRace refuses a requested quali grid that quali.order() cannot
- map (roster mismatch) instead of gridUp's silent P12 tier shuffle.
- 8607 -> 8601: deploy dropped PerfTry; leftover hunt stayed same-line.
- 8601 -> 8604: HUD refreshHud for headless teleport (deploy).
- 8604 -> 8605: title quit closes the camera picker and cancels friend-quali
- instead of abortQuali-unhiding the lobby.
- 8605 -> 8599: extract street OT/defend/tow/queue-brake/sep/wall into AiDrive.
- 8599 -> 8601: union with leftover hunt (skip finished neighbours + idle re-buckets).
- 8601 -> 8600: factory aero/ERS on AI + houseStyle call sites (net −1).
- Union with snapGameCam soft-present invalidate measured 8600.
- 8600 -> 8635: lazy AGENT_FILES / wantAgentSurface() / bootAgentSurface.
- The three files left FULL (~350 KB) so github.io players never parse them;
- the loader table + gate have to live next to BACKEND_FILES (same DAG
- injector). window.__apex = null is the eval-time latch the global
- registry pins on this file; ApexApi.create stays call-time after the
- inject. Bug-explaining growth at the boot site, not a feature.
- 8635 -> 8512: UI SIZE / HUD SIZE + RESOLUTION moved to js/ui/scale.js
- (UiScale.create(G)). 0 new physics; one deferred G.updateTrackPreview
- beside buildSelect. Comments moved with the block.
- 8512 -> 8533: pool the 8 AiDrive ctx literals in updateCar onto reused
- scratches (_aiBoost / _aiOtFire / _aiBr / _aiLane / _aiWantX / _aiOtPull /
- _aiDefend / _aiBoxed). Same pairContact/_ct contract; ~8 × 20 cars × 60 Hz
- objects gone. simRnd() stays behind the otArmed short-circuit. The growth
- is the pooled declarations plus the field-fills that replace the literals
- — the ratchet-tolerated kind, since the alternative is a reader re-deriving
- that the callee is read-only.
- 8533 -> 8548: AI car 8 m frustum-sphere cull after the behind-camera /
- near-eye tests. Player never culled. Same planes as propBatches.
- 8548 -> 8550: side-frustum continue moved AFTER _shadowCount++ so an
- off-FOV rival still casts into the ±42 m car map (look-wrong the first
- hoist introduced). Growth is the relocated block plus the shadow-keep
- comment — bug-explaining, the ratchet-tolerated kind.
- Union with d6614cf (env probe 4-frame cadence, car/lamp shadow skip,
- drawGlow PerfGov gate): 8550 + 7 = 8557 on the merged tree.
- 8557 -> 8558: 0d973bf cadences instanced prop sun shadows (skip the
- snap-cached sun/moon `_castPropBatchesShadow` on odd frames at
- PerfGov.tier() >= 1). One gate line at the function it belongs to.
- Remeasured on the e9d847b union (split-newline count).
- 8558 -> 8574: merge of G.setTimeOfDay + G.weather on the façade (16 lines)
- into the deploy lineage (setTimeOfDay was already added on that side as the
- same fix; union takes the larger).
- 8574 -> 8577: pass slip/ax/onKerb/wet to GameAudio.setEngine for
- traction-load character, brake intake growl, and wet-surface tyre audio.
- 8577 -> 8580: syncRotateBlocker reads the blocker's computed display
- instead of duplicating css/responsive.css's portrait+coarse+743px
- condition — the two copies could drift (blocker painting while
- aria-hidden). Three lines of why at the site of the de-duplication.
- 8580 -> 8621: the menus-UX round pays for three wiring sites that cannot
- leave this file — armConfirm (the shared career DELETE? idiom, exposed
- through G to setup-ui/season-ui, so the assembly and the helper both
- live where G is built), czPreview's live-3D draft override plus its
- clear on save/cancel (livDraftOverride is closure-local here), and the
- quali .q-done Escape flash (the handler is here). All three fix
- recorded UX defects at their existing sites. 8621 -> 8627: the vt()
- View-Transition wrap of the title/select/garage spine — the swap
- handlers live here, the helper in js/ui/select-screen.js.
- 8627 -> 8635: syncRotateBlocker learns the pause-card/blocker exclusion
- (one line + the bug comment): #pausemenu is a modal <dialog> now, so an
- open card out-layers the z-9000 blocker and refuses focus to its
- buttons — rotation-recovery's OPEN CONTROLS roundtrip caught it.
- 8635 -> 8658 for the perf/bug round: the race-start Input.clearEdges (the
- RESUME latch bug's menu→race seam), the pooled setEngine arg, the
- els.lighting/camtune cache, the shadow-basis up consts, the seam-sliver
- collision-bucket floor (with its adjacency-guarantee why), the endRace
- raceCtl.reset (the unreachable in-update reset), and the measured noseIn
- sign flip with its live-verification record — every line a fix plus the
- comment recording the bug at its site, not a feature.
- 8658 -> 8670: the audio-identity round — GameAudio.setVoice(player.team
- .engine) at both engine-start seams, ERS deploy/energy/ersDeploy through
- the pooled setEngine arg (the continuous deploy whine + low-battery sag
- live in audio.js), and the X-mode latch click on the local flap command.
- + the deploy side's per-chunk frame-fields clear (allLights/perChunkLights/
- tailStart/tailCount reset every frame before the flood branch: `frame`
- outlives a night->day ToD flip, so chunked geometry kept binding
- per-chunk night lamps in daylight).
- + the TLX-fix side's claim-fail ONE-reload bound (a latch already set at
- boot start means the previous reload's GLX.init failed too — measured
- 236 reloads/64 s before the guard; falls through to #nogl).
- Three lineages grew the file, so no side's number fits the union —
- re-measured on the merged tree (split-newline count): 8675.
- 8675 -> 8694 for the total-audit fix train (all bug-explaining comments at
- the site of the bug, the one growth this ratchet tolerates): the pace-0
- NaN floor on the throttle integrator, DebrisWorld.reset() in startRace so
- a same-circuit restart stops inheriting last race's shards, the stranded
- netStart cleared in quitToMenu (a solo race after an aborted countdown ran
- with no lamps), Array.isArray on the host's RESULT payload, and the
- paused-at-the-flag clear in endRace.
- 8694 -> 8715: the garage-preview fix — SP_CAR_CTR (orbit and aim were
- DIFFERENT points, so the turntable swung the car across the frame instead
- of rotating it, and both sat behind the measured car centre), plus the
- studio backdrop colour, the floor draw and its material opts. The floor
- MESH itself went to js/car/car-mesh.js, which is where the geometry
- belongs and which this ratchet does not bound. Measured 8709.
- 8715 -> 8721: frame.roadChunkLamps, the RESOLVED per-chunk-road state.
- PER-CHUNK ROAD could not change any outcome before it: the road is drawn
- chunked on most devices for the cull alone, and chunked.js bound per-chunk
- lamps to anything chunked. The field carries the knob to the backends so
- the lamps follow it while the culling stays put.
- 8721 -> 8727: the LAMPS controls now reach chunked geometry — the per-chunk
- knob is resolved BEFORE setFrameLights (it feeds the scaled full-set build)
- and allLights is left null when the feature is off instead of handing out
- the raw baked list.
- 8727 -> 8728: wet tyres reach the physics. gripMult() reads the fitted
- compound as well as the weather (WET_GRIP), cars carry a `tread` class, and
- braking gets the tread ratio it never had. Net +2 code lines and +3 comment
- for a whole system, because the rationale went to docs/PHYSICS.md "Weather
- and tyres" instead of into the file.
- 8727 -> 8760: the per-wheel draw loop drew rotating-then-fixed per wheel,
- giving the VAO sequence F,FFixed,F,FFixed,R,RFixed,R,RFixed — every
- consecutive pair different, so bindVAO collapsed NOTHING. Two runs now,
- measured 92 -> 84.2 bindVertexArray/frame in a pack with drawElements
- unchanged. The same restructure FIXES A RENDERING BUG: brake rings are
- blended with no depth write and were interleaved with opaque geometry, so
- a later car's opaque draw passed LEQUAL and painted over a ring already
- drawn. Bug-explaining growth at the site of the bug — the one growth the
- note at the top of this entry tolerates.
- 8727 -> 8760 for czSyncMarkRows and its two callers: MY TEAM's mark rows
- now describe whichever mark is ACTUALLY drawn. Uploading an emblem takes
- buildAtlas down the drawLogoImage branch, whose signature is
- (ctx, img, R, tint, halo, outline) — no parameter for a monogram box — so
- the dialog was showing a MONOGRAM BOX picker that could not reach a pixel,
- and a MONOGRAM label over what is really a tint on arbitrary art. Hiding
- the row then had to surface the legacy `logo3 || logo2` rim, or the
- fallback would paint from a row nobody can see.
- Bug-explaining growth at the site of the bug, with the labelling RULE in
- js/car/liverytex.js markSlots where both editors read it — the garage
- builds its rows from that function and needed no lines at all. What is
- left here is this dialog's static markup being told the answer.
- MERGED: both sides raised this to 8760 for different work — their
- two-pass wheel draws, this side's czSyncMarkRows — and the file now
- carries BOTH sets of lines, so neither number fits it. Re-measured on
- the merged tree at 8793, as the ACTIVE AERO merge above had to be.
- (`lines()` splits on \n, so it reads one MORE than wc -l on a
- newline-terminated file — 8792 there is 8793 here.)
- MERGED AGAIN (this session): their 8760 and this side's 8728 were raised for
- different work — their two-pass wheel draws and czSyncMarkRows, this side's
- wet-tyre grip path — and the union carries both sets of lines, so neither
- number fits. Re-measured on the merged tree at 8797, the same way the
- ACTIVE AERO and czSyncMarkRows merges above had to be.
- 8793 -> 8803: this lineage's RACE IN PORTRAIT opt-in handler and its
- restore-on-boot read (10 lines). Portrait racing was blocked by one CSS
- rule, never by logic — PERF-FINDINGS 5a. Re-measured on the MERGED tree,
- not added on paper: `lines()` reads 8803 here.
- MERGED a third time: their 8797 (wet-tyre grip) and this side's 8803 (the
- RACE IN PORTRAIT opt-in) each fit their own lineage and neither fits the
- union, which carries both. Re-measured on THIS tree: 8807.
- 8727 -> 8749 for the LAZY_RACE loader: RACE_FILES + raceAssets(), which sit
- beside AGENT_FILES / loadBackendScripts because they ARE that mechanism
- (same injector, second roster) — splitting them into js/game/ would put the
- boot loader a module away from the boot code that calls it. 17 of the 22
- lines are the comment explaining why the fetch is deliberately un-awaited
- and why an absent file is a legal state; that is the growth the note above
- tolerates. The change takes 338 KB OFF the boot script wall.
- 8749 -> 8787 for the LAZY_SCENERY gate: ensureScenery()/sceneryResident()
- plus the awaits in startRace/openQuali and the flyby debounce. It has to
- live here because Tracks.build() is synchronous and every loadTrack()
- caller uses `track` on the next line, so the closure must be resident
- BEFORE the call — there is no seam further down to push this into. Most of
- the 38 lines are the comment explaining exactly that. Takes 1,083 KB off
- the boot script wall.
- MERGED a fourth time: the two entries just above are this lineage's deltas
- measured against ITS base (8727 -> 8749 -> 8787); deploy meanwhile reached
- 8807 on work of its own. Neither number fits the union, which carries both
- sets of lines. Re-measured on THIS tree with the suite's own split-newline
- metric (not grep -c, which is one short on a file with no trailing newline): 8870.
- 8870 -> 8921 for the LAZY_DATA loader (2026-09-01): DATA_FILES, the derived
- DATA_EDGES, ensureDataHub() and the DATA button's await, minus the
- DataHub.init(els.datahub) line this deletes from the boot-restore block.
- Same argument as the two lazy loaders above — it sits beside AGENT_FILES /
- RACE_FILES because it IS that mechanism with a third roster, and the button
- it gates is wired here. Takes 154,412 B off the boot script wall (3,628 ->
- 3,477 KB), which is ~3,027 B of payload per line of game.js.
- 8921 -> 9015 for the LAZY_NET split (2026-09-01). The 94 lines are mostly
- the two INERT STUBS, and they are the point rather than overhead: netPlay
- is called at 20 sites here and only three are guarded, so the alternative
- was 17 new `netPlay && …` guards spread through the frame loop and the
- result path — more lines, in worse places, where one miss is a crash
- mid-race instead of a red guard. The rest is NET_FILES / NET_EDGES (a real
- dependency graph, not derivable the way the data hub's is) and ensureNet().
- Takes 242,020 B off the boot script wall (3,477 -> 3,241 KB), ~2.6 KB per
- line. tests/unit/net-stub-surface.test.mjs pins the stubs' surface AND
- their values against js/net/netplay.js.
- 8870 -> 8878: eight lines, all comment, for a one-word fix — `if (soundOn)`
- became `if (soundOn && player)`. The words are worth more than the guard:
- startRace already tolerates a null player and says so, but this block
- dereferenced it, and startRace is now ASYNC (it awaits ensureScenery), so a
- real window exists where update() ticks before makeCars has run. A throw
- there escapes tick() before the rAF re-schedule, so the render loop dies for
- the session — measured at ZERO draws a frame, permanently. PERF-FINDINGS 2i.
- 8878 -> 8885: the OTHER half of that finding. The comment above describes a
- transient fault killing the session, and fixes the one instance; round 14
- fixes the policy. tick() now tolerates a bounded run of consecutive faults
- that any clean frame pays back, and stops at the cap exactly as before. The
- policy, the caps and the heartbeat live in the new js/perf/loop-health.js
- precisely so game.js pays seven lines and not eighty — six of the seven are
- the comment saying which half is here. PERF-FINDINGS 2k.
- MERGED, three lineages deep. Each block above is a delta measured against
- ITS own base (lazy loaders 8870 -> 8921 -> 9015; loop-health 8870 -> 8878 ->
- 8885; this side's rear-light strobe gate +1 on top of its own 8892). No such
- number fits the union, which carries every one of those line sets, so this is
- RE-MEASURED on the merged tree with the suite's own split-newline metric
- rather than added on paper.
- 9054 -> 9056: round 2 — the speed cap became a rate (2 lines), a net-owned
- finished rival takes no local coast, every comment paid down to hold it.
- 9056 -> 9087: R19, four defects found by a code read and paid for in place.
- (a) car tail-lights excluded from the lamp-shadow contest by RANGE, not by a
- radius literal a shipped slider crosses; (b) the garage framing hull cached
- across colour-only rebuilds — it was 16 ms per frame of a livery colour drag
- for the same silhouette; (c) the menu flyby's sky follows the session TIME OF
- DAY instead of the circuit's authored default. Each carries the measurement
- and the failing input in a comment, which is most of the 30.
- 
- 9056 -> 9093 (the other branch, same base): three fixes and the reasons they
- each needed written down.
- (1) the touch-steering rescue — the GAS button is hidden when auto-throttle
- is on, so gating on the driver's pedal made the only wedge rescue
- unreachable on a phone; the two narrowings that keep the pack case out are
- subtle enough to earn their lines. (2) _castPropBatchesShadow lost its
- frame-parity gate, and the note says why a cadence skip on a snap-cached
- pass corrupts maps instead of saving work. (3) _backendBound, because the
- boot canary armed from the saved pick and two boots deliberately keep a
- pick while running GLX. Net behaviour is four lines; the rest is the record.
- 
- MERGED: both rounds branched from 9056 and both landed, so the ceiling is
- the merged file, not either number above. RE-MEASURED with the suite's own
- metric, not added on paper.
- 
- 9093 -> 9102 (the other branch, same base): the props-cast parity gate MOVED
- rather than died. Removing
- it outright was wrong and the note says why: the gate does fire on frames
- the function runs (every snap-cell rebuild), so dropping it added an
- instanced prop cast to half of them. It now defers the whole rebuild
- instead, which keeps the saving and never publishes a half-built map.
- ^ THE "KEEPS THE SAVING" HALF OF THAT IS WRONG, and the correction is the
- 9193 -> 9202 row below. The snap keys are written inside the rebuild block,
- so a deferred trigger is still true on the next frame and the rebuild runs
- in full. N triggers cost N rebuilds with the gate or without it.
- 9102 -> 9144: the shadow KEEP contract (the producer now says which skips
- are cadence, so the lamp shadow stops being a one-frame-per-cell flicker
- and a parked car keeps its own), plus the boot canary holding across a RUN
- of frames instead of one present. Both are small in code and long in
- reasoning, and the reasoning is the part that stops the next round undoing
- them: present() clearing the flags is CORRECT for a stop and wrong for a
- cadence skip, and one presented frame was never proof a backend works.
- MERGED and RE-MEASURED at 9175. Three rounds branched from 9056 and all
- three landed, so the ceiling is the merged file and not any of the three
- numbers above it. This branch's share is the shadow KEEP contract (the
- producer now says which skips are cadence, so the lamp shadow stops being a
- one-frame-per-cell flicker and a parked car keeps its own) plus the boot
- canary holding across a RUN of frames rather than one present. Small in
- code, long in reasoning, and the reasoning is the part that stops the next
- round undoing it: present() clearing the flags is CORRECT for a stop and
- wrong for a cadence skip, and one presented frame was never proof.
- 9175 -> 9193: _disarmProbeOnLeave. Holding the boot probe across
- PROVE_FRAMES widened the arm from one frame to ~5 s, and with it the FALSE
- POSITIVE window: a player who quit inside those 5 s was reverted to WebGL2
- on the next boot. A hidden or closing tab is not a crash — the same rule
- PerfGov's sentinel already states three lines below the new handler.
- 9193 -> 9202 (this branch): the two reverts of my own regressions from this
- same day, and the reasons, which are the whole point of the lines. (1) The
- lamp shadow keep: its gate compares a SLOT into a per-frame re-sorted
- array, so it cannot see a lamp handover, and the lamp map rasterises cars
- the gate knows nothing about — arming turned two latent bugs into a visible
- wrong-mast shadow. (2) The props-cast parity gate is gone rather than
- moved, because deferring a level-triggered predicate by one frame saves
- nothing; the note also prices the snap-cell coarsening that would work.
- 
- -> 9209 (a third branch): the title-screen flyby was drawing the PREVIOUS
- race's grid. quitToMenu resets state but never clears cars/player, and the
- car loop's only guard is a 550 m cull against the player every parked car
- passes; skids.draw had the same shape. Both now gate on state.
- 
- -> 9202 (deploy branch): the lamp clause in _wantRoadChunk gated on tier(),
- which made it DEAD CODE ((A && t<1) || (t<3) === t<3) and silently disabled
- PER-CHUNK ROAD on GRAPHICS: LOW.
- 
- 
- -> (a fourth branch): the display-reset latch clear was keyed on
- perChunkLights alone while tuner.js offers the retry note on BOTH chunk
- sliders, so following it on PER-CHUNK ROAD cleared nothing.
- MERGED: FOUR branches off the same base all landed, so the ceiling is the
- merged tree's own count, re-measured with this suite's metric — never any
- one side's number, and never the deltas added on paper.
- 9228 -> 9269 (this branch): the lamp shadow keep, done on the key it should
- always have had. The reverted version keyed on (slot into frame.lights,
- 12 m eye cell) and BOTH terms were wrong — the slot cannot see a lamp
- handover, and the eye cell is not an input at all, because the props cast is
- culled to the LAMP's frustum. The key is now the two things the content
- depends on: the lamp's world position and a quantised key over the cars in
- the map. Most of the growth is the note explaining why the car-only defer
- here DOES save where the sun pass's identical-looking one did not (the
- skipped frame arms and does no work, instead of re-triggering next frame).
- -> 9233 (deploy branch): the display-reset retry.
- MERGED and RE-MEASURED on the union.
- 9274 -> 9307 (deploy side): the garage auto-fit cap (SP_FIT_DIST_MAX) and
- the effective framing published for __apex.garageCam(). The fit diverged
- on a narrow viewport and pinned on the MANUAL zoom ceiling, orbiting the
- camera outside the bay; the note also records the vertical term that was
- tried and measured WRONG, so the next round does not re-add it.
- 9307 -> 9235: LOWERED, re-measured on the merged tree (split-newline
- count). The five hand-mirrored lazy rosters (BACKEND_FILES /
- BACKEND_EDGES / AGENT_* / RACE_FILES / DATA_* / NET_*) are now one
- generated global, ApexRoster (js/roster.js, from tools/manifest.cjs via
- tools/gen/gen-shell.mjs). The loader logic stays; only the copies left.

## `js/agent/apex.js` — last ceiling 2600

- Cohesive-today files (a dev API, an agent view, a procedural mesh), so
- these are drift alarms rather than extraction targets. Note game.js is NOT
- the largest file in the repo — js/lighting/presets.js is (see below).
- 3050 -> 3055 for __apex.lightCopy, the headless door onto that same COPY ALL
- — a dev-API hook growing the dev API is the file doing its job.
- 3055 -> 3060 for lightState.bakedLights/lampPosts — MCP dens=1 vs dens=2 was
- a false no-op when it only read numLights (nearest-N cull).
- 3060 -> 3075 for lightState.meanLampRGB (lampTemp warmth probe / cdmcp-lamps-tune).
- 3075 -> 3080 for lightState.cullDist/moonK/moonGate/lampCull — direct reads
- of the internal gates RENDER DISTANCE / SHADOW DISTANCE / MOON SHADOWS
- actually drive, so an MCP session can confirm a slider's effect numerically
- instead of only eyeballing a screenshot (which cost a lot of back-and-forth
- chasing a black-frame red herring that was actually a broken canvas-readback
- sampler, not a render bug).
- 3080 -> 3106 for lazyTrackEnsure: the boot deferral above means window.__apex
- can exist with G.track === null, and ~180 hooks (plus 105 of 112 spec files)
- assume the synchronous world boot used to guarantee. One wrapper at the API
- boundary restores it for the dev API only — the alternative was a guard at
- every staging hook, which is the shape that rots. Not a new hook, so nothing
- joins docs/DEBUG-HOOKS.md. Nine of the 26 lines are the wrapper; the rest
- record the placement constraint, which is real: quoting the api literal's
- opening text in that comment moved hooks-documented.test.mjs's slice point
- and invented a hook called `for`.
- -> 3109 perf-hunt: __apex.perf() + autoTier/userTier on renderScale report.
- -> 3112 carAt exposes craft/awareness/experience/lane for AI racecraft probes.
- -> 3115 deploy∪perf-hunt merge (split-newline count).
- 3115 -> 3119: carAt AI intent peek (stuckT/deploying) for probes.
- 3120 -> 3128: openf1/jolpica missing-path guards (typed {ok:false} instead
- of fetching a garbage URL / throwing on HTML 404) + fetchTrackOutline
- comment moved onto the function it describes.
- Lowered after trim-comments pass (measured 2419 / 2433).
- 2429 -> 2444: lightState now reports the RESOLVED per-chunk lamp state and
- names the gate holding it (backend / tier / latch / day). Three gates could
- each silently zero the feature and nothing outside the renderer could see
- which — "per-chunk lamps do nothing on my machine" was undiagnosable, and
- the probe written to verify the PER-CHUNK ROAD fix could not observe it
- either. The hook is the assertable surface the repo prefers over pixels.
- 2444 -> 2456: lightState reports the RESOLVED per-chunk lamp state and
- which of the three gates is holding it, plus meanPerChunkRGB — the twin of
- meanLampRGB for the set chunked meshes are lit from. Both exist because
- 'the sliders do nothing' was undiagnosable from outside the renderer.
- 2456 -> 2471: netLoopback's far end was a BARE transport endpoint, which
- answers no PINGs, so the game's session never reached synced(), every
- snapshot sat in heldState and net().buffered stayed 0 — six of the fourteen
- reds in the `net` browser group. The fix is two lines (autoPong the peer,
- pump the session at t0); the rest is the comment saying why a stand-in for
- a peer has to speak the clock protocol and why the first PING cannot wait
- for the caller's first netTick. Bug-explaining growth at the site.
- 2471 -> 2475: a `seed` on netLoopback, threading NetTransport.seededRnd, so
- a spec that configures packet loss can re-run the SAME loss. Unseeded, the
- lossy-link spec fails a few runs in a hundred because the clock handshake
- loses both legs of every attempt — indistinguishable from the defect it is
- meant to catch.
- 2475 -> 2484: netTick pumps the FAKE PEER as well as the session. Only
- netPeerSend/netPeerEvent did, so a test that merely ticks — a clock
- warm-up, an idle stretch — delivered nothing to the far end and its
- responder never saw a PING. transport.js is explicit that both endpoints
- must pump every frame; a live peer does, because it is running its own
- loop. Nine lines, eight of them the why.
- 2484 -> 2505: the FAKE LOBBY PEER now stays alive — autoPong plus a 25 ms
- pump, torn down with lobbyFake(false). A bare endpoint answers no pings and
- sends none, so the lobby's session heard nothing after the last thing a
- test pushed and closed on its own 6 s timeout, losing the peer with no user
- action: a watch-only probe held peerReady true through t+5.5 s and lost it
- at t+6.0 s. Four room/seat specs failed on exactly that. Same shape as the
- netLoopback fix above; the comment records the measurement so the next
- reader does not have to re-find the six seconds.
- 2505 -> 2506 for carEffects()'s gridLights/gridStrobe. The pre-race rear
- lights were drawn from a predicate no hook reported, so the only way to
- check them was a pixel — and a light that is ON but frozen looks identical
- to one that is strobing. A dev API growing by the one field that makes a
- new visual assertable is the file doing its job.
- 2506 -> 2566. __apex.repro(), the capture/restore of a player's exact
- frame: circuit, conditions, camera MODE plus CAMERA TUNER offsets, and
- every car's position on track. Most of the 57 lines are the comment
- explaining WHY it exists — a reported cockpit artefact cost six rounds
- because every reproduction guessed at the camera, the team and the
- traffic, so each round "fixed" whatever happened to be in the guessed
- frame. A screenshot says what is wrong; this says where to stand.
- 2566 -> 2576. repro() restored every car by cars[] INDEX, and game.js says
- above setCarRole that "cars[] index is not an identity" — makeCars() walks
- Career.gridDrivers(), so grid order differs between sessions and the netcode
- already stopped trusting it. Ten lines to match on identity instead and to
- COUNT what could not be placed; the alternative is a replay that silently
- hands cars each other's positions.
- 2576 -> 2579: setPhysics floors its knobs (a NaN car from expo:-1 had no
- way back) — the one `fl` helper plus a two-line why.
- +11: careerSim's inline championship award now also writes the countback
- histogram. It reimplemented endRace()'s award and omitted season.finishes,
- so a points tie in a simulated season fell through SeasonCal.rank to a
- STRING compare on driver id — the exact defect the histogram exists to fix.
- 2590 -> 2595 (split-newline count) diag().env.gpuErrors/backendState — the bound backend's own account (api, first GPU/WGSL error) for phone reports · deploy side: +5: garageCam reports effDist/fitD/panelFrac — the auto path is the one that can misframe, and the hook reported a distance the camera does not use

## `js/agent/agentview.js` — last ceiling 2452

- +9: the parts hook reports the CAREER cap, not the free-play 780. A career
- at a team whose factory build costs 1,500 was reported as remaining: -720
- for a perfectly legal setup.

## `js/car/car3d.js` — last ceiling 3582

- 2700 -> 2711: the cockpit build needed its own monocoque rear station. The
- shared span's closed rear cap at z 0.05 sat 0.23 m from the driver's eye and
- covered 55% of the steering wheel (depth-raster measured); ckpt now ends the
- monocoque at z 0.45 and drops the seat-surround span. Raised deliberately.
- 2711 -> 2723: the OPT-IN cockpit halo (SETTINGS > COCKPIT, default OFF).
- It could not reuse the chase hoop — that geometry sits below a seated eye
- — so the ckpt branch carries its own ring + pillar built against the eye,
- plus the comment recording why the two cannot share. A real feature behind
- a real switch, raised deliberately.
- 2723 -> 2734: a cockpit-only front wing. The shared cascade is invisible
- from a seated eye (12.9 deg down, under the hood crest at 9.8 — 0.01% of
- frame), and the first-person body is its own mesh, so it carries its own
- wing at a height the driver can actually see. Raised deliberately.
- 2734 -> 2739: the cockpit wing's placement is now a recorded measurement
- (screen rect at canvas res + what ate the other 13k px), not a guess.
- 2739 -> 2741: lifecycle Log.info at car mesh build (ns "car").
- 2741 -> 2757: sharper wing foil (knife-TE sample + outboard span split) and
- beveled endplates/canards — same mesh for GLX/WGX/TLX, paid from the 2.4k
- default-body headroom. Raised deliberately.
- 2757 -> 2766: thinner foil sections (~25%) + foil T-wing + beveled vanes.
- 2766 -> 2800: 2026 realism — extra sidepod stations, floor LE teeth,
- underwing fences, reverse-P inlet, beveled halo. Still under 2400/1500.
- 2800 -> 2851: recipe-gated duct / wakeboard / floor-slot kits.
- 2851 -> 2887: recipe-gated 2026 halo furniture (beveled blade, winglet,
- T-cam stalks, windscreen fairing). Defaults stay 0 / 2392 body.
- 2887 -> 3322: recipe-gated part-realism (exhaust lip/shield, fuel hatch/vent,
- gearbox casing, floor plank/gurney/scroll, ERS blister, engine scoopLip,
- faired wishbones, wheel gun-nut / tyre fillet, Brembo caliper).
- Lowered after trim-comments pass (measured 2652).
- 2662 -> 2850: the ROUND halo — addTube (smooth swept tube, the addDome
- pattern along a polyline) + sampleCurve (Catmull through the regulation
- datums), both hoops (chase + first-person) rebuilt as tubes, and six new
- recipe-gated knobs (cockpit halo profile/fences, headrest, front-wheel
- deflector, ERS cooler intake, fuel breather, tyre sidewall rings).
- Defaults stay 0; measured 2834 on the raise. Raised deliberately.
- 2850 -> 2860: the pillar V-brace — the real halo strut splits into a V
- at the top, meeting the ring either side of the apex (two beams + the
- why). Measured 2853.
- 2895 -> 2925: the endplate/suspension detail round — front-plate gills and
- the plate-to-plane fillet (both gated on plate >= 2, so the DEFAULT body is
- untouched) and the inboard damper/rocker-link hardware on the existing
- `rocker` knob. Measured 2915.
- 2860 -> 2895: the accuracy round — SEG 24 tyres (comment), regulation
- mirror housing (toe cant block, winglet, outer stay), and the PLATE
- rolled-top outwash row with its curled-lip span. Measured 2883.
- 2925 -> 2947: the cockpit pale-surface round. A near-white livery accent
- (ferrari c2 is [1,1,1]) turned every cockpit trim element into a flat pale
- slab; the fix is _ckAcc at the one point livery colours are derived, plus
- a !ckpt gate on the pale sponsor board and dark glass for the cockpit
- mirror face. Each carries the measurement that justifies it — cockpit view
- rays landing on a pale surface went 96 -> 0 (artifacts/pale-sweep.mjs) and
- every EXTERNAL build hashes byte-identical (artifacts/build-parity.mjs).
- 2947 -> 2960: FINISH_SURFACE grew from two rows to six (matte, brushed,
- pearl, carbon) plus the note explaining that a finish costs a SURFACE ID
- in the shaders' 20-30 classification chain rather than a material uniform.
- 3004 -> 3032. +20 for the exhaust heat-stain sleeve and its heatOf() blend:
- the fuel `flame` key reached only three ~2 cm glaze pips (0.0028 m2), which
- tools/car/parts-sweep.mjs --clamp-scan reads as a dead key. +8 for threading the
- brakes `rim` colour into the rim faces, which was computed and never read.
- 3032 -> 3068. +36 for the DIFFUSER, which was one closed loft and read as
- a featureless grey slab from directly behind — the view a chase camera
- holds for most of a lap (scratch/renders/car/rb4-diffuser.png). Now two
- tunnels with a ramped ceiling, outer walls, strakes and a trailing gurney.
- 3068 -> 3077 for the addPodFlankSpan TRAP note: its `proud` offset is
- measured off the loft control width, not the rendered pod surface, and
- the two diverge by up to 99 mm. Two flank-crease attempts rendered as no
- change at all before that was measured; the next person gets the answer.
- UNION with the deploy tip, which added +6 for the cockpit accent dimming
- reaching every livery paint in the driver's view (nose, pod, halo, stripe,
- noseStripe), not just c2/accent/wing/fin: 32 of 152 shipped liveries put a
- pale non-body surface in the cockpit before it, 0 after. Neither lineage's
- number fits the file that carries both, so this is RE-MEASURED on the union.
- 3087 -> 3121. Two shipping defects, both found by measuring rather than
- looking: the SHARK FIN base was frozen at y 0.7935 while the engine cover
- it stands on moves 0.776-0.915 with engine.coverHeight, so it floated 17 mm
- with daylight under it on a low cover and was buried 121 mm on a high one;
- and the HOOD accent stripe was a flat bar cantilevered up to 124 mm above
- the deck it is meant to lie on. Both fixes are comment-heavy because the
- fin one is only safe in the lowering direction.
- 3121 -> 3164. Two NEW part knobs, both measured live against the range the
- catalog ships (tools/car/parts-sweep.mjs --clamp-scan): cockpit.mirror moves the
- widest element of the upper body 170 mm, and aero.fin 291 mm on the largest
- flat plate at the highest point of the car. Neither section read a recipe at
- all before. The fin comment carries its weight: its scale has to reach the
- livery decal AND keep the crown level, and getting either wrong walks the
- graphic off the blade.
- UNION with the session branch, which added +13 for the SECOND cockpit slab
- report — and not a pale one. With a red car the monocoque span under the
- wheel is one unbroken block of body paint (rear cap a closed wall 0.65 m
- from the eye, deck running out under the hood); CARBON on the ckpt branch
- only, +1 line of code and the twelve recording why the tub is dark while
- the hood above it stays painted. Measured on ferrari: lower-field rays on
- body paint under the wheel 1073 -> 658 of 13430. Re-measured on the union.
- 3320 -> 3378: second detail pass — T-cam pod, driveshafts, splitter/tea-tray,
- turning-vane footplates, six-point harness. Measured 3372 on the raise.
- 3378 -> 3510: the PROPORTIONS pass, and it is nearly all comment. Seven
- measured defects, each fixed by moving numbers rather than adding geometry
- (the body and cockpit triangle counts did not move at all): the nose tip
- overhung the front wing's leading edge by 460 mm and made the car 5.87 m
- long on a 3.30 m wheelbase; the front-wing endplate cluster measured
- x 1.045, outside the 1900 mm width the tyres are already drawn to; the
- principal roll structure (C12.4.1, Z 968) did not exist, so the car's
- highest point was its rear wing; the sidepod had no undercut aft of the
- inlet; the engine cover was a zero-width knife ridge with every
- cover-mounted detail floating up to 0.21 m off it; and every suspension arm
- started 0.10-0.16 m outboard of the chassis it bolts to. The comments carry
- the regulation citations and the measured before/after, which is the only
- way the next pass can argue with them. Plus the tyre-shoulder ladder, the
- one change that did add triangles and the one that had to be re-spaced when
- the sweep caught its first rung collapsing under the optical floor.
- Measured 3512 on the raise.
- 3177 -> 3203 for FRONT_TYRE_OUTER / FW_SPAN and the note that derives them.
- The front wing was wider than the car: the widest vertex in the whole build
- was the endplate footplate at ±1.045 against a 0.950 tyre face, so the car
- measured 2.09 m at the wing and 1.90 m — exactly the 2026 maximum — at the
- wheels. The lines are the MEASUREMENT that fixes it: which option is widest
- (outwash_max, not the default), what its endplate adds, and why calibrating
- on the default left two specs 5 mm proud. Bug-explaining growth at the site
- of the bug, and the invariant itself lives in a test, not a comment.
- MERGED: both lineages found the SAME defect — the front wing standing proud
- of the tyre, both measuring the widest vertex at ±1.045 — and both grew this
- file explaining it. The deploy side's FW_SPAN is what ships (calibrated on
- the widest option, guarded by car-front-wing-width.test.mjs); this side's
- proportions pass is the rest of the growth. The union carries both sets of
- lines, so neither ceiling fits: re-measured at 3540.
- 3540 -> 3566: the nose running lights. Eleven of the 26 are geometry (three
- anchored boxes and their loop); the rest is the provenance note, which is
- worth its lines here — the emitter this restores was lost silently once
- already, and the comment is what stops the literal z coming back.
- 3566 -> 3575. Nine comment lines on the dash coaming: the second slab under
- the wheel, the box coordinates that identify it, and why _ckAcc could never
- have caught it (it dims only colours whose MIN channel is >= 0.45, and
- Ferrari red is [0.863, 0, 0]). The colour change itself is one token.
- 3575 -> 3582. Seven lines to gate the livery CREST STRIPE out of the cockpit
- build. The change is two `if (!ckpt)` tokens; the lines are the measurement
- that identifies it — 739 of 24045 view rays, starting AT the 0.30 m near
- plane, wholly inside the steering wheel's own angular window — and the
- reason the far nose run must NOT be gated with it. That stripe was reported
- as a slab three separate times and looked at for six rounds without being
- found, because every probe built the car without opts.livery.

## `js/track/tracks.js` — last ceiling 2399

- Raised 2600 -> 2670 for the start-line origin shift: buildCenterline's
- arc-length lookup, the dressingExclusions shift, and the shift-only remaps
- for the six emitters transformSceneryApi never covered (groundPatch,
- overheadSpan, circuitKit, groundedSegments, waterField, frameAt). Mostly
- the comments explaining why the shift is an ARC-LENGTH fraction and not
- `startFrac - sceneryStartFrac` — the trap that cost a full debugging pass.
- Raised again 2670 -> 2725: elevation/bridge anchors were remapped against
- `startFrac` instead of the authoring origin, sliding the road surface
- vertically under its own dressing (measured up to 43 m at Spa) — fixed by
- freezing that remap at `sceneryStartFrac` and rotating the bumps and the
- undulation ripple by the same arc-length shift in buildCenterline.
- Raised again 2725 -> 2750: floodMast/floodMastRing registered fixtures as
- customLamps only, so circuits that skip the generic floodlights pass
- (Singapore, Bahrain) fell back to synthetic lights with no matching mast.
- registerMastLamp() gives those masts their own 512-cap budget, separate
- from the 96-cap tunnel/soffit customLamps list.
- -> 2785 (+18, net of a deleted accumulator): barrierClear()'s grid sweep no
- longer widens by the index's largest half-width. barGridInsert already
- buckets every record by its INFLATED bounds, so the allowance was counted on
- both sides of the lookup and the sweep ran 4-9 cells where 1-4 suffice — on
- clearTreeDist's up-to-9 walk-outs per tree and hedge()'s per-step probe. All
- 18 lines are the proof that reach = r misses nothing; it is an equivalence
- claim, so it is the kind that has to be written down and tested as one.
- Verified: prop-clipping + coplanar-faces + scenery-grounding all pass over
- the 40-circuit build INCLUDING their anti-vacuity guards, which assert the
- baseline caps are tight — i.e. the placement counts are exactly unchanged.
- Lowered after trim-comments pass (measured 2309).
- 2319 -> 2350: tri-state verdict cache on the six guarded emitters (the
- graph fuse replay reuses dry-run guard verdicts; vegas build 1.66 -> 1.51 s,
- 40/40 graph parity). Gates compressed to 2 lines each before raising.
- 2350 -> 2349: R6 truth pass deleted the dead `remapK` (the sceneryLapMirror
- helpers that stay shift-only do so ON PURPOSE — singapore's KOLD legend).
- 2350 -> 2355 on the deploy side for the sign-safe seam wrap in
- scanBarrier/indexSolid (the negative-k silent no-op, 10 circuits hit it).
- Union re-measured: 2354.
- 2354 -> 2358 (R9): the pit-straight crowd tint read the AUTHORED def.night
- instead of the build's NIGHT override that every neighbouring branch uses,
- so a day race at a night circuit (or the reverse) wore the wrong tint. The
- four lines are the comment recording it at the site — bug-explaining growth.
- 2359 -> 2377 for the LAZY_SCENERY resolution: the bespoke closure now comes
- from window.TrackScenery[def.id] (def.scenery still wins, so a harness probe
- and any unsplit circuit keep working), plus the warn that makes a
- MISSING closure loud. Building bare is a legal state and an almost
- invisible one — road and terrain, no dressing — so it says so rather than
- failing silently, which is the one real risk of the split.
- 2359 -> 2360 on the other lineage for the one call that appends the painted
- grid boxes to the start-line decal. The 77 lines of box geometry went to
- js/track/core/mesh.js, which this ratchet does not bound and which already owns
- buildRoad and upOf; tracks.js pays only for the call, and riding the
- existing startline mesh is what keeps that to a single line instead of a
- mesh registration, a draw call, a free path and a hideMeshes key.
- Neither 2381 nor 2360 fits the union, which carries both — re-measured on
- the merged tree with the ceiling test's own metric, per the deploy rule.
- 2382 -> 2387: bakedModel joins the (k, side) scenery transform (why, 4
- lines) and modelDiagnostics.suppressedCounts for tests/unit/scenery-guards.
- 2387 -> 2399: the backdrop guard now records its drops through
- noteSuppressed, and carries the measured reason its margin is left
- alone (an oriented test suppresses MORE — PERF-FINDINGS 2u).

## `js/lighting/presets.js` — last ceiling 15508

- ── Round-6 additions: the unguarded giants, set AT measured (test metric,
- split-newline count) so any growth is a deliberate raise here. Each line
- says why the file is its size today; none is an extraction target yet.
- THE largest file in the repo: ~8.6k lines of it are data (per-track
- lighting presets exported by the bake-lighting skill), not logic.
- 8683 -> 8689: per-chunk lamps went from the ULTRA-night-only rung to every
- lit condition, so the conditional layer gained dusk/dawn/day keys beside
- night. Data, not logic — this file is ~8.6k lines of baked per-track values.
- 2026-08-29: 8689 -> 15508, the largest single raise this pin has taken, and
- all of it DATA: a player's hand-tuned dusk-wet and dawn-wet look (plus two
- Monaco nights) baked in from a COPY VALUES paste — 82 conditions, 7,447
- knobs, 183 KB -> 346 KB. The condition count did not move (805 before and
- after); the existing profiles simply went from ~8 knobs each to ~90.
- THE DUPLICATION IS FORCED, not sloppy. ~34 of those conditions are the same
- look repeated per circuit, which belongs in one "*|<tod>" key — except
- LightStore.condLayer gates that layer on gfx.hasPerChunkLights, and three.js
- cannot bind per-chunk sets, so a wildcard key is invisible on the default
- backend. An ungated "*|<tod>|<wx>" layer is where these lines come back;
- until then per-track keys are the only encoding that reaches every player.

## `js/render/webgpu/wgx.js` — last ceiling 6037

- 5821 -> 5905: the WebGPU road markings. The LUT that WGX reconstructs
- (s, lateral x, half-width) from — because it cannot read the per-vertex trk
- GLX reads — was baked as a BAND rather than a centreline, and a full cell
- dropped every later pass over the same ground. trkFromWorld builds the track
- frame from the two NEAREST samples, so both defects handed it a pair that
- was not along-track: the tangent ran ACROSS the road, and a LUT miss on a
- road draw zeroes trk, so the centre line painted down the LENGTH of the
- ribbon. Two small loops (collapse per station, evict the farthest from a
- full cell) plus the baked sample spacing; the rest is the measurement,
- because the numbers are what ruled out the folding theory everyone reaches
- for first (monza, no folds at all, was the worst circuit at 33.9%).
- The whole WGX backend in one IIFE by design (deferred inject, no tag).
- 5179 -> 5365 on the deploy union: their half-res SSR + chunk-AABB
- lamp-mask cull rounds landed on the other lineage (re-measured).
- 5365 -> 5423 (deploy lineage): the road's shared vertex buffer. Per-piece
- buffers made drawChunked's run merge (keyed on buffer identity) dead code
- for the road, so it paid one setVertexBuffer + one draw per visible chunk
- in every pass. The added lines are the single-buffer staging loop and the
- three reasons the merge is allowed to fire (contiguous, vertex_index dead,
- no lamp mask bound) — each one is load-bearing and documented where it sits.
- 5365 -> 5453 (R8 lineage): overflow sentinel remembered, per-chunk hoisted
- above the !cull fast path, SSR consume lanes gated on _ssrRan, lampVol mist
- gate ported from GLX/TLX, full-res depth texel for the SSR normal stride,
- both merge-run paths pooled to module scope, lamp masks generation-cached,
- and the F7 packed-upload deferral written where dead DRAW_FLOATS used to be.
- UNION: the file carries BOTH sets, so neither lineage's number fits it.
- Re-measured on the merged tree (AGENTS.md: re-measure, never max).
- 5516 -> 5523: the road half of the PER-CHUNK ROAD gate (frameRoadChunkLamps
- + the surfaceId-16 test), mirroring the GLX side.
- 5523 -> 5532: the per-chunk light upload separates a SET change (identity or
- knob — may reset the chunk-segment allocator) from a VALUES change
- (allLightsGen — flicker/sliders — must not), plus the road lamp gate.
- 5532 -> 5549: the same upload stops keying on the raw knob. PER-CHUNK
- LAMPS is step 0.001 over 0..1 but capFor() has <=17 outputs, so a drag
- re-packed and re-uploaded 64 KB per input event for identical bytes;
- keying on the cap splits the allocator reset out of the upload block
- (a cap-only change must still reset it). Plus a memo for the
- armed-shadow-lamp scan, which walked up to 1024 baked records every
- frame and again per env-probe face for a value only the caster moves.
- 5549 -> 5567: _tlScratch packs its THIRTEEN static lanes once per source
- array instead of all sixteen every frame. Gen moves every frame under
- flicker or the warm-up ramp, so up to 1024 records were being rewritten
- to change three lanes each. The split needs its own branch plus the note
- recording that the UPLOAD cannot shrink with it (rgb is interleaved
- 3-in-16, so the changed bytes are not a contiguous range).
- 5567 -> 5574: a measured verdict replaces an unmeasured assertion at the
- per-chunk merge site. The sentence "adjacent chunks almost never share an
- index list" justified BOTH backends forfeiting a 76-87% draw reduction and
- had never been counted; it holds (3 shared non-empty pairs of 909), but the
- 79.5% that share by being EMPTY are a trap worth naming in place. Detail is
- in PERF-FINDINGS.md 2b — only the pointer and the headline live here,
- which is why this is +7 and not the +15 the first draft cost.
- 5574 -> 5581: WGX gains gpuErrors/gpuFirstError on its INSTANCE surface
- (it had them only on the module factory), so the backend-parity contract
- holds now that GLX has a real counter. PERF-FINDINGS 2e.
- 5581 -> 5590: `updateInstances: undefined` and the note saying why it is
- DECLARED rather than omitted. An absent name lets descriptor-copy keep
- GLX's own closure on a WGX-bound gfx, so DebrisWorld's feature test would
- pass here and then call GLX with no device (backend-surface-parity).
- Nine lines to keep a wrong-backend call impossible. PERF-FINDINGS 2h.
- 5761 -> 5780: _shadowEncoderBegin now submits ANY pending encoder, and the
- 19 lines are the reason written where the next person will hit it. The
- shadow passes already had their own instance buffer (below); what they did
- NOT have was their own submit, and shadowInstBuf is per BATCH, not per
- LIGHT — so one deferred encoder let the lamp's upload land before the sun's
- recorded draw executed, and the sun map came from the lamp's culled set.
- 5821 -> 5835: _setIB joins _setPipe/_setBG0/_setVB0/_setVB1. setIndexBuffer was the one state call outside the redundancy filter the doctrine comment above those helpers says EVERY state call must route through, and createChunkedMesh gives every chunk of a mesh the same index buffer — so the per-chunk-lamp path and castShadow's chunk loop re-set an identical buffer once per visible chunk. drawDecal's raw call routes through it too, since a bare one beside the cache desyncs it.
- 5835 -> MEASURED: R22, the WebGPU road markings. The LUT WGX reconstructs
- (s, lateral x, half-width) from was baked as a BAND rather than a
- centreline, and a full cell dropped every later pass over the same ground.
- trkFromWorld builds the track frame from the two NEAREST samples, so both
- handed it a pair that was not along-track: the tangent ran ACROSS the road,
- and a LUT miss on a road draw zeroes trk, so the centre line painted down
- the LENGTH of the ribbon. Two small loops plus the baked sample spacing;
- the rest is the measurement, because the numbers are what ruled out the
- folding theory (monza, no folds at all, was worst at 33.9%).
- MERGED: both lineages landed; re-measured with this suite's own metric.
- 5944 -> 6037 (split-newline count) 2026-09-03 audit: hidden device loss keeps the rung; error cap spans 3 frames; per-mesh attr storage buffer dropped once the road LUT exists; createMesh/_makeAttrBG/_capEncode release on failure; gpuReadBuf always unmaps; COPY_SRC only when capture is on; env probe off on LITE; backendState   // MERGED and RE-MEASURED on the union (5943 lines), not added on paper. This branch: +18 litPipelineStats — the hook that EXCLUDED lazy pipeline compilation as the "WebGPU lags at first, then runs fine" cause (8 of 9 variants exist before the first frame, none minted while driving; PERF-FINDINGS.md §2x). Kept so the hypothesis cannot come back without re-running the measurement. Deploy side: +7 (this branch): lampShadowKeep returns, keyed by the caller on the map's CONTENT (lamp world position + a quantised key over the cars in it) rather than on a slot into a per-frame re-sorted array; _shadowRendered stays OUT of envProbeReset (that reset shipped and came back out — loadTrack already nulls the sun snap keys before the call, and the tier-shed caller cannot re-arm the latch it clears)// +15: _shadowRendered joins envProbeReset. It gated the light VP the LIT pass and the god-ray march both sample, and had no reset on track change, tier change, resize or quit — a latch with no invalidation is how the shadow-flag class of bug starts.   // +26: carShadowKeep/lampShadowKeep and the armed flag in the state hooks (the flag the shader reads was unobservable, which is why the strobe was invisible)   // 2026-09-02 R17: COPY_SRC on sceneTex, uniform maxTextureDimension2D clamp, 4-row output probe, freeTexture/freeChunkedMesh teardown (PERF-FINDINGS 2v)   // 2026-09-02 R16: settle window in _cssSize (PERF-FINDINGS 2u); earlier bug hunt: the shadow pass packs into its OWN instance buffer (frame-order bug: the camera cull rewrote instBuf before the deferred shadow submit); earlier: cell-set cull key ported from GLX + DebrisWorld updateInstances (audit round)

## `js/render/three/tlx.js` — last ceiling 3132

- 5821 -> 5835 (deploy branch): _setIB joins _setPipe/_setBG0/_setVB0/_setVB1. setIndexBuffer was the one state call outside the redundancy filter the doctrine comment above those helpers says EVERY state call must route through, and createChunkedMesh gives every chunk of a mesh the same index buffer — so the per-chunk-lamp path and castShadow's chunk loop re-set an identical buffer once per visible chunk. drawDecal's raw call routes through it too, since a bare one beside the cache desyncs it.
- -7 (this branch): _shadowRendered LEAVES envProbeReset. That reset shipped this morning and came back out — loadTrack already nulls the sun snap keys BEFORE this call, so the track-change motivation was void, while the tier-shed caller clears the latch with no way to re-arm it (sun shadows off until the eye crosses a 20 m cell, indefinitely for a parked car). lampShadowKeep goes with the producer that called it.
- MERGED and RE-MEASURED on the union, not added on paper.
- TLX backend shell; grows only with GLX-parity features.
- 2095 -> 2099 on the union: deploy's hasPerChunkLights:false backend flag
- (descriptor-copy would inherit GLX's true) + the TLX-fix side's dropTo
- instanced-rung retarget with its fallbackMat-contract comment.
- 2099 -> 2111: the deferred material dispose() unlocked by the vendored
- #33952 backport (_matDispose queue + present() flush + the PATCHES.md
- pointer note) — the eviction paths stopped leaking instead of skipping
- dispose, each line beside the eviction it completes.
- 2111 -> 2123 for the apex26.tlxForceBatches escape + skipBatches(): the
- instanced-draw skips were gated on softGpu(), so the code path REAL GPUs
- take was the one nothing in CI ever executed — the three.js WebGPU black
- screen shipped through that hole. The switch lets a software run exercise
- the real-GPU path against the same Dawn, with the comment recording why.
- 2123 -> 2155 for the GPU error capture WGX has always had and this backend
- never did: onuncapturederror + the tally + gpuErrors()/gpuFirstError()
- exports, with the comment recording that a black WebGPU frame was chased
- for a session against probes that could only ever report null.
- 2155 -> 2159: the soft blit and capturePixels ask presentedTarget() so the
- ?viz= bisect reads the RT the frame actually wrote — viz writes its image
- to the blit dest and never touches ldrRT, so every viz mode showed a stale
- frame on the one backend the bisect exists to debug.
- 2159 -> 2232 (R6): the whole reason a real-GPU black frame was
- unreproducible in CI. apex26.tlxForceHw=<sky|env|chunked|batches|shadow>
- turns each software CONTENT skip back into the path a player's GPU takes,
- one gate at a time; the env-probe face that throws is no longer counted
- (six swallowed throws latched envReady over a cube nothing wrote); and
- attachKey() puts the fragment-output count back into the node cache key
- the compile-storm fix had stripped — without it Dawn rejected the
- 2-target scene program in the 1-target probe pass (290 uncaptured errors,
- measured 2026-08-28) and every probe face came back black. Each addition
- carries the measurement that found it.
- 2232 -> 2270 (R7): Dawn does not THROW when it rejects a pipeline, so the
- faceOk guard above cannot see a discarded probe. The probe now baselines
- the uncaptured-error tally at its first face and refuses to bind the cube
- when errors landed during the capture, standing down after three passes
- instead of lighting the world from black forever. envState() reports it,
- because the overlay is the only way a player can tell us.
- 2270 -> 2278 (R8): PRESENTATION and CONTENT stop sharing a gate. softGpu()
- folds in _softBlit — a blit is needed whenever the swapchain is not
- composited, headless included — and content skips inherited it, so headless
- Chromium on a REAL Apple/Metal GPU ran the software half of every skip. The
- one machine that could test a player's path was testing the other one.
- 2278 -> 2296 (R9): _softAdapter classifies the ADAPTER again. Headless was
- treated as software — but headless Chromium on a real GPU is hardware, and
- that clause made macos-latest (Apple/Metal, measured anyHardware:true) take
- the software half of every content skip, so the only machine that can test
- a player's path tested the other one. Headless moved to _softBlit, where a
- non-compositing swapchain is the actual reason. And an empty adapter.info
- is no longer a software verdict on its own: browsers trim those fields, so
- a player with no vendor string was being handed the degraded path on real
- hardware. The tie-break is measured limits (8192/1 GiB software vs
- 16384/2 GiB Apple), and each addition carries that measurement.
- 2296 -> 2322 (R9): the real-GPU reproduction. releaseMirrors() nulls
- attribute.array once a lit present has drawn a chunk, on the premise that
- nothing walks the arrays later — true of drawing, false of three's node
- builder, which types attributes from array.constructor whenever it
- compiles a program for a NEW pass. The env probe is a new pass, so every
- face threw on hardware (41 WebGL2 / 81 WebGPU on macos-latest/Metal) and
- the world had no environment reflections at all. The release now waits for
- the probe to latch, and a probe that cannot succeed gives up instead of
- throwing once a frame forever.
- 2322 -> 2326: the same `updateInstances: undefined` declaration and its
- reason, for the same descriptor-copy hazard. PERF-FINDINGS 2h.
- 2326 -> 2331: five lines, all comment, passing maxLights through the lit
- factory under the SAME _liteGpu gate that already downgrades samples and
- outputType for mobile/WebKit. See tsl-lit.js for the row arithmetic.
- 2331 -> 2348: the phone decline (six lines of code) plus ten of comment
- carrying the measurement that justifies it and the disproved alternative,
- so the next round does not rebuild the CPU-array release and crash twice
- rediscovering why it cannot work. Evidence: PERF-FINDINGS.md 2m.
- 2348 -> 2418: the geometry census (__tlx.geoCensus, the instrument that
- found where the retained bytes actually were — the streaming plan they
- were assumed to be in would have freed 1.24 MB) plus routing
- buildGeometry through TLXShaders.packAttr. Evidence: PERF-FINDINGS 2n.
- 2418 -> 2437: __tlx.memState(), the hook that found the real leak. A race
- soak showed the heap climbing ~30 MB/min while geoCensus's registry AND
- attribute bytes stayed flat; memState reported material cache, mesh pool
- and three's own counters ALSO flat, which is what pointed the hunt at the
- renderer's render-object cache. PERF-FINDINGS 2o.
- 2437 -> 2496: the mesh pool keyed on (geometry, material) plus its clock-
- based prune. Measured against the flat pool it was replacing:
- createRenderObject allocations -45%, _createBindings -27%, 2-minute race
- drift -28%. A PARTIAL fix, not a cure — PERF-FINDINGS 2o says so.
- 2548 -> 2562: their occurrence-keyed mesh pool (the collapse fix) merged
- with the SSR MRT node hoisted out of present() into a memoised factory.
- That one line was the whole of 2o's leak — a new mrt() per frame meant a
- new mrt.id, a new render-context cache key, and a permanent RenderContext
- every frame. 4-minute race drift +124 MB -> +4.5 MB (GLX +1.3).
- PERF-FINDINGS 2n (their pack sites) and 2p (the MRT node).
- 2562 -> 2572: apex26.tlxShadowOff, a MEMORY lever and sibling of
- envProbeOff/perChunkOff, plus the eight comment lines carrying the
- measurement that earns it. iPhone profile, montreal, in race, lite ladder
- engaged (liteGpu+isMobile true, WebGL2): TLX 149.0 MB -> 108.6 MB with the
- shadow pass off. 40.4 MB from one knob — nearly twice what the whole
- attribute pack won (2n, 21 MB) — and the residue three.js#32409's reporter
- traced on r185 after #33682 to shadow.camera -> RenderList -> render item
- -> geometry. GLX on the same profile is 48.0 MB, so this does NOT by
- itself make the phone default flippable. Evidence: PERF-FINDINGS 2q.
- 2572 -> 2582: ten lines correcting the releaseMirrors gate's own comment,
- which still said the release "nulls attribute.array" and justified the
- env-probe hold on that. It assigns a zero-length array of the same class
- now, so .constructor resolves and .count (a plain property set once in the
- BufferAttribute constructor) is untouched. The gate is kept, but a reader
- is told it is belt-and-braces, not the thing standing between them and 81
- dead probe faces — a stale justification is how a correct guard gets
- deleted by the next person who checks whether it is still needed.
- 2582 -> 2588: the tlxShadowOff comment re-cited after checking the source.
- It credited "#32409's reporter" with a traced diagnosis; the quote is
- yisky's on PR #33682, they call it "a tentative observation rather than a
- confirmed diagnosis", and it is a WebGPURenderer report while our 40.4 MB
- is measured on three's WebGL2 path. The knob is justified by the
- measurement, not the thread, and the comment now says so - a borrowed
- upstream diagnosis reads as a cause and would have sent the next round
- hunting a RenderList that may hold nothing on this path.
- 2548 -> 2562 (theirs): the SSR MRT node hoisted out of present() into a
- memoised factory — one mrt() per frame was the whole of 2o's leak (a new
- mrt.id, a new render-context cache key, a permanent RenderContext every
- frame; 4-minute race drift +124 MB -> +4.5 MB). PERF-FINDINGS 2p.
- -> 2577 on the merge with the 2026-09-02 bug hunt: env give-up gate,
- per-face error window, geoReg compaction, and the WebGPU vertex-format
- rule at both pack sites (PERF-FINDINGS 2n).
- MERGE 2026-09-02: both lineages raised this ceiling for different work, so
- the union is neither side's number — 2603 is MEASURED on the merged file
- (mine 2588 + their 2577 both stale against it).
- 2603 -> 2715: the mirror-release lever, MEASURED at -20.6 MB on the iPhone
- profile (JSArrayBufferData 49.58 -> 28.96, usedJSHeap 97.01 -> 76.38,
- montreal in race) and worth every line of the reasoning it carries. Two
- parts. (a) releaseGeoMirrors() + a throttled sweep extends the release from
- chunked meshes to props, tex meshes and instanced BASE geometry — the heap
- snapshot in PERF-FINDINGS 2r says typed-array data is 63% of TLX's excess
- over GLX while three's whole object graph is 7%. (b) _envNeverComing():
- the gate `envReady || _envGaveUp || !envRT` can never open on a phone,
- because game.js gates the probe on PerfGov.tier() < 1 and so envFaceBegin
- is never called — measured gate "--T", 23 drains, 0 sweeps. That had
- silently disabled the CHUNKED release too, on exactly the devices it
- exists for. The comments are long because two earlier attempts at this
- same lever freed ZERO bytes (2m's frame counter; an inverted batch test
- this session) and the counters that caught them are the reason a third
- one landed.
- 2715 -> 2723: the index-release recall. gpu-census run 26 on macos-latest
- failed the REAL-GPU GATE with 8 uncaptured errors — "Index range (first: 0,
- count: 15, format: IndexFormat::Uint32) does not fit in index buffer size
- (0)". three's WebGPU backend sizes the index buffer from the array's byte
- length, so a zero-length index array is a ZERO-BYTE buffer. The WebGL2
- control leg reported 0 errors, which is exactly why a tlxForceGL=1
- measurement in-container looked clean. The comment is the price of not
- re-freeing them next round.
- + R16: the CSS-size cache re-check in resize() and the ResizeObserver
- moved outside the addEventListener check (PERF-FINDINGS 2u).
- 2745 -> 2763. Two sessions raised this in the same minutes and the union is
- neither number: theirs (2757) is the a63cab7 revert alone, mine adds the
- A/B knob's env-gate bypass on top. MEASURED on the merged file.
- 
- Why a revert RAISED a ceiling: it restored the shipped gate but kept the
- reasoning for why the term went in AND why it came out, because the fact
- that motivated it — the env probe is tier-gated off on phones, so that gate
- can never open there — is TRUE, and the next round will rediscover it and
- draw the same wrong conclusion without the note.
- 
- It was pushed urgently without running this guard. The red run skipped the
- deploy job, so a fix for a player's broken phone could not publish because
- of a line-count ceiling. Run the guard even when reverting — especially
- when reverting fast.
- 2763 -> 2779: the chunk-release A/B knob, the chunked-release counter, and
- the null-vs-zero-length finding written where the next person will hit it.
- three sizes a buffer as `array ? array.byteLength : count*itemSize*4` — an
- explicit fallback for a NULL array. A zero-length typed array is truthy,
- takes the first branch and yields a ZERO-BYTE buffer. Nulling was correct
- by design; changing it to zero-length was mine and it is the general case
- behind the Metal index refusal, not an index quirk.
- MERGE 2026-09-02 (third in a row on this one line): 2779 vs 2788. Theirs is
- the revert plus the A/B knob plus the null-vs-zero-length fix; mine is
- caching the bounds before the free and refusing the sweep on a phone. The
- union carries all of it and is neither number — re-measured at 2810 on the
- merged tree with this test's own metric, per the deploy rule.
- 2819 -> 2901 (deploy branch): the see-through car on three.js. forceWebGL was
- decided on `navigator.gpu` EXISTING, a presence check — an adapter can
- refuse and a webgpu canvas context can fail while it stays true, and on both
- paths three binds WebGL WITHOUT throwing, so the opaque-context path keyed
- on that flag was skipped and the canvas came up alpha-composited.
- 
- +14 (same base): the keep pass-throughs armed in the state hooks, and the
- boot-canary re-arm on a context loss that sends the tab back to WebGL2 —
- TLX had no post-proof re-arm at all, so the jetsam-mid-race its own comment
- names was the one case the canary did not cover.
- 
- +6 (deploy branch): the instance TINT was marked dirty outside the branch
- that writes it. `col` always exists but `colors` is null on every
- updateInstances call (DebrisWorld) and every batch built without node
- colours, so an unchanged all-ones buffer was re-uploaded every frame.
- 
- (this branch): the canary re-arm behind gfxClaimFail is OUT — skipClaim
- blocks the revert that would clear the probe, so it survived the whole GLX
- session and fired on an unrelated COLD boot, discarding the player's pick
- after one context loss. lampShadowKeep goes out with its producer.
- 
- MERGED: THREE lineages landed in this file, so the ceiling is the merged
- tree's own count, re-measured with this suite's metric. Note 2915 was itself
- a merge resolution that could not see the deploy branch's +6 — which is why
- the rule is re-measure, never add either side's number on paper.
- 2924 -> 3077 (split-newline count) 2026-09-03: placeholder material arrays carry the pack's sampling state (three compiles textureLoad+clamp from a Nearest placeholder — the phone unlit-track defect); WGSL compile capture; AUTO self-heal to three-WebGL2 on early GPU errors; phones never 'software'; soft-present stale-read guard; backendState on the façade; hidden device loss defers its reload   // +1: lampShadowKeep returns on the corrected key

## `js/render/glx/glx.js` — last ceiling 2259

- GLX core (passes live in glx/, shaders in shaders/) — the core stays thin.
- 1929 -> 1936: the comment recording why the per-chunk knob is no longer a
- brightness multiplier — it was compensating for the missing lamp transform
- and, applied to the global set, made a tier shed step the whole night.
- 1936 -> 1928: the per-chunk lamp DIMMER is gone. setFrameLights already
- scaled the baked set like the culled one, so _lampScale was pinned at 1
- and its three multiplies were identity — but the machinery survived the
- retirement: a per-lamp inFrameTail test, four comparisons for every lamp
- of every chunk of every chunked mesh, feeding a scale that could not
- matter. Lowered per the rule above: the ratchet follows the file down.
- 1928 -> 1963: the opt-in instance CELL-SET cull cache. cullInstances
- memoises on frustum-plane equality and three callers use three frusta a
- frame, so while driving it never hits and props are repacked and
- re-uploaded 2-3x — measured 426.7 KiB/frame (tools/gfx/glx-call-census.mjs).
- Keying on the surviving cell set takes -23.4% of that (-48% in a pack). The
- existing plane path is left intact beside it (the canary pins it), which is
- why this ADDS rather than replaces. Detail: PERF-FINDINGS 2c.
- 1963 -> 1961: the four uLightA..D arrays and their four scratch buffers
- collapse into one interleaved uLight[]/_luL — one uniform4fv per chunk
- instead of four. The ratchet follows the file down (PERF-FINDINGS 2d).
- 1961 -> 1958: the instancing gate stops being bracketed per instanced draw
- and is declared through the redundancy cache in litMaterial (PERF-FINDINGS 2e).
- 1958 -> 1975: GLX gains a real gpuErrors()/gpuFirstError() counter. The
- real-GPU workflow gated on gpuErrors and GLX never defined it, so that
- clause read null and passed forever (PERF-FINDINGS 2e). A deliberate
- raise: the gate is worth more than the lines.
- 1975 -> MEASURED, two lineages that found the same defect independently and
- one that found a second. Re-measured on the union, not summed from either.
- 
- THEIRS: the uNumLights redundancy cache (_luNL) plus the note that makes it
- safe to keep. 3 lines of code; the other 12 record WHY it is not cleared per
- frame like the _mat* caches beside it (a WebGL uniform is per-PROGRAM state,
- so it survives every unbind and only a relink invalidates it) and the
- measurement that justified it — 111 uploads a frame for 53.7 distinct
- values. uniform1i 146.4 -> 87.9.
- 
- MINE: ufM4, the mat4 twin of uf1, so uModel stops re-uploading a matrix the
- program already holds — 103.2 -> 50.3 a frame, because drawChunked calls
- litMaterial once per chunk RUN and every run of one mesh shares its matrix.
- It COPIES the sixteen floats because callers pass scratch matrices they
- mutate in place, and that comment is worth more than the line it costs.
- Plus updateInstances, which lets a caller hand a batch its own packed
- instance set — turning DebrisWorld's four per-body loops into four draws.
- (My ufi was dropped on the merge: it did what _luNL already does.)
- PERF-FINDINGS 2h.
- 2038 -> 2078. uf3, the vec3 twin of uf1/ufM4, plus the frozen fallback
- vec3s and the comment recording why its store is a PLAIN array: written
- with Float32Array(3) it skipped 0 of 17.5 calls a frame, because a
- Float32Array rounds on store and the compare was float32-vs-float64. The
- 40 lines buy uniform3fv 31.5 -> 16.3 per frame (vegas night, full field,
- tools/gfx/glx-call-census.mjs) with every other counter unchanged.
- 2150 -> 2156: carShadowKeep/lampShadowKeep pass-throughs, and `armed` added
- to the two shadow state hooks. The state hooks returned only the LIFETIME
- arms counter, which stays true straight through a strobe — that is why a
- 30 Hz car-shadow flicker and a lamp shadow that vanished while parked were
- invisible to every test in the suite.
- 2156 -> 2259 (split-newline count) 2026-09-03 audit: hidden context loss defers its reload; env-probe FBO completeness check; compare-mode depth dummy on unit 0 when shadows are off; sampler-unit ints and light VPs cached; MAX_FRAGMENT_UNIFORM_VECTORS warning; drain 30; CSS recheck 8   // 2026-09-02 R16: cssSize() distrusts its cache after a viewport change + the canWatchCss fallback (PERF-FINDINGS 2u); earlier bug hunt: drain re-arm on track switch, env-face re-entrancy restore; earlier: gated per-present getError drain (audit round)

## `js/render/webgpu/wgsl-chunks.js` — last ceiling 1934

- 1907 -> 1934: trkFromWorld's along-track window. best2 exists only to give
- best a tangent, so it must be best's neighbour along the LAP — spatial
- distance cannot tell that apart from a sample on another part of the
- circuit. Belt-and-braces rather than load-bearing once the bake is fixed
- (measured: 3 points on baku, NO_SWIN=1 in tools/gfx/road-lut-census.mjs A/Bs
- it), which is exactly why the number is written down instead of assumed.
- 2026-09-01: trkFromWorldIf uniform gate (largest WGX-only fragment cost)

## `js/render/three/tsl-lit.js` — last ceiling 1777

- three.js TSL lit-material port; tracks lit.js feature-for-feature.
- 1725 -> 1768: the same four finishes, the pearlescent term and the carbon
- weave, in TSL.
- 1768 -> 1777: nine lines, all comment, for one device-aware constant.
- MAX_LIGHTS was hard-coded 48; a uniform array is VERTICAL in WebGL2, so the
- four lamp arrays cost 4 x 48 = 192 of the 224-row fragment floor and the lit
- shader failed to LINK on iOS Safari — every lit surface drew nothing while
- textured/emissive ones kept drawing. The comment carries the arithmetic and
- its source, because the number 48 looks harmless and the failure is silent.

## `js/net/lobby.js` — last ceiling 1685

- Multiplayer lobby UI + flow; all of js/net/'s DOM lives here.
- 1618 -> 1624 (R8): the peer-close handler closes the transport BEFORE the
- map delete, with the leak-class comment — bug-explaining growth.
- 1624 -> 1672 (R8): every lobby timer gained an owner (codeReopen stored +
- cleared with its generation captured outside; the connect deadline applies
- while the transport never materialises; grace timers tracked via
- clashDrop/clashClear) and the seat-clash move is pinned in-memory-only —
- bug-explaining growth, no new features.
- 1672 -> 1678 (2026-09-01): resolveSeatClash treats a CUSTOM (MY TEAM) car as
- a seat that cannot be kept, whatever the player's rank — a peer's grid holds
- no slot or wireId for it, so the rival sat frozen with no error. Six lines,
- one of them the message that says why the car changed.
- 2026-09-02 bug hunt: finishStart awaits the async startRace (+7, the comment says why)

## 2026-09-03 (renderer session, merged into Phase 1-lite)

Recorded here because these four moved on `claude/rendering-bugs-optimizations-3pstxj`
while this file was being created on the deploy branch; the numbers themselves
live in `ratchets.json`.

- `js/render/three/tlx.js` 3144 -> **3138** (LOWER): the reverted
  `_envNeverComing()` term's dead body and its two write-only latches removed
  (added and reverted 2026-09-02; zero callers). The reverted design is
  preserved in `gfx-backend-canary.test.mjs`.
- `js/render/glx/glx.js` 2259 -> **2271**: `envFaceBegin` re-tests the disable
  latch AFTER the lazy `envInit()`, and `envFaceEnd` lowers `_envActive`
  before its early return. Without both, a driver whose probe FBO is
  incomplete left `_envActive` armed against a null framebuffer and the
  player got a permanently black canvas with a 64-pixel corner. Bug-fixing
  growth, pinned in the canary.
- `js/render/three/tsl-lit.js` 1777 -> **1794**: `apexMatBumpHeight`
  `setLayout` (three inlined the 15-branch chain at all six call sites — 31 KB
  of the 99 KB lit fragment) plus the `carbonFinish` metalness parity fix.
- `js/render/webgpu/wgx.js` 6060 -> **6068**: `device.lost` disarms
  `envProbeOff` as well as `perChunkOff`, matching GLX and TLX — both are
  shared cross-backend keys and WGX wrote only one.
- `js/render/webgpu/wgx.js` 6068 -> **6086** (2026-09-03): the SAVE SCREENSHOT
  reconfigure moves out of `_capEncode` (which runs after the frame is encoded
  and one statement before submit, so `ctx.configure()` expired a texture the
  submit still referenced) into the top of `begin()`. Bug-fixing growth; the
  comment is the reason.
- `js/render/three/tlx.js` 3138 -> **3152** (2026-09-03): the AUTO self-heal
  counts DISTINCT PRESENTS carrying an error, not raw errors — one rejected
  pipeline is dozens of errors in one frame, one transient is one error, and
  `> 0` reloaded the healthy tab. Mirrors WGX's `GPU_ERR_ESCALATE_FRAMES`.
- `js/render/webgpu/wgx.js` 6086 -> **6093** (2026-09-03): the desktop MSAA cap
  read `apex26.gfxHigh`, which `GfxQuality.syncBootTier()` only ever writes on a
  PHONE — so on desktop the read never saw "0" and every preset shipped 4x,
  the opposite of the block's purpose. Now reads `apex26.gfxPreset`. Same
  defect and same fix in `js/render/glx/post.js`.
- `js/game.js` 9235 -> **9245** lines / 5053 -> **5057** code (2026-09-03): the
  env-probe latch (`apex26.envProbeOff`) gets the same 0-and-back-on reset the
  chunk latch has had — before this the only clear was RESET RENDERER, which
  also discards the renderer pick; and the visibilitychange handler re-arms the
  crash sentinel with `sentinelResume()` instead of `sentinelArm(true)`, which
  was resetting the derived frame budget on every tab return.
- `js/render/webgpu/wgx.js` 6093 -> **6110** (2026-09-03): `envInit()` releases
  what it made on a partial failure and latches `_envInitFailed`; before, a
  throw after `envCubeTex` was assigned satisfied the re-entry guard with an
  empty `envFaceViews` and every probe cycle passed an undefined view to
  beginRenderPass — one GPU error per cycle for the life of the tab.
- `js/game.js` 9245 -> **9246** lines / 5057 -> **5058** code / 221 -> **222** G
  members (2026-09-03): `_skyHold` — `__apex.renderClock(t, true)` freezes the
  render clock. `tests/specs/image-grade-visual.spec.js` diffs two screenshots
  of one scene, and cloud drift between them was the Metal-CI flake; a clock
  that can only be SET, not held, could not pin it (a software runner renders
  <1 FPS, so one frame is a second of drift).
- `js/render/webgpu/wgsl-chunks.js` 1934 -> **1951** (2026-09-03): the sky's
  cloud-deck shading ported term for term from GLX SKY_FS — overcast clamp and
  grey mixes, golden-hour tops and pink undersides, the daytime cap/base
  contrast, twilight wash, moon silver. The largest remaining WGX visual gap
  (overcast read flatter and brighter than GLX/TLX); a parity port is paid for
  in lines, not extracted.
- `js/game.js` 9246 -> **9286** lines / 5058 -> **5083** code (2026-09-03): the
  boot audit's three cheapest wins — `ensureScenery` memoised on its in-flight
  promise (four callers used to inject the same 28–58 KB closure while the
  first fetch was in flight), `decalKeyPrefix` memoised on `store.rev` (a
  store read per drawn car per frame), and `warmCarAssets()` at the end of
  `startRace()` so the 11 meshes + 22 atlases build in the load stall instead
  of on the first countdown frame.
- `js/car/car3d.js` 3582 -> **3588** (2026-09-03): one-entry last-args cache in
  front of `aeroFlapsGeom`'s Map — the key concat was the last per-car-per-frame
  allocation on the flap path.
- `js/render/glx/glx.js` 2271 -> **2297** (2026-09-03): KHR_parallel_shader_compile.
  `link()` read LINK_STATUS right after linkProgram, so every compile had to
  finish before the next was issued — the eight core programs in strict
  series. `beginLinks()`/`resolveLinks()` issue the batch first and read the
  statuses after; the extension is requested in init(); without it nothing
  changes. Pinned on the mock's call order (`bootGlx({ parallel: true })`).
- `js/game.js` 9286 -> **9290** (2026-09-03): the TIME chip calls
  `scheduleFlybyTrack()` so a pick that flips sessionDark rebuilds the flyby
  track in menu idle instead of making GO pay a second full `Tracks.build`.
- `js/game.js` 9290 -> **9305** lines / 5083 -> **5095** code / 222 -> **223** G
  members (2026-09-03): `fieldSectorBests` — every car's forward sector
  crossing is timed so the HUD's PURPLE is the timing screen's session best
  (the FIELD's), not the player's own; the player's curated split logic is
  untouched. Green = personal best, yellow = slower, white = no reference.
- `js/game.js` 9305 -> **9345** lines / 5095 -> **5120** code (2026-09-03):
  player SLIPSTREAM. The AI had towed since day one (their traffic scan sets
  `towCar`); the human never did, so a whole racing mechanic was AI-only. The
  player block scans the same 0.5–34 m / |dx|<4 window with the same
  `AiDrive.towGain`, gated on DRIVER state (not braking, wheel near straight)
  rather than the AI's curvature lookahead, so the arc stays off the driver.
  Plus render-only lock-up (`wheelLock` freezes the fronts at the top of the
  friction budget, `flatSpot` wobbles them once per rev and heals over 90 s)
  and after-fire for every car, not only the player.
- `js/agent/apex.js` 2600 -> **2601** lines / 1975 -> **1976** code (2026-09-03):
  `physState().towing` — the player's slipstream 0..1, so a harness can tell
  a tow apart from an X-mode gain in `vmaxNow` (aero-zones-vm parks the field
  half a lap away and asserts it is 0 before reading the ratio).
- `js/game.js` 9345 -> **9401** lines / 5120 -> **5149** code / 223 -> **225** G
  members, `js/net/lobby.js` 1684 -> **1692** (2026-09-03): the GRID RULE.
  `raceQuali` (a boolean) becomes a view of `raceGrid` — tier | quali | rev10
  (Formula 2's reversed top ten) | revchamp | random — applied by
  `gridOrderFor()` to the order the session produced; the chips say where
  each rule comes from. The lobby ships and validates `grid` beside `quali`
  so an older peer's boolean still means what it meant. Plus the classified
  fastest lap handed to `SeasonCal.award()` for the 2019–2024 point, and
  `referencePole` on the façade for the time-trial medal sheet.
- `js/game.js` 9400 -> **9449** lines / 5149 -> **5189** code / 225 -> **228** G
  members / 147 -> **150** top-level lets, `js/net/lobby.js` 1692 -> **1712**
  (2026-09-03): CHANGEABLE conditions (the MIXED chip — `raceChangeable`,
  `wxArcPlan`, `_wxBase`; the arc target and length come from the sim seed
  and race counter, or from the HOST over SETTINGS `wxArc`, validated) and
  the DAILY CHALLENGE handle (`js/race/daily-challenge.js`, `G.daily`,
  `G.ttDistance`) — the day's time trial staged from the select screen's
  TODAY chip, recorded per UTC day with a streak.
- `js/game.js` 9449 -> **9492** lines / 5189 -> **5221** code / 229 -> **230** G
  members / 150 -> **151** top-level lets, `js/agent/apex.js` 2601 -> **2609**
  (2026-09-03): the RED FLAG. `redFlagRestart()` clears the surface and
  re-grids the field in race order on the boxes with laps, the race clock,
  best laps and penalties kept (`restartPending` makes lights-out resume the
  clock instead of zeroing it); RaceControl level 4 runs the procedure and
  hands over one restart request. `__apex.redFlag()` drives it for the VM.
- `js/game.js` 9492 -> **9506** lines / 5221 -> **5226** code, `js/agent/apex.js`
  2609 -> **2610** (2026-09-03): the SETUP SHEET (`js/garage/setup-tune.js`).
  Anti-roll bars fold into the four-channel contract through
  `Parts.getMods(setup, team, tune)` and rake into `Parts.aeroLoad(…, tune)`;
  BRAKE BIAS splits the friction ellipse per axle under braking (`bbSlipF` /
  `bbSlipR` against `BB_REF`, exactly the single `slipFactor` at the works
  bias, and AI/remote cars carry no `brakeBias` at all). `physState().brakeBias`
  reports the split. Every funnel edit is in place; the works sheet is identity.
- `js/game.js` 9506 -> **9509** lines / 5226 -> **5229** code / 230 -> **231** G
  members (2026-09-03): the first-run COACH MARKS (`js/ui/onboard.js`) — a
  `create` line, the per-frame `onboard.tick(dt)` beside `BrakeCue.tick()`, and
  `G.announceBusy` so a mark can never stomp LIGHTS OUT! or a sector split.
- `js/game.js` 9499 -> **9502** lines / 5219 -> **5222** code (2026-09-04):
  settings BACK pops the page stack (`settingsNav.back()`) before
  `closeSettings()`, on both the foot button and the pause-key path. Raised
  rather than packed: the extra lines are the stack, not leftover.
- `js/game.js` 9611 -> **9614** lines / 5274 -> **5277** code, tree
  `shellNodes` 1065 -> **1062** (2026-09-04): re-measured on the union with
  `claude/f1-game-project-26h3ng`. The +3 is the settings BACK stack on top
  of their HUD pack; the shell-node drop is tabs → door index.
- `js/game.js` 9629 -> **9632** lines / 5292 -> **5295** code, tree
  `shellNodes` 1071 -> **1068** (2026-09-04): second union (camera-hud
  defaults landed on deploy while we merged). Same +3 / −3 shape.
- tree `shellNodes` 1071 -> **1073**, `rawSpacing` 315 -> **314**
  (2026-09-04): DISPLAY HUD / RENDERER headings (`#pm-hud-h`,
  `#pm-renderer-h`). Overlay dock reused existing 8/12/44/80/120 px
  so the spacing count dropped one.

## Tree-wide ratchets (moved into `tests/data/ratchets.json` scope `tree`, 2026-09-03)

These four numbers lived as `const CEILING = N` beside their assertions in
three unit files — `css-class-ratchet.test.mjs` and `silent-catch.test.mjs`
(both DELETED here, their whole content being those ratchets) and the surviving
`tests/unit/wait-polling.test.mjs`, which keeps its lint-behaviour tests — each
with its own slack rule and its own copy of the walk. The measurement moved to
`tools/check/tree-counts.mjs`, the number to `ratchets.json`, and the reason for
every raise and lowering is kept below.

**Every one of the four rules was TIGHTER than the shared `max(60, 4%)`
default.** That is why a ratchet entry may declare its own `slack`, and why a
slack looser than the default is refused outright: folding five mechanisms into
one must not quietly widen any of them.

| metric | ceiling | slack it kept | was |
|---|---|---|---|
| `cssClasses` | 534 | 5 | `CLASS_CEILING - classes > 5` |
| `shellNodes` | 1064 | 25 | `NODE_CEILING - nodes > 25` |
| `bareCatches` | 173 | 15 | `BARE_CEILING - total <= 15` |
| `waitNoPolling` | 57 | 39 | `n > CEILING - 40` |

### `cssClasses` — distinct class tokens across `css/`

```
LOWER THESE WHEN YOU CONSOLIDATE. Raising one is allowed — this is a ratchet,
not a cap on doing work — but it must be a deliberate edit here with the
reason in the commit message, which is the entire mechanism.

543 was the count at install time (STRUCTURE-REDECISION-2026-08 §Q5), and is
the figure SKILL.md rule 8 quotes as "the whole finding".
541 after the mb-prefix family collapsed onto #mb-career / #mb-career-sub.
538 after the garage preview bar's two chip variants became --vb-fs / --vb-pad
on the buttons' own ids, and .cs-cam-lbl (a duplicate of an inherited value)
went entirely.
537 after .sel-section (one element, one declaration) became #sel-track-section.
UI redesign: the one-off Last Race heading moved from a class to a stable ID.
536 → 534: unused .ui-panel / .ui-kicker / .ui-value / .ui-muted
placeholders (no html/js consumer) removed from css/menus.css.
534 → 532: .menu-status-item / .menu-status-label left with the
title-screen dashboard chrome.
532 → 534: ScrollFade's sideways "more this way" edges (.sf-l / .sf-r),
the horizontal twin of the existing .sf-t / .sf-b pair. No new host class.
2026-08-27 round 12: 536 -> 533. The live tab's row-main class folded into
the standings' identical .dh-cons-main (the wrap floor became a context
override on the class board), buying real headroom instead of sitting as
a duplicate recipe.
2026-08-27 round 12 (second lowering): 533 -> 532. The camera panel's row
class left the shell — its five rows are the panel's only direct div
children, so the id scopes them without a class repeated five times.
2026-08-28: 532 -> 533. +1 for .cs-liv-pal, the strip of already-used colours
under each livery colour row. It cannot be a custom property on a context
selector (SKILL.md rule 8's usual answer): this is a NEW flex container with
its own wrap behaviour, not a variation of an existing box. The chips inside
it deliberately reuse .cs-liv-ed-none rather than adding a second class.
533 -> 534: body.rotate-ok, the RACE IN PORTRAIT opt-in. Reuses the
existing rotate- family (rotate-inner/-icon/-help-open) so no new family.
```

### `shellNodes` — `index.html` tag occurrences, less `<script>`/`<link>`

```
1,133 at install time. Lighthouse warns at ~800 nodes and errors at ~1,400;
SKILL.md rule 13's ruling (do not split the shell) rests on staying under
that error band, so this ceiling is where the ruling's premise is kept true.
Growth points named by STRUCTURE-REDECISION §Q1: #advanced (106 nodes),
#vsfriend (95).
1152 = the count MEASURED on the merged tree, not either lineage's arithmetic:
the deploy branch and the season branch each raised this in parallel and both
numbers are stale the moment they meet.
1160 = category-based Settings navigation: tab buttons + panels.
Still well below 1,400. The PERF tab / PerfTry script were removed
when those switches baked ON; NODE_CEILING stays a max, not a target.
+3 2026-08-18: five How-to-Play landmark links and their labelled navigation
replace the former undifferentiated long sheet without adding wrapper headings.
+8 2026-08-18: Adaptive Buttons OFF/ON in Advanced → BUTTON INPUT (h3 +
label + opt-row + two buttons + help). Reuses existing classes.
+30 2026-08-18: How to Play CONTROLS grew a CONTROLLER row and accurate
keyboard / phone / camera copy (key chips + the missing pad mapping).
Still well under Lighthouse's ~1,400 error band.
+10 2026-08-18: title-screen #menu-status season chips (3 items).
+8 2026-08-18: Adaptive Buttons moved onto the simple sheet; BRAKE CUE
slider + How-to-Play key chips + brake-cue.js script tag. Still under ~1400.
−10 2026-08-18: #menu-status chips removed with the dashboard chrome.
+1 2026-08-19: <script> block for iOS double-tap zoom cancel (gesturestart/
touchend handlers). Needed for Safari which ignores viewport maximum-scale.
+1 2026-08-19: four separate pm-metrics* buttons injected into DISPLAY panel.
+2 2026-08-26: #sel-map-btn (the display:contents button making CIRCUIT
DETAIL keyboard-reachable) + #sel-detail-chip (the fallback door on tiny
sheets where the canvas is display:none — hiding it used to make the whole
screen unreachable).
+4 2026-08-26: #pm-hud-sample and its hud-box — the HUD SIZE slider's live
sample; every real cluster is hidden while the settings sheet is open, so
the slider had zero visible effect.
+1 2026-08-27: the js/render/shared/lamp-chunks.js script tag (new-file lockstep —
the shared per-chunk lamp bake consumed by GLX and WGX).
+8 2026-08-27: mode sublines on the title 2x2 (RACE / TIME TRIAL / RACE A
FRIEND / SEASON each gain a stack span + sub span answering "what is
this?"), the round-10 judged ask. The label itself is an anonymous flex
item — no third span. Hidden at compact density, so the measured 390px
landscape clearance is untouched.
1227 on the deploy union (both lineages' adds; re-measured per the
deploy-merge rule).
1228 -> 1229: one <script> tag for js/perf/gfx-debug-overlay.js, the ?gfxdebug=1
overlay. A node is the honest price of the only channel a player with no
console has for telling us what their GPU did.
1234 -> 1238: +4 for the MY TEAM customizer's LOGO OUTLINE row (label +
colour input + NONE button + their row div). The outline stopped sharing a
picker with the mark's second SHAPE — on Red Bull that one row was labelled
SUN DISC and moved a rim, which is the report this raise answers — so it
needs a row of its own in both editors. The GARAGE editor builds its rows
from LiveryTex.markSlots at runtime and costs the shell nothing; this dialog
is static markup, and two editors disagreeing about a paint slot is worse
than four nodes.
1238 -> 1239: the RACE IN PORTRAIT button in #rotate-device (PERF-FINDINGS
5a) — one node, and the opt-in it carries is what makes the portrait touch
dock reachable at all.
1239 -> 1064 (2026-09-03): shellNodes() stopped counting <script>/<link> tags
— they are a projection of tools/manifest.cjs written by gen-shell, not DOM
the page renders, and counting them made every new js file a ratchet edit.
1059 real body nodes at the switch; 5 of headroom.
```

### `bareCatches` — empty, uncommented `catch` blocks in `js/`

```
Silent failure is this codebase's most-repeated defect shape, and the register
in docs/ARCHITECTURE-REVIEW.md says so in several places. The 2026-08 cleanup
hit a live one: js/core/store.js swallowed a localStorage write failure while
its cache went on answering reads, so on iOS Safari Private Browsing (quota
ZERO) a whole career saved perfectly, read back correctly all session, and was
gone on reload with nothing in the console.

MEASURING IT PROPERLY CHANGED THE PICTURE. The register framed this as "469
catch blocks against 59 Log call sites", which counts as swallowing every
catch that converts an exception into a typed error return — and js/net/ does
that deliberately and well (js/net/rendezvous.js turns nearly all of its
catches into ERR("timeout"|"offline"|…) so the lobby can fall back rather than
throw). The real numbers, by parsing each catch body:

    344  catch blocks in js/          (2026-08 census — the ratchet below
                                       holds the live bare-catch number)
    151  do something with the error
     26  are empty but carry a COMMENT saying why
    167  are bare `catch (e) {}`

So the honest target is the 167, not the 469, and the honest fix is not a mass
rewrite — plenty of those are legitimate best-effort probes (feature
detection, an optional API, a localStorage read that may be blocked).

THE ESCAPE HATCH IS A COMMENT, on purpose. An empty catch with a comment
explaining why passes. That is not a loophole: writing "ignored — the probe is
allowed to fail on Safari" is the entire thing that was missing, and demanding
a sentence is a far better filter than demanding a Log call nobody wants in a
hot path. Add `Log` where a user would notice; add a comment where they would
not; the ratchet stops the population growing either way.

Run: node tools/check/ratchets.mjs   (metric `bareCatches`)


The bare-catch population as of the pass that added this guard. LOWER it.
Measured 2026-08-19: 173 bare blocks (ceiling was 167 but count had grown
across several merges without being updated). Raised to the measured count;
the target is still to drive this toward zero, not raise it further.
```

### `waitNoPolling` — a declared timeout that cannot fire

```
Measured 2026-08-18 after moving every unambiguous option object into argument
three: 370 correctly-positioned timeouts still use rAF polling. LOWER this as
call sites are fixed; raising it needs a reason, and "I added a new wait" is
not one.
370 -> 57 (2026-08-27): EVERY waitForFunction under tests/ now carries
{ polling: 100 } — the rAF-starved timeouts were the recurring red class in
every loaded run (dev-tools, new-hooks, camera-driving-hooks, the
foundation specs, tiny). The 57 that remain are all tools/ CLIs, which
never gate a suite; fix them as they are touched.
Far enough below and the ratchet has stopped ratcheting — the same trap
tools/ci/fixture-consumer-audit.mjs records, where a floor sat at 31 while real
adoption was 54.
```
- `tree.cssClasses` 534 -> **535** (2026-09-03, on the deploy union): one class,
  `#hud-flag.flag-red` — the HUD state RaceControl level 4 paints while a red
  flag is out. The counter moved into `tests/data/ratchets.json` on the deploy
  branch while this was in flight, so the raise is recorded here rather than in
  the retired `css-class-ratchet.test.mjs`.
- `js/game.js` 9499 -> **9546** lines / 5219 -> **5227** code (2026-09-03,
  post-audit): five defect fixes the adversarial sweep found in the same day's
  batches. The red-flag re-grid now BANKS the prog the teleport credits
  (`_progGift`) so `checkRetirements`, which reads prog as a fraction of race
  distance, cannot park a cluster of cars on the restart; the field's S1
  reference resets with `lapTime` at the line (it was measured across the
  reset, so `fieldSectorBests[0]` was frozen and S1 could never show purple);
  `startRace` restores the weather chip's pick before re-arming, so a
  pause-menu RESTART mid-arc no longer keeps the arc's weather; the player
  slipstream skips retired cars; and the tow cue is cleared on both exits that
  skip the block that used to clear it. (9546 -> **9552** / 5227 -> **5228** on
  the follow-up: the weather restore in `startRace` is spelled out inline
  rather than calling `endChangeable()`, because that also drops `wxArcPlan` —
  and a HOST's plan for the race about to start is set before `startRace` runs,
  so calling it there threw the plan away. Caught by the game-VM suite.)

## CSS token adoption (moved into `tests/data/ratchets.json` scope `tree`, 2026-09-04)

Four counts left `tests/unit/css-token-adoption.test.mjs` for the one ratchet
mechanism: `subFloorFontSize` 5, `rawSpacing` 314, `rawColor` 326,
`rawColorDistinct` 181. All four carry `slack: 0` — they have always asserted
EXACT equality ("lower it to lock the win in"), which the ratchet expresses as a
slack of zero rather than as a second mechanism. The measurements moved verbatim
into `tools/check/tree-counts.mjs` and reproduce every frozen number exactly;
`node tools/check/tree-counts.mjs --offenders` prints the per-file breakdown and
the colour-fork groups that the old assertion messages carried inline.

The scans' own history, moved out of the ceiling comments:

```
  // font-size declarations written as a raw px literal below --fs-micro.
  // 2026-08-13: was 126 (menus 40, tuner 28, overlays 16, hud 15, data 10,
  // track-detail 8, responsive 4, carsetup 3, career 2) — all migrated onto
  // var(--fs-micro) in the same pass that added this guard. Now ZERO, which is
  // the one number that needs no justification.
  // 2026-08-14: 0 -> 3, and the count is only 3 because the check was widened in
  // the same pass to read px literals inside min()/clamp() (see below). Two of
  // the three predate this: the `clamp(11px, …)` / `clamp(12px, …)` viewport
  // ramps in css/responsive.css, whose lower bound is a floor for a phone, not a
  // chosen size. The third is `.hud-gaps` in css/hud.css: the ahead/behind gap
  // readout is a peripheral glance during a lap rather than menu chrome a
  // stopped player reads, and at --fs-micro it rendered as a banner beside the
  // minimap. Same class of exception as #hud-speed's raw 34px.
  // 2026-08-18: 1a3975c5 briefly added two 10px #subtitle eyebrows (3→5);
  // eedad021 restored the color system and those decls left (back to 3).
  // 2026-08-18: 3 → 4. 8d82b062 menu-hierarchy redesign added `#subtitle`
  // `font-size: 11px` on the title eyebrow (already red on deploy tip).
  // 2026-08-18: 4 → 5. 0ccd1b4c dashboard/season menu composition added another
  // sub-floor literal on the union.
  // 2026-08-18: 5 → 3. 864f5b32 / 8e01353c tokenised the title-screen menu
  // and locked the win back to the pre-redesign floor.
  // 2026-08-19: 3 → 4. adaptive-ui / audio work (build 1515) added one more
  // sub-floor literal (measured on deploy tip c3df0ee1).
  // 2026-08-27: 4 → 5, deliberate. The garage stacked-grid chip labels cap
  // at min(8px, --fs-micro - 3px): the relative form alone was written
  // against an 11px token and broke to 11px when the token moved to 14px
  // (labels ellipsised below tap size). 8px is measured against the 7-column
  // grid — SUSPENSION needs 47px in a 47px column interior at 852x393. The
  // comment at the declaration carries the measurement.
  // padding / gap / margin declarations containing a raw px literal.
  // POLICY (rewritten 2026-08-26, deliberately — user-approved): a raw px
  // spacing value converts when it has an EXACT token form, including
  // division forms (22/11 -> --pad; 12/24/18/9/6/3 -> --gap multiples;
  // 2/4/8/14/16 -> --gap sixths, thirds, two-thirds, 7/6, 4/3 written as
  // calc(var(--gap) / 3) style divisions so the arithmetic stays exact).
  // What stays literal: values with NO exact form (5/7/10px), measured
  // pairs whose comments record px arithmetic, position ANCHORS, and any
  // declaration inside a compact/rail-tier rule — those operate at
  // --gap: 8, where a 12-derived multiple is wrong at the rule's only
  // operating point. The old "a hairline should stay a hairline" rule was
  // retired when the tuner migration showed the density ladder SHOULD
  // tighten hairlines with everything else — that was the goal, not noise.
  // 2026-08-13: 529 -> 479. The four sheets that read NO spacing token at all
  // (data, hud, overlays, track-detail) were migrated in the same pass, for
  // exact simple ratios only (the division forms came 2026-08-26).
  // 2026-08-14: 475 -> 474. `.hud-gaps` lost an inert `gap: 4px` (it was never
  // a flex container) when the widget was resized in the HUD SIZE pass.
  // 2026-08-18: 471 -> 470. Data Hub Last Race column-hide rules lost a
  // duplicate landscape `padding` when they moved onto body[data-width].
  // 2026-08-18: 470 -> 467. Short-landscape HUD shrink left responsive.css
  // (`padding`/`gap` on .hud-box / .hud-top / #hud-sectors).
  // 2026-08-18: 467 → 476. Same 8d82b062 title-menu block added nine raw
  // padding/gap/margin decls (brand clamp, #subtitle, #menu-meta, button stacks).
  // 2026-08-18: 476 → 490. 0ccd1b4c dashboard/season menu block (+14 in menus.css).
  // 2026-08-18: 490 → 467. Title-screen tokenisation restored the 467 lock.
  // 2026-08-18: 467 → 481. Deploy `45dc6cb1` short-landscape / mid-width
  // menu compress (css/menus.css) added 14 raw padding/gap/margin decls
  // and did not remasure the ceiling; the union is 481.
  // 2026-08-18: 481 → 467. Tokenised that short-landscape / mid-width
  // compress onto --gap / --pad so density and UI SIZE still scale it.
  // 2026-08-18: 467 → 466. Settings remodel moved the 620px control pad
  // onto --pad so the list rows follow the density ladder.
  // 2026-08-19: 466 → 467. adaptive-ui / audio work (build 1515) added one
  // raw px spacing decl (measured on deploy tip c3df0ee1).
  // 2026-08-26: 467 → 466. Round-7 consistency sweep — one raw spacing decl
  // fell out with the token conversions (alpha-band / plate-family pass).
  // 2026-08-26: 466 → 453. Tuner spacing migration, the policy-safe set only:
  // 13 declarations with exact token ratios (6/3/9 -> --gap halves, quarters,
  // three-quarters) converted so the density ladder finally reaches the
  // lighting/camera panel's own layout. The hairline set (2/4/5/8/10px), the
  // measured pairs, the compact/rail tiers (already at --gap:8, so a 12-based
  // multiple is wrong at their only operating point), and the .lt-tabs
  // full-bleed triple stay raw per the policy note below.
  // 2026-08-26: 453 → 422. The 1b division set under the rewritten policy
  // above: 29 more tuner declarations onto exact --gap fractions (thirds,
  // sixths, two-thirds, 7/6, 4/3). Still raw in tuner.css: the .lt-tabs
  // full-bleed triple (next commit, atomic), the measured pairs, the
  // .adv-item 11px/7px inversion pair, and every compact/rail-tier value.
  // 2026-08-26: 422 → 419. The .lt-tabs full-bleed triple, atomically: the
  // panel's 18px inline pad and the strip's -18px margin + 18px re-pad are
  // ONE number three ways; all three are calc(var(--gap) * 1.5) now, so the
  // bleed stays exact at every density instead of only at --gap: 12.
  // 2026-08-26: 419 → 418. The track-detail close button's bespoke rule
  // (its padding: 0 among them) was deleted when the button joined the
  // shared .dh-close recipe.
  // 2026-08-27: 418 -> 363. css/data.css executed the division-form policy
  // (55 declarations; the hub was the largest single-file share). The three
  // negative pull-up margins (-2/-4 on the map legend, legend and delta
  // readouts) stay raw deliberately: they are optical anchors against a
  // canvas edge, the exclusion the policy names for anchors, and the tree
  // has no negative-division precedent to copy.
  // 2026-08-27: 363 -> 325. css/hud.css and css/overlays.css in one pass —
  // they share the HUD component (the hud-unit and gearbox sibling overrides
  // live across both), so migrating one alone would have split a single
  // widget's ladder across two densities. --btn-gap stays literal: it is a
  // token DEFINITION inside the measured --btn-pitch touch-dock pair, and
  // converting it would make the dock slot pitch density-dependent — a
  // behaviour change, not a spelling one. The centring anchors
  // (margin: -17px style) stay as anchors.
  // 2026-08-27: 325 -> 324. The career pressable-card carve deduplicated the
  // teamtile/seat padding pair into one shared declaration.
  // 2026-08-27: 324 -> 323. Round-13 season-row de-buttoning dropped the
  // rows' raw margin-bottom (the hairline grammar needs no stacking gap).
  // 2026-09-03: 323 -> 322. Compact-wide title dropped a redundant
  // `#menu-hero .bigbtn { padding-block }` that the following
  // `#menu-buttons .bigbtn { padding }` shorthand already overrode.
  // colour declarations carrying a raw literal (rgb()/rgba()/#hex in any
  // declaration value; tokens.css custom-property DEFINITIONS excluded — the
  // definition site is the system, not drift; url() interiors excluded).
  // POLICY: a literal converts when an existing token IS that value and that
  // meaning. What stays literal, with reasons in place: the mask-image alpha
  // stencils (a stencil's black is not a colour), the QR raster's pure
  // white/black (scanners), FIA flag signal colours (externally defined),
  // canvas-matched values whose comments record the pairing (.dh-gradbar,
  // .dh-canvas), gradient RAMP stops chosen against each other (tach,
  // energy), and the BOOST/OT/AERO ladder whose alphas are measured
  // compositing arithmetic. Set 2026-08-27 with the guard.
  // 2026-08-27: 379 -> 376. Round-11 de-buttoning: .trb-* and .tdf-* lost
  // their borders (three 0.3/0.4-alpha border tints left with them), .spf-dir
  // stepped under the hover fill, .spf-corner moved off --plate-on onto a
  // color-mix tint (no literal), .tdc-corner gained one sub-floor neutral.
  // 2026-08-27: 376 -> 377, deliberate. The season calendar rows adopt the
  // circuit-list hairline (the .track-row separator spelling, so distinct
  // stays flat); the rows they replace carried tokens only, nothing to trade.
  // 2026-08-27: 377 -> 378, deliberate. The track-detail full-bleed header
  // restates --grad-head's sheen layer (the token's own 0.07 white, an
  // existing spelling — distinct stays flat) to run the red bleed to 100%
  // on the one sheet head wider than the token was tuned for.
  // 2026-08-29: 378 -> 376. The touch-button transparency pass: two BYTE-
  // IDENTICAL restatements of #btn-throttle's idle fill came out of the
  // buttons-mode blocks in overlays.css. They were not decoration — at
  // (1,1,1) they outranked #btn-throttle:active (1,1,0), so GAS could not
  // light up under a thumb in the one steering mode that used them. The
  // ladder's own alphas moved with it (pedals to 0.85, presses to 0.95) but
  // traded one spelling for another, so distinct stays flat.
  // 2026-09-03 matching pass: 348 -> 334. Idle-tab / selected-chip / headline
  // ink left #fff and leftover red section chrome for --text / --steel.
  // 2026-09-03 leftover pass: 334 -> 330. Sort/label/live-updated chrome
  // left #7a7a85 and leftover dim for --steel / --text.
  // 2026-09-03 union with the timing-colour pass: --faster/--slower replace the
  // laneboard literals; the count is the merged tree's.
  // distinct colour VALUES after normalising spelling: space-after-comma,
  // trailing zero, leading dot, and hex-vs-rgb notation all fold to one
  // canonical form. This is the fork guard — identical paint must not hide
  // behind different spellings, because grep-based dedup is how conversions
  // get planned. Set 2026-08-27 with the guard.
  // 2026-08-27: 194 -> 190 in the same pass — the deleted border tints were
  // the only users of their values.
  // 2026-09-03: 190 -> 189 with rawColor 375 -> 374. Title secondary rooms
  // left rgba(255,255,255,0.78) for color-mix(var(--text)).
  // 2026-09-03 deep pass: 374 -> 367 / 189 -> 188. Customize rows, title
  // subs, How-to-Play rules, and data-hub numerals moved onto tokens.
  // 2026-09-03 leftover pass: 185 -> 184 with rawColor 334 -> 330.
```

### Re-measured on the deploy union, 2026-09-04

The four CSS counts moved on their first merge after joining the ratchet, and
the union's numbers are HIGHER than either side wrote — which is the whole
reason the merge rule says to re-measure rather than pick a side. This branch
had 314/326 (measured before the fold), the deploy branch had raised its copies
to 315/330, and the tree they merge into is at 317/334, because CSS landed after
both measurements.

| count | this branch | deploy branch | union |
|---|---|---|---|
| `subFloorFontSize` | 5 | 5 | **7** |
| `rawSpacing` | 314 | 315 | **317** |
| `rawColor` | 326 | 330 | **334** |
| `rawColorDistinct` | 181 | 181 | **182** |

`subFloorFontSize` 5 -> 7 is the one worth naming rather than absorbing: both
new declarations are in `css/hud.css`, from the broadcast-tower HUD layout
(`6c2a5aa6`) — a `letter-spacing`-tracked 10px `.hud-label` and a
`min(11px, …)` tower row. That file already carries the one blessed sub-floor
exception (`.hud-gaps`: a peripheral glance during a lap, not menu chrome a
stopped player reads), and these are plausibly the same class — a cinematic TV
tower is read at a glance, not studied. But they were not argued for, they were
measured, and this is the record that they were RAISED rather than earned. If
the broadcast profile is the right place for a sub-floor rung, say so at the
declarations; if not, they are the next two to migrate.
- `js/game.js` 9689 -> **9703** lines / 5352 -> **5357** code (2026-09-04): the
  METRICS control stops reading as broken. `HUD_MET_LAYOUTS` has five stops and
  the first two paint the same picture whenever `auto` resolves to `full` —
  which it does on any roomy band, and on the BROADCAST profile with a
  non-broadcast camera (`BCAM_IDS` is heli/side/cinematic/low/overhead, so
  COCKPIT falls through). `hud-met-full` has no CSS rule anywhere; it IS the
  base state. So two clicks changed nothing and the control looked inert.
  `hudMetricsLayoutLabel()` now names what auto resolved to, read off the body
  class rather than by duplicating `resolveMetricsLayout()` in a second file,
  and `openSettings()` re-reads it because the resolution moves with the camera
  — a label written only at boot and on click would go stale, and a stale
  resolution is a worse lie than the silence it replaced.
- tree `rawSpacing` 314 -> **313** (2026-09-04): free-cam climb/dive `.pc-btn`
  dropped the 64×58 / 46×42 literals for `var(--steer)`.
