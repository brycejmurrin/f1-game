// scenery-api-contract.test.mjs — freezes the shape of the `scenery(api)`
// object that TrackBuildProps.build (js/track/scenery/build-props.js) hands to
// every circuit's bespoke scenery callback (40 consumer files in js/circuits/).
//
// The api members below are the de-facto public contract those files were
// written against (docs/SCENERY-API.md). Any split/refactor of buildProps
// must keep this surface intact — this test catches an accidentally dropped
// or renamed member headlessly in seconds, without building every circuit.
//
// If you ADD a member intentionally, append it here (additions are safe;
// removals/renames break circuit files and need a sweep of js/circuits/*.js).
//
// Run: node --test tests/unit/scenery-api-contract.test.mjs  (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const path = require("node:path");
const { buildContext } = require("../../tools/track/verify-track.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

const CONTRACT = [
  "ATM", "COL", "K", "MAT",
  "acacia", "addBox", "addCone", "addCyl", "addFrustum", "addMountain", "addPrism", "addPyramid",
  "along", "anchor", "backdrop", "bakedModel", "bankedKerbStrip",
  "billboard", "bleacher", "bowlSeatWall",
  "broadcastCompound", "broadleafFall", "building", "bush", "cameraTower", "cantilever", "circuitKit",
  "cityFront", "concreteCanyon", "conifer",
  "cross", "cypress", "def", "drape", "drapeRun", "ds", "every", "fence", "ferrisWheel", "floodMast",
  "floodMastRing", "forestEdge", "foundation", "frameAt", "gantry", "grandstand", "grandstandEx",
  "gridshellCanopy",
  "groundPatch", "groundPlane", "groundUnder", "groundYAt", "groundedSegments", "guardrail",
  "hash", "hedge", "house", "hw", "indexSolid", "lampPost", "landmarkKit", "lapBounds", "ledFacadeBands", "lerp",
  "marshalPost", "modelDiagnostics", "modelGroup", "motorhome", "mountain",
  "n", "night", "norm", "onTrack", "out", "overheadSpan", "pal", "palm",
  "pastelStreetRow", "peak", "pine", "place", "plane", "prop", "px", "py", "pyMin",
  "pz", "recordBarrier", "ridge", "runoffApron", "sailCanopy", "scaffoldStand",
  "sceneryTheme", "seat",
  "signBoard", "signDigit", "spectatorHill", "sponsorHoarding", "stonePine", "terrace", "terrainYAt", "theme",
  "tieredBowl", "tower", "track", "tree",
  "tyreWall",
  "underpassPortal", "upOf", "vadd", "wall", "waterBand", "waterField", "waterSurface",
];

// The member COUNT is asserted separately from the deepEqual above it: a paste
// that drops one name while adding another still satisfies "these are sorted and
// equal" if BOTH lists are edited together, and the count is the cheap tripwire
// that says how many things circuits may call. Bump it deliberately.
// 111 -> 112 (2026-09-10): `bakedModels` dropped (no circuit ever called it);
// `K` (frac -> un-shifted node) and `lapBounds()` (cached lap centroid +
// radius) added — the two pieces of boilerplate 37 and 30 files carried.
// 112 -> 114 (2026-09-25): `drape` + `drapeRun` (terrain-fitted flat decals,
// TrackModels.drapeKit) — promoted from four identical ~100-line circuit-local
// copies (paul_ricard, dijon, okayama, miami), vertex-identical to them.
const CONTRACT_SIZE = 114;

test("the frozen contract is the size it declares", () => {
  assert.equal(CONTRACT.length, CONTRACT_SIZE);
  assert.equal(new Set(CONTRACT).size, CONTRACT_SIZE, "duplicate member in CONTRACT");
  assert.deepEqual(CONTRACT, [...CONTRACT].sort(), "CONTRACT must stay sorted");
});

test("buildProps sceneryApi surface matches the frozen contract", () => {
  const Tracks = buildContext();
  // A non-reversed, non-source-coordinate def sees the raw (unwrapped) api.
  // The shipped closures live in window.TrackScenery now (LAZY_SCENERY), so
  // "has a scenery callback" is a question about the manifest roster, not about
  // def.scenery — which is undefined on every shipped circuit today. The probe
  // below is assigned to def.scenery, which tracks.js resolves FIRST precisely
  // so an explicit override still beats the registry.
  const withScenery = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find(
    (d) => !d.reverse && d.sceneryCoordinates !== "source" && (d.scenery || withScenery.has(d.id)),
  );
  assert.ok(def, "need at least one plain circuit with a scenery callback");
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  assert.deepEqual(keys, CONTRACT);
});

test("reversed/source-coordinate defs get the same surface (wrapped)", () => {
  const Tracks = buildContext();
  const lazy = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find(
    (d) => (d.reverse || d.sceneryCoordinates === "source") && (d.scenery || lazy.has(d.id)),
  );
  assert.ok(def, "the lazy circuit registry must contain a wrapped scenery fixture");
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  // transformSceneryApi must wrap helpers without adding/dropping members.
  assert.deepEqual(keys, CONTRACT);
});

const landmarkSource = (id) =>
  fs.readFileSync(path.resolve(`js/circuits/scenery/${id}.js`), "utf8");

const requiredLandmark = (body, id) => {
  const start = body.indexOf(`modelGroup("${id}"`);
  assert.notEqual(start, -1, `${id} model group is missing`);
  assert.match(body.slice(start, start + 2200), /\{\s*required:\s*true\s*\}\s*\)/,
    `${id} must be structurally required`);
};

