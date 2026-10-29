/* Apex 26 — BenchRun: SETTINGS > GRAPHICS > BENCHMARK, a hands-free device benchmark with a results file.

   Pick a test, tap RUN, put the phone down. Each LEG reloads the page onto the three.js path it measures (THREE PATH:
   WEBGPU / WEBGL2 is only chosen at boot), seeds the sim (SEED), runs GPU TEST (js/perf/gpu-test-run.js: a dry Monza
   on the helmet camera, driven by SoakRun, through the default / s50 / s75 / s100 / mirrorOff / again phases) and
   times race entry twice: COLD is the first race after the reload, WARM a second start right after. The plan lives in
   localStorage under KEY so it survives every reload; when the last leg ends the player's own renderer settings come
   back, the page reloads once more if they changed, and this page reopens on the results with SAVE FILE and COPY.

   Other leg kinds run on the same reload and restore: "race" (one track and weather, timed 25 s), "lap" (ONE LAP /
   QUICK PATHS: the first timed lap of Monza, every frame of it), "garage" (tabs, liveries, spin) and "livery" (LIVERY
   EDIT: a new livery edited through the controls a player taps, each edit timed to its presented frame, with the GPU
   counters after a three-edit warm-up and at the end).

   A leg the page never finished (iOS killed the tab, a WebGPU device loss reloaded it) reads as state "running" on
   the next boot: it is recorded as "reloaded" and the run moves on, so a crash is a result, not a loop. A leg that
   ends early (page hidden, soak refused, a race that never started) is recorded with its reason and the run goes on. Nothing here runs until RUN: idle, the
   module only mounts a button and, after a reload it started, resumes its own plan. */
