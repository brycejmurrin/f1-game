"use strict";
window.UiLayers = (function () {

  const DEFS = [
    { id: "overlay", gate: false },
    { id: "hud-arrange-bar" },
    { id: "rotate-device", gate: false },
    { id: "loading" },
    { id: "pausemenu" },
    { id: "pmsettings" },
    { id: "bench" },
    { id: "select" },
    { id: "season-setup" },
    { id: "career" },
    { id: "career-offers" },
    { id: "career-history" },
    { id: "career-guide" },
    { id: "teampicker" },
    { id: "vsfriend" },
    { id: "race-settings" },
    { id: "duel-picker" },
    { id: "quali" },
    { id: "standings" },
    { id: "results" },
    { id: "customize" },
    { id: "carsetup" },
    { id: "howtoplay" },
    { id: "spotifypanel" },
    { id: "track-detail" },
    { id: "lighting" },
    { id: "camtune" },
    { id: "flyby" },
    { id: "freecam" },
    { id: "garrival" },
    { id: "tl-editor" },
    { id: "photo-controls" },
    { id: "photo-studio" },
    { id: "datahub" },
    { id: "trackdesigner" },
  ];

  const LAYER_IDS = DEFS.map((d) => d.id);

  function byIds(ids) {
    const out = [];
    for (const id of ids) { const el = document.getElementById(id); if (el) out.push(el); }
    return out;
  }
  function layerEls() {
    return byIds(LAYER_IDS).filter((el) => !el.hidden).sort((a, b) => (a.compareDocumentPosition ? (a.compareDocumentPosition(b) & 4 ? -1 : 1) : 0));
  }

  function shown(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return getComputedStyle(el).visibility !== "hidden";
  }

  const NEEDS_BOX = { "rotate-device": 1, lighting: 1, camtune: 1 };

  function shownLayer(el) {
    if (!el || el.hidden) return false;
    if (el.open) return true;
    if (getComputedStyle(el).visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) return true;
    for (const c of el.children) {
      if (shown(c)) return true;
    }
    return false;
  }

  function layerOpen(el) {
    if (!el || el.hidden) return false;
    if (el.open) return true;
    if (el.id === "rotate-device") {
      const root = document.body || document.documentElement;
      if (!root || !root.classList || !root.classList.contains("in-race")) return false;
      return shownLayer(el);
    }
    if (NEEDS_BOX[el.id]) return shownLayer(el);
    return true;
  }

  function isModal(el) {
    try { return !!(el.matches && el.matches(":modal")); } catch (_) { return false; }
  }

  const modalOrder = new WeakMap();
  let modalSerial = 0;
  const tracked = new WeakSet();
  function trackDialog(target) {
    if (!target || tracked.has(target) || typeof target.showModal !== "function") return;
    const show = target.showModal;
    target.showModal = function (...args) {
      if (isModal(this)) return show.apply(this, args);
      const previous = modalOrder.get(this);
      modalOrder.set(this, ++modalSerial);
      try { return show.apply(this, args); }
      catch (error) {
        if (previous == null) modalOrder.delete(this); else modalOrder.set(this, previous);
        throw error;
      }
    };
    tracked.add(target);
  }
  if (typeof HTMLDialogElement !== "undefined") trackDialog(HTMLDialogElement.prototype);

  function modalRank(el) {
    const existing = modalOrder.get(el);
    if (existing) return existing;
    if (!isModal(el)) return 0;
    const n = ++modalSerial;
    modalOrder.set(el, n);
    return n;
  }

  let topMemo, topMemoAt = 0;
  function top() {
    if (!navObs) return topNow();
    const now = clock();
    if (!navDirty() && topMemo !== undefined && now - topMemoAt < NAV_MEMO_MS
      && (!topMemo || topMemo.isConnected !== false)) return topMemo;
    const best = topNow();
    topMemo = best;
    topMemoAt = now;
    return best;
  }
  function topNow() {
    let best = null;
    let bestRank = -Infinity;
    let bestModal = false;
    let layers = layerEls();
    try { layers = layers.concat(Array.from(document.querySelectorAll(":modal"))); } catch (_) {  }
    const uniq = Array.from(new Set(layers));
    let anyModal = false;
    for (let i = 0; i < uniq.length; i++) {
      if (isModal(uniq[i])) { anyModal = true; break; }
    }
    for (const el of uniq) {
      const modal = isModal(el);
      if (anyModal && !modal) continue;
      if (!modal && !layerOpen(el)) continue;
      const rank = modal ? modalRank(el) : (parseInt(getComputedStyle(el).zIndex, 10) || 0);
      if (modal !== bestModal ? modal : rank >= bestRank) {
        bestRank = rank; best = el; bestModal = modal;
      }
    }
    return best;
  }

  let _gateEls = null;
  function gateEls() {
    if (_gateEls) {
      for (let i = 0; i < _gateEls.length; i++) if (!_gateEls[i].isConnected) { _gateEls = null; break; }
    }
    if (!_gateEls) {
      const ids = DEFS.filter((d) => d.gate !== false).map((d) => d.id);
      const els = byIds(ids);
      if (els.length === ids.length) _gateEls = els;
      return els;
    }
    return _gateEls;
  }

  const NAV_MEMO_MS = 250;
  let gateMemo = null;
  let gateMemoAt = 0;
  let navMemo = null;
  let navMemoAt = 0;
  let navObs = null;
  let openObs = null;
  let navStale = false;
  const navWatched = new WeakSet();
  const NAV_ATTRS = ["hidden", "class", "style", "open", "inert"];
  const clock = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);

  function anyOpenLive() {
    const els = gateEls();
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.hidden) continue;
      if (shownLayer(el)) return true;
    }
    return false;
  }

  function anyOpen() {
    if (!navObs) return anyOpenLive();
    const now = clock();
    if (gateMemo !== null && now - gateMemoAt < NAV_MEMO_MS && !navDirty()) return gateMemo;
    gateMemo = anyOpenLive();
    gateMemoAt = now;
    return gateMemo;
  }

  function navOpen() {
    const now = clock();
    if (navMemo !== null && now - navMemoAt < NAV_MEMO_MS && !navDirty()) return navMemo;
    const open = navOpenNow();
    if (navObs) { navDirty(); navStale = false; }
    navMemo = open;
    navMemoAt = now;
    return open;
  }

  function navOpenNow() {
    if (anyOpen()) return true;
    return shownLayer(document.getElementById("overlay")) || shownLayer(document.getElementById("rotate-device"));
  }


  function navWatch(el, subtree) {
    if (!navObs || !el || navWatched.has(el)) return;
    navWatched.add(el);
    navObs.observe(el, { attributes: true, attributeFilter: NAV_ATTRS, subtree });
  }

  function navDirty() {
    if (!navObs) return true;
    if (navObs.takeRecords().length) navStale = true;
    if (openObs && openObs.takeRecords().length) navStale = true;
    for (const el of gateEls()) navWatch(el, true);
    navWatch(document.getElementById("overlay"), true);
    navWatch(document.getElementById("rotate-device"), true);
    const stale = navStale;
    navStale = false;
    if (stale) { gateMemo = null; navMemo = null; topMemo = undefined; }
    return stale;
  }

  if (typeof MutationObserver === "function" && typeof window !== "undefined" && window.addEventListener) {
    navObs = new MutationObserver(() => { navStale = true; });
    const root = document.documentElement;
    navWatch(root, false);
    openObs = new MutationObserver(() => { navStale = true; });
    openObs.observe(root, { attributes: true, attributeFilter: ["open"], subtree: true });
    if (document.body) navWatch(document.body, false);
    else document.addEventListener("DOMContentLoaded", () => { navWatch(document.body, false); navStale = true; }, { once: true });
    const drop = () => { navStale = true; };
    window.addEventListener("resize", drop);
    window.addEventListener("orientationchange", drop);
  }

  let raceGetter = null;
  function setRaceGetter(fn) {
    raceGetter = typeof fn === "function" ? fn : null;
    try { Log.info("ui", `UiLayers.raceGetter ${raceGetter ? "on" : "off"}`); } catch (_) {  }
  }
  function inRace() { return !!(raceGetter && raceGetter()); }

  return { LAYER_IDS, top, anyOpen, navOpen, shown, inRace, setRaceGetter, trackDialog };
})();
