/* Apex 26 — the opt-in RELATIVE box (iRacing-style) for GameHud.
   SETTINGS › DISPLAY › HUD › RELATIVE (js/ui/hud-elements.js, shipped off),
   placed by MOVE & SIZE (js/ui/hud-layout.js "rel").

   The two cars AHEAD and two BEHIND on the ROAD — by arc position, not race
   order, so a backmarker you are about to lap is in it and the leader a lap up
   behind you is too — with the player's own row between them. Each row:
   race position, 3-letter code on the team's colour bar, the gap in seconds
   (- in front, + behind), the tyre letter (PIT while in the lane), and a
   +1L / -1L marker for a car a lap up (red) or down (blue): text first, colour
   second, so the meaning never rides on hue alone.

   THE GAP IS THE GAP CHIPS' OWN MEASURE (js/ui/hud.js gapText): metres of arc
   over max(the player's speed, 0.26 x vTop), smoothed per row (EMA 0.3 at the
   10 Hz HUD tick) and reset when a row's car changes. Nothing is re-derived
   from physics, and nothing here writes to a car: the HUD only reads.

   Pure core (unit-tested in tests/unit/hud-relative.test.mjs): relDist,
   lapsApart, select (fixed slots, allocation-free), fmtGap. tick(G, player)
   is the one js/ui/hud.js call, at the HUD tick. Rows are built at runtime
   inside the static #hud-rel (index.html) — no shell nodes per row, no class
   tokens (data-k / data-lap / data-self attributes; css/hud.css). */
