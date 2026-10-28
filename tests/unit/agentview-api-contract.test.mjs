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
// agentHelp() manifest, tools/shot/agent.mjs, and .claude/skills/agent-view.
//
// Run: node --test tests/unit/agentview-api-contract.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

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
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return (name) => vm.runInContext(name, ctx);
}

test("car visibility and raster follow elevated and banked road surfaces", () => {
  function capture(elevation, onboard) {
    const Tracks = {
      sample(t, s, out) {
        out.p = [0, elevation, s]; out.t = [0, 0, 1]; out.r = [1, 0, 0]; out.hw = 6;
      },
      banking(t, s, x) { return { dy: x * 2 }; },
      curvature() { return 0; },
    };
    const get = evalGlobals(["js/agent/agentview-raster.js", "js/agent/agentview-corners.js",
      "js/agent/agentview.js"], { Tracks, CamModes: { CAM_MODES: [{ id: "chase" }] } });
    const M4 = get("M4");
    const eye = onboard ? [1, elevation + 2.55, -0.2] : [1, elevation + 6, -12];
    const target = [1, elevation + 2.6, 10];
    const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16);
    M4.lookAtTo(view, eye, target, [0, 1, 0]);
    M4.perspectiveTo(proj, Math.PI / 3, 2, 0.3, 3000);
    M4.mulTo(vp, proj, view);
    const player = { px: 1, pz: 0, s: 0, x: 1, head: 0, speed: 0, isPlayer: true };
    const G = { wrapS: s => ((s % 1000) + 1000) % 1000,
      track: { total: 1000, n: 250, def: { id: "elevated" }, props: { list: [] } },
      player, cars: [player, { s: 15, x: 2, code: "AI" }], camEye: eye, camTgt: target,
      camFov: 60, camMode: 0, gfx: { aspect: 2 }, frame: { eye, viewProj: vp } };
    const api = get("AgentView").create(G);
    return { visible: api.scene({ visible: true }), raster: api.render({ what: "view" }) };
  }
  for (const onboard of [false, true]) {
    const flat = capture(0, onboard), raised = capture(100, onboard);
    assert.equal(JSON.stringify(raised.visible.cars.map(c => c.screenPct)), JSON.stringify(flat.visible.cars.map(c => c.screenPct)),
      "moving road and camera together must preserve mirrored-player and Frenet-rival projections");
    assert.equal(JSON.stringify(raised.raster.grid.lines), JSON.stringify(flat.raster.grid.lines));
    if (onboard) assert.equal(raised.raster.coveragePct.player, undefined,
      "the banked player box containing the onboard eye must be excluded");
    else assert.ok(raised.raster.coveragePct.player > 0, "the elevated player must paint in chase view");
  }
});

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
    "js/agent/agentview-corners.js",
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
// along() (js/track/scenery/structures.js): spans WRAP the start line
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
    ["js/agent/agentview-raster.js", "js/agent/agentview-corners.js", "js/agent/agentview.js"],
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

