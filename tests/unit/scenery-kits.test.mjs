import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs").PATHS;
function load(file, name, globals = {}) {
  const sandbox = { console, Math, Array, Object, Number, Map, Set, ...globals };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "js/core/log.js"), "utf8").replace(/^const\b/gm, "var"),
    ctx, { filename: "js/core/log.js" },
  );
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, ctx, { filename: file });
  return sandbox[name];
}

test("SceneryThemes resolves named themes and track overrides", () => {
  const Themes = load(P.SCENERY_THEMES, "SceneryThemes");
  const theme = Themes.resolve("desert", {
    palette: { accent: [1, 0, 0] },
    budgets: { facility: 12000 },
  }, { night: true });
  assert.equal(theme.name, "desert");
  assert.deepEqual(theme.palette.accent, [1, 0, 0]);
  assert.equal(theme.budgets.hero, 50000);
  assert.equal(theme.budgets.facility, 12000);
  assert.ok(theme.palette.window.every(Number.isFinite));
});

test("SceneryThemes resolves neutral defaults and unknown themes fall back to neutral", () => {
  const Themes = load(P.SCENERY_THEMES, "SceneryThemes");
  const neutral = Themes.resolve();
  const unknown = Themes.resolve("not-a-theme");

  assert.equal(neutral.name, "neutral");
  assert.equal(neutral.spacing.furniture, 80);
  assert.equal(neutral.budgets.hero, 50000);
  assert.deepEqual(unknown, neutral);
});

test("SceneryThemes exposes only the immutable public operations", () => {
  const Themes = load(P.SCENERY_THEMES, "SceneryThemes");

  assert.deepEqual(Object.keys(Themes).sort(), ["resolve", "variant"]);
  assert.equal(Themes.THEMES, undefined);
});

test("SceneryThemes variant selection is stable and bounded", () => {
  const Themes = load(P.SCENERY_THEMES, "SceneryThemes");
  const choices = ["flat", "sawtooth", "cantilever"];
  const first = Themes.variant("spa", "pit-roof", 3, choices);
  assert.equal(first, Themes.variant("spa", "pit-roof", 3, choices));
  assert.ok(choices.includes(first));
});

function landmarkHarness(overrides = {}) {
  const emitted = [];
  const primitives = {};
  for (const kind of ["box", "prism", "cylinder"]) {
    primitives[kind] = (stage, center, ...args) => {
      emitted.push({ kind, stage, center, args });
      return true;
    };
  }
  Object.assign(primitives, overrides);
  const LandmarkKit = load(P.LANDMARK_KIT, "LandmarkKit");
  return { emitted, kit: LandmarkKit.create(primitives) };
}

const LANDMARK_SPECS = {
  roof: {
    kind: "cantilever", center: [0, 8, 0], size: [14, 1, 30],
  },
  facade: {
    kind: "glazed", center: [0, 5, 0], size: [1, 10, 30], bays: 6,
  },
  tower: {
    kind: "lattice", center: [0, 12, 0], size: [8, 24, 8], levels: 4,
  },
  stadiumSection: {
    center: [0, 6, 0], size: [30, 12, 18], rows: 8,
  },
  arch: {
    center: [0, 5, 0], size: [12, 10, 2], postWidth: 1.2,
  },
  canopy: {
    center: [0, 5, 0], size: [16, 10, 12],
  },
};

test("LandmarkKit emits all six finite forms only into the caller stage", () => {
  const { emitted, kit } = landmarkHarness();
  const stage = { id: "caller-owned" };

  for (const [method, spec] of Object.entries(LANDMARK_SPECS))
    assert.equal(kit[method](stage, spec), true, method);

  assert.deepEqual(Object.keys(kit).sort(), Object.keys(LANDMARK_SPECS).sort());
  assert.ok(emitted.length > 6);
  assert.ok(emitted.length <= 40);
  assert.ok(emitted.every((entry) => entry.stage === stage));
  assert.ok(emitted.every((entry) =>
    entry.center.every(Number.isFinite) &&
    entry.args.flat(Infinity).filter((value) => typeof value === "number")
      .every(Number.isFinite)));
});

test("LandmarkKit uses a prism for sawtooth roofs", () => {
  const { emitted, kit } = landmarkHarness();

  assert.equal(kit.roof({}, {
    kind: "sawtooth", center: [0, 8, 0], size: [14, 1, 30],
  }), true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].kind, "prism");
});

test("LandmarkKit rejects invalid and non-finite specs without emission", () => {
  const { emitted, kit } = landmarkHarness();
  const invalid = [
    null,
    {},
    { center: [0, 0], size: [1, 1, 1] },
    { center: [0, NaN, 0], size: [1, 1, 1] },
    { center: [0, 0, 0], size: [1, Infinity, 1] },
    { center: [0, 0, 0], size: [1, 0, 1] },
    { center: [0, 0, 0], size: [-1, 1, 1] },
  ];

  for (const method of Object.keys(LANDMARK_SPECS)) {
    assert.equal(kit[method](null, LANDMARK_SPECS[method]), false, `${method}: stage`);
    for (const spec of invalid)
      assert.equal(kit[method]({}, spec), false, method);
  }
  assert.equal(emitted.length, 0);
});

test("LandmarkKit rejects excessive repeated counts without emission", () => {
  const { emitted, kit } = landmarkHarness();

  assert.equal(kit.facade({}, {
    center: [0, 5, 0], size: [1, 10, 30], bays: 25,
  }), false);
  assert.equal(kit.facade({}, {
    center: [0, 5, 0], size: [1, 10, 30], bays: Infinity,
  }), false);
  assert.equal(kit.tower({}, {
    center: [0, 12, 0], size: [8, 24, 8], levels: 13,
  }), false);
  assert.equal(kit.tower({}, {
    center: [0, 12, 0], size: [8, 24, 8], levels: NaN,
  }), false);
  assert.equal(kit.stadiumSection({}, {
    center: [0, 6, 0], size: [30, 12, 18], rows: 17,
  }), false);
  assert.equal(kit.stadiumSection({}, {
    center: [0, 6, 0], size: [30, 12, 18], rows: -1,
  }), false);
  assert.equal(emitted.length, 0);
});

test("LandmarkKit caps worst-case bounded emission", () => {
  const { emitted, kit } = landmarkHarness();
  const stage = {};

  assert.equal(kit.roof(stage, LANDMARK_SPECS.roof), true);
  assert.equal(kit.facade(stage, {
    ...LANDMARK_SPECS.facade, bays: 24,
  }), true);
  assert.equal(kit.tower(stage, {
    ...LANDMARK_SPECS.tower, levels: 12,
  }), true);
  assert.equal(kit.stadiumSection(stage, {
    ...LANDMARK_SPECS.stadiumSection, rows: 16,
  }), true);
  assert.equal(kit.arch(stage, LANDMARK_SPECS.arch), true);
  assert.equal(kit.canopy(stage, LANDMARK_SPECS.canopy), true);
  // canopy emits 3 (mast cylinder + peaked-roof prism + valance box), up from 2
  assert.equal(emitted.length, 59);
});

test("LandmarkKit stops and reports primitive callback failures", () => {
  for (const method of Object.keys(LANDMARK_SPECS)) {
    let calls = 0;
    const fail = () => {
      calls++;
      return false;
    };
    const { kit } = landmarkHarness({
      box: fail,
      prism: fail,
      cylinder: fail,
    });

    assert.equal(kit[method]({}, LANDMARK_SPECS[method]), false, method);
    assert.equal(calls, 1, method);
  }

  let calls = 0;
  const { kit } = landmarkHarness({
    box() {
      calls++;
      return calls !== 2;
    },
  });
  assert.equal(kit.facade({}, LANDMARK_SPECS.facade), false);
  assert.equal(calls, 2);

  const sawtooth = landmarkHarness({ prism: () => false });
  assert.equal(sawtooth.kit.roof({}, {
    ...LANDMARK_SPECS.roof, kind: "sawtooth",
  }), false);

  calls = 0;
  const canopy = landmarkHarness({
    cylinder() {
      calls++;
      return true;
    },
    box() {
      calls++;
      return false;
    },
  });
  assert.equal(canopy.kit.canopy({}, LANDMARK_SPECS.canopy), false);
  assert.equal(calls, 2);
});

