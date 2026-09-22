// scenery-guards.test.mjs — the on-track guards must drop what is ON the road,
// not everything with a normal gap. Bug hunt 2026-09-02 found two guards whose
// margin was geometrically impossible to satisfy: the guardrail post test used
// a fixed 0.5 m against posts anchored at gap 0.4/0.5 (every Monaco armco post
// — 220 of them — suppressed while the driving limit was still recorded), and
// the billboard test used the panel's ALONG-track length as a radial margin
// (all 44 Qatar boards, all 7 Monaco boards dead). The counts are per-kind
// guard drops from the real build (modelDiagnostics.suppressedCounts).
//
// Run: node --test tests/unit/scenery-guards.test.mjs   (npm run test:tooling)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const counts = (Tracks, id) => {
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `${id} exists`);
  const track = Tracks.build(def);
  return track.modelDiagnostics.suppressedCounts || {};
};

test("Monaco's armco keeps its posts: the guardrail guard margin stays below the gap", () => {
  const Tracks = buildContext();
  const c = counts(Tracks, "monaco");
  assert.equal(c.guardrail || 0, 0, `monaco guardrail suppressed=${c.guardrail}`);
});

test("billboards with a normal gap are built: Qatar and Monaco lose none to the guard", () => {
  const Tracks = buildContext();
  for (const id of ["qatar", "monaco"]) {
    const c = counts(Tracks, id);
    assert.equal(c.billboard || 0, 0, `${id} billboard suppressed=${c.billboard}`);
  }
});

test("bakedModel rides the scenery transform like the fallback it replaces", () => {
  // A baked asset stands in for a WRAPPED procedural call at the same (k, side),
  // so it must take the same origin shift and reverse flip; unwrapped it stood
  // 2/3 of a lap away on every shifted circuit that ships one.
  //
  // But it CANNOT ride the (k, side) list, which remaps argument 0: bakedModel's
  // argument 0 is the model ID. It sat in that list from the day it was written,
  // so RK() was handed a string and the real k was read as the side — see the
  // behavioural test below for what that cost. This guard now pins the shape the
  // signature actually needs: out of the list, and its own wrapper.
  const src = fs.readFileSync(path.join(ROOT, "js/track/tracks.js"), "utf8");
  const i = src.indexOf("function transformSceneryApi(");
  assert.ok(i >= 0);
  const kSide = src.slice(i).match(/for \(const name of \[([^\]]*)\]\) \{\s*const f = api\[name\]; if \(f\) w\[name\] = \(k, side, \.\.\.r\)/);
  assert.ok(kSide, "the (k, side) wrapper list exists");
  assert.doesNotMatch(kSide[1], /"bakedModel"/,
    "bakedModel takes (id, k, side, …): in the (k, side) list its ID is remapped as a node");
  assert.match(src.slice(i), /w\.bakedModel = \(id, k, side, \.\.\.r\) => api\.bakedModel\(id, RK\(k\), SIDE\(side\), \.\.\.r\)/,
    "bakedModel still needs the shift and the reverse flip — on its own k, not on its id");
});

test("every bakedModel call reaches Assets with the model id it asked for", () => {
  // The source guard above is the mechanism; this is the consequence, measured
  // on the real circuits. Before the dedicated wrapper, all 152 calls across the
  // five circuits that ship baked props arrived at Assets.modelSync as NaN — or,
  // on a source-space def like monaco, as a node number coerced out of the id.
  // modelSync matched nothing, bakedModel returned false every time, and the
  // whole baked pack was dead on every circuit that asks for one. It was
  // invisible because the documented `if (!bakedModel(…)) procedural(…)` shape
  // quietly drew the fallback — and the sweeps cannot see it either, since no
  // node harness defines Assets at all, so this test defines one.
  const { buildContext: vmContext } = require("../../tools/lib/track-build-vm.cjs");
  const ctx = vmContext();
  const seen = [];
  ctx.sandbox.Assets = { modelSync: (id) => { seen.push(id); return null; } };
  const bad = [];
  for (const id of ["vegas", "monaco", "spa", "monza", "silverstone"]) {
    const from = seen.length, mark = ctx.mark();
    ctx.Tracks.build(ctx.Tracks.LIST.find((d) => d.id === id), 1200);
    ctx.trim(mark);
    const mine = seen.slice(from);
    assert.ok(mine.length > 0, `${id} ships baked props — it must reach Assets at all`);
    for (const got of mine) if (typeof got !== "string") bad.push(`${id}: ${String(got)}`);
  }
  assert.deepEqual(bad.slice(0, 8), [],
    `${bad.length} bakedModel calls reached Assets.modelSync with something other than a model id`);
});

