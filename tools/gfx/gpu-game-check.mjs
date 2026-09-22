#!/usr/bin/env node
// @doc Portable sibling of gfx-probe (no Lavapipe, no Linux paths): boots the game on the runner's real GPU and dumps errors.
/* gpu-game-check.mjs — run the ACTUAL GAME on whatever GPU this machine has,
 * and report the renderer's own verdict.
 *
 * The portable sibling of tools/gfx/gfx-probe.mjs. gfx-probe is tuned for this
 * container (Lavapipe ICD, soft-present blit, Linux paths); this one assumes
 * nothing but Playwright and a static server, so it runs on a GitHub macOS or
 * Windows image where a real adapter may exist. It answers the question the
 * software container cannot: with a hardware GPU, does the three.js/WebGPU path
 * boot, present, and reach zero uncaptured Dawn errors?
 *
 * It reads the SAME hooks the ?gfxdebug=1 overlay prints, so a CI answer and a
 * player's copy-pasted answer are directly comparable.
 *
 * Run: node tools/gfx/gpu-game-check.mjs [track] [--json out.json] [--shot out.png]
 *      [--backend three|webgpu] [--path webgpu|webgl2] [--boot-timeout MS]
 *      [--ls apex26.key=value ...]
 *
 * It checkpoints the --json file after every phase, so a step timeout leaves a
 * diagnosis on disk rather than nothing at all.
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// The spike-train verdict, shared with tools/gfx/frame-hitch.mjs rather than
// reimplemented: it is unit-tested both ways in
// tests/unit/frame-hitch-analyse.test.mjs, and a second copy of a periodicity
// test is a second copy of its bugs.
import { analyse, analysePasses, analysePassKinds, analyseCpu, analyseSpikeCpu, analyseSpikeWork } from "./frame-hitch.mjs";

// fileURLToPath, NOT `new URL(..).pathname`. On Windows that pathname is
// `/D:/a/f1-game/f1-game/` and resolve() prefixes the cwd's drive, giving a
// path that cannot exist — the server then 404s every file, the game never
// boots, and the boot wait below burns its whole timeout saying nothing.
// That is exactly what happened on windows-latest; docs/PERF-FINDINGS.md 2f.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".ico": "image/x-icon", ".txt": "text/plain", ".map": "application/json",
};
const PINNED = ["/opt/pw-browsers/chromium", process.env.APEX_CHROMIUM].filter(Boolean)
  .find((p) => { try { return existsSync(p); } catch (_) { return false; } }) || null;

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const track = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--json"
  && argv[argv.indexOf(a) - 1] !== "--shot" && argv[argv.indexOf(a) - 1] !== "--backend"
  && argv[argv.indexOf(a) - 1] !== "--path") || "montreal";
const backend = flag("--backend", "three");
// --ls key=value (repeatable), same contract as gfx-probe: drive a knob the
// pins do not know about — apex26.tlxForceHw above all, which is how the
// real-GPU content path is reproduced on a software adapter.
const extraLs = argv.reduce((acc, a2, i) => (a2 === "--ls" && argv[i + 1] ? acc.concat(argv[i + 1]) : acc), []);
const path3 = flag("--path", "webgpu");
// --beats N: the measured window, one beat a second (default 15). The window
// used to open at arm() with the car PARKED at the lights, and the pre-race
// phase (race entry + the TLX program warm) takes 10-15 s on macos-latest
// (census 200-207, beats: memState.presentMs=0 and the governor ring at n=1
// until the race), so fifteen beats held 0-5 s of a parked race. The race
// gate below waits for the race itself; --beats sizes what it then measures.
const beats = Math.max(1, Math.round(Number(flag("--beats", 15))) || 15);
// --no-drive keeps the car parked for the window (the pre-2026-09-22 census).
// The default DRIVES: a parked car streams nothing, and the hitch this tool
// exists to find is scenery reaching a moving car.
const drive = !process.argv.includes("--no-drive");

function serve() {
  // A server rooted at the wrong directory answers 404 to everything, which is
  // INDISTINGUISHABLE from a slow boot: both are silence until a timeout. Fail
  // here, in milliseconds, naming the path — the Windows outage cost two
  // sessions and ~30 min of runner time precisely because it did not.
  if (!existsSync(join(ROOT, "index.html"))) {
    throw new Error(`gpu-game-check: no index.html under ROOT ${ROOT} — the ` +
      `server would 404 every request and the boot wait would time out saying nothing`);
  }
  return new Promise((res, rej) => {
    const s = http.createServer((req, rp) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const f = join(ROOT, url === "/" ? "index.html" : url.replace(/^\/+/, ""));
      // Path containment: a static server that follows ../ out of the repo is a
      // hazard even in CI, and it costs one comparison to refuse.
      if (!f.startsWith(ROOT) || !existsSync(f)) { rp.writeHead(404); rp.end("nope"); return; }
      try {
        rp.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
        rp.end(readFileSync(f));
      } catch (_) { rp.writeHead(500); rp.end("err"); }
    });
    // Without this a bind failure is an unhandled 'error' event: the process
    // dies before any JSON is written and the gate reports "produced nothing".
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => res({ server: s, port: s.address().port }));
  });
}

const jsonAt = flag("--json", null);
const t0 = Date.now();
// A killed step leaves NOTHING behind: no log (a job's log is a 404 until the
// job ends) and no artifact. So write the JSON after every phase — whatever
// phase the run reached is then on disk when the step timeout fires, and a
// hang becomes evidence instead of a blank. `phase` is the load-bearing field.
function checkpoint(phase, extra) {
  out.phase = phase;
  out.elapsedMs = Date.now() - t0;
  if (extra) Object.assign(out, extra);
  if (jsonAt) { try { writeFileSync(jsonAt, JSON.stringify(out, null, 2)); } catch (_) { /* disk */ } }
  console.log(`[game-check] ${phase} +${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const log = (m) => console.log(`[game-check] ${m}`);
const out = { platform: process.platform, arch: process.arch, track, backend, path: path3 };
const { server, port } = await serve();
const browser = await chromium.launch({
  ...(PINNED ? { executablePath: PINNED } : { channel: "chromium" }),
  args: ["--enable-unsafe-webgpu", ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
});
checkpoint("browser-launched");
// ABOVE the try, deliberately. This was `const console_ = []` INSIDE the try
// while the finally below reads it — sibling scopes, so the finally threw
// `ReferenceError: console_ is not defined` on EVERY run, success or failure.
// Everything after that line was dead: out.console (the diagnostic lines a
// previous round moved into the finally precisely so a FAILING run would keep
// them), out.root (added to name the Windows path bug — never once set on a
// real run), the bounded browser/server teardown, and the final process.exit,
// so the tool always exited non-zero even when ok:true. `continue-on-error:
// true` on all four census steps swallowed it, and checkpoint() had already
// written the JSON, so nothing ever looked wrong. docs/PERF-FINDINGS.md 2l.
const console_ = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (console_.length < 200) console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => console_.push("pageerror: " + String(e && e.message).slice(0, 300)));
  // A renderer crash makes every later page.evaluate hang FOREVER rather than
  // throw — which is how two macOS runs burned 20 minutes each and reported
  // nothing but "timed out". Playwright emits this; nobody was listening.
  page.on("crash", () => { out.crashed = true; checkpoint("renderer-crashed"); });
  page.on("close", () => { out.pageClosed = true; });
  browser.on("disconnected", () => { out.browserGone = true; });
  await page.addInitScript(([be, p, ls]) => {
    // THE SPIKE TRAIN, recorded on the machine that has a real GPU.
    //
    // Everything else this file measures is a SETTLED number: fps is an EMA,
    // floorMs a derived budget, and PerfGov's own frameStats() is percentiles
    // over a ring, so the summary can only aggregate per-beat percentiles and
    // a max-of-p95 collapses onto the single worst stall (census 195 printed
    // p95 == p99 == max on all four legs for exactly that reason). None of
    // them can answer the actual report — "it hitches every few seconds" —
    // which is a question about the PERIOD of the tail.
    //
    // So record every rAF callback's own wall cost, the way frame-hitch.mjs
    // does in the container, and let analyse() find the spikes and ask whether
    // they are evenly spaced. Installed before any page script so it wraps the
    // game's own rAF chain, preallocated so the recorder never allocates
    // inside the frame it is timing, and armed later so the track build and
    // the first laps of warm-up are not counted as hitches.
    const _hCAP = 40000;
    const _hT = new Float64Array(_hCAP), _hD = new Float64Array(_hCAP);
    const _hP = new Int16Array(_hCAP);
    let _hN = 0, _hArmed = false, _hPass = 0, _hSigCur = [];
    const _hSig = [];
    // THE PASS CENSUS, and the reason it belongs HERE rather than only in the
    // container. tlx-shadow.js sizes its maps by `softwareGL`: SUN_SIZE is 512
    // on a software adapter and 2048 on a real desktop, CAR_SIZE 256 against
    // 1024. macos-latest reports softAdapter=false, so this job is the only
    // place this project can see what the shadow rebuild actually costs at the
    // size a player renders it — sixteen times the pixels the container
    // measured. Resolution is the fingerprint; GPUTextureView carries no size,
    // so tag the view as it is created from a texture that does.
    // WHAT THE RESOURCE BURST IS MADE OF. Run 197's beats showed the uniform
    // buffer count go 90 -> 558 in one second as the race started, then climb
    // to 755 while groupVer went 3 -> 190 and fps halved, with frames of 258,
    // 346, 441 and 556 ms landing in that window. A new uniform buffer is a
    // new three RenderObject; whether it also cost a PIPELINE COMPILE is the
    // difference between "allocate faster" and "warm the programs", and the
    // beats cannot tell them apart. Count the calls: they are exact even
    // where milliseconds are not.
    const _hWork = new Map();
    // WHO COMPILES. Run 198 counted 25 synchronous createRenderPipeline calls
    // in the race window on the TLX/WebGPU leg against 1 on WGX, and the
    // spike counts track them one for one. A count says the renderer is
    // compiling mid-race; it does not say which draw asked for a program the
    // warm never built. Capture a bounded sample of stacks per compile and
    // aggregate by signature — the answer wanted is a function name in our
    // own files, below three's, so keep enough frames to walk through three.
    const _hStacks = new Map();
    let _hStackBudget = 200;
    // createShaderModule, not createRenderPipeline: patch 7 moved the lazy
    // WebGPU path to createRenderPipelineAsync, so run 202 had nothing to
    // attribute but the mipmap pipeline. A shader module is exactly one per
    // new program on both paths, and it is created right after the codegen
    // that census 202 named as the cost.
    const STACK_KINDS = { "gpu.createShaderModule": 1, "gpu.createRenderPipeline": 1, "gl.linkProgram": 1 };
    // PER FRAME as well as per window: census 208 counted 778 createBuffer
    // and 705 createBindGroup calls over a driven window beside eleven
    // 130-310 ms callbacks, and a window total cannot say whether the spike
    // frames made them. One record per callback that made any call.
    let _hWorkCur = null;
    const _hWorkFrames = [];
    const _bumpWorkN = (k, n) => {
      if (!_hArmed) return;
      if (_hWorkCur === null) _hWorkCur = {};
      _hWorkCur[k] = (_hWorkCur[k] || 0) + n;
    };
    const _bumpWork = (k) => {
      if (!_hArmed) return;
      _hWork.set(k, (_hWork.get(k) || 0) + 1);
      _bumpWorkN(k, 1);
      if (!STACK_KINDS[k] || _hStackBudget <= 0) return;
      _hStackBudget--;
      let sig = "?";
      try {
        // THE WHOLE STACK for the OURS filter. Run 199 kept fifteen frames
        // and every WebGPU compile came back "(none in window)": three's
        // render path from _getRenderPipeline up to renderer.render() is
        // deeper than that, and the frame that names a fix sits above it.
        // A bounded sample (200) of full stacks is cheap; a window that
        // never reaches our code is worthless.
        // V8 captures 10 frames by default; three's render path from
        // createRenderPipeline up to renderer.render() is longer than that, so
        // run 200 read every WebGPU compile as "(none in window)" with the
        // slice already removed — the window was the engine's, not ours.
        const prevLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 80;
        let raw;
        try { raw = (new Error().stack || "").split("\n").slice(3); } finally { Error.stackTraceLimit = prevLimit; }
        const fr = raw.map((l) => l.trim().replace(/^at\s+/, "").replace(/\?v=[a-z0-9]+/g, "").replace(/https?:\/\/[^\s)]*\//g, ""));
        const ours = fr.filter((l) => !/three\.webgpu|three\.core|three\.tsl/.test(l));
        sig = fr.slice(0, 2).join(" <- ") + "  ||OURS|| " + (ours.slice(0, 5).join(" <- ") || "(none in window)");
      } catch (_) { /* no stack: the count still stands */ }
      const key = k + " :: " + sig;
      _hStacks.set(key, (_hStacks.get(key) || 0) + 1);
    };
    try {
      const wrapCall = (proto, name, kind) => {
        if (!proto || typeof proto[name] !== "function") return;
        const orig = proto[name];
        proto[name] = function () { _bumpWork(kind); return orig.apply(this, arguments); };
      };
      const GD = window.GPUDevice && window.GPUDevice.prototype;
      wrapCall(GD, "createRenderPipeline", "gpu.createRenderPipeline");
      wrapCall(GD, "createRenderPipelineAsync", "gpu.createRenderPipelineAsync");
      wrapCall(GD, "createShaderModule", "gpu.createShaderModule");
      wrapCall(GD, "createBindGroup", "gpu.createBindGroup");
      wrapCall(GD, "createBuffer", "gpu.createBuffer");
      // The upload side: how many writes a frame makes and how many KB they
      // carry (size is elements for a typed array, bytes for an ArrayBuffer).
      const GQ = window.GPUQueue && window.GPUQueue.prototype;
      if (GQ && typeof GQ.writeBuffer === "function") {
        const origWB = GQ.writeBuffer;
        GQ.writeBuffer = function (buffer, offset, data, dataOffset, size) {
          _bumpWork("gpu.writeBuffer");
          try {
            const per = (data && data.BYTES_PER_ELEMENT) || 1;
            const bytes = size != null ? size * per : ((data && data.byteLength) || 0) - ((dataOffset || 0) * per);
            _bumpWorkN("gpu.writeBufferKB", Math.max(0, bytes) / 1024);
          } catch (_) { /* the count stands without the size */ }
          return origWB.apply(this, arguments);
        };
      }
      wrapCall(GQ, "submit", "gpu.submit");
      const G2 = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;
      wrapCall(G2, "linkProgram", "gl.linkProgram");
      wrapCall(G2, "compileShader", "gl.compileShader");
      wrapCall(G2, "getProgramParameter", "gl.getProgramParameter");
    } catch (_) { /* a frozen prototype leaves this column absent, not zero */ }
    try {
      const TP = window.GPUTexture && window.GPUTexture.prototype;
      if (TP && typeof TP.createView === "function") {
        const origCV = TP.createView;
        TP.createView = function () {
          const v = origCV.apply(this, arguments);
          try { v.__sig = this.width + "x" + this.height + "/" + this.format; } catch (_) { /* expando refused */ }
          return v;
        };
      }
      const CE = window.GPUCommandEncoder && window.GPUCommandEncoder.prototype;
      if (CE && typeof CE.beginRenderPass === "function") {
        const origBRP = CE.beginRenderPass;
        CE.beginRenderPass = function (desc) {
          if (_hArmed) {
            _hPass++;
            if (_hSigCur.length < 64) {
              let sig = "";
              try {
                const ca = (desc && desc.colorAttachments) || [];
                for (let i = 0; i < ca.length; i++) {
                  const v = ca[i] && (ca[i].view || ca[i].resolveTarget);
                  sig += (i ? "+" : "") + ((v && v.__sig) || "?");
                }
                if (!ca.length) sig = "depth-only";
                if (desc && desc.depthStencilAttachment) sig += "|d";
                const lo = ca.length && ca[0] ? ca[0].loadOp
                  : (desc && desc.depthStencilAttachment && desc.depthStencilAttachment.depthLoadOp);
                if (lo) sig += ":" + lo;
              } catch (_) { sig = "?"; }
              _hSigCur.push(sig);
            }
          }
          return origBRP.apply(this, arguments);
        };
      }
    } catch (_) { /* WebGL2 legs have no GPUCommandEncoder; the timing still runs */ }
    try {
      // THE DRIVER. tests/specs/autopilot.spec.js's closed-loop law — a braking
      // envelope over scan() (v_now^2 = v_corner^2 + 2 a d for every look-ahead
      // point), pure pursuit on probe() — run from the RAW rAF against the live
      // loop: setInput() only, the game steps itself. It binds the un-wrapped
      // requestAnimationFrame on purpose: the hitch recorder below wraps every
      // callback, and a second callback per frame would halve every per-frame
      // statistic it reports.
      const _rawRaf = window.requestAnimationFrame.bind(window), _rawCaf = window.cancelAnimationFrame.bind(window);
      const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
      const VMAX = 94, A_LAT = 13, A_BRAKE = 24, KP = 2.4;
      let _dOn = false, _dRaf = 0, _dPrev = 0, _dHold = 30, _dStalled = 0, _dLastProg = null, _dLastS = null;
      let _dFrames = 0, _dDist = 0, _dSpeedSum = 0, _dOff = 0, _dErr = null;
      const tick = (ts) => {
        if (!_dOn) return;
        _dRaf = _rawRaf(tick);
        const A = window.__apex;
        if (!A || !A.probe || !A.scan || !A.setInput) return;
        const dt = _dPrev ? Math.min(0.1, Math.max(0.001, (ts - _dPrev) / 1000)) : 1 / 60; _dPrev = ts;
        let p = null, pts = null;
        try { p = A.probe(); pts = p ? A.scan(DISTS) : null; } catch (e) { _dErr = String(e && e.message).slice(0, 80); return; }
        if (!p || !pts) return;
        let kSteer = p.k; const steerLook = Math.max(9, p.speed * 0.4);
        let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
        for (let j = 0; j < pts.length; j++) {
          const d = DISTS[j], k = Math.abs(pts[j].k);
          if (d <= steerLook) kSteer = pts[j].k;
          const vCorner = k > 1e-4 ? Math.sqrt(A_LAT / k) : VMAX;
          const vAllow = Math.sqrt(vCorner * vCorner + 2 * A_BRAKE * d);
          if (vAllow < vT) vT = vAllow;
        }
        vT = Math.max(11, Math.min(VMAX, vT));
        _dHold = Math.min(vT, _dHold + 30 * dt); vT = _dHold;
        const L = Math.max(8, Math.min(38, p.speed * 0.6));
        const latTarget = kSteer * L * L * 0.5;
        let steer = KP * (Math.atan2(latTarget - p.x, L) - p.angle);
        steer = Math.max(-1, Math.min(1, steer));
        const offRoad = Math.abs(p.x) - p.hw > 0.4;
        if (_dLastProg != null && p.s - _dLastProg < 0.05 && p.speed < 3) _dStalled++; else _dStalled = 0;
        _dLastProg = p.s;
        let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
        if (_dStalled > 10) { steer = Math.max(-0.4, Math.min(0.4, steer)); throttle = true; brake = false; }
        else if (offRoad) { throttle = false; }
        try { A.setInput({ steer, throttle, brake }); } catch (e) { _dErr = String(e && e.message).slice(0, 80); }
        _dFrames++; _dSpeedSum += p.speed; if (offRoad) _dOff++;
        if (_dLastS != null) { const ds = p.s - _dLastS; if (ds > 0 && ds < 50) _dDist += ds; }
        _dLastS = p.s;
      };
      window.__gcDrive = {
        start() {
          if (_dOn) return;
          // park(0.1) FREEZES the sim for a deterministic screenshot (apex.js
          // park: G.frozen = true), so a driver over a parked car goes nowhere
          // — the first local dry run ticked 14 frames for 0 m. Lift the
          // freeze and release the field, then drive.
          const A = window.__apex;
          try { if (A && A.freeze) A.freeze(false); } catch (_) { /* pre-park */ }
          try { if (A && A.go) A.go(); } catch (_) { /* no race yet */ }
          _dOn = true; _dPrev = 0; _dRaf = _rawRaf(tick);
        },
        stop() {
          _dOn = false;
          try { _rawCaf(_dRaf); } catch (_) { /* already fired */ }
          const A = window.__apex;
          try { if (A && A.clearInput) A.clearInput(); } catch (_) { /* input hook absent */ }
          // Put the car back where every later phase (feature A/B, shots)
          // expects it: parked at 0.1, frozen — the state before the window.
          try { if (A && A.park) A.park(0.1); } catch (_) { /* the A/B re-parks on its own */ }
        },
        stats: () => ({ frames: _dFrames, distM: Math.round(_dDist), meanSpeed: _dFrames ? +(_dSpeedSum / _dFrames).toFixed(1) : 0,
                        offRoadFrames: _dOff, error: _dErr }),
      };
    } catch (_) { /* no driver: the window measures a parked car, and the race: row says PARKED */ }
    try {
      const _raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function (cb) {
        return _raf(function (ts) {
          const a = performance.now();
          try { return cb(ts); } finally {
            if (_hArmed && _hN < _hCAP) {
              _hT[_hN] = a; _hD[_hN] = performance.now() - a;
              _hP[_hN] = _hPass > 32767 ? 32767 : _hPass;
              if (_hN < 4000) _hSig.push(_hSigCur);
              if (_hWorkCur !== null && _hWorkFrames.length < 4000) _hWorkFrames.push([_hN, _hWorkCur]);
              _hN++;
            }
            _hPass = 0; _hSigCur = []; _hWorkCur = null;
          }
        });
      };
      window.__gcHitch = {
        arm() { _hArmed = true; _hN = 0; _hSig.length = 0; _hWork.clear(); _hStacks.clear(); _hStackBudget = 200; _hWorkFrames.length = 0; _hWorkCur = null; },
        dump: () => ({ t0: Array.from(_hT.subarray(0, _hN)), dur: Array.from(_hD.subarray(0, _hN)),
                       passes: Array.from(_hP.subarray(0, _hN)), passSig: _hSig,
                       work: [..._hWork.entries()].sort((a, b) => b[1] - a[1]),
                       workFrames: _hWorkFrames,
                       stacks: [..._hStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30) }),
      };
    } catch (_) { /* a frozen rAF just means this leg reports no hitch series */ }
    try {
      localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three") localStorage.setItem("apex26.tlxForceGL", p === "webgl2" ? "1" : "0");
      localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
      // GLX drains gl.getError() only for the first presents unless this is
      // set: the census is the consumer of the per-present drain (2e).
      localStorage.setItem("apex26.glErrDrain", "1");
    } catch (_) { /* blocked storage: the defaults still boot */ }
    for (const kv of ls || []) {
      const i = kv.indexOf("=");
      if (i > 0) { try { localStorage.setItem(kv.slice(0, i), kv.slice(i + 1)); } catch (_) { /* blocked */ } }
    }
    // RACE-ENTRY ATTRIBUTION (2026-09-16), for the multithreading plan's gate
    // (docs/notes/MULTITHREADING-PLAN-2026-09-16.md §4). That plan asks three
    // questions about MAIN-THREAD JAVASCRIPT, not about the GPU, and says this
    // container cannot answer them. Two of the three need only a real CPU;
    // the third — is the block the track build, or upload back-pressure
    // wearing a costume, which this repository has already caught once — needs
    // a real driver, and macos-latest is the one image the census has measured
    // as anyHardware:true (docs/notes/CI-RENDERING-PERFORMANCE.md).
    //
    // A long task is the browser own definition of a main-thread block: a task
    // over 50 ms. `buffered: true` and an init script together mean the window
    // starts before the first line of game code runs, so nothing is missed.
    // Costs nothing on a run that does not read it.
    window.__apexLongTasks = [];
    window.__apexMarks = {};
    window.__apexMark = (n) => { try { window.__apexMarks[n] = performance.now(); } catch (_) { /* no clock */ } };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (window.__apexLongTasks.length < 4000) window.__apexLongTasks.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]);
        }
      }).observe({ type: "longtask", buffered: true });
      window.__apexLongTaskObserver = true;
    } catch (_) {
      // Absence must not read as "no blocking". The reader below reports
      // supported:false rather than a zero, because a zero here would say the
      // item is dead when nothing had looked.
      window.__apexLongTaskObserver = false;
    }
  }, [backend, path3, extraLs]);

  // Bounded: a wedged renderer must not turn the diagnosis into another blank.
  const bounded = (fn, ms, label) => Promise.race([
    fn(),
    new Promise((_, rj) => setTimeout(() => rj(new Error(label + " timeout")), ms)),
  ]).catch((err) => ({ error: String((err && err.message) || err).slice(0, 120) }));

  await page.goto(`http://127.0.0.1:${port}/index.html?gfxdebug=1`,
    { waitUntil: "domcontentloaded", timeout: 120000 });
  checkpoint("navigated");
  // 120 s. This was once raised to 300 s on the theory that windows-latest was
  // "a software rasteriser that is ALSO a slow disk" — it was not. ROOT was
  // computed with a Windows-broken idiom, so the server 404'd index.html and
  // the page could never boot at ANY timeout; the raise turned a 2-minute
  // failure into a 5-minute one and taught nothing. Widening a tolerance to
  // make something pass is forbidden outright (AGENTS.md); this is the revert.
  await page.waitForFunction(() => window.__apex != null, null,
    { polling: 100, timeout: Number(flag("--boot-timeout", 120000)) });
  checkpoint("booted");
  out.adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { hasGpu: false };
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      const i = (a && a.info) || {};
      return { hasGpu: true, vendor: i.vendor, architecture: i.architecture, description: i.description };
    } catch (e) { return { hasGpu: true, error: String((e && e.message) || e) }; }
  });

  // race() and park() were the last unbounded evaluates. A renderer that
  // wedges DURING the track load hangs them forever, and then the beats below
  // — the whole diagnosis — never run at all.
  // TIME OF DAY IS A BUILD INPUT, NOT A RENDER ONE — which is what census 153
  // established, by printing the gate instead of leaving it to be inferred:
  //
  //   LAMP BRANCH DID NOT RUN — 0 lamp draws vs 312 plain;
  //   perChunkLights=0 allLights=-1
  //
  // allLights null means the track carries no baked lamps at all. Lamps are
  // baked when the track is BUILT, and this called race(t) with no time of day,
  // so no clock setting afterwards can add them. The --clock work of the
  // previous commit pins the SKY, and pinning the sky at 02:00 over a track
  // built without lamps is a dark scene with nothing to light it — which is why
  // the night leg looked exactly like noon.
  const tod = flag("--tod", "");
  out.raceCall = await bounded(() => page.evaluate(([t, d]) => {
    window.__apexMark("raceCall");
    return d ? window.__apex.race(t, d) : window.__apex.race(t);
  }, [track, tod]), 60000, "race");
  out.timeOfDay = tod || "(default)";
  checkpoint("race-called");
  // 300 s was a guess made against a software rasteriser; on a real GPU the
  // load is seconds, so a long wait here only delays the beats that carry the
  // answer. Fail fast and let the beat trace speak.
  out.trackReady = await bounded(
    () => page.waitForFunction(() => window.__apex.info().track != null, null,
      { polling: 100, timeout: 120000 }), 130000, "track-ready");
  checkpoint("track-ready");
  await bounded(() => page.evaluate(() => window.__apexMark("trackReady")), 10000, "mark-track-ready");
  out.parkCall = await bounded(() => page.evaluate(() => { window.__apexMark("parked"); return window.__apex.park(0.1); }), 60000, "park");
  // WHAT IS THE FRAME BOUND BY. The one question that decides whether "render
  // only what we can see" is the right lever: occlusion culling removes
  // fragments, vertices and draw calls together, so it pays hugely on a
  // fragment-bound frame and modestly on a draw-call-bound one. The census
  // rejected it once on the argument that the frame cost is draw calls and
  // uploads — an argument, never a measurement. gpuTimer() is the measurement,
  // and pinning apex26.resMode across two runs is the A/B: GPU time that
  // scales with pixel count is fragment-bound.
  out.gpuTimerStart = await bounded(() => page.evaluate(() => window.__apex.gpuTimer(true)), 20000, "gpu-timer-on");
  checkpoint("racing", { track });
  // THE RACE GATE. park() sits the car at the lights and the TLX program warm
  // holds the whole loop (game.js tickBody returns while gfx.warming()) — 10 to
  // 15 s on macos-latest, measured across census 200-207 — so a window armed
  // here timed the lights and 0-5 s of a parked race, whatever it reported.
  // Wait for state "race" with no warm pending, then drive, THEN arm.
  const _gateT0 = Date.now();
  out.race = { beats, drive, reached: false };
  try {
    await page.waitForFunction(() => {
      const A = window.__apex; const i = A && A.info ? A.info() : null;
      const t = (typeof GLX !== "undefined" && GLX) ? GLX.__tlx : null;
      // TLX requests its warm at race start and STARTS it on the next present,
      // so "not warming" alone is true in the gap before it begins (the local
      // dry run passed the gate at +0.1 s and then timed the warm anyway). A
      // leg that has a warm must have FINISHED one; GLX/WGX report no warm.
      const m = t && t.memState ? t.memState() : null;
      const w = m && m.warm ? m.warm : null;
      const warming = !!(t && t.warming && t.warming());
      const warmDone = !w || w.done === true;
      return !!(i && i.state === "race" && !warming && warmDone);
    }, null, { polling: 100, timeout: Number(flag("--race-timeout", 90000)) });
    out.race.reached = true;
  } catch (e) {
    out.race.note = "RACE NOT REACHED: " + String((e && e.message) || e).slice(0, 100);
  }
  out.race.gateMs = Date.now() - _gateT0;
  // The warm's own timeline (tlx.js memState().warm): how long the lights held
  // for a player on this GPU, by stage. Absent on GLX/WGX, which have no warm.
  out.race.warm = await bounded(() => page.evaluate(() => {
    const t = (typeof GLX !== "undefined" && GLX) ? GLX.__tlx : null;
    const m = t && t.memState ? t.memState() : null;
    return m && m.warm ? m.warm : null;
  }), 10000, "warm-read").catch(() => null);
  if (drive && out.race.reached) {
    out.race.driver = await bounded(() => page.evaluate(() => {
      if (!window.__gcDrive) return "absent";
      window.__gcDrive.start(); return "started";
    }), 10000, "drive-start").catch((e) => "failed: " + String((e && e.message) || e).slice(0, 60));
  }
  checkpoint("race-gate", out.race);
  // Poll instead of one blind sleep. The question after park() is whether the
  // page is STILL ANSWERING, and a single waitForTimeout cannot tell a healthy
  // wait from a wedged renderer — on Apple Metal both three paths went silent
  // here and the run learned nothing for twenty minutes. Each poll carries its
  // own short timeout, so the last successful beat is recorded either way.
  // TWO consecutive misses, not one. MEASURED (census 72/73/74, macos-latest):
  // a TLX leg stalls its main thread past a whole 8 s beat — webgpu answered
  // once at 16.6 s then went silent, webgl2 missed the very FIRST beat — while
  // GLX and WGX answered all fifteen 1 s apart on the same runs. Bailing on the
  // first miss ended the settle at 5-7 frames, which then reported as a slow
  // renderer (fps 4.9-9) and an env probe that never latched, and cost four
  // dispatches chasing a resolution theory that was never the cause. A stall is
  // not a death: the long pole is the TSL graph rebuild, which is why pinning
  // resMode made BOTH three legs miss (run 74) when only webgpu had before.
  // The 8 s per-beat timeout is UNCHANGED — this is not a widened tolerance,
  // it is refusing to call one slow beat a corpse, the same reason tlx.js
  // heals on HEAL_MIN_FRAMES = 2 rather than on a single transient.
  out.beats = [];
  // Arm AFTER the track build and the boot ladder: an opening stall is a
  // different report (out.raceProfile answers that one) and counting it here
  // would put one 1.4 s frame in the spike list and call the run periodic.
  try { await page.evaluate(() => window.__gcHitch && window.__gcHitch.arm()); } catch (_) { /* no recorder on this leg */ }
  // WHERE THE CPU TIME GOES over the same window, by function. Census 201
  // moved every lazy pipeline compile off the main thread (createRenderPipeline
  // 26 -> 1) and the 18-25 s spikes stayed, so the stall is one step upstream
  // in the same first-draw path — node-graph codegen, per-object bind-group
  // cloning, uniform-buffer allocation, or something not yet named. Those are
  // CPU time, which V8's sampling profiler measures honestly (the heap sampler
  // was the wrong tool for garbage; this one has no such gap). And it has to
  // run HERE: the burst is scenery streaming into view as the car reaches new
  // track, and the container's car drives into the first wall, so its
  // profile is flat — 40% idle, no function above 2.3%.
  let _cpu = null, _cpuProfile = null, _cpuPageAtStart = null;
  try {
    _cpu = await page.context().newCDPSession(page);
    await _cpu.send("Profiler.enable");
    await _cpu.send("Profiler.setSamplingInterval", { interval: 500 });
    await _cpu.send("Profiler.start");
    // The clock join for the spike attribution: the page clock as the profile
    // began, within one CDP round trip (analyseSpikeCpu prints its coverage).
    _cpuPageAtStart = await page.evaluate(() => performance.now());
  } catch (e) { out.cpuProfileError = String((e && e.message) || e).slice(0, 120); _cpu = null; }
  let missed = 0;
  for (let i = 0; i < beats; i++) {
    if (out.crashed || out.browserGone) break;
    try {
      const beat = await Promise.race([
        // `f` READ info().fps, WHICH DOES NOT EXIST — so every beat of every leg
        // of every census has logged f: 0, and the one per-second time series on
        // real hardware has always been blank. The governor snapshot is where fps
        // lives (renderScale()/perf()); tier and scale come with it for free, so a
        // leg that starts at 60 and decays now shows the CURVE instead of one
        // settled number. A settled number cannot see a decay, which is exactly
        // the shape a player reports as "fine for a few seconds, then not".
        page.evaluate(() => {
          const A = window.__apex; let g = null;
          try { g = A && A.renderScale && A.renderScale(); } catch (_) { /* pre-boot */ }
          return {
            t: (A && A.info && A.info().track) || null,
            f: g && g.fps != null ? Math.round(g.fps) : 0,
            ms: g && g.floorMs != null ? +(+g.floorMs).toFixed(1) : null,
            ti: g ? g.tier : null,
            sc: g && g.scale != null ? +(+g.scale).toFixed(2) : null,
            // GPU milliseconds for a recent frame, -1 until a result lands and
            // -1 forever where EXT_disjoint_timer_query_webgl2 is absent. A
            // negative is NOT a GPU millisecond; the reader below drops them.
            gms: (() => { try { const q = A && A.gpuTimer && A.gpuTimer(); return q && q.ms > 0 ? +q.ms.toFixed(2) : null; } catch (_) { return null; } })(),
            // TLX uniform-buffer census (tlx.js memState): how many uniform
            // buffers three holds and how many KB — the shared frame block
            // (apex26.tlxSharedUniforms) is a structural count change, so this
            // is the one census number that does not need a quiet runner.
            ubo: (() => { try { const t = (typeof GLX !== "undefined" && GLX) ? GLX.__tlx : null; const m = t && t.memState ? t.memState() : null;
              return m && m.rUbo != null ? { n: m.rUbo, kb: m.rUboKB, ver: m.groupVer, pms: m.presentMs, dr: m.draws } : null; } catch (_) { return null; } })(),
            // THE HITCH SIGNATURE. p99 against p50 over the last 2048 frames:
            // a healthy p50 beside a p99 several times larger IS a spike train,
            // and no settled average can show it. `open` carries the worst
            // single frame of the race's first 600 for the opening-stall
            // question, which is a different report.
            ft: (() => { try { const q = g && g.frameTimes; return q ? { p50: +(+q.p50).toFixed(1), p95: +(+q.p95).toFixed(1), p99: +(+q.p99).toFixed(1), max: +(+q.maxMs).toFixed(1), n: q.frames } : null; } catch (_) { return null; } })(),
            open: (() => { try { const o = g && g.open; return o ? { maxMs: +(+o.maxMs).toFixed(1), slow: o.slow, frames: o.frames } : null; } catch (_) { return null; } })(),
          };
        }),
        new Promise((_, rj) => setTimeout(() => rj(new Error("beat timeout")), 8000)),
      ]);
      out.beats.push({ s: +((Date.now() - t0) / 1000).toFixed(1), ...beat });
      missed = 0;
    } catch (e) {
      missed++;
      out.beats.push({ s: +((Date.now() - t0) / 1000).toFixed(1), missed,
                       dead: String((e && e.message) || e).slice(0, 80) });
      if (missed >= 2) { checkpoint("page-stopped-answering"); break; }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (_cpu) {
    try { const { profile } = await _cpu.send("Profiler.stop"); _cpuProfile = profile; out.cpu = analyseCpu(profile, 24); }
    catch (e) { out.cpu = { note: "profile stop failed: " + String((e && e.message) || e).slice(0, 120) }; }
  } else {
    out.cpu = { note: "no CPU profile: " + (out.cpuProfileError || "CDP unavailable") };
  }
  // The driver stops HERE, before the A/B phases below pin the clock and
  // freeze the sim; stop() also clears the input override it held.
  if (out.race && out.race.driver === "started") {
    out.race.driven = await bounded(() => page.evaluate(() => {
      const d = window.__gcDrive; if (!d) return null;
      const st = d.stats(); d.stop(); return st;
    }), 10000, "drive-stop").catch((e) => ({ error: String((e && e.message) || e).slice(0, 80) }));
  }
  // THE PERIOD OF THE TAIL, from the raw per-callback series rather than from
  // aggregated per-beat percentiles. bounded() because a leg whose renderer
  // crashed leaves every later evaluate hanging for ever.
  out.hitch = await bounded(async () => {
    const d = await page.evaluate(() => (window.__gcHitch ? window.__gcHitch.dump() : null));
    if (!d || !d.dur || d.dur.length < 30) return { note: "no rAF series — the recorder never armed, or the leg drew too few frames" };
    const a = analyse(d.t0, d.dur);
    // The pass census rides the same series: same frames, same window, so
    // "wide frames cost Nx" compares like with like.
    out.passes = analysePasses(d.passes || [], d.t0 || [], d.dur || [], a.spikeThresholdMs);
    // Absent, never zero: a leg whose prototypes could not be wrapped has not
    // proved that nothing compiled.
    out.gpuWork = (d.work && d.work.length) ? Object.fromEntries(d.work)
      : { note: "no resource calls observed — wrapping failed, or this leg creates none" };
    out.compileStacks = d.stacks || [];
    out.passKinds = analysePassKinds(d.passSig || [], d.passes || []);
    // WHAT IS INSIDE THE SPIKES: the profile joined to the frames at or over
    // 100 ms (the ones a player feels), and the resource calls those frames
    // made against the rest.
    out.spikeCpu = analyseSpikeCpu(_cpuProfile, d.t0, d.dur, 100, _cpuPageAtStart);
    out.spikeWork = analyseSpikeWork(d.workFrames || [], d.dur, 100);
    return a;
  }, 30000, "hitch-series").catch((e) => ({ note: "hitch read failed: " + String((e && e.message) || e).slice(0, 80) }));
  checkpoint("settled");

  // THE RACE-ENTRY WINDOW: race() called -> the track is there. Everything the
  // multithreading plan calls "race entry" happens inside it.
  //
  // `longestBlockMs` is the plan condition 1 verbatim — CONTIGUOUS block, not
  // the sum, because a worker overlaps a freeze and does nothing for a window
  // that is already yielding. `otherBlockMs` is condition 3: main-thread work
  // in the same window that a moved build could overlap WITH. Condition 2
  // (build vs upload back-pressure) is NOT answered here and must not be
  // guessed from these numbers; it needs per-subsystem attribution that does
  // not exist yet.
  out.raceEntry = await bounded(() => page.evaluate(() => {
    const marks = window.__apexMarks || {}, tasks = window.__apexLongTasks || [];
    const r = { supported: window.__apexLongTaskObserver === true, marks, longTasksSeen: tasks.length };
    if (!r.supported) { r.note = "no longtask PerformanceObserver in this browser — nothing was measured"; return r; }
    const a = marks.raceCall, b = marks.trackReady;
    if (a == null || b == null) { r.note = "the window never closed (race or track-ready did not mark)"; return r; }
    const win = tasks.filter((t) => t[0] + t[1] > a && t[0] < b);
    const dur = win.map((t) => t[1]);
    const total = dur.reduce((x, y) => x + y, 0), longest = dur.length ? Math.max.apply(null, dur) : 0;
    r.entryMs = +(b - a).toFixed(1);
    r.blockMs = +total.toFixed(1);
    r.longestBlockMs = +longest.toFixed(1);
    r.otherBlockMs = +(total - longest).toFixed(1);
    r.tasks = win.length;
    r.longest5 = win.slice().sort((x, y) => y[1] - x[1]).slice(0, 5).map((t) => ({ at: t[0], ms: t[1] }));
    return r;
  }), 20000, "race-entry");
  // WHICH JavaScript. The window above says the block is main-thread JS; this
  // says which phase of the build it is, which is the half of condition 2 the
  // hardware-vs-software comparison cannot reach.
  out.buildProfile = await bounded(() => page.evaluate(() => {
    const p = window.__apex && window.__apex.buildProfile && window.__apex.buildProfile();
    if (!p || !p.length) return { note: "no buildProfile — this build predates it, or the track never built" };
    const total = p.reduce((a, b) => a + b.ms, 0);
    const geo = p.filter((r) => r.k === "geo").reduce((a, b) => a + b.ms, 0);
    const top = p.slice().sort((a, b) => b.ms - a.ms).slice(0, 4).map((r) => `${r.n}/${r.k}=${r.ms}`);
    return { totalMs: +total.toFixed(1), geoMs: +geo.toFixed(1), upMs: +(total - geo).toFixed(1),
      geoShare: total ? +(geo / total).toFixed(3) : null, top, rows: p };
  }), 20000, "build-profile");
  // ONE LEVEL OUT. buildProfile says which part of the BUILD costs; this says
  // whether the build is the part of RACE ENTRY that costs at all. On real
  // hardware it is 23 % of the block, so the rest of this list is where the
  // freeze actually lives.
  out.raceProfile = await bounded(() => page.evaluate(() => {
    const p = window.__apex && window.__apex.raceProfile && window.__apex.raceProfile();
    if (!p || !p.length) return { note: "no raceProfile — this build predates it, or startRace never ran" };
    const total = p.reduce((a, b) => a + b.ms, 0);
    return { totalMs: +total.toFixed(1),
      top: p.slice().sort((a, b) => b.ms - a.ms).slice(0, 4).map((r) => `${r.n}=${r.ms}`), rows: p };
  }), 20000, "race-profile");
  // Median rather than mean: one stalled beat is not the frame cost.
  // Worst tail across the run: the LAST beat's ring covers the most frames,
  // and the max over beats catches a spike that a later quiet stretch would
  // otherwise average away.
  const _ft = out.beats.map((b) => b.ft).filter(Boolean);
  out.frameTail = _ft.length
    ? { p50: _ft[_ft.length - 1].p50,
        p95: Math.max(..._ft.map((x) => x.p95)),
        p99: Math.max(..._ft.map((x) => x.p99)),
        max: Math.max(..._ft.map((x) => x.max)),
        // The ratio is the call: a spike train has a healthy p50 and a p99
        // several times it. Constant slowness moves both together.
        p99OverP50: +(Math.max(..._ft.map((x) => x.p99)) / Math.max(0.1, _ft[_ft.length - 1].p50)).toFixed(1),
        beats: _ft.length }
    : { note: "no frameTimes — this build predates the ring on renderScale()" };
  const _g = out.beats.map((b) => b.gms).filter((x) => x != null).sort((a, b) => a - b);
  const _sc = out.beats.map((b) => b.sc).filter((x) => x != null);
  out.gpuFrame = _g.length
    ? { medianMs: _g[Math.floor(_g.length / 2)], samples: _g.length,
        scale: _sc.length ? _sc[_sc.length - 1] : null,
        canvas: await bounded(() => page.evaluate(() => { const c = document.getElementById("game"); return c ? { w: c.width, h: c.height } : null; }), 10000, "canvas") }
    : { note: "no GPU timer samples — EXT_disjoint_timer_query_webgl2 absent or no result landed" };
  // OCCLUSION CULLING, counted not timed. A renderer unit test is not evidence
  // that a GL pass runs (AGENTS.md); this is the live boot that says whether
  // the queries link, issue and come back with a sane answer on real hardware.
  out.occlusion = await bounded(() => page.evaluate(() => {
    const A = window.__apex;
    if (!A || !A.occlusionCull) return { note: "no occlusionCull hook — this build predates it" };
    try { return A.occlusionCull(); } catch (e) { return { error: String(e && e.message) }; }
  }), 20000, "occlusion");
  // THE IN-RUN A/B — the only honest way to compare two flag states.
  //
  // Runs 131-136 compared occlusion on against off across SEPARATE census runs
  // and the comparison was worthless twice over: different commits (a merge of
  // another session landed between them) and cloud drift, which this repo has
  // already recorded as a Metal-CI flake. Same commit, same runner, same parked
  // camera, seconds apart, and the render clock PINNED so sky and cloud cannot
  // move — then the difference is the flag or it is nothing.
  //
  // Two answers, because the counted oracle answers neither: does it cost less
  // GPU TIME, and does it change the IMAGE. A per-pixel diff is what "no hole
  // in the world" actually needs; a whole-frame mean luma can hide a hole.
  const shotBase = flag("--shot", null);
  // ONE A/B, RUN PER FEATURE. There are two levers now and they pull opposite
  // ways — occlusion removes vertices and adds draw calls, multi-draw removes
  // draw calls and touches nothing else — so each needs its own three captures
  // and its own noise floor. Parameterising beats copying: a second copy of
  // this block would drift from the first exactly where it matters.
  // WHICH CLOCK THE A/B RUNS AT, and it decides which draw path is measured.
  //
  // Census 146 found this the hard way: the A/B pinned 12:00, at noon there are
  // no lamps, so `perChunk` is false and every hardware A/B this project has
  // taken measured the PLAIN branch. The per-chunk lamp branch — the one that
  // ships live at night, the one vegas exists to exercise, the one the grouping
  // fix rewrote — had never been measured at all. The giveaway was a counted
  // row that did not print: perChunkDraws was 0.
  //
  // So the hour is a parameter. 12 keeps every earlier run comparable; 2 is
  // night, where the lamps are up and the branch under test actually runs.
  const abClock = +flag("--clock", "12");
  const abFor = (feature) => async () => {
    const A = { feature, clock: abClock };
    const has = await page.evaluate((f) => !!(window.__apex && window.__apex[f] && window.__apex.gpuTimer), feature);
    if (!has) return { note: "no " + feature + "/gpuTimer hooks" };
    // Pin the clock FIRST: everything below depends on the two captures being
    // the same instant of weather.
    A.clockPinned = await page.evaluate((h) => {
      try { window.__apex.renderClock(h, true); return true; } catch (_) { return false; }
    }, abClock);
    // AND FREEZE THE SIMULATION. Pinning the render clock stops sky and cloud;
    // it does NOT stop the AI field, which keeps driving between captures. Run
    // 138 measured that cost: the three legs where occlusion does nothing still
    // diffed at 0.088 %, 0.271 % and 7.533 % against their own second capture,
    // purely from cars moving — so the instrument could not resolve anything
    // smaller than the traffic.
    A.simFrozen = await page.evaluate(() => {
      try { return window.__apex.freeze(true) === true; } catch (_) { return false; }
    });
    const settle = async (n) => {
      for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const sampleGpu = async (n) => {
      const xs = [];
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const v = await page.evaluate(() => { try { const q = window.__apex.gpuTimer(); return q && q.ms > 0 ? q.ms : null; } catch (_) { return null; } });
        if (v != null) xs.push(v);
      }
      xs.sort((a, b) => a - b);
      return xs.length ? { median: +xs[Math.floor(xs.length / 2)].toFixed(2), n: xs.length } : { median: null, n: 0 };
    };
    // GPU TIME IS SAMPLED INTERLEAVED, not in two blocks.
    //
    // Run 141 measured the floor for the first time and it was 17.9 % on one
    // leg and 45.2 % on another — the SAME state, twice. Every GPU delta this
    // session had quoted (2.1, 14.3, 15.8, 20.2 %) sits inside that, and so
    // does the 2.9 % the draw-call-bound conclusion rests on. Two blocks of
    // twelve samples cannot resolve any of it: whatever drifts between the
    // blocks — clocks, thermals, scheduling — lands entirely on the
    // difference.
    //
    // Interleaving cancels drift to first order: toggle, settle, one sample,
    // toggle back, settle, one sample, and repeat, so both states are spread
    // across the same span of wall time. The paired medians then differ by the
    // flag rather than by when they were taken. The off/off2 floor stays, and
    // is now the honest test of whether the sampler is good enough yet.
    const interleave = async (rounds) => {
        const xs = { off: [], on: [] };
        for (let r = 0; r < rounds; r++) {
          for (const k of ["off", "on"]) {
            await page.evaluate(([f, v]) => window.__apex[f](v), [feature, k === "on"]);
            await settle(k === "on" ? 10 : 4);
            const v = await page.evaluate(() => { try { const q = window.__apex.gpuTimer(); return q && q.ms > 0 ? q.ms : null; } catch (_) { return null; } });
            if (v != null) xs[k].push(v);
          }
        }
        const med = (a) => { a.sort((x, y) => x - y); return a.length ? +a[Math.floor(a.length / 2)].toFixed(2) : null; };
        return { off: med(xs.off), on: med(xs.on), samples: xs.off.length + xs.on.length };
    };

    // THREE captures, not two. "off" and "off2" are the same state, so their
    // diff is this run's OWN noise floor — everything the harness cannot hold
    // still. A difference between off and on only means something if it clears
    // that floor, and borrowing a floor from another leg or another run is what
    // produced two withdrawn conclusions already.
    for (const key of ["off", "off2", "on"]) {
      const on = key === "on";
      // COUNT THE FRAMES the counters accumulate over. Both features' counters
      // are cumulative and are zeroed by toggling the flag OFF, so a raw total
      // is only interpretable against the number of frames that produced it.
      // Run 143 is the cost of not doing this: "4,709 calls for 4,853 ranges"
      // could not be turned into a per-frame figure, so a grouping defect and a
      // scene with few visible chunks were indistinguishable, and the number
      // ended up labelled unexplained instead of answered.
      await page.evaluate(([f, v]) => {
        window.__apex[f](v);
        if (!window.__abTick) {
          window.__abTick = true;
          const t = () => { window.__abFrames = (window.__abFrames | 0) + 1; requestAnimationFrame(t); };
          requestAnimationFrame(t);
        }
        window.__abFrames = 0;
      }, [feature, on]);
      await settle(on ? 24 : 8);            // ON needs long enough for the queries to answer
      A[key] = await sampleGpu(12);
      A[key].stats = await page.evaluate((f) => window.__apex[f](), feature);
      A[key].frames = await page.evaluate(() => window.__abFrames | 0);
      if (shotBase) {
        A[key].shot = shotBase.replace(/\.png$/, "") + "." + feature + "-" + key + ".png";
        const r = await bounded(() => page.screenshot({ path: A[key].shot }), 30000, "ab-shot");
        if (r && r.error) A[key].shotError = r.error;
      }
    }
    await page.evaluate(() => { try { window.__apex.renderClock(null, false); window.__apex.freeze(false); } catch (_) {} });
    await page.evaluate((f) => window.__apex[f](false), feature);
    try {
      const sharp = (await import("sharp")).default;
      const raw = async (f) => (f ? sharp(f).raw().toBuffer({ resolveWithObject: true }) : null);
      const diffOf = async (p1, p2) => {
        const a = await raw(p1), b = await raw(p2);
        if (!a || !b) return { error: "a capture is missing" };
        if (a.data.length !== b.data.length) return { error: "captures differ in size" };
        let diff = 0, maxd = 0, sum = 0;
        for (let i = 0; i + 2 < a.data.length; i += a.info.channels) {
          const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
                             Math.abs(a.data[i + 2] - b.data[i + 2]));
          sum += d; if (d > maxd) maxd = d; if (d > 2) diff++;
        }
        const n = (a.data.length / a.info.channels) | 0;
        return { differing: diff, ofTotal: n, pctDiffering: +(100 * diff / n).toFixed(3),
                 maxChannelDelta: maxd, meanAbsDelta: +(sum / n).toFixed(3) };
      };
      A.noiseFloor = await diffOf(A.off.shot, A.off2.shot);   // same state twice
      A.pixels = await diffOf(A.off.shot, A.on.shot);
      if (A.pixels.pctDiffering != null && A.noiseFloor.pctDiffering != null) {
        A.aboveFloor = A.pixels.pctDiffering > Math.max(0.01, A.noiseFloor.pctDiffering * 2);
      }
    } catch (e) { A.pixels = { error: String((e && e.message) || e).slice(0, 140) }; }
    // The interleaved pass is the one to believe; the block medians above stay
    // only because the floor is computed from them.
    A.paired = await interleave(20);
    if (A.paired.off && A.paired.on) A.gpuDeltaPct = +(100 * (A.paired.on / A.paired.off - 1)).toFixed(1);
    else if (A.off.median && A.on.median) A.gpuDeltaPct = +(100 * (A.on.median / A.off.median - 1)).toFixed(1);
    // The GPU noise floor too: off against off2, same state, so whatever this
    // reads is what the clock cannot resolve.
    if (A.off.median && A.off2.median) A.gpuNoisePct = +(100 * (A.off2.median / A.off.median - 1)).toFixed(1);
    return A;
  };
  out.occlusionAB = await bounded(abFor("occlusionCull"), 180000, "occlusion-ab");
  out.multiDrawAB = await bounded(abFor("multiDraw"), 180000, "multidraw-ab");
  checkpoint("feature-ab");

  // AND THE SAME THING IN MOTION. park() gives a static camera, and every
  // popping risk this feature has lives in movement: a chunk hidden while the
  // camera was elsewhere stays hidden for as many frames as its query takes to
  // answer. So drive, then read the counters again. A parked sample alone would
  // have been the easy measurement rather than the useful one.
  out.occlusionMoving = await bounded(() => page.evaluate(async () => {
    const A = window.__apex;
    if (!A || !A.occlusionCull || !A.go || !A.step) return { note: "no drive hooks" };
    try {
      A.go();
      for (let i = 0; i < 40; i++) { A.step(1 / 60, 3); await new Promise((r) => requestAnimationFrame(r)); }
      return A.occlusionCull();
    } catch (e) { return { error: String(e && e.message) }; }
  }), 60000, "occlusion-moving");
  checkpoint("race-entry-read");

  out.overlay = await bounded(() => page.evaluate(() => {
    const el = document.getElementById("gfx-debug");
    return el ? el.innerText : null;
  }), 20000, "overlay");
  out.gfx = await bounded(() => page.evaluate(() => {
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g) return { glx: false };
    const r = { glx: true, gpuErrors: g.gpuErrors ? g.gpuErrors() : null,
      gpuFirstError: g.gpuFirstError ? g.gpuFirstError() : null };
    // WGX only: softPresent() is exported by the native WebGPU backend, so its
    // presence says WGX bound (not a GLX fallback) and its value says whether
    // the frame reaches #game through the swapchain or the CPU blit.
    r.wgx = typeof g.softPresent === "function";
    if (r.wgx) { try { r.wgxSoftPresent = !!g.softPresent(); } catch (e) { r.wgxSoftPresentError = String(e && e.message); } }
    // WGX classifies a HeadlessChrome UA as software on purpose (the swapchain
    // was measured never to composite there), so on a headless runner a
    // hardware adapter still soft-presents; the Verdict needs to tell that
    // expected case from a real regression.
    try { r.headlessUa = /HeadlessChrome/i.test(navigator.userAgent); } catch (_) { /* no navigator */ }
    if (g.__tlx) {
      try { r.backendState = g.__tlx.backendState(); } catch (e) { r.backendStateError = String(e && e.message); }
      try { r.envState = g.__tlx.envState(); } catch (_) { /* pre-probe */ }
      try { r.envFailStack = g.__tlx.envFailStack ? g.__tlx.envFailStack() : null; } catch (_) { /* older build */ }
      try { r.skyState = g.__tlx.skyState(); } catch (_) { /* no sky yet */ }
    }
    // THE GOVERNOR, because envReady alone cannot say why a probe is cold.
    // PerfGov rung 1 is "env probe off" and game.js gates the producer on
    // `PerfGov.tier() < 1`, so a leg reporting envReady=false, envFail=0,
    // gaveUp=false has two indistinguishable explanations: the probe ran out
    // of frames, or the tier gate meant it was never ASKED. envState().face
    // (consecutive baked faces) separates those — face > 0 is progress, face
    // === 0 after parked frames is the gate — and only the tier says which
    // rung closed it. Recording neither is what left the 30 % luma gap between
    // three's two backends an open lead after run 25 (docs/PERF-FINDINGS.md 2t).
    try { const a = window.__apex; if (a && a.renderScale) r.gov = a.renderScale(); } catch (e) { r.govError = String(e && e.message); }
    try { r.engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { /* no canvas */ }
    return r;
  }), 20000, "gfx");
  // bounded() turns ANY failure into a value, so a gfx read that threw or timed
  // out still left phase "done" and ok true while every reported field came out
  // undefined — indistinguishable from a backend that simply has nothing to
  // say. That is what made the Windows webgpu leg unreadable. Name it.
  if (out.gfx && out.gfx.error) out.gfxReadFailed = "read failed: " + out.gfx.error;
  else if (out.gfx && out.gfx.glx === false) out.gfxReadFailed = "GLX was undefined in the page";
  if (out.overlay && out.overlay.error) out.overlayReadFailed = "read failed: " + out.overlay.error;
  checkpoint("gfx-read");
  const shot = flag("--shot", null);
  if (shot) {
    const r = await bounded(() => page.screenshot({ path: shot, fullPage: false }), 30000, "screenshot");
    out.shot = (r && r.error) ? null : shot;
    if (r && r.error) out.shotError = r.error;
  }
  // APPEARANCE. gpu-census.yml has always printed `meanLuma=${frame.meanLuma}`
  // and this tool never once wrote out.frame — the word "frame" did not appear
  // in this file — so that column read "n/a" on every leg, every image, every
  // run since it was added. The gate deliberately does not BLOCK on appearance
  // (a brightness floor is the kind of threshold that goes flaky and then gets
  // widened, which AGENTS.md forbids), but "reported for a human" was not true
  // either: there was nothing to report. docs/PERF-FINDINGS.md 2l.
  //
  // Read it from the SCREENSHOT, not from the page. The in-page reads used
  // elsewhere do not generalise: gfx-probe's getContext("2d") works only where
  // WGX/TLX route through the soft-present blit, GLX.capturePixels does not
  // exist on GLX at all, and drawImage of a WebGL canvas reads solid black
  // outside the frame (measured, PERF-FINDINGS 2d). A composited screenshot is
  // the one source that works for every backend on every image.
  if (out.shot) {
    try {
      const sharp = (await import("sharp")).default;
      const { data, info } = await sharp(out.shot).raw().toBuffer({ resolveWithObject: true });
      let sum = 0, max = 0, n = 0;
      for (let i = 0; i + 2 < data.length; i += info.channels) {
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += l; if (l > max) max = l; n++;
      }
      out.frame = n
        ? { meanLuma: +(sum / n).toFixed(1), maxLuma: max, w: info.width, h: info.height }
        : null;
      if (!n) out.frameReadFailed = "screenshot decoded to zero pixels";
    } catch (e) {
      // Named, never silent — a tool that cannot measure appearance must say so
      // rather than leave the same empty column it left for months.
      out.frameReadFailed = "luma read failed: " + String((e && e.message) || e).slice(0, 160);
    }
  } else {
    out.frameReadFailed = shot ? "screenshot failed, so there is nothing to measure" : "no --shot requested";
  }
  out.ok = true;
  checkpoint("done");
} catch (e) {
  out.ok = false;
  out.error = String((e && e.message) || e);
  checkpoint("failed");
} finally {
  // In the finally, not the success path: a run that FAILED is the one whose
  // console lines decide the diagnosis, and assigning this at the end of try
  // meant every failure threw them away.
  out.console = console_.filter((l) => /error|warn|refus|fail|WGX|TLX/i.test(l)).slice(0, 40);
  out.root = ROOT;
  // browser.close() HANGS after a WebGPU/Metal session: run 4's WebGPU check
  // reached phase "done" at +42.4s and the step was then killed at 20 minutes
  // with the process still in this line. A teardown hang must not masquerade
  // as a renderer hang — bound it and let the reported phases stand.
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((r) => setTimeout(() => { out.closeHung = true; r(); }, 20000)),
  ]);
  server.close();
}
console.log(JSON.stringify(out, null, 2));
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(out, null, 2));
// A lingering GPU-process handle keeps node alive after close() gives up, so
// exit explicitly rather than waiting on the event loop.
process.exit(out.ok ? 0 : 1);
