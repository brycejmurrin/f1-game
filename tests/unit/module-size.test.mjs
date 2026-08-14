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
  "js/game.js": 8079,
  // The next three largest. Each is cohesive today (a dev API, an agent view, a
  // procedural mesh), so these are drift alarms rather than extraction targets.
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
  "js/game/apex.js": 3106,
  "js/game/agentview.js": 2900,
  "js/car/car3d.js": 2700,
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
  "js/track/tracks.js": 2762, // +4 2026-08-14: place() anchors props to the RENDERED terrain (terrainYAt) instead of groundYAt's closed form, which drifts metres wherever `elevations` bend the ribbon — the last reachable float on madrid and magny_cours, and unfixable from circuit data since the call site is engine-generic
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
