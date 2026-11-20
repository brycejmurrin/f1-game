// @ts-check
// STALL DIAGNOSTICS (#5599, #5542): when a boot or a Playwright route call runs
// past a few seconds, record what the browser was doing, so the next occurrence
// names its step instead of leaving a bare timeout.
//
// Evidence only. Nothing here changes a wait, a deadline, a retry or the page's
// behaviour: the init script reads timings and polls one global; the Node side
// listens to events it never answers. A fast boot attaches nothing.
//
// Output: an attachment `stall-diag-<label>` (JSON) and one annotation of type
// `stall-diag` whose description is a single line; live-reporter.js echoes that
// line into the job log, pass or fail.

export const STALL_ANNOTATION = "stall-diag";
const EVAL_CAP_MS = 3000;

// Per worker process: what this browser ran before, so "earlier tests in the
// same worker" is a recorded fact, not an inference from the report order.
const worker = { boots: 0, lastTitle: /** @type {string|null} */ (null) };

/** Page-side probes, installed before any page script runs. */
function pageProbe() {
  const w = /** @type {any} */ (window);
  if (w.__stallDiag) return;
  const d = w.__stallDiag = { dcl: null, load: null, apexNull: null, apexSet: null, apexRace: null, maxTickGap: 0, long: [] };
  document.addEventListener("DOMContentLoaded", () => { d.dcl = Math.round(performance.now()); }, { once: true });
  addEventListener("load", () => { d.load = Math.round(performance.now()); }, { once: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (d.long.length < 24) d.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: "longtask" });
  } catch (_) { d.long = null; }
  // game.js assigns `window.__apex = null` as the LAST statement of its module
  // body (after `await rendererBoot.start()` and Director.create), then fills it
  // after bootAgentSurface: null marks "game.js body done", an object "surface up".
  // The tick gap says whether the main thread was blocked or merely idle.
  let last = performance.now();
  const iv = setInterval(() => {
    const now = performance.now();
    d.maxTickGap = Math.max(d.maxTickGap, Math.round(now - last)); last = now;
    if ("__apex" in w && d.apexNull == null) d.apexNull = Math.round(now);
    if (w.__apex && d.apexSet == null) d.apexSet = Math.round(now);
    if (w.__apex && w.__apex.race) { d.apexRace = Math.round(now); clearInterval(iv); }
    if (now > 300000) clearInterval(iv);
  }, 100);
}

/** One bounded read of the page. A blocked renderer answers `{ unanswered }`. */
async function pageSnapshot(page) {
  const read = page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    const nav = /** @type {any} */ (performance.getEntriesByType("navigation")[0]);
    const scripts = performance.getEntriesByType("resource")
      .filter((e) => /** @type {any} */ (e).initiatorType === "script")
      .map((e) => [new URL(e.name).pathname, Math.round(e.startTime), Math.round(/** @type {any} */ (e).responseEnd)]);
    const keep = scripts.filter((s) => /\/(game|renderer-boot|gfx)\.js$|\/glx\/|\/three\//.test(String(s[0])));
    const latest = scripts.slice().sort((a, b) => Number(b[2]) - Number(a[2])).slice(0, 6);
    let sw = "unsupported";
    if (navigator.serviceWorker) {
      const c = navigator.serviceWorker.controller;
      const regs = await Promise.race([
        navigator.serviceWorker.getRegistrations().then((r) => r.map((g) => ({
          active: g.active && g.active.state, waiting: g.waiting && g.waiting.state, installing: g.installing && g.installing.state,
        }))),
        new Promise((res) => setTimeout(() => res("getRegistrations unanswered in 1 s"), 1000)),
      ]).catch((e) => String(e && e.message));
      sw = { controller: c ? c.state : null, regs };
    }
    const line = (r) => `${r.t}ms [${r.ns}] ${r.msg}`.slice(0, 200);
    const recs = (w.Log && w.Log.records && w.Log.records()) || [];
    return {
      now: Math.round(performance.now()), readyState: document.readyState,
      apex: w.__apex === null ? "null" : w.__apex === undefined ? "undefined" : (w.__apex.race ? "ready" : "object"),
      probe: w.__stallDiag || null,
      nav: nav ? { responseEnd: Math.round(nav.responseEnd), domInteractive: Math.round(nav.domInteractive) } : null,
      scripts: { count: scripts.length, keep, latest }, sw,
      // The ring keeps 500 records, so its HEAD still holds the boot's first
      // lines (renderer-boot's [gfx] watchdog warnings) that a tail drops.
      firstLogT: recs.length ? recs[0].t : null, logCount: recs.length,
      logHead: recs.slice(0, 16).map(line), logTail: recs.slice(-6).map(line),
    };
  });
  let timer;
  const cap = new Promise((res) => { timer = setTimeout(() => res({ unanswered: `page.evaluate gave no answer in ${EVAL_CAP_MS} ms` }), EVAL_CAP_MS); });
  try { return await Promise.race([read.catch((e) => ({ evaluateFailed: String(e && e.message).slice(0, 200) })), cap]); }
  finally { clearTimeout(timer); }
}

