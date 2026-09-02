// @doc Does an installed PWA still work with the origin gone? The only check that sees a bare circuit after a missed precache.
// @section runner
/* offline-precache-check.cjs — the ONLY test that proves the precache fix.
 *
 * The regression is silent by construction: loadBackendScripts injects the
 * scenery closure and its `el.onload = el.onerror = resolve` swallows a failed
 * fetch, so offline the circuit builds BARE — road, terrain, generic dressing,
 * no bespoke scenery — with no exception and no visible error. A tag assertion
 * cannot see it. So: install the service worker online, go OFFLINE, then race a
 * circuit this session has never raced, and compare the instanced-prop count
 * against tools/verify-track.cjs, which builds the same circuit in Node with
 * the closure guaranteed present.
 */
const { chromium } = require("playwright");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = process.cwd();
const TY = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".png":"image/png", ".webp":"image/webp", ".woff2":"font/woff2", ".mjs":"text/javascript",
  ".bin":"application/octet-stream", ".glb":"model/gltf-binary", ".svg":"image/svg+xml" };
// TWO circuits, and that is the whole point. WARM is raced online, which makes
// the SW's fetch-miss handler cache its scenery — so it can never prove
// anything about the precache. COLD is never touched until we are offline.
// The first cut of this test used one circuit for both and PASSED with the
// precache deleted; the runtime cache had already saved it. cota is the cold
// one because Node and the browser agree exactly there (8665), so the expected
// number needs no tolerance.
const WARM = process.argv[2] || "spa";
const TRACK = process.argv[3] || "cota";
const TRACK_ARG = WARM;

const srv = http.createServer((req, rep) => {
  let u = decodeURIComponent(req.url.split("?")[0]); if (u === "/") u = "/index.html";
  const f = path.join(ROOT, u.replace(/^\/+/, ""));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end(); }
  rep.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream" });
  rep.end(fs.readFileSync(f));
});

