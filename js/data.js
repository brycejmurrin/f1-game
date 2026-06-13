/* Apex 26 — DataHub: F1 data overlay (#datahub).
   Tabs: SCHEDULE | STANDINGS | LAST RACE | LIVE. All API-derived DOM is built
   with createElement/textContent (never innerHTML with API strings).
   Styles live in css/data.css (every class prefixed dh-). */
const DataHub = (function () {
  "use strict";

  const NO_LIVE_MSG = "No live data — sessions appear here during race weekends " +
    "(free data is delayed until ~30 min after each session).";

  const MINUTE = 60 * 1000;
  // re-fetch a tab if its rendered content is older than this when shown again
  const MAX_AGE = { schedule: 6 * 60 * MINUTE, standings: 60 * MINUTE, lastrace: 60 * MINUTE, live: 5 * MINUTE };

  const TABS = [
    { id: "schedule", label: "SCHEDULE", load: loadSchedule },
    { id: "standings", label: "STANDINGS", load: loadStandings },
    { id: "lastrace", label: "LAST RACE", load: loadLastRace },
    { id: "live", label: "LIVE", load: loadLive }
  ];

  let root = null;
  let contentEl = null;
  let tabButtons = {};            // id -> button element
  let openFlag = false;
  let active = "schedule";
  const state = {};               // id -> {node, at, gen}
  const gen = {};                 // id -> load generation (ignores stale resolutions)

  /* ================= helpers ================= */

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ----- team colors via Teams.LIST (substring keywords, ordered) ----- */

  const TEAM_KEYS = [
    ["racing bulls", "RB"], ["rb f1", "RB"], ["visa", "RB"],
    ["red bull", "RBR"],
    ["mercedes", "MER"],
    ["ferrari", "FER"],
    ["mclaren", "MCL"],
    ["alpine", "ALP"],
    ["haas", "HAA"],
    ["williams", "WIL"],
    ["audi", "AUD"], ["sauber", "AUD"],
    ["aston", "AMR"],
    ["cadillac", "CAD"]
  ];

  function findTeam(apiName) {
    if (!apiName || typeof Teams === "undefined" || !Teams.LIST) return null;
    const n = String(apiName).toLowerCase();
    for (let i = 0; i < TEAM_KEYS.length; i++) {
      if (n.indexOf(TEAM_KEYS[i][0]) !== -1) {
        for (let j = 0; j < Teams.LIST.length; j++) {
          if (Teams.LIST[j].short === TEAM_KEYS[i][1]) return Teams.LIST[j];
        }
      }
    }
    return null;
  }

  function cssColor(c) {
    if (!c) return "rgb(128,128,128)"; // fallback grey
    return "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
  }

  function textColorOn(c) {
    if (!c) return "#fff";
    const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return lum > 0.55 ? "#0a0a0f" : "#fff";
  }

  function teamChip(code, teamName) {
    const t = findTeam(teamName);
    const chip = el("span", "dh-codechip", code || "—");
    const col = t ? t.color : null;
    chip.style.background = cssColor(col);
    chip.style.color = textColorOn(col);
    return chip;
  }

  function teamSwatch(teamName) {
    const t = findTeam(teamName);
    const sw = el("span", "dh-swatch");
    sw.style.background = cssColor(t ? t.color : null);
    return sw;
  }

  /* ================= skeleton ================= */

  function init(rootEl) {
    if (root || !rootEl) return;
    root = rootEl;
    root.classList.add("dh-overlay");

    const card = el("div", "dh-card");

    // header
    const header = el("div", "dh-header");
    header.appendChild(el("h2", "dh-title", "F1 DATA HUB"));
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close data hub");
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // tabs
    const tabs = el("div", "dh-tabs");
    TABS.forEach(function (t) {
      const b = el("button", "dh-tab", t.label);
      b.type = "button";
      b.addEventListener("click", function () { showTab(t.id); });
      tabButtons[t.id] = b;
      tabs.appendChild(b);
    });
    card.appendChild(tabs);

    // content
    contentEl = el("div", "dh-content");
    card.appendChild(contentEl);

    root.appendChild(card);

    document.addEventListener("keydown", function (ev) {
      if (openFlag && ev.key === "Escape") close();
    });
  }

  function open() {
    if (!root) return;
    root.hidden = false;
    openFlag = true;
    showTab(active);
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    openFlag = false;
  }

  function isOpen() { return openFlag; }

  /* ================= tab plumbing ================= */

  function tabDef(id) {
    for (let i = 0; i < TABS.length; i++) if (TABS[i].id === id) return TABS[i];
    return TABS[0];
  }

  function showTab(id) {
    active = id;
    for (const k in tabButtons) {
      tabButtons[k].classList.toggle("dh-active", k === id);
    }
    const st = state[id];
    const maxAge = MAX_AGE[id] || 60 * MINUTE;
    if (st && st.node && (Date.now() - st.at) < maxAge) {
      clear(contentEl);
      contentEl.appendChild(st.node);
      contentEl.appendChild(footnote(st.at));
      contentEl.scrollTop = 0;
      return;
    }
    loadTab(id);
  }

  function loadTab(id) {
    const myGen = (gen[id] = (gen[id] || 0) + 1);
    clear(contentEl);
    contentEl.appendChild(spinner());

    tabDef(id).load().then(function (node) {
      if (gen[id] !== myGen) return;
      state[id] = { node: node, at: Date.now() };
      if (openFlag && active === id) showTab(id);
    }, function (err) {
      if (gen[id] !== myGen) return;
      console.warn("apex26: data hub tab failed", id, err);
      state[id] = null;
      if (openFlag && active === id) {
        clear(contentEl);
        contentEl.appendChild(errorBlock(id));
      }
    });
  }

  function spinner() {
    const w = el("div", "dh-loading");
    w.appendChild(el("div", "dh-spinner"));
    w.appendChild(el("div", "dh-loading-text", "LOADING"));
    return w;
  }

  function errorBlock(id) {
    const w = el("div", "dh-error");
    w.appendChild(el("div", "dh-error-msg", "Couldn't load data. Check your connection and try again."));
    const retry = el("button", "dh-retry", "RETRY");
    retry.type = "button";
    retry.addEventListener("click", function () { loadTab(id); });
    w.appendChild(retry);
    return w;
  }

  function footnote(at) {
    const mins = Math.floor((Date.now() - at) / MINUTE);
    let txt;
    if (mins < 1) txt = "updated just now";
    else if (mins < 60) txt = "updated " + mins + "m ago";
    else txt = "updated " + Math.floor(mins / 60) + "h " + (mins % 60) + "m ago";
    return el("div", "dh-footnote", txt);
  }

  function emptyMsg(text) {
    return el("div", "dh-empty", text);
  }

  /* ================= SCHEDULE ================= */

  function loadSchedule() {
    return F1API.schedule().then(function (items) {
      const wrap = el("div", "dh-tabbody");
      if (!items || !items.length) {
        wrap.appendChild(emptyMsg("No calendar data available yet."));
        return wrap;
      }
      const today = todayISO();
      let nextMarked = false;
      wrap.appendChild(el("h3", "dh-section", "2026 CALENDAR"));
      items.forEach(function (r) {
        const row = el("div", "dh-race");
        const isNext = !nextMarked && r.date && r.date >= today;
        if (isNext) { row.classList.add("dh-race-next"); nextMarked = true; }

        row.appendChild(el("div", "dh-race-round", r.round !== null && r.round !== undefined ? "R" + r.round : "—"));

        const main = el("div", "dh-race-main");
        const nameLine = el("div", "dh-race-name");
        nameLine.appendChild(el("span", null, r.name || "Grand Prix"));
        if (r.hasSprint) {
          const s = el("span", "dh-chip-sprint", "S");
          s.title = "Sprint weekend";
          nameLine.appendChild(s);
        }
        if (isNext) nameLine.appendChild(el("span", "dh-chip-next", "NEXT"));
        main.appendChild(nameLine);

        const subParts = [];
        if (r.circuit) subParts.push(r.circuit);
        const place = [r.locality, r.country].filter(Boolean).join(", ");
        if (place) subParts.push(place);
        main.appendChild(el("div", "dh-race-sub", subParts.join(" · ") || "—"));
        row.appendChild(main);

        row.appendChild(el("div", "dh-race-date", fmtDate(r.date)));
        wrap.appendChild(row);
      });
      return wrap;
    });
  }

  /* ================= STANDINGS ================= */

  function loadStandings() {
    return Promise.all([F1API.driverStandings(), F1API.constructorStandings()]).then(function (res) {
      const drivers = res[0] || [];
      const cons = res[1] || [];
      const wrap = el("div", "dh-tabbody dh-standings");

      const dSec = el("div", "dh-standings-col");
      dSec.appendChild(el("h3", "dh-section", "DRIVERS"));
      if (!drivers.length) {
        dSec.appendChild(emptyMsg("No driver standings yet — season hasn't started."));
      } else {
        drivers.forEach(function (s) {
          const row = el("div", "dh-row");
          row.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
          row.appendChild(teamChip(s.code, s.team));
          row.appendChild(el("span", "dh-name", s.name || "—"));
          if (s.wins > 0) row.appendChild(el("span", "dh-wins", s.wins + "W"));
          row.appendChild(el("span", "dh-pts", s.points));
          dSec.appendChild(row);
        });
      }
      wrap.appendChild(dSec);

      const cSec = el("div", "dh-standings-col");
      cSec.appendChild(el("h3", "dh-section", "CONSTRUCTORS"));
      if (!cons.length) {
        cSec.appendChild(emptyMsg("No constructor standings yet."));
      } else {
        cons.forEach(function (s) {
          const row = el("div", "dh-row");
          row.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
          row.appendChild(teamSwatch(s.name));
          row.appendChild(el("span", "dh-name", s.name || "—"));
          if (s.wins > 0) row.appendChild(el("span", "dh-wins", s.wins + "W"));
          row.appendChild(el("span", "dh-pts", s.points));
          cSec.appendChild(row);
        });
      }
      wrap.appendChild(cSec);

      return wrap;
    });
  }

  /* ================= LAST RACE ================= */

  function loadLastRace() {
    return F1API.lastRace().then(function (race) {
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
      ["POS", "DRIVER", "TEAM", "GRID", "TIME", "PTS"].forEach(function (h) {
        hr.appendChild(el("th", null, h));
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = el("tbody");
      results.forEach(function (r) {
        const tr = el("tr");
        tr.appendChild(el("td", "dh-td-pos", r.pos !== null && r.pos !== undefined ? r.pos : "—"));
        const tdDrv = el("td", "dh-td-driver");
        tdDrv.appendChild(teamChip(r.code, r.team));
        tdDrv.appendChild(el("span", "dh-name", r.name || "—"));
        tr.appendChild(tdDrv);
        tr.appendChild(el("td", "dh-td-team", r.team || "—"));
        tr.appendChild(el("td", "dh-td-grid", r.grid !== null && r.grid !== undefined ? r.grid : "—"));
        tr.appendChild(el("td", "dh-td-time", r.time || r.status || "—"));
        tr.appendChild(el("td", "dh-td-pts", r.points || ""));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    });
  }

  /* ================= LIVE ================= */

  function loadLive() {
    return F1API.latestSession().then(function (ses) {
      const wrap = el("div", "dh-tabbody");
      if (!ses || ses.sessionKey === null || ses.sessionKey === undefined) {
        wrap.appendChild(emptyMsg(NO_LIVE_MSG));
        return wrap;
      }
      return Promise.all([
        F1API.weather(ses.sessionKey).catch(function () { return null; }),
        F1API.positions(ses.sessionKey).catch(function () { return null; }),
        F1API.sessionDrivers(ses.sessionKey).catch(function () { return null; })
      ]).then(function (res) {
        return buildLive(ses, res[0], res[1], res[2]);
      });
    });
  }

  function buildLive(ses, weather, positions, drivers) {
    const wrap = el("div", "dh-tabbody");

    // session info card
    const info = el("div", "dh-livecard");
    const title = el("div", "dh-live-title");
    title.appendChild(el("span", null, ses.name || ses.type || "Session"));
    if (ses.type && ses.type !== ses.name) title.appendChild(el("span", "dh-live-type", ses.type));
    info.appendChild(title);
    const place = [ses.circuit, ses.country].filter(Boolean).join(" · ");
    if (place) info.appendChild(el("div", "dh-live-sub", place));
    if (ses.dateStart) info.appendChild(el("div", "dh-live-sub", "Starts " + fmtDateTime(ses.dateStart)));
    wrap.appendChild(info);

    // weather card
    if (weather) {
      const wx = el("div", "dh-livecard dh-weather");
      wx.appendChild(el("h3", "dh-section", "WEATHER"));
      const grid = el("div", "dh-wx-grid");
      const items = [
        ["AIR", weather.airT !== null ? weather.airT + "°C" : null],
        ["TRACK", weather.trackT !== null ? weather.trackT + "°C" : null],
        ["HUMIDITY", weather.humidity !== null ? weather.humidity + "%" : null],
        ["RAIN", weather.rainfall !== null ? (weather.rainfall > 0 ? "YES" : "NO") : null],
        ["WIND", weather.windSpeed !== null ? weather.windSpeed + " m/s" : null]
      ];
      items.forEach(function (it) {
        if (it[1] === null) return;
        const cell = el("div", "dh-wx-cell");
        cell.appendChild(el("div", "dh-wx-label", it[0]));
        cell.appendChild(el("div", "dh-wx-value", it[1]));
        grid.appendChild(cell);
      });
      wx.appendChild(grid);
      wrap.appendChild(wx);
    }

    // classification
    if (!positions || !positions.length) {
      wrap.appendChild(emptyMsg(NO_LIVE_MSG));
      return wrap;
    }
    const byNum = {};
    (drivers || []).forEach(function (d) {
      if (d && d.num !== null && d.num !== undefined) byNum[d.num] = d;
    });

    const sec = el("div", "dh-livecard");
    sec.appendChild(el("h3", "dh-section", "CLASSIFICATION"));
    positions.forEach(function (p) {
      const d = byNum[p.num] || {};
      const row = el("div", "dh-row");
      row.appendChild(el("span", "dh-pos", p.pos !== null && p.pos !== undefined ? p.pos : "—"));
      const chip = el("span", "dh-codechip", d.code || (p.num !== null && p.num !== undefined ? "#" + p.num : "—"));
      let col = null;
      if (d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
        col = [parseInt(d.color.slice(0, 2), 16) / 255,
               parseInt(d.color.slice(2, 4), 16) / 255,
               parseInt(d.color.slice(4, 6), 16) / 255];
      } else {
        const t = findTeam(d.team);
        col = t ? t.color : null;
      }
      chip.style.background = cssColor(col);
      chip.style.color = textColorOn(col);
      row.appendChild(chip);
      row.appendChild(el("span", "dh-name", d.name || "—"));
      row.appendChild(el("span", "dh-td-team dh-live-team", d.team || ""));
      sec.appendChild(row);
    });
    wrap.appendChild(sec);
    return wrap;
  }

  return { init: init, open: open, close: close, isOpen: isOpen };
})();