/** Node-side census of the browser this page lives in. */
function browserCensus(page) {
  const ctx = page.context(), browser = ctx.browser();
  const others = browser ? browser.contexts().filter((c) => c !== ctx) : [];
  return {
    otherContexts: others.map((c) => ({ pages: c.pages().map((p) => p.url().slice(0, 80)), closed: c.pages().every((p) => p.isClosed()) })),
    pagesInContext: ctx.pages().length,
    serviceWorkers: ctx.serviceWorkers().map((s) => s.url().slice(0, 80)),
  };
}

/** Listen to a page's network and console from now on; never answers anything. */
function recorder(page, t0) {
  const pending = new Map(), consoleTail = [];
  const at = () => Date.now() - t0;
  const req = (r) => pending.set(r, { url: r.url().slice(0, 120), type: r.resourceType(), t: at() });
  const end = (r) => pending.delete(r);
  const con = (m) => { consoleTail.push(`${at()}ms ${m.type()}: ${m.text().slice(0, 200)}`); if (consoleTail.length > 15) consoleTail.shift(); };
  let navigatedAt = null;
  const nav = (f) => { if (f === page.mainFrame() && navigatedAt == null) navigatedAt = at(); };
  page.on("request", req); page.on("requestfinished", end); page.on("requestfailed", end);
  page.on("console", con); page.on("framenavigated", nav);
  return {
    read: () => ({ navigatedAt, pending: [...pending.values()].map((p) => ({ ...p, age: at() - p.t })), consoleTail: consoleTail.slice() }),
    stop: () => {
      page.off("request", req); page.off("requestfinished", end); page.off("requestfailed", end);
      page.off("console", con); page.off("framenavigated", nav);
    },
  };
}

const s1 = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);

/** The one job-log line: each boot milestone, then what points at a cause. */
export function bootSummary(label, elapsed, diag) {
  const snap = diag.final && !diag.final.unanswered && !diag.final.evaluateFailed ? diag.final : diag.slow || {};
  const p = snap.probe || {};
  const long = Array.isArray(p.long) && p.long.length ? p.long.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  const sw = snap.sw && typeof snap.sw === "object" ? `ctl=${snap.sw.controller ?? "none"} regs=${Array.isArray(snap.sw.regs) ? snap.sw.regs.length : snap.sw.regs}` : String(snap.sw ?? "?");
  const pend = diag.network.pending;
  return `${STALL_ANNOTATION} ${label} ${s1(elapsed)}${diag.error ? " FAILED" : ""}: nav ${s1(diag.network.navigatedAt)}`
    + ` dcl ${s1(p.dcl)} first-log ${s1(snap.firstLogT)} game.js-done ${s1(p.apexNull)} __apex ${s1(p.apexSet)} race ${s1(p.apexRace)}`
    + ` | longest task ${long ? `${s1(long[1])}@${s1(long[0])}` : "none"} tick-gap ${s1(p.maxTickGap)}`
    + ` | pending ${pend.length}${pend.length ? ` (${pend.slice(0, 2).map((r) => `${r.url.replace(/^https?:\/\/[^/]+/, "")} ${s1(r.age)}`).join(", ")})` : ""}`
    + ` | sw ${sw} | other contexts ${diag.census.otherContexts.length}`
    + ` | worker boot #${diag.worker.boots}${diag.worker.lastTitle ? ` after "${diag.worker.lastTitle.slice(0, 60)}"` : ""}`
    + (diag.final && diag.final.unanswered ? " | page unanswered" : "");
}

