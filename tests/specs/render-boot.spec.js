// @ts-check
// RENDER BOOT — the blocking gate js/render/ did not have.
//
// A coverage audit on 2026-09-22 found that `js/render/{glx,three,webgpu}` was
// routed to NOTHING that can fail a push. All six specs of `test:gfx` declare
// 240-540 s against the change-aware gate's 180 s per-test cap, so a renderer
// diff put every one of them in `overBudget`, emptied the plan, and SKIPPED the
// `selected` job; `renderer-macos` is schedule/dispatch only. The backends that
// actually ship were booted by no blocking job on any push.
//
// This spec exists to be CHEAP ENOUGH TO BE SELECTED, which is a design
// constraint, not a preference:
//
//   * no `test.slow()`, no `test.setTimeout`, no `test.describe.configure({
//     timeout })`. Those three are exactly what `maxDeclaredTimeout()` in
//     tools/ci/select-specs.mjs walks for, and any of them would push this file
//     back over the cap and undo the point of it. tests/unit/select-specs.test.mjs
//     pins that this file stays selectable.
//   * few tests. The gate's capacity is 10 TESTS, and a spec larger than the
//     whole cap is `unreachable` no matter what it declares (touch-steer, 25).
//
// It is a BOOT probe, not a look test. `docs/ARCHITECTURE.md` §Boot evidence is
// the rule it implements: a unit test of a backend is not evidence that it
// runs, and four WGX defects shipped behind a green mock. The image-quality
// questions stay with test:gfx, which is still the right place for them.
//
// WGX IS DELIBERATELY NOT HERE, and that is a gap worth stating rather than
// papering over. The selected gate runs under Mesa llvmpipe, which exposes no
// `navigator.gpu` (AGENTS.md §Verification), so WGX cannot boot in the job this
// spec was written to be selected into. Booting it needs SwiftShader, and
// pinning that here would cost the budget this file exists to stay inside.
// WGX's gate remains `.claude/rules/render-wgx.md` plus the macOS census.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { awaitPresentedFrame, presentedCanvasClip } from "../helpers/presented-canvas.js";

/** Boot the page with one backend pinned, and report what came up.
 *
 *  ANTI-VACUITY IS THE WHOLE POINT of reading `gpuErrors` through a `typeof`
 *  check first. gfx-probe.mjs records the trap: a missing reader yields
 *  `gpuErrors: null`, which reads as "no errors" and means "nobody asked". A
 *  test that cannot tell those apart passes hardest exactly when the backend
 *  failed to install. */
async function boot(page, ls) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon/i.test(msg.text())) errors.push(msg.text());
  });
  await page.addInitScript((kv) => {
    try {
      for (const [k, v] of Object.entries(kv)) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
    } catch (_) {}
  }, ls);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled number: a software boot here measures 11-33 s.
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await awaitPresentedFrame(page);
  const state = await page.evaluate(() => ({
    // GLX is a top-level `const` in a classic script — page-scope lexical, NOT
    // window.GLX. Same access pattern as webgl-probes/tlx-probes.
    backend: typeof GLX !== "undefined" ? GLX.backend : null,
    hasErrorReader: typeof GLX !== "undefined" && typeof GLX.gpuErrors === "function",
    gpuErrors: (typeof GLX !== "undefined" && typeof GLX.gpuErrors === "function")
      ? GLX.gpuErrors() : null,
    aspect: typeof GLX !== "undefined" ? GLX.aspect : null,
    // A LIVE WebGL2 context on the shipped canvas. This is the positive,
    // discriminating half of the GLX identity below: WGX claims the canvas and
    // getContext("webgl2") then returns null, so a true here is evidence a
    // WebGL-family backend actually owns it — not merely that no marker was set.
    webgl2: (() => {
      const cv = document.querySelector("canvas#game");
      try { return !!(cv && cv.getContext("webgl2")); } catch (_) { return false; }
    })(),
    // The key gfx.js writes when a backend REFUSED and it fell back. Absent is
    // the good case, so it is read alongside a positive signal, never alone.
    bound: (() => { try { return sessionStorage.getItem("apex26.gfxBound"); } catch (_) { return "ERR"; } })(),
  }));
  const clip = await presentedCanvasClip(page);
  return { ...state, clip, errors };
}

/** The liveness answers every backend owes, identity aside.
 *
 *  Identity is asserted per test, because the two backends do not answer it the
 *  same way and pretending they do would hide which one is live. TLX and WGX
 *  install a `backend` MARKER onto the GLX object (tlx.js: `backend: "three"`);
 *  the native WebGL2 path installs nothing, so its marker is `undefined`.
 *
 *  That makes the GLX identity an ABSENCE — the exact shape
 *  docs/ARCHITECTURE.md §Boot evidence warns about, where the failure and the
 *  success read alike. So it is never asserted alone: `webgl2` below is the
 *  positive half, and it is discriminating rather than decorative, because a
 *  canvas WGX has claimed hands back null. */
function expectLiveBackend(s) {
  // The reader must EXIST before its value means anything (see boot()).
  expect(s.hasErrorReader).toBe(true);
  expect(s.gpuErrors).toBe(0);
  expect(s.aspect).toBeGreaterThan(0);
  // A POSITIVE signal, per §Boot evidence: something was composited. The
  // container has no real GPU, so the presented surface is #game-soft; on a
  // headed machine it is #game. Either is a frame; neither is zero-sized.
  expect(s.clip, "no presented canvas — nothing was composited").not.toBeNull();
  expect(s.clip.width).toBeGreaterThan(0);
  expect(s.clip.height).toBeGreaterThan(0);
  expect(s.errors).toEqual([]);
}

test("GLX boots as the bare WebGL2 path and presents a frame", async ({ page }) => {
  // The explicit WebGL2 opt-out, and the fallback every other backend degrades
  // to. If this cannot boot there is no renderer left to fall back ON.
  const s = await boot(page, { "apex26.gfxBackend": "webgl2" });
  expectLiveBackend(s);
  // No overlay marker: the bare path installs none. Measured, not assumed — the
  // first run of this spec asserted "webgl2" here and read `undefined`.
  expect(s.backend).toBeUndefined();
  // …and the positive half, which is what makes the line above mean something.
  expect(s.webgl2, "no live WebGL2 context on #game — GLX did not claim it").toBe(true);
});

test("TLX boots, installs its three marker, and presents a frame", async ({ page }) => {
  // tlxForceGL pins three's WebGL2 path: three's WebGPU path dies under
  // SwiftShader on `mappedAtCreation` (.claude/rules/render-tlx.md), so without
  // the pin this measures the harness rather than the renderer.
  const s = await boot(page, { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "1" });
  expectLiveBackend(s);
  expect(s.backend).toBe("three");
  expect(s.webgl2).toBe(true);
});

test("an unset backend still boots TLX — the shipped default", async ({ page }) => {
  // The default is what players get, and it is chosen by the ABSENCE of a key,
  // so no test that sets one can see it change. A silent flip to the bare path
  // would look like a working game and ship a different renderer — and with the
  // marker gone it would look exactly like the GLX test above passing.
  const s = await boot(page, { "apex26.gfxBackend": null, "apex26.tlxForceGL": "1" });
  expectLiveBackend(s);
  expect(s.backend).toBe("three");
});
