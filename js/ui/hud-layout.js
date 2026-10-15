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

   SIX LAYOUTS: HUD STYLE × CAMERA SET. The cockpit cameras
   (CamGroups.COCKPIT_LAYOUT, js/camera/cam-groups.js) put the steering wheel
   across the bottom of the screen, so a layout tuned for the chase camera
   would sit on it. And an offset is relative to the element's SHIPPED anchor,
   which differs per HUD STYLE: BROADCAST left-anchors the timing tower and
   parks map + gaps under it (css/hud.css), so a STANDARD-made tower move of
   -30% pushed the broadcast tower off the left edge. One stored object,
   apex26.hudLayout:
   {v: 3, standard: {cockpit: {id: {x, y, s}}, other: {…}}, minimal: {…},
   broadcast: {…}} — a missing profile or element is the SHIPPED layout for
   that profile and set (SHIPPED below), which for the cockpit is not zero:
   OVERTAKE / AERO / ENERGY / TYRES move off the wheel to either side of it,
   so a cockpit player can read why OVERTAKE is unavailable without a
   setting. RESET returns to that shipped layout, not to zero.
   MIGRATION: v1 and v2 stored {cockpit, other} for every style; that is the
   layout the player built, almost always in STANDARD (the default), so it
   becomes STANDARD's and MINIMAL / BROADCAST start shipped. (v1's "missing =
   zero" reads as v2 unchanged: the only v1 cockpit element that could matter
   was TYRES, and a v1 TYRES move is kept verbatim.)
   The STYLE is read from the live body.hud-prof-* classes js/ui/hud.js
   paints while the HUD is up (this module never reaches into game.js), else
   from the stored setting. js/ui/hud.js reports camera changes (setCam, also
   on a style change); the settings fold edits the CURRENT style's layout for
   either camera set and previews the one it is editing.

   HIDDEN ELEMENTS: hiddenReason(id) says why an element is not on screen in
   the current mode (MINIMAL, a LAYOUT, a broadcast camera, the cockpit wheel,
   TYRE WEAR off, MAP/GAPS off, a per-element toggle) so the fold can grey out
   sliders that would move nothing — from the classes that hide it, confirmed
   by the live element (display none / hidden / zero rect) while the HUD is
   up. A "soft" reason is one a move cures (a touch cockpit shows a chip the
   player places) or a chip that only appears on an event: its sliders stay.

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

  const KEY = "hudLayout";   // apex26.hudLayout — {v: 3, standard?, minimal?, broadcast?} | null
  // [id, label, selector, transform-origin]. The origin keeps a corner piece
  // growing away from its corner. The four centred by `left: 50%;
  // transform: translateX(-50%)` scale about their UNtransformed left edge,
  // which is the screen's centre line, so they stay centred as they grow.
  const ELEMENTS = Object.freeze([
    ["tower", "TIMING TOWER", ".hud-top", "top left"],
    ["map", "TRACK MAP", "#minimap", "top left"],
    ["gaps", "GAPS", ".hud-gaps", "top left"],
    ["sectors", "SECTORS", "#hud-sectors", "top right"],
    ["limits", "TRACK LIMITS", "#hud-limits", "top right"],   // "top left" when js/ui/hud.js crosses it to the left column (originOf)
    ["flag", "FLAGS", "#hud-flag", "top left"],
    ["mirror", "MIRROR", "#hud-mirror", "top left"],
    ["announce", "RACE MESSAGES", "#announce", "top left"],
    ["gearbox", "GEAR", "#hud-gearbox", "bottom center"],
    ["speed", "SPEED", "#hud-speed", "bottom center"],   // its own piece since the HELMET set (visor HUD) lifts it off the wheel
    ["energy", "ENERGY", "#hud-energy", "bottom center"],
    ["tyre", "TYRES", "#hud-tyre", "bottom center"],
    ["ot", "OVERTAKE", "#hud-ot", "bottom center"],
    ["aero", "AERO", "#hud-aero", "bottom center"],
    ["bb", "BRAKE BIAS", "#hud-bb", "bottom center"],
    ["damage", "DAMAGE", "#hud-damage", "top right"],
    ["rel", "RELATIVE", "#hud-rel", "top right"],
    ["strat", "STRATEGY", "#hud-strat", "top left"],
    ["inputs", "INPUTS", "#hud-inputs", "top right"],   // under the sector column (desktop + touch); was bottom left over SPEED & GEAR at 150%
  ].map(Object.freeze));
  const IDS = ELEMENTS.map((e) => e[0]);
  const SETS = Object.freeze(["cockpit", "helmet", "other"]);
  const PROFILES = Object.freeze(["standard", "minimal", "broadcast"]);
  const COCKPIT_CAMS = typeof CamGroups !== "undefined" ? CamGroups.COCKPIT_LAYOUT : Object.freeze({ cockpit: 1 });
  const LAYOUT_SET = typeof CamGroups !== "undefined" && CamGroups.layoutSet ? CamGroups.layoutSet : (id) => (COCKPIT_CAMS[id] ? "cockpit" : "other");
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
  // PER STYLE the strip is the same: every style keeps the bottom band centred
  // (BROADCAST moves only the TOWER, top-left, and parks map + gaps under it),
  // so the wheel is the only thing to clear. MINIMAL hides ENERGY / OVERTAKE /
  // AERO / BRAKE BIAS, which leaves TYRES alone at its shipped spot. They are
  // three entries rather than one so a style can diverge without a migration.
  const COCKPIT_STRIP = {
    energy: { x: -30, y: -4, s: 100 },
    tyre: { x: -30, y: -4, s: 100 },
    ot: { x: 30, y: -14, s: 100 },
    aero: { x: 30, y: -14, s: 100 },
    bb: { x: -18, y: 0, s: 100 },
  };
  // HELMET — the VISOR HUD (js/camera/cam-groups.js HELMET_LAYOUT): the same
  // wheel, but nothing is left to its LCD. DESKTOP: the cockpit strip plus
  // GEAR and SPEED stacked left of the wheel above ENERGY / TYRES (1280x720:
  // gear x-30 y-20 → fit() pins it at the left edge, 4..266 y438-503; speed
  // 123..210 y366-413; ENERGY from y577 — measured by the hud-survey helmet
  // cells, docs/notes/HELMET-VISOR-HUD-2026-10-05.md). TOUCH (HELMET_TOUCH,
  // read through shippedEl while body lacks .desktop): the steer and pedal
  // columns sit beside the wheel, so ENERGY stacks in the left bottom strip
  // above TYRES (css/hud.css anchor-positioning on helmet touch — the old
  // y-37 centre lift read as an ERS pill floating mid-visor, 2026-10-07).
  // TYRES stays in the left corner between STRATEGY and the steer buttons:
  // y-2 is 232..273 at 844×390 dock zoom 0.865. GEAR takes the LCD's place
  // and SPEED sits right of it; only OVERTAKE / AERO / BRAKE BIAS stay with
  // the touch buttons that carry them (css/track-detail.css, the helmet
  // touch hide).
  const HELMET_STRIP = Object.assign({}, COCKPIT_STRIP, { gearbox: { x: -30, y: -20, s: 100 }, speed: { x: -30, y: -30, s: 100 } });
  // GEAR and SPEED on a touch helmet replace the LCD: the gearbox chip sits
  // where the wheel's screen is (the chase row's own centre, one step down),
  // SPEED moves right of it (the owner asked for the chip on the visor,
  // 2026-10-05; the LCD's digits are a few pixels tall on a phone).
  const HELMET_TOUCH = { energy: { x: 0, y: -6, s: 100 }, tyre: { x: 0, y: -2, s: 100 },
    gearbox: { x: 0, y: 0, s: 100 }, speed: { x: 12, y: 0, s: 100 } };
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
  // An offset is a share of the SCREEN but the bottom cluster is fixed px,
  // centred, so a preset has to clear its neighbours at every width. The
  // desktop row (css/touch-controls.css "gear speed energy ot aero", TYRES and
  // BRAKE BIAS on an implicit second row under gear / speed), measured at 1280
  // (hud-survey, chase, bottom zoom 1): gear 225..487 y582-647, speed 507..594,
  // energy 614..804 y606-624, OT 824..913 y595-636, AERO 933..1054, TYRES
  // 291..421 y648-690, BB 520..582 y662-689; at 1920 every x is +320.
  // BIG: the SIZE 125 gearbox grows about its bottom centre to 192..520 and
  //   met SPEED (507) — x-3 (-38px at 1280, -58 at 1920) leaves 25px. The map
  //   grows 128 -> 160 authored px at top zoom 1.25 (10..210) under the gap
  //   strip anchored at its unscaled right (178) — x+5 (+64 / +96px) puts the
  //   strip at 242, 32px clear, and it grows with the rest.
  // CORNERS: the gearbox (262 wide) does not fit right of AERO at 1280 (226px
  //   left), so it goes to the right corner ABOVE the chip row: x+50, y-10 is
  //   865..1127 y510-575 at 1280 (20px over OT's 595), 1505..1769 y835-900 at
  //   1920. ENERGY x-34 lands in the gearbox's vacated spot, 179..369 at 1280
  //   and 281..471 at 1920 (SPEED from 507 / 827); TYRES, 323px left of it,
  //   cannot share that offset (x-34 puts it at -144): x-21 is 22..152 at 1280
  //   and 208..338 at 1920. At the 0.85 bottom zoom fitHud has painted every
  //   piece sits closer to the centre and the same gaps only grow.
  // TOUCH cockpit / helmet: those desktop offsets land on the steer column
  // and the pedal stack (852×393 cockpit + CORNERS). The chips the touch hide
  // owns stay shipped, so a preset does not set data-hl-user and un-hide them.
  const TOUCH_PRESET_HOLD = {
    cockpit: { energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
    helmet: { gearbox: 1, energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
  };
  const PRESETS = Object.freeze([
    ["shipped", "SHIPPED", {}],
    ["clean", "CLEAN", { tower: { s: 85 }, map: { s: 85 }, gaps: { s: 90 }, sectors: { s: 90 },
      limits: { s: 90 }, ot: { s: 90 }, aero: { s: 90 } }],
    ["big", "BIG", { tower: { s: 125 }, map: { s: 125 }, gaps: { x: 5, s: 125 }, gearbox: { x: -3, s: 125 } }],
    ["corners", "CORNERS", { gearbox: { x: 50, y: -10 }, energy: { x: -34, y: 0 }, tyre: { x: -21, y: 0 } }],
  ].map((p) => Object.freeze([p[0], p[1], fz(p[2])])));

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  const doc = typeof document !== "undefined" ? document : null;
  let cam = "other";         // which camera set the race is using (setCam)
  let prof = null;           // the HUD style apply() last painted (setCam notices a change)
  let preview = null;        // the camera set the settings fold is editing, while it is open
  let previewProf = null;    // …and the style it is editing (pinned when the fold opens)
  let foldEl = null;         // the MOVE & SIZE <details>, once built
  let selected = null;       // the element the fold has selected (outlined while peeking)
  let onModeChange = null;   // the fold's repaint, while it is built (style / camera changed)
  let _pub = false;          // true after this IIFE finishes its first apply (HudLayout is then readable)

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
  const isSet = (s) => SETS.indexOf(s) >= 0;
  const isProf = (p) => PROFILES.indexOf(p) >= 0;
  /** A touch screen (no body.desktop — js/ui/platform-session.js keeps it live). */
  const touch = () => !!(doc && doc.body && doc.body.classList && !doc.body.classList.contains("desktop"));
  /** The shipped {x, y, s} of element `id` in style `pn`, camera set `sn` (a
   *  touch screen takes TOUCH_SHIPPED's for the sets that have one). */
  const shippedEl = (id, sn, pn) => normEl(touch() && TOUCH_SHIPPED[sn] ? TOUCH_SHIPPED[sn][id] : SHIPPED[pn] && SHIPPED[pn][sn] && SHIPPED[pn][sn][id]);
  /** One stored layout: only the elements that differ from that set's shipped layout. */
  function normSet(v, sn, pn) {
    const out = {};
    if (!v || typeof v !== "object") return out;
    for (const id of IDS) {
      if (!(id in v)) continue;
      const e = normEl(v[id]);
      if (!sameEl(e, shippedEl(id, sn, pn))) out[id] = e;
    }
    return out;
  }
  const normProf = (v, pn) => Object.fromEntries(SETS.map((sn) => [sn, normSet(v && v[sn], sn, pn)]));
  /** Pure: a raw stored value -> {standard, minimal, broadcast}, each {cockpit,
   *  other} of differences. v3 is per style; v1 / v2 (one {cockpit, other} for
   *  every style) become STANDARD's and the others start shipped (header). */
  function migrate(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const pn of PROFILES) out[pn] = normProf(r.v === 3 ? r[pn] : pn === "standard" ? r : null, pn);
    return out;
  }
  /** The STORED differences per style and camera set. */
  function stored() { return migrate(store ? store.get(KEY, null) : null); }
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
  function save(st) {
    if (!store) return;
    const out = { v: 3 };
    let any = false;
    for (const pn of PROFILES) {
      const p = normProf(st[pn], pn);
      if (!emptyProf(p)) { out[pn] = p; any = true; }
    }
    store.set(KEY, any ? out : null);
  }
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
    if (id === "limits" && root && root.hasAttribute && root.hasAttribute("data-limits-left")) return "top left";
    return row[3];
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
      if (e && !isDefEl(e)) {
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
      if (selected === id && preview) el.setAttribute("data-hl-sel", "");
      else if (el.hasAttribute("data-hl-sel")) el.removeAttribute("data-hl-sel");
    }
    // A MOVED radio card leaves auto-placement (js/ui/hud.js radioTopSlot): it stays where it was put.
    if (body && body.toggleAttribute) { const r = a.announce; body.toggleAttribute("data-radio-placed", !!(r && (r.x || r.y))); }
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
    if (preview && !(foldEl && foldEl.open && foldEl.getClientRects && foldEl.getClientRects().length)) {
      if (foldEl) foldEl.open = false;
      preview = null; previewProf = null; selected = null; apply();
    }
    resetClearance();
    clearPackMarks();
    const W = window.innerWidth, H = window.innerHeight;
    const a = all()[shown()];
    const groups = new Map();   // "x,y" offset (or "solo:id" at 0,0) -> [{ el, e, r }]
    for (const [id, , sel] of ELEMENTS) {
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.getBoundingClientRect || !el.hasAttribute("data-hl")) continue;
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
      const dx = clampAxis(l, rr, W), dy = clampAxis(t, bb, H);
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

  /* PHONE 150% PACKER. Pure: boxes → { id: {dx, dy} } in screen px. announce
     and flag never move. Later MOVE ids yield to earlier ones and to FIXED.
     Dock chips (tyre/gear/speed/ERS) rank BEFORE opt-in left-column chips so
     REL/STRATEGY slide off the dash instead of asking TYRES to drop onto the
     steer buttons (844×390 @150%: tyre can only fall ~7 px before ctrl:steer). */
  const PACK_AIR = 4;
  const PACK_SCALE_MIN = 140;
  const PACK_FIXED = Object.freeze({ announce: 1, flag: 1, map: 1, tower: 1 });
  const PACK_DOCK = Object.freeze({ tyre: 1, gearbox: 1, speed: 1, energy: 1 });
  const PACK_MOVE = Object.freeze([
    "tyre", "gearbox", "speed", "energy",
    "rel", "strat", "inputs", "sectors", "limits",
  ]);
  function packPhoneRects(boxes, W, H) {
    const by = Object.create(null);
    const fixed = Object.create(null);
    if (!boxes || !(W > 0) || !(H > 0)) return {};
    // Portrait: keep the dock (tyre/gear/speed/ERS) planted — moving them
    // with margin at --hud-z-bot ≈ 0.6 yeeted TYRES off the top (390×844
    // @150%). Left-column chips still pack against the planted dock.
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
      if (r.L < PACK_AIR) m.dx += PACK_AIR - r.L;
      if (r.T < PACK_AIR) m.dy += PACK_AIR - r.T;
      if (r.R > W - PACK_AIR) m.dx -= r.R - (W - PACK_AIR);
      if (r.B > H - PACK_AIR) m.dy -= r.B - (H - PACK_AIR);
    };
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
        // Escape a FIXED plate (announce/flag/touch/map): left-column chips
        // prefer LEFT (stay under the map) or UP (off a control below).
        // Among peers: prefer a column stack — UP when the obstacle is the
        // dock (tyre/gear) below, DOWN when stacking under a higher chip.
        let dx = 0, dy = 0;
        const leftCol = moverId === "strat" || moverId === "rel" || moverId === "inputs"
          || moverId === "sectors" || moverId === "limits";
        const dockObs = obstacleId === "tyre" || obstacleId === "gearbox"
          || obstacleId === "speed" || obstacleId === "energy";
        if (isFixed(obstacleId)) {
          // Map/tower sit ABOVE the left column — escape DOWN (under them) or
          // LEFT, never UP into the map. Touch discs below: prefer UP.
          if (obstacleId === "map" || obstacleId === "tower") {
            if (leftCol && left > 0 && mr.L - left >= PACK_AIR && left <= down) dx = -left;
            else dy = down;
          } else if (String(obstacleId).indexOf("ctrl:") === 0 && up > 0 && up <= Math.min(down, left, right)) dy = -up;
          else if (leftCol && mr.L - left >= PACK_AIR && left <= Math.min(down, up, right) + 1) dx = -left;
          else if (leftCol && up > 0 && up <= down) dy = -up;
          else if (left <= down) dx = -left;
          else dy = down;
        } else if (leftCol && dockObs) {
          // Opt-in chips yield to the dock: slide UP (or LEFT) off TYRES/GEAR.
          if (up <= left && mr.T - up >= PACK_AIR) dy = -up;
          else if (mr.L - left >= PACK_AIR) dx = -left;
          else if (up <= right) dy = -up;
          else dx = right;
        } else if (leftCol && (obstacleId === "rel" || obstacleId === "strat"
          || obstacleId === "inputs" || obstacleId === "sectors")) {
          // Two left-column chips: slide horizontally. UP climbs into the map
          // (measured: strat×rel → strat y=69 over the minimap). Stack DOWN
          // only when neither side fits — the dock yield above already pulled
          // both chips off TYRES when it could.
          const leftFits = mr.L - left >= PACK_AIR;
          const rightFits = mr.R + right <= W - PACK_AIR;
          if (leftFits && (!rightFits || left <= right)) dx = -left;
          else if (rightFits) dx = right;
          else dy = down;
        } else if (down <= left) {
          dy = down;
        } else {
          dx = -left;
        }
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
    // Reserve a TRACK LIMITS strip under the map when the fit left the chip
    // on the left column (`data-limits-left`). Limits is often hidden until
    // the survey forces it, so the packer never sees the box — without this
    // pad REL climbs into the strip (844×390 @150%: limits×rel 2.4 px).
    if (by.rel && by.map && W >= H) {
      const limH = by.limits ? by.limits.h + PACK_AIR : 24;
      const minT = by.map.y + by.map.dy + by.map.h + PACK_AIR + limH;
      const r = by.rel;
      if (r.y + r.dy < minT) r.dy = minT - r.y;
      clampOn(r);
    }
    // Pocket snap (landscape only): at 150% phoneL STRATEGY cannot sit beside
    // REL under the map (announce owns the mid band) or stack under REL
    // (TYRES owns the dock). Park it RIGHT of the map and ABOVE the radio
    // card. Portrait keeps the iterative pass — the landscape pocket lands
    // under the timing tower (390×844 @150% survey).
    if (by.strat && by.map && W >= H) {
      const s = by.strat, m = by.map, ann = by.announce, rel = by.rel;
      const still = (o) => o && hit(rect(s), rect(o));
      if (still(ann) || still(rel) || still(by.tyre) || still(by.gearbox) || still(m)) {
        const mapR = m.x + m.dx + m.w;
        const mapT = m.y + m.dy;
        const mapB = mapT + m.h;
        const annT = ann ? ann.y : H * 0.45;
        const annB = ann ? ann.y + ann.h : annT;
        let tx = mapR + PACK_AIR;
        // Prefer the pocket ABOVE the radio when strat fits; otherwise sit
        // under the map to its right (idle announce is high — no room above).
        let ty = Math.max(PACK_AIR, Math.min(mapT + PACK_AIR, annT - s.h - PACK_AIR));
        if (!(ty + s.h <= annT - 0.5)) {
          ty = Math.max(mapB + PACK_AIR, annB + PACK_AIR);
          // Stay left of the radio when there is width; else hug map.R.
          if (ann && ann.x - PACK_AIR - s.w >= mapR + PACK_AIR) tx = ann.x - PACK_AIR - s.w;
        }
        if (tx < W - PACK_AIR && ty + s.h <= H - PACK_AIR) {
          s.dx = tx - s.x;
          s.dy = ty - s.y;
          clampOn(s);
          for (let n = 0; n < 6; n++) {
            let any = false;
            for (const o of Object.keys(by)) {
              if (o === "strat") continue;
              const oj = PACK_MOVE.indexOf(o);
              if (!isFixed(o) && oj >= 0 && oj > PACK_MOVE.indexOf("strat")) continue;
              if (separate("strat", o)) any = true;
            }
            if (rel && !isFixed("rel")) {
              for (const o of ["tyre", "gearbox", "announce", "map", "strat"]) {
                if (by[o] && separate("rel", o)) any = true;
              }
            }
            if (!any) break;
          }
        }
      }
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
        if (el.hasAttribute("data-hl-pack-pos")) {
          el.style.removeProperty("left");
          el.style.removeProperty("top");
          el.removeAttribute("data-hl-pack-pos");
        }
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
    if (!doc || !doc.body || !doc.body.classList || doc.body.classList.contains("desktop")) return;
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
      if (!want[id]) continue;
      const el = doc.querySelector(sel);
      if (!el || el.hidden) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      boxes.push({ id, x: r.left, y: r.top, w: r.width, h: r.height });
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
    const corr = packPhoneRects(boxes, W, H);
    if (!corr || !Object.keys(corr).length) return;
    for (const id of Object.keys(corr)) {
      const row = ELEMENTS.find((e) => e[0] === id);
      if (!row) continue;
      const el = doc.querySelector(row[2]);
      if (!el || !el.style) continue;
      const c = corr[id];
      // Paint the correction. Zoomed absolute chips (#hud-strat/#hud-rel) do
      // NOT move under an inline `translate` here (Chromium + CSS zoom: the
      // computed translate stays on the [data-hl]/--hl path and getBounding
      // ClientRect ignores our important translate). Nudge the used left/top
      // by local px instead. Dock chips (tyre/gear/…) keep margin — their
      // flow box has no absolute left/top to rewrite.
      let z = 1;
      if (typeof el.currentCSSZoom === "number" && el.currentCSSZoom > 0) z = el.currentCSSZoom;
      else if (typeof getComputedStyle === "function") {
        const zz = parseFloat(getComputedStyle(el).zoom);
        if (zz > 0) z = zz;
      }
      const lx = c.dx / z, ly = c.dy / z;
      const abs = id === "strat" || id === "rel" || id === "inputs"
        || id === "sectors" || id === "limits" || id === "damage";
      if (abs && typeof getComputedStyle === "function") {
        const cs = getComputedStyle(el);
        const curL = parseFloat(cs.left);
        const curT = parseFloat(cs.top);
        if (isFinite(curL)) el.style.setProperty("left", (curL + lx).toFixed(1) + "px", "important");
        if (isFinite(curT)) el.style.setProperty("top", (curT + ly).toFixed(1) + "px", "important");
        el.setAttribute("data-hl-pack-pos", "");
      } else {
        el.style.setProperty("margin-left", lx.toFixed(1) + "px", "important");
        el.style.setProperty("margin-top", ly.toFixed(1) + "px", "important");
      }
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

  const CLEAR_CTRL = Object.freeze({ rel: 1, inputs: 1, sectors: 1 });
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
      if (el.classList && el.classList.contains("touchbtn") && doc.body && doc.body.classList.contains("desktop")) continue;
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

  // Temporary screen-pixel corrections never enter the saved MOVE & SIZE layout.
  // Controls and primary instruments reserve their space before optional panels.
  const CLEAR_READOUTS = ["speed", "limits", "announce", "damage", "rel", "strat", "inputs"];
  function resetClearance() {
    if (!doc || !doc.querySelector) return;
    for (const [id, , sel] of ELEMENTS) {
      if (CLEAR_READOUTS.indexOf(id) < 0) continue;
      const el = doc.querySelector(sel);
      if (el && el.style) {
        el.style.removeProperty("--hud-clear-x"); el.style.removeProperty("--hud-clear-y");
        el.removeAttribute("data-col-compact"); el.removeAttribute("data-col-drop");
      }
    }
  }
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
    const safe = doc.documentElement && typeof getComputedStyle === "function" ? getComputedStyle(doc.documentElement) : null;
    const inset = (name) => safe && safe.getPropertyValue ? Math.max(0, parseFloat(safe.getPropertyValue(name)) || 0) : 0;
    const bounds = { left: EDGE + inset("--sal"), top: EDGE + inset("--sat"), right: W - EDGE - inset("--sar"), bottom: H - EDGE - inset("--sab") };
    const inside = (r) => r.left >= bounds.left && r.top >= bounds.top && r.right <= bounds.right && r.bottom <= bounds.bottom;
    const blocks = [];
    for (const el of doc.querySelectorAll(".touchbtn, #pausebtn, #btn-cam, #hud-gearbox, #hud-tyre, #hud-energy, #hud-ot, #hud-aero, #hud-bb, .hud-top, #minimap, .hud-gaps, #hud-sectors, #hud-flag, #hud-mirror")) {
      const r = box(el); if (r) blocks.push(r);
    }
    // A player-placed radio is an obstacle, never another automatic candidate.
    const placedRadio = bodyAttr("data-radio-placed");
    if (placedRadio) { const r = box(doc.querySelector("#announce")); if (r) blocks.push(r); }
    const hits = (r, b) => r.left < b.right + EDGE && r.right > b.left - EDGE && r.top < b.bottom + EDGE && r.bottom > b.top - EDGE;
    for (const id of CLEAR_READOUTS) {
      const row = rows.find((e) => e[0] === id), el = doc.querySelector(row[2]);
      // A stale lane collapse has no rectangle to place after rotation or a
      // camera switch. Reopen it locally; the lane producer owns the next reset.
      if (id === "announce" && el && el.hasAttribute("data-lane-collapsed")) {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        el.removeAttribute("data-lane-collapsed");
      }
      let r = box(el); if (!r) continue;
      if (id === "announce" && placedRadio) { blocks.push(r); continue; }
      // SPEED moves only for the desktop visor, where its shipped vertical
      // offset can meet the enlarged gearbox. Everywhere else it has priority.
      if (id === "speed" && !(has("desktop") && shown() === "helmet")) { blocks.push(r); continue; }
      const findSlot = (r) => {
        if (inside(r) && !blocks.some((b) => hits(r, b))) return r;
        let best = null, cost = Infinity;
        const xs = [r.left, bounds.left, bounds.right - r.width], ys = [r.top, bounds.top, bounds.bottom - r.height];
        for (const b of blocks) { xs.push(b.left - EDGE - r.width, b.right + EDGE); ys.push(b.top - EDGE - r.height, b.bottom + EDGE); }
        for (const x of xs) for (const y of ys) {
          if (x < bounds.left || y < bounds.top || x + r.width > bounds.right || y + r.height > bounds.bottom) continue;
          const candidate = { left: x, top: y, right: x + r.width, bottom: y + r.height, width: r.width, height: r.height };
          if (blocks.some((b) => hits(candidate, b))) continue;
          const d = (x - r.left) ** 2 + (y - r.top) ** 2;
          if (d < cost) { best = candidate; cost = d; }
        }
        return best;
      };
      let best = findSlot(r);
      // A narrow dock lane can wrap a long call beyond the available height.
      // Let placement try the card's normal width before accepting a collision.
      if (!best && id === "announce") {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        r = box(el);
        best = r && findSlot(r);
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
      if (best) {
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
    // TYRES is a block for clearReadouts and grows up from its dock anchor (the PLAN and pit rows).
    { const t = doc.querySelector("#hud-tyre"); if (t) clearanceObserver.observe(t, { box: "border-box" }); }
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

  /** Write one element's values into set `setName` of style `pn`; returns the stored {x, y, s}. */
  function set(id, v, setName, pn) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = setArg(setName), p = profArg(pn);
    const st = stored();
    const e = normEl(Object.assign(effective(st, sn, p)[id], v || {}));
    st[p][sn][id] = e;   // save() drops it again when it equals the shipped layout
    save(st);
    apply();
    // A place on MIRROR (data-hl-user) cures the soft hide — same contract as
    // the touch-cockpit chips / SPEED wheel-LCD rule.
    if (id === "mirror") {
      const el = doc && doc.querySelector && doc.querySelector("#hud-mirror");
      if (el && el.hasAttribute && el.hasAttribute("data-hl-user")) revealMirror();
    }
    return e;
  }
  function resetEl(id, setName, pn) {
    return IDS.indexOf(id) < 0 ? null : set(id, shippedEl(id, setArg(setName), profArg(pn)), setName, pn);
  }
  function resetSet(setName, pn) {
    const st = stored();
    st[profArg(pn)][setArg(setName)] = {};
    save(st); apply();
  }

  /** Preset `pid` laid over style `pn` / set `sn`'s shipped layout — the full layout. Pure. */
  function presetLayout(pid, sn, pn) {
    const p = PRESETS.find((q) => q[0] === pid);
    if (!p || !isSet(sn)) return null;
    const pr = isProf(pn) ? pn : "standard";
    const hold = touch() && TOUCH_PRESET_HOLD[sn];
    const out = {};
    for (const id of IDS) {
      const over = hold && hold[id] ? null : p[2][id];
      out[id] = normEl(Object.assign({}, shippedEl(id, sn, pr), over || {}));
    }
    return out;
  }
  /** Write preset `pid` into set `setName` of style `pn` (default: on screen). */
  function applyPreset(pid, setName, pn) {
    const sn = setArg(setName), p = profArg(pn);
    const lay = presetLayout(pid, sn, p);
    if (!lay) return false;
    const st = stored();
    st[p][sn] = lay;
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
    return ps.every((p) => (isSet(setName) ? !Object.keys(st[p][setName]).length : emptyProf(st[p])));
  }

  /** js/ui/hud.js: the race camera (CamModes id) or the HUD style changed. */
  function setCam(modeId) {
    const s = camSet(modeId), p = profile();
    if (s === cam && p === prof) return;
    cam = s;
    apply();
    if (onModeChange) onModeChange();
  }

  /* WHY AN ELEMENT IS NOT ON SCREEN. [ids, test(has, attr, hide), reason, soft].
     The classes are js/ui/hud.js's and the rules css/hud.css's /
     css/track-detail.css's; first match wins. SOFT = the sliders still matter:
     a placed chip shows in a touch cockpit (data-hl-user), and a chip that
     appears only on an event (flag, limits strike, message) is edited blind.
     "cockpit-cam" is the wheel's LCD (gear / speed); the touch-cockpit row
     follows the painted LAYOUT set (shown(), = body[data-hl-set]) instead,
     whatever the wheel. */
  // SPEED rides .hud-bottom with GEAR on BROADCAST+TV (css/hud.css hides the
  // whole band) and shares the wheel-LCD hide with GEAR on cockpit-cam. It is
  // NOT in the plain hud-bcam list — TV cams keep a plated #hud-speed.
  const BOTTOM = ["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb"];
  const CHIPS = ["energy", "ot", "aero"];
  const READOUTS = ["damage", "rel", "strat", "inputs"];   // css/hud.css hides all four on the same classes
  /** body[data-*] presence (mode-switch sets data-helmet-cam / data-wheel-lcd). */
  const bodyAttr = (n) => !!(doc && doc.body && doc.body.hasAttribute && doc.body.hasAttribute(n));
  // Data Hub WATCH / HIGHLIGHTS (css/hud.css). Hard: a placed chip does not
  // bring the driving HUD back. "tower" here is the POS/LAP band (.hud-top),
  // not #bc-tower. The radio card stands down with the rest of the HUD.
  const REPLAY_HUD = ["tower", "map", "gaps", "sectors", "limits", "flag", "mirror", "announce"]
    .concat(BOTTOM, READOUTS);
  const replayOn = (h) => h("bc-on") || h("watch-controls-on");
  const HIDE_RULES = Object.freeze([
    [REPLAY_HUD, replayOn, "a real-race watch keeps the driving HUD off"],
    [["map"], (h) => h("hud-hide-map"), "MAP is off for this camera or style (DISPLAY › HUD › MAP)"],
    [["gaps"], (h) => h("hud-hide-gaps"), "GAPS is off for this style (DISPLAY › HUD › GAPS)"],
    [BOTTOM, (h) => h("hud-prof-broadcast") && h("hud-bcam"), "BROADCAST style on a TV camera keeps the frame clean"],
    [CHIPS.concat(["bb", "sectors"], READOUTS), (h) => h("hud-prof-minimal"), "MINIMAL style"],
    [CHIPS.concat(["bb"]), (h) => h("hud-met-timing"), "LAYOUT is TIMING"],
    [CHIPS.concat(["bb", "sectors", "tyre"]), (h) => h("hud-met-compact"), "LAYOUT is COMPACT"],
    [["sectors"], (h) => h("hud-met-driver"), "LAYOUT is DRIVER"],
    [["gearbox", "ot", "aero", "energy", "bb", "limits"].concat(READOUTS), (h) => h("hud-bcam"), "TV camera"],
    [["sectors"], (h) => h("hud-bcam") && !h("hud-prof-broadcast"), "TV camera"],
    // css/track-detail.css: body.cockpit-cam hides GEAR + SPEED with no data-hl-user escape.
    [["gearbox", "speed"], (h) => h("cockpit-cam"), "the wheel's display shows it in the cockpit"],
    [["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb", "sectors", "limits"].concat(READOUTS), (h, a, off) => off, "turned off in the HUD element list (DISPLAY › HUD)"],
    [["tyre"], (h, a, off, el, live) => !!(live && el && el.hidden), "TYRE WEAR is off (RACE SETTINGS)"],
    [CHIPS.concat(["tyre", "bb"]), (h, a) => shown() === "cockpit" && !h("desktop") && !a, "touch cockpit: no room beside the wheel — move it to show it", true],
    [["ot", "aero", "bb"], (h, a) => shown() === "helmet" && !h("desktop") && !a, "touch helmet: the OT / AERO buttons carry it — move it to show it", true],
    // css/track-detail.css: body[data-helmet-cam][data-wheel-lcd] soft-hides SPEED until placed.
    [["speed"], (h, a) => !h("desktop") && !a && bodyAttr("data-helmet-cam") && bodyAttr("data-wheel-lcd"),
      "touch helmet: the wheel LCD shows it — move it to show it", true],
    [["bb"], (h, a) => !h("desktop") && !a, "touch screens: move it to show it", true],
    [["flag"], () => true, "shows when a flag is out", true],
    [["limits"], () => true, "shows on a track-limits strike", true],
    [["announce"], () => true, "shows with a race message", true],
    // MIRROR: DISPLAY › HUD › MIRROR off greys the sliders (hard). AUTO / a
    // chase cam / a session collapse soft-hides the frame — like SPEED's wheel
    // LCD rule, a place (data-hl-user) turns it ON via revealMirror().
    [["mirror"], (h, a) => !a && mirrorMode() === "off", "MIRROR is off (DISPLAY › HUD › MIRROR)"],
    [["mirror"], (h, a, off, el) => !a && !!(el && el.hidden), "MIRROR is not needed now — move it to show it", true],
  ].map(Object.freeze));
  // body[data-hud-hide~=…] token for each of our ids (js/ui/hud-elements.js).
  const TOGGLE = Object.freeze({ gearbox: "gear", speed: "speed", energy: "energy", tyre: "tyre", ot: "ot", aero: "aero", bb: "bb", sectors: "sectors", limits: "limits",
    damage: "damage", rel: "rel", strat: "strat", inputs: "inputs" });
  /** Live: is element `el` drawn? (hidden attribute, display none, zero box) */
  function drawn(el) {
    if (!el || el.hidden) return false;
    if (typeof getComputedStyle === "function") {
      try { if (getComputedStyle(el).display === "none") return false; } catch (_) { /* a fake or detached node: fall through to the box */ }
    }
    if (!el.getBoundingClientRect) return true;
    const r = el.getBoundingClientRect();
    return !!(r.width && r.height);
  }
  /** Why element `id` is not on screen now: {reason, soft} or null when it is
   *  (or nothing says otherwise). While the HUD is up the live element has the
   *  last word: drawn = null whatever the classes say; hidden with no known
   *  class reads "hidden right now" (soft). Outside a race the classes decide. */
  function hiddenReason(id) {
    const row = ELEMENTS.find((e) => e[0] === id);
    if (!row || !doc) return null;
    const el = doc.querySelector(row[2]);
    const live = hudLive();
    if (live && el && el.hasAttribute && el.hasAttribute("data-col-drop")) return { reason: "not enough room", soft: true };
    if (live && drawn(el)) return null;
    const user = !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
    const hideAttr = doc.body && doc.body.getAttribute ? String(doc.body.getAttribute("data-hud-hide") || "") : "";
    const off = !!TOGGLE[id] && hideAttr.split(/\s+/).indexOf(TOGGLE[id]) >= 0;
    for (const [ids, test, reason, soft] of HIDE_RULES) {
      if (ids.indexOf(id) >= 0 && test(has, user, off, el, live)) return { reason, soft: !!soft };
    }
    return live ? { reason: "hidden right now", soft: true } : null;
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
    fold.id = "pm-hudlayout"; foldEl = fold;   // a plain assignment, so tools/check/shell-ids.mjs sees the mount-once guard's target
    let editing = cam, editingProf = profile(), sel = IDS[0];
    const paintSum = () => { sum.textContent = "MOVE & SIZE · " + (isShipped(undefined, editingProf) ? "SHIPPED" : "CUSTOM"); };

    const help = el("p", { className: "adv-help" });
    body.appendChild(help);
    const paintHelp = () => {
      help.textContent = "Move and resize each race HUD element. You are editing the " + editingProf.toUpperCase() +
        " style's layout: each HUD STYLE keeps its own, because BROADCAST anchors the timing tower, map and gaps differently. " +
        "COCKPIT keeps its own layout, " +
        "because the steering wheel covers the bottom of the screen; on a desktop its shipped layout puts OVERTAKE, AERO, ENERGY " +
        "and TYRES beside the wheel (on a touch screen there is no room beside it, so they stay hidden until you place them). " +
        "HELMET is the visor: the same wheel, but GEAR and SPEED paint too, and on a touch screen ENERGY sits above the wheel and TYRES in the left corner. " +
        "An element marked HIDDEN is not drawn in the current mode, so its sliders are off. " +
        "A PRESET is a starting point you can still tweak. In a race, hold a slider to see the HUD through this page.";
    };
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
    const setPick = stepper("pm-hl-set", "LAYOUT FOR", [["cockpit", "COCKPIT CAM"], ["helmet", "HELMET CAM"], ["other", "OTHER CAMS"]], (v) => {
      editing = v; if (fold.open) preview = v; apply(); paintAll(); peek(true, 900);
    });
    const presetPick = stepper("pm-hl-preset", "PRESET",
      PRESETS.map((p) => [p[0], p[1]]).concat([["custom", "CUSTOM", true]]), (v) => {
        applyPreset(v, editing, editingProf); paintAll(); peek(true, 900);
      });
    const pick = stepper("pm-hl-el", "ELEMENT", ELEMENTS.map((e) => [e[0], e[1]]), (v) => {
      sel = v; selected = sel; apply(); paintAll(); peek(true, 900);
    });

    const painters = [], sliders = [];
    for (const k of ["x", "y", "s"]) {
      const out = el("b");
      const inp = el("input", { type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: k === "s" ? "5" : "1",
        attrs: { "aria-label": NAMES[k].toLowerCase() } });
      inp.id = "pm-hl-" + k;
      sliders.push(inp);
      inp.addEventListener("input", () => {
        const e = set(sel, { [k]: parseFloat(inp.value) }, editing, editingProf);
        out.textContent = txt(k, e[k]); paintSum(); paintPreset();
        peek(true, 900);
      });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      painters.push(() => {
        const n = get(sel, editing, editingProf)[k];
        if (doc.activeElement !== inp) inp.value = String(n);
        out.textContent = txt(k, n);
      });
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }

    // WHY the sliders are off: one line under them, empty when the element shows.
    const why = el("p", { className: "adv-help", attrs: { "aria-live": "polite" } });
    why.id = "pm-hl-why";
    body.appendChild(why);

    const resetOne = el("button", { type: "button", className: "opt-btn", textContent: "RESET ELEMENT" });
    resetOne.id = "pm-hl-reset-el";
    resetOne.addEventListener("click", () => { resetEl(sel, editing, editingProf); paintAll(); peek(true, 900); });
    const resetAll = el("button", { type: "button", className: "opt-btn", textContent: "RESET LAYOUT" });
    resetAll.id = "pm-hl-reset-set";
    resetAll.addEventListener("click", () => { resetSet(editing, editingProf); paintAll(); peek(true, 900); });
    body.appendChild(el("div", { className: "opt-row" }, [resetOne, resetAll]));

    function paintPreset() { const p = presetOf(editing, editingProf); if (presetPick.value !== p) presetPick.value = p; }
    // The picker says which elements the current mode does not draw; a HARD
    // reason greys the sliders (they would move nothing), a soft one only notes it.
    function paintHidden() {
      for (const o of pick.options) {
        const r = hiddenReason(o.value), base = ELEMENTS.find((e) => e[0] === o.value)[1];
        const t = r ? base + " (" + (r.soft ? "" : "hidden: ") + r.reason + ")" : base;
        if (o.textContent !== t) o.textContent = t;
      }
      const r = hiddenReason(sel), off = !!(r && !r.soft);
      for (const inp of sliders) inp.disabled = off;
      resetOne.disabled = off;
      why.textContent = off ? "Not drawn now: " + r.reason + ". Its sliders come back when it shows." : r ? "Note: " + r.reason + "." : "";
    }
    function paintAll() {
      if (!fold.open) editingProf = profile();
      if (setPick.value !== editing) setPick.value = editing;
      if (pick.value !== sel) pick.value = sel;
      for (const p of painters) p();
      paintSum(); paintPreset(); paintHelp(); paintHidden();
    }
    // Open: preview the layout being edited and outline the selected element.
    // Closed: the race shows the camera's layout again.
    fold.addEventListener("toggle", () => {
      if (fold.open) { editing = cam; editingProf = profile(); preview = editing; previewProf = editingProf; selected = sel; }
      else { preview = null; previewProf = null; selected = null; }
      apply(); paintAll();
    });
    // The STYLE / LAYOUT / MAP / GAPS rows share this HUD fold: a change there
    // moves the edited style and what is hidden. Next tick, after it applied.
    const refresh = () => {
      if (fold.open) { editingProf = profile(); previewProf = editingProf; apply(); }
      paintAll();
    };
    host.addEventListener("change", (ev) => { if (!fold.contains(ev.target)) setTimeout(refresh, 0); });
    // SettingRow.wire stops `change` propagation and the chevrons fire none, so
    // the bubbling listener above misses those rows: follow their store keys.
    const ROW_KEYS = ["hudProfile", "hudMetricsLayout", "hudMapVis", "hudGapsVis", "hudMirror"];
    if (store && store.subscribe) store.subscribe((c) => {
      if (c && (ROW_KEYS.indexOf(c.key) >= 0 || (Array.isArray(c.keys) && c.keys.some((k) => ROW_KEYS.indexOf(k) >= 0)))) setTimeout(refresh, 0);
    });
    onModeChange = refresh;   // setCam: the race camera or the painted style changed
    host.appendChild(fold);
    paintAll();
  }

  function init() { apply(); build(); watchPackUnhide(); watchReadoutSizes(); }
  apply();
  _pub = true;
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return {
    KEY, ELEMENTS, SETS, PROFILES, LIM, COCKPIT_CAMS, SHIPPED, TOUCH_SHIPPED, PRESETS,
    PACK_AIR, PACK_SCALE_MIN, PACK_FIXED, PACK_MOVE,
    get, set, resetEl, resetSet, isShipped, scaleOf, setCam, apply, fit, clearReadouts, build,
    camSet, shown: () => shown(), profile, all, migrate, presetLayout, applyPreset, presetOf,
    hiddenReason, originOf, packPhoneRects,
  };
})();
Object.freeze(HudLayout);
