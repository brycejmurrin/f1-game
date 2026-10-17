#!/usr/bin/env node
// gpu-mem-census.mjs — GPU-resident bytes (textures, renderbuffers, buffers) on TLX's WebGL2 path, by format.
// @doc GPU-resident bytes by format after boot: textures, renderbuffers and buffers, from wrapped WebGL2 allocation calls.
// @skill renderer-debug / playwright-probe
//
// WHAT IT ANSWERS. "How much GPU memory does the game hold, and in what?" The numbers are COMPUTED from the
// allocation calls (texStorage2D/3D, texImage2D/3D, renderbufferStorage[Multisample], bufferData) with a
// bytes-per-texel table and the full mip chain, minus deleteTexture/deleteRenderbuffer/deleteBuffer. They are the
// bytes the game ASKED for, not what the driver resident-sets (padding, tiling and the drawing buffer are not
// counted; compressed formats are not tracked because the game uploads none). The wrap is installed before the
// page boots so nothing allocated at startup is missed.
//
// HOW. Same boot as the pass census (PR #2699, issue #2657): headless Chromium, TLX forced onto three's WebGL2 path, program
// links stubbed unless --real-link, `--mobile` forces the phone tier, then race → go → jump and WARM frames.
//
//   node tools/gfx/gpu-mem-census.mjs [track=monaco] [--warm 60] [--mobile] [--real-link] [--json PATH]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/gfx/gpu-mem-census.mjs [track=monaco] [--warm 60] [--real-link] [--mobile] [--json PATH]
  --mobile forces the phone tier (apex26.forceMobileTier=1: mirror "lite" rung etc.).
  GPU-resident bytes by format on TLX's WebGL2 path, from the allocation calls (exact counts, not a driver number).
  Link calls are stubbed unless --real-link, so the scene reaches steady state quickly under SwiftShader.`);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--warm", "--json"]);
const track = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]))[0] || "monaco";
const WARM = Math.max(0, +flag("--warm", 60) || 60);
const REAL_LINK = argv.includes("--real-link");
const MOBILE = argv.includes("--mobile");
const JSON_OUT = flag("--json", null);
const WAIT_MS = Math.max(60000, +process.env.APEX_PROFILE_WAIT_MS || 60000);

/** Page-side init script: force TLX onto three's WebGL2 path and (unless --real-link) stub program links. */
function initScript({ stub, mobile }) {
  try {
    if (mobile) localStorage.setItem("apex26.forceMobileTier", "1");
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "1");
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
    sessionStorage.setItem("apex26.wgxCapture", "0");
  } catch (_) { /* blocked storage: the defaults still run TLX */ }
  window.__TEST_MODE = true;
  if (!stub) return;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    P.linkProgram = function () {};
    P.compileShader = function () {};
    P.validateProgram = function () {};
    const gp = P.getProgramParameter, gs = P.getShaderParameter;
    P.getProgramParameter = function (p, k) { return k === this.LINK_STATUS || k === this.VALIDATE_STATUS || k === this.COMPLETION_STATUS_KHR ? true : gp.call(this, p, k); };
    P.getShaderParameter = function (s, k) { return k === this.COMPILE_STATUS ? true : gs.call(this, s, k); };
    P.getProgramInfoLog = function () { return ""; };
    P.getShaderInfoLog = function () { return ""; };
  }
}


function installWrap() {
  const P = WebGL2RenderingContext.prototype;
  if (P.__gm) return true;
  const BPP = { RGBA8:4, SRGB8_ALPHA8:4, RGB8:3, RG8:2, R8:1, RGBA16F:8, RGBA32F:16, R16F:2, R32F:4, RG16F:4, R11F_G11F_B10F:4, RGB10_A2:4,
    DEPTH_COMPONENT16:2, DEPTH_COMPONENT24:4, DEPTH_COMPONENT32F:4, DEPTH24_STENCIL8:4, DEPTH32F_STENCIL8:8, RGBA4:2, RGB565:2, RGB5_A1:2, RG32F:8, RGB16F:6, RGBA:4, RGB:3 };
  const names = {}; const gl0 = WebGL2RenderingContext;
  for (const k of Object.keys(gl0)) if (BPP[k] !== undefined && typeof gl0[k] === "number") names[gl0[k]] = k;
  const st = { tex: new Map(), rb: new Map(), buf: new Map(), bound: new Map(), peak: 0, log: [] };
  const sz = (fmt, w, h, d, lv) => { const b = BPP[names[fmt]]; if (!b) return 0; let t = 0; for (let i = 0; i < lv; i++) { t += Math.max(1, w >> i) * Math.max(1, h >> i) * Math.max(1, d >> i) * b; } return t; };
  const lvAll = (w, h) => 1 + Math.floor(Math.log2(Math.max(w, h)));
  const wrap = (n, f) => { const o = P[n]; P[n] = function () { try { f.apply(this, arguments); } catch (_) {} return o.apply(this, arguments); }; };
  wrap("bindTexture", function (t, o) { st.bound.set(t, o); });
  wrap("texStorage2D", function (t, lv, fmt, w, h) { const o = st.bound.get(t); if (o) st.tex.set(o, { b: sz(fmt, w, h, 1, lv), fmt: names[fmt], w, h, d: 1 }); });
  wrap("texStorage3D", function (t, lv, fmt, w, h, d) { const o = st.bound.get(t); if (o) st.tex.set(o, { b: sz(fmt, w, h, d, lv), fmt: names[fmt], w, h, d }); });
  wrap("texImage2D", function (t, lv, ifmt, w, h) {
    const o = st.bound.get(t); if (!o || lv !== 0) return;
    if (arguments.length <= 6) { const src = arguments[arguments.length - 1]; w = (src && (src.videoWidth || src.naturalWidth || src.width)) | 0; h = (src && (src.videoHeight || src.naturalHeight || src.height)) | 0; }   // (t, lv, ifmt, fmt, type, source)
    if (!w || !h) return;
    st.tex.set(o, { b: sz(ifmt, w, h, 1, 1), fmt: names[ifmt], w, h, d: 1, lv1: true });
  });
  wrap("texImage3D", function (t, lv, ifmt, w, h, d) { const o = st.bound.get(t); if (!o || lv !== 0) return; st.tex.set(o, { b: sz(ifmt, w, h, d, 1), fmt: names[ifmt], w, h, d, lv1: true }); });
  wrap("generateMipmap", function (t) { const o = st.bound.get(t); const e = o && st.tex.get(o); if (e && e.lv1) { e.b = Math.round(e.b * 4 / 3); e.lv1 = false; } });
  wrap("deleteTexture", function (o) { st.tex.delete(o); });
  const rbBound = { v: null };
  wrap("bindRenderbuffer", function (t, o) { rbBound.v = o; });
  const rbs = function (t, ifmt, w, h) { if (rbBound.v) st.rb.set(rbBound.v, { b: sz(ifmt, w, h, 1, 1), fmt: names[ifmt], w, h, d: 1 }); };
  wrap("renderbufferStorage", rbs);
  wrap("renderbufferStorageMultisample", function (t, s, ifmt, w, h) { if (rbBound.v) st.rb.set(rbBound.v, { b: sz(ifmt, w, h, 1, 1) * s, fmt: names[ifmt] + " x" + s, w, h, d: 1 }); });
  wrap("deleteRenderbuffer", function (o) { st.rb.delete(o); });
  const bufBound = new Map();
  wrap("bindBuffer", function (t, o) { bufBound.set(t, o); });
  wrap("bufferData", function (t, d) { const o = bufBound.get(t); if (!o) return; st.buf.set(o, typeof d === "number" ? d : (d && d.byteLength) | 0); });
  wrap("deleteBuffer", function (o) { st.buf.delete(o); });
  P.__gm = st;
  return true;
}
async function main() {
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(initScript, { stub: !REAL_LINK, mobile: MOBILE });
    await ctx.addInitScript(installWrap);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    // TLX exposes window.renderer / GLX.__tlx only behind this flag (tools/lib/mem-census.mjs reads it too).
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1");
    await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); });
    const ok = await page.waitForFunction(() => !!window.renderer, null, { timeout: WAIT_MS, polling: 100 }).then(() => true, () => false);
    if (!ok) throw new Error("window.renderer never appeared: this tool measures TLX (backend three) behind ?three-devtools=1");
    const backend = await page.evaluate(() => { const b = window.renderer.backend; return { api: b && b.isWebGPUBackend ? "webgpu" : "webgl2", forceWebGL: !(b && b.isWebGPUBackend) }; });
    await page.evaluate(async (warm) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < warm; i++) { A.setInput({ throttle: true, steer: 0.35 * Math.sin(i / 25) }); await raf(); }
    }, WARM);
    const out = await page.evaluate(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 5; i++) await raf();
      const st = WebGL2RenderingContext.prototype.__gm;
      const mb = (n) => +(n / 1048576).toFixed(2);
      const cat = {};
      for (const e of st.tex.values()) { const k = (e.d > 1 ? "3D/array " : "2D ") + e.fmt; const c = cat[k] || (cat[k] = { n: 0, b: 0, big: 0 }); c.n++; c.b += e.b; c.big = Math.max(c.big, e.b); }
      for (const e of st.rb.values()) { const k = "RB " + e.fmt; const c = cat[k] || (cat[k] = { n: 0, b: 0, big: 0 }); c.n++; c.b += e.b; c.big = Math.max(c.big, e.b); }
      let bb = 0, bn = 0; for (const v of st.buf.values()) { bb += v; bn++; }
      cat["buffers"] = { n: bn, b: bb, big: 0 };
      const big = [...st.tex.values()].sort((a, b) => b.b - a.b).slice(0, 8).map((e) => `${e.fmt} ${e.w}x${e.h}${e.d > 1 ? "x" + e.d : ""} ${mb(e.b)}MB`);
      return { cat: Object.entries(cat).map(([k, v]) => ({ k, n: v.n, mb: mb(v.b), bigMB: mb(v.big) })).sort((a, b) => b.mb - a.mb), big,
        texMB: mb([...st.tex.values()].reduce((s, e) => s + e.b, 0)), rbMB: mb([...st.rb.values()].reduce((s, e) => s + e.b, 0)), bufMB: mb(bb), tex: st.tex.size };
    });
    console.log(`gpu-mem ${track} ${MOBILE ? "mobile" : "desktop"}: textures ${out.texMB} MB (${out.tex}), renderbuffers ${out.rbMB} MB, buffers ${out.bufMB} MB`);
    for (const r of out.cat.slice(0, 14)) console.log(r.k.padEnd(34) + String(r.n).padStart(5) + String(r.mb).padStart(10) + " MB  biggest " + r.bigMB);
    console.log("largest textures:", out.big.join(" | "));
    console.log("= gpu-mem " + JSON.stringify({ track, mobile: MOBILE, texMB: out.texMB, rbMB: out.rbMB, bufMB: out.bufMB, errors: errors.length }));
    if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify(out, null, 2)); }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
