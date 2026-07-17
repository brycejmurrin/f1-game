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
          const cLeaderPts = cons.length > 0 && cons[0].pos === 1 ? cons[0].points : null;
          cons.forEach(s => {
            const row = el("div", "dh-row");
            row.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
            const ct = findTeam(s.name);
            row.appendChild(teamChip(ct ? ct.short : (s.name ? s.name.slice(0, 3).toUpperCase() : "?"), s.name));
            row.appendChild(el("span", "dh-name", s.name || "—"));
            if (s.wins > 0) row.appendChild(el("span", "dh-wins", s.wins + "W"));
            row.appendChild(el("span", "dh-pts", s.points));
            if (cLeaderPts !== null && s.pos !== 1) {
              row.appendChild(el("span", "dh-gap", "−" + (cLeaderPts - s.points)));
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
