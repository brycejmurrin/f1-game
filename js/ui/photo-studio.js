"use strict";
/* PhotoStudio — FULL boot stub (#4978 row 5). Title home reads background() at eval;
 * game.js still calls PhotoStudio.create(G, …). The capture UI (PhotoStudioBody) is
 * LAZY_UI_PRESETS and loads when a photo action first needs it. */
const PhotoStudio = (function () {
  const ASPECTS = { scene: 0, wide: 16 / 9, square: 1, portrait: 4 / 5 };
  let live = null;     // the newest façade's body instance
  let newest = null;   // that façade's guarded creation
  let _load = null;
  const text = (v, max) => String(v || "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max || 80);
  function filename(label) { return "apex26-" + (text(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo") + ".png"; }
  function crop(width, height, aspect) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height)), r = ASPECTS[aspect] || w / h;
    const cw = Math.min(w, h * r), ch = Math.min(h, w / r);
    return { x: (w - cw) / 2, y: (h - ch) / 2, width: cw, height: ch };
  }
  function focalFov(mm, aspect) {
    // The 36 mm frame width gives a stable horizontal angle across aspect ratios.
    return 2 * Math.atan(18 / (mm * aspect));
  }
  function focalMm(fov, aspect) {
    return 18 / (Math.tan(fov / 2) * aspect);
  }
  const KEYS = { landscape: "apex26.photoBackground", portrait: "apex26.photoBackgroundPortrait" };
  const orient = () => { try { return window.innerHeight > window.innerWidth ? "portrait" : "landscape"; } catch (_) { return "landscape"; } };
  const readSlot = (slot) => { try { const v = localStorage.getItem(KEYS[slot]); return v && /^data:image\/(jpeg|png);base64,/.test(v) && v.length < 1.5e6 ? v : ""; } catch (_) { return ""; } };
  // 4:5 or taller goes to the portrait slot, a wide photo to landscape; unknown or square follows the device orientation.
  const slotFor = (aspect) => (aspect && aspect <= 0.8 ? "portrait" : aspect >= 1.25 ? "landscape" : orient());
  // No slot: the current orientation's image, else the other one. A named slot reads strictly.
  function background(slot) {
    if (KEYS[slot]) return readSlot(slot);
    const o = orient();
    return readSlot(o) || readSlot(o === "portrait" ? "landscape" : "portrait");
  }
  function setBackground(value, slot) {
    slot = KEYS[slot] ? slot : orient();
    if (value && (!/^data:image\/(jpeg|png);base64,/.test(value) || value.length >= 1.5e6)) return false;
    try {
      const S = GameStore.store;   // raw lane: setRoomy's quota sweep, failedKeys (#5023); a failed write leaves the other slot untouched
      if (!(value ? S.rawSet(KEYS[slot], value) : S.rawDel(KEYS[slot]))) return false;
      window.dispatchEvent(new CustomEvent("apex26:photo-background", { detail: { available: !!value, slot } }));
      return true;
    } catch (_) { return false; }
  }
  const shareCancelled = (e) => typeof NativeDownload !== "undefined" && !!NativeDownload.isCancelled && NativeDownload.isCancelled(e);
  const logWarn = (msg) => { if (typeof Log !== "undefined") Log.warn("ui", msg); };

  function ensureBody() {
    if (typeof PhotoStudioBody !== "undefined") return Promise.resolve(true);
    if (_load) return _load;
    if (typeof ScriptLoader === "undefined") return Promise.resolve(false);
    _load = ScriptLoader.create().load(["js/ui/photo-studio-ui.js"], [], { strict: true }).then(() => {
      if (typeof PhotoStudioBody === "undefined") { _load = null; logWarn("photo studio body did not load"); return false; }
      if (newest) newest();
      return true;
    }).catch((e) => {
      _load = null;
      logWarn("photo studio body did not load: " + (e && e.message || e));
      return false;
    });
    return _load;
  }

  function create(G, deps) {
    deps = deps || {};
    // Photo looks belong to the free-camera visit, not to the lighting profile.
    // Writes stay live-only; the observer restores the exact pre-visit values
    // whenever FreeCam hides its panel, including Escape and teardown.
    if (typeof PhotoKit !== "undefined" && typeof LightTune !== "undefined" && LightTune.LT) {
      const freeRows = G.$("fc-rows"), freeRoot = G.$("freecam");
      if (freeRows && freeRoot && !G.$("fc-looks")) {
        const lookSession = PhotoKit.createLookSession((id) => LightTune.LT[id], (id, value) => deps.ltStore ? deps.ltStore.set(id, value) : deps.ltSet?.(id, value));
        const lookControls = PhotoKit.mountLookControls(freeRows, lookSession, document);
        if (lookControls && typeof MutationObserver !== "undefined") {
          new MutationObserver(() => {
            if (!freeRoot.hidden) return;
            if (lookSession.end()) {
              for (const button of lookControls.children) button.setAttribute("aria-pressed", "false");
            }
          }).observe(freeRoot, { attributes: true, attributeFilter: ["hidden"] });
        }
      }
    }
    let /** @type {ReturnType<typeof PhotoStudioBody.create> | null} */ mine = null;
    /** Guarded creation: bare `G` so check-gctx's scanRealFactories finds PhotoStudioBody. */
    const body = () => {
      if (mine || typeof PhotoStudioBody === "undefined") return mine;
      mine = PhotoStudioBody.create(G, deps);
      if (newest === body) live = mine;
      return mine;
    };
    newest = body; live = null;
    body();
    const wait = (name) => (...args) => {
      const r = body();
      if (r && typeof r[name] === "function") return r[name](...args);
      return ensureBody().then((ok) => {
        if (!ok) return null;
        const impl = body();
        return impl && typeof impl[name] === "function" ? impl[name](...args) : null;
      });
    };
    return {
      loaded: () => typeof PhotoStudioBody !== "undefined", ensureLoaded: ensureBody,
      open: wait("open"), close: (...args) => mine && mine.close(...args), capture: wait("capture"),
      state: () => { const r = mine || body(); return r && typeof r.state === "function" ? r.state() : { open: false, generation: 0, source: null, subject: false, aspect: "scene", grid: false, postcard: false, busy: false, captured: false, width: 0, height: 0, background: !!background() }; },
      contactSheet: wait("contactSheet"), album: wait("album"),
      background, setBackground, slotFor, exportPhoto: wait("exportPhoto"), savePhoto: wait("savePhoto"),
      hasCar: () => !!mine && mine.hasCar(),
    };
  }

  // No eager ensureBody(): bare specs load this stub without Log/ScriptLoader (#4978).
  return Object.freeze({
    create, shareCancelled, background, setBackground, slotFor, crop, filename, focalFov, focalMm,
    lens: () => live?.lens(),
    album: () => { const r = live; return r && r.album ? r.album() : ensureBody().then(() => { const impl = newest && newest(); return impl && impl.album ? impl.album() : Promise.reject(new Error("Photo library unavailable")); }); },
    contactSheet: (times, seek, cancelled) => { const r = live; return r && r.contactSheet ? r.contactSheet(times, seek, cancelled) : ensureBody().then(() => { const impl = newest && newest(); return impl && impl.contactSheet ? impl.contactSheet(times, seek, cancelled) : Promise.reject(new Error("Photo capture unavailable")); }); },
    state: () => { const r = live; return r && r.state ? r.state() : { open: false }; },
    ensureLoaded: ensureBody, loaded: () => typeof PhotoStudioBody !== "undefined",
  });
})();
Object.freeze(PhotoStudio);
