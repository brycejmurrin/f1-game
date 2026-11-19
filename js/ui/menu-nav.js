"use strict";
window.MenuNav = (function () {

  const UL = window.UiLayers;

  const SCROLLERS = ".pane,.panel-scroll,.scroll-y,.dh-content,.dh-tpopup-body,.dh-telem-main,.dh-telem-side,#track-detail-panel,#track-detail,#menu-buttons";

  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";

  const LINE_PX = 16;
  const PAGE_FRAC = 0.9;

  const shown = UL.shown;

  function activeLayer() {
    const t = UL.top();
    return (t && (t.id === "photo-controls" || t.id === "freecam" || t.id === "tl-editor")) ? null : t;
  }

  function canScroll(el, dy, oyIn) {
    if (!el || el.nodeType !== 1) return false;
    const oy = oyIn != null ? oyIn : getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    return dy < 0 ? el.scrollTop > 1 : el.scrollTop < max - 1;
  }

  function isRegion(el, oyIn) {
    if (!el || el.nodeType !== 1 || !el.matches || !el.matches(SCROLLERS)) return false;
    const oy = oyIn != null ? oyIn : getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
    return el.scrollHeight - el.clientHeight > 1;
  }

  function panes(layer, dy) {
    const out = [];
    if (canScroll(layer, dy)) out.push(layer);
    for (const el of layer.querySelectorAll(SCROLLERS)) {
      if (shown(el) && canScroll(el, dy)) out.push(el);
    }
    return out;
  }

  function nearestPane(layer, x, y, dy) {
    const list = panes(layer, dy);
    if (list.length < 2) return list[0] || null;
    let best = null, bestCost = Infinity;
    for (const el of list) {
      const r = (window.CssZoom && CssZoom.viewportRect(el)) || el.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dv = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const cost = dx * 3 + dv;
      if (cost < bestCost) { bestCost = cost; best = el; }
    }
    return best;
  }

  function wheelPx(e) {
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= LINE_PX;
    else if (e.deltaMode === 2) d *= (document.documentElement.clientHeight || window.innerHeight) * PAGE_FRAC;
    return d;
  }

  function scrollPane(pane, px) {
    const local = (window.CssZoom && CssZoom.toLocalDelta(pane, px)) || px;
    const before = pane.scrollTop;
    pane.scrollTop = before + local;
    if (pane.scrollTop === before) return false;
    if (window.ScrollFade) window.ScrollFade.paint(pane);
    return true;
  }

  function onWheel(e) {
    if (e.ctrlKey || e.defaultPrevented) return;
    const layer = activeLayer();
    if (!layer) return;
    const dy = wheelPx(e);
    if (!dy) return;
    const strip = hStrip(layer);
    const overStrip = !!(strip && e.target && strip.contains(e.target));
    if (overStrip) {
      if (scrollStrip(strip, dy)) e.preventDefault();
      return;
    }
    const stop = layer.parentNode;
    for (let el = e.target; el && el !== stop; el = el.parentElement) {
      if (el.nodeType !== 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (canScroll(el, dy, oy)) return;
      if (isRegion(el, oy)) return;
    }
    const pane = nearestPane(layer, e.clientX, e.clientY, dy);
    if (pane && scrollPane(pane, dy)) { e.preventDefault(); return; }
    if (strip && scrollStrip(strip, dy)) e.preventDefault();
  }

  function hStrip(layer) {
    for (const el of layer.querySelectorAll('[data-orientation="horizontal"]')) {
      if (!shown(el)) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox !== "auto" && ox !== "scroll" && ox !== "overlay") continue;
      if (el.scrollWidth - el.clientWidth > 1) return el;
    }
    return null;
  }

  function scrollStrip(strip, px) {
    const local = (window.CssZoom && CssZoom.toLocalDelta(strip, px)) || px;
    const before = strip.scrollLeft;
    strip.scrollLeft = before + local;
    if (strip.scrollLeft === before) return false;
    if (window.ScrollFade) window.ScrollFade.paint(strip);
    return true;
  }

  function items(layer) {
    const out = [];
    for (const el of layer.querySelectorAll(FOCUSABLE)) {
      if (el.disabled || el.getAttribute("aria-hidden") === "true") continue;
      if (ownedListboxOption(el) && el.tabIndex < 0) continue;
      if (!shown(el)) continue;
      if (el.checkVisibility) {
        if (!el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) continue;
      } else {
        const fold = el.closest("details:not([open])");
        if (fold && !(el.tagName === "SUMMARY" && el.parentElement === fold)) continue;
      }
      out.push(el);
    }
    return out;
  }

  let _boxes = null;
  function centre(el) {
    let b = _boxes && _boxes.get(el);
    if (b) return b;
    const r = el.getBoundingClientRect();
    b = { l: r.left, r: r.right, t: r.top, b: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (_boxes) _boxes.set(el, b);
    return b;
  }

  function overlaps(a1, a2, b1, b2) { return Math.min(a2, b2) - Math.max(a1, b1) > 1; }
  function gap(p, lo, hi) { return p < lo ? lo - p : p > hi ? p - hi : 0; }

  function pickSideways(fromBox, boxes, dx) {
    const a = fromBox;
    let best = null, bestCost = Infinity;
    for (const b of boxes) {
      const along = (b.x - a.x) * dx;
      if (along <= 1) continue;
      const across = Math.abs(b.y - a.y);
      const cost = along + across * 0.25;
      if (cost < bestCost) { bestCost = cost; best = b; }
    }
    return best;
  }

  function step(from, dx, dy, list) {
    if (dx) {
      const row = from.closest && from.closest(".chip-row");
      if (row) {
        const chips = list.filter((el) => row.contains(el));
        const j = chips.indexOf(from) + (dx > 0 ? 1 : -1);
        if (chips[j]) return chips[j];
      }
    }
    const a = centre(from);
    const sign = dx + dy;
    let best = null, bestAlong = Infinity, bestAcross = Infinity;
    let edge = null, edgeDist = 0;
    const tol = Math.max(8, (dx ? a.r - a.l : a.b - a.t) * 0.6);
    const paneDown = dy > 0 && from.closest ? from.closest(SCROLLERS) : null;
    let ownPane = false;
    if (paneDown) for (const el of list) {
      if (el === from || !paneDown.contains(el)) continue;
      const b = centre(el);
      if (b.y - a.y > 1 && overlaps(a.l, a.r, b.l, b.r)) { ownPane = true; break; }
    }
    for (const el of list) {
      if (el === from) continue;
      const b = centre(el);
      const along = dx ? (b.x - a.x) * dx : (b.y - a.y) * dy;
      const inBand = dx ? overlaps(a.t, a.b, b.t, b.b) : overlaps(a.l, a.r, b.l, b.r);
      if (!inBand) continue;
      if (ownPane && along > 1 && !paneDown.contains(el)) continue;
      if (along > 1) {
        const across = dx ? gap(a.y, b.t, b.b) : gap(a.x, b.l, b.r);
        const nearerRow = along < bestAlong - tol;
        const sameRow = !nearerRow && along <= bestAlong + tol;
        if (nearerRow || (sameRow && (across < bestAcross || (across === bestAcross && along < bestAlong)))) {
          best = el; bestAlong = along; bestAcross = across;
        }
      } else if (-along > edgeDist) {
        edgeDist = -along; edge = el;
      }
    }
    if (best) return best;
    if (dx) {
      const boxes = [];
      for (const el of list) {
        if (el === from) continue;
        const b = centre(el);
        boxes.push({ el, x: b.x, y: b.y });
      }
      const hit = pickSideways(a, boxes, dx);
      if (hit) return hit.el;
    }
    if (dy > 0) {
      const pane = from.closest && from.closest(SCROLLERS);
      if (pane) {
        let foot = null, footAlong = Infinity;
        for (const el of list) {
          if (el === from || pane.contains(el)) continue;
          const along = centre(el).y - a.y;
          if (along > 1 && along < footAlong) { foot = el; footAlong = along; }
        }
        if (foot) return foot;
      }
    }
    if (dy < 0 && from.getAttribute && from.getAttribute("role") === "tab") {
      let head = null, headCost = Infinity;
      for (const el of list) {
        const b = centre(el), along = a.y - b.y;
        if (el === from || along <= 1) continue;
        const cost = along + gap(a.x, b.l, b.r) * 0.25;
        if (cost < headCost) { head = el; headCost = cost; }
      }
      if (head) return head;
    }
    if (dy && edge) return edge;
    const rail = dy && from.getAttribute && from.getAttribute("role") === "tab" && from.closest && from.closest("[role='tablist']");
    const ring = rail ? list.filter((el) => el === from || !rail.contains(el)) : list;
    const i = ring.indexOf(from);
    const n = ring.length;
    const j = i + (sign > 0 ? 1 : -1);
    return n ? ring[((j % n) + n) % n] : null;
  }

  function currentItem(layer, list) {
    const preferred = layer.querySelector("[data-menu-default]");
    if (preferred && list.indexOf(preferred) >= 0) return preferred;
    const sel = layer.querySelector("[aria-selected='true'],[aria-pressed='true'],.active");
    if (sel && list.indexOf(sel) >= 0) return sel;
    return list[0] || null;
  }

  const isStrip = (n) => n.getAttribute && n.getAttribute("data-orientation") === "horizontal"
    && n.scrollWidth - n.clientWidth > 1;
  function scrollerOf(el, layer) {
    for (let n = el; n && n !== layer.parentNode; n = n.parentElement) {
      if (n.nodeType !== 1 || !n.matches) continue;
      if (n.matches(SCROLLERS) && n.scrollHeight - n.clientHeight > 1) return n;
      if (isStrip(n)) return n;
    }
    return null;
  }

  function focusItem(el, layer) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const sc = scrollerOf(el, layer);
    if (sc && window.ScrollFade) window.ScrollFade.paint(sc);
  }

  function keepFocusInView(pane, active, list) {
    if (!active || !pane.contains(active)) return;
    const horizontal = isStrip(pane);
    const start = horizontal ? "left" : "top", end = horizontal ? "right" : "bottom";
    const p = pane.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a[start] >= p[start] - 1 && a[end] <= p[end] + 1) return;
    let best = null, bestD = Infinity;
    for (const el of list) {
      if (!pane.contains(el)) continue;
      const b = el.getBoundingClientRect();
      if (b[start] < p[start] - 1 || b[end] > p[end] + 1) continue;
      const d = b[start] - p[start];
      if (d < bestD) { bestD = d; best = el; }
    }
    if (best) best.focus({ preventScroll: true });
  }

  const CARET_KEYS = { ArrowLeft: 1, ArrowRight: 1, Home: 1, End: 1 };
  function ownedListboxOption(el) {
    return el && el.dataset && el.dataset.arrows === "listbox" && el.getAttribute && el.getAttribute("role") === "option"
      && el.closest && el.closest('[role="listbox"]');
  }
  function ownsArrows(el, key, event) {
    if (!el) return false;
    if (el.dataset && el.dataset.arrows === "own" && DIRS[key] && (!event || event.isTrusted !== false)) return true;
    const t = el.tagName;
    if (t === "CANVAS") return !(el.dataset && el.dataset.arrows === "pass");
    if (t === "TEXTAREA") return !(event && event.isTrusted === false);
    if (t === "SELECT") return key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End";
    if (t === "INPUT") {
      const ty = (el.type || "text").toLowerCase();
      if (ty === "checkbox" || ty === "radio" || ty === "button" ||
          ty === "submit" || ty === "reset") return false;
      if (ty === "range" && (key === "PageUp" || key === "PageDown")) return !(event && event.isTrusted === false);
      if ((key === "ArrowLeft" || key === "ArrowRight") && event && event.isTrusted === false) return false;
      return !!CARET_KEYS[key];
    }
    if (el.getAttribute && el.getAttribute("role") === "tab") return tabOwns(el, key);
    if (ownedListboxOption(el)) {
      const vertical = key === "ArrowUp" || key === "ArrowDown";
      return !!CARET_KEYS[key] || (vertical && !(event && event.isTrusted === false));
    }
    return !!el.isContentEditable;
  }

  function tabOwns(tab, key) {
    if (key === "Home" || key === "End") return true;
    const dir = DIRS[key];
    if (!dir) return false;
    const list = (tab.closest && tab.closest("[role='tablist']")) || tab.parentElement;
    const o = list && list.getAttribute && list.getAttribute("aria-orientation");
    let railX = true;
    if (o === "vertical") railX = false;
    else if (o !== "horizontal" && list && list.querySelectorAll) {
      const a = centre(tab);
      let siblings = 0;
      railX = false;
      for (const s of list.querySelectorAll("[role='tab']")) {
        if (s === tab || !shown(s)) continue;
        siblings++;
        const b = centre(s);
        if (overlaps(a.t, a.b, b.t, b.b)) { railX = true; break; }
      }
      if (!siblings) railX = true;
    }
    return (dir[0] !== 0) === railX;
  }

  const DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  };

  function onKeyDown(e) {
    try { navKey(e); } finally { _boxes = null; }
  }

  function navKey(e) {
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    const dir = DIRS[key];
    const paging = key === "PageDown" || key === "PageUp" || key === "Home" || key === "End";
    const seed = (key === "Enter" || key === " ") && document.activeElement === document.body;
    if (!dir && !paging && !seed) return;
    const layer = activeLayer();
    if (!layer) return;
    const active = document.activeElement;
    if (active && active.dataset && active.dataset.armed === "1") return;
    if (ownsArrows(active, key, e)) return;

    const list = items(layer);
    if (!list.length) return;
    _boxes = new Map();
    const inLayer = active && layer.contains(active) && list.indexOf(active) >= 0;
    if (seed) { e.preventDefault(); focusItem(currentItem(layer, list), layer); return; }

    if (paging) {
      const region = inLayer ? scrollerOf(active, layer) : null;
      if (key === "Home" || key === "End") {
        let scope = list;
        if (region) {
          scope = [];
          for (const el of region.querySelectorAll(FOCUSABLE)) {
            if (el.disabled || el.getAttribute("aria-hidden") === "true") continue;
            if (ownedListboxOption(el) && el.tabIndex < 0) continue;
            if (el.checkVisibility) {
              if (!el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) continue;
            } else if (!shown(el)) continue;
            scope.push(el);
          }
        }
        if (!scope.length) return;
        focusItem(key === "Home" ? scope[0] : scope[scope.length - 1], layer);
        e.preventDefault();
        return;
      }
      const sign = key === "PageDown" ? 1 : -1;
      const pane = region ||
        nearestPane(layer, (document.documentElement.clientWidth || window.innerWidth) / 2, (document.documentElement.clientHeight || window.innerHeight) / 2, sign);
      const strip = pane && isStrip(pane);
      const page = pane &&
        sign * (strip ? pane.clientWidth : pane.clientHeight) * PAGE_FRAC *
          ((window.CssZoom && CssZoom.of(pane)) || 1);
      if (!pane || !(strip ? scrollStrip(pane, page) : scrollPane(pane, page))) {
        if (!inLayer) return;
        const home = region || (active.closest && active.closest(SCROLLERS));
        const scope = home && layer.contains(home) ? list.filter((el) => home.contains(el)) : list;
        if (!scope.length) return;
        focusItem(sign > 0 ? scope[scope.length - 1] : scope[0], layer);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (region) keepFocusInView(region, active, list);
      return;
    }

    e.preventDefault();
    if (!inLayer) { focusItem(currentItem(layer, list), layer); return; }
    const next = step(active, dir[0], dir[1], list);
    if (!next) return;
    focusItem(next, layer);
    if (active.getAttribute && active.getAttribute("role") === "tab") e.stopPropagation();
  }

  function init() {
    Log.info("ui", "MenuNav.init");
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", onKeyDown, true);
  }

  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { activeLayer, nearestPane, onWheel, onKeyDown, FOCUSABLE, step, pickSideways, items, currentItem, ownsArrows };
})();
