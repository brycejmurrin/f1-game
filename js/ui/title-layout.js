/* Title layout owns viewport offsets, fit, and separate wide/tall v2 snapshots. */
const TitleLayout = (function () {
  "use strict";

  const KEY = "titleLayout";   // apex26.titleLayout — {v: 2, wide, tall} | null
  const PARTS = ["btns", "title", "art"];
  const LAYOUTS = [["grid", "GRID"], ["stack", "STACK"], ["row", "ROW"]];
  const SIDES = [["auto", "AUTO"], ["swap", "SWAPPED"]];
  const WIDTH_MIN = 20;
  const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], size: [50, 200], width: [0, 100] });
  const DEFAULT = Object.freeze({
    btns: Object.freeze({ x: 0, y: 0, size: 100, width: 0 }),
    title: Object.freeze({ x: 0, y: 0, size: 100 }),
    art: Object.freeze({ x: 0, y: 0, size: 100 }),
    layout: "grid", side: "auto",
  });
  // Phone defaults from the November 20 appearance export. The inline boot in
  // index.html uses the same layouts before this module loads.
  const PHONE_WIDE = Object.freeze({
    ...DEFAULT,
    btns: Object.freeze({ x: 0, y: 0, size: 106, width: 25 }),
    title: Object.freeze({ x: 0, y: 0, size: 108 }),
    art: Object.freeze({ x: -7, y: -2, size: 86 }),
  });
  const PHONE_TALL = Object.freeze({
    ...DEFAULT, btns: Object.freeze({ x: 0, y: 0, size: 105, width: 0 }),
  });
  const phone = () => { try { if (typeof UiScale !== "undefined") return UiScale.phone(); return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) <= 500; } catch (_) { return false; } };
  const shipped = (sh) => phone() ? (sh === "tall" ? PHONE_TALL : PHONE_WIDE) : DEFAULT;
  const SHAPES = ["wide", "tall"];
  const SHAPE_NAMES = { wide: "LANDSCAPE", tall: "PORTRAIT" };
  const store = GameStore.store;
  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;

  const num = (v, k) => {
    const [lo, hi] = LIM[k];
    const n = typeof v === "number" && isFinite(v) ? Math.round(v) : DEFAULT.btns[k];   // btns carries every key
    // WIDTH: 0 is AUTO; explicit requests start at 20.
    if (k === "width") return n <= 0 ? 0 : Math.max(WIDTH_MIN, Math.min(hi, n));
    return Math.max(lo, Math.min(hi, n));
  };
  /** Any stored value -> a complete, clamped layout. Junk reads as shipped. */
  function normalize(v, sh) {
    const o = v && typeof v === "object" ? v : (sh ? shipped(sh) : {});   // an unset SHAPE reads what this device ships
    const out = {};
    for (const p of PARTS) {
      const src = o[p] && typeof o[p] === "object" ? o[p] : {};
      out[p] = {};
      for (const k of Object.keys(DEFAULT[p])) out[p][k] = num(src[k] === undefined ? DEFAULT[p][k] : src[k], k);
    }
    out.layout = LAYOUTS.some(([id]) => id === o.layout) ? o.layout : "grid";
    out.side = o.side === "swap" ? "swap" : "auto";
    return out;
  }
  function isDefault(v) { return JSON.stringify(normalize(v)) === JSON.stringify(normalize(null)); }
  /** Both shapes shipped — what the TITLE LAYOUT summary calls SHIPPED. */
  const isShipped = (v, sh) => JSON.stringify(normalize(v)) === JSON.stringify(normalize(null, sh));
  function layoutShipped() { const a = all(); return isShipped(a.wide, "wide") && isShipped(a.tall, "tall"); }

  /** The tokens a layout writes — the SAME arithmetic index.html's inline boot
   *  does. X is vw, Y is vh, SIZE and WIDTH are plain numbers. */
  function vars(v) {
    const l = normalize(v);
    const out = {};
    for (const p of PARTS) {
      out[`--tl-${p}-x`] = l[p].x + "vw";
      out[`--tl-${p}-y`] = l[p].y + "vh";
      out[`--tl-${p}-size`] = String(l[p].size / 100);
    }
    if (l.btns.width) out["--tl-btns-w"] = String(l.btns.width);
    return out;
  }

  const ALL_VARS = Object.keys(vars({ btns: { width: 50 } }));
  /** The shape the title screen is laid out in right now: body[data-shape]. */
  function shape() {
    return doc && doc.body && doc.body.getAttribute("data-shape") === "tall" ? "tall" : "wide";
  }
  const isShape = (s) => s === "wide" || s === "tall";
  /** Both shapes, from whatever is stored. A v1 object is BOTH shapes. */
  // A drag's or a slider's layout in flight (#4933): painted, committed on Apply in the editor or on slider release in Settings.
  // A write by anyone else (Undo, a profile) since the draft began wins over it.
  let draft = null, draftBase = null;
  function all() {
    const raw = store.get(KEY, null);
    if (draft && raw !== draftBase) draft = null;
    if (draft) return { wide: normalize(draft.wide, "wide"), tall: normalize(draft.tall, "tall") };
    if (raw && typeof raw === "object" && raw.v === 2) return { wide: normalize(raw.wide, "wide"), tall: normalize(raw.tall, "tall") };
    return { wide: normalize(raw, "wide"), tall: normalize(raw, "tall") };
  }
  function save(a) {
    const out = { v: 2 };
    for (const s of SHAPES) if (!isShipped(a[s], s)) out[s] = normalize(a[s]);   // a missing shape is shipped
    store.set(KEY, out.wide || out.tall ? out : null);
  }
  function current(sh) { return all()[isShape(sh) ? sh : shape()]; }
  /** Write one layout (default: the current shape's) onto the page. */
  function apply(v = current()) {
    if (!root) return;
    const l = normalize(v);
    for (const k of ALL_VARS) root.style.removeProperty(k);
    delete root.dataset.titleLayout; delete root.dataset.titleSide; delete root.dataset.titleBtns; delete root.dataset.titleBtnw;
    if (!isDefault(l)) {
      const t = vars(l);
      for (const k in t) root.style.setProperty(k, t[k]);
      root.dataset.titleLayout = "on";
      if (l.side === "swap") root.dataset.titleSide = "swap";
      if (l.layout !== "grid") root.dataset.titleBtns = l.layout;
      if (l.btns.width) root.dataset.titleBtnw = "on";
    }
    bumpFit();   // a request landed; the box decides what fits (#5150)
  }

  // Landscape fit starts from unfitted pieces and shrinks monotonically. The
  // ResizeObserver settles when the computed zoom and offset stop changing.
  // Translate is zoomed too, so divide the overrun by the effective zoom.
  const FIT_IDS = ["menu-buttons", "menu-brand"];
  const FIT_MIN = 0.1;       // a setting that cannot fit shrinks until it does (#5150 §5); the clip only shows below this
  const FIT_PASSES = 6;
  const FIT_TOKENS = ["--tf", "--tf-dx", "--tf-dy"];
  let fitRaf = 0;
  // The fit's memo (#6754): fit() is a pure function of the inputs in fitKey(), none of which needs a
  // layout read, so an unchanged key skips the whole solve. The observers bump a generation for what
  // they saw: a request (apply), a door toggle (MutationObserver), a font landing, the OVERLAY's box.
  // A piece's own resize is the fit's consequence, so one that lands right after a fit does not count.
  let fitKeyLast = null, gen = 0, ovSig = "", settling = false;
  const hasRaf = typeof requestAnimationFrame === "function";
  function fitKey(ov) {
    let sc = 1;
    try { sc = getComputedStyle(root).getPropertyValue("--ui-scale"); } catch (_) { /* keep 1 */ }
    const w = typeof window !== "undefined" ? window : {};
    return [shape(), !!ov.hidden, w.innerWidth, w.innerHeight, w.devicePixelRatio, sc, touchHome(), ovSig, gen].join("|");
  }
  function onResize(entries) {
    let bump = false;
    for (const e of entries || []) {
      const id = e.target && e.target.id, r = e.contentRect;
      if (id === "overlay") {
        const sig = r ? r.width + "x" + r.height : "";
        if (sig !== ovSig) { ovSig = sig; bump = true; }
      } else if (!settling) bump = true;
    }
    if (!entries) bump = true;
    settling = false;
    if (bump) gen++;
    scheduleFit();
  }
  const bumpFit = () => { gen++; scheduleFit(); };
  function fitClear(el) { for (const k of FIT_TOKENS) el.style.removeProperty(k); }
  // THE TOUCH PAINT FLOOR (#5213; css/menu-destinations.css): under a finger a door is never under
  // 44 px, so a cluster too tall RE-FLOWS (8 rows, 7, 6) before it shrinks; the fit wins last.
  const touchHome = () => { try { return phoneWide() && win().matchMedia("(pointer: coarse)").matches; } catch (_) { return false; } };
  const floored = () => { const e = doc && doc.getElementById("menu-buttons"); return !!e && touchHome() && e.getAttribute("data-home-floor") !== "off"; };
  /** BUTTONS SIZE's low end: 100 while the floor holds. */
  const sizeMin = (part) => (part === "btns" && floored() ? 100 : LIM.size[0]);
  function floorTier(el, availW, availH) {
    el.removeAttribute("data-home-rows"); el.removeAttribute("data-home-floor");
    if (!touchHome()) return;
    const tier = (t) => { if (t) el.setAttribute("data-home-rows", t); else el.removeAttribute("data-home-rows"); };
    let slack = 1;   // availW/H over the need, from the last fits() measure (>= 1 when it fit)
    const fits = (tf) => {
      el.style.setProperty("--tf", tf.toFixed(3));
      const r = el.getBoundingClientRect();
      const needH = r.height * Math.max(1, el.scrollHeight / (el.clientHeight || 1));
      const needW = r.width * Math.max(1, el.scrollWidth / (el.clientWidth || 1));
      slack = Math.min(availH / (needH || 1), availW / (needW || 1));
      if (needH > availH || needW > availW) return false;
      // A clipped label span rejects the tier, the .mb-sub ellipsis excepted (#5378: Safari 852×283).
      for (const b of el.querySelectorAll(".bigbtn")) {
        if (b.hidden || b.closest("[hidden]")) continue;
        if (b.scrollWidth > b.clientWidth + 1) return false;
        for (const s of b.querySelectorAll("span:not(.mb-sub)")) {
          if (s.scrollWidth <= s.clientWidth + 1) continue;
          const sub = s.querySelector(".mb-sub");
          const label = s.querySelector(".mb-label");
          if (sub && sub.clientWidth > 0 && sub.scrollWidth > sub.clientWidth + 1) {
            if (label && label.scrollWidth > label.clientWidth + 1) return false;
            continue;
          }
          return false;
        }
      }
      return true;
    };
    const tiers = current().layout === "grid" ? ["", "7", "6"] : [""];
    for (const t of tiers) { tier(t); if (fits(1)) { el.style.removeProperty("--tf"); return; } }
    // No row count takes this SIZE: the one that paints the biggest doors, held (--tf) between the
    // floor and the request, so hold() stops the slider (never a bigger SIZE, smaller doors).
    const floor = 100 / Math.max(100, current().btns.size);
    let best = 0, bestT = "";
    if (floor < 1) for (const t of tiers) {
      tier(t);
      if (!fits(floor)) continue;
      // One measure solves the scale (it is near-linear): the box at `floor` has `slack` to spare, so
      // floor * slack is where it would just fit. Confirm that one candidate; only a miss bisects, and
      // only up to the candidate, instead of five reads from 1.
      let lo = floor, hi = 1;
      const cand = Math.min(1, floor * slack * 0.995);
      if (cand > floor + 0.002) { if (fits(cand)) lo = cand; else hi = cand; }
      if (hi > lo) for (let i = 0; i < (lo > floor ? 0 : 5); i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
      if (lo > best) { best = lo; bestT = t; }
    }
    tier(bestT);
    if (best) el.style.setProperty("--tf", best.toFixed(3));
    else { el.style.removeProperty("--tf"); el.setAttribute("data-home-floor", "off"); }
  }
  /** `r` grown to the visible doors' drawn boxes (a transform's overhang included). */
  function painted(el, r) {
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    const doors = el.querySelectorAll ? el.querySelectorAll(".bigbtn") : [];
    for (const d of doors) {
      const q = d.getBoundingClientRect ? d.getBoundingClientRect() : null;
      if (!q || !(q.width > 0 && q.height > 0)) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); rt = Math.max(rt, q.right); b = Math.max(b, q.bottom);
    }
    return { left: l, top: t, right: rt, bottom: b, width: rt - l, height: b - t };
  }
  function fit() {
    if (!doc || typeof getComputedStyle !== "function") return;
    const ov = doc.getElementById("overlay");
    if (!ov || !ov.getBoundingClientRect) return;
    const pieces = FIT_IDS.map((id) => doc.getElementById(id)).filter((el) => el && el.style);
    // A hidden overlay (a race, a screen over the title) keeps its fitted tokens: the key below decides on return.
    if (ov.hidden) return;
    if (shape() !== "wide") { pieces.forEach(fitClear); fitKeyLast = null; return; }
    const key = fitKey(ov);
    if (key === fitKeyLast) return;
    const o = ov.getBoundingClientRect();
    if (!(o.height > 0)) return;
    const cs = getComputedStyle(ov), px = (v) => parseFloat(v) || 0;
    const box = { l: o.left + px(cs.paddingLeft), t: o.top + px(cs.paddingTop), r: o.right - px(cs.paddingRight), b: o.bottom - px(cs.paddingBottom) };
    const availW = box.r - box.l, availH = box.b - box.t;
    if (!(availW > 0 && availH > 0)) return;
    for (const el of pieces) {
      fitClear(el);
      if (el.id === "menu-buttons") floorTier(el, availW, availH);
      let tf = parseFloat(el.style.getPropertyValue("--tf")) || 1, r = el.getBoundingClientRect();
      for (let pass = 0; pass < FIT_PASSES && r.height > 0 && tf > FIT_MIN; pass++) {
        // A scroller's rect is its clipped box; scrollHeight / clientHeight (both
        // in the piece's own zoomed units) says how much content hides behind it.
        const needH = r.height * Math.max(1, el.scrollHeight / (el.clientHeight || 1));
        const needW = r.width * Math.max(1, el.scrollWidth / (el.clientWidth || 1));
        const over = Math.max(needH / availH, needW / availW);
        if (over <= 1) break;
        // Shrink only, half a percent past the measured ratio so a rounded
        // zoomed row never lands one px over (ScrollFade would call that a
        // scroller), and a little more once the first pass has not closed
        // it: a cluster re-flowing into fewer columns is not linear in its zoom.
        tf = Math.max(FIT_MIN, tf / over * (pass ? 0.98 : 0.995));
        el.style.setProperty("--tf", tf.toFixed(3));
        r = el.getBoundingClientRect();
      }
      if (!(r.height > 0)) continue;
      // The offset clamp: the overrun past an edge, the near edge winning. It reads what PAINTS: the doors are
      // skewX(-6deg), so a door's drawn box overhangs the cluster's layout box by ~2.3 px a side, and clamping the
      // layout box let them cross the safe edge by 2-3 px (#5385, UI SIZE 50-61 on a phone).
      // currentCSSZoom is exact; rect / offsetHeight divides by a ROUNDED integer, and through the ~427 px pull-back
      // of a far stored X that missed the safe edge by 1 px (#5622: brand at 58.1 with a 59 inset, 852x393).
      const z = el.currentCSSZoom > 0 ? el.currentCSSZoom : (el.offsetHeight > 0 ? r.height / el.offsetHeight : 1);
      r = painted(el, r);
      let dx = 0, dy = 0;
      if (r.right > box.r) dx = box.r - r.right;
      if (r.left + dx < box.l) dx = box.l - r.left;
      if (r.bottom > box.b) dy = box.b - r.bottom;
      if (r.top + dy < box.t) dy = box.t - r.top;
      if (Math.abs(dx) >= 0.5) el.style.setProperty("--tf-dx", (dx / z).toFixed(1) + "px");
      if (Math.abs(dy) >= 0.5) el.style.setProperty("--tf-dy", (dy / z).toFixed(1) + "px");
    }
    fitKeyLast = key;
    if (hasRaf) { settling = true; requestAnimationFrame(() => requestAnimationFrame(() => { settling = false; })); }
  }
  /** One fit per frame, however many requests land in it. */
  function scheduleFit() {
    if (typeof requestAnimationFrame !== "function") { fit(); return; }
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => { fitRaf = 0; fit(); if (ed.on) paintEd(); });   // the editor's readout and handle follow the fitted box
  }
  if (doc && typeof ResizeObserver === "function") {
    // The overlay's box (viewport, insets, zoom) and each piece's own (its
    // doors wrap, hide, re-flow). A door toggled [hidden] inside a full-height
    // cluster changes no border box, so the cluster's subtree is watched too.
    const ro = new ResizeObserver(onResize);
    for (const id of ["overlay", ...FIT_IDS]) { const el = doc.getElementById(id); if (el) ro.observe(el); }
    const mb = doc.getElementById("menu-buttons");
    if (mb && typeof MutationObserver !== "undefined") {
      new MutationObserver(bumpFit).observe(mb, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
    }
    // The row tier reads label widths (floorTier): a web font landing changes them without resizing any box (#5358).
    try { doc.fonts.addEventListener("loadingdone", bumpFit); } catch (_) { /* no FontFaceSet */ }
  }
  /** Store `v` as one shape's layout (default: the current shape). `live`:
   *  paint it now and keep it out of the store until commit(). */
  function set(v, sh, live) {
    const s = isShape(sh) ? sh : shape();
    const a = all();
    a[s] = normalize(v, s);
    if (live || ed.on) { draft = a; draftBase = store.get(KEY, null); } else { draft = null; save(a); }
    if (s === shape()) apply(a[s]);
    return a[s];
  }
  /** Store what live set()s painted, once; false when there was nothing. */
  function commit() {
    if (!draft) return false;
    const a = draft;
    draft = null;
    save(a);
    return true;
  }
  // Leaving or backgrounding the page mid-gesture keeps what is on screen.
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", () => { if (!ed.on) commit(); });
  if (doc && doc.addEventListener) doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden" && !ed.on) commit(); });
  /** A request the box cannot give is not stored (#5199): after set(l) the fit
   *  runs now, and a SIZE it is holding (--tf) or an offset it pulled back from
   *  an edge (--tf-dx / --tf-dy) is written back as the value the screen
   *  shows. So a slider stops AT the edge instead of travelling on with
   *  nothing moving (BUTTONS SIZE 110..200 was dead and ran slightly backwards,
   *  half of each LEFT / RIGHT range moved nothing; measured 2026-11-10).
   *  Offsets are vw / vh of the ICB, and --tf-dx is already in the piece's
   *  own px, so the percent is exact under any zoom. Wide shapes only. */
  function hold(l, part, k, live) {
    const e = part === "art" || !doc ? null : doc.getElementById(part === "btns" ? "menu-buttons" : "menu-brand");
    if (!e || !e.style || shape() !== "wide" || !(k === "size" || k === "x" || k === "y")) return l;
    fit();
    const g = (t) => parseFloat(e.style.getPropertyValue(t)) || 0, p = l[part];
    const pull = (d, full) => (d > 0 ? Math.ceil : Math.floor)(d / ((full || 1) / 100));
    let v = p[k];
    if (k === "size") {
      // The fit's passes overshoot (a re-flow is not linear in zoom), so tf alone
      // gives a different answer from every starting point: bisect to the largest
      // SIZE the box takes, the same value from 125 as from 200.
      const tf = g("--tf"), held = () => { apply(l); fit(); const t = g("--tf"); return t > 0 && t < 1; };
      if (tf > 0 && tf < 1) {
        let lo = LIM.size[0], hi = v;
        while (hi - lo > 1) { p.size = (lo + hi) >> 1; if (held()) hi = p.size; else lo = p.size; }
        p.size = v; v = lo;
      }
      v = Math.max(v, sizeMin(part));   // the floor is an edge too
    }
    else {
      // The edge is the furthest value the fit does not hold, asked of the fit itself: one pull lands a step
      // short or long (--tf-dx is own px through a rounded zoom), so a far request stored 1 where a near one
      // stored 0 and the slider ran backwards at the edge (#5358, UI SIZE 70 %).
      const tok = k === "x" ? "--tf-dx" : "--tf-dy", d = g(tok), dir = d > 0 ? 1 : -1;
      const heldAt = (n) => { p[k] = num(n, k); apply(l); fit(); return !!g(tok); };
      if (d) {
        v += pull(d, k === "x" ? root.clientWidth : root.clientHeight);
        for (let i = 0; i < 3 && v !== p[k] && heldAt(v); i++) v += dir;
        for (let i = 0; i < 3 && !heldAt(v - dir); i++) v -= dir;
        p[k] = NaN;   // the probes painted: always re-apply below
      }
    }
    if (num(v, k) === p[k]) return l;
    p[k] = num(v, k);
    return set(l, undefined, live);
  }
  function resetShape(sh) { return set(null, sh); }
  /** RESET ALL: both shapes back to shipped. */
  function reset() { draft = null; store.set(KEY, null); apply(); return current(); }
  /** COPY TO `to`: the OTHER shape's layout becomes `to`'s too. */
  function copyTo(to) {
    const s = to === "tall" ? "tall" : "wide";
    return set(current(s === "tall" ? "wide" : "tall"), s);
  }

  apply();   // at eval: index.html painted the first answer; this owns the rest
  // A ROTATION re-applies: sheet-shape.js flips body[data-shape] and the other
  // shape's layout takes over (the fold and the editor repaint through onShape).
  const onShape = [];
  if (doc && doc.body && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => { apply(); for (const fn of onShape) fn(); })
      .observe(doc.body, { attributes: true, attributeFilter: ["data-shape"] });
  }

  // ---- the APPEARANCE fold -------------------------------------------------
  // PEEK is js/ui/screen-looks.js's (html[data-appearance-peek="title"]), the
  // one see-through preview every APPEARANCE fold shares. ScreenLooks loads
  // after this file and is read at call time; without it (a bare unit VM)
  // nothing peeks.
  function peek(on, holdMs) {
    if (typeof ScreenLooks === "undefined") return;
    if (on) ScreenLooks.peek("title", holdMs || 0);
    else ScreenLooks.endPeek();
  }

  const pctTxt = (k, n, part) => {
    if (k === "size") return Math.round(n * 10000 / shipped(shape())[part].size) / 100 + "%";
    if (k === "width") return n ? String(n) + (usesWidthSplit() ? "" : "%") : "AUTO";
    if (!n) return "CENTRE";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { size: "SIZE", width: "WIDTH", x: "LEFT / RIGHT", y: "UP / DOWN" };
  const usesWidthSplit = () => shape() === "wide" && phoneWide();

  /** The whole title screen shipped: this layout AND TitleFx's appearance settings
   *  (TitleFx loads first; MOTION is global, so it does not count here). */
  function screenShipped() {
    const fx = typeof TitleFx !== "undefined" ? TitleFx : null;
    return layoutShipped() && (!fx || (fx.introMode() === "full" && fx.washMode() === "full" && fx.artMode() === "on" && fx.buttonStyle() === "auto"));
  }
  /** APPEARANCE › TITLE SCREEN's closed summary (the shell's #pm-titlescreen-sum). */
  function paintScreenSum() {
    const sum = doc && doc.getElementById("pm-titlescreen-sum");
    if (sum) sum.textContent = "TITLE SCREEN · " + (screenShipped() ? "SHIPPED" : "CUSTOM");
  }

  function build() {
    const panel = document.getElementById("pm-panel-appearance");
    if (!panel) return;
    if (document.getElementById("pm-titlelayout")) { if (ui) ui.paintAll(); return; }
    Log.info("ui", "TitleLayout.build");
    const d = document;
    const el = (tag, props, kids) => {
      const e = d.createElement(tag);
      for (const k in props || {}) {
        if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
      }
      for (const c of kids || []) e.appendChild(c);
      return e;
    };
    const sum = el("summary", { id: "pm-titlelayout-sum", className: "adv-more-btn" });
    const body = el("div", { id: "pm-titlelayout-body", attrs: { role: "group", "aria-label": "Title screen layout" } });
    const fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
    fold.id = "pm-titlelayout";   // a plain assignment, so tools/check/shell-ids.mjs sees the mount-once guard's target
    const paintSum = () => {
      sum.textContent = "TITLE LAYOUT · " + (layoutShipped() ? "SHIPPED" : "CUSTOM");
      paintScreenSum();
    };

    body.appendChild(el("p", { className: "adv-help", textContent:
      "Move and size the title screen's buttons, title and car drawing. Landscape and portrait keep a layout each; " +
      "100% SIZE is the factory size for that piece in the current orientation. Hold a slider to see the title screen through this page." }));
    const shapeLine = el("p", { id: "pm-tl-shape", className: "adv-help", attrs: { "aria-live": "polite", "data-help": "keep" } });
    body.appendChild(shapeLine);

    const sliders = [];
    function slider(part, k) {
      const id = `pm-tl-${part}-${k}`;
      const out = el("b", { id: id + "-v" });
      // The first WIDTH tick represents AUTO. The others are explicit requests.
      const min = k === "width" ? WIDTH_MIN - 1 : LIM[k][0];
      const inp = el("input", { id, type: "range", min: String(min), max: String(LIM[k][1]), step: "1",
        attrs: { "aria-label": `${part === "btns" ? "Buttons" : part === "title" ? "Title" : "Car drawing"} ${NAMES[k].toLowerCase()}` } });
      if (k === "width") inp.setAttribute("aria-describedby", "pm-tl-width-help");
      const paint = (layout = current()) => {
        let n = layout[part][k];
        if (k === "size") { inp.min = String(sizeMin(part)); n = Math.max(n, Number(inp.min)); }
        inp.value = String(k === "width" && !n ? min : n);
        out.textContent = pctTxt(k, n, part);
        inp.setAttribute("aria-valuetext", k !== "width" ? out.textContent
          : !n ? "Auto, use automatic width"
          : usesWidthSplit() ? n + " on the column split scale" : n + " percent of screen width requested");
      };
      inp.addEventListener("input", () => {
        const l = current(), n = Number(inp.value);
        l[part][k] = k === "width" && n === min ? 0 : num(n, k);
        paint(hold(set(l, undefined, true), part, k, true));
        paintSum();
        peek(true, 900);
      });
      // The store write waits for the thumb's release (`change`), not each input.
      inp.addEventListener("change", () => { if (commit()) paintSum(); });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      sliders.push(paint);
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
      if (k === "width") body.appendChild(el("p", { id: "pm-tl-width-help", className: "adv-help", attrs: { "data-help": "keep" },
        textContent: "AUTO lets the layout size the menu. On short landscape screens, 20 to 100 widens the menu column from 54% to 80% of the available space. In other layouts, WIDTH requests a share of screen width. The buttons adjust to fit." }));
    }
    const rows = [];   // [row, key] — held, not looked up again by a built id
    function choice(id, label, values, key, help) {
      if (typeof SettingRow === "undefined") return;
      const r = SettingRow.build(id, label, values);
      SettingRow.wire(r.row, {
        read: () => current()[key],
        write: (v) => { const l = current(); l[key] = v; set(l); paintSum(); peek(true, 1200); },
      });
      body.appendChild(r.row);
      rows.push([r.row, key]);
      body.appendChild(el("p", { className: "adv-help", textContent: help }));
    }

    body.appendChild(el("h4", { className: "pm-look-h", textContent: "BUTTONS" }));
    choice("pm-tl-layout", "LAYOUT", LAYOUTS, "layout",
      "GRID is the shipped two-by-two of play modes. STACK gives every door its own line; ROW puts the play modes side by side.");
    choice("pm-tl-side", "SIDE", SIDES, "side",
      "SWAPPED trades the buttons' and the title's sides (on a tall screen, the buttons go on top).");
    for (const k of ["size", "width", "x", "y"]) slider("btns", k);
    body.appendChild(el("h4", { className: "pm-look-h", textContent: "TITLE" }));
    for (const k of ["size", "x", "y"]) slider("title", k);
    body.appendChild(el("h4", { className: "pm-look-h", textContent: "CAR DRAWING" }));
    for (const k of ["size", "x", "y"]) slider("art", k);

    const tap = (id, text, fn) => {
      const b = el("button", { id, type: "button", textContent: text });
      b.addEventListener("click", () => {
        fn(); paintAll(); peek(true, 1200);
        try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
      });
      return b;
    };
    const copy = tap("pm-tl-copy", "", () => copyTo(shape() === "tall" ? "wide" : "tall"));
    body.appendChild(el("div", { className: "balanced-row" }, [
      copy, tap("pm-tl-reset-shape", "RESET THIS SHAPE", () => resetShape()), tap("pm-tl-reset", "RESET ALL", reset)]));
    const edit = el("button", { id: "pm-tl-edit", type: "button", textContent: "EDIT ON TITLE SCREEN…" });
    edit.addEventListener("click", () => enter(edit));
    body.appendChild(edit);
    body.appendChild(el("p", { className: "adv-help", textContent:
      "EDIT ON TITLE SCREEN: drag a piece to move it, drag its corner dot to size it. Keys: arrows move, + and − size, [ and ] pick a piece; Tab moves through the bar." }));

    const overlay = document.getElementById("overlay");
    // Only from the title screen: mid-race (#overlay hidden) there is nothing to drag.
    const paintEdit = () => { edit.disabled = !overlay || !!overlay.hidden; };
    if (overlay && typeof MutationObserver !== "undefined")
      new MutationObserver(paintEdit).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
    function paintAll() {
      for (const p of sliders) p();
      for (const [row, key] of rows) SettingRow.paint(row, current()[key]);
      paintSum();
      const sh = shape();
      shapeLine.textContent = "EDITING: " + SHAPE_NAMES[sh];
      copy.textContent = "COPY TO " + SHAPE_NAMES[sh === "tall" ? "wide" : "tall"];
      paintEdit();
    }
    paintAll();
    onShape.push(paintAll);
    if (typeof TitleFx !== "undefined" && TitleFx.onChange) TitleFx.onChange(paintScreenSum);
    ui = { fold, edit, paintAll };

    // Inside the TITLE SCREEN fold, after TITLE ART's help line and before
    // REPLAY INTRO: the other title-screen knobs.
    const anchor = document.getElementById("pm-replay-intro");
    const host = document.getElementById("pm-titlescreen-body") || panel;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(fold, anchor);
    else host.appendChild(fold);
  }

  // ---- EDIT ON TITLE SCREEN: drag the pieces themselves ---------------------
  const PIECES = { btns: "BUTTONS", title: "TITLE", art: "CAR DRAWING" };
  const STEP = { size: 5, width: 5 };
  let ui = null;   // the fold, once built
  const ed = { on: false, sel: "btns", drag: null, els: null };
  const byId = (id) => doc.getElementById(id);
  const win = () => (typeof window !== "undefined" ? window : {});
  const pieceEl = (p) => (p === "art" ? ed.els.art : byId(p === "btns" ? "menu-buttons" : "menu-brand"));
  const uiScale = () => {
    try { return parseFloat(getComputedStyle(root).getPropertyValue("--ui-scale")) || 1; } catch (_) { return 1; }
  };
  const shortLandscape = (() => { try { return win().matchMedia("(max-height: 519px) and (min-aspect-ratio: 1/1)"); } catch (_) { return null; } })();
  const phoneWide = () => !!(shortLandscape && shortLandscape.matches);
  if (shortLandscape && shortLandscape.addEventListener) shortLandscape.addEventListener("change", () => { for (const fn of onShape) fn(); });
  /** The fit is holding this piece under its requested SIZE (#5150): the box is full. */
  const fitted = (p) => { const e = p === "art" ? null : byId(p === "btns" ? "menu-buttons" : "menu-brand"); return !!(e && e.style && parseFloat(e.style.getPropertyValue("--tf")) < 1); };
  // MEASURED where it can be: the piece's base zoom is not --ui-scale on every screen
  // (css/menu-destinations.css PHONE LANDSCAPE HOME), and a drag must track the pointer.
  const zoomOf = (p, size) => {
    if (p === "art") return 1;
    const e = pieceEl(p), r = e && e.offsetHeight > 0 ? e.getBoundingClientRect().height / e.offsetHeight : 0;
    return r > 0 ? r : uiScale() * size / 100;
  };

  function page(on) {
    for (const id of ["pmsettings", "pm-panel-appearance"]) { const e = byId(id); if (e) e.hidden = !on; }
  }
  function buildEditor() {
    if (ed.els) return ed.els;
    const layer = byId("tl-editor"), done = byId("tl-done"), overlay = byId("overlay");
    if (!layer || !done || !overlay) return null;
    const mk = (tag, id, text) => { const e = doc.createElement(tag); e.id = id; if (text) e.textContent = text; return e; };
    const btn = (id, text, label, fn) => {
      const b = mk("button", id, text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", fn);
      return b;
    };
    const name = btn("tl-piece", "", "Select next region", () => cycle(1));
    const direction = (label, prop, sign) => btn("tl-" + label.toLowerCase(), label, label, () => nudge(prop, ed.coarse ? sign * 5 : sign));
    const steps = btn("tl-step", "Fine", "Coarse adjustment", () => {
      ed.coarse = !ed.coarse; steps.textContent = ed.coarse ? "Coarse" : "Fine";
      steps.setAttribute("aria-pressed", String(ed.coarse));
    });
    steps.setAttribute("aria-pressed", "false");
    const moves = [direction("Left", "x", -1), direction("Right", "x", 1), direction("Up", "y", -1), direction("Down", "y", 1)];
    const panel = mk("div", "tl-adjustments");
    const readout = mk("output", "tl-values");
    const adjust = btn("tl-adjust", "Controls", "Controls for selected region", () => {
      panel.hidden = !panel.hidden;
      adjust.setAttribute("aria-expanded", String(!panel.hidden));
    });
    adjust.setAttribute("aria-controls", panel.id);
    const dock = btn("tl-dock", "Move bar", "Move toolbar to opposite edge", () => {
      layer.toggleAttribute("data-top", !layer.hasAttribute("data-top"));
    });
    const undo = btn("tl-undo", "Undo", "Undo last change", () => {
      const previous = ed.history.pop();
      if (previous) { draft = previous; draftBase = store.get(KEY, null); apply(); paintEd(); }
    });
    const resetScreen = btn("tl-reset-screen", "Reset screen", "Restore shipped title in this orientation", () => {
      remember(); resetShape(); paintEd();
    });
    const cancel = btn("tl-cancel", "Cancel", "Discard title changes", () => exit(false));

    name.setAttribute("aria-live", "polite");
    const sizeDn = btn("tl-size-dn", "Scale −", "Scale down", () => nudge("size", -STEP.size));
    const sizeUp = btn("tl-size-up", "Scale +", "Scale up", () => nudge("size", STEP.size));
    const wDn = btn("tl-width-dn", "WIDTH −", "Narrower buttons", () => nudge("width", -STEP.width));
    const wUp = btn("tl-width-up", "WIDTH +", "Wider buttons", () => nudge("width", STEP.width));
    const rst = btn("tl-reset-piece", "Reset region", "Put this piece back where it ships", resetPiece);
    const handle = mk("div", "tl-handle");
    handle.setAttribute("aria-hidden", "true");
    handle.hidden = true;
    const art = mk("div", "tl-art");
    art.setAttribute("aria-hidden", "true");
    art.hidden = true;
    for (const c of [name, adjust, cancel]) layer.insertBefore(c, done);
    layer.setAttribute("data-esc-close", "tl-cancel");   // Escape discards; the shell names tl-done until Cancel exists
    for (const c of [readout, dock, ...moves, steps, sizeDn, sizeUp, wDn, wUp, undo, rst, resetScreen]) panel.appendChild(c);
    layer.appendChild(panel);
    layer.appendChild(handle);
    overlay.appendChild(art);
    done.addEventListener("click", exit);
    ed.els = { layer, done, overlay, name, adjust, panel, readout, undo, wDn, wUp, handle, art };
    for (const p of Object.keys(PIECES)) {
      const e = pieceEl(p);
      if (e) e.addEventListener("pointerdown", (ev) => down(ev, p, "move"));
    }
    handle.addEventListener("pointerdown", (ev) => down(ev, ed.sel, "size"));
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up);
    doc.addEventListener("pointercancel", cancelDrag);
    // Capture on #overlay: while editing, a tap on a door is a drag, never a click.
    overlay.addEventListener("click", (ev) => {
      if (!ed.on) return;
      ev.preventDefault(); ev.stopPropagation();
    }, true);
    // Capture on document, ahead of Input's window listener; MenuNav stands
    // aside for #tl-editor (js/ui/menu-nav.js activeLayer), and Escape is left
    // to the Cancel action in data-esc-close.
    doc.addEventListener("keydown", onKey, true);
    onShape.push(() => { if (ed.on) { cancelDrag(); paintEd(); } });
    return ed.els;
  }

  function remember() {
    if (ed.history.length === 50) ed.history.shift();
    ed.history.push(all());
  }
  function enter(invoker = doc.activeElement) {
    const E = buildEditor();
    if (!E || E.overlay.hidden || ed.on) return false;
    Log.info("ui", "TitleLayout.edit " + shape());
    ed.invoker = invoker;
    ed.returnSettings = !byId("pmsettings").hidden;
    ed.history = [];
    ed.on = true;
    peek(false);
    page(false);
    root.setAttribute("data-tl-edit", "");
    E.panel.hidden = true;
    E.adjust.setAttribute("aria-expanded", "false");
    E.layer.removeAttribute("data-top");
    E.layer.hidden = false;
    E.art.hidden = false;
    select(ed.sel);
    E.name.focus();
    return true;
  }
  function exit(save = true) {
    if (!ed.on) return;
    const E = ed.els;
    finish();
    ed.on = false;
    if (save) commit(); else { draft = null; apply(); }
    root.removeAttribute("data-tl-edit");
    E.layer.hidden = true;
    E.art.hidden = true;
    E.handle.hidden = true;
    for (const p of Object.keys(PIECES)) { const e = pieceEl(p); if (e) e.removeAttribute("data-tl-sel"); }
    if (ed.returnSettings) page(true);
    if (ui && ed.returnSettings) {
      const outer = byId("pm-titlescreen");
      if (outer) outer.open = true;   // the sub-fold lives inside TITLE SCREEN
      ui.fold.open = true;
      ui.paintAll();
    }
    const opener = ed.invoker;
    if (opener && opener.focus) {
      const f = () => opener.focus();
      if (typeof setTimeout === "function") setTimeout(f, 0); else f();
    }
  }

  function select(p) {
    ed.sel = PIECES[p] ? p : "btns";
    for (const k of Object.keys(PIECES)) {
      const e = pieceEl(k);
      if (e) { if (k === ed.sel) e.setAttribute("data-tl-sel", ""); else e.removeAttribute("data-tl-sel"); }
    }
    paintEd();
  }
  function cycle(dir) {
    const keys = Object.keys(PIECES);
    select(keys[(keys.indexOf(ed.sel) + dir + keys.length) % keys.length]);
  }
  /** One step of one number on the selected piece. WIDTH from AUTO starts at
   *  the width the buttons have now; below 20 it goes back to AUTO. */
  function nudge(k, d) {
    if (!ed.on) return;
    remember();
    const l = current(), p = l[ed.sel];
    if (k === "width") {
      if (ed.sel !== "btns") return;
      // On a short landscape screen WIDTH 20 IS the shipped column and 100 four
      // fifths of the box (css/menu-destinations.css PHONE LANDSCAPE HOME), so AUTO
      // steps from 20; elsewhere it starts at the share the buttons have now.
      const r = pieceEl("btns").getBoundingClientRect();
      const from = p.width || (phoneWide() ? WIDTH_MIN : Math.round(r.width / (win().innerWidth || 1) * 100));
      p.width = d < 0 && from <= WIDTH_MIN ? 0 : num(Math.max(WIDTH_MIN, from + d), "width");
    } else {
      const from = k === "size" ? Math.max(sizeMin(ed.sel), p.size) : p[k];
      p[k] = num(from + d, k);
    }
    hold(set(l), ed.sel, k);
    paintEd();
  }
  function resetPiece() {
    if (!ed.on) return;
    const l = current();
    remember();
    l[ed.sel] = Object.assign({}, shipped(shape())[ed.sel]);
    set(l);
    paintEd();
  }

  /** The toolbar's readout, the proxy over the drawing and the corner handle,
   *  all re-measured after a change (the tokens have just moved the piece). */
  function paintEd() {
    const E = ed.els;
    if (!E || !ed.on) return;
    const p = current()[ed.sel];
    E.name.textContent = PIECES[ed.sel];
    E.readout.textContent = SHAPE_NAMES[shape()] + " · " + pctTxt("size", Math.max(p.size, sizeMin(ed.sel)), ed.sel) + (fitted(ed.sel) ? " (SCREEN FULL)" : "") +
      (ed.sel === "btns" ? " · " + (!p.width ? "AUTO WIDTH"
        : (usesWidthSplit() ? "WIDTH SETTING " : "WIDTH REQUEST ") + pctTxt("width", p.width)) : "");
    E.undo.disabled = !ed.history.length;
    E.name.setAttribute("aria-label", "Select next region. " + E.name.textContent + " · " + E.readout.textContent);
    E.wDn.disabled = E.wUp.disabled = ed.sel !== "btns";
    const car = byId("title-car"), r = car ? car.getBoundingClientRect() : null;
    if (r && r.width >= 1 && r.height >= 1) {
      const o = E.overlay.getBoundingClientRect();
      E.art.style.setProperty("left", (r.left - o.left + (E.overlay.scrollLeft || 0)) + "px");
      E.art.style.setProperty("top", (r.top - o.top + (E.overlay.scrollTop || 0)) + "px");
      E.art.style.setProperty("width", r.width + "px");
      E.art.style.setProperty("height", r.height + "px");
      E.art.hidden = false;
    } else E.art.hidden = true;   // TITLE ART off, or a shape that shows none
    const s = pieceEl(ed.sel), sr = s && !(ed.sel === "art" && E.art.hidden) ? s.getBoundingClientRect() : null;
    E.handle.hidden = !(sr && sr.width >= 1);
    if (sr) {
      E.handle.style.setProperty("left", sr.right + "px");
      E.handle.style.setProperty("top", sr.bottom + "px");
    }
  }

  function down(e, part, mode) {
    if (!ed.on || (e.button != null && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    if (ed.drag) { cancelDrag(); return; }
    if (e.isPrimary === false) return;
    if (part !== ed.sel) select(part);
    const t = e.currentTarget || e.target;
    try { if (t && t.setPointerCapture) t.setPointerCapture(e.pointerId); } catch (_) { /* the pointer is already gone; move events still arrive */ }
    const from = Object.assign({}, current()[part]);
    let c = [e.clientX, e.clientY];
    if (mode === "size") {
      from.size = Math.max(from.size, sizeMin(part));
      const r = pieceEl(part).getBoundingClientRect();
      c = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    }
    ed.drag = { id: e.pointerId, part, mode, x0: e.clientX, y0: e.clientY, from, c };
  }
  /* A pointermove only records the pointer; one rAF paints the latest (#4933).
     Apply commits the fitted draft. */
  function move(e) {
    const d = ed.drag;
    if (!ed.on || !d || e.pointerId !== d.id) return;
    d.at = [e.clientX, e.clientY];
    if (typeof requestAnimationFrame !== "function") { step(); return; }
    if (!d.raf) d.raf = requestAnimationFrame(step);
  }
  function step() {
    const d = ed.drag;
    if (!d || !d.at) return;
    if (d.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(d.raf);
    d.raf = 0;
    const e = { clientX: d.at[0], clientY: d.at[1] };
    d.at = null;
    if (!d.changed) { remember(); d.changed = true; }
    const l = current(), p = l[d.part], w = win();
    if (d.mode === "move") {
      const f = d.zoom || (d.zoom = zoomOf(d.part, d.from.size));   // measured once per drag
      p.x = num(d.from.x + (e.clientX - d.x0) / (w.innerWidth || 1) * 100 / f, "x");
      p.y = num(d.from.y + (e.clientY - d.y0) / (w.innerHeight || 1) * 100 / f, "y");
    } else {
      // SIZE by the corner: the pointer's distance from the piece's centre,
      // against where the drag began.
      const r0 = Math.hypot(d.x0 - d.c[0], d.y0 - d.c[1]) || 1;
      p.size = num(d.from.size * Math.hypot(e.clientX - d.c[0], e.clientY - d.c[1]) / r0, "size");
    }
    const h = set(l, undefined, true);
    if (d.mode === "move") hold(hold(h, d.part, "x", true), d.part, "y", true); else hold(h, d.part, "size", true);
    paintEd();
  }
  /** Finish the pending frame before releasing the gesture. */
  function finish() {
    if (ed.drag) step();
    ed.drag = null;
  }
  function cancelDrag(e) {
    if (!ed.drag || (e && e.pointerId !== ed.drag.id)) return;
    if (ed.drag.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(ed.drag.raf);
    if (ed.drag.changed) { draft = ed.history.pop(); draftBase = store.get(KEY, null); }
    ed.drag = null;
    apply(); paintEd();
  }
  function up(e) { if (ed.drag && e.pointerId === ed.drag.id) finish(); }

  function onKey(e) {
    if (!ed.on || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") nudge("x", k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp" || k === "ArrowDown") nudge("y", k === "ArrowUp" ? -1 : 1);
    else if (k === "+" || k === "=") nudge("size", STEP.size);
    else if (k === "-" || k === "_") nudge("size", -STEP.size);
    // [ / ] pick the piece; Tab is left alone so the bar's buttons (WIDTH,
    // RESET PIECE, DONE) stay reachable from the keyboard.
    else if (k === "]" || k === "[") cycle(k === "[" ? -1 : 1);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  if (typeof document !== "undefined") {
    // #4798 gate
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(build) : build()), { once: true });
    else build();
  }

  return Object.freeze({ KEY, DEFAULT, LIM, LAYOUTS, SIDES, SHAPES, normalize, isDefault, vars, shape, all, current, apply,
    fit, set, commit, reset, resetShape, copyTo, build, enter, exit, screenShipped, get editing() { return ed.on; } });
})();
