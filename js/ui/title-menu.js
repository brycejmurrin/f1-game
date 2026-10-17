/* Apex 26 — TITLE MENU retention doors: career summary, direct Continue, and today's Daily Challenge. */
const TitleMenu = (function () {
  "use strict";

  // Move the existing nodes: their handlers, saved-state labels and visibility
  // remain owned by their original modules. The outer title-layout pieces stay put.
  function organize(doc) {
    const menu = doc && doc.getElementById("menu-buttons");
    if (!menu || menu.dataset.destinations) return;
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
    group("menu-primary", "Play", ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice", "mb-standings"]);
    group("menu-garage", "Garage", ["mb-garage"]);
    group("menu-explore", "Watch & Explore", ["mb-watch", "mb-data"]);
    const create = group("menu-create", "Create", ["mb-photo", "mb-designer"]);
    const utilities = group("menu-secondary", "Utilities", ["mb-settings", "mb-phonepad", "mb-help"]);
    const shortcut = (row, id, label, page) => {
      if (doc.getElementById(id)) return;
      const button = doc.createElement("button"); button.id = id; button.type = "button";
      button.className = "bigbtn alt minibtn"; button.textContent = label;
      button.onclick = () => {
        const settings = doc.getElementById("mb-settings");
        if (settings) settings.click();
        if (typeof SettingsNav !== "undefined") (SettingsNav.showDirect || SettingsNav.show)(page, true);
      };
      row.appendChild(button);
    };
    shortcut(create, "mb-visual", "VISUAL STUDIO", "visual");
    shortcut(utilities, "mb-saves", "SAVES & DATA", "files");
  }

  function create(G) {
    Log.info("game", "TitleMenu.create");
    const { $ } = G;
    organize(typeof document !== "undefined" ? document : null);

    function refresh() {
      const btn = $("mb-career");
      const c = Career.data() || Career.load();
      const cal = Career.calendar ? Career.calendar() : Tracks.SEASON;   // the stamped season, not whatever this build ships
      const used = Career.slots().filter((s) => s.used).length;
      if (btn) {
        const label = btn.querySelector(".mb-label");
        if (label) label.textContent = "CAREER MODES";
        const sub = $("mb-career-sub");
        if (sub) {
          if (!c) sub.textContent = "DRIVER CAREER  ·  MY TEAM";
          else {
            const team = Teams.LIST.find((t) => t.id === c.team);
            const who = c.flavour === "myteam" ? "MY TEAM" : (c.driver ? c.driver.code : "YOU");
            sub.textContent = who + " · " + String(team ? team.name : c.team).toUpperCase()
              + " · " + c.year + " R" + Math.min(c.season.round + 1, cal.length)
              + (used > 1 ? "  ·  " + used + " SAVED" : "");
          }
          btn.setAttribute("aria-label", "Career modes — " + sub.textContent);
        }
      }

      const cont = $("mb-continue"), contSub = $("mb-continue-sub");
      if (cont && contSub) {
        // Priority: open career → daily streak / unfinished yesterday → lastSession.
        const hint = (typeof ShareCode !== "undefined" && ShareCode.continueHint)
          ? ShareCode.continueHint(G) : (c ? { kind: "career" } : null);
        cont.hidden = !hint;
        cont._apexContinue = hint || null;
        if (hint) {
          if (hint.kind === "career" && c && !hint.sub) {
            // ShareCode absent: the same stamped-calendar line continueHint builds
            const next = cal[Math.min(c.season.round, cal.length - 1)];
            contSub.textContent = c.year + " · ROUND " + Math.min(c.season.round + 1, cal.length)
              + (next ? " · " + next.name : "");
          } else {
            contSub.textContent = hint.sub || "";
          }
          cont.setAttribute("aria-label", "Continue — " + contSub.textContent);   // starts with the visible "CONTINUE"
        }
      }

      const dailyBtn = $("mb-daily"), dailySub = $("mb-daily-sub");
      if (dailyBtn && dailySub) {
        const p = G.daily.plan(), streak = G.daily.liveStreak ? G.daily.liveStreak() : 0;   // a broken streak is not shown
        dailySub.textContent = p.trackName + " · " + p.weather.toUpperCase()
          + (streak > 0 ? " · STREAK " + streak : "");
        // WCAG 2.5.3 (label in name): the name must contain the visible label, "DAILY TIME TRIAL".
        dailyBtn.setAttribute("aria-label", "Daily time trial — " + dailySub.textContent);
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

  return { create, organize };
})();
Object.freeze(TitleMenu);
