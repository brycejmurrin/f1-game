/* Apex 26 — HudLayout: move and size each race HUD element, as a player
   setting under SETTINGS › DISPLAY › HUD › MOVE & SIZE.

   Every element keeps its shipped anchor (and fitHud's collision handling);
   the player's choice is an OFFSET on top of it — X and Y as a share of the
   screen, SIZE as a percentage — painted through the independent `translate`
   and `scale` properties, so it composes with the `transform: translateX(-50%)`
   the centred pieces already carry. The numbers land as --hl-x / --hl-y /
   --hl-s on the element itself plus data-hl, and ONE rule in css/hud.css
   reads them; an untouched element carries nothing and lays out exactly as
   it shipped. Offsets divide by the element's own --hud-z (its band zoom), so
   a 10% move is 10% of the screen at every HUD SIZE.

   TWO LAYOUTS: the cockpit cameras (COCKPIT, VISOR) put the steering wheel
   across the bottom of the screen, so a layout tuned for the chase camera
   would sit on it. One stored object, apex26.hudLayout:
   {v: 1, cockpit: {id: {x, y, s}}, other: {…}} — a missing element is shipped.
   js/ui/hud.js reports the camera (setCam); the settings fold edits either
   layout and previews the one it is editing.

   PEEK: the race HUD is hidden under the settings page, so a slider would
   move things nobody can see. While a slider is held (or just moved),
   js/ui/screen-looks.js's html[data-appearance-peek="hud"] ghosts the page
   and shows the HUD with the selected element outlined. Only in a race.

   Needs GameStore at eval (HARD_EDGES). ScreenLooks is read at call time. */
