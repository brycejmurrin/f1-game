// iphone-census-lib.mjs — the pure half of .github/workflows/iphone-census.yml.
// @doc Pure half of iphone-census.yml: capabilities, simulator pick, probe sources, arm schedule, maths, Verdict.
// @skill renderer-debug
//
// The driver (tools/gfx/iphone-census.mjs) drives Mobile Safari in an iOS
// SIMULATOR on a GitHub macOS runner through Apple's own safaridriver; everything
// that can be decided without a Mac lives here so node --test can pin it: the
// capability object, the simulator runtime / device-type pick, the in-page probe
// sources, percentile / window maths, the arm schedule, and the Verdict.
//
// WHAT A SIMULATOR IS AND IS NOT. It runs iOS's WebKit on the Mac's GPU through
// the host's Metal. That makes it evidence for iOS-Safari CORRECTNESS (which
// extensions and paths Safari exposes, does TLX-on-WebGPU / GLX draw the right
// picture) and NOT for phone performance: every frame time it produces is a Mac
// GPU's. The summary says so on every run (CAVEATS) and labels the timings.
//
// Sources, checked 2026-10-17:
//   safaridriver(1): safari:useSimulator / safari:deviceType / safari:deviceName /
//     safari:platformVersion, "An Xcode installation is required in order to run
//     WebDriver tests on iOS Simulator hosts" — https://manp.gs/mac/1/safaridriver
//   WebDriver for iOS: platformName "ios", simulator iOS 13+, Remote Automation —
//     https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/
//   Runner images ship one iOS runtime per Xcode and no spare ones —
//     https://github.com/actions/runner-images/issues/13220
// Measurement plan: docs/notes/PERF-RESEARCH-2026-10-17.md §4 (A, A2, B-lite, D)
// and §2 item 7 (three-way renderer A/B).

export const DEFAULT_URL = "https://brycejmurrin.github.io/f1-game/";

/** The three renderer arms of §2 item 7. `ls` is what the arm writes to
 *  localStorage before the reload that boots it (js/render/gfx.js BACKEND_KEY,
 *  js/perf/renderer-picker.js THREE PATH: "1" pins three WebGL2, "0" pins
 *  three WebGPU, unset = AUTO, which stays on WebGL2 on Safari/iOS). */
export const ARMS = {
  // An UNSET pick defaults to TLX only when navigator.gpu.requestAdapter() resolves
  // (js/render/renderer-boot.js); run 4 showed the simulator's adapter is null, so the
  // unset default boots GLX there. The explicit "three" pick skips that check and is
  // what a phone WITH an adapter runs, so both TLX arms pin it.
  tlx: { label: "TLX (three WebGL2; explicit pick)", set: { "apex26.gfxBackend": "three" }, del: ["apex26.tlxForceGL"], expectBound: "tlx:webgl2" },
  tlxgpu: { label: "TLX WebGPU (THREE PATH: WEBGPU)", set: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "0" }, del: [], expectBound: "tlx:webgpu" },
  glx: { label: "GLX (plain WebGL2)", set: { "apex26.gfxBackend": "webgl2" }, del: ["apex26.tlxForceGL"], expectBound: "glx:webgl2" },
};

/** Which backend actually bound: "tlx:<api>" or "glx:<api>" (null when unreadable). */
export const BOUND_SRC = `
  try {
    if (typeof GLX === "undefined") return null;
    const t = GLX.__tlx && GLX.__tlx.backendState ? GLX.__tlx.backendState() : null;
    if (t && t.api) return "tlx:" + t.api;
    const g = GLX.backendState ? GLX.backendState() : null;
    return g && g.api ? "glx:" + g.api : null;
  } catch (e) { return null; }`;

/** `rounds` interleaved passes over the arms (A B C A B C), never A A B B C C:
 *  the measuring notes' rule, so a warming phone does not favour the last arm. */
