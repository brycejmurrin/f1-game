const RendererBoot = (function () {
"use strict";
function preloadThreeVendor(low) {
  const kick = () => {
    try {
      for (const href of ["vendor/three-0.187.0/three.webgpu.min.js", "vendor/three-0.187.0/three.core.min.js", "vendor/three-0.187.0/three.tsl.min.js"]) {
        if (document.querySelector && document.querySelector('link[rel="modulepreload"][href="' + href + '"]')) continue;
        const el = document.createElement("link");
        el.rel = "modulepreload";
        el.href = href;
        el.crossOrigin = "anonymous";
        if (low) el.fetchPriority = "low";
        document.head.appendChild(el);
      }
    } catch (_) {  }
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 800 });
  else if (typeof setTimeout === "function") setTimeout(kick, 0);
  else kick();
}
function create(deps) {
const { $, els, canvas, ensureDataHub, loadBackendScripts } = deps;
const BACKEND_FILES = ApexRoster.DEFERRED;
const STRIKE_KEY = "apex26.gfxProbeStrikes";
let _backendBound = false;
function retiredWhy(raw) {
  const m = /^(three|webgpu):(\d+)$/.exec(raw || "");
  return m ? "retired: " + m[1] + " never presented a frame on two starts in a row (build " + m[2] + "); WebGL2 is the pick until a renderer is picked by hand" : "";
}
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
      if (xrPick) return { pref: xrPick, unset: false };
    }
  } catch (_) {  }
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
let _adapterWhy = "", _adapterSlow = false;
let _probeAdapter = null;
async function gpuAdapterAvailable() {
  _adapterWhy = ""; _adapterSlow = false; _probeAdapter = null;
  try {
    if (typeof navigator === "undefined" || !navigator.gpu || !navigator.gpu.requestAdapter) { _adapterWhy = "no navigator.gpu"; return false; }
    const adapterP = takeEarlyAdapter() || navigator.gpu.requestAdapter();
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
const BOOT_STEP_MS = (() => {
  let ms = 15000;
  try { const v = Number(localStorage.getItem("apex26.gfxBootStepMs")); if (v > ms) ms = Math.min(v, 60000); } catch (_) {  }
  return ms;
})();
const BOOT_STEP_MAX_MS = (() => {
  let ms = 60000;
  try { const v = Number(localStorage.getItem("apex26.gfxBootStepMs")); if (v > ms) ms = Math.min(v, 120000); } catch (_) {  }
  return ms;
})();
const TIMED_OUT = { timedOut: true };
function withTimeout(promise, ms, label, onTimeout) {
  if (typeof setTimeout !== "function") return Promise.resolve(promise);
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
function reloadOnceIntoGlx(disarm) {
  let skipped = false;
  try { if (!_claimSkipped) {
    sessionStorage.setItem("apex26.gfxClaimFail", "1");
    skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1"; } } catch (_) {  }
  if (!skipped) return false;
  if (disarm) try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
  try { location.reload(); } catch (_) {  }
  return true;
}
let gfx = null;
let _claimSkipped = false;
let _initOwner = null;
let _createHung = false;
let pref = "webgl2", pick = "", why = "";
try {
  const stored = storedBackendPreference();
  pref = stored.pref; pick = stored.unset ? "" : stored.pref;
  if (pref !== "webgl2" && typeof ApexXR !== "undefined" && ApexXR.detect) {
    try { await withTimeout(ApexXR.detect(), BOOT_STEP_MS, "XR capability probe"); } catch (_) {  }
  }
  if (stored.unset && pref === "three") {
    const ok = await gpuAdapterAvailable();
    if (!ok) pref = "webgl2";
    try { if (ok) sessionStorage.removeItem("apex26.gfxAdapterWhy"); else sessionStorage.setItem("apex26.gfxAdapterWhy", _adapterWhy || "no adapter"); } catch (_) {  }
  }
  let skipClaim = false;
  try { _claimSkipped = skipClaim = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
    if (skipClaim) sessionStorage.removeItem("apex26.gfxClaimFail"); } catch (_) { skipClaim = _claimSkipped = true;  }
  const PROBE_KEY = "apex26.gfxBackendProbe";
  try {
    const retired = localStorage.getItem("apex26.gfxRetired");
    if (retired && localStorage.getItem("apex26.gfxBackend") !== "webgl2") localStorage.removeItem("apex26.gfxRetired");
    else if (retired) why = retiredWhy(retired);
  } catch (_) {  }
  let armed = null;
  try { armed = localStorage.getItem(PROBE_KEY); } catch (_) {  }
  if (armed && !skipClaim) {
    why = "boot canary: " + armed + " never presented a frame last load";
    pref = "webgl2";
    let strikes = 2;
    try { strikes = strikesFor(localStorage.getItem(STRIKE_KEY), armed) + 1; } catch (_) {  }
    const retire = strikes >= 2;
    Log.warn("gfx", "backend", armed, retire
      ? "never presented a frame twice — WebGL2 is now the pick"
      : "never presented a frame — WebGL2 for this boot; the pick survives one more try");
    try {
      localStorage.removeItem(PROBE_KEY);
      if (retire) {
        localStorage.setItem("apex26.gfxBackend", "webgl2");
        localStorage.setItem("apex26.gfxRetired", armed + ":" + ((typeof window !== "undefined" && window.__APEX_BUILD) || 0));
        localStorage.removeItem(STRIKE_KEY);
      } else localStorage.setItem(STRIKE_KEY, armed + ":" + strikes);
    } catch (_) {  }
  }
  const group = pref === "three" ? BACKEND_FILES.three
              : pref === "webgpu" ? BACKEND_FILES.webgpu : null;
  let optIn = !skipClaim && !!(group && group.length) &&
    (pref === "three" || pref === "webgpu");
  if (skipClaim && (pref === "three" || pref === "webgpu")) why = "claim-fail skip: the last load claimed the canvas and died";
  else if ((pref === "three" || pref === "webgpu") && !optIn) why = "no " + pref + " script group in the roster";
  if (optIn && pref === "webgpu" && !(await gpuAdapterAvailable()) && !_adapterSlow) { optIn = false; why = _adapterWhy; }
  if (optIn && typeof Gfx === "undefined") why = "Gfx factory absent";
  if (optIn && typeof Gfx !== "undefined") {
    try { localStorage.setItem(PROBE_KEY, pref); } catch (_) {  }
    if (pref === "three") preloadThreeVendor();
    const earlyP = !_probeAdapter && pref === "three" ? cappedEarlyAdapter() : null;
    const fetched = await withIdleProgressTimeout(
      (touch) => loadDeferredScripts(pref === "three" ? BACKEND_FILES.three : BACKEND_FILES.webgpu, touch),
      BOOT_STEP_MS, BOOT_STEP_MAX_MS, "backend script fetch");
    if (earlyP) _probeAdapter = await earlyP;
    if (fetched !== TIMED_OUT && Gfx.createInitOwner) _initOwner = Gfx.createInitOwner(canvas);
    const made = fetched === TIMED_OUT ? null : await withTimeout(Gfx.create(canvas, { backend: pref, initOwner: _initOwner, adapter: _probeAdapter }), BOOT_STEP_MS, "backend " + pref + " init", () => { if (_initOwner) _initOwner.abort(); });
    const backend = made === TIMED_OUT ? (_createHung = true, null) : made;
    if (fetched === TIMED_OUT) why = "backend script fetch gave no answer in " + BOOT_STEP_MS / 1000 + " s";
    else if (made === TIMED_OUT) why = "backend " + pref + " init gave no answer in " + BOOT_STEP_MS / 1000 + " s";
    else if (!backend) {
      let own = null;
      try { own = localStorage.getItem(pref === "three" ? "apex26.gfxTlxFail" : "apex26.gfxWgxFail"); } catch (_) {  }
      why = pref + " create() refused" + (own ? ": " + own : " without a reason") + (_adapterSlow ? " (" + _adapterWhy + ")" : "");
    }
    if (backend) {
      try { Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend)); gfx = GLX; }
      catch (_) { gfx = null; }
      if (gfx) { _backendBound = true;
        try { sessionStorage.removeItem("apex26.gfxBound"); sessionStorage.removeItem("apex26.gfxFallbackWhy"); } catch (_) {  }
        try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
        try { localStorage.removeItem(PROBE_KEY); } catch (_) {  }
      }
    }
  }
} catch (e) { gfx = null; why = "boot threw: " + ((e && e.message) || e); }
if (!gfx) {
  if (_initOwner && _initOwner.claimed) {
    if (reloadOnceIntoGlx(!_createHung)) return null;
    showGraphicsUnavailable(); return null;
  }
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
      if (glxTimedOut) return "no-init";
      return GLX.init(canvas) ? "ok" : "init-fail";
    }, BOOT_STEP_MS, BOOT_STEP_MAX_MS, "GLX boot", () => { glxTimedOut = true; });
  } catch (_) { glxVerdict = "throw"; }
  if (glxVerdict === TIMED_OUT || glxVerdict === "fetch-fail" || glxVerdict === "no-init") {
    showGraphicsUnavailable(); return null;
  }
  if (glxVerdict !== "ok") {
    const p = backendPreference();
    if ((p === "webgpu" || p === "three") && reloadOnceIntoGlx(true)) return null;
    showGraphicsUnavailable(); return null;
  }
  gfx = GLX;
  try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) {  }
  if (why || pick === "three" || pick === "webgpu") {
    const reason = why || "unknown";
    try { Log.warn("gfx", "bound WebGL2 instead of " + (pick || "the default") + " — " + reason); } catch (_) {  }
    try { sessionStorage.setItem("apex26.gfxFallbackWhy", reason); } catch (_) {  }
  } else try { sessionStorage.removeItem("apex26.gfxFallbackWhy"); } catch (_) {  }
  try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
  if (!_createHung && !_claimSkipped) try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
}
try { localStorage.setItem("apex26.gfxBootBound", _backendBound ? pref : "webgl2"); } catch (_) {  }
try { if (gfx && typeof PerfGov !== "undefined" && PerfGov.chooseSoftwareRaceScale) PerfGov.chooseSoftwareRaceScale(gfx); } catch (_) {  }
return { gfx, bound: _backendBound };
}

