/* Apex 26 — DeepLink: the installed-icon shortcuts (manifest.json `shortcuts`) land on `./?go=<door>`. Each door is a title button the
   player could have tapped; this clicks it once the title is live, then drops the param so a reload does not replay it. */
const DeepLink = (function () {
"use strict";
const DOORS = Object.freeze({ race: "mb-race", daily: "mb-daily", nextgp: "mb-data", garage: "mb-garage" });
const RETRY_MS = 250, MAX_TRIES = 40;   // boot / loading plate / first-run layers can sit over the title for a few seconds
function parse(search) {
  let go = null;
  try { go = new URLSearchParams(search || "").get("go"); } catch (_) { return null; }
  return go && Object.prototype.hasOwnProperty.call(DOORS, go) ? go : null;
}
/* BACK IS ESCAPE. The Android back button / iOS edge swipe left the game from
   any screen, mid-race too (UI hunt 2026-10-29 #2). One sentinel entry, same
   URL, sits on top of the page's own: a back that pops it closes the top layer
   exactly as Escape would, else pauses a race, then re-pushes. On the bare
   title nothing takes it, so the sentinel stays spent and the next back leaves;
   the next tap or key re-arms it (Chromium's history intervention skips an
   entry pushed with no user activation until the page gets one anyway). */
const MARK = "apexBack", BASE = "apexBase";
// A HOW TO PLAY #htp-* section link is a fragment navigation: it fires
// popstate onto a fresh entry with no state, and treating that as BACK closed
// the sheet. So the entry each sentinel sits on is stamped BASE first; only a
// pop that lands on a stamped entry is a back off the sentinel.
function stateHas(key) {
  try { return !!(history.state && history.state[key]); } catch (_) { return false; }
}
function onSentinel() { return stateHas(MARK); }
function pushSentinel() {
  if (onSentinel()) return;
  try {
    if (!stateHas(BASE)) history.replaceState(Object.assign({}, history.state, { [BASE]: 1 }), "");
    history.pushState(Object.assign({}, history.state, { [MARK]: 1 }), "");
  } catch (_) { /* sandboxed page */ }
}
// BACK ASKS ESCAPE FIRST. Inner handlers take Escape ahead of the layer's door
// (circuit search clears, the garage camera panel shuts, a peek ends); pressing
// the door straight away closed the whole screen instead (UI hunt 3). So a
// layer that is up hears a synthetic Escape at the focused element; only when
// nobody claims it does escapeTop() run (a nested modal ignores a synthetic key).
let synthEsc = false;
function escapeFirst() {
  // REPOSITION TOUCH CONTROLS is no layer (it hides SETTINGS and PAUSED), but
  // it ends on Escape and marks body[data-dock-edit] (js/ui/dock-layout.js).
  const docking = typeof document !== "undefined" && !!(document.body && document.body.hasAttribute && document.body.hasAttribute("data-dock-edit"));
  if (typeof KeyboardEvent === "undefined" || !(docking || (UiLayers.top && UiLayers.top()))) return false;
  const ev = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  synthEsc = true;
  try { (document.activeElement || document.body || document).dispatchEvent(ev); } finally { synthEsc = false; }
  return ev.defaultPrevented;
}
function onBack($) {
  if (onSentinel()) return;                     // forward onto our own entry: nothing to undo
  if (!stateHas(BASE)) return;                  // a fragment navigation, not a back off the sentinel
  const top = escapeFirst() || (typeof TopModal !== "undefined" && TopModal.escapeTop && TopModal.escapeTop());
  let took = !!top;
  if (!took && UiLayers.inRace()) { const p = $("pausebtn"); if (p) { p.click(); took = true; } }
  if (took) pushSentinel();
}
// SECTION LINKS ARE NO HISTORY. Each HOW TO PLAY / guide contents link was a
// fragment navigation, a new entry the back gesture then spent silently (one
// dead back per section visited) before it closed the sheet (UI hunt 3). The
// jump scrolls in place and REPLACES the URL's hash; AriaState repaints
// aria-current, which hashchange (not fired by replaceState) used to do.
const SECTION_NAVS = "#htp-contents, #cg-contents, #ch-contents";
function onSectionLink(e) {
  const a = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
  if (!a || !a.closest(SECTION_NAVS) || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  // The section is looked up inside the link's own sheet: a contents link never
  // jumps out of it, and the ids stay static (no dynamic getElementById).
  const href = a.getAttribute("href"), sheet = a.closest("dialog, .sheet");
  const target = sheet && Array.from(sheet.querySelectorAll("[id]")).find((n) => "#" + n.id === href);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ block: "start" });
  try { history.replaceState(history.state, "", href); } catch (_) { /* sandboxed page */ }
  if (typeof AriaState !== "undefined" && AriaState.sync) AriaState.sync();
}
function guardBack($) {
  if (typeof window === "undefined" || typeof history === "undefined" || typeof history.pushState !== "function") return;
  pushSentinel();
  window.addEventListener("popstate", () => onBack($));
  window.addEventListener("pointerdown", pushSentinel, true);
  window.addEventListener("keydown", () => { if (!synthEsc) pushSentinel(); }, true);   // our own Escape is no re-arm
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
  } catch (_) { /* file:/opaque origin: the param just stays */ }
  guardBack($);
  // Only the bare title takes a shortcut: a layer over it (consent, career hub, a picker) or a race keeps the player where they are.
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
    const btn = go === "race" ? $("mb-race") : go === "daily" ? $("mb-daily") : go === "nextgp" ? $("mb-data") : $("mb-garage");   // literal ids: the dynamic-id ratchet is shrink-only
    if (!btn || btn.hidden || btn.disabled) { Log.info("game", "deep link dropped: door unavailable (" + go + ")"); return; }
    // NEXT GP always means the schedule (the hub remembers its last tab). The
    // door opens ON it once its bundle lands: polling 10 s for the tab missed a
    // slow first load and opened the remembered tab instead (UI hunt 3).
    if (go === "nextgp") btn.dataset.openTab = "schedule";
    btn.click();
  }
  // TitleFlow installs this consumer before TitleMenu/game.js bind DAILY,
  // DATA and GARAGE. Let that synchronous wiring finish before clicking a door.
  setTimeout(() => fire(0), 0);
  return { go };
}
return { create, parse, DOORS, onBack, onSectionLink, MARK, BASE };
})();
Object.freeze(DeepLink);
