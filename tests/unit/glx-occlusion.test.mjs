/* glx-occlusion — the fail-safe contract of GLX occlusion culling.
 *
 * The saving this feature buys is measured elsewhere (a census, on a real GPU).
 * What CAN be tested without a GPU is the half that matters more: that every
 * uncertainty resolves to VISIBLE. A wrong answer here is not a slow frame, it
 * is a hole in the world, so each way of not knowing gets its own assertion —
 * no program, no result yet, out of frustum, and the flag turned back off.
 *
 * Run: node --test tests/unit/glx-occlusion.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedFrustum } from "../helpers/seed-frustum.mjs";
import { stateRecorder, snapshot, diff } from "../helpers/gl-state.mjs";

const SRC = new URL("../../js/render/glx/chunked.js", import.meta.url);
const PACK_SRC = new URL("../../js/render/shared/vertex-pack.js", import.meta.url);

// Everything inside: a uniform 1/10000 scale puts every chunk of the fixture
// well within the extracted planes, so the frustum never decides anything here
// and each test isolates the occlusion term.
const WIDE_VP = new Float32Array([1e-4,0,0,0, 0,1e-4,0,0, 0,0,1e-4,0, 0,0,0,1]);

function makeGL(opts) {
  const o = opts || {};
  const gl = {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 4, UNSIGNED_INT: 0x1405, UNSIGNED_SHORT: 0x1403,
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, CURRENT_PROGRAM: 0x8b8d, CULL_FACE: 0xb44, LESS: 0x201, LEQUAL: 0x203,
    ANY_SAMPLES_PASSED_CONSERVATIVE: 0x8d6a, QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867,
    _elem: null, _array: null, _draws: 0, _queries: 0, _queryMade: 0,
    _queryDeletes: 0, _boxDraws: 0, _inQuery: false,
    createVertexArray: () => ({}), bindVertexArray: () => {},
    createBuffer() { return { bytes: null }; },
    bindBuffer(t, b) { if (t === this.ELEMENT_ARRAY_BUFFER) this._elem = b; else this._array = b; },
    bufferData(t, src) {
      if (t !== this.ELEMENT_ARRAY_BUFFER || !this._elem) return;
      this._elem.bytes = typeof src === "number" ? new Uint8Array(src) : new Uint8Array(src.buffer.slice(0));
    },
    bufferSubData(t, off, src) {
      if (t !== this.ELEMENT_ARRAY_BUFFER || !this._elem || !this._elem.bytes) return;
      this._elem.bytes.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), off);
    },
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    deleteBuffer() {}, deleteVertexArray() {},
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => o.compileFails !== true,
    getShaderInfoLog: () => "stub compile failure",
    deleteShader() {}, deleteProgram() {},
    createProgram: () => ({}), attachShader() {}, bindAttribLocation() {}, linkProgram() {},
    getProgramParameter: () => o.linkFails !== true,
    getProgramInfoLog: () => "stub link failure",
    getUniformLocation: () => ({}), useProgram() {}, uniformMatrix4fv() {}, uniform3f() {},
    getParameter() { return null; },
    colorMask() {}, depthFunc(f) { this._depthFunc = f; },
    createQuery() { return o.queryFails ? null : { n: ++this._queryMade }; },
    deleteQuery() { this._queryDeletes++; },
    beginQuery() { this._inQuery = true; this._queries++; },
    endQuery() { this._inQuery = false; },
    // `available` and `result` are the two knobs every test below turns.
    getQueryParameter(q, which) {
      if (which === this.QUERY_RESULT_AVAILABLE) return o.available !== false;
      return o.result !== false;
    },
    drawElements(mode, count) { this._draws++; if (count === 36) this._boxDraws++; },
  };
  return gl;
}

function load(gl, frame, over) {
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx); seedFrustum(ctx);
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") + "\n;globalThis.VertexPack = VertexPack;", ctx);
  vm.runInContext(fs.readFileSync(SRC, "utf8") + "\n;globalThis.__C = GLXChunked;", ctx);
  return ctx.__C.init(Object.assign({
    gl, frame, bindVAO: () => {}, setBlend: () => {}, setDepthMask: () => {}, setCull: () => {},
    setPolyOffset: () => {}, toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
    createMesh: (d) => ({ plain: true, data: d }), litMaterial: () => 1,
    invalidateVAO: () => {}, unbindVAOIf: () => {}, ctxGone: () => false,
  }, over || null));
}

// Separated quads, one cell each, over the 2000-triangle floor that
// createChunkedMesh needs before it will chunk at all.
function grid(cells, quadsPerCell) {
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let c = 0; c < cells; c++) for (let q = 0; q < quadsPerCell; q++) {
    const ox = c * 400 + q * 0.5;
    pos.push(ox, 0, 0, ox + 1, 0, 0, ox + 1, 0, 1, ox, 0, 1);
    for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(1, 1, 1); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm),
           col: new Float32Array(col), idx: new Uint32Array(idx), _keepPositions: true };
}
const setup = (glOpts) => {
  const frame = { viewProj: WIDE_VP, eye: [-10, 10, -10], cullDist: 0, perChunkLights: 0 };
  const gl = makeGL(glOpts);
  const C = load(gl, frame);
  const mesh = C.createChunkedMesh(grid(6, 400), 72);
  assert.ok(mesh.chunks && mesh.chunks.length > 1, "fixture did not chunk");
  return { gl, C, mesh, frame };
};

test("it ships OFF, and off means the draw path is untouched", () => {
  const { gl, C, mesh } = setup();
  assert.equal(C.occlusionStats().on, false);
  C.drawChunked(mesh, null, {});
  const drew = gl._draws;
  assert.ok(drew > 0, "nothing drew at all");
  C.occlusionPass();                       // a no-op while off
  assert.equal(gl._boxDraws, 0, "the query pass must not run while the flag is off");
  C.drawChunked(mesh, null, {});
  assert.equal(gl._draws, drew * 2, "the draw path changed shape with occlusion off");
});

test("a query that says HIDDEN culls the chunk — and only after it has answered", () => {
  const { gl, C, mesh } = setup({ result: false });
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});
  const before = gl._draws;
  assert.ok(before > 0, "the first frame must draw everything: nothing has answered yet");
  C.occlusionPass();                       // issues queries
  assert.ok(gl._queries > 0, "no queries were issued");
  C.drawChunked(mesh, null, {});
  C.occlusionPass();                       // harvests them: every chunk hidden
  gl._draws = 0;
  C.drawChunked(mesh, null, {});
  assert.equal(gl._draws, 0, "chunks a query called hidden must stop being drawn");
  assert.ok(C.occlusionStats().culled > 0, "the counted oracle reported no culling");
});

test("query ownership is released on toggle and mesh free", () => {
  const { gl, C, mesh } = setup();
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});
  C.occlusionPass();
  const first = gl._queryMade;
  assert.ok(first > 0, "precondition: the pass allocated query handles");

  C.occlusionCull(false);
  assert.equal(gl._queryDeletes, first, "toggle reset deletes every owned query");

  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});
  C.occlusionPass();
  const second = gl._queryMade - first;
  assert.ok(second > 0, "the fresh state allocated a new query generation");
  C.freeChunkedMesh(mesh);
  assert.equal(gl._queryDeletes, first + second, "mesh free deletes its current query generation");
});

test("query allocation failure remains fail-visible and never begins a null query", () => {
  const { gl, C, mesh } = setup({ queryFails: true });
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});
  C.occlusionPass();
  assert.equal(gl._queries, 0, "beginQuery must not receive a null handle");
  gl._draws = 0;
  C.drawChunked(mesh, null, {});
  assert.ok(gl._draws > 0, "allocation failure keeps every chunk visible");
});

test("free removes a mesh queued for the next occlusion pass", () => {
  const { gl, C, mesh } = setup();
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});             // queues the mesh, but issues no query yet
  C.freeChunkedMesh(mesh);
  C.occlusionPass();
  assert.equal(gl._queryMade, 0, "a freed mesh must not recreate query state from the pass queue");
});

test("every way of not knowing resolves to VISIBLE", async (t) => {
  await t.test("a result that has not landed yet", () => {
    const { gl, C, mesh } = setup({ result: false, available: false });
    C.occlusionCull(true);
    C.occlusionPass(); C.occlusionPass(); C.occlusionPass();
    gl._draws = 0; C.drawChunked(mesh, null, {});
    assert.ok(gl._draws > 0, "a pending query must never hide a chunk");
  });
  await t.test("a program that will not link", () => {
    const { gl, C, mesh } = setup({ linkFails: true, result: false });
    assert.equal(C.occlusionCull(true).supported, false);
    C.occlusionPass();
    gl._draws = 0; C.drawChunked(mesh, null, {});
    assert.ok(gl._draws > 0, "a backend without the program must draw everything");
  });
  await t.test("a shader that will not compile", () => {
    const { gl, C, mesh } = setup({ compileFails: true, result: false });
    assert.equal(C.occlusionCull(true).supported, false);
    gl._draws = 0; C.drawChunked(mesh, null, {});
    assert.ok(gl._draws > 0, "a backend without the shader must draw everything");
  });
  await t.test("turning the flag back off", () => {
    const { gl, C, mesh } = setup({ result: false });
    C.occlusionCull(true);
    // A draw before each pass, because the pass only walks meshes drawn THIS
    // frame — an earlier cut of this test called occlusionPass twice with no
    // draw between and the pass correctly did nothing, which read as the
    // feature being broken when it was the fixture.
    C.drawChunked(mesh, null, {}); C.occlusionPass();
    C.drawChunked(mesh, null, {}); C.occlusionPass();
    gl._draws = 0; C.drawChunked(mesh, null, {});
    assert.equal(gl._draws, 0, "precondition: the chunks are culled");
    C.occlusionCull(false);
    gl._draws = 0; C.drawChunked(mesh, null, {});
    assert.ok(gl._draws > 0, "turning it off must not strand a hidden chunk — nothing re-tests it now");
  });
});

test("the occlusion pass hands the context back at LEQUAL", () => {
  // The sky is a fullscreen triangle at depth EXACTLY 1.0, drawn after the
  // opaque pass against a depth buffer cleared to 1.0 — it needs LEQUAL, which
  // glx.js sets once at init and nothing re-sets per frame. This pass ran with
  // LESS and restored LESS in its `finally`, so every frame after the first
  // occlusion pass drew a black sky. Only reachable with the flag on, which is
  // why it shipped: the flag is OFF by default.
  const { gl, C, mesh } = setup();
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});
  C.occlusionPass();
  assert.equal(gl._depthFunc, gl.LEQUAL,
    "the pass must leave the context on the baseline depth test, not on LESS");
});

test("the occlusion pass restores EVERY piece of context state it touched", () => {
  // The generalisation of the test above, and the reason it is worth having
  // both: that one pins the enum somebody already debugged. This one pins the
  // INVARIANT — a pass borrows global state and gives it back — so the next
  // leak is caught by a test nobody had to think to write. It reports the
  // offending key by name rather than "something rendered wrong".
  //
  // No GPU required, and that is not a compromise: this is GL state, not
  // pixels, so the answer is driver-independent. ANGLE validates its own
  // replays exactly this way and runs it under SwiftShader (tests/helpers/
  // gl-state.mjs has the references).
  const frame = { viewProj: WIDE_VP, eye: [-10, 10, -10], cullDist: 0, perChunkLights: 0 };
  // The enum map lets the recorder ANSWER getParameter from the same state the
  // setters write, so the pass's save/restore of CURRENT_PROGRAM behaves as it
  // does in a real context. Without it the restore reads null, skips, and the
  // diff reports a leak the shipped renderer does not have.
  const rec = stateRecorder({ cull: true }, { program: 0x8b8d, cull: 0xb44 });
  // The context baseline GLX.init() establishes, so "restored" means "back to
  // what the renderer runs with", not merely "back to whatever it was".
  const gl = Object.assign(makeGL(), rec);
  gl.depthFunc(gl.LEQUAL);
  gl.colorMask(true, true, true, true);
  gl.useProgram({ id: "lit" });
  // drawChunked/occlusionPass reach depthMask, blend and cull through the
  // injected setters rather than the raw context, so those route into the same
  // snapshot — otherwise a leak in the half GLX wraps would be invisible here.
  const C = load(gl, frame, {
    setBlend: (on) => { rec.__state.blend = !!on; },
    setDepthMask: (on) => { rec.__state.depthMask = !!on; },
    setCull: (on) => { rec.__state.cull = !!on; },
  });
  const mesh = C.createChunkedMesh(grid(6, 400), 72);
  C.occlusionCull(true);
  C.drawChunked(mesh, null, {});

  const before = snapshot(gl);
  C.occlusionPass();
  const changed = diff(before, snapshot(gl));
  assert.deepEqual(changed, {},
    "the occlusion pass leaked context state: " + JSON.stringify(changed));
});


test("occlusion setup releases shaders and owns only complete draw resources", () => {
  const gl = makeGL();
  const made = { shader: [], program: [], vao: [], buffer: [] };
  const deleted = { shader: [], program: [], vao: [], buffer: [] };
  for (const [kind, create, remove] of [
    ["shader", "createShader", "deleteShader"], ["program", "createProgram", "deleteProgram"],
    ["vao", "createVertexArray", "deleteVertexArray"], ["buffer", "createBuffer", "deleteBuffer"],
  ]) {
    gl[create] = () => { const handle = {}; made[kind].push(handle); return handle; };
    gl[remove] = (handle) => { deleted[kind].push(handle); };
  }
  const C = load(gl, { viewProj: WIDE_VP });
  assert.equal(C.occlusionCull(true).supported, true);
  assert.deepEqual(deleted.shader, made.shader);
  assert.equal(made.shader.length, 2);
  assert.equal(made.program.length, 1);
  assert.equal(made.vao.length, 1);
  assert.equal(made.buffer.length, 2);
  for (const kind of ["program", "vao", "buffer"]) assert.equal(deleted[kind].length, 0);
  C.occlusionCull(false); C.occlusionCull(true);
  assert.equal(made.program.length, 1, "successful setup is reused");
});

test("each partial occlusion setup failure releases exactly its allocated handles", async (t) => {
  for (const failure of ["program", "vertex shader", "fragment shader", "vertex compile", "fragment compile",
                         "link", "uniform", "vao", "vertex buffer", "index buffer", "vertex upload", "index upload"]) {
    await t.test(failure, () => {
      const gl = makeGL();
      const made = { shader: [], program: [], vao: [], buffer: [] };
      const deleted = { shader: [], program: [], vao: [], buffer: [] };
      let boundVao = null;
      gl.bindVertexArray = (handle) => { boundVao = handle; };
      for (const [kind, create, remove] of [
        ["shader", "createShader", "deleteShader"], ["program", "createProgram", "deleteProgram"],
        ["vao", "createVertexArray", "deleteVertexArray"], ["buffer", "createBuffer", "deleteBuffer"],
      ]) {
        gl[create] = () => {
          const stage = kind === "shader" ? (made.shader.length ? "fragment shader" : "vertex shader") :
                        kind === "buffer" ? (made.buffer.length ? "index buffer" : "vertex buffer") : kind;
          if (stage === failure) return null;
          const handle = {}; made[kind].push(handle); return handle;
        };
        gl[remove] = (handle) => { assert.ok(handle); deleted[kind].push(handle); };
      }
      gl.getShaderParameter = (handle) => failure !== (handle === made.shader[0] ? "vertex compile" : "fragment compile");
      gl.getProgramParameter = () => failure !== "link";
      gl.getUniformLocation = () => { if (failure === "uniform") throw new Error("uniform"); return {}; };
      gl.bufferData = (target) => {
        const stage = target === gl.ARRAY_BUFFER ? "vertex upload" : "index upload";
        if (failure === stage) throw new Error(stage);
      };
      const C = load(gl, { viewProj: WIDE_VP });
      assert.equal(C.occlusionCull(true).supported, false);
      for (const kind of Object.keys(made)) {
        assert.equal(deleted[kind].length, made[kind].length, kind + " deletion count");
        assert.equal(new Set(deleted[kind]).size, made[kind].length, kind + " deleted once");
        for (const handle of made[kind]) assert.ok(deleted[kind].includes(handle), kind + " ownership");
      }
      assert.equal(boundVao, null, "failed setup unbinds its VAO");
      const allocations = Object.values(made).reduce((n, handles) => n + handles.length, 0);
      assert.equal(C.occlusionCull(true).supported, false, "partial program is never published");
      C.occlusionPass();
      assert.equal(Object.values(made).reduce((n, handles) => n + handles.length, 0), allocations,
        "failed setup does not retry allocations");
      assert.equal(gl._queries, 0);
    });
  }
});


test("occlusion setup invalidates the core VAO cache after direct bindings", async (t) => {
  for (const compileFails of [false, true]) {
    await t.test(compileFails ? "early compile failure" : "successful setup", () => {
      const gl = makeGL({ compileFails });
      let actualVao = null, cachedVao = null, binds = 0;
      gl.bindVertexArray = (vao) => { actualVao = vao; binds++; };
      const C = load(gl, { viewProj: WIDE_VP, eye: [-10, 10, -10], cullDist: 0, perChunkLights: 0 }, {
        bindVAO(vao) {
          if (vao !== cachedVao) { gl.bindVertexArray(vao); cachedVao = vao; }
        },
        invalidateVAO() { cachedVao = null; },
      });
      const mesh = C.createChunkedMesh(grid(6, 400), 72);
      C.drawChunked(mesh, null, {});
      assert.equal(actualVao, mesh.vao);
      C.occlusionCull(true);
      assert.equal(actualVao, null, "setup leaves the raw VAO unbound");
      const before = binds;
      C.drawChunked(mesh, null, {});
      assert.equal(actualVao, mesh.vao, "drawing the previously cached mesh rebinds its VAO");
      assert.equal(binds, before + 1);
    });
  }
});

for (const enabled of [true, false]) test(`proxy queries restore culling ${enabled} after a thrown draw`, () => {
  const frame = { viewProj: WIDE_VP, eye: [-10, 10, -10], cullDist: 0 };
  const gl = makeGL(); let cull = enabled; const seen = [];
  gl.getParameter = (p) => p === gl.CULL_FACE ? cull : null;
  const C = load(gl, frame, { setCull(on) { cull = on; seen.push(on); } });
  const mesh = C.createChunkedMesh(grid(6, 400), 72);
  C.occlusionCull(true); C.drawChunked(mesh, null, {});
  cull = enabled; seen.length = 0;
  gl.drawElements = () => { assert.equal(cull, false); throw new Error("query draw"); };
  assert.throws(() => C.occlusionPass(), /query draw/);
  assert.equal(cull, enabled); assert.deepEqual(seen, [false, enabled]);
});

test("eye-inside and near-plane-crossing proxies reset stale hidden results", () => {
  const { C, gl, mesh, frame } = setup({ result: false });
  C.occlusionCull(true); C.drawChunked(mesh, null, {}); C.occlusionPass();
  C.drawChunked(mesh, null, {}); C.occlusionPass();
  const chunk = mesh.chunks[0];
  frame.eye = chunk.min.map((n, i) => (n + chunk.max[i]) / 2);
  C.drawChunked(mesh, null, {}); C.occlusionPass();
  assert.ok(C.occlusionStats().culled < mesh.chunks.length, "enclosing chunk is visible");
  frame.eye = [-10, 10, -10];
  frame.viewProj = new Float32Array(WIDE_VP); frame.viewProj[14] = -1;
  C.drawChunked(mesh, null, {}); C.occlusionPass();
  assert.equal(C.occlusionStats().culled, 0, "near-plane crossing chunks stay visible");
});