const HudLayout = (function () {
  "use strict";

  const KEY = "hudLayout";   // apex26.hudLayout — {v: 1, cockpit, other} | null
  // [id, label, selector, transform-origin]. The origin keeps a corner piece
  // growing away from its corner. The four centred by `left: 50%;
  // transform: translateX(-50%)` scale about their UNtransformed left edge,
  // which is the screen's centre line, so they stay centred as they grow.
  const ELEMENTS = Object.freeze([
    ["tower", "TIMING TOWER", ".hud-top", "top left"],
    ["map", "TRACK MAP", "#minimap", "top left"],
    ["gaps", "GAPS", ".hud-gaps", "top left"],
    ["sectors", "SECTORS", "#hud-sectors", "top right"],
    ["limits", "TRACK LIMITS", "#hud-limits", "top right"],
    ["flag", "FLAGS", "#hud-flag", "top left"],
    ["mirror", "MIRROR", "#hud-mirror", "top left"],
    ["announce", "RACE MESSAGES", "#announce", "top left"],
    ["gearbox", "SPEED & GEAR", "#hud-gearbox", "bottom center"],
    ["energy", "ENERGY", "#hud-energy", "bottom center"],
    ["tyre", "TYRES", "#hud-tyre", "bottom center"],
    ["ot", "OVERTAKE", "#hud-ot", "bottom center"],
    ["aero", "AERO", "#hud-aero", "bottom center"],
  ].map(Object.freeze));
  const IDS = ELEMENTS.map((e) => e[0]);
  const SETS = Object.freeze(["cockpit", "other"]);
  const COCKPIT_CAMS = Object.freeze({ cockpit: 1, visor: 1 });
  const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], s: [50, 200] });
  const DEF = Object.freeze({ x: 0, y: 0, s: 100 });

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  const doc = typeof document !== "undefined" ? document : null;
  let cam = "other";         // which layout the race is using (setCam)
  let preview = null;        // the layout the settings fold is editing, while it is open
  let selected = null;       // the element the fold has selected (outlined while peeking)

  function num(v, k) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return DEF[k];
    return Math.max(LIM[k][0], Math.min(LIM[k][1], n));
  }
  /** One element's {x, y, s}, clamped; anything unreadable is shipped. */
  function normEl(v) {
    const o = v && typeof v === "object" ? v : {};
    return { x: num(o.x == null ? 0 : o.x, "x"), y: num(o.y == null ? 0 : o.y, "y"), s: num(o.s == null ? 100 : o.s, "s") };
  }
  const isDefEl = (e) => e.x === 0 && e.y === 0 && e.s === 100;
  /** One layout: only the elements that moved, keyed by id. */
  function normSet(v) {
    const out = {};
    if (!v || typeof v !== "object") return out;
    for (const id of IDS) {
      if (!(id in v)) continue;
      const e = normEl(v[id]);
      if (!isDefEl(e)) out[id] = e;
    }
    return out;
  }
  function all() {
    const raw = store ? store.get(KEY, null) : null;
    const r = raw && typeof raw === "object" ? raw : {};
    return { cockpit: normSet(r.cockpit), other: normSet(r.other) };
  }
  function save(a) {
    if (!store) return;
    const c = normSet(a.cockpit), o = normSet(a.other);
    const any = Object.keys(c).length || Object.keys(o).length;
    store.set(KEY, any ? { v: 1, cockpit: c, other: o } : null);
  }
  const isSet = (s) => SETS.indexOf(s) >= 0;
  const camSet = (modeId) => (COCKPIT_CAMS[modeId] ? "cockpit" : "other");
  /** The layout the screen shows now: the one being edited, else the camera's. */
  const shown = () => (preview && isSet(preview) ? preview : cam);

  /** {x, y, s} for element `id` in layout `set` (default: the one on screen). */
  function get(id, set) {
    const a = all()[isSet(set) ? set : shown()];
    return normEl(a[id]);
  }
  /** SIZE as a factor (1 = shipped) — js/ui/hud.js sharpens the map canvas by it. */
  function scaleOf(id) { return get(id).s / 100; }

  function apply() {
    if (!doc) return;
    const a = all()[shown()];
    for (const [id, , sel, origin] of ELEMENTS) {
      const el = doc.querySelector(sel);
      if (!el || !el.style) continue;
      const e = a[id];
      if (e) {
        el.style.setProperty("--hl-x", String(e.x));
        el.style.setProperty("--hl-y", String(e.y));
        el.style.setProperty("--hl-s", String(e.s / 100));
        el.style.setProperty("--hl-o", origin);
        el.setAttribute("data-hl", "");
      } else if (el.hasAttribute("data-hl")) {
        el.removeAttribute("data-hl");
        for (const p of ["--hl-x", "--hl-y", "--hl-s", "--hl-o"]) el.style.removeProperty(p);
      }
      if (selected === id && preview) el.setAttribute("data-hl-sel", "");
      else if (el.hasAttribute("data-hl-sel")) el.removeAttribute("data-hl-sel");
    }
  }

  /** Write one element's values into layout `set`; returns the stored {x, y, s}. */
  function set(id, v, setName) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = isSet(setName) ? setName : shown();
    const a = all();
    const e = normEl(Object.assign(normEl(a[sn][id]), v || {}));
    if (isDefEl(e)) delete a[sn][id]; else a[sn][id] = e;
    save(a);
    apply();
    return e;
  }
  function resetEl(id, setName) { return set(id, DEF, setName); }
  function resetSet(setName) {
    const a = all();
    a[isSet(setName) ? setName : shown()] = {};
    save(a); apply();
  }
  function isShipped(setName) {
    const a = all();
    if (isSet(setName)) return !Object.keys(a[setName]).length;
    return !Object.keys(a.cockpit).length && !Object.keys(a.other).length;
  }

  /** js/ui/hud.js: the race camera changed (CamModes id). */
  function setCam(modeId) {
    const s = camSet(modeId);
    if (s === cam) return;
    cam = s;
    apply();
  }

  // ---- the DISPLAY › HUD fold ------------------------------------------------
  function peek(on, holdMs) {
    if (typeof ScreenLooks === "undefined") return;
    if (on) ScreenLooks.peek("hud", holdMs || 0);
    else ScreenLooks.endPeek();
  }
  const txt = (k, n) => {
    if (k === "s") return n + "%";
    if (!n) return "SHIPPED";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { x: "LEFT / RIGHT", y: "UP / DOWN", s: "SIZE" };

  function build() {
    if (!doc) return;
    const host = doc.getElementById("pm-hud-details");
    if (!host || doc.getElementById("pm-hudlayout")) return;
    const el = (tag, props, kids) => {
      const e = doc.createElement(tag);
      for (const k in props || {}) {
        if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
      }
      for (const c of kids || []) e.appendChild(c);
      return e;
    };
    const sum = el("summary", { id: "pm-hudlayout-sum", className: "adv-more-btn" });
    const body = el("div", { id: "pm-hudlayout-body", attrs: { role: "group", "aria-label": "HUD element position and size" } });
    const fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
    fold.id = "pm-hudlayout";   // a plain assignment, so tools/check/shell-ids.mjs sees the mount-once guard's target
    const paintSum = () => { sum.textContent = "MOVE & SIZE · " + (isShipped() ? "SHIPPED" : "CUSTOM"); };

    body.appendChild(el("p", { className: "adv-help", textContent:
      "Move and resize each race HUD element. The cockpit cameras (COCKPIT, VISOR) keep their own layout, " +
      "because the steering wheel covers the bottom of the screen. In a race, hold a slider to see the HUD through this page." }));

    let editing = cam, sel = IDS[0];
    const setBtns = {};
    const setRow = el("div", { className: "opt-row", attrs: { role: "group", "aria-label": "Layout to edit" } });
    for (const [s, label] of [["cockpit", "COCKPIT CAMS"], ["other", "OTHER CAMS"]]) {
      const b = el("button", { type: "button", className: "opt-btn", textContent: label, attrs: { "aria-pressed": "false" } });
      b.id = "pm-hl-set-" + s;
      b.addEventListener("click", () => { editing = s; if (fold.open) preview = s; apply(); paintAll(); });
      setBtns[s] = b;
      setRow.appendChild(b);
    }
    body.appendChild(el("label", { className: "tune-row" }, [el("span", { className: "tune-label", textContent: "LAYOUT FOR" })]));
    body.appendChild(setRow);

    const pick = el("select", { attrs: { "aria-label": "HUD element" } });
    pick.id = "pm-hl-el";
    for (const [id, label] of ELEMENTS) pick.appendChild(el("option", { value: id, textContent: label }));
    pick.addEventListener("change", () => { sel = pick.value; selected = sel; apply(); paintAll(); peek(true, 900); });
    body.appendChild(el("label", { className: "tune-row" }, [el("span", { className: "tune-label", textContent: "ELEMENT" }), pick]));

    const painters = [];
    for (const k of ["x", "y", "s"]) {
      const out = el("b");
      const inp = el("input", { type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: k === "s" ? "5" : "1",
        attrs: { "aria-label": NAMES[k].toLowerCase() } });
      inp.id = "pm-hl-" + k;
      inp.addEventListener("input", () => {
        const e = set(sel, { [k]: parseFloat(inp.value) }, editing);
        out.textContent = txt(k, e[k]); paintSum();
        peek(true, 900);
      });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      painters.push(() => {
        const n = get(sel, editing)[k];
        if (doc.activeElement !== inp) inp.value = String(n);
        out.textContent = txt(k, n);
      });
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }

    const resetOne = el("button", { type: "button", className: "opt-btn", textContent: "RESET ELEMENT" });
    resetOne.id = "pm-hl-reset-el";
    resetOne.addEventListener("click", () => { resetEl(sel, editing); paintAll(); peek(true, 900); });
    const resetAll = el("button", { type: "button", className: "opt-btn", textContent: "RESET LAYOUT" });
    resetAll.id = "pm-hl-reset-set";
    resetAll.addEventListener("click", () => { resetSet(editing); paintAll(); peek(true, 900); });
    body.appendChild(el("div", { className: "opt-row" }, [resetOne, resetAll]));

    function paintAll() {
      for (const s of SETS) setBtns[s].setAttribute("aria-pressed", s === editing ? "true" : "false");
      if (pick.value !== sel) pick.value = sel;
      for (const p of painters) p();
      paintSum();
    }
    // Open: preview the layout being edited and outline the selected element.
    // Closed: the race shows the camera's layout again.
    fold.addEventListener("toggle", () => {
      if (fold.open) { editing = cam; preview = editing; selected = sel; }
      else { preview = null; selected = null; }
      apply(); paintAll();
    });
    host.appendChild(fold);
    paintAll();
  }

  function init() { apply(); build(); }
  apply();
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return {
    KEY, ELEMENTS, SETS, LIM, COCKPIT_CAMS,
    get, set, resetEl, resetSet, isShipped, scaleOf, setCam, apply, build,
    camSet, shown: () => shown(), all,
  };
})();
Object.freeze(HudLayout);
