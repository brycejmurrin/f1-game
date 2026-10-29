// Quitting a race and loading another track must drop the previous circuit's chunk draws.
//
// The bug this pins: TLX draws a chunked mesh as one merged geometry per pass
// (main and mirror). free() disposed that geometry but did not release its pooled
// wrapper, and three r186 removes a RenderObject only when the object or the
// material dispatches "dispose". After Quit to Menu and the next circuit, the
// previous merge slots were still in renderer._objects (measured three/webgl2,
// SwiftShader, 844×390: monza's two large tlx-lit-ch geometries still present
// during spa, one of them still visible).
//
// Assertion: every geometry that had 20k+ vertices on circuit A is absent from
// the render-object set once circuit B is racing, except the session's car
// shadow silhouettes (createMesh kind "carSh"). Those are built once and cast
// again on the next race; buildGeometry gives every mesh a trk attribute, so
// trk alone does not mean a track ribbon. Track chunks carry no __tlxKind.
// aliveTracks must be exactly B.
// Backend is pinned to three.js WebGL2 (apex26.tlxForceGL=1); the reading names
// the API it actually booted.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, waitFrames } from "../../tools/lib/mem-census.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const RIBBON_VERTS = 20000;
const CIRCUITS = ["monza", "spa"];

async function raceTrack(page, id) {
  await page.evaluate((tid) => { window.__apex.race(tid); }, id);
  await page.waitForFunction((tid) => {
    try {
      const i = window.__apex.info();
      return i.track === tid && (i.state === "race" || i.state === "count");
    } catch (_) { return false; }
  }, id, { polling: 200, timeout: 240000 });
  await page.evaluate(() => {
    const A = window.__apex;
    A.go(); A.headless(true); A.setInput({ throttle: true, steer: 0 });
    A.step(1 / 60, 60); A.clearInput(); A.headless(false);
  });
  await waitFrames(page, 6);
}

async function quitToMenu(page) {
  await page.evaluate(() => document.getElementById("pausebtn").click());
  await page.waitForFunction(() => {
    const pm = document.getElementById("pausemenu");
    return pm && !pm.hidden;
  }, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => {
    const q = document.getElementById("pm-quit");
    q.click(); q.click();
  });
  await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 100, timeout: 60000 });
  await waitFrames(page, 4);
}

function ribbonIds() {
  const set = window.renderer && window.renderer._objects && window.renderer._objects._renderObjects;
  const ids = [];
  const seen = new Set();
  if (!set) return ids;
  for (const ro of set) {
    const g = ro.geometry;
    if (!g || seen.has(g.uuid)) continue;
    seen.add(g.uuid);
    const pos = g.attributes && g.attributes.position;
    if (pos && pos.count >= 20000) ids.push(g.uuid);
  }
  return ids;
}

test("quit to menu then another track drops the previous circuit's chunk draws", async ({ page }) => {
  test.setTimeout(480000);
  await page.addInitScript(() => {
    window.__TEST_MODE = true;
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.gfxBootStepMs", "45000");
      localStorage.setItem("apex26.pauseConfirm", JSON.stringify("off"));
      localStorage.setItem("apex26.tyreWear", JSON.stringify("off"));
    } catch (_) { /* private mode: the boot pins below still fail closed */ }
  });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/?three-devtools=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });

  const log = [];
  let previous = [];
  for (const id of CIRCUITS) {
    if (previous.length) await quitToMenu(page);
    await raceTrack(page, id);
    const census = await censusAfterGc(page, cdp);
    const ribbons = await page.evaluate(ribbonIds);
    const still = previous.length ? await page.evaluate((ids) => {
      const set = window.renderer._objects._renderObjects;
      const want = new Set(ids);
      const hit = [];
      const seen = new Set();
      for (const ro of set) {
        const g = ro.geometry;
        if (!g || !want.has(g.uuid) || seen.has(g.uuid)) continue;
        seen.add(g.uuid);
        const pos = g.attributes && g.attributes.position;
        const o = ro.object;
        let mat = "";
        try { mat = ro.material && ro.material.customProgramCacheKey ? ro.material.customProgramCacheKey() : ""; } catch (_) {}
        const attrs = g.attributes ? Object.keys(g.attributes).sort().join(".") : "";
        const e = o && o.matrix && o.matrix.elements;
        const bb = g.boundingBox;
        const span = bb ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] : null;
        hit.push({
          u: g.uuid, verts: pos ? pos.count : 0, mat: String(mat).slice(0, 40), attrs,
          vis: !!(o && o.visible), same: !!(o && o.geometry === g),
          parent: o && o.parent ? o.parent.type : "",
          kind: g.__tlxKind || "",
          idx: g.index ? g.index.count : 0,
          split: !!g.__tlxSplit,
          ident: !!(e && e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0),
          span: span && span.map((n) => Math.round(n)),
          otype: o ? o.type : "",
        });
      }
      return hit;
    }, previous) : [];
    log.push({
      id, backend: census.backend, heapMB: census.heapMB, aliveTracks: census.aliveTracks,
      three: census.three, ribbons: ribbons.length, previousStill: still,
    });
    mkdirSync("artifacts/logs", { recursive: true });
    writeFileSync("artifacts/logs/session-quit-memory.json", JSON.stringify(log, null, 2));
    expect(census.backend && census.backend.renderer, "this spec measures TLX").toBe("three");
    expect(census.backend.api, "software GL pins three.js WebGL2 via tlxForceGL").toBe("webgl2");
    expect(census.aliveTracks, `${id}: one built track`).toEqual([id]);
    expect(ribbons.length, `${id}: the chunked ribbons must have drawn`).toBeGreaterThan(0);
    if (previous.length) {
      // carSh: the shadow silhouette, one mesh per body, recast on every race.
      // Anything else at this size is a track draw (a merged chunk, a ribbon, a prop).
      const leaked = still.filter((h) => h.kind !== "carSh");
      expect(leaked, `${id}: previous circuit chunk geometries are still in the render-object set`).toEqual([]);
    }
    previous = ribbons;
  }
});