/**
 * Arm before `page.goto`. Returns `done(error?)`, to call when the boot wait
 * settles. Under `slowMs` with no error it records nothing.
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 */
export async function watchBoot(page, testInfo, { label = "boot", slowMs = 8000 } = {}) {
  await page.addInitScript(pageProbe);
  const t0 = Date.now();
  worker.boots++;
  const diag = { label, worker: { ...worker }, census: browserCensus(page), slow: null, final: null, network: null, error: null };
  worker.lastTitle = testInfo.title;
  const rec = recorder(page, t0);
  // Snapshot at the threshold too: a renderer that stalls may not answer later.
  const slowTimer = setTimeout(() => { void pageSnapshot(page).then((s) => { diag.slow = { at: Date.now() - t0, ...s }; }); }, slowMs);
  return async function done(error) {
    clearTimeout(slowTimer);
    const elapsed = Date.now() - t0;
    try {
      if (elapsed < slowMs && !error) return;
      diag.error = error ? String(error.message || error).split("\n")[0].slice(0, 300) : null;
      if (!page.isClosed()) diag.final = { at: Date.now() - t0, ...(await pageSnapshot(page)) };
      diag.network = rec.read();
      diag.census = { atStart: diag.census, atEnd: page.isClosed() ? null : browserCensus(page) };
      const census = diag.census;
      const line = bootSummary(label, elapsed, { ...diag, census: census.atStart });
      testInfo.annotations.push({ type: STALL_ANNOTATION, description: line });
      await testInfo.attach(`${STALL_ANNOTATION}-${label}`, { body: JSON.stringify({ elapsed, ...diag }, null, 2), contentType: "application/json" });
    } catch (_) { /* evidence is best-effort; never the test's failure */ }
    finally { rec.stop(); }
  };
}

/**
 * For installFaultSchedule's `onSlowCall`: one annotation line and an
 * attachment while the call is still pending (a teardown can drop later work).
 * @param {import("@playwright/test").TestInfo} testInfo
 */
export function routeStallReporter(testInfo, page) {
  return (info) => {
    const census = page && !page.isClosed() ? browserCensus(page) : null;
    const line = `${STALL_ANNOTATION} context.${info.op} still pending after ${s1(info.pendingMs)}`
      + ` | events ${info.events.map((e) => `${e.state}@${s1(e.t)}`).join(" ") || "none"}`
      + (census ? ` | pages ${census.pagesInContext} other contexts ${census.otherContexts.length}` : "")
      + ` | worker boot #${worker.boots}${worker.lastTitle ? ` after "${worker.lastTitle.slice(0, 60)}"` : ""}`;
    testInfo.annotations.push({ type: STALL_ANNOTATION, description: line });
    // Does the renderer still answer while the call hangs? An unanswered page points at a blocked
    // renderer main thread (e.g. a synchronous GPU call); an answering one at the browser side.
    const page$ = page && !page.isClosed() ? pageSnapshot(page) : Promise.resolve(null);
    void page$.then((snap) => testInfo.attach(`${STALL_ANNOTATION}-${info.op}`, {
      body: JSON.stringify({ ...info, census, page: snap }, null, 2), contentType: "application/json" })).catch(() => {});
  };
}
