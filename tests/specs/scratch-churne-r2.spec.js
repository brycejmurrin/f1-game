// SCRATCH MEASUREMENT COPY (#5387) — never merged.
import fs from "node:fs";
// Steady driving must not compile anything: after a warm-up, equal idle race windows build ZERO render pipelines.
//
// #3713 (A·W50): the BOOST gate's no-BOOST control windows still built an fx particle-stream pipeline
// (attributes fxAlpha, fxColor, fxCorner, fxSize, position) — three releasing a pipeline and minting it again
// while nothing changed. On Bryce's iPhone (THREE PATH: WEBGPU) every re-mint is a compile stall in the
// middle of a lap. Counted exactly through renderer.backend.createRenderPipeline (WebGPU and WebGL2
// backends alike; counts are exact on a software adapter even where ms are not).
//
// What this pins: TLX on three's WebGPU backend, monza, GAS held on the real keyboard, no BOOST, 120 warm
// frames, a warm pass over the counted stretch, a jump back to its start, then 6 windows of 60 frames over road
// already drawn (#5387) — every window builds 0 pipelines. Driver:
// tools/perf/idle-pipeline-census.mjs. Red on the tree of 2026-10-24 by design until #3713 lands.
// Where the runner has no WebGPU adapter (CI's llvmpipe) three falls back to WebGL2 and an annotation says so.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test.describe.configure({ retries: 0 });
function roHookInit() {
  const R = window.__roc = { log: [], n: 0 };
  const iv = setInterval(() => {
    try {
      const T = typeof GLX !== "undefined" ? GLX.__tlx : null, r = T && T.renderer, os = r && r._objects;
      if (!os || typeof os.createRenderObject !== "function" || !window.__bpp) return;
      clearInterval(iv);
      const keys = new WeakMap(), o = os.createRenderObject;
      os.createRenderObject = function (nodes, geos, rr, object, material, scene, camera, lightsNode, renderContext, clippingContext, passId) {
        const k = [material && material.id, renderContext && renderContext.id, lightsNode && lightsNode.id, passId == null ? "" : String(passId), object && object.geometry && object.geometry.id].join("|");
        let ks = keys.get(object); const objSeen = !!ks; if (!ks) keys.set(object, ks = new Set());
        const keySeen = ks.has(k); ks.add(k);
        if (window.__bpp.gpuLogOn && R.log.length < 300) {
          let par = object && object.parent; const chain = []; for (let i = 0; par && i < 3; i++) { chain.push(par.name || par.type); par = par.parent; }
          R.log.push({ at: window.__bpp.frames, objSeen, keySeen, obj: (object.type || "") + ":" + (object.name || ""), par: chain.join("<"), mat: (material.type || "") + ":" + (material.name || ""),
            ctx: renderContext && renderContext.id, lights: lightsNode && lightsNode.id, pass: passId == null ? null : String(passId).slice(0, 30),
            verts: object.geometry && object.geometry.attributes && object.geometry.attributes.position ? object.geometry.attributes.position.count : null, inst: !!object.isInstancedMesh });
        }
        return o.apply(this, arguments);
      };
    } catch (_) { /* not yet */ }
  }, 50);
}