export function armSchedule(arms, rounds) {
  const out = [];
  for (let r = 1; r <= rounds; r++) for (const a of arms) out.push({ arm: a, round: r });
  return out;
}

export function parseArms(s) {
  const want = String(s || "tlx,tlxgpu,glx").split(",").map((x) => x.trim()).filter(Boolean);
  const bad = want.filter((a) => !ARMS[a]);
  if (bad.length) throw new Error("unknown arm(s): " + bad.join(", ") + " (valid: " + Object.keys(ARMS).join(", ") + ")");
  return want;
}

/** W3C capabilities for safaridriver on an iOS Simulator. */
export function buildCapabilities({ device = "iPhone 17 Pro", os = "" } = {}) {
  const c = {
    browserName: "safari",
    platformName: "ios",
    "safari:useSimulator": true,
    "safari:deviceType": "iPhone",
  };
  if (device) c["safari:deviceName"] = device;
  if (os) c["safari:platformVersion"] = String(os);
  return c;
}

const verKey = (v) => String(v).split(".").map((n) => Number(n) || 0);
const cmpVer = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

/** Newest AVAILABLE iOS runtime from `xcrun simctl list runtimes -j`
 *  (optionally the one matching `want`, a prefix like "26" or "26.0.1"); null if none. */
export function pickRuntime(listing, want = "") {
  const isIos = (r) => /^iOS$/i.test(r.platform || "") || (r.identifier || "").includes("SimRuntime.iOS-");
  const rt = ((listing && listing.runtimes) || []).filter((r) => r.isAvailable !== false && isIos(r));
  const ok = rt.filter((r) => !want || String(r.version) === String(want) || String(r.version).startsWith(String(want) + "."));
  ok.sort((a, b) => cmpVer(b.version, a.version));
  return ok[0] || null;
}

/** The iPhone device type for a model name ("iPhone 17 Pro") from
 *  `xcrun simctl list devicetypes -j`; falls back to the newest "Pro" iPhone,
 *  then the newest iPhone, so a runner image without the wanted model still runs. */
export function pickDeviceType(listing, want = "iPhone 17 Pro") {
  const dts = ((listing && listing.devicetypes) || []).filter((d) => /^iPhone /.test(d.name || ""));
  const exact = dts.find((d) => d.name === want);
  if (exact) return { ...exact, exact: true };
  const rank = (d) => Number((d.name.match(/iPhone (\d+)/) || [])[1] || 0);
  const pro = dts.filter((d) => / Pro$/.test(d.name)).sort((a, b) => rank(b) - rank(a))[0];
  const any = dts.slice().sort((a, b) => rank(b) - rank(a))[0];
  const pick = pro || any;
  return pick ? { ...pick, exact: false } : null;
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * p))];
}

/** p50/p95/p99 over a list of numbers (the frame-time series, ms). */
export function pctiles(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  return { n: a.length, p50: percentile(a, 0.5), p95: percentile(a, 0.95), p99: percentile(a, 0.99) };
}

/** Median of a sample list; null when empty. */
export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? percentile(a, 0.5) : null;
}

/** rAF cadence from timestamps (ms): mean Hz and the median interval. */
export function cadence(ts) {
  if (!ts || ts.length < 3) return { frames: ts ? ts.length : 0, hz: null, medianMs: null };
  const d = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  const total = ts[ts.length - 1] - ts[0];
  return { frames: ts.length, hz: total > 0 ? +(1000 * (ts.length - 1) / total).toFixed(1) : null, medianMs: +median(d).toFixed(2) };
}

/** The iPhone in-page facts (A). One expression, no dependencies: it runs in
 *  Safari via executeScript. Never throws; every field is null when absent. */