test("the backdrop guard RECORDS its drops — it was the one emitter that did not", () => {
  // Every other suppression site calls ctx.noteSuppressed, which lands the drop
  // in modelDiagnostics.suppressedCounts. `backdrop` called a bare Log.info, so
  // its drops reached no test, no tool and no __apex hook: verify-track cannot
  // fail on a diagnostic it never receives, and this very file could not have
  // caught them. The moment it was given a counter it reported 539 suppressed
  // backdrops fleet-wide — 295 at redbull alone, 43 % of that circuit's calls.
  //
  // This asserts the WIRING, not the margin. The margin is separately suspect
  // (it uses the box's along-track length as a radial margin, the same shape
  // this file's header describes for billboards) and is left alone on purpose —
  // an oriented test suppresses MORE, not fewer. Numbers: PERF-FINDINGS 2u.
  //
  // The canary was redbull (295 drops). Its scenery file now asks the same
  // onTrack question BEFORE calling backdrop() (js/circuits/scenery/redbull.js,
  // also silverstone / shanghai / monaco), so it drops none; spa still asks for
  // 53 backdrops the guard refuses and stands in.
  const Tracks = buildContext();
  const c = counts(Tracks, "spa");
  assert.ok(c.backdrop > 0,
    "spa drops backdrops and the count must be visible — a bare Log.info " +
    "makes the drop unobservable, which is how 539 of them went unnoticed");
  // Ratchet: this number moving means the guard's behaviour moved. That is
  // allowed, but it must be a deliberate edit with a rendered look behind it,
  // not a side effect. Raise or lower it in the same commit that changes it.
  // (A drop the pit complex causes is counted on `supersededByPit`, not
  // here — this counter is the guard MARGIN's alone.)
  assert.equal(c.backdrop, 53,
    `spa backdrop drops = ${c.backdrop}, expected 53 — if you changed the ` +
    `guard, re-measure and update this with the reason`);
  // And the pre-check must not have changed what redbull SHIPS: it skips the
  // 295 calls the engine refused, and only those (graph-parity proved it).
  assert.equal(counts(Tracks, "redbull").backdrop || 0, 0,
    "redbull pre-checks its backdrops; a drop here means the circuit-side test drifted from backdrop()'s margin");
});

