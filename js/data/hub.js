/* Apex 26 — DataHub: F1 data overlay (#datahub). Tabs: SCHEDULE | STANDINGS | RESULTS | LIVE | TELEMETRY | EXPORT. All API-derived DOM is built with createEleme… */
const DataHub = (function () {
  "use strict";

  const NO_LIVE_MSG = "No live data — sessions appear here during race weekends " +
    "(free data is delayed until ~30 min after each session).";
  const NO_TELEM_MSG = "No telemetry available yet. The latest completed F1 session " +
    "(2023+) appears here once its data is published (~30–60 min after the session).";
  const NO_RESULT_MSG = "No classification for this session yet — results are published " +
    "shortly after the chequered flag. Pick another session above.";

  // THE OS flag OR SETTINGS › APPEARANCE › MOTION: REDUCED (html[data-motion],
  // js/ui/title-fx.js), both read live — the same pair js/ui/hud.js reads.
  function motionReduced() {
    const mq = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    return !!(mq && mq.matches) || (typeof document !== "undefined" && !!document.documentElement &&
      !!document.documentElement.dataset && document.documentElement.dataset.motion === "reduce");
  }

  const MINUTE = 60 * 1000;
  // re-fetch a tab if its rendered content is older than this when shown again
  const MAX_AGE = { schedule: 6 * 60 * MINUTE, standings: 60 * MINUTE, results: 60 * MINUTE, live: 5 * MINUTE, telemetry: 15 * MINUTE, race: 60 * MINUTE, export: 24 * 60 * MINUTE };

  // tyre compound colors
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
    { id: "export", label: "EXPORT", load: function () { return loadExport(); } }
  ];

  let root = null;
  let contentEl = null;
  let tabButtons = {};            // id -> button element
  let openFlag = false;
  let active = "schedule";
  let returnFocus = null;
  // Title sheets that own the top layer. Late ensureDataHub().then(open)
  // must not unhide the hub over them (How to Play was the measured case:
  // both are dialog.screen, last showModal wins). #overlay is the title
  // we open FROM; pause stacks stay out so in-race How-to / Watch still
  // work. Not UiLayers.LAYER_IDS — that list includes overlay + datahub.
  // Literal selector (not getElementById(variable)): dynamicIdReads is shrink-only.
  const BLOCKING_SEL = (
    "#howtoplay,#career,#career-offers,#career-history,#career-guide,#select," +
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
  const state = {};               // id -> {node, at}
  const gen = {};                 // id -> load generation (ignores stale resolutions)

  const el = Dom.el;   // js/ui/dom.js — the one createElement helper

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

  function init(rootEl) {
    if (root || !rootEl) return;
    root = rootEl;
    root.classList.add("dh-overlay");
    // A real <dialog> (index.html): the platform asserts role and modality,
    // so only the label is written here.
    root.setAttribute("aria-labelledby", "dh-title");

    // fit-managed: SheetShape scans this class alongside .sheet, so a short
    // window at high UI SIZE shrinks the card via --fit-at (css/data.css)
    // instead of leaving header+tabs most of the local box.
    const card = el("div", "dh-card fit-managed");

    // header
    // .sheet-head — the app's one header recipe (css/components.css); the h2
    // gets the canonical brand-red title for free. The card is not a .sheet,
    // so data.css carries the two flex/compact deltas the grid would provide.
    const header = el("div", "sheet-head");
    const title = el("h2", "", "F1 DATA HUB");
    title.id = "dh-title";
    header.appendChild(title);
    // The dialog's data-esc-close target. index.html ships it in the shell so
    // it exists before this lazy build runs (UiLayers' escape wiring is checked
    // on the title screen); adopt it into the header, or build one in a bare
    // harness that has no shell.
    let closeBtn = document.getElementById("dh-close-btn");
    if (!closeBtn) {
      closeBtn = el("button", "dh-close", "✕");
      closeBtn.type = "button";
      closeBtn.id = "dh-close-btn";
      closeBtn.setAttribute("aria-label", "Close data hub");
    }
    closeBtn.hidden = false;
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
    // Native title tooltips do not dismiss on scroll — a hovered schedule
    // row leaves its tip painted over the next one. Drop titles on the
    // panel scroller; overflow tips re-attach on the next mouseenter.
    contentEl.addEventListener("scroll", function () {
      const titled = contentEl.querySelectorAll("[title]");
      for (let i = 0; i < titled.length; i++) titled[i].removeAttribute("title");
    }, { passive: true });
    card.appendChild(contentEl);

    root.appendChild(card);

    // Capture, not bubble: #mb-help / #pm-howto unhide How to Play in their
    // own click handlers. Close the hub first so the help sheet is not a
    // second :modal under/over an already-open Data Hub.
    document.addEventListener("click", function (ev) {
      if (openFlag && fromHelpDoor(ev.target)) close();
    }, true);

    // Roving-tablist arrows only. Escape and Tab containment left with the
    // dialog migration: Escape is the dialog's cancel (TopModal presses
    // data-esc-close), Tab is platform focus containment, and the old
    // "is the telemetry popup open" guard went with them — while the popup
    // (a nested modal dialog) is topmost, tab focus cannot reach these
    // buttons at all.
    document.addEventListener("keydown", function (ev) {
      if (!openFlag) return;
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
    });
  }

  function open(want) {
    if (!root) return;
    const block = blockingLayer();
    if (block) {
      Log.info("data", "hub open skipped — #" + (block.id || "?") + " is up");
      return;
    }
    if (want && TABS.some(function (t) { return t.id === want; })) active = want;
    returnFocus = document.activeElement;
    Log.info("data", "hub open");
    root.hidden = false;
    openFlag = true;
    showTab(active);
    // AFTER the showModal seam, not synchronously: the dialog has no boxes
    // until TopModal's observer (a microtask queued by the hidden flip above)
    // opens it, and focus() on a display:none element dies silently. This
    // microtask is queued later in the same checkpoint, so it runs once the
    // dialog is open and steals focus back from showModal's default pick.
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
    // Nothing still loading is wanted: bump every tab's generation so the
    // cancelled rejections are ignored, then drop the requests themselves —
    // in-flight OpenF1 fetches (15 s timeouts, 10–60 s 429 backoffs) used to
    // keep F1API's serialized queue busy, so reopening a tab waited behind
    // work nobody would ever render.
    for (const k in gen) gen[k] = (gen[k] || 0) + 1;
    F1API.cancelAll();
    // Every picker-driven tab, for the reason above: cancelAll() rejects
    // whatever loadGPs/loadSessions had in flight, which leaves "error" in
    // the selects of a node that would otherwise be REUSED for the next
    // hour. Dropping the node makes reopening rebuild the picker.
    state.live = null;
    state.telemetry = null;
    state.results = null;
    state.race = null;
    // A reopen is a fresh intent: a tab that FAILED earlier (opened offline) must
    // try again, not repaint its old error card — which would also be re-rendered
    // against today's navigator.onLine and blame the service for a lost link. The
    // stale node a failed refresh kept still carries data: it goes back to a
    // normal entry (age-checked by showTab); an empty failure is dropped.
    for (const id in state) {
      const st = state[id];
      if (!st || st.status !== "failed") continue;
      state[id] = st.node ? { node: st.node, at: st.at, status: "ready", error: null } : null;
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
      // Cancellation invalidates the WATCH controller behind this DOM. Rebuild
      // on return, and prevent a pending tab load from recaching the old node.
      state.race = null; gen.race = (gen.race || 0) + 1;
    }
    // Close the popup, pause any lap replay and, leaving TELEMETRY mid-COMPARE, abort its
    // OpenF1 fetches (they hold the serialized lane); the aborted tab is rebuilt on return.
    if (closeTelemPopup(id !== active)) {
      for (const k in gen) gen[k] = (gen[k] || 0) + 1;
      state.telemetry = null;
    }
    if (id !== "live") stopLiveAuto();  // stop auto-refresh when leaving live tab
    active = id;
    for (const k in tabButtons) {
      tabButtons[k].classList.toggle("active", k === id);
      tabButtons[k].setAttribute("aria-selected", k === id ? "true" : "false");
      tabButtons[k].tabIndex = k === id ? 0 : -1;
    }
    // Scroll the active tab into view only when the strip actually overflows
    // and the button is clipped — a wrap row (desktop) or a fully-visible
    // chip must not pan SCHEDULE off the left edge.
    const activeBtn = tabButtons[id];
    if (contentEl && activeBtn) contentEl.setAttribute("aria-labelledby", activeBtn.id);
    // An explicit `behavior` beats CSS scroll-behavior, so neither reduced-
    // motion backstop (the OS query, MOTION: REDUCED's html[data-motion])
    // reaches this scroll: ask both here, as js/ui/hud.js motionReduced does.
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
    // Mark content area so CSS can zero-out padding for split-layout tabs
    if (contentEl) contentEl.classList.toggle("dh-has-split", id === "live" || id === "telemetry");
    const st = state[id];
    const maxAge = MAX_AGE[id] || 60 * MINUTE;
    if (st && st.status === "failed") {
      clear(contentEl);
      contentEl.appendChild(errorBlock(id, st.error, !!st.node));
      if (st.node) {
        contentEl.appendChild(st.node);
        contentEl.appendChild(footnote(st.at));
      }
      contentEl.scrollTop = 0;
      return;
    }
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
      state[id] = {
        node: node,
        at: Date.now(),
        // Empty is a successful API answer and gets the normal freshness
        // window. Failed is recorded only in the rejection arm below.
        status: node && node.querySelector && node.querySelector(".dh-empty") ? "empty" : "ready",
        error: null
      };
      if (openFlag && active === id) showTab(id);
    }, function (err) {
      if (gen[id] !== myGen) return;
      Log.warn("data", "tab " + id + " fail");
      // KEEP the stale node. Dropping it (state[id] = null) leaves a tab that
      // loaded a minute ago and then lost the network with nothing but an
      // error — throwing away the only copy of the data it has. A schedule
      // from an hour ago is still the schedule; the footnote already says how
      // old a view is, and errorBlock says the
      // refresh failed rather than pretending there is nothing to show.
      const st = state[id];
      state[id] = st && st.node
        ? { node: st.node, at: st.at, status: "failed", error: err }
        : { node: null, at: 0, status: "failed", error: err };
      if (openFlag && active === id) {
        clear(contentEl);
        contentEl.appendChild(errorBlock(id, err, !!(st && st.node)));
        if (st && st.node) {
          contentEl.appendChild(st.node);
          contentEl.appendChild(footnote(st.at));
        }
      }
      // Keep the failed state even without a stale node. Switching away and
      // back must not relabel a failed request as an empty successful tab;
      // RETRY is the explicit next attempt.
    });
  }

  // role=status: the load / error state is announced to a screen reader
  // (polite live region) instead of the tab silently going blank.
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
    // Three different situations used to share one dead-end sentence. Split them
    // so the player can tell OFFLINE (no network) from UPSTREAM (service busy /
    // HTTP failure while the device thinks it is online). Cached content from
    // this session still paints under the banner when hasStale is true.
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
    if (err && err.message && err.message.indexOf("Live F1 session") !== -1) {
      title = "LIVE SESSION";
      msg = err.message;
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

  function footnote(at) {
    const mins = Math.floor((Date.now() - at) / MINUTE);
    let txt;
    if (mins < 1) txt = "updated just now";
    else if (mins < 60) txt = "updated " + mins + "m ago";
    else txt = "updated " + Math.floor(mins / 60) + "h " + (mins % 60) + "m ago";
    if (navigator.onLine === false) txt += " · offline copy";
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
  const { loadSchedule } = DataSchedule.create({ el, emptyMsg });

  const { loadStandings } = DataStandings.create({ el, emptyMsg, teamChip, findTeam, cssColor });

  const OPENF1_FIRST_YEAR = 2023;
  // Per call, not at boot — api.js's rule: a tab left open across New Year must
  // roll over instead of pinning the season it booted in (export.js does the same).
  function apiYears() {
    const now = new Date().getFullYear();
    const out = [];
    for (let y = Math.max(now, OPENF1_FIRST_YEAR); y >= OPENF1_FIRST_YEAR; y--) out.push(y);
    return out;
  }
  const sel = { year: null, meetingKey: null, sessionKey: null, meta: null, selAt: 0, pinned: false };
  const SESSION_STALE_MS = 120 * 1000;

  function ensureSession(force) {
    const have = sel.sessionKey !== null;
    const fresh = have && sel.selAt && (Date.now() - sel.selAt) < SESSION_STALE_MS;
    // A pin is an explicit user pick (buildPicker) — it outranks force, which
    // only means "my cached view went stale": LIVE re-entry must not trample a
    // pinned historic session (and the telemetry tab with it) with whatever
    // latestSession() returns. Only an explicit unpin (year/meeting change)
    // releases it.
    if (have && sel.pinned) return Promise.resolve(sel.meta);
    if (have && !force && fresh) return Promise.resolve(sel.meta);
    return F1API.latestSession(0).then(function (ses) {
      // A pick that landed while this was in flight is the newer, explicit choice.
      if (sel.pinned) return sel.meta;
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
        // Off-season / empty latest: keep RESULTS' year pills usable. Leaving
        // year null made buildPicker call meetings(null) → ?year=null.
        if (sel.year == null) sel.year = apiYears()[0];
      }
      return sel.meta;
    });
  }

  // Force the sibling session-tab to re-render for a newly picked session.
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

  // onChange (optional) runs synchronously when the player starts a YEAR or GRAND
  // PRIX change, BEFORE the picker queues its own meetings / sessions request: that
  // request shares F1API's serialized lane, so whatever the tab still has in
  // flight (TELEMETRY's COMPARE lanes) would be waited out first.
  function buildPicker(onPick, onChange) {
    let pickerGen = 0;
    const box = el("div", "dh-picker");
    const yearRow = el("div", "dh-pick-years");
    apiYears().forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " active" : ""), String(y));
      b.type = "button";
      b.addEventListener("click", function () {
        if (y === sel.year) return;
        cancelRealRace();
        if (onChange) onChange();
        sel.year = y; sel.meetingKey = null; sel.sessionKey = null; sel.pinned = false;
        for (let i = 0; i < yearRow.children.length; i++) {
          yearRow.children[i].classList.toggle("active", yearRow.children[i] === b);
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
    // A pick made here and answered after the player left this tab must not
    // call onPick: its invalidateOther would bump the generation of the tab now
    // loading and leave it spinning forever. But `sel` already moved, so drop
    // the OTHER session tabs' cached nodes (this one included) — otherwise a
    // return within MAX_AGE shows this picker stuck on "loading…" over the old
    // session's body. The first fill (userChanged false) still runs on a box
    // its tab has not attached yet.
    function detached(userChanged) {
      if (!userChanged || box.isConnected !== false) return false;
      invalidateOther(active);
      return true;
    }

    gpSel.addEventListener("change", function () {
      cancelRealRace();
      if (onChange) onChange();
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

    // OpenF1 reuses meeting_name for testing + calendar weekends (two
    // "Pre-Season Testing", two "Bahrain Grand Prix"). Append circuit when it
    // is not already in the name; when that still collides, append YYYY-MM-DD.
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

    function loadGPs(userChanged) {
      const myGen = ++pickerGen;
      ph(gpSel, "loading…"); ph(sesSel, "—");
      F1API.meetings(sel.year).then(function (ms) {
        if (myGen !== pickerGen || detached(userChanged)) return;
        if (!ms.length) { ph(gpSel, "no data"); return; }
        // The LATEST MEETING THAT HAS STARTED, not the year's last entry: the
        // current season lists every future round, and defaulting to December's
        // Abu Dhabi showed "not published" in every tab.
        if (sel.meetingKey === null) {
          const now = Date.now(), started = ms.filter(function (m) { const t = Date.parse(m.dateStart); return !(t > now); });
          sel.meetingKey = (started.length ? started[started.length - 1] : ms[0]).meetingKey;
        }
        setSelectOptions(gpSel, meetingPickerOptions(ms), sel.meetingKey);
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
        if (myGen !== pickerGen || detached(userChanged)) return;
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

  // Implementation: js/data/results.js. Built after buildPicker — the RESULTS
  // tab drives the same `sel` selection as LIVE and TELEMETRY, so picking FP2
  // in one leaves all three describing the same session.
  const { loadResults } = DataResults.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, teamChip, fmtDateTime, NO_RESULT_MSG
  });

  const { loadLive, stopLiveAuto, disarmLiveAuto } = DataLive.create({
    el, clear, emptyMsg, spinner, ensureSession, sel, buildPicker,
    invalidateOther, fmtDateTime, findTeam, cssColor, textColorOn, NO_LIVE_MSG
  });

  // Implementation: js/data/telemetry.js.
  const { loadTelemetry, closeTelemPopup } = DataTelemetry.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, COMPOUND, findTeam, cssColor, textColorOn, NO_TELEM_MSG
  });
  // Implementation: js/data/real-race-tab.js — the RACE IT tab: one real Grand
  // Prix's timing as a script, and every real driver's seat as a JUMP IN.
  const { loadRealRace, cancel: cancelRealRace } = DataRealRace.create({
    el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
    invalidateOther, teamChip, fmtDateTime, findTeam, close, isOpen
  });
  // Implementation: js/data/export.js.
  const { loadExport } = DataExport.create({ el, clear, isOpen });
  return { init, open, close, isOpen };
})();
Object.freeze(DataHub);
