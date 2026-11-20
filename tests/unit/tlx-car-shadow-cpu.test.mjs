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

// R20 (#5777): a car shadow caster (car-draw.js data._casterOnly) is position + index, and no lit entry draws it.
const A = (array, itemSize) => ({ array, itemSize, count: array.length / itemSize });
function casterRig() {
  const warns = [], recs = [];
  class BufferGeometry {
    constructor() { this.attributes = {}; this.index = null; this.userData = {}; }
    setAttribute(k, a) { this.attributes[k] = a; }
    setIndex(a) { this.index = a; }
  }
  const THREE = { BufferGeometry, BufferAttribute: function (array, itemSize) { return A(array, itemSize); } };
  const TLXShaders = { packIndex: (T, idx, verts) => A(verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1) };
  const pk = (T, src, n, size) => A(new Float32Array(n), size);
  // A renderer METHOD (`name(args) {` in the returned object), lifted as a function of the same body.
  const method = (sig) => lift(tlx.replace("        " + sig + " {", "function m_" + sig + " {"), "m_" + sig.slice(0, sig.indexOf("(")));
  const h = new Function("THREE", "TLXShaders", "_pk", "Log", "recs", `
    const renderer = { backend: { isWebGPUBackend: true } }, _regGeo = (g) => g;
    let _capture = null, _casterWarned = false, _mirGlass = 0, _mirGlassSeen = false;
    const _coOn = true, _drawMatMode = 0, vizMat = null, lit = {}, skipBatches = () => false, poolModelMat = (m) => m;
    const materialFor = () => "lit", drawEm = () => 0, drawAl = () => 1, fxFor = () => false, chunkedSys = null;
    const _mirActive = false, _mirDead = false, mirRT = { texture: {} }, _mirRenders = 1, _mirReady = true, _mirFlip = true;
    const fx = { mirrorGlassMaterial: () => "glass", decalMaterialFor: () => "decal" }, _fxFrame = { decals: 0 };
    const _decalAppend = () => false, fxMatFor = (m) => m;
    const pushRec = (geo) => { recs.push(geo); };
    ${lift(tlx, "buildGeometry")}
    ${tlx.includes("function casterRefused(") ? lift(tlx, "casterRefused") : "function casterRefused() { return false; }"}
    ${lift(tlx, "_coAppend")}
    ${lift(tlx, "_captureRec")}
    ${method("draw(mesh, model, opts)")}
    ${method("drawChunked(mesh, model, opts)")}
    ${method("drawMirrorGlass(mesh, model, opts)")}
    ${method("drawDecal(mesh, modelMat, tex, opts)")}
    return { build: buildGeometry, draw: m_draw, drawChunked: m_drawChunked, drawMirrorGlass: m_drawMirrorGlass, drawDecal: m_drawDecal,
      coAppend: _coAppend, captureRec: _captureRec, capture: (on) => (_capture = on ? [] : null) };`)(THREE, TLXShaders, pk, { warn: (...a) => warns.push(a) }, recs);
  return { ...h, warns, recs };
}
const TRI = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], mat: [61, 61, 61], idx: [0, 1, 2] };

test("a caster-only build is exactly position + index; an ordinary build keeps the lit vertex format", () => {
  const r = casterRig();
  const lit = r.build({ ...TRI });
  assert.deepEqual(Object.keys(lit.attributes).sort(), ["color", "mat", "normal", "position", "trk"]);
  assert.ok(lit.userData.tlxFx === true && !lit.__tlxCasterOnly, "the finish scan still runs for a lit car mesh");
  const g = r.build({ ...TRI, _casterOnly: true, _releaseCpuMirror: true });
  assert.deepEqual(Object.keys(g.attributes), ["position"], "no normal, colour, mat or trk is allocated");
  assert.deepEqual(Array.from(g.attributes.position.array), TRI.pos, "the same positions");
  assert.ok(g.index && g.index.array instanceof Uint16Array, "indexed, same index packing");
  assert.deepEqual(Array.from(g.index.array), TRI.idx, "the same triangles");
  assert.ok(g.__tlxCasterOnly === true, "marked for the lit guard");
});

// pushRec is unguarded on purpose (callers index the record it wrote), so every ENTRY that takes a mesh refuses.
test("no renderer entry point records a caster-only geometry, and all of them together warn once", () => {
  const r = casterRig(), W = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], tex = { tex: {} };
  const caster = { __tlx: true, geo: r.build({ ...TRI, _casterOnly: true }) }, body = { __tlx: true, geo: r.build({ ...TRI }) };
  r.draw(caster, W, {}); r.draw(caster, W, {});
  r.draw(caster, W, { coalesce: true });
  assert.ok(r.coAppend(caster.geo, W, {}) === false, "_coAppend: no coalesced run takes it (draw() then refuses it)");
  r.drawChunked(caster, W, {});
  assert.ok(r.drawMirrorGlass(caster, W, {}) === false, "drawMirrorGlass refuses it");
  r.drawDecal(caster, W, tex, {});
  const cap = r.capture(true);
  r.draw(caster, W, {}); r.captureRec(caster, W, {});
  assert.equal(cap.length, 0, "_captureRec: the rig warm compiles no lit program for it");
  r.capture(false);
  assert.equal(r.recs.length, 0, "draw, drawChunked, _coAppend, drawMirrorGlass, drawDecal: no draw record");
  assert.equal(r.warns.length, 1, "one Log.warn across every entry, not one per frame");
  assert.deepEqual(r.warns[0].slice(0, 2), ["gfx", "TLX: a position-only shadow caster was offered to a lit pass; not drawn"]);
  // The same entries with an ordinary mesh reach pushRec: the stubs above do not hide a refusal.
  r.draw(body, W, {}); r.drawChunked(body, W, {}); r.drawDecal(body, W, tex, {});
  assert.ok(r.recs.length === 3 && r.recs.every((g) => g === body.geo), "an ordinary mesh still draws through each");
  const cap2 = r.capture(true);
  r.draw(body, W, {});
  assert.equal(cap2.length, 1, "and is captured for the warm");
  assert.equal(r.warns.length, 1);
});

test("a healthy post frame reuses the post-health record instead of minting one per frame", () => {
  const at = tlx.indexOf('_postHealth = { state: "healthy"');
  assert.notEqual(at, -1, "healthy assignment moved");
  const guard = tlx.slice(Math.max(0, at - 160), at);
  assert.match(guard, /if \(_postHealth\.state !== "healthy" \|\| _postHealth\.attempts !== _postStrikes\)/);
});
