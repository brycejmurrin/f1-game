/* shadow-pass-depth — the SUN shadow map's depth span must hold a 250 m prop.
 *
 * WHY THIS EXISTS. ShadowPass.sunPass built its light camera 150 m up the sun
 * axis from the anchor with near 1 / far 320, so anything more than ~149 m
 * toward the sun was clipped by the near plane and cast NO shadow — the tops of
 * Singapore's towers (to 250 m), Baku, Vegas and Jeddah. This drives the REAL
 * sunPass (js/render/shared/shadow-pass.js with the real M4) against a stub
 * renderer, captures the light VP it hands gfx.shadowBegin, and projects points
 * through it: a 250 m prop top at the anchor must land inside the depth range at
 * every sun elevation, and the receiver side (ground well below the anchor,
 * away from the sun) must not have lost the 170 m it had. It also pins the
 * depth-span compensation that span change needs (ShadowPass.SUN_DEPTH_K,
 * applied to the sun-map bias and PCSS gap in GLX, TLX and WGX, never the car
 * map). No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function sunVP(sunDir, ctr = [0, 0, 0]) {
  const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, Infinity });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: false, moonShadow: 0, lampShadow: false } };
    var PerfGov = { tier: () => 0 };`, ctx);
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx,
    { filename: "shadow-pass.js" });
  let vp = null;
  const noop = () => {};
  const G = {
    track: { meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx: {
      shadowBegin: m => { vp = Float32Array.from(m); },
      shadowEnd: noop, castShadow: noop, castShadowChunked: noop,
    },
    camEye: [ctr[0], ctr[1] + 3, ctr[2] - 8], camTgt: ctr.slice(), player: null, state: "race",
  };
  const sp = ctx.ShadowPass.create(G, { vStd: v => v, teamMesh: noop });
  const l = Math.hypot(...sunDir);
  sp.sunPass({ sunDir: sunDir.map(v => v / l), sunColor: [1, 1, 1] }, 0, false);
  assert.ok(vp, "sunPass never began the sun map");
  return vp;
}

/** NDC z of a world point through a column-major VP (ortho: w = 1). */
function ndcZ(m, p) {
  return m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
}

const ELEVATIONS_DEG = [25, 40, 55, 70, 85];

test("a 250 m prop at the anchor lies inside the sun map's depth range", () => {
  for (const e of ELEVATIONS_DEG) {
    const r = e * Math.PI / 180;
    const sd = [Math.cos(r) * 0.6, Math.sin(r), Math.cos(r) * 0.8];
    const vp = sunVP(sd);
    // The prop's top directly over the anchor, and one leaning 40 m toward the
    // sun's azimuth (still well inside the ±80 m box footprint).
    for (const top of [[0, 250, 0], [0.6 * 40, 250, 0.8 * 40]]) {
      const z = ndcZ(vp, top);
      assert.ok(z >= -1 && z <= 1,
        `elev ${e}°: prop top ${JSON.stringify(top)} clipped (ndc z ${z.toFixed(3)}) — near plane too close`);
    }
  }
});

test("the receiver side keeps its 170 m below the anchor", () => {
  for (const e of ELEVATIONS_DEG) {
    const r = e * Math.PI / 180;
    const sd = [Math.cos(r), Math.sin(r), 0];
    const vp = sunVP(sd);
    // A point 165 m along -sunDir from the anchor (terrain dropping away from
    // the sun): inside before the change, must stay inside.
    const p = sd.map(v => -v * 165);
    const z = ndcZ(vp, p);
    assert.ok(z >= -1 && z <= 1, `elev ${e}°: receiver 165 m down-sun clipped (ndc z ${z.toFixed(3)})`);
  }
});

/* ── Depth-span compensation: the sun map's NORMALISED bias and PCSS gap ──
 *
 * The lit shaders' biasTerm (clamped 0.0005..0.004) and the PCSS
 * receiver-blocker gap `(z - zb) * pcssPen` are in NORMALISED depth. Growing
 * the sun map from 319 m to SUN_FAR-1 m of depth grew their world size by the
 * same factor (~1.78x more push, ~1.78x less penumbra per metre of gap).
 * ShadowPass exports SUN_DEPTH_K = (CAR_FAR-1)/(SUN_FAR-1) and every backend
 * multiplies the SUN-map bias by it and divides the gap by it. The CAR map
 * (still CAR_FAR) keeps the raw biasTerm × carBiasScale. */
function shadowPassModule() {
  const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, Infinity });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx,
    { filename: "shadow-pass.js" });
  return ctx.ShadowPass;
}