const BenchRun = (function () {
  "use strict";

  const KEY = "apex26.benchRun";
  const SCHEMA = "apex26.bench/2";   // /2 adds leg.capture, steps[].cap and plan.capture (js/perf/bench-capture.js); /1 plans still resume
  const SCHEMAS = ["apex26.bench/1", SCHEMA];
  const SEED = 42;
  const gpu = (path) => ({ kind: "gpu", path, label: path ? "GPU TEST " + path.toUpperCase() : "GPU TEST" });
  const race = (track, weather, tod, label) => ({ kind: "race", path: null, track, weather, tod, label });
  // ONE LAP / QUICK PATHS: Monza dry on the helmet camera, GPU TEST's own scene, so a lap reads against its phases.
  const lap = (path) => ({ kind: "lap", path, track: "monza", weather: "dry", tod: "default", label: path ? "Lap " + path.toUpperCase() : "Lap" });
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
    { id: "lap", label: "ONE LAP", legs: [lap(null)],
      help: "One timed lap of Monza, dry, helmet camera, on the renderer you have now: race entry, then every frame of the lap. About 2 min." },
    { id: "quick", label: "QUICK PATHS", legs: [lap("webgpu"), lap("webgl2")],
      help: "One timed lap of Monza on WebGPU, then one on WebGL2. The game reloads between them. About 5 min." },
    { id: "livery", label: "LIVERY EDIT", legs: [{ kind: "livery", path: null, label: "Livery" }],
      help: "Paints a new livery in the GARAGE (colours, palette, finish, pattern, number font, sponsors, styles), saves it and fits two parts, timing every edit and counting GPU memory. Your garage is put back afterwards. About 2 min." },
  ];
  const READY_MS = 60000, COLD_MS = 300000, WARM_MS = 60000, RACE_MS = 20000, SETTLE_MS = 5000, LAP_MS = 240000;

  let _G = null, _ui = null, _pick = "paths", _busy = false;
  const r2 = (n) => (n != null && Number.isFinite(+n) ? Math.round(+n * 100) / 100 : null);
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  // BenchCapture (js/perf/bench-capture.js): per-leg profiling; absent, the run is the /1 run.
  const BC = () => (typeof BenchCapture !== "undefined" ? BenchCapture : null);
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
  // Frames over the 30 fps and 20 fps budgets: what a player sees as a hitch. Pure.
  function overs(d) {
    const n33 = d.filter((x) => x > 33.4).length, n50 = d.filter((x) => x > 50).length;
    return { n33, n50, over33: d.length ? r2(100 * n33 / d.length) : null };
  }
  // b - a for every number both samples hold: what the edits left behind on the GPU. Pure.
  function growth(a, b) {
    const o = {};
    for (const k of Object.keys(b || {})) if (a && Number.isFinite(a[k]) && Number.isFinite(b[k])) o[k] = r2(b[k] - a[k]);
    return o;
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
      // Entry = start -> race built (buildMs); goMs adds the start lights, a fixed sequence, so it is not the figure.
      o.coldMs.push(leg.entry && leg.entry.cold ? leg.entry.cold.buildMs : null);
      o.warmMs.push(leg.entry && leg.entry.warm ? leg.entry.warm.buildMs : null);
      o.gpuTimer = o.gpuTimer || !!(leg.gpuTest.gpuTimer && leg.gpuTest.gpuTimer.supported);
    }
    for (const o of Object.values(out)) {
      for (const id of Object.keys(o.phases)) { const p = o.phases[id]; o.phases[id] = { p50: median(p.p50), p95: median(p.p95), fps: median(p.fps), n: p.p50.length }; }
      o.fill = median(o.fill); o.mirrorMs = median(o.mirrorMs); o.coldMs = median(o.coldMs); o.warmMs = median(o.warmMs);
    }
    return out;
  }
  // Race, lap, garage and livery legs as flat rows: one per race or lap, one per garage step or livery edit, plus
  // the livery leg's GPU growth. Unfinished legs keep a row with their state. `time` is the lap (s) or the edit (ms).
  const SCENE_KINDS = ["race", "lap", "garage", "livery"];
  function scenes(legs) {
    const rows = [];
    for (const leg of legs || []) {
      if (!leg || !SCENE_KINDS.includes(leg.kind)) continue;
      if (leg.state !== "done") { rows.push({ label: leg.label, state: leg.state, reason: leg.reason || null }); continue; }
      const coldMs = leg.entry && leg.entry.cold ? (leg.entry.cold.buildMs != null ? leg.entry.cold.buildMs : leg.entry.cold.goMs) : null;
      const many = leg.kind === "garage" || leg.kind === "livery";
      for (const st of leg.steps || []) {
        rows.push({ label: many ? leg.label + " · " + st.id : leg.label, state: "done",
          p50: st.p50, p95: st.p95, p99: st.p99, fps: st.fps, n33: st.n33, n50: st.n50, links: st.links, pipes: st.pipes, coldMs,
          time: st.lapS != null ? st.lapS + " s" : st.editMs != null ? st.editMs + " ms" : null });
      }
      if (leg.kind === "livery" && leg.mem) {
        const g = leg.mem.growth || {}, f = (k, name) => (g[k] != null ? name + " " + (g[k] > 0 ? "+" : "") + g[k] : null);
        rows.push({ label: leg.label + " · GPU growth", state: "growth",
          reason: [f("textures", "textures"), f("geometries", "geometries"), f("sticky", "sticky geo"), f("texMB", "texture MB"), f("flapSets", "flap sets")].filter(Boolean).join(" · ") || "no counters on this renderer" });
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
  // Screen Wake Lock: a hands-free run must not let the phone sleep. The browser drops the lock whenever the page hides,
  // so it is asked for again on visible and on every post-reload resume. Unsupported = silent; refused = one hint.
  let _wl = null, _wlHint = false;
  async function wakeAcquire() {
    try {
      const w = typeof navigator !== "undefined" ? navigator.wakeLock : null;
      if (!w || typeof w.request !== "function" || (_wl && !_wl.released)) return;
      _wl = await w.request("screen"); _wlHint = false; log("wake lock held");
    } catch (e) { _wl = null; _wlHint = true; log("wake lock refused " + (e && e.name)); if (_ui) say("Screen may sleep: set Auto-Lock to Never"); }
  }
  function wakeRelease() {
    const l = _wl; _wl = null; _wlHint = false;
    try { if (l && !l.released) { const r = l.release(); if (r && r.catch) r.catch(() => {}); } } catch (_) { /* already released */ }
  }
  function onVisible() { try { if (document.visibilityState === "visible" && stillRunning()) wakeAcquire(); } catch (_) { /* no document */ } }
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
  // Neither wait is open-ended: a start that never settles inside limitMs is a result ("timeout"), not a hung leg.
  async function timedEntry(fn, limitMs) {
    const t0 = now(); let buildMs = null;
    const late = new Promise((res) => setTimeout(() => res("timeout"), limitMs));
    const ok = await Promise.race([Promise.resolve(fn()).then((v) => { buildMs = r2(now() - t0); return v; }, () => false), late]);
    if (ok === "timeout") return { ok: false, buildMs: null, timedOut: true };
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
    if (BC()) BC().legStart(leg, _G);
    try { return await legBody(plan, leg); } finally { if (BC()) leg.capture = BC().legEnd(); }
  }
  async function legBody(plan, leg) {
    if (leg.kind === "race") return raceLeg(plan, leg);
    if (leg.kind === "garage") return garageLeg(plan, leg);
    if (leg.kind === "lap") return lapLeg(plan, leg);
    if (leg.kind === "livery") return liveryLeg(plan, leg);
    let result = null;
    const done = new Promise((res) => { leg._res = res; });
    _G.seed = plan.seed;
    const cold = await timedEntry(() => GpuTestRun.start({ onDone: (r) => { result = r; leg._res(); } }), COLD_MS);
    if (!cold.ok) { leg.state = "failed"; leg.reason = "GPU TEST could not start"; leg.entry = { cold }; return false; }
    await done;
    if (!stillRunning()) return "aborted";   // STOP BENCHMARK ended the plan under this leg
    leg.gpuTest = result;
    // WARM: the same race again in this page. SoakRun's finish paused the game: RESUME through the pause menu's
    // own button (the player's path), confirm it took, then start, time and stop.
    try { const b = document.getElementById("pm-resume"); if (_G.paused && b) b.click(); } catch (_) { /* pause is a courtesy */ }
    await until(() => !_G.paused, 3000);
    leg.warmPaused = !!_G.paused;
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
  // record() starts counting; the function it returns stops and gives the stats, frames over 33 / 50 ms included.
  function record() {
    const counts = { links: 0, pipes: 0 }, unhook = GpuTestRun.hookCounts(counts), d = [];
    let prev = 0, on = true;
    const tick = (ts) => { if (!on) return; if (prev) d.push(ts - prev); prev = ts; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return () => {
      on = false; unhook();
      const st = Object.assign(GpuTestRun.phaseStats(d, [], counts), overs(d)), cap = BC() && BC().step();
      if (cap) st.cap = cap;
      return st;
    };
  }
  async function measure(ms, settleMs) {
    await sleep(settleMs);
    const end = record();
    await sleep(ms);
    return end();
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
  // ONE LAP: every frame from the lights to the first timed lap (the run-up to the line, then lap 1 standing).
  async function lapLeg(plan, leg) {
    _G.seed = plan.seed;
    const cold = await timedEntry(() => SoakRun.start({ track: leg.track, weather: leg.weather, tod: leg.tod, minutes: LAP_MS / 60000 + 1, cam: "helmet" }), COLD_MS);   // the soak outlives the cap, so a slow lap reads as one
    leg.entry = { cold };
    if (!cold.ok) { leg.state = "failed"; leg.reason = "race could not start"; return false; }
    const end = record(), timed = () => { const P = _G.player; return P && P.lastLap > 0 ? P.lastLap : 0; };
    await until(() => timed() || !SoakRun.active() || !stillRunning(), LAP_MS);
    const st = end(), lapS = timed(), alive = SoakRun.active(), why = alive ? null : (SoakRun.status() || {}).reason;
    try { if (alive) SoakRun.stop("bench"); } catch (_) { /* soak gone */ }
    if (!stillRunning()) return "aborted";
    if (!lapS) { leg.state = "failed"; leg.reason = alive ? "no timed lap in " + LAP_MS / 60000 + " min" : "race ended early: " + why; return false; }
    leg.steps = [Object.assign({ id: "lap", lapS: r2(lapS) }, st)];
    leg.state = "done";
    return true;
  }
  // Every apex26.* key but the plan (run() takes it, finishPlan puts it back).
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
  // The title's GARAGE button, timed to a sheet with tabs; the arrival animation is skipped as a player would.
  async function openGarage(leg) {
    const D = document;
    const t0 = now(), open = D.getElementById("mb-garage");
    if (!open) { leg.state = "failed"; leg.reason = "no GARAGE button"; return false; }
    open.click();
    const ok = await until(() => { const cs = D.getElementById("carsetup"); return cs && !cs.hidden && !cs.hasAttribute("aria-busy") && D.querySelector('#cs-tabs [role="tab"]'); }, 60000);
    leg.entry = { cold: { ok, goMs: ok ? r2(now() - t0) : null } };
    if (!ok) { leg.state = "failed"; leg.reason = "the garage did not open"; return false; }
    const skip = D.getElementById("cs-arrival-skip");
    if (skip && skip.offsetParent) skip.click();
    return true;
  }
  async function garageLeg(plan, leg) {
    const D = document;
    if (!(await openGarage(leg))) return false;
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
  // The counters tests/specs/garage-livery-churn.spec.js reads (TLX only; another renderer reports nulls).
  function memSample() {
    const o = { textures: null, geometries: null, texMB: null, geoLive: null, sticky: null, flapRuns: null, flapSets: null };
    const T = (_G && _G.gfx && _G.gfx.__tlx) || (typeof GLX !== "undefined" ? GLX.__tlx : null);   // the bound TLX, as experience.js reads it
    try {
      const m = T.memState(), k = m.geoKinds || {};
      Object.assign(o, { textures: m.rTex, geometries: m.rGeo, geoLive: m.geoLive, sticky: (k.chunk || 0) + (k.carSh || 0) + (k.tex || 0),
        texMB: m.resources && m.resources.texturesSize != null ? r2(m.resources.texturesSize / 1048576) : null });
    } catch (_) { /* not TLX */ }
    try { o.flapRuns = T.coState().runs; } catch (_) { /* not TLX */ }
    try { o.flapSets = CarMesh.flapState().sets; } catch (_) { /* no flap cache */ }
    return o;
  }
  // Input to the frame that shows it: the rAF after the input's own work draws the edit, the next one has presented it.
  async function timedTap(fn) {
    const t0 = now();
    if (!fn()) return null;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return r2(now() - t0);
  }
  // LIVERY EDIT: CREATE a livery and edit it through the controls a player taps, SAVE & FIT, then fit two parts.
  // Each edit is the DOM event the control listens for (click, or a colour/slider input + change), never a draft write.
  async function liveryLeg(plan, leg) {
    const D = document, q = (sel) => D.querySelector(sel), qa = (sel) => Array.from(D.querySelectorAll(sel)).filter((b) => !b.disabled);
    if (!(await openGarage(leg))) return false;
    const tab = (id) => { const b = D.getElementById("cs-tab-" + id); if (!b || b.disabled) return false; b.click(); return true; };
    if (!tab("livery") || !(await until(() => q(".cs-liv-create"), 5000))) { leg.state = "failed"; leg.reason = "no livery CREATE"; return false; }
    await sleep(1500);
    const open = memSample();
    q(".cs-liv-create").click();
    if (!(await until(() => q('input[data-liv-field="c1"]'), 5000))) { leg.state = "failed"; leg.reason = "the livery editor did not open"; return false; }
    await sleep(1000);
    const set = (field, v) => () => {
      const inp = q('input[data-liv-field="' + field + '"]'); if (!inp || inp.disabled) return false;
      inp.value = String(v); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const tap = (sel, i) => () => { const b = qa(sel).filter((x) => !x.classList.contains("active"))[i || 0]; if (!b) return false; b.click(); return true; };
    const rowBtn = (label, i) => () => {
      const r = Array.from(D.querySelectorAll(".cs-liv-ed-row")).find((x) => (x.querySelector(".cs-liv-ed-lbl") || {}).textContent === label);
      const b = r && Array.from(r.querySelectorAll("button")).filter((x) => !x.disabled)[i]; if (!b) return false; b.click(); return true;
    };
    // An adjustable SPINE TOP design (LiveryDesign.PATTERNS), so DESIGN WIDTH below is live.
    const pattern = () => {
      const ids = (typeof LiveryDesign !== "undefined" && LiveryDesign.PATTERNS) || [];
      const b = qa('[data-cs-pill^="spineLogo:"]').find((x) => !x.classList.contains("active") && ids.includes(x.dataset.csPill.slice(10)));
      if (!b) return false; b.click(); return true;
    };
    // A part STYLE row starts on FITTED: its next pill is a style.
    const style = () => { const f = q('[data-cs-pill$=":fitted"]'); const b = f && f.nextElementSibling; if (!b || b.disabled) return false; b.click(); return true; };
    const edits = [["primary colour", set("c1", "#1a6bd8")], ["accent colour", set("c2", "#f2c014")], ["colour chip", tap("[data-cs-colour]", 1)],
      ["palette", rowBtn("PALETTE", 1)], ["finish", tap("[data-cs-finish]", 1)], ["pattern", pattern],
      ["pattern width", set("patternWidth", 70)], ["number font", tap('[data-cs-pill^="numFont:"]', 0)], ["sponsors", tap('[data-cs-pill^="sponsors:"]', 0)],
      ["body style", tap('[data-cs-pill^="bodyStyle:"]', 0)], ["part style", style]];
    // Then the accent dragged through colours never seen before: the churn tests/specs/garage-livery-churn.spec.js pins.
    for (let i = 1; i <= 4; i++) edits.push(["accent " + i, set("c2", "#" + (0x204060 + i * 0x0b0503).toString(16).slice(-6))]);
    const steps = [], all = record();
    const step = async (id, fn) => {
      const editMs = await timedTap(fn);
      if (editMs == null) { steps.push({ id: id + " (none)", editMs: null }); return; }
      steps.push(Object.assign({ id, editMs }, await measure(1500, 0)));
    };
    // The baseline is taken after a warm-up of three edits, as the churn spec takes it: the garage builds its bay,
    // atlas and first flap set lazily, and that first build is not an edit's cost.
    let warm = null;
    for (const [id, fn] of edits) {
      await step(id, fn);
      if (!stillRunning()) { all(); return "aborted"; }
      if (steps.length === 3) { await sleep(1500); warm = memSample(); }
    }
    await step("save & fit", () => { const b = q(".cs-liv-ed-save"); if (!b) return false; b.click(); return true; });
    // Two fitted parts in the first part tab that has a free, unlocked option (a locked row would spend on research).
    const part = () => qa('#cs-options .cs-opt[data-cs-opt]:not(.active):not(.locked):not(.over-budget)')[0];
    const cat = Array.from(D.querySelectorAll('#cs-tabs [role="tab"]')).map((b) => b.dataset.csCat).find((c) => c && !["team", "livery", "tune"].includes(c) && tab(c) && part());
    for (let i = 1; cat && i <= 2; i++) await step("fit " + cat + " " + i, () => { const b = part(); if (!b) return false; b.click(); return true; });
    steps.push(Object.assign({ id: "all edits" }, all()));
    await sleep(3000);   // the paint jobs an edit queues (atlas, flaps, hi-res swap) land before the second count
    const after = memSample();
    leg.mem = { open, before: warm, after, growth: growth(warm, after) };
    const back = D.getElementById("cs-back"); if (back) back.click();
    leg.steps = steps; leg.state = "done";
    return true;
  }
  async function finishPlan(plan, state) {
    wakeRelease();
    plan.state = state; plan.finishedAt = new Date().toISOString(); plan.show = true;
    plan.summary = summarize(plan.legs); plan.scenes = scenes(plan.legs);
    if (BC()) plan.capture = BC().budget(plan);
    if (plan.restore) { await restore(plan.restore); plan.restoreAfter = plan.restore; delete plan.restore; }
    writePrefs(plan.prefs); save(plan);
    log("done " + state);
    // Always reload: the results open over a fresh title screen, never over the paused race the last leg left.
    reload();
  }
  async function resume() {
    const plan = load();
    if (!plan || SCHEMAS.indexOf(plan.schema) < 0) return;
    if (plan.state !== "running") {
      // A page that saved the garage on its way out could have written the run's picks back: check once, after the reload.
      if (plan.restoreAfter) {
        const snap = plan.restoreAfter; delete plan.restoreAfter; save(plan);
        if (JSON.stringify(snapshot()) !== JSON.stringify(snap)) { await restore(snap); reload(); return; }
      }
      if (plan.show) { plan.show = false; save(plan); if (await waitReady()) open(); }
      return;
    }
    wakeAcquire();
    if (_busy) return; _busy = true;
    const leg = plan.legs[plan.i];
    if (leg && leg.state === "running") { leg.state = "reloaded"; leg.reason = "the page reloaded during this leg"; if (BC()) leg.crumb = BC().recover(); plan.i++; save(plan); }
    else if (leg && leg.state === "booting") {
      const ok = await runLeg(plan);
      if (ok === "aborted" || !stillRunning()) { _busy = false; return; }
      // A failed leg is a result, not the end: it keeps its state and reason and the run goes on to the next leg,
      // so a phone left alone always comes back to a results page. Only STOP BENCHMARK ends a run early.
      plan.i++; save(plan);
    }
    if (plan.i >= plan.legs.length) { await finishPlan(plan, "complete"); return; }
    startLeg(plan);
  }
  function run(testId) {
    if (load() && load().state === "running") return false;
    const plan = newPlan(testId, readPrefs());
    // Every apex26.* key as it was, put back by finishPlan: a race starts the PHONE TEST recorder (apex26.phoneRec)
    // and counts toward onboarding, a garage leg saves livery picks. A benchmark leaves no trace.
    plan.restore = snapshot();
    save(plan); log("start " + plan.test + " " + plan.legs.length + " legs");
    wakeAcquire();
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
    const t = el("table"); t.setAttribute("aria-label", "Benchmark results per race, lap, garage step and livery edit");
    const head = el("tr"); ["SCENE", "TIME", "p50 / p95 / p99 ms", "fps", "> 33 / 50 ms", "links / pipelines", "entry ms"].forEach((h) => head.appendChild(el("th", null, h))); t.appendChild(head);
    const v = (x) => (x == null ? "–" : String(x));
    rows.forEach((r) => {
      const tr = el("tr"); tr.appendChild(el("td", null, r.label));
      if (r.state === "growth") { const td = el("td", null, r.reason); td.colSpan = 6; tr.appendChild(td); }
      else if (r.state !== "done") { const td = el("td", null, r.state + (r.reason ? " (" + r.reason + ")" : "")); td.colSpan = 6; tr.appendChild(td); }
      else [v(r.time), v(r.p50) + " / " + v(r.p95) + " / " + v(r.p99), v(r.fps), v(r.n33) + " / " + v(r.n50), v(r.links) + " / " + v(r.pipes), v(r.coldMs)].forEach((x) => tr.appendChild(el("td", null, x)));
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
      if (_wlHint) say("Screen may sleep: set Auto-Lock to Never");
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
    b.appendChild(el("small", null, "Time this phone: one lap, renderer paths, weather, tracks, garage, livery edits"));
    nav.appendChild(b); host.insertBefore(nav, host.firstChild);
    return true;
  }

  // open / close / stillRunning / resultText stay module-local (mount, resume, paint);
  // KEY stays — tools/perf/devicefarm-*.mjs reads BenchRun.KEY across reloads.
  return {
    KEY, SCHEMA, SCHEMAS, SEED, TESTS, median, overs, growth, summarize, scenes, newPlan, pathPrefs,
    create(G) {
      _G = G;
      try { document.addEventListener("visibilitychange", onVisible); } catch (_) { /* no document */ }
      if (typeof setTimeout === "function") [400, 1200, 2500, 5000].forEach((ms) => setTimeout(mount, ms));
      if (typeof setTimeout === "function") setTimeout(() => { resume().catch((e) => log("resume failed " + (e && e.message))); }, 0);
      return this;
    },
    run, stop, wake: { acquire: wakeAcquire, release: wakeRelease, onVisible },
  };
})();

Object.freeze(BenchRun);
