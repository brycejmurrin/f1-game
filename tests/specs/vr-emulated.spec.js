/**
 * WebXR Phase 0 — emulated immersive-vr (IWER metaQuest3) Playwright suite.
 *
 * Own Playwright project `xr-emulated` (see playwright.config.js). Spec-level
 * coverage only: IWER cannot prove multiview, MSAA>1, foveation effect,
 * XRGPUBinding, or real Quest frame times — those need a headset
 * (docs/notes/XR-QUEST-ON-DEVICE.md).
 *
 * Launch: SwiftShader via XR_LAUNCH_ARGS. Canvas capture uses toDataURL in rAF
 * (page.screenshot can time out under software GL). IWER returns two views
 * even in mono (right eye zero-width) — assert left viewport width > 0.
 *
 * Sources: IWER getting-started, playwright-webxr README, three.js #33497.
 */
import { test, expect } from "@playwright/test";
import {
  installIwer, waitXrFrames, waitWhilePresenting,
  captureCanvasDataUrl, sampleXrEye, IWER_VENDOR, IWER_VERSION,
} from "../helpers/iwer-install.mjs";
import fs from "fs";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  test.skip(!fs.existsSync(IWER_VENDOR), `pinned IWER ${IWER_VERSION} missing under tests/vendor/`);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e)));
  page.__xrPageErrors = pageErrors;
  await installIwer(page, { stereo: true });
});

async function bootAndProbe(page) {
  await page.goto("/");
  // XrBoot binds before the agent API mounts; this fixture needs both. Keep a
  // single boot-readiness budget instead of stacking two independent waits.
  await page.waitForFunction(() => typeof XrSession !== "undefined"
    && typeof XrSession.probe === "function"
    && typeof XrBoot !== "undefined" && XrBoot.isBound()
    && window.__apex && typeof window.__apex.renderScale === "function",
  null, { polling: 100, timeout: 60_000 });
  // Pin the existing half-resolution control BEFORE attach: TLX cannot resize
  // its canvas while XR owns it, and IWER uses that same drawing buffer. The
  // strict frame delta and 45 s deadline remain unchanged. This is lifecycle
  // coverage at constrained software-rendered resolution, not headset timing.
  const fixture = await page.evaluate(() => {
    const perf = window.__apex.renderScale(0.5);
    const canvas = document.getElementById("game");
    return { scale: perf.scale, auto: perf.auto, preset: GfxQuality.current(),
      width: canvas.width, height: canvas.height,
      maxWidth: Math.round(innerWidth * devicePixelRatio * 0.5),
      maxHeight: Math.round(innerHeight * devicePixelRatio * 0.5) };
  });
  test.info().annotations.push({ type: "xr-software-fixture", description: JSON.stringify(fixture) });
  expect(fixture.preset).toBe("low");
  expect(fixture.scale).toBe(0.5);
  expect(fixture.auto).toBe(false);
  expect(fixture.width).toBeGreaterThan(0);
  expect(fixture.height).toBeGreaterThan(0);
  expect(fixture.width).toBeLessThanOrEqual(fixture.maxWidth);
  expect(fixture.height).toBeLessThanOrEqual(fixture.maxHeight);
  const install = await page.evaluate(() => globalThis.__iwerInstall || { ok: false });
  expect(install.ok, `IWER install: ${JSON.stringify(install)}`).toBe(true);
  const supported = await page.evaluate(async () => {
    await XrSession.probe();
    return XrSession.isSupported();
  });
  expect(supported).toBe(true);
  // ENTER VR visible ⇒ mountUi + capability probe finished (same as a player click).
  await page.waitForFunction(() => {
    const b = document.getElementById("xr-enter");
    return b && !b.hidden;
  }, null, { polling: 100, timeout: 15_000 });
}

