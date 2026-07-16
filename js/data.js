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
  const MAX_AGE = { schedule: 6 * 60 * MINUTE, standings: 60 * MINUTE, lastrace: 60 * MINUTE, live: 5 * MINUTE, telemetry: 15 * MINUTE, export: 24 * 60 * MINUTE };

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
    { id: "telemetry", label: "TELEMETRY", load: function () { return loadTelemetry(); } },
    { id: "export", label: "EXPORT", load: function () { return loadExport(); } }
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
    closeTelemPopup();
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
    closeTelemPopup();   // close popup and pause any running lap replay when changing tabs
    if (id !== "live") stopLiveAuto();  // stop auto-refresh when leaving live tab
    active = id;
    for (const k in tabButtons) {
      tabButtons[k].classList.toggle("dh-active", k === id);
    }
    // Scroll the active tab button into view on narrow screens where tabs overflow
    const activeBtn = tabButtons[id];
    if (activeBtn && activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ inline: "nearest", behavior: "smooth", block: "nearest" });
    }
    // Mark content area so CSS can zero-out padding for split-layout tabs
    if (contentEl) contentEl.classList.toggle("dh-has-split", id === "live" || id === "telemetry");
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
      const grid = el("div", "dh-race-grid");
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
        if (r.time) {
          const t = new Date("1970-01-01T" + r.time);
          if (!isNaN(t.getTime())) {
            main.appendChild(el("div", "dh-race-time", t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })));
          }
        }
        row.appendChild(main);

        row.appendChild(el("div", "dh-race-date", fmtDate(r.date)));
        grid.appendChild(row);
      });
      wrap.appendChild(grid);
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
        const leaderPts = drivers.length > 0 && drivers[0].pos === 1 ? drivers[0].points : null;
        drivers.forEach(function (s) {
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
        cons.forEach(function (s) {
          const row = el("div", "dh-row");
          row.appendChild(el("span", "dh-pos", s.pos !== null && s.pos !== undefined ? s.pos : "—"));
          const ct = findTeam(s.name);
          row.appendChild(teamChip(ct ? ct.short : s.name.slice(0, 3).toUpperCase(), s.name));
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
      [["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"], ["GRID", "dh-th-grid"], ["TIME", null], ["PTS", null]].forEach(function (h) {
        hr.appendChild(el("th", h[1], h[0]));
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = el("tbody");
      results.forEach(function (r) {
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

    const fieldsRow = el("div", "dh-pick-fields");

    const gpField = el("label", "dh-pick-field");
    gpField.appendChild(el("span", "dh-pick-label", "GRAND PRIX"));
    const gpSel = el("select", "dh-pick-select");
    gpField.appendChild(gpSel);
    fieldsRow.appendChild(gpField);

    const sesField = el("label", "dh-pick-field");
    sesField.appendChild(el("span", "dh-pick-label", "SESSION"));
    const sesSel = el("select", "dh-pick-select");
    sesField.appendChild(sesSel);
    fieldsRow.appendChild(sesField);

    box.appendChild(fieldsRow);

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
      const wrap = el("div", "dh-tabbody dh-split");
      if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_LIVE_MSG)); return wrap; }
      const leftPane = el("div", "dh-split-L");
      const rightPane = el("div", "dh-split-R");
      leftPane.appendChild(buildPicker(function (meta) {
        renderLiveBody(meta, leftPane, rightPane);
        invalidateOther("live");
      }));
      wrap.appendChild(leftPane);
      wrap.appendChild(rightPane);
      renderLiveBody(sel.meta, leftPane, rightPane);
      return wrap;
    });
  }

  function renderLiveBody(meta, leftPane, rightPane) {
    stopLiveAuto();
    // Keep the picker (first child of leftPane); remove everything appended after it
    while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
    clear(rightPane);

    // Session info → left pane
    const info = el("div", "dh-livecard");
    const infoTitle = el("div", "dh-live-title");
    infoTitle.appendChild(el("span", null, meta.name || meta.type || "Session"));
    if (meta.type && meta.type !== meta.name) infoTitle.appendChild(el("span", "dh-live-type", meta.type));
    info.appendChild(infoTitle);
    const place = [meta.circuit, meta.country].filter(Boolean).join(" · ");
    if (place) info.appendChild(el("div", "dh-live-sub", place));
    if (meta.dateStart) info.appendChild(el("div", "dh-live-sub", "Starts " + fmtDateTime(meta.dateStart)));
    leftPane.appendChild(info);

    // Control bar → left pane
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
    leftPane.appendChild(bar);

    // Weather + classification → right pane
    const dataEl = el("div", "dh-tabbody");
    rightPane.appendChild(dataEl);

    function refresh() {
      clear(dataEl);
      dataEl.appendChild(spinner());
      Promise.all([
        F1API.weather(meta.sessionKey).catch(function () { return null; }),
        F1API.positions(meta.sessionKey).catch(function () { return null; }),
        F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; })
      ]).then(function (res) {
        clear(dataEl);
        fillLive(dataEl, res[0], res[1], res[2]);
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

  function fillLive(body, weather, positions, drivers) {
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
  // Implementation: js/data-telemetry.js.
  const { loadTelemetry, closeTelemPopup } = DataTelemetry.create({
    el: el, clear: clear, emptyMsg: emptyMsg, spinner: spinner,
    ensureSession: ensureSession, buildPicker: buildPicker,
    invalidateOther: invalidateOther, COMPOUND: COMPOUND, findTeam: findTeam,
    cssColor: cssColor, NO_TELEM_MSG: NO_TELEM_MSG });
  /* ================= EXPORT tab (dev) ================= */
  // Implementation: js/data-export.js.
  const { loadExport } = DataExport.create({ el: el, clear: clear });
  return { init: init, open: open, close: close, isOpen: isOpen };
})();
