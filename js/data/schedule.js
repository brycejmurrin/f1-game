const DataSchedule = (function () {
  "use strict";

  /* ONE INSTANT, ONE ZONE. A row shows a date and a start time; the time was
     always the viewer's local clock, and the date was formatted in UTC — so a
     Las Vegas GP (2026-11-22 04:00Z) read "22 Nov · 20:00 PST", a day adrift.
     When the entry has a time, both come from the same instant in the viewer's
     zone. A DATE-ONLY entry is a calendar day, not an instant: it stays in UTC,
     or UTC+13/+14 (NZ summer, Kiribati) showed every race a day late. */
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

  function create({ el, emptyMsg }) {
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
      subEl.title = subText;
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
        let nextMarked = false;
        wrap.appendChild(el("h3", "dh-section", `${new Date().getFullYear()} CALENDAR`));
        const grid = el("div", "dh-race-grid");
        for (const r of items) {
          const isNext = !nextMarked && isUpcoming(r, now);
          if (isNext) nextMarked = true;
          grid.appendChild(raceRow(r, isNext));
        }
        wrap.appendChild(grid);
        return wrap;
      });
    }
    return { loadSchedule };
  }

  return { create, raceInstant, fmtDate, dateLabel, isUpcoming };
})();
Object.freeze(DataSchedule);
