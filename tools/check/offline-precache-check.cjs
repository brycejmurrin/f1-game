// @doc Does an installed PWA still work with the origin gone? The only check that sees a bare circuit after a missed precache.
// @section runner
/* offline-precache-check.cjs — the end-to-end proof that the precache keeps a
 * cold circuit's lazy payload offline (the unit harness in
 * tests/unit/service-worker.test.mjs proves the worker's logic; this proves a
 * real browser). CI runs it as `test:offline-precache` (tests/groups.json,
 * tests/specs/offline-precache.spec.js) against a STAGED, STAMPED site.
 *
 * The regression is silent by construction: loadBackendScripts injects the
 * scenery closure and its `el.onload = el.onerror = resolve` swallows a failed
 * fetch, so offline the circuit builds BARE — road, terrain, generic dressing,
 * no bespoke scenery — with no exception and no visible error. A tag assertion
 * cannot see it. So: install the service worker online, go OFFLINE, then race a
 * circuit this session has never raced, and compare the instanced-prop count
 * against tools/track/verify-track.cjs, which builds the same circuit in Node with
 * the closure guaranteed present.
 *
 * WHAT IT SERVES. By default the working tree (`?v=dev` tags, the committed
 * placeholder build) on 127.0.0.1, where sw.js takes its DEV_HOST branch
 * (network-first). `--root=<dir>` serves an already staged site and `--stage`
 * stages and stamps one first (tools/desktop/stage.mjs, the same bump-cache
 * stamp pages.yml runs: content-hashed `?v=` keys, the lazy-hash map, a real
 * build). Either of those is served under a NON-loopback host name mapped to
 * 127.0.0.1 and allowed as a secure origin, so sw.js runs its DEPLOYED code
 * path (cache-first, hash-verified) exactly as a player's phone does.
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
// precache deleted; the runtime cache had already saved it. The COLD circuit's
// reference is a BROWSER build of it online, in a second context with service
// workers blocked (its own storage, so it cannot warm the offline one): Node
// and the browser agreed on cota once (8665) but not since (2026-09-28: Node
// 6536, browser 6685), and browser-vs-browser needs no tolerance. The Node
// number is still printed, as information.
const ARGV = process.argv.slice(2);
const ROOT_FLAG = ARGV.find((a) => a.startsWith("--root="));
const STAGE = ARGV.includes("--stage");
const POSITIONAL = ARGV.filter((a) => a !== "--stage" && a !== ROOT_FLAG);
const WARM_ARG = POSITIONAL[0];
const TRACK_ARG_RAW = POSITIONAL[1];
const USAGE = "usage: node tools/check/offline-precache-check.cjs [--stage | --root=<staged dir>] [warmCircuit] [coldCircuit]\n"
  + "  Defaults: warm=spa cold=cota, the working tree on 127.0.0.1. Launches Chromium (~1-2 min).\n"
  + "  --stage  stage + stamp the site into artifacts/offline-precache/site first (what pages.yml ships)\n"
  + "  --root=  serve an already staged, stamped site directory";

function isCircuitId(s) {
  return typeof s === "string" && /^[a-z][a-z0-9_]*$/i.test(s);
}

// --help / -h / any dash-flag must NOT become a circuit id and boot Chromium
// (skilltest 2026-10-01: `--help` was raced as warm=--help and left a hung page).
if (ARGV.includes("--help") || ARGV.includes("-h")
    || (WARM_ARG && WARM_ARG.startsWith("-"))
    || (TRACK_ARG_RAW && TRACK_ARG_RAW.startsWith("-"))
    || (STAGE && ROOT_FLAG) || (ROOT_FLAG && ROOT_FLAG === "--root=")) {
  console.log(USAGE);
  process.exit(0);
}
if (WARM_ARG && !isCircuitId(WARM_ARG)) {
  console.error(`offline-precache: not a circuit id: ${JSON.stringify(WARM_ARG)}\n${USAGE}`);
  process.exit(2);
}
if (TRACK_ARG_RAW && !isCircuitId(TRACK_ARG_RAW)) {
  console.error(`offline-precache: not a circuit id: ${JSON.stringify(TRACK_ARG_RAW)}\n${USAGE}`);
  process.exit(2);
}

const WARM = WARM_ARG || "spa";
const TRACK = TRACK_ARG_RAW || "cota";
const TRACK_ARG = WARM;

// The directory served: the working tree, or a staged site (--root / --stage).
const SERVE = ROOT_FLAG ? path.resolve(ROOT_FLAG.slice("--root=".length))
  : STAGE ? path.join(ROOT, "artifacts", "offline-precache", "site") : ROOT;
const STAMPED = !!(ROOT_FLAG || STAGE);   // --root names a STAGED dir: the working tree is refused, never served
// A deployed-shape host for a stamped site: sw.js's DEV_HOST test is loopback only.
const HOST = STAMPED ? "apex-offline.test" : "127.0.0.1";

const srv = http.createServer((req, rep) => {
  let u = decodeURIComponent(req.url.split("?")[0]); if (u === "/") u = "/index.html";
  const f = path.join(SERVE, u.replace(/^\/+/, ""));
  if (!f.startsWith(SERVE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end(); }
  rep.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream" });
  rep.end(fs.readFileSync(f));
});

async function prepareSite() {
  if (STAGE) {
    const { stageSite, stampStaged } = await import("../desktop/stage.mjs");
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build;
    stageSite(SERVE, { root: ROOT });
    // A build above the committed placeholder, without the full-history count
    // pagesBuild() needs (a CI checkout may be shallow).
    const at = stampStaged(SERVE, { at: committed + 1, sha: "0".repeat(40) });
    console.log(`staged + stamped build ${at} into ${path.relative(ROOT, SERVE)}`);
  }
  if (!STAMPED) return;
  if (!fs.existsSync(path.join(SERVE, "index.html")) || !fs.existsSync(path.join(SERVE, "sw.js"))) {
    console.error(`offline-precache: ${SERVE} is not a staged site (no index.html / sw.js)`);
    process.exit(2);
  }
  if (/\?v=dev"/.test(fs.readFileSync(path.join(SERVE, "index.html"), "utf8"))) {
    console.error(`offline-precache: ${SERVE} is not stamped (its shell still reads ?v=dev); stage it with --stage`);
    process.exit(2);
  }
}

prepareSite().then(() => srv.listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  const base = `http://${HOST}:${port}`;
  const want = Number((execFileSync("node", ["tools/track/verify-track.cjs", TRACK], { encoding: "utf8" })
    .match(/— (\d+) instanced/) || [])[1]);
  console.log(`warm=${WARM} (raced online)   cold=${TRACK} (first touched OFFLINE, Node says ${want})`);
  // Chromium comes from harness.mjs's ladder (CHROME / PW_CHROMIUM / the known
  // paths), never a hard-coded /opt path — tools-runnable.test.mjs pins that,
  // and rtc-e2e died on a Mac for exactly this.
  const exe = (await import("../lib/harness.mjs")).pickChromium();
  const hostArgs = STAMPED ? [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
    `--unsafely-treat-insecure-origin-as-secure=${base}`] : [];
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox", ...hostArgs] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const bad = [];
  let serverDown = false;
  let ref = null;   // the COLD circuit built ONLINE in a separate, SW-blocked context
  try {
    const refCtx = await browser.newContext({ viewport: { width: 640, height: 360 }, serviceWorkers: "block" });
    const pr = await refCtx.newPage();
    await pr.goto(base + "/", { waitUntil: "domcontentloaded" });
    await pr.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 90000 });
    await pr.evaluate((t) => window.__apex.race(t), TRACK);
    await pr.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 180000 });
    ref = await pr.evaluate(() => {
      const tg = window.__apex.trackGraph ? window.__apex.trackGraph() : null;
      return tg && Array.isArray(tg.nodes) ? tg.nodes.length : null;
    });
    await refCtx.close();
    console.log(`reference ${TRACK}: instanced=${ref} online, no service worker (Node ${want})`);
    if (!ref) bad.push(`could not measure ${TRACK} online for the reference`);
    // ---- 1. online: register + let the install precache finish --------------
    const p1 = await ctx.newPage();
    await p1.goto(base + "/", { waitUntil: "domcontentloaded" });
    await p1.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 60000 });
    const installed = await p1.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return { ok: false, why: "no service worker" };
      // The SW marks a finished install with its own sentinel keys. COMPLETE
      // lands after the REQUIRED pool, before the optional pools that carry
      // the scenery closures; SETTLED lands after them. Wait for SETTLED.
      for (let i = 0; i < 360; i++) {
        const names = await caches.keys();
        for (const n of names) {
          const c = await caches.open(n);
          if (await c.match("__apex_install_settled__")) {
            const keys = await c.keys();
            return { ok: true, cache: n, entries: keys.length,
                     scenery: keys.filter((k) => k.url.includes("/js/circuits/scenery/")).length,
                     presets: keys.some((k) => k.url.includes("/js/lighting/presets.js")) };
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return { ok: false, why: "install never settled" };
    });
    console.log("install:", JSON.stringify(installed));
    if (!installed.ok) bad.push("service worker install: " + installed.why);
    else {
      // Derived from disk, so adding a circuit never needs a hand-edited count.
      const sceneryOnDisk = fs.readdirSync(path.join(__dirname, "..", "..", "js", "circuits", "scenery")).filter((f) => f.endsWith(".js")).length;
      if (installed.scenery !== sceneryOnDisk) bad.push(`only ${installed.scenery}/${sceneryOnDisk} scenery files precached`);
      if (!installed.presets) bad.push("js/lighting/presets.js not precached");
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

    // ---- 2. take CONTROL. sw.js's activate handler calls clients.claim(), so
    // the registering page is usually controlled already; the reload makes it
    // certain (activation can land after this point) and is what a returning
    // player does anyway.
    await p1.reload({ waitUntil: "domcontentloaded" });
    const controlled = await p1.evaluate(() => !!navigator.serviceWorker.controller);
    console.log("controlled after reload:", controlled);
    if (!controlled) bad.push("page is not controlled by the service worker after a reload");
    // The agent surface (js/agent/*.js, window.__apex) is LAZY: the install
    // leaves it out and only a CONTROLLED page's own fetch caches it (sw.js's
    // LAZY_AGENT block, js/game.js loadAgentSurface). Closing this page at
    // domcontentloaded, before the boot got there, meant step 3 could never
    // find __apex offline and read a booted game as "did not boot at all".
    // Real players never load it; this harness needs it to measure anything.
    await p1.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 90000 })
      .catch(() => bad.push("__apex never loaded on the controlled page, so it was never cached"));
    // #2194 / #2424: a missing shell-tag entry offline must not make the repair
    // sweep delete the player's apex26-* caches. Delete one essential key, go
    // offline, reload, and the install caches must still be there.
    const repairProbe = await p1.evaluate(async () => {
      const names = (await caches.keys()).filter((n) => n.indexOf("apex26-") === 0);
      if (!names.length) return { ok: false, why: "no apex26-* cache after install" };
      const cache = await caches.open(names[0]);
      const keys = await cache.keys();
      const essential = keys.find((r) => /\/js\/game\.js/.test(r.url));
      if (!essential) return { ok: false, why: "js/game.js not in the precache" };
      await cache.delete(essential);
      return { ok: true, cache: names[0], before: names.length };
    });
    console.log("repair probe setup:", JSON.stringify(repairProbe));
    if (!repairProbe.ok) bad.push("repair probe setup: " + repairProbe.why);
    else {
      await ctx.setOffline(true);
      await p1.reload({ waitUntil: "domcontentloaded" });
      const after = await p1.evaluate(async () => {
        const names = (await caches.keys()).filter((n) => n.indexOf("apex26-") === 0);
        return { count: names.length, names };
      });
      console.log("repair probe offline caches:", JSON.stringify(after));
      await ctx.setOffline(false);
      if (after.count < repairProbe.before) bad.push("offline repair probe deleted apex26-* caches");
      if (!after.names.includes(repairProbe.cache)) bad.push("offline repair probe lost the install cache name");
      await p1.reload({ waitUntil: "domcontentloaded" });
      // The probe took js/game.js out of the install cache, and only this
      // online reload puts it back: sw.js's fetch-miss `remember` hashes the
      // body and cache.put()s it AFTER the page has its bytes. Closing the page
      // at domcontentloaded and killing the server raced that write, so step 3
      // went offline without js/game.js and read "the game did not boot offline
      // at all" (Pages runs #5078 and #5081, 2 of the first 5 on the tip). Wait
      // for the key the probe removed; a restore that never comes is its own
      // failure, not a boot failure.
      const restored = await p1.evaluate(async (name) => {
        const t0 = Date.now();
        for (let i = 0; i < 240; i++) {
          const keys = await (await caches.open(name)).keys();
          if (keys.some((r) => /\/js\/game\.js/.test(r.url))) return { ok: true, ms: Date.now() - t0, polls: i };
          await new Promise((r) => setTimeout(r, 250));
        }
        return { ok: false, ms: Date.now() - t0 };
      }, repairProbe.cache).catch((e) => ({ ok: false, why: String(e.message).slice(0, 80) }));
      console.log("repair probe restore:", JSON.stringify(restored));
      if (!restored.ok) bad.push("js/game.js did not return to the precache after the online reload");
    }
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
    console.log(`offline ${TRACK}: instanced=${got.instanced} (Node ${want})  TrackScenery=${got.hasScenery}  LightPresets=${got.presets}  pageErrors=${errs.length}${errs.length ? " [" + errs.join(" | ") + "]" : ""}`);
    // COLD circuit offline vs the same circuit online: a bare build loses most
    // of its props, so this is a large, unambiguous gap, not a judgement call.
    if (got.instanced !== ref) bad.push(`OFFLINE BARE BUILD: ${TRACK} ${got.instanced} instanced offline vs ${ref} online`);
    if (!got.hasScenery) bad.push("window.TrackScenery empty offline — the closure never arrived");
    if (!got.presets) bad.push("window.LightPresets empty offline");
  } finally { await browser.close().catch(() => {}); if (!serverDown) srv.close(); }
  for (const b of bad) console.error("FAIL: " + b);
  console.log(bad.length ? `\n${bad.length} FAILURE(S)` : "\nOFFLINE OK — lazy payloads survive a cold offline race");
  process.exit(bad.length ? 1 : 0);
}));
