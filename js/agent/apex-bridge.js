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

   NO EVAL. A command is one of CMDS. `call` reaches any __apex method but the CALL_DENY ones; `tap` / `set` / `nav`
   press or set any visible, enabled control outside the TAP_DENY areas (UI NAVIGATION below); `key` / `scroll` act
   on the focused element or a visible one. Saves, career, garage files, every lobby / net hook and the link's own
   token form are out, by deny-list. Replies are capped at
   MAX_REPLY chars (GitHub's comment limit is 65,536). The CLAUDE LINK badge counts commands; tapping it ends the link.

   DRIVING. `drive` gives the car to SoakRun's driver (to the pit box, or an autopilot lap) and takes it back on `stop`,
   a pause, a quit, a hidden page or a real touch (DRIVING below).

   PERF COMMANDS. `path` pins the three.js path BENCHMARK pins (BenchRun.pathPrefs) and reloads, `bench` starts and
   reads a BenchRun, `snap` returns a small JPEG of the canvas, `batch` runs up to BATCH_MAX steps from one comment.
   Recipes: .claude/skills/phone-bridge/references/commands.md. */
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
  // `call` reaches EVERY __apex method except these (Bryce 2026-11-25, "Broad allow-list"; was an allow-list of 50):
  // saves and files (save, persistState, settingsFile, garageFile), career, the lobby and net, a write of the garage's
  // stored parts (garageParts), a URL the page would fetch (loadCarModel). A prefix denies every method it starts.
  // Nothing in __apex evaluates a string, and JSON carries no function, so `call` stays eval-free.
  const CALL_DENY_PREFIX = ["save", "persist", "settingsFile", "garageFile", "career", "lobby", "net"];
  const CALL_DENY = new Set(["garageParts", "loadCarModel", "eval"]);
  function callAllowed(m) {
    return typeof m === "string" && /^[a-z][A-Za-z0-9]{0,40}$/.test(m) && !(m in Object.prototype) &&
      !CALL_DENY.has(m) && !CALL_DENY_PREFIX.some((p) => m.startsWith(p));
  }

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

  // The resolution ledger for a "looks pixelated" report (#5166): every layer between a CSS pixel and a device pixel,
  // read on the device. Painted px per CSS px of HUD text = the zoom chain's product × visualViewport.scale × dpr; the
  // 3D canvas backing = its CSS size × dpr × the governor's render scale. The SW cache names say which build this phone
  // holds; `standalone` tells the Home Screen app from Safari.
  async function display() {
    const d = typeof document !== "undefined" ? document : null;
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const cs = (el) => { try { return el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null; } catch (_) { return null; } };
    const rect = (el) => { try { const r = el.getBoundingClientRect(); return [r2(r.width), r2(r.height)]; } catch (_) { return null; } };
    const mq = (q) => { try { return typeof matchMedia === "function" ? matchMedia(q).matches : null; } catch (_) { return null; } };
    const el = (id) => (d && d.getElementById ? d.getElementById(id) : null);
    const name = (e) => (e.id ? "#" + e.id : String(e.tagName || "?").toLowerCase());
    // Every ancestor (the element included) whose zoom is not 1 or whose transform is not none, root-most last, and
    // the product of those zooms: what multiplies this element's CSS px before dpr.
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

  // The geometry ledger (docs/notes/GEOMETRY-TRUTH-HUNT-2026-11-09.md): what the DEVICE reports for every number the UI
  // contract assumes, read on the phone because Chromium emulation cannot answer for WebKit. `zoom` is a self-test of
  // CSS zoom semantics on this engine (a 100 px box at zoom 2: rect 200 = standardized, 100 = legacy; whether vw and
  // env() lengths inside it are multiplied by the zoom). `wish` vs `paint` is each slider's stored value against the
  // fit cap it actually paints at. Read-only: the probe node is removed before the function returns.
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
      c.style.cssText = "box-sizing:content-box;width:10vw;height:1px;padding-left:env(safe-area-inset-left,0px)";
      p.appendChild(c);
      const cr = c.getBoundingClientRect(), vw = out.units.vw || 0, cps = getComputedStyle(c);
      out.zoom = {
        currentCSSZoom: typeof p.currentCSSZoom === "number" ? p.currentCSSZoom : null,
        rectOf100At2: r2(z.width), offsetOf100At2: p.offsetWidth,
        vwInZoom2: vw ? r2((cr.width - parseFloat(cps.paddingLeft) * (z.width / 100)) / (vw / 10)) : null,   // painted 10vw ÷ real 10vw: 2 = vw is multiplied
        envInZoom2: out.insets.left ? r2(parseFloat(cps.paddingLeft) * (z.width / 100) / out.insets.left) : null,   // painted inset ÷ real inset
      };
    } catch (err) { out.error = String(err && err.message); }
    try { p.remove(); } catch (_) { /* detached already */ }
    out.tiers = { density: body.getAttribute("data-density"), shape: body.getAttribute("data-shape"), desktop: !!(body.classList && body.classList.contains("desktop")),
      html: root.dataset ? Object.assign({}, root.dataset) : null };
    out.wish = { ui: v("--ui-scale"), hud: v("--hud-scale"), btn: v("--hud-btn-scale"), textBoost: v("--hud-text-boost") };
    out.paint = { hudTop: v("--hud-z-top"), hudBot: v("--hud-z-bot"), dock: v("--hud-z-dock"), dockLeft: v("--hud-z-dock-l"), sheet: v("--sheet-scale"), kb: v("--kb"),
      gut: v("--gut"), sal: v("--sal"), sar: v("--sar"), sat: v("--sat"), sab: v("--sab") };
    return out;
  }

  function call(args) {
    const m = args && args.method;
    if (!callAllowed(m)) throw new Error("method not allowed: " + m);
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
  // Every media bucket a phone-landscape rule in css/ keys on (the band edges at 380/400/500/560 and 700/761/900).
  const GEOM_MEDIA = ["(pointer: coarse)", "(hover: hover)", "(any-pointer: fine)", "(orientation: landscape)", "(max-height: 380px)", "(max-height: 400px)",
    "(max-height: 500px)", "(max-height: 560px)", "(min-width: 700px)", "(min-width: 761px)", "(min-width: 900px)"];
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
  // Quality steps down until the image fits. A WebGL / WebGPU canvas without preserveDrawingBuffer is readable only in
  // the task that PRESENTED it, and a bare rAF read can land before the game's draw or on a frame RenderRate skipped:
  // the first snap after an idle gap came back solid black (#6417). So wait for the renderer's own next present
  // (awaitSoftPresent(ms, "frame") resolves from inside present(); on the soft overlay, a newer blit) and read in that
  // continuation with no await between. `fresh` says which: "frame", "blit", "stale" (nothing presented: paused) or
  // "raf" (no renderer hook).
  const SNAP_MAX = 56000, SNAP_WAIT_MS = 1500;
  function snapRead(args, w, fresh) {
    const soft = document.getElementById("game-soft");
    const src = soft && !soft.hidden && soft.width ? soft : document.getElementById("game");
    if (!src || !src.width || !src.height) throw new Error("no rendered canvas");
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.max(1, Math.round(src.height * w / src.width));
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    for (let q = Number(args && args.q) || 0.6; q >= 0.1; q = Math.round((q - 0.1) * 10) / 10) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= SNAP_MAX) return { w: c.width, h: c.height, q, from: src.id, fresh, chars: url.length, jpeg: url };
    }
    throw new Error("snapshot over " + SNAP_MAX + " chars at q 0.1; ask a smaller w");
  }
  async function snap(args) {
    const w = Math.max(64, Math.min(640, Number(args && args.w) || 320));
    const R = typeof GLX !== "undefined" && GLX && typeof GLX.awaitSoftPresent === "function" ? GLX : null;
    if (!R) { await new Promise((res) => requestAnimationFrame(res)); return snapRead(args, w, "raf"); }
    const soft = typeof R.softPresent === "function" && !!R.softPresent();
    let fresh;
    try {
      if (soft && typeof R.invalidateSoftPresent === "function") R.invalidateSoftPresent({ capture: true });   // ask for the blit
      const r = await (soft ? R.awaitSoftPresent(SNAP_WAIT_MS) : R.awaitSoftPresent(SNAP_WAIT_MS, "frame"));
      fresh = r === "stale" ? "stale" : soft ? "blit" : "frame";
    } catch (_) { fresh = "stale"; }
    return snapRead(args, w, fresh);   // synchronous: still inside the presenting task
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
      if (!r.ok || (r.value && r.value.ok === false)) break;   // a tap / nav that did not arrive stops the batch too
    }
    return out;
  }

  // UI NAVIGATION (#6383). `tap` presses ONE control the player uses — by id, label text, data attribute, or a circuit tile by
  // track id — with the real event sequence (pointerdown, pointerup, click) on the real element, so the same handlers,
  // focus moves and timers run as for a thumb. `nav` chains taps through a whole route and waits for each screen. Neither
  // sets game state nor takes a CSS selector, and nothing inside a TAP_DENY area (career, saves, garage files, the
  // lobby and net, the token form) can be pressed.
  // A synthetic tap carries no user activation: audio unlock, haptics, tilt permission and fullscreen stay as they were.
  const ROWS = ["laps", "weather", "mixed", "time", "diff", "quali", "caution", "reliab", "line", "tyres", "dirty"];
  // THE DENY-LIST (Bryce 2026-11-25, "Broad allow-list"): any visible, enabled control the player can press, EXCEPT
  // what is inside these areas: saves and data, career, VS FRIEND / phone pairing (net), the garage and career files,
  // and this link's own token form and badge. An id matches itself and every `<id>-…` below it, on the control or any
  // ancestor, so the doors into an area (mb-career, pm-open-files) are refused with what is behind them.
  const TAP_DENY = [
    "career", "cr-career", "mb-career", "mb-continue",                                  // career
    "save", "mb-saves", "pm-open-files", "pm-panel-files", "pm-files", "pm-settings-file", "pm-other-save-files",
    "pm-share-code", "pm-restore", "pm-checkpoint-save", "cs-garage-file", "cs-garage-reset", "ct-import",   // saves & files
    "vs", "vsfriend", "mb-vs", "mb-phonepad", "pm-phonepad", "mb-steerphone",           // net: VS FRIEND, phone pairing
    "bridge-link", "apex-bridge",                                                         // the token form and the badge
  ];
  const CONTROL_TAGS = new Set(["BUTTON", "A", "SUMMARY", "INPUT", "SELECT", "LABEL", "OPTION"]);
  const CONTROL_ROLES = new Set(["button", "tab", "switch", "menuitem", "menuitemradio", "menuitemcheckbox", "option", "checkbox", "radio", "link", "slider"]);
  const CONTROLS = 'button,a,summary,input,select,label,[role],[data-track-idx],[tabindex]';
  // Topmost first: the first visible one names the screen; none = the race itself (info().state).
  const SCREENS = [["results", "results"], ["pausemenu", "pause"], ["quali", "quali"], ["race-settings", "setup"],
    ["loading", "loading"], ["carsetup", "garage"], ["select", "select"], ["overlay", "title"]];
  const NAV_STEP_MS = 20000, NAV_GO_MS = 60000;
  const byId = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);
  function shown(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.hidden) return false;
      try { if (typeof getComputedStyle === "function") { const st = getComputedStyle(e); if (st.display === "none" || (e === el && st.visibility === "hidden")) return false; } } catch (_) { /* detached */ }
    }
    return !!el;
  }
  function gameState() { try { return window.__apex && window.__apex.info ? window.__apex.info().state : null; } catch (_) { return null; } }
  function door() {
    try { const p = window.__apex && window.__apex.menuPrep ? window.__apex.menuPrep() : null; return p ? p.door || null : null; } catch (_) { return null; }
  }
  // The garage drive-out plays while the game state is still "menu": the door read says when it is up.
  function screenNow() {
    for (const [id, name] of SCREENS) if (shown(byId(id))) return name;
    const st = gameState();
    if (st === "menu" && (door() || {}).driveOut) return "drive-out";
    return st === "count" || st === "race" ? "race" : st;
  }
  function tileFor(track) {
    if (!/^[a-z0-9_-]{1,40}$/.test(String(track || ""))) throw new Error("tile must be a track id");
    const T = typeof Tracks !== "undefined" ? Tracks : null;
    const i = T && T.LIST ? T.LIST.findIndex((t) => t && t.id === track) : -1;
    if (i < 0) throw new Error("unknown track: " + track);
    const strip = byId("sel-tracks");
    for (const r of (strip && strip.children) || []) if (r.dataset && r.dataset.trackIdx === String(i)) return r;
    throw new Error("no " + track + " tile on the picker (open SELECT first)");
  }
  function press(el) {
    const mk = (type) => (typeof PointerEvent === "function"
      ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, button: 0 })
      : new Event(type, { bubbles: true, cancelable: true }));
    el.dispatchEvent(mk("pointerdown"));
    el.dispatchEvent(mk("pointerup"));
    el.click();
  }
  const attr = (el, k) => (el && typeof el.getAttribute === "function" ? el.getAttribute(k) : null);
  function deniedArea(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const id = e.id || "";
      if (id && TAP_DENY.some((p) => id === p || id.startsWith(p + "-"))) return id;
    }
    return null;
  }
  function isControl(el) {
    return CONTROL_TAGS.has(el.tagName) || CONTROL_ROLES.has(attr(el, "role")) || (el.dataset && el.dataset.trackIdx != null) || attr(el, "tabindex") != null;
  }
  const norm = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().toUpperCase();
  const labelOf = (el) => norm(attr(el, "aria-label") || el.textContent || attr(el, "value") || "");
  // One element from { id } | { tile } | { text } | { data: {name: value} } (+ `within`: an id to search under, `nth`).
  function findEl(a) {
    if (a.tile != null) return [tileFor(a.tile), "tile:" + a.tile];
    if (a.id != null) {
      if (!/^[A-Za-z][\w-]{0,80}$/.test(String(a.id))) throw new Error("id must be an element id (letters, digits, - and _)");
      const el = byId(a.id);
      if (!el) throw new Error("#" + a.id + " not in the page");
      return [el, a.id];
    }
    const data = a.data && typeof a.data === "object" ? Object.entries(a.data) : null;
    if (a.text == null && !data) throw new Error("name the control: id, tile, text or data");
    if (data && (!data.length || data.length > 3 || data.some(([k, v]) => !/^[a-z][a-z0-9-]{0,40}$/.test(k) || String(v).length > 80))) throw new Error("data takes 1-3 {name: value} pairs (data-<name>)");
    const root = a.within != null ? byId(a.within) : document;
    if (!root || typeof root.querySelectorAll !== "function") throw new Error(a.within != null ? "#" + a.within + " not in the page" : "no document to search");
    const want = a.text != null ? norm(a.text) : null;
    if (want === "") throw new Error("text is empty");
    const pool = Array.from(root.querySelectorAll(CONTROLS)).filter((el) => shown(el) && !deniedArea(el) &&
      (!data || data.every(([k, v]) => attr(el, "data-" + k) === String(v))));
    let hits = want == null ? pool : pool.filter((el) => labelOf(el) === want);
    if (want != null && !hits.length) hits = pool.filter((el) => labelOf(el).startsWith(want));
    const what = want != null ? "text:" + want : "data:" + data.map(([k, v]) => k + "=" + v).join(",");
    if (!hits.length) throw new Error("no visible control matches " + what);
    if (a.nth != null && !(Number.isInteger(a.nth) && a.nth >= 0)) throw new Error("nth must be a whole number from 0");
    const nth = a.nth != null ? a.nth : null;
    if (hits.length > 1 && nth == null) throw new Error(hits.length + " controls match " + what + " (" + hits.slice(0, 6).map((h) => h.id || h.tagName).join(", ") + "): add nth or within");
    const el = hits[nth || 0];
    if (!el) throw new Error("nth " + nth + " is past the " + hits.length + " matches");
    return [el, el.id || what];
  }
  // The checks every press and every set makes: shown, enabled, a control, outside the denied areas.
  function usable(el, what) {
    const area = deniedArea(el);
    if (area) throw new Error(what + " is refused: inside #" + area + " (saves, career, net or the link)");
    if (!isControl(el)) throw new Error(what + " is not a control");
    const forEl = el.tagName === "LABEL" ? (el.control || (attr(el, "for") ? byId(attr(el, "for")) : null)) : el;
    if (forEl && forEl.tagName === "INPUT" && forEl.type === "file") throw new Error(what + " opens a file picker");
    if (el.tagName === "A" && attr(el, "href") && !String(attr(el, "href")).startsWith("#")) throw new Error(what + " leaves the game");
    if (!shown(el)) throw new Error(what + " is not visible (screen " + screenNow() + ")");
    if (el.disabled || attr(el, "aria-disabled") === "true") throw new Error(what + " is disabled");
    return el;
  }
  function tapEl(args) {
    const [el, what] = findEl(args || {});
    press(usable(el, what));
    return what;
  }
  const pause = (ms) => new Promise((res) => setTimeout(res, ms));
  async function until(pred, ms) {
    const end = Date.now() + ms;
    for (;;) {
      let v = false;
      try { v = pred(); } catch (_) { v = false; }
      if (v) return true;
      if (Date.now() >= end) return false;
      await pause(100);
    }
  }
  const SCREEN_NAMES = new Set(SCREENS.map((s) => s[1]).concat(["drive-out", "race"]));
  async function tap(args) {
    const a = args || {};
    if (a.until != null && !SCREEN_NAMES.has(a.until)) throw new Error("tap.until must be one of " + [...SCREEN_NAMES].join(", "));
    const what = tapEl(a);
    const ms = Math.max(0, Math.min(NAV_GO_MS, Number(a.ms) || NAV_STEP_MS));
    const ok = a.until == null ? true : await until(() => screenNow() === a.until, ms);
    return { tapped: what, screen: screenNow(), state: gameState(), ok };
  }
  // One SettingRow (rs-<row>): tap its › chevron until the select reads `want`, at most once per option.
  async function setRow(row, want) {
    const sel = byId("rs-" + row + "-sel");
    if (!sel) throw new Error("rs-" + row + " not in the page");
    const values = Array.from(sel.options || []).map((o) => o.value);
    if (!values.includes(String(want))) throw new Error(row + " must be one of " + values.join(", "));
    if (sel.disabled) throw new Error(row + " is locked on this session");
    for (let k = 0; k <= values.length && sel.value !== String(want); k++) { tapEl({ id: "rs-" + row + "-next" }); await pause(60); }
    if (sel.value !== String(want)) throw new Error(row + " stuck at " + sel.value);
    return sel.value;
  }
  // SET (Bryce 2026-11-25). { id | text | data, value }: a control through its own UI path — a SettingRow's › chevron
  // (its handler stores and applies the value, as a thumb does), a <select>'s change, a checkbox's click, a range's
  // input + change. { key, value }: a preference by its SETTINGS FILE key (SettingsExport.SPEC: preferences only, by
  // construction never the garage, saves or accounts), written the way a settings-file import writes it. Most screens
  // read a stored key at the next reload, so that reply says `reload: true` (send `reload` after the last one).
  const SET_KEY_DENY = /token|career|save|slot|lobby|net|relay|turn|spotify|account/i;
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  async function setControl(el, what, want) {
    if (el.tagName === "SELECT") {
      const values = Array.from(el.options || []).map((o) => o.value);
      if (!values.includes(String(want))) throw new Error(what + " must be one of " + values.join(", "));
      const sib = Array.from((el.parentElement && el.parentElement.children) || []).find((c) => attr(c, "data-step") === "1");
      const next = sib || (el.id && el.id.endsWith("-sel") ? byId(el.id.slice(0, -4) + "-next") : null);
      if (next && shown(next) && !next.disabled) {
        for (let k = 0; k <= values.length && el.value !== String(want); k++) { press(next); await pause(60); }
      } else if (el.value !== String(want)) { el.value = String(want); fire(el, "input"); fire(el, "change"); }
      if (el.value !== String(want)) throw new Error(what + " stuck at " + el.value);
      return el.value;
    }
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      if (typeof want !== "boolean") throw new Error(what + " takes true or false");
      if (!!el.checked !== want) press(el);
      return !!el.checked;
    }
    if (el.tagName === "INPUT" && (el.type === "range" || el.type === "number")) {
      const n = Number(want);
      if (!Number.isFinite(n)) throw new Error(what + " takes a number");
      el.value = String(n); fire(el, "input"); fire(el, "change");
      return Number(el.value);
    }
    throw new Error(what + " is not a select, checkbox, radio or range");
  }
  // The SETTINGS FILE import's own rules (settings-export-body.js applySettings): never an `info` row (a migration
  // version) or a `noImport` one, a row's `normalize` first, then its type and `oneOf`. Tables (an object or computed
  // default) are set on their own screen, and a row with no default to type-check needs a `oneOf`.
  function setKey(key, value) {
    const SE = typeof SettingsExport !== "undefined" ? SettingsExport : null, S = gs();
    if (!SE || !Array.isArray(SE.SPEC) || !S) throw new Error("the settings store is not up");
    if (typeof key !== "string" || SET_KEY_DENY.test(key)) throw new Error("key not allowed: " + key);
    const row = SE.SPEC.find((r) => r && r.k === key);
    if (!row || row.info || row.noImport) throw new Error("not a settings key: " + key + " (the SPEC rows in js/ui/settings-export.js)");
    const def = row.def;
    if (typeof def === "function" || (def !== null && typeof def === "object")) throw new Error(key + " is a table: set it on its own screen");
    if (value !== null && typeof value === "object") throw new Error(key + " takes a single value");
    let v = value;
    if (v !== null && row.normalize) { v = row.normalize(v); if (v === undefined) throw new Error(key + ": " + JSON.stringify(value) + " is not a value it takes"); }
    if (v !== null && def == null && !row.oneOf) throw new Error(key + " has no type to check: set it on its own screen");
    if (v !== null && def != null && typeof v !== typeof def) throw new Error(key + " takes a " + typeof def);
    if (v !== null && row.oneOf && !row.oneOf.some((o) => o === v)) throw new Error(key + " must be one of " + row.oneOf.join(", "));
    if (typeof v === "string" && v.length > 200) throw new Error(key + ": value too long");
    const rk = "apex26." + key, read = () => (row.lane === "raw" ? S.raw(rk) : S.get(key, undefined));
    const was = read();
    const ok = row.lane === "raw" ? (v === null ? S.rawDel(rk) : S.rawSet(rk, String(v))) : S.set(key, v === null ? undefined : v);
    if (ok === false) throw new Error("storage refused the write");
    const now = read();
    return { key, was: was === undefined ? null : was, now: now === undefined ? null : now, reload: true };
  }
  async function set(args) {
    const a = args || {};
    if (!Object.prototype.hasOwnProperty.call(a, "value")) throw new Error("set needs a value");
    if (a.key != null) return setKey(a.key, a.value);
    const [el, what] = findEl(a);
    usable(el, what);
    return { set: what, value: await setControl(el, what, a.value), screen: screenNow() };
  }
  // KEY / SCROLL. `key` sends one keydown + keyup (synthetic: not trusted, so it never ends a `drive`) to the focused
  // element or a named one; `scroll` moves a visible element, or the page, by px, to its top / bottom, or brings an
  // element into view.
  const KEYS = ["Escape", "Enter", "Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Backspace"];
  function key(args) {
    const a = args || {};
    if (!KEYS.includes(a.key)) throw new Error("key must be one of " + KEYS.join(", "));
    const el = a.id != null ? usable(findEl({ id: a.id })[0], a.id) : (document.activeElement || document.body);
    if (!el) throw new Error("nothing has the focus");
    if (deniedArea(el)) throw new Error("key refused: the focus is inside #" + deniedArea(el));
    // A key on the body reaches the page's global handlers, which act for whatever screen is up: not while a denied one is.
    const up = a.id == null && (el === document.body || el === document.documentElement) ? TAP_DENY.find((p) => shown(byId(p))) : null;
    if (up) throw new Error("key refused: #" + up + " is on screen and nothing in it has the focus");
    const k = a.key === "Space" ? " " : a.key;
    const init = { key: k, code: a.key, bubbles: true, cancelable: true, shiftKey: !!a.shift };
    const KE = typeof KeyboardEvent === "function" ? KeyboardEvent : Event;
    const go = el.dispatchEvent(new KE("keydown", init));
    el.dispatchEvent(new KE("keyup", init));
    return { key: a.key, to: el.id || el.tagName || "document", prevented: !go, screen: screenNow() };
  }
  function scroll(args) {
    const a = args || {};
    let el = null;
    if (a.id != null) {
      el = findEl({ id: a.id })[0];
      if (deniedArea(el)) throw new Error("scroll refused: inside #" + deniedArea(el));
      if (!shown(el)) throw new Error(a.id + " is not visible");
    } else el = document.scrollingElement || document.documentElement;
    if (a.into) { if (a.id == null) throw new Error("into needs an id"); el.scrollIntoView({ block: "center" }); }
    else if (a.to === "top") el.scrollTop = 0;
    else if (a.to === "bottom") el.scrollTop = el.scrollHeight;
    else if (Number.isFinite(Number(a.by)) && a.by != null) el.scrollTop += Number(a.by);
    else throw new Error("scroll takes by (px), to top / bottom, or into:true with an id");
    return { scrolled: a.id || "page", top: Math.round(el.scrollTop || 0), height: el.scrollHeight || 0, view: el.clientHeight || 0 };
  }
  const FLOWS = { tt: "mb-tt", race: "mb-race" };
  async function nav(args) {
    const a = args || {};
    const entry = a.entry || "setup";
    if (!["setup", "garage", "daily"].includes(entry)) throw new Error("nav.entry must be setup, garage or daily");
    const flow = a.flow || "tt";
    if (!FLOWS[flow]) throw new Error("nav.flow must be tt or race");
    if (entry === "daily" && (flow !== "tt" || a.track != null || a.weather != null || a.tod != null)) throw new Error("daily pins its own circuit, weather and hour (flow tt, no track/weather/tod)");
    if (entry !== "daily" && a.track == null) throw new Error("nav.track is required");
    const steps = [];
    const t0 = Date.now();
    const step = async (name, act, wantScreen, ms) => {
      const s0 = Date.now();
      let out = null;
      try { out = await act(); } catch (e) { steps.push({ step: name, ok: false, screen: screenNow(), error: String(e.message || e) }); return false; }
      const ok = wantScreen ? await until(typeof wantScreen === "function" ? wantScreen : () => screenNow() === wantScreen, ms || NAV_STEP_MS) : true;
      steps.push(Object.assign({ step: name, ok, screen: screenNow(), ms: Date.now() - s0 }, out != null && out !== true ? { value: out } : {}));
      return ok;
    };
    const done = (ok) => ({ ok, flow, entry, screen: screenNow(), state: gameState(), ms: Date.now() - t0, steps, door: door() });
    if (screenNow() !== "title") throw new Error("nav starts on the title screen (now " + screenNow() + ")");
    const go = [
      () => step(entry === "daily" ? "mb-daily" : FLOWS[flow], () => tapEl({ id: entry === "daily" ? "mb-daily" : FLOWS[flow] }), "select"),
    ];
    if (entry !== "daily") go.push(() => step("tile:" + a.track, () => { tapEl({ tile: a.track }); },
      () => tileFor(a.track).getAttribute("aria-pressed") === "true"));
    if (entry === "garage") {
      go.push(() => step("sel-car", () => tapEl({ id: "sel-car" }), "garage"));
      go.push(() => step("cs-done", () => tapEl({ id: "cs-done" }), "setup"));
    } else go.push(() => step("sel-go", () => tapEl({ id: "sel-go" }), "setup"));
    if (a.weather != null) go.push(() => step("weather", () => setRow("weather", a.weather)));
    if (a.tod != null) go.push(() => step("time", () => setRow("time", a.tod)));
    if (a.go !== false) go.push(() => step("rs-go", () => tapEl({ id: "rs-go" }), () => { const sc = screenNow(); return sc === "drive-out" || sc === "race"; }, NAV_GO_MS));
    for (const g of go) if (!(await g())) return done(false);
    return done(true);
  }

  // DRIVING (#6397). `drive` hands the player car to SoakRun's closed-loop driver (js/perf/soak-run.js drive(): the
  // AUTO SOAK law plus PitLane's own lane lines) — agent control through the setInput seam, never a player assist. It
  // runs only from this command, and lets go on `stop`, a quit, a pause, a hidden page or a real touch/key. `to:"box"`
  // drives on to the pit entry, down the lane and stops in this car's box; `laps` / `seconds` is an autopilot lap.
  // The bridge serves one command at a time, so a `wait:false` drive answers at once and `status` / `stop` follow.
  // No `to:"grid"`: nothing in the game reads a car parked on its grid slot (the grid is placed by race(), a restart
  // re-grids by itself), so there is no state for it to reach.
  const DRIVE_MS = 240000, DRIVE_START_MS = 30000, END_IDS = ["hud-end-session", "hud-work"];
  async function drive(args) {
    const a = args || {};
    const S = typeof SoakRun !== "undefined" ? SoakRun : null;
    if (!S || typeof S.drive !== "function") throw new Error("SoakRun.drive unavailable");
    if (a.stop) { const was = S.driving(), last = S.driveStop("bridge"); return { stopped: was, last: last || S.driveStatus().last || null }; }
    if (a.status) return S.driveStatus();
    if (a.to === "grid") throw new Error("drive.to grid: no game state reads a parked grid slot (race() places the grid)");
    const n = [a.to != null, a.laps != null, a.seconds != null].filter(Boolean).length;
    if (n !== 1) throw new Error('drive takes one of {to:"box"}, {laps:1-5}, {seconds:1-600}, {stop:true}, {status:true}');
    if (a.to != null && a.to !== "box") throw new Error('drive.to must be "box"');
    if (a.laps != null && !(Number.isInteger(a.laps) && a.laps >= 1 && a.laps <= 5)) throw new Error("drive.laps must be 1-5");
    if (a.seconds != null && !(Number(a.seconds) >= 1 && Number(a.seconds) <= 600)) throw new Error("drive.seconds must be 1-600");
    const ms = Math.max(5000, Math.min(600000, Number(a.ms) || DRIVE_MS));
    // Straight after `nav`'s RACE! the garage drive-out is still playing (state "menu"): wait for the session.
    await until(() => { const st = gameState(); return st === "race" || st === "count"; }, DRIVE_START_MS);
    const run = S.drive({ to: a.to, laps: a.laps, seconds: a.seconds != null ? Number(a.seconds) : undefined, ms });
    if (a.wait === false) { run.catch(() => {}); return Object.assign({ started: true }, S.driveStatus()); }
    const r = await run;
    // In the box: wait for the HUD to show the pit actions, so a following `tap` in the same batch finds them.
    if (r.inBox) await until(() => END_IDS.some((id) => shown(byId(id))), 1500);
    // `ok` false when the goal was not met, so a batch stops before a tap that would miss.
    const ok = a.to === "box" ? r.inBox : r.reason === (a.laps != null ? "laps" : "seconds");
    return Object.assign({ ok, screen: screenNow(), state: gameState(), pitActions: END_IDS.filter((id) => shown(byId(id))) }, r);
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
    tap,
    nav,
    set,
    key,
    scroll,
    screen: () => ({ screen: screenNow(), state: gameState() }),
    drive,
    batch,
  };

  function safeJson(v) {
    let s;
    try { s = JSON.stringify(v === undefined ? null : v); } catch (e) { return { value: null, note: "unserialisable: " + e.message }; }
    if (s.length > MAX_REPLY) return { value: null, truncated: s.length, head: s.slice(0, 2000) };
    return { value: JSON.parse(s) };
  }

  // bench / gpuTest / recorder / a path pin read LAZY_PERF globals, which land at idle (or never, after a dropped
  // fetch): ask the game's LazyBundles instance for the rig first, so the command waits instead of "unavailable".
  const PERF_CMDS = new Set(["bench", "gpuTest", "recorder", "path", "drive"]);
  async function perfRig() {
    try {
      const lb = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
      if (lb) await lb.ensurePerfRig();
    } catch (_) { /* the command reports what is missing */ }
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
    if (!r.ok) {
      let msg = "";
      try { msg = String((await r.json()).message || ""); } catch (_) { /* no JSON body */ }
      throw new Error("post " + r.status + (msg ? " " + msg.slice(0, 80) : ""));
    }
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
    // Only after every command is served: a throwing post() leaves the window where it was, so the next poll re-reads
    // the unserved commands (`seen` drops the ones already handled) instead of skipping past them.
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
      if (_run === run) schedule();   // a stop()+start() during the poll already armed the new run's own chain
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
      // 401 on the hello is the token itself (wrong, expired, revoked, cut short): forget it and ask again, or every
      // reload would retry the same token and never show the box.
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
    try { if (typeof SoakRun !== "undefined" && SoakRun.driving && SoakRun.driving()) SoakRun.driveStop("link ended"); } catch (_) { /* no driver */ }
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
      // Live: tap ends the link. Off: tap asks for a token again (a fresh one after a 401).
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

  // No token on this device yet: one paste box. The token stays in this browser's storage only.
  // The game's focus trap (TopModal.onFocusIn, a document-capture focusin) pulls focus back into the top screen, so a
  // plain box on <body> lost the iOS keyboard the moment it was tapped and a modal screen made it inert. The box is
  // its own modal <dialog> (top layer, never inert), a window-capture focusin listener stops that trap seeing focus
  // inside it, and PASTE reads the clipboard directly (iOS asks once) for when typing still fails.
  // What a pasted token looks like, never the secret: Safari has no remote console, so a 401 needs this to tell a
  // wrong token from a wrong paste. A fine-grained token is github_pat_ + 82 chars of [A-Za-z0-9_] (93 in all).
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
  return { V, REPO, CALL_DENY, CALL_DENY_PREFIX, callAllowed, TAP_DENY, CMDS, issueOf, handle, pickCommands, pollOnce, start, stop, boot, frames, facts, display, geom, tokenShape,
    active: () => !!_run };
})();
Object.freeze(ApexBridge);
