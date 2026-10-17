// @doc UI explorer browser adapter: real actions, bounded DOM evidence, fault injection and Chromium traces.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { installProbeInit, gotoGame, mutateCaptureScene, awaitCaptureReady, screenshotPresentedCanvas } from "../../shot/probe-page.mjs";
import { pixelEvidence } from "../../shot/capture-contract.mjs";

export { inspectUI } from "./inspector.mjs";
import { inspectUI } from "./inspector.mjs";

export function observeErrors(page) {
  const errors = [], requests = [];
  const append = (a, x) => { if (a.length < 250) a.push({ at: Date.now(), ...x }); };
  page.on("pageerror", (e) => append(errors, { kind: "pageerror", message: e.message }));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) append(errors, { kind: "console", level: m.type(), message: m.text() }); });
  page.on("requestfailed", (r) => append(requests, { url: r.url(), error: r.failure()?.errorText }));
  return { errors, requests };
}

/** Each scenario gets a fresh context. Replays never inherit a prior candidate's storage. */
export async function openSession(browser, url, { touch = false, background = false, timeout = 90000, repro = null, backend = "three", viewport = { width: 1280, height: 800 } } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1,
    hasTouch: touch, isMobile: touch, serviceWorkers: "block" });
  let bootTimer;
  const bootDeadline = new Promise((_, reject) => { bootTimer = setTimeout(() => { void context.close(); reject(new Error("UI boot exceeded its evidence deadline")); }, timeout + 1000); });
  try { return await Promise.race([bootDeadline, (async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const logs = observeErrors(page);
    // Native motion preferences; no forced menu route, dismissed prompt or seeded player save.
    await installProbeInit(page, { backend, motion: true });
    if (repro) await page.addInitScript((b) => {
      if (b.teamIdx != null) localStorage.setItem("apex26.team", String(b.teamIdx));
      if (b.halo != null) localStorage.setItem("apex26.cockpitHalo", b.halo ? "1" : "0");
    }, repro);
    await gotoGame(page, url, timeout);
    const help = await page.evaluate(() => window.__apex.agentHelp());
    if (!background) await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").waitFor({ state: "visible", timeout });
    return { page, context, logs, help, background, backend };
  })()]); } catch (e) { await context.close(); throw e; }
  finally { clearTimeout(bootTimer); }
}

export async function performAction(session, a) {
  const { page, context } = session;
  const loc = () => a.selector ? page.locator(a.selector) : page.getByRole(a.role, { name: a.name, exact: true });
  switch (a.type) {
    case "click": await loc().click(); break;
    case "fill": await loc().fill(a.value); break;
    case "select": await loc().selectOption(a.value); break;
    case "press": await page.keyboard.press(a.key); break;
    case "viewport": await page.setViewportSize({ width: a.width, height: a.height }); break;
    case "textScale":
      // Browser text enlargement only; this is deliberately not the game's UI-size preference.
      await page.evaluate((pct) => {
        let s = document.getElementById("explorer-text-scale");
        if (!s) { s = document.createElement("style"); s.id = "explorer-text-scale"; document.head.appendChild(s); }
        s.textContent = `html{font-size:${pct}% !important}`;
        document.documentElement.dataset.explorerTextScale = String(pct);
      }, a.percent); break;
    case "offline": await context.setOffline(a.value); break;
    case "reload": await page.reload({ waitUntil: "domcontentloaded" }); break;
    case "wait": await page.locator(a.selector).waitFor({ state: a.state || "visible" }); break;
    case "checkpoint": break;
    case "scene": await positionScene(page, a); break;
    default: throw new Error(`Unsupported action ${a.type}`);
  }
}