srv.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const want = Number((execFileSync("node", ["tools/verify-track.cjs", TRACK], { encoding: "utf8" })
    .match(/— (\d+) instanced/) || [])[1]);
  console.log(`warm=${WARM} (raced online)   cold=${TRACK} (first touched OFFLINE, Node says ${want})`);
  // Chromium comes from harness.mjs's ladder (CHROME / PW_CHROMIUM / the known
  // paths), never a hard-coded /opt path — tools-runnable.test.mjs pins that,
  // and rtc-e2e died on a Mac for exactly this.
  const exe = (await import("./harness.mjs")).pickChromium();
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const bad = [];
  let serverDown = false;
  try {
    // ---- 1. online: register + let the install precache finish --------------
    const p1 = await ctx.newPage();
    await p1.goto(base + "/", { waitUntil: "domcontentloaded" });
    await p1.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 60000 });
    const installed = await p1.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return { ok: false, why: "no service worker" };
      // The SW marks a finished install with its own sentinel key.
      for (let i = 0; i < 240; i++) {
        const names = await caches.keys();
        for (const n of names) {
          const c = await caches.open(n);
          if (await c.match("__apex_install_complete__")) {
            const keys = await c.keys();
            return { ok: true, cache: n, entries: keys.length,
                     scenery: keys.filter((k) => k.url.includes("/js/circuits/scenery/")).length,
                     presets: keys.some((k) => k.url.includes("light-presets")) };
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return { ok: false, why: "install never completed" };
    });
    console.log("install:", JSON.stringify(installed));
    if (!installed.ok) bad.push("service worker install: " + installed.why);
    else {
      if (installed.scenery !== 40) bad.push(`only ${installed.scenery}/40 scenery files precached`);
      if (!installed.presets) bad.push("light-presets.js not precached");
    }
    // Race it ONLINE first and keep the count. That, not the Node number, is
    // the reference: verify-track builds in a different harness and spa is
    // known to differ from a browser by one node (established twice, pre-split
    // and post-split). Comparing browser-online to browser-offline is
    // apples-to-apples, and widening a tolerance to paper over the harness
    // delta would be exactly the move AGENTS.md forbids.
    await p1.evaluate((t) => window.__apex.race(t), TRACK_ARG);
    await p1.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 180000 });
    const online = await p1.evaluate(() => {
      const tg = window.__apex.trackGraph ? window.__apex.trackGraph() : null;
      return tg && Array.isArray(tg.nodes) ? tg.nodes.length : null;
    });
    console.log(`online  ${TRACK_ARG}: instanced=${online} (Node ${want})`);

    // ---- 2. take CONTROL. sw.js deliberately does not clients.claim() (see its
    // activate handler: no claim for an incomplete generation), so the page that
    // registered the worker is not controlled by it. One reload fixes that, and
    // it is what a returning player does anyway.
    await p1.reload({ waitUntil: "domcontentloaded" });
    const controlled = await p1.evaluate(() => !!navigator.serviceWorker.controller);
    console.log("controlled after reload:", controlled);
    if (!controlled) bad.push("page is not controlled by the service worker after a reload");
    await p1.close();

    // ---- 3. OFFLINE: race a circuit never raced in this session -------------
    // ctx.setOffline() alone is NOT offline for this test: Chromium's network
    // emulation exempts loopback, so 127.0.0.1 stays reachable and every
    // "offline" number below would be measured against a live server (proved
    // here on 2026-09-01 — the sanity probe read `reachable (404)` for a URL no
    // cache can hold, from inside the page, with setOffline on). So KILL THE
    // SERVER. That is unambiguously offline: the origin no longer exists, and
    // the precache is the only thing left that can answer. setOffline stays on
    // as well because the service worker's navigate handler branches on
    // navigator.onLine, and a returning player really is flagged offline.
    await ctx.setOffline(true);
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    serverDown = true;
    const p2 = await ctx.newPage();
    const errs = [];
    p2.on("pageerror", (e) => errs.push(String(e.message).slice(0, 100)));
    // IS THE HARNESS ACTUALLY OFFLINE? Ask for something no cache can hold. If
    // this SUCCEEDS, setOffline is not blocking loopback and every "offline"
    // result below is worthless — the exact class of instrument fault
    // PERF-FINDINGS §0 is about.
    // It must be asked from INSIDE the page: ctx.request is a separate
    // APIRequestContext and does not necessarily honour page-level offline
    // emulation, so asking it measures the wrong process.
    await p2.goto(base + "/", { waitUntil: "domcontentloaded" });
    const proof = await p2.evaluate((u) => fetch(u, { cache: "no-store" }).then(
      (r) => `reachable (${r.status})`, (e) => "blocked: " + String(e.message).slice(0, 40)),
      base + "/__definitely_not_cached__.js");
    console.log("offline sanity — uncacheable URL from the page is:", proof);
    if (proof.startsWith("reachable")) bad.push(
      "setOffline did NOT block loopback — the offline result below proves nothing");
    // Every offline step is individually guarded. A control run (the shipped
    // sw.js, precache deliberately absent) does not merely build a bare
    // circuit — measured 2026-09-01, it never reached a usable __apex at all —
    // and an unguarded evaluate there dies as an uncaught rejection that buries
    // the diagnosis under a stack trace.
    let booted = true;
    await p2.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 90000 })
      .catch(() => { booted = false; bad.push("the game did not boot offline at all"); });
    let got = { instanced: null, hasScenery: false, presets: false };
    if (booted) {
      await p2.evaluate((t) => window.__apex.race(t), TRACK).catch((e) =>
        bad.push("__apex.race() threw offline: " + String(e.message).slice(0, 80)));
      await p2.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 180000 })
        .catch(() => bad.push("the track never built offline"));
      await p2.evaluate(() => window.__apex.headless(true)).catch(() => {});
      got = await p2.evaluate(() => {
        const tg = window.__apex.trackGraph ? window.__apex.trackGraph() : null;
        return { instanced: tg && Array.isArray(tg.nodes) ? tg.nodes.length : null,
                 hasScenery: !!(window.TrackScenery && Object.keys(window.TrackScenery).length),
                 presets: !!(window.LightPresets && Object.keys(window.LightPresets).length) };
      }).catch(() => got);
    }
    console.log(`offline ${TRACK}: instanced=${got.instanced} (Node ${want})  TrackScenery=${got.hasScenery}  LightPresets=${got.presets}  pageErrors=${errs.length}`);
    // COLD circuit vs Node: a bare build loses most of its props, so this is a
    // large, unambiguous gap, not a one-node judgement call.
    if (got.instanced !== want) bad.push(`OFFLINE BARE BUILD: ${TRACK} ${got.instanced} instanced offline vs ${want} expected`);
    if (!got.hasScenery) bad.push("window.TrackScenery empty offline — the closure never arrived");
    if (!got.presets) bad.push("window.LightPresets empty offline");
  } finally { await browser.close().catch(() => {}); if (!serverDown) srv.close(); }
  for (const b of bad) console.error("FAIL: " + b);
  console.log(bad.length ? `\n${bad.length} FAILURE(S)` : "\nOFFLINE OK — lazy payloads survive a cold offline race");
  process.exit(bad.length ? 1 : 0);
});
