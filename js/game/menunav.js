"use strict";
// MenuNav — desktop input for the menus: a mouse wheel / trackpad that scrolls
// the panel you are looking at, and arrow keys that move through it.
//
// WHY THIS EXISTS. Every menu is a `.sheet` whose head and foot are pinned and
// whose ONE scroll region is a `.pane` inside it (see css/components.css). That
// is exactly right for touch — you drag the list itself — and it is why the
// select screen's circuit list, the only scrollable box on that screen, is a
// 489x441 strip in the right-hand column. A trackpad user does not aim before
// scrolling: they rest the pointer wherever the content they are reading is (the
// circuit preview map, the car stats, the sheet title) and swipe. Every one of
// those places is OUTSIDE the pane, and the whole chain above it —
// #sel-track-section, .sheet, html/body — is `overflow: hidden`, so the wheel
// event has nowhere to go and the menu appears frozen. Nothing was broken; the
// only scrollable target was simply too small to hit by accident.
//
// So: a wheel that lands on no scrollable ancestor is REDIRECTED to the nearest
// pane of the open menu, and the arrow keys move focus through that menu and
// pull the focused row into view. Both are desktop affordances only; neither
// changes a single touch gesture.
//
// The module owns no game state and self-initialises, like js/game/scrollfade.js
// (which it tells to repaint after a redirected scroll, so the edge fade and the
// position indicator stay honest).
window.MenuNav = (function () {

  // The menu LAYERS. One of these being visible is what "a menu is open" means —
  // js/game/input.js asks the same question before it lets a key drive the car.
  // #overlay is the main menu; the rest are the `.screen` overlays plus the two
  // full-screen panels that are not `.screen` (#track-detail, #datahub).
  const LAYER_IDS = ["overlay", "pausemenu", "pmsettings", "select", "career", "career-offers",
    "career-history", "career-guide", "teampicker", "race-settings", "quali", "standings", "results", "customize",
    "carsetup", "howtoplay", "advanced", "track-detail", "datahub"];
  // `:not([hidden])` belongs IN the selector rather than in a filter after it.
  // Every one of these overlays is opened and closed with the hidden attribute, so
  // mid-race the query matches nothing and no element is ever measured. That is
  // the hot path: a held arrow key repeats keydown ~30x a second, and the version
  // that measured all fourteen first forced a style recalc on every repeat.
  const LAYERS = LAYER_IDS.map((id) => "#" + id + ":not([hidden])").join(",");

  // Scroll regions, same list ScrollFade watches — `.pane` first and by class,
  // because that is the design system's own name for "a scroll region".
  const SCROLLERS = ".pane,#sel-body,.panel-scroll,.scroll-y,.dh-content,#track-detail-body";

  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  // What the browser would have scrolled for one notch of a line/page-mode wheel.
  // Firefox and some Windows mice report lines, not pixels.
  const LINE_PX = 16;
  const PAGE_FRAC = 0.9;       // PageUp/PageDown move just under a screenful

  // A zero box is the real test, not the hidden attribute: it also catches an
  // element inside a display:none ancestor, a control in a collapsed section, and
  // the several buttons index.html ships hidden and reveals per game mode.
  function shown(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return getComputedStyle(el).visibility !== "hidden";
  }

  // The topmost open menu. Layers stack (the team picker sits over the select
  // screen, the pause settings over the pause menu), and z-index is how the CSS
  // already expresses that order; DOM order breaks the ties.
  function activeLayer() {
    let best = null, bestZ = -Infinity;
    const all = document.querySelectorAll(LAYERS);
    for (const el of all) {
      if (!shown(el)) continue;
      const z = parseInt(getComputedStyle(el).zIndex, 10);
      const zz = isFinite(z) ? z : 0;
      if (zz >= bestZ) { bestZ = zz; best = el; }
    }
    return best;
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

  // A scroll REGION with content to scroll — regardless of where it is parked.
  // `canScroll` answers "can this move right now"; this answers "is this a pane
  // that owns the gesture", which is the question containment turns on.
  function isRegion(el) {
    return !!(el && el.nodeType === 1 && el.matches && el.matches(SCROLLERS) &&
      el.scrollHeight - el.clientHeight > 1);
  }

  function panes(layer, dy) {
    const out = [];
    if (canScroll(layer, dy)) out.push(layer);
    for (const el of layer.querySelectorAll(SCROLLERS)) {
      if (shown(el) && canScroll(el, dy)) out.push(el);
    }
    return out;
  }

  // Which pane a gesture at (x, y) meant. The select screen is two columns with
  // a scroll region in each, so "nearest" has to weigh the horizontal axis
  // hardest: a swipe over the left column is about the left column even when the
  // right one is the taller, more obvious target.
  function nearestPane(layer, x, y, dy) {
    const list = panes(layer, dy);
    if (list.length < 2) return list[0] || null;
    let best = null, bestCost = Infinity;
    for (const el of list) {
      const r = el.getBoundingClientRect();
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
    const before = pane.scrollTop;
    pane.scrollTop = before + px;
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
    // If anything from the cursor up to the layer can already take the scroll,
    // this is a normal wheel over a normal list — leave the browser alone. The
    // native path scrolls smoothly and latches; a redirect would be worse.
    //
    // A REGION YOU ARE POINTING AT KEEPS THE GESTURE EVEN WHEN IT CANNOT MOVE.
    // Only `canScroll` used to end this walk, and it goes false the moment a pane
    // is pinned at either end — so a wheel over the garage's category rail, once
    // the rail bottomed out, was handed to the option list beside it, and the two
    // panes read as one. That is what `overscroll-behavior: contain` already
    // promises for the native path (css/components.css sets it on every .pane);
    // the redirect was quietly breaking the promise. The redirect exists for
    // gestures that land on NO scroll region — the sheet head, the stats block,
    // the circuit map — and that is all it should do.
    const stop = layer.parentNode;
    for (let el = e.target; el && el !== stop; el = el.parentElement) {
      if (canScroll(el, dy)) return;
      if (isRegion(el)) return;
    }
    const pane = nearestPane(layer, e.clientX, e.clientY, dy);
    if (pane && scrollPane(pane, dy)) e.preventDefault();
  }

  /* ---------------- arrow-key navigation ---------------- */

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

  // Spatial move, not DOM order: the menus mix vertical lists (circuits), grids
  // (the twelve team tiles) and horizontal chip rows (drivers) inside the same
  // layer, and only geometry gives the right answer in all three — down a column
  // of tiles, along a row of chips, across from one column of the select screen
  // to the other.
  //
  // But geometry ONLY within the BAND: a candidate that does not overlap the
  // perpendicular extent of where you are is not "further down this column", it is
  // somewhere else on the screen. Scoring those alongside the rest is how ArrowDown
  // from the BACK button landed on Zandvoort, the fourteenth circuit, purely
  // because it scored lowest.
  //
  //   `sign` > 0 for Down / Right. `best` is the nearest thing ahead in the band;
  //   `edge` is the FURTHEST thing behind in it, i.e. where a wrap lands.
  function step(from, dx, dy, list) {
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
    // Nothing ahead in the band. Vertically that means the end of a column or a
    // list, and it WRAPS — the select screen's left column bottoms out at START,
    // which is also the last focusable element in the sheet, so without a wrap
    // ArrowDown just dead-ends there. Sideways it does not: a chip row that
    // teleported you back to its first chip would read as a stuck key.
    if (dy && edge) return edge;
    // No band at all (an isolated control, or the end of a wrapping grid row):
    // DOM order, which on these screens is reading order — and which is what
    // carries ArrowRight from the last tile of a team-picker row onto the first
    // tile of the next.
    const i = list.indexOf(from);
    const n = list.length;
    const j = i + (sign > 0 ? 1 : -1);
    if (dy) return list[((j % n) + n) % n];
    return list[j] || null;
  }

  // Where focus lands on the first arrow press: whatever the screen is already
  // showing as chosen, so the first press moves off the current team / circuit
  // rather than jumping to the top of the sheet.
  function currentItem(layer, list) {
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
    // block:"nearest" keeps a row that is already visible exactly where it is —
    // centring every step would make the list crawl under the cursor.
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const sc = scrollerOf(el, layer);
    if (sc && window.ScrollFade) window.ScrollFade.paint(sc);
  }

  // After a page: if the focused item is no longer inside its pane, move focus to
  // the item nearest the pane's top edge that IS. Focus only — no scrollIntoView,
  // which would undo the page we just performed.
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

  // Controls that own the arrow keys themselves. A range slider is the one that
  // matters here (the settings and lighting panels are full of them): stealing
  // Left/Right from a focused slider would make it unadjustable by keyboard.
  function ownsArrows(el) {
    if (!el) return false;
    const t = el.tagName;
    if (t === "TEXTAREA" || t === "SELECT") return true;
    if (t === "INPUT") {
      const ty = (el.type || "text").toLowerCase();
      return ty !== "checkbox" && ty !== "radio" && ty !== "button" &&
             ty !== "submit" && ty !== "reset";
    }
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
      // THE REGION HOLDING FOCUS OWNS THESE KEYS. Home and End used to address
      // the whole layer, so from inside the garage's option list End jumped to
      // DONE in the sheet foot and Home landed on a preview control outside the
      // sheet altogether — from a list of twenty parts, neither key could reach
      // that list's own ends. Scope them to the pane focus is in; fall back to
      // the layer when it is in none (the head, a foot button).
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
      // FOCUS TRAVELS WITH THE PAGE. Paging moved the pane and left focus behind,
      // stranded off the top or bottom of it — so the row the keyboard was on was
      // one the player could no longer see, and the next arrow press moved from
      // there and snapped the pane back. Hand focus to the nearest row the page
      // just brought on screen.
      if (region) keepFocusInView(region, active, list);
      return;
    }

    // Always consume the arrow keys while a menu is open, even when the move
    // finds nothing: the alternative is the browser scrolling the document (or,
    // over the pause menu, the key reaching the car).
    e.preventDefault();
    if (!inLayer) { focusItem(currentItem(layer, list), layer); return; }
    const next = step(active, dir[0], dir[1], list);
    if (next) focusItem(next, layer);
  }

  function init() {
    // passive:false — a redirected wheel must be able to preventDefault, or the
    // page keeps its own (no-op) scroll and the gesture double-counts on the
    // platforms that do rubber-band.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    // Capture, so this runs before the driving handler in js/game/input.js.
    window.addEventListener("keydown", onKeyDown, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { activeLayer, nearestPane, onWheel, onKeyDown };
})();