const CIRCUIT_METHODS = [
  "pitBuilding", "hospitality", "raceControl", "pedestrianBridge",
  "cameraCrane", "marshalShelter", "recoveryBay", "serviceCompound",
  "trackSigns",
];
const NON_OVERHEAD_METHODS = CIRCUIT_METHODS.filter(
  (method) => method !== "pedestrianBridge",
);
const CIRCUIT_BUDGETS = {
  pitBuilding: 25000,
  hospitality: 25000,
  raceControl: 50000,
  cameraCrane: 10000,
  marshalShelter: 10000,
  recoveryBay: 10000,
  serviceCompound: 25000,
  trackSigns: 10000,
};

function circuitHarness(overrides = {}) {
  const calls = { groups: [], overhead: [], boxes: [], landmarks: [] };
  const models = {
    modelGroup(id, bounds, emit, options) {
      const stage = { id };
      calls.groups.push({ id, bounds, options, stage });
      return emit(stage) !== false;
    },
    overheadSpan(spec) {
      calls.overhead.push(spec);
      return true;
    },
    box(stage, center, size, color, basis) {
      calls.boxes.push({ stage, center, size, color, basis });
      return true;
    },
  };
  const landmarks = {};
  for (const method of ["roof", "facade", "tower", "canopy"]) {
    landmarks[method] = (stage, spec) => {
      calls.landmarks.push({ method, stage, spec });
      return true;
    };
  }
  const deps = {
    models,
    landmarks,
    theme: {
      palette: {
        shell: [0.5, 0.5, 0.5],
        roof: [0.2, 0.2, 0.2],
        glass: [0.25, 0.4, 0.6],
        accent: [0.8, 0.1, 0.15],
        service: [0.7, 0.72, 0.75],
      },
      variants: { roof: ["flat"] },
      budgets: { hero: 50000, facility: 25000, repeated: 10000 },
    },
    frameAt: () => ({
      // k included per the real producer contract: tracks.js frameAt always
      // supplies the node index, and placement() rejects a frame without one
      // (groundHeight takes a node index — a raw lap fraction is not a
      // usable fallback).
      k: 40,
      c: [10, 2, 20],
      r: [1, 0, 0],
      u: [0, 1, 0],
      t: [0, 0, 1],
      hw: 6,
    }),
    groundHeight: () => 2,
    hash: () => 0,
  };
  Object.assign(deps, overrides);
  if (overrides.models) deps.models = Object.assign(models, overrides.models);
  if (overrides.landmarks)
    deps.landmarks = Object.assign(landmarks, overrides.landmarks);
  const CircuitKit = load(P.CIRCUIT_KIT, "CircuitKit");
  return { calls, kit: CircuitKit.create(deps) };
}

function circuitSpec(id, extra = {}) {
  return { id, frac: 0.25, side: 1, gap: 8, ...extra };
}

test("structured shelters keep the roof, columns and recessed panels inside rotated bounds", () => {
  const angle = .63, r = [Math.cos(angle), 0, Math.sin(angle)], t = [-r[2], 0, r[0]];
  for (const side of [-1, 1]) {
    const { calls, kit } = circuitHarness({ frameAt: () => ({ k: 40,
      c: [10, 2, 20], r, u: [0, 1, 0], t, hw: 6 }) });
    assert.equal(kit.marshalShelter(circuitSpec("structured", {
      side, size: [5, 3.2, 5], detail: "structure" })), true);
    assert.equal(calls.boxes.length, 8);
    assert.equal(calls.landmarks.length, 0);
    const { bounds, stage } = calls.groups[0];
    for (const part of calls.boxes) {
      assert.equal(part.stage, stage);
      for (let axis = 0; axis < 3; axis++) {
        const b = bounds.basis[axis];
        const delta = part.center.map((v, i) => v - bounds.center[i]);
        const offset = delta.reduce((v, d, i) => v + d * b[i], 0);
        assert.ok(Math.abs(offset) + part.size[axis] / 2 <= bounds.size[axis] / 2 + 1e-9);
      }
    }
  }
});

test("textured ground patches drape on terrain and restore the caller material", () => {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Models = load("js/track/scenery/models.js", "TrackModels", { TrackGeom: Geom });
  for (const material of [undefined, Geom.MAT.ROCK, NaN, 999, "10"]) {
    const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: Geom.MAT.METAL };
    const track = { n: 1, rx: [1], ry: [0], rz: [0], tx: [0], ty: [0], tz: [1] };
    const models = Models.create({ out, track, n: 1, px: [0], pz: [0], hw: [7],
      rails: [2.2, 7, 14], groundHeight: (_, d) => -d * .1,
      terrainY: (x, z) => -.1 * (x - 7) + .02 * z,
      emitFace: Geom.emit, preflight: () => true });
    assert.equal(models.groundPatch({ k: 0, side: 1, gap: 2.2, size: [3, .08, 8],
      color: [.68, .62, .49], material }), true);
    assert.equal(out._mat, Geom.MAT.METAL);
    assert.ok(out.pos.length > 0 && out.pos.every(Number.isFinite));
    const expected = material === Geom.MAT.ROCK ? Geom.MAT.ROCK : Geom.MAT.FLAT;
    assert.ok(out.mat.every(value => value === expected));
    assert.ok(out.pos.some((v, i) => i % 3 === 1 && v < -.2));
  }
});

test("CircuitKit exposes all nine infrastructure facilities", () => {
  const { kit } = circuitHarness();
  assert.deepEqual(Object.keys(kit).sort(), [...CIRCUIT_METHODS].sort());
});

test("CircuitKit routes each complete facility through one atomic model group", () => {
  const { calls, kit } = circuitHarness();
  const specs = {
    pitBuilding: { garages: 4 },
    hospitality: { modules: 3 },
    raceControl: {},
    cameraCrane: {},
    marshalShelter: {},
    recoveryBay: {},
    serviceCompound: { vehicles: 3 },
    trackSigns: { count: 4 },
  };

  for (const method of NON_OVERHEAD_METHODS) {
    const beforeGroups = calls.groups.length;
    const beforeBoxes = calls.boxes.length;
    const beforeLandmarks = calls.landmarks.length;
    assert.equal(kit[method](circuitSpec(`kit:${method}`, specs[method])), true, method);
    assert.equal(calls.groups.length, beforeGroups + 1, method);
    const group = calls.groups.at(-1);
    assert.equal(group.id, `kit:${method}`);
    assert.equal(group.options.maxVertices, CIRCUIT_BUDGETS[method]);
    assert.equal(group.options.kind, method);
    assert.equal(group.options.required, false);
    assert.ok(group.bounds.center.every(Number.isFinite), method);
    assert.ok(group.bounds.size.every((value) => Number.isFinite(value) && value > 0), method);
    assert.ok(calls.boxes.slice(beforeBoxes).every(
      (entry) => entry.stage === group.stage,
    ), method);
    assert.ok(calls.landmarks.slice(beforeLandmarks).every(
      (entry) => entry.stage === group.stage,
    ), method);
  }
});

test("CircuitKit computes finite world bounds from side, gap, and size", () => {
  const { calls, kit } = circuitHarness();
  assert.equal(kit.hospitality(circuitSpec("hospitality", {
    side: -1,
    gap: 10,
    size: [12, 8, 30],
  })), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.groups[0].bounds)), {
    center: [-12, 6, 20],
    size: [12, 8, 30],
    basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  });
});

