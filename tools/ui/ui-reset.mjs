// ui-reset — ONE way back to the title for the layout tools: close each layer through its own door.
// @doc Shared door-first overlay reset (resetOverlays, titleUsable): hidden=true only as a logged fallback.
// @skill survey-ui-matrix
//
// WHY. Four places used to return to the title by setting `hidden = true` on
// every OVERLAY_ID. Hiding the ELEMENT is not closing the SCREEN: module state
// survives it. Proven on the Data Hub — js/data/hub.js open() returns early on
// its own `openFlag`, so after a hidden-reset the next #mb-data click only
// switched tabs and every later data* cell timed out (UI hunt 2026-10-29;
// layout-audit special-cased it in c79ae672). The same class bites any screen
// whose close path tears something down (VS FRIEND's camera, Photo Studio's
// body class, the pause menu's paused race).
//
// THE ORDER (resetOverlays):
//   1. while UiLayers.top() is a layer other than #overlay, up to `rounds`:
//      a. a TITLE EXIT for that layer, when the door would not lead to the
//         title (#pausemenu's door is RESUME — the race goes on; QUIT TO MENU
//         is the way home; #results has no Escape door, MENU is its exit);
//         an `armed` confirm button is pressed twice, as a player would;
//      b. TopModal.escapeTop() — what Escape / the back gesture does
//         (js/ui/modal.js; a nested :modal closes first);
//      c. the layer's `data-esc-close` button;
//      d. a module close API (`modules`: layer id → global with close());
//      e. a bare <dialog>: close();
//      a layer that does not leave after its door is STUCK: stop, fall back.
//   2. module APIs still open (DataHub.isOpen()) → close().
//   3. the old sweep, `hidden = true`, ONLY for what is still open — and the
//      ids that needed it are returned (`fallbackIds`) and logged, because each
//      one is a screen whose door the reset could not use.
//   4. #overlay shown, route body classes stripped, the install tip/chip hidden.
// #rotate-device is never hidden: it is CSS-gated (body.in-race + a portrait
// media query, css/overlays.css), and stripping `in-race` is what clears it.
//
// The caller then checks the title is USABLE (titleUsable: sized AND hittable)
// and reloads on failure, as every tool did before.
//
// Ghost-tap shield: js/ui/modal.js swallows a pointer click within 350 ms of a
// layer's opening tap, but stands down for el.click() (untrusted), detail 0 and
// navigator.webdriver (98ce5953) — every click here is el.click(), and every
// tool drives Playwright, so neither the reset nor the next cell's open is eaten.

import { OVERLAY_IDS } from "./menu-screens.mjs";

// Union of menu-capture's and layout-audit's lists (layout-audit lacked
// photo-studio-open, which forces #rotate-device off and gates hit-testing).
export const ROUTE_BODY_CLASSES = [
  "in-race", "lt-open", "photo-mode", "photo-studio-open",
  "pc-nopanel", "pc-uihidden", "rotate-help-open", "manual",
];
// Not layers: the iOS Add-to-Home tip and its chip sit over title buttons on
// touch UAs. Dismissed for harness clicks, never counted as a fallback.
export const TIP_IDS = ["ios-install", "install-chip"];
// CSS-gated layers the reset must never force-hide.
export const NEVER_HIDE = ["rotate-device"];
// Where a layer's own door does not lead home, the exit that does.
export const TITLE_EXITS = { pausemenu: "pm-quit", results: "res-menu" };
// Layers whose module keeps state that `hidden` cannot reach.
export const MODULE_CLOSERS = { datahub: "DataHub" };
// Plates with no door (data-esc="none") that clear themselves: wait, never press.
export const TRANSITION_PLATES = ["loading"];

/**
 * In-page (pass to page.evaluate). Self-contained: every input arrives in `cfg`.
 * Returns {ok, top, closed:[{id,how}], stuck:[id], fallbackIds:[id]}.
 */
