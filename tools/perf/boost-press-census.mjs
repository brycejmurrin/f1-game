// @doc BOOST per-press pipeline census: counts three createRenderPipeline per spaced press vs equal no-BOOST windows.
// tools/perf/boost-press-census.mjs — the page driver behind tests/specs/perf-boost-press-pipelines*.spec.js.
//
// One leg per Chromium process: a second TLX boot in the SAME browser process stalls on this box (measured
// 2026-10-24, both orders: the second context's boot or frame loop made no progress for > 4 min), so each
// backend leg is its own spec file and the runner gives each spec file a fresh Chromium.
import { mkdirSync, writeFileSync } from "node:fs";
import { raceGate } from "../lib/census-entry.mjs";

export const PRESSES = 4;
export const DEPLOY_FRAMES = 30;   // BOOST on, GAS held: the ERS strip and exhaust FX draw every one of these
export const SPACING = 30;         // BOOST off between presses: a "spaced" press, as a player taps it

// Page side: count every pipeline three's backend builds, and our own frame counter.
export function hookPipelines() {
  const P = window.__bpp = { count: 0, log: [], frames: 0 };
  const tick = () => { P.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
  if (!be || typeof be.createRenderPipeline !== "function") return "no three backend";
  const o = be.createRenderPipeline;
  be.createRenderPipeline = function (ro) {
    P.count++;
    try {
      const m = (ro && ro.material) || {}, ob = (ro && ro.object) || {}, g = (ro && ro.geometry) || {}, c = (ro && ro.context) || {};
      let par = ob.parent; const chain = []; for (let i = 0; par && i < 4; i++) { chain.push(par.name || par.type); par = par.parent; }
      const rt = c.renderTarget ? (c.renderTarget.texture && c.renderTarget.texture.name || c.renderTarget.name || "rt") + ":" + c.width + "x" + c.height : "canvas";
      if (P.log.length < 200) P.log.push({ at: P.frames, mat: (m.type || "") + ":" + (m.name || ""), obj: (ob.type || "") + ":" + (ob.name || ""),
        parents: chain.join("<"), rt, attrs: Object.keys(g.attributes || {}).sort().join(","), transparent: !!m.transparent });
    } catch (_) { /* naming is best-effort */ }
    return o.apply(this, arguments);
  };
  // #4514 step 2: what else a window CREATES on the device — a bind group, buffer or texture first made at the first
  // deploy is first-use work too. Own-property wrappers on three's GPUDevice (WebGPU only; the WebGL2 leg has none).
  P.res = { bindGroup: 0, buffer: 0, texture: 0 }; P.resLog = [];
  const dev = be.device;
  if (dev && typeof dev.createBindGroup === "function") {
    for (const [fn, k] of [["createBindGroup", "bindGroup"], ["createBuffer", "buffer"], ["createTexture", "texture"]]) {
      const f = dev[fn];
      dev[fn] = function (desc) {
        P.res[k]++;
        // Armed windows only (a census beat): the three call sites that made it, so a window's objects can be told apart.
        if (P.armed && P.resLog.length < 20000) {
          const st = String(new Error().stack || "").split("\n").slice(2, 9).map((l) => (l.match(/at (?:new )?([\w$.<>]+)/) || [])[1]).filter(Boolean);
          P.resLog.push({ at: P.frames, k, label: (desc && desc.label) || "", size: (desc && desc.size) || 0, via: st.join("<") });
        }
        return f.apply(this, arguments);
      };
    }
  } else P.res = null;
  // Every three RenderObject made (a new object, its bind groups and uniform buffers): which material and layout.
  P.ros = [];
  const objs = T.renderer._objects;
  if (objs && typeof objs.createRenderObject === "function") {
    const cro = objs.createRenderObject;
    objs.createRenderObject = function (nodes, geometries, renderer, object, material, scene, camera, lights, ctx, clip, passId) {
      try {
        if (P.armed && P.ros.length < 5000) {
          const geometry = object && object.geometry, pos = geometry && geometry.attributes && geometry.attributes.position;
          P.ros.push({ at: P.frames, transparent: !!(material && material.transparent), side: material ? material.side : -1, passId: passId || "",
            verts: pos ? pos.count : 0, attrs: Object.keys((geometry && geometry.attributes) || {}).sort().join(","), pool: !!(object && object.parent && object.parent.type === "Object3D" && !object.parent.parent) });
        }
      } catch (_) { /* best-effort */ }
      return cro.apply(this, arguments);
    };
  }
  let api = null; try { api = T.backendState().api; } catch (_) { /* older TLX */ }
  return "ok " + (api || (be.isWebGPUBackend ? "webgpu" : "webgl2"));
}

export async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__bpp.frames);
  await page.waitForFunction(([f, k]) => window.__bpp.frames >= f + k, [f0, n], { polling: 100, timeout: 180000 });
}

