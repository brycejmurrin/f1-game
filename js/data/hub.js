const DataHub = (function () {
  "use strict";

  const NO_LIVE_MSG = "No live data — sessions appear here during race weekends " +
    "(free data is delayed until ~30 min after each session).";
  const NO_TELEM_MSG = "No telemetry available yet. The latest completed F1 session " +
    "(2023+) appears here once its data is published (~30–60 min after the session).";
  const NO_RESULT_MSG = "No classification for this session yet — results are published " +
    "shortly after the chequered flag. Pick another session above.";

  function motionReduced() {
    const mq = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    return !!(mq && mq.matches) || (typeof document !== "undefined" && !!document.documentElement &&
      !!document.documentElement.dataset && document.documentElement.dataset.motion === "reduce");
  }

  function compoundChipLabel(compound) {
    if (typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn()) {
      const L = A11yOpts.compoundLetter(compound);
      if (L) return L;
    }
    return (compound || "—").slice(0, 4);
  }

  const MINUTE = 60 * 1000;
  const MAX_AGE = { schedule: 6 * 60 * MINUTE, standings: 60 * MINUTE, results: 60 * MINUTE, live: 5 * MINUTE, telemetry: 15 * MINUTE, race: 60 * MINUTE, export: 24 * 60 * MINUTE };

  const COMPOUND = {
    SOFT: "#e8002d", MEDIUM: "#f6d200", HARD: "#f0f0f0",
    INTERMEDIATE: "#3fb950", WET: "#1e90ff"
  };

  const TABS = [
    { id: "schedule", label: "SCHEDULE", load: function () { return loadSchedule(); } },
    { id: "standings", label: "STANDINGS", load: function () { return loadStandings(); } },
    { id: "results", label: "RESULTS", load: function () { return loadResults(); } },
    { id: "live", label: "LIVE", load: function () { return loadLive(); } },
    { id: "telemetry", label: "TELEMETRY", load: function () { return loadTelemetry(); } },
    { id: "race", label: "WATCH & DRIVE", load: function () { return loadRealRace(); } },
    { id: "export", label: "GPS TRACE EXPORT", developer: true, load: function () { return loadExport(); } }
  ];

  let root = null;
  let contentEl = null;
  let tabButtons = {};
  let openFlag = false;
  let active = "schedule";
  let doorTab = "schedule";
  let returnFocus = null;
  let developerTools = null;
  const BLOCKING_SEL = (
    "#howtoplay,#pmsettings,#career,#career-offers,#career-history,#career-guide,#select," +
    "#teampicker,#vsfriend,#carsetup,#photo-studio,#season-setup,#track-detail," +
    "#race-settings,#customize,#trackdesigner,#standings,#quali,#spotifypanel," +
    "#lighting,#camtune,#flyby,#freecam,#garrival,#duel-picker"
  );

  function blockingLayer() {
    if (typeof document.querySelectorAll !== "function") return null;
    const nodes = document.querySelectorAll(BLOCKING_SEL);
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] && !nodes[i].hidden) return nodes[i];
    }
    return null;
  }

  function fromHelpDoor(t) {
    while (t && t !== document) {
      if (t.id === "mb-help" || t.id === "pm-howto") return true;
      t = t.parentNode || t.parentElement;
    }
    return false;
  }
  const state = {};
  const gen = {};

  const el = Dom.el;

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return I18n.date(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
    if (!c) return "rgb(128,128,128)";
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

  function init(rootEl) {
    if (root || !rootEl) return;
    root = rootEl;
    root.classList.add("dh-overlay");
    root.setAttribute("aria-labelledby", "dh-title");

    const card = el("div", "dh-card fit-managed");

    const header = el("div", "sheet-head");
    const title = el("h2", "", "F1 DATA HUB");
    title.id = "dh-title";
    header.appendChild(title);
    let closeBtn = document.getElementById("dh-close-btn");
    if (!closeBtn) {
      closeBtn = el("button", "dh-close", "✕");
      closeBtn.type = "button";
      closeBtn.id = "dh-close-btn";
      closeBtn.setAttribute("aria-label", I18n.t("hub.close", null, "Close data hub"));
    }
    closeBtn.hidden = false;
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    card.appendChild(header);
    const inHead = function (node) { header.insertBefore(node, closeBtn); };

    const tabs = el("div", "dh-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", I18n.t("hub.sections", null, "Data hub sections"));
    developerTools = el("details", "dh-developer-tools");
    const developerLabel = el("summary", "", "⋯");
    developerLabel.setAttribute("aria-label", I18n.t("hub.developerTools", null, "Developer tools"));
    developerTools.appendChild(developerLabel);
    TABS.forEach(function (t) {
      const b = el("button", "dh-tab", t.label);
      b.type = "button";
      b.id = "dh-tab-" + t.id;
      if (!t.developer) b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "dh-panel");
      if (!t.developer) b.setAttribute("aria-selected", "false");
      b.tabIndex = t.developer ? 0 : -1;
      b.addEventListener("click", function () { doorTab = t.id; showTab(t.id); });
      tabButtons[t.id] = b;
      (t.developer ? developerTools : tabs).appendChild(b);
    });
    inHead(tabs);
    inHead(developerTools);

    contentEl = el("div", "dh-content");
    contentEl.id = "dh-panel";
    contentEl.setAttribute("role", "tabpanel");
    contentEl.addEventListener("scroll", function () {
      const titled = contentEl.querySelectorAll("[title]");
      for (let i = 0; i < titled.length; i++) titled[i].removeAttribute("title");
    }, { passive: true });
    card.appendChild(contentEl);

    root.appendChild(card);

    document.addEventListener("click", function (ev) {
      if (openFlag && fromHelpDoor(ev.target)) close();
    }, true);

    document.addEventListener("keydown", function (ev) {
      if (!openFlag) return;
      const target = ev.target;
      if (target && target.getAttribute && target.getAttribute("role") === "tab") {
        const ids = TABS.filter(function (t) { return !t.developer; }).map(function (t) { return t.id; });
        let idx = ids.indexOf(active);
        if (ev.key === "ArrowRight") idx = (idx + 1) % ids.length;
        else if (ev.key === "ArrowLeft") idx = (idx + ids.length - 1) % ids.length;
        else if (ev.key === "Home") idx = 0;
        else if (ev.key === "End") idx = ids.length - 1;
        else idx = -1;
        if (idx !== -1) {
          ev.preventDefault();
          doorTab = ids[idx];
          showTab(ids[idx]);
          tabButtons[ids[idx]].focus();
          return;
        }
      }
    });
  }

  function open(want) {
    if (!root) return;
    const block = blockingLayer();
    if (block) {
      Log.info("data", "hub open skipped — #" + (block.id || "?") + " is up");
      return;
    }
    const asked = !!want && TABS.some(function (t) { return t.id === want; });
    if (asked) active = want;
    if (openFlag) { showTab(active); return; }
    if (!asked) active = doorTab;
    returnFocus = document.activeElement;
    Log.info("data", "hub open");
    root.hidden = false;
    openFlag = true;
    showTab(active);
    queueMicrotask(function () {
      if (openFlag && tabButtons[active]) tabButtons[active].focus();
    });
  }

  function close() {
    if (!root) return;
    cancelRealRace();
    Log.info("data", "hub close");
    disarmLiveAuto();
    closeTelemPopup();
    for (const k in gen) gen[k] = (gen[k] || 0) + 1;
    F1API.cancelAll();
    state.live = null;
    state.telemetry = null;
    state.results = null;
    state.race = null;
    for (const id in state) {
      const st = state[id];
      if (!st || st.status !== "failed") continue;
      state[id] = st.node ? { node: st.node, at: st.at, dataAt: st.dataAt, offlineCopy: st.offlineCopy, status: "ready", error: null } : null;
    }
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
    if (id !== "race") {
      cancelRealRace();
      state.race = null; gen.race = (gen.race || 0) + 1;
    }
    if (closeTelemPopup(id !== active)) {
      for (const k in gen) gen[k] = (gen[k] || 0) + 1;
      state.telemetry = null;
    }
    if (id !== "live") stopLiveAuto();
    active = id;
    for (const k in tabButtons) {
      tabButtons[k].classList.toggle("active", k === id);
      if (k !== "export") {
        tabButtons[k].setAttribute("aria-selected", k === id ? "true" : "false");
        tabButtons[k].tabIndex = k === id || (id === "export" && k === "schedule") ? 0 : -1;
      }

    }
    if (developerTools && id === "export") developerTools.open = true;
    if (contentEl) contentEl.setAttribute("role", id === "export" ? "region" : "tabpanel");
    const activeBtn = tabButtons[id];
    if (contentEl && activeBtn) contentEl.setAttribute("aria-labelledby", activeBtn.id);
    const strip = activeBtn && (activeBtn.parentElement || activeBtn.parentNode);
    const overflow = !!(strip && (strip.scrollWidth - strip.clientWidth > 1));
    if (overflow && activeBtn && activeBtn.scrollIntoView) {
      const left = activeBtn.offsetLeft || 0;
      const right = left + (activeBtn.offsetWidth || 0);
      const viewL = strip.scrollLeft || 0;
      const viewR = viewL + strip.clientWidth;
      if (left < viewL || right > viewR) {
        activeBtn.scrollIntoView({ inline: "nearest", behavior: motionReduced() ? "auto" : "smooth", block: "nearest" });
      }
    }
    if (contentEl) contentEl.classList.toggle("dh-has-split", id === "live" || id === "telemetry");
    const st = state[id];
    const maxAge = MAX_AGE[id] || 60 * MINUTE;
    if (st && st.status === "failed") {
      clear(contentEl);
      contentEl.appendChild(errorBlock(id, st.error, !!st.node && st.hasData !== false));
      if (st.node) {
        contentEl.appendChild(st.node);
        if (st.hasData !== false) footer(id, st);
      }
      contentEl.scrollTop = 0;
      return;
    }
    const reuseFor = st && st.lockout ? Math.min(maxAge, LOCKOUT_REUSE_MS) : maxAge;
    if (st && st.node && (Date.now() - st.at) < reuseFor && !(Date.now() >= st.node.nextFlipAt)) {
      if (Date.now() - st.at > 1000) Log.info("data", "tab " + id + " cached");
      clear(contentEl);
      if (st.lockout) contentEl.appendChild(lockoutBlock());
      contentEl.appendChild(st.node);
      if (st.status !== "loading") footer(id, st);
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
    const staleApi = typeof F1API !== "undefined" && F1API.staleSince ? F1API : null;
    const staleMark = staleApi ? staleApi.staleMark() : 0;

    tabDef(id).load().then(function (node) {
      if (gen[id] !== myGen) {
        if (node && typeof node.dispose === "function") node.dispose();
        return;
      }
      const previous = state[id] && state[id].node;
      if (previous && previous !== node && typeof previous.dispose === "function") previous.dispose();
      Log.info("data", "tab " + id + " done");
      const staleAt = staleApi ? staleApi.staleSince(staleMark) : null;
      state[id] = {
        node: node,
        at: Date.now(),
        dataAt: staleAt,
        offlineCopy: staleAt != null,
        status: node && node.querySelector && node.querySelector(".dh-empty") ? "empty" : "ready",
        error: null,
        lockout: !!(SESSION_TABS[id] && lockoutAt && Date.now() - lockoutAt < 5 * MINUTE),
        ...(node && node.tabOutcome || {})
      };
      if (openFlag && active === id) showTab(id);
    }, function (err) {
      if (gen[id] !== myGen) return;
      Log.warn("data", "tab " + id + " fail");
      const st = state[id];
      state[id] = st && st.node
        ? { node: st.node, at: st.at, dataAt: st.dataAt, offlineCopy: st.offlineCopy, status: "failed", error: err }
        : { node: null, at: 0, status: "failed", error: err };
      if (openFlag && active === id) {
        clear(contentEl);
        contentEl.appendChild(errorBlock(id, err, !!(st && st.node)));
        if (st && st.node) {
          contentEl.appendChild(st.node);
          footer(id, st);
        }
      }
    });
  }

  function spinner() {
    const w = el("div", "dh-loading");
    w.setAttribute("role", "status");
    w.appendChild(el("div", "dh-spinner"));
    w.appendChild(el("div", "dh-loading-text", "LOADING"));
    return w;
  }

  function errorBlock(id, err, hasStale) {
    const w = el("div", "dh-error");
    w.setAttribute("role", "status");
    const offline = navigator.onLine === false;
    let reason = offline ? "offline" : "upstream";
    let title = offline ? "OFFLINE" : "SERVICE UNAVAILABLE";
    let msg = offline
      ? "No network on this device. Open Data Hub once while online to keep a copy of schedule and standings for later."
      : "Couldn't reach the F1 data service. It may be busy or blocked — try again in a moment.";
    if (hasStale) {
      title = offline ? "OFFLINE · CACHED" : "REFRESH FAILED · CACHED";
      msg = offline
        ? "You're offline. Showing the last data loaded on this device."
        : "Couldn't refresh from the F1 data service. Showing the last data you loaded.";
      reason = offline ? "offline-cached" : "upstream-cached";
    }
    if (DataTabUtils.liveLockout(err)) {
      title = DataTabUtils.LOCKOUT_TITLE;
      msg = DataTabUtils.LOCKOUT_MSG;
      reason = "live-auth";
    }
    w.dataset.reason = reason;
    const titleEl = el("div", "dh-error-msg", title);
    titleEl.dataset.role = "title";
    w.appendChild(titleEl);
    w.appendChild(el("div", "dh-error-msg", msg));
    if (!hasStale && offline) {
      const hint = el("div", "dh-error-msg",
        "Tip: schedule, standings and results keep an API cache after a successful fetch — retry after you reconnect.");
      hint.dataset.role = "hint";
      w.appendChild(hint);
    }
    const retry = el("button", "dh-retry", "RETRY");
    retry.type = "button";
    retry.addEventListener("click", function () { loadTab(id); });
    w.appendChild(retry);
    return w;
  }

  function lockoutBlock() {
    const w = el("div", "dh-error");
    w.setAttribute("role", "status");
    w.dataset.reason = "live-auth";
    const titleEl = el("div", "dh-error-msg", DataTabUtils.LOCKOUT_TITLE);
    titleEl.dataset.role = "title";
    w.appendChild(titleEl);
    w.appendChild(el("div", "dh-error-msg", DataTabUtils.LOCKOUT_MSG));
    return w;
  }

  function footnote(at, offlineCopy) {
    const mins = Math.floor((Date.now() - at) / MINUTE);
    let txt;
    if (mins < 1) txt = "updated just now";
    else if (mins < 60) txt = "updated " + mins + "m ago";
    else txt = "updated " + Math.floor(mins / 60) + "h " + (mins % 60) + "m ago";
    if (offlineCopy || navigator.onLine === false) txt += " · offline copy";
    return el("div", "dh-footnote", txt);
  }

  const FEEDS = {
    jolpica: { name: "Jolpica F1", href: "https://github.com/jolpica/jolpica-f1" },
    openf1: { name: "OpenF1", href: "https://openf1.org" },
  };
  const TAB_FEED = { schedule: "jolpica", standings: "jolpica", results: "openf1", live: "openf1", telemetry: "openf1", race: "openf1", export: "openf1" };
  function sourceLine(id) {
    const feed = FEEDS[TAB_FEED[id]];
    const line = el("div", null);
    if (!feed) return line;
    line.dataset.feed = TAB_FEED[id];
    const link = (text, href) => { const a = el("a", null, text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
    line.appendChild(el("span", null, "Data: "));
    line.appendChild(link(feed.name, feed.href));
    line.appendChild(el("span", null, ", "));
    line.appendChild(link("CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"));
    line.appendChild(el("span", null, " · unofficial, non-commercial"));
    return line;
  }
  function footer(id, st) {
    contentEl.appendChild(footnote(st.dataAt || st.at, st.offlineCopy));
    contentEl.appendChild(sourceLine(id));
  }

  let lastEmpty = "";
  function emptyMsg(text) {
    if (lastEmpty !== active) {
      lastEmpty = active;
      Log.info("data", "tab " + active + " empty");
    }
    return el("div", "dh-empty", text);
  }

  const { loadSchedule } = DataSchedule.create({ el, emptyMsg });

  const { loadStandings } = DataStandings.create({ el, emptyMsg, teamChip, findTeam, cssColor });

  const OPENF1_FIRST_YEAR = 2023;
  function apiYears() {
    const now = new Date().getFullYear();
    const out = [];
    for (let y = Math.max(now, OPENF1_FIRST_YEAR); y >= OPENF1_FIRST_YEAR; y--) out.push(y);
    return out;
  }
  const sel = { year: null, meetingKey: null, sessionKey: null, meta: null, selAt: 0, pinned: false };
  let selectionPending = null;
  let selectionGen = 0;
  const SESSION_STALE_MS = 120 * 1000;
  const LOCKOUT_REUSE_MS = 2 * MINUTE;
  let lockoutAt = 0;
  const SESSION_TABS = { results: 1, live: 1, telemetry: 1, race: 1 };

  function latestOrCached() {
    return F1API.latestSession(0).then(function (ses) {
      lockoutAt = 0;
      return ses;
    }, function (err) {
      if (!DataTabUtils.liveLockout(err)) throw err;
      lockoutAt = Date.now();
      Log.info("data", "latest session locked out (HTTP " + err.status + "); cached picker");
      return F1API.latestSession(Infinity).then(null, function () { return null; });
    });
  }

  function ensureSession(force) {
    if (selectionPending) return selectionPending.then(() => selectionPending ? ensureSession(force) : sel.meta);
    const have = sel.sessionKey !== null;
    const fresh = have && sel.selAt && (Date.now() - sel.selAt) < SESSION_STALE_MS;
    if (sel.pinned) return Promise.resolve(sel.meta);
    if (have && !force && fresh) return Promise.resolve(sel.meta);
    const mySelection = selectionGen;
    return latestOrCached().then(function (ses) {
      if (mySelection !== selectionGen || sel.pinned) return sel.meta;
      if (ses && ses.sessionKey != null) {
        sel.meta = ses;
        sel.sessionKey = ses.sessionKey;
        sel.meetingKey = ses.meetingKey;
        sel.year = ses.year || apiYears()[0];
        sel.selAt = Date.now();
      } else if (!sel.pinned) {
        sel.meta = null;
        sel.sessionKey = null;
        sel.meetingKey = null;
        sel.selAt = 0;
        if (sel.year == null) sel.year = apiYears()[0];
      }
      return sel.meta;
    });
  }

  function invalidateOther(except) {
    ["live", "telemetry", "results"].forEach(function (id) {
      if (id !== except) { state[id] = null; gen[id] = (gen[id] || 0) + 1; }
    });
  }

  function setSelectOptions(selectEl, opts, selectedVal) {
    clear(selectEl);
    let title = "";
    opts.forEach(function (o) {
      const op = el("option", null, o.label);
      op.value = String(o.value);
      if (String(o.value) === String(selectedVal)) { op.selected = true; title = o.label; }
      selectEl.appendChild(op);
    });
    if (title) selectEl.title = title; else selectEl.removeAttribute("title");
  }

  function buildPicker(onPick, onChange) {
    let pickerGen = 0;
    const initialSessionKey = sel.sessionKey;
    const box = el("div", "dh-picker");
    const yearRow = el("div", "dh-pick-years");
    apiYears().forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " active" : ""), String(y));
      b.type = "button";
      b.addEventListener("click", function () {
        if (y === sel.year) return;
        ++selectionGen;
        cancelRealRace();
        sel.year = y; sel.meetingKey = null;
        if (!emptySelection(true) && onChange) onChange();
        for (let i = 0; i < yearRow.children.length; i++) {
          yearRow.children[i].classList.toggle("active", yearRow.children[i] === b);
        }
        awaitSelection(loadGPs(true));
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
    const pickerError = el("div");
    pickerError.setAttribute("data-role", "picker-error");
    pickerError.setAttribute("role", "status");
    pickerError.hidden = true;
    box.appendChild(pickerError);

    let sesIndex = {};
    function ph(s, t) { setSelectOptions(s, [{ value: "", label: t }], ""); }
    function emptySelection(userChanged) {
      if (!userChanged) return false;
      sel.meta = null; sel.sessionKey = null; sel.selAt = 0;
      sel.pinned = true;
      if (openFlag && box.isConnected !== false) { onPick(null); return true; }
      return false;
    }
    function detached(userChanged) {
      if (!userChanged || box.isConnected !== false) return false;
      invalidateOther(active);
      return true;
    }

    gpSel.addEventListener("change", function () {
      ++selectionGen;
      cancelRealRace();
      sel.meetingKey = gpSel.value ? Number(gpSel.value) : null;
      if (!emptySelection(true) && onChange) onChange();
      awaitSelection(loadSessions(true));
    });
    sesSel.addEventListener("change", function () {
      if (!sesSel.value) return;
      const m = sesIndex[sesSel.value];
      if (!m) return;
      ++selectionGen;
      cancelRealRace();
      sel.sessionKey = m.sessionKey; sel.meta = m; sel.pinned = true;
      onPick(m);
    });

    function meetingPickerOptions(ms) {
      const base = ms.map(function (m) {
        let label = m.name || m.circuit || "Round";
        if (m.circuit && label.indexOf(m.circuit) < 0) label += " · " + m.circuit;
        return label;
      });
      const counts = Object.create(null);
      for (let i = 0; i < base.length; i++) counts[base[i]] = (counts[base[i]] || 0) + 1;
      return ms.map(function (m, i) {
        let label = base[i];
        if (counts[label] > 1 && m.dateStart) {
          label += " · " + String(m.dateStart).slice(0, 10);
        }
        return { value: m.meetingKey, label: label };
      });
    }

    function awaitSelection(work) {
      const pending = Promise.resolve(work).then(function () {
        if (selectionPending === pending) selectionPending = null;
      });
      selectionPending = pending;
    }

    function loadGPs(userChanged) {
      const myGen = ++pickerGen, mySelection = selectionGen;
      clear(pickerError);
      pickerError.hidden = true;
      ph(gpSel, "loading…"); ph(sesSel, "—");
      return F1API.meetings(sel.year).then(function (ms) {
        if (myGen !== pickerGen || mySelection !== selectionGen) return;
        if (!ms.length) emptySelection(userChanged);
        if (!ms.length) { detached(userChanged); ph(gpSel, "no data"); return; }
        if (sel.meetingKey === null) {
          const now = Date.now(), started = ms.filter(function (m) { const t = Date.parse(m.dateStart); return !(t > now); });
          sel.meetingKey = (started.length ? started[started.length - 1] : ms[0]).meetingKey;
        }
        setSelectOptions(gpSel, meetingPickerOptions(ms), sel.meetingKey);
        return loadSessions(userChanged);
      }, function () {
        if (myGen !== pickerGen || mySelection !== selectionGen) return;
        if (detached(userChanged)) return;
        ph(gpSel, "error");
        retryPicker("Grand Prix", function () { loadGPs(userChanged); });
      });
    }

    function loadSessions(userChanged) {
      const myGen = ++pickerGen, mySelection = selectionGen;
      clear(pickerError);
      pickerError.hidden = true;
      ph(sesSel, "loading…");
      return F1API.sessionsForMeeting(sel.meetingKey).then(function (ss) {
        if (myGen !== pickerGen || mySelection !== selectionGen) return;
        if (!ss.length) emptySelection(userChanged);
        sesIndex = {};
        ss.forEach(function (s) { sesIndex[s.sessionKey] = s; });
        if (!ss.length) { detached(userChanged); ph(sesSel, "no data"); return; }
        if (sel.sessionKey === null) {
          const race = ss.filter(function (s) { return (s.type || "").toLowerCase() === "race"; });
          const def = race.length ? race[race.length - 1] : ss[ss.length - 1];
          sel.sessionKey = def.sessionKey; sel.meta = def;
        }
        setSelectOptions(sesSel, ss.map(function (s) {
          return { value: s.sessionKey, label: s.name || s.type || "Session" };
        }), sel.sessionKey);
        if (userChanged) sel.pinned = true;
        sel.selAt = Date.now();
        if (detached(userChanged)) return;
        if (userChanged || (initialSessionKey === null && openFlag && box.isConnected !== false)) onPick(sel.meta);
      }, function () {
        if (myGen !== pickerGen || mySelection !== selectionGen) return;
        if (detached(userChanged)) return;
        ph(sesSel, "error");
        retryPicker("session", function () { loadSessions(userChanged); });
      });
    }

    function retryPicker(label, retry) {
      clear(pickerError);
      pickerError.hidden = false;
      pickerError.appendChild(el("span", "dh-error-msg", "Couldn't load the " + label + " list. Try again."));
      const button = el("button", "dh-retry dh-picker-retry", "RETRY");
      button.type = "button";
      button.setAttribute("aria-label", I18n.t("hub.retry", {list: label}, "Retry {list} list"));
      button.addEventListener("click", retry);
      pickerError.appendChild(button);
    }

    loadGPs(false);
    return box;
  }

  const { loadResults } = DataResults.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, teamChip, fmtDateTime, NO_RESULT_MSG,
    onOutcome(node) {
      const st = state.results;
      if (!st || st.node !== node) return;
      Object.assign(st, node.tabOutcome);
      if (openFlag && active === "results") showTab("results");
    }
  });

  const { loadLive, stopLiveAuto, disarmLiveAuto } = DataLive.create({
    el, clear, emptyMsg, spinner, ensureSession, sel, buildPicker,
    invalidateOther, fmtDateTime, findTeam, cssColor, textColorOn, NO_LIVE_MSG
  });

  const { loadTelemetry, closeTelemPopup } = DataTelemetry.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, COMPOUND, findTeam, cssColor, textColorOn, NO_TELEM_MSG
  });
  const { loadRealRace, cancel: cancelRealRace } = DataRealRace.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, teamChip, fmtDateTime, findTeam, close, isOpen
  });
  const { loadExport } = DataExport.create({ el, clear, isOpen });
  return { init, open, close, isOpen, compoundChipLabel };
})();
Object.freeze(DataHub);
