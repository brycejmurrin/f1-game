// lamp-density.test.mjs — LAMP DENSITY thins/densifies the baked light set.
//
// Run: node --test tests/unit/lamp-density.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
// The LightTune façade composes three siblings — same order as tools/manifest.cjs.
const LIGHTING_FILES = ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"];

function loadLightTune() {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  for (const f of LIGHTING_FILES) vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb);
  return sb.LightTune;
}

function fakeTrack(n = 400, total = 5000) {
  const ds = total / n;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  const rx = new Float64Array(n), rz = new Float64Array(n), hw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    px[i] = Math.cos(a) * 400; pz[i] = Math.sin(a) * 400; py[i] = 0;
    rx[i] = Math.cos(a); rz[i] = Math.sin(a); hw[i] = 7;
  }
  // Generic masts at ~22 m (density 1).
  const stride = Math.max(1, Math.round(22 / ds));
  const lampPosts = [];
  for (let k = 0, mi = 0; k < n; k += stride, mi++) {
    const side = (mi % 2 === 0) ? 1 : -1;
    lampPosts.push({
      k, side, kind: "halide",
      x: px[k] + rx[k] * (hw[k] + 6) * side,
      y: py[k] + 13,
      z: pz[k] + rz[k] * (hw[k] + 6) * side,
    });
  }
  return {
    n, total, px, py, pz, rx, rz, hw,
    def: { theme: "green", id: "monza" },
    lampPosts,
  };
}

function countLights(api, dens) {
  api.LT.lampDensity = dens;
  api.LT.lampGapFill = 0; // isolate density from gap-fill
  const track = fakeTrack();
  const lights = api.buildTrackLights(track);
  return lights.length / 15;
}

test("LAMP DENSITY densifies and thins the light set vs density 1", () => {
  const api = loadLightTune();
  const base = countLights(api, 1);
  const dense = countLights(api, 2);
  const sparse = countLights(api, 0.5);
  assert.ok(base > 10, `expected a real base set, got ${base}`);
  assert.ok(dense > base, `density 2 should add lights (${dense} vs ${base})`);
  assert.ok(sparse < base, `density 0.5 should thin lights (${sparse} vs ${base})`);
});

test("densify inserts into gaps shorter than 2× stride (the MCP monza no-op)", () => {
  // applyLampDensity used `for (j = 1; j < floor(span/target))` which never
  // fired when target < span < 2*target. Real circuits land many gaps there
  // once dens doubles — chrome-devtools lamps saw dens=1 and dens=2 both bake
  // 292 lights on Monza. floor((span-1)/target) is the insert count that
  // actually subdivides those gaps.
  const api = loadLightTune();
  api.LT.lampDensity = 2;
  api.LT.lampGapFill = 0;
  const n = 40, total = 880; // ds=22 → dens1 stride nodes=1, dens2 stride=1
  // Force a dens1-like spacing of 2 nodes with dens2 targetGap=1 so span=2
  // sits in the old dead band (1 < 2 < 2).
  const ds = total / n;
  const track = {
    n, total,
    px: new Float64Array(n), py: new Float64Array(n), pz: new Float64Array(n),
    rx: new Float64Array(n), rz: new Float64Array(n), hw: new Float64Array(n),
    def: { theme: "green", id: "probe" },
    lampPosts: [],
  };
  for (let i = 0; i < n; i++) {
    track.px[i] = i; track.pz[i] = 0; track.py[i] = 0;
    track.rx[i] = 1; track.rz[i] = 0; track.hw[i] = 7;
  }
  for (let k = 0; k < n; k += 2) {
    track.lampPosts.push({ k, side: 1, kind: "halide", x: k, y: 13, z: 0 });
  }
  // Sanity: dens2 targetGap should be 1 with ds=22.
  assert.equal(api.lampStrideNodes(ds), 1, `expected dens2 stride 1 at ds=${ds}`);
  const lights = api.buildTrackLights(track);
  const count = lights.length / 15;
  // 20 posts at dens1 spacing + at least one synth per gap → >20.
  assert.ok(count > track.lampPosts.length,
    `dens=2 must insert into span=2/target=1 gaps (got ${count} lights from ${track.lampPosts.length} posts)`);
});

