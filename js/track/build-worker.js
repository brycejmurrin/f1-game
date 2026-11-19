"use strict";
self.window = self;
let _loaded = false;
const _scenery = new Set();
const IMPORT_RETRY_MS = [400, 1200];
function importScriptUrl(u, bust) {
  if (!bust) return u;
  return u + (u.indexOf("?") >= 0 ? "&" : "?") + "retry=" + bust;
}
async function warmScriptCache(list) {
  if (list.length < 2 || typeof fetch !== "function") return 0;
  const t0 = performance.now();
  await Promise.all(list.map(async (u) => {
    const res = await fetch(u, { credentials: "same-origin" });
    if (!res || !res.ok) {
      const err = new Error("HTTP " + (res && res.status));
      err.name = "NetworkError";
      throw err;
    }
    if (typeof res.arrayBuffer === "function") await res.arrayBuffer();
  }));
  return performance.now() - t0;
}
async function importScriptsRetry(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  let warmMs = 0;
  try { warmMs = await warmScriptCache(list); }
  catch (_) {  }
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
  const tImport = nowMs();
  for (const u of list) for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, IMPORT_RETRY_MS[attempt - 1]));
    try { importScripts(importScriptUrl(u, attempt)); break; }
    catch (e) {
      if (!e || e.name !== "NetworkError" || attempt >= IMPORT_RETRY_MS.length) throw e;
    }
  }
  return { warmMs, importMs: nowMs() - tImport, files: list.length };
}

function pageRelativeFetch(base) {
  const f = self.fetch;
  if (!base || typeof f !== "function") return;
  self.fetch = (u, o) => f.call(self, typeof u === "string" ? new URL(u, base).href : u, o);
}

function adoptTeam(team) {
  if (!team || typeof Teams === "undefined" || !Array.isArray(Teams.LIST)) return;
  const i = Teams.LIST.findIndex((t) => t && t.id === team.id);
  if (i >= 0) Teams.LIST.splice(i, 1, team); else Teams.LIST.push(team);
}

function scenerySrc(def) {
  const fn = def.scenery || (self.TrackScenery && self.TrackScenery[def.id]);
  return fn ? String(fn) : "";
}
const residentModels = (src) => (typeof Assets === "undefined" || !Assets.modelIds ? []
  : Assets.modelIds(src).filter((id) => Assets.modelSync(id)));

function transferables(root) {
  const out = new Set(), seen = new Set(), stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    if (ArrayBuffer.isView(o)) { if (o.buffer instanceof ArrayBuffer) out.add(o.buffer); continue; }
    if (o instanceof ArrayBuffer) { out.add(o); continue; }
    for (const k in o) stack.push(o[k]);
  }
  return [...out];
}

const isU32 = (v) => v >= 0 && v <= 4294967295 && v === Math.floor(v);
function typedRibbon(geo) {
  if (!geo) return;
  for (const k of ["pos", "nrm", "col", "uv", "mat", "trk", "idx"]) {
    const a = geo[k];
    if (!Array.isArray(a)) continue;
    let ok = true;
    if (k === "idx") { for (let i = 0; i < a.length && ok; i++) ok = isU32(a[i]); }
    else { for (let i = 0; i < a.length && ok; i++) ok = typeof a[i] === "number"; }
    if (ok) geo[k] = k === "idx" ? Uint32Array.from(a) : Float64Array.from(a);
  }
}
function typePostedChannels(track, recs) {
  const geos = track ? [track.roadGeo, track.terrainGeo, track.propsGeo, track.pitSigns, track.pitSignal] : [];
  for (const r of recs || []) if (r && r.args) geos.push(r.args[0]);
  for (const g of geos) typedRibbon(g);
}

