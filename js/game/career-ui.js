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
      ["myteam", "MY TEAM", "Own the eleventh team. Run the money, run the drivers."],
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

    // ---- left: contract + objectives ----
    left.appendChild(head("CONTRACT"));
    if (c.deal) {
      const card = el("div", "cr-card");
      card.append(
        row("Team", team ? team.name : c.deal.team),
        row("Seasons left", String(c.deal.left)),
        row("Salary", c.deal.salary + " cr / round"),
        row("Points bonus", c.deal.bonusPt + " cr / point"),
        row("Season target", "finish P" + c.deal.goal.value + " or better"));
      left.appendChild(card);
    }

    left.appendChild(head("THE CAR"));
    const carCard = el("div", "cr-card");
    const fittedCost = Parts.getCost(c.fitted, team);
    carCard.append(
      row("Parts owned", c.owned.length + " of " + totalOptions()),
      row("Fitted", fittedCost + " / " + Career.budget() + " cr"),
      row("Development", devLabel(c.tdev[c.team] || 0)));
    left.appendChild(carCard);

    // ---- right: next race + standings ----
    if (Career.seasonDone()) {
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

    $("cr-go").textContent = Career.seasonDone() ? "END OF SEASON" : "GO RACING";
    $("cr-garage").hidden = false;
  }

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
    if (Career.seasonDone()) return;   // rollover lands here in phase 5
    G.openRaceSettings("career");
  };

  return { build, openHub, close };
}

return { create, STARTER_TIER_MIN };
})();
