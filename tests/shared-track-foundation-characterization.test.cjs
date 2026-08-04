// Task 1 characterization for the shared-track-foundation refactor.
// Deliberately pins current compatibility behavior, including the known
// recordBarrier(0, 1) modulo behavior that a later task will change.
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = require("../tools/manifest.cjs");

function buildHarness() {
  let meshObserver = null;
  const makeHandle = (kind, geo) => {
    if (meshObserver) meshObserver(kind, geo);
    return {
      verts: geo?.pos ? geo.pos.length / 3 : 0,
      idxCount: geo?.idx ? geo.idx.length : 0,
    };
  };
  const sandbox = {
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
    isNaN, isFinite, parseInt, parseFloat,
    GLX: {
      createMesh: (geo) => makeHandle("mesh", geo),
      createChunkedMesh: (geo) => makeHandle("chunked", geo),
    },
    console: {
      log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {},
      assert() {}, group() {}, groupEnd() {}, table() {}, dir() {}, count() {},
      time() {}, timeEnd() {},
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const runFile = (relPath) => {
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8")
      .replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: relPath });
  };
  // Load list comes from tools/manifest.cjs (TRACK_VM) — the same source of
  // truth verify-track.cjs and the load-order test use.
  for (const entry of MANIFEST.TRACK_VM) {
    if (entry === "@circuits") {
      for (const file of fs.readdirSync(path.join(ROOT, MANIFEST.CIRCUITS_DIR))
        .filter((name) => name.endsWith(".js")).sort()) {
        runFile(path.join(MANIFEST.CIRCUITS_DIR, file));
      }
    } else {
      runFile(entry);
    }
  }
  return {
    ctx,
    Tracks: ctx.Tracks,
    observe(fn) { meshObserver = fn; },
  };
}

const harness = buildHarness();
const { ctx, Tracks } = harness;

function copyDefinition(source, overrides) {
  return Object.assign({}, source, {
    points: source.points.map((point) => Array.from(point)),
  }, overrides);
}

function circleDefinition(id, scenery) {
  const template = Tracks.LIST.find((def) => def.id === "monza");
  const points = Array.from({ length: 96 }, (_, i) => {
    const angle = i / 96 * Math.PI * 2;
    return [Math.sin(angle) * 300, 0, Math.cos(angle) * 300, 7, 0];
  });
  return copyDefinition(template, {
    id,
    name: id.toUpperCase(),
    points,
    street: false,
    banked: false,
    bankZones: null,
    bridges: null,
    elevations: null,
    hwZones: null,
    terrainOuter: 120,
    flatTerrain: false,
    reverse: false,
    startFrac: 0,
    scenery,
  });
}

test("startFrac and reverse transform source control points and authored fractions", () => {
  const wrap = (value) => ((value % 1) + 1) % 1;
  const smoothXZ = (pathData) => {
    const points = pathData.pts.map((point) => [point[0], 0, point[1]]);
    for (let iteration = 0; iteration < 2; iteration++) {
      const xs = points.map((point) => point[0]);
      const zs = points.map((point) => point[2]);
      for (let i = 0; i < points.length; i++) {
        const before = (i - 1 + points.length) % points.length;
        const after = (i + 1) % points.length;
        points[i][0] = xs[i] + 0.25 * ((xs[before] + xs[after]) * 0.5 - xs[i]);
        points[i][2] = zs[i] + 0.25 * ((zs[before] + zs[after]) * 0.5 - zs[i]);
      }
    }
    return points;
  };

  let transformed = 0;
  for (const raw of ctx.TrackDefs) {
    const built = Tracks.LIST.find((def) => def.id === raw.id);
    const phi = wrap(raw.startFrac || 0);
    if (!raw.reverse && !phi) continue;
    transformed++;
    const source = smoothXZ(ctx.CircuitPaths[raw.id]);
    const count = source.length;
    const offset = Math.round(phi * count) % count;
    for (const i of [0, 1, Math.floor(count / 3), count - 1]) {
      const sourceIndex = raw.reverse
        ? ((offset - i) % count + count) % count
        : (i + offset) % count;
      assert.ok(
        Math.hypot(
          built.points[i][0] - source[sourceIndex][0],
          built.points[i][2] - source[sourceIndex][2],
        ) <= 1e-6,
        `${raw.id}: point ${i} maps to source point ${sourceIndex}`,
      );
    }
    const mapFraction = raw.reverse
      ? (fraction) => wrap(phi - fraction)
      : (fraction) => wrap(fraction - phi);
    for (const key of ["bridges", "elevations"]) {
      if (!raw[key] || !built[key]) continue;
      raw[key].forEach((entry, i) => {
        assert.ok(Math.abs(built[key][i].s - mapFraction(entry.s)) <= 1e-12, `${raw.id} ${key}[${i}]`);
      });
    }
    if (raw.hwZones && built.hwZones) raw.hwZones.forEach((zone, i) => {
      const first = mapFraction(zone.s0);
      const second = mapFraction(zone.s1);
      assert.ok(Math.abs(built.hwZones[i].s0 - (raw.reverse ? second : first)) <= 1e-12, `${raw.id} hwZones[${i}].s0`);
      assert.ok(Math.abs(built.hwZones[i].s1 - (raw.reverse ? first : second)) <= 1e-12, `${raw.id} hwZones[${i}].s1`);
    });
  }
  assert.ok(transformed > 0, "at least one shipped circuit uses a lap transform");
});

