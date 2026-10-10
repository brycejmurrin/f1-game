#!/usr/bin/env node
// @doc Read-only probe: is ONE instanced scenery batch (e.g. cota's yellow tecpro wall) submitted AND visible in the lit pass? Pixel-independent verdict plus a region diff; runs on software or hardware.
/* batch-visible-probe.mjs — "is this instanced batch actually on screen?"
 *
 * Born of the cota T12 tecpro wall (shots/scenery/README.md): the batch is built,
 * culled, submitted (drawInstanced), casts shadows — and the lit pass shows
 * nothing, while Miami's identical-model batch draws. A software run cannot say
 * whether that is a hardware defect (docs: "software probes are not evidence
 * about a player's GPU"), so this script is portable like gpu-game-check.mjs:
 * same static server + Chromium, `--hw` leaves the backend pins alone.
 *
 * Read-only: no js/ edit. It wraps `GLX.__tlx.renderer.render` to capture the
 * scene, finds the InstancedMesh by (vertex count, instance count), and reports
 *
 *   A. the mesh's own state (visible/count/frustumCulled/renderOrder/layers/
 *      material/bounds/instanceMatrix usage) — what the lit pass is handed;
 *   B. renderer.info.render drawCalls/triangles with the mesh's layer on vs off:
 *      `submitted` = the delta is the instance count x triangles (pixel-free);
 *   C. a REGION diff: the projected AABB of the instances, framebuffer shown vs
 *      hidden (disable layer 0 on the mesh; tlx never rewrites layers), against
 *      a shown-vs-shown noise floor, plus the count of body-coloured pixels.
 *      `lit-visible` needs the region diff to clear 5x the noise floor.
 *
 * Verdict line: `= batch <track> <match> submitted=<b> litVisible=<b|null>`.
 * litVisible=false with submitted=true is the cota defect, on whatever GPU ran it.
 *
 * Run: node tools/gfx/batch-visible-probe.mjs cota --match "tyre-stack|tecpro" --count 70
 *        [--frac 0.635 --az 90 --dist 40 --el 14] [--hw] [--json out.json]
 *   --hw   no tlxForceGL / SwiftShader pins (a real GPU runner); default pins the
 *          WebGL2 path the way apex-eval does.
 */
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const track = argv[0] && !argv[0].startsWith("--") ? argv[0] : "cota";
const hw = argv.includes("--hw");
const match = flag("--match", "tyre-stack|tecpro");
const wantCount = flag("--count", "70") | 0;
const cam = { frac: +flag("--frac", 0.635), az: +flag("--az", 90), dist: +flag("--dist", 40), el: +flag("--el", 14) };
const jsonOut = flag("--json", null);
const VW = 1024, VH = 576;