test("ShadowPass exports the sun-map depth-span ratio, derived from its own constants", () => {
  const SP = shadowPassModule();
  assert.equal(SP.CAR_FAR, 320, "the car map's depth span is what the bias was tuned at");
  assert.ok(SP.SUN_FAR > SP.CAR_FAR);
  assert.equal(SP.SUN_DEPTH_K, (SP.CAR_FAR - 1) / (SP.SUN_FAR - 1));
  assert.ok(SP.SUN_DEPTH_K > 0 && SP.SUN_DEPTH_K < 1);
  // The light VP handed to shadowBegin really spans SUN_FAR - 1 m of depth: the
  // ortho's z row has norm 2/(far-near) under any orthonormal view.
  const vp = sunVP([0.3, 0.8, 0.5]);
  const span = 2 / Math.hypot(vp[2], vp[6], vp[10]);
  assert.ok(Math.abs(span - (SP.SUN_FAR - 1)) < 1e-2, `sun VP depth span ${span} != SUN_FAR-1`);
});

test("GLX applies uSunDepthK to the sun-map bias and PCSS gap, never the car map", () => {
  const src = read("js/render/glx/shaders/glsl-lit.js");
  assert.match(src, /uniform float uSunDepthK;/);
  assert.match(src, /float z = sc\.z - biasTerm \* \(uShadowRange \/ 80\.0\) \* uSunDepthK;/);
  assert.match(src, /float pen = clamp\(\(z - zb\) \* uPcssPen \/ max\(uSunDepthK, 1e-3\), 0\.0, 1\.0\);/);
  assert.match(src, /float cz = cs\.z - biasTerm \* uCarBiasScale;/, "car map bias must stay unscaled");
  const uses = src.split("\n").filter(l => /uSunDepthK/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(uses.length, 3, `uSunDepthK: 1 declaration + 2 sun-map uses, got\n${uses.join("\n")}`);
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /"uSunDepthK"/, "glx.js must locate uSunDepthK");
  assert.match(glx, /uf1\(litU\.uSunDepthK,[^\n]*ShadowPass\.SUN_DEPTH_K/);
});

test("TLX applies U.sunDepthK to the sun-map bias and PCSS gap, never the car map", () => {
  const src = read("js/render/three/tsl-lit.js");
  assert.match(src, /sunDepthK:\s+uniform\(1\.0\)/);
  assert.match(src, /uf1\(U\.sunDepthK,[^\n]*ShadowPass\.SUN_DEPTH_K/);
  assert.match(src, /const z = sc\.z\.sub\(biasTerm\.mul\(U\.shadowRange\.div\(80\.0\)\)\.mul\(U\.sunDepthK\)\)/);
  assert.match(src, /const pen = clamp\(z\.sub\(zb\)\.mul\(U\.pcssPen\)\.div\(max\(U\.sunDepthK, 1e-3\)\)/);
  assert.match(src, /const cz = cs\.z\.sub\(biasTerm\.mul\(U\.carBiasScale\)\)/, "car map bias must stay unscaled");
  const uses = src.split("\n").filter(l => /U\.sunDepthK/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(uses.length, 3, `U.sunDepthK: 1 upload + 2 sun-map uses, got\n${uses.join("\n")}`);
});

test("WGX packs SUN_DEPTH_K into params4.z and applies it on the sun map only", () => {
  const src = read("js/render/webgpu/wgsl-chunks.js");
  // FrameU: params4 at byte 320 → floats 80..83, so .z is float 82.
  const m = src.match(/params4\s*:\s*vec4<f32>,\s*\/\/ off (\d+)/);
  assert.ok(m, "FrameU params4 moved");
  const zIdx = Number(m[1]) / 4 + 2;
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, new RegExp(`d\\[${zIdx}\\] = [^\\n]*ShadowPass\\.SUN_DEPTH_K`),
    `_writeFrame must pack SUN_DEPTH_K at float ${zIdx} (params4.z)`);
  assert.match(src, /let sunK = max\(F\.params4\.z, 1e-3\);/);
  assert.match(src, /let refD = ndc\.z - biasTerm \* \(shRange \/ 80\.0\) \* sunK;/);
  assert.match(src, /let pen = clamp\(\(refD - zb\) \* F\.params4\.x \/ sunK, 0\.0, 1\.0\);/);
  assert.match(src, /let crefD = cn\.z - biasTerm \* F\.params6\.y;/, "car map bias must stay unscaled");
});
