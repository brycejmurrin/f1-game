const DataSchedule = (function () {
  "use strict";

  function create({ el, emptyMsg, fmtDate, fmtDateTime, todayISO }) {
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
        const t = new Date(`${r.date ? r.date : "1970-01-01"}T${r.time}`);
        if (!isNaN(t.getTime())) {
          main.appendChild(el("div", "dh-race-time", t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })));
        }
      }
      row.appendChild(main);

      row.appendChild(el("div", "dh-race-date", fmtDate(r.date)));
      return row;
    }

    function loadSchedule() {
      return F1API.schedule().then((items) => {
        const wrap = el("div", "dh-tabbody");
        if (!items || !items.length) {
          wrap.appendChild(emptyMsg("No calendar data available yet."));
          return wrap;
        }
        const today = todayISO();
        let nextMarked = false;
        wrap.appendChild(el("h3", "dh-section", `${new Date().getFullYear()} CALENDAR`));
        const grid = el("div", "dh-race-grid");
        for (const r of items) {
          const isNext = !nextMarked && r.date && r.date >= today;
          if (isNext) nextMarked = true;
          grid.appendChild(raceRow(r, isNext));
        }
        wrap.appendChild(grid);
        return wrap;
      });
    }
    return { loadSchedule };
  }

  return { create };
})();
Object.freeze(DataSchedule);
