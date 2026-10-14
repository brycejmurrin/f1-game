/* fake-webgl2 — a no-op WebGL2 context (a Proxy) that lets three r186's real WebGPURenderer({ forceWebGL })
 * boot and render in Node. It counts every GL call, the bytes handed to bufferData/bufferSubData, and keeps
 * every shaderSource() string, so a unit test can read the GLSL three generated for a TSL material (the
 * hunt-1 "codegen dump" method) or count GL work per frame. It renders nothing: state and source only.
 * From the perf-hunt-3 instruments (TLX-1 lane, 2026-10-13). */
export function makeFakeGL(w = 64, h = 64) {
  const consts = new Map(); let nextC = 0x10000;
  const names = new Map();
  const C = (n) => { let v = consts.get(n); if (v === undefined) { v = nextC++; consts.set(n, v); names.set(v, n); } return v; };
  const counts = Object.create(null);
  const bytes = { bufferData: 0, bufferSubData: 0 };
  const shaders = [];
  const canvas = { width: w, height: h, style: {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), clientWidth: w, clientHeight: h };
  let objId = 0;
  const mk = (k) => ({ __gl: k, id: ++objId });
  const extStub = (name) => new Proxy({ __ext: name }, { get(t, p) {
    if (p in t) return t[p];
    if (typeof p === "string" && /^[A-Z0-9_]+$/.test(p)) return C(name + "." + p);
    return function () { return mk(p); };
  } });
  const param = (pn) => {
    const n = names.get(pn) || "";
    if (n === "VERSION") return "WebGL 2.0 (fake)";
    if (n === "SHADING_LANGUAGE_VERSION") return "WebGL GLSL ES 3.00";
    if (n === "VENDOR" || n === "RENDERER") return "fake";
    if (n === "VIEWPORT" || n === "SCISSOR_BOX") return new Int32Array([0, 0, w, h]);
    if (n === "COLOR_CLEAR_VALUE" || n === "BLEND_COLOR") return new Float32Array([0, 0, 0, 0]);
    if (n === "COLOR_WRITEMASK") return [true, true, true, true];
    if (n === "MAX_SAMPLES") return 4;
    if (n.startsWith("MAX_")) return 16384;
    if (n === "ALIASED_LINE_WIDTH_RANGE") return new Float32Array([1, 1]);
    return 0;
  };
  const impl = {
    canvas, drawingBufferWidth: w, drawingBufferHeight: h, drawingBufferColorSpace: "srgb",
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false }),
    isContextLost: () => false,
    getSupportedExtensions: () => ["EXT_color_buffer_float", "EXT_color_buffer_half_float", "OES_texture_float_linear", "EXT_texture_filter_anisotropic"],
    getExtension: (n) => (n === "EXT_disjoint_timer_query_webgl2" || n === "KHR_parallel_shader_compile" || n === "WEBGL_debug_renderer_info" ? null : extStub(n)),
    getParameter: param,
    shaderSource(sh, src) { shaders.push(src); },
    getShaderParameter: () => true,
    getProgramParameter: (p, pn) => (names.get(pn) === "ACTIVE_UNIFORMS" || names.get(pn) === "ACTIVE_ATTRIBUTES" ? 0 : true),
    getShaderInfoLog: () => "", getProgramInfoLog: () => "",
    checkFramebufferStatus: () => C("FRAMEBUFFER_COMPLETE"),
    getUniformLocation: () => mk("loc"), getUniformBlockIndex: () => 0, getAttribLocation: () => 0,
    getError: () => 0,
    fenceSync: () => mk("sync"), clientWaitSync: () => C("ALREADY_SIGNALED"), getSyncParameter: () => C("SIGNALED"),
    getInternalformatParameter: () => new Int32Array([4, 2]),
    getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
  };
  const gl = new Proxy(impl, {
    get(t, p) {
      if (p in t) {
        const v = t[p];
        if (typeof v === "function") return function () { counts[p] = (counts[p] || 0) + 1; return v.apply(t, arguments); };
        return v;
      }
      if (typeof p !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(p)) return C(p);
      t[p] = function (...a) {
        if (p === "bufferData" && a[1] && a[1].byteLength !== undefined) bytes.bufferData += a[1].byteLength;
        if (p === "bufferSubData" && a[2] && a[2].byteLength !== undefined) bytes.bufferSubData += (a[4] ? a[4] * (a[2].BYTES_PER_ELEMENT || 1) : a[2].byteLength);
        if (p.startsWith("create")) return mk(p);
        return undefined;
      };
      const v = t[p];
      return function () { counts[p] = (counts[p] || 0) + 1; return v.apply(t, arguments); };
    },
  });
  canvas.getContext = () => gl;
  return { gl, canvas, counts, bytes, shaders,
    reset() { for (const k in counts) delete counts[k]; bytes.bufferData = bytes.bufferSubData = 0; } };
}

/** Browser-ish globals three's bundle touches at import / init time in Node. Idempotent. */
export function installThreeGlobals() {
  const g = globalThis;
  if (!g.self) g.self = g;
  if (!g.window) g.window = g;
  for (const k of ["ImageBitmap", "HTMLImageElement", "HTMLCanvasElement", "OffscreenCanvas", "VideoFrame", "HTMLVideoElement", "ImageData"])
    if (!g[k]) g[k] = class {};
  if (!g.requestAnimationFrame) g.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 0);
  if (!g.cancelAnimationFrame) g.cancelAnimationFrame = (i) => clearTimeout(i);
}