/* ---- R2-22 / R2-31: the density maths on a circle with a known node pitch ----
 * ds = 5.5 m, so LAMP DENSITY 2 gives targetGap = 2 nodes (asserted below), and
 * a post spacing of 3 sits in (gap, 2*gap) — the band the old no-op lived in.
 * Posts are placed where buildProps would put them (px + r*(hw+6)*side), so
 * resolvePostNodes keeps their k. A light record is 15 floats: x y z .. glareW. */
const REC = 15, I_GLARE = 14;
function ringTrack(posts, n = 60) {
  const t = fakeTrack(n, n * 5.5);
  t.lampPosts = posts.map((p) => {
    const k = p.k, side = p.side;
    return { ...p, x: t.px[k] + t.rx[k] * (t.hw[k] + 6) * side, y: t.py[k] + 13, z: t.pz[k] + t.rz[k] * (t.hw[k] + 6) * side };
  });
  return t;
}
function records(api, track, dens) {
  api.LT.lampDensity = dens; api.LT.lampGapFill = 0;
  const L = api.buildTrackLights(track), out = [];
  for (let o = 0; o < L.length; o += REC) out.push(Array.from(L.slice(o, o + REC)));
  return out;
}
const keyOf = (r) => r.slice(0, 3).map((v) => v.toFixed(3)).join(",");
/** Records present at density 2 but not at density 1 = the synthetic fill lamps. */
function fillLamps(api, track) {
  const base = new Set(records(api, track, 1).map(keyOf));
  return records(api, track, 2).filter((r) => !base.has(keyOf(r)));
}
const every = (step, n, side0 = 1, extra = {}) =>
  Array.from({ length: Math.ceil(n / step) }, (_, i) => ({ k: i * step, side: i % 2 ? -side0 : side0, kind: "halide", ...extra }));

test("a post spacing inside (gap, 2*gap) still gets a fill lamp per gap, wrap-around gap included", () => {
  // Kills the floor((span-1)/gap) -> floor(span/gap)-1 mutant: at span 3, gap 2
  // the first yields 1 insert and the second 0. (The older span=2/gap=1 fixture
  // gives 1 both ways, so it never saw the dead band.)
  const api = loadLightTune();
  const t = ringTrack(every(3, 60));                       // 20 posts, 20 gaps of 3 incl. 57 -> 0
  api.LT.lampDensity = 2;
  assert.equal(api.lampStrideNodes(t.total / t.n), 2, "fixture: density 2 must give a 2-node target gap");
  assert.equal(fillLamps(api, t).length, 20, "one fill lamp in every span-3 gap, the wrap gap too");
});

test("a gap exactly one target wide is left alone", () => {
  const api = loadLightTune();
  const t = ringTrack(every(2, 60));                       // span == gap everywhere
  api.LT.lampDensity = 2;
  assert.equal(fillLamps(api, t).length, 0, "span <= gap must not insert (that would stack lamps)");
});

test("fill lamps alternate sides, carry no halo, and the wrap-around gap is filled", () => {
  const api = loadLightTune();
  // Two posts on a 60-node ring: gaps 0->6 (span 6) and 6->0 (wrap, span 54).
  const t = ringTrack([{ k: 0, side: 1, kind: "halide" }, { k: 6, side: -1, kind: "halide" }]);
  api.LT.lampDensity = 2;
  const fill = fillLamps(api, t);
  assert.equal(fill.length, 2 + 26, "floor(5/2)=2 in the short gap, floor(53/2)=26 across the wrap");
  for (const r of fill) assert.equal(r[I_GLARE], 0, "a fill lamp has no fixture, so no lens halo");
  // Lateral sign: the ring is radial, so side = sign of (position . radial) - hw.
  const sideOf = (r) => (Math.hypot(r[0], r[2]) > 400 ? 1 : -1);
  const sides = fill.slice(0, 2).map(sideOf);
  assert.notEqual(sides[0], sides[1], "consecutive fill lamps in one gap sit on opposite sides");
});