export const FACTS_SRC = `
  const out = { ua: navigator.userAgent, dpr: window.devicePixelRatio, screen: [screen.width, screen.height],
    inner: [innerWidth, innerHeight], hasNavigatorGpu: typeof navigator.gpu !== "undefined" };
  try { out.backendState = (typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.backendState) ? GLX.__tlx.backendState() : null; } catch (e) { out.backendState = { error: String(e && e.message) }; }
  try { out.perf = window.__apex && window.__apex.perf ? window.__apex.perf() : null; } catch (e) { out.perf = { error: String(e && e.message) }; }
  try {
    const c = document.createElement("canvas"); const gl = c.getContext("webgl2");
    out.webgl2 = !!gl;
    if (gl) {
      out.ext = {};
      for (const n of ["EXT_color_buffer_float", "EXT_color_buffer_half_float", "WEBGL_multi_draw", "EXT_disjoint_timer_query_webgl2"]) out.ext[n] = !!gl.getExtension(n);
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      out.glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }
  } catch (e) { out.webgl2Error = String(e && e.message); }
  return out;`;

/** Async: resolve navigator.gpu's adapter features (shader-f16 decides the half experiment). */
export const GPU_ADAPTER_SRC = `
  const done = arguments[arguments.length - 1];
  if (!navigator.gpu) return done({ adapter: false });
  navigator.gpu.requestAdapter().then((a) => done(a ? { adapter: true, shaderF16: a.features.has("shader-f16"), timestampQuery: a.features.has("timestamp-query") } : { adapter: false }),
    (e) => done({ adapter: false, error: String(e && e.message) }));`;

/** Sync: what raw WebGL2 does in this Safari (no game code): context attributes as three asks for them,
 *  then createShader / shaderSource / compile on a trivial vertex shader, then how many MORE contexts the page
 *  can open before createShader returns null or a context is lost. Evidence for the TLX arm's
 *  "shaderSource ... must be an instance of WebGLShader", not a cause. */
export const GLPROBE_SRC = `
  const out = { attempts: [] };
  const trivial = "#version 300 es\\nvoid main(){gl_Position=vec4(0.);}";
  const one = (attrs) => {
    const r = { attrs: JSON.stringify(attrs) };
    try {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      const gl = c.getContext("webgl2", attrs);
      r.ctx = !!gl;
      if (!gl) return r;
      r.lost = gl.isContextLost();
      const sh = gl.createShader(gl.VERTEX_SHADER);
      r.shaderNull = sh === null;
      r.err = gl.getError();
      if (sh) { gl.shaderSource(sh, trivial); gl.compileShader(sh); r.compiled = !!gl.getShaderParameter(sh, gl.COMPILE_STATUS); }
      r.keep = gl;
    } catch (e) { r.threw = String(e && e.message).slice(0, 160); }
    return r;
  };
  for (const attrs of [{}, { antialias: true, alpha: true, depth: true, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false }, { antialias: false, alpha: false, powerPreference: "default" }]) {
    const r = one(attrs); delete r.keep; out.attempts.push(r);
  }
  const live = [];
  out.contexts = { opened: 0, firstBad: null };
  for (let i = 0; i < 24; i++) {
    const r = one({});
    if (r.keep) live.push(r.keep);
    out.contexts.opened = i + 1;
    if (!r.ctx || r.shaderNull || r.lost || r.threw) { out.contexts.firstBad = { i, ctx: r.ctx, shaderNull: r.shaderNull, lost: r.lost, threw: r.threw }; break; }
  }
  out.contexts.heldLost = live.filter((g) => g.isContextLost()).length;
  out.contexts.heldCount = live.length;
  return out;`;

/** Async: rAF cadence for ms milliseconds (A2). */
export const RAF_SRC = `
  const ms = arguments[0], done = arguments[arguments.length - 1], ts = [];
  const t0 = performance.now();
  (function f(t) { ts.push(t); if (performance.now() - t0 < ms) requestAnimationFrame(f); else done(ts); })(t0);`;

