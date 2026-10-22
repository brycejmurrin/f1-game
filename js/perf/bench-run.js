/* Apex 26 — BenchRun: SETTINGS > GRAPHICS > BENCHMARK, a hands-free device benchmark with a results file.

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
  const gpu = (path) => ({ kind: "gpu", path, label: path ? "GPU TEST " + path.toUpperCase() : "GPU TEST" });
  const race = (track, weather, tod, label) => ({ kind: "race", path: null, track, weather, tod, label });
  const TESTS = [
    { id: "paths", label: "WEBGPU vs WEBGL2", legs: [gpu("webgpu"), gpu("webgl2"), gpu("webgl2"), gpu("webgpu")],
      help: "three.js on both paths, alternating: WebGPU, WebGL2, WebGL2, WebGPU. The game reloads between legs. About 14 min." },
    { id: "current", label: "THIS PATH", legs: [gpu(null)],
      help: "GPU TEST once on the renderer you have now, plus race entry. About 4 min." },
    { id: "races", label: "WEATHER & TRACKS", legs: [race("monza", "dry", "default", "Monza dry"), race("monza", "rain", "default", "Monza rain"),
      race("monza", "dry", "night", "Monza night"), race("singapore", "dry", "night", "Singapore night"), race("spa", "rain", "default", "Spa rain"),
      race("monaco", "dry", "default", "Monaco dry")],
      help: "Six races on the renderer you have now: Monza dry, rain and night, Singapore night, Spa rain, Monaco. Each one reloads, starts cold and is timed for 25 s. About 8 min." },
    { id: "garage", label: "GARAGE", legs: [{ kind: "garage", path: null, label: "Garage" }],
      help: "Opens the GARAGE, steps through every tab, tries four liveries and spins the car, timing each step. Your garage choices are put back afterwards. About 3 min." },
  ];
  const READY_MS = 60000, COLD_MS = 300000, WARM_MS = 60000, RACE_MS = 20000, SETTLE_MS = 5000;

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
  // Race and garage legs as flat rows: one per race, one per garage step. Unfinished legs keep a row with their state.
  function scenes(legs) {
    const rows = [];
    for (const leg of legs || []) {
      if (!leg || (leg.kind !== "race" && leg.kind !== "garage")) continue;
      if (leg.state !== "done") { rows.push({ label: leg.label, state: leg.state, reason: leg.reason || null }); continue; }
      const coldMs = leg.entry && leg.entry.cold ? leg.entry.cold.goMs : null;
      for (const st of leg.steps || []) {
        rows.push({ label: leg.kind === "garage" ? leg.label + " · " + st.id : leg.label, state: "done",
          p50: st.p50, p95: st.p95, p99: st.p99, fps: st.fps, links: st.links, pipes: st.pipes, coldMs });
      }
    }
    return rows;
  }
  function newPlan(testId, prefs) {
    const t = TESTS.find((x) => x.id === testId) || TESTS[0];
    return { schema: SCHEMA, test: t.id, seed: SEED, state: "running", i: 0, startedAt: new Date().toISOString(), finishedAt: null,
      prefs, show: false, facts: null, legs: t.legs.map((l) => Object.assign({}, l, { state: "pending" })) };
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
    if (leg.kind === "race") return raceLeg(plan, leg);
    if (leg.kind === "garage") return garageLeg(plan, leg);
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
  // rAF intervals over `ms` after `settleMs`, with program links / pipelines counted inside the window (GPU TEST's stats).
  async function measure(ms, settleMs) {
    await sleep(settleMs);
    const counts = { links: 0, pipes: 0 }, unhook = GpuTestRun.hookCounts(counts), d = [];
    let prev = 0, on = true;
    const tick = (ts) => { if (!on) return; if (prev) d.push(ts - prev); prev = ts; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await sleep(ms);
    on = false; unhook();
    return GpuTestRun.phaseStats(d, [], counts);
  }
  async function until(f, ms) { const t0 = now(); while (now() - t0 < ms) { try { if (f()) return true; } catch (_) { /* not yet */ } await sleep(100); } return false; }
  async function raceLeg(plan, leg) {
    _G.seed = plan.seed;
    const cold = await timedEntry(() => SoakRun.start({ track: leg.track, weather: leg.weather, tod: leg.tod, minutes: 2, cam: "helmet" }), COLD_MS);
    leg.entry = { cold };
    if (!cold.ok) { leg.state = "failed"; leg.reason = "race could not start"; return false; }
    const st = await measure(RACE_MS, SETTLE_MS);
    const alive = SoakRun.active(), why = alive ? null : (SoakRun.status() || {}).reason;
    try { if (alive) SoakRun.stop("bench"); } catch (_) { /* soak gone */ }
    if (!stillRunning()) return "aborted";
    if (!alive) { leg.state = "failed"; leg.reason = "race ended early: " + why; return false; }
    leg.steps = [Object.assign({ id: "race" }, st)];
    leg.state = "done";
    return true;
  }
  // Every apex26.* key but the plan: the garage run clicks real controls (a livery pick saves), so it puts them all back.
  function snapshot() {
    const o = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("apex26.") === 0 && k !== KEY) o[k] = localStorage.getItem(k); } } catch (_) { /* blocked storage */ }
    return o;
  }
  // Through GameStore.write, not localStorage: livery / parts / setup keys are mirrored to IndexedDB (store.js
  // AUTHORED_KEY) and a key localStorage lacks is written back from that mirror at boot, so a bare removeItem came
  // back on the next load. write() queues the mirror delete too; mirrorFlush() commits it before the reload.
  async function restore(snap) {
    const S = store(), short = (k) => k.slice("apex26.".length);
    try {
      const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const k of keys) {
        if (!k || k.indexOf("apex26.") !== 0 || k === KEY || k in snap) continue;
        if (S) S.write(short(k), undefined); else localStorage.removeItem(k);
      }
      for (const k of Object.keys(snap)) {
        if (localStorage.getItem(k) === snap[k]) continue;
        let v, json = false; try { v = JSON.parse(snap[k]); json = JSON.stringify(v) === snap[k]; } catch (_) { json = false; }
        if (S && json) S.write(short(k), v); else localStorage.setItem(k, snap[k]);
      }
    } catch (_) { /* blocked storage */ }
    try { if (S && S.mirrorFlush) await S.mirrorFlush(); } catch (_) { /* no mirror: localStorage is the whole store */ }
  }
  async function garageLeg(plan, leg) {
    const D = document;
    plan.restore = snapshot(); save(plan);
    const t0 = now(), open = D.getElementById("mb-garage");
    if (!open) { leg.state = "failed"; leg.reason = "no GARAGE button"; return false; }
    open.click();
    const ok = await until(() => { const cs = D.getElementById("carsetup"); return cs && !cs.hidden && !cs.hasAttribute("aria-busy") && D.querySelector('#cs-tabs [role="tab"]'); }, 60000);
    leg.entry = { cold: { ok, goMs: ok ? r2(now() - t0) : null } };
    if (!ok) { leg.state = "failed"; leg.reason = "the garage did not open"; return false; }
    const skip = D.getElementById("cs-arrival-skip");
    if (skip && skip.offsetParent) skip.click();
    const steps = [Object.assign({ id: "idle" }, await measure(5000, 2000))];
    const tabs = () => Array.from(D.querySelectorAll('#cs-tabs [role="tab"]')).filter((b) => !b.disabled && b.offsetParent);
    const name = (b) => String(b.id || "").replace(/^cs-tab-/, "") || String(b.textContent || "").trim().toLowerCase();   // setup-sheet.js csTabId
    for (const id of tabs().map(name)) {
      const b = tabs().find((x) => name(x) === id); if (!b) continue;
      b.click(); steps.push(Object.assign({ id: "tab " + id }, await measure(2500, 800)));
      if (!stillRunning()) return "aborted";
    }
    const liv = tabs().find((b) => name(b) === "livery");
    if (liv) {
      liv.click(); await sleep(800);
      const opts = Array.from(D.querySelectorAll("#cs-options .cs-liv:not(.cs-liv-create)")).filter((b) => b.offsetParent).slice(0, 4);
      for (let i = 0; i < opts.length; i++) { opts[i].click(); steps.push(Object.assign({ id: "livery " + (i + 1) }, await measure(2500, 1000))); }
    }
    const spin = D.getElementById("cs-view-spin");
    if (spin) { spin.click(); steps.push(Object.assign({ id: "spin" }, await measure(8000, 1000))); spin.click(); }
    const back = D.getElementById("cs-back"); if (back) back.click();
    leg.steps = steps; leg.state = "done";
    return true;
  }
  async function finishPlan(plan, state) {
    plan.state = state; plan.finishedAt = new Date().toISOString(); plan.show = true;
    plan.summary = summarize(plan.legs); plan.scenes = scenes(plan.legs);
    if (plan.restore) { await restore(plan.restore); plan.restoreAfter = plan.restore; delete plan.restore; }
    writePrefs(plan.prefs); save(plan);
    log("done " + state);
    // Always reload: the results open over a fresh title screen, never over the paused race the last leg left.
    reload();
  }
  async function resume() {
    const plan = load();
    if (!plan || plan.schema !== SCHEMA) return;
    if (plan.state !== "running") {
      // A page that saved the garage on its way out could have written the run's picks back: check once, after the reload.
      if (plan.restoreAfter) {
        const snap = plan.restoreAfter; delete plan.restoreAfter; save(plan);
        if (JSON.stringify(snapshot()) !== JSON.stringify(snap)) { await restore(snap); reload(); return; }
      }
      if (plan.show) { plan.show = false; save(plan); if (await waitReady()) open(); }
      return;
    }
    if (_busy) return; _busy = true;
    const leg = plan.legs[plan.i];
    if (plan.restore && !(leg && leg.state === "booting")) { await restore(plan.restore); delete plan.restore; }
    if (leg && leg.state === "running") { leg.state = "reloaded"; leg.reason = "the page reloaded during this leg"; plan.i++; save(plan); }
    else if (leg && leg.state === "booting") {
      const ok = await runLeg(plan);
      if (ok === "aborted" || !stillRunning()) { _busy = false; return; }
      save(plan);
      if (!ok && leg.state === "failed" && leg.reason !== "the page reloaded during this leg") { await finishPlan(plan, "stopped"); return; }
      plan.i++; save(plan);
    }
    if (plan.i >= plan.legs.length) { await finishPlan(plan, "complete"); return; }
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
  function scenesTable(rows) {
    const t = el("table"); t.setAttribute("aria-label", "Benchmark results per race and garage step");
    const head = el("tr"); ["SCENE", "p50 / p95 / p99 ms", "fps", "links / pipelines", "entry ms"].forEach((h) => head.appendChild(el("th", null, h))); t.appendChild(head);
    rows.forEach((r) => {
      const tr = el("tr"); tr.appendChild(el("td", null, r.label));
      if (r.state !== "done") { const td = el("td", null, r.state + (r.reason ? " (" + r.reason + ")" : "")); td.colSpan = 4; tr.appendChild(td); }
      else [r.p50 + " / " + r.p95 + " / " + r.p99, String(r.fps), r.links + " / " + r.pipes, String(r.coldMs)].forEach((v) => tr.appendChild(el("td", null, v)));
      t.appendChild(tr);
    });
    return t;
  }
  function paint() {
    if (!_ui) return;
    const plan = load(), body = _ui.body;
    body.textContent = "";
    body.appendChild(_ui.status);
    if (plan && plan.state === "running") {
      const leg = plan.legs[plan.i] || {};
      body.appendChild(el("p", "adv-help", "Running " + plan.test + ": leg " + (plan.i + 1) + " of " + plan.legs.length + (leg.label ? " (" + leg.label + ")" : "") + ". Leave the phone alone; this page comes back with the results."));
      body.appendChild(btn("STOP BENCHMARK", "bigbtn alt", () => { stop(); paint(); }));
      return;
    }
    const hasSum = !!(plan && plan.summary && Object.keys(plan.summary).length), hasScenes = !!(plan && plan.scenes && plan.scenes.length);
    if (hasSum || hasScenes) {
      body.appendChild(el("p", "adv-help", "Last run: " + plan.test + " · " + plan.state + " · " + String(plan.finishedAt || "").slice(0, 16).replace("T", " ") + " UTC"));
      if (hasSum) { const wrap = el("div"); wrap.style.overflowX = "auto"; wrap.appendChild(summaryTable(plan.summary)); body.appendChild(wrap); }
      if (hasScenes) { const wrap = el("div"); wrap.style.overflowX = "auto"; wrap.appendChild(scenesTable(plan.scenes)); body.appendChild(wrap); }
      plan.legs.forEach((l, i) => { if (l.state !== "done" && l.kind === "gpu") body.appendChild(el("p", "adv-help", "Leg " + (i + 1) + " " + l.label + ": " + l.state + (l.reason ? " (" + l.reason + ")" : ""))); });
      const row = el("div", "balanced-row");
      row.appendChild(btn("SAVE FILE", "bigbtn", () => { const p = load(); PhoneRecorder.share(resultText(), fileName(p)).then((res) => {
        if (res.how === "download" && res.url) { const a = el("a", null, "DOWNLOAD " + res.name); a.href = res.url; a.download = res.name; _ui.status.textContent = ""; _ui.status.appendChild(a); }
        else say(res.how === "share" ? "saved" : res.how === "cancelled" ? "cancelled" : "cannot save here: use COPY"); }); }));
      row.appendChild(btn("COPY", "bigbtn alt", () => PhoneRecorder.copy(resultText()).then((ok) => say(ok ? "copied" : "copy blocked: use SAVE FILE"))));
      row.appendChild(btn("CLEAR", "bigbtn alt", () => { clear(); paint(); }));
      body.appendChild(row);
    }
    const pick = el("div", "balanced-row"); pick.setAttribute("role", "group"); pick.setAttribute("aria-label", "Test");
    TESTS.forEach((t) => { const on = t.id === _pick; const b = btn(t.label, "sel-chip" + (on ? " active" : ""), () => { _pick = t.id; paint(); }); b.setAttribute("aria-pressed", on ? "true" : "false"); pick.appendChild(b); });
    body.appendChild(pick);
    body.appendChild(el("p", "adv-help", (TESTS.find((t) => t.id === _pick) || TESTS[0]).help));
    body.appendChild(btn("RUN " + (TESTS.find((t) => t.id === _pick) || TESTS[0]).label, "bigbtn", () => { if (run(_pick)) say("starting…"); }));
    body.appendChild(el("p", "adv-help", "Before RUN: Low Power Mode off, phone cool, Auto-Lock set to Never (Settings › Display & Brightness). Keep the game in front until the results show."));
  }
  // BENCHMARK covers the screen it opened from (SETTINGS, or the title after a run) and gives it back on BACK —
  // race-settings.js's openSettingSearch does the same with #pmsettings.
  let _covered = [];
  function open() {
    const d = (doc() && doc().getElementById("bench")); if (!d) return false;
    const p = load(); if (p && p.test && p.state !== "running") _pick = p.test;
    _covered = Array.from(doc().querySelectorAll("#pmsettings:not([hidden]),#overlay:not([hidden])"));
    _covered.forEach((n) => { n.hidden = true; });
    if (!_ui) { const body = doc().getElementById("bench-body"); _ui = { body, status: el("p", "adv-help") }; _ui.status.setAttribute("role", "status"); }
    d.hidden = false; paint();
    return true;
  }
  function close() { const d = (doc() && doc().getElementById("bench")); if (d) d.hidden = true; _covered.forEach((n) => { n.hidden = false; }); _covered = []; const b = (doc() && doc().getElementById("pm-bench-open")); if (b && b.focus) b.focus(); }
  function mount() {
    if (typeof document === "undefined") return false;
    const back = (doc() && doc().getElementById("bench-back")); if (back && !back.__bench) { back.__bench = true; back.addEventListener("click", close); }
    if ((doc() && doc().getElementById("pm-bench-open"))) return true;
    const host = doc().getElementById("pm-panel-graphics");   // GRAPHICS: "Renderer, resolution & effects"
    if (!host) return false;
    const nav = el("nav", "pm-doors"); nav.setAttribute("aria-label", "Benchmark");   // the SETTINGS hub's door tile look
    const b = btn("BENCHMARK…", null, open); b.id = "pm-bench-open";
    b.appendChild(el("small", null, "Time this phone: renderer paths, weather, tracks, garage"));
    nav.appendChild(b); host.insertBefore(nav, host.firstChild);
    return true;
  }

  return {
    KEY, SCHEMA, SEED, TESTS, median, summarize, scenes, newPlan, pathPrefs,
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
