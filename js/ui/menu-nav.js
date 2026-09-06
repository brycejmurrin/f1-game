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
// The module owns no game state and self-initialises, like js/ui/scroll-fade.js
// (which it tells to repaint after a redirected scroll, so the edge fade and the
// position indicator stay honest).
window.MenuNav = (function () {

  // The menu LAYERS and "which one is on top" both live in js/ui/layers.js
  // now — js/input/input.js and js/ui/modal.js ask the same module the same
  // question, which is the whole point of it. This file used to carry its own
  // copy of the list, and the copies drifted by five screens.
  const UL = window.UiLayers;

  // Scroll regions, same list ScrollFade watches — `.pane` first and by class,
  // because that is the design system's own name for "a scroll region".
  const SCROLLERS = ".pane,.panel-scroll,.scroll-y,.dh-content,#track-detail-panel,#track-detail";

  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  // What the browser would have scrolled for one notch of a line/page-mode wheel.
  // Firefox and some Windows mice report lines, not pixels.
  const LINE_PX = 16;
  const PAGE_FRAC = 0.9;       // PageUp/PageDown move just under a screenful

  const shown = UL.shown;          // a zero box, not the hidden attribute

  /* THE FREE CAMERA IS NOT A MENU, and this is the one layer MenuNav has to
     refuse. In the tuner's fly-cam the arrow keys PITCH AND YAW the camera
     (js/camera/photo-cam.js) — but that handler is added when free-cam opens,
     which puts it AFTER this one among window-capture listeners, so whatever
     MenuNav does with an arrow happens first. Left to itself it would walk
     focus around the fly-cam's own EXIT/FOV buttons and preventDefault the key
     before the camera ever saw it. The tuner panel behind it is equally
     off-limits: it is open by design the whole time you are flying. */
  function activeLayer() {
    const t = UL.top();
    return (t && t.id === "photo-controls") ? null : t;
  }

  // `oyIn` lets onWheel's ancestor walk share ONE getComputedStyle between
  // canScroll and isRegion — they used to each read it per ancestor per wheel
  // event, in the scroll-latency path, at 60-120 Hz.
  function canScroll(el, dy, oyIn) {
    if (!el || el.nodeType !== 1) return false;
    const oy = oyIn != null ? oyIn : getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    // A pane already pinned at the end must not swallow the gesture.
    return dy < 0 ? el.scrollTop > 1 : el.scrollTop < max - 1;
  }

  // A scroll REGION with content to scroll — regardless of where it is parked.
  // `canScroll` answers "can this move right now"; this answers "is this a pane
  // that owns the gesture", which is the question containment turns on.
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

  // Which pane a gesture at (x, y) meant. Pair-on garage still has a rail and
  // an options list, so "nearest" weighs the horizontal axis hardest: a swipe
  // over the left column is about the left column even when the right one is
  // the taller, more obvious target. Circuit Select's hero section is its one
  // vertical pane; its flag strip is sideways (see hStrip in onWheel).
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
      if (el.nodeType !== 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (canScroll(el, dy, oy)) return;
      if (isRegion(el, oy)) return;
    }
    // A SIDEWAYS STRIP TAKES THE WHEEL TOO. The circuit picker's flag strip
    // (#sel-tracks, data-orientation="horizontal") is the one scroll region on
    // that screen a mouse wheel cannot move natively — a vertical wheel over a
    // horizontal scroller does nothing. Over the strip, or when no vertical
    // pane can take the gesture, the wheel pans the strip instead.
    const strip = hStrip(layer);
    const overStrip = strip && strip.contains(e.target);
    const pane = overStrip ? null : nearestPane(layer, e.clientX, e.clientY, dy);
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

  // Boxes measured at most once per keydown: move()'s band pass and its
  // sideways second pass both walk the full list, and a held arrow repeats
  // ~30×/s — without the cache that was two gBCRs per item per repeat.
  // Reset at each onKeyDown entry; never read across frames.
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
  // distance from a point to an interval (0 inside it)
  function gap(p, lo, hi) { return p < lo ? lo - p : p > hi ? p - hi : 0; }

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
    // A `.chip-row` is a BOUNDED SELECTOR — the two DRIVER chips in the garage,
    // and every race-settings option group (`role="group"`). Left/Right move
    // between that group's OWN chips in reading order and leave only from an end.
    // Pure geometry gets this wrong the moment a chip row WRAPS: in the garage's
    // narrow TEAM panel the two driver chips stack into a column, so `#1` sits
    // ABOVE `#2` rather than left of it, and ArrowLeft from `#2` finds the
    // SUSPENSION button — which really is the nearest thing in `#2`'s leftward
    // band — instead of `#1`. Keying off the group, not the pixels, keeps
    // Left/Right on the chips whether the row is laid out flat or wrapped. This
    // is identical to the spatial result for a row that does NOT wrap (DOM order
    // is reading order there), and falling through at the ends preserves the
    // "no sideways wrap" rule below — Right off the last chip still leaves.
    // Vertical moves stay geometric, which is how you step off a STACKED row.
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
        // "Directly below" means the candidate's box SPANS your centre, not
        // that its centre is near yours: across is the gap from your centre to
        // the candidate's cross-axis interval, 0 when you are inside it. With
        // centre distance a wide control (the hero's map button under the
        // flag strip) lost ArrowDown to a narrow foot button that happened to
        // sit closer to straight-down (measured: NEXT beat a 568px-wide hero).
        const across = dx ? gap(a.y, b.t, b.b) : gap(a.x, b.l, b.r);
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

  // Where focus lands on the first arrow press: whatever the screen is already
  // showing as chosen, so the first press moves off the current team / circuit
  // rather than jumping to the top of the sheet.
  function currentItem(layer, list) {
    // A screen may name a primary starting action independently of its stateful
    // controls. Keep this as a separate lookup: querySelector returns document
    // order across a combined selector, so title-screen Sound (aria-pressed)
    // would otherwise beat the later Career action even if Career were included
    // in the same selector.
    const preferred = layer.querySelector("[data-menu-default]");
    if (preferred && list.indexOf(preferred) >= 0) return preferred;
    const sel = layer.querySelector("[aria-selected='true'],[aria-pressed='true'],.active");
    if (sel && list.indexOf(sel) >= 0) return sel;
    return list[0] || null;
  }

  // A sideways strip (data-orientation="horizontal") is a region too: Home/End
  // address its first and last tile, PageDown/PageUp pan it a strip-width.
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
  // CARET_KEYS are the keys that move a caret or a slider thumb along ITS OWN
  // axis, and they are all any <input> owns — Up/Down must leave the row. A text
  // field used to own EVERY key: the circuit search box was the one control on
  // the select screen a pad could land on (Right off the CLASSICS chip) and
  // never leave — D-pad Down was a dead press, and B closes the whole screen.
  // Up/Down and the page keys now leave a text field like they leave a slider;
  // Home/End stay with it (they jump the caret, and a range to min/max — the
  // ARIA slider pattern — which MenuNav used to take from a focused slider).
  const CARET_KEYS = { ArrowLeft: 1, ArrowRight: 1, Home: 1, End: 1 };
  function ownsArrows(el, key) {
    if (!el) return false;
    const t = el.tagName;
    if (t === "TEXTAREA" || t === "SELECT") return true;
    if (t === "INPUT") {
      const ty = (el.type || "text").toLowerCase();
      if (ty === "checkbox" || ty === "radio" || ty === "button" ||
          ty === "submit" || ty === "reset") return false;
      return !!CARET_KEYS[key];
    }
    if (el.getAttribute && el.getAttribute("role") === "tab") return tabOwns(el, key);
    return !!el.isContentEditable;
  }

  // A TAB RAIL OWNS ITS OWN AXIS AND NOTHING ELSE. Along the rail the widget
  // cycles and selects (settings-nav, setup-ui, tuner and cam-tuner all
  // implement automatic activation) and Home/End are its ends. The
  // PERPENDICULAR axis is the way OUT of the rail: with role=tab owning every
  // arrow, the garage's category rail mapped all four directions to "next
  // category" and the settings rail re-focused its tab, so a pad — which has
  // no Tab key — could reach neither the parts list beside the rail nor the
  // settings panel under it. The axis is MEASURED, not assumed: the garage rail
  // is a column when the sheet pairs, a row when it stacks and a 2x7 grid on a
  // short wide phone; `aria-orientation` (settings-nav writes it) overrides
  // the measure when a rail declares itself.
  function tabOwns(tab, key) {
    if (key === "Home" || key === "End") return true;
    const dir = DIRS[key];
    if (!dir) return false;                         // Page keys page the pane
    const list = (tab.closest && tab.closest("[role='tablist']")) || tab.parentElement;
    const o = list && list.getAttribute && list.getAttribute("aria-orientation");
    let railX = true;
    if (o === "vertical") railX = false;
    else if (o !== "horizontal" && list && list.querySelectorAll) {
      // A sibling tab sharing this tab's row band means the rail runs across.
      const a = centre(tab);
      let siblings = 0;
      railX = false;
      for (const s of list.querySelectorAll("[role='tab']")) {
        if (s === tab || !shown(s)) continue;
        siblings++;
        const b = centre(s);
        if (overlaps(a.t, a.b, b.t, b.b)) { railX = true; break; }
      }
      if (!siblings) railX = true;                  // a lone tab: nothing to cycle
    }
    return (dir[0] !== 0) === railX;
  }

  const DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  };

  // The measurement cache below is scoped to ONE press (see centre()), but it
  // was only ever REPLACED at the top of the next press — so between presses a
  // Map of element -> box sat retained, holding a strong reference to every
  // focusable row it measured, including rows of a layer since torn down. The
  // finally is what makes "fresh per press" also mean "gone after the press",
  // across the handler's dozen early returns.
  function onKeyDown(e) {
    try { navKey(e); } finally { _boxes = null; }
  }

  function navKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    const dir = DIRS[key];
    const paging = key === "PageDown" || key === "PageUp" || key === "Home" || key === "End";
    if (!dir && !paging) return;
    const layer = activeLayer();
    if (!layer) return;
    const active = document.activeElement;
    if (ownsArrows(active, key)) return;

    const list = items(layer);
    if (!list.length) return;
    _boxes = new Map();   // fresh per press — see centre()
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
        // Not list.filter: `list` came through shown()'s zero-rect gate, and a
        // content-visibility:auto row outside the render margin has NO box —
        // so End in the livery grid would stop at the render boundary, ~1.5
        // viewports down, instead of the last row (the exact bug class the
        // comment above records for the layer-wide version). checkVisibility
        // still rejects display:none/visibility:hidden but sees through
        // skipping, and focusItem renders the target: focus makes an element
        // relevant per css-contain-2.
        let scope = list;
        if (region) {
          scope = [];
          for (const el of region.querySelectorAll(FOCUSABLE)) {
            if (el.disabled || el.getAttribute("aria-hidden") === "true") continue;
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
        nearestPane(layer, window.innerWidth / 2, window.innerHeight / 2, sign);
      // scrollPane takes VIEWPORT px (it divides by the pane's zoom), but
      // clientHeight is local — feed it local×zoom or a page step travels
      // local/zoom² of the pane: 225% at UI SIZE 40% (1.35 pane-heights
      // skipped unseen), 45% at 200%. Gamepad LT/RT land here too.
      const strip = pane && isStrip(pane);
      const page = pane &&
        sign * (strip ? pane.clientWidth : pane.clientHeight) * PAGE_FRAC *
          ((window.CssZoom && CssZoom.of(pane)) || 1);
      if (!pane || !(strip ? scrollStrip(pane, page) : scrollPane(pane, page))) return;
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
    if (!next) return;
    focusItem(next, layer);
    // LEAVING A TAB RAIL SIDEWAYS SPENDS THE KEY. The rail's own keydown
    // handler runs after this capture listener — settings-nav re-focuses its
    // tab on a perpendicular arrow, setup-ui cycles to the next category — and
    // either would undo the move just made. (Only a tab: the circuit filter
    // chips rely on still receiving the arrow that moved focus onto them.)
    if (active.getAttribute && active.getAttribute("role") === "tab") e.stopPropagation();
  }

  function init() {
    Log.info("ui", "MenuNav.init");
    // passive:false — a redirected wheel must be able to preventDefault, or the
    // page keeps its own (no-op) scroll and the gesture double-counts on the
    // platforms that do rubber-band.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    // Capture, so this runs before the driving handler in js/input/input.js.
    window.addEventListener("keydown", onKeyDown, true);
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  // FOCUSABLE is exported so a second caller (the gamepad A-button seam in
  // js/input/input.js) can ask "is this a real actionable control" without a
  // second copy of the selector to drift out of step with this one.
  // items / currentItem: js/ui/modal.js lands focus on a freshly shown
  // non-dialog screen with the same rule the first arrow press uses.
  return { activeLayer, nearestPane, onWheel, onKeyDown, FOCUSABLE, step, pickSideways, items, currentItem, ownsArrows };
})();
