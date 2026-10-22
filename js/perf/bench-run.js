/* Apex 26 — BenchRun: SETTINGS > METRICS > BENCHMARK, a hands-free device benchmark with a results file.

   Pick a test, tap RUN, put the phone down. Each LEG reloads the page onto the three.js path it measures (THREE PATH:
   WEBGPU / WEBGL2 is only chosen at boot), seeds the sim (SEED), runs GPU TEST (js/perf/gpu-test-run.js: a dry Monza
   on the helmet camera, driven by SoakRun, through the default / s50 / s75 / s100 / mirrorOff / again phases) and
   times race entry twice: COLD is the first race after the reload, WARM a second start right after. The plan lives in
   localStorage under KEY so it survives every reload; when the last leg ends the player's own renderer settings come
   back, the page reloads once more if they changed, and this page reopens on the results with SAVE FILE and COPY.

   A leg the page never finished (iOS killed the tab, a WebGPU device loss reloaded it) reads as state "running" on
   the next boot: it is recorded as "reloaded" and the run moves on, so a crash is a result, not a loop. A leg that
   ends early (page hidden, soak refused) stops the run with what it has. Nothing here runs until RUN: idle, the
   module only mounts a button and, after a reload it started, resumes its own plan. */
const BenchRun = (function () {
  "use strict";

  const KEY = "apex26.benchRun";
  const SCHEMA = "apex26.bench/1";
  const SEED = 42;
  const TESTS = [
    { id: "paths", label: "WEBGPU vs WEBGL2", legs: ["webgpu", "webgl2", "webgl2", "webgpu"],
      help: "three.js on both paths, alternating: WebGPU, WebGL2, WebGL2, WebGPU. The game reloads between legs. About 14 min." },
    { id: "current", label: "THIS PATH", legs: [null],
      help: "GPU TEST once on the renderer you have now, plus race entry. About 4 min." },
  ];
  const READY_MS = 60000, COLD_MS = 300000, WARM_MS = 60000;

  let _G = null, _ui = null, _pick = "paths", _busy = false;
  const r2 = (n) => (n != null && Number.isFinite(+n) ? Math.round(+n * 100) / 100 : null);
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  function log(msg) { try { Log.info("game", "BenchRun " + msg); } catch (_) { /* Log not loaded */ } }
  function store() { return typeof GameStore !== "undefined" && GameStore.store ? GameStore.store : null; }
  function load() { try { const s = store(); const t = s ? s.raw(KEY) : localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (_) { return null; } }
  function save(p) { try { const t = JSON.stringify(p); const s = store(); if (s) s.rawSet(KEY, t); else localStorage.setItem(KEY, t); } catch (_) { /* blocked storage: the run cannot cross a reload */ } }
  function clear() { try { const s = store(); if (s) s.rawDel(KEY); else localStorage.removeItem(KEY); } catch (_) { /* blocked storage */ } }

  // ---- pure: tests/unit/bench-run.test.mjs --------------------------------------------------------------------
  function median(a) {
    const v = a.filter((x) => x != null && Number.isFinite(+x)).map(Number).sort((x, y) => x - y);
    if (!v.length) return null;
    const m = v.length >> 1;
    return r2(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
  }
  // Per path: the median over its finished legs of every phase's p50/p95, the fill slope, mirror cost and entry times.
  function summarize(legs) {
    const out = {};
    for (const leg of legs || []) {
      if (!leg || leg.state !== "done" || !leg.gpuTest) continue;
      const k = leg.api || leg.path || "current";
      const o = out[k] || (out[k] = { legs: 0, phases: {}, fill: [], mirrorMs: [], coldMs: [], warmMs: [], links: 0, pipes: 0, gpuTimer: false });
      o.legs++;
      for (const ph of leg.gpuTest.phases || []) {
        const p = o.phases[ph.id] || (o.phases[ph.id] = { p50: [], p95: [], fps: [] });
        p.p50.push(ph.p50); p.p95.push(ph.p95); p.fps.push(ph.fps);
        o.links += ph.links || 0; o.pipes += ph.pipes || 0;
      }
      o.fill.push(leg.gpuTest.fill ? leg.gpuTest.fill.msPerFullFrame : null);
      o.mirrorMs.push(leg.gpuTest.mirrorMs);
      o.coldMs.push(leg.entry && leg.entry.cold ? leg.entry.cold.goMs : null);
      o.warmMs.push(leg.entry && leg.entry.warm ? leg.entry.warm.goMs : null);
      o.gpuTimer = o.gpuTimer || !!(leg.gpuTest.gpuTimer && leg.gpuTest.gpuTimer.supported);
    }
    for (const o of Object.values(out)) {
      for (const id of Object.keys(o.phases)) { const p = o.phases[id]; o.phases[id] = { p50: median(p.p50), p95: median(p.p95), fps: median(p.fps), n: p.p50.length }; }
      o.fill = median(o.fill); o.mirrorMs = median(o.mirrorMs); o.coldMs = median(o.coldMs); o.warmMs = median(o.warmMs);
    }
    return out;
  }
  function newPlan(testId, prefs) {
    const t = TESTS.find((x) => x.id === testId) || TESTS[0];
    return { schema: SCHEMA, test: t.id, seed: SEED, state: "running", i: 0, startedAt: new Date().toISOString(), finishedAt: null,
      prefs, show: false, facts: null, legs: t.legs.map((path) => ({ path, state: "pending" })) };
  }

  // ---- renderer path ------------------------------------------------------------------------------------------
  const RP = () => (typeof RendererPicker !== "undefined" ? RendererPicker : null);
  function readPrefs() {
    const s = store();
    return { backend: s ? s.raw("apex26.gfxBackend") : null, threePath: s ? s.raw("apex26.tlxForceGL") : null };
  }
  function writePrefs(p) {
    const s = store(); if (!s) return;
    for (const [k, v] of [["apex26.gfxBackend", p.backend], ["apex26.tlxForceGL", p.threePath]]) { if (v == null) s.rawDel(k); else s.rawSet(k, v); }
    try { for (const k of (RP() && RP().RENDERER_SS_KEYS) || []) sessionStorage.removeItem(k); } catch (_) { /* private mode */ }
  }
  // Point the next boot at three.js on `path` ("webgpu" | "webgl2"); null keeps whatever the player has.
  function pathPrefs(path, base) { return path ? { backend: "three", threePath: path === "webgl2" ? "1" : "0" } : base; }
  function liveApi() { try { return (RP() && RP().liveThreeApi()) || (RP() && RP().liveBackend()) || null; } catch (_) { return null; } }

  // ---- the run --------------------------------------------------------------------------------------------------
  function stillRunning() { const p = load(); return !!(p && p.state === "running"); }
  function reload() { log("reload"); try { location.reload(); } catch (_) { /* no location */ } }
  function startLeg(plan) {
    const leg = plan.legs[plan.i];
    writePrefs(pathPrefs(leg.path, plan.prefs));
    leg.state = "booting"; save(plan); reload();
  }
  async function waitReady() {
    const t0 = now();
    while (now() - t0 < READY_MS) {
      if (_G && _G.state === "menu" && typeof GpuTestRun !== "undefined" && typeof SoakRun !== "undefined" && liveApi()) return true;
      await sleep(500);
    }
    return false;
  }
  // Start a race through `fn` and time it: buildMs = until the start promise settles, goMs = until state "race".
  async function timedEntry(fn, limitMs) {
    const t0 = now(); let buildMs = null;
    const ok = await Promise.resolve(fn()).then((v) => { buildMs = r2(now() - t0); return v; }, () => false);
    if (!ok) return { ok: false, buildMs };
    while (now() - t0 < limitMs && !(_G && _G.state === "race")) await sleep(50);
    return { ok: _G && _G.state === "race", buildMs, goMs: _G && _G.state === "race" ? r2(now() - t0) : null };
  }
  async function runLeg(plan) {
    const leg = plan.legs[plan.i];
    if (!(await waitReady())) { leg.state = "failed"; leg.reason = "game not ready after reload"; return false; }
    leg.api = liveApi();
    try { leg.engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { leg.engine = null; }
    try { leg.fallbackWhy = sessionStorage.getItem("apex26.gfxFallbackWhy"); } catch (_) { leg.fallbackWhy = null; }
    if (!plan.facts) try { plan.facts = PhoneRecorder.liveEnv().facts(); } catch (_) { plan.facts = null; }
    leg.state = "running"; save(plan);
    let result = null;
    const done = new Promise((res) => { leg._res = res; });
    _G.seed = plan.seed;
    const cold = await timedEntry(() => GpuTestRun.start({ onDone: (r) => { result = r; leg._res(); } }), COLD_MS);
    if (!cold.ok) { leg.state = "failed"; leg.reason = "GPU TEST could not start"; leg.entry = { cold }; return false; }
    await done;
    if (!stillRunning()) return "aborted";   // STOP BENCHMARK ended the plan under this leg
    leg.gpuTest = result;
    // WARM: the same race again in this page. SoakRun's finish paused the game; unpause, start, time, stop.
    try { const b = document.getElementById("pausebtn"); if (_G.paused && b) b.click(); } catch (_) { /* pause is a courtesy */ }
    _G.seed = plan.seed;
    const warm = await timedEntry(() => SoakRun.start({ minutes: 0.2, weather: "dry", cam: "helmet" }), WARM_MS);
    try { if (SoakRun.active()) SoakRun.stop("bench-warm"); } catch (_) { /* soak gone */ }
    leg.entry = { cold, warm };
    leg.state = result && result.reason === "complete" ? "done" : "failed";
    if (leg.state === "failed") leg.reason = "GPU TEST ended: " + (result ? result.reason : "no result");
    delete leg._res;
    return leg.state === "done";
  }
  function finishPlan(plan, state) {
    plan.state = state; plan.finishedAt = new Date().toISOString(); plan.show = true;
    plan.summary = summarize(plan.legs);
    const changed = JSON.stringify(readPrefs()) !== JSON.stringify(plan.prefs);
    writePrefs(plan.prefs); save(plan);
    log("done " + state);
    if (changed) reload(); else open();
  }
  async function resume() {
    const plan = load();
    if (!plan || plan.schema !== SCHEMA) return;
    if (plan.state !== "running") { if (plan.show) { plan.show = false; save(plan); if (await waitReady()) open(); } return; }
    if (_busy) return; _busy = true;
    const leg = plan.legs[plan.i];
    if (leg && leg.state === "running") { leg.state = "reloaded"; leg.reason = "the page reloaded during this leg"; plan.i++; save(plan); }
    else if (leg && leg.state === "booting") {
      const ok = await runLeg(plan);
      if (ok === "aborted" || !stillRunning()) { _busy = false; return; }
      save(plan);
      if (!ok && leg.state === "failed" && leg.reason !== "the page reloaded during this leg") { finishPlan(plan, "stopped"); return; }
      plan.i++; save(plan);
    }
    if (plan.i >= plan.legs.length) { finishPlan(plan, "complete"); return; }
    startLeg(plan);
  }
  function run(testId) {
    if (load() && load().state === "running") return false;
    const plan = newPlan(testId, readPrefs());
    save(plan); log("start " + plan.test + " " + plan.legs.length + " legs");
    startLeg(plan);
    return true;
  }
  function stop() {
    const plan = load(); if (!plan || plan.state !== "running") return false;
    try { if (typeof GpuTestRun !== "undefined" && GpuTestRun.active()) GpuTestRun.stop(); } catch (_) { /* nothing running */ }
    const leg = plan.legs[plan.i]; if (leg && leg.state !== "done") { leg.state = "stopped"; leg.reason = "stopped by the player"; }
    finishPlan(plan, "stopped");
    return true;
  }

  // ---- results file ----------------------------------------------------------------------------------------------
  function resultText() { const p = load(); return p && p.state !== "running" ? JSON.stringify(p) : ""; }
  function fileName(p) { return "apex26-bench-" + (p.test || "run") + "-" + String(p.finishedAt || p.startedAt || "").replace(/[:.]/g, "-").slice(0, 19) + ".json"; }

  // ---- the page (#bench, index.html) -----------------------------------------------------------------------------
  const doc = () => (typeof document !== "undefined" ? document : null);
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(label, cls, fn) { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); return b; }
  function say(msg) { if (_ui) _ui.status.textContent = msg; }
  function summaryTable(sum) {
    const paths = Object.keys(sum);
    const t = el("table"); t.setAttribute("aria-label", "Benchmark results, median frame time per phase");
    const head = el("tr"); head.appendChild(el("th", null, "PHASE"));
    paths.forEach((k) => head.appendChild(el("th", null, k.toUpperCase() + " p50 / p95 ms")));
    t.appendChild(head);
    const ids = []; paths.forEach((k) => Object.keys(sum[k].phases).forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
    const row = (name, f) => { const tr = el("tr"); tr.appendChild(el("td", null, name)); paths.forEach((k) => tr.appendChild(el("td", null, f(sum[k])))); t.appendChild(tr); };
    ids.forEach((id) => row(id, (o) => { const p = o.phases[id]; return p ? p.p50 + " / " + p.p95 : "–"; }));
    row("fill (ms per full frame)", (o) => String(o.fill));
    row("mirror cost (ms)", (o) => String(o.mirrorMs));
    row("race entry cold / warm (ms)", (o) => o.coldMs + " / " + o.warmMs);
    row("shader links / pipelines mid-race", (o) => o.links + " / " + o.pipes);
    row("GPU timer", (o) => (o.gpuTimer ? "yes" : "no"));
    row("legs", (o) => String(o.legs));
    return t;
  }
  function paint() {
    if (!_ui) return;
    const plan = load(), body = _ui.body;
    body.textContent = "";
    body.appendChild(_ui.status);
    if (plan && plan.state === "running") {
      const leg = plan.legs[plan.i] || {};
      body.appendChild(el("p", "adv-help", "Running " + plan.test + ": leg " + (plan.i + 1) + " of " + plan.legs.length + (leg.path ? " (" + leg.path.toUpperCase() + ")" : "") + ". Leave the phone alone; this page comes back with the results."));
      body.appendChild(btn("STOP BENCHMARK", "bigbtn alt", () => { stop(); paint(); }));
      return;
    }
    const pick = el("div", "balanced-row"); pick.setAttribute("role", "group"); pick.setAttribute("aria-label", "Test");
    TESTS.forEach((t) => { const b = btn(t.label, "sel-chip", () => { _pick = t.id; paint(); }); b.setAttribute("aria-pressed", t.id === _pick ? "true" : "false"); pick.appendChild(b); });
    body.appendChild(pick);
    body.appendChild(el("p", "adv-help", (TESTS.find((t) => t.id === _pick) || TESTS[0]).help));
    body.appendChild(el("p", "adv-help", "Before RUN: Low Power Mode off, phone cool, Auto-Lock set to Never (Settings › Display & Brightness). Keep the game in front until the results show."));
    body.appendChild(btn("RUN", "bigbtn", () => { if (run(_pick)) say("starting…"); }));
    if (plan && plan.summary) {
      body.appendChild(el("p", "adv-help", "Last run: " + plan.test + " · " + plan.state + " · " + String(plan.finishedAt || "").slice(0, 16).replace("T", " ") + " UTC"));
      const wrap = el("div"); wrap.style.overflowX = "auto"; wrap.appendChild(summaryTable(plan.summary)); body.appendChild(wrap);
      plan.legs.forEach((l, i) => { if (l.state !== "done") body.appendChild(el("p", "adv-help", "Leg " + (i + 1) + " " + (l.path || "") + ": " + l.state + (l.reason ? " (" + l.reason + ")" : ""))); });
      const row = el("div", "balanced-row");
      row.appendChild(btn("SAVE FILE", "bigbtn", () => { const p = load(); PhoneRecorder.share(resultText(), fileName(p)).then((res) => {
        if (res.how === "download" && res.url) { const a = el("a", null, "DOWNLOAD " + res.name); a.href = res.url; a.download = res.name; _ui.status.textContent = ""; _ui.status.appendChild(a); }
        else say(res.how === "share" ? "saved" : res.how === "cancelled" ? "cancelled" : "cannot save here: use COPY"); }); }));
      row.appendChild(btn("COPY", "bigbtn alt", () => PhoneRecorder.copy(resultText()).then((ok) => say(ok ? "copied" : "copy blocked: use SAVE FILE"))));
      row.appendChild(btn("CLEAR", "bigbtn alt", () => { clear(); paint(); }));
      body.appendChild(row);
    }
  }
  function open() {
    const d = (doc() && doc().getElementById("bench")); if (!d) return false;
    if (!_ui) { const body = doc().getElementById("bench-body"); _ui = { body, status: el("p", "adv-help") }; _ui.status.setAttribute("role", "status"); }
    d.hidden = false; paint();
    return true;
  }
  function close() { const d = (doc() && doc().getElementById("bench")); if (d) d.hidden = true; const b = (doc() && doc().getElementById("pm-bench-open")); if (b && b.focus) b.focus(); }
  function mount() {
    if (typeof document === "undefined") return false;
    const back = (doc() && doc().getElementById("bench-back")); if (back && !back.__bench) { back.__bench = true; back.addEventListener("click", close); }
    if ((doc() && doc().getElementById("pm-bench-open"))) return true;
    const host = document.querySelector("#pm-metrics-details .pm-metrics-sub-body");
    if (!host) return false;
    const b = btn("BENCHMARK…", null, open); b.id = "pm-bench-open";
    host.insertBefore(b, host.firstChild);
    return true;
  }

  return {
    KEY, SCHEMA, SEED, TESTS, median, summarize, newPlan, pathPrefs,
    create(G) {
      _G = G;
      if (typeof setTimeout === "function") [400, 1200, 2500, 5000].forEach((ms) => setTimeout(mount, ms));
      if (typeof setTimeout === "function") setTimeout(() => { resume().catch((e) => log("resume failed " + (e && e.message))); }, 0);
      return this;
    },
    run, stop, open, close, active: stillRunning, result: resultText,
  };
})();

Object.freeze(BenchRun);
