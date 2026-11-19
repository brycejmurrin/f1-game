const DeepLink = (function () {
"use strict";
const DOORS = Object.freeze({ race: "mb-race", daily: "mb-daily", nextgp: "mb-data", garage: "mb-garage" });
const RETRY_MS = 250, MAX_TRIES = 40;
function parse(search) {
  let go = null;
  try { go = new URLSearchParams(search || "").get("go"); } catch (_) { return null; }
  return go && Object.prototype.hasOwnProperty.call(DOORS, go) ? go : null;
}
const MARK = "apexBack", BASE = "apexBase";
function stateHas(key) {
  try { return !!(history.state && history.state[key]); } catch (_) { return false; }
}
function onSentinel() { return stateHas(MARK); }
function pushSentinel() {
  if (onSentinel()) return;
  try {
    if (!stateHas(BASE)) history.replaceState(Object.assign({}, history.state, { [BASE]: 1 }), "");
    history.pushState(Object.assign({}, history.state, { [MARK]: 1 }), "");
  } catch (_) {  }
}
let synthEsc = false;
function escapeFirst() {
  const docking = typeof document !== "undefined" && !!(document.body && document.body.hasAttribute && document.body.hasAttribute("data-dock-edit"));
  if (typeof KeyboardEvent === "undefined" || !(docking || (UiLayers.top && UiLayers.top()))) return false;
  const ev = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  synthEsc = true;
  try { (document.activeElement || document.body || document).dispatchEvent(ev); } finally { synthEsc = false; }
  return ev.defaultPrevented;
}
function onBack($) {
  if (onSentinel()) return;
  if (!stateHas(BASE)) return;
  const top = escapeFirst() || (typeof TopModal !== "undefined" && TopModal.escapeTop && TopModal.escapeTop());
  let took = !!top;
  if (!took && UiLayers.inRace()) { const p = $("pausebtn"); if (p) { p.click(); took = true; } }
  if (took) pushSentinel();
}
const SECTION_NAVS = "#htp-contents, #cg-contents, #ch-contents";
function onSectionLink(e) {
  const a = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
  if (!a || !a.closest(SECTION_NAVS) || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute("href"), sheet = a.closest("dialog, .sheet");
  const target = sheet && Array.from(sheet.querySelectorAll("[id]")).find((n) => "#" + n.id === href);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ block: "start" });
  try { history.replaceState(history.state, "", href); } catch (_) {  }
  if (typeof AriaState !== "undefined" && AriaState.sync) AriaState.sync();
}
function guardBack($) {
  if (typeof window === "undefined" || typeof history === "undefined" || typeof history.pushState !== "function") return;
  pushSentinel();
  window.addEventListener("popstate", () => onBack($));
  window.addEventListener("pointerdown", pushSentinel, true);
  window.addEventListener("keydown", () => { if (!synthEsc) pushSentinel(); }, true);
  window.addEventListener("click", onSectionLink);
}
function create(G) {
  const { $, els } = G;
  const go = parse(location.search);
  if (!go) { guardBack($); return { go: null }; }
  try {
    const q = new URLSearchParams(location.search); q.delete("go");
    const rest = q.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  } catch (_) {  }
  guardBack($);
  function titleLive() {
    if (UiLayers.inRace() || els.overlay.hidden) return false;
    const top = UiLayers.top();
    return !top || top.id === "overlay";
  }
  function fire(tries) {
    if (!titleLive()) {
      if (tries < MAX_TRIES) setTimeout(() => fire(tries + 1), RETRY_MS);
      else Log.info("game", "deep link dropped: title never became live (" + go + ")");
      return;
    }
    const btn = go === "race" ? $("mb-race") : go === "daily" ? $("mb-daily") : go === "nextgp" ? $("mb-data") : $("mb-garage");
    if (!btn || btn.hidden || btn.disabled) { Log.info("game", "deep link dropped: door unavailable (" + go + ")"); return; }
    if (go === "nextgp") btn.dataset.openTab = "schedule";
    btn.click();
  }
  setTimeout(() => fire(0), 0);
  return { go };
}
return { create, parse, DOORS, onBack, onSectionLink, MARK, BASE };
})();
Object.freeze(DeepLink);