const _jobs = new Map();
async function build(m, job) {
  const recs = [];
  const rec = (op) => (...args) => {
    const n = recs.length;
    recs.push({ op, args });
    return op === "chunked" ? { __rec: n, chunks: [n] } : { __rec: n };
  };
  const gfx = {
    createMesh: rec("mesh"), createChunkedMesh: rec("chunked"), createInstancedBatch: rec("inst"),
    mobileTier: !!m.mobileTier, chunkedTrackCoords: m.chunkedTrackCoords,
  };
  if (m.scenery && !_scenery.has(m.scenery)) { await importScriptsRetry(m.scenery); _scenery.add(m.scenery); }
  const def = Tracks.LIST[m.idx];
  if (!def || def.id !== m.id) throw new Error("worker track list differs at " + m.idx + " (" + (def && def.id) + " != " + m.id + ")");
  adoptTeam(m.team);
  const src = scenerySrc(def);
  if (typeof Assets !== "undefined" && Assets.modelsReady) await Assets.modelsReady(0, src);
  if (job.cancelled) return;
  if (m.checkLive) {
    const permitted = new Promise((resolve) => { job.permit = resolve; });
    self.postMessage({ type: "buildReady", seq: m.seq });
    if (!(await permitted) || job.cancelled) return;
  }
  adoptTeam(m.team);
  const t0 = performance.now();
  const track = Tracks.build(def, Object.assign({}, m.opts, { gfx, retainRibbonCpu: true }));
  const ms = performance.now() - t0;
  track._gfx = null; track.surface = null; track._nodeGrid = null; track.graph = null; track.def = null;
  typePostedChannels(track, recs);
  const prepareStart = performance.now();
  const S = self.TLXShaders, config = m.prepare;
  let preparationBytes = 0;
  if (S && S.validPrepareConfig(config)) {
    const candidates = recs.filter(r => r.op === "chunked").map(r => ({ r,
      estimate: r.args[0].pos.length / 3 * 60 + r.args[0].idx.length * 64 }));
    candidates.sort((a, b) => b.estimate - a.estimate);
    for (const { r, estimate } of candidates) {
      if (estimate > 64 * 1048576 - preparationBytes) continue;
      r.prepared = S.prepareChunks(r.args[0], r.args[1], config);
      r.prepared.workerPacking = true;
      preparationBytes += estimate;
    }
  }
  const prepareMs = performance.now() - prepareStart;
  const msg = { type: "built", id: m.id, seq: m.seq, track, recs, ms, prepareMs, preparationBytes, sceneryShift: def._sceneryShift, startFrac: def._startFrac, models: residentModels(src) };
  const transfers = transferables(msg);
  msg.cpuMs = performance.now() - t0;
  self.postMessage(msg, transfers);
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === "init") {
      if (!_loaded) {
        pageRelativeFetch(m.base);
        const timing = await importScriptsRetry(m.files);
        _loaded = true;
        self.postMessage({ type: "ready", warmMs: timing.warmMs, importMs: timing.importMs, files: timing.files });
        return;
      }
      self.postMessage({ type: "ready" });
    } else if (m.type === "buildPermit") {
      const job = _jobs.get(m.seq);
      if (job) {
        if (!m.live) job.cancelled = true;
        if (job.permit) job.permit(!!m.live);
      }
    } else if (m.type === "build") {
      const job = { cancelled: false, permit: null };
      _jobs.set(m.seq, job);
      try { await build(m, job); } finally { _jobs.delete(m.seq); }
    } else if (m.type === "preview") {
      const def = Tracks.LIST[m.idx];
      if (!def || def.id !== m.id) throw new Error("worker track list differs at " + m.idx + " (" + (def && def.id) + " != " + m.id + ")");
      if (def._metaOnly || !(def.path && def.path.pts && def.path.pts.length)) {
        self.postMessage({ type: "preview", seq: m.seq, id: m.id, track: null });
        return;
      }
      const tr = Tracks.buildCenterline(def, { line: false });
      const track = {
        total: tr.total, n: tr.n, map: tr.map, street: !!tr.street, line: null,
        px: tr.px, py: tr.py, pz: tr.pz, tx: tr.tx, ty: tr.ty, tz: tr.tz,
        rx: tr.rx, ry: tr.ry, rz: tr.rz, hw: tr.hw, bank: tr.bank, curv: tr.curv,
        bankP: tr.bankP, meshes: {},
      };
      const msg = { type: "preview", seq: m.seq, id: def.id, track, sceneryShift: def._sceneryShift };
      if (Tracks.forgetPreviewCenterline) Tracks.forgetPreviewCenterline(def.id);
      self.postMessage(msg, transferables(msg));
    }
  } catch (err) {
    self.postMessage({ type: "error", seq: m.seq, message: String((err && err.message) || err) });
  }
};
