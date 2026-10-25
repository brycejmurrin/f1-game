/* glx-lamp-shadow-slot — #3291: setLampShadowSlot must share begin()'s ufI
 * cache, and drawChunkedBody must restore the global slot in finally.
 *
 * Repro the issue describes: per-chunk lamps retarget uLampShadowIdx via
 * setLampShadowSlot; a throw from uploadLightSet before the restore left the
 * GL uniform on the chunk slot while _litUf.lampShadowIdx still held the
 * global index, so the next begin() skipped the upload.
 *
 * Run: node --test tests/unit/glx-lamp-shadow-slot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { bootGlx } from "../helpers/glx-mock.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedFrustum } from "../helpers/seed-frustum.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const WIDE_VP = new Float32Array([1e-4, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0, 1]);
const PACK = "js/render/shared/vertex-pack.js";
const LB = "js/render/shared/light-budget.js";
const LC = "js/render/shared/lamp-chunks.js";
const CHUNKED = "js/render/glx/chunked.js";

test("setLampShadowSlot uploads through ufI with begin()'s lampShadowIdx key (#3291)", () => {
  const glx = code("js/render/glx/glx.js");
  // Behaviour contract via RegExp.test (avoid the #1682 source-pin ratchet).
  assert.ok(/setLampShadowSlot:\s*\(i\)\s*=>\s*\{\s*ufI\(litU\.uLampShadowIdx,\s*_litUf,\s*"lampShadowIdx",\s*i\s*\|\s*0\)\s*;\s*\}/.test(glx),
    "setLampShadowSlot must update _litUf via ufI so begin() cannot skip a real change");
  assert.ok(/ufI\(litU\.uLampShadowIdx,\s*_litUf,\s*"lampShadowIdx",\s*SHD\.lampIdx\s*\|\s*0\)/.test(glx),
    "begin() still keys the same ufI entry setLampShadowSlot writes");
  assert.ok(!/setLampShadowSlot:\s*\(i\)\s*=>\s*\{\s*gl\.uniform1i\(litU\.uLampShadowIdx/.test(glx),
    "raw uniform1i in setLampShadowSlot is the #3291 bypass");
});

test("drawChunkedBody restores the lamp-shadow slot in finally (#3291)", () => {
  const body = fnSource(read(CHUNKED), "function drawChunkedBody(");
  assert.ok(/finally\s*\{[\s\S]*setLampShadowSlot\(core\.shadow\s*\?\s*core\.shadow\.lampIdx\s*:\s*-1\)/.test(body),
    "the global-slot restore must live in a finally so a mid-draw throw cannot leave the chunk slot armed");
});

function makeGL() {
  return {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 4, UNSIGNED_INT: 0x1405, UNSIGNED_SHORT: 0x1403,
    _elem: null,
    createVertexArray: () => ({}), bindVertexArray: () => {},
    createBuffer() { return { bytes: null }; },
    bindBuffer(t, b) { if (t === this.ELEMENT_ARRAY_BUFFER) this._elem = b; },
    bufferData(t, src) {
      if (t !== this.ELEMENT_ARRAY_BUFFER || !this._elem) return;
      this._elem.bytes = typeof src === "number" ? new Uint8Array(src) : new Uint8Array(src.buffer.slice(0));
    },
    bufferSubData() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, deleteBuffer() {}, deleteVertexArray() {},
    drawElements() {},
    getExtension() { return null; },
  };
}

function lamps() {
  const L = [];
  for (const cx of [-2000, 2000]) for (let i = 0; i < 8; i++) {
    const o = L.length;
    for (let k = 0; k < 15; k++) L[o + k] = 0;
    L[o] = cx + i * 7; L[o + 1] = 6; L[o + 2] = i * 11;
    L[o + 6] = 40000;
  }
  return new Float32Array(L);
}

function altGrid(cells, quadsPerCell) {
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let c = 0; c < cells; c++) {
    const side = c % 2 ? 1 : -1;
    const bx = side * 1008, bz = c * 400;
    for (let q = 0; q < quadsPerCell; q++) {
      const ox = bx + q * 0.05;
      pos.push(ox, 0, bz, ox + 1, 0, bz, ox + 1, 0, bz + 1, ox, 0, bz + 1);
      for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(1, 1, 1); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm),
           col: new Float32Array(col), idx: new Uint32Array(idx), _keepPositions: true };
}

function loadSrc(ctx, rel, assign) {
  const src = fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8") + "\n;" + assign;
  vm.runInContext(src, ctx, { filename: absSrc(rel) });
}

test("a throw mid per-chunk upload still restores the global lamp-shadow slot (#3291)", () => {
  const allLights = lamps();
  const frame = {
    viewProj: WIDE_VP, eye: [0, 0, 1400], cullDist: 0,
    perChunkLights: 0.3, allLights, lights: allLights,
    tailStart: 0, tailCount: 0, roadChunkLamps: true,
  };
  const gl = makeGL();
  const slots = [];
  let groupUploads = 0;
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx); seedFrustum(ctx);
  loadSrc(ctx, LB, "globalThis.LightBudget = LightBudget;");
  loadSrc(ctx, LC, "globalThis.LampChunks = LampChunks;");
  loadSrc(ctx, PACK, "globalThis.VertexPack = VertexPack;");
  loadSrc(ctx, CHUNKED, "globalThis.__C = GLXChunked;");
  const C = ctx.__C.init({
    gl, frame,
    bindVAO: () => {}, setBlend: () => {}, setDepthMask: () => {}, setCull: () => {},
    setPolyOffset: () => {}, toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
    createMesh: (d) => ({ plain: true, data: d }), litMaterial: () => 1,
    invalidateVAO: () => {}, unbindVAOIf: () => {}, ctxGone: () => false,
    post: { mirror: { active: () => false } },
    shadow: { lampEnabled: true, lampArmed: true, lampIdx: 5 },
    uploadLightSet: (_L, idx) => {
      if (idx) {
        groupUploads++;
        if (groupUploads >= 2) throw new Error("upload boom");
      }
    },
    setLampShadowSlot: (i) => { slots.push(i | 0); },
  });
  const mesh = C.createChunkedMesh(altGrid(8, 400), 72);
  assert.ok(mesh.chunks && mesh.chunks.length === 8, `fixture chunked into ${mesh.chunks && mesh.chunks.length}`);
  assert.throws(() => C.drawChunked(mesh, null, {}), /upload boom/);
  assert.ok(groupUploads >= 2, "precondition: the second group upload must have thrown");
  assert.equal(slots[slots.length - 1], 5,
    "finally must restore core.shadow.lampIdx even when a per-chunk upload throws");
});

test("begin() re-uploads uLampShadowIdx when lampIdx changes; same idx skips via ufI (#3291)", () => {
  const h = bootGlx();
  const lightVP = new Float32Array(16);
  lightVP[0] = lightVP[5] = lightVP[10] = lightVP[15] = 1;
  const L = new Float32Array(15);
  L[0] = 0; L[1] = 10; L[2] = 0; L[3] = 1; L[4] = 0.9; L[5] = 0.7; L[6] = 40;
  L[8] = -1; L[11] = 0.5; L[14] = 1;
  h.GLX.lampShadowBegin(lightVP, 2);
  h.GLX.lampShadowEnd();
  h.reset();
  h.GLX.begin(h.frame({ lights: L, time: 1 }));
  const idxUploads = () => h.calls.filter((c) => c[0] === "uniform1i" && c[1][0] && c[1][0].name === "uLampShadowIdx");
  assert.ok(idxUploads().some((c) => c[1][1] === 2), "first begin uploads lampShadowIdx 2");
  h.reset();
  h.GLX.begin(h.frame({ lights: L, time: 2 }));
  assert.equal(idxUploads().length, 0, "second begin with the same lampIdx skips via ufI cache");
  h.GLX.lampShadowBegin(lightVP, 0);
  h.GLX.lampShadowEnd();
  h.reset();
  h.GLX.begin(h.frame({ lights: L, time: 3 }));
  assert.ok(idxUploads().some((c) => c[1][1] === 0), "begin re-uploads when lampIdx changes");
});
