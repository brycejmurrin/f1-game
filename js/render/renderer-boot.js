/* Apex 26 — RendererBoot: extracted runtime orchestration.
   Contract: docs/ARCHITECTURE.md. */
const RendererBoot = (function () {
"use strict";
function create(deps) {
const { $, els, canvas, ensureDataHub, loadBackendScripts } = deps;
const BACKEND_FILES = ApexRoster.DEFERRED;
// Warm the vendored three island for the default or a stored THREE pick, so TLX is not
// waiting on a cold module fetch after the roster injects it.
function preloadThreeVendor() {
  for (const href of ["vendor/three-0.186.0/three.webgpu.min.js", "vendor/three-0.186.0/three.tsl.min.js"]) {
    const el = document.createElement("link");
    el.rel = "modulepreload";
    el.href = href;
    el.crossOrigin = "anonymous";
    document.head.appendChild(el);
  }
}
function backendPreference() {
  try {
    if (typeof ApexXR !== "undefined" && ApexXR.bootPick) {
      const xrPick = ApexXR.bootPick();
      if (xrPick) return xrPick; // VR arm: non-persisted; never writes gfxBackend
    }
  } catch (_) { /* plan advisory */ }
  try {
    const pref = localStorage.getItem("apex26.gfxBackend");
    const normalized = pref == null ? "three" : pref;
    if (normalized === "webgl2" || normalized === "three" || normalized === "webgpu") return normalized;
    localStorage.setItem("apex26.gfxBackend", "webgl2");
    return "webgl2";
  } catch (_) {
    return "three";
  }
}
function showGraphicsUnavailable() {
  RendererPicker.showUnavailable({
    panel: $("nogl"), hud: els.hud, overlay: els.overlay,
    helpDialog: els.howtoplay, helpClose: $("htp-close"),
    dataDialog: els.datahub, dataClose: $("dh-close-btn"),
    ensureDataHub, openDataHub: () => DataHub.open(),
  });
}
async function start() {
let gfx = null;
let _backendBound = false;
let _claimSkipped = false;   // this boot consumed a claim-fail latch
try {
  // Refresh apex26.xrCaps before sync bootPick (ms); first armed boot may still be 2D.
  if (typeof ApexXR !== "undefined" && ApexXR.detect) {
    try { await ApexXR.detect(); } catch (_) { /* caps stay cached */ }
  }
  let pref = backendPreference();
  // Unset means THREE on every device; the boot canary below protects the
  // default as well as stored THREE/WEBGPU picks.
  // Last load claimed the canvas then died — skip opt-in THIS tab only
  // (sessionStorage). Do not wipe the pick: Safari's navigator.gpu can be on
  // while WGX/TLX still refuse, and writing webgl2 bounced the RENDERER
  // button back every refresh.
  let skipClaim = false;
  try { _claimSkipped = skipClaim = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
    if (skipClaim) sessionStorage.removeItem("apex26.gfxClaimFail"); } catch (_) { skipClaim = _claimSkipped = true; /* cannot persist a skip: never claim the canvas */ }
  // THE BOOT CANARY — lets a phone hold a non-default backend past an iOS
  // jetsam kill, which leaves no JS error or contextlost to recover from (the
  // recovery below fires only when GLX.init FAILS). A probe arms before
  // handing over the canvas and clears once the alternate is bound and has
  // re-armed around the first world present(), so a jetsam on that frame
  // still reverts; a probe still armed at the NEXT boot means create() or
  // present() never completed last time.
  const PROBE_KEY = "apex26.gfxBackendProbe";
  let armed = null;
  try { armed = localStorage.getItem(PROBE_KEY); } catch (_) { /* blocked storage: no probe, so nothing to revert */ }
  // skipClaim = this tab already claimed-and-died; the probe is leftover from
  // that load. Do not persist webgl2 over the pick — attach GLX this boot and
  // retry the alternate on the next cold start.
  // ONE STRIKE IS A MEMORY KILL, NOT A VERDICT: an iOS jetsam can be unrelated
  // to the renderer, so persisting "webgl2" over the pick on the first armed
  // probe silently retired a working choice forever. The first strike reverts
  // THIS BOOT ONLY and leaves the pick alone; only a SECOND consecutive strike
  // retires it (bounding a genuinely broken device to two attempts, no reload loop).
  const STRIKE_KEY = "apex26.gfxProbeStrikes";
  if (armed && !skipClaim) {
    pref = "webgl2";
    let strikes = 2;   // unreadable storage cannot count strikes: treat as final
    try { strikes = (+localStorage.getItem(STRIKE_KEY) || 0) + 1; } catch (_) { /* blocked storage */ }
    const retire = strikes >= 2;
    Log.warn("gfx", "backend", armed, retire
      ? "never presented a frame twice — WebGL2 is now the pick"
      : "never presented a frame — WebGL2 for this boot; the pick survives one more try");
    try {
      localStorage.removeItem(PROBE_KEY);
      if (retire) {
        localStorage.setItem("apex26.gfxBackend", "webgl2");
        localStorage.removeItem(STRIKE_KEY);
      } else localStorage.setItem(STRIKE_KEY, String(strikes));
    } catch (_) { /* the in-memory revert above still holds for this load */ }
  }
  // "webgpu" -> WGX (frozen, needs navigator.gpu); "three" -> TLX (three.js/TSL,
  // self-falls-back to WebGL2 inside three so no capability gate here).
  // A pick can only be honoured while its DEFERRED group still exists: without
  // this guard, an absent group threw on `files.map` in loadBackendScripts
  // after the probe had already armed, and the next boot warned about a
  // backend that had never even been fetched.
  const group = pref === "three" ? BACKEND_FILES.three
              : pref === "webgpu" ? BACKEND_FILES.webgpu : null;
  const optIn = !skipClaim && !!(group && group.length) &&
    (pref === "three" || (pref === "webgpu" && navigator.gpu));
  if (optIn && typeof Gfx !== "undefined") {
    // Armed HERE, not at `optIn`: no Gfx = the canvas is never handed over.
    try { localStorage.setItem(PROBE_KEY, pref); } catch (_) { /* no probe means no auto-revert; the button is still the way back */ }
    // FETCH THE BACKEND ONLY NOW: neither alternate has a <script> tag, so the
    // ~550 KB is fetched only for the resolved deferred pick — `optIn` resolves
    // synchronously from localStorage. The list is DEFERRED in
    // tools/manifest.cjs (load-order.test.mjs
    // asserts loader/manifest/sw.js precache agree); eval-time edges
    // (BACKEND_EDGES === DEFERRED_EDGES) are the only waits. No error path is
    // needed beyond this: a failed fetch leaves the backend global absent,
    // which Gfx.create treats as unavailable and falls through to GLX.
    if (pref === "three") preloadThreeVendor();
    await loadBackendScripts(pref === "three" ? BACKEND_FILES.three : BACKEND_FILES.webgpu);
    const backend = await Gfx.create(canvas, {});
    if (backend) {
      // game.js and tracks.js take the backend by injection (the `gfx` handle
      // / Tracks.build's opts.gfx) and need no patch. The descriptor-copy
      // below is only for spec files that monkey-patch GLX.* by object
      // identity and read the page-scope GLX global directly — identity IS
      // their compatibility contract. Copy the backend's methods + live
      // getters (width/height/aspect) onto GLX so `GLX.foo()` delegates.
      // GLX's own WebGL context is never initialised here.
      try { Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend)); gfx = GLX; }
      catch (_) { gfx = null; }
      // Bound and live. Title has no track yet (deferred flyby), so present()
      // will not run — disarm here or a refresh on SETTINGS reverts the pick.
      if (gfx) { _backendBound = true;
        // The descriptor copy is the bind commit point. Clear any GLX latch
        // left by an earlier same-tab fallback even if a deferred backend
        // forgets to clear its own failure marker.
        try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) { /* blocked storage */ }
        try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no event surface */ }
        try { localStorage.removeItem(PROBE_KEY); } catch (_) { /* blocked storage: nothing to disarm */ }
      }
    }
  }
} catch (_) { gfx = null; }
if (!gfx) {
  // Load GLX only when selected or needed after TLX/WGX refuses. A missing
  // script must not trigger the claim-failure reload loop while offline.
  if (typeof GLX.init !== "function") await loadBackendScripts(BACKEND_FILES.webgl2);
  if (typeof GLX.init !== "function") { showGraphicsUnavailable(); return null; }
  if (!GLX.init(canvas)) {
    // A failed backend opt-in (WGX or TLX) may have already claimed the
    // canvas (getContext "webgpu"/"webgl2" succeeded before init died), so
    // getContext("webgl2") can never attach on this load. Reload once with a
    // session skip so THIS tab attaches GLX; keep the pick and disarm the
    // canary or the next boot writes webgl2 (Safari WebGPU's usual path).
    let backendTried = false;
    const p = backendPreference();
    backendTried = p === "webgpu" || p === "three";
    let skipped = false;
    if (backendTried) {
      // Read the skip back before reloading — with sessionStorage blocked the
      // write fails silently and the reload replays this claim-and-die boot
      // forever. And reload ONCE: a latch already set when this boot started
      // means the previous reload's GLX.init failed too and WebGL2 is gone
      // from this tab (measured 236 reloads/64 s on a Vulkan-only config
      // before this cap). Fall through to #nogl instead.
      try { if (!_claimSkipped) {
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1"; } } catch (_) { /* blocked storage: no skip, no reload */ }
    }
    if (skipped) {
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* storage blocked (private mode): the probe just stays armed */ }
      try { location.reload(); } catch (_) { /* a reload that throws leaves the page as it is; nothing to recover */ }
      return null;
    }
    showGraphicsUnavailable(); return null;
  }
  gfx = GLX;
  // Every path above converges here after GLX successfully attaches: an
  // explicit WEBGL2 pick, claim-fail recovery, a canary first strike, or an
  // alternate whose create() returned null. Publish what is actually drawing
  // so SETTINGS and metrics never keep labelling the stored THREE/WGX pick.
  try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label stays at the pick */ }
  try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window/event surface */ }
  // Live tab, create() refused. Keep the pick and disarm the canary so a
  // refresh retries instead of reverting to WEBGL2. Jetsam during create()
  // never reaches here — the probe stays armed and the next boot reverts.
  try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage */ }
}
return { gfx, bound: _backendBound };
}

return { start, backendPreference };
}
  return { create };
})();
Object.freeze(RendererBoot);
