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
    assert.ok(calls.boxes.length + calls.landmarks.length <= maximum + 4, method);
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
