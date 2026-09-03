// agentview-api-contract.test.mjs — freezes the shape of the agent-view
// surface: the object AgentView.create(G) returns, and the raster band that
// js/agent/agentview-raster.js must keep providing to it.
//
// Why this exists: agentview.js grew past 3400 lines and the rasters were split
// into js/agent/agentview-raster.js. A split like that fails SILENTLY — a
// dropped export doesn't throw at load, it throws the first time an agent calls
// the one method nobody tested, and `__apex` wires these names through by hand.
// The scenery split is guarded the same way (tests/unit/scenery-api-contract.test.mjs);
// this is that guard for the agent view.
//
// If you ADD a method intentionally, append it here — additions are safe.
// Removals/renames are not: they break docs/AGENT-WORLD-API.md, the
// agentHelp() manifest, tools/agent.mjs, and .claude/skills/agent-view.
//
// Run: node --test tests/unit/agentview-api-contract.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The agent-facing surface, as documented. The one-time deprecated aliases
// (visible/worldModel/frame/plan) were removed after every caller migrated to
// render({what}) and scene({visible}); REMOVED pins them out so a merge can't
// quietly resurrect them.
const CURRENT = [
  "world", "field", "trackInfo", "scene", "describe", "query", "atmosphere",
  "objective", "carView", "render", "survey", "rollout", "agentHelp",
  "corners", "terminal",
];
const REMOVED = ["visible", "worldModel", "frame", "plan"];
const CONSTS = ["API_VERSION", "PHYSICS_VERSION"];

// What agentview.js relies on the raster module to hand back.
const RASTER = ["frame", "plan", "carRender"];

