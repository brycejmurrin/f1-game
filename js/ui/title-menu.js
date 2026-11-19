const TitleMenu = (function () {
  "use strict";

  const DESTINATION_GROUPS = [
    ["menu-primary", "Play", ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice"]],
    ["menu-garage", "Garage", ["mb-garage"]],
    ["menu-explore", "Watch & Explore", ["mb-watch", "mb-data"]],
    ["menu-create", "Create", ["mb-photo", "mb-designer"]],
    ["menu-secondary", "Utilities", ["mb-standings", "mb-settings", "mb-phonepad", "mb-help"]],
  ];
  const CORE_PLAY_DOORS = ["mb-race", "mb-tt", "mb-watch", "mb-data"];

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

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }
  function setAttr(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setHidden(node, hidden) {
    if (node && node.hidden !== hidden) node.hidden = hidden;
  }

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
      const c = Career.data();
      const cal = c ? (Career.calendar ? Career.calendar() : Tracks.SEASON) : null;
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
        const hint = (typeof ShareCode !== "undefined" && ShareCode.continueHint)
          ? ShareCode.continueHint(G) : (c ? { kind: "career" } : null);
        setHidden(cont, !hint);
        cont._apexContinue = hint || null;
        if (hint) {
          if (hint.kind === "career" && c && !hint.sub) {
            const next = cal[Math.min(c.season.round, cal.length - 1)];
            setText(contSub, c.year + " · ROUND " + Math.min(c.season.round + 1, cal.length)
              + (next ? " · " + next.name : ""));
          } else {
            setText(contSub, hint.sub || "");
          }
          setAttr(cont, "aria-label", "Continue — " + contSub.textContent);
        }
      }

      const dailyBtn = $("mb-daily"), dailySub = $("mb-daily-sub");
      if (dailyBtn && dailySub) {
        const p = G.daily.plan(), streak = G.daily.liveStreak ? G.daily.liveStreak() : 0;
        setText(dailySub, p.trackName + " · " + p.weather.toUpperCase()
          + (streak > 0 ? " · STREAK " + streak : ""));
        setAttr(dailyBtn, "aria-label", "Daily time trial — " + dailySub.textContent);
      }
    }

    if (G.store && G.store.subscribe) G.store.subscribe((change) => {
      if (!change || !change.restoredBatch || !Array.isArray(change.keys)) return;
      const careerBack = change.keys.some((k) => k === "careerSlot" || k.indexOf("career.") === 0);
      if (careerBack) refresh();
      const seasonBack = change.keys.indexOf("season") !== -1;
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
        if (G.daily && G.daily.stop) G.daily.stop();
        const idx = Tracks.LIST.findIndex((t) => t.id === hint.session.trackId);
        if (idx < 0) return;
        G.trackIdx = idx;
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
    let paintedDay = G.daily && G.daily.dayKey ? G.daily.dayKey() : null;
    if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !G.daily || !G.daily.dayKey) return;
      const day = G.daily.dayKey();
      if (day !== paintedDay) { paintedDay = day; refresh(); }
    });

    return { refresh };
  }

  return { create, organize, repairDestinations, CORE_PLAY_DOORS };
})();
Object.freeze(TitleMenu);
