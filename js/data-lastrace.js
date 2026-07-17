const DataLastRace = (function () {
  "use strict";

  function create({ el, emptyMsg, teamChip, fmtDate }) {
    function loadLastRace() {
      return F1API.lastRace().then(race => {
        const wrap = el("div", "dh-tabbody");
        if (!race) {
          wrap.appendChild(emptyMsg("No race results yet — the season hasn't started."));
          return wrap;
        }
        const head = el("div", "dh-lr-head");
        head.appendChild(el("div", "dh-lr-name", race.name || "Grand Prix"));
        const meta = [];
        if (race.round !== null && race.round !== undefined) meta.push("Round " + race.round);
        if (race.date) meta.push(fmtDate(race.date));
        head.appendChild(el("div", "dh-lr-meta", meta.join(" · ")));
        wrap.appendChild(head);

        const results = race.results || [];
        if (!results.length) {
          wrap.appendChild(emptyMsg("Classification not available yet."));
          return wrap;
        }

        const table = el("table", "dh-table");
        const thead = el("thead");
        const hr = el("tr");
        [["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"], ["GRID", "dh-th-grid"], ["TIME", null], ["PTS", null]].forEach(h => {
          hr.appendChild(el("th", h[1], h[0]));
        });
        thead.appendChild(hr);
        table.appendChild(thead);

        const tbody = el("tbody");
        results.forEach(r => {
          const tr = el("tr");
          if (r.pos === 1) tr.classList.add("dh-lr-p1");
          else if (r.pos === 2) tr.classList.add("dh-lr-p2");
          else if (r.pos === 3) tr.classList.add("dh-lr-p3");
          tr.appendChild(el("td", "dh-td-pos", r.pos !== null && r.pos !== undefined ? r.pos : "—"));
          const tdDrv = el("td", "dh-td-driver");
          tdDrv.appendChild(teamChip(r.code, r.team));
          tdDrv.appendChild(el("span", "dh-name", r.name || "—"));
          tr.appendChild(tdDrv);
          tr.appendChild(el("td", "dh-td-team", r.team || "—"));
          tr.appendChild(el("td", "dh-td-grid", r.grid !== null && r.grid !== undefined ? r.grid : "—"));
          tr.appendChild(el("td", "dh-td-time", r.time || r.status || "—"));
          tr.appendChild(el("td", "dh-td-pts", r.points != null ? r.points : ""));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
      });
    }
    return { loadLastRace };
  }
  return { create };
})();
