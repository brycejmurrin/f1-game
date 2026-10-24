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
