// @ts-check
// Second visit, no network: the service worker's cache must answer EVERY shell asset, and a race must start.
//
// The shell is ~3.5 MB of scripts plus ~10 MB of install precache (sw.js header). A precache that misses one tag
// costs a phone a network round trip on every visit — or, offline or on a dead mobile link, a game that does not
// boot. tests/unit/service-worker.test.mjs drives sw.js's handlers in a VM; this spec is the browser half: a real
// install, then a reload with the context offline, counting where every response came from.
//
// On a dev host (127.0.0.1 — this suite) sw.js is NETWORK-first for same-origin requests so an edit shows at once,
// so the only honest cache-hit test is an offline one. The control proves the offline emulation reaches the
// worker's own fetches: a never-cached URL must FAIL. Without it, "served by the service worker" could still mean
// "fetched from the network by the service worker".
//
// Counts, no timings:
//   1. every same-origin script / stylesheet / document response on the offline reload came from the service
//      worker with status 200, and the shell's <script src> tags all arrived (no requestfailed);
//   2. the game boots (__apex) and race("monza") reaches the race, offline: the scenery / circuit pools are
//      precached, not runtime-only.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const SETTLED = "__apex_install_settled__";   // sw.js INSTALL_SETTLED_URL: written after the background pool

test("offline second visit: every shell asset is a service-worker cache hit and a race starts", async ({ page, context }, testInfo) => {
  test.setTimeout(600000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  // reg() runs after window load plus an idle slice; the install then fetches both pools.
  // A synchronous predicate (wait-polling-lint): each poll starts one CacheStorage probe and reads the last answer.
  await page.waitForFunction((k) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return false;
    const w = /** @type {any} */ (window);
    if (!w.__swProbe) {
      w.__swProbe = (async () => { for (const n of await caches.keys()) if (await caches.match(k, { cacheName: n })) return true; return false; })()
        .then((ok) => { w.__swSettled = ok; w.__swProbe = null; }, () => { w.__swProbe = null; });
    }
    return w.__swSettled === true;
  }, SETTLED, { polling: 1000, timeout: 300000 });

  const seen = [];
  const failed = [];
  const origin = new URL(page.url()).origin;
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    const type = r.request().resourceType();
    if (type === "script" || type === "stylesheet" || type === "document") seen.push({ path: u.pathname, type, sw: r.fromServiceWorker(), status: r.status() });
  });
  page.on("requestfailed", (q) => { const u = new URL(q.url()); if (u.origin === origin) failed.push(u.pathname + u.search); });

  await context.setOffline(true);
  // Control: a URL nothing ever cached must fail offline, or the worker can still reach the network.
  const control = await page.evaluate(async () => {
    try { const r = await fetch("version.json?offline-control=" + Math.random(), { cache: "no-store" }); return r.ok ? "reached the network" : "status " + r.status; }
    catch (_) { return "failed"; }
  });
  expect(control, "offline emulation must reach the service worker's own fetches").not.toBe("reached the network");

  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS * 2 });
  const tags = await page.evaluate(() => [...document.querySelectorAll("script[src]")]
    .map((s) => new URL(s.getAttribute("src"), location.href)).filter((u) => u.origin === location.origin).map((u) => u.pathname));

  const notSw = seen.filter((s) => !s.sw || s.status !== 200);
  const shellFailed = failed.filter((p) => /\.(js|css|html)(\?|$)/.test(p) || p === "/");
  testInfo.annotations.push({ type: "offline reload", description: `${seen.length} script/style/document responses, ${tags.length} shell script tags, control: ${control}` });
  expect(seen.some((s) => s.type === "document"), "the reload's document response must be observed").toBe(true);
  expect(notSw, "every same-origin script / stylesheet / document must come from the service worker with 200").toEqual([]);
  expect(shellFailed, "no shell asset may fail offline").toEqual([]);
  const served = new Set(seen.filter((s) => s.type === "script").map((s) => s.path));
  expect(tags.filter((p) => !served.has(p)), "every shell <script src> must arrive from the cache").toEqual([]);

  // A race offline: the scenery and circuit code the build injects must be precached too.
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => { try { const i = window.__apex.info(); return i.track === "monza" && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    null, { polling: 200, timeout: 300000 });
  expect(failed.filter((p) => /\.js(\?|$)/.test(p)), "no script may fail while a race is built offline").toEqual([]);
  await context.setOffline(false);
});
