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
   {v: 2, cockpit: {id: {x, y, s}}, other: {…}} — a missing element is the
   SHIPPED layout for that set (SHIPPED below), which for the cockpit is not
   zero: OVERTAKE / AERO / ENERGY / TYRES move off the wheel to either side of
   it, so a cockpit player can read why OVERTAKE is unavailable without a
   setting. RESET returns to that shipped layout, not to zero. v1 stored the
   same shape with "missing = zero"; it reads as v2 unchanged — the only v1
   cockpit element that could matter was TYRES (css/track-detail.css hid the
   other three in the cockpit), and a v1 TYRES move is kept verbatim.
   js/ui/hud.js reports the camera (setCam); the settings fold edits either
   layout and previews the one it is editing.

   PRESETS are pure data (PRESETS): a partial {id: {x?, y?, s?}} laid over the
   edited set's shipped layout, so CLEAN in the cockpit keeps the chips beside
   the wheel. Applying one writes the set and can still be tweaked; a set that
   matches no preset reads CUSTOM (presetOf).

   PEEK: the race HUD is hidden under the settings page, so a slider would
   move things nobody can see. While a slider is held (or just moved),
   js/ui/screen-looks.js's html[data-appearance-peek="hud"] ghosts the page
   and shows the HUD with the selected element outlined. Only in a race.

   Needs GameStore at eval (HARD_EDGES). ScreenLooks is read at call time. */
