const DataSchedule = (function () {
  "use strict";

  /* ONE INSTANT, ONE ZONE. A row shows a date and a start time; with the time
     on the viewer's local clock and the date formatted in UTC, a Las Vegas GP
     (2026-11-22 04:00Z) reads "22 Nov · 20:00 PST", a day adrift. When the
     entry has a time, both come from the same instant in the viewer's zone. A
     DATE-ONLY entry is a calendar day, not an instant: it stays in UTC, or
     UTC+13/+14 (NZ summer, Kiribati) shows every race a day late. */
  function raceInstant(r) {
    if (!r || !r.date || !r.time) return NaN;
    return Date.parse(`${r.date}T${r.time}`);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const dateOnly = iso.length === 10;
    const d = new Date(dateOnly ? iso + "T12:00:00Z" : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, dateOnly ? { day: "numeric", month: "short", timeZone: "UTC" }
                                                    : { day: "numeric", month: "short" });
  }

  function dateLabel(r) {
    const at = raceInstant(r);
    return fmtDate(Number.isFinite(at) ? new Date(at).toISOString() : r && r.date);
  }

  // NEXT is the first race that has not finished. With a start instant that is
  // decided against the clock (a race stays NEXT for RACE_MS after lights out,
  // i.e. while it is running); a date-only entry falls back to the UTC day.
  const RACE_MS = 2 * 3600 * 1000;
  function isUpcoming(r, now) {
    if (!r || !r.date) return false;
    const at = raceInstant(r);
    if (Number.isFinite(at)) return at + RACE_MS > now;
    return r.date >= new Date(now).toISOString().slice(0, 10);
  }

  function nextRace(items, now) {
    for (const r of items || []) if (isUpcoming(r, now)) return r;
    return null;
  }

  const SESSION_META = Object.freeze({
    fp1: ["FP1", 60], fp2: ["FP2", 60], fp3: ["FP3", 60],
    sq: ["SQ", 45], s: ["S", 30], q: ["Q", 60], r: ["R", 120]
  });

  function weekendSessions(race) {
    if (!race) return [];
    const source = race.sessions || {};
    const out = [];
    for (const key of ["fp1", "fp2", "fp3", "sq", "s", "q", "r"]) {
      const session = source[key] || (key === "r" ? race : null);
      const startMs = raceInstant(session);
      if (!Number.isFinite(startMs)) continue;
      out.push({
        key,
        label: SESSION_META[key][0],
        startMs,
        endMs: startMs + SESSION_META[key][1] * 60 * 1000,
        est: true
      });
    }
    return out.sort(function (a, b) { return a.startMs - b.startMs; });
  }

  function countdown(ms) {
    if (!(ms > 0)) return "STARTED";
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    if (days) return days + "d " + String(hours).padStart(2, "0") + "h " + String(minutes).padStart(2, "0") + "m";
    if (hours) return hours + "h " + String(minutes).padStart(2, "0") + "m " + String(secs).padStart(2, "0") + "s";
    return minutes + "m " + String(secs).padStart(2, "0") + "s";
  }

  // When the current NEXT stops being upcoming: a reused Schedule node must be
  // rebuilt then, or the chip sits on a finished race for the node's MAX_AGE.
  function nextFlipAt(items, now) {
    const r = nextRace(items, now);
    if (r) {
      const at = raceInstant(r);
      return Number.isFinite(at) ? at + RACE_MS : Date.parse(r.date + "T00:00:00Z") + 24 * 3600 * 1000;
    }
    return Infinity;
  }

  function bindOverflowTitle(node, text) {
    if (!node || !node.addEventListener) return;
    node.addEventListener("mouseenter", function () {
      if (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) return;
      if (node.scrollWidth > node.clientWidth + 1) node.title = text;
      else if (node.removeAttribute) node.removeAttribute("title");
    });
    node.addEventListener("mouseleave", function () {
      if (node.removeAttribute) node.removeAttribute("title");
    });
  }

  function create({ el, emptyMsg }) {
    function sessionTime(startMs) {
      return new Date(startMs).toLocaleString(undefined, {
        weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short"
      });
    }

    function keepCountdownAlive(wrap, tile, clock, targetMs) {
      let timer = null, shownMinute = null, labelledMinute = null;
      const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

      function tick() {
        const left = targetMs - Date.now();
        const minute = Math.floor(Math.max(0, left) / 60000);
        if (!reduced || minute !== shownMinute) {
          clock.textContent = countdown(left);
          shownMinute = minute;
        }
        if (minute !== labelledMinute) {
          clock.setAttribute("aria-label", left > 0 ? "Race starts in " + countdown(left) : "Race started");
          labelledMinute = minute;
        }
      }
      function visible() {
        if (!wrap.isConnected) return false;
        for (let n = wrap; n; n = n.parentElement) if (n.hidden) return false;
        return true;
      }
      function sync() {
        if (visible()) {
          if (timer === null) {
            tick();
            timer = setInterval(tick, 1000);
          }
        } else if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        // A newer schedule tile means this cached node was replaced, not merely
        // hidden while another tab is open; its observer can retire too.
        if (!wrap.isConnected && typeof document !== "undefined") {
          const current = document.querySelector("[data-nextgp=tile]");
          if (current && current !== tile) observer.disconnect();
        }
      }

      clock.setAttribute("aria-live", "off");
      clock.setAttribute("role", "timer");
      tick();
      if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
      const observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
      queueMicrotask(sync);
    }

    function nextTile(race, wrap) {
      const tile = el("section");
      tile.setAttribute("data-nextgp", "tile");
      const kicker = el("div", null, "NEXT GP");
      kicker.setAttribute("data-nextgp", "kicker");
      tile.appendChild(kicker);
      const name = el("h3", null, race.name || "Grand Prix");
      name.setAttribute("data-nextgp", "name");
      tile.appendChild(name);
      const place = [race.circuit, [race.locality, race.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      if (place) {
        const venue = el("div", null, place);
        venue.setAttribute("data-nextgp", "place");
        tile.appendChild(venue);
      }

      const at = raceInstant(race);
      const clock = el("div", null, Number.isFinite(at) ? countdown(at - Date.now()) : "TIME TBC");
      clock.setAttribute("data-nextgp", "countdown");
      tile.appendChild(clock);
      if (Number.isFinite(at)) keepCountdownAlive(wrap, tile, clock, at);

      const sessions = weekendSessions(race);
      if (sessions.length) {
        const list = el("div");
        list.setAttribute("data-nextgp", "sessions");
        for (const session of sessions) {
          const row = el("div");
          row.setAttribute("data-nextgp", "session");
          const label = el("span", null, session.label);
          label.setAttribute("data-nextgp", "session-label");
          row.appendChild(label);
          const time = el("time", null, sessionTime(session.startMs));
          time.setAttribute("data-nextgp", "session-time");
          row.appendChild(time);
          list.appendChild(row);
        }
        tile.appendChild(list);
      }
      return tile;
    }

    function raceRow(r, isNext) {
      const row = el("div", "dh-race");
      if (isNext) row.classList.add("dh-race-next");
      row.appendChild(el("div", "dh-race-round", r.round != null ? `R${r.round}` : "—"));

      const main = el("div", "dh-race-main");
      const nameLine = el("div", "dh-race-name");
      nameLine.appendChild(el("span", null, r.name || "Grand Prix"));
      if (r.hasSprint) {
        const sprint = el("span", "dh-chip-sprint", "S");
        sprint.title = "Sprint weekend";
        nameLine.appendChild(sprint);
      }
      if (isNext) nameLine.appendChild(el("span", "dh-chip-next", "NEXT"));
      main.appendChild(nameLine);

      const subParts = [];
      if (r.circuit) subParts.push(r.circuit);
      const place = [r.locality, r.country].filter(Boolean).join(", ");
      if (place) subParts.push(place);
      const subText = subParts.join(" · ") || "—";
      const subEl = el("div", "dh-race-sub", subText);
      // Native `title` stays painted after the row scrolls away (R1 tip over
      // R2). Attach only while the line is actually ellipsized.
      bindOverflowTitle(subEl, subText);
      main.appendChild(subEl);
      if (r.time) {
        const t = new Date(Number.isFinite(raceInstant(r)) ? raceInstant(r) : `1970-01-01T${r.time}`);
        if (!isNaN(t.getTime())) {
          main.appendChild(el("div", "dh-race-time", t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })));
        }
      }
      row.appendChild(main);

      row.appendChild(el("div", "dh-race-date", dateLabel(r)));
      return row;
    }

    function loadSchedule() {
      return F1API.schedule().then((items) => {
        const wrap = el("div", "dh-tabbody");
        if (!items || !items.length) {
          wrap.appendChild(emptyMsg("No calendar data available yet."));
          return wrap;
        }
        const now = Date.now();
        const next = nextRace(items, now);
        let nextMarked = false;
        if (next) wrap.appendChild(nextTile(next, wrap));
        wrap.appendChild(el("h3", "dh-section", `${new Date().getFullYear()} CALENDAR`));
        const grid = el("div", "dh-race-grid");
        for (const r of items) {
          const isNext = !nextMarked && isUpcoming(r, now);
          if (isNext) nextMarked = true;
          grid.appendChild(raceRow(r, isNext));
        }
        wrap.appendChild(grid);
        wrap.nextFlipAt = nextFlipAt(items, now);   // hub.js rebuilds a reused node after this
        return wrap;
      });
    }
    return { loadSchedule };
  }

  return { create, raceInstant, fmtDate, dateLabel, isUpcoming, nextRace, weekendSessions, countdown, nextFlipAt };
})();
Object.freeze(DataSchedule);