test("CircuitKit delegates pedestrian bridges once with safe clearance", () => {
  const { calls, kit } = circuitHarness();
  assert.equal(kit.pedestrianBridge(circuitSpec("bridge", {
    clearance: 4.8,
    span: 22,
  })), true);
  assert.equal(calls.overhead.length, 1);
  assert.equal(calls.groups.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.overhead[0])), {
    id: "bridge",
    frac: 0.25,
    clearance: 4.8,
    minimumClearance: 4.8,
    span: 22,
    thickness: 0.9,
    depth: 2,
    color: [0.5, 0.5, 0.5],
    required: false,
  });
  assert.equal(kit.pedestrianBridge(circuitSpec("low", {
    clearance: 4.799,
  })), false);
  assert.equal(calls.overhead.length, 1);
});

test("CircuitKit accepts bounded maximum repeated counts", () => {
  for (const [method, field, maximum] of [
    ["pitBuilding", "garages", 24],
    ["hospitality", "modules", 12],
    ["serviceCompound", "vehicles", 16],
    ["trackSigns", "count", 64],
  ]) {
    const { calls, kit } = circuitHarness();
    assert.equal(kit[method](circuitSpec(method, { [field]: maximum })), true, method);
    assert.equal(calls.groups.length, 1, method);
    // One-hall pit facade: door + lintel + pillar per bay, plus hall/glass/canopy/roof.
    const cap = method === "pitBuilding" ? maximum * 3 + 8 : maximum + 4;
    assert.ok(calls.boxes.length + calls.landmarks.length <= cap, method);
  }
});

test("CircuitKit rejects invalid and excessive repeated counts before staging", () => {
  for (const [method, field, maximum] of [
    ["pitBuilding", "garages", 24],
    ["hospitality", "modules", 12],
    ["serviceCompound", "vehicles", 16],
    ["trackSigns", "count", 64],
  ]) {
    for (const value of [0, -1, maximum + 1, NaN, Infinity, "bad"]) {
      const { calls, kit } = circuitHarness();
      assert.equal(kit[method](circuitSpec(method, { [field]: value })), false,
        `${method}: ${String(value)}`);
      assert.equal(calls.groups.length, 0, method);
    }
  }
});

test("CircuitKit rejects missing IDs and invalid fractions without throwing", () => {
  for (const method of CIRCUIT_METHODS) {
    const { calls, kit } = circuitHarness();
    for (const spec of [
      null,
      {},
      circuitSpec(""),
      circuitSpec("   "),
      circuitSpec(method, { frac: NaN }),
      circuitSpec(method, { frac: Infinity }),
      circuitSpec(method, { frac: -0.01 }),
      circuitSpec(method, { frac: 1.01 }),
    ]) {
      assert.doesNotThrow(() => assert.equal(kit[method](spec), false), method);
    }
    assert.equal(calls.groups.length + calls.overhead.length, 0, method);
  }
});

test("CircuitKit rejects invalid placement and dimensions before model routing", () => {
  for (const method of NON_OVERHEAD_METHODS) {
    for (const changes of [
      { side: 0 },
      { side: 2 },
      { side: NaN },
      { gap: -1 },
      { gap: Infinity },
      { size: [1, 2] },
      { size: [1, 0, 3] },
      { size: [1, -2, 3] },
      { size: [1, NaN, 3] },
      { size: [1, 2, Infinity] },
    ]) {
      const { calls, kit } = circuitHarness();
      assert.equal(kit[method](circuitSpec(method, changes)), false, method);
      assert.equal(calls.groups.length, 0, method);
    }
  }
});

test("CircuitKit rejects missing and non-finite frames before model routing", () => {
  const frames = [
    null,
    {},
    { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] },
    { c: [NaN, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 6 },
    { c: [0, 0, 0], r: [1, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 6 },
    { c: [0, 0, 0], r: [1, 0, 0], u: [0, Infinity, 0], t: [0, 0, 1], hw: 6 },
    { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, NaN], hw: 6 },
    { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: Infinity },
    { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: -1 },
  ];
  for (const method of NON_OVERHEAD_METHODS) {
    for (const frame of frames) {
      const { calls, kit } = circuitHarness({ frameAt: () => frame });
      assert.equal(kit[method](circuitSpec(method)), false, method);
      assert.equal(calls.groups.length, 0, method);
    }
  }
  const throwing = circuitHarness({
    frameAt() {
      throw new Error("frame failed");
    },
  });
  assert.doesNotThrow(() =>
    assert.equal(throwing.kit.pitBuilding(circuitSpec("pit")), false));
});

test("CircuitKit propagates model and landmark helper failures without throwing", () => {
  for (const method of NON_OVERHEAD_METHODS) {
    const rejected = circuitHarness({
      models: { modelGroup: () => false },
    });
    assert.equal(rejected.kit[method](circuitSpec(method)), false, method);

    const throwing = circuitHarness({
      models: {
        modelGroup() {
          throw new Error("model failure");
        },
      },
    });
    assert.doesNotThrow(() =>
      assert.equal(throwing.kit[method](circuitSpec(method)), false), method);
  }

  const modelPrimitive = circuitHarness({
    models: { box: () => false },
  });
  assert.equal(modelPrimitive.kit.serviceCompound(
    circuitSpec("compound", { vehicles: 2 }),
  ), false);

  const landmark = circuitHarness({
    landmarks: { tower: () => false },
  });
  assert.equal(landmark.kit.raceControl(circuitSpec("control")), false);

  const bridge = circuitHarness({
    models: {
      overheadSpan() {
        throw new Error("overhead failure");
      },
    },
  });
  assert.doesNotThrow(() =>
    assert.equal(bridge.kit.pedestrianBridge(circuitSpec("bridge")), false));
});

test("CircuitKit fails closed when dependencies are missing or invalid", () => {
  const CircuitKit = load(P.CIRCUIT_KIT, "CircuitKit");
  for (const deps of [undefined, null, {}, { models: {}, landmarks: {}, theme: {} }]) {
    const kit = CircuitKit.create(deps);
    for (const method of CIRCUIT_METHODS) {
      assert.doesNotThrow(() =>
        assert.equal(kit[method](circuitSpec(method)), false), method);
    }
  }
});

function venueHarness({ excluded = false, occupied = false, barrier = false, terrain = () => 0, road = false, shift = 0 } = {}) {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Models = load("js/track/scenery/models.js", "TrackModels");
  const Venue = load("js/track/scenery/venue.js", "SceneryVenue", {
    TrackGeom: Geom, TrackSpace: { sceneryOriginDelta: () => shift },
  });
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
  const diagnostics = { emitted: [], suppressed: [], invalid: [], unsafe: [] };
  const reservations = [], notes = [];
  const track = { barL: Array(100).fill(12), barR: Array(100).fill(12) };
  const ctx = {
    out, track, def: {}, n: 100, ds: 40, hw: Array(100).fill(6),
    anchor: (k, side, dist) => ({ c: [side * (6 + dist), 0, k * 40], r: [1, 0, 0], t: [0, 0, 1] }),
    terrainYAt: terrain, barrierClear: () => !barrier, massBlocked: () => occupied,
    massAdd: (...args) => reservations.push(args), indexSolidAt: () => {},
    RAW: Geom, MAT: Geom.MAT, note: (...args) => notes.push(args),
    models: Models.create({ out, diagnostics, emitBox: Geom.addBox, preflight: () => !road }),
  };
  const facilities = Venue.build(ctx, null, () => excluded);
  return { facilities, out, track, diagnostics, reservations, notes };
}