/** One sample (B-lite / D): the governor view, memory counts, frame window. */
export const SAMPLE_SRC = `
  const s = { t: Date.now() };
  try { const i = window.__apex.info(); s.state = i.state; s.track = i.track; } catch (e) { s.infoError = String(e && e.message); }
  try { s.hidden = document.hidden; s.vis = document.visibilityState; s.focus = document.hasFocus(); } catch (_) { /* no document */ }
  try { s.loopFrames = typeof LoopHealth !== "undefined" ? LoopHealth.state().frames : null; } catch (_) { s.loopFrames = null; }
  try { const p = window.__apex.perf(); s.scale = p.scale; s.fps = p.fps; s.tier = p.tier; s.autoTier = p.autoTier; s.autoShed = p.autoShed; s.frameTimes = p.frameTimes; s.floorMs = p.floorMs; } catch (e) { s.perfError = String(e && e.message); }
  try { if (typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.memState) { const m = GLX.__tlx.memState(); s.mem = m; } } catch (e) { s.memError = String(e && e.message); }
  try { s.jsHeapMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null; } catch (_) { /* Safari has none */ }
  return s;`;

/** Per-arm evidence for "why did THIS backend bind": the pins as stored, the
 *  fallback latches, and the game's own diag() (renderer, GPU errors, pack). */
export const DIAG_SRC = `
  const o = { storage: {}, session: {} };
  for (const k of ["apex26.gfxBackend", "apex26.tlxForceGL", "apex26.gfxTlxFail", "apex26.gfxWgxFail", "apex26.gfxBackendProbe"]) { try { o.storage[k] = localStorage.getItem(k); } catch (_) {} }
  for (const k of ["apex26.gfxBound", "apex26.gfxClaimFail", "apex26.tlxAutoGL"]) { try { o.session[k] = sessionStorage.getItem(k); } catch (_) {} }
  try { o.hidden = document.hidden; o.vis = document.visibilityState; o.focus = document.hasFocus(); o.hasTLX = typeof TLX !== "undefined"; o.hasGfx = typeof Gfx !== "undefined"; } catch (_) {}
  try { const l = window.__apex.logs ? window.__apex.logs({ ns: "gfx" }) : null; o.gfxLog = Array.isArray(l) ? l.filter((x) => /bind|fallback|TLX|three|backend|adapter|GLX context/i.test(x.msg)).slice(-8) : l; } catch (e) { o.logsError = String(e && e.message); }
  try { const l = window.__apex.logs ? window.__apex.logs() : null; o.logTail = Array.isArray(l) ? l.slice(-14).map((x) => x.ns + ":" + String(x.msg).slice(0, 90)) : null; } catch (_) {}
  try { const p = window.__apex.physState(); o.phys = p ? { t: p.t, speed: p.speed, s: p.s, frozen: p.frozen, paused: p.paused } : null; } catch (e) { o.physError = String(e && e.message); }
  try { o.loopFrames = typeof LoopHealth !== "undefined" ? LoopHealth.state() : null; } catch (_) {}
  try { const d = window.__apex.diag({ download: false }); o.diag = JSON.parse(JSON.stringify(d, (k, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v))); } catch (e) { o.diagError = String(e && e.message); }
  return JSON.stringify(o).length > 12000 ? { storage: o.storage, session: o.session, diagError: o.diagError || "diag too large", diagKeys: o.diag ? Object.keys(o.diag) : null } : o;`;

/** Reset the governor's frame ring so the next sample is the window's own. */
export const RESET_FRAMES_SRC = `try { if (typeof PerfGov !== "undefined" && PerfGov.resetFrameStats) PerfGov.resetFrameStats(); return true; } catch (e) { return String(e && e.message); }`;

/** A compact closed-loop driver (the law of tests/specs/autopilot.spec.js,
 *  shared with tools/gfx/gpu-game-check.mjs): braking envelope over scan() +
 *  pure pursuit on probe(), setInput() only. Installed on window.__icDrive. */