export async function resetOverlays(cfg) {
  const c = cfg || {};
  const doc = document, win = window;
  const rounds = c.rounds == null ? 8 : c.rounds;
  const settleMs = c.settleMs == null ? 40 : c.settleMs;
  const never = new Set(c.neverHide || []);
  const exits = c.exits || {}, modules = c.modules || {};
  const tick = () => new Promise((r) => setTimeout(r, settleMs));
  const topLayer = () => {
    try { return win.UiLayers && win.UiLayers.top ? win.UiLayers.top() : null; } catch (_) { return null; }
  };
  // Still up: connected, not hidden, and (a <dialog>) still open.
  const isOpen = (el) => !!el && el.isConnected !== false && !el.hidden
    && !(el.tagName === "DIALOG" && el.open === false);
  const press = (id) => {
    const b = id && doc.getElementById(id);
    if (!b || b.disabled) return false;
    b.click();
    if (b.classList && b.classList.contains("armed")) b.click();
    return true;
  };
  const modOf = (id) => (modules[id] ? win[modules[id]] : null);
  const closed = [], stuck = [], fallbackIds = [];

  const waitMs = c.waitMs == null ? 8000 : c.waitMs;
  const plates = new Set(c.plates || []);
  // A state fingerprint: a Settings sub-page's BACK keeps the same layer up
  // but changes its text and focus, which is progress, not a stuck door.
  const sig = (el) => (el && el.textContent ? el.textContent.length : 0) + "|" +
    (doc.activeElement && doc.activeElement.id || "");
  // Poll until pred() or ms elapse (a slow close: PHOTO STUDIO ~4 s on
  // SwiftShader; the RETURNING plate ~3 s).
  const until = async (pred, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 100)); }
    return pred();
  };
  const plateMs = c.plateMs == null ? 20000 : c.plateMs;
  const wasRacing = !!(doc.body && doc.body.classList && doc.body.classList.contains("in-race"));
  for (let i = 0; i < rounds; i++) {
    const layer = topLayer();
    if (!layer || layer.id === "overlay" || never.has(layer.id)) break;
    const id = layer.id || String(layer.tagName || "?").toLowerCase();
    // A transition plate (#loading) owns no door: wait it out.
    if (plates.has(layer.id)) {
      if (!(await until(() => topLayer() !== layer || !isOpen(layer), plateMs))) { stuck.push(id); break; }
      closed.push({ id, how: "waited" });
      continue;
    }
    const before = sig(layer);
    let how = null;
    const door = layer.getAttribute ? layer.getAttribute("data-esc-close") : null;
    const mod = modOf(layer.id);
    if (exits[layer.id] && press(exits[layer.id])) how = "exit:" + exits[layer.id];
    else if (win.TopModal && typeof win.TopModal.escapeTop === "function" && win.TopModal.escapeTop()) how = "escapeTop";
    else if (door && press(door)) how = "door:" + door;
    else if (mod && typeof mod.close === "function") { mod.close(); how = "module:" + modules[layer.id]; }
    else if (layer.tagName === "DIALOG" && typeof layer.close === "function") { layer.close(); how = "dialog.close"; }
    if (!how) { stuck.push(id); break; }
    await tick();
    const moved = await until(() => !isOpen(layer) || topLayer() !== layer || sig(layer) !== before, waitMs);
    if (!moved) { stuck.push(id); break; }
    closed.push({ id, how });
  }

  // A race left running under a closed photo / tuner stack: the doors above
  // close the stack but not the session, and a live session keeps the title's
  // doors from opening their screens (the four data* cells timed out after
  // photocontrols). Quit it the way a player does: pause, then QUIT.
  if (wasRacing && doc.body.classList.contains("in-race") === false && win.__apex && win.__apex.info) {
    let live = false;
    try { const inf = win.__apex.info(); live = !!(inf && inf.track); /* track is set only in race/count */ } catch (_) { live = false; }
    if (live) doc.body.classList.add("in-race");
  }
  const quitAlready = closed.some((x) => x.how === "exit:pm-quit");
  const pm = doc.getElementById("pausemenu");
  if (wasRacing && !quitAlready && pm && doc.body.classList.contains("in-race")) {
    if (pm.hidden) press("pausebtn");
    await until(() => !pm.hidden, Math.min(5000, plateMs));
    if (press("pm-quit")) {
      await until(() => !doc.body.classList.contains("in-race") && topLayer() && topLayer().id === "overlay", plateMs);
      closed.push({ id: "race", how: "exit:pm-quit" });
    }
  }
  for (const [lid, g] of Object.entries(modules)) {
    const m = win[g];
    let open = false;
    try { open = !!(m && m.isOpen && m.isOpen()); } catch (_) { open = false; }
    if (open && typeof m.close === "function") { m.close(); fallbackIds.push(lid + ":" + g + ".close"); }
  }
  for (const id of c.ids || []) {
    if (never.has(id)) continue;
    const el = doc.getElementById(id);
    if (el && !el.hidden) { el.hidden = true; fallbackIds.push(id); }
  }
  for (const id of c.tips || []) { const el = doc.getElementById(id); if (el) el.hidden = true; }
  const ov = doc.getElementById("overlay");
  if (ov) {
    ov.hidden = false;
    if (ov.style && ov.style.removeProperty) ov.style.removeProperty("display");
  }
  if (doc.body && doc.body.classList) doc.body.classList.remove(...(c.bodyClasses || []));
  await tick();
  const t = topLayer();
  const top = t ? (t.id || String(t.tagName || "?").toLowerCase()) : null;
  return { ok: !t || t.id === "overlay", top, closed, stuck, fallbackIds };
}

/** The config every caller passes; exported so a test drives the same one. */
export function resetConfig(ids = OVERLAY_IDS, extra = {}) {
  return {
    ids, rounds: 12, settleMs: 40, waitMs: 8000, plates: TRANSITION_PLATES,
    neverHide: NEVER_HIDE, exits: TITLE_EXITS, modules: MODULE_CLOSERS,
    tips: TIP_IDS, bodyClasses: ROUTE_BODY_CLASSES, ...extra,
  };
}

/**
 * Node side: run the reset in `page`, log any hidden=true fallback, return the result.
 * `log` null silences it; `tag` names the cell in the log line.
 */
export async function resetToTitleState(page, { ids = OVERLAY_IDS, log = console.warn, tag = "" } = {}) {
  const r = await page.evaluate(resetOverlays, resetConfig(ids));
  if (log && (r.fallbackIds.length || r.stuck.length)) {
    log(`ui-reset${tag ? " " + tag : ""}: ` +
      (r.stuck.length ? `stuck at ${r.stuck.join(",")}; ` : "") +
      `hidden=true fallback for ${r.fallbackIds.join(",") || "nothing"}` +
      (r.closed.length ? ` (closed by door: ${r.closed.map((x) => x.id).join(",")})` : ""));
  }
  return r;
}

/** In-page: #mb-race sized AND hittable (a covering layer leaves it full-sized but inert, 2026-09-30). */
export function titleUsable() {
  const b = document.getElementById("mb-race");
  if (!b) return false;
  const r = b.getBoundingClientRect();
  if (!(r.width > 1 && r.height > 1)) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === b || b.contains(hit)) && !b.closest("[inert]");
}
