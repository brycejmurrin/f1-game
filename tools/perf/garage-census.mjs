#!/usr/bin/env node
// garage-census.mjs — what one GARAGE frame costs, and what a picker change costs.
// @doc Garage perf census (#B·L24): frame CPU, draws/tris/programs, heap, DOM, Car3D.build ms per body style.
// @skill mcp-probe
//
// Counts are the evidence (tris, draws, programs, DOM nodes, heap, build ms):
// this container renders in SwiftShader, so a frame time here measures the box,
// not a phone GPU. Run it on two trees to compare — `--root` serves any checkout
// (a `git worktree add` at the baseline commit), so the same probe measures both.
//
//   node tools/perf/garage-census.mjs [--root DIR] [--label NAME] [--backend three|webgl2]
//        [--team mercedes] [--frames 90] [--size 844x390] [--json PATH]
//
// Prints one `= garage-census {…}` JSON line; --json also writes it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../lib/harness.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";
import { chromiumArgsForBackend, installProbeInit, gotoGame, openGarage } from "../shot/probe-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/perf/garage-census.mjs [--root DIR] [--label NAME] [--backend three|webgl2]
                    [--team mercedes] [--frames 90] [--size 844x390] [--json PATH]
  Opens the GARAGE and reports: rAF callback ms (median/p90), GarageScene.draw ms, draw calls,
  triangles and programs per frame (TLX renderer.info / GLX draw wrap), JS heap, DOM nodes,
  the setup sheet's button count, and Car3D.build ms + tris for the team body and every
  Car3D.BODY_STYLE_IDS entry. --root serves another checkout (the baseline worktree).`);
parseFlags(argv, ["--root", "--label", "--backend", "--team", "--frames", "--size", "--json", "--finishes", "--finish-frames"]);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const root = resolve(flag("--root", ROOT));
const label = flag("--label", root === resolve(ROOT) ? "tree" : root.split("/").pop());
const backend = flag("--backend", "three");
const team = flag("--team", "mercedes");
const frames = Math.max(20, +flag("--frames", "90") || 90);
const [vw, vh] = flag("--size", "844x390").split("x").map((v) => +v);
const jsonOut = flag("--json", null);
// One finish per family by default: SwiftShader drains every frame under gl.finish(),
// so sixteen finishes x 30 frames ran past a 15-minute cap.
const finishList = flag("--finishes", "gloss,satin,chrome,carbon,flake,oilslick,frozen,truematte,xirallic").split(",");
const finishFrames = Math.max(4, +flag("--finish-frames", "10") || 10);
// Each phase prints its own line as it lands, so a run that times out keeps what it measured.
const phase = (name, obj) => console.log(`- ${label} ${name} ` + JSON.stringify(obj));

// Before any page script: time every rAF callback and count GL draws, so the
// numbers cover the whole frame the game schedules, not a probe's own call.
function installFrameWrap() {
  const ring = [];
  window.__gcFrames = ring;
  const raf = window.requestAnimationFrame.bind(window);
  // Rendered frames only (a callback that issued a draw), and with __gcFinish the
  // gl.finish() after it: SwiftShader runs the shaders on this CPU, so that wait
  // is a fragment-cost PROXY between two trees, never a phone GPU time.
  const rendered = [], finished = [];
  window.__gcRendered = rendered; window.__gcFinished = finished;
  window.requestAnimationFrame = (cb) => raf((t) => {
    const t0 = performance.now(), d0 = gl.draws;
    try { cb(t); } finally {
      if (window.__gcOn) {
        const ms = performance.now() - t0;
        ring.push(ms);
        if (gl.draws > d0) {
          rendered.push(ms);
          if (window.__gcFinish && window.__gcCtx) { const f0 = performance.now(); window.__gcCtx.finish(); finished.push(performance.now() - f0); }
        }
      }
    }
  });
  const gl = { draws: 0, tris: 0, programs: 0, shaders: 0, compileMs: 0 };
  window.__gcGl = gl;
  const P = WebGL2RenderingContext.prototype;
  const tri = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
    const orig = P[name];
    if (!orig) continue;
    P[name] = function (mode, a, b, c, d) {
      gl.draws++;
      if (this.canvas && this.canvas.id === "game") window.__gcCtx = this;
      const n = name === "drawArrays" || name === "drawArraysInstanced" ? b
        : name === "drawRangeElements" ? c : a;
      const inst = name === "drawElementsInstanced" ? d : name === "drawArraysInstanced" ? c : 1;
      gl.tris += tri(mode, n) * (inst || 1);
      return orig.apply(this, arguments);
    };
  }
  const link = P.linkProgram;
  P.linkProgram = function () { gl.programs++; const t0 = performance.now(); const r = link.apply(this, arguments); gl.compileMs += performance.now() - t0; return r; };
  const comp = P.compileShader;
  P.compileShader = function () { gl.shaders++; const t0 = performance.now(); const r = comp.apply(this, arguments); gl.compileMs += performance.now() - t0; return r; };
  // getProgramParameter(LINK_STATUS) is where a driver blocks on an async compile.
  const gpp = P.getProgramParameter;
  P.getProgramParameter = function () { const t0 = performance.now(); const r = gpp.apply(this, arguments); gl.compileMs += performance.now() - t0; return r; };
}

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };

async function census() {
  const srv = await startStaticServer(root);
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend(backend) });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vw, height: vh });
    await installProbeInit(page, { backend });
    await page.addInitScript(installFrameWrap);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const tBoot = Date.now();
    await gotoGame(page, srv.url);
    const glBoot = await page.evaluate(() => Object.assign({}, window.__gcGl));
    const tOpen = Date.now();
    await openGarage(page, { team });
    // First garage frame drawn: the programs it compiled and the wall time to it.
    await page.waitForFunction(() => window.__gcGl.draws > 0, null, { polling: 200, timeout: 60000 });
    await sleep(3000);
    const opened = await page.evaluate(() => Object.assign({}, window.__gcGl));
    const openMs = Date.now() - tOpen;
    // Steady state: the turntable spinning, nothing rebuilt.
    const steady = await page.evaluate(async (n) => {
      const gl = window.__gcGl;
      const drawMs = [];
      const GS = GarageScene;   // script-global const, not a window property
      const origDraw = GS.draw;
      GS.draw = function () { const t0 = performance.now(); try { return origDraw.apply(this, arguments); } finally { drawMs.push(performance.now() - t0); } };
      window.__gcFrames.length = 0;
      const g0 = Object.assign({}, gl);
      window.__gcOn = true;
      await new Promise((res) => { const tick = () => (window.__gcFrames.length >= n ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      window.__gcOn = false;
      GS.draw = origDraw;
      const f = window.__gcFrames.length, rendered = [...window.__gcRendered];
      // Same view again, each rendered frame followed by gl.finish().
      window.__gcRendered.length = 0; window.__gcFinished.length = 0;
      window.__gcFinish = true; window.__gcOn = true;
      await new Promise((res) => { const tick = () => (window.__gcFinished.length >= 12 ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      window.__gcOn = false; window.__gcFinish = false;
      const finishMs = [...window.__gcFinished];
      const info = window.renderer && window.renderer.info;
      return {
        frames: f, frameMs: [...window.__gcFrames], drawMs, rendered, finishMs,
        drawsPerFrame: (gl.draws - g0.draws) / rendered.length, trisPerFrame: (gl.tris - g0.tris) / rendered.length,
        newPrograms: gl.programs - g0.programs,
        tlxInfo: info ? { render: Object.assign({}, info.render), memory: Object.assign({}, info.memory),
          programs: info.programs ? info.programs.length : null } : null,
      };
    }, frames);
    phase("steady", { rendered: steady.rendered.length, rafMedian: pct(steady.rendered, 0.5), finishMedian: pct(steady.finishMs, 0.5),
      draws: +steady.drawsPerFrame.toFixed(1), tris: Math.round(steady.trisPerFrame), programsOpen: opened.programs - glBoot.programs,
      compileMsOpen: +(opened.compileMs - glBoot.compileMs).toFixed(1) });
    const heap = await cdp.send("Runtime.getHeapUsage").catch(() => null);
    const dom = await cdp.send("Memory.getDOMCounters").catch(() => null);
    const sheet = await page.evaluate(() => ({
      buttons: document.querySelectorAll("#carsetup button").length,
      nodes: document.querySelectorAll("#carsetup *").length,
      allNodes: document.getElementsByTagName("*").length,
      canvases: document.querySelectorAll("canvas").length,
    }));
    // Car3D.build: replay the preview's own args with each body style.
    const builds = await page.evaluate(() => {
      const C = Car3D;
      const A = window.__apex;
      let captured = null;
      const orig = C.build;
      C.build = function (c1, c2, opts) { captured = [c1, c2, opts]; return orig.apply(this, arguments); };
      // Force a preview rebuild through the shipped path (garageParts busts the LRU).
      return new Promise((res) => {
        const r = A.garageParts({ floor: "venturi" });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          C.build = orig;
          if (!captured) return res({ error: "no preview build captured", parts: r });
          const [c1, c2, opts] = captured;
          const styles = ["(team)", ...(C.BODY_STYLE_IDS || [])];
          const out = [];
          for (const s of styles) {
            const liv = Object.assign({}, opts.livery);
            if (s !== "(team)") liv.bodyStyle = s; else delete liv.bodyStyle;
            const o = Object.assign({}, opts, { livery: liv });
            const ms = [];
            let d = null;
            for (let i = 0; i < 3; i++) { const t0 = performance.now(); d = orig.call(C, c1, c2, o); ms.push(performance.now() - t0); }
            ms.sort((a, b) => a - b);
            out.push({ style: s, buildMs: +ms[1].toFixed(1), verts: d.pos.length / 3, tris: (d.idx ? d.idx.length : d.pos.length / 3) / 3 });
          }
          res({ styles: out });
        }));
      });
    });
    phase("builds", builds);
    // A picker change through the shipped path: the hook's own ms (sheet rebuild)
    // and the next frame's rAF ms (Car3D.build + upload + hull), alternating two floors.
    const change = await page.evaluate(async () => {
      const A = window.__apex, gl = window.__gcGl, C = Car3D;
      const hookMs = [], frameMs = [], buildMs = [], programs = [], compileMs = [];
      const orig = C.build;
      let b = 0;
      C.build = function () { const t0 = performance.now(); try { return orig.apply(this, arguments); } finally { b += performance.now() - t0; } };
      for (let i = 0; i < 6; i++) {
        const p0 = gl.programs, c0 = gl.compileMs;
        b = 0;
        const t0 = performance.now();
        A.garageParts({ floor: i % 2 ? "venturi" : "sealed_edge" });
        hookMs.push(performance.now() - t0);
        window.__gcFrames.length = 0; window.__gcOn = true;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.__gcOn = false;
        frameMs.push(Math.max(...window.__gcFrames));
        buildMs.push(+b.toFixed(1)); programs.push(gl.programs - p0); compileMs.push(+(gl.compileMs - c0).toFixed(1));
      }
      C.build = orig;
      return { hookMs, frameMs, buildMs, programs, compileMs };
    });
    phase("change", change);
    // Per finish: the preview car rebuilt in that finish (Car3D.build sees the
    // livery's `finish`), then --finish-frames rendered frames with gl.finish() — the
    // fragment-cost proxy above, per finish family. The ids a tree lacks are skipped.
    const finishes = await page.evaluate(async ([list, nf]) => {
      const A = window.__apex, C = Car3D, out = [];
      const orig = C.build;
      let pick = null;
      C.build = function (c1, c2, opts) {
        if (pick && opts && opts.livery) opts = Object.assign({}, opts, { livery: Object.assign({}, opts.livery, { finish: pick }) });
        return orig.call(this, c1, c2, opts);
      };
      const frames = (n) => new Promise((res) => { const tick = () => (window.__gcFinished.length >= n ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      let flip = 0;
      for (const f of list) {
        if (f !== "gloss" && !(C.FINISH_SURFACE && C.FINISH_SURFACE[f] != null)) continue;
        pick = f === "gloss" ? null : f;
        A.garageParts({ floor: flip++ % 2 ? "venturi" : "sealed_edge" });
        window.__gcRendered.length = 0; window.__gcFinished.length = 0;
        window.__gcFinish = true; window.__gcOn = true;
        await frames(3);   // the rebuild frame and any compile land here, then discard
        window.__gcFinished.length = 0;
        await frames(nf);
        window.__gcOn = false; window.__gcFinish = false;
        const a = [...window.__gcFinished].sort((x, y) => x - y);
        out.push({ finish: f, finishMedian: +a[a.length >> 1].toFixed(2) });
      }
      C.build = orig;
      return out;
    }, [finishList, finishFrames]);
    phase("finishes", finishes);
    const backendLive = await page.evaluate(() => { try { return window.__apex.diag({ download: false }).env.backend; } catch { return null; } });
    const s = steady;
    return {
      label, root, backend: backendLive || backend, team, size: `${vw}x${vh}`,
      bootMs: tOpen - tBoot, openMs,
      programs: { boot: glBoot.programs, garageOpen: opened.programs - glBoot.programs, steadyNew: s.newPrograms,
        compileMsOpen: +(opened.compileMs - glBoot.compileMs).toFixed(1) },
      frame: { n: s.frames, rendered: s.rendered.length, rafMedian: pct(s.rendered, 0.5), rafP90: pct(s.rendered, 0.9),
        finishMedian: pct(s.finishMs, 0.5), finishP90: pct(s.finishMs, 0.9),
        garageDrawMedian: pct(s.drawMs, 0.5), drawsPerFrame: +s.drawsPerFrame.toFixed(1), trisPerFrame: Math.round(s.trisPerFrame) },
      tlxInfo: s.tlxInfo,
      heapMB: heap ? +(heap.usedSize / 1048576).toFixed(1) : null,
      dom, sheet,
      builds, finishes,
      change: { hookMedian: pct(change.hookMs, 0.5), frameMedian: pct(change.frameMs, 0.5), raw: change },
    };
  } finally {
    await browser.close();
    await srv.close();
  }
}

let res;
try { res = await census(); }
catch (e) { res = { label, root, error: String(e && e.stack || e) }; process.exitCode = 1; }
finally { await shutdown(); }
console.log("= garage-census " + JSON.stringify(res));
if (jsonOut) { mkdirSync(dirname(resolve(jsonOut)), { recursive: true }); writeFileSync(resolve(jsonOut), JSON.stringify(res, null, 2)); }