export const DRIVER_SRC = `
  if (window.__icDrive) return "present";
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, A_LAT = 13, A_BRAKE = 24, KP = 2.4;
  let on = false, raf = 0, prev = 0, hold = 30, frames = 0, off = 0, dist = 0, lastS = null, err = null;
  const tick = (ts) => {
    if (!on) return; raf = requestAnimationFrame(tick);
    const A = window.__apex; if (!A || !A.probe || !A.scan || !A.setInput) return;
    const dt = prev ? Math.min(0.1, Math.max(0.001, (ts - prev) / 1000)) : 1 / 60; prev = ts;
    let p, pts; try { p = A.probe(); pts = p ? A.scan(DISTS) : null; } catch (e) { err = String(e && e.message).slice(0, 80); return; }
    if (!p || !pts) return;
    let kSteer = p.k; const look = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < pts.length; j++) {
      const d = DISTS[j], k = Math.abs(pts[j].k);
      if (d <= look) kSteer = pts[j].k;
      const vc = k > 1e-4 ? Math.sqrt(A_LAT / k) : VMAX;
      const va = Math.sqrt(vc * vc + 2 * A_BRAKE * d); if (va < vT) vT = va;
    }
    vT = Math.max(11, Math.min(VMAX, vT)); hold = Math.min(vT, hold + 30 * dt); vT = hold;
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    let steer = KP * (Math.atan2(kSteer * L * L * 0.5 - p.x, L) - p.angle);
    steer = Math.max(-1, Math.min(1, steer));
    const offRoad = Math.abs(p.x) - p.hw > 0.4;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04; if (offRoad) throttle = false;
    try { A.setInput({ steer, throttle, brake }); } catch (e) { err = String(e && e.message).slice(0, 80); }
    frames++; if (offRoad) off++;
    if (lastS != null) { const ds = p.s - lastS; if (ds > 0 && ds < 50) dist += ds; } lastS = p.s;
  };
  window.__icDrive = {
    start() { if (on) return; const A = window.__apex; try { A.freeze && A.freeze(false); A.go && A.go(); } catch (_) {} on = true; prev = 0; raf = requestAnimationFrame(tick); },
    stop() { on = false; try { cancelAnimationFrame(raf); window.__apex.clearInput && window.__apex.clearInput(); } catch (_) {} },
    stats: () => ({ frames, distM: Math.round(dist), offRoadFrames: off, error: err }),
  };
  return "installed";`;

/** Fixed-view setup for the per-arm screenshot: park, camera back to chase, snap. */
export const FIXED_VIEW_SRC = `
  const A = window.__apex;
  try { window.__icDrive && window.__icDrive.stop(); A.park(0.1); A.camera("chase"); A.snapCam(); return true; } catch (e) { return String(e && e.message); }`;

/** The game pauses every race on a portrait coarse-pointer phone ("Race paused why=rotate-block",
 *  js/game.js syncRotateBlocker) behind a dark ROTATE DEVICE overlay, and a simulator session starts
 *  in portrait with no way to rotate it. Hiding the gate lets the race tick; the viewport stays
 *  PORTRAIT and the summary says so. Run 5 (39030104339): LoopHealth ran, physState speed 0, p50 0. */
export const NO_ROTATE_SRC = `
  if (document.getElementById("ic-no-rotate")) return "present";
  const st = document.createElement("style"); st.id = "ic-no-rotate";
  st.textContent = "#rotate-device{display:none!important}";
  document.head.appendChild(st);
  try { window.dispatchEvent(new Event("resize")); } catch (_) {}
  return "installed";`;

/** Boot gate: the game answers and a race is loaded. */
export const READY_SRC = `return !!(window.__apex && window.__apex.info && window.__apex.info().state);`;

// ───────────────────────── screenshot sanity ─────────────────────────

/** Mean luma and the share of near-black pixels of an 8-bit non-interlaced PNG
 *  (what WebDriver's takeScreenshot returns), so the Verdict can tell a drawn
 *  frame from a blank one without a person opening the artifact. null if the
 *  PNG is not that shape. */