// --- Coincident-geometry guards (2026-09-22) ------------------------------
//
// Four shared emitters used to produce BYTE-IDENTICAL primitives — same
// centre, same size, same basis — which is the one defect no depth buffer can
// resolve: both faces write the same depth, so they flicker at every distance
// and on every GPU. Each guard below is the fix, and each is a one-line thing
// to delete by accident, so each is pinned here rather than only by the
// coplanar baseline (which is a slow sweeps gate and only catches GROWTH).
// Measured before/after across the fleet: 653 -> 541 coplanar spots.
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("a linear run is not re-laid over a span it already covers", () => {
  const src = read("js/track/scenery/structures.js");
  assert.match(src, /const alreadyLaid = \(kind, s0, s1, side, gap, style\)/,
    "structures.js must carry the containment guard for linear runs");
  // Every span emitter must consult it: okayama laid a full-lap armco and then
  // four more armco runs at the same gap, 759 coincident primitives.
  for (const [fn, needle] of [
    ["guardrail", /alreadyLaid\("guardrail", s0, s1, side, gap/],
    ["wall", /alreadyLaid\("wall", s0, s1, side, gap/],
    ["fence", /alreadyLaid\("fence", s0, s1, side, gap/],
    ["tyreWall", /alreadyLaid\("tyreWall", s0, s1, side, gap/],
  ]) assert.match(src, needle, `${fn}() must return early on a re-laid span`);
});

test("one tree per spot", () => {
  const src = read("js/track/scenery/nature.js");
  assert.match(src, /const spotTaken = \(x, z\)/, "nature.js must carry the planting guard");
  assert.equal((src.match(/if \(spotTaken\(a\.c\[0\], a\.c\[2\]\)\) return;/g) || []).length, 2,
    "both pine() and tree() must take the guard — two trees on one spot is one tree drawn twice");
});

test("a facade draws no rail on its bottom face", () => {
  // The rail at i=0 sits exactly on the section's base, so on every stacked
  // massing it lands in the plane of the rail on the section below.
  assert.match(read("js/track/scenery/city.js"), /if \(!simple\) for \(let i = 2; i <= rowN; i \+= 2\)/,
    "the facade rail loop must start at 2, not 0");
});

test("a ferris wheel staggers its members either side of the wheel plane", () => {
  // A flat wheel puts all 32 members on one plane: every joint fights.
  for (const p of ["js/track/scenery/structures.js", "js/circuits/scenery/vegas.js"])
    assert.match(read(p), /i % 2 \? 0\.06 : -0\.06/, `${p} must alternate its strut axis offset`);
});

test("layered spectator banks cannot coincide", () => {
  // The separation is a per-CALL slot, not a hash of opts.h. The hash looked
  // stable and was a chaotic map: okayama's 6.0/2.8 clayCut pair landed 1.6 mm
  // apart on it while its 6.5/3.0 pair landed 18 mm apart. Both axes must move
  // — the gap alone leaves two identical ladders' END CAPS on one plane, which
  // is where 400 of okayama's coplanar pairs lived (2026-09-22).
  const src = read("js/track/scenery/nature.js");
  assert.match(src, /const slot = hillSeq\+\+ % 5;/,
    "spectatorHill must take a deterministic per-call slot");
  assert.match(src, /gap \+= 0\.003 \+ slot \* 0\.01;/,
    "the slot must nudge the bank OUTWARD across the road");
  assert.match(src, /const sShift = 0\.007 \+ \(\(slot \* 2\) % 5\) \* 0\.01;/,
    "and ALONG the road, on a different permutation of the same positions");
});

test("abutting runs do not emit their seam node twice", () => {
  // along() is closed at both ends, so a wall painted as a chain of coloured
  // blocks emits the shared node once per block — byte-identical panels, the
  // purest z-fight. jeddah's six-block canyon measured 73 same-facing coplanar
  // pairs that way (2026-09-22). The tag is the emitter's geometric identity;
  // every along-based emitter in structures.js passes one, and concreteCanyon
  // passes one that deliberately omits the stripe colour (the plain slab
  // underneath is what duplicates).
  const src = read("js/track/scenery/structures.js");
  assert.match(src, /const along = \(s0, s1, stepM, fn, tag\) =>/,
    "along must take a seam tag");
  assert.match(src, /if \(seen\.has\(k\)\) continue;/,
    "and skip a node it has already walked under that tag");
  const tagged = src.match(/^ {6}\}, `[a-zA-Z]+\|/gm) || [];
  assert.ok(tagged.length >= 9,
    `every along-based emitter must pass a tag — found ${tagged.length}`);
  assert.match(read("js/track/scenery/identity.js"), /\}, `canyon\|\$\{side\}\|\$\{gap\}/,
    "concreteCanyon must pass a seam tag");
});