export async function matchesOracle(session, oracle) {
  if (!oracle) return false;
  const { page, logs } = session;
  if (oracle.type === "game") {
    const state = await page.evaluate(() => ({ ...window.__apex.info(), weather: window.__apex.repro().wx }));
    return (!oracle.track || state.track === oracle.track) && (!oracle.weather || state.weather === oracle.weather) && (!oracle.state || state.state === oracle.state);
  }
  if (oracle.type === "console") return logs.errors.some((e) => (!oracle.kind || oracle.kind === e.kind) && e.message.includes(oracle.pattern));
  if (oracle.type === "layout") return (await page.evaluate(inspectUI)).issues.some((e) => (!oracle.kind || e.kind === oracle.kind) && (!oracle.selector || e.selector === oracle.selector));
  const l = page.locator(oracle.selector);
  if (oracle.type === "text") return (await l.textContent() || "").includes(oracle.text);
  const state = oracle.state || "visible";
  if (state === "attached") return await l.count() > 0;
  if (state === "detached") return await l.count() === 0;
  const v = await l.isVisible();
  return state === "visible" ? v : !v;
}

/** Serializable: collect the just-presented camera, then leave 3D paused for DOM work. */
export function captureSceneDiagnostics() {
  const a = window.__apex;
  try { return { scene: a.scene({ visible: true, limit: 30 }), camera: a.camState() }; }
  finally { a.headless(true); }
}

export async function captureRecord(session, outDir, id, label, budget, extra = {}) {
  const started = performance.now(), { page } = session;
  let sceneShot;
  // Present and pause FIRST. DOM/ARIA walks while software 3D keeps rendering
  // starve the browser and turn a two-angle inspection into a timeout.
  if (extra.mode === "scene" && budget.used < budget.max) {
    const presentation = await awaitCaptureReady(page, { timeoutMs: 45000 });
    const screenshot = `evidence/${id}.jpg`;
    const shot = await screenshotPresentedCanvas(page, { path: path.join(outDir, screenshot), skipAwait: true, pauseRender: true,
      forceCdp: true, clip: { x: 0, y: 0, ...page.viewportSize() }, type: "jpeg", quality: 72, timeout: 30000 });
    // Shared screenshot helper restores its temporary pause on return.
    const spatial = await page.evaluate(captureSceneDiagnostics);
    budget.used++; const pixels = await pixelEvidence(shot.buf);
    if (!pixels.meaningful) throw new Error(`Scene pixels are ${pixels.classification}`);
    sceneShot = { screenshot, presentation, pixels, spatial };
  }
  if (extra.mode === "scene" && !sceneShot) await page.evaluate(() => window.__apex.headless(true));
  let readinessError;
  if (!["transitions", "scene"].includes(extra.mode)) try {
    await page.waitForFunction(() => {
      const roots = [...document.querySelectorAll('.screen,dialog[open],#overlay,#hud,#pausemenu,#photo-studio')];
      return roots.some((e) => {
        if (e.hidden || !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        return !e.getAnimations({ subtree: true }).some((a) => {
          const t = a.effect?.getComputedTiming();
          return ["running", "pending"].includes(a.playState) && t && t.iterations !== Infinity && t.endTime !== Infinity;
        });
      });
    }, null, { polling: 100, timeout: 15000 });
  } catch (e) { readinessError = e.message; }
  const after = await page.evaluate(inspectUI);
  const record = { id, label, mode: extra.mode, status: "passed", after, errors: [...session.logs.errors], ...extra, details: { backend: session.backend, requests: [...session.logs.requests], ...extra.details } };
  const dir = path.join(outDir, "evidence"); fs.mkdirSync(dir, { recursive: true });
  if (readinessError || (!after.roots.length && !["transitions", "scene"].includes(extra.mode)) || after.errorOverlay.length) {
    record.status = "failed"; record.details.readinessError = readinessError || "No meaningful screen, or runtime error overlay is visible";
  }
  const aria = `evidence/${id}.aria.yml`;
  try { fs.writeFileSync(path.join(outDir, aria), await page.locator("body").ariaSnapshot({ timeout: 10000 })); record.artifacts = { ...record.artifacts, aria }; }
  catch (e) { record.details.ariaError = e.message; if (record.status !== "failed") record.status = "partial"; }
  if (sceneShot) {
    record.screenshot = sceneShot.screenshot; record.details.presentation = sceneShot.presentation; record.details.pixels = sceneShot.pixels;
    record.details.scene = sceneShot.spatial.scene; record.details.camera = sceneShot.spatial.camera;
  } else if (budget.used < budget.max && extra.mode !== "scene") {
    record.screenshot = `evidence/${id}.jpg`;
    const cdp = await page.context().newCDPSession(page);
    try { const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
      fs.writeFileSync(path.join(outDir, record.screenshot), Buffer.from(data, "base64")); budget.used++; }
    finally { await cdp.detach(); }
  } else { if (record.status !== "failed") record.status = "partial"; record.details.captureNotRun = "Screenshot budget exhausted"; }
  fs.writeFileSync(path.join(dir, `${id}.dom.json`), JSON.stringify(after, null, 2));
  record.artifacts = { ...record.artifacts, dom: `evidence/${id}.dom.json` };
  record.durationMs = Math.round(performance.now() - started);
  return record;
}

export async function startPerformanceTrace(page) {
  const cdp = await page.context().newCDPSession(page);
  try { await cdp.send("Tracing.start", { categories: "devtools.timeline,blink.user_timing", transferMode: "ReturnAsStream" }); }
  catch (e) { await cdp.detach().catch(() => {}); throw e; }
  return async (file) => {
    let timer;
    const done = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Chromium trace completion timed out")), 15000);
      cdp.once("Tracing.tracingComplete", resolve);
    });
    done.catch(() => {}); // cleanup may fail before Tracing.end; retain the real failure.
    let handle, fd;
    try {
      await cdp.send("Tracing.end"); const result = await done; handle = result.stream;
      fd = fs.openSync(file, "w"); let bytes = 0;
      for (;;) { const r = await cdp.send("IO.read", { handle, size: 65536 });
        const b = Buffer.from(r.data, r.base64Encoded ? "base64" : "utf8"); bytes += b.length;
        if (bytes > 64 * 1024 * 1024) throw new Error("Trace exceeds 64 MiB evidence cap");
        fs.writeSync(fd, b); if (r.eof) break;
      }
    } finally { clearTimeout(timer); if (fd != null) fs.closeSync(fd); if (handle) await cdp.send("IO.close", { handle }).catch(() => {}); await cdp.detach(); }
  };
}

