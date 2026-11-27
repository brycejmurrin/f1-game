/* Race HUD storage contract: docs/notes/SCREEN-LOOKS-STORAGE.md. */
const HudLayout = (function () {
  "use strict";

  const KEY = "hudLayout";   // apex26.hudLayout — {v: 4, standard?, minimal?, broadcast?} | null
  // [id, label, selector, transform-origin]. The origin keeps a corner piece
  // growing away from its corner. The four centred by `left: 50%;
  // transform: translateX(-50%)` scale about their UNtransformed left edge,
  // which is the screen's centre line, so they stay centred as they grow.
  const WIDGETS = Object.freeze([   // flags: card, clearCtrl, clearReadout (placement rank), seed, toggle (body[data-hud-hide] token)
    ["tower", "TIMING TOWER", ".hud-top", "top left", {}],
    ["map", "TRACK MAP", "#minimap", "top left", { clearReadout: 1 }],
    ["gaps", "GAPS", ".hud-gaps", "top left", { card: 1 }],
    ["sectors", "SECTORS", "#hud-sectors", "top right", { card: 1, clearCtrl: 1, toggle: "sectors" }],
    ["limits", "TRACK LIMITS", "#hud-limits", "top right", { card: 1, clearReadout: 5, seed: 1, toggle: "limits" }],   // "top left" when js/ui/hud.js crosses it to the left column (originOf)
    ["flag", "FLAGS", "#hud-flag", "top left", { card: 1 }],
    ["mirror", "MIRROR", "#hud-mirror", "top left", {}],
    ["announce", "RACE MESSAGES", "#announce", "top left", { clearReadout: 6, seed: 1 }],
    ["gearbox", "GEAR", "#hud-gearbox", "bottom center", { clearReadout: 3, seed: 1, toggle: "gear" }],
    ["speed", "SPEED", "#hud-speed", "bottom center", { clearReadout: 4, seed: 1, toggle: "speed" }],   // its own piece since the HELMET set (visor HUD) lifts it off the wheel
    ["energy", "ENERGY", "#hud-energy", "bottom center", { toggle: "energy" }],
    ["tyre", "TYRES", "#hud-tyre", "bottom center", { clearReadout: 2, seed: 1, toggle: "tyre" }],
    ["ot", "OVERTAKE", "#hud-ot", "bottom center", { toggle: "ot" }],
    ["aero", "AERO", "#hud-aero", "bottom center", { toggle: "aero" }],
    ["bb", "BRAKE BIAS", "#hud-bb", "bottom center", { toggle: "bb" }],
    ["damage", "DAMAGE", "#hud-damage", "top right", { clearReadout: 7, seed: 1, toggle: "damage" }],
    ["rel", "RELATIVE", "#hud-rel", "top right", { card: 1, clearCtrl: 1, clearReadout: 8, seed: 1, toggle: "rel" }],
    ["strat", "STRATEGY", "#hud-strat", "top left", { card: 1, clearReadout: 9, seed: 1, toggle: "strat" }],
    ["finish", "FINISH / RETIREMENT CARD", "#retired-card", "center", {}],
    ["inputs", "INPUTS", "#hud-inputs", "top right", { clearCtrl: 1, clearReadout: 10, seed: 1, toggle: "inputs" }],   // under the sector column (desktop + touch); was bottom left over SPEED & GEAR at 150%
  ].map((r) => Object.freeze({ id: r[0], label: r[1], selector: r[2], origin: r[3], ...r[4] })));
  const ELEMENTS = Object.freeze(WIDGETS.map((w) => Object.freeze([w.id, w.label, w.selector, w.origin])));   const byFlag = (k) => WIDGETS.filter((w) => w[k]);
  const IDS = ELEMENTS.map((e) => e[0]);
  const SETS = Object.freeze(["cockpit", "helmet", "other"]);
  const PROFILES = Object.freeze(["standard", "minimal", "broadcast"]);
  const COCKPIT_CAMS = typeof CamGroups !== "undefined" ? CamGroups.COCKPIT_LAYOUT : Object.freeze({ cockpit: 1 });
  const LAYOUT_SET = typeof CamGroups !== "undefined" && CamGroups.layoutSet ? CamGroups.layoutSet : (id) => (COCKPIT_CAMS[id] ? "cockpit" : "other");
  const LIM = Object.freeze({ x: [-Infinity, Infinity], y: [-Infinity, Infinity], s: [0, Infinity] });
  const DEF = Object.freeze({ x: 0, y: 0, s: 100 });
  const fz = (o) => { for (const k in o) Object.freeze(o[k]); return Object.freeze(o); };
  // Fixed placements in the standard phone HUD. Other profiles retain their automatic layout.
  const PHONE_STANDARD = {
    helmet: {
      tower: { x: 0.4694835680751307, y: 1.4418999151823524, s: 70 },
      map: { x: -1.2910798122065723, y: 2.714164546225618, s: 85.9375 },
      gaps: { x: -3.5602503912363113, y: 2.17742790500422, s: 70 },
      sectors: { x: 4.694835680751162, y: -3.701494910941472, s: 70 },
      limits: { x: -73.8935348200313, y: -9.446883262265425, s: 60 },
      flag: { x: 0.2738654147104829, y: 13.480703986429173, s: 100 },
      mirror: { x: 0.00794818143889378, y: 0.22662213740458376, s: 78.59375 },
      announce: { x: -43.50547730829421, y: 14.808948571849818, s: 50 },
      gearbox: { x: 7.116832942097028, y: -49.458539475820345, s: 92.7001953125 },
      speed: { x: -22.451413341158062, y: -4.60209892602974, s: 100 },
      energy: { x: 4.585411776212829, y: -4.38711622916005, s: 101.53846153846153 },
      tyre: { x: 18.309859154929573, y: -80.22689091987381, s: 60 },
      damage: { x: 5.001952838449952, y: -24.25296644319203, s: 60 },
      rel: { x: -78.00334996087636, y: 9.889473563235537, s: 40 },
      strat: { x: -0.0003910213942059926, y: 27.819338888309076, s: 100.00001537409477 },
      inputs: { x: 74.12673609917152, y: -22.406435538592024, s: 70.76108399958467 },
    },
    // Chase lanes (UI matrix 2026-11-25 row 2, 852×393 at UI 70 / BUTTON 143): SPEED beside the gearbox,
    // ERS above both, OT and AERO side by side above ERS. The 11-20 seed put AERO on the speed digits.
    other: {
      tower: { x: 0, y: -5.4239903493137414e-15, s: 80 },
      speed: { x: 10.04, y: -2.29, s: 100 },
      energy: { x: 5.41, y: -14.25, s: 101.53846153846153 },
      ot: { x: -7.5, y: -19.08, s: 100 },
      aero: { x: 10.5, y: -19.08, s: 100 },
    },
  };
  // Retired factory seeds: a stored entry still equal to one was never moved, so it takes today's seed.
  const RETIRED_SEED = { other: {
    speed: { x: 9.474031690140844, y: 2.038273960983889, s: 100 },
    energy: { x: 5.41006455399061, y: -11.279397823731712, s: 101.53846153846153 },
    ot: { x: -5.247454576089348, y: -0.16698473282442747, s: 100 },
    aero: { x: 19.800224960876363, y: 3.9042620865139805, s: 100 },
  } };
  // Portrait phone chase (#6476, hud-survey bryce-393x852 --cam chase at UI 70 / 100): the steer pair fills the
  // bottom-left to x 221 and the pedal column starts at x 290, so the landscape shares landed SPEED on STEER RIGHT
  // and OT / AERO / ERS on the gearbox. SPEED sits left of the gearbox above the steer row; ERS, OT and AERO
  // stack above the tyre plate on the centre line. Not the landscape lane: a portrait screen has no side room.
  // Shares hold from 360×780 to 430×932: the controls and the cluster are pixels, the offsets a share of the screen.
  const PORTRAIT_OTHER = { speed: { x: -20, y: -13.4, s: 100 }, energy: { x: 0, y: -33.4, s: 101.53846153846153 },
    ot: { x: 0, y: -35.8, s: 100 }, aero: { x: 0, y: -41, s: 100 } };
  const PHONE_PORTRAIT = { helmet: PHONE_STANDARD.helmet, other: Object.assign({}, PHONE_STANDARD.other, PORTRAIT_OTHER) };
  // A portrait PHONE (css/hud.css's (orientation: portrait) and (max-width: 500px)); a portrait tablet keeps the landscape seed.
  const portraitPhone = () => UiShape.portraitNarrow();
  const phoneStandard = () => typeof HudElements !== "undefined" && HudElements.phone?.() ? (portraitPhone() ? PHONE_PORTRAIT : PHONE_STANDARD) : null;
  // Every factory seed a stored "other" entry may still hold: it was never moved, so it takes the one for this screen.
  const KNOWN_SEEDS = [RETIRED_SEED.other, PHONE_STANDARD.other, PORTRAIT_OTHER];
  const factorySet = (pn, sn) => (pn === "standard" && phoneStandard()?.[sn]) || {};
  /** A stored entry that is still the factory phone seed for its piece. */
  const isSeedEl = (id, entry, sn, pn) => { const f = factorySet(pn, sn)[id]; return !!(entry && f && sameEl(normEl(f), normEl(entry))); };
  function matchesFactory(entries, pn, sn) {
    const factory = factorySet(pn, sn);
    return Object.keys(entries).length === Object.keys(factory).length
      && Object.keys(entries).every(id => factory[id] && sameEl(factory[id], entries[id]));
  }

  // Cockpit readouts clear the wheel and touch controls. See the measurements in SCREEN-LOOKS-STORAGE.md.
  const COCKPIT_STRIP = {
    energy: { x: -30, y: -4, s: 100 },
    tyre: { x: -30, y: -4, s: 100 },
    ot: { x: 30, y: -14, s: 100 },
    aero: { x: 30, y: -14, s: 100 },
    bb: { x: -18, y: 0, s: 100 },
  };
  // Desktop visor readout measurements: docs/notes/HELMET-VISOR-HUD-2026-10-05.md.
  const HELMET_STRIP = Object.assign({}, COCKPIT_STRIP, { gearbox: { x: -30, y: -20, s: 100 }, speed: { x: -30, y: -30, s: 100 } });
  // The touch visor keeps gear on the wheel and speed beside it.
  const HELMET_TOUCH = { energy: { x: 0, y: -6, s: 100 }, tyre: { x: 0, y: -2, s: 100 },
    gearbox: { x: 0, y: 0, s: 100 }, speed: { x: 12, y: -5, s: 100 } };
  const SHIPPED = Object.freeze({
    standard: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
    minimal: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
    broadcast: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
  });
  // Per SET, the shipped layout a TOUCH screen takes instead (every style).
  const TOUCH_SHIPPED = Object.freeze({ helmet: fz(Object.assign({}, HELMET_TOUCH)) });
  // TOUCH DEVICES keep the cockpit's shipped hide of ENERGY / TYRES / OVERTAKE /
  // AERO / BRAKE BIAS (css/track-detail.css): the OT / AERO / BOOST buttons carry
  // those states, and on a phone the pedal and steer columns leave no room beside
  // the wheel at any fixed offset (tests/specs/hud-layout.spec.js measured clashes
  // on every phone shape; the hud-survey put the x-30 TYRES on both steer buttons
  // at 844x390). A piece the player PLACES carries data-hl-user and shows.
  // PRESETS: [id, label, partial offsets laid over the set's shipped layout].
  // An offset is a share of the SCREEN. Bottom chips a preset writes leave the
  // flex/grid cluster (data-hl-bottom) and hang from the screen centre / bottom
  // 12px home (css/hud.css) — so x/y are FROM CENTRE, not from the shipped flex
  // slot. Size-only bottom entries (x=y=0) still detach and stack on that home:
  // CLEAN must not size OT/AERO. Measured desktop-1280 chase (hud-survey
  // 2026-10-22 tip): CLEAN with ot/aero s:90 stacked them on SPEED; BIG
  // gearbox x-3 / CORNERS gearbox x+50 were authored for flex homes and put
  // the gearbox on SPEED or past the right edge.

  // TOUCH cockpit / helmet: those desktop offsets land on the steer column
  // and the pedal stack (852×393 cockpit + CORNERS). The chips the touch hide
  // owns stay shipped, so a preset does not set data-hl-user and un-hide them.
  const TOUCH_PRESET_HOLD = {
    cockpit: { energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
    helmet: { gearbox: 1, energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
  };
  // BIG, CORNERS and CLEAN are laid out for the desktop row and break a touch phone (hud-survey,
  // chase, 844x390: CORNERS puts the gearbox at 791..897 past the 844 edge and ENERGY /
  // TYRES over the steer buttons; BIG puts the tower under the CHASE button and the gearbox
  // over SPEED / ERS). CLEAN's 85-90 % scales leave 10 smaller overlaps there (map x tyre, tower x gap
  // chips, gearbox x OT / AERO). Bryce, 2026-10-21: hide them on touch rather than design phone twins.
  const TOUCH_UNFIT = Object.freeze({ big: 1, corners: 1, clean: 1 });
  const presetFits = (pid) => !(touch() && TOUCH_UNFIT[pid]);
  const PRESETS = Object.freeze([
    ["shipped", "SHIPPED", {}],
    // Top-band only: size-only OT/AERO would detach to the centre home and stack.
    ["clean", "CLEAN", { tower: { s: 85 }, map: { s: 85 }, gaps: { s: 90 }, sectors: { s: 90 },
      limits: { s: 90 } }],
    ["big", "BIG", { tower: { s: 115 }, map: { s: 120 }, gaps: { x: 7, s: 100 }, gearbox: { x: -32, y: -18, s: 115 } }],
    ["corners", "CORNERS", { gearbox: { x: 38, y: -18 }, energy: { x: -32, y: 0 }, tyre: { x: -44, y: 0 } }],
  ].map((p) => Object.freeze([p[0], p[1], fz(p[2])])));

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  const doc = typeof document !== "undefined" ? document : null;
  let cam = "other";         // which camera set the race is using (setCam)
  let prof = null;           // the HUD style apply() last painted (setCam notices a change)
  let preview = null;        // the camera set the settings fold is editing, while it is open
  let previewProf = null;    // …and the style it is editing (pinned when the fold opens)
  let arrangePreview = false; // ARRANGE temporarily hides the settings fold
  let foldEl = null;         // the MOVE & SIZE <details>, once built
  let selected = null;       // the element the fold has selected (outlined while peeking)
  let onModeChange = null;   // the fold's repaint, while it is built (style / camera changed)
  let _pub = false;          // true after this IIFE finishes its first apply (HudLayout is then readable)

  function num(v, k, fallback) {
    const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;
    return Number.isFinite(n) && (k !== "s" || n > 0) ? n : fallback;
  }
  // Panel extents are pre-transform viewport shares. Type scales the widget font.
  const cardFields = { width: [5, 95], minHeight: [2, 60], textSize: [75, 200] };
  const cardKeys = Object.keys(cardFields);
  const cardWidgets = new Set(byFlag("card").map((w) => w.id));
  const cardSizing = id => cardWidgets.has(id);
  function normEl(v, fallback = DEF, allowCard = true) {
    const o = v && typeof v === "object" ? v : {};
    const result = { x: num(o.x, "x", fallback.x), y: num(o.y, "y", fallback.y), s: num(o.s, "s", fallback.s) };
    if (allowCard && ("width" in o || "minHeight" in o || "textSize" in o)) {
      for (const key of cardKeys) {
        const value = num(o[key], key, fallback[key]);
        if (Number.isFinite(value)) result[key] = Math.min(cardFields[key][1], Math.max(cardFields[key][0], value));
      }
    }
    return result;
  }
  const isDefEl = (e) => e.x === 0 && e.y === 0 && e.s === 100;
  const sameEl = (a, b) => a.x === b.x && a.y === b.y && a.s === b.s && cardKeys.every(key => a[key] === b[key]);
  const isSet = (s) => SETS.indexOf(s) >= 0;
  const isProf = (p) => PROFILES.indexOf(p) >= 0;
  /** A touch screen (no body.desktop — js/ui/platform-session.js keeps it live). */
  const touch = () => !!(doc && doc.body && doc.body.classList) && !Dom.isDesktop(doc);
  /** The shipped {x, y, s} of element `id` in style `pn`, camera set `sn` (a
   *  touch screen takes TOUCH_SHIPPED's for the sets that have one). */
  const shippedEl = (id, sn, pn) => normEl(touch() && TOUCH_SHIPPED[sn] ? TOUCH_SHIPPED[sn][id] : SHIPPED[pn] && SHIPPED[pn][sn] && SHIPPED[pn][sn][id]);
  const factoryEl = (id, sn, pn) => factorySet(pn, sn)[id] || shippedEl(id, sn, pn);
  const relativeSize = (size, id, sn, pn) => Number((size / factoryEl(id, sn, pn).s * 100).toPrecision(4));
  /** Explicit entries own their placement, including values equal to shipped. */
  function normSet(v, sn, pn) {
    const out = {};
    if (!v || typeof v !== "object") return out;
    for (const id of IDS) {
      if (!(id in v)) continue;
      if (!v[id] || typeof v[id] !== "object" || Array.isArray(v[id])) continue;
      out[id] = normEl(v[id], DEF, cardSizing(id));
    }
    return out;
  }
  const normProf = (v, pn) => Object.fromEntries(SETS.map((sn) => [sn, normSet(v && v[sn], sn, pn)]));
  /** Decode explicit placements from the current schema. */
  function migrate(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const pn of PROFILES) out[pn] = normProf(r.v === 4 ? r[pn] : null, pn);
    return out;
  }
  /** The STORED differences per style and camera set. */
  // ARRANGE's in-gesture layout (#5031): painted by apply(), saved once by commit() when the finger lifts.
  // A write by anyone else (a settings import) since the draft began wins over it.
  let draft = null, draftBase = null;
  function stored() {
    const raw = store ? store.get(KEY, null) : null;
    if (draft && raw !== draftBase) draft = null;
    return reseed(migrate(draft || (raw?.v === 4 ? raw : { v: 4, standard: phoneStandard() })));
  }
  function reseed(st) {
    const ps = phoneStandard();
    if (!ps) return st;
    const set = st.standard && st.standard.other;
    if (!set) return st;
    for (const id of Object.keys(PORTRAIT_OTHER)) {
      if (set[id] && KNOWN_SEEDS.some((seed) => sameEl(set[id], normEl(seed[id])))) set[id] = normEl(ps.other[id]);
    }
    return st;
  }
  /** The layout a style + set paints: stored, else shipped, for every element. Pure. */
  function effective(st, sn, pn) {
    const out = {};
    for (const id of IDS) out[id] = st[pn][sn][id] ? normEl(st[pn][sn][id]) : shippedEl(id, sn, pn);
    return out;
  }
  const emptyProf = (p) => SETS.every((sn) => !Object.keys(p[sn]).length);
  function all(pn) {
    const p = isProf(pn) ? pn : shownProf(), st = stored();
    return Object.fromEntries(SETS.map((sn) => [sn, effective(st, sn, p)]));
  }
  function save(st, live) {
    const out = { v: 4 };
    for (const pn of PROFILES) {
      const p = normProf(st[pn], pn);
      if (!emptyProf(p)) out[pn] = p;
    }
    draft = live ? out : null;
    if (live) draftBase = store ? store.get(KEY, null) : null;
    if (store && !live) {
      const atFactory = PROFILES.every(pn => SETS.every(sn => matchesFactory(st[pn][sn], pn, sn)));
      store.set(KEY, atFactory ? null : out);
    }
  }
  /** Save the live edits set(…, live) painted; false when there were none. */
  function commit() {
    if (!draft) return false;
    save(stored());
    return true;
  }
  // Leaving or backgrounding the page mid-gesture keeps what is on screen.
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", () => { if (!arrangePreview) commit(); });
  const camSet = (modeId) => LAYOUT_SET(modeId);
  const has = (c) => !!(doc && doc.body && doc.body.classList && doc.body.classList.contains(c));
  /** Is the race HUD up? (#hud carries `hidden` outside a race — js/game.js.) */
  function hudLive() {
    const h = doc && doc.getElementById ? doc.getElementById("hud") : null;
    return !!(h && !h.hidden);
  }
  /** The HUD style on screen: the body.hud-prof-* classes js/ui/hud.js paints
   *  while the HUD is up (they ARE what is drawn), else the stored setting. */
  function profile() {
    const fromClass = has("hud-prof-minimal") ? "minimal" : has("hud-prof-broadcast") ? "broadcast" : "standard";
    if (hudLive()) return fromClass;
    const v = store ? store.get("hudProfile", null) : null;
    return isProf(v) ? v : fromClass;
  }
  /** The layout the screen shows now: the one being edited, else the camera's. */
  const shown = () => (preview && isSet(preview) ? preview : cam);
  const shownProf = () => (preview && isProf(previewProf) ? previewProf : profile());
  const profArg = (pn) => (isProf(pn) ? pn : shownProf());
  const setArg = (sn) => (isSet(sn) ? sn : shown());

  /** {x, y, s} for element `id` in camera set `set` of style `pn` (default: on screen). */
  function get(id, set, pn) {
    return normEl(all(pn)[setArg(set)][id]);
  }
  /** SIZE as a factor (1 = shipped) — js/ui/hud.js sharpens the map canvas by it. */
  function scaleOf(id) { return get(id).s / 100; }

  /** transform-origin for element `id` from its LIVE anchor: TRACK LIMITS
   *  crosses to the left column under :root[data-limits-left] (css/hud.css),
   *  and a left-anchored chip must grow away from the LEFT edge. */
  function originOf(id) {
    const row = ELEMENTS.find((e) => e[0] === id);
    if (!row) return null;
    const root = doc && doc.documentElement;
    if (id === "limits" && !stored()[shownProf()][shown()].limits && root && root.hasAttribute && root.hasAttribute("data-limits-left")) return "top left";
    return row[3];
  }

  const manuallyPlaced = (el) => !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
  // Automatic placement is disposable output. Once a widget is edited, its
  // saved geometry owns it even outside the viewport or over another control.
  function releaseAutomatic(el) {
    if (!el || !el.style) return;
    if (el.hasAttribute("data-hl-pack")) {
      for (const p of ["translate", "margin-left", "margin-top"]) el.style.removeProperty(p);
    }
    // keepUser's race-time nudge is its own pass's output: it re-measures it, nothing else strips it.
    for (const p of el.hasAttribute("data-hl-keep") ? ["max-width", "max-height"] : ["--hud-clear-x", "--hud-clear-y", "max-width", "max-height"]) el.style.removeProperty(p);
    if (el.id === "hud-rel") el.style.removeProperty("left");
    for (const a of ["data-hl-pack", "data-col-compact", "data-col-drop", "data-lane-collapsed"]) el.removeAttribute(a);
  }

  const bottomHomes = new Map();
  // A manual instrument must leave the capped, transformed flex/grid cluster.
  // Remember its slot so Reset or a different camera restores normal layout.
  function ownBottom(el) {
    const home = bottomHomes.get(el);
    if (el.hasAttribute("data-hl-v4")) {
      if (!home && el.parentNode && el.parentNode.classList.contains("hud-bottom")) {
        const host = doc.getElementById("hud");
        if (!host) return;
        bottomHomes.set(el, { parent: el.parentNode, next: el.nextSibling });
        el.setAttribute("data-hl-bottom", ""); host.appendChild(el);
      }
    } else if (home) {
      if (home.next && home.next.parentNode === home.parent && home.parent.insertBefore) home.parent.insertBefore(el, home.next);
      else home.parent.appendChild(el);
      el.removeAttribute("data-hl-bottom"); bottomHomes.delete(el);
    }
  }

  function apply() {
    if (!doc) return;
    const sn = shown(), pn = shownProf(), st = stored(), a = effective(st, sn, pn);
    prof = profile();
    // body[data-hl-set] names the camera set painted now: css/track-detail.css
    // keys the TOUCH cockpit hide of the strip on it, not on body.cockpit-cam —
    // that one means "the wheel's LCD shows gear / speed" and is off for a
    // wheel with no screen (CLASSIC, NONE), where the strip still sits at the
    // cockpit offsets over the steer column.
    const body = doc.body;
    if (body && body.setAttribute) body.setAttribute("data-hl-set", sn);
    for (const [id, , sel] of ELEMENTS) {
      const el = doc.querySelector(sel);
      if (!el || !el.style) continue;
      const e = a[id];
      if (e && (!isDefEl(e) || st[pn][sn][id])) {
        el.style.setProperty("--hl-x", String(e.x));
        el.style.setProperty("--hl-y", String(e.y));
        el.style.setProperty("--hl-s", String(e.s / 100));
        el.style.setProperty("--hl-o", originOf(id));
        el.setAttribute("data-hl", "");
      } else if (el.hasAttribute("data-hl")) {
        el.removeAttribute("data-hl");
        for (const p of ["--hl-x", "--hl-y", "--hl-s", "--hl-o"]) el.style.removeProperty(p);
      }
      if (st[pn][sn][id]) el.setAttribute("data-hl-user", "");
      else if (el.hasAttribute("data-hl-user")) el.removeAttribute("data-hl-user");
      const entry = st[pn][sn][id];
      if (cardSizing(id)) {
        if (entry?.width != null) el.setAttribute("data-hl-width", "");
        else el.removeAttribute("data-hl-width");
        if (entry?.minHeight != null) el.setAttribute("data-hl-height", "");
        else el.removeAttribute("data-hl-height");
        for (const [key, property, unit] of [["width", "--hl-width", "vw"], ["minHeight", "--hl-height", "vh"], ["textSize", "--hl-type", ""]]) {
          if (entry?.[key] != null) {
            el.style.setProperty(property, unit ? "calc(" + entry[key] + unit + " / var(--hud-z, 1))" : String(entry[key] / 100));
          } else el.style.removeProperty(property);
        }
      }
      if (entry) el.setAttribute("data-hl-v4", "");
      else el.removeAttribute("data-hl-v4");
      // Bryce 2026-11-20: the factory PHONE_STANDARD seed keeps the screen-fit caps (fitHud, js/ui/hud.js);
      // a piece the player moved or sized owns its geometry.
      if (isSeedEl(id, entry, sn, pn)) el.setAttribute("data-hl-seed", "");
      else el.removeAttribute("data-hl-seed");
      if (manuallyPlaced(el)) releaseAutomatic(el);
      ownBottom(el);
      if (selected === id && preview) el.setAttribute("data-hl-sel", "");
      else if (el.hasAttribute("data-hl-sel")) el.removeAttribute("data-hl-sel");
    }
    // A MOVED radio card leaves auto-placement (js/ui/hud.js radioTopSlot): it stays where it was put.
    if (body && body.toggleAttribute) {
      const radio = st[pn][sn].announce;
      body.toggleAttribute("data-radio-placed", !!radio);
    }
    fit();
    // A move changes what fitHud measured: let it re-lay the bands out now
    // (js/ui/hud.js; optional — absent at eval and in node harnesses).
    if (typeof GameHud !== "undefined" && GameHud && typeof GameHud.invalidateFit === "function") GameHud.invalidateFit();
    // REL ships ON in BROADCAST only (js/ui/hud-elements.js). Re-apply the hide
    // list when the painted style changes so data-hud-hide~=rel tracks it.
    // Defer until after this IIFE returns: a sync call during init reads
    // HudLayout while the const is still in TDZ and aborts the script.
    if (_pub && typeof HudElements !== "undefined" && HudElements && typeof HudElements.apply === "function") {
      const run = () => { if (body && body.hasAttribute("data-hud-arrange")) return; try { HudElements.apply(); } catch (_) { /* detached / tests */ } };
      if (typeof queueMicrotask === "function") queueMicrotask(run);
      else setTimeout(run, 0);
    }
  }

  /* Keep automatic shipped offsets on screen. Explicit user entries bypass
     every placement correction, including viewport and safe-area bounds. */
  const EDGE = 4;
  // Intersect the visible viewport with hardware insets. Browser zoom and
  // keyboards can expose only part of the layout viewport; never save this fit.
  function screenBounds(W = window.innerWidth, H = window.innerHeight, gap = EDGE) {
    const safe = doc && doc.documentElement && typeof getComputedStyle === "function" ? getComputedStyle(doc.documentElement) : null;
    const inset = (name) => safe && safe.getPropertyValue ? Math.max(0, parseFloat(safe.getPropertyValue(name)) || 0) : 0;
    const vv = typeof window !== "undefined" && window.visualViewport;
    const x = vv && vv.width > 0 ? vv.offsetLeft || 0 : 0, y = vv && vv.height > 0 ? vv.offsetTop || 0 : 0;
    return { left: Math.max(x, inset("--sal")) + gap, top: Math.max(y, inset("--sat")) + gap,
      right: Math.min(W - inset("--sar"), x + (vv && vv.width > 0 ? vv.width : W)) - gap,
      bottom: Math.min(H - inset("--sab"), y + (vv && vv.height > 0 ? vv.height : H)) - gap };
  }
  function clampAxis(lo, hi, min, max) {
    if (hi - lo > max - min) return min - lo;     // bigger than the available screen: pin its start
    if (lo < min) return min - lo;
    if (hi > max) return max - hi;
    return 0;
  }
  // Pieces that share one NON-ZERO offset move as ONE BLOCK: clamping each on
  // its own pulled AERO (the right-hand chip) back onto OVERTAKE beside it — the
  // shipped cockpit layout moves both +30vw, and at 1280 wide only AERO overran
  // the edge, so it landed on top of OT (measured: visor x 1176 vs 1177). The
  // block is clamped by the UNION of its members' rects and every member gets
  // the same correction, so neighbours keep their spacing. A piece whose only
  // change is SIZE (offset 0,0) is clamped ON ITS OWN: those sit in different
  // corners, and one union of them spans the screen, so the "bigger than the
  // screen" branch pinned it (BIG + TOWER SIZE 200 at 844 wide left the tower
  // ~170 px off the left edge).
  function fit() {
    if (!doc || typeof window === "undefined" || !window.innerWidth) return;
    // The fold is never collapsed when SETTINGS closes (or a race resumes), so
    // its preview outlived the page and pinned the edited layout over every
    // camera for the session. A fold no longer on screen hands back the camera's.
    if (preview && !arrangePreview && !(foldEl && foldEl.open && foldEl.getClientRects && foldEl.getClientRects().length)) {
      if (foldEl) foldEl.open = false;
      preview = null; previewProf = null; selected = null; apply();
    }
    resetClearance();
    clearPackMarks();
    const W = window.innerWidth, H = window.innerHeight;
    const bounds = screenBounds(W, H);
    const a = all()[shown()];
    const groups = new Map();   // "x,y" offset (or "solo:id" at 0,0) -> [{ el, e, r }]
    for (const [id, , sel] of ELEMENTS) {
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.getBoundingClientRect || !el.hasAttribute("data-hl")) continue;
      if (manuallyPlaced(el)) continue;
      el.style.setProperty("--hl-x", String(e.x));
      el.style.setProperty("--hl-y", String(e.y));
      // fitHud may have crossed TRACK LIMITS to the other column since apply().
      el.style.setProperty("--hl-o", originOf(id));
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;                // hidden right now: nothing to keep on screen
      const k = e.x || e.y ? e.x + "," + e.y : "solo:" + id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ el, e, r });
    }
    for (const g of groups.values()) {
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
      for (const m of g) { l = Math.min(l, m.r.left); t = Math.min(t, m.r.top); rr = Math.max(rr, m.r.right); bb = Math.max(bb, m.r.bottom); }
      const dx = clampAxis(l, rr, bounds.left, bounds.right), dy = clampAxis(t, bb, bounds.top, bounds.bottom);
      g.dx = dx; g.dy = dy;
      for (const m of g) {
        if (dx) m.el.style.setProperty("--hl-x", String(+(m.e.x + dx / W * 100).toFixed(2)));
        if (dy) m.el.style.setProperty("--hl-y", String(+(m.e.y + dy / H * 100).toFixed(2)));
      }
    }
    // A CLAMPED BLOCK MUST NOT LAND ON A NEIGHBOUR. Desktop cockpit at HUD 150%: the strip's TYRES (-30vw) runs
    // off the left edge and the clamp brings it back onto BRAKE BIAS (-18vw, its own block; hud-mock 1440x900).
    // Push the untouched neighbour the clamp's way, clear of it; at 100% nothing is hit, so nothing moves.
    const at = (m, g) => ({ L: m.r.left + g.dx, R: m.r.right + g.dx, T: m.r.top + g.dy, B: m.r.bottom + g.dy });
    for (const g of groups.values()) {
      if (!g.dx) continue;
      for (const h of groups.values()) {
        if (h === g || h.dx || h.dy) continue;
        let push = 0;
        for (const p of g) for (const q of h) {
          const A = at(p, g), B = at(q, h);
          if (A.L < B.R && B.L < A.R && A.T < B.B && B.T < A.B) push = g.dx > 0 ? Math.max(push, A.R + EDGE - B.L) : Math.min(push, A.L - EDGE - B.R);
        }
        if (!push) continue;
        h.dx = push;
        for (const q of h) q.el.style.setProperty("--hl-x", String(+(q.e.x + push / W * 100).toFixed(2)));
      }
    }
    // READOUT-ON-CONTROL: a MOVE & SIZE offset chosen on a wide desktop can
    // land RELATIVE / INPUTS / SECTORS on a phone's touch discs. After the
    // edge clamp, nudge those three left/up off any visible .touchbtn (and
    // INPUTS off SPEED & GEAR) so a placed chip cannot cover a tap target.
    clearControls(W, H);
    keepUser(W, H);
    // Pack primary instruments first, then place secondary readouts around them.
    // Both corrections reset before measurement and never enter saved settings.
    packPhone(W, H);
    // HudRelative / HudStrategy / tyre paint AFTER fitHud in the same tick
    // (js/ui/hud.js), so the first pack often misses them. One double-rAF
    // follow-up re-packs once they have boxes — without editing hud.js
    // (open PRs own that file).
    schedulePackFollowUp();
  }
  let _packFollow = 0;
  function schedulePackFollowUp() {
    if (_packFollow) return;
    _packFollow = 1;
    const run = () => {
      _packFollow = 0;
      if (!doc || typeof window === "undefined" || !window.innerWidth) return;
      packPhone(window.innerWidth, window.innerHeight);
      // Strat/rel paint on the 10 Hz HUD tick after fitHud; one more pack a
      // beat later catches the unhide the MutationObserver may miss when the
      // hidden flag never flipped (first race tick already showed them).
      if (typeof setTimeout === "function") {
        setTimeout(() => {
          if (!doc || typeof window === "undefined" || !window.innerWidth) return;
          packPhone(window.innerWidth, window.innerHeight);
        }, 120);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else if (typeof setTimeout === "function") {
      setTimeout(run, 32);
    } else {
      _packFollow = 0;
    }
  }

  /* PHONE 150% PACKER. Pure: dock boxes → screen-pixel corrections.
     The map, tower, radio, flag and touch controls stay fixed. Optional
     readouts are placed separately by clearReadouts, never by this packer. */
  const PACK_AIR = 4;
  const PACK_SCALE_MIN = 140;
  const PACK_FIXED = Object.freeze({ announce: 1, flag: 1, map: 1, tower: 1 });
  const PACK_DOCK = Object.freeze({ tyre: 1, gearbox: 1, speed: 1, energy: 1 });
  const PACK_MOVE = Object.freeze(Object.keys(PACK_DOCK));
  function packPhoneRects(boxes, W, H, bounds = { left: PACK_AIR, top: PACK_AIR, right: W - PACK_AIR, bottom: H - PACK_AIR }) {
    const by = Object.create(null);
    const fixed = Object.create(null);
    if (!boxes || !(W > 0) || !(H > 0)) return {};
    // Portrait: keep the dock (tyre/gear/speed/ERS) planted — moving them
    // with margin at --hud-z-bot ≈ 0.6 yeeted TYRES off the top (390×844
    // @150%). Keep the portrait dock planted.
    const dockFixed = H > W;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b || !b.id || !(b.w > 0 && b.h > 0)) continue;
      by[b.id] = { id: b.id, x: +b.x, y: +b.y, w: +b.w, h: +b.h, dx: 0, dy: 0 };
      if (PACK_FIXED[b.id] || b.fixed || String(b.id).indexOf("ctrl:") === 0) fixed[b.id] = 1;
      if (dockFixed && PACK_DOCK[b.id]) fixed[b.id] = 1;
    }
    // Survey overlaps judge the radio card with its widest forced text, which
    // sits lower/taller than the idle plate. Pad announce so packing clears
    // that lane without moving announce itself (queue-1 owns its stack).
    if (by.announce) {
      const a = by.announce;
      const padBottom = Math.max(a.h, Math.min(H * 0.22, a.h + 70));
      a.h = padBottom;
      // A high-idle card still claims the mid band the forced probe uses.
      if (a.y + a.h < H * 0.45) a.h = Math.max(a.h, H * 0.45 - a.y);
    }
    const isFixed = (id) => !!fixed[id];
    const rect = (m) => ({
      L: m.x + m.dx, T: m.y + m.dy, R: m.x + m.dx + m.w, B: m.y + m.dy + m.h,
    });
    const hit = (a, b) => a.L < b.R - 0.5 && b.L < a.R - 0.5 && a.T < b.B - 0.5 && b.T < a.B - 0.5;
    const clampOn = (m) => {
      const r = rect(m);
      m.dx += clampAxis(r.L, r.R, bounds.left, bounds.right);
      m.dy += clampAxis(r.T, r.B, bounds.top, bounds.bottom);
    };
    for (const id of PACK_MOVE) if (by[id] && !isFixed(id)) clampOn(by[id]);
    const separate = (moverId, obstacleId) => {
      const m = by[moverId], o = by[obstacleId];
      if (!m || !o || isFixed(moverId)) return false;
      let changed = false;
      for (let n = 0; n < 10; n++) {
        const mr = rect(m), or = rect(o);
        if (!hit(mr, or)) break;
        const down = or.B - mr.T + PACK_AIR;
        const left = mr.R - or.L + PACK_AIR;
        const right = or.R - mr.L + PACK_AIR;
        const up = mr.B - or.T + PACK_AIR;
        let dx = 0, dy = 0;
        if (isFixed(obstacleId)) {
          // Map/tower stay above the dock; a control below can be cleared UP.
          if (obstacleId === "map" || obstacleId === "tower") dy = down;
          else if (String(obstacleId).indexOf("ctrl:") === 0 && up > 0 && up <= Math.min(down, left, right)) dy = -up;
          else if (left <= down) dx = -left;
          else dy = down;
        } else if (down <= left) dy = down;
        else dx = -left;
        m.dx += dx;
        m.dy += dy;
        clampOn(m);
        changed = true;
      }
      return changed;
    };
    for (let pass = 0; pass < 12; pass++) {
      let any = false;
      const ids = Object.keys(by);
      for (let mi = 0; mi < PACK_MOVE.length; mi++) {
        const id = PACK_MOVE[mi];
        if (!by[id]) continue;
        for (let oi = 0; oi < ids.length; oi++) {
          const o = ids[oi];
          if (o === id) continue;
          const oj = PACK_MOVE.indexOf(o);
          // Yield to FIXED and to earlier MOVE entries only.
          if (!isFixed(o) && oj >= 0 && oj > mi) continue;
          if (separate(id, o)) any = true;
        }
      }
      if (!any) break;
    }
    const out = Object.create(null);
    for (const id of Object.keys(by)) {
      const m = by[id];
      if (isFixed(id) || String(id).indexOf("ctrl:") === 0) continue;
      if (Math.abs(m.dx) > 0.25 || Math.abs(m.dy) > 0.25) {
        out[id] = { dx: +m.dx.toFixed(2), dy: +m.dy.toFixed(2) };
      }
    }
    return out;
  }
  function clearPackMarks() {
    if (!doc || !doc.querySelectorAll) return;
    let nodes;
    try { nodes = doc.querySelectorAll("[data-hl-pack]"); } catch (_) { return; }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || typeof el.removeAttribute !== "function") continue;
      el.removeAttribute("data-hl-pack");
      // Pack paints an inline translate/margin (important): drop them so the
      // next measure sees the shipped box. Player MOVE & SIZE --hl-* untouched.
      if (el.style && typeof el.style.removeProperty === "function") {
        el.style.removeProperty("translate");
        el.style.removeProperty("margin-left");
        el.style.removeProperty("margin-top");

      }
    }
  }
  function packPhone(W, H) {
    resetClearance();
    clearPackMarks();
    packPhonePrimary(W, H);
    clearReadouts(W, H);
  }
  function packPhonePrimary(W, H) { /* PACK_MARK_Q2_4159 */
    if (!doc || !doc.body || !doc.body.classList || Dom.isDesktop(doc)) return;
    let pct = 100;
    if (store && typeof store.get === "function") pct = +store.get("hudScale", 100) || 100;
    try {
      const root = doc.documentElement;
      const cs = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
      const cssScale = cs ? parseFloat(cs.getPropertyValue("--hud-scale")) : 0;
      if (cssScale > 1) pct = Math.max(pct, Math.round(cssScale * 100));
    } catch (_) { /* harness */ }
    if (typeof window !== "undefined" && window.__apex && typeof window.__apex.hudScale === "function") {
      try { const s = window.__apex.hudScale(); if (s && s.pct != null) pct = Math.max(pct, +s.pct || 0); } catch (_) { /* */ }
    }
    if (!(pct >= PACK_SCALE_MIN)) return;
    const boxes = [];
    const want = Object.create(null);
    for (const id of Object.keys(PACK_DOCK)) want[id] = 1;
    want.announce = 1; want.flag = 1; want.map = 1; want.tower = 1;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const [id, , sel] = ELEMENTS[i];
      const el = doc.querySelector(sel);
      if (!el || el.hidden) continue;
      if (!want[id] && !manuallyPlaced(el)) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      boxes.push({ id, x: r.left, y: r.top, w: r.width, h: r.height, fixed: manuallyPlaced(el) });
    }
    // Touch discs are FIXED obstacles so a packed tyre cannot cover steer/BRAKE.
    try {
      const btns = doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn");
      for (let i = 0; i < btns.length; i++) {
        const el = btns[i];
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        boxes.push({ id: "ctrl:" + i, x: r.left, y: r.top, w: r.width, h: r.height, fixed: 1 });
      }
    } catch (_) { /* harness querySelectorAll stubs */ }
    const corr = packPhoneRects(boxes, W, H, screenBounds(W, H));
    if (!corr || !Object.keys(corr).length) return;
    for (const id of Object.keys(corr)) {
      const row = ELEMENTS.find((e) => e[0] === id);
      if (!row) continue;
      const el = doc.querySelector(row[2]);
      if (!el || !el.style) continue;
      if (manuallyPlaced(el)) continue;
      const c = corr[id];
      // Dock corrections are margins in local CSS pixels, preserving saved --hl-*.
      let z = 1;
      if (typeof el.currentCSSZoom === "number" && el.currentCSSZoom > 0) z = el.currentCSSZoom;
      else if (typeof getComputedStyle === "function") {
        const zz = parseFloat(getComputedStyle(el).zoom);
        if (zz > 0) z = zz;
      }
      const lx = c.dx / z, ly = c.dy / z;
      el.style.setProperty("margin-left", lx.toFixed(1) + "px", "important");
      el.style.setProperty("margin-top", ly.toFixed(1) + "px", "important");
      el.setAttribute("data-hl-pack", "");
    }
  }
  let _packMo = null;
  function watchPackUnhide() {
    if (_packMo || !doc || typeof MutationObserver !== "function") return;
    try {
      _packMo = new MutationObserver(() => {
        if (typeof window === "undefined" || !window.innerWidth) return;
        packPhone(window.innerWidth, window.innerHeight);
      });
      const watch = (id) => {
        const el = doc.getElementById(id);
        if (el) _packMo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
      };
      watch("hud-strat"); watch("hud-rel"); watch("hud-tyre"); watch("hud-inputs");
      watch("hud-limits"); watch("hud-flag");
    } catch (_) { _packMo = null; }
  }

  const CLEAR_CTRL = Object.freeze(Object.fromEntries(byFlag("clearCtrl").map((w) => [w.id, 1])));
  function clearControls(W, H) {
    if (!doc || !doc.querySelectorAll) return;
    const btns = [];
    const nodes = doc.querySelectorAll(".touchbtn, #hud-gearbox, #hud-speed");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || el.hidden) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      // Desktop: ignore touch discs that stay in the tree but are not the
      // player's controls; keep SPEED & GEAR so INPUTS still clears them.
      if (el.classList && el.classList.contains("touchbtn") && Dom.isDesktop(doc)) continue;
      btns.push(r);
    }
    if (!btns.length) return;
    const a = all()[shown()];
    for (const [id, , sel] of ELEMENTS) {
      if (!CLEAR_CTRL[id]) continue;
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.hasAttribute("data-hl")) continue;
      if (manuallyPlaced(el)) continue;
      let r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      // Seed from what fit()'s edge clamp already painted, so the nudge adds to it instead of replacing it.
      const px = el.style.getPropertyValue ? parseFloat(el.style.getPropertyValue("--hl-x")) : NaN;
      const py = el.style.getPropertyValue ? parseFloat(el.style.getPropertyValue("--hl-y")) : NaN;
      let dx = isFinite(px) ? (px - e.x) * W / 100 : 0, dy = isFinite(py) ? (py - e.y) * H / 100 : 0;
      for (let n = 0; n < 4; n++) {
        let hit = null;
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i];
          if (r.left < b.right - 0.5 && b.left < r.right - 0.5 && r.top < b.bottom - 0.5 && b.top < r.bottom - 0.5) { hit = b; break; }
        }
        if (!hit) break;
        // Prefer sliding left (away from the right dock) or up (away from the
        // pedal row); fall back to the smaller of the two escapes.
        const left = r.right - hit.left;
        const up = r.bottom - hit.top;
        if (left <= up) dx -= left + 4;
        else dy -= up + 4;
        el.style.setProperty("--hl-x", String(+(e.x + dx / W * 100).toFixed(2)));
        el.style.setProperty("--hl-y", String(+(e.y + dy / H * 100).toFixed(2)));
        r = el.getBoundingClientRect();
      }
    }
  }

  /* A SAVED PIECE STAYS ON SCREEN AND OFF THE CONTROLS IN THE RACE (#5678). MOVE & SIZE geometry is the
     player's own and no automatic clamp above touches it, so on Bryce's phone SECTORS grew left under
     PAUSE once S1 had a time, DAMAGE sat on BRAKE and ran 3 px off an 844 screen, TYRES on STEER LEFT.
     keepClear is the smallest shift that fixes it: a screen px --hud-clear-x/y (never saved; the
     editor shows the saved spot and flags it OVERLAP) measured on the piece at its WIDEST content. */
  /** Pure: the smallest {dx, dy} (screen px) that puts rect r inside `bounds` and off every rect in `obs`
   *  by `air` px; the bounds shift alone when no clear spot is in reach (4 escapes at most). */
  function keepClear(r, bounds, obs, air = EDGE) {
    const at = (dx, dy) => ({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });
    const hit = (b) => obs.find((o) => b.left < o.right - 0.5 && o.left < b.right - 0.5 && b.top < o.bottom - 0.5 && o.top < b.bottom - 0.5);
    const inside = (b) => !clampAxis(b.left, b.right, bounds.left, bounds.right) && !clampAxis(b.top, b.bottom, bounds.top, bounds.bottom);
    let dx = clampAxis(r.left, r.right, bounds.left, bounds.right), dy = clampAxis(r.top, r.bottom, bounds.top, bounds.bottom);
    for (let n = 0; n < 4; n++) {
      const b = at(dx, dy), o = hit(b);
      if (!o) break;
      const go = [[o.left - air - b.right, 0], [o.right + air - b.left, 0], [0, o.top - air - b.bottom], [0, o.bottom + air - b.top]]
        .map(([x, y]) => [dx + x, dy + y]).filter(([x, y]) => inside(at(x, y)));
      if (!go.length) break;
      go.sort((p, q) => (!!hit(at(p[0], p[1])) - !!hit(at(q[0], q[1]))) || (Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1])));
      [dx, dy] = go[0];
    }
    return { dx: +dx.toFixed(1), dy: +dy.toFixed(1) };
  }
  // The widest content a piece paints in a race, written for one synchronous measure and put back
  // (the text node's .data, so js/ui/hud.js hText keeps its node). SECTORS reads "--" until S1.
  const MAX_TEXT = Object.freeze({ sectors: [".sec-val", "\u25b21:01.980"] });
  /** The painted rect of piece `id` with its widest race content (the editor's OVERLAP check uses it too). */
  function maxRect(id, el) {
    const r = el.getBoundingClientRect(), m = MAX_TEXT[id];
    if (!m || !el.querySelectorAll || !(r.width && r.height)) return r;
    const put = [];
    for (const n of el.querySelectorAll(m[0])) {
      const t = n.firstChild;
      if (t && t.nodeType === 3) { put.push([t, t.data]); t.data = m[1]; } else { put.push([n, null, n.textContent]); n.textContent = m[1]; }
    }
    const w = el.getBoundingClientRect();
    for (const [n, d, txt] of put) { if (d != null) n.data = d; else n.textContent = txt; }
    return { left: Math.min(r.left, w.left), top: Math.min(r.top, w.top), right: Math.max(r.right, w.right), bottom: Math.max(r.bottom, w.bottom) };
  }
  const KEEP_CTRL = ".touchbtn, .steerbtn, .shiftbtn, #btn-cam";   // + #pausebtn by id
  /** The painted rects keepUser keeps a saved piece off (ARRANGE's Bring Into View uses the same list). */
  function ctrlRects() {
    const out = [], n = Array.from(doc.querySelectorAll(KEEP_CTRL));
    if (doc.getElementById) n.push(doc.getElementById("pausebtn"));
    for (let i = 0; i < n.length; i++) {
      const c = n[i];
      if (!c || c.hidden || (c.classList && c.classList.contains("touchbtn") && has("desktop"))) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(c) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const b = c.getBoundingClientRect();
      if (b.width && b.height) out.push(b);
    }
    return out;
  }
  function keepUser(W = window.innerWidth, H = window.innerHeight, only) {
    if (!doc || !doc.querySelectorAll) return;
    const editing = !!(doc.body && doc.body.hasAttribute && doc.body.hasAttribute("data-hud-arrange"));
    let obs = null;
    for (const [id, , sel] of ELEMENTS) {
      if (id === "announce") continue;   // the radio lane owns the card's --hud-clear (js/ui/hud-radio-lane.js)
      const el = doc.querySelector(sel);
      if (!el || !el.style || (only && el !== only)) continue;
      if (el.hasAttribute("data-hl-keep")) { el.style.removeProperty("--hud-clear-x"); el.style.removeProperty("--hud-clear-y"); el.removeAttribute("data-hl-keep"); }
      if (editing || !fixedReadout(el) || el.hidden) continue;
      const r = maxRect(id, el), area = (r.right - r.left) * (r.bottom - r.top);
      if (!(area > 0)) continue;
      // PARKED is a choice: a piece saved mostly off the screen stays there (unrestricted placement, hud-layout.spec).
      if ((Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0))) * 2 < area) continue;
      if (!obs) obs = ctrlRects();
      const k = keepClear(r, screenBounds(W, H, 0), obs);   // the safe area itself: no further than needed
      if (!k.dx && !k.dy) continue;
      el.style.setProperty("--hud-clear-x", k.dx + "px"); el.style.setProperty("--hud-clear-y", k.dy + "px");
      el.setAttribute("data-hl-keep", "");
    }
  }

  // Temporary screen-pixel corrections never enter the saved MOVE & SIZE layout.
  // Controls and primary instruments reserve their space before optional panels.
  const CLEAR_READOUTS = byFlag("clearReadout").sort((a, b) => a.clearReadout - b.clearReadout).map((w) => w.id);
  // A factory phone readout can yield when the screen or the flag/radio content
  // changes. Saved edits and the Arrange preview keep their exact positions.
  const seedWidgets = new Set(byFlag("seed").map((w) => w.selector.slice(1)));
  const seedReadout = (el) => !!(el && seedWidgets.has(el.id) && el.hasAttribute("data-hl-seed") && !bodyAttr("data-hud-arrange"));
  const fixedReadout = (el) => manuallyPlaced(el) && !seedReadout(el);
  function resetClearance() {
    if (!doc || !doc.querySelector) return;
    for (const [id, , sel] of ELEMENTS) {
      const el = doc.querySelector(sel);
      if (fixedReadout(el)) { releaseAutomatic(el); continue; }
      if (CLEAR_READOUTS.indexOf(id) < 0) continue;
      if (el && el.style) {
        el.style.removeProperty("--hud-clear-x"); el.style.removeProperty("--hud-clear-y");
        el.removeAttribute("data-col-compact"); el.removeAttribute("data-col-drop");
      }
    }
  }
  let _blkBounds = new Float64Array(128);
  function clearReadouts(W = window.innerWidth, H = window.innerHeight) {
    if (!doc.querySelectorAll) return;
    resetClearance();
    const rows = ELEMENTS.filter((e) => CLEAR_READOUTS.indexOf(e[0]) >= 0);
    const box = (el) => {
      if (!el || el.hidden || !el.getBoundingClientRect) return null;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const bounds = screenBounds(W, H);
    const inside = (r) => r.left >= bounds.left && r.top >= bounds.top && r.right <= bounds.right && r.bottom <= bounds.bottom;
    const mapEl = doc.querySelector("#minimap");
    const mapBox = mapEl && !has("desktop") && has("hud-prof-broadcast") && W > H
      && !mapEl.hasAttribute("data-hl-user") ? box(mapEl) : null;
    const autoMap = mapBox && Array.from(doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn")).some((el) => {
      const r = box(el);
      return r && mapBox.left < r.right - 0.5 && mapBox.right > r.left + 0.5
        && mapBox.top < r.bottom - 0.5 && mapBox.bottom > r.top + 0.5;
    });
    const blocks = [];
    for (const el of doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn, #pausebtn, #btn-cam, #hud-gearbox, #hud-tyre, #hud-energy, #hud-ot, #hud-aero, #hud-bb, .hud-top, #minimap, .hud-gaps, #hud-sectors, #hud-flag, #hud-mirror")) {
      if (autoMap && el === mapEl) continue;
      if ((el.id === "hud-tyre" || el.id === "hud-gearbox") && seedReadout(el)) continue;
      const r = box(el); if (r) blocks.push(r);
    }
    // A player-placed radio is an obstacle, never another automatic candidate.
    const placedRadio = bodyAttr("data-radio-placed") && !seedReadout(doc.querySelector("#announce"));
    if (placedRadio) { const r = box(doc.querySelector("#announce")); if (r) blocks.push(r); }
    // Edited secondary readouts are fixed obstacles too, not placement candidates.
    for (const [, , sel] of rows) {
      const el = doc.querySelector(sel);
      if (fixedReadout(el)) { const r = box(el); if (r) blocks.push(r); }
    }
    // Scalar form of the rect-vs-block overlap test: findSlot tries ~1000 candidates, so no object or closure per try.
    // Obstacle bounds (already inflated by EDGE) live in a reused Float64Array, synced lazily as `blocks` grows:
    // reading DOMRect doubles in a ~1000-try loop boxed a heap number per read.
    let synced = 0;
    const blocked = (l, t, rt, bt) => {
      while (synced < blocks.length) {
        if ((synced + 1) * 4 > _blkBounds.length) { const g = new Float64Array(_blkBounds.length * 2); g.set(_blkBounds); _blkBounds = g; }
        const b = blocks[synced], o = synced * 4;
        _blkBounds[o] = b.left - EDGE; _blkBounds[o + 1] = b.right + EDGE; _blkBounds[o + 2] = b.top - EDGE; _blkBounds[o + 3] = b.bottom + EDGE;
        synced++;
      }
      for (let o = 0, e = synced * 4; o < e; o += 4) {
        if (l < _blkBounds[o + 1] && rt > _blkBounds[o] && t < _blkBounds[o + 3] && bt > _blkBounds[o + 2]) return true;
      }
      return false;
    };
    const findSlot = (r) => {
      if (inside(r) && !blocked(r.left, r.top, r.right, r.bottom)) return r;
      let bx = 0, by = 0, cost = Infinity;
      const xs = [r.left, bounds.left, bounds.right - r.width], ys = [r.top, bounds.top, bounds.bottom - r.height];
      for (const b of blocks) { xs.push(b.left - EDGE - r.width, b.right + EDGE); ys.push(b.top - EDGE - r.height, b.bottom + EDGE); }
      for (const x of xs) for (const y of ys) {
        if (x < bounds.left || y < bounds.top || x + r.width > bounds.right || y + r.height > bounds.bottom) continue;
        if (blocked(x, y, x + r.width, y + r.height)) continue;
        const d = (x - r.left) ** 2 + (y - r.top) ** 2;
        if (d < cost) { bx = x; by = y; cost = d; }
      }
      return cost === Infinity ? null : { left: bx, top: by, right: bx + r.width, bottom: by + r.height, width: r.width, height: r.height };
    };
    for (const id of CLEAR_READOUTS) {
      const row = rows.find((e) => e[0] === id), el = doc.querySelector(row[2]);
      if (fixedReadout(el)) continue;
      if ((id === "tyre" || id === "gearbox") && !seedReadout(el)) continue;
      // A stale lane collapse has no rectangle to place after rotation or a
      // camera switch. Reopen it locally; the lane producer owns the next reset.
      if (id === "announce" && el && el.hasAttribute("data-lane-collapsed")) {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        el.removeAttribute("data-lane-collapsed");
      }
      let r = box(el); if (!r) continue;
      // Only the shipped broadcast map yields to controls; custom maps remain
      // fixed obstacles, retaining their saved offset and dimensions.
      if (id === "map" && !autoMap) continue;
      if (id === "announce" && placedRadio) { blocks.push(r); continue; }
      // SPEED moves only on the visor (HELMET), where its shipped offset can meet the
      // enlarged gearbox (desktop) or, on touch, OT / AERO once TEXT LARGER or a big
      // BUTTON SIZE widens the row (UI-HUNT-2-HUD). Everywhere else it has priority.
      if (id === "speed" && shown() !== "helmet") { blocks.push(r); continue; }
      let best = findSlot(r);
      // A narrow dock lane can wrap a long call beyond the available height.
      // Let placement try the card's normal width before accepting a collision.
      if (!best && id === "announce") {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        r = box(el);
        best = r && findSlot(r);
        if (!best && r) {
          // Wrapping can fit a call between enlarged controls when its normal
          // width cannot. Derive a few real gaps, not repeated global shrink steps.
          const intervals = blocks.filter(b => b.top - EDGE < r.bottom && b.bottom + EDGE > r.top)
            .map(b => [Math.max(bounds.left, b.left - EDGE), Math.min(bounds.right, b.right + EDGE)])
            .filter(([left, right]) => right > left).sort((a, b) => a[0] - b[0]);
          const widths = []; let cursor = bounds.left;
          for (const [left, right] of intervals) { if (left - cursor >= 96) widths.push(left - cursor); cursor = Math.max(cursor, right); }
          if (bounds.right - cursor >= 96) widths.push(bounds.right - cursor);
          for (const width of [...new Set(widths)].sort((a, b) => b - a)) {
            el.style.setProperty("--announce-lane-w", width + "px");
            const wrapped = box(el), slot = wrapped && findSlot(wrapped);
            if (slot) { r = wrapped; best = slot; break; }
          }
        }
        if (!best) { el.setAttribute("data-lane-collapsed", ""); continue; }
      }
      if (!best && id === "inputs") { el.setAttribute("data-col-drop", ""); continue; }
      if (!best && id === "damage") {
        el.setAttribute("data-col-compact", "");
        r = box(el);
        best = r && findSlot(r);
      }
      if (!best && (id === "rel" || id === "strat")) {
        el.setAttribute("data-col-compact", "");
        if (id === "rel" && el.querySelectorAll) {
          const children = el.querySelectorAll(":scope > div");
          for (const child of children) child.removeAttribute("data-col-row");
          const first = Array.from(children).find((child) => !child.hidden && !child.hasAttribute("data-self")) || Array.from(children).find((child) => !child.hidden);
          if (first) first.setAttribute("data-col-row", "");
        }
        r = box(el);
        best = r && findSlot(r);
        if (!best) { el.setAttribute("data-col-drop", ""); continue; }
      }
      if (best && best === r) {
        // No correction was needed: retain this measured obstacle without
        // writing zero offsets and forcing another painted-box read.
        blocks.push(r);
      } else if (best) {
        el.style.setProperty("--hud-clear-x", (best.left - r.left).toFixed(2) + "px");
        el.style.setProperty("--hud-clear-y", (best.top - r.top).toFixed(2) + "px");
        // Read the actual painted box: zoom, saved scale and platform layout
        // can change the relationship between a CSS correction and its pixels.
        const painted = box(el);
        if (painted) blocks.push(painted);
      } else blocks.push(r);
    }
  }

  let clearanceObserver = null;
  function watchReadoutSizes() {
    if (clearanceObserver || !doc || typeof ResizeObserver !== "function") return;
    // Text, late fonts and radio wrapping can change a box after the HUD tick.
    // Placement must use those final dimensions, including while the race is paused.
    clearanceObserver = new ResizeObserver(() => {
      if (typeof window !== "undefined" && window.innerWidth) clearReadouts();
    });
    for (const [id, , sel] of ELEMENTS) {
      if (CLEAR_READOUTS.indexOf(id) < 0) continue;
      const el = doc.querySelector(sel);
      if (el) clearanceObserver.observe(el, { box: "border-box" });
    }
    // A saved piece that appears (DAMAGE) or grows mid-race is re-kept on its own; others cost a hasAttribute.
    const keepObs = new ResizeObserver((es) => {
      if (typeof window === "undefined" || !window.innerWidth) return;
      for (const e of es) if (fixedReadout(e.target)) keepUser(window.innerWidth, window.innerHeight, e.target);
    });
    for (const [id, , sel] of ELEMENTS) { const el = id !== "announce" && doc.querySelector(sel); if (el) keepObs.observe(el, { box: "border-box" }); }
  }

  /** Force the rear-view on when the player places it in MOVE & SIZE.
   *  MirrorPass owns el.hidden; CSS data-hl-user alone cannot unhide it, so a
   *  place must flip the setting to ON (and clear a session collapse). */
  function revealMirror() {
    try {
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance && MirrorPass.instance();
      if (mp) {
        const st = typeof mp.state === "function" ? mp.state() : null;
        if (st && st.collapsed) {
          const chip = doc && doc.getElementById && doc.getElementById("hud-mirror-chip");
          if (chip && typeof chip.click === "function") chip.click();
        }
        if (typeof mp.mode === "function" && mp.mode() !== "on" && typeof mp.setMode === "function") mp.setMode("on");
      } else if (store) {
        store.set("hudMirror", "on");
      }
      const e = doc && doc.querySelector && doc.querySelector("#hud-mirror");
      if (e) e.hidden = false;
      if (doc && doc.body && doc.body.classList && doc.body.classList.add) doc.body.classList.add("hud-mirror-on");
    } catch (_) { /* harness / boot order */ }
  }
  /** Current HUD › MIRROR setting (auto|on|off). Prefers the live MirrorPass. */
  function mirrorMode() {
    try {
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance && MirrorPass.instance();
      if (mp && typeof mp.mode === "function") return mp.mode();
    } catch (_) { /* fall through */ }
    const v = store ? store.get("hudMirror", "auto") : "auto";
    return v === "off" || v === "on" ? v : "auto";
  }

  /** Write one element's values into set `setName` of style `pn`; returns the stored {x, y, s}.
   *  `live`: paint now, keep it out of storage until commit() (a drag frame). */
  function set(id, v, setName, pn, live) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = setArg(setName), p = profArg(pn);
    const st = stored();
    const previous = effective(st, sn, p)[id];
    if (!v || typeof v !== "object" || Array.isArray(v)
        || !Object.keys(v).some(k => (["x", "y", "s"].includes(k) || (cardSizing(id) && Object.hasOwn(cardFields, k))) && Number.isFinite(num(v[k], k, NaN)))) return previous;
    const e = normEl(Object.assign({}, previous, v), previous, cardSizing(id));
    st[p][sn][id] = e;
    save(st, live);
    apply();
    // A place on MIRROR (data-hl-user) cures the soft hide — same contract as
    // the touch-cockpit chips / SPEED wheel-LCD rule.
    if (id === "mirror" && !(live && arrangePreview)) {
      const el = doc && doc.querySelector && doc.querySelector("#hud-mirror");
      if (el && el.hasAttribute && el.hasAttribute("data-hl-user")) revealMirror();
    }
    return e;
  }
  function resetEl(id, setName, pn, live) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = setArg(setName), p = profArg(pn), st = stored();
    const entry = factorySet(p, sn)[id];
    if (entry) st[p][sn][id] = normEl(entry);
    else delete st[p][sn][id];
    save(st, live); apply();
    return entry ? normEl(entry) : shippedEl(id, sn, p);
  }
  function resetSet(setName, pn, live) {
    const st = stored();
    const p = profArg(pn), sn = setArg(setName);
    st[p][sn] = normSet(factorySet(p, sn), sn, p);
    save(st, live); apply();
  }

  // Sparse snapshots preserve automatic placement, including on a different handset.
  function arrangeSnapshot(setName, pn) { return stored()[profArg(pn)][setArg(setName)]; }
  function restoreSnapshot(setName, pn, snapshot) {
    const st = stored();
    st[profArg(pn)][setArg(setName)] = snapshot;
    save(st, true);
    apply();
  }
  function endArrangeDraft(accept, setName, pn, original) {
    const snapshot = arrangeSnapshot(setName, pn);
    if (accept && draft && JSON.stringify(original) !== JSON.stringify(snapshot)) {
      commit();
      if (snapshot.mirror && !sameEl(snapshot.mirror, original.mirror || DEF)) revealMirror();
    } else {
      draft = null;
      apply();
    }
  }

  /** Preset `pid` laid over style `pn` / set `sn`'s shipped layout — the full layout. Pure. */
  function presetLayout(pid, sn, pn) {
    const p = PRESETS.find((q) => q[0] === pid);
    if (!p || !isSet(sn)) return null;
    const pr = isProf(pn) ? pn : "standard";
    const hold = touch() && TOUCH_PRESET_HOLD[sn], factory = factorySet(pr, sn);
    const out = {};
    for (const id of IDS) {
      const over = hold && hold[id] ? null : p[2][id];
      out[id] = normEl(Object.assign({}, factory[id] || shippedEl(id, sn, pr), over || {}));
    }
    return out;
  }
  /** Write preset `pid` into set `setName` of style `pn` (default: on screen). */
  function applyPreset(pid, setName, pn) {
    const sn = setArg(setName), p = profArg(pn);
    if (pid === "shipped") { resetSet(sn, p); return true; }
    if (!presetFits(pid)) return false;
    const lay = presetLayout(pid, sn, p);
    if (!lay) return false;
    const st = stored();
    st[p][sn] = Object.fromEntries(IDS.filter((id) => factorySet(p, sn)[id] || !sameEl(lay[id], shippedEl(id, sn, p))).map((id) => [id, lay[id]]));
    save(st); apply();
    return true;
  }
  /** The preset id set `setName` of style `pn` matches now, or "custom". */
  function presetOf(setName, pn) {
    const sn = setArg(setName), p = profArg(pn);
    const cur = all(p)[sn];
    for (const [pid] of PRESETS) {
      const lay = presetLayout(pid, sn, p);
      if (IDS.every((id) => sameEl(lay[id], cur[id]))) return pid;
    }
    return "custom";
  }
  /** Shipped? One set of one style; a whole style (set omitted); or, with
   *  `pn` omitted too, the style on screen. `pn` "all" asks every style. */
  function isShipped(setName, pn) {
    const st = stored();
    const ps = pn === "all" ? PROFILES : [profArg(pn)];
    return ps.every(p => (isSet(setName) ? [setName] : SETS).every(sn => matchesFactory(st[p][sn], p, sn)));
  }

  /** js/ui/hud.js: the race camera (CamModes id) or the HUD style changed. */
  function setCam(modeId) {
    const s = camSet(modeId), p = profile();
    if (s === cam && p === prof) return;
    cam = s;
    apply();
    if (onModeChange) onModeChange();
  }

  /** body[data-*] presence (mode-switch sets data-helmet-cam). */
  const bodyAttr = (n) => !!(doc && doc.body && doc.body.hasAttribute && doc.body.hasAttribute(n));
  // body[data-hud-hide~=…] token for each of our ids (js/ui/hud-elements.js).
  const TOGGLE = Object.freeze(Object.fromEntries(byFlag("toggle").map((w) => [w.id, w.toggle])));
  const VIS_ROWS = Object.freeze({
    map: ["pm-hudmap", "hudMapVis", "on"], gaps: ["pm-hudgaps", "hudGapsVis", "on"], mirror: ["pm-hudmirror", "hudMirror", "auto"],
  });
  const VIS_BINARY = Object.freeze([["on", "SHOW"], ["off", "HIDE"]]);
  const VIS_AUTO = Object.freeze([["auto", "AUTO"], ...VIS_BINARY]);
  function visibilityIds(id) {
    return id === "tower" ? ["pos", "lap", "time", "best", "delta"] : TOGGLE[id] ? [TOGGLE[id]] : [];
  }
  // Both editors use the same piece-to-preference mapping. Race messages and
  // flags remain event-driven; layout pieces and individual toggles differ.
  function visibility(id) {
    const row = VIS_ROWS[id];
    if (row) {
      const value = store ? store.get(row[1], row[2]) : row[2];
      return { value: VIS_AUTO.some(([v]) => v === value) ? value : row[2], choices: VIS_AUTO };
    }
    const ids = visibilityIds(id);
    if (!ids.length || typeof HudElements === "undefined") return null;
    const count = ids.filter((key) => HudElements.isOn(key)).length;
    return count && count < ids.length
      ? { value: "mixed", choices: [...VIS_BINARY, ["mixed", "PARTLY SHOWN", true]] }
      : { value: count ? "on" : "off", choices: VIS_BINARY };
  }
  function setVisibility(id, value) {
    const current = visibility(id);
    if (!current || !current.choices.some(([v, , disabled]) => v === value && !disabled)) return false;
    const row = VIS_ROWS[id];
    if (row) {
      // These rows own live game state, mirror resources and their summaries.
      // Use their real change handler instead of only changing stored JSON.
      const select = doc && doc.getElementById(row[0] + "-sel");
      if (!select || select.disabled) return false;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else HudElements.setMany(visibilityIds(id), value === "on");
    return true;
  }
  // The diagnostic only appears inside the editor. Normal races never construct its policy.
  let explainHidden = null;
  function hiddenReason(id) {
    if (typeof HudLayoutEditor === "undefined") return null;
    explainHidden ||= HudLayoutEditor.createHiddenReason({ doc, store, ELEMENTS, hudLive, has, shownProf, shown, mirrorMode, visibilityIds });
    return explainHidden(id);
  }

  let colors = null, editorLoad = null;
  function colorPolicy() {
    if (!colors && typeof HudLayoutEditor !== "undefined") colors = HudLayoutEditor.createColors(ELEMENTS, store, doc);
    return colors;
  }
  function ensureEditor() {
    if (colorPolicy()) return Promise.resolve(true);
    if (typeof ScriptLoader === "undefined") return Promise.resolve(false);
    if (!editorLoad) editorLoad = ScriptLoader.create().load(["js/ui/hud-layout-editor.js"], [],
      { strict: true, ready: () => typeof HudLayoutEditor !== "undefined" })
      .then(() => !!colorPolicy()).catch(() => false).finally(() => { editorLoad = null; });
    return editorLoad;
  }
  function restoreColors() {
    if (!colors && store?.get("hudColors", null)) ensureEditor();
  }
  restoreColors();
  store?.subscribe?.(change => {
    if (change.key === "hudColors" || change.keys?.includes("hudColors")) restoreColors();
  });

  function build() {
    const host = doc?.getElementById("pm-hud-details");
    if (!host || doc.getElementById("pm-hudlayout")) return;
    if (typeof HudLayoutEditor === "undefined") {
      ensureEditor().then(ready => {
        if (ready) build();
        else host.addEventListener("toggle", build, { once: true });
      });
      return;
    }
    HudLayoutEditor.build({ host, doc, store, ELEMENTS, IDS, PRESETS, TOUCH_UNFIT, profile, get, set, apply, isShipped,
      presetOf, applyPreset, visibility, setVisibility, presetFits, hiddenReason, resetEl, resetSet,
      relativeSize, factoryEl, camera: () => cam,
      setPreview: (camera, style) => { preview = camera; previewProf = style; },
      select: id => { selected = id; }, mount: fold => { foldEl = fold; },
      subscribeMode: fn => { onModeChange = fn; } });
  }

  // #4798 gate: build only
  // A rotation swaps the chase seed (PHONE_PORTRAIT): re-paint when the portrait-phone answer flips.
  let wasPortrait = null;
  const onRotate = () => { const p = portraitPhone(); if (wasPortrait !== null && p !== wasPortrait && phoneStandard()) apply(); wasPortrait = p; };
  function init(gate) { apply(); onRotate(); if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("resize", onRotate, { passive: true }); if (gate) gate(build); else build(); watchPackUnhide(); watchReadoutSizes(); if (typeof Input !== "undefined") Input.onPointerKindChange(() => setTimeout(apply, 0)); }
  apply();
  _pub = true;
  if (doc) {
    const atGate = (fn) => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(fn) : fn());
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => init(atGate), { once: true });
    else if (doc.readyState === "complete") init();
    else init((fn) => doc.addEventListener("DOMContentLoaded", () => { apply(); atGate(fn); }, { once: true }));
  }

  // Public surface: PACK_AIR + packPhoneRects for the unit packer; KEY / LIM /
  // PACK_SCALE_MIN / PACK_FIXED / PACK_MOVE stay module-local (no js/ or test
  // callers). Survey lockstep still parses the LIM const from source.
  return {
    get colors() { return colorPolicy(); }, ensureEditor, WIDGETS, ELEMENTS, SETS, PROFILES, COCKPIT_CAMS, SHIPPED, TOUCH_SHIPPED, PRESETS, presetFits,
    PACK_AIR, cardSizing,
    holdArrangePreview: (on) => { arrangePreview = !!on; },
    get, set, commit, resetEl, resetSet, arrangeSnapshot, restoreSnapshot, endArrangeDraft, isShipped, scaleOf, relativeSize, setCam, apply, fit, clearReadouts, build,
    camSet, shown: () => shown(), profile, all, migrate, presetLayout, applyPreset, presetOf,
    hiddenReason, originOf, packPhoneRects, visibilityIds, visibility, setVisibility, screenBounds,
    keepClear, maxRect, keepUser, ctrlRects,
  };
})();
Object.freeze(HudLayout);
