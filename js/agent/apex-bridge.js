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
   MAX_REPLY chars (GitHub's comment limit is 65,536). The CLAUDE LINK badge counts commands; tapping it ends the link. */
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
      apex: !!window.__apex, info,
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

  const CMDS = {
    ping: () => ({ pong: true, t: Date.now() }),
    facts,
    frames,
    call,
    gpuTest: (a) => perfModule("GpuTestRun", typeof GpuTestRun !== "undefined" ? GpuTestRun : null, ["start", "stop", "status", "active"], a),
    recorder: (a) => perfModule("PhoneRecorder", typeof PhoneRecorder !== "undefined" ? PhoneRecorder : null, ["start", "stop", "isOn", "json"], a),
    reload: () => { setTimeout(() => location.reload(), 500); return { reloading: true }; },
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
    const r = await gh("/comments?per_page=100&since=" + encodeURIComponent(run.cutoff), { etag: run.etag });
    if (r.status === 304) return 0;
    if (r.status === 401) { stop("token rejected"); setToken(""); return -1; }
    if (!r.ok) { run.backoff = Date.now() + BACKOFF_MS; say("poll " + r.status + ", backing off"); return -1; }
    run.etag = r.headers.get("etag") || null;
    const cmds = pickCommands(await r.json(), run.cutoff, run.seen);
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
    _run = { issue, token: tok, cutoff: null, etag: null, seen: new Set(), served: 0, backoff: 0, timer: null, state: "connecting" };
    paintBadge();
    try {
      const hello = await post({ hello: true, facts: facts() });
      if (!_run) return false;
      _run.cutoff = hello.created_at;
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
  function askToken(issue) {
    if (typeof document === "undefined" || !document.body || document.getElementById("apex-bridge-token")) return;
    const box = document.createElement("form");
    box.id = "apex-bridge-token";
    box.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99999;width:min(92vw,420px);"
      + "padding:14px;border-radius:12px;background:#1b1d22;color:#eee;font:13px/1.45 system-ui,sans-serif;display:grid;gap:8px";
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = "Link this phone to Claude through issue #" + issue + ". Paste a fine-grained GitHub token "
      + "(Issues: read and write, " + REPO + " only). It stays on this device.";
    const input = document.createElement("input");
    input.type = "password";
    input.id = "apex-bridge-token-input";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "GitHub token");
    input.style.cssText = "font:inherit;padding:8px;border-radius:8px;border:1px solid #555;background:#000;color:#fff";
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "LINK";
    go.style.cssText = "font:600 13px system-ui;padding:8px;border-radius:8px;border:0;background:#d97757;color:#fff";
    box.append(p, input, go);
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      setToken(t);
      box.remove();
      start(issue, t);
    });
    document.body.appendChild(box);
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
