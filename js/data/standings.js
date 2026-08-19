const DataStandings = (function () {
  "use strict";

  function create({ el, emptyMsg, teamChip, findTeam, cssColor }) {
    /* Publish a row's team colour as --row-team so CSS can draw the edge bar
       and the leader wash from it. A custom property rather than a direct
       border-color write: the stylesheet then owns HOW the colour is used (the
       leader row mixes it down to 16%), and a row with no matching team simply
       falls back to `transparent` without any JS branch. */
    function rowTeam(row, teamName) {
      const t = findTeam(teamName);
      if (!t || !t.color) return;
      const lum = 0.2126 * t.color[0] + 0.7152 * t.color[1] + 0.0722 * t.color[2];
      row.style.setProperty("--row-team", cssColor(lum < 0.10 && t.color2 ? t.color2 : t.color));
    }

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
            rowTeam(row, s.team);
            if (s.pos === 1) row.classList.add("dh-row-lead");
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
            rowTeam(row, s.name);
            if (s.pos === 1) row.classList.add("dh-row-lead");
            
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
              const denom = (d1.points + d2.points) || 1;
              const p1 = (d1.points / denom) * 100;

              const p1Fill = el("div", "dh-h2h-fill");
              p1Fill.style.width = p1 + "%";
              p1Fill.title = (d1.code || d1.name) + ": " + d1.points + " pts";

              const p2Fill = el("div", "dh-h2h-fill dh-h2h-alt");
              p2Fill.style.width = ((d2.points / denom) * 100) + "%";
              p2Fill.title = (d2.code || d2.name) + ": " + d2.points + " pts";
              
              h2h.appendChild(p1Fill);
              h2h.appendChild(p2Fill);
              
              const labels = el("div", "dh-h2h-labels");
              // `name` can be null independently of `code` (api.js maps both from
              // possibly-absent fields), so guard the .slice fallback — a nameless,
              // codeless entry must not throw and blank the whole STANDINGS tab.
              const abbr = (d) => d.code || (d.name ? d.name.slice(0, 3).toUpperCase() : "—");
              labels.appendChild(el("span", null, abbr(d1)));
              labels.appendChild(el("span", null, abbr(d2)));
              
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