export function pngStats(buf, zlib) {
  try {
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    let off = 8, w = 0, h = 0, depth = 0, ct = 0, il = 0; const idat = [];
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off), type = buf.toString("latin1", off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
      if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; }
      else if (type === "IDAT") idat.push(d);
      else if (type === "IEND") break;
      off += 12 + len;
    }
    const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
    if (!bpp || depth !== 8 || il !== 0 || !w || !h) return null;
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
    let sum = 0, dark = 0, n = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v = row[i];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        cur[i] = v & 255;
      }
      for (let x = 0; x < w; x += 2) {   // every other pixel is plenty for a mean
        const j = x * bpp, l = bpp >= 3 ? 0.2126 * cur[j] + 0.7152 * cur[j + 1] + 0.0722 * cur[j + 2] : cur[j];
        sum += l; n++; if (l < 8) dark++;
      }
      cur.copy(prev);
    }
    return { w, h, meanLuma: +(sum / n).toFixed(1), nearBlack: +(dark / n).toFixed(3) };
  } catch (_) { return null; }
}

// ───────────────────────── summary / verdict ─────────────────────────

const f1 = (v) => (v == null || !Number.isFinite(v) ? "-" : (+v).toFixed(1));

/** Window summary from a list of SAMPLE_SRC results: the LAST sample's frame
 *  window is the window's own (the ring was reset at its start). */
export function windowSummary(samples) {
  const ok = samples.filter((s) => s && s.frameTimes);
  const last = ok[ok.length - 1];
  return {
    samples: samples.length,
    p50: last ? last.frameTimes.p50 : null,
    p95: last ? last.frameTimes.p95 : null,
    p99: last ? last.frameTimes.p99 : null,
    frames: last ? last.frameTimes.frames : 0,
    scale: last ? last.scale : null,
    tier: last ? last.tier : null,
    p50Series: ok.map((s) => s.frameTimes.p50),
    loopFrames: (() => { const f = samples.map((x) => x && x.loopFrames).filter((x) => Number.isFinite(x)); return f.length > 1 ? f[f.length - 1] - f[0] : null; })(),
    state: last ? last.state : null,
  };
}

/** The Verdict: rows for the step summary and `bad` reasons that fail the job.
 *  A cloud phone being slow is a MEASUREMENT, not a failure; what fails is a
 *  leg that produced no number, a dead backend, or a missing fact block. */
