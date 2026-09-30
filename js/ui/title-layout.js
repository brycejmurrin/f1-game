/* Apex 26 — TitleLayout: where the title screen's three pieces sit and how big
   they are, as a player setting under SETTINGS › APPEARANCE › TITLE LAYOUT.

   The three pieces are the BUTTONS (#menu-buttons), the TITLE (#menu-brand:
   wordmark, sound toggle, small print) and the CAR DRAWING (#title-car). Each
   moves on X and Y (percent of the screen) and scales (SIZE). The buttons also
   take a WIDTH (a share of the screen, or AUTO for the shipped width), a
   LAYOUT (GRID is the shipped 2x2 of play modes; STACK is one door per line;
   ROW puts the play modes side by side) and a SIDE (SWAPPED trades the title's
   and the buttons' columns, or their order on a tall screen).

   ONE stored object, apex26.titleLayout. Untouched it is null and NOTHING is
   written to the page — the shipped title screen stays byte-for-byte what it
   was, and no rule in css/responsive.css's TITLE LAYOUT block matches. Custom,
   it lands as --tl-* tokens on :root plus html[data-title-layout] (and
   data-title-side / data-title-btns for the two choices), so CSS keys off
   attributes and reads numbers from tokens. index.html's inline boot applies
   the FIRST answer with the same arithmetic (tests/unit/title-layout.test.mjs
   holds the two copies equal); this file owns every later one.

   PEEK: the title screen is faded out under the settings dialog, so a slider
   would move things nobody can see. While a layout slider is held (or just
   moved), body.tl-peek shows the title screen through a near-transparent
   settings page.

   Needs GameStore at eval (HARD_EDGES). SettingRow is read when the page is
   built, not at eval. */
const TitleLayout = (function () {
  "use strict";

  const KEY = "titleLayout";   // apex26.titleLayout — json object | null
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
  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;

  const num = (v, k) => {
    const [lo, hi] = LIM[k];
    const n = typeof v === "number" && isFinite(v) ? Math.round(v) : DEFAULT.btns[k];   // btns carries every key
    // WIDTH: 0 is AUTO; anything else is at least 20 % of the screen.
    if (k === "width") return n <= 0 ? 0 : Math.max(20, Math.min(hi, n));
    return Math.max(lo, Math.min(hi, n));
  };
  /** Any stored value -> a complete, clamped layout. Junk reads as shipped. */
  function normalize(v) {
    const o = v && typeof v === "object" ? v : {};
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
  function current() { return normalize(store.get(KEY, null)); }
  function apply(v) {
    if (!root) return;
    const l = normalize(v);
    for (const k of ALL_VARS) root.style.removeProperty(k);
    delete root.dataset.titleLayout; delete root.dataset.titleSide; delete root.dataset.titleBtns; delete root.dataset.titleBtnw;
    if (isDefault(l)) return;
    const t = vars(l);
    for (const k in t) root.style.setProperty(k, t[k]);
    root.dataset.titleLayout = "on";
    if (l.side === "swap") root.dataset.titleSide = "swap";
    if (l.layout !== "grid") root.dataset.titleBtns = l.layout;
    if (l.btns.width) root.dataset.titleBtnw = "on";
  }
  function set(v) {
    const l = normalize(v);
    store.set(KEY, isDefault(l) ? null : l);
    apply(l);
    return l;
  }
  function reset() { return set(null); }

  apply(current());   // at eval: index.html painted the first answer; this owns the rest

  // ---- the APPEARANCE fold -------------------------------------------------
  let peekT = 0;
  function peek(on, holdMs) {
    if (typeof document === "undefined" || !document.body) return;
    clearTimeout(peekT);
    if (on) document.body.classList.add("tl-peek");
    if (!on || holdMs) peekT = setTimeout(() => document.body.classList.remove("tl-peek"), on ? holdMs : 0);
  }

  const pctTxt = (k, n) => {
    if (k === "size") return n + "%";
    if (k === "width") return n ? n + "% of screen" : "AUTO";
    if (!n) return "CENTRE";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { size: "SIZE", width: "WIDTH", x: "LEFT / RIGHT", y: "UP / DOWN" };

  function build() {
    const panel = document.getElementById("pm-panel-appearance");
    if (!panel || document.getElementById("pm-titlelayout")) return;
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
    const paintSum = () => { sum.textContent = "TITLE LAYOUT · " + (isDefault(current()) ? "SHIPPED" : "CUSTOM"); };

    body.appendChild(el("p", { className: "adv-help", textContent:
      "Move and size the title screen's buttons, title and car drawing. Hold a slider to see the title screen through this page." }));

    const sliders = [];
    function slider(part, k) {
      const id = `pm-tl-${part}-${k}`;
      const out = el("b", { id: id + "-v" });
      const inp = el("input", { id, type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: "1",
        attrs: { "aria-label": `${part === "btns" ? "Buttons" : part === "title" ? "Title" : "Car drawing"} ${NAMES[k].toLowerCase()}` } });
      const paint = () => {
        const n = current()[part][k];
        if (d.activeElement !== inp) inp.value = String(n);
        out.textContent = pctTxt(k, n);
      };
      inp.addEventListener("input", () => {
        const l = current();
        l[part][k] = num(parseFloat(inp.value), k);
        set(l); out.textContent = pctTxt(k, l[part][k]); paintSum();
        peek(true, 900);
      });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      sliders.push(paint);
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
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

    const rst = el("button", { id: "pm-tl-reset", type: "button", textContent: "RESET LAYOUT" });
    rst.addEventListener("click", () => {
      reset(); paintAll(); peek(true, 1200);
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    });
    body.appendChild(rst);

    function paintAll() {
      for (const p of sliders) p();
      for (const [row, key] of rows) SettingRow.paint(row, current()[key]);
      paintSum();
    }
    paintAll();

    // After TITLE ART's help line, before REPLAY INTRO: the other title-screen knobs.
    const anchor = document.getElementById("pm-replay-intro");
    if (anchor && anchor.parentNode === panel) panel.insertBefore(fold, anchor);
    else panel.appendChild(fold);
  }

  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", build, { once: true });
    else build();
  }

  return Object.freeze({ KEY, DEFAULT, LIM, LAYOUTS, SIDES, normalize, isDefault, vars, current, apply, set, reset, build });
})();