const HudLayout = (function () {
  "use strict";

  const KEY = "hudLayout";   // apex26.hudLayout — {v: 2, cockpit, other} | null
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
  const fz = (o) => { for (const k in o) Object.freeze(o[k]); return Object.freeze(o); };
  // SHIPPED per set — what RESET returns to. The wheel covers roughly the middle
  // 40% of the width (30..70vw) and the bottom 45% at 16:9, so the strip moves
  // 30vw out from the centre line: centred at 20vw / 80vw, a 130px bar spans
  // 104..234px at 844 wide (wheel from 253) and 319..449px at 1920 (wheel from
  // 576). ENERGY/TYRES (seconds and laps) go left; OVERTAKE/AERO — the readouts
  // for the right-hand buttons — go right, raised more because they are the
  // bottom of the stack: level with the left pair at phone landscape, and clear
  // of the pedal/shift row the touch docks keep in both bottom corners.
  const SHIPPED = Object.freeze({
    cockpit: fz({
      energy: { x: -30, y: -4, s: 100 },
      tyre: { x: -30, y: -4, s: 100 },
      ot: { x: 30, y: -14, s: 100 },
      aero: { x: 30, y: -14, s: 100 },
    }),
    other: fz({}),
  });
  // PRESETS: [id, label, partial offsets laid over the set's shipped layout].
  const PRESETS = Object.freeze([
    ["shipped", "SHIPPED", {}],
    ["clean", "CLEAN", { tower: { s: 85 }, map: { s: 85 }, gaps: { s: 90 }, sectors: { s: 90 },
      limits: { s: 90 }, ot: { s: 90 }, aero: { s: 90 } }],
    ["big", "BIG", { tower: { s: 125 }, map: { s: 125 }, gearbox: { s: 125 } }],
    ["corners", "CORNERS", { gearbox: { x: 34, y: 0 }, energy: { x: -34, y: 0 }, tyre: { x: -34, y: 0 } }],
  ].map((p) => Object.freeze([p[0], p[1], fz(p[2])])));

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
  const sameEl = (a, b) => a.x === b.x && a.y === b.y && a.s === b.s;
  /** The shipped {x, y, s} of element `id` in layout `sn`. */
  const shippedEl = (id, sn) => normEl(SHIPPED[sn] && SHIPPED[sn][id]);
  /** One stored layout: only the elements that differ from that set's shipped layout. */
  function normSet(v, sn) {
    const out = {};
    if (!v || typeof v !== "object") return out;
    for (const id of IDS) {
      if (!(id in v)) continue;
      const e = normEl(v[id]);
      if (!sameEl(e, shippedEl(id, sn))) out[id] = e;
    }
    return out;
  }
  /** The STORED differences per set (v1 and v2 read the same — see the header). */
  function stored() {
    const raw = store ? store.get(KEY, null) : null;
    const r = raw && typeof raw === "object" ? raw : {};
    return { cockpit: normSet(r.cockpit, "cockpit"), other: normSet(r.other, "other") };
  }
  /** The layout a set paints: stored, else shipped, for every element. Pure. */
  function effective(st, sn) {
    const out = {};
    for (const id of IDS) out[id] = st[sn][id] ? normEl(st[sn][id]) : shippedEl(id, sn);
    return out;
  }
  function all() { const st = stored(); return { cockpit: effective(st, "cockpit"), other: effective(st, "other") }; }
  function save(a) {
    if (!store) return;
    const c = normSet(a.cockpit, "cockpit"), o = normSet(a.other, "other");
    const any = Object.keys(c).length || Object.keys(o).length;
    store.set(KEY, any ? { v: 2, cockpit: c, other: o } : null);
  }
  const isSet = (s) => SETS.indexOf(s) >= 0;
  const camSet = (modeId) => (COCKPIT_CAMS[modeId] ? "cockpit" : "other");
  /** The layout the screen shows now: the one being edited, else the camera's. */
  const shown = () => (preview && isSet(preview) ? preview : cam);

  /** {x, y, s} for element `id` in layout `set` (default: the one on screen). */
  function get(id, set) {
    return normEl(all()[isSet(set) ? set : shown()][id]);
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
      if (e && !isDefEl(e)) {
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
    fit();
  }

  /* KEEP MOVED PIECES ON SCREEN. An offset chosen on one screen (or at one HUD
     SIZE) can push a piece past the edge of another. After every apply, and
     after js/ui/hud.js's fitHud re-lays the bands out, measure each moved
     element and pull its PAINTED --hl-x/--hl-y back inside the viewport (less
     EDGE px). The stored offsets are untouched, so the layout comes back in
     full on a screen that has room. translate runs in vw/vh divided by the
     band's zoom, so a screen-px correction is exactly px / innerWidth * 100. */
  const EDGE = 4;
  function clampAxis(lo, hi, size) {
    if (hi - lo > size - 2 * EDGE) return EDGE - lo;     // bigger than the screen: pin its start
    if (lo < EDGE) return EDGE - lo;
    if (hi > size - EDGE) return size - EDGE - hi;
    return 0;
  }
  function fit() {
    if (!doc || typeof window === "undefined" || !window.innerWidth) return;
    const W = window.innerWidth, H = window.innerHeight;
    const a = all()[shown()];
    for (const [id, , sel] of ELEMENTS) {
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.getBoundingClientRect || !el.hasAttribute("data-hl")) continue;
      el.style.setProperty("--hl-x", String(e.x));
      el.style.setProperty("--hl-y", String(e.y));
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;                // hidden right now: nothing to keep on screen
      const dx = clampAxis(r.left, r.right, W), dy = clampAxis(r.top, r.bottom, H);
      if (dx) el.style.setProperty("--hl-x", String(+(e.x + dx / W * 100).toFixed(2)));
      if (dy) el.style.setProperty("--hl-y", String(+(e.y + dy / H * 100).toFixed(2)));
    }
  }

  /** Write one element's values into layout `set`; returns the stored {x, y, s}. */
  function set(id, v, setName) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = isSet(setName) ? setName : shown();
    const a = stored();
    const e = normEl(Object.assign(effective(a, sn)[id], v || {}));
    a[sn][id] = e;   // save() drops it again when it equals the shipped layout
    save(a);
    apply();
    return e;
  }
  function resetEl(id, setName) {
    return IDS.indexOf(id) < 0 ? null : set(id, shippedEl(id, isSet(setName) ? setName : shown()), setName);
  }
  function resetSet(setName) {
    const a = stored();
    a[isSet(setName) ? setName : shown()] = {};
    save(a); apply();
  }

  /** Preset `pid` laid over layout `sn`'s shipped layout — the full layout. Pure. */
  function presetLayout(pid, sn) {
    const p = PRESETS.find((q) => q[0] === pid);
    if (!p || !isSet(sn)) return null;
    const out = {};
    for (const id of IDS) out[id] = normEl(Object.assign(shippedEl(id, sn), p[2][id] || {}));
    return out;
  }
  /** Write preset `pid` into layout `sn` (default: the one on screen). */
  function applyPreset(pid, setName) {
    const sn = isSet(setName) ? setName : shown();
    const lay = presetLayout(pid, sn);
    if (!lay) return false;
    const a = stored();
    a[sn] = lay;
    save(a); apply();
    return true;
  }
  /** The preset id layout `sn` matches now, or "custom". */
  function presetOf(setName) {
    const sn = isSet(setName) ? setName : shown();
    const cur = all()[sn];
    for (const [pid] of PRESETS) {
      const lay = presetLayout(pid, sn);
      if (IDS.every((id) => sameEl(lay[id], cur[id]))) return pid;
    }
    return "custom";
  }
  function isShipped(setName) {
    const a = stored();
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
      "because the steering wheel covers the bottom of the screen; their shipped layout puts OVERTAKE, AERO, ENERGY and TYRES " +
      "beside the wheel. A PRESET is a starting point you can still tweak. In a race, hold a slider to see the HUD through this page." }));

    let editing = cam, sel = IDS[0];
    // The settings page's own stepper (‹ select ›, .set-row). Like every shell
    // stepper the arrows are pointer-only (tabindex -1, aria-hidden): the
    // <select> owns the keys, so MenuNav walks one control per row.
    function stepper(id, label, options, onPick) {
      const lab = el("span", { className: "tune-label", textContent: label });
      lab.id = id + "-label";
      const pickEl = el("select", { attrs: { "aria-labelledby": lab.id } });
      pickEl.id = id + "-sel";
      for (const [v, t, off] of options) pickEl.appendChild(el("option", { value: v, textContent: t, disabled: !!off }));
      const go = (d) => {   // skips a disabled entry (PRESET's CUSTOM is a readout, not a choice)
        let i = pickEl.selectedIndex;
        for (let n = 0; n < options.length; n++) {
          i = (i + d + options.length) % options.length;
          if (!options[i][2]) break;
        }
        pickEl.selectedIndex = i; onPick(pickEl.value);
      };
      const prev = el("button", { type: "button", textContent: "\u2039", attrs: { "aria-label": "Previous " + label.toLowerCase(), "aria-hidden": "true", tabindex: "-1" } });
      const next = el("button", { type: "button", textContent: "\u203A", attrs: { "aria-label": "Next " + label.toLowerCase(), "aria-hidden": "true", tabindex: "-1" } });
      prev.addEventListener("click", () => go(-1));
      next.addEventListener("click", () => go(1));
      pickEl.addEventListener("change", () => onPick(pickEl.value));
      const row = el("div", { className: "set-row", attrs: { role: "group", "aria-labelledby": lab.id } },
        [lab, el("div", null, [prev, pickEl, next])]);
      row.id = id;
      body.appendChild(row);
      return pickEl;
    }
    const setPick = stepper("pm-hl-set", "LAYOUT FOR", [["cockpit", "COCKPIT CAMS"], ["other", "OTHER CAMS"]], (v) => {
      editing = v; if (fold.open) preview = v; apply(); paintAll(); peek(true, 900);
    });
    const presetPick = stepper("pm-hl-preset", "PRESET",
      PRESETS.map((p) => [p[0], p[1]]).concat([["custom", "CUSTOM", true]]), (v) => {
        applyPreset(v, editing); paintAll(); peek(true, 900);
      });
    const pick = stepper("pm-hl-el", "ELEMENT", ELEMENTS.map((e) => [e[0], e[1]]), (v) => {
      sel = v; selected = sel; apply(); paintAll(); peek(true, 900);
    });

    const painters = [];
    for (const k of ["x", "y", "s"]) {
      const out = el("b");
      const inp = el("input", { type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: k === "s" ? "5" : "1",
        attrs: { "aria-label": NAMES[k].toLowerCase() } });
      inp.id = "pm-hl-" + k;
      inp.addEventListener("input", () => {
        const e = set(sel, { [k]: parseFloat(inp.value) }, editing);
        out.textContent = txt(k, e[k]); paintSum(); paintPreset();
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

    function paintPreset() { const p = presetOf(editing); if (presetPick.value !== p) presetPick.value = p; }
    function paintAll() {
      if (setPick.value !== editing) setPick.value = editing;
      if (pick.value !== sel) pick.value = sel;
      for (const p of painters) p();
      paintSum(); paintPreset();
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
    KEY, ELEMENTS, SETS, LIM, COCKPIT_CAMS, SHIPPED, PRESETS,
    get, set, resetEl, resetSet, isShipped, scaleOf, setCam, apply, fit, build,
    camSet, shown: () => shown(), all, presetLayout, applyPreset, presetOf,
  };
})();
Object.freeze(HudLayout);
