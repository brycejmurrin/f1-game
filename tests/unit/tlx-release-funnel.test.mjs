/* tlx-release-funnel.test.mjs — #7334 (render architecture review R1-R3): every TLX GPU release goes through
 * TLXUtil (js/render/three/tlx-util.js). three frees a RenderObject only when the OBJECT or the MATERIAL dispatches
 * "dispose" (GPUMEM-HUNT G1, tlx-gpumem-leak.test.mjs); a hand-written copy of that rule, or a try that wraps two
 * disposes, is how G1, the 2026-10-02 picker leak and tsl-aa's skipped outInit happened.
 *   releaseObject(m)    — an object being freed: InstancedMesh.dispose(), else the Object3D "dispose" event.
 *   dropRenderObject(o) — drop the cached RenderObject only (the event; never InstancedMesh.dispose(), which in r187
 *                         also frees instanceMatrix / instanceColor that a pooled or live object still uses).
 *   safeDispose(...xs)  — each resource in its own try; null and dispose-less values skipped.
 * The guard below is what a new three consumer reads to learn the rule. ALLOW needs a reason per entry. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
import { installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/render/three");
const utilSrc = fs.readFileSync(path.join(DIR, "tlx-util.js"), "utf8");
const uctx = vm.createContext({ Math, WeakSet, Promise, Error, Uint8ClampedArray, performance, setTimeout, document: { createElement: () => ({}) } });
vm.runInContext(utilSrc + "\nglobalThis.__u = TLXUtil;", uctx, { filename: absSrc("js/render/three/tlx-util.js") });
const U = uctx.__u;

test("releaseObject: an InstancedMesh gets dispose(), a plain Mesh the dispose event; null and throws are swallowed", () => {
  const im = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 2);
  const seen = [];
  let matrixFreed = 0;
  im.addEventListener("dispose", () => seen.push("im"));
  const imDispose = im.dispose.bind(im);
  im.dispose = () => { matrixFreed++; imDispose(); };
  U.releaseObject(im);
  assert.deepEqual(seen, ["im"], "InstancedMesh.dispose() dispatches the event");
  assert.equal(matrixFreed, 1);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  let meshDispose = 0;
  mesh.dispose = () => { meshDispose++; };
  mesh.addEventListener("dispose", () => seen.push("mesh"));
  U.releaseObject(mesh);
  assert.deepEqual(seen, ["im", "mesh"], "a plain Mesh gets the Object3D event");
  assert.equal(meshDispose, 0, "and not dispose(): absent on older three, a different object's method on a stand-in");
  U.releaseObject(null); U.releaseObject(undefined);
  const bad = new THREE.Mesh();
  bad.addEventListener("dispose", () => { throw new Error("no render object yet"); });
  assert.doesNotThrow(() => U.releaseObject(bad));
  // An isInstancedMesh stand-in with no dispose() gets the event (as tlx.js disposeInstancedObject did).
  let stubEvents = 0;
  U.releaseObject({ isInstancedMesh: true, dispatchEvent(e) { if (e.type === "dispose") stubEvents++; } });
  assert.equal(stubEvents, 1);
});

test("dropRenderObject: the event only, never InstancedMesh.dispose(); a geometry gets its own event", () => {
  const im = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 2);
  let disposed = 0, events = 0;
  im.dispose = () => { disposed++; };
  im.addEventListener("dispose", () => events++);
  U.dropRenderObject(im);
  assert.equal(events, 1); assert.equal(disposed, 0, "a pooled InstancedMesh keeps its instanceMatrix");
  const g = new THREE.BufferGeometry();
  let ge = 0; g.addEventListener("dispose", () => ge++);
  U.dropRenderObject(g); assert.equal(ge, 1);
  U.dropRenderObject(null); U.dropRenderObject({});
  const bad = new THREE.Mesh(); bad.addEventListener("dispose", () => { throw new Error("stale"); });
  assert.doesNotThrow(() => U.dropRenderObject(bad));
});

test("safeDispose: a throwing first resource does not stop the second; null and dispose-less are skipped", () => {
  const order = [];
  const a = { dispose() { order.push("a"); throw new Error("device lost"); } };
  const b = { dispose() { order.push("b"); } };
  assert.doesNotThrow(() => U.safeDispose(a, null, undefined, {}, { dispose: 1 }, b));
  assert.deepEqual(order, ["a", "b"]);
  assert.doesNotThrow(() => U.safeDispose());
});

test("tsl-aa TAA dispose(): a throwing histInit still disposes outInit (fails on base: one try wrapped both)", () => {
  installThreeGlobals();
  if (!globalThis.TLXUtil) vm.runInThisContext(utilSrc + "\nglobalThis.TLXUtil = TLXUtil;", { filename: absSrc("js/render/three/tlx-util.js") });
  for (const file of ["tsl-chunks.js", "tsl-post.js", "tsl-aa.js"]) {
    vm.runInThisContext(fs.readFileSync(path.join(DIR, file), "utf8"), { filename: absSrc(`js/render/three/${file}`) });
  }
  const made = [];
  class DT extends THREE.DataTexture {
    constructor(...a) { super(...a); this.idx = made.length; this.freed = false; made.push(this); }
    dispose() { this.freed = true; if (this.idx === 0) throw new Error("device dying"); super.dispose(); }
  }
  const T = Object.assign({}, THREE, { DataTexture: DT });
  const ldr = new THREE.RenderTarget(8, 8);
  const aa = window.TLXAA.taa(T, THREE.TSL, { runPass() {}, ownRT: (rt) => rt, trackMaterial() {},
    ldrTex: ldr.texture, depthTex: new THREE.DepthTexture(8, 8) });
  assert.equal(made.length, 2, "histInit and outInit");
  assert.doesNotThrow(() => aa.dispose());
  assert.deepEqual(made.map((t) => t.freed), [true, true], "outInit freed although histInit threw");
  ldr.dispose();
});

// R3: no bare release outside the funnel. Same patterns as the #7334 census (42 sites on base d31ca108), matched on
// comment-stripped source and across lines, so a multi-line try or a quoted "type" key is caught too.
const ALLOW = [];   // { file, line: "<source text>", why: "<reason>" }
const BARE_TRY = /try\s*\{[^{}]*\.dispose\(\)[^{}]*\}\s*catch/;
const BARE_EVENT = /dispatchEvent\(\{\s*["']?type["']?\s*:\s*["']dispose["']/;
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");

test("guard: no try/dispose or dispose-event dispatch in js/render/three outside tlx-util.js", () => {
  const hits = [], used = new Set();
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".js") && n !== "tlx-util.js").sort()) {
    const raw = fs.readFileSync(path.join(DIR, f), "utf8"), src = stripComments(raw);
    for (const re of [BARE_TRY, BARE_EVENT]) {
      for (const m of src.matchAll(new RegExp(re.source, "g"))) {
        const line = src.slice(0, m.index).split("\n").length, text = raw.split("\n")[line - 1].trim();
        const a = ALLOW.find((x) => x.file === f && text.includes(x.line) && x.why);
        if (a) { used.add(a); continue; }
        hits.push(`js/render/three/${f}:${line}: ${text}`);
      }
    }
  }
  assert.deepEqual(hits, [], "route these through TLXUtil.releaseObject / dropRenderObject / safeDispose (tlx-util.js)");
  for (const a of ALLOW) {
    assert.ok(a.why && a.why.length > 10, `allowlist entry ${a.file} needs a reason`);
    assert.ok(used.has(a), `stale allowlist entry ${a.file}: "${a.line}" matches no site`);
  }
});

test("guard self-check: the patterns catch both shapes, multi-line too, and the funnel's own sites", () => {
  const cases = [
    [BARE_TRY, "try { a.dispose(); b.dispose(); } catch (_) { /* */ }", true],
    [BARE_TRY, "try {\n  a.dispose();\n} catch (_) {}", true],
    [BARE_EVENT, 'm.dispatchEvent({ type: "dispose" });', true],
    [BARE_EVENT, "m.dispatchEvent({ 'type': 'dispose' });", true],
    [BARE_TRY, stripComments("TLXUtil.safeDispose(a);   // try { x.dispose() } catch"), false],
    [BARE_TRY, stripComments(utilSrc), true],     // tlx-util.js holds the one try
    [BARE_EVENT, stripComments(utilSrc), true],   // and the one dispatch
  ];
  const wrong = cases.filter(([re, text, want]) => re.test(text) !== want).map(([, text]) => text.slice(0, 60));
  assert.deepEqual(wrong, []);
});

// The other three files load BEFORE tlx-util.js (tools/manifest.cjs DEFERRED three); they are safe only while they read
// TLXUtil at call time. tlx.js is the one that may destructure it at eval (DEFERRED_EDGES tlx-util -> tlx).
test("load order: no three file but tlx.js reads TLXUtil at eval (a top-level binding from it)", () => {
  const evalRead = /^(?:const|let|var)\s+[^=\n]*=\s*TLXUtil\b/m;
  const bad = fs.readdirSync(DIR).filter((n) => n.endsWith(".js") && n !== "tlx.js" && n !== "tlx-util.js")
    .filter((n) => evalRead.test(stripComments(fs.readFileSync(path.join(DIR, n), "utf8"))));
  assert.deepEqual(bad, []);
});
