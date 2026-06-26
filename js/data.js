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
    { id: "telemetry", label: "TELEMETRY", load: loadTelemetry },
    { id: "export", label: "EXPORT", load: loadExport }
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
      const wrap = el("div", "dh-tabbody dh-split");
      if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_TELEM_MSG)); return wrap; }
      const leftPane = el("div", "dh-split-L");
      const rightPane = el("div", "dh-split-R");
      leftPane.appendChild(buildPicker(function (meta) {
        renderTelemetryBody(meta, leftPane, rightPane);
        invalidateOther("telemetry");
      }));
      wrap.appendChild(leftPane);
      wrap.appendChild(rightPane);
      renderTelemetryBody(sel.meta, leftPane, rightPane);
      return wrap;
    });
  }

  function renderTelemetryBody(meta, leftPane, rightPane) {
    // Keep the picker (first child of leftPane); remove everything appended after it
    while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
    clear(rightPane);
    rightPane.appendChild(spinner());

    F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; }).then(function (drivers) {
      // Session info → left pane
      const info = el("div", "dh-livecard");
      const title = el("div", "dh-live-title");
      title.appendChild(el("span", null, meta.name || meta.type || "Session"));
      if (meta.type && meta.type !== meta.name) title.appendChild(el("span", "dh-live-type", meta.type));
      info.appendChild(title);
      const place = [meta.circuit, meta.country].filter(Boolean).join(" · ");
      if (place) info.appendChild(el("div", "dh-live-sub", place));
      info.appendChild(el("div", "dh-live-sub", "Tap up to 2 drivers · drag chart to scrub"));
      leftPane.appendChild(info);

      clear(rightPane);

      drivers = (drivers || []).filter(function (d) { return d && d.num !== null && d.num !== undefined; });
      if (!drivers.length) { rightPane.appendChild(emptyMsg(NO_TELEM_MSG)); return; }

      const picked = [];
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

      // Driver chips → left pane; chart detail → right pane
      leftPane.appendChild(pick);
      detail.appendChild(emptyMsg("← Pick a driver to load their fastest lap."));
      rightPane.appendChild(detail);
    }, function () {
      clear(rightPane); rightPane.appendChild(emptyMsg(NO_TELEM_MSG));
    });
  }

  // fetch one driver's fastest-lap bundle (extras = stints + pits for primary)
  function fetchDriverTel(sessionKey, d, withExtras) {
    return F1API.fastestLap(sessionKey, d.num).then(function (lap) {
      if (!lap || !lap.dateStart) return { d: d, lap: null };
      const start = lap.dateStart;
      const dur = lap.lapDuration || 90;
      const ms = Date.parse(start);
      const end = isFinite(ms) ? new Date(ms + dur * 1000 + 1500).toISOString() : start;
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
  let telView = null;                 // the live telemetry view (for animation cleanup)
  let telemPopup = null;              // the full-screen player popup element

  function stopTelAnim() {
    if (telView) {
      pauseAnim(telView);
      if (telView._ro) { telView._ro.disconnect(); telView._ro = null; }
    }
  }

  function closeTelemPopup() {
    stopTelAnim();
    if (telemPopup) {
      if (telemPopup.parentNode) telemPopup.parentNode.removeChild(telemPopup);
      telemPopup = null;
    }
  }

  function openTelemPopup(tels) {
    closeTelemPopup();
    const overlay = el("div", "dh-tpopup");

    const card = el("div", "dh-tpopup-card");

    // Header: driver name(s) + session context + close button
    const hdr = el("div", "dh-tpopup-hdr");
    const titleEl = el("div", "dh-tpopup-title");
    titleEl.appendChild(el("span", null, tels.map(function (t) { return t.d.name || dcode(t.d); }).join(" vs ")));
    if (sel.meta) {
      const sub = [sel.meta.name || sel.meta.type, sel.meta.circuit || sel.meta.country].filter(Boolean).join(" · ");
      if (sub) titleEl.appendChild(el("span", "dh-tpopup-sub", sub));
    }
    hdr.appendChild(titleEl);
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.addEventListener("click", closeTelemPopup);
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    const body = el("div", "dh-tpopup-body");
    body.appendChild(spinner());
    card.appendChild(body);
    overlay.appendChild(card);

    // Close on backdrop click
    overlay.addEventListener("pointerdown", function (e) {
      if (e.target === overlay) closeTelemPopup();
    });

    // Close on Escape (cleaned up when popup closes)
    function onKey(e) {
      if (e.key === "Escape") { closeTelemPopup(); document.removeEventListener("keydown", onKey); }
    }
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    telemPopup = overlay;

    // Build after layout so clientWidth measurements are real
    setTimeout(function () {
      if (telemPopup !== overlay) return;
      clear(body);
      buildTelemetryView(body, tels);
    }, 0);
  }

  function loadTelemetrySet(sessionKey, picked, detail) {
    const myGen = ++telGen;
    stopTelAnim();
    if (!picked.length) return;
    clear(detail);
    detail.appendChild(spinner());
    Promise.all(picked.map(function (d, i) { return fetchDriverTel(sessionKey, d, i === 0); }))
      .then(function (tels) {
        if (myGen !== telGen) return;
        clear(detail);
        detail.appendChild(emptyMsg("← Pick a driver to load their fastest lap."));
        openTelemPopup(tels);
      }, function () {
        if (myGen !== telGen) return;
        clear(detail);
        detail.appendChild(emptyMsg("Couldn't load telemetry."));
      });
  }

  function buildTelemetryView(detail, tels) {
    stopTelAnim();
    const primary = tels[0];
    const compare = tels[1] || null;

    // Main column: driver headers, transport, chart, legend, stints
    const mainArea = el("div", "dh-telem-main");
    // Side column: gauges + map
    const sideArea = el("div", "dh-telem-side");

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
      if (t.lap && t.lap.s1 !== null && t.lap.s2 !== null && t.lap.s3 !== null) {
        head.appendChild(el("div", "dh-live-sub dh-sectors",
          "S1 " + t.lap.s1.toFixed(3) + "  ·  S2 " + t.lap.s2.toFixed(3) + "  ·  S3 " + t.lap.s3.toFixed(3)));
      }
      mainArea.appendChild(head);
    });

    if (!primary.car || !primary.car.length) {
      mainArea.appendChild(emptyMsg("Car telemetry isn't available for this lap."));
      detail.appendChild(mainArea);
      appendStintsPits(mainArea, primary);
      return;
    }

    const view = {
      primary: primary,
      compare: (compare && compare.car && compare.car.length) ? compare : null,
      visible: {}, cursorT: 0,
      tMax: 0, speedMax: 1, rpmMax: 1,
      playing: false, rate: 2, _raf: 0, _last: 0, onboard: false,
      chart: null, map: null, delta: null,
      chartBase: null, mapBase: null, deltaBase: null, mapT: null,
      sectors: null, g: null, playBtn: null
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
    primary.cum = cumDist(primary.car);
    if (view.compare) view.compare.cum = cumDist(view.compare.car);
    if (primary.lap && primary.lap.s1 !== null && primary.lap.s2 !== null) {
      view.sectors = [primary.lap.s1, primary.lap.s1 + primary.lap.s2];
    }

    // Transport bar → main
    mainArea.appendChild(buildTransport(view));

    // Canvas width: detail is the popup body, already in DOM (called via setTimeout).
    // In landscape the side panel takes 200px + 1px border + 24px padding = 225px.
    const isLS = typeof window !== "undefined" && window.innerWidth > window.innerHeight && window.innerHeight < 520;
    const sideW = isLS ? 225 : 0;
    const CW = detail.clientWidth > 40
      ? Math.min(600, Math.max(260, detail.clientWidth - sideW - 28))
      : (isLS ? 360 : 330);
    const CH_CHART = Math.round(CW * (220 / 600));

    const c1 = el("canvas", "dh-canvas");
    c1.width = CW; c1.height = CH_CHART; c1.style.touchAction = "none";
    mainArea.appendChild(c1);
    view.chart = c1;
    view.chartBase = makeOffscreen(CW, CH_CHART);

    if (view.compare) {
      const CD_H = Math.round(CW * (72 / 600));
      const cd = el("canvas", "dh-canvas dh-delta");
      cd.width = CW; cd.height = CD_H; cd.style.touchAction = "none";
      mainArea.appendChild(cd);
      view.delta = cd;
      view.deltaBase = makeOffscreen(CW, CD_H);
      attachScrub(cd, view);
    }

    const legend = el("div", "dh-legend");
    CHANNELS.forEach(function (ch) {
      const item = el("button", "dh-legend-item" + (view.visible[ch.id] ? "" : " dh-off"));
      item.type = "button";
      const dot = el("span", "dh-legend-dot"); dot.style.background = ch.color;
      item.appendChild(dot); item.appendChild(document.createTextNode(ch.label));
      item.addEventListener("click", function () {
        view.visible[ch.id] = !view.visible[ch.id];
        item.classList.toggle("dh-off", !view.visible[ch.id]);
        buildBases(view); paintFrame(view);
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
    mainArea.appendChild(legend);

    // Stints/pits below the chart in the main column
    appendStintsPits(mainArea, primary);

    // Gauges + map → side column
    sideArea.appendChild(buildGauges(view));

    if (primary.loc && primary.loc.length > 8) {
      const c2 = el("canvas", "dh-canvas dh-map");
      c2.width = 320; c2.height = 320;
      sideArea.appendChild(c2);
      view.map = c2;
      view.mapBase = makeOffscreen(320, 320);
    }

    detail.appendChild(mainArea);
    detail.appendChild(sideArea);

    attachScrub(c1, view);
    buildBases(view);
    paintFrame(view);
    telView = view;

    // Resize canvases when the popup is resized (e.g. orientation change)
    if (typeof ResizeObserver !== "undefined") {
      let lastW = detail.clientWidth;
      const ro = new ResizeObserver(function () {
        const w = detail.clientWidth;
        if (Math.abs(w - lastW) > 20) {
          lastW = w;
          const ls = window.innerWidth > window.innerHeight && window.innerHeight < 520;
          const sw = ls ? 225 : 0;
          const newCW = Math.min(600, Math.max(260, w - sw - 28));
          if (view.chart && view.chart.width !== newCW) {
            const newCH = Math.round(newCW * (220 / 600));
            view.chart.width = newCW; view.chart.height = newCH;
            view.chartBase = makeOffscreen(newCW, newCH);
            if (view.delta) {
              const dh = Math.round(newCW * (72 / 600));
              view.delta.width = newCW; view.delta.height = dh;
              view.deltaBase = makeOffscreen(newCW, dh);
            }
          }
          buildBases(view); paintFrame(view);
        }
      });
      ro.observe(detail);
      view._ro = ro;
    }
  }

  function makeOffscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // cumulative distance (m) along the lap, sampled at each car-data time, so we
  // can compute a real position-based time delta between two laps.
  function cumDist(car) {
    const t = [], d = [];
    let acc = 0;
    for (let i = 0; i < car.length; i++) {
      if (i > 0) {
        const dt = car[i].t - car[i - 1].t;
        const v = (car[i].speed || 0) / 3.6;   // km/h -> m/s
        acc += v * dt;
      }
      t.push(car[i].t); d.push(acc);
    }
    return { t: t, d: d };
  }
  function interp(xs, ys, x) {
    if (!xs.length) return 0;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; }
    const x0 = xs[lo - 1], x1 = xs[lo], f = (x - x0) / ((x1 - x0) || 1);
    return ys[lo - 1] + (ys[lo] - ys[lo - 1]) * f;
  }
  function distAtT(cum, t) { return interp(cum.t, cum.d, t); }
  function timeAtDist(cum, dist) { return interp(cum.d, cum.t, dist); }

  function buildTransport(view) {
    const bar = el("div", "dh-transport");
    const play = el("button", "dh-tbtn dh-tplay", "▶ PLAY");
    play.type = "button";
    play.addEventListener("click", function () { if (view.playing) pauseAnim(view); else playAnim(view); });
    view.playBtn = play;
    const restart = el("button", "dh-tbtn dh-trestart", "⏮");
    restart.type = "button"; restart.title = "Restart lap";
    restart.addEventListener("click", function () { view.cursorT = 0; view._last = 0; paintFrame(view); });
    bar.appendChild(play); bar.appendChild(restart);

    const rates = el("div", "dh-trates");
    [1, 2, 4].forEach(function (r) {
      const b = el("button", "dh-ratebtn" + (r === view.rate ? " dh-active" : ""), r + "×");
      b.type = "button";
      b.addEventListener("click", function () {
        view.rate = r;
        const bs = rates.querySelectorAll(".dh-ratebtn");
        for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("dh-active", bs[i] === b);
      });
      rates.appendChild(b);
    });
    bar.appendChild(rates);

    if (view.primary.loc && view.primary.loc.length > 8) {
      const ob = el("button", "dh-tbtn dh-onboard", "ONBOARD");
      ob.type = "button";
      ob.title = "Rotate the map so the car always points up";
      ob.addEventListener("click", function () {
        view.onboard = !view.onboard;
        ob.classList.toggle("dh-tplaying", view.onboard);
        paintFrame(view);
      });
      bar.appendChild(ob);
    }

    bar.appendChild(el("span", "dh-thint", "drag chart to scrub"));
    return bar;
  }
  function setPlayLabel(view) {
    if (!view.playBtn) return;
    view.playBtn.textContent = view.playing ? "⏸ PAUSE" : "▶ PLAY";
    view.playBtn.classList.toggle("dh-tplaying", view.playing);
  }

  function buildGauges(view) {
    const card = el("div", "dh-dash");
    function valCell(cls, label) {
      const w = el("div", "dh-gcell " + cls);
      w.appendChild(el("div", "dh-glabel", label));
      const v = el("div", "dh-gval", "—"); w.appendChild(v);
      card.appendChild(w); return v;
    }
    function barCell(cls, label, color) {
      const w = el("div", "dh-gcell " + cls);
      w.appendChild(el("div", "dh-glabel", label));
      const track = el("div", "dh-gbar");
      const fill = el("div", "dh-gfill"); fill.style.background = color;
      track.appendChild(fill); w.appendChild(track);
      card.appendChild(w); return fill;
    }
    const g = {};
    g.speed = valCell("dh-gspeed", "SPEED km/h");
    g.gear = valCell("dh-ggear", "GEAR");
    g.thr = barCell("dh-gthr", "THROTTLE", "#3fb950");
    g.brk = barCell("dh-gbrk", "BRAKE", "#ff4d4d");
    g.rpm = barCell("dh-grpm", "RPM", "#c084fc");
    const drsCell = el("div", "dh-gcell dh-gdrscell");
    drsCell.appendChild(el("div", "dh-glabel", "DRS"));
    g.drs = el("div", "dh-gdrs-pill", "—");
    drsCell.appendChild(g.drs); card.appendChild(drsCell);
    if (view.compare) {
      const dcell = el("div", "dh-gcell dh-gdeltacell");
      dcell.appendChild(el("div", "dh-glabel", "Δ " + dcode(view.compare.d)));
      g.delta = el("div", "dh-gval dh-gdelta", "—");
      dcell.appendChild(g.delta); card.appendChild(dcell);
    }
    view.g = g;
    return card;
  }
  function updateGauges(view) {
    const g = view.g; if (!g) return;
    const t = view.cursorT === null ? 0 : view.cursorT;
    const c = sampleAt(view.primary.car, t);
    if (!c) return;
    g.speed.textContent = c.speed === null ? "—" : Math.round(c.speed);
    g.gear.textContent = (c.gear === null || c.gear === undefined) ? "—" : (c.gear ? "G" + c.gear : "N");
    g.thr.style.width = (c.throttle === null ? 0 : clamp(c.throttle, 0, 100)) + "%";
    g.brk.style.width = (c.brake === null ? 0 : clamp(c.brake, 0, 100)) + "%";
    g.rpm.style.width = (c.rpm === null ? 0 : clamp(c.rpm / view.rpmMax * 100, 0, 100)) + "%";
    const open = c.drs !== null && c.drs !== undefined && drsOpen(c.drs);
    g.drs.textContent = open ? "OPEN" : "—";
    g.drs.classList.toggle("dh-on", open);
    if (g.delta && view.compare) {
      const dP = distAtT(view.primary.cum, t);
      const delta = timeAtDist(view.compare.cum, dP) - t;   // >0: compare is behind
      g.delta.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(2) + "s";
      g.delta.classList.toggle("dh-pos", delta > 0.02);
      g.delta.classList.toggle("dh-neg", delta < -0.02);
    }
  }

  // drag the trace chart to scrub (pauses playback)
  function attachScrub(canvas, view) {
    function at(ev) {
      const r = canvas.getBoundingClientRect();
      view.cursorT = clamp((ev.clientX - r.left) / (r.width || 1), 0, 1) * view.tMax;
      paintFrame(view);
    }
    canvas.addEventListener("pointerdown", function (ev) {
      pauseAnim(view);
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      at(ev);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (ev.buttons) at(ev);
    });
  }

  function playAnim(view) {
    if (view.playing) return;
    if (view.cursorT === null || view.cursorT >= view.tMax) view.cursorT = 0;
    view.playing = true; view._last = 0; setPlayLabel(view);
    view._raf = requestAnimationFrame(function step(ts) {
      if (!view.playing) return;
      if (!view._last) view._last = ts;
      const dt = (ts - view._last) / 1000; view._last = ts;
      let nt = (view.cursorT || 0) + dt * view.rate;
      if (nt >= view.tMax) nt = 0;        // loop the lap
      view.cursorT = nt;
      paintFrame(view);
      view._raf = requestAnimationFrame(step);
    });
  }
  function pauseAnim(view) {
    if (!view.playing) return;
    view.playing = false;
    if (view._raf) { cancelAnimationFrame(view._raf); view._raf = 0; }
    setPlayLabel(view);
  }

  // nearest location sample to lap time t (matched on car-data timestamp)
  function locAt(view, tel, t) {
    const cs = sampleAt(tel.car, t);
    const loc = (tel.loc && tel.loc.length) ? tel.loc : view.primary.loc;
    if (!cs || !loc || !loc.length) return loc && loc[0];
    let best = loc[0], bd = Infinity;
    for (let i = 0; i < loc.length; i++) {
      const dd = Math.abs(loc[i].date - cs.date);
      if (dd < bd) { bd = dd; best = loc[i]; }
    }
    return best;
  }

  // composite one frame: cached bases + moving cursor, car dots, delta, gauges
  function paintFrame(view) {
    const T = view.cursorT === null ? 0 : view.cursorT;
    // ---- trace chart ----
    const cg = view.chart.getContext("2d");
    const W = view.chart.width, H = view.chart.height, pad = 6;
    cg.clearRect(0, 0, W, H);
    cg.drawImage(view.chartBase, 0, 0);
    const X = pad + (T / view.tMax) * (W - 2 * pad);
    cg.strokeStyle = "rgba(255,255,255,0.55)"; cg.lineWidth = 1;
    cg.beginPath(); cg.moveTo(X, pad); cg.lineTo(X, H - pad); cg.stroke();
    const c = sampleAt(view.primary.car, T);
    const f = chanNorm(CHANNELS[0], c, view);
    if (f !== null) {
      cg.fillStyle = CHANNELS[0].color;
      cg.beginPath(); cg.arc(X, H - pad - f * (H - 2 * pad), 3.5, 0, Math.PI * 2); cg.fill();
    }
    // ---- delta strip ----
    if (view.delta) {
      const dgx = view.delta.getContext("2d");
      const DW = view.delta.width, DH = view.delta.height;
      dgx.clearRect(0, 0, DW, DH);
      dgx.drawImage(view.deltaBase, 0, 0);
      const dx = pad + (T / view.tMax) * (DW - 2 * pad);
      dgx.strokeStyle = "rgba(255,255,255,0.55)"; dgx.lineWidth = 1;
      dgx.beginPath(); dgx.moveTo(dx, 0); dgx.lineTo(dx, DH); dgx.stroke();
    }
    // ---- track map (with optional onboard rotation) ----
    if (view.map) {
      const mg = view.map.getContext("2d");
      const MW = view.map.width, MH = view.map.height;
      mg.clearRect(0, 0, MW, MH);
      if (view.onboard && view.mapT) {
        const here = locAt(view, view.primary, T);
        const ahead = locAt(view, view.primary, Math.min(view.tMax, T + 0.6));
        const p0 = mapPoint(view, here), p1 = mapPoint(view, ahead);
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const ZOOM = 2.6;
        mg.save();
        mg.translate(MW / 2, MH / 2);
        mg.scale(ZOOM, ZOOM);
        mg.rotate(-ang - Math.PI / 2);     // heading -> up
        mg.translate(-p0[0], -p0[1]);
        mg.drawImage(view.mapBase, 0, 0);
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(driverColor(view.compare.d)), 1 / ZOOM);
        drawCarDot(mg, view, view.primary, T, "#fff", 1 / ZOOM);
        mg.restore();
      } else {
        mg.drawImage(view.mapBase, 0, 0);
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(driverColor(view.compare.d)), 1);
        drawCarDot(mg, view, view.primary, T, "#fff", 1);
      }
    }
    updateGauges(view);
  }
  function drawCarDot(g, view, tel, t, fill, rscale) {
    const best = locAt(view, tel, t);
    if (!best) return;
    const p = mapPoint(view, best);
    const r = 5.5 * (rscale || 1);
    g.fillStyle = fill; g.strokeStyle = "rgba(0,0,0,0.65)"; g.lineWidth = 2 * (rscale || 1);
    g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  function appendStintsPits(detail, b) {
    const d = b.d;
    const myStints = (b.stints || []).filter(function (s) { return s.num === d.num; });
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

  // rebuild the cached static layers (chart traces + coloured track map + delta)
  function buildBases(view) {
    renderTraces(view.chartBase.getContext("2d"), view.chartBase.width, view.chartBase.height, view);
    if (view.map) {
      computeMapTransform(view);
      renderMap(view.mapBase.getContext("2d"), view.mapBase.width, view.mapBase.height, view);
    }
    if (view.delta) renderDelta(view.deltaBase.getContext("2d"), view.deltaBase.width, view.deltaBase.height, view);
  }

  // multi-channel traces for the primary driver (+ compare speed overlay),
  // with faint sector-boundary markers.
  function renderTraces(g, W, H, view) {
    const pad = 6;
    g.clearRect(0, 0, W, H);
    const X = function (t) { return pad + (t / view.tMax) * (W - 2 * pad); };
    const Y = function (f) { return H - pad - f * (H - 2 * pad); };
    // sector dividers + labels
    if (view.sectors) {
      g.font = "9px system-ui, sans-serif"; g.textBaseline = "top";
      const bounds = [0].concat(view.sectors).concat([view.tMax]);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      view.sectors.forEach(function (sb) {
        const x = X(sb);
        g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke();
        g.setLineDash([]);
      });
      g.fillStyle = "rgba(255,255,255,0.4)";
      for (let s = 0; s < 3; s++) {
        const mid = X((bounds[s] + bounds[s + 1]) / 2);
        g.fillText("S" + (s + 1), mid - 6, pad + 1);
      }
    }
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
    if (view.compare) {
      g.setLineDash([4, 3]);
      line(view.compare.car, CHANNELS[0], cssColor(driverColor(view.compare.d)), 1.5);
      g.setLineDash([]);
    }
    for (let k = CHANNELS.length - 1; k >= 0; k--) {
      const ch = CHANNELS[k];
      if (view.visible[ch.id]) line(view.primary.car, ch, ch.color, ch.w);
    }
  }

  // gap-to-compare across the lap: delta(t) = time for compare to reach the
  // same track distance, minus t. Filled green where the primary is ahead.
  function deltaSamples(view) {
    const car = view.primary.car, out = [];
    let mn = 0, mx = 0;
    for (let i = 0; i < car.length; i++) {
      const t = car[i].t;
      const dP = distAtT(view.primary.cum, t);
      const dl = timeAtDist(view.compare.cum, dP) - t;
      out.push(dl);
      if (dl < mn) mn = dl; if (dl > mx) mx = dl;
    }
    return { d: out, mn: mn, mx: mx };
  }
  function renderDelta(g, W, H, view) {
    const pad = 6, car = view.primary.car;
    g.clearRect(0, 0, W, H);
    const ds = deltaSamples(view);
    view._delta = ds;
    const span = Math.max(0.15, ds.mx - ds.mn);
    const X = function (t) { return pad + (t / view.tMax) * (W - 2 * pad); };
    const Y = function (v) { return pad + (ds.mx - v) / span * (H - 2 * pad); };
    const y0 = Y(0);
    // zero line
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, y0); g.lineTo(W - pad, y0); g.stroke();
    // filled gap area, split at the zero crossing colour-wise
    const col = cssColor(driverColor(view.primary.d));
    g.beginPath();
    g.moveTo(X(0), y0);
    for (let i = 0; i < car.length; i++) g.lineTo(X(car[i].t), Y(ds.d[i]));
    g.lineTo(X(view.tMax), y0); g.closePath();
    g.fillStyle = "rgba(63,185,80,0.18)"; g.fill();
    g.beginPath();
    let started = false;
    for (let i = 0; i < car.length; i++) {
      const x = X(car[i].t), y = Y(ds.d[i]);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.strokeStyle = col; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.font = "9px system-ui, sans-serif";
    g.textBaseline = "top"; g.fillText("GAP TO " + dcode(view.compare.d) + " (s)", pad + 2, 2);
  }

  // screen transform for the track map (from the primary lap's x/y bounds)
  function computeMapTransform(view) {
    const loc = view.primary.loc, W = view.mapBase.width, H = view.mapBase.height, pad = 14;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < loc.length; i++) {
      if (loc[i].x < minx) minx = loc[i].x; if (loc[i].x > maxx) maxx = loc[i].x;
      if (loc[i].y < miny) miny = loc[i].y; if (loc[i].y > maxy) maxy = loc[i].y;
    }
    const spanx = (maxx - minx) || 1, spany = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    view.mapT = { minx: minx, miny: miny, sc: sc, ox: (W - spanx * sc) / 2, oy: (H - spany * sc) / 2, W: W, H: H };
  }
  function mapPoint(view, p) {
    const m = view.mapT;
    return [m.ox + (p.x - m.minx) * m.sc, m.H - (m.oy + (p.y - m.miny) * m.sc)];
  }

  // track map from x/y, coloured by speed (slow = blue, fast = red)
  function renderMap(g, W, H, view) {
    const loc = view.primary.loc, car = view.primary.car;
    g.clearRect(0, 0, W, H);
    let vMax = 1;
    for (let i = 0; i < (car ? car.length : 0); i++) if ((car[i].speed || 0) > vMax) vMax = car[i].speed;
    function speedAtDate(date) {
      if (!car || !car.length) return null;
      let ci = 0;
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
      const p0 = mapPoint(view, loc[i - 1]), p1 = mapPoint(view, loc[i]);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    }
    // sector-boundary ticks
    if (view.sectors) {
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1;
      g.font = "9px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "center";
      view.sectors.forEach(function (sb, idx) {
        const lp = locAt(view, view.primary, sb);
        if (!lp) return;
        const p = mapPoint(view, lp);
        g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillText("S" + (idx + 2), p[0], p[1] - 9);
        g.fillStyle = "rgba(255,255,255,0.9)";
      });
      g.textAlign = "left";
    }
  }

  /* ================= EXPORT tab (dev) =================
     Runs in the browser (where OpenF1 is reachable) and downloads a JSON file.
     For each circuit of the chosen season it pulls ONE clean fast-lap location
     trace. An OpenF1 lap STARTS at the start/finish line, so trace[0] is the
     real S/F point — used offline to validate/correct each circuit's start
     line (s=0 / startFrac) against the game's centreline. */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Gather {circuit -> {sf, trace, ...}} for a season. Sequential, paced, and
  // retried so it survives OpenF1 rate limiting (429). The api layer already
  // backs off per request; here we add inter-meeting spacing plus a second pass
  // over any circuits the first pass missed. `log` streams progress to the UI.
  function gatherStartLines(year, log) {
    const out = { year: year, generatedAt: new Date().toISOString(), circuits: {} };
    // 5 s between meetings + 3 s sleeps between each request within a meeting
    // keeps the rate well under OpenF1's free-tier limit (~20 req/min).
    const GAP = 5000;
    const DRIVERS = 3;

    // Resolve one meeting → store its trace. Returns true if captured.
    // retrying=true suppresses the 90-second rate-limit wait to avoid double-wait.
    function tryMeeting(m, retrying) {
      const key = m.circuit || m.name;
      return F1API.sessionsForMeeting(m.meetingKey).then(function (ss) {
        const s = ss.find(function (x) { return /quali/i.test(x.name || ""); }) ||
                  ss.find(function (x) { return /race/i.test(x.name || ""); }) ||
                  ss[ss.length - 1];
        if (!s) { log("· no session: " + key); return false; }
        return sleep(2000).then(function () {
          return F1API.sessionDrivers(s.sessionKey);
        }).then(function (drv) {
          if (!drv || !drv.length) { log("· no drivers: " + key); return false; }
          const cand = drv.slice(0, DRIVERS);
          let dc = Promise.resolve(false);
          cand.forEach(function (d) {
            dc = dc.then(function (done) {
              if (done) return true;
              // 3 s before each laps request to stay within rate limit
              return sleep(3000).then(function () {
                return F1API.fastestLap(s.sessionKey, d.num);
              }).then(function (fl) {
                if (!fl || !fl.dateStart) return false;
                const endISO = new Date(Date.parse(fl.dateStart) + (fl.lapDuration + 1) * 1000).toISOString();
                // 3 s before location (large response — give the server breathing room)
                return sleep(3000).then(function () {
                  return F1API.locationData(s.sessionKey, d.num, fl.dateStart, endISO);
                }).then(function (loc) {
                  if (!loc || loc.length < 20) return false;
                  const step = Math.max(1, Math.floor(loc.length / 240));
                  const trace = loc.filter(function (_, i) { return i % step === 0; })
                                   .map(function (p) { return [Math.round(p.x), Math.round(p.y)]; });
                  out.circuits[key] = {
                    circuit: m.circuit, country: m.country, driver: d.code,
                    lapDur: fl.lapDuration, sf: trace[0], nLoc: loc.length, trace: trace
                  };
                  log("✓ " + key + "  pts=" + trace.length + " (" + (d.code || ("#" + d.num)) + ")");
                  return true;
                });
              }).catch(function () { return false; });
            });
          });
          return dc.then(function (done) { if (!done) log("· no lap/loc: " + key); return done; });
        });
      }).catch(function (e) {
        const msg = e && e.message || String(e);
        // On 429 wait 90 s then retry once — longer than OpenF1's sliding window
        if (!retrying && /429/.test(msg)) {
          log("· rate limited for " + key + " — waiting 90 s…");
          return sleep(90000).then(function () { return tryMeeting(m, true); });
        }
        log("· skip " + key + ": " + msg);
        return false;
      });
    }

    // Walk a list of meetings sequentially, pausing GAP between each. Returns the
    // sub-list that did NOT yield a trace (for a retry pass).
    function pass(list, label) {
      let chain = Promise.resolve();
      const missed = [];
      list.forEach(function (m, i) {
        chain = chain.then(function () {
          return tryMeeting(m, false).then(function (ok) { if (!ok) missed.push(m); });
        }).then(function () { return i < list.length - 1 ? sleep(GAP) : null; });
      });
      return chain.then(function () { return missed; });
    }

    return F1API.meetings(year).then(function (ms) {
      log("meetings: " + ms.length + " — gathering (~10 min, paced to avoid rate limits)…");
      return pass(ms, "pass 1").then(function (missed) {
        if (!missed.length) return;
        log("retrying " + missed.length + " missed circuit(s) — waiting 2 min for rate limit to clear…");
        return sleep(120000).then(function () { return pass(missed, "pass 2"); });
      });
    }).then(function () {
      log("done — " + Object.keys(out.circuits).length + " circuits captured");
      return out;
    });
  }

  /* ---- minimal STORE-only ZIP writer (no deps; PNGs are already compressed) ---- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  }
  function makeZip(files) {  // files: [{name, data: Uint8Array}]
    const enc = new TextEncoder();
    const u16 = function (n) { return [n & 255, (n >>> 8) & 255]; };
    const u32 = function (n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; };
    const parts = [], central = [];
    let offset = 0;
    files.forEach(function (f) {
      const nameB = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0));
      parts.push(new Uint8Array(local), nameB, f.data);
      central.push({ nameB: nameB, crc: crc, sz: sz, offset: offset });
      offset += local.length + nameB.length + sz;
    });
    const cdStart = offset;
    const cd = [];
    central.forEach(function (c) {
      const hdr = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.sz), u32(c.sz), u16(c.nameB.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.offset));
      cd.push(new Uint8Array(hdr), c.nameB);
      offset += hdr.length + c.nameB.length;
    });
    const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0),
      u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)));
    return new Blob(parts.concat(cd, [end]), { type: "application/zip" });
  }

  function safeName(s) { return String(s || "circuit").replace(/[^a-z0-9_-]+/gi, "_"); }

  // Render one gathered trace to a PNG (Uint8Array). Draws the lap path, marks
  // trace[0] = the real start/finish point (red), and an arrow for the initial
  // travel direction — so the start line & driving direction can be eyeballed
  // against the in-game layout.
  function traceToPng(circ) {
    const t = circ.trace || [];
    const W = 560, H = 560, pad = 48;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0c0c12"; g.fillRect(0, 0, W, H);
    if (t.length < 2) { return canvasPng(cv); }
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    t.forEach(function (p) {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    });
    const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    const X = function (x) { return pad + (x - minx) * sc; };
    const Y = function (y) { return H - (pad + (y - miny) * sc); };  // flip Y → north-up
    g.strokeStyle = "#4da3ff"; g.lineWidth = 3; g.lineJoin = "round"; g.beginPath();
    t.forEach(function (p, i) { const x = X(p[0]), y = Y(p[1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    // initial-direction arrow (trace[0] → a few points along)
    const a = t[0], b = t[Math.min(10, t.length - 1)];
    g.strokeStyle = "#ffd54a"; g.lineWidth = 4; g.beginPath();
    g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke();
    // S/F marker at trace[0]
    g.fillStyle = "#e10600"; g.beginPath(); g.arc(X(a[0]), Y(a[1]), 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 18px sans-serif";
    g.fillText((circ.circuit || "?") + "  [" + (circ.driver || "") + "]", 14, 28);
    g.font = "13px sans-serif"; g.fillStyle = "#e10600"; g.fillText("● start/finish (lap start)", 14, H - 30);
    g.fillStyle = "#ffd54a"; g.fillText("→ initial direction", 14, H - 12);
    return canvasPng(cv);
  }
  function canvasPng(cv) {
    return new Promise(function (res) {
      cv.toBlob(function (blob) {
        if (!blob) { res(new Uint8Array(0)); return; }
        blob.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); });
      }, "image/png");
    });
  }

  function loadExport() {
    const wrap = el("div", "dh-export");
    wrap.appendChild(el("div", "dh-export-note",
      "Pulls one fast-lap GPS trace per circuit from OpenF1 (runs in your browser). " +
      "The lap starts at the start/finish line, so it captures where each S/F really is. " +
      "Pick a season, Gather (~10 min — paced to avoid rate limits), then Download a ZIP " +
      "(traces JSON + a labelled map image per circuit) and send it to me."));

    const yearRow = el("div", "dh-pick-years");
    const sel = { year: 2025 };
    [2025, 2024, 2023].forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " dh-active" : ""), String(y));
      b.addEventListener("click", function () {
        sel.year = y;
        for (let i = 0; i < yearRow.children.length; i++)
          yearRow.children[i].classList.toggle("dh-active", yearRow.children[i] === b);
      });
      yearRow.appendChild(b);
    });
    wrap.appendChild(yearRow);

    const row = el("div", "dh-export-row");
    const gatherBtn = el("button", "dh-pill dh-active", "Gather");
    const dlBtn = el("button", "dh-pill", "Download");
    dlBtn.disabled = true;
    row.appendChild(gatherBtn);
    row.appendChild(dlBtn);
    wrap.appendChild(row);

    const status = el("pre", "dh-export-status", "Ready.");
    wrap.appendChild(status);

    let result = null, running = false;
    const logs = [];
    const log = function (m) { logs.push(String(m)); status.textContent = logs.slice(-200).join("\n"); status.scrollTop = status.scrollHeight; };

    gatherBtn.addEventListener("click", function () {
      if (running) return;
      running = true; result = null; dlBtn.disabled = true; logs.length = 0;
      gatherBtn.textContent = "Gathering…";
      log("Gathering " + sel.year + " — this can take a minute…");
      gatherStartLines(sel.year, log).then(function (res) {
        result = res; dlBtn.disabled = false;
        log("Ready to download.");
      }).catch(function (e) {
        log("ERROR: " + (e && e.message || e));
      }).then(function () { running = false; gatherBtn.textContent = "Gather"; });
    });

    function triggerDownload(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    dlBtn.addEventListener("click", function () {
      if (!result || running) return;
      running = true; dlBtn.disabled = true; dlBtn.textContent = "Zipping…";
      const enc = new TextEncoder();
      const json = JSON.stringify(result, null, 1);
      const files = [{ name: "startlines-" + sel.year + ".json", data: enc.encode(json) }];
      const keys = Object.keys(result.circuits);
      log("rendering " + keys.length + " circuit map image(s)…");
      let chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          return traceToPng(result.circuits[k]).then(function (png) {
            if (png && png.length) files.push({ name: "img/" + safeName(k) + ".png", data: png });
          });
        });
      });
      chain.then(function () {
        const zip = makeZip(files);
        triggerDownload(zip, "apex-startlines-" + sel.year + ".zip");
        log("Downloaded apex-startlines-" + sel.year + ".zip — " + files.length +
            " file(s), " + Math.round(zip.size / 1024) + " KB");
      }).catch(function (e) {
        log("ZIP ERROR: " + (e && e.message || e));
      }).then(function () { running = false; dlBtn.disabled = false; dlBtn.textContent = "Download"; });
    });

    return Promise.resolve(wrap);
  }

  return { init: init, open: open, close: close, isOpen: isOpen };
})();
