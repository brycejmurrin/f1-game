const ThreeInspector = (function () {
  "use strict";

  const URL_ID = "three/addons/inspector/Inspector.js";
  const CLOSE_ID = "three-inspector-close";
  const CLOSE_CSS = "position:fixed;right:6px;top:6px;z-index:10001;width:32px;height:32px;padding:0;" +
    "border-radius:16px;border:1px solid #888;background:rgba(0,0,0,.7);color:#fff;font:16px/1 sans-serif;" +
    "cursor:pointer;pointer-events:auto;touch-action:manipulation";

  let inspector = null;
  let host = null;
  let previousInspector = null, previousTimestamp = false;
  let closeBtn = null;
  let token = 0;
  let last = { on: false, supported: false, reason: "off" };

  const KEY = "apex26.inspector";
  function devHost() {
    const h = location.hostname, pr = location.protocol;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || pr === "file:";
  }
  function store(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (_) {  } }
  function wanted() {
    try {
      const m = /[?&]inspector=([01])(&|$)/.exec(location.search);
      if (m) { store(m[1] === "1"); return m[1] === "1"; }
      const v = localStorage.getItem(KEY);
      if (v === "1" || v === "0") return v === "1";
      return devHost() && !(typeof navigator !== "undefined" && navigator.webdriver);
    } catch (_) { return false; }
  }

  function say(msg) { try { Log.info("gfx", "[inspector] " + msg); } catch (_) {  } }

  function teardown() {
    token++;
    if (closeBtn && closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
    closeBtn = null;
    const insp = inspector, h = host, previous = previousInspector, timestamp = previousTimestamp;
    inspector = null; host = null; previousInspector = null;
    try {
      if (h && insp && h.renderer.inspector === insp && previous) {
        h.renderer.inspector = previous;
        if (h.renderer.backend) h.renderer.backend.trackTimestamp = timestamp;
      }
    } catch (_) {  }
    try { if (insp && insp.domElement && insp.domElement.parentNode) insp.domElement.parentNode.removeChild(insp.domElement); } catch (_) {  }
    try { if (h) h.hold(false); } catch (_) {  }
  }

  async function enable(gfx) {
    const h = gfx && typeof gfx.inspectorHost === "function" ? gfx.inspectorHost() : null;
    if (!h || !h.renderer) {
      teardown();
      last = { on: false, supported: false, reason: "TLX only: the backend that booted has no three.js renderer (a software-GL boot may pick GLX; pin apex26.gfxBackend=three)" };
      say("not available: " + last.reason);
      return;
    }
    if (inspector && host && host.renderer === h.renderer && h.renderer.inspector === inspector) { last = { on: true, supported: true, reason: "on" }; return; }
    teardown();
    const mine = ++token;
    last = { on: true, supported: true, reason: "loading" };
    let mod;
    try { mod = await import(URL_ID); } catch (e) {
      if (mine !== token) return;
      last = { on: false, supported: true, reason: "import failed: " + (e && e.message) };
      say(last.reason);
      return;
    }
    if (mine !== token) return;
    try {
      host = h;
      previousInspector = h.renderer.inspector;
      previousTimestamp = h.renderer.backend && h.renderer.backend.trackTimestamp;
      h.hold(true);
      inspector = new mod.Inspector();
      h.renderer.inspector = inspector;
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