test("venue facilities are deterministic, bounded, finite and preserve driving limits", () => {
  const a = venueHarness(), b = venueHarness();
  assert.deepEqual(Array.from(a.facilities, (f) => f.kind),
    ["marshalShelter", "recoveryTruck", "concessionBooth", "serviceAwning", "medicalVan", "spectatorShade"]);
  assert.equal(JSON.stringify(a.out), JSON.stringify(b.out));
  assert.equal(a.reservations.length, 6);
  assert.equal(a.notes.length, 6);
  assert.deepEqual(Array.from(a.facilities, (f) => f.k), [10, 27, 43, 60, 77, 93]);
  assert.ok(a.notes.every(([, center, size]) => center.every(Number.isFinite) && Array.isArray(size) && size.length === 3 && size.every(Number.isFinite)));
  assert.ok(a.out.pos.every(Number.isFinite));
  assert.ok(a.diagnostics.emitted.every((d) => d.vertices <= 288));
  assert.equal(a.diagnostics.invalid.length, 0);
  assert.equal(a.diagnostics.unsafe.length, 0);
  assert.equal((a.diagnostics.escaped || []).length, 0);
  assert.deepEqual(a.track.barL, Array(100).fill(12));
  assert.deepEqual(a.track.barR, Array(100).fill(12));
  const shifted = venueHarness({ shift: 0.25 });
  assert.deepEqual(Array.from(shifted.facilities, (f) => f.k), Array.from(a.facilities, (f) => (f.k + 25) % 100));
});

test("venue guards reject excluded, occupied, fenced, unknown, steep and on-road sites atomically", () => {
  for (const options of [{ excluded: true }, { occupied: true }, { barrier: true },
                         { terrain: () => null }, { terrain: (x) => x }, { road: true }]) {
    const r = venueHarness(options);
    assert.equal(r.facilities.length, 0);
    assert.equal(r.out.pos.length, 0);
    assert.equal(r.reservations.length, 0);
    assert.equal(r.notes.length, 0);
    assert.equal(r.diagnostics.suppressed.length, 0,
      "venue site search must not pin suppressed ids for rejected probes");
  }
});

test("fence footings reach terrain or the universal floor without moving tilted panel tops", () => {
  function fenceFixture(terrain, floorY) {
    const Geom = load("js/track/core/geom.js", "TrackGeom");
    const Structures = load("js/track/scenery/structures.js", "SceneryStructures", {
      TrackSceneryData: {}, Tracks: { terrainY: () => terrain }, M4: { vadd: Geom.vadd },
    });
    const u = [0.08, Math.sqrt(1 - 0.08 ** 2), 0], r = [u[1], -u[0], 0], t = [0, 0, 1];
    const records = [];
    const track = { surface: { floorY } };
    const ctx = {
      out: {}, track, def: {}, n: 100, ds: 1, hw: [], px: [], py: [], pz: [], MAT: {},
      kitOf: () => "chainlink", indexBarrier: () => {}, noteSpan: () => {},
      noteSuppressed: () => {}, onTrack: () => false,
      anchor: () => ({ c: [0, 4, 0], r, u, t }), vadd: Geom.vadd,
      instance: (key, placement, build) => {
        const ops = [];
        build({ cyl: (...args) => ops.push(["cyl", ...args]), box: (...args) => ops.push(["box", ...args]) });
        records.push({ key, placement, ops });
      },
    };
    Structures.create(ctx).fence(0, 0, 1, 3, 3.4, [0.6, 0.7, 0.8]);
    return { post: records[0], panel: records[1], u };
  }
  const nominal = fenceFixture(4, -6), extended = fenceFixture(-2, -6);
  const floor = fenceFixture(null, -6), unknown = fenceFixture(null, undefined);
  const top = (r) => r.post.placement.o.map((v, i) => v + r.u[i] * r.post.placement.s[1]);
  for (const fixture of [extended, floor]) {
    top(fixture).forEach((v, i) => assert.ok(Math.abs(v - top(nominal)[i]) < 1e-10));
    assert.equal(JSON.stringify(fixture.panel), JSON.stringify(nominal.panel));
    assert.equal(fixture.post.key, nominal.post.key, "variable footings share one model template");
  }
  assert.ok(Math.abs(extended.post.placement.o[1] + 2) < 1e-10);
  assert.ok(Math.abs(floor.post.placement.o[1] + 6) < 1e-10);
  assert.equal(JSON.stringify(unknown), JSON.stringify(nominal));
});

function spectatorHillFixture(radius = 64, jitter = 0.25, orphaned = false) {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Nature = load("js/track/scenery/nature.js", "SceneryNature", {
    TrackGeom: Geom, TrackGraph: { NODE_COLOR: [1, 1, 1] },
    TrackSceneryData: { CROWD_DAY: [[1, 1, 1]] },
  });
  const n = 100, ds = Math.PI * 2 * radius / n;
  const track = { rx: [], ry: [], rz: [], tx: [], ty: [], tz: [] }, px = [], pz = [];
  for (let k = 0; k < n; k++) {
    const angle = k * Math.PI * 2 / n;
    px.push(radius * Math.cos(angle)); pz.push(radius * Math.sin(angle));
    track.rx.push(-Math.cos(angle)); track.ry.push(0); track.rz.push(-Math.sin(angle));
    track.tx.push(-Math.sin(angle)); track.ty.push(0); track.tz.push(Math.cos(angle));
  }
  const boxes = [], spectators = [], footings = [];
  Nature.create({
    out: {}, track, n, ds, hw: Array(n).fill(6), px, py: Array(n).fill(0), pz,
    def: {}, MAT: {}, vadd: Geom.vadd, norm: Geom.norm, hash: () => jitter,
    terrainYAt: () => 0, upOf: () => [0, 1, 0], bankOffsetAt: () => 0,
    indexSolid: () => {}, rejBox: (center, size) => orphaned && size[0] > 1 && center[1] < 1.7,
    along: (a, b, step, fn) => { fn(25, ds * 2); fn(27, ds * 2); },
    addBox: (out, center, size, color, basis) => boxes.push({ center, size, basis }),
    instance: (key, placement) => (key === "spectator-hill-footing" ? footings : spectators).push(placement),
  }).spectatorHill(0.25, 0.27, 1, 24, { rows: 3, rise: 1.1, depth: 1.9, step: 8, density: 1 });
  return { boxes, spectators, footings };
}

test("orphaned upper spectator treads retain crowds on ground-reaching piers within their footprint", () => {
  const { boxes, spectators, footings } = spectatorHillFixture(64, 0.25, true);
  assert.equal(boxes.length, 2, "both upper treads remain");
  assert.equal(spectators.length, 8, "all spectators on the retained rows remain");
  assert.equal(footings.length, 2, "one pier per unsupported island");
  for (let i = 0; i < boxes.length; i++) {
    const tread = boxes[i], pier = footings[i];
    const lower = pier.o[1] - pier.s[1] / 2, upper = pier.o[1] + pier.s[1] / 2;
    assert.ok(lower < 0, "pier enters actual ground");
    assert.ok(upper >= tread.center[1] - tread.size[1] / 2, "pier reaches tread underside");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const dx = pier.o[0] + sx * pier.s[0] / 2 * pier.r[0] + sz * pier.s[2] / 2 * pier.t[0] - tread.center[0];
      const dz = pier.o[2] + sx * pier.s[0] / 2 * pier.r[2] + sz * pier.s[2] / 2 * pier.t[2] - tread.center[2];
      assert.ok(Math.abs(dx * tread.basis[0][0] + dz * tread.basis[0][2]) < tread.size[0] / 2);
      assert.ok(Math.abs(dx * tread.basis[2][0] + dz * tread.basis[2][2]) < tread.size[2] / 2);
    }
  }
  assert.equal(spectatorHillFixture().footings.length, 0, "ordinary complete banks need no added piers");
});

