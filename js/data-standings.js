const DataStandings = (function () {
  "use strict";

  function create({ el, emptyMsg, teamChip, findTeam }) {
    function loadStandings() {
      return Promise.all([F1API.driverStandings(), F1API.constructorStandings()]).then(res => {
        const drivers = res[0] || [];
        const cons = res[1] || [];
        const wrap = el("div", "dh-tabbody dh-standings");

        const dSec = el("div", "dh-standings-col");
        dSec.appendChild(el("h3", "dh-section", "DRIVERS"));
        if (!drivers.length) {
          dSec.appendChild(emptyMsg("No driver standings yet — season hasn't started."));
        } else {
          const leaderPts = drivers.length > 0 && drivers[0].pos === 1 ? drivers[0].points : null;
          drivers.forEach(s => {
            const row = el("div", "dh-row");
            row.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
            row.appendChild(teamChip(s.code, s.team));
            row.appendChild(el("span", "dh-name", s.name || "—"));
            if (s.wins > 0) row.appendChild(el("span", "dh-wins", s.wins + "W"));
            row.appendChild(el("span", "dh-pts", s.points));
            if (leaderPts !== null && s.pos !== 1) {
              row.appendChild(el("span", "dh-gap", "−" + (leaderPts - s.points)));
            }
            dSec.appendChild(row);
          });
        }
        wrap.appendChild(dSec);

        const cSec = el("div", "dh-standings-col");
        cSec.appendChild(el("h3", "dh-section", "CONSTRUCTORS"));
        if (!cons.length) {
          cSec.appendChild(emptyMsg("No constructor standings yet."));
        } else {
          // Group drivers by team for H2H
          const teamDrivers = {};
          drivers.forEach(d => {
            if (!teamDrivers[d.team]) teamDrivers[d.team] = [];
            teamDrivers[d.team].push(d);
          });

          const cLeaderPts = cons.length > 0 && cons[0].pos === 1 ? cons[0].points : null;
          cons.forEach(s => {
            const row = el("div", "dh-row dh-row-cons");
            
            const mainInfo = el("div", "dh-cons-main");
            mainInfo.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
            const ct = findTeam(s.name);
            mainInfo.appendChild(teamChip(ct ? ct.short : (s.name ? s.name.slice(0, 3).toUpperCase() : "?"), s.name));
            mainInfo.appendChild(el("span", "dh-name", s.name || "—"));
            if (s.wins > 0) mainInfo.appendChild(el("span", "dh-wins", s.wins + "W"));
            mainInfo.appendChild(el("span", "dh-pts", s.points));
            if (cLeaderPts !== null && s.pos !== 1) {
              mainInfo.appendChild(el("span", "dh-gap", "−" + (cLeaderPts - s.points)));
            }
            row.appendChild(mainInfo);

            // Head-to-Head bar
            const myDrivers = teamDrivers[s.name] || [];
            if (myDrivers.length >= 2 && s.points > 0) {
              // sort to keep bar consistent (e.g. driver with more points first, or alphabetical)
              myDrivers.sort((a, b) => b.points - a.points);
              const h2h = el("div", "dh-h2h-bar");
              const d1 = myDrivers[0], d2 = myDrivers[1];
              const p1 = (d1.points / s.points) * 100;
              
              const p1Fill = el("div", "dh-h2h-fill");
              p1Fill.style.width = p1 + "%";
              p1Fill.title = (d1.code || d1.name) + ": " + d1.points + " pts";
              
              const p2Fill = el("div", "dh-h2h-fill dh-h2h-alt");
              p2Fill.style.width = (100 - p1) + "%";
              p2Fill.title = (d2.code || d2.name) + ": " + d2.points + " pts";
              
              h2h.appendChild(p1Fill);
              h2h.appendChild(p2Fill);
              
              const labels = el("div", "dh-h2h-labels");
              labels.appendChild(el("span", null, d1.code || d1.name.slice(0, 3).toUpperCase()));
              labels.appendChild(el("span", null, d2.code || d2.name.slice(0, 3).toUpperCase()));
              
              const h2hWrap = el("div", "dh-h2h-wrap");
              h2hWrap.appendChild(h2h);
              h2hWrap.appendChild(labels);
              row.appendChild(h2hWrap);
            }

            cSec.appendChild(row);
          });
        }
        wrap.appendChild(cSec);

        return wrap;
      });
    }
    return { loadStandings };
  }
  return { create };
})();
