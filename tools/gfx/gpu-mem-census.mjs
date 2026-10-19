#!/usr/bin/env node
// gpu-mem-census.mjs — Requested GPU allocation estimates (textures, renderbuffers, buffers) on TLX's WebGL2 path, by format.
// @doc Requested WebGL2 allocation estimates by format, with explicit-delete accounting and coverage limits.
// @skill renderer-debug / playwright-probe
//
// WHAT IT ANSWERS. "What allocations were observed at wrapped WebGL2 API boundaries?" The numbers are COMPUTED from the
// allocation calls (texStorage2D/3D, texImage2D/3D, renderbufferStorage[Multisample], bufferData) with a
// bytes-per-texel table and the full mip chain, minus deleteTexture/deleteRenderbuffer/deleteBuffer. They are the
// bytes the game ASKED for, not what the driver resident-sets (padding, tiling and the drawing buffer are not
// counted; compressed formats are recorded as unknown). GC and implicit resource reclamation are not
// observed: bookkeeping subtracts explicit deletes only. The wrap is installed before the page boots.
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
exitIfHelp(argv, `usage: node tools/gfx/gpu-mem-census.mjs [track=monaco] [--warm 60] [--real-link] [--mobile] [--visits a,b,...] [--json PATH]
  --visits then switches to each listed circuit in turn (the race path) and prints the net bytes and GL create/delete counts after each,
  which describes explicit create/delete activity across track switches (three #34597, issue #2651).
  --mobile forces the phone tier (apex26.forceMobileTier=1: mirror "lite" rung etc.).
  Requested GPU allocation estimates by format on TLX's WebGL2 path, from the allocation calls (allocation estimates, not a driver number).
  Link calls are stubbed unless --real-link, so the scene reaches steady state quickly under SwiftShader.`);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--warm", "--json", "--visits"]);
