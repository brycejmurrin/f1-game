/* #4972 — SHADOW DARKNESS 0 stops the static sun-map rebuilds. sampleShadow early-outs on uShadowStr <= 0, so with
 * the slider at 0 the only remaining reader of the sun map is the god-ray march (GLX/WGX/TLX post: uShadowMap
 * occludes the shafts), which is gated on the sun's brightness and SUN GOD-RAYS, not on SHADOW DARKNESS. The REAL
 * ShadowPass.sunPass against a stub renderer, driven across 20 m snap cells: count shadowBegin. No browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function drive(lt, { cells = 6, sunY = 0.6 } = {}) {
  const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, Infinity });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  ctx.LightTune = { LT: Object.assign({ shadowRange: 80, carShadow: false, moonShadow: 0, lampShadow: false }, lt) };
  ctx.PerfGov = { tier: () => 0 };
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx,
    { filename: absSrc("js/render/shared/shadow-pass.js") });
  let begins = 0;
  const noop = () => {};
  const G = {
    track: { meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx: { shadowBegin: () => { begins++; }, shadowEnd: noop, castShadow: noop, castShadowChunked: noop },
    camEye: [0, 3, -8], camTgt: [0, 0, 0], player: null, state: "race",
  };
  const sp = ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: noop });
  const l = Math.hypot(0.5, sunY, 0.5), sunDir = [0.5 / l, sunY / l, 0.5 / l];
  for (let i = 0; i < cells; i++) {
    G.camEye = [0, 3, i * 40 - 8]; G.camTgt = [0, 0, i * 40];   // 40 m per frame: a new snap cell every frame
    sp.sunPass({ sunDir, sunColor: [1, 1, 1] }, 0, false);
  }
  return begins;
}

test("SHADOW DARKNESS 0 with the god-rays off: no sun-map rebuild across snap cells", () => {
  assert.equal(drive({ shadowStr: 1.15, grMul: 0 }), 6, "control: one rebuild per 20 m cell crossed");
  assert.equal(drive({ shadowStr: 0, grMul: 0 }), 0, "nothing reads the map: 0 rebuilds (before #4972: 6)");
});

test("SHADOW DARKNESS 0 keeps the map while the god-ray march still reads it", () => {
  assert.equal(drive({ shadowStr: 0, grMul: 1 }), 6, "sun up, SUN GOD-RAYS on: the shafts are occluded by this map");
  assert.equal(drive({ shadowStr: 0, grMul: 1 }, { sunY: -0.2 }), 0, "sun below the horizon: no shafts, no map");
});