/** Boot TLX (forceGL selects three's WebGL2 backend), race monza with GAS held, and press BOOST PRESSES
 *  times, each after a control window of the same length with BOOST off. Writes artifacts/perf/.
 *  `gas(true|false)` presses / releases the throttle with a REAL input device (the spec passes
 *  page.keyboard): BOOST deploys only while GAS is held, the iPhone sequence. */
export async function measureBoostPresses(page, { forceGL, bootMs, gas, ls = {} }) {
  await page.addInitScript(([gl, extra]) => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", gl);
      localStorage.setItem("apex26.gfxPreset", '"medium"');
      localStorage.setItem("apex26.gfxBootStepMs", "45000");   // TLX init can exceed 8 s on a busy software-GL runner
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);   // e.g. apex26.tlxDrawWarm (#4514)
    } catch (_) { /* private mode */ }
  }, [forceGL ? "1" : "0", ls]);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof GLX !== "undefined" && !!GLX.__tlx, null, { polling: 100, timeout: bootMs });
  const hook = await page.evaluate(hookPipelines);
  if (!/^ok /.test(hook)) return { hook, presses: [] };

  await page.evaluate(() => { window.__apex.race("monza"); });
  await page.waitForFunction(() => { try { const i = window.__apex.info(); return i.track === "monza" && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    null, { polling: 200, timeout: 300000 });
  await page.evaluate(() => window.__apex.go());
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  // raceGate passes once the PROGRAM warm is done; the race-entry rig job (car-draw.js warmCockpitRig, which compiles
  // and draws the boost pairs, #4514) runs after it — ~5 s more on SwiftShader (probe 2026-11-03). Measure after it.
  // warm.pending is false while the job is still QUEUED, so wait for its own record (warm.rig, set when it finishes).
  await page.waitForFunction(() => { try { return !!window.GLX.__tlx.memState().warm.rig; } catch (_) { return true; } }, null, { polling: 500, timeout: 120000 })
    .catch(() => { /* reported: the annotation shows rig null */ });
  await page.evaluate(() => window.__apex.setEnergy && window.__apex.setEnergy(1));
  await gas(true);                       // GAS held, the iPhone sequence
  await frames(page, SPACING);           // driving on the throttle: everything but BOOST is warm

  // Each press is preceded by a CONTROL window of the same length with BOOST off: a pipeline built there is
  // ordinary driving (a prop or car coming into view), not BOOST, and is reported, not asserted.
  const count = () => page.evaluate(() => window.__bpp.count);
  const slice = (a, b) => page.evaluate(([x, y]) => window.__bpp.log.slice(x, y), [a, b]);
  // poolNew: TLX pool wrappers minted (memState().churn) — each a new three RenderObject with its own bind groups.
  const res = () => page.evaluate(() => {
    const P = window.__bpp; P.armed = true;
    let poolNew = null; try { poolNew = window.GLX.__tlx.memState().churn.poolNew; } catch (_) { /* not TLX */ }
    return P.res ? { ...P.res, poolNew, log: P.resLog.length, ros: P.ros.length } : null;
  });
  const delta = (a, b) => (a && b ? { bindGroup: b.bindGroup - a.bindGroup, buffer: b.buffer - a.buffer, texture: b.texture - a.texture,
    poolNew: a.poolNew == null ? null : b.poolNew - a.poolNew } : null);
  const resSlice = (a, b) => (a && b ? page.evaluate(([x, y]) => window.__bpp.resLog.slice(x, y), [a.log, b.log]) : null);
  const roSlice = (a, b) => (a && b ? page.evaluate(([x, y]) => window.__bpp.ros.slice(x, y), [a.ros, b.ros]) : null);
  const warmRig = await page.evaluate(() => { try { const w = window.GLX.__tlx.memState().warm; return { rig: w.rig, drawn: w.drawn, where: w.where, failed: w.failed, marks: (typeof RaceEntryProfile !== "undefined" ? RaceEntryProfile.snapshot().marks : []).filter((m) => /rigWarm/.test(JSON.stringify(m))) }; } catch (e) { return { error: String(e) }; } });
  const presses = [];
  for (let i = 1; i <= PRESSES; i++) {
    const c0 = await count(), r0 = await res();
    await frames(page, DEPLOY_FRAMES + SPACING);
    const c1 = await count(), r1 = await res();
    await page.evaluate(() => { const A = window.__apex; if (A.setEnergy) A.setEnergy(1); A.setBoost(true); });
    await frames(page, 3);
    const deployed = await page.evaluate(() => { const e = window.__apex.carEffects(); return !!(e && e.ersDeploy); });
    await frames(page, DEPLOY_FRAMES - 3);
    await page.evaluate(() => window.__apex.setBoost(false));
    await frames(page, SPACING);
    const c2 = await count(), r2 = await res();
    presses.push({ press: i, deployed, control: c1 - c0, controlBuilt: await slice(c0, c1), pipelines: c2 - c1, built: await slice(c1, c2),
      controlRes: delta(r0, r1), res: delta(r1, r2), resMade: await resSlice(r1, r2),
      controlRos: await roSlice(r0, r1), ros: await roSlice(r1, r2) });
  }
  await gas(false);
  const out = { hook, forceGL, ls, warmRig, presses };
  mkdirSync("artifacts/perf", { recursive: true });
  writeFileSync(`artifacts/perf/boost-press-pipelines-${forceGL ? "gl" : "gpu"}.json`, JSON.stringify(out, null, 1));
  return out;
}

// THE VERDICT, shared by both legs (#3677 / #3703, agreed with OrchA 32 and A·H17):
//   (a) STRICT: presses 2..N build ZERO pipelines on a lit mesh layout (the BOOST/deploy draws — the cockpit ERS
//       bar, ERS strip, OT lamp, lift flame and rear-light flash all draw through createMesh geometry, whose
//       layout carries `trk`). Any such build is a per-press re-mint: Bryce's "every press, a hitch".
//   (b) BACKGROUND: the fx particle streams (attrs `fxAlpha…`) re-mint on their own (#3713, background pipeline
//       release), in the no-BOOST control windows as well. Over presses 2..N the press windows must not build
//       more of them than the matched control windows did: BOOST adds nothing to the background rate.
// The background re-mint itself is pinned strictly in #3713 (zero in N idle windows), red until that lands.
export const isFxStream = (b) => /(^|,)fxAlpha(,|$)/.test(b.attrs || "");
//   (c) FIRST PRESS (#4514): press 1 builds ZERO pipelines on the lit mesh layout (`trk`): every BOOST-only lit
//       variant is in the entry warm, in the winding it is drawn with. Post-chain quads (`position,uv`) can land in
//       the window by timing and are not BOOST's, so only the lit layout is strict here.
export const isLitMesh = (b) => /(^|,)trk(,|$)/.test(b.attrs || "");
export function boostVerdict(presses) {
  const later = presses.slice(1), fail = [];
  const first = presses[0] ? presses[0].built.filter(isLitMesh) : [];
  if (first.length) fail.push(`press 1 built ${first.length} lit pipelines: a BOOST-only variant the warm missed (#4514): ${JSON.stringify(first.slice(0, 6))}`);
  for (const p of later) {
    const lit = p.built.filter((b) => !isFxStream(b));
    if (lit.length) fail.push(`press ${p.press} built ${lit.length} BOOST/lit pipelines (#3677): ${JSON.stringify(lit.slice(0, 6))}`);
  }
  const fxPress = later.reduce((n, p) => n + p.built.filter(isFxStream).length, 0);
  const fxCtrl = later.reduce((n, p) => n + (p.controlBuilt || []).filter(isFxStream).length, 0);
  if (fxPress > fxCtrl) fail.push(`presses 2..${presses.length} built ${fxPress} fx-stream pipelines vs ${fxCtrl} in the matched no-BOOST windows`);
  return { fail, fxPress, fxCtrl };
}
