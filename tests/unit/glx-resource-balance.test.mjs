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
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Three distinct buckets, above createChunkedMesh's 2000-triangle floor.
function chunkedGeo() {
  const pos = [], idx = [];
  for (let cell = 0; cell < 3; cell++) {
    const v = pos.length / 3, x = cell * 500;
    pos.push(x, 0, 0, x + 1, 0, 0, x, 0, 1);
    for (let i = 0; i < 800; i++) idx.push(v, v + 1, v + 2);
  }
  return { pos: Float32Array.from(pos), nrm: new Float32Array(pos.length),
    col: new Float32Array(pos.length).fill(1), idx: Uint16Array.from(idx) };
}

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

test("healthy chunked mesh churn returns every buffer and VAO", () => {
  const h = bootGlx(), base = live(h);
  for (let i = 0; i < 3; i++) {
    const mesh = h.GLX.createChunkedMesh(chunkedGeo(), 72);
    assert.equal(mesh.chunks.length, 3);
    assert.equal(live(h).Buffer, base.Buffer + 2);
    assert.equal(live(h).VertexArray, base.VertexArray + 1);
    h.GLX.freeChunkedMesh(mesh);
    assert.deepEqual(live(h), base);
  }
});

for (const failBucket of [1, 3]) test(`chunked index allocation failure in bucket ${failBucket} retires unpublished GPU handles`, () => {
  const h = bootGlx(), prior = h.GLX.createMesh(tri());
  h.GLX.begin(h.frame()); h.GLX.draw(prior, IDENTITY);
  const base = live(h), failure = new RangeError("Array buffer allocation failed");
  let buckets = 0;
  h.sandbox.Uint16Array = new Proxy(Uint16Array, {
    construct(T, args) {
      // ChunkBins emits Int32Array buckets; the pad and vertex pack are distinct.
      if (args[0] instanceof Int32Array && ++buckets === failBucket) throw failure;
      return Reflect.construct(T, args);
    },
  });
  assert.throws(() => h.GLX.createChunkedMesh(chunkedGeo(), 72), e => e === failure);
  assert.equal(buckets, failBucket);
  assert.deepEqual(live(h), base, "no caller receives the partial allocation to free later");
  assert.equal(h.calls.filter(([name]) => name === "bindVertexArray").at(-1)[1][0], null);
  const beforeDraw = h.count("bindVertexArray");
  h.GLX.draw(prior, IDENTITY);
  assert.equal(h.count("bindVertexArray"), beforeDraw + 1, "the cached prior VAO must bind again after failure");
});
