// @ts-check
// GLX FALLBACK — the test that defines GLX's safe-mode job (#7045, #6861 phase 4, D-058).
//
// GLX is the landing spot of every backend failure (.claude/rules/render-glx.md):
// the no-adapter path and a TLX whose create() fails. render-boot.spec.js proves
// each backend BOOTS when picked; this file proves the two failure paths LAND on
// GLX and then RACE: a lap finishes with zero console errors and zero GL errors.
//
// Same selection contract as render-boot (tests/unit/select-specs.test.mjs): no
// test.slow(), no test.setTimeout, no describe-level timeout, two tests. It is in
// test:gfx, which js/render/glx/ and js/render/renderer-boot.js both route to
// (tools/ci/pick-tests.mjs; pinned by tests/unit/glx-fallback-routing.test.mjs).
//
// Identity is read the way render-boot reads it: the bare GLX path installs no
// `backend` marker, so `undefined` is only evidence beside the positive half,
// sessionStorage apex26.gfxBound === "webgl2" (written only after GLX.init
// succeeded, js/render/renderer-boot.js) and a live webgl2 context on #game.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { awaitTrackBuild } from "../helpers/await-track-build.js";
import { awaitPresentedFrame } from "../helpers/presented-canvas.js";

/** Boot with `ls` written over the fixtures' GLX pin (a page init script runs
 *  after the context's), wait for __apex, and report what the chooser bound. */
async function bootAndRead(page, ls) {
  await page.addInitScript((kv) => {
    try {
      for (const [k, v] of Object.entries(kv)) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
    } catch (_) {}
  }, ls);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  return page.evaluate(() => {
    const ss = (k) => { try { return sessionStorage.getItem(k); } catch (_) { return "ERR"; } };
    return {
      // GLX is a top-level const in a classic script: page-scope lexical, not window.GLX.
      backend: typeof GLX !== "undefined" ? GLX.backend : "no GLX",
      bound: ss("apex26.gfxBound"),
      fallbackWhy: ss("apex26.gfxFallbackWhy"),
      adapterWhy: ss("apex26.gfxAdapterWhy"),
      webgl2: (() => {
        const cv = document.querySelector("canvas#game");
        try { return !!(cv && /** @type {HTMLCanvasElement} */ (cv).getContext("webgl2")); } catch (_) { return false; }
      })(),
    };
  });
}

/** The positive GLX identity, never the absent marker alone (§Boot evidence). */
function expectGlx(s) {
  const diag = JSON.stringify(s);
  expect(s.bound, "the chooser did not publish a WebGL2 bind: " + diag).toBe("webgl2");
  expect(s.webgl2, "no live WebGL2 context on #game: " + diag).toBe(true);
  expect(s.backend, "a deferred backend marker is installed, so this is not GLX: " + diag).toBeUndefined();
}

/** Race Red Bull Ring on whatever is bound, drive one lap on the autopilot law,
 *  and present frames between chunks so GLX draws the lap it is racing. */
async function lapOnGlx(page) {
  await page.evaluate(() => window.__apex.race("redbull", "day", "dry", { laps: 3 }));
  await awaitTrackBuild(page);
  await page.evaluate(() => {
    const a = window.__apex;
    if (typeof a.renderScale === "function") a.renderScale(0.5);
    a.go();
    // The perf rig (SoakRun, the autopilot law) is LAZY_PERF, idle-loaded ~3 s after boot: ask for it now.
    try { LazyBundles.live().ensurePerfRig(); } catch (_) { /* the poll below names the miss */ }
  });
  await expect.poll(() => page.evaluate(() => typeof SoakRun !== "undefined" && !!SoakRun.policy("autopilot", { laps: 1 })),
    { message: "the autopilot law (SoakRun, LAZY_PERF) never bound", timeout: BOOT_MS }).toBe(true);
  expect(await awaitPresentedFrame(page), "GLX presented no race frame before the lap").not.toBe(false);
  let laps = 0;
  const chunks = [];
  for (let i = 0; i < 5 && laps < 1; i++) {
    const r = await page.evaluate(() => window.__apex.rollout({ policy: "autopilot", laps: 1, seconds: 40 }));
    expect(r && r.ok !== false, "rollout refused: " + JSON.stringify(r)).toBe(true);
    chunks.push({ to: r.to, lapsCompleted: r.lapsCompleted, stopped: r.ran && r.ran.stoppedEarly, off: r.offTrack });
    laps += r.lapsCompleted || 0;
    // Hand the main thread back so GLX renders the car where the lap put it.
    expect(await awaitPresentedFrame(page), "GLX stopped presenting mid-lap: " + JSON.stringify(chunks)).not.toBe(false);
  }
  expect(laps, "no lap finished on GLX: " + JSON.stringify(chunks)).toBeGreaterThanOrEqual(1);
  return page.evaluate(() => ({
    hasErrorReader: typeof GLX !== "undefined" && typeof GLX.gpuErrors === "function",
    gpuErrors: typeof GLX !== "undefined" && typeof GLX.gpuErrors === "function" ? GLX.gpuErrors() : null,
  }));
}

/** Zero errors: console errors and page errors, from the fixtures' capture. */
function expectNoErrors(consoleLines, gl) {
  // The reader must exist before its 0 means anything (render-boot.spec.js boot()).
  expect(gl.hasErrorReader).toBe(true);
  expect(gl.gpuErrors).toBe(0);
  expect(consoleLines.filter((l) => l.startsWith("error:") || l.startsWith("pageerror:"))).toEqual([]);
}

test("no GPU adapter: the unset default boots GLX and finishes a lap with 0 errors", async ({ page, consoleLines }) => {
  // requestAdapter() answers null on every call. CI's llvmpipe may expose no
  // navigator.gpu at all; the stub makes both boxes take the same branch.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "gpu", {
        configurable: true,
        value: { requestAdapter: async () => null, getPreferredCanvasFormat: () => "bgra8unorm" },
      });
    } catch (_) {}
  });
  const s = await bootAndRead(page, { "apex26.gfxBackend": null });
  expectGlx(s);
  // The unset default is not a pick: it owes no fallback reason, but the boot
  // probe records what it saw (renderer-boot.js, #5304).
  expect(s.adapterWhy, JSON.stringify(s)).toBe("requestAdapter() returned null");
  expect(s.fallbackWhy, JSON.stringify(s)).toBeNull();
  expectNoErrors(consoleLines, await lapOnGlx(page));
});

test("TLX create() fails: an explicit three pick lands on GLX, says why, and finishes a lap with 0 errors", async ({ page, consoleLines }) => {
  // Serve the real tlx.js with create() replaced by a throw: the fetch, the
  // roster and Gfx.create all run as shipped, and only TLX's answer changes.
  await page.route(/\/js\/render\/three\/tlx\.js(\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text())
      + "\n;TLX.create = async function () { throw new Error(\"forced by glx-fallback.spec.js\"); };\n";
    await route.fulfill({ response: res, body });
  });
  const s = await bootAndRead(page, { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "1" });
  expectGlx(s);
  // A pick that ends on GLX must say why (#2285): Gfx.create caught the throw and answered null.
  expect(s.fallbackWhy || "", JSON.stringify(s)).toMatch(/^three create\(\) refused/);
  expectNoErrors(consoleLines, await lapOnGlx(page));
});