async function body({ page }, testInfo) {
  test.setTimeout(900000);
  const { hook, warm, gpuDevice, replay, windows } = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: ran on three's WebGL2 backend" });
  // The counted windows must stay on the stretch the warm pass drew, or new scenery enters and a first draw reads
  // as churn (#5387): the census says how far each pass went.
  testInfo.annotations.push({ type: "replay", description: JSON.stringify(replay) });
  expect(replay.jumped, "the census must jump back to the warm pass's start (__apex.jump)").toBe(true);
  expect(replay.countedM, `the counted windows drove past the warmed stretch (${JSON.stringify(replay)})`).toBeLessThanOrEqual(replay.warmM);
  testInfo.annotations.push({ type: "windows", description: `${warm} pipelines through warm-up; per window ${windows.map((w) => w.pipelines).join(",")}` });
  const churn = windows.filter((w) => w.pipelines > 0);
  expect(churn.map((w) => ({ window: w.window, pipelines: w.pipelines, built: w.built.slice(0, 6) })),
    "idle windows that minted render pipelines (#3713: a pipeline released and built again while nothing changed)").toEqual([]);
  // The twin (#4783): idle createBindGroup / createBuffer == 0 after warm, culprit labels logged. Only on a real
  // GPUDevice; the WebGL2 fallback has none, so there the check would pass vacuously and is skipped.
  if (gpuDevice) {
    testInfo.annotations.push({ type: "gpu-churn", description: `per window bindGroups ${windows.map((w) => w.bindGroups).join(",")} buffers ${windows.map((w) => w.buffers).join(",")}` });
    // A geometry's FIRST draw makes its vertex/index buffer inside three's updateForRender (measured on lavapipe:
    // one 90480 B index buffer in window 3, same frame in two runs). That is a mesh coming into view, not churn, so
    // it is reported (annotation) and not failed; a size that recurs in a second window IS churn (released and
    // rebuilt). Everything else, and every bind group, must be 0.
    const firstUse = (b) => b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "") && /updateForRender/.test(b.from || "");
    const other = windows.map((w) => ({ window: w.window, bindGroups: w.bindGroups, built: w.gpuBuilt.filter((b) => !firstUse(b)).slice(0, 6) }))
      .filter((w) => w.bindGroups > 0 || w.built.length > 0);
    expect(other, "idle windows that created bind groups or non-first-draw buffers after warm-up").toEqual([]);
    const seen = new Map();
    for (const w of windows) for (const b of w.gpuBuilt.filter(firstUse)) { const k = String(b.size); seen.set(k, (seen.get(k) || new Set()).add(w.window)); }
    testInfo.annotations.push({ type: "first-draw-buffers", description: [...seen].map(([size, ws]) => `${size}B@w${[...ws].join(",")}`).join(" ") || "none" });
    expect([...seen].filter(([, ws]) => ws.size > 1).map(([size, ws]) => ({ size, windows: [...ws] })),
      "a first-draw buffer size that recurs across idle windows is a geometry released and rebuilt").toEqual([]);
  } else {
    // No GPUDevice to wrap: the bind-group / buffer check could not observe anything. Say so; never a vacuous 0.
    testInfo.annotations.push({ type: "gpu-churn", description: "blind: no GPUDevice on this run (WebGL2 path), bind-group / buffer churn not measured" });
  }
}
test("SCRATCH churn E burn0", async ({ page }, testInfo) => {
  if (0) await page.addInitScript((ms) => { const burn = () => { const t = performance.now(); while (performance.now() - t < ms) { /* slow every frame */ } requestAnimationFrame(burn); }; requestAnimationFrame(burn); }, 0);
  await page.addInitScript(roHookInit);
  let err = null;
  try { await body({ page }, testInfo); } catch (e) { err = String(e && e.message || e).replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").slice(0, 900); }
  let o = null; try { o = JSON.parse(fs.readFileSync("artifacts/perf/idle-pipeline-churn-gpu.json", "utf8")); } catch (_) {}
  const W = o && o.windows.map((w) => ({ w: w.window, p: w.pipelines, bg: w.bindGroups, b: w.buffers }));
  const roc = await page.evaluate(() => window.__roc).catch(() => null);
  const g = {}; if (roc) for (const r of roc.log) { const k = [r.objSeen ? (r.keySeen ? "REBUILT" : "REKEYED") : "NEWOBJ", r.obj, r.par, r.mat, "ctx" + r.ctx, "L" + r.lights, r.pass, r.inst ? "inst" : "", r.verts].join("|"); const a = g[k] || (g[k] = { n: 0, at0: r.at, at1: r.at }); a.n++; a.at1 = r.at; }
  throw new Error("MEASURE " + JSON.stringify({ burn: 0, err: err && err.slice(0, 200), replay: o && o.replay, W, ro: Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 20) }));
});