export function verdict(res) {
  const rows = [], bad = [];
  const facts = res && res.facts;
  if (!facts) bad.push("no facts block (the session never ran executeScript)");
  else {
    rows.push(["host", [res.device, "iOS " + (res.os || "?") + " SIMULATOR", "GL " + (facts.glRenderer || "?")].join(" / ") + (res.runner ? " on " + res.runner : "")]);
    rows.push(["userAgent", facts.ua]);
    rows.push(["DPR", String(facts.dpr)]);
    if (facts.inner) rows.push(["viewport", `${facts.inner[0]}x${facts.inner[1]} CSS px, ${facts.inner[0] <= facts.inner[1] ? "PORTRAIT (the game's rotate-device gate is hidden by the harness so the race can tick; HUD layout is not the landscape one a player sees)" : "landscape"}`]);
    rows.push(["navigator.gpu", String(facts.hasNavigatorGpu) + (res.gpuAdapter ? " (adapter " + res.gpuAdapter.adapter + ", shader-f16 " + res.gpuAdapter.shaderF16 + ")" : "")]);
    const bs = facts.backendState;
    rows.push(["backendState", bs ? JSON.stringify(bs).slice(0, 240) : "null (TLX not bound)"]);
    rows.push(["extensions", facts.ext ? Object.entries(facts.ext).map(([k, v]) => k + "=" + v).join(" ") : "-"]);
    if (res.glProbe) rows.push(["raw WebGL2 probe", JSON.stringify(res.glProbe).slice(0, 700)]);
    if (!facts.webgl2) bad.push("WebGL2 unavailable on the device");
  }
  if (res && res.raf) rows.push(["rAF (menu)", (res.raf.hz == null ? "-" : res.raf.hz + " Hz") + ", median " + f1(res.raf.medianMs) + " ms"]);
  const soak = res && res.soak;
  if (soak) {
    const ws = soak.windows || [];
    if (!ws.length) bad.push("soak recorded no windows");
    else if (ws.every((w) => !(w.p50 > 0))) bad.push("soak is hollow: every window's frame p50 is 0 (the frame ring never filled: race not ticking, state " + JSON.stringify(ws[ws.length - 1].state) + ")");
    if (soak.driver && !(soak.driver.distM > 0)) bad.push("soak driver covered 0 m: the scripted car never moved");
    for (const w of ws) rows.push(["soak +" + w.minute + "m (host GPU)", `p50 ${f1(w.p50)} p95 ${f1(w.p95)} p99 ${f1(w.p99)} ms, scale ${w.scale}, tier ${w.tier}`]);
    if (soak.driver) rows.push(["soak driver", `${soak.driver.distM} m, ${soak.driver.offRoadFrames} off-road frames` + (soak.driver.error ? ", error " + soak.driver.error : "")]);
  }
  const ab = (res && res.ab) || [];
  const byArm = {};
  for (const leg of ab) {
    if (leg.skipped) { rows.push([`arm ${leg.arm} r${leg.round}`, "SKIPPED: " + leg.skipped]); continue; }
    (byArm[leg.arm] = byArm[leg.arm] || []).push(leg);
    if (leg.error) { bad.push(`arm ${leg.arm} round ${leg.round}: ${leg.error}`); continue; }
    if (leg.window == null || leg.window.p50 == null) bad.push(`arm ${leg.arm} round ${leg.round}: no frame p50`);
    else if (!(leg.window.p50 > 0)) bad.push(`arm ${leg.arm} round ${leg.round}: hollow window, frame p50 is ${leg.window.p50} (state ${JSON.stringify(leg.window.state)})`);
    if (leg.expectBound && leg.bound !== leg.expectBound) {
      rows.push([`arm ${leg.arm} r${leg.round} bound`, `WANTED ${leg.expectBound}, GOT ${leg.bound} (the pin did not hold)`]);
      bad.push(`arm ${leg.arm} round ${leg.round}: wanted ${leg.expectBound}, bound ${leg.bound}: this arm did not measure what it names`);
    }
    if (leg.png) {
      rows.push([`shot ${leg.arm} r${leg.round}`, `${leg.png.w}x${leg.png.h} mean luma ${leg.png.meanLuma}, near-black ${(leg.png.nearBlack * 100).toFixed(0)}%`]);
      if (leg.png.meanLuma < 3 || leg.png.nearBlack > 0.98) bad.push(`arm ${leg.arm} round ${leg.round}: screenshot is blank (the wrong-picture class)`);
    }
    if (leg.diag && (leg.diag.storage || leg.diag.session)) rows.push([`arm ${leg.arm} r${leg.round} latches`, JSON.stringify({ ls: leg.diag.storage, ss: leg.diag.session }).slice(0, 300)]);
    if (leg.diag) {
      const d = leg.diag, e = d.diag && d.diag.env;
      rows.push([`arm ${leg.arm} r${leg.round} page`, JSON.stringify({ hidden: d.hidden, vis: d.vis, focus: d.focus, hasTLX: d.hasTLX, hasGfx: d.hasGfx, gfxLog: d.gfxLog, env: e && e.backendState, diagError: d.diagError }).slice(0, 900)]);
      rows.push([`arm ${leg.arm} r${leg.round} loop`, JSON.stringify({ phys: d.phys, physError: d.physError, loop: d.loopFrames, tail: d.logTail }).slice(0, 1400)]);
    }
  }
  for (const [arm, legs] of Object.entries(byArm)) {
    const p50s = legs.map((l) => l.window && l.window.p50);
    rows.push([`A/B ${arm}`, `window-1 p50 ${p50s.map(f1).join(" | ")} ms HOST-GPU, NOT PHONE (median ${f1(median(p50s))}), screenshot ${legs.filter((l) => l.shot).length}/${legs.length}`]);
  }
  return { rows, bad };
}

