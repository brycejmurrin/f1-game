# Circuit Scenery Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated reusable circuit infrastructure, deterministic scenery themes, and composable landmark forms, then prove them on representative circuit types.

**Architecture:** Three pure IIFE modules load before `tracks.js`: `SceneryThemes` resolves data-only style defaults, `LandmarkKit` emits bounded architectural forms into staged buffers, and `CircuitKit` assembles complete facilities through `TrackModels`. `tracks.js` binds those modules to each circuit's existing scenery API, while `TrackModels` remains responsible for atomic commit, diagnostics, clearance, and vertex limits.

**Tech Stack:** Plain JavaScript IIFEs, existing `TrackGeom` emitters, Node `node:test`, Playwright, static script loading through `index.html`.

## Global Constraints

- No ES modules in shipped runtime code.
- All placement remains explicit and track-owned; themes never place geometry automatically.
- Every complete model emits atomically through `TrackModels`.
- Models fail closed on invalid geometry, unsafe clearance, rejected footprints, or exceeded vertex budgets.
- Geometry and variant selection are deterministic for identical track, model ID, time, and weather.
- Hero landmarks default to 50,000 vertices, facilities to 25,000, and repeated furniture to 10,000 vertices per sector.
- No helper may contain an unbounded per-node emission loop.
- Land the current per-track agent batch before starting representative circuit migrations.
- Every task that changes JS must run the following cache step immediately
  before its commit and stage `index.html` plus `version.json` with that task:

```bash
current="$(rg -o '\?v=[0-9]+' index.html | sort -u | cut -d= -f2)"
test -n "$current"
next="$((current + 1))"
sed -i '' -E "s/\?v=[0-9]+/?v=${next}/g" index.html
printf '{ "build": %s }\n' "$next" > version.json
git add index.html version.json
```

  A rebase preserves the greater existing build before this step; it does not
  count as the task's one logical cache increment.

---

## File Map

- Create `js/scenery-themes.js`: theme registry, override resolution, stable variant selection, and budgets.
- Create `js/landmark-kit.js`: bounded architectural forms that emit into a caller-owned staging buffer.
- Create `js/circuit-kit.js`: complete reusable facilities assembled through `TrackModels`.
- Modify `js/track-models.js`: enforce per-model vertex budgets during atomic staging.
- Modify `js/tracks.js`: bind theme, landmark, and circuit helpers into `scenery(api)`.
- Modify `index.html`: load the three modules before `tracks.js`.
- Modify `tools/verify-track.cjs`: load the modules in the Node verification harness.
- Create `tests/unit/scenery-kits.test.mjs`: pure contracts for all three modules and budget behavior.
- Create `tests/specs/scenery-kits.spec.js`: browser integration and representative-circuit diagnostics.
- Modify five representative track files after their agent commits land: `js/tracks/singapore.js`, `js/tracks/bahrain.js`, `js/tracks/albert_park.js`, `js/tracks/silverstone.js`, and `js/tracks/qatar.js`.
- Modify `docs/SCENERY-API.md`, `docs/TESTING.md`, `package.json`, `index.html`, and `version.json` for integration.

---

### Task 1: Deterministic Scenery Theme Registry

**Files:**
- Create: `js/scenery-themes.js`
- Create: `tests/unit/scenery-kits.test.mjs`

**Interfaces:**
- Produces: `SceneryThemes.resolve(name, overrides?, context?) -> resolvedTheme`
- Produces: `SceneryThemes.variant(trackId, modelId, index, choices) -> choice`
- `resolvedTheme` contains `name`, `palette`, `variants`, `spacing`, and `budgets`.

- [ ] **Step 1: Write the failing theme tests**