function proved() {
  if (!_backendBound) return false;
  try { localStorage.removeItem(STRIKE_KEY); } catch (_) {  }
  return true;
}
return { start, backendPreference, storedBackendPreference, gpuAdapterAvailable, proved };
}
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
  } catch (_) {  }
  return { pick: "", sure: false };
}
function guessBackend() { return guess().pick; }
let _earlyAdapterP = null;
function kickEarlyAdapter() {
  try {
    const pick = guess().pick;
    if (pick !== "three" && pick !== "webgpu") return null;
    if (typeof navigator === "undefined" || !navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") return null;
    const p = Promise.resolve(navigator.gpu.requestAdapter());
    p.catch(() => {});
    _earlyAdapterP = p;
    return p;
  } catch (_) { return null; }
}
function takeEarlyAdapter() { const p = _earlyAdapterP; _earlyAdapterP = null; return p; }
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
    try { unsetPick = localStorage.getItem("apex26.gfxBackend") == null; } catch (_) {  unsetPick = true; }
    if (unsetPick && !g.sure && g.pick === "three") return 0;
    const files = ApexRoster.DEFERRED && ApexRoster.DEFERRED[g.pick];
    return files ? ScriptLoader.preload(files, { low }) : 0;
  } catch (_) { return 0;  }
}
preloadLikelyBackend();
kickEarlyAdapter();
  return { create, guessBackend };
})();
Object.freeze(RendererBoot);
