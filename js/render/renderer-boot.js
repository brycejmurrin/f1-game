/* Apex 26 — RendererBoot: extracted runtime orchestration.
   Contract: docs/ARCHITECTURE.md. */
const RendererBoot = (function () {
"use strict";
// Warm the vendored three island once start() has committed to THREE, so TLX is not
// waiting on a cold module fetch after the roster injects it. Idle-scheduled so the
// ~735 KB modulepreload hints do not fight the last FULL scripts / title CSS for
// bandwidth on the same turn as start(). Eval-time guess no longer calls this (#3515):
// a wrong guess must not spend island bandwidth before the pick is known. `low` remains
// for a speculative caller; start() uses the default (high) priority after the pick.
function preloadThreeVendor(low) {
  const kick = () => {
    try {
      // three.core too: three.webgpu imports it statically and modulepreload does not fetch dependencies,
      // so without it core was found only after webgpu had downloaded and parsed (one more round trip).
      for (const href of ["vendor/three-0.187.0/three.webgpu.min.js", "vendor/three-0.187.0/three.core.min.js", "vendor/three-0.187.0/three.tsl.min.js"]) {
        // querySelector is absent in some VM harnesses — skip the dedupe then.
        if (document.querySelector && document.querySelector('link[rel="modulepreload"][href="' + href + '"]')) continue;
        const el = document.createElement("link");
        el.rel = "modulepreload";
        el.href = href;
        el.crossOrigin = "anonymous";
        if (low) el.fetchPriority = "low";
        document.head.appendChild(el);
      }
    } catch (_) { /* preload is best-effort; TLX still fetches on inject */ }
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 800 });
  else if (typeof setTimeout === "function") setTimeout(kick, 0);
  else kick();
}
function create(deps) {
const { $, els, canvas, ensureDataHub, loadBackendScripts } = deps;
const BACKEND_FILES = ApexRoster.DEFERRED;
// The boot canary's strike count (start() writes it, proved() clears it) and
// whether a DEFERRED backend actually took the canvas on THIS load.
const STRIKE_KEY = "apex26.gfxProbeStrikes";
let _backendBound = false;
function strikesFor(raw, backend) {
  if (raw == null) return 0;
  const m = /^([a-z0-9]+):(\d+)$/.exec(raw);
  if (!m) return 0;
  return m[1] === backend ? +m[2] : 0;
}
function storedBackendPreference() {
  try {
    if (typeof ApexXR !== "undefined" && ApexXR.bootPick) {
      const xrPick = ApexXR.bootPick();
      if (xrPick) return { pref: xrPick, unset: false }; // VR arm: non-persisted; never writes gfxBackend
    }
  } catch (_) { /* plan advisory */ }
  try {
    const pref = localStorage.getItem("apex26.gfxBackend");
    if (pref == null) return { pref: "three", unset: true };
    if (pref === "webgl2" || pref === "three" || pref === "webgpu") return { pref, unset: false };
    localStorage.setItem("apex26.gfxBackend", "webgl2");
    return { pref: "webgl2", unset: false };
  } catch (_) {
    return { pref: "three", unset: true };
  }
}
function backendPreference() {
  return storedBackendPreference().pref;
}
// Title boot must not fetch three.webgpu (+ three.core) when requestAdapter()
// is null: TLX would only forceWebGL inside that ~1.1 MB island, and GLX already
// owns the WebGL2 path. Explicit apex26.gfxBackend=three still loads TLX.
// The probe's verdict for the fallback reason (#2285): "" when an adapter
// resolved, else why not. "slow" is not "absent": see the WGX pick below.
let _adapterWhy = "", _adapterSlow = false;
// The adapter the probe resolved, handed to TLX (Gfx.create opts.adapter) so it does not ask the GPU process
// again on the boot path; TLX reads only its info/limits, three requests its own device.
let _probeAdapter = null;
async function gpuAdapterAvailable() {
  _adapterWhy = ""; _adapterSlow = false; _probeAdapter = null;
  try {
    if (typeof navigator === "undefined" || !navigator.gpu || !navigator.gpu.requestAdapter) { _adapterWhy = "no navigator.gpu"; return false; }
    const adapterP = takeEarlyAdapter() || navigator.gpu.requestAdapter();
    // Cap the probe: a stuck requestAdapter() on broken WebGPU stacks delays
    // the entire title boot (unset default waits here before choosing GLX).
    // Hang cap is seconds (not ~250 ms): CI adapters often need longer than a
    // sub-second race; only treat as absent when requestAdapter rejects,
    // returns null, or the hang timer fires. Clear the timer if the adapter
    // settles first so a slow-but-real adapter is never raced out.
    // No setTimeout (some VM harnesses): await the adapter alone.
    if (typeof setTimeout !== "function") { const a = !!(await adapterP); if (!a) _adapterWhy = "requestAdapter() returned null"; return a; }
    let timer = null;
    try {
      const SLOW = {};
      const ad = await Promise.race([
        adapterP,
        new Promise((resolve) => { timer = setTimeout(() => resolve(SLOW), 4000); }),
      ]);
      if (ad === SLOW) { _adapterSlow = true; _adapterWhy = "requestAdapter() gave no answer in 4 s"; return false; }
      if (!ad) _adapterWhy = "requestAdapter() returned null";
      _probeAdapter = ad || null;
      return !!ad;
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  } catch (e) {
    _adapterWhy = "requestAdapter() threw: " + ((e && e.message) || e);
    return false;
  }
}
// Every awaited step of the backend boot runs before any menu handler is wired,
// and several of them wait on the device or the network with no timer of their
// own (ApexXR.detect → navigator.xr.isSessionSupported, the backend script fetch,
// TLX's import("three/webgpu") / requestAdapter / renderer.init → requestDevice).
// A hung request left a DEAD TITLE until the next reload's canary reverted to
// GLX. A step that outlives BOOT_STEP_MS resolves to TIMED_OUT and the caller
// treats the backend as unavailable and falls through to GLX. Logged once, where
// it fires; a step that settles in time costs one cleared timer.
// Software-GL CI runners (SwiftShader/llvmpipe on a starved host) can take
// longer than 8 s to init TLX; Pages 38660546141 saw init finish just after
// the old 8 s cap on a hot gate. Default 15 s; a spec that MEASURES TLX may
// RAISE the cap (never lower it) with apex26.gfxBootStepMs, clamped to 60 s.
const BOOT_STEP_MS = (() => {
  let ms = 15000;
  try { const v = Number(localStorage.getItem("apex26.gfxBootStepMs")); if (v > ms) ms = Math.min(v, 60000); } catch (_) { /* blocked storage: default cap */ }
  return ms;
})();
// Software-GL boots (SwiftShader / llvmpipe) can spend the whole idle window
// on one GLX deferred wave while the next file is still in flight — a fixed
// wall-clock cap on the whole fetch treats that as failure every reload (#3587).
// Idle: no progress for BOOT_STEP_MS. Max: BOOT_STEP_MAX_MS hard stop.
const BOOT_STEP_MAX_MS = (() => {
  let ms = 60000;
  try { const v = Number(localStorage.getItem("apex26.gfxBootStepMs")); if (v > ms) ms = Math.min(v, 120000); } catch (_) { /* blocked storage */ }
  return ms;
})();
const TIMED_OUT = { timedOut: true };
function withTimeout(promise, ms, label, onTimeout) {
  if (typeof setTimeout !== "function") return Promise.resolve(promise);   // some VM harnesses: await it alone
  let timer = null;
  const cap = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (onTimeout) onTimeout();
      Log.warn("gfx", label + " gave no answer in " + ms / 1000 + " s — treating the backend as unavailable");
      resolve(TIMED_OUT);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), cap]).finally(() => clearTimeout(timer));
}
// Progress-aware boot wait: each touch() resets the idle timer (a script
// evaluated, GLX.init ran, …). Fails only after idleMs with no touch, or
// maxMs wall since the first touch.
function withIdleProgressTimeout(run, idleMs, maxMs, label, onTimeout) {
  if (typeof setTimeout !== "function") return Promise.resolve(run(() => {}));
  let idleTimer = null;
  let maxTimer = null;
  let aborted = false;
  let resolveWatch;
  const watchdog = new Promise((resolve) => { resolveWatch = resolve; });
  const stopWatch = () => {
    aborted = true;
    if (idleTimer != null) clearTimeout(idleTimer);
    if (maxTimer != null) clearTimeout(maxTimer);
    idleTimer = maxTimer = null;
  };
  const timeOut = (suffix) => {
    if (aborted) return;
    stopWatch();
    if (onTimeout) onTimeout();
    Log.warn("gfx", label + suffix);
    resolveWatch(TIMED_OUT);
  };
  const armIdle = () => {
    if (aborted) return;
    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => timeOut(" made no progress for " + idleMs / 1000 + " s — treating the backend as unavailable"),
      idleMs,
    );
  };
  const touch = () => { armIdle(); };
  maxTimer = setTimeout(
    () => timeOut(" exceeded " + maxMs / 1000 + " s — treating the backend as unavailable"),
    maxMs,
  );
  armIdle();
  const work = Promise.resolve(run(touch)).then((v) => { stopWatch(); return v; }, (e) => { stopWatch(); throw e; });
  return Promise.race([work, watchdog]).then((v) => { stopWatch(); return v; });
}
function loadDeferredScripts(files, touch) {
  return loadBackendScripts(files, undefined, touch ? { onSettled: () => touch() } : undefined);
}
function graphicsUnavailableOpts() {
  return {
    panel: $("nogl"), hud: els.hud, overlay: els.overlay,
    helpDialog: els.howtoplay, helpClose: $("htp-close"),
    dataDialog: els.datahub, dataClose: $("dh-close-btn"),
    ensureDataHub, openDataHub: () => DataHub.open(),
  };
}
function showGraphicsUnavailable() {
  RendererPicker.showUnavailable(graphicsUnavailableOpts());
}
if (typeof RendererPicker !== "undefined" && RendererPicker.setUnavailableDefaults) {
  RendererPicker.setUnavailableDefaults(graphicsUnavailableOpts());
}
async function start() {
let gfx = null;
let _claimSkipped = false;   // this boot consumed a claim-fail latch
let _initOwner = null;
let _createHung = false;     // the backend's create() never answered: leave its canary armed
let pref = "webgl2", pick = "", why = "";   // the resolved pick, the explicit one, and why it did not bind (#2285: never silent)
try {
  const stored = storedBackendPreference();
  pref = stored.pref; pick = stored.unset ? "" : stored.pref;
  // Refresh apex26.xrCaps before sync bootPick (ms). ApexXR is LAZY_XR and is only
  // fetched by XrBoot.mountUi, after this runs, so on a real boot it is undefined
  // here and both ApexXR guards (this and storedBackendPreference) fall through to
  // the 2D pick; they act only when the bundle is already resident (a spec that
  // preloads it). Loading it earlier is NOT a drop-in: XRPlan's webgl2 path maps
  // to GLX, which has no attachXrSession, so an armed boot would land on a
  // renderer ENTER VR cannot use (the legacy XrBoot.ensureXrBackend TLX pin is
  // what works today). Fix the plan's backend first.
  // An explicit WEBGL2 recovery pick should not spend a boot step on XR before
  // GLX — measured on a slow SwiftShader box stuck in Graphics unavailable (#3587).
  if (pref !== "webgl2" && typeof ApexXR !== "undefined" && ApexXR.detect) {
    try { await withTimeout(ApexXR.detect(), BOOT_STEP_MS, "XR capability probe"); } catch (_) { /* caps stay cached */ }
  }
  // Unset default is THREE when a GPU adapter resolves; with no adapter, stay
  // on GLX so title never modulepreloads three.webgpu/core (~1.1 MB encoded).
  // Explicit three/webgpu picks are unchanged. The boot canary below still
  // protects stored THREE/WEBGPU picks after a jetsam.
  if (stored.unset && pref === "three") {
    if (!(await gpuAdapterAvailable())) pref = "webgl2";   // the unset default, not a pick: no fallback reason
  }
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
  if (armed && !skipClaim) {
    why = "boot canary: " + armed + " never presented a frame last load";
    pref = "webgl2";
    // THE LEDGER IS PER BACKEND (#3514): "<backend>:<n>". A strike TLX earned is no
    // verdict on a WGX the player picked by hand afterwards; a global count retired that
    // pick on its first death. A bare legacy number names no backend: unattributable,
    // it retires nothing (Merlin's #3547 call — it may be exactly the leaked strike).
    let strikes = 2;   // unreadable storage cannot count strikes: treat as final
    try { strikes = strikesFor(localStorage.getItem(STRIKE_KEY), armed) + 1; } catch (_) { /* blocked storage */ }
    const retire = strikes >= 2;
    Log.warn("gfx", "backend", armed, retire
      ? "never presented a frame twice — WebGL2 is now the pick"
      : "never presented a frame — WebGL2 for this boot; the pick survives one more try");
    try {
      localStorage.removeItem(PROBE_KEY);
      if (retire) {
        localStorage.setItem("apex26.gfxBackend", "webgl2");
        localStorage.removeItem(STRIKE_KEY);
      } else localStorage.setItem(STRIKE_KEY, armed + ":" + strikes);
    } catch (_) { /* the in-memory revert above still holds for this load */ }
  }
  // "webgpu" -> WGX (needs a resolved adapter); "three" -> TLX (three.js/TSL,
  // self-falls-back to WebGL2 inside three when an adapter exists but WebGPU
  // cannot bind). A pick can only be honoured while its DEFERRED group still
  // exists: without this guard, an absent group threw on `files.map` in
  // loadBackendScripts after the probe had already armed, and the next boot
  // warned about a backend that had never even been fetched.
  const group = pref === "three" ? BACKEND_FILES.three
              : pref === "webgpu" ? BACKEND_FILES.webgpu : null;
  let optIn = !skipClaim && !!(group && group.length) &&
    (pref === "three" || pref === "webgpu");
  if (skipClaim && (pref === "three" || pref === "webgpu")) why = "claim-fail skip: the last load claimed the canvas and died";
  else if ((pref === "three" || pref === "webgpu") && !optIn) why = "no " + pref + " script group in the roster";
  // WGX with navigator.gpu but a null adapter used to fetch the webgpu roster
  // then refuse — skip the fetch when no adapter resolves.
  // A SLOW adapter is not an absent one: under load SwiftShader's requestAdapter()
  // was measured at up to 3 s against the 4 s cap, and a miss bound GLX with no
  // reason anywhere (#2285). WGX.create() asks again under BOOT_STEP_MS and records
  // its own refusal, so only a null/throwing adapter skips the fetch.
  if (optIn && pref === "webgpu" && !(await gpuAdapterAvailable()) && !_adapterSlow) { optIn = false; why = _adapterWhy; }
  if (optIn && typeof Gfx === "undefined") why = "Gfx factory absent";
  if (optIn && typeof Gfx !== "undefined") {
    // Armed HERE, not at `optIn`: no Gfx = the canvas is never handed over.
    try { localStorage.setItem(PROBE_KEY, pref); } catch (_) { /* no probe means no auto-revert; the button is still the way back */ }
    // FETCH THE BACKEND ONLY NOW: neither alternate has a <script> tag, so the
    // ~550 KB is fetched only for the resolved deferred pick. The list is
    // DEFERRED in tools/manifest.cjs (load-order.test.mjs asserts
    // loader/manifest/sw.js precache agree); eval-time edges
    // (BACKEND_EDGES === DEFERRED_EDGES) are the only waits. No error path is
    // needed beyond this: a failed fetch leaves the backend global absent,
    // which Gfx.create treats as unavailable and falls through to GLX.
    if (pref === "three") preloadThreeVendor();
    // An EXPLICIT pick ran no probe, so TLX's adapter sniff asked the GPU process itself, after the backend fetch and
    // before three's own requestAdapter: two serial round trips. The eval-time adapter (kickEarlyAdapter) rides along
    // instead, awaited beside the fetch under the probe's 4 s cap; null (none, slow, refused) leaves TLX to ask.
    const earlyP = !_probeAdapter && pref === "three" ? cappedEarlyAdapter() : null;
    const fetched = await withIdleProgressTimeout(
      (touch) => loadDeferredScripts(pref === "three" ? BACKEND_FILES.three : BACKEND_FILES.webgpu, touch),
      BOOT_STEP_MS, BOOT_STEP_MAX_MS, "backend script fetch");
    // A slow fetch is the network's verdict, not the device's: GLX for this boot,
    // canary state untouched. A hung create() IS the device's (see _createHung).
    if (earlyP) _probeAdapter = await earlyP;
    if (fetched !== TIMED_OUT && Gfx.createInitOwner) _initOwner = Gfx.createInitOwner(canvas);
    const made = fetched === TIMED_OUT ? null : await withTimeout(Gfx.create(canvas, { backend: pref, initOwner: _initOwner, adapter: _probeAdapter }), BOOT_STEP_MS, "backend " + pref + " init", () => { if (_initOwner) _initOwner.abort(); });
    const backend = made === TIMED_OUT ? (_createHung = true, null) : made;
    if (fetched === TIMED_OUT) why = "backend script fetch gave no answer in " + BOOT_STEP_MS / 1000 + " s";
    else if (made === TIMED_OUT) why = "backend " + pref + " init gave no answer in " + BOOT_STEP_MS / 1000 + " s";
    else if (!backend) {
      let own = null;
      try { own = localStorage.getItem(pref === "three" ? "apex26.gfxTlxFail" : "apex26.gfxWgxFail"); } catch (_) { /* blocked storage */ }
      why = pref + " create() refused" + (own ? ": " + own : " without a reason") + (_adapterSlow ? " (" + _adapterWhy + ")" : "");
    }
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
        try { sessionStorage.removeItem("apex26.gfxBound"); sessionStorage.removeItem("apex26.gfxFallbackWhy"); } catch (_) { /* blocked storage */ }
        try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no event surface */ }
        try { localStorage.removeItem(PROBE_KEY); } catch (_) { /* blocked storage: nothing to disarm */ }
      }
    }
  }
} catch (e) { gfx = null; why = "boot threw: " + ((e && e.message) || e); }
if (!gfx) {
  // An alternate that claimed the canvas (getContext succeeded) then timed out
  // cannot attach GLX on this load — same rule as init-fail below, without
  // calling GLX.init on a poisoned surface (renderer-boot-timeout VM).
  if (_initOwner && _initOwner.claimed) {
    showGraphicsUnavailable(); return null;
  }
  // Load GLX only when selected or needed after TLX/WGX refuses. A missing
  // script must not trigger the claim-failure reload loop while offline.
  let glxVerdict = "throw";
  let glxTimedOut = false;
  try {
    glxVerdict = await withIdleProgressTimeout(async (touch) => {
      touch();
      if (typeof GLX.init !== "function") {
        const ok = await loadDeferredScripts(BACKEND_FILES.webgl2, touch);
        if (ok === false) return "fetch-fail";
      }
      if (typeof GLX.init !== "function") return "no-init";
      touch();
      if (glxTimedOut) return "no-init"; // watchdog fired mid-fetch: do not build a context behind the panel
      return GLX.init(canvas) ? "ok" : "init-fail";
    }, BOOT_STEP_MS, BOOT_STEP_MAX_MS, "GLX boot", () => { glxTimedOut = true; });
  } catch (_) { glxVerdict = "throw"; }
  if (glxVerdict === TIMED_OUT || glxVerdict === "fetch-fail" || glxVerdict === "no-init") {
    showGraphicsUnavailable(); return null;
  }
  if (glxVerdict !== "ok") {
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
  // A WGX/TLX pick that ends here says why — on the console and where
  // __apex.diag().env.backendFallback reads it. An explicit WEBGL2 pick owes nothing.
  if (why || pick === "three" || pick === "webgpu") {
    const reason = why || "unknown";
    try { Log.warn("gfx", "bound WebGL2 instead of " + (pick || "the default") + " — " + reason); } catch (_) { /* Log absent (VM harness): the session key still says it */ }
    try { sessionStorage.setItem("apex26.gfxFallbackWhy", reason); } catch (_) { /* the warning still says it */ }
  } else try { sessionStorage.removeItem("apex26.gfxFallbackWhy"); } catch (_) { /* blocked storage */ }
  try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window/event surface */ }
  // Live tab, create() refused. Keep the pick and disarm the canary so a
  // refresh retries instead of reverting to WEBGL2. Jetsam during create()
  // never reaches here — the probe stays armed and the next boot reverts. A
  // create() that HUNG is the same case as a jetsam kill (it never completed),
  // so its probe stays armed too: the strike ledger retires a device that hangs
  // twice instead of costing every boot BOOT_STEP_MS.
  if (!_createHung) try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage */ }
}
// What this boot BOUND, for the next boot's early preload (guessBackend below).
try { localStorage.setItem("apex26.gfxBootBound", _backendBound ? pref : "webgl2"); } catch (_) { /* blocked storage: the next guess reads the pick alone */ }
// Before the game loop's first resize: one software-GL race scale, so race
// entry does not setSize the canvas down and back.
try { if (gfx && typeof PerfGov !== "undefined" && PerfGov.chooseSoftwareRaceScale) PerfGov.chooseSoftwareRaceScale(gfx); } catch (_) { /* harness */ }
return { gfx, bound: _backendBound };
}

