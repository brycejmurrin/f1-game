// gpu-mem-webgpu.mjs — the WebGPU side of the allocation census: createTexture / createBuffer / destroy, by format and label.
// @doc Page-side WebGPU allocation wrapper: bytes by format and usage, label + stack per create.
// @skill renderer-debug
//
// gpu-mem-census.mjs counted WebGL calls only, so Bryce's path (three's WebGPU backend, D-013) had no allocation
// number at all (#4783 row 3), and the ~0.5 createBuffer a frame of #4710 had a count and no caller. This is the
// wrapper both need: GPUDevice.createTexture / createBuffer and GPUTexture / GPUBuffer.destroy on the PROTOTYPES, so
// it is installed before the page boots and sees every device.
//
// The numbers are COMPUTED from the descriptors (bytes per texel block, the whole mip chain, layers, samples), minus
// explicit destroy() calls. They are what the game ASKED for, not what the driver holds: padding, the swapchain
// (getCurrentTexture) and a resource dropped to the GC without destroy() are not observed.
//
// Three functions are serialised into the page, so each is self-contained (no module scope):
//   gpuMemMath()            the byte arithmetic, also callable from node (tests/unit/gpu-mem-webgpu.test.mjs)
//   gpuMemInstall(M, opts)  the wrapper; state lives on GPUDevice.prototype.__gmw
//   gpuMemSnapshot(top)     the report rows read back with page.evaluate
// gpuMemInitSource(opts) is the init-script text that runs the first two.

/** Byte arithmetic for WebGPU descriptors. Self-contained: it is stringified into the page. */
export function gpuMemMath() {
  // Bytes per texel for the uncompressed formats (https://www.w3.org/TR/webgpu/#texture-format-caps).
  const PLAIN = {
    r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, stencil8: 1,
    r16unorm: 2, r16snorm: 2, r16uint: 2, r16sint: 2, r16float: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2, depth16unorm: 2,
    r32uint: 4, r32sint: 4, r32float: 4, rg16unorm: 4, rg16snorm: 4, rg16uint: 4, rg16sint: 4, rg16float: 4,
    rgba8unorm: 4, "rgba8unorm-srgb": 4, rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, "bgra8unorm-srgb": 4,
    rgb9e5ufloat: 4, rgb10a2uint: 4, rgb10a2unorm: 4, rg11b10ufloat: 4, depth24plus: 4, "depth24plus-stencil8": 4, depth32float: 4,
    rg32uint: 8, rg32sint: 8, rg32float: 8, rgba16unorm: 8, rgba16snorm: 8, rgba16uint: 8, rgba16sint: 8, rgba16float: 8, "depth32float-stencil8": 8,
    rgba32uint: 16, rgba32sint: 16, rgba32float: 16,
  };
  /** { bw, bh, bytes } of one texel block, or null for a format this table does not know. */
  const block = (format) => {
    const f = String(format || "");
    if (PLAIN[f]) return { bw: 1, bh: 1, bytes: PLAIN[f] };
    if (/^bc[14]-/.test(f) || /^etc2-rgb8(unorm|a1unorm)/.test(f) || /^eac-r11/.test(f)) return { bw: 4, bh: 4, bytes: 8 };
    if (/^bc[23567]-|^bc6h-/.test(f) || /^etc2-rgba8/.test(f) || /^eac-rg11/.test(f)) return { bw: 4, bh: 4, bytes: 16 };
    const a = /^astc-(\d+)x(\d+)-/.exec(f);
    if (a) return { bw: +a[1], bh: +a[2], bytes: 16 };
    return null;
  };
  /** [width, height, depthOrArrayLayers] of a GPUExtent3D (a sequence or a dict). */
  const extent = (size) => {
    if (size == null) return [0, 1, 1];
    if (typeof size === "number") return [size, 1, 1];
    if (typeof size.length === "number") return [size[0] | 0, size[1] == null ? 1 : size[1] | 0, size[2] == null ? 1 : size[2] | 0];
    return [size.width | 0, size.height == null ? 1 : size.height | 0, size.depthOrArrayLayers == null ? 1 : size.depthOrArrayLayers | 0];
  };
  /** Requested bytes of a GPUTextureDescriptor: every mip, every layer (a 3D texture's depth halves per mip), every
   *  sample. null when the format is unknown. */
  const textureBytes = (desc) => {
    const b = block(desc && desc.format);
    if (!b) return null;
    const [w, h, d] = extent(desc.size);
    const mips = Math.max(1, desc.mipLevelCount | 0), samples = Math.max(1, desc.sampleCount | 0), is3d = desc.dimension === "3d";
    let total = 0;
    for (let i = 0; i < mips; i++) {
      const mw = Math.max(1, w >> i), mh = Math.max(1, h >> i), md = is3d ? Math.max(1, d >> i) : d;
      total += Math.ceil(mw / b.bw) * Math.ceil(mh / b.bh) * b.bytes * md;
    }
    return total * samples;
  };
  /** What a buffer is for, from its GPUBufferUsage flags (the first class that matches). */
  const bufferClass = (usage) => {
    const u = usage | 0;
    return u & 64 ? "uniform" : u & 16 ? "index" : u & 32 ? "vertex" : u & 128 ? "storage" : u & 256 ? "indirect"
      : u & 1 ? "readback" : u & 2 ? "map-write" : u & 512 ? "query" : "copy";
  };
  return { block, extent, textureBytes, bufferClass };
}

