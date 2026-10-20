// M-2 / M-12 (#1647): car shadow CPU mirror release + mobile caster pad.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tlx = readFileSync(join(ROOT, "js/render/three/tlx.js"), "utf8");
const car3d = readFileSync(join(ROOT, "js/car/car3d.js"), "utf8");
const sh = readFileSync(join(ROOT, "js/render/three/tlx-shadow.js"), "utf8");

test("silhouette car builds tag CPU mirror release for TLX", () => {
  assert.match(car3d, /if \(sil\) out\._releaseCpuMirror = true/);
  assert.match(tlx, /data\._releaseCpuMirror \? "carSh" : "mesh"/);
  assert.match(tlx, /function sweepCarShadowMirrors/);
  assert.match(tlx, /sweepCarShadowMirrors\(_now\)/);
});

test("M-12: mobile skips UBO pad on the legacy padded shadow caster only", () => {
  assert.match(sh, /M-12: phones skip only the shadow caster UBO pad/);
  assert.match(sh, /\(!casterAttr && isMobile\) \? \(n \| 0\) : uboInstCap\(renderer, n\)/);
});

// Lift a named function's source (brace-matched) out of tlx.js and run it for real.
function lift(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} moved`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

test("sweepCarShadowMirrors walks only the car casters, not the whole geometry registry", () => {
  let derefs = 0;
  class CountingRef { constructor(t) { this.t = t; } deref() { derefs++; return this.t; } }
  const make = new Function("WeakRef", `
    let _carMirrorAt = -1e9;
    const _geoReg = [], _geoSeen = new WeakSet(), _carShReg = [];
    const _mirrorStat = { carSh: 0, freedMB: 0 };
    const released = [];
    function releaseGeoMirrors(g) { g.__tlxFreed = true; released.push(g); return 1048576; }
    ${lift(tlx, "sweepCarShadowMirrors")}
    ${lift(tlx, "_regGeo")}
    return { sweep: sweepCarShadowMirrors, reg: _regGeo, stat: _mirrorStat, released, geoReg: _geoReg };`);
  const h = make(CountingRef);
  const keep = [];
  for (let i = 0; i < 4000; i++) keep.push(h.reg({}, "mesh"));
  const drawn = h.reg({ __tlxDrawnBatch: 1 }, "carSh");
  const fresh = h.reg({}, "mesh");
  h.reg(fresh, "carSh");   // createMesh upgrades the kind after buildGeometry registered it
  assert.equal(h.geoReg.length, 4002, "every geometry stays in the census registry");

  derefs = 0;
  h.sweep(0);
  assert.deepEqual(h.released, [drawn], "only the drawn caster is released");
  assert.ok(derefs <= 2, `one sweep dereferenced ${derefs} refs; expected only the 2 car casters`);

  fresh.__tlxDrawnBatch = 2;
  h.sweep(1000);   // inside the 2 s throttle: nothing
  assert.equal(h.released.length, 1);
  derefs = 0;
  h.sweep(2500);
  assert.deepEqual(h.released, [drawn, fresh]);
  assert.equal(derefs, 1, "the freed caster left the list");
  derefs = 0;
  h.sweep(5000);
  assert.equal(derefs, 0, "both casters freed: the sweep walks nothing");
  assert.equal(h.stat.carSh, 2);
  void keep;
});

test("a healthy post frame reuses the post-health record instead of minting one per frame", () => {
  const at = tlx.indexOf('_postHealth = { state: "healthy"');
  assert.notEqual(at, -1, "healthy assignment moved");
  const guard = tlx.slice(Math.max(0, at - 160), at);
  assert.match(guard, /if \(_postHealth\.state !== "healthy" \|\| _postHealth\.attempts !== _postStrikes\)/);
});