test("roadShapeAt uses the short wrapped arc across the start line", () => {
  // A corner with entryS > exitS (wrapS of a negative entry) used to take
  // abs(exit-entry) ≈ a full lap for gradient (shrinking a real climb to
  // "level") and skip the kerb walk entirely (for d = a; d <= b never runs).
  const TOTAL = 1000;
  const TracksStub = {
    sample(t, s, out) {
      const ss = ((s % TOTAL) + TOTAL) % TOTAL;
      // Rise just after the line: short wrap arc sees ~8 m; abs(b-a) dilutes it
      // under the 1.5% "level" cut.
      out.p[0] = 0; out.p[1] = ss < 80 ? 8 : 0; out.p[2] = ss;
      out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.hw = 6;
    },
    banking: () => null, bankAngle: () => 0,
  };
  const get = evalGlobals(["js/agent/agentview-corners.js"], { Tracks: TracksStub });
  const kerbL = new Array(100).fill(0); const kerbR = new Array(100).fill(0);
  for (let i = 0; i < 100; i++) {
    const s = i / 100 * TOTAL;
    if (s < 80 || s > 920) kerbL[i] = 1;
  }
  const G = { track: { total: TOTAL, n: 100, def: { id: "wrap", turns: [0] },
                      kerbL, kerbR } };
  const corners = get("AgentCorners").create({
    G, r1: (v) => Math.round(v * 10) / 10, wrapS: (s) => ((s % TOTAL) + TOTAL) % TOTAL,
    // Curvature only within ±40 m of s=0 so entry/exit straddle the line.
    smoothK: (s) => {
      const ss = ((s % TOTAL) + TOTAL) % TOTAL;
      const d = ss < 500 ? ss : ss - TOTAL;
      return Math.abs(d) < 40 ? 0.05 * (1 - Math.abs(d) / 40) : 0;
    },
    sweep: () => 0.5, severityOf: () => "medium",
    LAT_GRIP: 20, BRAKE_DECEL: 30, STRAIGHT_R: 500, STRAIGHT_EXIT_M: 80,
  });
  const list = corners.corners();
  assert.ok(list.length >= 1, "expected a curated wrap corner");
  const c = list[0];
  assert.ok(c.entryS > c.exitS, "fixture must wrap the start line (entryS > exitS)");
  assert.equal(c.elevation, "uphill",
    "short wrap arc must keep the climb; abs(exit-entry) would report level");
  assert.ok(c.kerbs && c.kerbs.includes("left"),
    "kerb walk must sample the wrapped arc, not skip when entryS > exitS");
  // 15 m past entry (entryS=970 → s=985): old fold missed wrap-behind-car
  // cases near the line; entryDist must report in-corner, not ~lap ahead.
  const nc = corners.nextCorner(985, 40);
  assert.ok(nc && String(nc.status).startsWith("in "),
    "nextCorner must treat a wrap entry behind the car as in-corner, not ~lap ahead; got "
    + (nc && nc.status));
});

test("view raster horizon prefers cam.fovDeg over the live G.camFov", () => {
  const src = readFileSync(join(ROOT, "js/agent/agentview-raster.js"), "utf8");
  assert.match(src, /cam\.fovDeg\s*\|\|\s*G\.camFov/,
               "sky/ground fill must use the vantage fov (cam.fovDeg), not only G.camFov");
});

test("episode metadata makes prior-episode delta requests return full worlds", () => {
  const Tracks = { sample(t, s, out) { out.p[0] = 0; out.p[1] = 0; out.p[2] = s;
    out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.hw = 6; },
    curvature: () => 0, wallAt: () => 6 };
  const get = evalGlobals(["js/agent/agentview-raster.js", "js/agent/agentview-corners.js", "js/agent/agentview.js"], { Tracks });
  const player = { px: 0, pz: 0, s: 0, x: 0, head: 0, speed: 0, prog: 0, lap: 0, isPlayer: true };
  const view = get("AgentView").create({ wrapS: s => s, gripMult: () => 1,
    LONG_GRIP: 34, update() {}, els: {}, camVantage() {},
    track: { total: 4000, n: 400, def: { id: "stub", name: "Stub" } },
    player, cars: [player], state: "race", raceWeather: "dry" });
  const first = view.world({ detail: "brief" });
  assert.equal(first.episodeId, 0);
  const delta = view.world({ detail: "brief", since: first.seq });
  assert.equal(delta.deltaBase, first.seq);
  assert.equal(view.beginEpisode(), 1);
  const next = view.world({ detail: "brief", since: delta.seq });
  assert.equal(next.episodeId, 1); assert.equal(next.deltaBase, null);
  assert.deepEqual(next.ego, first.ego);
  assert.equal(view.rollout({ seconds: 0.05 }).episodeId, 1);
  assert.equal(view.beginEpisode(), 2);
});