test("a fill lamp never copies the signal kind or an aimAt from its neighbour", () => {
  // The pit-entrance red-pool defect: a fill lamp inherited the signal aspect
  // and threw a red pool at the near lane. Same ring, same ordering, only the
  // neighbours' kind differs -> the fill lamps must be byte-identical to those
  // beside kind-less posts (an ordinary kind, e.g. halide, is legitimately copied).
  const api = loadLightTune();
  const plain = fillLamps(api, ringTrack(every(3, 60, 1, { kind: null })));
  const sig = fillLamps(api, ringTrack(every(3, 60, 1, { kind: "signal" })));
  const aimed = fillLamps(api, ringTrack(every(3, 60, 1, { kind: null, aimAt: [0, 0, 0] })));
  assert.ok(plain.length === 20 && sig.length === 20 && aimed.length === 20);
  assert.deepEqual(sig, plain, "signal-kind neighbours leaked their kind into the fill lamps");
  assert.deepEqual(aimed, plain, "aimAt neighbours leaked their aim into the fill lamps");
  // And the neighbours themselves really are different, so the comparison can fail.
  const post = (k) => records(api, ringTrack(every(3, 60, 1, { kind: "signal" })), 1)[k];
  const plainPost = (k) => records(api, ringTrack(every(3, 60, 1, { kind: null })), 1)[k];
  assert.notDeepEqual(post(1), plainPost(1), "a signal post must differ from a halide post");
});

test("LAMP DENSITY below 1 keeps every gap-th post and wraps like a ring", () => {
  const api = loadLightTune();
  const t = ringTrack(every(1, 60));                       // a post on every node
  const extras = records(api, t, 1).length - 60;           // constant start-gantry lights
  api.LT.lampDensity = 0.5;
  const gap = api.lampStrideNodes(t.total / t.n);
  assert.ok(gap >= 4, `fixture: density 0.5 should give a wide gap (got ${gap})`);
  assert.equal(records(api, t, 0.5).length - extras, Math.ceil(60 / gap),
    "first post kept, then one per gap nodes");
});

test("dressingExcluded lamps aliases match floodlights/lighting rules", () => {
  // Source-level: the mast pass queries "lamps", and LIGHTING_KINDS treats the
  // three names as one family (any rule ↔ any query).
  const src = read("js/track/scenery/build-props.js");
  assert.match(src, /dressingExcluded\("lamps"/);
  assert.match(src, /LIGHTING_KINDS\s*=\s*\{\s*lamps:\s*1,\s*floodlights:\s*1,\s*lighting:\s*1/);
  assert.match(src, /kinds\.some\(\(knd\)\s*=>\s*LIGHTING_KINDS\[knd\]\)/);
});

test("street posts and flood banks share one lampPosts bake, one LAMPS tab", () => {
  const lighting = read("js/lighting/track-lights.js") + read("js/lighting/knobs.js");
  assert.match(lighting, /function buildTrackLights/);
  assert.doesNotMatch(lighting, /function buildFloodLights/);
  assert.doesNotMatch(lighting, /group:\s*"FLOODLIGHTS"/);
  const api = loadLightTune();
  const lamps = api.TUNE_DEFS.filter((d) => d.group === "LAMPS");
  assert.ok(lamps.length >= 20, `expected a full LAMPS tab, got ${lamps.length}`);
  assert.ok(lamps.some((d) => d.id === "floodDay" && d.label === "DAYTIME LAMPS"));
  assert.ok(lamps.some((d) => d.id === "lampLevel"));
  assert.equal(api.TUNE_DEFS.filter((d) => d.group === "FLOODLIGHTS").length, 0);
});