async function startVr(page) {
  return page.evaluate(async () => {
    try {
      const s = await XrSession.start();
      return {
        ok: !!s,
        presenting: XrSession.isPresenting(),
        backend: XrSession.backend(),
        features: XrSession.enabledFeatures(),
        error: XrSession.lastError() && String(XrSession.lastError().message || XrSession.lastError()),
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });
}

async function endVr(page) {
  await page.evaluate(async () => { try { await XrSession.end(); } catch (_) { /* */ } });
  // Presenting end can still starve page timers until the session fully drops.
  await waitWhilePresenting(page, () => !XrSession.isPresenting(), { timeout: 10_000, interval: 100 });
}

test("pinned IWER vendor is present and ENTER VR appears; session starts/exits/re-enters", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);

  const btn = page.locator("#xr-enter");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText(/ENTER VR/i);

  const started = await startVr(page);
  test.info().annotations.push({ type: "xr-start", description: JSON.stringify(started) });
  expect(started.ok, started.error || "session start").toBe(true);
  expect(started.presenting).toBe(true);
  expect(started.backend).toBe("webgl2");
  await expect(btn).toHaveText(/EXIT VR/i);

  // XR frames advance while presenting (single page evaluation — see waitXrFrames).
  await waitXrFrames(page, 2, { timeout: 45_000 });

  await endVr(page);
  await expect(btn).toHaveText(/ENTER VR/i);

  const again = await startVr(page);
  expect(again.ok && again.presenting).toBe(true);
  await waitXrFrames(page, 2, { timeout: 45_000 });
  await endVr(page);

  expect(page.__xrPageErrors || []).toEqual([]);
});

test("head pose stays seated, preserves physical movement, and repeated recenter is stable", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  await page.evaluate(() => { globalThis.__iwerDevice.position.y = 1.65; });
  const started = await startVr(page);
  expect(started.ok).toBe(true);
  await waitXrFrames(page, 2, { timeout: 45_000 });

  // Read real IWER offset-space poses and the composed stereo cameras during
  // an active XRFrame. Anchor-relative checks also work while the car moves.
  const sample = (center = false) => page.evaluate((center) => new Promise((resolve) => {
    const s = XrSession.getSession();
    if (!s) return resolve(null);
    s.requestAnimationFrame((_t, frame) => {
      let stable = true;
      if (center) {
        stable = XrSession.recenter(frame);
        const first = Array.from(XrSession.eyeFrames(null, frame)[0].view);
        stable = XrSession.recenter(frame) && stable;
        const second = XrSession.eyeFrames(null, frame)[0].view;
        stable = stable && first.every((v, i) => Math.abs(v - second[i]) < 1e-5);
      }
      const eyes = XrSession.eyeFrames(null, frame);
      const pose = frame.getViewerPose(XrSession.getRefSpace());
      if (!eyes || !pose) return resolve(null);
      const anchor = XrSession.getAnchor();
      const delta = eyes[0].eye.map((v, i) => (v + eyes[1].eye[i]) / 2 - anchor.eye[i]);
      resolve({ stable, delta, position: Array.from(pose.transform.matrix).slice(12, 15),
        gaze: [-pose.transform.matrix[8], -pose.transform.matrix[9], -pose.transform.matrix[10]] });
    });
  }), center);
  const before = await sample();
  expect(before).toBeTruthy();
  expect(Math.hypot(...before.delta)).toBeLessThan(0.001);
  expect(Math.hypot(...before.position)).toBeLessThan(0.001);

  await page.evaluate(() => {
    const d = globalThis.__iwerDevice;
    d.position.x += 0.4;
    d.position.y += 0.2;
    d.position.z -= 0.3;
  });
  await waitXrFrames(page, 3, { timeout: 45_000 });
  const moved = await sample();
  expect(moved.position[1]).toBeCloseTo(0.2, 4);
  expect(Math.hypot(moved.position[0], moved.position[2])).toBeCloseTo(0.5, 4);
  expect(Math.hypot(...moved.delta)).toBeCloseTo(Math.hypot(0.5, 0.2), 3);

  const centered = await sample(true);
  expect(centered.stable).toBe(true);
  expect(Math.hypot(...centered.delta)).toBeLessThan(0.001);
  expect(Math.hypot(...centered.position)).toBeLessThan(0.001);
  centered.gaze.forEach((v, i) => expect(v).toBeCloseTo(before.gaze[i], 4));
  await waitXrFrames(page, 2, { timeout: 45_000 });
  const presented = await sample();
  expect(Math.hypot(...presented.delta)).toBeLessThan(0.001);
  presented.gaze.forEach((v, i) => expect(v).toBeCloseTo(before.gaze[i], 4));

  await endVr(page);
  expect(page.__xrPageErrors || []).toEqual([]);
});