```js
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

test("SceneryThemes resolves neutral defaults, named theme, and track overrides", () => {
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

test("SceneryThemes variant selection is stable and bounded", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
  const choices = ["flat", "sawtooth", "cantilever"];
  const first = Themes.variant("spa", "pit-roof", 3, choices);
  assert.equal(first, Themes.variant("spa", "pit-roof", 3, choices));
  assert.ok(choices.includes(first));
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: FAIL because `js/scenery-themes.js` does not exist.

- [ ] **Step 3: Implement theme resolution and stable variants**

```js
const SceneryThemes = (function () {
  "use strict";
  const BASE = {
    name: "neutral",
    palette: {
      shell: [0.58, 0.60, 0.64], roof: [0.18, 0.20, 0.24],
      glass: [0.28, 0.42, 0.58], window: [0.92, 0.84, 0.62],
      accent: [0.82, 0.12, 0.16], service: [0.72, 0.74, 0.78],
    },
    variants: { roof: ["flat"], facade: ["glazed"], tower: ["lattice"] },
    spacing: { furniture: 80, service: 180 },
    budgets: { hero: 50000, facility: 25000, repeated: 10000 },
  };
  const THEMES = {
    permanent: {},
    street: {
      palette: { shell: [0.45, 0.47, 0.52], glass: [0.20, 0.34, 0.52] },
      variants: { roof: ["flat", "cantilever"], facade: ["glazed", "led"] },
    },
    desert: {
      palette: { shell: [0.68, 0.58, 0.44], accent: [0.96, 0.68, 0.16] },
      spacing: { furniture: 120, service: 220 },
    },
    park: {
      palette: { shell: [0.68, 0.68, 0.64], roof: [0.20, 0.28, 0.22] },
      spacing: { furniture: 140, service: 240 },
    },
    "night-event": {
      palette: { shell: [0.30, 0.32, 0.38], window: [0.70, 0.86, 1.00] },
      variants: { facade: ["glazed", "led"], tower: ["lattice", "tapered"] },
    },
  };
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    for (const key of Object.keys(b || {}))
      out[key] = b[key] && typeof b[key] === "object" && !Array.isArray(b[key])
        ? merge(a && a[key] || {}, b[key]) : b[key];
    return out;
  };
  function resolve(name, overrides, context) {
    const chosen = THEMES[name] || {};
    const result = merge(merge(BASE, chosen), overrides || {});
    result.name = THEMES[name] ? name : "neutral";
    if (context && context.night)
      result.palette.window = result.palette.window.map((v) => Math.min(2, v * 1.15));
    return result;
  }
  function variant(trackId, modelId, index, choices) {
    if (!Array.isArray(choices) || !choices.length) return null;
    const text = `${trackId}|${modelId}|${Number(index) || 0}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return choices[(hash >>> 0) % choices.length];
  }
  return { resolve, variant, THEMES };
})();
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/scenery-themes.js tests/unit/scenery-kits.test.mjs
git commit -m "Add deterministic scenery themes"
```

---

### Task 2: Landmark Architectural Forms

**Files:**
- Create: `js/landmark-kit.js`
- Modify: `tests/unit/scenery-kits.test.mjs`

**Interfaces:**
- Consumes: primitive callbacks `{ box, prism, cylinder }`.
- Produces: `LandmarkKit.create(primitives)` with `roof`, `facade`, `tower`, `stadiumSection`, `arch`, and `canopy`.
- Every method has signature `(stage, spec) -> boolean` and only writes to `stage`.

- [ ] **Step 1: Add failing finite-geometry and bounded-emission tests**

```js
test("LandmarkKit emits bounded finite forms into a stage", () => {
  const emitted = [];
  const Kit = load("js/landmark-kit.js", "LandmarkKit");
  const kit = Kit.create({
    box: (_stage, center, size) => emitted.push({ kind: "box", center, size }),
    prism: (_stage, center, size) => emitted.push({ kind: "prism", center, size }),
    cylinder: (_stage, center, radius, height) =>
      emitted.push({ kind: "cylinder", center, radius, height }),
  });
  const stage = {};
  assert.equal(kit.roof(stage, {
    kind: "cantilever", center: [0, 8, 0], size: [14, 1, 30],
  }), true);
  assert.equal(kit.facade(stage, {
    kind: "glazed", center: [0, 5, 0], size: [1, 10, 30], bays: 6,
  }), true);
  assert.equal(kit.tower(stage, {
    kind: "lattice", center: [0, 12, 0], size: [8, 24, 8], levels: 4,
  }), true);
  assert.ok(emitted.length <= 40);
  assert.ok(emitted.flatMap((e) => e.center || []).every(Number.isFinite));
});

test("LandmarkKit rejects invalid and unbounded specs", () => {
  const Kit = load("js/landmark-kit.js", "LandmarkKit");
  const kit = Kit.create({ box() {}, prism() {}, cylinder() {} });
  assert.equal(kit.facade({}, {
    center: [0, 0, 0], size: [1, 10, 10], bays: 1000,
  }), false);
  assert.equal(kit.tower({}, {
    center: [0, NaN, 0], size: [8, 20, 8], levels: 4,
  }), false);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: FAIL because `LandmarkKit` is missing.

- [ ] **Step 3: Implement validation and the six bounded forms**

Create an IIFE with:

```js
const LandmarkKit = (function () {
  "use strict";
  const finite = (v, n) =>
    Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  const valid = (spec) =>
    spec && finite(spec.center, 3) && finite(spec.size, 3) &&
    spec.size.every((v) => v > 0);
  const bounded = (value, fallback, max) => {
    const n = Math.round(Number(value) || fallback);
    return n > 0 && n <= max ? n : 0;
  };
  function create(p) {
    function roof(stage, spec) {
      if (!valid(spec)) return false;
      return (spec.kind === "sawtooth" ? p.prism : p.box)(
        stage, spec.center, spec.size, spec.color, spec.basis) !== false;
    }
    function facade(stage, spec) {
      if (!valid(spec)) return false;
      const bays = bounded(spec.bays, 6, 24);
      if (!bays) return false;
      for (let i = 0; i < bays; i++) {
        const t = (i + 0.5) / bays - 0.5;
        const c = [spec.center[0], spec.center[1],
          spec.center[2] + t * spec.size[2]];
        p.box(stage, c, [spec.size[0], spec.size[1], spec.size[2] / bays * 0.82],
          spec.color, spec.basis);
      }
      return true;
    }
    function tower(stage, spec) {
      if (!valid(spec)) return false;
      const levels = bounded(spec.levels, 4, 12);
      if (!levels) return false;
      for (let i = 0; i < levels; i++) {
        const y = spec.center[1] - spec.size[1] / 2 +
          (i + 0.5) * spec.size[1] / levels;
        p.box(stage, [spec.center[0], y, spec.center[2]],
          [spec.size[0] * (1 - i / levels * 0.35),
           spec.size[1] / levels * 0.86,
           spec.size[2] * (1 - i / levels * 0.35)],
          spec.color, spec.basis);
      }
      return true;
    }
    function stadiumSection(stage, spec) {
      if (!valid(spec)) return false;
      const rows = bounded(spec.rows, 8, 16);
      if (!rows) return false;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows;
        p.box(stage, [
          spec.center[0],
          spec.center[1] - spec.size[1] / 2 + t * spec.size[1],
          spec.center[2] - spec.size[2] / 2 + t * spec.size[2],
        ], [spec.size[0], spec.size[1] / rows * 0.7,
          spec.size[2] / rows], spec.color, spec.basis);
      }
      return true;
    }
    function arch(stage, spec) {
      if (!valid(spec)) return false;
      const post = Math.min(spec.size[0] * 0.2, spec.postWidth || 1.2);
      const postH = spec.size[1] - post;
      p.box(stage, [spec.center[0] - (spec.size[0] - post) / 2,
        spec.center[1] - post / 2, spec.center[2]],
        [post, postH, spec.size[2]], spec.color, spec.basis);
      p.box(stage, [spec.center[0] + (spec.size[0] - post) / 2,
        spec.center[1] - post / 2, spec.center[2]],
        [post, postH, spec.size[2]], spec.color, spec.basis);
      p.box(stage, [spec.center[0],
        spec.center[1] + (spec.size[1] - post) / 2, spec.center[2]],
        [spec.size[0], post, spec.size[2]], spec.color, spec.basis);
      return true;
    }
    function canopy(stage, spec) {
      if (!valid(spec)) return false;
      const mastH = spec.size[1] * 0.8;
      p.cylinder(stage, [spec.center[0],
        spec.center[1] - (spec.size[1] - mastH) / 2, spec.center[2]],
        Math.min(spec.size[0], spec.size[2]) * 0.06, mastH,
        spec.mastColor || spec.color, 8, spec.basis);
      p.box(stage, [spec.center[0],
        spec.center[1] + spec.size[1] * 0.4, spec.center[2]],
        [spec.size[0], spec.size[1] * 0.2, spec.size[2]],
        spec.color, spec.basis);
      return true;
    }
    return { roof, facade, tower, stadiumSection, arch, canopy };
  }
  return { create };
})();
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: all theme and landmark tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/landmark-kit.js tests/unit/scenery-kits.test.mjs
git commit -m "Add bounded landmark building forms"
```

---

### Task 3: TrackModels Vertex Budget Enforcement

**Files:**
- Modify: `js/track-models.js`
- Modify: `tests/unit/track-foundation.test.mjs`

**Interfaces:**
- Extends: `modelGroup(id, bounds, emit, { required?, maxVertices?, kind? })`
- Diagnostic for rejected staged geometry: `{ id, required, reason: "vertex budget exceeded", vertices, maximum }`

- [ ] **Step 1: Add a failing atomic budget test**

```js
test("TrackModels rejects an entire staged model over its vertex budget", () => {
  const TrackModels = loadGlobal("js/track-models.js", "TrackModels");
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const api = TrackModels.create({
    out,
    emitBox(stage, center) {
      const base = stage.pos.length / 3;
      stage.pos.push(...center);
      stage.nrm.push(0, 1, 0);
      stage.col.push(1, 1, 1);
      stage.idx.push(base);
    },
  });
  const ok = api.modelGroup("too-large", {
    center: [0, 0, 0], size: [1, 1, 1],
  }, (stage) => {
    api.box(stage, [0, 0, 0], [1, 1, 1]);
    api.box(stage, [1, 0, 0], [1, 1, 1]);
  }, { maxVertices: 1 });
  assert.equal(ok, false);
  assert.equal(out.pos.length, 0);
  assert.ok(api.diagnostics.invalid.some((d) =>
    d.id === "too-large" && d.reason === "vertex budget exceeded"));
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test tests/unit/track-foundation.test.mjs`

Expected: FAIL because `modelGroup` currently commits both vertices.

- [ ] **Step 3: Enforce the budget before appendBuffer**

Immediately after staged geometry validation in `modelGroup`:

```js
const vertices = stage.pos.length / 3;
const maximum = options && Number(options.maxVertices);
if (Number.isFinite(maximum) && vertices > maximum) {
  diagnostics.invalid.push({
    id, required, reason: "vertex budget exceeded", vertices, maximum,
    kind: options.kind || "model",
  });
  return false;
}
```

Include `kind` in the successful emitted diagnostic.

- [ ] **Step 4: Run foundation tests**

Run: `node --test tests/unit/track-foundation.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/track-models.js tests/unit/track-foundation.test.mjs
git commit -m "Enforce atomic scenery vertex budgets"
```

---

### Task 4: Reusable Circuit Infrastructure Kit

**Files:**
- Create: `js/circuit-kit.js`
- Modify: `tests/unit/scenery-kits.test.mjs`

**Interfaces:**
- Consumes: `CircuitKit.create({ models, landmarks, theme, frameAt, groundHeight, hash })`
- Produces: `pitBuilding`, `hospitality`, `raceControl`, `pedestrianBridge`, `cameraCrane`, `marshalShelter`, `recoveryBay`, `serviceCompound`, and `trackSigns`.
- Complete facilities accept `{ id, frac, side, gap, size?, required?, style? }`.

- [ ] **Step 1: Add failing facility tests**

```js
test("CircuitKit routes complete facilities through atomic model groups", () => {
  const calls = [];
  const CircuitKit = load("js/circuit-kit.js", "CircuitKit");
  const kit = CircuitKit.create({
    models: {
      modelGroup(id, bounds, emit, options) {
        calls.push({ id, bounds, options });
        emit({});
        return true;
      },
      overheadSpan(spec) { calls.push({ overhead: spec }); return true; },
      box() { return true; },
      groundedSegments() { return true; },
    },
    landmarks: {
      roof() { return true; }, facade() { return true; },
      tower() { return true; }, canopy() { return true; },
    },
    theme: {
      palette: { shell: [0.5, 0.5, 0.5], roof: [0.2, 0.2, 0.2] },
      variants: { roof: ["flat"] },
      budgets: { hero: 50000, facility: 25000, repeated: 10000 },
    },
    frameAt: () => ({
      c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0],
      t: [0, 0, 1], hw: 6,
    }),
  });
  assert.equal(kit.pitBuilding({
    id: "pit", frac: 0.02, side: 1, gap: 12, garages: 10,
  }), true);
  assert.equal(kit.pedestrianBridge({
    id: "bridge", frac: 0.2, clearance: 6,
  }), true);
  assert.equal(calls[0].options.maxVertices, 25000);
  assert.equal(calls[1].overhead.id, "bridge");
});

test("CircuitKit rejects missing IDs and unbounded repeated counts", () => {
  const CircuitKit = load("js/circuit-kit.js", "CircuitKit");
  const kit = CircuitKit.create({ models: {}, landmarks: {}, theme: {} });
  assert.equal(kit.serviceCompound({ frac: 0.5, vehicles: 4 }), false);
  assert.equal(kit.trackSigns({ id: "signs", count: 10000 }), false);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: FAIL because `CircuitKit` is missing.

- [ ] **Step 3: Implement complete facilities with shared validation**

Use one internal validator:

```js
const validSpec = (spec) =>
  spec && typeof spec.id === "string" && spec.id.length > 0 &&
  Number.isFinite(spec.frac);
const count = (value, fallback, maximum) => {
  const n = Math.round(Number(value) || fallback);
  return n > 0 && n <= maximum ? n : 0;
};
```

For each non-overhead facility:

1. Resolve `frameAt(spec.frac)`.
2. Compute a complete world-space center and bounds from side, gap, and size.
3. Call `models.modelGroup` once with `maxVertices: theme.budgets.facility`.
4. Emit all boxes and LandmarkKit forms into the provided stage.
5. Return the `modelGroup` result.

`pedestrianBridge` delegates to `models.overheadSpan` with minimum clearance
`4.8`. `trackSigns` caps count at `64`; `serviceCompound` caps vehicles at `16`;
pit garages cap at `24`; hospitality modules cap at `12`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/scenery-kits.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/circuit-kit.js tests/unit/scenery-kits.test.mjs
git commit -m "Add reusable circuit infrastructure kit"
```

---

### Task 5: Runtime Binding, Script Loading, and Documentation

**Files:**
- Modify: `js/tracks.js`
- Modify: `index.html`
- Modify: `tools/verify-track.cjs`
- Modify: `package.json`
- Modify: `docs/SCENERY-API.md`
- Modify: `docs/TESTING.md`
- Create: `tests/specs/scenery-kits.spec.js`

**Interfaces:**
- Produces on `scenery(api)`: `sceneryTheme`, `landmarkKit`, and `circuitKit`.
- Track definition opt-in: `sceneryTheme: "street" | "desert" | "park" | "permanent" | "night-event"`.

- [ ] **Step 1: Add a failing browser integration test**

```js
import { test, expect } from "@playwright/test";

test("shared scenery kits are bound and diagnostics stay finite", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race);
  await page.evaluate(() => __apex.race("silverstone", "day", "dry"));
  await page.waitForFunction(() => __apex.info().state === "race");
  const state = await page.evaluate(() => ({
    geometry: __apex.geometryDiagnostics(),
    models: __apex.modelDiagnostics(),
  }));
  expect(state.geometry.every((d) => d.ok)).toBe(true);
  expect(state.models.invalid).toEqual([]);
  expect(state.models.unsafe).toEqual([]);
});
```

- [ ] **Step 2: Run the test and confirm loading fails**

Run: `npm test -- tests/specs/scenery-kits.spec.js --workers=1`

Expected: FAIL until modules are loaded and bound.

- [ ] **Step 3: Load modules before tracks.js**

In `index.html`, after `track-models.js`:

```html
<script crossorigin="anonymous" src="js/scenery-themes.js?v=587"></script>
<script crossorigin="anonymous" src="js/landmark-kit.js?v=587"></script>
<script crossorigin="anonymous" src="js/circuit-kit.js?v=587"></script>
```

Load the same files in `tools/verify-track.cjs` after `track-models.js`.

- [ ] **Step 4: Bind kits inside buildProps**

After creating the bound `TrackModels` instance:

```js
const sceneryTheme = SceneryThemes.resolve(
  def.sceneryTheme || (def.street ? "street" : def.theme === "desert" ? "desert" : "permanent"),
  def.sceneryThemeOverrides,
  { night: !!track._night, weather: track._weather || "dry" },
);
const landmarkKit = LandmarkKit.create({
  box: (stage, c, size, color, basis) => addBox(stage, c, size, color, basis),
  prism: (stage, c, size, color, basis) => addPrism(stage, c, size, color, basis),
  cylinder: (stage, c, radius, height, color, seg, basis) =>
    addCyl(stage, c, radius, height, color, seg, basis),
});
const circuitKit = CircuitKit.create({
  models, landmarks: landmarkKit, theme: sceneryTheme,
  frameAt, groundHeight: groundYAt, hash,
});
```

Expose all three in the scenery API object.

- [ ] **Step 5: Update tooling and documentation**

- Add `tests/unit/scenery-kits.test.mjs` to `test:tooling`.
- Document theme names, precedence, every CircuitKit helper, all LandmarkKit
  forms, stable IDs, and budgets in `docs/SCENERY-API.md`.
- Add both new test files to the testing coverage table.

- [ ] **Step 6: Run integration tests**

Run:

```bash
node --test tests/unit/scenery-kits.test.mjs tests/unit/track-foundation.test.mjs
node tools/verify-track.cjs --all
npm test -- tests/specs/scenery-kits.spec.js tests/specs/new-hooks.spec.js --workers=1
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add js/tracks.js index.html tools/verify-track.cjs package.json \
  docs/SCENERY-API.md docs/TESTING.md tests/specs/scenery-kits.spec.js
git commit -m "Wire shared scenery kits into track builds"
```

---

### Task 6: Representative Theme Migrations

**Files:**
- Modify: `js/tracks/singapore.js`
- Modify: `js/tracks/bahrain.js`
- Modify: `js/tracks/albert_park.js`
- Modify: `js/tracks/silverstone.js`
- Modify: `js/tracks/qatar.js`
- Modify: `tests/specs/scenery-kits.spec.js`

**Interfaces:**
- Consumes: the runtime-bound `sceneryTheme`, `landmarkKit`, and `circuitKit`.
- Produces: one representative verified adoption for street, desert, park, permanent, and night-event styles.

- [ ] **Step 1: Rebase onto the integrated per-track batch**

Run:

```bash
git fetch origin
git rebase origin/claude/f1-game-project-26h3ng
```

Expected: the five files contain their latest track-agent improvements before
kit adoption begins. Resolve conflicts by preserving track-owned geometry and
adding only the kit calls described below.

- [ ] **Step 2: Add failing representative diagnostics assertions**

Extend `tests/specs/scenery-kits.spec.js`:

```js
for (const entry of [
  ["singapore", "street"],
  ["bahrain", "desert"],
  ["albert_park", "park"],
  ["silverstone", "permanent"],
  ["qatar", "night-event"],
]) {
  test(`${entry[0]} uses validated ${entry[1]} kit models`, async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race);
    await page.evaluate(([id]) => __apex.race(id, "day", "dry"), entry);
    await page.waitForFunction(() => __apex.info().state === "race");
    const diagnostics = await page.evaluate(() => __apex.modelDiagnostics());
    expect(diagnostics.emitted.some((d) => d.id.startsWith("kit:"))).toBe(true);
    expect(diagnostics.invalid).toEqual([]);
    expect(diagnostics.unsafe).toEqual([]);
  });
}
```

- [ ] **Step 3: Run and confirm all five tests fail**

Run: `npm test -- tests/specs/scenery-kits.spec.js --workers=1`

Expected: FAIL because no emitted IDs start with `kit:`.

- [ ] **Step 4: Add one bounded kit cluster per representative**

Use existing safe sectors selected by each track's just-landed tests:

- Singapore: `sceneryTheme: "street"`; one race-control tower and one validated
  pedestrian bridge outside its dressing-exclusion sectors.
- Bahrain: `sceneryTheme: "desert"`; one paddock hospitality cluster and one
  service compound behind the pit straight.
- Albert Park: `sceneryTheme: "park"`; one marshal/recovery bay and sparse
  track-sign cluster, preserving lakes and fountain model groups.
- Silverstone: `sceneryTheme: "permanent"`; pit building plus camera crane,
  preserving existing grandstands and runoff.
- Qatar: `sceneryTheme: "night-event"`; hospitality pavilion and marshal shelter
  using cool emissive theme defaults.

Every call uses an ID prefixed `kit:<track>:` and an explicit racing fraction,
side, and gap. Do not replace hero landmarks created by the track agents.

- [ ] **Step 5: Verify each circuit independently**

Run:

```bash
node tools/verify-track.cjs singapore
node tools/verify-track.cjs bahrain
node tools/verify-track.cjs albert_park
node tools/verify-track.cjs silverstone
node tools/verify-track.cjs qatar
npm test -- tests/specs/scenery-kits.spec.js --workers=1
```

Expected: all builds and five representative tests pass.

- [ ] **Step 6: Commit**

```bash
git add js/tracks/singapore.js js/tracks/bahrain.js \
  js/tracks/albert_park.js js/tracks/silverstone.js js/tracks/qatar.js \
  tests/specs/scenery-kits.spec.js