test("BATCH-01 Must landmarks are explicit required scenery assemblies", () => {
  // ONE FILE PER CIRCUIT: tests/data/landmarks/<id>.json = { why?, ids }.
  // This was one object literal here, and every scenery PR appended its circuit
  // to the end of it — so each merge conflicted with every other open scenery
  // PR (a dozen hand syncs in one wave-6 afternoon, 2026-09-29). A new circuit
  // is a new file now; two PRs collide only if they edit the same circuit.
  const dir = path.resolve("tests/data/landmarks");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.ok(files.length >= 40, `landmark files present (${files.length})`);
  const seen = new Map();
  for (const f of files) {
    const track = f.slice(0, -5);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.deepEqual(Object.keys(rec).filter((k) => k !== "why" && k !== "ids"), [], `${f}: only "why" and "ids"`);
    assert.ok(Array.isArray(rec.ids) && rec.ids.length > 0, `${f}: ids is a non-empty list`);
    assert.ok(fs.existsSync(path.resolve(`js/circuits/scenery/${track}.js`)), `${f}: names a circuit with a scenery module`);
    const body = landmarkSource(track);
    for (const id of rec.ids) {
      assert.equal(typeof id, "string", `${f}: ids are strings`);
      assert.ok(!seen.has(id), `${id} is listed by both ${seen.get(id)} and ${f}`);
      seen.set(id, f);
      requiredLandmark(body, id);
    }
  }

  const monaco = landmarkSource("monaco");
  assert.match(monaco, /monaco-tabac-shop[\s\S]{0,2200}TABAC/);
  assert.match(monaco, /monaco-rascasse-bar[\s\S]{0,2200}RASCASSE/);
  assert.match(monaco, /const harbourStations = \[0\.365, 0\.545, 0\.59\]/);
  assert.equal((landmarkSource("singapore").match(/\bcityFront\s*\(/g) || []).length, 5,
    "Must landmarks must not densify cityFront");
});

// ── K: the frac -> node index must be a valid index for EVERY frac ─────────────
// JS `%` keeps the dividend's sign, so `Math.round(s * n) % n` handed a NEGATIVE
// slot to any prop placed `s - 0.002` behind a node just past the start line.
// Ten circuit-local copies carried that form (Okayama's alone wrapped) until
// 2026-09-22, when the copies were retired for this member and it was
// normalised. The whole lap and one turn either side must land in [0, n).
test("api.K wraps negative and over-lap fracs into [0, n)", () => {
  const Tracks = buildContext();
  const withScenery = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find((d) => !d.reverse && d.sceneryCoordinates !== "source" && withScenery.has(d.id));
  let K = null, n = 0;
  def.scenery = (api) => { K = api.K; n = api.n; };
  Tracks.build(def);
  assert.ok(K && n > 0, "the probe saw api.K and api.n");
  for (const s of [-0.5, -0.002, -1e-9, 0, 0.5, 0.999999, 1, 1.002, 1.5]) {
    const k = K(s);
    assert.ok(Number.isInteger(k) && k >= 0 && k < n, `K(${s}) = ${k} must index [0, ${n})`);
  }
  assert.equal(K(-0.002), K(1 - 0.002), "a frac just behind the line is the node just behind the line");
});

test("Silverstone camping preserves every object on grounded running gear and flags meet their poles", () => {
  const vm = require("node:vm");
  const ROOT = path.resolve(path.dirname(require("node:url").fileURLToPath(import.meta.url)), "../..");
  const sandbox = { Math, Number }; sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/track/core/geom.js"), "utf8").replace(/^const\b/gm, "var"), sandbox);
  const Geom = sandbox.TrackGeom, groups = [], stageGroups = new Map(), flags = [], poles = [];
  const buffer = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 });
  const wrapped = { ...Geom };
  for (const kind of ["addBox", "addPrism", "addCyl"]) wrapped[kind] = (stage, center, ...args) => {
    const start = stage.pos.length;
    Geom[kind](stage, center, ...args);
    const part = { kind, center, args, mat: stage._mat, vertices: stage.pos.slice(start) };
    if (stageGroups.has(stage)) stageGroups.get(stage).parts.push(part);
    return part;
  };
  sandbox.TrackGeom = wrapped;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/circuits/scenery/silverstone.js"), "utf8"), sandbox);
  const ground = (x, z) => x * 0.025 + z * 0.03;
  const grade = Math.atan(0.03), r = [1, 0, 0], u = [0, Math.cos(grade), -Math.sin(grade)], t = [0, Math.sin(grade), Math.cos(grade)];
  const out = buffer(), n = 1000;
  const api = new Proxy({
    out, MAT: Geom.MAT, n, ds: 4, px: Array(n).fill(0), pz: Array(n).fill(0), pyMin: 0,
    pal: {}, ATM: {}, circuitKit: null, hash: () => 0.25, onTrack: () => false,
    vadd: Geom.vadd, terrainYAt: ground, lapBounds: () => ({ cx: 0, cz: 0, radius: 1000 }),
    anchor: (k, side, gap) => { const x = side * (6 + gap), z = k * 4; return { c: [x, ground(x, z) - 0.3, z], r, u, t }; },
    modelGroup: (id, bounds, build) => {
      if (!id.startsWith("silverstone-camping-field-")) return true;
      const stage = buffer(), group = { id, bounds, parts: [] };
      groups.push(group); stageGroups.set(stage, group); build(stage); return true;
    },
    addBox: (stage, center, size, color, basis) => {
      if (size[0] !== 0.08 || size[1] !== 1.2 || size[2] !== 2.2) return;
      flags.push({ center, size, basis });
    },
    seat: new Proxy({ cyl: (stage, center, radius, height, color, seg, basis) => {
      if (radius === 0.11 && height === 10.4) poles.push({ center, radius, height, basis });
    } }, { get: (target, name) => name in target ? target[name] : () => {} }),
  }, { get: (target, name) => name in target ? target[name] : () => {} });
  sandbox.TrackScenery.silverstone(api);
  const parts = groups.flatMap(g => g.parts), bodies = parts.filter(p => p.kind === "addBox" && p.mat === Geom.MAT.METAL);
  const wheels = parts.filter(p => p.kind === "addCyl");
  assert.equal(groups.length, 3); assert.equal(bodies.length, 16);
  assert.equal(parts.filter(p => p.kind === "addPrism").length, 8);
  assert.equal(parts.filter(p => p.kind === "addBox" && p.mat === Geom.MAT.GLASS).length, 16);
  assert.equal(wheels.length, 64);
  for (const [field, group] of groups.entries()) {
    const objects = group.parts.filter(p => p.kind === "addPrism" || p.kind === "addBox" && p.mat === Geom.MAT.METAL);
    for (const [i, object] of objects.entries()) {
      const s = field === 2 ? 0.805 : 0.735 + field * 0.045, base = object.kind === "addPrism" ? object.center : Geom.vadd(object.center, u, -1.25);
      assert.ok(Math.abs(base[0] - (62 + field * 12 + (i < 4 ? -10 : 10))) < 1e-9, "object X placement retained");
      assert.ok(Math.abs(base[2] - (Math.round(s * n) * 4 + t[2] * (i % 4 - 1.5) * 12)) < 1e-9, "object Z placement retained");
    }
  }
  for (const body of bodies) for (let i = 0; i < body.vertices.length; i += 3) {
    const vertex = body.vertices.slice(i, i + 3), delta = vertex.map((v, j) => v - body.center[j]);
    if (delta.reduce((sum, v, j) => sum + v * u[j], 0) > -1.24) continue;
    assert.ok(vertex[1] > ground(vertex[0], vertex[2]) + 0.1, "camper floor clears wheat tile top");
  }
  for (const wheel of wheels) {
    let gap = Infinity;
    for (let i = 0; i < wheel.vertices.length; i += 3) gap = Math.min(gap, wheel.vertices[i + 1] - ground(wheel.vertices[i], wheel.vertices[i + 2]));
    assert.ok(gap < 0, "tyre reaches the actual sloping ground");
    assert.ok(bodies.some(body => Math.abs(wheel.center[2] - body.center[2]) < 2 && Math.abs(wheel.center[0] - body.center[0]) < 2
      && wheel.center[1] + 0.3 >= body.center[1] - 1.25 * u[1]), "tyre shoulder reaches chassis");
  }
  for (const group of groups) for (const part of group.parts) for (let i = 0; i < part.vertices.length; i += 3) {
    const d = part.vertices.slice(i, i + 3).map((v, j) => v - group.bounds.center[j]);
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(d.reduce((sum, v, j) => sum + v * group.bounds.basis[axis][j], 0)) <= group.bounds.size[axis] / 2 + 1e-9, "all running gear fits declared field envelope");
  }
  assert.equal(flags.length, 9); assert.equal(poles.length, 9);
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i], pole = poles[i], delta = flag.center.map((v, j) => v - pole.center[j]);
    const along = delta.reduce((sum, v, j) => sum + v * t[j], 0);
    assert.ok(Math.abs(along - flag.size[2] / 2) < pole.radius, "cloth sleeve meets mast");
  }
});
