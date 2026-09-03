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
const LIGHTING_FILES = ["js/game/lighting-knobs.js", "js/game/track-lights.js", "js/game/frame-lights.js", "js/game/lighting.js"];

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

test("dressingExcluded lamps aliases match floodlights/lighting rules", () => {
  // Source-level: the mast pass queries "lamps", and LIGHTING_KINDS treats the
  // three names as one family (any rule ↔ any query).
  const src = read("js/track/tracks.js");
  assert.match(src, /dressingExcluded\("lamps"/);
  assert.match(src, /LIGHTING_KINDS\s*=\s*\{\s*lamps:\s*1,\s*floodlights:\s*1,\s*lighting:\s*1/);
  assert.match(src, /kinds\.some\(\(knd\)\s*=>\s*LIGHTING_KINDS\[knd\]\)/);
});

test("street posts and flood banks share one lampPosts bake, one LAMPS tab", () => {
  const lighting = read("js/game/track-lights.js") + read("js/game/lighting-knobs.js");
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
