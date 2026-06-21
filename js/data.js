/* Apex 26 — DataHub: F1 data overlay (#datahub).
   Tabs: SCHEDULE | STANDINGS | LAST RACE | LIVE. All API-derived DOM is built
   with createElement/textContent (never innerHTML with API strings).
   Styles live in css/data.css (every class prefixed dh-). */
const DataHub = (function () {
  "use strict";

  const NO_LIVE_MSG = "No live data — sessions appear here during race weekends " +
    "(free data is delayed until ~30 min after each session).";
  const NO_TELEM_MSG = "No telemetry available yet. The latest completed F1 session " +
    "(2023+) appears here once its data is published (~30–60 min after the session).";

  const MINUTE = 60 * 1000;
  // re-fetch a tab if its rendered content is older than this when shown again
  const MAX_AGE = { schedule: 6 * 60 * MINUTE, standings: 60 * MINUTE, lastrace: 60 * MINUTE, live: 5 * MINUTE, telemetry: 15 * MINUTE };

  // tyre compound colors
  const COMPOUND = {
    SOFT: "#e8002d", MEDIUM: "#f6d200", HARD: "#f0f0f0",
    INTERMEDIATE: "#3fb950", WET: "#1e90ff"
  };

  const TABS = [
    { id: "schedule", label: "SCHEDULE", load: loadSchedule },
    { id: "standings", label: "STANDINGS", load: loadStandings },
    { id: "lastrace", label: "LAST RACE", load: loadLastRace },
    { id: "live", label: "LIVE", load: loadLive },
    { id: "telemetry", label: "TELEMETRY", load: loadTelemetry }
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
    stopLiveAuto();
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

  /* ========= session selection (shared by LIVE + TELEMETRY) ========= */

  const YEARS = [2026, 2025, 2024, 2023];   // OpenF1 data starts in 2023
  const sel = { year: null, meetingKey: null, sessionKey: null, meta: null };

  function ensureSession() {
    if (sel.sessionKey !== null) return Promise.resolve(sel.meta);
    return F1API.latestSession().then(function (ses) {
      if (ses && ses.sessionKey !== null && ses.sessionKey !== undefined) {
        sel.meta = ses;
        sel.sessionKey = ses.sessionKey;
        sel.meetingKey = ses.meetingKey;
        sel.year = ses.year || YEARS[0];
      }
      return sel.meta;
    });
  }

  // Force the sibling session-tab to re-render for a newly picked session.
  function invalidateOther(except) {
    ["live", "telemetry"].forEach(function (id) {
      if (id !== except) { state[id] = null; gen[id] = (gen[id] || 0) + 1; }
    });
  }

  function setSelectOptions(selectEl, opts, selectedVal) {
    clear(selectEl);
    opts.forEach(function (o) {
      const op = el("option", null, o.label);
      op.value = String(o.value);
      if (String(o.value) === String(selectedVal)) op.selected = true;
      selectEl.appendChild(op);
    });
  }

  // Year / Grand Prix / Session controls. onPick(meta) fires only on a user
  // change (not initial population). Selection defaults to the latest session.
  function buildPicker(onPick) {
    const box = el("div", "dh-picker");
    const yearRow = el("div", "dh-pick-years");
    YEARS.forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " dh-active" : ""), String(y));
      b.type = "button";
      b.addEventListener("click", function () {
        if (y === sel.year) return;
        sel.year = y; sel.meetingKey = null; sel.sessionKey = null;
        for (let i = 0; i < yearRow.children.length; i++) {
          yearRow.children[i].classList.toggle("dh-active", yearRow.children[i] === b);
        }
        loadGPs(true);
      });
      yearRow.appendChild(b);
    });
    box.appendChild(yearRow);

    const gpField = el("label", "dh-pick-field");
    gpField.appendChild(el("span", "dh-pick-label", "GRAND PRIX"));
    const gpSel = el("select", "dh-pick-select");
    gpField.appendChild(gpSel);
    box.appendChild(gpField);

    const sesField = el("label", "dh-pick-field");
    sesField.appendChild(el("span", "dh-pick-label", "SESSION"));
    const sesSel = el("select", "dh-pick-select");
    sesField.appendChild(sesSel);
    box.appendChild(sesField);

    let sesIndex = {};
    function ph(s, t) { setSelectOptions(s, [{ value: "", label: t }], ""); }

    gpSel.addEventListener("change", function () {
      sel.meetingKey = gpSel.value ? Number(gpSel.value) : null;
      sel.sessionKey = null;
      loadSessions(true);
    });
    sesSel.addEventListener("change", function () {
      if (!sesSel.value) return;
      const m = sesIndex[sesSel.value];
      if (!m) return;
      sel.sessionKey = m.sessionKey; sel.meta = m;
      onPick(m);
    });

    function loadGPs(userChanged) {
      ph(gpSel, "loading…"); ph(sesSel, "—");
      F1API.meetings(sel.year).then(function (ms) {
        if (!ms.length) { ph(gpSel, "no data"); return; }
        if (sel.meetingKey === null) sel.meetingKey = ms[ms.length - 1].meetingKey;
        setSelectOptions(gpSel, ms.map(function (m) {
          return { value: m.meetingKey, label: m.name || m.circuit || "Round" };
        }), sel.meetingKey);
        loadSessions(userChanged);
      }, function () { ph(gpSel, "error"); });
    }

    function loadSessions(userChanged) {
      ph(sesSel, "loading…");
      F1API.sessionsForMeeting(sel.meetingKey).then(function (ss) {
        sesIndex = {};
        ss.forEach(function (s) { sesIndex[s.sessionKey] = s; });
        if (!ss.length) { ph(sesSel, "no data"); return; }
        if (sel.sessionKey === null) {
          const race = ss.filter(function (s) { return (s.type || "").toLowerCase() === "race"; });
          const def = race.length ? race[race.length - 1] : ss[ss.length - 1];
          sel.sessionKey = def.sessionKey; sel.meta = def;
        }
        setSelectOptions(sesSel, ss.map(function (s) {
          return { value: s.sessionKey, label: s.name || s.type || "Session" };
        }), sel.sessionKey);
        if (userChanged) onPick(sel.meta);
      }, function () { ph(sesSel, "error"); });
    }

    loadGPs(false);   // reflect current selection without firing onPick
    return box;
  }

  /* ================= LIVE ================= */

  const LIVE_REFRESH = 30 * 1000;   // auto-refresh interval
  let liveTimer = null;
  const liveOpts = { auto: false, sort: "pos" };

  function stopLiveAuto() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

  function loadLive() {
    return ensureSession().then(function () {
      const wrap = el("div", "dh-tabbody");
      if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_LIVE_MSG)); return wrap; }
      const body = el("div", "dh-tabbody");
      wrap.appendChild(buildPicker(function (meta) {
        renderLiveBody(meta, body);
        invalidateOther("live");
      }));
      wrap.appendChild(body);
      renderLiveBody(sel.meta, body);
      return wrap;
    });
  }

  function renderLiveBody(meta, body) {
    stopLiveAuto();
    clear(body);

    // control bar: manual refresh + auto-refresh toggle + last-updated stamp
    const bar = el("div", "dh-livecontrols");
    const refreshBtn = el("button", "dh-livebtn", "↻ REFRESH");
    refreshBtn.type = "button";
    const autoBtn = el("button", "dh-livebtn" + (liveOpts.auto ? " dh-active" : ""), "AUTO");
    autoBtn.type = "button";
    autoBtn.title = "Auto-refresh every 30s";
    const stamp = el("span", "dh-live-updated", "");
    bar.appendChild(refreshBtn);
    bar.appendChild(autoBtn);
    bar.appendChild(stamp);
    body.appendChild(bar);

    const dataEl = el("div", "dh-tabbody");
    body.appendChild(dataEl);

    function refresh() {
      clear(dataEl);
      dataEl.appendChild(spinner());
      Promise.all([
        F1API.weather(meta.sessionKey).catch(function () { return null; }),
        F1API.positions(meta.sessionKey).catch(function () { return null; }),
        F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; })
      ]).then(function (res) {
        clear(dataEl);
        fillLive(dataEl, meta, res[0], res[1], res[2]);
        stamp.textContent = "updated " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }, function () {
        clear(dataEl); dataEl.appendChild(emptyMsg(NO_LIVE_MSG));
      });
    }

    refreshBtn.addEventListener("click", refresh);
    autoBtn.addEventListener("click", function () {
      liveOpts.auto = !liveOpts.auto;
      autoBtn.classList.toggle("dh-active", liveOpts.auto);
      stopLiveAuto();
      if (liveOpts.auto) {
        liveTimer = setInterval(function () { if (dataEl.isConnected) refresh(); }, LIVE_REFRESH);
      }
    });
    if (liveOpts.auto) {
      liveTimer = setInterval(function () { if (dataEl.isConnected) refresh(); }, LIVE_REFRESH);
    }
    refresh();
  }

  function fillLive(body, ses, weather, positions, drivers) {
    // session info card
    const info = el("div", "dh-livecard");
    const title = el("div", "dh-live-title");
    title.appendChild(el("span", null, ses.name || ses.type || "Session"));
    if (ses.type && ses.type !== ses.name) title.appendChild(el("span", "dh-live-type", ses.type));
    info.appendChild(title);
    const place = [ses.circuit, ses.country].filter(Boolean).join(" · ");
    if (place) info.appendChild(el("div", "dh-live-sub", place));
    if (ses.dateStart) info.appendChild(el("div", "dh-live-sub", "Starts " + fmtDateTime(ses.dateStart)));
    body.appendChild(info);

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
      body.appendChild(wx);
    }

    // classification
    if (!positions || !positions.length) {
      body.appendChild(emptyMsg(NO_LIVE_MSG));
      return;
    }
    const byNum = {};
    (drivers || []).forEach(function (d) {
      if (d && d.num !== null && d.num !== undefined) byNum[d.num] = d;
    });

    const sec = el("div", "dh-livecard");
    const head = el("div", "dh-class-head");
    head.appendChild(el("h3", "dh-section", "CLASSIFICATION"));
    const sorts = el("div", "dh-sorts");
    const sortBtns = {};
    [["pos", "POS"], ["team", "TEAM"]].forEach(function (s) {
      const b = el("button", "dh-sortbtn", s[1]);
      b.type = "button";
      b.addEventListener("click", function () { liveOpts.sort = s[0]; renderRows(); });
      sortBtns[s[0]] = b;
      sorts.appendChild(b);
    });
    head.appendChild(sorts);
    sec.appendChild(head);

    const rows = el("div", "dh-class-rows");
    sec.appendChild(rows);
    body.appendChild(sec);

    function teamOf(p) { return (byNum[p.num] || {}).team || ""; }
    function posOf(p) { return (p.pos === null || p.pos === undefined) ? 999 : p.pos; }

    function renderRows() {
      for (const k in sortBtns) sortBtns[k].classList.toggle("dh-active", k === liveOpts.sort);
      clear(rows);
      const list = positions.slice();
      if (liveOpts.sort === "team") {
        list.sort(function (a, b) { return teamOf(a).localeCompare(teamOf(b)) || (posOf(a) - posOf(b)); });
      } else {
        list.sort(function (a, b) { return posOf(a) - posOf(b); });
      }
      list.forEach(function (p) {
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
        rows.appendChild(row);
      });
    }
    renderRows();
  }

  /* ================= TELEMETRY ================= */

  function driverColor(d) {
    if (d && d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
      return [parseInt(d.color.slice(0, 2), 16) / 255,
              parseInt(d.color.slice(2, 4), 16) / 255,
              parseInt(d.color.slice(4, 6), 16) / 255];
    }
    const t = findTeam(d && d.team);
    return t ? t.color : [0.6, 0.6, 0.6];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dcode(d) { return d.code || ("#" + d.num); }
  // OpenF1 DRS codes: 10/12/14 = wing open, everything else closed/eligible.
  function drsOpen(v) { return v === 10 || v === 12 || v === 14; }

  // Plottable car-data channels. `norm:"speed"|"rpm"` scales by that channel's
  // session peak; otherwise [lo,hi] maps linearly to the plot height. `step`
  // draws a staircase (gear / DRS). `off` = hidden until toggled on.
  const CHANNELS = [
    { id: "speed",    label: "SPEED",    color: "#39d0ff", w: 2,   norm: "speed", get: function (c) { return c.speed; },    fmt: function (v) { return Math.round(v) + " km/h"; } },
    { id: "throttle", label: "THR",      color: "#3fb950", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.throttle; }, fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "brake",    label: "BRAKE",    color: "#ff4d4d", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.brake; },    fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "gear",     label: "GEAR",     color: "#f6d200", w: 1.5, lo: 0, hi: 8, step: true, off: true, get: function (c) { return c.gear; }, fmt: function (v) { return v ? "G" + v : "N"; } },
    { id: "rpm",      label: "RPM",      color: "#c084fc", w: 1.5, norm: "rpm", off: true, get: function (c) { return c.rpm; }, fmt: function (v) { return Math.round(v); } },
    { id: "drs",      label: "DRS",      color: "#00e0c0", w: 1.5, lo: 0, hi: 1, step: true, off: true, get: function (c) { return c.drs === null || c.drs === undefined ? null : (drsOpen(c.drs) ? 1 : 0); }, fmt: function (v) { return v ? "OPEN" : "—"; } }
  ];

  function chanRaw(ch, c) {
    const v = ch.get(c);
    return (v === null || v === undefined || isNaN(v)) ? null : v;
  }
  // normalize a sample to 0..1 of the plot height for the given channel
  function chanNorm(ch, c, view) {
    const v = chanRaw(ch, c);
    if (v === null) return null;
    if (ch.norm === "speed") return clamp(v / view.speedMax, 0, 1);
    if (ch.norm === "rpm") return clamp(v / view.rpmMax, 0, 1);
    return clamp((v - ch.lo) / (ch.hi - ch.lo), 0, 1);
  }
  // nearest car sample (by lap time t) to a cursor time
  function sampleAt(car, t) {
    if (!car || !car.length) return null;
    let lo = 0, hi = car.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (car[mid].t < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(car[lo - 1].t - t) < Math.abs(car[lo].t - t)) lo--;
    return car[lo];
  }

  function loadTelemetry() {
    return ensureSession().then(function () {
      const wrap = el("div", "dh-tabbody");
      if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_TELEM_MSG)); return wrap; }
      const body = el("div", "dh-tabbody");
      wrap.appendChild(buildPicker(function (meta) {
        renderTelemetryBody(meta, body);
        invalidateOther("telemetry");
      }));
      wrap.appendChild(body);
      renderTelemetryBody(sel.meta, body);
      return wrap;
    });
  }

  function renderTelemetryBody(meta, body) {
    clear(body);
    body.appendChild(spinner());
    F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; }).then(function (drivers) {
      clear(body);
      const info = el("div", "dh-livecard");
      const title = el("div", "dh-live-title");
      title.appendChild(el("span", null, meta.name || meta.type || "Session"));
      if (meta.type && meta.type !== meta.name) title.appendChild(el("span", "dh-live-type", meta.type));
      info.appendChild(title);
      const place = [meta.circuit, meta.country].filter(Boolean).join(" · ");
      if (place) info.appendChild(el("div", "dh-live-sub", place));
      info.appendChild(el("div", "dh-live-sub", "Fastest-lap telemetry · tap up to two drivers to compare · drag the chart to scrub"));
      body.appendChild(info);

      if (!drivers || !drivers.length) { body.appendChild(emptyMsg(NO_TELEM_MSG)); return; }
      drivers = drivers.filter(function (d) { return d && d.num !== null && d.num !== undefined; });

      const picked = [];                 // driver objects in click order, max 2
      const chipByNum = {};
      const pick = el("div", "dh-driverpick");
      const detail = el("div", "dh-telem-detail");

      function syncChips() {
        drivers.forEach(function (d) {
          chipByNum[d.num].classList.toggle("dh-active", picked.indexOf(d) !== -1);
        });
      }
      drivers.forEach(function (d) {
        const b = el("button", "dh-dchip", dcode(d));
        b.type = "button";
        b.style.borderColor = cssColor(driverColor(d));
        b.addEventListener("click", function () {
          const idx = picked.indexOf(d);
          if (idx !== -1) picked.splice(idx, 1);
          else { picked.push(d); if (picked.length > 2) picked.shift(); }
          syncChips();
          loadTelemetrySet(meta.sessionKey, picked.slice(), detail);
        });
        chipByNum[d.num] = b;
        pick.appendChild(b);
      });
      body.appendChild(pick);
      detail.appendChild(emptyMsg("Pick a driver above to load their fastest lap."));
      body.appendChild(detail);
    }, function () {
      clear(body); body.appendChild(emptyMsg(NO_TELEM_MSG));
    });
  }

  // fetch one driver's fastest-lap bundle (extras = stints + pits for primary)
  function fetchDriverTel(sessionKey, d, withExtras) {
    return F1API.fastestLap(sessionKey, d.num).then(function (lap) {
      if (!lap || !lap.dateStart) return { d: d, lap: null };
      const start = lap.dateStart;
      const dur = lap.lapDuration || 90;
      const end = new Date(Date.parse(start) + dur * 1000 + 1500).toISOString();
      const jobs = [
        F1API.carData(sessionKey, d.num, start, end).catch(function () { return []; }),
        F1API.locationData(sessionKey, d.num, start, end).catch(function () { return []; })
      ];
      if (withExtras) {
        jobs.push(F1API.stints(sessionKey, d.num).catch(function () { return []; }));
        jobs.push(F1API.pits(sessionKey, d.num).catch(function () { return []; }));
      }
      return Promise.all(jobs).then(function (res) {
        return { d: d, lap: lap, car: res[0], loc: res[1], stints: res[2] || [], pits: res[3] || [] };
      });
    });
  }

  let telGen = 0;
  function loadTelemetrySet(sessionKey, picked, detail) {
    const myGen = ++telGen;
    clear(detail);
    if (!picked.length) {
      detail.appendChild(emptyMsg("Pick a driver above to load their fastest lap."));
      return;
    }
    detail.appendChild(spinner());
    Promise.all(picked.map(function (d, i) { return fetchDriverTel(sessionKey, d, i === 0); }))
      .then(function (tels) {
        if (myGen !== telGen) return;
        clear(detail);
        buildTelemetryView(detail, tels);
      }, function () {
        if (myGen !== telGen) return;
        clear(detail);
        detail.appendChild(emptyMsg("Couldn't load telemetry."));
      });
  }

  function buildTelemetryView(detail, tels) {
    const primary = tels[0];
    const compare = tels[1] || null;

    tels.forEach(function (t) {
      const head = el("div", "dh-livecard");
      const ht = el("div", "dh-live-title");
      ht.appendChild(el("span", null, (t.d.name || dcode(t.d))));
      const sw = el("span", "dh-swatch"); sw.style.background = cssColor(driverColor(t.d)); sw.style.marginLeft = "8px";
      ht.appendChild(sw);
      head.appendChild(ht);
      head.appendChild(el("div", "dh-live-sub", t.lap
        ? "Fastest lap " + (t.lap.lapNumber !== null ? "(L" + t.lap.lapNumber + ") " : "") + fmtLap(t.lap.lapDuration)
        : "No timed lap found in this session."));
      detail.appendChild(head);
    });

    if (!primary.car || !primary.car.length) {
      detail.appendChild(emptyMsg("Car telemetry isn't available for this lap."));
      appendStintsPits(detail, primary);
      return;
    }

    const view = {
      primary: primary,
      compare: (compare && compare.car && compare.car.length) ? compare : null,
      visible: {}, cursorT: null,
      tMax: 0, speedMax: 1, rpmMax: 1
    };
    CHANNELS.forEach(function (ch) { view.visible[ch.id] = !ch.off; });
    function scan(car) {
      for (let i = 0; i < car.length; i++) {
        if (car[i].t > view.tMax) view.tMax = car[i].t;
        if ((car[i].speed || 0) > view.speedMax) view.speedMax = car[i].speed;
        if ((car[i].rpm || 0) > view.rpmMax) view.rpmMax = car[i].rpm;
      }
    }
    scan(primary.car);
    if (view.compare) scan(view.compare.car);
    view.tMax = view.tMax || 1;

    const c1 = el("canvas", "dh-canvas");
    c1.width = 600; c1.height = 220; c1.style.touchAction = "none";
    detail.appendChild(c1);

    const readout = el("div", "dh-readout");
    detail.appendChild(readout);

    const legend = el("div", "dh-legend");
    CHANNELS.forEach(function (ch) {
      const item = el("button", "dh-legend-item" + (view.visible[ch.id] ? "" : " dh-off"));
      item.type = "button";
      const dot = el("span", "dh-legend-dot"); dot.style.background = ch.color;
      item.appendChild(dot); item.appendChild(document.createTextNode(ch.label));
      item.addEventListener("click", function () {
        view.visible[ch.id] = !view.visible[ch.id];
        item.classList.toggle("dh-off", !view.visible[ch.id]);
        redraw();
      });
      legend.appendChild(item);
    });
    if (view.compare) {
      const item = el("span", "dh-legend-item dh-legend-static");
      const dot = el("span", "dh-legend-dot"); dot.style.background = cssColor(driverColor(view.compare.d));
      item.appendChild(dot);
      item.appendChild(document.createTextNode(dcode(view.compare.d) + " SPEED"));
      legend.appendChild(item);
    }
    detail.appendChild(legend);

    let c2 = null;
    if (primary.loc && primary.loc.length > 8) {
      c2 = el("canvas", "dh-canvas dh-map");
      c2.width = 320; c2.height = 320;
      detail.appendChild(c2);
    }

    function redraw() {
      drawTraces(c1, view);
      if (c2) drawTrackMap(c2, view);
      updateReadout(readout, view);
    }
    attachScrub(c1, view, redraw);
    redraw();

    appendStintsPits(detail, primary);
  }

  // drag/hover the trace chart to move the scrub cursor
  function attachScrub(canvas, view, redraw) {
    function at(ev) {
      const r = canvas.getBoundingClientRect();
      view.cursorT = clamp((ev.clientX - r.left) / (r.width || 1), 0, 1) * view.tMax;
      redraw();
    }
    canvas.addEventListener("pointerdown", function (ev) { canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId); at(ev); });
    canvas.addEventListener("pointermove", at);
    canvas.addEventListener("pointerleave", function () { if (view.cursorT !== null) { view.cursorT = null; redraw(); } });
  }

  function updateReadout(readout, view) {
    clear(readout);
    if (view.cursorT === null) {
      readout.appendChild(el("span", "dh-ro-hint", "Drag the chart to read values at any point"));
      return;
    }
    readout.appendChild(el("span", "dh-ro-time", view.cursorT.toFixed(2) + "s"));
    const c = sampleAt(view.primary.car, view.cursorT);
    CHANNELS.forEach(function (ch) {
      if (!view.visible[ch.id]) return;
      const v = chanRaw(ch, c);
      const cell = el("span", "dh-ro-cell");
      const dot = el("span", "dh-ro-dot"); dot.style.background = ch.color; cell.appendChild(dot);
      cell.appendChild(el("span", "dh-ro-val", v === null ? "—" : ch.fmt(v)));
      readout.appendChild(cell);
    });
    if (view.compare) {
      const cc = sampleAt(view.compare.car, view.cursorT);
      const v = cc ? cc.speed : null;
      const cell = el("span", "dh-ro-cell");
      const dot = el("span", "dh-ro-dot"); dot.style.background = cssColor(driverColor(view.compare.d)); cell.appendChild(dot);
      cell.appendChild(el("span", "dh-ro-val", v === null ? "—" : Math.round(v) + " km/h"));
      readout.appendChild(cell);
    }
  }

  function appendStintsPits(detail, b) {
    const d = b.d;
    const myStints = (b.stints || []).filter(function (s) { return s.num === d.num || s.num === null; });
    if (myStints.length) {
      const sec = el("div", "dh-livecard");
      sec.appendChild(el("h3", "dh-section", "TYRE STINTS"));
      myStints.sort(function (a, c) { return (a.stint || 0) - (c.stint || 0); });
      myStints.forEach(function (s) {
        const row = el("div", "dh-row");
        const chip = el("span", "dh-codechip", (s.compound || "—").slice(0, 4));
        chip.style.background = COMPOUND[s.compound] || "#888";
        chip.style.color = (s.compound === "HARD") ? "#111" : "#fff";
        row.appendChild(chip);
        row.appendChild(el("span", "dh-name", "Laps " + (s.lapStart || "?") + "–" + (s.lapEnd || "?")));
        if (s.age !== null && s.age !== undefined) row.appendChild(el("span", "dh-wins", "age " + s.age));
        sec.appendChild(row);
      });
      detail.appendChild(sec);
    }
    const myPits = (b.pits || []).filter(function (p) { return p.num === d.num || p.num === null; });
    if (myPits.length) {
      const sec = el("div", "dh-livecard");
      sec.appendChild(el("h3", "dh-section", "PIT STOPS"));
      myPits.forEach(function (p) {
        const row = el("div", "dh-row");
        row.appendChild(el("span", "dh-pos", "L" + (p.lap !== null && p.lap !== undefined ? p.lap : "?")));
        row.appendChild(el("span", "dh-name", p.duration !== null && p.duration !== undefined ? p.duration.toFixed(1) + "s" : "—"));
        sec.appendChild(row);
      });
      detail.appendChild(sec);
    }
  }

  function fmtLap(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
  }

  // multi-channel traces for the primary driver (+ compare speed overlay),
  // with an optional scrub cursor.
  function drawTraces(canvas, view) {
    const g = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = 6;
    g.clearRect(0, 0, W, H);
    const X = function (t) { return pad + (t / view.tMax) * (W - 2 * pad); };
    const Y = function (f) { return H - pad - f * (H - 2 * pad); };
    function line(car, ch, color, width) {
      g.beginPath();
      let started = false, prevY = 0;
      for (let i = 0; i < car.length; i++) {
        const f = chanNorm(ch, car[i], view);
        if (f === null) { started = false; continue; }
        const x = X(car[i].t), y = Y(f);
        if (!started) { g.moveTo(x, y); started = true; }
        else { if (ch.step) g.lineTo(x, prevY); g.lineTo(x, y); }
        prevY = y;
      }
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.stroke();
    }
    // compare speed first (underneath), dashed in the driver's colour
    if (view.compare) {
      g.setLineDash([4, 3]);
      line(view.compare.car, CHANNELS[0], cssColor(driverColor(view.compare.d)), 1.5);
      g.setLineDash([]);
    }
    // primary channels — draw secondary channels first, speed on top
    for (let k = CHANNELS.length - 1; k >= 0; k--) {
      const ch = CHANNELS[k];
      if (view.visible[ch.id]) line(view.primary.car, ch, ch.color, ch.w);
    }
    // scrub cursor + dot on the speed trace
    if (view.cursorT !== null) {
      const x = X(view.cursorT);
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke();
      const c = sampleAt(view.primary.car, view.cursorT);
      const f = chanNorm(CHANNELS[0], c, view);
      if (f !== null) {
        g.fillStyle = CHANNELS[0].color;
        g.beginPath(); g.arc(X(c.t), Y(f), 3.5, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // track map from x/y, coloured by speed, with the scrub position marked
  function drawTrackMap(canvas, view) {
    const loc = view.primary.loc, car = view.primary.car;
    const g = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = 14;
    g.clearRect(0, 0, W, H);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, vMax = 1;
    for (let i = 0; i < loc.length; i++) {
      if (loc[i].x < minx) minx = loc[i].x; if (loc[i].x > maxx) maxx = loc[i].x;
      if (loc[i].y < miny) miny = loc[i].y; if (loc[i].y > maxy) maxy = loc[i].y;
    }
    for (let i = 0; i < (car ? car.length : 0); i++) if ((car[i].speed || 0) > vMax) vMax = car[i].speed;
    const spanx = (maxx - minx) || 1, spany = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    const ox = (W - spanx * sc) / 2, oy = (H - spany * sc) / 2;
    const PX = function (p) { return ox + (p.x - minx) * sc; };
    const PY = function (p) { return H - (oy + (p.y - miny) * sc); };
    let ci = 0;
    function speedAtDate(date) {
      if (!car || !car.length) return null;
      while (ci < car.length - 1 && car[ci].date < date) ci++;
      return car[ci].speed;
    }
    g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 1; i < loc.length; i++) {
      const v = speedAtDate(loc[i].date);
      const f = v === null ? 0.5 : clamp(v / vMax, 0, 1);
      const r = Math.round(255 * Math.min(1, f * 1.6));
      const b = Math.round(255 * Math.min(1, (1 - f) * 1.6));
      const gr = Math.round(180 * (1 - Math.abs(f - 0.5) * 2));
      g.strokeStyle = "rgb(" + r + "," + gr + "," + b + ")";
      g.beginPath();
      g.moveTo(PX(loc[i - 1]), PY(loc[i - 1]));
      g.lineTo(PX(loc[i]), PY(loc[i]));
      g.stroke();
    }
    // scrub marker: nearest location sample to the cursor's car-data timestamp
    if (view.cursorT !== null && car && car.length) {
      const cs = sampleAt(car, view.cursorT);
      let best = loc[0], bd = Infinity;
      for (let i = 0; i < loc.length; i++) {
        const dd = Math.abs(loc[i].date - cs.date);
        if (dd < bd) { bd = dd; best = loc[i]; }
      }
      g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2;
      g.beginPath(); g.arc(PX(best), PY(best), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  return { init: init, open: open, close: close, isOpen: isOpen };
})();
