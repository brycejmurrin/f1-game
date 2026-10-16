/* Apex 26 — ThreeInspector: OPT-IN dev panel, the official three.js Inspector (Performance / Memory / Timeline /
   Viewer / Parameters / Console) on the TLX renderer. `?inspector=1` or __apex.inspector(true); default ON on dev hosts (localhost/127.0.0.1/::1/file:), OFF on the deployed site and under navigator.webdriver; remembered in apex26.inspector.
   Costs nothing when off: this file is a few closures, and the vendored addons/inspector/ files are fetched by a
   dynamic import() only on enable — they are not in sw.js PRECACHE, any modulepreload or ApexRoster.DEFERRED
   (tests/unit/three-inspector.test.mjs). GPU timings need the WebGPU backend with timestamp-query; on TLX's WebGL2
   path (and SwiftShader) the other tabs still work. While on, TLX's gpuTimer is held off (tlx.js inspectorHost)
   so only one consumer resolves timestamp queries. Notes: docs/notes/THREE-INSPECTOR-2026-10-16.md. */
const ThreeInspector = (function () {
  "use strict";

  const URL_ID = "three/addons/inspector/Inspector.js";
  const CLOSE_ID = "three-inspector-close";
  const CLOSE_CSS = "position:fixed;right:6px;top:6px;z-index:10001;width:32px;height:32px;padding:0;" +
    "border-radius:16px;border:1px solid #888;background:rgba(0,0,0,.7);color:#fff;font:16px/1 sans-serif;" +
    "cursor:pointer;pointer-events:auto;touch-action:manipulation";

  let inspector = null;   // live Inspector instance
  let host = null;        // { renderer, hold } from tlx.inspectorHost()
  let closeBtn = null;
  let token = 0;          // bumps on every on/off so a slow import cannot resurrect a disabled panel
  let last = { on: false, supported: false, reason: "off" };

  const KEY = "apex26.inspector";
  function devHost() {
    const h = location.hostname, pr = location.protocol;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || pr === "file:";
  }
  function store(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (_) { /* private mode: not remembered */ } }
  // Precedence: ?inspector=0|1 (remembered) > stored apex26.inspector > default. Default is ON only on dev/agent
  // hosts (localhost, 127.0.0.1, ::1, file:) and OFF on the deployed site and under automation (navigator.webdriver:
  // the Playwright harness serves on 127.0.0.1 and must not pay for 17 extra requests + an overlay).
  function wanted() {
    try {
      const m = /[?&]inspector=([01])(&|$)/.exec(location.search);
      if (m) { store(m[1] === "1"); return m[1] === "1"; }
      const v = localStorage.getItem(KEY);
      if (v === "1" || v === "0") return v === "1";
      return devHost() && !(typeof navigator !== "undefined" && navigator.webdriver);
    } catch (_) { return false; }
  }

  function say(msg) { try { Log.info("gfx", "[inspector] " + msg); } catch (_) { /* Log may not be up */ } }

  function teardown() {
    token++;
    if (closeBtn && closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
    closeBtn = null;
    const insp = inspector, h = host;
    inspector = null; host = null;
    try { if (h && h.renderer) h.renderer.inspector = null; } catch (_) { /* renderer may be gone */ }
    try { if (insp && insp.domElement && insp.domElement.parentNode) insp.domElement.parentNode.removeChild(insp.domElement); } catch (_) { /* detached already */ }
    try { if (h) h.hold(false); } catch (_) { /* renderer may be gone */ }
  }

  async function enable(gfx) {
    const h = gfx && typeof gfx.inspectorHost === "function" ? gfx.inspectorHost() : null;
    if (!h || !h.renderer) {
      last = { on: false, supported: false, reason: "TLX only (this backend has no three.js renderer)" };
      say("not available: " + last.reason);
      return;
    }
    if (inspector && host && host.renderer === h.renderer) { last = { on: true, supported: true, reason: "on" }; return; }
    teardown();
    const mine = ++token;
    last = { on: true, supported: true, reason: "loading" };
    let mod;
    try { mod = await import(URL_ID); } catch (e) {
      last = { on: false, supported: true, reason: "import failed: " + (e && e.message) };
      say(last.reason);
      return;
    }
    if (mine !== token) return;   // turned off (or replaced) while the files loaded
    try {
      host = h;
      h.hold(true);
      inspector = new mod.Inspector();
      h.renderer.inspector = inspector;   // three's setter calls inspector.setRenderer(renderer)
      closeBtn = document.createElement("button");
      closeBtn.id = CLOSE_ID;
      closeBtn.type = "button";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "Close three.js Inspector");
      closeBtn.style.cssText = CLOSE_CSS;
      closeBtn.addEventListener("click", () => { store(false); teardown(); last = { on: false, supported: true, reason: "off" }; }, { once: true });
      document.body.appendChild(closeBtn);
      last = { on: true, supported: true, reason: "on" };
      say("on (" + (h.renderer.backend && h.renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2") + ")");
    } catch (e) {
      teardown();
      last = { on: false, supported: true, reason: "init failed: " + (e && e.message) };
      say(last.reason);
    }
  }

  // set(gfx, on): on===undefined reads. enable() settles later (dynamic import), so `loading` marks the gap.
  function set(gfx, on) {
    if (on === true) { store(true); enable(gfx); }
    else if (on === false) { store(false); teardown(); last = { on: false, supported: last.supported, reason: "off" }; }
    return status();
  }
  function status() { return { on: !!inspector, supported: last.supported, reason: last.reason, loading: !inspector && last.on }; }

  function boot(gfx) { if (wanted()) enable(gfx); }

  return { set, boot, wanted, stop: teardown, status };
})();

if (typeof window !== "undefined") window.ThreeInspector = ThreeInspector;
