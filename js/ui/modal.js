"use strict";
window.TopModal = (function () {
  const wired = new WeakSet();

  function syncMenuIsolation() {
    const menu = document.getElementById("overlay");
    if (!menu) return false;
    const ids = (window.UiLayers && window.UiLayers.LAYER_IDS) || [];
    const covered = ids.some((id) => {
      if (id === "overlay" || id === "rotate-device" || id === "photo-controls" || id === "tl-editor") return false;
      const el = document.getElementById(id);
      return !!el && !el.hidden;
    });
    menu.inert = covered;
    if (covered) menu.setAttribute("aria-hidden", "true");
    else menu.removeAttribute("aria-hidden");
    return covered;
  }

  function sync(el) {
    const wantOpen = !el.hidden;
    if (wantOpen && !el.open) {
      shieldLayer(el);
      try { el.showModal(); } catch (_) {  }
      try { Log.info("ui", `TopModal open #${el.id || "?"}`); } catch (_) {  }
    } else if (!wantOpen && el.open) {
      syncMenuIsolation();
      try { el.close(); } catch (_) {}
      try { Log.info("ui", `TopModal close #${el.id || "?"}`); } catch (_) {  }
    }
    syncMenuIsolation();
  }

  function wire(el) {
    if (!el || wired.has(el) || typeof el.showModal !== "function") return;
    wired.add(el);
    if (typeof HTMLDialogElement === "undefined" && window.UiLayers && window.UiLayers.trackDialog) window.UiLayers.trackDialog(el);
    if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
    tabWrap(el);

    new MutationObserver(() => sync(el))
      .observe(el, { attributes: true, attributeFilter: ["hidden"] });

    el.addEventListener("cancel", (e) => {
      const via = el.getAttribute("data-esc-close");
      if (via) {
        e.preventDefault();
        const btn = document.getElementById(via);
        if (btn) btn.click(); else el.hidden = true;
      } else if (el.getAttribute("data-esc") === "none") {
        e.preventDefault();
      }
    });

    el.addEventListener("close", () => {
      if (el.hidden) return;
      if (el.open) return;
      const via = el.getAttribute("data-esc-close");
      if (via) { const btn = document.getElementById(via); if (btn) btn.click(); }
      if (el.hidden) return;
      if (via || el.getAttribute("data-esc") === "none") {
        queueMicrotask(() => { if (!el.hidden && !el.open) { try { el.showModal(); } catch (_) {  } } });
      } else el.hidden = true;
    });

    sync(el);
  }

  function scan(root) {
    (root || document).querySelectorAll("dialog.screen").forEach(wire);
  }

  function topModalInside(layer) {
    let modals = null;
    try { modals = document.querySelectorAll(":modal"); } catch (_) { return false; }
    return !!modals && Array.from(modals).some((m) => m !== layer && !!layer.contains && layer.contains(m));
  }

  function onEscape(e) {
    if (e.isComposing || e.keyCode === 229 || e.key !== "Escape" || e.defaultPrevented) return;
    if (e.repeat) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return;
    if (topModalInside(layer)) return;
    if (!ownsEscape(layer)) return;
    e.preventDefault();
    e.stopPropagation();
    pressDoor(layer);
  }

  const ownsEscape = (layer) => layer.getAttribute("data-esc") === "none" || !!layer.getAttribute("data-esc-close");
  function pressDoor(layer) {
    if (layer.getAttribute("data-esc") === "none") return;
    const btn = document.getElementById(layer.getAttribute("data-esc-close"));
    if (btn && !btn.disabled) btn.click();
  }

  function escapeTop() {
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return false;
    if (topModalInside(layer)) {
      const inner = Array.from(document.querySelectorAll(":modal")).filter((m) => m !== layer && layer.contains(m)).pop();
      try { if (inner.requestClose) inner.requestClose(); else inner.close(); } catch (_) {  }
      return true;
    }
    if (!ownsEscape(layer)) return false;
    pressDoor(layer);
    return true;
  }

  const FOCUSABLE_FALLBACK = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
  const focusableSel = () => (window.MenuNav && window.MenuNav.FOCUSABLE) || FOCUSABLE_FALLBACK;
  const shown = (el) => (window.UiLayers && window.UiLayers.shown) ? window.UiLayers.shown(el) : !el.hidden;
  const usable = (el) => !!el && !el.disabled &&
    !(el.getAttribute && el.getAttribute("aria-hidden") === "true") && shown(el);
  const TEXTY = /^(text|search|url|email|password|tel|number)$/;
  const isTexty = (el) => el.tagName === "TEXTAREA" ||
    (el.tagName === "INPUT" && TEXTY.test((el.type || "text").toLowerCase()));
  const LAYER_SKIP = {
    "rotate-device": 1, "photo-controls": 1,
  };
  function firstFocusable(layer, skipTexty) {
    for (const el of layer.querySelectorAll(focusableSel())) {
      if (!usable(el) || (skipTexty && isTexty(el))) continue;
      return el;
    }
    return null;
  }

  function onFocusIn(e) {
    noteFocus(e);
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return;
    if (LAYER_SKIP[layer.id]) return;
    const t = e.target;
    if (layer.tagName === "DIALOG") {
      if (t && t !== document.body && layer.contains(t)) return;
      const focusable = firstFocusable(layer, false) || layer;
      try { focusable.focus({ preventScroll: true }); } catch (_) {  }
      return;
    }
    if (t && layer.contains(t)) return;
    const focusable = firstFocusable(layer, false);
    if (focusable) {
      try { focusable.focus({ preventScroll: true }); } catch (_) {  }
    }
  }

  const lastFocus = new WeakMap();
  const opener = new WeakMap();
  const inside = (layer, el) => !!el && el !== document.body && layer.contains(el);
  const connected = (el) => !!el && !!document.body && document.body.contains(el);
  const focusQuiet = (el) => { try { el.focus({ preventScroll: true }); } catch (_) {  } };

  function landing(layer) {
    const auto = layer.querySelector("[autofocus]");
    if (usable(auto)) return auto;
    const nav = window.MenuNav;
    if (nav && nav.currentItem && nav.items) {
      const list = nav.items(layer).filter((el) => !isTexty(el));
      const cur = nav.currentItem(layer, list);
      if (cur) return cur;
    }
    return firstFocusable(layer, true);
  }

  function keepFocus(scope, rebuild) {
    const a = document.activeElement;
    let key = null;
    if (scope && inside(scope, a)) {
      let g = a.parentElement;
      while (g && g !== scope && !g.id) g = g.parentElement;
      const pool = g ? [...g.querySelectorAll(focusableSel())] : [];
      key = { id: a.id || null, group: g && g.id ? g.id : null, i: pool.indexOf(a) };
    }
    rebuild();
    if (!key) return;
    const now = document.activeElement;
    if (connected(now) && now !== document.body) return;
    let t = key.id ? document.getElementById(key.id) : null;
    if (!usable(t)) {
      const g = key.group ? document.getElementById(key.group) : null;
      const pool = g ? [...g.querySelectorAll(focusableSel())].filter(usable) : [];
      t = pool.length ? pool[Math.min(Math.max(key.i, 0), pool.length - 1)] : null;
    }
    if (!t) t = landing(scope);
    if (t) focusQuiet(t);
  }

  function onLayerShow(layer) {
    shieldLayer(layer);
    const a = document.activeElement;
    if (inside(layer, a)) {
      const from = recentOutside(layer);
      opener.set(layer, from);
      const home = from && homeLayer(from);
      if (home && home !== layer) lastFocus.set(home, from);
      return;
    }
    opener.set(layer, connected(a) && a !== document.body ? a : null);
    const back = lastFocus.get(layer);
    const target = (connected(back) && layer.contains(back) && usable(back)) ? back : landing(layer);
    if (target) focusQuiet(target);
  }

  const trail = [];
  function noteFocus(e) {
    for (const el of [e.relatedTarget, e.target]) {
      if (!el || el === document.body || trail[trail.length - 1] === el) continue;
      trail.push(el);
      if (trail.length > 6) trail.shift();
    }
  }
  function homeLayer(el) {
    const ids = (window.UiLayers && window.UiLayers.LAYER_IDS) || [];
    for (let p = el.parentElement; p; p = p.parentElement) if (p.id && ids.indexOf(p.id) >= 0) return p;
    return null;
  }
  function recentOutside(layer) {
    for (let i = trail.length - 1; i >= 0; i--) {
      if (connected(trail[i]) && !layer.contains(trail[i])) return trail[i];
    }
    return null;
  }

  function onLayerHide(layer) {
    const a = document.activeElement;
    if (inside(layer, a)) lastFocus.set(layer, a);
    const back = opener.get(layer);
    opener.delete(layer);
    const top = window.UiLayers && window.UiLayers.top ? window.UiLayers.top() : null;
    if (!connected(back) || !usable(back)) {
      const mem = top && lastFocus.get(top);
      if ((!a || a === document.body) && connected(mem) && top.contains(mem) && usable(mem)) focusQuiet(mem);
      return;
    }
    if (a && a !== document.body && !layer.contains(a)) return;
    if (top && !top.contains(back)) return;
    focusQuiet(back);
  }

  function tabWrap(el) {
    el.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229 || e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!window.UiLayers || window.UiLayers.top() !== el || topModalInside(el)) return;
      const stops = Array.from(el.querySelectorAll(focusableSel())).filter((n) => usable(n) && n.tabIndex >= 0);
      const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
      if (!edge || document.activeElement !== edge) return;
      e.preventDefault();
      focusQuiet(e.shiftKey ? stops[stops.length - 1] : stops[0]);
    });
  }

  function wireLayer(el) {
    if (!el || wired.has(el) || typeof el.showModal === "function") return;
    wired.add(el);
    tabWrap(el);
    new MutationObserver(() => {
      if (el.hidden) { syncMenuIsolation(); onLayerHide(el); } else { onLayerShow(el); syncMenuIsolation(); }
    })
      .observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }

  function scanLayers() {
    const ids = (window.UiLayers && window.UiLayers.LAYER_IDS) || [];
    for (const id of ids) {
      if (LAYER_SKIP[id]) continue;
      const el = document.getElementById(id);
      if (el && el.tagName !== "DIALOG") wireLayer(el);
    }
  }

  const SHIELD_MS = 350, SHIELD_PX = 32, SHOW_LATE_MS = 5000;
  let lastTap = null, shield = null;
  const evtAt = (e) => (e && e.timeStamp > 0 && typeof performance !== "undefined" && performance.timeOrigin > 0
    ? performance.timeOrigin + e.timeStamp : Date.now());
  function shieldLayer(layer) {
    if (lastTap && Date.now() - lastTap.at < SHOW_LATE_MS) shield = { layer, until: lastTap.at + SHIELD_MS, x: lastTap.x, y: lastTap.y };
  }
  function onClickShield(e) {
    const isClick = e.type === "click";
    if (!e.isTrusted || (isClick && e.detail === 0)) return;
    if (typeof navigator !== "undefined" && navigator && navigator.webdriver === true) return;
    const s = shield, now = evtAt(e);
    if (s && now < s.until && s.layer.contains(e.target) &&
        Math.hypot(e.clientX - s.x, e.clientY - s.y) <= SHIELD_PX) {
      e.preventDefault();
      if (isClick) e.stopImmediatePropagation(); else e.stopPropagation();
      return;
    }
    if (isClick) lastTap = { at: now, x: e.clientX, y: e.clientY };
  }

  function init() {
    Log.info("ui", "TopModal.init");
    scan();
    scanLayers();
    syncMenuIsolation();
    document.addEventListener("keydown", onEscape, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("click", onClickShield, true);
    window.addEventListener("pointerdown", onClickShield, true);
    window.addEventListener("pointerup", onClickShield, true);
  }

  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, wire, onEscape, onFocusIn, wireLayer, scanLayers, landing, keepFocus, syncMenuIsolation, escapeTop, onClickShield };
})();
