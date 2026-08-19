"use strict";
window.MenuNav = (function () {

  const UL = window.UiLayers;

  const SCROLLERS = ".pane,.panel-scroll,.scroll-y,.dh-content,#track-detail-body";

  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  const LINE_PX = 16;
  const PAGE_FRAC = 0.9;       // PageUp/PageDown move just under a screenful

  const shown = UL.shown;          // a zero box, not the hidden attribute

  /* THE FREE CAMERA IS NOT A MENU, and this is the one layer MenuNav has to
     refuse. In the tuner's fly-cam the arrow keys PITCH AND YAW the camera
     (js/game/photomode.js) — but that handler is added when free-cam opens,
     which puts it AFTER this one among window-capture listeners, so whatever
     MenuNav does with an arrow happens first. Left to itself it would walk
     focus around the fly-cam's own EXIT/FOV buttons and preventDefault the key
     before the camera ever saw it. The tuner panel behind it is equally
     off-limits: it is open by design the whole time you are flying. */
  function activeLayer() {
    const t = UL.top();
    return (t && t.id === "photo-controls") ? null : t;
  }

  function canScroll(el, dy) {
    if (!el || el.nodeType !== 1) return false;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    // A pane already pinned at the end must not swallow the gesture.
    return dy < 0 ? el.scrollTop > 1 : el.scrollTop < max - 1;
  }

  function isRegion(el) {
    if (!el || el.nodeType !== 1 || !el.matches || !el.matches(SCROLLERS)) return false;
    const oy = getComputedStyle(el).overflowY;
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
      // Viewport space: clientX/Y vs a zoomed .pane's visual box (A13).
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
    else if (e.deltaMode === 2) d *= window.innerHeight * PAGE_FRAC;
    return d;
  }

  function scrollPane(pane, px) {
    // Wheel deltaY is viewport px; scrollTop is local — divide by the pane's zoom.
    const local = (window.CssZoom && CssZoom.toLocalDelta(pane, px)) || px;
    const before = pane.scrollTop;
    pane.scrollTop = before + local;
    if (pane.scrollTop === before) return false;
    if (window.ScrollFade) window.ScrollFade.paint(pane);
    return true;
  }

  function onWheel(e) {
    // A ctrl-wheel is the browser's zoom gesture (and a trackpad pinch); never
    // take that over.
    if (e.ctrlKey || e.defaultPrevented) return;
    const layer = activeLayer();
    if (!layer) return;
    const dy = wheelPx(e);
    if (!dy) return;
    const stop = layer.parentNode;
    for (let el = e.target; el && el !== stop; el = el.parentElement) {
      if (canScroll(el, dy)) return;
      if (isRegion(el)) return;
    }
    const pane = nearestPane(layer, e.clientX, e.clientY, dy);
    if (pane && scrollPane(pane, dy)) e.preventDefault();
  }

  function items(layer) {
    const out = [];
    for (const el of layer.querySelectorAll(FOCUSABLE)) {
      if (el.disabled || el.getAttribute("aria-hidden") === "true") continue;
      if (!shown(el)) continue;
      out.push(el);
    }
    return out;
  }

  function centre(el) {
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function overlaps(a1, a2, b1, b2) { return Math.min(a2, b2) - Math.max(a1, b1) > 1; }

  // Out-of-band horizontal: land in the adjacent column at similar height.
  // In-band scoring weights `across * 2` so a slightly-offset item in the same
  // row loses to a true neighbour; here Y is a light tie-break (`* 0.25`) so a
  // header sitting above the current row still wins over a far DOM neighbour,
  // while the closest-Y item to that side still beats a header at the top of
  // the column (the player then arrows up). Vertical moves never call this.
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
    let best = null, bestCost = Infinity;
    let edge = null, edgeDist = 0;
    for (const el of list) {
      if (el === from) continue;
      const b = centre(el);
      const along = dx ? (b.x - a.x) * dx : (b.y - a.y) * dy;
      const inBand = dx ? overlaps(a.t, a.b, b.t, b.b) : overlaps(a.l, a.r, b.l, b.r);
      if (!inBand) continue;
      if (along > 1) {
        const across = dx ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
        const cost = along + across * 2;
        if (cost < bestCost) { bestCost = cost; best = el; }
      } else if (-along > edgeDist) {
        edgeDist = -along; edge = el;
      }
    }
    if (best) return best;
    // Nothing ahead in the band. Horizontally the band is too strict once you
    // sit mid-list in a tall column: ArrowLeft from a circuit row cannot reach
    // the preview / filters / BACK because they sit higher than the current
    // row. A second pass, Y weighted lightly, lands in the adjacent column at
    // similar height. Vertical moves must NOT get this pass — that is the
    // Zandvoort trap. Then vertical wrap (end of a column), then DOM wrap so a
    // pad press is never a no-op. Sideways must NOT wrap inside the band (a
    // chip row would teleport back to its first chip); chip rows already leave
    // at their ends above.
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
    if (dy && edge) return edge;
    // No band, or a sideways end: DOM / reading order. Wrap so Left from the
    // first item and Right from the last are never a no-op — a pad D-pad press
    // always lands somewhere.
    const i = list.indexOf(from);
    const n = list.length;
    const j = i + (sign > 0 ? 1 : -1);
    return n ? list[((j % n) + n) % n] : null;
  }

  function currentItem(layer, list) {
    const preferred = layer.querySelector("[data-menu-default]");
    if (preferred && list.indexOf(preferred) >= 0) return preferred;
    const sel = layer.querySelector("[aria-selected='true'],[aria-pressed='true'],.active");
    if (sel && list.indexOf(sel) >= 0) return sel;
    return list[0] || null;
  }

  function scrollerOf(el, layer) {
    for (let n = el; n && n !== layer.parentNode; n = n.parentElement) {
      if (n.nodeType === 1 && n.matches && n.matches(SCROLLERS) &&
          n.scrollHeight - n.clientHeight > 1) return n;
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
    const p = pane.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.top >= p.top - 1 && a.bottom <= p.bottom + 1) return;
    let best = null, bestD = Infinity;
    for (const el of list) {
      if (!pane.contains(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.top < p.top - 1 || b.bottom > p.bottom + 1) continue;
      const d = b.top - p.top;
      if (d < bestD) { bestD = d; best = el; }
    }
    if (best) best.focus({ preventScroll: true });
  }

  function ownsArrows(el) {
    if (!el) return false;
    const t = el.tagName;
    if (t === "TEXTAREA" || t === "SELECT") return true;
    if (t === "INPUT") {
      const ty = (el.type || "text").toLowerCase();
      return ty !== "checkbox" && ty !== "radio" && ty !== "button" &&
             ty !== "submit" && ty !== "reset";
    }
    if (el.getAttribute && el.getAttribute("role") === "tab") return true;
    return !!el.isContentEditable;
  }

  const DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  };

  function onKeyDown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    const dir = DIRS[key];
    const paging = key === "PageDown" || key === "PageUp" || key === "Home" || key === "End";
    if (!dir && !paging) return;
    const layer = activeLayer();
    if (!layer) return;
    const active = document.activeElement;
    if (ownsArrows(active)) return;

    const list = items(layer);
    if (!list.length) return;
    const inLayer = active && layer.contains(active) && list.indexOf(active) >= 0;

    if (paging) {
      const region = inLayer ? scrollerOf(active, layer) : null;
      if (key === "Home" || key === "End") {
        const scope = region ? list.filter((el) => region.contains(el)) : list;
        if (!scope.length) return;
        focusItem(key === "Home" ? scope[0] : scope[scope.length - 1], layer);
        e.preventDefault();
        return;
      }
      const sign = key === "PageDown" ? 1 : -1;
      const pane = region ||
        nearestPane(layer, window.innerWidth / 2, window.innerHeight / 2, sign);
      if (!pane || !scrollPane(pane, sign * pane.clientHeight * PAGE_FRAC)) return;
      e.preventDefault();
      if (region) keepFocusInView(region, active, list);
      return;
    }

    e.preventDefault();
    if (!inLayer) { focusItem(currentItem(layer, list), layer); return; }
    const next = step(active, dir[0], dir[1], list);
    if (next) focusItem(next, layer);
  }

  function init() {
    Log.info("ui", "MenuNav.init");
    // passive:false — a redirected wheel must be able to preventDefault, or the
    // page keeps its own (no-op) scroll and the gesture double-counts on the
    // platforms that do rubber-band.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    // Capture, so this runs before the driving handler in js/game/input.js.
    window.addEventListener("keydown", onKeyDown, true);
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { activeLayer, nearestPane, onWheel, onKeyDown, FOCUSABLE, step, pickSideways };
})();