git commit -m "Adopt scenery kits across representative circuits"
```

---

### Task 7: Full Safety, Performance, and Cache Verification

**Files:**
- Modify: `docs/TESTING.md` only if actual commands differ from Task 5 documentation.

**Interfaces:**
- Consumes all prior tasks.
- Produces one deployable, cache-consistent scenery expansion.

- [ ] **Step 1: Run static and all-track validation**

Run:

```bash
node --test tests/unit/scenery-kits.test.mjs tests/unit/track-foundation.test.mjs
node tools/verify-track.cjs --all
npm run test:smoke
```

Expected: all pass with no required invalid/suppressed/unsafe models.

- [ ] **Step 2: Run geometry and collision gates**

Run:

```bash
npm test -- tests/specs/props-over-road.spec.js --workers=1
npm test -- tests/specs/terrain-over-road.spec.js --workers=1
npm test -- tests/specs/tracks-walls.spec.js tests/specs/scenery-kits.spec.js --workers=1
```

Expected: all pass; no representative track needs a raised overlap baseline.

- [ ] **Step 3: Run visual evidence**

Run:

```bash
npm run test:visual -- --workers=2
npm test -- tests/specs/ui-audit.spec.js --project=render --workers=1
```

Expected: tests pass or only report the repository's documented pre-existing
platform-specific visual baseline limitation. Review galleries for duplicate
buildings, floating facilities, blocked sightlines, and excessive density.

- [ ] **Step 4: Verify budget diagnostics**

For each representative track, inspect `__apex.modelDiagnostics()` through the
browser test and assert:

```js
expect(diagnostics.invalid.filter((d) =>
  d.reason === "vertex budget exceeded")).toEqual([]);
expect(diagnostics.emitted.every((d) =>
  !d.vertices || d.vertices <= 50000)).toBe(true);
```

- [ ] **Step 5: Verify cache consistency and clean diff**

Run:

```bash
rg -o '\?v=[0-9]+' index.html | sort -u
git diff --check
git status --short
```

Expected: one distinct cache value, matching `version.json`, with no whitespace
errors or unintended files.

- [ ] **Step 6: Commit any verification documentation change**

```bash
git add docs/TESTING.md
git diff --cached --quiet || git commit -m "Document scenery expansion verification"
```

