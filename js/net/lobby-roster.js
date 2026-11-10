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

  // HELLO is stored and relayed to guests: keep only localProfile() fields (+ from/rank).
  function cleanHello(p) {
    if (!p || typeof p !== "object") return null;
    const out = { team: p.team, driver: p.driver, parts: null };
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
    if (out) { delete out.from; delete out.rank; }
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
    cleanHello, cleanCodeProfile, heldSeat };
})();
Object.freeze(LobbyRoster);