// game.js calls this once the boot has presented PROVE_FRAMES world frames. A
// backend that PROVED itself owes nothing for an older strike — without this,
// one kill months ago plus one today retires the pick on what looks like a
// first failure. Only the PICK can prove, though: the GLX boot a first strike
// reverts to (or a claim-skip / refused create) is not the pick running, and
// clearing the strike there looped a backend killed in its first ~5 s forever
// (crash → GLX clears the strike → crash → GLX …) instead of retiring it.
function proved() {
  if (!_backendBound) return false;
  try { localStorage.removeItem(STRIKE_KEY); } catch (_) { /* blocked storage */ }
  return true;
}
return { start, backendPreference, storedBackendPreference, gpuAdapterAvailable, proved };
}
// THE LIKELY BACKEND'S BYTES DURING THE BOOT WALL (B·H8 load hunt, 2026-10-20).
// start() runs only once game.js — the last of ~230 deferred scripts — has
// evaluated, and its group's fetch began there: 4.26 s into a cold boot at 4x CPU
// on Fast 4G, ~3.5 s after this file evaluated. Guess the pick now from what
// start() itself reads first (no adapter probe, no XR plan) and preload that
// group through ScriptLoader — fetch only; start() still decides, injects and
// evaluates exactly as before. A wrong guess costs the bytes, never the pick.
// An armed canary or a claim-fail skip boots GLX, so those guess GLX. The last
// boot's BOUND backend (apex26.gfxBootBound, written by start()) wins over the
// navigator.gpu hint while the pick is unchanged: navigator.gpu with a null
// adapter (desktop Chromium without a GPU, measured here) binds GLX, and the
// first guess preloaded TLX's ten files for nothing.
// A guess is SURE when start() cannot pick otherwise: an armed canary or claim skip (GLX), an
// explicit WebGL2 or THREE pick, or the backend the last boot bound for this same pick. One
// read off navigator.gpu alone (a first boot, the boot after a switch to WEBGPU) is a hunch:
// the adapter probe can still land GLX, and those ~0.7–1.1 MB went out at high priority
// against the assets the real pick needed (#3515). A hunch preloads at fetchPriority low.
function guess() {
  try {
    if (localStorage.getItem("apex26.gfxBackendProbe") || sessionStorage.getItem("apex26.gfxClaimFail") === "1") return { pick: "webgl2", sure: true };
    const pref = localStorage.getItem("apex26.gfxBackend");
    const last = localStorage.getItem("apex26.gfxBootBound");
    if ((pref == null || pref === "three") && (last === "three" || last === "webgl2")) return { pick: last, sure: true };
    if (pref === "webgpu" && (last === "webgpu" || last === "webgl2")) return { pick: last, sure: true };
    const gpu = typeof navigator !== "undefined" && !!navigator.gpu;
    if (pref === "webgl2") return { pick: "webgl2", sure: true };
    if (pref === "webgpu") return { pick: gpu ? "webgpu" : "webgl2", sure: !gpu };
    if (pref === "three") return { pick: "three", sure: true };
    if (pref == null) return { pick: gpu ? "three" : "webgl2", sure: !gpu };
  } catch (_) { /* blocked storage: start() picks without it; fetch nothing early */ }
  return { pick: "", sure: false };
}
function guessBackend() { return guess().pick; }
// THE ADAPTER DURING THE BOOT WALL (A·H15 load hunt, 2026-10-24). start() asked navigator.gpu.requestAdapter() only
// once game.js had evaluated, and every later boot step waits on it: measured on a warm SW boot (150 ms RTT,
// SwiftShader), the unset default's probe ran 840 -> 1405 ms while this file had evaluated at ~350 ms, and an explicit
// THREE pick's TLX sniff ran 995 -> 1396 ms, after DOMContentLoaded. The request is GPU-process work, not bandwidth
// (#3536's contention was the ~1 MB fetch), so it goes out here for a guess of THREE or WGX — a GLX guess (no
// navigator.gpu, a WebGL2 pick, an armed canary, a claim-fail skip, a last boot that bound GLX) asks nothing — and
// start() consumes it once: the unset/WGX probe instead of a second request, an explicit THREE pick as the adapter TLX
// sniffs. A null or rejected answer means exactly what it meant from start().
let _earlyAdapterP = null;
function kickEarlyAdapter() {
  try {
    const pick = guess().pick;
    if (pick !== "three" && pick !== "webgpu") return null;
    if (typeof navigator === "undefined" || !navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") return null;
    const p = Promise.resolve(navigator.gpu.requestAdapter());
    p.catch(() => {});   // start() reads the rejection; unread, it must not surface as unhandled
    _earlyAdapterP = p;
    return p;
  } catch (_) { return null; }
}
function takeEarlyAdapter() { const p = _earlyAdapterP; _earlyAdapterP = null; return p; }
// The early adapter for an explicit pick: never a fresh request, null after the probe's own 4 s cap or on a rejection.
function cappedEarlyAdapter() {
  const p = takeEarlyAdapter();
  if (!p) return null;
  const answer = p.then((ad) => ad || null, () => null);
  if (typeof setTimeout !== "function") return answer;
  let timer = null;
  return Promise.race([answer, new Promise((resolve) => { timer = setTimeout(() => resolve(null), 4000); })])
    .finally(() => { if (timer != null) clearTimeout(timer); });
}
function preloadLikelyBackend() {
  try {
    if (typeof ScriptLoader === "undefined" || !ScriptLoader.preload || typeof ApexRoster === "undefined") return 0;
    const g = guess();
    const low = !g.sure;
    let unsetPick = false;
    try { unsetPick = localStorage.getItem("apex26.gfxBackend") == null; } catch (_) { /* blocked storage: treat like unset */ unsetPick = true; }
    // The UNSET default read off navigator.gpu is not a pick: start() may still bind
    // GLX after a null or slow requestAdapter() (SwiftShader often needs the full
    // 4 s cap). The eval-time TLX prefetch plus the ~735 KB three vendor island
    // contended with the GLX roster fetch and could push the fallback past
    // BOOT_STEP_MS into Graphics unavailable — measured after clearing site data
    // with an installed SW (#3536). Explicit THREE/WGX picks still prefetch the
    // roster here; the vendor island waits for start() once the pick is known
    // (#3515 item 12) so a guess miss never spends ~735 KB of boot bandwidth.
    if (unsetPick && !g.sure && g.pick === "three") return 0;
    const files = ApexRoster.DEFERRED && ApexRoster.DEFERRED[g.pick];
    return files ? ScriptLoader.preload(files, { low }) : 0;
  } catch (_) { return 0; /* an optimisation only */ }
}
preloadLikelyBackend();
kickEarlyAdapter();
  return { create, guessBackend };
})();
Object.freeze(RendererBoot);