const track = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]))[0] || "monaco";
const WARM = Number(flag("--warm", 60));
if (!Number.isSafeInteger(WARM) || WARM < 0 || WARM > 10000) throw new Error("--warm must be an integer from 0 to 10000");
const VISITS = String(flag("--visits", "") || "").split(",").map((x) => x.trim()).filter(Boolean);
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
  // Records contain numbers only: allocation bookkeeping never roots a GL object.
  const registry = () => {
    const ids = new WeakMap(), rows = new Map(); let next = 0;
    return { set(o, v) { if (!ids.has(o)) ids.set(o, ++next); rows.set(ids.get(o), v); }, get: (o) => o && rows.get(ids.get(o)),
      delete: (o) => rows.delete(ids.get(o)), values: () => rows.values(), get size() { return rows.size; } };
  };
  const st = { tex: registry(), rb: registry(), buf: registry(), life: {}, failed: [], unknown: [], contexts: 0, links: [] };
  st.failedCount = 0; st.unknownCount = 0;
  const record = (bucket, row) => { st[bucket + 'Count']++; if (st[bucket].length < 200) st[bucket].push(row); };
  const contexts = new WeakMap();
  const state = (gl) => { if (!contexts.has(gl)) { contexts.set(gl, { id: ++st.contexts, unit: 0, tex: new Map(), buf: new Map(), rb: null, vao: null, vaoBuffers: new WeakMap(), defaultElement: null, errors: [] }); } return contexts.get(gl); };
  const ref = (o) => o ? new WeakRef(o) : null, deref = (r) => r && r.deref();
  const BPP = { RGBA8:4, SRGB8_ALPHA8:4, RGB8:3, RG8:2, R8:1, RGBA16F:8, RGBA32F:16, R16F:2, R32F:4, RG16F:4, R11F_G11F_B10F:4, RGB10_A2:4,
    DEPTH_COMPONENT16:2, DEPTH_COMPONENT24:4, DEPTH_COMPONENT32F:4, DEPTH24_STENCIL8:4, DEPTH32F_STENCIL8:8, RGBA4:2, RGB565:2, RGB5_A1:2, RG32F:8, RGB16F:6 };
  const names = {};
  for (const k of Object.keys(BPP)) { const n = WebGL2RenderingContext[k] ?? P[k]; if (typeof n === 'number') names[n] = k; }
  const unsized = { 6408:4, 6407:3, 6403:1, 33319:2, 6402:1, 6406:1, 6409:1, 6410:2 };
  const bytes = (fmt, type) => {
    if (BPP[names[fmt]]) return BPP[names[fmt]];
    const n = unsized[fmt] ?? (fmt === WebGL2RenderingContext.RGBA ? 4 : undefined);
    const packed = { 32819:2, 32820:2, 33635:2, 33640:4, 35899:4, 35902:4, 34042:4, 36269:8 };
    return n && (packed[type] || n * ({5120:1,5121:1,5122:2,5123:2,5131:2,36193:2,5124:4,5125:4,5126:4}[type] || 0));
  };
  const target = (t) => t >= 34069 && t <= 34074 ? 34067 : t;
  const bound = (gl, t) => deref(state(gl).tex.get(state(gl).unit + ':' + target(t)));
  const image = (gl, t, level, fmt, w, h, d, type) => {
    const o = bound(gl, t); if (!o) return;
    const e = st.tex.get(o) || { b: 0, levels: {}, target: target(t), context: state(gl).id };
    const bpp = bytes(fmt, type), b = bpp ? w * h * d * bpp : 0;
    if (!bpp) record('unknown', { call: 'texture', fmt, type, w, h, d });
    e.levels[t + ':' + level] = { b, fmt: names[fmt] || String(fmt), w, h, d, bpp, level, face: t };
    Object.assign(e, { b: Object.values(e.levels).reduce((n, x) => n + x.b, 0), fmt: names[fmt] || String(fmt), w, h, d }); st.tex.set(o, e);
  };
  const originalError = P.getError;
  if (originalError) P.getError = function () { const q = state(this).errors; return q.length ? q.shift() : originalError.call(this); };
  const callbacks = new Map();
  const wrap = (n, f) => { if (callbacks.has(n)) { callbacks.get(n).push(f); return; } const original = P[n]; if (!original) return; callbacks.set(n, [f]); P[n] = function (...args) {
    const q = state(this).errors;
    const drain = () => { const found = []; if (originalError) for (let i = 0; i < 32; i++) { const e = originalError.call(this); if (!e) break; found.push(e); } return found; };
    for (const error of drain()) if (!q.includes(error)) q.push(error);
    let result; try { result = original.apply(this, args); } catch (e) { record('failed', { call: n, error: String(e).slice(0, 500) }); throw e; }
    const errors = drain(); for (const error of errors) if (!q.includes(error)) q.push(error);
    if (errors.length) record('failed', { call: n, errors }); else for (const callback of callbacks.get(n)) { try { callback.call(this, args, result); } catch (e) { record('unknown', { call: n, reason: 'instrumentation failed', error: String(e).slice(0, 500) }); } }
    return result;
  }; };
  wrap('activeTexture', function ([u]) { state(this).unit = u - 33984; });
  wrap('bindTexture', function ([t, o]) { state(this).tex.set(state(this).unit + ':' + target(t), ref(o)); });
  wrap('texStorage2D', function ([t, lv, fmt, w, h]) { for (const face of t === 34067 ? [34069,34070,34071,34072,34073,34074] : [t]) for (let i=0;i<lv;i++) image(this, face,i,fmt,Math.max(1,Math.floor(w/2**i)),Math.max(1,Math.floor(h/2**i)),1); });
  wrap('texStorage3D', function ([t, lv, fmt, w, h, d]) { for(let i=0;i<lv;i++) image(this,t,i,fmt,Math.max(1,Math.floor(w/2**i)),Math.max(1,Math.floor(h/2**i)),t === 32879 ? Math.max(1,Math.floor(d/2**i)) : d); });
  wrap('texImage2D', function (a) { let [t,lv,fmt,w,h,, ,type] = a; if (a.length === 6) { const src=a[5]; w=src.videoWidth||src.naturalWidth||src.width; h=src.videoHeight||src.naturalHeight||src.height; type=a[4]; } image(this,t,lv,fmt,w,h,1,type); });
  wrap('texImage3D', function ([t,lv,fmt,w,h,d,, ,type]) { image(this,t,lv,fmt,w,h,d,type); });
  wrap('generateMipmap', function ([t]) { const e=st.tex.get(bound(this,t)); if (!e) return; for(const base of Object.values(e.levels).filter(x=>x.level===0)) { const levels=1+Math.floor(Math.log2(Math.max(base.w,base.h,e.target===32879?base.d:1))); for(let i=1;i<levels;i++) { const w=Math.max(1,Math.floor(base.w/2**i)),h=Math.max(1,Math.floor(base.h/2**i)),d=e.target===32879?Math.max(1,Math.floor(base.d/2**i)):base.d; e.levels[base.face+':'+i]={...base,level:i,w,h,d,b:w*h*d*(base.bpp||0)}; } } e.b=Object.values(e.levels).reduce((n,x)=>n+x.b,0); });
  for (const call of ['compressedTexImage2D', 'compressedTexImage3D']) wrap(call, function ([t,lv,fmt,w,h,d]) { image(this,t,lv,-1,w,h,call.endsWith('3D')?d:1); record('unknown', { call, fmt, reason: 'compressed allocation is not estimated; previous same-level bytes replaced' }); });
  wrap('deleteTexture', ([o]) => { if(o) st.tex.delete(o); });
  wrap('bindRenderbuffer', function ([,o]) { state(this).rb=ref(o); });
  const rb = function (t,s,fmt,w,h) { const o=deref(state(this).rb); if(!o)return; const bpp=bytes(fmt); if(!bpp)record('unknown', {call:'renderbuffer',fmt}); st.rb.set(o,{b:w*h*(bpp||0)*Math.max(1,s),fmt:(names[fmt]||String(fmt))+' x'+s,w,h,d:1}); };
  wrap('renderbufferStorage',function ([t,fmt,w,h]) { rb.call(this,t,0,fmt,w,h); });
  wrap('renderbufferStorageMultisample',function (a) { rb.apply(this,a); });
  wrap('deleteRenderbuffer',([o])=>{if(o)st.rb.delete(o);});
  const bindBuffer = (gl,t,o) => { const c=state(gl); if(t===34963) { const vao=deref(c.vao); if(vao)c.vaoBuffers.set(vao,ref(o)); else c.defaultElement=ref(o); } else c.buf.set(t,ref(o)); };
  wrap('bindVertexArray',function ([o]) { state(this).vao=ref(o); });
  wrap('bindBuffer',function ([t,o]) { bindBuffer(this,t,o); });
  for(const call of ['bindBufferBase','bindBufferRange']) wrap(call,function ([t,,o]) { bindBuffer(this,t,o); });
  wrap('bufferData',function ([t,data,,offset=0,length]) { const c=state(this), vao=deref(c.vao), o=deref(t===34963 ? (vao?c.vaoBuffers.get(vao):c.defaultElement) : c.buf.get(t)); if(!o)return; const unit=data && data.BYTES_PER_ELEMENT || 1; const b=typeof data==='number'?data:data ? ((length === undefined || length === 0 ? data.byteLength/unit-offset : length)*unit) : 0; st.buf.set(o,b); });
  wrap('deleteBuffer',([o])=>{if(o)st.buf.delete(o);});
  for (const [c,d] of [['createTexture','deleteTexture'],['createBuffer','deleteBuffer'],['createVertexArray','deleteVertexArray'],['createProgram','deleteProgram'],['createShader','deleteShader'],['createFramebuffer','deleteFramebuffer'],['createRenderbuffer','deleteRenderbuffer']]) {
    const k=c.slice(6), live=new WeakSet(); st.life[k]={created:0,deleted:0}; wrap(c,(_a,result)=>{if(result){live.add(result);st.life[k].created++;}}); wrap(d,([o])=>{if(o && live.has(o)){live.delete(o);st.life[k].deleted++;}});
  }
  wrap('linkProgram', function ([program]) { st.linkCount=(st.linkCount||0)+1; const linked=!!this.getProgramParameter(program, this.LINK_STATUS); if(!linked)st.failedLinkCount=(st.failedLinkCount||0)+1; if(st.links.length<200)st.links.push({ linked, log: String(this.getProgramInfoLog(program)||'').slice(0,2000) }); });
  P.__gm=st; return true;
}
async function main() {
  let srv, browser;
  try {
    srv = await startStaticServer(ROOT);
    browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(initScript, { stub: !REAL_LINK, mobile: MOBILE });
    await ctx.addInitScript(installWrap);
    const page = await ctx.newPage();
    const errors = []; let pageErrorCount = 0;
    page.on("pageerror", (e) => { pageErrorCount++; if(errors.length<200)errors.push(String(e).slice(0, 200)); });
    // TLX exposes window.renderer / GLX.__tlx only behind this flag (tools/lib/mem-census.mjs reads it too).
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1");
    await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); });
    const rendererReady = await page.waitForFunction(() => !!window.renderer, null, { timeout: WAIT_MS, polling: 100 }).then(() => true, () => false);
    if (!rendererReady) throw new Error("window.renderer never appeared: this tool measures TLX (backend three) behind ?three-devtools=1");
    const backend = await page.evaluate(() => { const b = window.renderer.backend, gl = b && b.gl; return { api: gl instanceof WebGL2RenderingContext ? "webgl2" : b && b.isWebGPUBackend ? "webgpu" : "unknown", forceWebGL: gl instanceof WebGL2RenderingContext }; });
    if (backend.api !== "webgl2") throw new Error("Requested WebGL2 but renderer reports " + backend.api);
    await page.evaluate(async (warm) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < warm; i++) { A.setInput({ throttle: true, steer: 0.35 * Math.sin(i / 25) }); await raf(); }
    }, WARM);
    const snap = async () => page.evaluate(async () => {
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
        life: JSON.parse(JSON.stringify(st.life)), texMB: mb([...st.tex.values()].reduce((s, e) => s + e.b, 0)), rbMB: mb([...st.rb.values()].reduce((s, e) => s + e.b, 0)), bufMB: mb(bb), tex: st.tex.size, unknown: st.unknown, failed: st.failed, contexts: st.contexts, failedCount: st.failedCount, unknownCount: st.unknownCount, links: st.links, linkCount: st.linkCount || 0, failedLinkCount: st.failedLinkCount || 0 };
    });
    const initial = await snap();
    let out = initial;
    const visits = [{ track, texMB: out.texMB, rbMB: out.rbMB, bufMB: out.bufMB, life: out.life }];
    for (const t of VISITS) {
      await page.evaluate((id) => { window.__apex.race(id); }, t);
      await page.waitForFunction((id) => window.__apex.info().track === id, t, { timeout: WAIT_MS, polling: 100 });
      await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); });
      await page.evaluate(async (warm) => { const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r)); for (let i = 0; i < warm; i++) { A.setInput({ throttle: true }); await raf(); } }, WARM);
      const o = await snap();
      out = o;
      visits.push({ track: t, texMB: o.texMB, rbMB: o.rbMB, bufMB: o.bufMB, life: o.life });
    }
    console.log(`gpu-mem ${VISITS.at(-1) || track} ${MOBILE ? "mobile" : "desktop"}: textures ${out.texMB} MB (${out.tex}), renderbuffers ${out.rbMB} MB, buffers ${out.bufMB} MB`);
    for (const r of out.cat.slice(0, 14)) console.log(r.k.padEnd(34) + String(r.n).padStart(5) + String(r.mb).padStart(10) + " MB  biggest " + r.bigMB);
    console.log("largest textures:", out.big.join(" | "));
    if (VISITS.length) {
      console.log("\nvisit            net MB (tex+rb+buf)   created/deleted: Texture  Buffer  VertexArray  Program  Shader");
      for (const v of visits) { const l = v.life, f = (k) => `${l[k].created}/${l[k].deleted}`; console.log(v.track.padEnd(16) + String(+(v.texMB + v.rbMB + v.bufMB).toFixed(1)).padStart(12) + "          " + [f("Texture"), f("Buffer"), f("VertexArray"), f("Program"), f("Shader")].map((x) => x.padStart(10)).join("")); }
    }
    console.log("= gpu-mem " + JSON.stringify({ track: VISITS.at(-1) || track, mobile: MOBILE, texMB: out.texMB, rbMB: out.rbMB, bufMB: out.bufMB, errors: pageErrorCount }));
    const nativeFailure = REAL_LINK && (out.failedLinkCount > 0 || out.linkCount === 0);
    const ok = pageErrorCount === 0 && out.failedCount === 0 && !nativeFailure;
    const correctness = { status: REAL_LINK ? (ok ? "pass" : "fail") : "unverified",
      reason: REAL_LINK ? "Observed native link statuses and API/page errors; this is not a pixel or hardware-performance validation." : "Shader operations were stubbed; native rendering correctness was not tested." };
    const report = { ...out, ok, measurement: { status: ok ? "pass" : "fail", estimates: out.unknownCount ? "incomplete" : "supported-formats-only", interpretation: "Protocol completion and observed errors only; unknown estimates do not establish a negative leak finding." }, correctness, track: VISITS.at(-1) || track, initialTrack: track, initial, final: out, visits, backend,
      shaderLinkMode: REAL_LINK ? "native" : "stubbed", errors, pageErrorCount, interpretation: "Observed requested allocations minus explicit deletes, not driver residency. GC, context teardown, implicit resources and unsupported/compressed allocations are not subtracted or fully measured; totals can overcount or undercount actual live storage. Stubbed shader mode does not establish native rendering correctness.",
      provenance: { tool: "tools/gfx/gpu-mem-census.mjs", warm: WARM, mobile: MOBILE, requestedAPI: "webgl2", renderer: await page.evaluate(() => { const gl = window.renderer?.backend?.gl; return gl ? { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER) } : null; }) } };
    if (!ok) process.exitCode = 1;
    if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); }
  } finally {
    await shutdown();
  }
}

main().catch(async (e) => { console.error(e && e.stack || e); await shutdown(); process.exitCode = 2; });