/** Install the wrapper on the WebGPU prototypes of `root` (default: the page's globalThis). Self-contained apart from
 *  `M` (gpuMemMath()). opts: { armed, stacks, maxSites }. Returns false where there is no GPUDevice to wrap. */
export function gpuMemInstall(M, opts, root) {
  const W = root || globalThis;
  const GD = W.GPUDevice && W.GPUDevice.prototype;
  if (!GD || typeof GD.createTexture !== "function" || typeof GD.createBuffer !== "function") return false;
  if (GD.__gmw) return true;
  const o = opts || {};
  // Rows hold numbers and strings only, keyed by a counter: the bookkeeping never roots a GPU object.
  const ids = new WeakMap();
  const st = {
    tex: new Map(), buf: new Map(), next: 0,
    life: { Texture: { created: 0, destroyed: 0 }, Buffer: { created: 0, destroyed: 0 } },
    unknown: [], unknownCount: 0,
    // The create log (#4710): armed windows only, one row per kind + label + bytes + call site.
    armed: !!o.armed, stacks: o.stacks !== false, maxSites: o.maxSites || 400, sites: new Map(), siteOverflow: 0, armedCreates: 0,
  };
  const site = () => {
    if (!st.stacks) return "";
    try {
      const E = W.Error || Error, prev = E.stackTraceLimit;
      E.stackTraceLimit = 60;
      let raw;
      try { raw = (new E().stack || "").split("\n").slice(3); } finally { E.stackTraceLimit = prev; }
      const fr = raw.map((l) => l.trim().replace(/^at\s+/, "").replace(/\?v=[a-z0-9]+/g, "").replace(/https?:\/\/[^\s)]*\//g, ""));
      // three's own frames name WHAT is created (function names only: the minified line:col moves per build); ours
      // name WHO asked.
      const lib = fr.filter((l) => /three\.webgpu/.test(l)).slice(0, 3).map((l) => l.split(" ")[0]).join("<");
      const ours = fr.filter((l) => !/three\.webgpu|three\.core|three\.tsl|gpu-game-check|gpu-mem|<anonymous>/.test(l) && /\.js:/.test(l));
      return (lib || "(no three frame)") + " :: " + (ours.slice(0, 3).join(" <- ") || "(three only)");
    } catch (_) { return "(no stack)"; }
  };
  const note = (kind, label, bytes) => {
    if (!st.armed) return;
    st.armedCreates++;
    const key = kind + " :: " + (label || "(none)") + "#" + bytes + "B :: " + site();
    let r = st.sites.get(key);
    if (!r) {
      if (st.sites.size >= st.maxSites) { st.siteOverflow++; return; }
      r = { n: 0, bytes: 0 }; st.sites.set(key, r);
    }
    r.n++; r.bytes += bytes;
  };
  const origTex = GD.createTexture, origBuf = GD.createBuffer;
  GD.createTexture = function (desc) {
    const t = origTex.apply(this, arguments);
    try {
      const b = M.textureBytes(desc || {}), e = M.extent(desc && desc.size);
      if (b == null) { st.unknownCount++; if (st.unknown.length < 50) st.unknown.push({ call: "createTexture", format: String(desc && desc.format) }); }
      const id = ++st.next; ids.set(t, id);
      st.tex.set(id, { b: b || 0, fmt: String(desc && desc.format), w: e[0], h: e[1], d: e[2], dim: (desc && desc.dimension) || "2d",
        mips: Math.max(1, (desc && desc.mipLevelCount) | 0), samples: Math.max(1, (desc && desc.sampleCount) | 0), label: (desc && desc.label) || "" });
      st.life.Texture.created++;
      note("createTexture", desc && desc.label, b || 0);
    } catch (_) { st.unknownCount++; }
    return t;
  };
  GD.createBuffer = function (desc) {
    const buf = origBuf.apply(this, arguments);
    try {
      const b = +(desc && desc.size) || 0, id = ++st.next; ids.set(buf, id);
      st.buf.set(id, { b, cls: M.bufferClass(desc && desc.usage), label: (desc && desc.label) || "" });
      st.life.Buffer.created++;
      note("createBuffer", desc && desc.label, b);
    } catch (_) { st.unknownCount++; }
    return buf;
  };
  const wrapDestroy = (proto, map, life) => {
    if (!proto || typeof proto.destroy !== "function") return;
    const orig = proto.destroy;
    proto.destroy = function () {
      try { const id = ids.get(this); if (id != null && map.delete(id)) life.destroyed++; } catch (_) { /* count only */ }
      return orig.apply(this, arguments);
    };
  };
  wrapDestroy(W.GPUTexture && W.GPUTexture.prototype, st.tex, st.life.Texture);
  wrapDestroy(W.GPUBuffer && W.GPUBuffer.prototype, st.buf, st.life.Buffer);
  GD.__gmw = st;
  return true;
}

/** Read the wrapper's state back as report rows. Self-contained (page.evaluate). null where nothing was wrapped. */
export function gpuMemSnapshot(top, root) {
  const W = root || globalThis, GD = W.GPUDevice && W.GPUDevice.prototype, st = GD && GD.__gmw;
  if (!st) return null;
  const mb = (n) => +(n / 1048576).toFixed(2), cat = {};
  const add = (k, b) => { const c = cat[k] || (cat[k] = { n: 0, b: 0, big: 0 }); c.n++; c.b += b; c.big = Math.max(c.big, b); };
  let texB = 0, bufB = 0;
  for (const e of st.tex.values()) { texB += e.b; add((e.dim === "3d" ? "3D " : e.d > 1 ? "array " : "2D ") + e.fmt + (e.samples > 1 ? " x" + e.samples : ""), e.b); }
  for (const e of st.buf.values()) { bufB += e.b; add("buffer " + e.cls, e.b); }
  const big = [...st.tex.values()].sort((a, b) => b.b - a.b).slice(0, 8)
    .map((e) => `${e.fmt} ${e.w}x${e.h}${e.d > 1 ? "x" + e.d : ""}${e.mips > 1 ? " mips" + e.mips : ""}${e.label ? " [" + e.label + "]" : ""} ${mb(e.b)}MB`);
  const sites = [...st.sites.entries()].map(([site, r]) => ({ site, n: r.n, bytes: r.bytes })).sort((a, b) => b.n - a.n || b.bytes - a.bytes);
  return { api: "webgpu", texMB: mb(texB), bufMB: mb(bufB), texBytes: texB, bufBytes: bufB, tex: st.tex.size, buffers: st.buf.size,
    cat: Object.entries(cat).sort((a, b) => b[1].b - a[1].b || b[1].n - a[1].n).map(([k, v]) => ({ k, n: v.n, mb: mb(v.b), bigMB: mb(v.big) })),
    big, life: JSON.parse(JSON.stringify(st.life)), unknown: st.unknown.slice(), unknownCount: st.unknownCount,
    armedCreates: st.armedCreates, siteOverflow: st.siteOverflow, sites: sites.slice(0, top || 40) };
}

/** The init-script text: the arithmetic, then the wrapper, before any page script runs. */
export const gpuMemInitSource = (opts = {}) => `(${gpuMemInstall})((${gpuMemMath})(), ${JSON.stringify(opts)});`;

/** #4710: the armed create log as per-frame rows. `frames` is the armed window's frame count. Pure. */
export function createAttribution(snap, frames, top = 12) {
  if (!snap || !Array.isArray(snap.sites)) return { note: "no WebGPU create log (no GPUDevice wrapped on this leg)" };
  if (!(frames > 0)) return { note: "no window frames" };
  const per = (n) => +(n / frames).toFixed(3);
  const of = (kind) => snap.sites.filter((r) => r.site.startsWith(kind + " :: "));
  const sum = (rows) => rows.reduce((s, r) => s + r.n, 0);
  const rows = snap.sites.slice(0, top).map((r) => ({ site: r.site, n: r.n, perFrame: per(r.n), kb: +(r.bytes / 1024).toFixed(1) }));
  return { frames, creates: snap.armedCreates, buffersPerFrame: per(sum(of("createBuffer"))), texturesPerFrame: per(sum(of("createTexture"))),
    // armedCreates counts every create; the rows stop at maxSites distinct sites, so say how many fell off.
    unattributed: snap.siteOverflow, rows };
}