test("inside-bend terrace treads meet separating planes and retain every spectator", () => {
  const { boxes, spectators } = spectatorHillFixture();
  assert.equal(boxes.length, 6, "every terrace row remains");
  assert.equal(spectators.length, 24, "every authored spectator remains");
  for (let row = 0; row < 3; row++) {
    const a = boxes[row], b = boxes[row + 3];
    const delta = a.center.map((v, i) => b.center[i] - v), distance = Math.hypot(...delta);
    const support = (box) => box.basis.reduce((s, axis, j) => s + box.size[j] / 2 * Math.abs(axis.reduce((d, v, i) => d + v * delta[i], 0)) / distance, 0);
    assert.ok(support(a) + support(b) <= distance + 1e-9, "rotated neighbouring solids do not overlap");
    assert.ok(a.size[2] > 3 && b.size[2] > 3, "the occupied inside verge controls the chord span");
  }
});

test("short terrace chords support the entire crowd footprint at both jitter extremes", () => {
  // Independent box SAT: face normals and pairwise edge cross-products,
  // rather than the emitter's neighbour-bisector calculation.
  const separated = (a, b) => {
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const axes = [...a.basis, ...b.basis, ...a.basis.flatMap(u => b.basis.map(v => cross(u, v)))];
    const delta = b.center.map((v, i) => v - a.center[i]);
    return axes.some(axis => {
      const length = Math.hypot(...axis);
      if (length < 1e-10) return false;
      const dot = v => v.reduce((sum, x, i) => sum + x * axis[i], 0) / length;
      const support = box => box.basis.reduce((sum, v, i) => sum + box.size[i] / 2 * Math.abs(dot(v)), 0);
      return Math.abs(dot(delta)) >= support(a) + support(b) - 1e-9;
    });
  };
  for (const jitter of [0, 1]) {
    const { boxes, spectators } = spectatorHillFixture(38, jitter);
    assert.ok(spectators.length > 0 && spectators.length < 24, "short rows retain only whole bodies that fit");
    for (const p of spectators) {
      assert.ok(boxes.some(box => {
        const delta = p.o.map((v, i) => v - box.center[i]);
        const dot = axis => axis.reduce((sum, v, i) => sum + v * delta[i], 0);
        return Math.abs(dot(box.basis[0])) + 0.25 <= box.size[0] / 2 - 0.03 + 1e-9
          && Math.abs(dot(box.basis[2])) + 0.23 <= box.size[2] / 2 - 0.03 + 1e-9
          && dot(box.basis[1]) - p.s[1] / 2 <= box.size[1] / 2 + 1e-9
          && dot(box.basis[1]) + p.s[1] / 2 >= box.size[1] / 2;
      }), "body, not just its centre, rests inside a tread");
    }
    for (const radius of [32.2, 30.017]) {
      const narrow = spectatorHillFixture(radius, jitter);
      assert.equal(narrow.spectators.length, 0, "narrow treads cannot carry a 46 cm body");
      assert.ok(narrow.boxes.length > 0 && narrow.boxes.length < 6, "retain positive spans and omit unplaceable rows");
      assert.ok(narrow.boxes.some(box => box.size[2] > 0 && box.size[2] < 0.25), "no minimum length may exceed the allowed span");
      for (let i = 0; i < narrow.boxes.length; i++) for (let j = i + 1; j < narrow.boxes.length; j++)
        assert.ok(separated(narrow.boxes[i], narrow.boxes[j]), `short terrace solids ${i}/${j} intersect at radius ${radius}`);
    }
  }
});

test("Sector M fascia attaches to track-facing walls and canopy fits its declared envelope", () => {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const circuits = load("js/circuits/scenery/interlagos.js", "TrackScenery");
  const n = 100, parts = [], stage = {}, anchors = [];
  let spec;
  const api = new Proxy({
    n, px: Array(n).fill(0), pz: Array(n).fill(0), pyMin: 0, out: {}, MAT: Geom.MAT,
    K: s => Math.round(s * n) % n, hash: () => 0.25, onTrack: () => false,
    vadd: Geom.vadd, groundYAt: () => 0, terrainYAt: () => 0,
    lapBounds: () => ({ cx: 0, cz: 0 }),   // the São Paulo bowl ring centres on it
    anchor: (k, side, gap) => {
      anchors.push({ k, side, gap });
      return { c: [side * (6 + gap), 0, k * 4], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] };
    },
    seat: new Proxy({}, { get: () => () => {} }),
    modelGroup: (id, box, build) => { if (id === "interlagos-main-tribuna") { spec = box; build(stage); } return true; },
    addBox: (out, center, size, color) => { if (out === stage) parts.push({ center, size, color }); },
  }, { get: (target, name) => name in target ? target[name] : () => {} });
  circuits.interlagos(api);
  assert.equal(parts.length, 5, "all authored facade parts remain");
  const [lower, upper, yellow, green, canopy] = parts;
  assert.ok(anchors.some(a => a.k === 1 && a.side === -1 && a.gap === 62));
  for (const [wall, band] of [[lower, yellow], [upper, green]]) {
    const face = wall.center[0] + wall.size[0] / 2;
    assert.ok(band.center[0] - band.size[0] / 2 < face && band.center[0] + band.size[0] / 2 > face);
    for (const axis of [1, 2]) assert.ok(Math.abs(band.center[axis] - wall.center[axis]) + band.size[axis] / 2 <= wall.size[axis] / 2);
  }
  assert.equal(canopy.center[1] - canopy.size[1] / 2, upper.center[1] + upper.size[1] / 2);
  for (const part of parts) for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs(part.center[axis] - spec.center[axis]) + part.size[axis] / 2 <= spec.size[axis] / 2 + 1e-10,
      "every part fits the declared group envelope");
});

test("every bush form emits foliage and restores its caller material", () => {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Nature = load("js/track/scenery/nature.js", "SceneryNature", {
    TrackGeom: Geom, TrackSceneryData: {},
  });
  for (const form of ["clump", "grass", "agave"]) {
    for (const callerMat of [Geom.MAT.FLAT, Geom.MAT.METAL, Geom.MAT.FABRIC]) {
      const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: callerMat };
      let blocked = false;
      const nature = Nature.create({
        out, track: { rx: [1], ry: [0], rz: [0], tx: [0], ty: [0], tz: [1] },
        n: 1, ds: 4, hw: [6], px: [0], py: [0], pz: [0], def: {}, MAT: Geom.MAT,
        hash: () => 0.5, norm: Geom.norm, vadd: Geom.vadd,
        terrainYAt: () => 0, upOf: () => [0, 1, 0], bankOffsetAt: () => 0,
        onTrack: () => blocked, note: () => {}, noteSuppressed: () => {},
        addCone: Geom.addCone,
      });
      nature.bush(0, 1, 20, [0.2, 0.4, 0.2], { form });
      assert.ok(out.pos.length > 0, form);
      assert.equal(out.mat.length, out.pos.length / 3);
      assert.ok(out.mat.every(mat => mat === Geom.MAT.FOLIAGE), `${form}: foliage vertices`);
      assert.equal(out._mat, callerMat, `${form}: caller material restored`);
      const verts = out.pos.length;
      blocked = true;
      nature.bush(0, 1, 20, [0.2, 0.4, 0.2], { form });
      assert.equal(out.pos.length, verts, `${form}: no blocked emissions`);
      assert.equal(out._mat, callerMat, `${form}: suppressed call preserves material`);
    }
  }
});