// These files declare their module with a top-level `const`, which lands in the
// context's global LEXICAL scope rather than on the global object — so the
// binding has to be read back by evaluating its name, not off `ctx`.
function evalGlobals(files, extras) {
  const ctx = vm.createContext(Object.assign(
    { Math, JSON, Object, Array, String, Number, isNaN, isFinite, console },
    extras || {}));
  seedLog(ctx);
  // js/core/mat4.js first, always: it is the second <script> tag in the shell and the
  // home of the shared scalar helpers (M4.clamp), which agentview.js binds at eval.
  for (const f of ["js/core/mat4.js", ...files]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return (name) => vm.runInContext(name, ctx);
}

test("agentview-raster.js exposes create() and the three rasters", () => {
  const get = evalGlobals(["js/agent/agentview-raster.js"]);
  const AgentRaster = get("AgentRaster");
  assert.equal(typeof AgentRaster, "object", "AgentRaster global missing");
  assert.equal(typeof AgentRaster.create, "function",
               "AgentRaster.create missing — agentview.js calls it at create()");

  // create() only destructures ctx, so an empty object is enough to read the
  // shape back without booting a track.
  const band = AgentRaster.create({});
  for (const name of RASTER) {
    assert.equal(typeof band[name], "function",
                 `AgentRaster lost ${name}() — agentview.js destructures it`);
  }
});

test("AgentView.create() still returns the whole documented surface", () => {
  const get = evalGlobals([
    "js/agent/agentview-raster.js",
    "js/agent/agentview.js",
  ]);
  const AgentView = get("AgentView");
  assert.equal(typeof AgentView, "object", "AgentView global missing");
  assert.equal(typeof AgentView.create, "function");

  // A minimal G: create() destructures a few helpers up front but does not
  // touch the track until a method is called.
  const view = AgentView.create({
    wrapS: (s) => s, gripMult: () => 1, LONG_GRIP: 34,
    update: () => {}, els: {}, camVantage: () => {},
  });

  for (const name of CURRENT) {
    assert.equal(typeof view[name], "function", `agent view lost ${name}()`);
  }
  for (const name of REMOVED) {
    assert.equal(view[name], undefined,
                 `removed alias ${name}() is back on the surface — callers were `
                 + `migrated to render({what})/scene({visible}); keep it out`);
  }
  for (const name of CONSTS) {
    assert.equal(typeof view[name], "number", `${name} missing`);
  }
});

// describe("span:N") and render({what:"circuit"}) read the SAME span records
// (lap fractions, per noteSpan), and both must agree with the geometry walker
// along() (js/track/scenery-structures.js): spans WRAP the start line
// (~20 circuits fence 0.95->0.06), and s0===s1 (mod 1) walks a FULL lap
// (along()'s `|| n`; monaco/montreal/redbull wall/fence(0.0, 1.0)) — so
// lengthM is the wrapped difference, and a full-lap span is total, not 0.
test("span lengthM: wrap, plain and full-lap spans match along()'s walk", () => {
  const TOTAL = 4000;
  const spans = [
    { kind: "wall",      s0: 0.94, s1: 0.06, side: 1,  gap: 5 }, // wraps the line
    { kind: "fence",     s0: 0.2,  s1: 0.5,  side: -1, gap: 4 }, // plain
    { kind: "guardrail", s0: 0.0,  s1: 1.0,  side: 1,  gap: 3 }, // full lap
  ];
  const track = {
    total: TOTAL, n: 400,
    def: { id: "stub", name: "Stub" },
    props: { list: [], spans, count: 0, spanCount: spans.length, dropped: 0 },
    lampPosts: [],
  };
  // Straight-road Tracks stub: a constant tangent means zero curvature
  // everywhere, so the corner builder finds no peaks and worldModel() runs
  // without booting a real track build.
  const TracksStub = {
    sample: (t, s, out) => {
      out.p[0] = 0; out.p[1] = 0; out.p[2] = s;
      out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.hw = 6;
    },
    curvature: () => 0, project: () => null, wallAt: () => 6,
    banking: () => null, terrainY: () => 0,
  };
  const get = evalGlobals(
    ["js/agent/agentview-raster.js", "js/agent/agentview.js"],
    { Tracks: TracksStub });
  const view = get("AgentView").create({
    wrapS: (s) => ((s % TOTAL) + TOTAL) % TOTAL,
    gripMult: () => 1, LONG_GRIP: 34, update: () => {}, els: {},
    camVantage: () => {},
    track, player: { px: 0, pz: 0, s: 0, x: 0, head: 0 },
    cars: [], state: "race",
  });

  const want = [480, 1200, 4000];       // 0.12, 0.3 and 1.0 laps of 4000 m
  spans.forEach((sp, i) => {
    const d = view.describe("span:" + i);
    assert.notEqual(d.ok, false, `describe(span:${i}) failed: ${d.message}`);
    assert.equal(d.lengthM, want[i], `describe(span:${i}).lengthM`);
  });
  const wm = view.render({ what: "circuit" });
  assert.notEqual(wm.ok, false, `render({what:"circuit"}) failed: ${wm.message}`);
  assert.deepEqual(wm.spans.map((sp) => sp.lengthM), want,
                   "worldModel span lengths must match describe()'s");
});

test("the raster band reaches agentview through ctx, not a global grab", () => {
  // agentview.js must not reference the raster functions except through the
  // create() handshake — otherwise the split silently re-couples.
  const src = readFileSync(join(ROOT, "js/agent/agentview.js"), "utf8");
  assert.match(src, /AgentRaster\.create\(/,
               "agentview.js no longer creates the raster band");
  assert.doesNotMatch(src, /function\s+(frame|plan|carRender)\s*\(/,
                      "a raster function was re-defined in agentview.js — it "
                      + "belongs in js/agent/agentview-raster.js");
});

test("neither raster loop paints an object the camera is INSIDE", () => {
  // A SOURCE check, deliberately, and it is worth saying why. The real coverage
  // is agent-view.spec.js "renders any of the 13 camera modes", which asserts
  // the cockpit reports no player — but that is a browser spec in a group that
  // takes tens of minutes, and this rule was broken for the whole time it took
  // anyone to run it. Reconstructing frame() here would mean stubbing a track,
  // a camera, a view-projection matrix and a scenery list: a test of the stub.
  //
  // The rule: boxRect() gates on the object's CENTRE being in front of the eye,
  // which does NOT catch an eye INSIDE the box — the cockpit camera sits 0.20 m
  // behind the car's centre (COCKPIT_EYE_FWD), so the centre passes while the
  // eight corners project either side of the near plane and paint most of the
  // grid. containsEye() is the guard, and BOTH loops that paint boxes need it:
  // the scenery loop (a 22 m pine 20 m to the side reported the frame 100% tree)
  // and the car loop (the cockpit reported the frame mostly "player").
  const src = readFileSync(join(ROOT, "js/agent/agentview-raster.js"), "utf8");
  const guards = src.match(/if \(containsEye\(eye,[^)]*\)\) continue;/g) || [];
  assert.equal(guards.length, 2,
    "expected containsEye() to guard BOTH the scenery loop and the car loop in "
    + "agentview-raster.js; found " + guards.length + ". An onboard camera must "
    + "not report the car it is sitting inside.");
});
