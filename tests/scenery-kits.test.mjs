import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file, name, globals = {}) {
  const sandbox = { console, Math, Array, Object, Number, Map, Set, ...globals };
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, vm.createContext(sandbox), { filename: file });
  return sandbox[name];
}

test("SceneryThemes resolves named themes and track overrides", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
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
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
  const neutral = Themes.resolve();
  const unknown = Themes.resolve("not-a-theme");

  assert.equal(neutral.name, "neutral");
  assert.equal(neutral.spacing.furniture, 80);
  assert.equal(neutral.budgets.hero, 50000);
  assert.deepEqual(unknown, neutral);
});

test("SceneryThemes exposes only the immutable public operations", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");

  assert.deepEqual(Object.keys(Themes).sort(), ["resolve", "variant"]);
  assert.equal(Themes.THEMES, undefined);
});

test("SceneryThemes variant selection is stable and bounded", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
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
  const LandmarkKit = load("js/landmark-kit.js", "LandmarkKit");
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
  assert.equal(emitted.length, 58);
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