function palmOccupancyHarness(blocked, fenced = false, terrain = () => 0) {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Nature = load("js/track/scenery/nature.js", "SceneryNature", {
    TrackGeom: Geom, TrackSceneryData: {},
  });
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
  const queries = [], notes = [], suppressed = [], pieces = [];
  const grade = 0.2, right = [0.8, 0, -0.6];
  const tangent = [0.6 * Math.cos(grade), -Math.sin(grade), 0.8 * Math.cos(grade)];
  const up = [0.6 * Math.sin(grade), Math.cos(grade), 0.8 * Math.sin(grade)];
  const ctx = {
    out, track: {}, def: { id: "palm-fixture" }, n: 100, ds: 4, hw: [],
    px: [], py: [], pz: [], NIGHT: false, MAT: Geom.MAT,
    hash: (seed) => { const v = Math.sin(seed * 12.9898) * 43758.5453; return v - Math.floor(v); },
    norm: Geom.norm, vadd: Geom.vadd, onTrack: () => false,
    barrierClear: () => !fenced,
    massBlocked: (center, width, depth, basis) => {
      queries.push({ center: Array.from(center), width, depth, basis });
      return blocked(center);
    },
    note: (...args) => notes.push(args), noteSuppressed: (...args) => suppressed.push(args),
    groundYAt: () => 0, terrainYAt: terrain, bankOffsetAt: () => 0,
  };
  for (const key of ["addBox", "addCyl", "addCone", "addFrustum", "addPrism", "addPyramid", "addMountain", "emit"]) ctx[key] = (buffer, ...args) => {
    const start = buffer.pos.length;
    const result = Geom[key](buffer, ...args);
    pieces.push(Array.from(buffer.pos.slice(start)));
    return result;
  };
  // Exercise Nature's real anchor with a sloping, rotated track frame.
  Object.assign(ctx.track, { rx: Array(100).fill(right[0]), ry: Array(100).fill(right[1]), rz: Array(100).fill(right[2]),
    tx: Array(100).fill(tangent[0]), ty: Array(100).fill(tangent[1]), tz: Array(100).fill(tangent[2]) });
  ctx.upOf = () => up;
  ctx.px = Array(100).fill(0); ctx.py = Array(100).fill(0); ctx.pz = Array(100).fill(0); ctx.hw = Array(100).fill(6);
  const complete = Nature.create(ctx);
  complete.palm(10, 1, 20, 12, [0.2, 0.4, 0.2]);
  return { out, queries, notes, suppressed, pieces, palm: complete.palm };
}

test("palm occupancy footprints contain every tilted trunk, crown and frond vertex", () => {
  const h = palmOccupancyHarness(() => false);
  assert.ok(h.out.pos.length > 0);
  assert.equal(h.queries.length, h.pieces.length);
  h.pieces.forEach((piece, index) => {
    const q = h.queries[index];
    for (let i = 0; i < piece.length; i += 3) {
      const dx = piece[i] - q.center[0], dz = piece[i + 2] - q.center[2];
      assert.ok(Math.abs(dx * q.basis[0][0] + dz * q.basis[0][2]) <= q.width / 2 + 1e-6 &&
        Math.abs(dx * q.basis[2][0] + dz * q.basis[2][2]) <= q.depth / 2 + 1e-6,
        `palm primitive ${index} vertex ${i / 3} escaped its tested footprint`);
    }
  });
});

test("palm occupancy moves to nearby clear ground and drops an entirely blocked tree atomically", () => {
  const moved = palmOccupancyHarness((center) => center[0] < 23);
  assert.ok(moved.queries.length > 1);
  assert.ok(moved.out.pos.length > 0);
  assert.equal(moved.notes.length, 1);
  assert.ok(moved.notes[0][3].dist > moved.notes[0][3].initialDist);
  for (const h of [palmOccupancyHarness(() => true), palmOccupancyHarness((center) => center[0] < 23, true)]) {
    assert.equal(h.out.pos.length, 0);
    assert.equal(h.notes.length, 0);
    assert.equal(h.suppressed.length, 1);
  }
});

test("palm relocation yields to already placed crowns and rejects hillside or unknown foliage sites", () => {
  const moved = palmOccupancyHarness((center) => center[0] < 23);
  let occupied = false;
  const prior = palmOccupancyHarness((center) => occupied && center[0] < 23);
  const originalVertices = prior.out.pos.length;
  occupied = true;
  prior.palm(10, 1, 20, 12, [0.2, 0.4, 0.2]);
  assert.ok(prior.notes.length === 1 || prior.notes[1][3].dist > moved.notes[0][3].dist,
    "a relocated crown cannot reuse space occupied by an authored palm");
  assert.ok(prior.out.pos.length >= originalVertices, "the authored palm is retained");
  let reverseOccupied = true;
  const reverse = palmOccupancyHarness((center) => reverseOccupied && center[0] < 23);
  reverseOccupied = false;
  reverse.palm(10, 1, 20, 12, [0.2, 0.4, 0.2]);
  assert.ok(reverse.notes.length === 1 || reverse.notes[1][3].dist > 20,
    "a later authored site yields when an earlier relocated palm owns its crown space");
  for (const terrain of [() => null, (x, z) => Math.abs(x * 0.6 + z * 0.8) > 0.2 ? 100 : 0]) {
    const rejected = palmOccupancyHarness((center) => center[0] < 23, false, terrain);
    assert.equal(rejected.out.pos.length, 0, "no partial tree remains on an invalid relocation");
    assert.equal(rejected.notes.length, 0);
    assert.equal(rejected.suppressed.length, 1);
  }
});

function treeClearanceHarness(occupied = () => false, options = {}, fenced = false) {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Nature = load("js/track/scenery/nature.js", "SceneryNature", { TrackGeom: Geom, TrackSceneryData: {} });
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
  const queries = [], notes = [], suppressed = [], pieces = [];
  const track = { rx: Array(100).fill(0.8), ry: Array(100).fill(0), rz: Array(100).fill(-0.6),
    tx: Array(100).fill(0.6), ty: Array(100).fill(0), tz: Array(100).fill(0.8),
    barL: Array(100).fill(12), barR: Array(100).fill(12) };
  const ctx = {
    out, track, def: {}, n: 100, ds: 4, hw: Array(100).fill(6),
    px: Array(100).fill(0), py: Array(100).fill(0), pz: Array(100).fill(0), MAT: Geom.MAT,
    vadd: Geom.vadd, norm: Geom.norm, upOf: () => [0, 1, 0], bankOffsetAt: () => 0,
    hash: () => 0.68, terrainYAt: () => 0, groundYAt: () => 0,
    onTrack: () => false, rejBox: () => false, barrierClear: () => !fenced,
    massBlocked: (center, width, depth, basis) => {
      queries.push({ center: Array.from(center), width, depth, basis });
      return occupied(center, width, depth, basis);
    },
    note: (...args) => notes.push(args), noteSuppressed: (...args) => suppressed.push(args),
  };
  for (const key of ["addCyl", "addCone", "addFrustum", "emit"]) ctx[key] = (buffer, ...args) => {
    const start = buffer.pos.length;
    const result = Geom[key](buffer, ...args);
    pieces.push(Array.from(buffer.pos.slice(start)));
    return result;
  };
  const tree = Nature.create(ctx).tree;
  tree(10, 1, 20, 12, [0.2, 0.4, 0.2], options);
  return { out, track, queries, notes, suppressed, pieces, tree };
}

test("broadleaf clearance covers actual round, vase, weeping, columnar and dead geometry", () => {
  for (const options of [{ crown: "round" }, { crown: "vase", spread: 1.4 }, { crown: "weeping" },
                         { crown: "columnar" }, { deadChance: 1 }]) {
    const h = treeClearanceHarness(() => false, options);
    assert.ok(h.out.pos.length > 0);
    for (const piece of h.pieces) assert.ok(h.queries.some((q) => {
      for (let i = 0; i < piece.length; i += 3) {
        const dx = piece[i] - q.center[0], dz = piece[i + 2] - q.center[2];
        if (Math.abs(dx * q.basis[0][0] + dz * q.basis[0][2]) > q.width / 2 + 1e-6 ||
            Math.abs(dx * q.basis[2][0] + dz * q.basis[2][2]) > q.depth / 2 + 1e-6) return false;
      }
      return true;
    }), "every emitted primitive fits an occupied-footprint query");
    assert.deepEqual(h.track.barL, Array(100).fill(12));
    assert.deepEqual(h.track.barR, Array(100).fill(12));
  }
});

