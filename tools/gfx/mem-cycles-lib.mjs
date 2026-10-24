// @doc gpu-game-check --mem-cycles helpers: an in-page live GPUBuffer/GPUTexture counter and the per-cycle plateau verdict.
// @skill perf-memory-census
//
// WHY. Heap snapshots cannot see GPU residency, and three's WebGPU backend keeps
// buffers in a WeakMap (backend.data) a snapshot reads as "retained" whether the
// owner is a leak or a bounded cache. The census counts what the DEVICE holds:
// every createBuffer/createTexture minus every destroy() and every GC'd handle
// (FinalizationRegistry, so the counter never pins an object). A·H12 measured
// with it on SwiftShader (docs/notes/GPUMEM-HUNT-2026-10-24.md); this is the
// same counter for the macOS runner's real GPU.

/** Init-script body (page.addInitScript(gpuObjectCounter)): window.__apexGpuObjects() → live counts. */
export function gpuObjectCounter() {
  if (typeof GPUDevice === "undefined" || window.__apexGpuObjects) return;
  const live = new Map();
  const ids = new WeakMap();
  let next = 1;
  const fr = new FinalizationRegistry((id) => { live.delete(id); });
  const add = (kind, obj, bytes) => {
    try { const id = next++; ids.set(obj, id); live.set(id, { kind, bytes }); fr.register(obj, id); } catch (_) { /* never break the app */ }
    return obj;
  };
  const drop = (obj) => { const id = ids.get(obj); if (id) live.delete(id); };
  const D = GPUDevice.prototype, cb = D.createBuffer, ct = D.createTexture;
  D.createBuffer = function (d) { return add("buffer", cb.apply(this, arguments), (d && d.size) || 0); };
  D.createTexture = function (d) {
    const t = ct.apply(this, arguments);
    let bytes = 0;
    try {
      const s = d.size, w = s.width ?? s[0], h = s.height ?? s[1] ?? 1, l = s.depthOrArrayLayers ?? s[2] ?? 1;
      // 4 bytes a texel is a floor (rgba16f/32f read low); mips add a third.
      bytes = w * h * l * 4 * ((d.mipLevelCount || 1) > 1 ? 4 / 3 : 1) * (d.sampleCount || 1);
    } catch (_) { /* odd descriptor: count it, size 0 */ }
    return add("texture", t, bytes);
  };
  const bd = GPUBuffer.prototype.destroy, td = GPUTexture.prototype.destroy;
  GPUBuffer.prototype.destroy = function () { drop(this); return bd.apply(this, arguments); };
  GPUTexture.prototype.destroy = function () { drop(this); return td.apply(this, arguments); };
  window.__apexGpuObjects = () => {
    const o = { buffers: 0, bufMB: 0, textures: 0, texMB: 0 };
    for (const m of live.values()) {
      if (m.kind === "buffer") { o.buffers++; o.bufMB += m.bytes; } else { o.textures++; o.texMB += m.bytes; }
    }
    o.bufMB = +(o.bufMB / 1048576).toFixed(1); o.texMB = +(o.texMB / 1048576).toFixed(1);
    return o;
  };
}

/**
 * Plateau verdict over per-cycle rows ({ buffers, bufMB, textures, texMB, rObj }).
 * Caches warm for the first cycles, so only the SECOND HALF is judged: the mean
 * of the last two rows against the mean of the first two second-half rows, per
 * cycle between them (two rows, because the cycles alternate circuits). Report,
 * not a gate: "growing" names the field and its per-cycle rate.
 */
export function memCyclesVerdict(rows, { mbPerCycle = 0.5, objPerCycle = 5 } = {}) {
  const n = Array.isArray(rows) ? rows.length : 0;
  if (n < 6) return { verdict: "too-few-cycles", cycles: n };
  const h = Math.floor(n / 2);
  const mean = (a, b, k) => ((+a[k] || 0) + (+b[k] || 0)) / 2;
  const span = (n - 2) - h;
  const rate = {};
  for (const k of ["buffers", "bufMB", "textures", "texMB", "rObj"]) {
    if (rows.every((r) => r[k] == null)) continue;
    rate[k] = +((mean(rows[n - 2], rows[n - 1], k) - mean(rows[h], rows[h + 1], k)) / span).toFixed(2);
  }
  const growing = [];
  for (const k of ["bufMB", "texMB"]) if (rate[k] > mbPerCycle) growing.push(k);
  for (const k of ["buffers", "textures", "rObj"]) if (rate[k] > objPerCycle) growing.push(k);
  return { verdict: growing.length ? "growing" : "plateau", cycles: n, judgedFrom: h, perCycle: rate, growing };
}