test("controller thumbstick/trigger/squeeze/A-B map through Input.remoteSample/remoteEvent", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  expect((await startVr(page)).ok).toBe(true);
  await waitXrFrames(page, 2, { timeout: 45_000 });

  // Both phases share one immersive session. `menuOpen` is UiLayers.navOpen():
  // the title screen counts, so the stick/trigger/A/B drive MENU navigation there
  // and pedals stay zero. The driving mapping is asserted with the menu layer
  // reported closed (what a race in progress reports).
  const capture = (args) => page.evaluate(async ({ menuOpen, press }) => {
    const d = globalThis.__iwerDevice;
    const samples = [];
    const events = [];
    const prev = Input.remoteSample;
    const prevEv = Input.remoteEvent;
    const prevNav = UiLayers.navOpen;
    Input.remoteSample = (s) => { samples.push(s); return prev ? prev.call(Input, s) : true; };
    Input.remoteEvent = (k) => { events.push(k); return prevEv ? prevEv.call(Input, k) : true; };
    if (menuOpen === false) UiLayers.navOpen = () => false;

    d.controllers.right.updateButtonValue("trigger", 1);
    d.controllers.left.updateButtonValue("trigger", 0.8);
    d.controllers.left.updateAxes("thumbstick", 0.9, 0);
    // Squeeze is NOT a look-back any more: it must never raise `held`.
    d.controllers.right.updateButtonValue("squeeze", 1);
    if (press) {
      // Rising edge A = recenter, B = pause
      d.controllers.right.updateButtonValue("a-button", 1);
      d.controllers.right.updateButtonValue("b-button", 1);
    }

    // Window rAF is suspended while immersive; drive the wait off the session.
    const s = XrSession.getSession();
    const n = XrSession.frameCount();
    await new Promise((r) => {
      const t0 = performance.now();
      const tick = () => {
        if (XrSession.frameCount() > n + 4 || performance.now() - t0 > 4000) return r();
        if (s && typeof s.requestAnimationFrame === "function") s.requestAnimationFrame(tick);
        else r();
      };
      tick();
    });

    Input.remoteSample = prev;
    Input.remoteEvent = prevEv;
    UiLayers.navOpen = prevNav;
    return {
      samples: samples.slice(-5),
      events: events.slice(),
      presenting: XrSession.isPresenting(),
      navOpen: !!prevNav(),
    };
  }, args);

  // Phase 1: the real title screen. A menu is open, so no pedal or steer command.
  const inMenu = await capture({ menuOpen: undefined, press: false });
  test.info().annotations.push({ type: "xr-input-menu", description: JSON.stringify(inMenu) });
  expect(inMenu.presenting).toBe(true);
  expect(inMenu.navOpen, "title screen counts as an open menu layer").toBe(true);
  const menuLast = inMenu.samples[inMenu.samples.length - 1];
  expect(menuLast, "expected remoteSample traffic").toBeTruthy();
  expect(menuLast.thr).toBe(0);
  expect(menuLast.brk).toBe(0);
  expect(menuLast.held | 0).toBe(0);

  // Phase 2: driving. Triggers, stick and the A/B edges map through.
  const mapped = await capture({ menuOpen: false, press: true });
  test.info().annotations.push({ type: "xr-input", description: JSON.stringify(mapped) });
  expect(mapped.presenting).toBe(true);
  const last = mapped.samples[mapped.samples.length - 1];
  expect(last, "expected remoteSample traffic").toBeTruthy();
  expect(last.thr).toBeGreaterThan(0.5);
  expect(last.brk).toBeGreaterThan(0.5);
  // The thumbstick is a STICK command (Input.remoteSample({ steer })), not a
  // roll dressed through steerToTilt: no tilt filter, slew or lamp-1 zero.
  // Left stick at +0.9, past XrRig's 0.12 dead zone: a finite rightward command.
  expect(last.roll).toBeUndefined();
  expect(last.steer).toBeGreaterThan(0.5);
  // Squeeze no longer injects a look-back (the seated anchor never turns).
  expect(last.held | 0).toBe(0);
  expect(mapped.events).toContain("pause");

  await endVr(page);
  expect(page.__xrPageErrors || []).toEqual([]);
});

