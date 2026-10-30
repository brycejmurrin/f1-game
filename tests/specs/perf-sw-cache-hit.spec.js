// @ts-check
// The service worker's install must already hold every script and stylesheet a first race loads.
//
// The shell is ~3.5 MB of scripts plus ~10 MB of install precache (sw.js header). An asset the install
// misses is a network round trip on every later visit that needs it — on a phone's mobile link, or offline,
// a race that does not start. tests/unit/service-worker.test.mjs drives sw.js's handlers in a VM; this is
// the browser half: a real install, then a count of cache misses.
//
// Why not "reload offline and see": on a dev host (127.0.0.1, this suite) sw.js is NETWORK-first for
// same-origin requests so an edit shows at once, and Playwright's context.setOffline() does not reach the
// worker's own fetches (measured 2026-10-24: a never-cached URL still answered 200 offline). So the cache
// is read directly instead:
//   1. boot, wait until the install has SETTLED (sw.js INSTALL_SETTLED_URL: both pools written), read from
//      inside the worker (context.serviceWorkers());
//   2. snapshot every request URL in the worker's caches — BEFORE any race, so the race's own fetches
//      (which the dev host's network-first path also caches) cannot fill the snapshot;
//   3. race("monza") to the race, recording every same-origin script / stylesheet the page loads;
//   4. EXACT: each of them is in the snapshot — zero misses — except the runtime-only opt-ins sw.js
//      deliberately never precaches (WGX js/render/webgpu/, Rapier, jsQR, trystero) and the dev-only
//      __apex surface (tools/manifest.cjs LAZY_AGENT — measured 2026-10-24: those 9 files were the only misses).
import { createRequire } from "node:module";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { startPwaRecoveryServer, pwaRecoverySnapshot, pwaServedGeneration } from "../helpers/pwa-recovery.mjs";

const require = createRequire(import.meta.url);
// The __apex / agentview surface: injected for tests and localhost only, never on a player's page, and
// deliberately left out of the install (sw.js LAZY_AGENT). The manifest is the list, not a copy of it.
const LAZY_AGENT = require("../../tools/manifest.cjs").LAZY_AGENT;

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const SETTLED = "__apex_install_settled__";
const RUNTIME_ONLY = /\/js\/render\/webgpu\/|\/vendor\/[^/]*(rapier|jsqr|trystero)/i;

test("a first race loads no script or stylesheet the service worker install did not precache", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(600000);
  const loaded = new Set();
  const origin = new URL(String(baseURL)).origin;   // page.url() is still about:blank when the first requests fire
  page.on("request", (q) => {
    const t = q.resourceType();
    if ((t === "script" || t === "stylesheet") && new URL(q.url()).origin === origin) loaded.add(q.url());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  // Read the caches from INSIDE the worker: what the worker itself would answer from.
  await page.waitForFunction(() => "serviceWorker" in navigator && !!navigator.serviceWorker.controller, null, { polling: 500, timeout: 300000 });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 60000 });
  const settled = (k) => sw.evaluate(async (key) => { for (const n of await caches.keys()) if (await caches.match(key, { cacheName: n })) return true; return false; }, k);
  await expect.poll(() => settled(SETTLED), { timeout: 300000, intervals: [1000] }).toBe(true);
  const cached = new Set(await sw.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
    return out;
  }));
  const beforeRace = new Set(loaded);

  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => { try { const i = window.__apex.info(); return i.track === "monza" && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    null, { polling: 200, timeout: 300000 });

  const raceOnly = [...loaded].filter((u) => !beforeRace.has(u));
  const devOnly = (u) => LAZY_AGENT.some((f) => new URL(u).pathname === "/" + f);
  const checked = [...loaded].filter((u) => !RUNTIME_ONLY.test(u) && !devOnly(u));
  const misses = checked.filter((u) => !cached.has(u)).map((u) => new URL(u).pathname + new URL(u).search);
  testInfo.annotations.push({ type: "precache", description: `${cached.size} cached requests; ${loaded.size} scripts/styles loaded (${raceOnly.length} by the race); ${misses.length} misses` });
  expect(cached.size, "the install must have cached the shell").toBeGreaterThan(50);
  expect(raceOnly.length, "the race must load code of its own, or the check is vacuous").toBeGreaterThan(0);
  expect(misses, "scripts / stylesheets loaded by boot + first race that the install never precached").toEqual([]);
});