test("broadleaf relocation preserves shape identity and rejection leaves no geometry or phantom planting", () => {
  for (const options of [{ crown: "round" }, { crown: "vase" }, { crown: "weeping" },
                         { crown: "columnar" }, { deadChance: 1 }]) {
    const clear = treeClearanceHarness(() => false, options);
    const moved = treeClearanceHarness((center) => center[0] < 24, options);
    assert.equal(moved.notes.length, 1);
    const delta = moved.notes[0][3].dist - clear.notes[0][3].dist;
    assert.ok(delta > 0 && delta <= 12);
    assert.equal(moved.out.pos.length, clear.out.pos.length);
    assert.deepEqual(moved.out.col, clear.out.col);
    assert.deepEqual(moved.out.mat, clear.out.mat);
    moved.out.pos.forEach((v, i) => assert.ok(Math.abs(v - clear.out.pos[i] - [0.8 * delta, 0, -0.6 * delta][i % 3]) < 1e-9));
  }
  let blocked = true;
  const rejected = treeClearanceHarness(() => blocked);
  assert.equal(rejected.out.pos.length, 0);
  assert.equal(rejected.notes.length, 0);
  assert.equal(rejected.suppressed.length, 1);
  blocked = false;
  rejected.tree(10, 1, 20, 12, [0.2, 0.4, 0.2], {});
  assert.ok(rejected.out.pos.length > 0, "failed preflight did not reserve the trunk site");
  const fenced = treeClearanceHarness(() => false, {}, true);
  assert.equal(fenced.out.pos.length, 0);
  assert.equal(fenced.notes.length, 0);
});

test("broadleaf relocation respects earlier crowns in either order while authored woodland can interlock", () => {
  const natural = treeClearanceHarness();
  natural.tree(11, 1, 21.5, 12, [0.2, 0.4, 0.2], {});
  assert.equal(natural.notes.length, 2, "ordinary authored crowns keep their natural overlap");
  const reference = treeClearanceHarness((center) => center[0] < 24);
  let occupied = false;
  const prior = treeClearanceHarness((center) => occupied && center[0] < 24);
  occupied = true;
  prior.tree(11, 1, 20, 12, [0.2, 0.4, 0.2], {});
  assert.ok(prior.notes.length === 1 || prior.notes[1][3].dist > reference.notes[0][3].dist,
    "relocation yields to the already placed broadleaf crown");
  let reverseOccupied = true;
  const reverse = treeClearanceHarness((center) => reverseOccupied && center[0] < 24);
  reverseOccupied = false;
  reverse.tree(11, 1, 20, 12, [0.2, 0.4, 0.2], {});
  assert.ok(reverse.notes.length === 1 || reverse.notes[1][3].dist > 20,
    "a later authored site yields to the earlier relocated crown");
});

// Exercise the private build-context reservation function with its real source
// and real growable accumulators, without booting a complete circuit fixture.
function emittedReservationFixture(masses, segments) {
  const source = fs.readFileSync(path.join(ROOT, "js/track/scenery/build-props.js"), "utf8");
  const start = source.indexOf("    const reserveEmittedSolid = ");
  const end = source.indexOf("    // Every existing guard", start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(source.slice(start, end) + "\nreserveEmittedSolid;", {
    massAdd: (...args) => masses.push(args), pushSeg: (...args) => segments.push(args),
  });
}

function reservedVehicleHarness(rejection = "", side = 1) {
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Models = load("js/track/scenery/models.js", "TrackModels");
  const out = Models.scratch(8), masses = [], segments = [], calls = [];
  const bank = 0.24, pitch = 0.18;
  const r = [0.8 * Math.cos(bank), Math.sin(bank), -0.6 * Math.cos(bank)];
  const bankUp = [-0.8 * Math.sin(bank), Math.cos(bank), 0.6 * Math.sin(bank)];
  const t = [0.6 * Math.cos(pitch) - bankUp[0] * Math.sin(pitch),
    -bankUp[1] * Math.sin(pitch), 0.8 * Math.cos(pitch) - bankUp[2] * Math.sin(pitch)];
  const u = [bankUp[0] * Math.cos(pitch) + 0.6 * Math.sin(pitch),
    bankUp[1] * Math.cos(pitch), bankUp[2] * Math.cos(pitch) + 0.8 * Math.sin(pitch)];
  const p = { c: [124, 6, -83], r, u, t };
  // Existing geometry and unused accumulator capacity must stay out of claims.
  Geom.addBox(out, [-999, 5, -800], [3, 2, 4], [0.2, 0.3, 0.4]);
  const start = out.pos.length;
  const track = { barL: [12, 13, 14], barR: [15, 16, 17] };
  const reserve = emittedReservationFixture(masses, segments);
  const ctx = {
    out, track, def: {}, NIGHT: false, MAT: Geom.MAT,
    anchor: () => p, vadd: Geom.vadd, hash: () => 0.7,
    onTrack: () => false, rejBox: () => rejection === "preflight",
    terrainYAt: () => null, note: () => {}, noteSuppressed: () => {},
    blockAt: () => assert.fail("reservation mutated driving limits"),
    recordBarrier: () => assert.fail("reservation mutated driving limits"),
    reserveEmittedSolid: reserve,
  };
  for (const name of ["addBox", "addCyl", "addFrustum"]) ctx[name] = (buffer, center, ...args) => {
    calls.push({ name, center, args });
    if (name === "addBox") {
      const size = args[0];
      if (rejection === "body" && ((size[0] === 12 && size[2] === 14) ||
          (size[0] === 7.2 && size[1] === 3.1))) return false;
      if (rejection === "awning" && size[0] === 0.05 && size[1] === 0.10) return false;
    }
    return Geom[name](buffer, center, ...args);
  };
  const City = load("js/track/scenery/city.js", "SceneryCity", { TrackSceneryData: {} });
  const Identity = load("js/track/scenery/identity.js", "SceneryIdentity");
  return { out, start, masses, segments, calls, track, reserve,
    motorhome: () => City.create(ctx).motorhome(5, side, 30, 12, 7, 14, { wall: [0.8, 0.8, 0.8] }),
    compound: (opts = {}) => Identity.create(ctx).broadcastCompound(5, side, 30, opts) };
}

function assertVehicleReservation(h) {
  assert.equal(h.masses.length, 1);
  assert.equal(h.segments.length, 1);
  const [center, width, depth, basis] = h.masses[0];
  assert.ok(width > 0 && depth > 0 && [center, width, depth, basis].flat(Infinity).every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(basis[0][0], basis[0][2]) - 1) < 1e-12);
  assert.ok(Math.abs(basis[0][0] * basis[2][0] + basis[0][2] * basis[2][2]) < 1e-12);
  const pos = h.out.pos._data;
  assert.equal(h.out.pos[0], undefined, "fixture uses a real non-indexable accumulator");
  for (let i = h.start; i < h.out.pos.length; i += 3) {
    const x = pos[i] - center[0], z = pos[i + 2] - center[2];
    assert.ok(Math.abs(x * basis[0][0] + z * basis[0][2]) <= width / 2 + 1e-9);
    assert.ok(Math.abs(x * basis[2][0] + z * basis[2][2]) <= depth / 2 + 1e-9);
    const [x0, z0, x1, z1, radius] = h.segments[0];
    const dx = x1 - x0, dz = z1 - z0;
    const a = Math.max(0, Math.min(1, ((pos[i] - x0) * dx + (pos[i + 2] - z0) * dz) / (dx * dx + dz * dz)));
    assert.ok(Math.hypot(pos[i] - x0 - a * dx, pos[i + 2] - z0 - a * dz) <= radius + 1e-9);
  }
  assert.ok(width < 35 && depth < 65, "claim excludes prior geometry and spare storage");
  assert.deepEqual(h.track.barL, [12, 13, 14]);
  assert.deepEqual(h.track.barR, [15, 16, 17]);
}

