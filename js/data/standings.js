const DataStandings = (function () {
  "use strict";

  function create({ el, emptyMsg, teamChip, findTeam, cssColor }) {
    // A row's team colour goes out as --row-team so the stylesheet owns HOW it
    // is used (edge bar; the leader row mixes it down to 16%) and a row with no
    // matching team falls back to `transparent` without a JS branch.
    function rowTeam(row, teamName) {
      const t = findTeam(teamName);
      if (!t || !t.color) return;
      const lum = 0.2126 * t.color[0] + 0.7152 * t.color[1] + 0.0722 * t.color[2];
      row.style.setProperty("--row-team", cssColor(lum < 0.10 && t.color2 ? t.color2 : t.color));
    }

    // `name` can be null independently of `code` (api.js maps both from
    // possibly-absent fields), so guard the .slice fallback — a nameless,
    // codeless entry must not throw and blank the whole STANDINGS tab.
    const abbr = (d) => d.code || (d.name ? d.name.slice(0, 3).toUpperCase() : "—");

    function posText(pos) { return pos != null ? pos : "—"; }

    function driverRows(drivers) {
      const sec = el("div", "dh-standings-col");
      sec.appendChild(el("h3", "dh-section", "DRIVERS"));
      if (!drivers.length) {
        sec.appendChild(emptyMsg("No driver standings yet — season hasn't started."));
        return sec;
      }
      const leaderPts = drivers[0].pos === 1 ? drivers[0].points : null;
      for (const s of drivers) {
        const row = el("div", "dh-row");
        rowTeam(row, s.team);
        if (s.pos === 1) row.classList.add("dh-row-lead");
        row.appendChild(el("span", "dh-pos", posText(s.pos)));
        row.appendChild(teamChip(s.code, s.team));
        row.appendChild(el("span", "dh-name", s.name || "—"));
        if (s.wins > 0) row.appendChild(el("span", "dh-wins", `${s.wins}W`));
        row.appendChild(el("span", "dh-pts", s.points));
        if (leaderPts !== null && s.pos !== 1) {
          row.appendChild(el("span", "dh-gap", `−${leaderPts - s.points}`));
        }
        sec.appendChild(row);
      }
      return sec;
    }

    function h2hBar(d1, d2) {
      const h2h = el("div", "dh-h2h-bar");
      const denom = (d1.points + d2.points) || 1;

      const p1Fill = el("div", "dh-h2h-fill");
      p1Fill.style.width = `${(d1.points / denom) * 100}%`;
      p1Fill.title = `${d1.code || d1.name}: ${d1.points} pts`;

      const p2Fill = el("div", "dh-h2h-fill dh-h2h-alt");
      p2Fill.style.width = `${(d2.points / denom) * 100}%`;
      p2Fill.title = `${d2.code || d2.name}: ${d2.points} pts`;

      h2h.appendChild(p1Fill);
      h2h.appendChild(p2Fill);

      const labels = el("div", "dh-h2h-labels");
      labels.appendChild(el("span", null, abbr(d1)));
      labels.appendChild(el("span", null, abbr(d2)));

      const h2hWrap = el("div", "dh-h2h-wrap");
      h2hWrap.appendChild(h2h);
      h2hWrap.appendChild(labels);
      return h2hWrap;
    }

    function constructorRows(cons, drivers) {
      const sec = el("div", "dh-standings-col");
      sec.appendChild(el("h3", "dh-section", "CONSTRUCTORS"));
      if (!cons.length) {
        sec.appendChild(emptyMsg("No constructor standings yet."));
        return sec;
      }
      const teamDrivers = {};
      for (const d of drivers) {
        if (!teamDrivers[d.team]) teamDrivers[d.team] = [];
        teamDrivers[d.team].push(d);
      }

      const leaderPts = cons[0].pos === 1 ? cons[0].points : null;
      for (const s of cons) {
        const row = el("div", "dh-row dh-row-cons");
        rowTeam(row, s.name);
        if (s.pos === 1) row.classList.add("dh-row-lead");

        const mainInfo = el("div", "dh-cons-main");
        mainInfo.appendChild(el("span", "dh-pos", posText(s.pos)));
        const ct = findTeam(s.name);
        mainInfo.appendChild(teamChip(ct ? ct.short : (s.name ? s.name.slice(0, 3).toUpperCase() : "?"), s.name));
        mainInfo.appendChild(el("span", "dh-name", s.name || "—"));
        if (s.wins > 0) mainInfo.appendChild(el("span", "dh-wins", `${s.wins}W`));
        mainInfo.appendChild(el("span", "dh-pts", s.points));
        if (leaderPts !== null && s.pos !== 1) {
          mainInfo.appendChild(el("span", "dh-gap", `−${leaderPts - s.points}`));
        }
        row.appendChild(mainInfo);

        const myDrivers = teamDrivers[s.name] || [];
        if (myDrivers.length >= 2 && s.points > 0) {
          myDrivers.sort((a, b) => b.points - a.points);
          row.appendChild(h2hBar(myDrivers[0], myDrivers[1]));
        }

        sec.appendChild(row);
      }
      return sec;
    }

    function loadStandings() {
      return Promise.all([F1API.driverStandings(), F1API.constructorStandings()]).then((res) => {
        const drivers = res[0] || [];
        const cons = res[1] || [];
        const wrap = el("div", "dh-tabbody dh-standings");
        wrap.appendChild(driverRows(drivers));
        wrap.appendChild(constructorRows(cons, drivers));
        return wrap;
      });
    }
    return { loadStandings };
  }
  return { create };
})();
Object.freeze(DataStandings);
