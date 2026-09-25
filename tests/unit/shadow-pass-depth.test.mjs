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
 * away from the sun) must not have lost the 170 m it had. No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function sunVP(sunDir, ctr = [0, 0, 0], propTop) {
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
    track: { propTop, meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
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

test("the depth span is PER CIRCUIT: a circuit without tall props keeps the old 150/320 (and its bias in metres)", () => {
  // An ortho maps [near, far] to [-1, 1]: dNDC/dz = 2 / (far - near). The lit
  // shaders' bias is in normalised depth, so the span IS the bias's world size.
  const r = 30 * Math.PI / 180, sd = [Math.cos(r) * 0.6, Math.sin(r), Math.cos(r) * 0.8];
  const span = (top) => {
    const vp = sunVP(sd, [0, 0, 0], top);
    const a = ndcZ(vp, [0, 0, 0]), b = ndcZ(vp, [sd[0], sd[1], sd[2]]);   // 1 m up the sun axis
    return 2 / Math.abs(a - b);
  };
  assert.ok(Math.abs(span(40) - 319) < 0.5, `a 40 m circuit: span ${span(40).toFixed(1)} m, the old 319`);
  const tall = span(250);
  assert.ok(tall > 319 && tall <= 569 + 0.5, `a 250 m tower circuit: ${tall.toFixed(1)} m, grown only as far as it needs`);
  assert.ok(Math.abs(span(undefined) - 569) < 0.5, "unknown prop height: the full 400/570");
  // …and the tall circuit's own tower still lands inside the map.
  const vp = sunVP(sd, [0, 0, 0], 250);
  for (const top of [[0, 250, 0], [0.6 * 80, 250, 0.8 * 80]]) {
    const z = ndcZ(vp, top);
    assert.ok(z > -1 && z < 1, `250 m top at ${top} -> ndc z ${z.toFixed(3)}`);
  }
});

test("Tracks measures the tallest prop above its OWN ground, before the upload", () => {
  const src = read("js/track/tracks.js");
  assert.match(src, /track\.propTop = propTop\(track, propsGeo\);/);
  assert.match(src, /const g = terrainY\(track, p\[i\], p\[i \+ 2\]\);/, "height above the prop's own terrain, not the lowest road point");
});