test("motorhomes and broadcast compounds reserve their emitted tilted footprints without driving limits", () => {
  for (const side of [-1, 1]) {
    const home = reservedVehicleHarness("", side);
    home.motorhome(); assertVehicleReservation(home);
    for (const opts of [{ vans: 1, dishes: 0 }, { vans: 3, dishes: 2 }, { vans: 8, dishes: 6 }]) {
      const compound = reservedVehicleHarness("", side);
      compound.compound(opts); assertVehicleReservation(compound);
    }
  }
});

test("rejected vehicle bodies and awnings leave no phantom footprint or detached details", () => {
  for (const method of ["motorhome", "compound"]) {
    const h = reservedVehicleHarness("body");
    h[method]();
    assert.equal(h.out.pos.length, h.start);
    assert.equal(h.masses.length, 0); assert.equal(h.segments.length, 0);
    assert.ok(h.calls.every(call => call.name === "addBox"));
  }
  const blocked = reservedVehicleHarness("preflight");
  blocked.compound(); assert.equal(blocked.calls.length, 0); assert.equal(blocked.masses.length, 0);
  const full = reservedVehicleHarness(); full.motorhome();
  const noAwning = reservedVehicleHarness("awning"); noAwning.motorhome();
  assertVehicleReservation(noAwning);
  assert.equal(noAwning.calls.filter(call => call.name === "addCyl").length, 0);
  assert.ok(noAwning.masses[0][1] < full.masses[0][1] - 4, "rejected awning does not reserve its overhang");
  assert.equal(noAwning.reserve(noAwning.out, noAwning.out.pos.length, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]), false);
  assert.equal(noAwning.masses.length, 1, "empty range has no reservation");
});

// DAY building() section() must drop facade rails/panes/mullions when the
// solid wall mass is rejected — same early-return the night path already had
// (open-face / skeletal-slab bug, survey 2026-10-05).
function dayBuildingHarness(rejectMass) {
  const masses = [], others = [];
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Models = load("js/track/scenery/models.js", "TrackModels");
  const out = Models.scratch(8);
  const glassBuf = Models.scratch(4);
  const kinds = [];
  const p = {
    c: [40, 2, -10],
    r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1],
  };
  const ctx = {
    out, glassBuf, def: { id: "test", street: false }, theme: "neutral",
    NIGHT: false, MAT: Geom.MAT, lod: (n) => n,
    seat: { prism: () => {} },
    addBox: (buf, c, s, col, b) => Geom.addBox(buf, c, s, col, b),
    addCyl: (...a) => Geom.addCyl(...a),
    addCone: (...a) => Geom.addCone(...a),
    addFrustum: (...a) => Geom.addFrustum(...a),
    addPrism: (...a) => Geom.addPrism(...a),
    addPyramid: (...a) => Geom.addPyramid(...a),
    rejBox: () => false, blockAt: () => {}, onTrack: () => false,
    hash: () => 0.2, vadd: Geom.vadd, kitOf: () => null,
    anchor: () => p, along: () => p,
    massBlocked: () => false, massAdd: () => {},
    terrainYAt: () => null, treeInFootprint: () => false,
    note: () => {}, noteSuppressed: () => {},
    instance: (key, spec, builder, meta) => {
      kinds.push(meta && meta.kind);
      let mat; builder({ mat: (id) => { mat = id; }, box: () => {} });
      (meta && meta.kind === "buildingMass" ? masses : others).push({ key, mat });
      if (rejectMass && meta && meta.kind === "buildingMass") return 0;
      // Real instance() returns landed prim count; addBox's void return is not a vote.
      Geom.addBox(out, spec.o, spec.s, spec.col || [0.5, 0.5, 0.5], [spec.r, spec.u, spec.t]);
      return 1;
    },
  };
  const City = load("js/track/scenery/city.js", "SceneryCity", {
    TrackSceneryData: {},
    TrackGraph: { NODE_COLOR: [1, 1, 1] },
    TrackGeom: Geom,
  });
  return {
    kinds, masses, others,
    build: () => City.create(ctx).building(10, 1, 20, 12, 24, 10, { arch: "flat" }),
  };
}

test("day building() drops facade kit when the wall mass is rejected", () => {
  const ok = dayBuildingHarness(false);
  ok.build();
  assert.ok(ok.kinds.includes("buildingMass"), "wall mass emits when accepted");
  assert.ok(ok.kinds.includes("facadeRail"), "rails dress an accepted wall");
  assert.ok(ok.kinds.includes("windowPane"), "panes dress an accepted wall");

  const rejected = dayBuildingHarness(true);
  rejected.build();
  assert.ok(rejected.kinds.includes("buildingMass"), "mass attempt still recorded");
  assert.equal(rejected.kinds.filter((k) => k === "facadeRail").length, 0,
    "rejected wall must not leave orphan floor-slab rails");
  assert.equal(rejected.kinds.filter((k) => k === "windowPane").length, 0,
    "rejected wall must not leave orphan window panes");
  assert.equal(rejected.kinds.filter((k) => k === "facadeMullion").length, 0,
    "rejected wall must not leave orphan mullions");
});

test("neonTower resets out._mat when a rejected body section returns early", () => {
  // The kind chain stamps out._mat = METAL before its first section; a refused
  // body (sec() === false) returned past the closing reset, so the next
  // untextured emitter drew metal.
  const Geom = load("js/track/core/geom.js", "TrackGeom");
  const Models = load("js/track/scenery/models.js", "TrackModels");
  const out = Models.scratch(8), glassBuf = Models.scratch(4);
  const p = { c: [40, 2, -10], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] };
  const ctx = {
    out, glassBuf, def: { id: "test", street: false }, theme: "neutral",
    NIGHT: false, MAT: Geom.MAT, lod: (n) => n, seat: { prism: () => {} },
    addBox: () => false,
    addCyl: (...a) => Geom.addCyl(...a), addCone: (...a) => Geom.addCone(...a),
    addFrustum: (...a) => Geom.addFrustum(...a), addPrism: (...a) => Geom.addPrism(...a),
    addPyramid: (...a) => Geom.addPyramid(...a),
    rejBox: () => false, blockAt: () => {}, onTrack: () => false,
    hash: () => 0.2, vadd: Geom.vadd, kitOf: () => null, anchor: () => p, along: () => p,
    massBlocked: () => false, massAdd: () => {}, terrainYAt: () => null, treeInFootprint: () => false,
    note: () => {}, noteSuppressed: () => {}, instance: () => 0,
  };
  const City = load("js/track/scenery/city.js", "SceneryCity", {
    TrackSceneryData: {}, TrackGraph: { NODE_COLOR: [1, 1, 1] }, TrackGeom: Geom,
  });
  const city = City.create(ctx);
  for (const kind of ["tiered", "podium", "slab", "twin", "jenga", "hall", "setback"]) {
    out._mat = 0;
    city.neonTower(5, 1, 30, 12, 40, 12, [1, 0.2, 0.6], kind, null, 1);
    assert.equal(out._mat, 0, `${kind}: out._mat must be 0 after a rejected body section`);
  }
});

test("a day wall mass carries its facade material into the instanced model (H27)", () => {
  // The canonical mesh an instanced batch uploads has no out._mat register to
  // inherit, so a bare shared "unit-box" drew every city mass at mat 0 in a
  // browser. The mass model is keyed and stamped by its facadeMat id; facade
  // detail boxes stay on the shared unstamped model.
  const h = dayBuildingHarness(false);
  h.build();
  assert.ok(h.masses.length > 0, "the wall mass is instanced");
  for (const m of h.masses) {
    assert.ok(m.mat > 0, `mass model stamps a facade material (got ${m.mat})`);
    assert.equal(m.key, "unit-box:" + m.mat, "one model per material id");
  }
  assert.ok(h.others.every((o) => o.key === "unit-box" && o.mat === undefined), "detail boxes stay on the shared unit-box");
});