test("real service worker preserves a settled release across offline launch and interrupted upgrade, then recovers", async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const server = await startPwaRecoveryServer();
  const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 844, height: 390 }, hasTouch: true });
  let page = await context.newPage();
  const matrix = { schema: 1, fixture: "minimal shell and inert assets; production sw.js plus release comment", sourceHash: server.sourceHash, cells: [] };
  const buildA = 91001, buildB = 91002;
  async function expectRelease(build, fromServiceWorker, label) {
    const snapshot = await pwaRecoverySnapshot(page);
    expect(snapshot.controller?.state, label).toBe("activated");
    expect(snapshot.controller?.scriptURL, label).toBe(`${server.origin}/sw.js?v=${build}`);
    expect(snapshot.shellBuild, label).toBe(build);
    expect(snapshot.assetBuild, label).toBe(build);
    expect(snapshot.generations.find((g) => g.name === `apex26-${build}`)?.settled, label).toBe(true);
    const servedGeneration = await pwaServedGeneration(page);
    expect(servedGeneration, label).toBe(build);
    matrix.cells.push({ label, snapshot, servedGeneration, navigationFromServiceWorker: fromServiceWorker });
  }
  async function waitForRelease(build) {
    await expect.poll(async () => {
      const s = await pwaRecoverySnapshot(page);
      return s.controller?.scriptURL === `${server.origin}/sw.js?v=${build}`
        && s.controller.state === "activated"
        && s.generations.some((g) => g.name === `apex26-${build}` && g.settled);
    }, { timeout: 30000, intervals: [100, 250, 500] }).toBe(true);
  }
  try {
    await page.goto(server.origin);
    await page.evaluate((build) => navigator.serviceWorker.register(`/sw.js?v=${build}`, { updateViaCache: "none" }), buildA);
    await waitForRelease(buildA);
    let response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expectRelease(buildA, response.fromServiceWorker(), "A installed and controlled");

    // Origin failure reaches worker-owned fetches too; setOffline alone did not in our harness.
    server.setOffline(true);
    await page.close();
    page = await context.newPage();
    response = await page.goto(server.origin);
    expect(response?.fromServiceWorker()).toBe(true);
    await expectRelease(buildA, response.fromServiceWorker(), "A launches with origin unavailable");

    server.setOffline(false);
    server.deploy(buildB, { failRequired: true });
    const attempt = await page.evaluate(async (build) => {
      try { await navigator.serviceWorker.register(`/sw.js?v=${build}`, { updateViaCache: "none" }); return { registered: true }; }
      catch (error) { return { registered: false, error: String(error) }; }
    }, buildB);
    await expect.poll(() => server.requests.some((r) => r.path.startsWith("/shell.js?") && r.build === buildB && r.status === 503),
      { timeout: 30000, intervals: [100, 250] }).toBe(true);
    await expect.poll(async () => (await pwaRecoverySnapshot(page)).installing,
      { timeout: 30000, intervals: [100, 250] }).toBe(null);
    const interrupted = await pwaRecoverySnapshot(page);
    expect(interrupted.controller?.scriptURL).toBe(`${server.origin}/sw.js?v=${buildA}`);
    expect(interrupted.generations.find((g) => g.name === `apex26-${buildB}`)).toBeDefined();
    expect(interrupted.generations.find((g) => g.name === `apex26-${buildB}`)?.settled).toBe(false);
    const interruptedGeneration = await pwaServedGeneration(page);
    expect(interruptedGeneration).toBe(buildA);
    matrix.cells.push({ label: "B essential fetch fails; A remains active", snapshot: interrupted, servedGeneration: interruptedGeneration, attempt });

    server.setOffline(true);
    response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expectRelease(buildA, response.fromServiceWorker(), "interrupted B does not displace offline A");

    server.setOffline(false);
    server.deploy(buildB);
    await page.evaluate((build) => navigator.serviceWorker.register(`/sw.js?v=${build}`, { updateViaCache: "none" }), buildB);
    await waitForRelease(buildB);
    response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expectRelease(buildB, response.fromServiceWorker(), "B recovers and activates");

    server.setOffline(true);
    response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expectRelease(buildB, response.fromServiceWorker(), "recovered B launches offline");
    expect(matrix.cells).toHaveLength(6);
  } finally {
    matrix.requests = server.requests;
    try {
      await testInfo.attach("pwa-recovery-matrix", { body: JSON.stringify(matrix, null, 2), contentType: "application/json" });
    } finally {
      try { await context.close(); } finally { await server.close(); }
    }
  }
});
