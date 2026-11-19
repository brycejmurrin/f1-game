const ApexBridge = (function () {
  "use strict";

  const V = 1;
  const REPO = "brycejmurrin/f1-game";
  const API = "https://api.github.com";
  const TOKEN_KEY = "apex26.bridgeToken";
  const POLL_MS = 4000;
  const BACKOFF_MS = 60000;
  const MAX_REPLY = 60000;
  const CMD_RE = /```apex-cmd[ \t]*\n([\s\S]*?)```/;
  const CALL_OK = new Set([
    "info", "perf", "physState", "obs", "world", "field", "scene", "probe", "viewState", "describe", "diag", "logs",
    "lifecycle", "timing", "trackInfo", "tracks", "menuPrep", "assets", "texCensus", "thermalDrift", "buildProfile",
    "raceProfile", "raceEntryProfile", "raceEntryStages", "frametimeBench", "renderClock", "envProbe", "lightState",
    "modelDiagnostics", "geometryDiagnostics", "agentHelp", "sectorState", "lapHistory",
    "race", "go", "jump", "park", "rollout", "setInput", "clearInput", "freeze", "seed", "setTimeOfDay", "weather",
    "renderRate", "renderScale", "gpuTimer", "govHold", "mirror", "occlusionCull", "multiDraw", "spatialUpscale",
    "matTex", "meshToggle", "stats",
  ]);

  let _run = null, _badge = null;

  function say(msg) {
    try { Log.info("apex", "[bridge] " + msg); } catch (_) {  }
  }
  function issueOf(search) {
    const m = /[?&]bridge=(\d+)(&|$)/.exec(search || "");
    return m ? Number(m[1]) : 0;
  }
  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; }
  }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {  }
  }

  function pct(sorted, p) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

  function frames(args) {
    const secs = Math.max(1, Math.min(60, Number(args && args.seconds) || 5));
    return new Promise((resolve) => {
      const dts = [];
      let last = null, longTasks = 0, obs = null;
      try {
        obs = new PerformanceObserver((l) => { longTasks += l.getEntries().length; });
        obs.observe({ type: "longtask", buffered: false });
      } catch (_) { obs = null; }
      const t0 = performance.now();
      const tick = (t) => {
        if (last != null) dts.push(t - last);
        last = t;
        if (t - t0 < secs * 1000) requestAnimationFrame(tick);
        else {
          if (obs) try { obs.disconnect(); } catch (_) {  }
          const s = dts.slice().sort((a, b) => a - b);
          const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
          resolve({
            seconds: secs, frames: s.length, fps: r2(1000 / mean), meanMs: r2(mean),
            p50: r2(pct(s, 0.5)), p95: r2(pct(s, 0.95)), p99: r2(pct(s, 0.99)), maxMs: r2(s[s.length - 1]),
            over33: s.filter((d) => d > 33.4).length, longTasks: obs ? longTasks : null,
            hidden: typeof document !== "undefined" ? document.hidden : null,
          });
        }
      };
      requestAnimationFrame(tick);
    });
  }

  function facts() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const meta = typeof document !== "undefined" && document.querySelector && document.querySelector('meta[name="apex-sha"]');
    let info = null;
    try { info = window.__apex && window.__apex.info ? window.__apex.info() : null; } catch (e) { info = { error: String(e && e.message) }; }
    return {
      v: V, sha: meta ? meta.content : null, href: location.href,
      ua: nav.userAgent || null, dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight,
      gpu: !!nav.gpu, cores: nav.hardwareConcurrency || null, mem: nav.deviceMemory || null,
      apex: !!window.__apex, info, render: pathState(),
    };
  }

  async function display() {
    const d = typeof document !== "undefined" ? document : null;
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const cs = (el) => { try { return el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null; } catch (_) { return null; } };
    const rect = (el) => { try { const r = el.getBoundingClientRect(); return [r2(r.width), r2(r.height)]; } catch (_) { return null; } };
    const mq = (q) => { try { return typeof matchMedia === "function" ? matchMedia(q).matches : null; } catch (_) { return null; } };
    const el = (id) => (d && d.getElementById ? d.getElementById(id) : null);
    const name = (e) => (e.id ? "#" + e.id : String(e.tagName || "?").toLowerCase());
    const chain = (start) => {
      const steps = [];
      let zoomProduct = 1;
      for (let e = start; e && e.nodeType === 1; e = e.parentElement) {
        const s = cs(e);
        if (!s) break;
        const z = parseFloat(s.zoom), t = s.transform;
        const odd = (isFinite(z) && z !== 1) || (t && t !== "none");
        if (isFinite(z)) zoomProduct *= z;
        if (odd) steps.push({ el: name(e), zoom: isFinite(z) ? z : s.zoom || null, transform: t && t !== "none" ? t : undefined });
      }
      return { steps, zoomProduct: r2(zoomProduct) };
    };
    const vars = (e, names) => {
      const s = cs(e);
      if (!s) return null;
      const out = {};
      for (const n of names) { const v = String(s.getPropertyValue(n) || "").trim(); out[n] = v === "" ? null : v; }
      return out;
    };
    const canvas = (c) => c && {
      css: [c.clientWidth, c.clientHeight], rect: rect(c), buffer: [c.width, c.height], hidden: !!c.hidden,
      engine: c.getAttribute ? c.getAttribute("data-engine") : null, chain: chain(c),
    };
    const text = (e) => e && { hidden: !!e.hidden, rect: rect(e), fontSize: (cs(e) || {}).fontSize || null, chain: chain(e) };
    const root = d && d.documentElement, hud = el("hud");
    const vv = typeof visualViewport !== "undefined" && visualViewport ? visualViewport : null;
    const meta = (n) => { const m = d && d.querySelector && d.querySelector('meta[name="' + n + '"]'); return m ? m.content : null; };
    let swCaches = null;
    try { if (typeof caches !== "undefined" && caches && caches.keys) swCaches = (await caches.keys()).filter((k) => /^apex26-/.test(k)); } catch (_) { swCaches = null; }
    let sw = null;
    try { const c = nav.serviceWorker && nav.serviceWorker.controller; sw = c ? { scriptURL: c.scriptURL, state: c.state } : null; } catch (_) { sw = null; }
    let renderScale = null;
    try { renderScale = window.__apex && window.__apex.renderScale ? window.__apex.renderScale({ lite: true }) : null; } catch (e) { renderScale = { error: String(e && e.message) }; }
    const VARS = ["--ui-scale", "--vwz", "--hud-scale", "--hud-z-top", "--hud-z-bot", "--sheet-scale"];
    return {
      dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight],
      screen: typeof screen !== "undefined" && screen ? [screen.width, screen.height] : null,
      client: root ? [root.clientWidth, root.clientHeight] : null,
      visualViewport: vv ? { scale: vv.scale, w: r2(vv.width), h: r2(vv.height), x: r2(vv.offsetLeft), y: r2(vv.offsetTop) } : null,
      standalone: { nav: !!nav.standalone, mq: mq("(display-mode: standalone)"), fullscreen: mq("(display-mode: fullscreen)") },
      vars: { root: vars(root, VARS), hud: vars(hud, VARS) },
      game: canvas(el("game")), soft: canvas(el("game-soft")),
      hud: hud ? { hidden: !!hud.hidden, css: [hud.clientWidth, hud.clientHeight], chain: chain(hud), fontSize: (cs(hud) || {}).fontSize || null,
        time: text(el("hud-time")), pos: text(el("hud-pos")) } : null,
      overlay: text(el("overlay")),
      renderScale,
      build: { sha: meta("apex-sha"), build: meta("apex-build"), swCaches, sw },
    };
  }

  function geom() {
    const d = typeof document !== "undefined" ? document : null;
    const root = d && d.documentElement, body = d && d.body;
    const mq = (q) => { try { return typeof matchMedia === "function" ? matchMedia(q).matches : null; } catch (_) { return null; } };
    const vv = typeof visualViewport !== "undefined" && visualViewport ? visualViewport : null;
    const sc = typeof screen !== "undefined" && screen ? screen : null;
    const out = {
      inner: [window.innerWidth, window.innerHeight],
      client: root ? [root.clientWidth, root.clientHeight] : null,
      visualViewport: vv ? { scale: vv.scale, w: r2(vv.width), h: r2(vv.height), x: r2(vv.offsetLeft), y: r2(vv.offsetTop) } : null,
      screen: sc ? [sc.width, sc.height, sc.availWidth, sc.availHeight] : null,
      orientation: sc && sc.orientation ? [sc.orientation.type, sc.orientation.angle] : null,
      dpr: window.devicePixelRatio,
      standalone: { nav: !!(typeof navigator !== "undefined" && navigator.standalone), mq: mq("(display-mode: standalone)") },
      units: null, insets: null, zoom: null, media: {}, tiers: null, wish: null, paint: null,
    };
    for (const q of GEOM_MEDIA) out.media[q] = mq(q);
    if (!d || !body || typeof d.createElement !== "function" || typeof getComputedStyle !== "function") return out;
    const cs = getComputedStyle(root), v = (n) => { const s = String(cs.getPropertyValue(n) || "").trim(); return s === "" ? null : s; };
    const p = d.createElement("div");
    try {
      body.appendChild(p);
      const box = (css) => { p.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;" + css; return p.getBoundingClientRect(); };
      out.units = {};
      for (const u of ["vh", "svh", "dvh", "lvh"]) out.units[u] = r2(box("left:0;top:0;width:1px;height:100" + u).height);
      for (const u of ["vw", "svw"]) out.units[u] = r2(box("left:0;top:0;height:1px;width:100" + u).width);
      const e = box("left:env(safe-area-inset-left,0px);top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px)");
      const full = box("left:0;top:0;right:0;bottom:0");
      out.insets = { left: r2(e.left - full.left), top: r2(e.top - full.top), right: r2(full.right - e.right), bottom: r2(full.bottom - e.bottom), fixedBox: [r2(full.width), r2(full.height)] };
      const z = box("left:0;top:0;width:100px;height:50px;zoom:2");
      const c = d.createElement("div");
      c.style.cssText = "width:10vw;height:1px;padding-left:env(safe-area-inset-left,0px)";
      p.appendChild(c);
      const cr = c.getBoundingClientRect(), vw = out.units.vw || 0, cps = getComputedStyle(c);
      out.zoom = {
        currentCSSZoom: typeof p.currentCSSZoom === "number" ? p.currentCSSZoom : null,
        rectOf100At2: r2(z.width), offsetOf100At2: p.offsetWidth,
        vwInZoom2: vw ? r2((cr.width - parseFloat(cps.paddingLeft) * (z.width / 100)) / (vw / 10)) : null,
        envInZoom2: out.insets.left ? r2(parseFloat(cps.paddingLeft) * (z.width / 100) / out.insets.left) : null,
      };
    } catch (err) { out.error = String(err && err.message); }
    try { p.remove(); } catch (_) {  }
    out.tiers = { density: body.getAttribute("data-density"), shape: body.getAttribute("data-shape"), desktop: !!(body.classList && body.classList.contains("desktop")),
      html: root.dataset ? Object.assign({}, root.dataset) : null };
    out.wish = { ui: v("--ui-scale"), hud: v("--hud-scale"), btn: v("--hud-btn-scale"), textBoost: v("--hud-text-boost") };
    out.paint = { hudTop: v("--hud-z-top"), hudBot: v("--hud-z-bot"), dock: v("--hud-z-dock"), dockLeft: v("--hud-z-dock-l"), sheet: v("--sheet-scale"), kb: v("--kb"),
      gut: v("--gut"), sal: v("--sal"), sar: v("--sar"), sat: v("--sat"), sab: v("--sab") };
    return out;
  }

  function call(args) {
    const m = args && args.method;
    if (!CALL_OK.has(m)) throw new Error("method not allowed: " + m);
    const api = window.__apex;
    if (!api || typeof api[m] !== "function") throw new Error("__apex." + m + " unavailable");
    return api[m].apply(api, Array.isArray(args.args) ? args.args : []);
  }

  function perfModule(name, mod, ops, args) {
    const op = args && args.op;
    if (!mod || !ops.includes(op) || typeof mod[op] !== "function") throw new Error(name + "." + op + " unavailable");
    return mod[op](args.opts);
  }

  const gs = () => (typeof GameStore !== "undefined" && GameStore.store ? GameStore.store : null);
  function raw(k) { try { const s = gs(); return s ? s.raw(k) : localStorage.getItem(k); } catch (_) { return null; } }
  function rawSet(k, v) {
    const s = gs();
    try { if (v == null) { if (s) s.rawDel(k); else localStorage.removeItem(k); } else if (s) s.rawSet(k, v); else localStorage.setItem(k, v); } catch (_) {  }
  }
  const later = (fn) => { setTimeout(fn, 500); };

  const PATHS = ["webgpu", "webgl2", "auto"];
  const GEOM_MEDIA = ["(pointer: coarse)", "(hover: hover)", "(any-pointer: fine)", "(orientation: landscape)", "(max-height: 380px)", "(max-height: 400px)",
    "(max-height: 500px)", "(max-height: 560px)", "(min-width: 700px)", "(min-width: 761px)", "(min-width: 900px)"];
  function pathState() {
    const RP = typeof RendererPicker !== "undefined" ? RendererPicker : null;
    let live = null, engine = null, fallbackWhy = null;
    try { live = RP ? RP.liveThreeApi() || RP.liveBackend() : null; } catch (_) {  }
    try { engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) {  }
    try { fallbackWhy = sessionStorage.getItem("apex26.gfxFallbackWhy"); } catch (_) {  }
    return { backend: raw("apex26.gfxBackend"), threePath: raw("apex26.tlxForceGL"), live, engine, fallbackWhy };
  }
  function path(args) {
    const to = args && args.to;
    if (to == null) return pathState();
    if (!PATHS.includes(to)) throw new Error("path.to must be one of " + PATHS.join(", "));
    const BR = typeof BenchRun !== "undefined" ? BenchRun : null;
    const p = to === "auto" ? { backend: "three", threePath: null } : BR ? BR.pathPrefs(to, null) : null;
    if (!p) throw new Error("BenchRun unavailable");
    const was = pathState();
    rawSet("apex26.gfxBackend", p.backend);
    rawSet("apex26.tlxForceGL", p.threePath);
    try { for (const k of (typeof RendererPicker !== "undefined" && RendererPicker.RENDERER_SS_KEYS) || []) sessionStorage.removeItem(k); } catch (_) {  }
    const reloading = args.reload !== false;
    if (reloading) later(() => location.reload());
    return { was, pinned: p, reloading };
  }

  function bench(args) {
    const BR = typeof BenchRun !== "undefined" ? BenchRun : null;
    if (!BR) throw new Error("BenchRun unavailable");
    const op = args && args.op;
    if (op === "tests") return BR.TESTS.map((t) => ({ id: t.id, label: t.label, legs: t.legs.length }));
    if (op === "start") {
      if (!BR.TESTS.some((t) => t.id === args.test)) throw new Error("unknown bench test: " + args.test);
      const ok = BR.run(args.test);
      if (!ok) throw new Error("a benchmark is already running");
      return { started: args.test };
    }
    if (op === "stop") return { stopped: BR.stop() };
    let plan = null;
    try { plan = JSON.parse(raw(BR.KEY) || "null"); } catch (_) { plan = null; }
    if (op === "status") {
      return plan && { test: plan.test, state: plan.state, i: plan.i, startedAt: plan.startedAt, finishedAt: plan.finishedAt,
        legs: (plan.legs || []).map((l) => ({ label: l.label, state: l.state, reason: l.reason || null })) };
    }
    if (op === "result") {
      return plan && { test: plan.test, state: plan.state, startedAt: plan.startedAt, finishedAt: plan.finishedAt,
        facts: plan.facts || null, summary: plan.summary || null, scenes: plan.scenes || null };
    }
    if (op === "leg") return plan && plan.legs ? plan.legs[Number(args.i) || 0] || null : null;
    throw new Error("bench.op must be tests, start, stop, status, result or leg");
  }

  const SNAP_MAX = 56000;
  function snap(args) {
    const w = Math.max(64, Math.min(640, Number(args && args.w) || 320));
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          const soft = document.getElementById("game-soft");
          const src = soft && !soft.hidden && soft.width ? soft : document.getElementById("game");
          if (!src || !src.width || !src.height) throw new Error("no rendered canvas");
          const c = document.createElement("canvas");
          c.width = w; c.height = Math.max(1, Math.round(src.height * w / src.width));
          c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
          for (let q = Number(args && args.q) || 0.6; q >= 0.1; q = Math.round((q - 0.1) * 10) / 10) {
            const url = c.toDataURL("image/jpeg", q);
            if (url.length <= SNAP_MAX) { resolve({ w: c.width, h: c.height, q, from: src.id, chars: url.length, jpeg: url }); return; }
          }
          throw new Error("snapshot over " + SNAP_MAX + " chars at q 0.1; ask a smaller w");
        } catch (e) { reject(e); }
      });
    });
  }

  const BATCH_MAX = 10;
  async function batch(args) {
    const steps = args && Array.isArray(args.steps) ? args.steps : null;
    if (!steps || !steps.length || steps.length > BATCH_MAX) throw new Error("batch.steps must hold 1–" + BATCH_MAX + " steps");
    const out = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {};
      const ends = s.cmd === "reload" || (s.cmd === "path" && s.args && s.args.to != null && s.args.reload !== false);
      let r;
      if (s.cmd === "batch") r = { ok: false, error: "batch cannot nest" };
      else if (ends && i < steps.length - 1) r = { ok: false, error: s.cmd + " must be the last step" };
      else r = await handle(s);
      out.push(Object.assign({ cmd: s.cmd }, r));
      if (!r.ok) break;
    }
    return out;
  }

  const CMDS = {
    ping: () => ({ pong: true, t: Date.now() }),
    facts,
    display,
    geom,
    frames,
    call,
    gpuTest: (a) => perfModule("GpuTestRun", typeof GpuTestRun !== "undefined" ? GpuTestRun : null, ["start", "stop", "status", "active"], a),
    recorder: (a) => perfModule("PhoneRecorder", typeof PhoneRecorder !== "undefined" ? PhoneRecorder : null, ["start", "stop", "isOn", "json"], a),
    reload: () => { later(() => location.reload()); return { reloading: true }; },
    wait: (a) => new Promise((res) => { const ms = Math.max(0, Math.min(30000, Number(a && a.ms) || 0)); setTimeout(() => res({ waited: ms }), ms); }),
    path,
    bench,
    snap,
    batch,
  };

  function safeJson(v) {
    let s;
    try { s = JSON.stringify(v === undefined ? null : v); } catch (e) { return { value: null, note: "unserialisable: " + e.message }; }
    if (s.length > MAX_REPLY) return { value: null, truncated: s.length, head: s.slice(0, 2000) };
    return { value: JSON.parse(s) };
  }

  const PERF_CMDS = new Set(["bench", "gpuTest", "recorder", "path"]);
  async function perfRig() {
    try {
      const lb = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
      if (lb) await lb.ensurePerfRig();
    } catch (_) {  }
  }

  async function handle(msg) {
    const fn = msg && Object.prototype.hasOwnProperty.call(CMDS, msg.cmd) ? CMDS[msg.cmd] : null;
    if (!fn) return { ok: false, error: "unknown cmd: " + (msg && msg.cmd) };
    const t0 = performance.now();
    try {
      if (PERF_CMDS.has(msg.cmd)) await perfRig();
      const out = safeJson(await fn(msg.args || {}));
      return Object.assign({ ok: true, ms: r2(performance.now() - t0) }, out);
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  function pickCommands(comments, cutoff, seen) {
    const out = [];
    for (const c of comments || []) {
      if (!c || seen.has(c.id) || c.author_association !== "OWNER" || !(c.created_at >= cutoff)) continue;
      const m = CMD_RE.exec(c.body || "");
      if (!m) continue;
      let msg;
      try { msg = JSON.parse(m[1]); } catch (e) { msg = { cmd: null, parseError: e.message }; }
      out.push({ id: c.id, msg });
    }
    return out;
  }

  function gh(path, opts) {
    const o = opts || {};
    const headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + _run.token, "X-GitHub-Api-Version": "2022-11-28" };
    if (o.etag) headers["If-None-Match"] = o.etag;
    if (o.body) headers["Content-Type"] = "application/json";
    return fetch(API + "/repos/" + REPO + "/issues/" + _run.issue + path, {
      method: o.body ? "POST" : "GET", headers, body: o.body ? JSON.stringify(o.body) : undefined, cache: "no-store",
    });
  }
  const fence = (obj) => "```apex-result\n" + JSON.stringify(obj) + "\n```";

  async function post(obj) {
    const r = await gh("/comments", { body: { body: fence(obj) } });
    if (!r.ok) {
      let msg = "";
      try { msg = String((await r.json()).message || ""); } catch (_) {  }
      throw new Error("post " + r.status + (msg ? " " + msg.slice(0, 80) : ""));
    }
    return r.json();
  }

  async function pollOnce() {
    const run = _run;
    const r = await gh("/comments?per_page=100&since=" + encodeURIComponent(run.since), { etag: run.etag });
    if (r.status === 304) return 0;
    if (r.status === 401) { stop("token rejected"); setToken(""); return -1; }
    if (!r.ok) { run.backoff = Date.now() + BACKOFF_MS; say("poll " + r.status + ", backing off"); return -1; }
    run.etag = r.headers.get("etag") || null;
    const page = await r.json();
    let newest = run.since;
    for (const c of page || []) if (c && c.created_at > newest) newest = c.created_at;
    const cmds = pickCommands(page, run.cutoff, run.seen);
    for (const c of cmds) {
      if (_run !== run) break;
      run.seen.add(c.id);
      const res = await handle(c.msg);
      run.served++;
      paintBadge();
      await post(Object.assign({ re: c.id, cmd: c.msg && c.msg.cmd }, res));
    }
    if (_run === run) run.since = newest;
    return cmds.length;
  }

  function schedule() {
    const run = _run;
    if (!run) return;
    run.timer = setTimeout(async () => {
      if (_run !== run) return;
      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden && Date.now() >= run.backoff) {
        try { await pollOnce(); } catch (e) { run.backoff = Date.now() + POLL_MS * 3; say("poll failed " + e.message); }
      }
      if (_run === run) schedule();
    }, POLL_MS);
  }

  async function start(issue, tok) {
    if (_run) return false;
    _run = { issue, token: tok, cutoff: null, since: null, etag: null, seen: new Set(), served: 0, backoff: 0, timer: null, state: "connecting" };
    paintBadge();
    try {
      const hello = await post({ hello: true, facts: facts() });
      if (!_run) return false;
      _run.cutoff = _run.since = hello.created_at;
      _run.state = "live";
      paintBadge();
      say("linked to issue #" + issue);
      schedule();
      return true;
    } catch (e) {
      if (/^post 401\b/.test(e.message)) {
        setToken("");
        const why = "GitHub rejected the token (" + e.message.slice(5) + "; pasted text: " + tokenShape(tok) + ")";
        if (_run) stop(why);
        askToken(issue, why);
      } else if (_run) stop("could not reach GitHub (" + e.message + ")");
      return false;
    }
  }

  function stop(why) {
    if (!_run) return;
    clearTimeout(_run.timer);
    _run = null;
    say("link ended: " + (why || "stopped"));
    paintBadge(why || "ended");
  }

  function paintBadge(endedWhy) {
    if (typeof document === "undefined" || !document.body) return;
    if (!_badge) {
      _badge = document.createElement("button");
      _badge.id = "apex-bridge-badge";
      _badge.type = "button";
      _badge.style.cssText = "position:fixed;top:max(4px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);"
        + "z-index:99999;padding:4px 10px;border:0;border-radius:8px;font:600 11px/1.4 system-ui,sans-serif;"
        + "background:rgba(217,119,87,.9);color:#fff;letter-spacing:.06em";
      _badge.addEventListener("click", () => {
        if (_run) stop("ended on the phone");
        else { const issue = issueOf(location.search); if (issue) askToken(issue); }
      });
      document.body.appendChild(_badge);
    }
    _badge.textContent = _run ? "CLAUDE LINK " + (_run.state === "live" ? "· " + _run.served + " · TAP TO END" : "…")
      : "CLAUDE LINK OFF" + (endedWhy ? " — " + endedWhy : "");
    _badge.disabled = !_run && !!token();
  }

  function tokenShape(t) {
    const s = String(t || "");
    const odd = s.match(/[^A-Za-z0-9_]/g) || [];
    return s.length + " chars, " + (/^github_pat_/.test(s) ? "github_pat_" : /^gh[pousr]_/.test(s) ? s.slice(0, 4) : "unknown") + " prefix, "
      + odd.length + " odd char" + (odd.length === 1 ? "" : "s")
      + (odd.length ? " (" + odd.slice(0, 4).map((c) => "U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ") + ")" : "");
  }

  function askToken(issue, note) {
    if (typeof document === "undefined" || !document.body || document.getElementById("apex-bridge-token")) return;
    const el = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
    const dlg = el("dialog", "apex-bridge-link");
    dlg.id = "apex-bridge-token";
    dlg.style.cssText = "z-index:99999;width:min(92vw,420px);padding:14px;border:0;border-radius:12px;background:#1b1d22;"
      + "color:#eee;font:13px/1.45 system-ui,sans-serif;-webkit-user-select:text;user-select:text";
    const box = document.createElement("form");
    box.method = "dialog";
    box.style.cssText = "display:grid;gap:8px";
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = (note ? note + ". " : "") + "Link this phone to Claude through issue #" + issue + ". Paste a fine-grained GitHub token "
      + "(Issues: read and write, " + REPO + " only). It stays on this device.";
    const input = document.createElement("input");
    input.type = "password";
    input.id = "apex-bridge-token-input";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "GitHub token");
    input.style.cssText = "font:16px system-ui;padding:8px;border-radius:8px;border:1px solid #555;background:#000;color:#fff;"
      + "-webkit-user-select:text;user-select:text;touch-action:auto";
    const btnCss = "font:600 13px system-ui;padding:10px;border-radius:8px;border:0;color:#fff;touch-action:manipulation";
    const paste = document.createElement("button");
    paste.type = "button";
    paste.textContent = "PASTE";
    paste.style.cssText = btnCss + ";background:#444";
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "LINK";
    go.style.cssText = btnCss + ";background:#d97757";
    box.append(p, input, paste, go);
    dlg.appendChild(box);
    const shield = (e) => { if (dlg.contains(e.target)) e.stopImmediatePropagation(); };
    window.addEventListener("focusin", shield, true);
    const link = (t) => {
      t = String(t || "").trim();
      if (!t) return;
      window.removeEventListener("focusin", shield, true);
      setToken(t);
      try { dlg.close(); } catch (_) {  }
      dlg.remove();
      start(issue, t);
    };
    paste.addEventListener("click", async () => {
      try { link(await navigator.clipboard.readText()); } catch (e) { p.textContent = "Paste refused (" + (e && e.name) + "): long-press the box and Paste."; }
    });
    box.addEventListener("submit", (e) => { e.preventDefault(); link(input.value); });
    document.body.appendChild(dlg);
    try { dlg.showModal(); } catch (_) { dlg.setAttribute("open", ""); }
  }

  function boot() {
    if (typeof window === "undefined" || typeof location === "undefined") return false;
    const issue = issueOf(location.search);
    if (!issue) return false;
    const tok = token();
    if (!tok) { askToken(issue); return false; }
    start(issue, tok);
    return true;
  }

  boot();
  return { V, REPO, CALL_OK, CMDS, issueOf, handle, pickCommands, pollOnce, start, stop, boot, frames, facts, display, geom, tokenShape,
    active: () => !!_run };
})();
Object.freeze(ApexBridge);
