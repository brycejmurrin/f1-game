/* Apex 26 — LobbyRoster: the stateless leaves of the VS FRIEND room's roster DOM (team lookup, css colour, span/replace/summaryRow
   helpers, driver/team labels, the seat row). Pure move out of lobby.js (#1655). rosterSeatRow takes a `decorate(li, peerId)`
   so the lobby's verify + host-remove wrappers stay with the lobby. */
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

  // ── A PEER'S PAINT (#5037) ─────────────────────────────────────────────────
  // A friend's car used to be painted from MY store (my livery id for their team),
  // because no payload carried a livery. HELLO now carries `liv`: the sender's
  // fitted paint job, sparse (set fields only, colours to 3 decimals), and only
  // when it is not the team's factory one. It is a peer's word, so it is checked
  // whole on receipt and REFUSED WHOLE on any violation (the car then races in
  // factory colours): the two base colours are required; every other key must be
  // one Liveries.FIELDS names; every value must be an rgb triple of finite
  // numbers (clamped to 0..1) or a short string Teams.liveryEnumOk accepts.
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
  // What a sender puts on the wire: null for the factory paint job (nothing to
  // send); else the set colour / pill fields of the fitted one, through the same check.
  function packLivery(resolved) {
    if (!resolved || resolved.id === "default") return null;
    const m = typeof Liveries !== "undefined" && Liveries.migratePaint ? Liveries.migratePaint(Object.assign({}, resolved)) : resolved;
    const sparse = { c1: m.c1, c2: m.c2 };
    for (const k of livFields()) if (rgb3(m[k]) || (typeof m[k] === "string" && m[k])) sparse[k] = m[k];
    return cleanLivery(sparse);
  }
  // localProfile() + `liv`, for HELLO only: a custom livery cannot be built from
  // an id, so the fitted paint job's fields travel (read like resolveLivery reads
  // them: the stored id in the team's list), and only when it is not the factory one.
  function withLivery(p, G) {
    let liv = null;
    try {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0], id = G.getLiveryId(team.id);
      liv = id === "default" ? null : packLivery(G.getLiveries(team).find((l) => l && l.id === id));
    } catch (e) { liv = null; }
    if (liv) p.liv = liv;
    return p;
  }
  // The full resolved shape car-draw paints from (every field present, null when unset).
  function fullLivery(l, id) {
    const m = typeof Liveries !== "undefined" && Liveries.migratePaint ? Liveries.migratePaint(Object.assign({}, l)) : l;
    const v = { id, c1: m.c1, c2: m.c2 };
    for (const k of livFields()) v[k] = m[k] || null;
    return v;
  }
  // FNV-1a over the cleaned payload: the cache tag, so two peers in one paint job share a build.
  function livHash(l) {
    const s = JSON.stringify(l);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  // A car's paint in a friend race: { livery, tag }. `tag` is for the car draw's
  // cache keys, where the local livery id stands today (car-draw's DRAFT_TAG
  // uses the same "~" lead).
  const _factoryPaint = new Map();
  function factoryPaint(team) {
    let p = _factoryPaint.get(team.id);
    if (!p) {
      const base = typeof Liveries !== "undefined" && Liveries.forTeam ? Liveries.forTeam(team)[0] : null;
      p = { livery: fullLivery(base || { c1: team.color, c2: team.color2 }, "default"), tag: "~pf" };
      _factoryPaint.set(team.id, p);
    }
    return p;
  }
  function peerPaint(profile, team) {
    const liv = profile && cleanLivery(profile.liv);
    return liv ? { livery: fullLivery(liv, "peer"), tag: "~p" + livHash(liv) } : factoryPaint(team);
  }
  // A friend's car wears the paint its player sent (factory when none was sent,
  // or when what was sent was refused), never this phone's stored paint for that
  // team. Only the human rivals are stamped: which paint an AI car wears is
  // resolveLivery's policy, not this file's. `localIsFactory(team)`: this phone's
  // own paint for that team is the factory one; then a factory friend needs no
  // stamp, so a race where nobody fitted a custom livery builds nothing new.
  // A remote with no profile (a late HELLO, the loopback) is left alone.
  function paintField(cars, remotes, localIsFactory) {
    for (const c of cars) if (c) c.netPaint = undefined;
    for (const r of remotes) {
      if (!r.car || !r.car.team || !r.profile) continue;
      const p = peerPaint(r.profile, r.car.team);
      r.car.netPaint = p.tag === "~pf" && localIsFactory && localIsFactory(r.car.team) ? undefined : p;
    }
  }

  // HELLO is stored and relayed to guests: keep only localProfile() fields (+ from/rank).
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
  // The profile inside an invite or answer CODE is the same peer-written object
  // as a HELLO, and the host relays stored entries to every new arrival: it is
  // cleaned the same way. It never carries a relay tag — `from`/`rank` are the
  // host's word on a HELLO, and a code has no host to speak for it.
  function cleanCodeProfile(p) {
    const out = cleanHello(p);
    if (out) { delete out.from; delete out.rank; delete out.liv; }   // a code is typed or scanned: no paint in it
    return out;
  }

  // THE SEAT A HOST-SIDE CONNECTION MAY SPEAK FOR, as "team:driver" (the
  // driverId QUALI carries), or null. A seat two guests both claim is settled
  // after the fact by join rank (the lobby's resolveSeatClash: the earlier keeps
  // it), and until the later one moves both HELLOs sit in `peers`. Keyed on the
  // seat alone, the later claimant's QUALI overwrote the holder's time: so only
  // the earliest-ranked claimant holds it, and never the host's own seat.
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
    cleanHello, cleanCodeProfile, heldSeat, cleanLivery, packLivery, withLivery, peerPaint, factoryPaint, paintField };
})();
Object.freeze(LobbyRoster);