export const CAVEATS = [
  "THIS IS AN iOS SIMULATOR ON A MAC, NOT A PHONE. Mobile Safari runs on the runner's GPU through the host's Metal: every frame time below is that Mac's, not an iPhone's. Read them only as A/B ratios between arms on the same host, never as phone fps, and make no thermal, memory-pressure or jetsam claim.",
  "What it DOES establish is iOS-Safari correctness: which extensions and paths iOS's WebKit exposes (navigator.gpu, EXT_color_buffer_float, WEBGL_multi_draw, the timer-query extension) and whether TLX-on-WebGPU and GLX draw a correct picture. The screenshot per arm is the evidence: the wrong-picture class draws with zero GPU errors, so a number alone clears nothing.",
  "A simulator's GPU path is not an A-series GPU's: a correct picture here does not clear the arm on a phone, and a wrong one is a real finding. Per-frame JavaScript cost needs Safari Web Inspector Timelines on a device and is not automatable here.",
];

export function renderSummary(res, v) {
  const L = [];
  L.push(`## iPhone census — ${res.device} / iOS ${res.os || "?"} SIMULATOR (frame times are the Mac's, not a phone's)`);
  L.push("");
  L.push(`Target ${res.url}; session ${res.sessionId || "-"}; wall ${res.wallMin ?? "-"} min.`);
  L.push("");
  L.push("| row | value |", "|---|---|");
  for (const [k, val] of v.rows) L.push(`| ${k} | ${String(val).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
  L.push("");
  for (const c of CAVEATS) L.push("- " + c);
  L.push("");
  L.push(v.bad.length ? "**Verdict: FAIL**\n" + v.bad.map((b) => "- " + b).join("\n") : "**Verdict: PASS** (every leg produced its number; read the rows, a slow phone is a measurement, not a failure)");
  return L.join("\n");
}

// ───────────────────────── push request ─────────────────────────
// A workflow that exists only on a topic branch cannot be workflow_dispatch'ed
// (GitHub dispatches from the default branch's registry: the API 404s), and an
// agent token cannot dispatch anyway (gpu-census.yml, same story). So a push that
// edits .github/iphone-census-request.json runs THAT branch's tree with the
// file's fields, which override the dispatch defaults.

const REQ_ENV = {
  url: ["IC_URL", (v) => /^https:\/\/[^\s"'`$]+$/.test(v)],
  device: ["IC_DEVICE", (v) => /^[A-Za-z0-9 ().-]{1,40}$/.test(v)],
  os_version: ["IC_OS", (v) => /^[0-9.]{0,12}$/.test(v)],
  track: ["IC_TRACK", (v) => /^[a-z0-9_-]{1,32}$/.test(v)],
  soak_minutes: ["IC_SOAK", (v) => /^\d{1,2}$/.test(v)],
  arms: ["IC_ARMS", (v) => /^[a-z,]{1,40}$/.test(v)],
  rounds: ["IC_ROUNDS", (v) => /^[1-4]$/.test(v)],
  window_seconds: ["IC_WINDOW", (v) => /^\d{2,3}$/.test(v)],
};

/** Env lines (`IC_X=v`) for the fields of a request file that pass their
 *  allowlist; anything else is dropped and named in `rejected`. One line per
 *  key by construction: a value with a newline fails every pattern. */
export function requestEnv(req) {
  const lines = [], rejected = [];
  for (const [k, v] of Object.entries(req && typeof req === "object" ? req : {})) {
    const spec = REQ_ENV[k];
    if (!spec) { if (!k.startsWith("//")) rejected.push(k); continue; }
    const s = String(v);
    if (s !== "" && !spec[1](s)) { rejected.push(k); continue; }
    if (s !== "") lines.push(`${spec[0]}=${s}`);
  }
  return { lines, rejected };
}
