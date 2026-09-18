/* Apex 26 — TITLE MENU retention doors: career summary, direct Continue, and today's Daily Challenge. */
const TitleMenu = (function () {
  "use strict";

  function create(G) {
    Log.info("game", "TitleMenu.create");
    const { $ } = G;

    function refresh() {
      const btn = $("mb-career");
      const c = Career.data() || Career.load();
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
            sub.textContent = who + " · " + (team ? team.name : c.team).toUpperCase()
              + " · " + c.year + " R" + Math.min(c.season.round + 1, Tracks.SEASON.length)
              + (used > 1 ? "  ·  " + used + " SAVED" : "");
          }
          btn.setAttribute("aria-label", "Career modes — " + sub.textContent);
        }
      }

      const cont = $("mb-continue"), contSub = $("mb-continue-sub");
      if (cont && contSub) {
        cont.hidden = !c;
        if (c) {
          const next = Tracks.SEASON[Math.min(c.season.round, Tracks.SEASON.length - 1)];
          contSub.textContent = c.year + " · ROUND " + Math.min(c.season.round + 1, Tracks.SEASON.length)
            + (next ? " · " + next.name : "");
          cont.setAttribute("aria-label", "Continue career — " + contSub.textContent);
        }
      }

      const dailyBtn = $("mb-daily"), dailySub = $("mb-daily-sub");
      if (dailyBtn && dailySub) {
        const p = G.daily.plan(), st = G.daily.data().streak;
        dailySub.textContent = p.trackName + " · " + p.weather.toUpperCase()
          + (st.count > 0 ? " · STREAK " + st.count : "");
        dailyBtn.setAttribute("aria-label", "Daily challenge — " + dailySub.textContent);
      }
    }

    const careerBtn = $("mb-career");
    if (careerBtn) careerBtn.onclick = () => G.openCareerSlots();
    const continueBtn = $("mb-continue");
    if (continueBtn) continueBtn.onclick = () => G.openCareer();
    const dailyBtn = $("mb-daily");
    if (dailyBtn) dailyBtn.onclick = () => G.openDailyPicker();

    return { refresh };
  }

  return { create };
})();
Object.freeze(TitleMenu);
