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
  // [id, label, selector, transform-origin, column]. THE COLUMN is where the piece lives on screen —
  // left (the map's column), right (under the pause / cam buttons), centre (the tower, the mirror and
  // what hangs under them) or bottom (the cluster over the wheel) — and it decides the rest: the
  // ORIGIN keeps a piece growing away from its column's edge (the centred pieces, `left: 50%;
  // transform: translateX(-50%)`, scale about their UNtransformed left edge, which is the screen's
  // centre line, so they stay centred as they grow), and a moved piece in a SIDE column is nudged off
  // the touch controls (CLEAR_CTRL). js/ui/hud.js's column allocators stack the same side pieces.
  // The column here is the shipped one; columnOf() is the live one (LIMITS crosses to the left column
  // under :root[data-limits-left], RELATIVE's touch home is the left column).
  const ORIGIN = Object.freeze({ left: "top left", right: "top right", centre: "top left", bottom: "bottom center" });
  const ELEMENTS = Object.freeze([
    ["tower", "TIMING TOWER", ".hud-top", "centre"],
    ["map", "TRACK MAP", "#minimap", "left"],
    ["gaps", "GAPS", ".hud-gaps", "left"],
    ["sectors", "SECTORS", "#hud-sectors", "right"],
    ["limits", "TRACK LIMITS", "#hud-limits", "right"],   // "left" when js/ui/hud.js crosses it to the left column (columnOf)
    ["flag", "FLAGS", "#hud-flag", "centre"],
    ["mirror", "MIRROR", "#hud-mirror", "centre"],
    ["announce", "RACE MESSAGES", "#announce", "centre"],
    ["gearbox", "GEAR", "#hud-gearbox", "bottom"],
    ["speed", "SPEED", "#hud-speed", "bottom"],   // its own piece since the HELMET set (visor HUD) lifts it off the wheel
    ["energy", "ENERGY", "#hud-energy", "bottom"],
    ["tyre", "TYRES", "#hud-tyre", "bottom"],
    ["ot", "OVERTAKE", "#hud-ot", "bottom"],
    ["aero", "AERO", "#hud-aero", "bottom"],
    ["bb", "BRAKE BIAS", "#hud-bb", "bottom"],
    ["damage", "DAMAGE", "#hud-damage", "right"],
    ["rel", "RELATIVE", "#hud-rel", "right"],   // desktop: under the right column at 38svh; touch: the left column (columnOf)
    ["strat", "STRATEGY", "#hud-strat", "left"],
    ["inputs", "INPUTS", "#hud-inputs", "right"],   // under the sector column (desktop + touch); was bottom left over SPEED & GEAR at 150%
  ].map((e) => Object.freeze([e[0], e[1], e[2], ORIGIN[e[3]], e[3]])));
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

  /** The LIVE column of element `id`: TRACK LIMITS crosses to the left one under
   *  :root[data-limits-left] (js/ui/hud.js), and RELATIVE's touch home is the left column
   *  (css/hud.css body:not(.desktop) #hud-rel) — everything else stays in its shipped column. */
  function columnOf(id) {
    const row = ELEMENTS.find((e) => e[0] === id);
    if (!row) return null;
    const root = doc && doc.documentElement, body = doc && doc.body;
    if (id === "limits" && root && root.hasAttribute && root.hasAttribute("data-limits-left")) return "left";
    // Touch landscape (js/ui/hud.js fitHud: data-sectors-left): S1-S3 lead the left column, DAMAGE beside LIMITS.
    if ((id === "sectors" || id === "damage") && root && root.hasAttribute && root.hasAttribute("data-sectors-left")) return "left";
    if (id === "rel" && body && body.classList && !body.classList.contains("desktop")) return "left";
    return row[4];
  }
  /** transform-origin for element `id` from its LIVE column: a left-anchored chip must grow away from
   *  the LEFT edge (LIMITS crossed left; a touch RELATIVE, which grew off its left anchor before). */
  function originOf(id) {
    const col = columnOf(id);
    return col ? ORIGIN[col] : null;
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
    fit();
    // A move changes what fitHud measured: let it re-lay the bands out now
    // (js/ui/hud.js; optional — absent at eval and in node harnesses).
    if (typeof GameHud !== "undefined" && GameHud && typeof GameHud.invalidateFit === "function") GameHud.invalidateFit();
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
      for (const m of g) {
        if (dx) m.el.style.setProperty("--hl-x", String(+(m.e.x + dx / W * 100).toFixed(2)));
        if (dy) m.el.style.setProperty("--hl-y", String(+(m.e.y + dy / H * 100).toFixed(2)));
      }
    }
    // READOUT-ON-CONTROL: a MOVE & SIZE offset chosen on a wide desktop can
    // land a side-column piece (RELATIVE / INPUTS / SECTORS, the map, ...) on a
    // phone's touch discs. After the edge clamp, nudge every CLEAR_CTRL piece
    // left/up off any visible .touchbtn (and off SPEED & GEAR) so a placed
    // chip cannot cover a tap target.
    clearControls(W, H);
  }

  // Every SIDE-column piece (ELEMENTS' column): a moved map, gap strip, LIMITS / DAMAGE chip or opt-in
  // readout can land on a phone's tap targets as easily as RELATIVE / INPUTS / SECTORS (the three this
  // used to list by hand). The centre pieces have their own clearance (the radio card's slot, the
  // flag's --mir-bot) and the bottom cluster sits among the controls by design.
  const CLEAR_CTRL = Object.freeze(Object.fromEntries(ELEMENTS.filter((e) => e[4] === "left" || e[4] === "right").map((e) => [e[0], 1])));
  function clearControls(W, H) {
    if (!doc || !doc.querySelectorAll) return;
    const btns = [];
    const desk = !!(doc.body && doc.body.classList.contains("desktop"));
    const take = (el, r, tap) => {
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return;
      // Desktop: ignore touch discs that stay in the tree but are not the
      // player's controls; keep SPEED & GEAR so INPUTS still clears them.
      if (tap && desk) return;
      btns.push(r);
    };
    // fitHud's obstacle list (js/ui/hud.js), collected after the dock caps and the dock inset: the
    // same boxes the radio card and the phone-clash check judge. Without a HUD (node harnesses,
    // the menus) the tap targets are queried here, as before.
    const list = typeof GameHud !== "undefined" && GameHud && typeof GameHud.obstacles === "function" ? GameHud.obstacles() : null;
    if (list && list.length) {
      for (const o of list) if (o.tap || o.id === "gearbox" || o.id === "speed") take(o.el, o.rect, !!o.tap);
    } else {
      const nodes = doc.querySelectorAll(".touchbtn, #hud-gearbox, #hud-speed");
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        take(el, r, !!(el.classList && el.classList.contains("touchbtn")));
      }
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
      let dx = 0, dy = 0;
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
    // js/ui/hud.js placeRightColumn / placeLeftColumn: no free slot in its column on this screen, even at
    // the column's smallest readable size (data-col-drop). A place
    // (data-hl-user) takes it out of the allocator, so the sliders cure it.
    [["sectors", "limits", "damage", "inputs", "rel", "strat"], (h, a, off, el) => !a && !!(el && el.hasAttribute && el.hasAttribute("data-col-drop")),
      "no room in its column on this screen — move it to show it", true],
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
    if (el.hasAttribute && el.hasAttribute("data-col-drop")) return false;   // laid out but painted invisible (no room)
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

  function init() { apply(); build(); }
  apply();
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return {
    KEY, ELEMENTS, SETS, PROFILES, LIM, COCKPIT_CAMS, SHIPPED, TOUCH_SHIPPED, PRESETS,
    get, set, resetEl, resetSet, isShipped, scaleOf, setCam, apply, fit, build,
    camSet, shown: () => shown(), profile, all, migrate, presetLayout, applyPreset, presetOf,
    hiddenReason, originOf, columnOf, CLEAR_CTRL,
  };
})();
Object.freeze(HudLayout);