const srv = await startStaticServer(ROOT);
const out = { track, match, wantCount, hw, cam };
let code = 0;
try {
  const browser = await launchChromium({
    args: hw ? ["--enable-unsafe-webgpu"] : ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  await page.addInitScript((hwMode) => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      if (!hwMode) localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) { /* blocked storage: page default */ }
  }, hw);
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 90000, polling: 100 });
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 180000, polling: 100 });
  await sleep(1600);

  // Capture the scene through renderer.render, find the mesh, freeze the clocks.
  const setup = await page.evaluate(({ match, wantCount, cam }) => {
    const a = window.__apex, tlx = window.GLX && window.GLX.__tlx;
    if (!tlx || !tlx.renderer) return { err: "no GLX.__tlx.renderer (backend is not TLX)" };
    const r = tlx.renderer;
    if (!r.__bvp) {
      const orig = r.render.bind(r);
      r.render = function (scene, camera) {
        // Keep the biggest scene: shadow / mirror / env passes render others.
        if (!window.__bvpScene || scene.children.length >= window.__bvpScene.children.length) { window.__bvpScene = scene; window.__bvpCamera = camera; }
        return orig(scene, camera);
      };
      r.__bvp = true;
    }
    const g = a.trackGraph();
    if (!g) return { err: "no trackGraph" };
    const bs = g.batches({ instancedOnly: true }).batches.filter((b) => b.model.includes(match));
    const b = bs.find((x) => x.count === wantCount) || null;
    if (!b) return { err: "no batch matches", have: bs.map((x) => ({ model: x.model, count: x.count })) };
    a.freeze(true); a.renderClock(12, true);
    a.orbit(cam.frac, cam.az, cam.el, cam.dist, 1.5, { fov: 55 });
    return { model: b.model, count: b.count, verts: b.verts, renderer: r.constructor && r.constructor.name };
  }, { match, wantCount, cam });
  Object.assign(out, setup);
  if (setup.err) throw new Error(setup.err + " " + JSON.stringify(setup.have || ""));

  const settle = async () => {
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (window.__apex.awaitSoftPresent) { try { await window.__apex.awaitSoftPresent(4000); } catch (_) { /* hw: no blit */ } }
    });
  };
  await settle();

  // A + B: mesh state, then submitted-ness via renderer.info.
  const probeMesh = () => page.evaluate(({ verts, count }) => {
    const sc = window.__bvpScene, r = window.GLX.__tlx.renderer;
    if (!sc) return { err: "no scene captured" };
    const hits = [];
    sc.traverse((o) => {
      if (o.isInstancedMesh && o.userData.tlxInstCap === count) hits.push(o);
    });
    // verts is the model's (un-indexed) count; a de-indexed geometry differs, so only narrow by it when that still leaves a hit.
    const byV = hits.filter((o) => o.geometry.attributes.position.count === verts);
    if (byV.length) { hits.length = 0; hits.push(...byV); }
    window.__bvpMesh = hits[0] || null;
    const m = hits[0];
    if (!m) { let ims = 0, caps = []; sc.traverse((o) => { if (o.isInstancedMesh) { ims++; caps.push(o.userData.tlxInstCap); } }); return { err: "no InstancedMesh with cap=" + count, sceneChildren: sc.children.length, ims, caps: caps.slice(0, 80) }; }
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, bsph = m.geometry.boundingSphere;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    return {
      matches: hits.length, visible: m.visible, count: m.count, allocated: m.instanceMatrix.count,
      frustumCulled: m.frustumCulled, renderOrder: m.renderOrder, layersMask: m.layers.mask,
      matType: mat && mat.type, matVisible: mat && mat.visible, matTransparent: mat && mat.transparent,
      matSide: mat && mat.side, depthTest: mat && mat.depthTest, depthWrite: mat && mat.depthWrite,
      matOpacity: mat && mat.opacity,
      geoBox: bb ? [bb.min.toArray(), bb.max.toArray()] : null, geoSphereR: bsph ? bsph.radius : null,
      matrixUsage: m.instanceMatrix.usage, matrixLen: m.instanceMatrix.array.length,
      hasInstanceColor: !!m.instanceColor, tint: !!m.geometry.attributes.instanceTint,
      camLayersMask: window.__bvpCamera && window.__bvpCamera.layers.mask,
      info: { calls: r.info.render.drawCalls, tris: r.info.render.triangles },
    };
  }, { verts: out.verts, count: out.count });
  out.mesh = await probeMesh();
  if (out.mesh.err) throw new Error(out.mesh.err);

  const info = () => page.evaluate(() => { const r = window.GLX.__tlx.renderer; return { calls: r.info.render.drawCalls, tris: r.info.render.triangles, frame: r.info.render.frame }; });
  const setLayer = (on) => page.evaluate((on) => { const m = window.__bvpMesh; if (on) m.layers.enable(0); else m.layers.disable(0); }, on);
  await setLayer(true); await settle(); const onI = await info();
  await setLayer(false); await settle(); const offI = await info();
  await setLayer(true); await settle();
  out.submit = { on: onI, off: offI, dTris: onI.tris - offI.tris, dCalls: onI.calls - offI.calls };
  // false only when the renderer demonstrably ran a frame for each reading; otherwise unknown.
  out.submitted = out.submit.dTris > 0 && out.submit.dCalls > 0 ? true
    : (offI.frame > onI.frame ? false : null);

  // C: projected AABB of the instances (all of them; the camera frames a stretch).
  const rect = await page.evaluate(({ VW, VH }) => {
    const m = window.__bvpMesh, cs = window.__apex.camState();
    const bb = m.geometry.boundingBox, A = m.instanceMatrix.array, n = m.count;
    const e = cs.eye, t = cs.tgt;
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const nrm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const crs = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const f = nrm(sub(t, e)), s = nrm(crs(f, [0, 1, 0])), u = crs(s, f);
    const th = 1 / Math.tan((cs.fov * Math.PI / 180) / 2), asp = VW / VH;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, vis = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 8; c++) {
        const lx = c & 1 ? bb.max.x : bb.min.x, ly = c & 2 ? bb.max.y : bb.min.y, lz = c & 4 ? bb.max.z : bb.min.z, o = i * 16;
        const wx = A[o] * lx + A[o + 4] * ly + A[o + 8] * lz + A[o + 12];
        const wy = A[o + 1] * lx + A[o + 5] * ly + A[o + 9] * lz + A[o + 13];
        const wz = A[o + 2] * lx + A[o + 6] * ly + A[o + 10] * lz + A[o + 14];
        const d = sub([wx, wy, wz], e), zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
        if (zc < 0.5) continue;
        const px = (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]) * th / asp / zc, py = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * th / zc;
        const X = (px * 0.5 + 0.5) * VW, Y = (0.5 - py * 0.5) * VH;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); vis++;
      }
    }
    return vis ? { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)),
                   width: Math.min(VW, Math.ceil(x1)) - Math.max(0, Math.floor(x0)),
                   height: Math.min(VH, Math.ceil(y1)) - Math.max(0, Math.floor(y0)), cs } : null;
  }, { VW, VH });
  out.rect = rect;
  if (!rect || rect.width < 8 || rect.height < 8) {
    out.litVisible = null; out.note = "instances project outside the frame — re-aim with --frac/--az/--dist";
  } else {
    const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    // In-page grab of the presented canvas (software: #game-soft blit; hardware: #game).
    // page.screenshot hung 30 s on SwiftShader (rAF starved by the render), and a
    // canvas read has no compositor in the loop.
    const grab = () => page.evaluate(async ({ clip }) => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const soft = document.getElementById("game-soft"), main = document.getElementById("game");
      const cv = soft && soft.width > 0 && getComputedStyle(soft).display !== "none" ? soft : main;
      const sx = cv.width / innerWidth, sy = cv.height / innerHeight;
      const c = new OffscreenCanvas(clip.width, clip.height), x = c.getContext("2d");
      x.drawImage(cv, clip.x * sx, clip.y * sy, clip.width * sx, clip.height * sy, 0, 0, clip.width, clip.height);
      return { id: cv.id, data: Array.from(x.getImageData(0, 0, clip.width, clip.height).data) };
    }, { clip });
    await settle(); const a1 = await grab(); await settle(); const a2 = await grab();
    await setLayer(false); await settle(); const b1 = await grab();
    await setLayer(true); await settle();
    const diff = (P, Q) => { let n = 0; for (let i = 0; i < P.length; i += 4) { if (Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2]) > 24) n++; } return n; };
    const hot = (P) => { let n = 0; for (let i = 0; i < P.length; i += 4) { if (P[i] > 170 && P[i + 1] > 140 && P[i + 2] < 100) n++; } return n; };
    out.region = { canvas: a1.id, px: a1.data.length / 4, noise: diff(a1.data, a2.data), shownVsHidden: diff(a1.data, b1.data),
                   bodyColoured: { shown: hot(a1.data), hidden: hot(b1.data) } };
    const r = out.region;
    // A canvas that reads back uniform is unreadable (WebGL without preserveDrawingBuffer outside the
    // render task), not "invisible": report null, never false.
    const uniq = new Set(); for (let i = 0; i < a1.data.length; i += 4 * 7) uniq.add((a1.data[i] << 16) | (a1.data[i + 1] << 8) | a1.data[i + 2]);
    r.distinctColours = uniq.size;
    out.litVisible = uniq.size < 4 ? null : r.shownVsHidden > Math.max(25, 5 * r.noise);
    if (uniq.size < 4) out.note = "region reads back uniform — canvas unreadable here; use --hw on a runner or a screenshot path";
    out.regionNote = "shownVsHidden includes the batch's own shadow inside the rect; compare bodyColoured too";
  }
} catch (e) {
  out.error = String((e && e.message) || e); code = 1;
} finally {
  await shutdown();
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log(`= batch ${track} ${match} submitted=${out.submitted ?? "?"} litVisible=${out.litVisible ?? "null"}${out.error ? " error=" + out.error : ""}`);
process.exit(code);