test("open and street grounding follow their current terrain profiles", () => {
  const sample = (id, fraction, distances) => {
    const source = Tracks.LIST.find((def) => def.id === id);
    let captured;
    const def = copyDefinition(source, {
      scenery(api) {
        const k = Math.round(fraction * api.n) % api.n;
        captured = {
          py: api.py[k],
          pyMin: api.pyMin,
          outer: api.def.terrainOuter || (api.def.street ? 28 : 120),
          rows: distances.map((dist) => {
            const anchor = api.anchor(k, 1, dist);
            return {
              dist,
              estimate: api.groundYAt(k, dist),
              anchored: anchor.c[1],
              x: anchor.c[0],
              z: anchor.c[2],
            };
          }),
        };
      },
    });
    const track = Tracks.build(def, { night: false });
    for (const row of captured.rows)
      row.rendered = Tracks.terrainY(track, row.x, row.z);
    return captured;
  };

  const open = sample("redbull", 0.22, [0, 2.2, 7, 14, 48, 120, 140]);
  const street = sample("monaco", 0.35, [0, 5, 14, 28, 38, 48]);
  assert.ok(open.rows[0].estimate < open.py);
  for (let i = 2; i < open.rows.length; i++)
    assert.ok(open.rows[i].estimate <= open.rows[i - 1].estimate + 0.01);
  assert.equal(open.rows.at(-1).estimate, open.rows.at(-2).estimate);
  const openEdge = open.rows.find(({ dist }) => dist === 120);
  const openBeyond = open.rows.find(({ dist }) => dist === 140);
  assert.notEqual(openEdge.rendered, null);
  assert.ok(Math.abs(openEdge.anchored - openEdge.rendered) <= 1e-6);
  assert.equal(openBeyond.rendered, null);
  assert.equal(openBeyond.anchored, openBeyond.estimate);

  assert.equal(street.outer, 28);
  assert.ok(street.rows[0].estimate < street.py);
  for (const row of street.rows.filter(({ dist }) => dist > 0 && dist <= street.outer)) {
    assert.notEqual(row.rendered, null);
    assert.ok(Math.abs(row.anchored - row.rendered) <= 1e-6);
  }
  for (const row of street.rows.filter(({ dist }) => dist > street.outer)) {
    assert.equal(row.rendered, null);
    assert.equal(row.anchored, row.estimate);
  }
});

test("recordBarrier wraps partial ranges and treats 0 to 1 as a full lap", () => {
  const baseline = Tracks.build(circleDefinition("barrier-baseline", null), { night: false });
  const actual = Tracks.build(circleDefinition("barrier-characterization", (api) => {
    api.recordBarrier(0, 1, 1, 3);
    api.recordBarrier(0.98, 0.02, -1, 3);
  }), { night: false });
  const changed = (before, after) => {
    const indices = [];
    for (let i = 0; i < after.length; i++)
      if (after[i] < before[i] - 1e-6) indices.push(i);
    return indices;
  };
  const right = changed(baseline.barR, actual.barR);
  const left = changed(baseline.barL, actual.barL);
  const start = Math.round(0.98 * actual.n) % actual.n;
  const end = Math.round(0.02 * actual.n) % actual.n;
  const expectedWrappedCount = ((end - start + actual.n) % actual.n) + 1;

  assert.equal(right.length, actual.n);
  assert.equal(left.length, expectedWrappedCount);
  assert.ok(left.includes(0));
  assert.ok(left.includes(actual.n - 1));
});

test("road-overlapping place helper is suppressed as a whole", () => {
  const capture = (def) => {
    let props;
    harness.observe((kind, geo) => {
      if (kind === "chunked")
        props = { vertices: geo.pos.length / 3, indices: geo.idx.length };
    });
    try {
      Tracks.build(def, { night: false });
      return props;
    } finally {
      harness.observe(null);
    }
  };
  const baseline = capture(circleDefinition("suppression-baseline", null));
  const suppressed = capture(circleDefinition("suppression-overlap", (api) => {
    api.place(0, 1, -api.hw[0], [4, 4, 4], [1, 0, 0]);
  }));
  const safe = capture(circleDefinition("suppression-safe", (api) => {
    api.place(0, 1, 8, [4, 4, 4], [1, 0, 0]);
  }));

  assert.deepEqual(suppressed, baseline);
  assert.equal(safe.vertices, baseline.vertices + 24);
  assert.equal(safe.indices, baseline.indices + 36);
});

test("all current track mesh buffers are finite and structurally indexable", () => {
  const issues = [];
  let trackId = "";
  harness.observe((kind, geo) => {
    if (!geo) return;
    for (const field of ["pos", "nrm"]) {
      const values = geo[field] || [];
      if (values.length % 3)
        issues.push(`${trackId} ${kind}.${field} length ${values.length}`);
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) {
          issues.push(`${trackId} ${kind}.${field}[${i}] non-finite`);
          break;
        }
      }
    }
    const vertices = (geo.pos?.length || 0) / 3;
    for (let i = 0; i < (geo.idx?.length || 0); i++) {
      const index = geo.idx[i];
      if (!Number.isInteger(index) || index < 0 || index >= vertices) {
        issues.push(`${trackId} ${kind}.idx[${i}]=${index} outside ${vertices}`);
        break;
      }
    }
  });
  try {
    for (const def of Tracks.LIST) {
      trackId = def.id;
      Tracks.build(def, { night: false });
    }
  } finally {
    harness.observe(null);
  }
  // 24 championship rounds + 16 retired/off-calendar circuits. Asserting both
  // halves is what actually matters: a classic leaking into SEASON would silently
  // lengthen the championship, and that is the failure mode worth catching.
  assert.equal(Tracks.LIST.length, 40);
  assert.equal(Tracks.SEASON.length, 24);
  assert.ok(Tracks.SEASON.every((t) => !t.classic));
  assert.deepEqual(issues, []);
});
