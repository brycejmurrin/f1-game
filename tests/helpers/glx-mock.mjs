/* glx-mock.mjs — boot the REAL js/render/glx/glx.js (plus its shader data and
 * glx/ pass modules, in manifest order) against a recording WebGL2 mock.
 *
 * Why: the renderer's uniform caches, fail-closed guards and cull bookkeeping
 * are BEHAVIOUR — how many gl calls a second identical begin() makes, whether
 * createMesh() returns null after a context loss — but every unit test used to
 * pin them as source text (`assert.match(glx, /uf1\(litU\.uBounceK/)`), which
 * a one-token refactor breaks while a real regression can slip past. This
 * harness lets a test assert the call stream instead.
 *
 * The mock gl is a Proxy: every method is recorded in `calls`; the handful
 * whose RETURN VALUE the boot path reads (shader/program status, locations,
 * framebuffer status, parameters) answer with the healthy value. GL enum
 * lookups (`gl.BLEND`, `gl.COLOR_BUFFER_BIT`, …) are minted on first use, so
 * bitmask tests on recorded arguments must compare against the mock's own
 * `gl.CONST` values (see `enums`).
 *
 *   const h = bootGlx();            // opts: { aniso, parallel, userAgent, ls: { key: value } }
 *   h.GLX.begin(h.frame());  h.reset();  h.GLX.begin(h.frame());
 *   h.count("uniform1f")                 // → 1 (only uTime moves)
 *
 * Same idea as spike/backends/tests/unit/webgpu-lifecycle.test.mjs's mock GPUDevice for WGX.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs"));
const GLX_FILE = "js/render/glx/glx.js";
// Everything the manifest loads before glx.js is what glx.js needs: Log, M4,
// the GLSL-as-data shader files, the split pass modules, LampChunks.
const FILES = MANIFEST.FULL.slice(0, MANIFEST.FULL.indexOf(GLX_FILE) + 1);
const SOURCES = FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var")]);


export function bootGlx(opts = {}) {
  const calls = [];
  const enums = Object.create(null);
  let locSeq = 0;
  let contextLost = false;
  const enumOf = (k) => {
    if (!(k in enums)) enums[k] = 1 << (Object.keys(enums).length % 30);
    return enums[k];
  };
  // EXT_texture_filter_anisotropic, when a test asks for it (opts.aniso):
  // the enum values are the real ones so a recorded texParameterf can be
  // matched on TEXTURE_MAX_ANISOTROPY_EXT.
  const ANISO = { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047, TEXTURE_MAX_ANISOTROPY_EXT: 34046 };
  // KHR_parallel_shader_compile, when a test asks for it (opts.parallel).
  const PARALLEL = { COMPLETION_STATUS_KHR: 0x91B1 };
  const contextAttrs = [];
  const answers = {
    isContextLost: () => contextLost,
    getExtension: (name) => (opts.aniso && /anisotropic/.test(String(name)) ? ANISO
      : (opts.parallel && /parallel_shader_compile/.test(String(name)) ? PARALLEL : null)),
    getParameter: () => 16,
    // Desktop-class MSAA support, so glx/post.js takes its multisampled path.
    getInternalformatParameter: () => new Int32Array([4]),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    getUniformLocation: (_p, name) => ({ name, id: ++locSeq }),
    getAttribLocation: () => 0,
    getError: () => 0,
    createShader: () => ({ shader: true }),
    createProgram: () => ({ program: true }),
    createBuffer: () => ({ buffer: ++locSeq }),
    createTexture: () => ({ texture: ++locSeq }),
    createVertexArray: () => ({ vao: ++locSeq }),
    createFramebuffer: () => ({ fbo: ++locSeq }),
    createRenderbuffer: () => ({ rbo: ++locSeq }),
    createQuery: () => ({ query: true }),
    // Compared against gl.FRAMEBUFFER_COMPLETE, which is a minted enum here.
    checkFramebufferStatus: () => enumOf("FRAMEBUFFER_COMPLETE"),
    getQueryParameter: () => false,
    getSupportedExtensions: () => [],
  };
  const gl = new Proxy(answers, {
    get(t, k) {
      if (typeof k === "symbol") return undefined;
      if (k in t) {
        const f = t[k];
        return typeof f === "function" ? (...a) => { calls.push([k, a]); return f(...a); } : f;
      }
      if (/^[A-Z][A-Z0-9_]*$/.test(k)) return enumOf(k);
      return (...a) => { calls.push([k, a]); };
    },
    has(t, k) { return typeof k !== "symbol"; },
  });

  const canvasListeners = {};
  const canvas = {
    clientWidth: 640, clientHeight: 360, width: 640, height: 360,
    getContext: (type, attrs) => { contextAttrs.push({ type, attrs }); return type === "webgl2" ? gl : null; },
    addEventListener: (t, fn) => { canvasListeners[t] = fn; },
    removeEventListener() {},
    getBoundingClientRect: () => ({ width: 640, height: 360, left: 0, top: 0 }),
  };
  const noop = () => {};
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m }; };
  const sandbox = {
    Math, console, Object, Array, Number, JSON, Proxy, Promise, Error, Date, Map, Set,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer,
    isFinite, isNaN, parseFloat, parseInt, performance,
    setTimeout: (fn) => { sandbox.__timers.push(fn); return sandbox.__timers.length; },
    clearTimeout: noop, __timers: [],
    document: { hidden: false, addEventListener: noop, createElement: () => ({ getContext: () => null, width: 0, height: 0 }) },
    localStorage: storage(), sessionStorage: storage(),
    navigator: { userAgent: opts.userAgent || "node glx-mock", maxTouchPoints: 0 },
    screen: { width: 1280, height: 720 }, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    location: { reload: noop }, matchMedia: () => ({ matches: false, addEventListener: noop }),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0, Image: class {},
    addEventListener: noop, removeEventListener: noop,
  };
  // opts.ls seeds localStorage BEFORE GLX.init reads it — the way the game
  // stores it (GameStore JSON-encodes: `{ "apex26.gfxPreset": '"ultra"' }`).
  for (const [k, v] of Object.entries(opts.ls || {})) sandbox.localStorage.setItem(k, v);
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const [f, src] of SOURCES) vm.runInContext(src, ctx, { filename: f });
  const GLX = vm.runInContext("GLX", ctx);
  const inited = GLX.init(canvas);
  if (!inited) throw new Error("glx-mock: GLX.init() refused the mock context");

  const count = (name, pred) => calls.reduce((n, c) => n + (c[0] === name && (!pred || pred(c[1])) ? 1 : 0), 0);
  return {
    GLX, gl, calls, enums, canvas, sandbox,
    /** The mock's answer table — override to inject a GL fault, e.g.
     *  `h.answers.getError = () => 1282` (INVALID_OPERATION). */
    answers,
    /** Every canvas.getContext(type, attrs) call GLX made, in order. */
    contextAttrs,
    ANISO,
    count,
    reset: () => { calls.length = 0; },
    /** Simulate `webglcontextlost` (the browser event GLX listens for) — every
     *  entry point must then fail closed. */
    loseContext: () => {
      contextLost = true;
      if (canvasListeners.webglcontextlost) canvasListeners.webglcontextlost({ preventDefault: noop });
    },
    /** A complete world frame; override any field. */
    frame: (over = {}) => Object.assign({
      viewProj: new Float32Array(16), invViewProj: new Float32Array(16), invProj: new Float32Array(16),
      eye: [0, 2, 0], sunDir: [0.3, 0.8, 0.5], sunColor: [1, 0.95, 0.9],
      ambientSky: [0.3, 0.32, 0.36], ambientGround: [0.2, 0.19, 0.18],
      skyZenith: [0.18, 0.4, 0.78], skyHorizon: [0.62, 0.74, 0.88],
      fogColor: [0.5, 0.55, 0.6], fogDensity: 0.001, lights: [], time: 0, wetness: 0, cullDist: 0,
    }, over),
  };
}
