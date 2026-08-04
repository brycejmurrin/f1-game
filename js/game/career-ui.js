/* Apex 26 — the CAREER screen (#career). Two states in one sheet: the new-career
   setup when no save exists, and the season hub when one does. The hub replaces
   #select entirely in career, because the calendar decides where you race — the
   only thing left to choose is whether you are ready to go.

   Rules and persistence live in js/game/career.js; this file is DOM only. Live
   game state comes through the ctx façade handed to CareerUI.create(ctx) at boot
   (see the `G` object in game.js): els, $, cssCol, openGarage, openRaceSettings,
   updateTrackPreview. Consumes globals Career, Teams, Tracks, Parts, GameAudio.
   Must load BEFORE js/game.js (see index.html). */
const CareerUI = (function () {
  "use strict";

// Which teams will take a rookie. A career that can start at Mercedes has nowhere
// to go, so the opening choice is deliberately the back half of the grid — the
// climb is the mode. Tier 3+ is seven teams, which is a real choice, not a token one.
const STARTER_TIER_MIN = 3;

function create(G) {
  const { $, els } = G;

  // The new-career form's working state. Not persisted — it only exists between
  // opening the screen and pressing START, and Career.start() is what makes it real.
  let draft = null;

  // Section heading. Uses the shared .sel-label from css/components.css — the same
  // dim uppercase text with the skewed red tick that #select and the garage use —
  // so the career pages read as part of the same family rather than a new screen
  // with its own idea of what a heading looks like. h3, as elsewhere.
  function head(text) { return el("h3", "sel-label", text); }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function starterTeams() {
    return Teams.LIST.filter((t) => !t.custom && t.tier >= STARTER_TIER_MIN);
  }

  function freshDraft() {
    const teams = starterTeams();
    return {
      flavour: "driver",
      teamId: teams.length ? teams[0].id : "haas",
      seat: 1,                 // the junior seat by default — you are the newcomer
      name: "Your Name", code: "YOU", num: 99,
      // Mid-table by default: affordable on the starting balance, and not so slow
      // that the constructors' championship is out of reach in year one.
      hire: "NKM",
    };
  }

  // ---------- new-career setup ----------

  function buildSetupPanes() {
    const left = $("cr-left"), right = $("cr-right");
    left.textContent = ""; right.textContent = "";

    left.appendChild(head("CAREER TYPE"));
    const flavours = el("div", "cr-flavours");
    for (const [id, label, blurb] of [
      ["driver", "DRIVER", "Sign for a team, hit your targets, earn a better seat."],
      ["myteam", "MY TEAM", "Own the twelfth team. Run the money, run the drivers."],
    ]) {
      const b = el("button", "cr-flavour" + (draft.flavour === id ? " active" : ""));
      b.setAttribute("aria-pressed", draft.flavour === id ? "true" : "false");
      b.append(el("span", "cr-flavour-name", label), el("span", "cr-flavour-blurb", blurb));
      b.onclick = () => {
        draft.flavour = id;
        if (id === "myteam") draft.teamId = "custom";
        else if (draft.teamId === "custom") draft.teamId = freshDraft().teamId;
        buildSetupPanes();
        if (G.soundOn) GameAudio.uiTick();
      };
      flavours.appendChild(b);
    }
    left.appendChild(flavours);

    if (draft.flavour === "driver") {
      left.appendChild(head("WHO WILL HAVE YOU"));
      left.appendChild(el("div", "cr-note",
        "Nobody at the front signs a rookie. Beat the car you are given and the offers improve."));
      const grid = el("div", "cr-teamgrid");
      for (const t of starterTeams()) {
        const b = el("button", "cr-teamtile" + (draft.teamId === t.id ? " active" : ""));
        b.setAttribute("aria-pressed", draft.teamId === t.id ? "true" : "false");
        const sw = el("span", "cr-teamtile-sw");
        sw.style.background = G.cssCol(t.color);
        sw.style.borderColor = G.cssCol(t.color2);
        // Salary is a function of tier, so the four tier-3 teams all offer the
        // same number and a salary-only line reads as a bug. The car rating is
        // what actually separates them, and it is the thing you are choosing.
        const car = Math.round((t.stats.speed + t.stats.accel + t.stats.cornering + t.stats.braking) / 4);
        b.append(sw, el("span", "cr-teamtile-name", t.name),
          el("span", "cr-teamtile-meta",
            t.engine + " · CAR " + car + " · " + Career.salaryFor(t, 30) + " cr"));
        b.onclick = () => { draft.teamId = t.id; buildSetupPanes(); if (G.soundOn) GameAudio.uiTick(); };
        grid.appendChild(b);
      }
      left.appendChild(grid);
    }

    if (draft.flavour === "myteam") {
      left.appendChild(head("YOUR SECOND DRIVER"));
      left.appendChild(el("div", "cr-note",
        "You own the team and drive one of its two cars. The other seat is a hire, "
        + "and you pay their salary every round out of the same balance that "
        + "develops the car — a quick team-mate costs you upgrades."));
      const list = el("div", "cr-teamgrid");
      for (const a of Career.freeAgents()) {
        const b = el("button", "cr-teamtile" + (draft.hire === a.code ? " active" : ""));
        b.setAttribute("aria-pressed", draft.hire === a.code ? "true" : "false");
        const sw = el("span", "cr-teamtile-sw");
        // Their pace, from the same deterministic tier fallback the grid will use,
        // so the number on the tile is the number you get.
        const r = DriverRatings.get(a.code, a.tier);
        sw.style.background = G.cssCol([0.2 + r.pace / 200, 0.5, 0.9 - r.pace / 300]);
        b.append(sw, el("span", "cr-teamtile-name", a.name),
          el("span", "cr-teamtile-meta",
            "PACE " + r.pace + " · CRAFT " + r.craft + " · " + a.ask + " cr / round"));
        b.onclick = () => { draft.hire = a.code; buildSetupPanes(); if (G.soundOn) GameAudio.uiTick(); };
        list.appendChild(b);
      }
      left.appendChild(list);
    }

    // ---- identity ----
    right.appendChild(head(draft.flavour === "myteam" ? "TEAM PRINCIPAL" : "YOUR DRIVER"));
    const form = el("div", "cr-form");
    const addField = (label, value, maxlen, onInput, type) => {
      const wrap = el("label", "cr-field");
      wrap.appendChild(el("span", "cr-field-lbl", label));
      const input = document.createElement("input");
      input.type = type || "text";
      input.value = value;
      if (maxlen) input.maxLength = maxlen;
      input.className = "cr-input";
      input.oninput = () => onInput(input.value);
      wrap.appendChild(input);
      form.appendChild(wrap);
      return input;
    };
    addField("NAME", draft.name, 22, (v) => { draft.name = v; });
    addField("CODE", draft.code, 3, (v) => { draft.code = v.toUpperCase(); });
    const numIn = addField("NUMBER", String(draft.num), 2, (v) => { draft.num = parseInt(v, 10) || 99; }, "number");
    numIn.min = "2"; numIn.max = "99";
    right.appendChild(form);

    if (draft.flavour === "driver") {
      const team = Teams.LIST.find((t) => t.id === draft.teamId);
      if (team) {
        right.appendChild(head("THE SEAT"));
        const seats = el("div", "cr-seats");
        team.drivers.forEach((d, i) => {
          const b = el("button", "cr-seat" + (draft.seat === i ? " active" : ""));
          b.setAttribute("aria-pressed", draft.seat === i ? "true" : "false");
          b.append(el("span", "cr-seat-role", i === 0 ? "LEAD SEAT" : "SECOND SEAT"),
            el("span", "cr-seat-who", "replaces " + d.name));
          b.onclick = () => { draft.seat = i; buildSetupPanes(); if (G.soundOn) GameAudio.uiTick(); };
          seats.appendChild(b);
        });
        right.appendChild(seats);
        const mate = team.drivers[draft.seat === 0 ? 1 : 0];
        if (mate) right.appendChild(el("div", "cr-note", "Your team-mate will be " + mate.name +
          ". Most of your race objectives are measured against them."));
      }
    }

    $("cr-title").textContent = "NEW CAREER";
    $("cr-sub").textContent = "";
    $("cr-meters").textContent = "";
    $("cr-go").textContent = "START CAREER";
    $("cr-garage").hidden = true;
  }

  // ---------- season hub ----------

  function meter(label, value, cls) {
    const m = el("div", "cr-meter" + (cls ? " " + cls : ""));
    m.append(el("span", "cr-meter-lbl", label), el("span", "cr-meter-val", value));
    return m;
  }

  function buildHubPanes() {
    const c = Career.data();
    const st = Career.state();
    const left = $("cr-left"), right = $("cr-right");
    left.textContent = ""; right.textContent = "";

    const team = Teams.LIST.find((t) => t.id === c.team);
    $("cr-title").textContent = "CAREER " + c.year;
    $("cr-sub").textContent = (c.flavour === "myteam" ? "TEAM PRINCIPAL" : c.driver.code) +
      " · " + (team ? team.name.toUpperCase() : c.team.toUpperCase());
    if (team) $("cr-sub").style.color = G.cssCol(team.color2 || team.color);

    const meters = $("cr-meters");
    meters.textContent = "";
    meters.append(
      meter("BALANCE", st.money.toLocaleString() + " cr"),
      meter("REPUTATION", Math.round(st.rep) + " / 100"),
      meter("ROUND", (Math.min(st.round + 1, st.rounds)) + " / " + st.rounds));

    // ---- left: this round's brief, then the contract it sits inside ----
    // The objective goes FIRST because it is the only thing on this screen that
    // changes between one visit and the next; the contract is background.
    if (!Career.seasonDone()) {
      const obj = Career.objective();
      left.appendChild(head("THIS ROUND"));
      const objCard = el("div", "cr-card cr-objective");
      objCard.append(el("div", "cr-obj-line", Career.objectiveLabel(obj)));
      if (c.deal) objCard.append(row("Season goal", "P" + c.deal.goal.value + " in the championship"));
      objCard.append(row("If you hit it", "+" + Career.OBJ_BONUS + " cr · +" + Career.OBJ_REP + " REP"));
      left.appendChild(objCard);
    }

    left.appendChild(head("CONTRACT"));
    if (c.deal) {
      const card = el("div", "cr-card");
      card.append(
        row("Team", team ? team.name : c.deal.team),
        row("Seasons left", String(c.deal.left)),
        row("Salary", c.deal.salary + " cr / round"),
        row("Points bonus", c.deal.bonusPt + " cr / point"));
      left.appendChild(card);
    }

    left.appendChild(head("THE CAR"));
    const carCard = el("div", "cr-card");
    const fittedCost = Parts.getCost(c.fitted, team);
    carCard.append(
      row("Parts owned", c.owned.length + " of " + totalOptions()),
      row("Fitted", fittedCost + " / " + Career.budget() + " cr"),
      row("Development", devLabel(c.tdev[c.team] || 0)),
      // Reliability belongs on THE CAR: a DNF is the car letting you down, and
      // team development plus a developed engine and gearbox are what buy it off.
      row("Retirements", st.dnfs + " this season"));
    left.appendChild(carCard);

    // MY TEAM runs a wage bill on top of the car. Shown as its own card because it
    // is a different budget: salaries come off the BALANCE, never off the fitted
    // cap, so a fast team-mate costs you upgrades rather than legality.
    if (c.flavour === "myteam" && c.roster && c.roster.length) {
      left.appendChild(head("THE TEAM"));
      const teamCard = el("div", "cr-card");
      teamCard.appendChild(row("Car 1", c.driver.name + " (you)"));
      for (const d of c.roster) {
        teamCard.appendChild(row("Car 2", d.name));
        teamCard.appendChild(row("Salary", d.salary + " cr / round"));
        teamCard.appendChild(row("Contract", d.left + (d.left === 1 ? " season" : " seasons")));
      }
      left.appendChild(teamCard);
    }

    // CAREER RECORD is a card at the foot of this column, not a fourth button in
    // the action bar. At 844x390 the sheet's left column is ~370px wide and four
    // buttons at the shared `.sheet-foot .bigbtn` 110px floor need ~440px, so a
    // fourth wraps the bar and costs a button's height out of a 390px-tall
    // screen. A card also states what it opens, which a fourth exit cannot.
    left.appendChild(head("CAREER RECORD"));
    const rec = careerTotals();
    const recBtn = el("button", "cr-card cr-record");
    recBtn.id = "cr-history";
    recBtn.append(
      el("span", "cr-record-line",
        rec.seasons + (rec.seasons === 1 ? " season" : " seasons")
        + " · " + rec.wins + (rec.wins === 1 ? " win" : " wins")
        + " · " + rec.podiums + (rec.podiums === 1 ? " podium" : " podiums")
        + (rec.titles ? " · " + rec.titles + (rec.titles === 1 ? " title" : " titles") : "")),
      el("span", "cr-record-cta", "SEASON BY SEASON"));
    recBtn.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); openHistory(); };
    left.appendChild(recBtn);

    // ---- right: next race + standings ----
    if (st.offers) {
      right.appendChild(head("A SEAT TO SIGN"));
      right.appendChild(el("div", "cr-note", "The " + c.year + " season cannot start until you " +
        "have somewhere to drive it. " + st.offers + (st.offers === 1 ? " offer is" : " offers are") +
        " on the table."));
    } else if (Career.seasonDone()) {
      right.appendChild(head("SEASON COMPLETE"));
      right.appendChild(el("div", "cr-note", "All " + st.rounds + " rounds are done. " +
        "Close out the year to see where you finished."));
    } else {
      const t = Tracks.SEASON[c.season.round];
      right.appendChild(head("NEXT RACE"));
      const nr = el("div", "cr-card cr-nextrace");
      nr.append(
        el("div", "cr-nr-round", "ROUND " + (c.season.round + 1)),
        el("div", "cr-nr-name", t ? t.name : "—"),
        el("div", "cr-nr-country", t && t.country ? t.country : ""));
      right.appendChild(nr);

      const upcoming = [];
      for (let i = c.season.round + 1; i < Math.min(c.season.round + 5, Tracks.SEASON.length); i++)
        upcoming.push({ n: i + 1, t: Tracks.SEASON[i] });
      if (upcoming.length) {
        right.appendChild(head("UPCOMING"));
        for (const u of upcoming) {
          const r = el("div", "season-upcoming-row");
          r.append(el("span", "sur-rnd", "R" + u.n), el("span", "sur-name", u.t.name),
            el("span", "sur-country", u.t.country || ""));
          right.appendChild(r);
        }
      }
    }

    // Championship snapshot — only once there is something to show.
    const entries = Object.entries(c.season.pts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (entries.length) {
      right.appendChild(head("CHAMPIONSHIP"));
      entries.forEach(([driverId, pts], i) => {
        const teamId = driverId.split(":")[0];
        const dTeam = Teams.LIST.find((x) => x.id === teamId);
        const isYou = teamId === c.team && (driverId.split(":")[1] | 0) === c.seat;
        const r = el("div", "res-row" + (isYou ? " you" : ""));
        const sw = el("span", "res-swatch");
        sw.style.background = G.cssCol(dTeam ? dTeam.color : [0.5, 0.5, 0.5]);
        r.append(el("span", "res-pos", String(i + 1)), sw,
          el("span", "res-name", c.season.driverCodes[driverId] || driverId),
          el("span", "res-pts", pts + " pts"));
        right.appendChild(r);
      });
    }

    $("cr-go").textContent = st.offers ? "SIGN A CONTRACT"
      : Career.seasonDone() ? "END OF SEASON" : "GO RACING";
    $("cr-garage").hidden = false;
  }

  // ---------- end of season (#career-offers) ----------
  // The year that was, and the seats on the table for the next one. Built from the
  // ARCHIVE rather than the live season: by the time this is on screen the rollover
  // has run, so career.season has already been reset to round 0 of the new year and
  // the only record of what just happened is career.history's last entry.

  function buildOffers() {
    const c = Career.data();
    const body = $("co-body");
    body.textContent = "";
    const past = c.history[c.history.length - 1];
    $("co-title").textContent = past ? "SEASON " + past.year : "END OF SEASON";

    if (past) {
      body.appendChild(head("THE YEAR"));
      const card = el("div", "cr-card");
      card.append(
        row("World champion", past.champion || "—"),
        row("You finished", "P" + past.pos + " · " + past.pts + " pts"),
        row("Constructors", "P" + past.cPos + " · " + past.cPts + " pts"),
        row("Wins / podiums", past.wins + " / " + past.podiums));
      body.appendChild(card);
    }

    body.appendChild(head("ON THE TABLE"));
    body.appendChild(el("div", "cr-note",
      "Pick a seat for " + c.year + ". Moving team means starting the car over from " +
      "that team's works build — you do not take your parts with you."));

    (c.offers || []).forEach((o, i) => {
      const t = Teams.LIST.find((x) => x.id === o.teamId);
      const staying = o.teamId === c.team;
      const b = el("button", "co-offer" + (staying ? " staying" : ""));
      const sw = el("span", "co-offer-sw");
      sw.style.background = G.cssCol(t ? t.color : [0.5, 0.5, 0.5]);
      sw.style.borderColor = G.cssCol(t ? (t.color2 || t.color) : [0.5, 0.5, 0.5]);
      b.append(sw,
        el("span", "co-offer-team", t ? t.name : o.teamId),
        el("span", "co-offer-tag", staying ? "STAY" : "MOVE"),
        el("span", "co-offer-terms",
          o.years + (o.years === 1 ? " season" : " seasons") + " · " +
          o.salary + " cr / round · target P" + o.goal.value));
      b.onclick = () => {
        if (G.soundOn) GameAudio.uiSelect();
        Career.acceptOffer(i);
        closeOffers();
        // Back through openCareer() rather than straight to the hub: signing can
        // change your team, and that is where teamIdx/driverIdx and the player's
        // part mods are re-pointed at the contract.
        G.openCareer();
      };
      body.appendChild(b);
    });
    ScrollFade.refresh();
  }

  function openOffers() { buildOffers(); $("career-offers").hidden = false; }
  function closeOffers() { $("career-offers").hidden = true; }

  // ---------- career history (#career-history) ----------
  // The record of everything a career has achieved: the running totals, then the
  // years behind them. career.history is the archive rollover() writes — one
  // entry per finished season, capped at ten, carrying year/team, the driver and
  // constructor championship positions and points, the champion, wins, podiums.

  // DERIVED on demand, never stored. A totals block on the save would be another
  // rung on the migration ladder for numbers that are a sum over data already
  // there — and a total written once is a total that goes stale, which no
  // migration can put right after the fact.
  function careerTotals() {
    const c = Career.data();
    const hist = (c && c.history) || [];
    const live = (c && c.results) || [];
    const me = c ? GameStore.seasonDriverId(c.team, c.seat) : "";
    const t = {
      // The year in progress counts: you are living a season, not waiting for one.
      seasons: hist.length + 1,
      // Starts is the one figure the archive does not record. A season only
      // reaches it once seasonDone() is true, so an archived year ran the whole
      // calendar; the running year contributes exactly the rounds settled so far.
      // Only __apex.careerRollover() can archive a short season, and it is a hook.
      starts: hist.length * Career.roundsTotal() + live.length,
      wins: live.filter((r) => r.p === 1).length,
      podiums: live.filter((r) => r.p <= 3).length,
      points: (c && c.season.pts[me]) || 0,
      titles: 0, cTitles: 0,
      best: 0, bestYear: 0,
      teams: [],
    };
    for (const h of hist) {
      t.wins += h.wins || 0;
      t.podiums += h.podiums || 0;
      t.points += h.pts || 0;
      if (h.pos === 1) t.titles++;
      if (h.cPos === 1) t.cTitles++;
      // Best is over FINISHED seasons only — a championship still being run has
      // no final position, and a mid-season standing is not a career best.
      if (h.pos && (!t.best || h.pos < t.best)) { t.best = h.pos; t.bestYear = h.year; }
      if (t.teams.indexOf(h.team) < 0) t.teams.push(h.team);
    }
    if (c && t.teams.indexOf(c.team) < 0) t.teams.push(c.team);
    return t;
  }

  function teamName(id) {
    const t = Teams.LIST.find((x) => x.id === id);
    return t ? t.name : String(id).toUpperCase();
  }

  function buildHistory() {
    const c = Career.data();
    const body = $("ch-body");
    body.textContent = "";
    if (!c) return;
    const t = careerTotals();

    body.appendChild(head("CAREER TOTALS"));
    const card = el("div", "cr-card");
    card.append(
      row("Seasons", t.seasons + " · " + c.year + " in progress"),
      row("Race starts", String(t.starts)),
      row("Wins", String(t.wins)),
      row("Podiums", String(t.podiums)),
      row("Points", String(t.points)),
      row("Championships", t.titles + " drivers' · " + t.cTitles + " constructors'"),
      row("Best championship", t.best ? "P" + t.best + " in " + t.bestYear : "no season finished yet"),
      row("Teams driven for", t.teams.map(teamName).join(", ")));
    body.appendChild(card);

    body.appendChild(head("SEASON BY SEASON"));
    if (!c.history.length) {
      // An empty box would read as a broken screen. A first season genuinely has
      // no archive, and saying so is the honest answer to "what have I done".
      body.appendChild(el("div", "cr-note",
        c.year + " is your first season and it is still running — there is nothing "
        + "archived yet. Finish the calendar and close the year out, and it lands here."));
    } else {
      // The cap is only worth mentioning once it has started throwing years away —
      // "the last 10 seasons" over a list of two reads as a limit you have hit.
      if (c.history.length >= Career.HISTORY_MAX)
        body.appendChild(el("div", "cr-note",
          "This is localStorage, so the archive keeps the last " + Career.HISTORY_MAX +
          " seasons — anything older has rolled off."));
      // Newest first: the year you just closed out is the one you came to read.
      for (const h of c.history.slice().reverse()) {
        const team = Teams.LIST.find((x) => x.id === h.team);
        // Podium classes are the shared gold/silver/bronze from css/components.css,
        // so a title-winning year lights up without a vocabulary of its own.
        const r = el("div", "res-row" + (h.pos >= 1 && h.pos <= 3 ? " p" + h.pos : ""));
        const sw = el("span", "res-swatch");
        sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
        r.append(el("span", "res-pos", "P" + h.pos), sw,
          el("span", "res-name", h.year + " · " + teamName(h.team)),
          el("span", "res-pts", h.pts + " pts"));
        body.appendChild(r);
      }
    }
    ScrollFade.refresh();
  }

  function openHistory() { buildHistory(); $("career-history").hidden = false; }
  function closeHistory() { $("career-history").hidden = true; }

  function row(k, v) {
    const r = el("div", "cr-row");
    r.append(el("span", "cr-row-k", k), el("span", "cr-row-v", v));
    return r;
  }
  function totalOptions() {
    return Parts.CATALOG.reduce((n, cat) => n + cat.options.length, 0);
  }
  function devLabel(d) {
    if (!d) return "on the baseline";
    return (d > 0 ? "+" : "") + d + " (" + (d > 0 ? "gaining" : "slipping") + ")";
  }

  // ---------- shell ----------

  function build() {
    if (Career.active()) { draft = null; buildHubPanes(); }
    else { draft = draft || freshDraft(); buildSetupPanes(); }
    ScrollFade.refresh();
  }

  function openHub() {
    build();
    $("career").hidden = false;
  }
  function close() { $("career").hidden = true; }

  // ---------- wiring ----------

  $("cr-back").onclick = () => {
    close();
    els.overlay.hidden = false;
    G.flow = "gp"; G.session = "race";
    G.refreshCareerButton();
    if (G.soundOn) GameAudio.uiSelect();
  };
  $("cr-garage").onclick = () => { close(); G.openGarage("career"); };
  $("cr-go").onclick = () => {
    if (G.soundOn) GameAudio.uiSelect();
    if (!Career.active()) {
      Career.start(draft);
      G.openCareer();          // re-enters the hub with the save in place
      return;
    }
    // Three states, in order of precedence. Unsigned offers come FIRST, because
    // the rollover has already reset the calendar to round 0 by the time they
    // exist: without this gate a player who backed out of the offers sheet would
    // find GO RACING live again and drive the new season with no contract.
    const c = Career.data();
    if (c.offers && c.offers.length) { openOffers(); return; }
    if (Career.seasonDone()) { Career.rollover(); build(); openOffers(); return; }
    G.openRaceSettings("career");
  };
  // DECIDE LATER, not CANCEL. The offers survive on the save, so this returns to
  // the hub with SIGN A CONTRACT still waiting rather than discarding the year.
  $("co-back").onclick = () => {
    closeOffers();
    build();
    if (G.soundOn) GameAudio.uiSelect();
  };
  // History is read-only, so BACK simply drops the modal — nothing behind it can
  // have changed and rebuilding the hub would only throw away its scroll position.
  $("ch-back").onclick = () => {
    closeHistory();
    if (G.soundOn) GameAudio.uiSelect();
  };

  return { build, openHub, close, openOffers, closeOffers, openHistory, closeHistory };
}

return { create, STARTER_TIER_MIN };
})();