test("controller disconnect and visibility-blurred drop the remote sample, mark the session hidden and restore on visible", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  expect((await startVr(page)).ok).toBe(true);
  await waitXrFrames(page, 2, { timeout: 45_000 });

  await page.evaluate(() => {
    const d = globalThis.__iwerDevice;
    if (d.controllers.left) d.controllers.left.connected = false;
    if (d.controllers.right) d.controllers.right.connected = false;
  });
  await waitXrFrames(page, 2, { timeout: 45_000 });

  // XrBoot answers a non-visible state by dropping the XR-owned remote sample
  // (Input.remoteLost("xr")) before it asks the game to pause. Spy on that call.
  await page.evaluate(() => {
    globalThis.__xrLost = [];
    globalThis.__xrLostPrev = Input.remoteLost;
    Input.remoteLost = (src) => { __xrLost.push(src); return __xrLostPrev.call(Input, src); };
    globalThis.__iwerDevice.updateVisibilityState("visible-blurred");
  });
  await page.waitForFunction(() => __xrLost.length > 0, null, { polling: 100, timeout: 15_000 });
  const vis = await page.evaluate(() => ({
    state: XrSession.getSession() && XrSession.getSession().visibilityState,
    visible: XrSession.isVisible(),
    lost: __xrLost.slice(),
    diagVisible: XrBoot.diag().visible,
  }));
  test.info().annotations.push({ type: "xr-visibility", description: JSON.stringify(vis) });
  expect(vis.state).toBe("visible-blurred");
  // visible-blurred is still "visible" to XrSession (only "hidden" clears it);
  // the pause/remote-drop path keys off state !== "visible" instead.
  expect(vis.lost).toContain("xr");

  await page.evaluate(() => {
    Input.remoteLost = __xrLostPrev;
    const d = globalThis.__iwerDevice;
    d.updateVisibilityState("visible");
    if (d.controllers.left) d.controllers.left.connected = true;
    if (d.controllers.right) d.controllers.right.connected = true;
  });
  await page.waitForFunction(() => XrSession.getSession().visibilityState === "visible" && XrSession.isVisible(),
    null, { polling: 100, timeout: 15_000 });

  await endVr(page);
  expect(page.__xrPageErrors || []).toEqual([]);
});

test("WebGPU path negotiates via enabledFeatures and falls back to WebGL2", async ({ page }) => {
  test.setTimeout(180_000);
  // Opt-in preference before boot; IWER will not grant `webgpu`, so backend must be webgl2.
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.xrBackend", "webgpu"); } catch (_) { /* */ }
  });
  await bootAndProbe(page);

  const started = await startVr(page);
  test.info().annotations.push({ type: "xr-webgpu-fallback", description: JSON.stringify(started) });
  expect(started.ok).toBe(true);
  expect(started.backend).toBe("webgl2");
  expect(started.features || []).not.toContain("webgpu");

  // Pure negotiation helper: a session whose enabledFeatures omit webgpu is WebGL2.
  const granted = await page.evaluate(() => {
    const fake = { enabledFeatures: ["local-floor"] };
    return {
      without: XrSession.featureGranted(fake, "webgpu"),
      withIt: XrSession.featureGranted({ enabledFeatures: ["local-floor", "webgpu"] }, "webgpu"),
      init: XrSession.sessionInit(true).optionalFeatures.includes("webgpu"),
    };
  });
  expect(granted.without).toBe(false);
  expect(granted.withIt).toBe(true);
  expect(granted.init).toBe(true);

  await endVr(page);
  expect(page.__xrPageErrors || []).toEqual([]);
});

test("EXIT VR resumes the game tick and restores the live camera without changing its preference", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  await page.evaluate(() => window.__apex.camera(1));
  const beforeStore = await page.evaluate(() => localStorage.getItem("apex26.camMode"));

  expect((await startVr(page)).ok).toBe(true);
  await waitXrFrames(page, 2, { timeout: 45_000 });

  const during = await page.evaluate(() => ({
    cam: window.__apex.camera().index,
    store: localStorage.getItem("apex26.camMode"),
    loopByXr: XrBoot.loopByXr(),
    diag: XrBoot.diag(),
  }));
  // Cockpit forced live, but store must still hold the pre-VR choice.
  expect(during.store).toBe(beforeStore);
  expect(during.loopByXr).toBe(true);
  expect(during.diag.savedCam).toBeGreaterThanOrEqual(0);

  await endVr(page);
  // Observe the game's own tick, rather than an unrelated rAF chain created
  // by the test (which would keep running even if the game failed to resume).
  await page.evaluate(() => {
    globalThis.__xrFlatTicks = 0;
    globalThis.__xrOriginalPoll = Input.poll;
    Input.poll = (...args) => { __xrFlatTicks++; return __xrOriginalPoll.apply(Input, args); };
  });
  await page.waitForFunction(() => __xrFlatTicks >= 3, null, { polling: 100, timeout: 15_000 });
  const after = await page.evaluate(() => {
    Input.poll = __xrOriginalPoll;
    return { loopByXr: XrBoot.loopByXr(), cam: window.__apex.camera().index,
      store: localStorage.getItem("apex26.camMode"), savedCam: XrBoot.diag().savedCam };
  });
  expect(after.loopByXr).toBe(false);
  expect(after.savedCam).toBe(-1);
  expect(after.store).toBe(beforeStore);
  expect(after.cam).toBe(1);
  expect(page.__xrPageErrors || []).toEqual([]);
});

