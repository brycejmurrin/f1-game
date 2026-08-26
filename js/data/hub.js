/* Apex 26 — DataHub: F1 data overlay (#datahub). Tabs: SCHEDULE | STANDINGS | LAST RACE | LIVE | TELEMETRY | EXPORT. All API-derived DOM is built with createEleme… */
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
    { id: "schedule", label: "SCHEDULE", load: function () { return loadSchedule(); } },
    { id: "standings", label: "STANDINGS", load: function () { return loadStandings(); } },
    { id: "lastrace", label: "LAST RACE", load: function () { return loadLastRace(); } },
    { id: "live", label: "LIVE", load: function () { return loadLive(); } },
    { id: "telemetry", label: "TELEMETRY", load: function () { return loadTelemetry(); } },
    { id: "export", label: "EXPORT", load: function () { return loadExport(); } }
  ];

  let root = null;
  let contentEl = null;
  let tabButtons = {};            // id -> button element
  let openFlag = false;
  let active = "schedule";
  let returnFocus = null;
  const state = {};               // id -> {node, at}
  const gen = {};                 // id -> load generation (ignores stale resolutions)

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

  function init(rootEl) {
    if (root || !rootEl) return;
    root = rootEl;
    root.classList.add("dh-overlay");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "dh-title");

    // fit-managed: SheetShape scans this class alongside .sheet, so a short
    // window at high UI SIZE shrinks the card via --fit-at (css/data.css)
    // instead of leaving header+tabs most of the local box.
    const card = el("div", "dh-card fit-managed");

    // header
    const header = el("div", "dh-header");
    const title = el("h2", "dh-title", "F1 DATA HUB");
    title.id = "dh-title";
    header.appendChild(title);
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close data hub");
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // tabs
    const tabs = el("div", "dh-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Data hub sections");
    TABS.forEach(function (t) {
      const b = el("button", "dh-tab", t.label);
      b.type = "button";
      b.id = "dh-tab-" + t.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "dh-panel");
      b.setAttribute("aria-selected", "false");
      b.tabIndex = -1;
      b.addEventListener("click", function () { showTab(t.id); });
      tabButtons[t.id] = b;
      tabs.appendChild(b);
    });
    card.appendChild(tabs);

    // content
    contentEl = el("div", "dh-content");
    contentEl.id = "dh-panel";
    contentEl.setAttribute("role", "tabpanel");
    card.appendChild(contentEl);

    root.appendChild(card);

    document.addEventListener("keydown", function (ev) {
      if (!openFlag || document.querySelector(".dh-tpopup")) return;
      if (ev.key === "Escape") { close(); return; }
      const target = ev.target;
      if (target && target.getAttribute && target.getAttribute("role") === "tab") {
        const ids = TABS.map(function (t) { return t.id; });
        let idx = ids.indexOf(active);
        if (ev.key === "ArrowRight") idx = (idx + 1) % ids.length;
        else if (ev.key === "ArrowLeft") idx = (idx + ids.length - 1) % ids.length;
        else if (ev.key === "Home") idx = 0;
        else if (ev.key === "End") idx = ids.length - 1;
        else idx = -1;
        if (idx !== -1) {
          ev.preventDefault();
          showTab(ids[idx]);
          tabButtons[ids[idx]].focus();
          return;
        }
      }
      if (ev.key === "Tab") trapFocus(root, ev);
    });
  }

  function focusables(scope) {
    return Array.prototype.filter.call(
      scope.querySelectorAll("button, select, input, textarea, [href], [tabindex]"),
      function (node) {
        if (node.disabled || node.tabIndex < 0 || node.hidden || !node.getClientRects().length) return false;
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      }
    );
  }

  function trapFocus(scope, ev) {
    const items = focusables(scope);
    if (!items.length) { ev.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault(); first.focus();
    }
  }

  function open() {
    if (!root) return;
    returnFocus = document.activeElement;
    Log.info("data", "hub open");
    root.hidden = false;
    openFlag = true;
    showTab(active);
    if (tabButtons[active]) tabButtons[active].focus();
  }

  function close() {
    if (!root) return;
    Log.info("data", "hub close");
    disarmLiveAuto();
    closeTelemPopup();
    state.live = null;
    state.telemetry = null;
    root.hidden = true;
    openFlag = false;
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  function isOpen() { return openFlag; }

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
      tabButtons[k].setAttribute("aria-selected", k === id ? "true" : "false");
      tabButtons[k].tabIndex = k === id ? 0 : -1;
    }
    // Scroll the active tab button into view on narrow screens where tabs overflow
    const activeBtn = tabButtons[id];
    if (contentEl && activeBtn) contentEl.setAttribute("aria-labelledby", activeBtn.id);
    if (activeBtn && activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ inline: "nearest", behavior: "smooth", block: "nearest" });
    }
    // Mark content area so CSS can zero-out padding for split-layout tabs
    if (contentEl) contentEl.classList.toggle("dh-has-split", id === "live" || id === "telemetry");
    const st = state[id];
    const maxAge = MAX_AGE[id] || 60 * MINUTE;
    if (st && st.node && (Date.now() - st.at) < maxAge) {
      // loadTab calls showTab to paint the fresh node; only log reuse on a later visit.
      if (Date.now() - st.at > 1000) Log.info("data", "tab " + id + " cached");
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
    lastEmpty = "";
    Log.info("data", "tab " + id + " load");
    clear(contentEl);
    contentEl.appendChild(spinner());

    tabDef(id).load().then(function (node) {
      if (gen[id] !== myGen) return;
      Log.info("data", "tab " + id + " done");
      state[id] = { node: node, at: Date.now() };
      if (openFlag && active === id) showTab(id);
    }, function (err) {
      if (gen[id] !== myGen) return;
      Log.warn("data", "tab " + id + " fail");
      state[id] = null;
      if (openFlag && active === id) {
        clear(contentEl);
        contentEl.appendChild(errorBlock(id, err));
      }
    });
  }

  function spinner() {
    const w = el("div", "dh-loading");
    w.appendChild(el("div", "dh-spinner"));
    w.appendChild(el("div", "dh-loading-text", "LOADING"));
    return w;
  }

  function errorBlock(id, err) {
    const w = el("div", "dh-error");
    let msg = "Couldn't load data. Check your connection and try again.";
    if (err && err.message && err.message.indexOf("Live F1 session") !== -1) {
      msg = err.message;
    }
    w.appendChild(el("div", "dh-error-msg", msg));
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

  let lastEmpty = "";
  function emptyMsg(text) {
    if (lastEmpty !== active) {
      lastEmpty = active;
      Log.info("data", "tab " + active + " empty");
    }
    return el("div", "dh-empty", text);
  }

  // Implementation: js/data/schedule.js.
  const { loadSchedule } = DataSchedule.create({ el, emptyMsg, fmtDate, fmtDateTime, todayISO });

  const { loadStandings } = DataStandings.create({ el, emptyMsg, teamChip, findTeam, cssColor });

  const { loadLastRace } = DataLastRace.create({ el, emptyMsg, teamChip, fmtDate });

  const OPENF1_FIRST_YEAR = 2023;
  const YEARS = (function () {
    const now = new Date().getFullYear();
    const out = [];
    for (let y = Math.max(now, OPENF1_FIRST_YEAR); y >= OPENF1_FIRST_YEAR; y--) out.push(y);
    return out;
  })();
  const sel = { year: null, meetingKey: null, sessionKey: null, meta: null, selAt: 0, pinned: false };
  const SESSION_STALE_MS = 120 * 1000;

  function ensureSession(force) {
    const have = sel.sessionKey !== null;
    const fresh = have && sel.selAt && (Date.now() - sel.selAt) < SESSION_STALE_MS;
    // A pin is an explicit user pick (buildPicker) — it outranks force, which
    // only means "my cached view went stale". LIVE re-entry used to trample a
    // pinned historic session with whatever latestSession() returned, nuking
    // the telemetry tab with it. Only an explicit unpin (year/meeting change)
    // releases it.
    if (have && sel.pinned) return Promise.resolve(sel.meta);
    if (have && !force && fresh) return Promise.resolve(sel.meta);
    return F1API.latestSession(0).then(function (ses) {
      if (ses && ses.sessionKey !== null && ses.sessionKey !== undefined) {
        sel.meta = ses;
        sel.sessionKey = ses.sessionKey;
        sel.meetingKey = ses.meetingKey;
        sel.year = ses.year || YEARS[0];
        sel.selAt = Date.now();
      } else if (!sel.pinned) {
        sel.meta = null;
        sel.sessionKey = null;
        sel.meetingKey = null;
        sel.selAt = 0;
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

  function buildPicker(onPick) {
    let pickerGen = 0;
    const box = el("div", "dh-picker");
    const yearRow = el("div", "dh-pick-years");
    YEARS.forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " dh-active" : ""), String(y));
      b.type = "button";
      b.addEventListener("click", function () {
        if (y === sel.year) return;
        sel.year = y; sel.meetingKey = null; sel.sessionKey = null; sel.pinned = false;
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
      sel.pinned = false;
      loadSessions(true);
    });
    sesSel.addEventListener("change", function () {
      if (!sesSel.value) return;
      const m = sesIndex[sesSel.value];
      if (!m) return;
      sel.sessionKey = m.sessionKey; sel.meta = m; sel.pinned = true;
      onPick(m);
    });

    function loadGPs(userChanged) {
      const myGen = ++pickerGen;
      ph(gpSel, "loading…"); ph(sesSel, "—");
      F1API.meetings(sel.year).then(function (ms) {
        if (myGen !== pickerGen) return;
        if (!ms.length) { ph(gpSel, "no data"); return; }
        if (sel.meetingKey === null) sel.meetingKey = ms[ms.length - 1].meetingKey;
        setSelectOptions(gpSel, ms.map(function (m) {
          return { value: m.meetingKey, label: m.name || m.circuit || "Round" };
        }), sel.meetingKey);
        loadSessions(userChanged);
      }, function () {
        if (myGen !== pickerGen) return;
        ph(gpSel, "error");
      });
    }

    function loadSessions(userChanged) {
      const myGen = ++pickerGen;
      ph(sesSel, "loading…");
      F1API.sessionsForMeeting(sel.meetingKey).then(function (ss) {
        if (myGen !== pickerGen) return;
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
        if (userChanged) { sel.pinned = true; onPick(sel.meta); }
      }, function () {
        if (myGen !== pickerGen) return;
        ph(sesSel, "error");
      });
    }

    loadGPs(false);   // reflect current selection without firing onPick
    return box;
  }

  const { loadLive, stopLiveAuto, disarmLiveAuto } = DataLive.create({
    el, clear, emptyMsg, spinner, ensureSession, sel, buildPicker,
    invalidateOther, fmtDateTime, findTeam, cssColor, textColorOn, NO_LIVE_MSG
  });

  // Implementation: js/data/telemetry.js.
  const { loadTelemetry, closeTelemPopup } = DataTelemetry.create({
    el: el, clear: clear, emptyMsg: emptyMsg, spinner: spinner, sel: sel,
    ensureSession: ensureSession, buildPicker: buildPicker,
    invalidateOther: invalidateOther, COMPOUND: COMPOUND, findTeam: findTeam,
    cssColor: cssColor, textColorOn: textColorOn, NO_TELEM_MSG: NO_TELEM_MSG });
  // Implementation: js/data/export.js.
  const { loadExport } = DataExport.create({ el: el, clear: clear, isOpen: isOpen });
  return { init: init, open: open, close: close, isOpen: isOpen };
})();
