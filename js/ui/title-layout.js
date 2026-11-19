const TitleLayout = (function () {
  "use strict";

  const KEY = "titleLayout";
  const PARTS = ["btns", "title", "art"];
  const LAYOUTS = [["grid", "GRID"], ["stack", "STACK"], ["row", "ROW"]];
  const SIDES = [["auto", "AUTO"], ["swap", "SWAPPED"]];
  const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], size: [50, 200], width: [0, 100] });
  const DEFAULT = Object.freeze({
    btns: Object.freeze({ x: 0, y: 0, size: 100, width: 0 }),
    title: Object.freeze({ x: 0, y: 0, size: 100 }),
    art: Object.freeze({ x: 0, y: 0, size: 100 }),
    layout: "grid", side: "auto",
  });
  const PHONE_WIDE = Object.freeze({
    btns: Object.freeze({ x: 2, y: 1, size: 123, width: 0 }),
    title: DEFAULT.title, art: DEFAULT.art, layout: "grid", side: "auto",
  });
  const phone = () => { try { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) <= 500; } catch (_) { return false; } };
  const shipped = (sh) => (sh === "wide" && phone() ? PHONE_WIDE : DEFAULT);
  const SHAPES = ["wide", "tall"];
  const SHAPE_NAMES = { wide: "LANDSCAPE", tall: "PORTRAIT" };
  const store = GameStore.store;
  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;

  const num = (v, k) => {
    const [lo, hi] = LIM[k];
    const n = typeof v === "number" && isFinite(v) ? Math.round(v) : DEFAULT.btns[k];
    if (k === "width") return n <= 0 ? 0 : Math.max(20, Math.min(hi, n));
    return Math.max(lo, Math.min(hi, n));
  };
  function normalize(v, sh) {
    const o = v && typeof v === "object" ? v : (sh ? shipped(sh) : {});
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
  const isShipped = (v, sh) => JSON.stringify(normalize(v)) === JSON.stringify(normalize(null, sh));
  function layoutShipped() { const a = all(); return isShipped(a.wide, "wide") && isShipped(a.tall, "tall"); }

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
  function shape() {
    return doc && doc.body && doc.body.getAttribute("data-shape") === "tall" ? "tall" : "wide";
  }
  const isShape = (s) => s === "wide" || s === "tall";
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
    for (const s of SHAPES) if (!isShipped(a[s], s)) out[s] = normalize(a[s]);
    store.set(KEY, out.wide || out.tall ? out : null);
  }
  function current(sh) { return all()[isShape(sh) ? sh : shape()]; }
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
    scheduleFit();
  }

  const FIT_IDS = ["menu-buttons", "menu-brand"];
  const FIT_MIN = 0.1;
  const FIT_PASSES = 6;
  const FIT_TOKENS = ["--tf", "--tf-dx", "--tf-dy"];
  let fitRaf = 0;
  function fitClear(el) { for (const k of FIT_TOKENS) el.style.removeProperty(k); }
  const touchHome = () => { try { return phoneWide() && win().matchMedia("(pointer: coarse)").matches; } catch (_) { return false; } };
  const floored = () => { const e = doc && doc.getElementById("menu-buttons"); return !!e && touchHome() && e.getAttribute("data-home-floor") !== "off"; };
  const sizeMin = (part) => (part === "btns" && floored() ? 100 : LIM.size[0]);
  function floorTier(el, availW, availH) {
    el.removeAttribute("data-home-rows"); el.removeAttribute("data-home-floor");
    if (!touchHome()) return;
    const tier = (t) => { if (t) el.setAttribute("data-home-rows", t); else el.removeAttribute("data-home-rows"); };
    const fits = (tf) => {
      el.style.setProperty("--tf", tf.toFixed(3));
      const r = el.getBoundingClientRect();
      if (r.height * Math.max(1, el.scrollHeight / (el.clientHeight || 1)) > availH || r.width * Math.max(1, el.scrollWidth / (el.clientWidth || 1)) > availW) return false;
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
    const tiers = current().layout === "grid" ? ["", "7", "5"] : [""];
    for (const t of tiers) { tier(t); if (fits(1)) { el.style.removeProperty("--tf"); return; } }
    const floor = 100 / Math.max(100, current().btns.size);
    let best = 0, bestT = "";
    if (floor < 1) for (const t of tiers) {
      tier(t);
      if (!fits(floor)) continue;
      let lo = floor, hi = 1;
      for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
      if (lo > best) { best = lo; bestT = t; }
    }
    tier(bestT);
    if (best) el.style.setProperty("--tf", best.toFixed(3));
    else { el.style.removeProperty("--tf"); el.setAttribute("data-home-floor", "off"); }
  }
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
    if (ov.hidden || shape() !== "wide") { pieces.forEach(fitClear); return; }
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
        const needH = r.height * Math.max(1, el.scrollHeight / (el.clientHeight || 1));
        const needW = r.width * Math.max(1, el.scrollWidth / (el.clientWidth || 1));
        const over = Math.max(needH / availH, needW / availW);
        if (over <= 1) break;
        tf = Math.max(FIT_MIN, tf / over * (pass ? 0.98 : 0.995));
        el.style.setProperty("--tf", tf.toFixed(3));
        r = el.getBoundingClientRect();
      }
      if (!(r.height > 0)) continue;
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
  }
  function scheduleFit() {
    if (typeof requestAnimationFrame !== "function") { fit(); return; }
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => { fitRaf = 0; fit(); if (ed.on) paintEd(); });
  }
  if (doc && typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(scheduleFit);
    for (const id of ["overlay", ...FIT_IDS]) { const el = doc.getElementById(id); if (el) ro.observe(el); }
    const mb = doc.getElementById("menu-buttons");
    if (mb && typeof MutationObserver !== "undefined") {
      new MutationObserver(scheduleFit).observe(mb, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
    }
    try { doc.fonts.addEventListener("loadingdone", scheduleFit); } catch (_) {  }
  }
  function set(v, sh, live) {
    const s = isShape(sh) ? sh : shape();
    const a = all();
    a[s] = normalize(v, s);
    if (live) { draft = a; draftBase = store.get(KEY, null); } else { draft = null; save(a); }
    if (s === shape()) apply(a[s]);
    return a[s];
  }
  function commit() {
    if (!draft) return false;
    const a = draft;
    draft = null;
    save(a);
    return true;
  }
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", commit);
  if (doc && doc.addEventListener) doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") commit(); });
  function hold(l, part, k, live) {
    const e = part === "art" || !doc ? null : doc.getElementById(part === "btns" ? "menu-buttons" : "menu-brand");
    if (!e || !e.style || shape() !== "wide" || !(k === "size" || k === "x" || k === "y")) return l;
    fit();
    const g = (t) => parseFloat(e.style.getPropertyValue(t)) || 0, p = l[part];
    const pull = (d, full) => (d > 0 ? Math.ceil : Math.floor)(d / ((full || 1) / 100));
    let v = p[k];
    if (k === "size") {
      const tf = g("--tf"), held = () => { apply(l); fit(); const t = g("--tf"); return t > 0 && t < 1; };
      if (tf > 0 && tf < 1) {
        let lo = LIM.size[0], hi = v;
        while (hi - lo > 1) { p.size = (lo + hi) >> 1; if (held()) hi = p.size; else lo = p.size; }
        p.size = v; v = lo;
      }
      v = Math.max(v, sizeMin(part));
    }
    else {
      const tok = k === "x" ? "--tf-dx" : "--tf-dy", d = g(tok), dir = d > 0 ? 1 : -1;
      const heldAt = (n) => { p[k] = num(n, k); apply(l); fit(); return !!g(tok); };
      if (d) {
        v += pull(d, k === "x" ? root.clientWidth : root.clientHeight);
        for (let i = 0; i < 3 && v !== p[k] && heldAt(v); i++) v += dir;
        for (let i = 0; i < 3 && !heldAt(v - dir); i++) v -= dir;
        p[k] = NaN;
      }
    }
    if (num(v, k) === p[k]) return l;
    p[k] = num(v, k);
    return set(l, undefined, live);
  }
  function resetShape(sh) { return set(null, sh); }
  function reset() { draft = null; store.set(KEY, null); apply(); return current(); }
  function copyTo(to) {
    const s = to === "tall" ? "tall" : "wide";
    return set(current(s === "tall" ? "wide" : "tall"), s);
  }

  apply();
  const onShape = [];
  if (doc && doc.body && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => { apply(); for (const fn of onShape) fn(); })
      .observe(doc.body, { attributes: true, attributeFilter: ["data-shape"] });
  }

  function peek(on, holdMs) {
    if (typeof ScreenLooks === "undefined") return;
    if (on) ScreenLooks.peek("title", holdMs || 0);
    else ScreenLooks.endPeek();
  }

  const pctTxt = (k, n) => {
    if (k === "size") return n + "%";
    if (k === "width") return n ? n + "%" : "AUTO";
    if (!n) return "CENTRE";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { size: "SIZE", width: "WIDTH", x: "LEFT / RIGHT", y: "UP / DOWN" };

  function screenShipped() {
    const fx = typeof TitleFx !== "undefined" ? TitleFx : null;
    return layoutShipped() && (!fx || (fx.introMode() === "full" && fx.washMode() === "full" && fx.artMode() === "on"));
  }
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
    fold.id = "pm-titlelayout";
    const paintSum = () => {
      sum.textContent = "TITLE LAYOUT · " + (layoutShipped() ? "SHIPPED" : "CUSTOM");
      paintScreenSum();
    };

    body.appendChild(el("p", { className: "adv-help", textContent:
      "Move and size the title screen's buttons, title and car drawing. Landscape and portrait keep a layout each; " +
      "these controls edit the shape the screen is in now. Hold a slider to see the title screen through this page." }));
    const shapeLine = el("p", { id: "pm-tl-shape", className: "adv-help", attrs: { "aria-live": "polite", "data-help": "keep" } });
    body.appendChild(shapeLine);

    const sliders = [];
    function slider(part, k) {
      const id = `pm-tl-${part}-${k}`;
      const out = el("b", { id: id + "-v" });
      const inp = el("input", { id, type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: "1",
        attrs: { "aria-label": `${part === "btns" ? "Buttons" : part === "title" ? "Title" : "Car drawing"} ${NAMES[k].toLowerCase()}` } });
      const paint = () => {
        let n = current()[part][k];
        if (k === "size") { inp.min = String(sizeMin(part)); n = Math.max(n, sizeMin(part)); }
        if (d.activeElement !== inp) inp.value = String(n);
        out.textContent = pctTxt(k, n);
      };
      inp.addEventListener("input", () => {
        let l = current();
        l[part][k] = num(parseFloat(inp.value), k);
        l = hold(set(l, undefined, true), part, k, true);
        if (String(l[part][k]) !== inp.value) inp.value = String(l[part][k]);
        out.textContent = pctTxt(k, l[part][k]); paintSum();
        peek(true, 900);
      });
      inp.addEventListener("change", () => { if (commit()) paintSum(); });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      sliders.push(paint);
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }
    const rows = [];
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
        try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {  }
      });
      return b;
    };
    const copy = tap("pm-tl-copy", "", () => copyTo(shape() === "tall" ? "wide" : "tall"));
    body.appendChild(el("div", { className: "balanced-row" }, [
      copy, tap("pm-tl-reset-shape", "RESET THIS SHAPE", () => resetShape()), tap("pm-tl-reset", "RESET ALL", reset)]));
    const edit = el("button", { id: "pm-tl-edit", type: "button", textContent: "EDIT ON TITLE SCREEN…" });
    edit.addEventListener("click", () => enter());
    body.appendChild(edit);
    body.appendChild(el("p", { className: "adv-help", textContent:
      "EDIT ON TITLE SCREEN: drag a piece to move it, drag its corner dot to size it. Keys: arrows move, + and − size, [ and ] pick a piece; Tab moves through the bar." }));

    const overlay = document.getElementById("overlay");
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

    const anchor = document.getElementById("pm-replay-intro");
    const host = document.getElementById("pm-titlescreen-body") || panel;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(fold, anchor);
    else host.appendChild(fold);
  }

  const PIECES = { btns: "BUTTONS", title: "TITLE", art: "CAR DRAWING" };
  const STEP = { size: 5, width: 5 };
  let ui = null;
  const ed = { on: false, sel: "btns", drag: null, els: null };
  const byId = (id) => doc.getElementById(id);
  const win = () => (typeof window !== "undefined" ? window : {});
  const pieceEl = (p) => (p === "art" ? ed.els.art : byId(p === "btns" ? "menu-buttons" : "menu-brand"));
  const uiScale = () => {
    try { return parseFloat(getComputedStyle(root).getPropertyValue("--ui-scale")) || 1; } catch (_) { return 1; }
  };
  const phoneWide = () => { try { return !!win().matchMedia && win().matchMedia("(max-height: 519px) and (min-aspect-ratio: 1/1)").matches; } catch (_) { return false; } };
  const fitted = (p) => { const e = p === "art" ? null : byId(p === "btns" ? "menu-buttons" : "menu-brand"); return !!(e && e.style && parseFloat(e.style.getPropertyValue("--tf")) < 1); };
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
    const name = mk("b", "tl-piece");
    name.setAttribute("aria-live", "polite");
    const sizeDn = btn("tl-size-dn", "SIZE −", "Smaller", () => nudge("size", -STEP.size));
    const sizeUp = btn("tl-size-up", "SIZE +", "Bigger", () => nudge("size", STEP.size));
    const wDn = btn("tl-width-dn", "WIDTH −", "Narrower buttons", () => nudge("width", -STEP.width));
    const wUp = btn("tl-width-up", "WIDTH +", "Wider buttons", () => nudge("width", STEP.width));
    const rst = btn("tl-reset-piece", "RESET PIECE", "Put this piece back where it ships", resetPiece);
    const handle = mk("div", "tl-handle");
    handle.setAttribute("aria-hidden", "true");
    handle.hidden = true;
    const art = mk("div", "tl-art");
    art.setAttribute("aria-hidden", "true");
    art.hidden = true;
    for (const c of [name, sizeDn, sizeUp, wDn, wUp, rst]) layer.insertBefore(c, done);
    layer.appendChild(handle);
    overlay.appendChild(art);
    done.addEventListener("click", exit);
    ed.els = { layer, done, overlay, name, wDn, wUp, handle, art };
    for (const p of Object.keys(PIECES)) {
      const e = pieceEl(p);
      if (e) e.addEventListener("pointerdown", (ev) => down(ev, p, "move"));
    }
    handle.addEventListener("pointerdown", (ev) => down(ev, ed.sel, "size"));
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up);
    doc.addEventListener("pointercancel", up);
    overlay.addEventListener("click", (ev) => {
      if (!ed.on) return;
      ev.preventDefault(); ev.stopPropagation();
    }, true);
    doc.addEventListener("keydown", onKey, true);
    onShape.push(() => { if (ed.on) paintEd(); });
    return ed.els;
  }

  function enter() {
    const E = buildEditor();
    if (!E || E.overlay.hidden || ed.on) return false;
    Log.info("ui", "TitleLayout.edit " + shape());
    ed.on = true;
    peek(false);
    page(false);
    root.setAttribute("data-tl-edit", "");
    E.layer.hidden = false;
    E.art.hidden = false;
    select(ed.sel);
    return true;
  }
  function exit() {
    if (!ed.on) return;
    const E = ed.els;
    finish();
    ed.on = false;
    root.removeAttribute("data-tl-edit");
    E.layer.hidden = true;
    E.art.hidden = true;
    E.handle.hidden = true;
    for (const p of Object.keys(PIECES)) { const e = pieceEl(p); if (e) e.removeAttribute("data-tl-sel"); }
    page(true);
    if (ui) {
      const outer = byId("pm-titlescreen");
      if (outer) outer.open = true;
      ui.fold.open = true;
      ui.paintAll();
      const f = () => ui.edit.focus();
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
  function nudge(k, d) {
    if (!ed.on) return;
    const l = current(), p = l[ed.sel];
    if (k === "width") {
      if (ed.sel !== "btns") return;
      const r = pieceEl("btns").getBoundingClientRect();
      const w = (p.width || (phoneWide() ? 20 : Math.round(r.width / (win().innerWidth || 1) * 100))) + d;
      p.width = w < 20 ? 0 : num(w, "width");
    } else p[k] = num(p[k] + d, k);
    hold(set(l), ed.sel, k);
    paintEd();
  }
  function resetPiece() {
    if (!ed.on) return;
    const l = current();
    l[ed.sel] = Object.assign({}, shipped(shape())[ed.sel]);
    set(l);
    paintEd();
  }

  function paintEd() {
    const E = ed.els;
    if (!E || !ed.on) return;
    const p = current()[ed.sel];
    E.name.textContent = PIECES[ed.sel] + " · " + SHAPE_NAMES[shape()] + " · " + Math.max(p.size, sizeMin(ed.sel)) + "%" + (fitted(ed.sel) ? " (SCREEN FULL)" : "") +
      (ed.sel === "btns" ? " · " + (p.width ? p.width + "% WIDE" : "AUTO WIDTH") : "");
    E.wDn.disabled = E.wUp.disabled = ed.sel !== "btns";
    const car = byId("title-car"), r = car ? car.getBoundingClientRect() : null;
    if (r && r.width >= 1 && r.height >= 1) {
      const o = E.overlay.getBoundingClientRect();
      E.art.style.setProperty("left", (r.left - o.left + (E.overlay.scrollLeft || 0)) + "px");
      E.art.style.setProperty("top", (r.top - o.top + (E.overlay.scrollTop || 0)) + "px");
      E.art.style.setProperty("width", r.width + "px");
      E.art.style.setProperty("height", r.height + "px");
      E.art.hidden = false;
    } else E.art.hidden = true;
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
    if (part !== ed.sel) select(part);
    const t = e.currentTarget || e.target;
    try { if (t && t.setPointerCapture) t.setPointerCapture(e.pointerId); } catch (_) {  }
    const from = Object.assign({}, current()[part]);
    let c = [e.clientX, e.clientY];
    if (mode === "size") {
      const r = pieceEl(part).getBoundingClientRect();
      c = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    }
    ed.drag = { id: e.pointerId, part, mode, x0: e.clientX, y0: e.clientY, from, c };
  }
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
    const l = current(), p = l[d.part], w = win();
    if (d.mode === "move") {
      const f = d.zoom || (d.zoom = zoomOf(d.part, d.from.size));
      p.x = num(d.from.x + (e.clientX - d.x0) / (w.innerWidth || 1) * 100 / f, "x");
      p.y = num(d.from.y + (e.clientY - d.y0) / (w.innerHeight || 1) * 100 / f, "y");
    } else {
      const r0 = Math.hypot(d.x0 - d.c[0], d.y0 - d.c[1]) || 1;
      p.size = num(d.from.size * Math.hypot(e.clientX - d.c[0], e.clientY - d.c[1]) / r0, "size");
    }
    const h = set(l, undefined, true);
    if (d.mode === "move") hold(hold(h, d.part, "x", true), d.part, "y", true); else hold(h, d.part, "size", true);
    paintEd();
  }
  function finish() {
    if (ed.drag) step();
    ed.drag = null;
    commit();
  }
  function up(e) { if (ed.drag && e.pointerId === ed.drag.id) finish(); }

  function onKey(e) {
    if (!ed.on || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") nudge("x", k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp" || k === "ArrowDown") nudge("y", k === "ArrowUp" ? -1 : 1);
    else if (k === "+" || k === "=") nudge("size", STEP.size);
    else if (k === "-" || k === "_") nudge("size", -STEP.size);
    else if (k === "]" || k === "[") cycle(k === "[" ? -1 : 1);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(build) : build()), { once: true });
    else build();
  }

  return Object.freeze({ KEY, DEFAULT, LIM, LAYOUTS, SIDES, SHAPES, normalize, isDefault, vars, shape, all, current, apply,
    fit, set, commit, reset, resetShape, copyTo, build, enter, exit, screenShipped, get editing() { return ed.on; } });
})();
