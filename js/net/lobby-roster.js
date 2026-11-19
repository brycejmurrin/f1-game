const LobbyRoster = (function () {
  "use strict";

  const TEAM_OF = (p) => (p && p.team && Teams.LIST.find((t) => t.id === p.team)) || null;

  function css(rgb) {
    if (!Array.isArray(rgb)) return "#888";
    const b = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
    return `rgb(${b[0]},${b[1]},${b[2]})`;
  }

  function span(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  function rosterDriverName(profile) {
    const team = TEAM_OF(profile);
    if (!team) return "Choosing…";
    const seat = profile ? (profile.driver || 0) : 0;
    const d = team.drivers ? team.drivers[seat] : null;
    return d ? (d.name || d.code || "—") : "—";
  }

  function rosterTeamShort(profile) {
    const team = TEAM_OF(profile);
    return team ? team.short : "—";
  }

  function rosterSeatRow(profile, ready, peerId, decorate) {
    const team = TEAM_OF(profile);
    const full = team
      ? `${team.name}${profile && team.drivers
        ? " · " + ((team.drivers[profile.driver || 0] && team.drivers[profile.driver || 0].name) || "")
        : ""}`
      : "Still choosing a car";
    const li = document.createElement("li");
    li.className = "vs-driver vs-roster-seat";
    const dot = document.createElement("span");
    dot.className = "vs-roster-dot" + (ready ? " on" : "");
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", ready ? "Ready" : "Not ready");
    dot.title = ready ? "Ready" : "Not ready";
    const who = span("vs-who", peerId == null ? "You" : rosterTeamShort(profile));
    const frag = document.createDocumentFragment();
    frag.appendChild(dot);
    frag.appendChild(who);
    if (team) {
      const swatch = span("vs-swatch", "");
      swatch.style.background = css(team.color);
      frag.appendChild(swatch);
    }
    const car = span("vs-car", rosterDriverName(profile));
    car.title = full;
    frag.appendChild(car);
    li.appendChild(frag);
    return peerId != null ? decorate(li, peerId) : li;
  }

  function replace(el, node) {
    while (el.firstChild) el.removeChild(el.firstChild);
    if (node) el.appendChild(node);
  }

  function summaryRow(label, value) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = String(value);
    row.appendChild(dt); row.appendChild(dd);
    return row;
  }

  const LIV_STR_MAX = 64;
  const rgb3 = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number" && isFinite(n));
  const col3 = (a) => a.map((n) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000);
  const livFields = () => (typeof Liveries !== "undefined" && Liveries.FIELDS) || [];
  const livEnumOk = (k, v) => (typeof Teams !== "undefined" && Teams.liveryEnumOk
    ? Teams.liveryEnumOk(k, v) : !(v in Object.prototype));
  function cleanLivery(l) {
    if (!l || typeof l !== "object" || Array.isArray(l) || !rgb3(l.c1) || !rgb3(l.c2)) return null;
    const fields = livFields(), keys = Object.keys(l);
    if (keys.length > fields.length + 2) return null;
    const out = { c1: col3(l.c1), c2: col3(l.c2) };
    for (const k of keys) {
      if (k === "c1" || k === "c2") continue;
      const v = l[k];
      if (!fields.includes(k)) return null;
      if (rgb3(v)) out[k] = col3(v);
      else if (typeof v === "string" && v && v.length <= LIV_STR_MAX && livEnumOk(k, v)) out[k] = v;
      else return null;
    }
    return out;
  }
  function packLivery(resolved) {
    if (!resolved || resolved.id === "default") return null;
    const m = typeof Liveries !== "undefined" && Liveries.migratePaint ? Liveries.migratePaint(Object.assign({}, resolved)) : resolved;
    const sparse = { c1: m.c1, c2: m.c2 };
    for (const k of livFields()) if (rgb3(m[k]) || (typeof m[k] === "string" && m[k])) sparse[k] = m[k];
    return cleanLivery(sparse);
  }
  function withLivery(p, G) {
    let liv = null;
    try {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0], id = G.getLiveryId(team.id);
      liv = id === "default" ? null : packLivery(G.getLiveries(team).find((l) => l && l.id === id));
    } catch (e) { liv = null; }
    if (liv) p.liv = liv;
    return p;
  }
  function fullLivery(l, id) {
    const m = typeof Liveries !== "undefined" && Liveries.migratePaint ? Liveries.migratePaint(Object.assign({}, l)) : l;
    const v = { id, c1: m.c1, c2: m.c2 };
    for (const k of livFields()) v[k] = m[k] || null;
    return v;
  }
  function livHash(l) {
    const s = JSON.stringify(l);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  const FACTORY_PAINT = Object.freeze({ factory: true });
  function peerPaint(profile) {
    const liv = profile && cleanLivery(profile.liv);
    return liv ? { livery: fullLivery(liv, "peer"), tag: "~p" + livHash(liv) } : FACTORY_PAINT;
  }
  function paintField(cars, remotes) {
    for (const c of cars) if (c) c.netPaint = undefined;
    for (const r of remotes) if (r.car && r.car.team && r.profile) r.car.netPaint = peerPaint(r.profile);
  }

  function verifyButton(id, code, onConfirm) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.verifyConfirm = id;
    b.textContent = "CODES MATCH";
    b.setAttribute("aria-label", "Their screen shows " + code + " too");
    b.addEventListener("click", () => onConfirm(id));
    return b;
  }

  function cleanHello(p) {
    if (!p || typeof p !== "object") return null;
    const out = { team: p.team, driver: p.driver, parts: null };
    const liv = cleanLivery(p.liv);
    if (liv) out.liv = liv;
    if (p.from != null) out.from = p.from;
    if (p.rank != null) out.rank = p.rank;
    if (p.parts && typeof p.parts === "object") {
      out.parts = {};
      for (const k of Object.keys(p.parts).slice(0, 24)) if (["string", "number"].includes(typeof p.parts[k])) out.parts[k] = p.parts[k];
    }
    return out;
  }
  function cleanCodeProfile(p) {
    const out = cleanHello(p);
    if (out) { delete out.from; delete out.rank; delete out.liv; }
    return out;
  }

  function heldSeat(peers, id, mySeat, rankOf) {
    const p = peers.get(id);
    if (!p || !p.team) return null;
    const driver = p.driver || 0, seat = p.team + ":" + driver;
    if (seat === mySeat) return null;
    for (const [k, o] of peers) {
      if (k !== id && o && o.team === p.team && (o.driver || 0) === driver && rankOf(k) < rankOf(id)) return null;
    }
    return seat;
  }

  return { TEAM_OF, css, span, replace, summaryRow, rosterDriverName, rosterTeamShort, rosterSeatRow,
    cleanHello, cleanCodeProfile, heldSeat, cleanLivery, packLivery, withLivery, peerPaint, paintField, verifyButton };
})();
Object.freeze(LobbyRoster);