test("ENTER VR without an attachable backend pins TLX+forceGL, stashes the prior pick and reloads", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  // Unconditional: pretend the live backend cannot attach (the IWER suite
  // normally forces tlxForceGL, which can), and stub the reload we would trigger.
  const result = await page.evaluate(() => {
    const gfx = { attachXrSession() {}, xrCapable: () => false };
    XrBoot.bind({ gfx, tickBody() {}, windowTick() {}, getCamMode: () => 0, setCamMode() {} });
    localStorage.removeItem("apex26.xrPrevBackend");
    const canAttach = XrBoot.canAttach();
    const out = XrBoot.ensureXrBackend();
    return { canAttach, out, gfxBackend: localStorage.getItem("apex26.gfxBackend"),
      pin: localStorage.getItem("apex26.tlxForceGL"), pending: localStorage.getItem("apex26.xrEnterPending") };
  }).catch((e) => ({ navigated: String(e && e.message || e) }));
  test.info().annotations.push({ type: "xr-backend-gate", description: JSON.stringify(result) });
  // ensureXrBackend() ends in location.reload(); that destroys the evaluate context.
  // Read the persisted pin from the reloaded page instead.
  await page.waitForLoadState("domcontentloaded");
  const pins = await page.evaluate(() => ({
    gfxBackend: localStorage.getItem("apex26.gfxBackend"),
    pin: localStorage.getItem("apex26.tlxForceGL"),
    pending: localStorage.getItem("apex26.xrEnterPending"),
  }));
  expect(pins.gfxBackend).toBe("three");
  expect(pins.pin).toBe("1");
  expect(pins.pending).toBe("1");
});

test("stereo viewports: left width > 0; non-blank canvas capture; flat mode after exit", async ({ page }) => {
  test.setTimeout(180_000);
  await bootAndProbe(page);
  expect((await startVr(page)).ok).toBe(true);
  await waitXrFrames(page, 3, { timeout: 45_000 });

  const sampled = await sampleXrEye(page);
  const views = (sampled && sampled.views) || [];
  test.info().annotations.push({ type: "xr-views", description: JSON.stringify(views) });
  // IWER returns two views even in mono; left must be usable.
  expect(views.length).toBeGreaterThanOrEqual(1);
  expect(views[0].hasEye).toBe(true);
  if (views[0].vw != null) expect(views[0].vw).toBeGreaterThan(0);

  const diag = await page.evaluate(() => XrBoot.diag());
  test.info().annotations.push({ type: "xr-diag", description: JSON.stringify(diag) });
  expect(diag.presenting).toBe(true);
  expect(diag.frameCount).toBeGreaterThan(0);

  const dataUrl = await captureCanvasDataUrl(page, "#game");
  // Soft: under some soft-present paths #game may be empty; prefer #game-soft.
  const url = dataUrl || await captureCanvasDataUrl(page, "#game-soft");
  expect(url && url.startsWith("data:image/png")).toBeTruthy();
  // A blank canvas also encodes to a valid PNG; a PNG of drawn content is far
  // larger than the ~100 B an empty one costs.
  const png = Buffer.from(url.split(",")[1], "base64");
  expect(png.length, "captured canvas must carry content, not an empty PNG").toBeGreaterThan(2000);

  await endVr(page);

  // Flat mode still boots: __apex (or title) responds and no pageerror.
  const flat = await page.evaluate(() => ({
    presenting: XrSession.isPresenting(),
    hasApex: typeof window.__apex === "object" && window.__apex != null,
    title: !!(document.getElementById("title") || document.body),
  }));
  expect(flat.presenting).toBe(false);
  expect(flat.title).toBe(true);
  expect(page.__xrPageErrors || []).toEqual([]);
});
