/* Apex 26 — ApexBridge: drive the live game on a real phone from a Claude session, through one GitHub issue.

   THE ROUTE. A phone and a Claude cloud container both refuse inbound connections, the container's proxy refuses
   WebSockets, public relays share one rate-limited proxy IP, and a claude.ai artifact cannot frame another site
   (docs/notes/PHONE-BRIDGE-2026-10-30.md). Both CAN reach api.github.com: the session posts a command as an issue
   comment (GitHub MCP), this page polls the thread and answers with a comment of its own.

   OPT-IN TWICE. It runs only with `?apex=1&bridge=<issue number>` (apex loads this LAZY_AGENT bundle) AND a token the
   owner pasted on this device (TOKEN_KEY): a fine-grained token limited to Issues on this one repository. The token
   never rides in a URL. With no token the page shows a paste box and polls nothing.

   WHO MAY COMMAND. Only comments whose author_association is OWNER, created after this page's own hello comment
   (server time, so a reload never replays old commands). A command is a fenced `apex-cmd` JSON block; the answer is a
   fenced `apex-result` block naming the command's comment id.

   NO EVAL. A command is one of CMDS; `call` reaches only the __apex methods in CALL_OK (perf, state reads, driving and
   renderer A/B toggles). Saves, career, garage files and every lobby / net hook are out. Replies are capped at
   MAX_REPLY chars (GitHub's comment limit is 65,536). The CLAUDE LINK badge counts commands; tapping it ends the link.

   PERF COMMANDS. `path` pins the three.js path BENCHMARK pins (BenchRun.pathPrefs) and reloads, `bench` starts and
   reads a BenchRun, `snap` returns a small JPEG of the canvas, `batch` runs up to BATCH_MAX steps from one comment.
   Recipes: .claude/skills/phone-browser/references/bridge.md. */
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
    // read
    "info", "perf", "physState", "obs", "world", "field", "scene", "probe", "viewState", "describe", "diag", "logs",
    "lifecycle", "timing", "trackInfo", "tracks", "menuPrep", "assets", "texCensus", "thermalDrift", "buildProfile",
    "raceProfile", "raceEntryProfile", "raceEntryStages", "frametimeBench", "renderClock", "envProbe", "lightState",
    "modelDiagnostics", "geometryDiagnostics", "agentHelp", "sectorState", "lapHistory",
    // drive
    "race", "go", "jump", "park", "rollout", "setInput", "clearInput", "freeze", "seed", "setTimeOfDay", "weather",
    // renderer A/B
    "renderRate", "renderScale", "gpuTimer", "govHold", "mirror", "occlusionCull", "multiDraw", "spatialUpscale",
    "matTex", "meshToggle", "stats",
  ]);

  let _run = null, _badge = null;

  function say(msg) {
    try { Log.info("apex", "[bridge] " + msg); } catch (_) { /* Log may not be up */ }
  }
  // The issue number from `?bridge=<n>`, or 0.
  function issueOf(search) {
    const m = /[?&]bridge=(\d+)(&|$)/.exec(search || "");
    return m ? Number(m[1]) : 0;
  }
  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; }
  }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) { /* blocked */ }
  }

  function pct(sorted, p) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

  // rAF interval stats over `seconds` (clamped 1–60): what the page really gets, unlike the governor's smoothed fps.
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
          if (obs) try { obs.disconnect(); } catch (_) { /* gone */ }
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

  // apex26.* storage through GameStore when it is up (its broken-storage bookkeeping), else localStorage.
  const gs = () => (typeof GameStore !== "undefined" && GameStore.store ? GameStore.store : null);
  function raw(k) { try { const s = gs(); return s ? s.raw(k) : localStorage.getItem(k); } catch (_) { return null; } }
  function rawSet(k, v) {
    const s = gs();
    try { if (v == null) { if (s) s.rawDel(k); else localStorage.removeItem(k); } else if (s) s.rawSet(k, v); else localStorage.setItem(k, v); } catch (_) { /* blocked */ }
  }
  const later = (fn) => { setTimeout(fn, 500); };

  // The renderer pin BENCHMARK uses (BenchRun.pathPrefs): three.js on WebGPU or WebGL2, or AUTO. THREE PATH is chosen
  // only at boot, so a change reloads (`reload: false` to stage it) and the link re-forms with a new hello.
  const PATHS = ["webgpu", "webgl2", "auto"];
  function pathState() {
    const RP = typeof RendererPicker !== "undefined" ? RendererPicker : null;
    let live = null, engine = null, fallbackWhy = null;
    try { live = RP ? RP.liveThreeApi() || RP.liveBackend() : null; } catch (_) { /* not booted */ }
    try { engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { /* no canvas */ }
    try { fallbackWhy = sessionStorage.getItem("apex26.gfxFallbackWhy"); } catch (_) { /* private mode */ }
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
    try { for (const k of (typeof RendererPicker !== "undefined" && RendererPicker.RENDERER_SS_KEYS) || []) sessionStorage.removeItem(k); } catch (_) { /* private mode */ }
    const reloading = args.reload !== false;
    if (reloading) later(() => location.reload());
    return { was, pinned: p, reloading };
  }

  // SETTINGS > GRAPHICS > BENCHMARK (BenchRun). start reloads per leg; each reload re-links with a new hello, and the
  // plan (BenchRun.KEY) carries the run across them. `result` is the summary; `leg` one leg in full.
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

  // A downscaled JPEG of what the player sees, as a data URL under SNAP_MAX chars (the reply cap minus the envelope).
  // Drawn inside a rAF callback queued after the game's own, so a WebGL / WebGPU canvas without preserveDrawingBuffer
  // still holds this frame. Quality steps down until the image fits.
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

  // Several steps in one comment: one 4 s round trip instead of one each. Stops at the first failure; `reload` and
  // a `path` change may only be the last step (the page is gone after them).
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

  async function handle(msg) {
    const fn = msg && Object.prototype.hasOwnProperty.call(CMDS, msg.cmd) ? CMDS[msg.cmd] : null;
    if (!fn) return { ok: false, error: "unknown cmd: " + (msg && msg.cmd) };
    const t0 = performance.now();
    try {
      const out = safeJson(await fn(msg.args || {}));
      return Object.assign({ ok: true, ms: r2(performance.now() - t0) }, out);
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  // The owner's apex-cmd comments created at or after `cutoff` (ISO, server time) that are not in `seen`, oldest first.
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
    if (!r.ok) throw new Error("post " + r.status);
    return r.json();
  }

  async function pollOnce() {
    const run = _run;
    // `since` (run.since) walks forward; `cutoff` stays the hello's time, the floor a command must be created after.
    const r = await gh("/comments?per_page=100&since=" + encodeURIComponent(run.since), { etag: run.etag });
    if (r.status === 304) return 0;
    if (r.status === 401) { stop("token rejected"); setToken(""); return -1; }
    if (!r.ok) { run.backoff = Date.now() + BACKOFF_MS; say("poll " + r.status + ", backing off"); return -1; }
    run.etag = r.headers.get("etag") || null;
    const page = await r.json();
    // Advance the window to the newest comment on this page, so the next poll reads PAST it: a fixed `since` served
    // page 1 (100 comments) forever and re-parsed the whole thread. The newest CREATED time is the safe bound — every
    // comment not yet listed was created after it (the list is oldest first), so its updated_at is too, while an
    // edited old comment's updated_at could jump past them. `since` is inclusive: the boundary comment comes back once
    // more and `seen` drops it.
    for (const c of page || []) if (c && c.created_at > run.since) run.since = c.created_at;
    const cmds = pickCommands(page, run.cutoff, run.seen);
    for (const c of cmds) {
      if (_run !== run) break;
      run.seen.add(c.id);
      const res = await handle(c.msg);
      run.served++;
      paintBadge();
      await post(Object.assign({ re: c.id, cmd: c.msg && c.msg.cmd }, res));
    }
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
      schedule();
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
      if (_run) stop("could not reach GitHub (" + e.message + ")");
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
      _badge.addEventListener("click", () => stop("ended on the phone"));
      document.body.appendChild(_badge);
    }
    _badge.textContent = _run ? "CLAUDE LINK " + (_run.state === "live" ? "· " + _run.served + " · TAP TO END" : "…")
      : "CLAUDE LINK OFF" + (endedWhy ? " — " + endedWhy : "");
    _badge.disabled = !_run;
  }

  // No token on this device yet: one paste box. The token stays in this browser's storage only.
  // The game's focus trap (TopModal.onFocusIn, a document-capture focusin) pulls focus back into the top screen, so a
  // plain box on <body> lost the iOS keyboard the moment it was tapped and a modal screen made it inert. The box is
  // its own modal <dialog> (top layer, never inert), a window-capture focusin listener stops that trap seeing focus
  // inside it, and PASTE reads the clipboard directly (iOS asks once) for when typing still fails.
  function askToken(issue) {
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
    p.textContent = "Link this phone to Claude through issue #" + issue + ". Paste a fine-grained GitHub token "
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
      try { dlg.close(); } catch (_) { /* not open */ }
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
  return { V, REPO, CALL_OK, CMDS, issueOf, handle, pickCommands, pollOnce, start, stop, boot, frames, facts,
    active: () => !!_run };
})();
Object.freeze(ApexBridge);