export async function installFault(context, profile) {
  if (!["offline", "missing-assets", "slow-assets"].includes(profile)) throw new Error(`Unknown fault profile ${profile}`);
  const events = [];
  if (profile === "offline") { await context.setOffline(true); return { events, restore: () => context.setOffline(false) }; }
  const handler = async (route) => {
    const url = new URL(route.request().url());
    if (!/\/(assets|models|textures)\//.test(url.pathname) && !/\.(png|jpg|webp|wasm|bin|glb|ogg|mp3|woff2)$/.test(url.pathname)) return route.continue();
    if (events.length < 100) events.push({ url: url.href, profile });
    if (profile === "missing-assets") return route.abort("failed");
    await new Promise((r) => setTimeout(r, 700)); await route.continue();
  };
  await context.route("**/*", handler);
  return { events, restore: () => context.unrouteAll({ behavior: "wait" }) };
}

export async function positionScene(page, a) {
  await mutateCaptureScene(page, async ({ track, frac }) => {
    const api = window.__apex;
    const started = await api.race(track, "day", "dry");
    if (started === false) throw new Error("Scene race could not start");
    api.go(); api.jump(frac, 0); api.freeze(true); api.headless(false);
    api.camera("chase"); api.snapCam();
  }, a);
  if (a.cameras?.length) await page.evaluate(async ({ cameras, frac }) => {
    const api = window.__apex, camera = cameras[0];
    if (camera === "orbit") api.orbit(frac, 45, 18, 45);
    else { if (api.camera(camera) === false) throw new Error(`Unknown camera ${camera}`); api.snapCam(); }
    await api.awaitPresent(15000);
  }, a);
}
