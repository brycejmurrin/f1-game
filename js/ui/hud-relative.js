const HudRelative = (function () {
  "use strict";

  const AHEAD = 2, BEHIND = 2, ROWS = AHEAD + 1 + BEHIND, SELF = AHEAD;
  const EMA = 0.3;

  function relDist(ps, os, total) {
    let d = (os || 0) - (ps || 0);
    if (!(total > 0)) return d;
    d %= total;
    if (d > total / 2) d -= total;
    else if (d <= -total / 2) d += total;
    return d;
  }
  function lapsApart(pProg, oProg, rel, total) {
    if (!(total > 0)) return 0;
    const n = Math.round(((oProg || 0) - (pProg || 0) - rel) / total);
    return n === 0 ? 0 : n;
  }

  const rows = [];
  const dropped = new Array(ROWS).fill(false);
  for (let i = 0; i < ROWS; i++) rows.push({ car: null, rel: 0, laps: 0, self: i === SELF });
  const _ac = [null, null], _ad = [0, 0], _bc = [null, null], _bd = [0, 0];

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

  function fmtGap(sec, ahead, profile) {
    if (typeof HudReadouts !== "undefined" && HudReadouts && typeof HudReadouts.fmtGap === "function") return HudReadouts.fmtGap(sec, ahead, profile);
    const a = Math.abs(sec);
    return (ahead ? "-" : "+") + (!Number.isFinite(a) ? "--" : a >= 99.5 ? "99+" : a.toFixed(profile === "broadcast" || a < 9.995 ? 2 : 1));
  }
  const lapText = (n) => (n > 0 ? "+" + n + "L" : n < 0 ? n + "L" : "");

  const doc = typeof document !== "undefined" ? document : null;
  let root = null, built = null;
  const sm = new Array(ROWS).fill(NaN), smWho = new Array(ROWS).fill(null);
  const last = [];
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
  function teamCss(G, t) {
    if (!t || !G.cssCol) return "";
    const rev = G.store ? G.store.rev : 0;
    if (t._cssColor == null || t._cssRev !== rev) { t._cssColor = G.cssCol(t.color); t._cssRev = rev; }
    return t._cssColor;
  }
  function hideAll() { if (root && !root.hidden) root.hidden = true; }

  function tick(G, player) {
    if (!doc || !player) return;
    if (!root && !build()) return;
    const cars = G.cars, track = G.track;
    if (!isOn() || G.timeTrial || !track || !cars || cars.length < 2) { hideAll(); return; }
    const b = doc.body;
    if (b && (b.classList.contains("hud-prof-minimal") || b.classList.contains("hud-bcam") || b.classList.contains("bc-on"))) return;
    if (root.hidden) root.hidden = false;
    select(cars, player, track.total, rows);
    const vFloor = Math.max(player.speed || 0, (G.vTop ? G.vTop() : 80) * 0.26);
    for (let i = 0; i < ROWS; i++) {
      const r = rows[i], dom = built[i], c = last[i], car = r.car;
      if (!car) { if (!dom.el.hidden) dom.el.hidden = true; c.who = null; smWho[i] = null; continue; }
      if (dom.el.hidden && !dropped[i]) dom.el.hidden = false;
      let dirty = false;
      if (i !== SELF) {
        const rough = Math.abs(r.rel) / vFloor;
        const raw = typeof HudReadouts !== "undefined" && HudReadouts.gaps
          ? (r.rel > 0 ? HudReadouts.gaps.between(car, G.player, G.raceT || 0, rough, r.laps * track.total) : HudReadouts.gaps.between(G.player, car, G.raceT || 0, rough, -r.laps * track.total)) : rough;
        if (smWho[i] !== car || !Number.isFinite(sm[i])) { smWho[i] = car; sm[i] = raw; }
        else sm[i] += (raw - sm[i]) * EMA;
        const gap = fmtGap(sm[i], r.rel > 0, G.hudProfile);
        if (c.gap !== gap) { c.gap = gap; dom.gap.textContent = gap; dirty = true; }
      }
      if (c.rank !== (car.rank || 0)) { c.rank = car.rank || 0; c.pos = c.rank ? "P" + c.rank : "-"; dom.pos.textContent = c.pos; dirty = true; }
      if (c.who !== car) { c.who = car; dom.code.textContent = car.code || "---"; dirty = true; }
      const team = teamCss(G, car.team);
      if (c.team !== team) { c.team = team; dom.el.style.setProperty("--rel-team", team || "transparent"); }
      const tyre = (typeof HudReadouts !== "undefined" ? HudReadouts.inPit : (c) => !!(c && c.pitState && c.pitState !== "none"))(car) ? "PIT" : (car.tyre && car.tyre.code) || "-";
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
    const key = fitKey();
    if (key !== fitSeen) fitRows();
    else if (++fitAge >= FIT_REFRESH) { fitAge = 0; if (geoKey() !== geoSeen) fitRows(); }
  }
  let fitSeen = null, fitAge = 0, geoSeen = null;
  const FIT_REFRESH = 10;
  function geoKey() {
    if (!root || !root.getBoundingClientRect || !doc.getElementById) return "";
    if (root.hasAttribute && root.hasAttribute("data-hl-user")) return "user";
    if (doc.body && doc.body.classList && doc.body.classList.contains("desktop")) return "desktop";
    const r = (b) => Math.round(b.left) + "," + Math.round(b.top) + "," + Math.round(b.width) + "," + Math.round(b.height);
    let k = r(root.getBoundingClientRect());
    for (let i = 0; i < CLEAR_IDS.length; i++) {
      const el = doc.getElementById(CLEAR_IDS[i]);
      k += "|" + (el && !el.hidden && el.getBoundingClientRect ? r(el.getBoundingClientRect()) : "-");
    }
    return k;
  }
  const VOLATILE_CLS = /(^|\s)(ot|ax)-\S*/g;
  function clearSig() {
    let k = "";
    if (doc.getElementById) for (let i = 0; i < CLEAR_IDS.length; i++) {
      const c = doc.getElementById(CLEAR_IDS[i]);
      k += "|" + (c ? (c.hidden ? "h" : "v") + String(c.className || "").replace(VOLATILE_CLS, "") : "-");
    }
    return k;
  }
  function fitKey() {
    if (!isOn()) return "off" + clearSig();
    let k = "";
    for (let i = 0; i < ROWS; i++) k += rows[i].car ? "1" : "0";
    const w = doc.defaultView || (typeof window !== "undefined" ? window : null);
    k += "|" + (typeof GameHud !== "undefined" && GameHud.vpKey ? GameHud.vpKey() : w ? w.innerWidth + "x" + w.innerHeight : "");
    const el = doc.documentElement;
    k += "|" + (el && el.style && el.style.getPropertyValue ? el.style.getPropertyValue("--hud-z-top") : "");
    k += "|" + (doc.body ? doc.body.className : "");
    k += "|" + (doc.body && doc.body.getAttribute ? doc.body.getAttribute("data-hl-set") || "" : "");
    return k + clearSig();
  }
  const CLEAR_IDS = Object.freeze(["dock-left", "btn-brake", "btn-throttle", "btn-steer-left", "btn-steer-right",
    "hud-gearbox", "hud-ot", "hud-aero", "hud-speed", "announce"]);
  const LEFT_SLIDE_IDS = Object.freeze(["dock-left", "btn-brake", "btn-steer-left", "btn-steer-right"]);
  const CENTRE_SLIDE_IDS = Object.freeze(["hud-ot", "hud-aero"]);
  function fitRows() {
    if (fitRowsNow() && typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
    geoSeen = built ? geoKey() : null;
  }
  function fitRowsNow() {
    if (!root || !built) return;
    fitSeen = fitKey(); fitAge = 0;
    for (let i = 0; i < ROWS; i++) {
      const hidden = !rows[i].car;
      dropped[i] = false;
      if (built[i].el.hidden !== hidden) built[i].el.hidden = hidden;
    }
    if (root.style && root.style.removeProperty) {
      root.style.removeProperty("left"); root.style.removeProperty("max-height");
      root.style.removeProperty("--hud-clear-x"); root.style.removeProperty("--hud-clear-y");
    }
    if (root.removeAttribute) { root.removeAttribute("data-col-compact"); root.removeAttribute("data-col-drop"); root.removeAttribute("data-fit-drop"); }
    if (root.hasAttribute && root.hasAttribute("data-hl-user")) return;
    const b = doc && doc.body;
    if (b && b.classList && b.classList.contains("desktop")) return;
    let measured = false;
    if (root.getBoundingClientRect && doc.getElementById && root.style) {
      measured = true;
      const rootEl = doc.documentElement;
      let zPub = 0;
      if (rootEl && rootEl.style && rootEl.style.getPropertyValue) {
        zPub = parseFloat(rootEl.style.getPropertyValue("--hud-z-top")) ||
               parseFloat(rootEl.style.getPropertyValue("--hud-scale")) || 0;
      }
      if (!(zPub > 0) && rootEl && typeof getComputedStyle === "function") {
        try { zPub = parseFloat(getComputedStyle(rootEl).getPropertyValue("--hud-scale")) || 0; } catch (_) {  }
      }
      if (!(zPub > 0)) zPub = 1;
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
          const id = CLEAR_IDS[i];
          const doCap = rr.top < box.top - 4;
          const leftish = LEFT_SLIDE_IDS.indexOf(id) >= 0
            && (box.left <= rr.left + 24 || box.right - rr.left < rr.width * 0.7);
          const centreSlide = CENTRE_SLIDE_IDS.indexOf(id) >= 0;
          if (doCap) cap = Math.min(cap, (box.top - rr.top - 6) / z);
          if (leftish) slide = Math.max(slide, (box.right + 8) / z);
          else if (centreSlide && !doCap) {
            const next = (box.right + 8) / z;
            const w = (doc.defaultView || (typeof window !== "undefined" ? window : null));
            const vw = typeof GameHud !== "undefined" && GameHud.vp ? GameHud.vp()[0] : w ? w.innerWidth || 0 : 0;
            let limit = w ? (vw - rr.width - 8) / z : next;
            const dockIds = ["btn-throttle", "btn-brake", "btn-ot", "btn-aero", "btn-boost"];
            for (let d = 0; d < dockIds.length; d++) {
              const de = doc.getElementById(dockIds[d]);
              if (!de || de.hidden || !de.getBoundingClientRect) continue;
              const db = de.getBoundingClientRect();
              if (db.width && db.height) limit = Math.min(limit, (db.left - rr.width - 8) / z);
            }
            if (next <= limit) slide = Math.max(slide, next);
          }
        }
        if (!hit) break;
        if (slide > 0) root.style.left = slide.toFixed(1) + "px";
        if (Number.isFinite(cap) && cap > 0) root.style.maxHeight = cap.toFixed(1) + "px";
      }
    }
    if (!(root.clientHeight > 0)) return measured;
    const order = [0, 4, 1, 3];
    let shown = 0;
    for (let i = 0; i < ROWS; i++) if (!built[i].el.hidden) shown++;
    for (let k = 0; k < order.length && shown > 2 && root.scrollHeight > root.clientHeight + 1; k++) {
      const dom = built[order[k]];
      if (dom && !dom.el.hidden) { dom.el.hidden = true; dropped[order[k]] = true; shown--; }
    }
    if (root.scrollHeight > root.clientHeight + 1) {
      if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts && measured) {
        for (let i = 0; i < ROWS; i++) if (dropped[i]) { dropped[i] = false; built[i].el.hidden = false; }
        if (root.style && root.style.removeProperty) { root.style.removeProperty("left"); root.style.removeProperty("max-height"); }
      } else if (root.setAttribute) root.setAttribute("data-fit-drop", "");
    }
    return measured;
  }
  function rowLabel(pos, code, self, gap, ahead, tyre, laps) {
    const g = gap.slice(1);
    const side = ahead ? "ahead" : "behind";
    const dist = g === "--" ? I18n.t("hud.rel.gapUnknown", null, "gap unknown")
      : g === "99+" ? I18n.t("hud.rel.over99." + side, null, "over 99 seconds " + side)
      : I18n.t("hud.rel.gap." + side, { s: g }, "{s} seconds " + side);
    const lapWord = (n) => I18n.t("hud.rel.laps", { n }, "{n, plural, one {# lap} other {# laps}}");
    return pos + " " + (code || "") + (self ? ", " + I18n.t("hud.rel.you", null, "you") : ", " + dist)
      + ", " + I18n.t("hud.rel.tyre", { tyre }, "tyre {tyre}")
      + (laps > 0 ? ", " + I18n.t("hud.rel.up", { laps: lapWord(laps) }, "{laps} up") : laps < 0 ? ", " + I18n.t("hud.rel.down", { laps: lapWord(-laps) }, "{laps} down") : "");
  }

  function refit(force) { if (isOn() && (force || fitKey() !== fitSeen)) fitRows(); }
  return Object.freeze({ ROWS, SELF, relDist, lapsApart, select, fmtGap, lapText, rowLabel, tick, fitRows, refit, fitKey, rows });
})();
