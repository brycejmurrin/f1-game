/* Apex 26 — TITLE MENU retention doors: career summary, direct Continue, and today's Daily Challenge. */
const TitleMenu = (function () {
  "use strict";

  // Destination rows after organize() — repairDestinations() re-mounts from this.
  const DESTINATION_GROUPS = [
    ["menu-primary", "Play", ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice"]],
    ["menu-garage", "Garage", ["mb-garage"]],
    ["menu-explore", "Watch & Explore", ["mb-watch", "mb-data"]],
    ["menu-create", "Create", ["mb-photo", "mb-designer"]],
    ["menu-secondary", "Utilities", ["mb-standings", "mb-settings", "mb-phonepad", "mb-help"]],
  ];
  const CORE_PLAY_DOORS = ["mb-race", "mb-tt", "mb-watch", "mb-data"];

  // Move the existing nodes: their handlers, saved-state labels and visibility
  // remain owned by their original modules. The outer title-layout pieces stay put.
  // The shell ships the organized end state (index.html, data-destinations):
  // then this only wires the two settings shortcuts. The build path below stays
  // for repairDestinations() and for a shell that predates it.
  function organize(doc) {
    const menu = doc && doc.getElementById("menu-buttons");
    if (!menu) return;
    if (menu.dataset.destinations) {
      wireShortcuts(doc, doc.getElementById("menu-create"), doc.getElementById("menu-secondary"));
      return;
    }
    menu.dataset.destinations = "true";
    const group = (id, label, buttons) => {
      let row = doc.getElementById(id);
      if (!row) { row = doc.createElement("div"); row.id = id; row.className = "balanced-row"; }
      row.classList.add("menu-destination");
      row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
      const heading = doc.createElement("h2"); heading.className = "menu-destination-label";
      heading.textContent = label; menu.appendChild(heading); menu.appendChild(row);
      for (const name of buttons) { const button = doc.getElementById(name); if (button) row.appendChild(button); }
      return row;
    };
    const hero = doc.getElementById("menu-hero");
    if (hero) { hero.setAttribute("role", "group"); hero.setAttribute("aria-label", "Continue and career"); }
    // Play is a 2×2 plus PRACTICE; #menu-garage is CSS-placed as the sixth
    // cell (bottom-right). STANDINGS is a season utility, not a play door —
    // parking it in Play put it under the Garage tile on compact-wide Home
    // (Playwright click timeout on #mb-standings after race→menu; ship tip
    // 086e55bfc / nightly 39017766676). Keep it with the under-brand chips.
    group(...DESTINATION_GROUPS[0]);
    group(...DESTINATION_GROUPS[1]);
    group(...DESTINATION_GROUPS[2]);
    const create = group(...DESTINATION_GROUPS[3]);
    const utilities = group(...DESTINATION_GROUPS[4]);
    wireShortcuts(doc, create, utilities);
  }

  function wireShortcuts(doc, create, utilities) {
    const shortcut = (row, id, label, page) => {
      let button = doc.getElementById(id);
      if (!button) {
        if (!row) return;
        button = doc.createElement("button"); button.id = id; button.type = "button";
        button.className = "bigbtn alt minibtn"; button.textContent = label;
        row.appendChild(button);
      }
      button.onclick = () => {
        const settings = doc.getElementById("mb-settings");
        if (settings) settings.click();
        if (typeof SettingsNav !== "undefined") (SettingsNav.showDirect || SettingsNav.show)(page, true);
      };
    };
    shortcut(create, "mb-visual", "VISUAL STUDIO", "visual");
    shortcut(utilities, "mb-saves", "SAVES & DATA", "files");
  }

  /** After a mid-race graphics reset, play doors can be orphaned outside their row. */
  function repairDestinations(doc) {
    const menu = doc && doc.getElementById("menu-buttons");
    if (!menu) return false;
    const rowFor = (id) => {
      for (const [rowId, , buttons] of DESTINATION_GROUPS) {
        if (buttons.includes(id)) return rowId;
      }
      return null;
    };
    let broken = false;
    for (const id of CORE_PLAY_DOORS) {
      const btn = doc.getElementById(id);
      const rowId = rowFor(id);
      const row = rowId ? doc.getElementById(rowId) : null;
      if (!btn || !row || !row.contains(btn)) { broken = true; break; }
    }
    if (!broken) {
      for (const id of CORE_PLAY_DOORS) {
        const btn = doc.getElementById(id);
        if (btn) { btn.hidden = false; btn.disabled = false; }
      }
      return false;
    }
    delete menu.dataset.destinations;
    for (const el of menu.querySelectorAll(".menu-destination-label")) el.remove();
    for (const [, , buttons] of DESTINATION_GROUPS) {
      for (const id of buttons) {
        const btn = doc.getElementById(id);
        if (btn) menu.appendChild(btn);
      }
    }
    organize(doc);
    for (const id of CORE_PLAY_DOORS) {
      const btn = doc.getElementById(id);
      if (btn) { btn.hidden = false; btn.disabled = false; }
    }
    return true;
  }

  // A textContent write replaces the text node even when the string is the
  // same. #menu-buttons / #overlay are ScrollFade subtrees, so that childList
  // record schedules paintAll — getComputedStyle + scrollHeight on every open
  // pane. At UI scale 200% the title column is the zoomed scrollport (menus.css),
  // and quit-to-menu already refreshes these doors on that same turn.
  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }
  function setAttr(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setHidden(node, hidden) {
    if (node && node.hidden !== hidden) node.hidden = hidden;
  }

  // "N SAVED" only. Career.slots() migrate-clones every slot
  // (JSON.parse(JSON.stringify) inside readSlot) — a multi-save career is
  // hundreds of KB on the title paint, including every return from a race.
  // The raw string is enough to know a slot is occupied; a stored null is
  // the JSON text "null". The live career counts even when its disk write
  // has not landed yet.
  function usedSaveCount(store, live) {
    const slot = live && Career.slot ? Career.slot() : null;
    const liveKey = slot ? ("career." + slot.flavour + "." + (slot.i | 0)) : "";
    let n = slot ? 1 : 0;
    if (!store || typeof store.raw !== "function") return n;
    for (const flavour of ["driver", "myteam"]) {
      for (let i = 0; i < 3; i++) {
        const key = "career." + flavour + "." + i;
        if (key === liveKey) continue;
        const text = store.raw(key);
        if (text && text !== "null") n++;
      }
    }
    return n;
  }

  // Historical medals are not stored; keep each record class separate instead.
  function dailyHistory(daily) {
    const data = daily && daily.data ? daily.data() : null, days = data && data.days;
    if (!days || typeof days !== "object" || Array.isArray(days)) return [];
    const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
    return Object.keys(days).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day))
      && new Date(day).toISOString().slice(0, 10) === day).sort().reverse().slice(0, 7).flatMap(day => {
      const entry = days[day];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const classes = entry.classes && typeof entry.classes === "object" && !Array.isArray(entry.classes)
        ? Object.entries(entry.classes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([, value]) => value && positive(value.best)) : [];
      const results = classes.length ? classes.slice(0, 4).map(([, value], i) => "Saved class " + (i + 1) + ": " + value.best.toFixed(3) + "s")
        : positive(entry.best) ? ["Day best (legacy / mixed classes): " + entry.best.toFixed(3) + "s"] : [];
      return results.length ? [{ day, text: results.join(" · ") }] : [];
    });
  }

  function create(G) {
    Log.info("game", "TitleMenu.create");
    const { $ } = G;
    organize(typeof document !== "undefined" ? document : null);
    // The doors paint from the shell seconds before game.js wires them (Slow 4G:
    // ~2.5 s vs ~15 s). html[data-booted] is css/title.css's cue that a tap now
    // does something; game.js wires the handlers in this same task.
    if (typeof document !== "undefined") document.documentElement.dataset.booted = "";

    const history = $("daily-history"), historyList = $("daily-history-list");
    const doc = typeof document !== "undefined" ? document : null;
    if (history && history.addEventListener) history.addEventListener("toggle", () => { if (history.open) paintHistory(); });
    function paintHistory() {
      if (!historyList || !doc) return;
      while (historyList.firstChild) historyList.removeChild(historyList.firstChild);
      const rows = dailyHistory(G.daily);
      for (const row of rows) { const li = doc.createElement("li"); li.textContent = row.day + " · " + row.text; historyList.appendChild(li); }
      if (!rows.length) { const li = doc.createElement("li"); li.textContent = "No saved Daily laps yet. Complete a valid Daily lap to start your history."; historyList.appendChild(li); }
    }

    function refresh() {
      if (history && history.open) paintHistory();
      const btn = $("mb-career");
      // Paint must not Career.load(): that migrates and may write the slot
      // pointer. Boot and the career store subscriber already load first.
      const c = Career.data();
      const cal = c ? (Career.calendar ? Career.calendar() : Tracks.SEASON) : null;   // the stamped season, not whatever this build ships
      if (btn) {
        const label = btn.querySelector(".mb-label");
        setText(label, "CAREER MODES");
        const sub = $("mb-career-sub");
        if (sub) {
          if (!c) setText(sub, "DRIVER CAREER  ·  MY TEAM");
          else {
            const team = Teams.LIST.find((t) => t.id === c.team);
            const who = c.flavour === "myteam" ? "MY TEAM" : (c.driver ? c.driver.code : "YOU");
            const used = usedSaveCount(G.store, c);
            setText(sub, who + " · " + String(team ? team.name : c.team).toUpperCase()
              + " · " + c.year + " R" + Math.min(c.season.round + 1, cal.length)
              + (used > 1 ? "  ·  " + used + " SAVED" : ""));
          }
          setAttr(btn, "aria-label", "Career modes — " + sub.textContent);
        }
      }

      const cont = $("mb-continue"), contSub = $("mb-continue-sub");
      if (cont && contSub) {
        // Priority: open career → daily streak / unfinished yesterday → lastSession.
        const hint = (typeof ShareCode !== "undefined" && ShareCode.continueHint)
          ? ShareCode.continueHint(G) : (c ? { kind: "career" } : null);
        setHidden(cont, !hint);
        cont._apexContinue = hint || null;
        if (hint) {
          if (hint.kind === "career" && c && !hint.sub) {
            // ShareCode absent: the same stamped-calendar line continueHint builds
            const next = cal[Math.min(c.season.round, cal.length - 1)];
            setText(contSub, c.year + " · ROUND " + Math.min(c.season.round + 1, cal.length)
              + (next ? " · " + next.name : ""));
          } else {
            setText(contSub, hint.sub || "");
          }
          setAttr(cont, "aria-label", "Continue — " + contSub.textContent);   // starts with the visible "CONTINUE"
        }
      }

      const dailyBtn = $("mb-daily"), dailySub = $("mb-daily-sub");
      if (dailyBtn && dailySub) {
        const p = G.daily.plan(), streak = G.daily.liveStreak ? G.daily.liveStreak() : 0;   // a broken streak is not shown
        setText(dailySub, p.trackName + " · " + p.weather.toUpperCase()
          + (streak > 0 ? " · STREAK " + streak : ""));
        // WCAG 2.5.3 (label in name): the name must contain the visible label, "DAILY TIME TRIAL".
        setAttr(dailyBtn, "aria-label", "Daily time trial — " + dailySub.textContent);
      }
    }

    // IndexedDB restoration finishes after the synchronous boot refresh.
    // Career owns selection reconciliation; this module owns the buttons that
    // expose it, so repaint after the complete batch has selected its live slot.
    if (G.store && G.store.subscribe) G.store.subscribe((change) => {
      if (!change || !change.restoredBatch || !Array.isArray(change.keys)) return;
      const careerBack = change.keys.some((k) => k === "careerSlot" || k.indexOf("career.") === 0);
      if (careerBack) refresh();
      const seasonBack = change.keys.indexOf("season") !== -1;
      // Boot-only season hydrate. entrySettings() (game.js) is snapshotted when
      // introGarage/startRace arms; assigning G.season mid-flight changes that
      // string so live() fails and afterGarageOut titleIfBare() returns to the
      // menu — DAILY garage-out-before-card timed out that way (CI tip 2f81ef993).
      if (seasonBack && !G.seasonMode && !(Career.inCareer && Career.inCareer())) {
        const doc = typeof document !== "undefined" ? document : null;
        const rs = doc && doc.getElementById("race-settings");
        const sel = doc && doc.getElementById("select");
        const L = doc && doc.getElementById("loading");
        const entering = (rs && !rs.hidden) || (sel && !sel.hidden)
          || (L && (!L.hidden || L.dataset.phase));
        if (!entering) G.season = SeasonCal.load();
      }
      if (seasonBack) G.refreshCareerButton();
    });

    const careerBtn = $("mb-career");
    if (careerBtn) careerBtn.onclick = () => G.openCareerSlots();
    const continueBtn = $("mb-continue");
    if (continueBtn) continueBtn.onclick = () => {
      const hint = continueBtn._apexContinue;
      if (!hint || hint.kind === "career") { G.openCareer(); return; }
      if (hint.kind === "daily") { G.openDailyPicker(); return; }
      if (hint.kind === "session" && hint.session) {
        // Stage the circuit picker only — never startRace (share-code / lastSession contract).
        if (G.daily && G.daily.stop) G.daily.stop();
        const idx = Tracks.LIST.findIndex((t) => t.id === hint.session.trackId);
        if (idx < 0) return;
        G.trackIdx = idx;
        // Free play only: lastSession never carries a season/career flow into this picker (6-F3).
        G.flow = "gp";
        G.timeTrial = hint.session.session === "tt";
        G.buildSelect();
        G.els.overlay.hidden = true;
        G.els.select.hidden = false;
        if (G.scheduleFlybyTrack) G.scheduleFlybyTrack(true);
        if (G.soundOn) GameAudio.uiSelect();
        return;
      }
    };
    const dailyBtn = $("mb-daily");
    if (dailyBtn) dailyBtn.onclick = () => G.openDailyPicker();

    return { refresh };
  }

  return { create, organize, repairDestinations, CORE_PLAY_DOORS };
})();
Object.freeze(TitleMenu);
