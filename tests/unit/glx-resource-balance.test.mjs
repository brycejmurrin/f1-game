/* glx-resource-balance.test.mjs — GLX must not leak GL objects across resize, mesh churn or context loss.
 *
 * Found while hunting live with the js-debugger (docs/notes/LIVE-DEBUGGER-RENDER-2026-10-16.md): the static
 * create/delete counts in js/render/glx are unequal by design (lazy singleton targets, reallocated on resize), so the
 * live evidence is the recording mock: live = created - deleted per GL kind. After the first resize round has allocated
 * the lazy post/shadow targets, further size changes must add nothing; createMesh/freeMesh must return to baseline; a
 * lost context must not create anything.
 *
 * Run: node --test tests/unit/glx-resource-balance.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootGlx } from "../helpers/glx-mock.mjs";

const KINDS = ["Texture", "Buffer", "VertexArray", "Framebuffer", "Renderbuffer", "Program", "Shader", "Query", "Sampler"];
const live = (h) => Object.fromEntries(KINDS.map((k) => [k, h.count("create" + k) - h.count("delete" + k)]));
const tri = () => ({ pos: new Float32Array(9), nrm: new Float32Array(9), col: new Float32Array(12), idx: [0, 1, 2] });
const SIZES = [[800, 450], [1280, 720], [390, 844], [844, 390], [1920, 1080], [800, 450]];

function resizeRound(h) {
  for (const [w, ht] of SIZES) {
    h.canvas.width = w; h.canvas.height = ht;
    h.GLX.resize();
    h.GLX.begin(h.frame());
  }
}

test("repeated resizes allocate nothing once the lazy targets exist", () => {
  const h = bootGlx();
  resizeRound(h);
  const warm = live(h);
  resizeRound(h); resizeRound(h);
  assert.deepEqual(live(h), warm);
});

test("createMesh/freeMesh returns every buffer and VAO", () => {
  const h = bootGlx();
  const base = live(h);
  const meshes = Array.from({ length: 20 }, () => h.GLX.createMesh(tri()));
  assert.equal(live(h).Buffer, base.Buffer + 40);
  assert.equal(live(h).VertexArray, base.VertexArray + 20);
  for (const m of meshes) h.GLX.freeMesh(m);
  assert.deepEqual(live(h), base);
});

test("a lost context creates nothing and frees nothing twice", () => {
  const h = bootGlx();
  const m = h.GLX.createMesh(tri());
  h.loseContext();
  const before = live(h);
  assert.equal(h.GLX.createMesh(tri()), null);
  h.GLX.freeMesh(m);
  assert.deepEqual(live(h), before);
});