const HudRelative = (function () {
  "use strict";

  const AHEAD = 2, BEHIND = 2, ROWS = AHEAD + 1 + BEHIND, SELF = AHEAD;
  const EMA = 0.3;

  /** Metres car `os` is in FRONT of `ps` on a lap of `total`, in (-total/2, total/2]. */
  function relDist(ps, os, total) {
    let d = (os || 0) - (ps || 0);
    if (!(total > 0)) return d;
    d %= total;
    if (d > total / 2) d -= total;
    else if (d <= -total / 2) d += total;
    return d;
  }
  /** Whole laps between two cars' race distances, beyond what the road shows:
   *  +1 = `o` is a lap UP on `p` (lapping it), -1 = a lap down. */
  function lapsApart(pProg, oProg, rel, total) {
    if (!(total > 0)) return 0;
    const n = Math.round(((oProg || 0) - (pProg || 0) - rel) / total);
    return n === 0 ? 0 : n;   // never -0
  }

  // The row slots: allocated once, rewritten every tick.
  const rows = [];
  for (let i = 0; i < ROWS; i++) rows.push({ car: null, rel: 0, laps: 0, self: i === SELF });
  const _ac = [null, null], _ad = [0, 0], _bc = [null, null], _bd = [0, 0];

  /** Fill `out` (ROWS slots, default the module's own) with the road
   *  neighbours of `player`: [ahead 2, ahead 1, player, behind 1, behind 2].
   *  Retired cars are skipped. Returns how many neighbours were found. */
  function select(cars, player, total, out) {
    out = out || rows;
    _ac[0] = _ac[1] = _bc[0] = _bc[1] = null;
    const n = cars ? cars.length : 0;
    for (let i = 0; i < n; i++) {
      const o = cars[i];
      if (!o || o === player || o.retired) continue;
      const d = relDist(player.s, o.s, total);
      if (d > 0) {
        if (!_ac[0] || d < _ad[0]) { _ac[1] = _ac[0]; _ad[1] = _ad[0]; _ac[0] = o; _ad[0] = d; }
        else if (!_ac[1] || d < _ad[1]) { _ac[1] = o; _ad[1] = d; }
      } else {
        if (!_bc[0] || d > _bd[0]) { _bc[1] = _bc[0]; _bd[1] = _bd[0]; _bc[0] = o; _bd[0] = d; }
        else if (!_bc[1] || d > _bd[1]) { _bc[1] = o; _bd[1] = d; }
      }
    }
    put(out[0], _ac[1], _ad[1], player, total);
    put(out[1], _ac[0], _ad[0], player, total);
    put(out[SELF], player, 0, player, total);
    put(out[3], _bc[0], _bd[0], player, total);
    put(out[4], _bc[1], _bd[1], player, total);
    return (_ac[0] ? 1 : 0) + (_ac[1] ? 1 : 0) + (_bc[0] ? 1 : 0) + (_bc[1] ? 1 : 0);
  }
  function put(r, car, d, player, total) {
    r.car = car; r.rel = car ? d : 0;
    r.laps = car && car !== player ? lapsApart(player.prog, car.prog, d, total) : 0;
  }

  /** "-0.94" for a car 0.94 s in front, "+0.80" behind: HudReadouts.fmtGap, the
   *  chip's own spelling (hundredths under ~10 s, tenths above), then "99+".
   *  The sign is the meaning, never a colour. */
  function fmtGap(sec, ahead, profile) {
    if (typeof HudReadouts !== "undefined" && HudReadouts && typeof HudReadouts.fmtGap === "function") return HudReadouts.fmtGap(sec, ahead, profile);
    const a = Math.abs(sec);   // boots without HudReadouts: the same rule, inline
    return (ahead ? "-" : "+") + (!Number.isFinite(a) ? "--" : a >= 99.5 ? "99+" : a.toFixed(profile === "broadcast" || a < 9.95 ? 2 : 1));
  }
  const lapText = (n) => (n > 0 ? "+" + n + "L" : n < 0 ? n + "L" : "");

  // ---- the DOM (only when the readout is on) ------------------------------
  const doc = typeof document !== "undefined" ? document : null;
  let root = null, built = null;   // #hud-rel, and per row {el, pos, code, gap, tyre, lap}
  const sm = new Array(ROWS).fill(NaN), smWho = new Array(ROWS).fill(null);
  const last = [];                 // per row: the write cache
  for (let i = 0; i < ROWS; i++) last.push({ who: null, rank: -1, pos: "", gap: "", tyre: "", lap: 0, team: "" });

  function build() {
    root = doc && doc.getElementById("hud-rel");
    if (!root) return false;
    built = [];
    for (let i = 0; i < ROWS; i++) {
      const el = doc.createElement("div");
      el.setAttribute("role", "listitem");
      if (i === SELF) el.setAttribute("data-self", "");
      const mk = (k) => { const s = doc.createElement("span"); s.setAttribute("data-k", k); el.appendChild(s); return s; };
      const r = { el, pos: mk("pos"), code: mk("code"), gap: mk("gap"), tyre: mk("tyre"), lap: mk("lap") };
      el.hidden = true;
      root.appendChild(el);
      built.push(r);
    }
    return true;
  }
  const isOn = () => typeof HudElements === "undefined" || HudElements.isOn("rel");
  /** The same team-colour memo js/ui/hud.js teamCss keeps on the team entry. */
  function teamCss(G, t) {
    if (!t || !G.cssCol) return "";
    const rev = G.store ? G.store.rev : 0;
    if (t._cssColor == null || t._cssRev !== rev) { t._cssColor = G.cssCol(t.color); t._cssRev = rev; }
    return t._cssColor;
  }
  function hideAll() { if (root && !root.hidden) root.hidden = true; }

  /** js/ui/hud.js, once per HUD tick (10 Hz). Reads G; never writes a car. */
  function tick(G, player) {
    if (!doc || !player) return;
    if (!root && !build()) return;
    const cars = G.cars, track = G.track;
    if (!isOn() || G.timeTrial || !track || !cars || cars.length < 2) { hideAll(); return; }
    const b = doc.body;
    // MINIMAL and the broadcast cameras hide it in CSS — skip the work too.
    if (b && (b.classList.contains("hud-prof-minimal") || b.classList.contains("hud-bcam") || b.classList.contains("bc-on"))) return;
    if (root.hidden) root.hidden = false;
    select(cars, player, track.total, rows);
    const vFloor = Math.max(player.speed || 0, (G.vTop ? G.vTop() : 80) * 0.26);
    for (let i = 0; i < ROWS; i++) {
      const r = rows[i], dom = built[i], c = last[i], car = r.car;
      if (!car) { if (!dom.el.hidden) dom.el.hidden = true; c.who = null; smWho[i] = null; continue; }
      if (dom.el.hidden) dom.el.hidden = false;
      // Write only when the displayed value changes: gap spelling includes
      // profile and precision boundaries, the rest compare their source values.
      let dirty = false;
      if (i !== SELF) {
        const raw = Math.abs(r.rel) / vFloor;
        if (smWho[i] !== car || !Number.isFinite(sm[i])) { smWho[i] = car; sm[i] = raw; }
        else sm[i] += (raw - sm[i]) * EMA;
        const gap = fmtGap(sm[i], r.rel > 0, G.hudProfile);
        if (c.gap !== gap) { c.gap = gap; dom.gap.textContent = gap; dirty = true; }
      }
      if (c.rank !== (car.rank || 0)) { c.rank = car.rank || 0; c.pos = c.rank ? "P" + c.rank : "-"; dom.pos.textContent = c.pos; dirty = true; }
      if (c.who !== car) { c.who = car; dom.code.textContent = car.code || "---"; dirty = true; }
      const team = teamCss(G, car.team);
      if (c.team !== team) { c.team = team; dom.el.style.setProperty("--rel-team", team || "transparent"); }
      const tyre = car.pitState === "lane" || car.pitState === "box" ? "PIT" : (car.tyre && car.tyre.code) || "-";
      if (c.tyre !== tyre) { c.tyre = tyre; dom.tyre.textContent = tyre; dirty = true; }
      if (c.lap !== r.laps) {
        c.lap = r.laps; dirty = true;
        dom.lap.textContent = lapText(r.laps);
        if (r.laps > 0) dom.el.setAttribute("data-lap", "up");
        else if (r.laps < 0) dom.el.setAttribute("data-lap", "down");
        else dom.el.removeAttribute("data-lap");
      }
      if (dirty) dom.el.setAttribute("aria-label", rowLabel(c.pos, car.code, i === SELF, c.gap, r.rel > 0, tyre, r.laps));
    }
    // TOUCH clearance: css/hud.css caps #hud-rel above the left dock at high
    // HUD SIZE. When that max-height clips, drop the farthest road neighbours
    // first (never the player's row) so we never paint a half-row over BRAKE.
    fitRows();
  }
  const CLEAR_IDS = Object.freeze(["dock-left", "btn-brake", "btn-throttle", "btn-steer-left", "btn-steer-right"]);
  /** Cap the card above any overlapping left-column control, then hide the
   *  outermost occupied rows until it fits. CSS max-height can miss TILT
   *  (no steer-* class; BRAKE sits in the map column). */
  function fitRows() {
    if (!root || !built) return;
    const b = doc && doc.body;
    if (b && b.classList && b.classList.contains("desktop")) {
      if (root.style && root.style.removeProperty) root.style.removeProperty("max-height");
      return;
    }
    if (root.getBoundingClientRect && doc.getElementById && root.style) {
      // Re-derive from the CSS box every pass: left / max-height are only ever
      // SET on a clash, so a clash that went away (STEERING back to BUTTONS, a
      // lower HUD SIZE, a rotation) otherwise left the card offset and truncated
      // until reload (a stale max-height also makes scrollHeight > clientHeight
      // hide rows).
      if (root.style.removeProperty) { root.style.removeProperty("left"); root.style.removeProperty("max-height"); }
      const rootEl = doc.documentElement;
      let zPub = 1;
      if (rootEl && rootEl.style && rootEl.style.getPropertyValue) {
        const inline = parseFloat(rootEl.style.getPropertyValue("--hud-z-top"));
        if (Number.isFinite(inline) && inline > 0) zPub = inline;
      } else if (rootEl && typeof getComputedStyle === "function") {
        try {
          const cs = parseFloat(getComputedStyle(rootEl).getPropertyValue("--hud-scale"));
          if (Number.isFinite(cs) && cs > 0) zPub = cs;
        } catch (_) { /* mini-dom / VM */ }
      }
      const live = root.currentCSSZoom > 0 ? root.currentCSSZoom : zPub;
      const z = Math.min(zPub, live);
      for (let pass = 0; pass < 3; pass++) {
        const rr = root.getBoundingClientRect();
        if (!(rr.width && rr.height)) break;
        let cap = Infinity, slide = 0, hit = false;
        for (let i = 0; i < CLEAR_IDS.length; i++) {
          const el = doc.getElementById(CLEAR_IDS[i]);
          if (!el || el.hidden) continue;
          const box = el.getBoundingClientRect();
          if (!(box.width && box.height)) continue;
          const hitX = box.left < rr.right - 0.5 && rr.left < box.right - 0.5;
          const hitY = box.top < rr.bottom - 0.5 && rr.top < box.bottom - 0.5;
          if (!hitX || !hitY) continue;
          hit = true;
          // TILT parks BRAKE in the map column: slide past the pedal, else cap height.
          if (box.left <= rr.left + 24 || box.right - rr.left < rr.width * 0.7)
            slide = Math.max(slide, (box.right + 8) / z);
          if (rr.top < box.top - 4) cap = Math.min(cap, (box.top - rr.top - 6) / z);
        }
        if (!hit) break;
        if (slide > 0) root.style.left = slide.toFixed(1) + "px";
        if (Number.isFinite(cap) && cap > 28) root.style.maxHeight = cap.toFixed(1) + "px";
      }
    }
    if (!(root.clientHeight > 0)) return;
    const order = [0, 4, 1, 3];
    for (let k = 0; k < order.length && root.scrollHeight > root.clientHeight + 1; k++) {
      const dom = built[order[k]];
      if (dom && !dom.el.hidden) dom.el.hidden = true;
    }
  }
  /** The words a screen reader says for one row. */
  function rowLabel(pos, code, self, gap, ahead, tyre, laps) {
    return pos + " " + (code || "") + (self ? ", you" : ", " + gap.slice(1) + " seconds " + (ahead ? "ahead" : "behind"))
      + ", tyre " + tyre + (laps > 0 ? ", " + laps + " lap up" : laps < 0 ? ", " + -laps + " lap down" : "");
  }

  return Object.freeze({ ROWS, SELF, relDist, lapsApart, select, fmtGap, lapText, rowLabel, tick, fitRows, rows });
})();
