// @ts-check
// SCRATCH MEASUREMENT COPY (issue #5387) — never merged. The real spec's measurement, plus a render-object census,
// reported as one MEASURE line (the reporter prints only failure messages, so this always throws).
import { test, BOOT_MS } from "../helpers/fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });

function roHookInit() {
  const R = window.__roc = { log: [], n: 0, hooked: false, renders: [] };
  const iv = setInterval(() => {
    try {
      const T = typeof GLX !== "undefined" ? GLX.__tlx : null, r = T && T.renderer, os = r && r._objects;
      if (!os || typeof os.createRenderObject !== "function" || !window.__bpp) return;
      clearInterval(iv); R.hooked = true;
      const o = os.createRenderObject;
      os.createRenderObject = function (nodes, geos, rr, object, material, scene, camera, lightsNode, renderContext, clippingContext, passId) {
        R.n++;
        try {
          if (window.__bpp.gpuLogOn && R.log.length < 400) {
            let par = object && object.parent; const chain = []; for (let i = 0; par && i < 3; i++) { chain.push(par.name || par.type); par = par.parent; }
            R.log.push({ at: window.__bpp.frames, obj: (object.type || "") + ":" + (object.name || ""), par: chain.join("<"),
              mat: (material.type || "") + ":" + (material.name || ""), ctx: renderContext && renderContext.id, lights: lightsNode && lightsNode.id,
              cam: camera && camera.type, pass: passId == null ? null : String(passId).slice(0, 40), geo: geos && object.geometry && object.geometry.id,
              ud: Object.keys(object.userData || {}).slice(0, 4).join(",") });
          }
        } catch (_) { /* best effort */ }
        return o.apply(this, arguments);
      };
    } catch (_) { /* not yet */ }
  }, 50);
}

test("SCRATCH churn measure", async ({ page }) => {
  test.setTimeout(900000);
  await page.addInitScript(roHookInit);
  let out = null, err = null;
  try {
    out = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
      gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  } catch (e) { err = String(e && e.message || e).split("\n")[0].slice(0, 300); }
  const roc = await page.evaluate(() => window.__roc).catch(() => null);
  const firstUse = (b) => b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "") && /updateForRender/.test(b.from || "");
  const W = out ? out.windows.map((w) => ({ w: w.window, p: w.pipelines, bg: w.bindGroups, b: w.buffers,
    fu: w.gpuBuilt.filter(firstUse).length, other: w.gpuBuilt.filter((b) => !firstUse(b)).length,
    at: w.gpuBuilt.length ? [w.gpuBuilt[0].at, w.gpuBuilt[w.gpuBuilt.length - 1].at] : null })) : null;
  const fail = W ? W.some((w) => w.bg > 0 || w.other > 0) : null;
  const stacks = {};
  if (out) for (const w of out.windows) for (const b of w.gpuBuilt) {
    const k = b.kind + "|" + b.label + "|" + String(b.from || "").split(" < ").slice(0, 4).map((s) => s.replace(/\s*\(.*$/, "")).join("<");
    stacks[k] = (stacks[k] || 0) + 1;
  }
  const groups = {};
  if (roc) for (const r of roc.log) {
    const k = [r.obj, r.par, r.mat, "ctx" + r.ctx, "L" + r.lights, r.cam, r.pass].join("|");
    const g = groups[k] || (groups[k] = { n: 0, at0: r.at, at1: r.at }); g.n++; g.at1 = r.at;
  }
  const top = Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  const data = { err, hook: out && out.hook, gpuDevice: out && out.gpuDevice, warm: out && out.warm, fail, W,
    roTotal: roc && roc.n, roAfterWarm: roc && roc.log.length, roHooked: roc && roc.hooked, roGroups: top,
    stacks: Object.entries(stacks).sort((a, b) => b[1] - a[1]).slice(0, 12) };
  throw new Error("MEASURE " + JSON.stringify(data));
});
