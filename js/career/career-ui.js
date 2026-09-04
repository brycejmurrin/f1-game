/* Apex 26 — the CAREER screen (#career). THREE states in one sheet: CAREER MODES (both modes, their six save slots and their guides — the title button's one door)… */
const CareerUI = (function () {
  "use strict";

const STARTER_TIER_MIN = 3;

function create(G) {
  Log.info("ui", "CareerUI.create");
  const { $, els } = G;

  let draft = null;
  let draftFrom = null;   // the live slot before an EMPTY slot was opened; restored if the draft is abandoned

  function head(text, id) {
    const n = el("h3", "sel-label", text);
    if (id) n.id = id;
    return n;
  }
  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function mountContentsNav(bodyId, navId, label) {
    const body = $(bodyId);
    let nav = document.getElementById(navId);
    if (nav) return nav;
    nav = el("nav");
    nav.id = navId;
    nav.setAttribute("aria-label", label);
    body.parentNode.insertBefore(nav, body);
    return nav;
  }
  function fillContents(navId, root) {
    const nav = $(navId);
    if (!nav) return;
    nav.textContent = "";
    root.querySelectorAll(".sel-label[id]").forEach((h) => {
      const a = el("a", "", h.textContent);
      a.href = "#" + h.id;
      nav.appendChild(a);
    });
  }

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
      hire: "NKM",
    };
  }

  let picking = false;
  let armedDelete = "";

  function slotCard(s) {
    const live = s.used && s.live;
    const card = el("div", "cr-slot" + (s.used ? " used" : " empty") + (live ? " active" : ""));
    const open = el("button", "cr-slot-main");
    open.append(el("span", "cr-slot-n", "SLOT " + (s.i + 1) + (live ? " · PLAYING" : "")));
    if (s.used) {
      open.append(
        el("span", "cr-slot-who", (s.flavour === "myteam" ? s.teamName : s.code + " · " + s.teamName).toUpperCase()),
        el("span", "cr-slot-meta",
          s.year + " · round " + Math.min(s.round + 1, s.rounds) + " of " + s.rounds
          + " · " + s.money.toLocaleString() + " cr"),
        el("span", "cr-slot-meta",
          s.seasons + (s.seasons === 1 ? " season" : " seasons")
          + " · " + s.wins + (s.wins === 1 ? " win" : " wins")
          + (s.titles ? " · " + s.titles + (s.titles === 1 ? " title" : " titles") : "")));
    } else {
      open.append(el("span", "cr-slot-who", "EMPTY"),
        el("span", "cr-slot-meta", s.flavour === "myteam"
          ? "Start a team here" : "Start a career here"));
    }
    open.onclick = () => {
      if (G.soundOn) GameAudio.uiSelect();
      armedDelete = "";
      picking = false;
      if (s.used) { Career.useSlot(s.flavour, s.i); G.openCareer(); return; }
      // Opening an EMPTY slot repoints the live pointer at it; backing out
      // used to leave it there, and load() then re-homed the player to the
      // FIRST used slot rather than the one they were in.
      draftFrom = Career.slot();
      Career.useSlot(s.flavour, s.i);
      draft = freshDraft();
      draft.flavour = s.flavour;
      draft.slot = s.i;
      if (s.flavour === "myteam") draft.teamId = "custom";
      build();
    };
    card.appendChild(open);
    if (s.used) {
      const id = s.flavour + ":" + s.i;
      const armed = armedDelete === id;
      const del = el("button", "cr-slot-del" + (armed ? " armed" : ""), armed ? "DELETE?" : "DELETE");
      del.setAttribute("aria-label", "Delete the "
        + (s.flavour === "myteam" ? "team" : "career") + " in slot " + (s.i + 1));
      del.onclick = (ev) => {
        ev.stopPropagation();
        if (G.soundOn) GameAudio.uiTick();
        if (!armed) { armedDelete = id; build(); return; }
        armedDelete = "";
        Career.deleteSlot(s.flavour, s.i);
        Career.load();
        G.refreshCareerButton();
        build();
      };
      card.appendChild(del);
    }
    return card;
  }

  function modeColumn(pane, flavour) {
    const my = flavour === "myteam";
    pane.appendChild(head(my ? "MY TEAM" : "DRIVER CAREER"));
    pane.appendChild(el("div", "cr-note", my
      ? "Own the twelfth team and drive one of its two cars. You hire your "
        + "team-mate, pay their wages, and build the car both of you race."
      : "Sign for a team that will have you, hit what they ask of you, and earn a "
        + "better seat. You are paid; the car is somebody else's."));
    for (const s of Career.slots(flavour)) pane.appendChild(slotCard(s));

    const guide = el("button", "cr-card cr-record");
    guide.id = my ? "cr-guide-myteam" : "cr-guide-driver";
    guide.append(
      el("span", "cr-record-line", my
        ? "Money, the hire, the car you build"
        : "Contracts, money, upgrades and the climb"),
      el("span", "cr-record-cta", my ? "HOW MY TEAM WORKS" : "HOW CAREER WORKS"));
    guide.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); openGuide(flavour); };
    pane.appendChild(guide);
  }

  function buildSlotPanes() {
    const left = $("cr-left"), right = $("cr-right");
    left.textContent = ""; right.textContent = "";
    $("cr-title").textContent = "CAREER MODES";
    const used = Career.slots().filter((x) => x.used).length;
    $("cr-sub").textContent = used
      ? used + (used === 1 ? " career saved" : " careers saved")
      : "Two ways to play a championship";
    $("cr-sub").style.color = "";
    $("cr-meters").textContent = "";

    modeColumn(left, "driver");
    modeColumn(right, "myteam");

    $("cr-go").hidden = true;
    $("cr-go").disabled = false;
    $("cr-garage").hidden = true;
  }

  // TWO documents, not one with caveats. A driver career and MY TEAM share a
  // core but are different games — you are paid or you pay, you are hired or you
  // hire — and a guide that hedged between them would describe neither.
  //
  // Every figure below is READ FROM THE RULES (Career.PRIZE, RESEARCH_MULT,
  // BUDGET_MULT, OBJ_BONUS, Career.SLOTS, the free-agent asks), never typed out.
  // A guide that quotes the economy is a guide that goes stale the first time
  // the economy is tuned, and a wrong number here is worse than no number.
  function guideSection(title, paras) {
    const frag = document.createDocumentFragment();
    frag.appendChild(head(title, "cg-" + slug(title)));
    const card = el("div", "cr-card cg-card");
    for (const p of paras) {
      if (Array.isArray(p)) card.appendChild(row(p[0], p[1]));
      else card.appendChild(el("p", "cg-p", p));
    }
    frag.appendChild(card);
    return frag;
  }

  const cr = (n) => n.toLocaleString() + " cr";

  function sharedSections(my) {
    const out = [];
    out.push(guideSection("QUALIFYING", [
      "Every championship round qualifies before it races, and the sheet IS the "
      + "grid — there is no fixed starting slot to climb from.",
      "DRIVE MY LAP gives you one out-lap and one flying lap, alone on track, "
      + "with nothing to overtake and nothing to avoid. SIMULATE takes the time "
      + "the model gives you and goes straight to the grid.",
      "The rest of the field is not driven, it is modelled — the same grip, "
      + "acceleration and braking your own car obeys, over the same corners. So a "
      + "lap you drive and a lap they are given are on one scale, and a good lap "
      + "genuinely gains you places.",
      "A driver who is not consistent is not slower on average — they are less "
      + "likely to put the whole lap together on the one run that counts.",
    ]));
    out.push(guideSection("THE GRID YOU RACE", [
      "The twenty-one other drivers are not interchangeable. Each has five "
      + "ratings — " + DriverRatings.AXES.join(", ") + " — and they decide who is "
      + "quick, who defends well, who keeps it clean, and who is repeatable.",
      "CONSISTENCY is a spread, not a speed. A rookie is not slower than a "
      + "veteran of the same pace, just harder to predict.",
      "The CAR still matters more than the driver, as it does in the sport. But "
      + "the gap between the best and worst driver is real enough that a good one "
      + "in a midfield car can beat a poor one in a better car.",
      "Ratings drift over a career. Young drivers improve, veterans slip, and a "
      + "season that beat what the car deserved counts for more than a title in "
      + "the best car on the grid.",
    ]));
    out.push(guideSection("POINTS AND THE SEASON", [
      ["Rounds in a season", String(Tracks.SEASON.length)],
      ["Points, P1 down to P" + Teams.POINTS.length, Teams.POINTS.join(" · ")],
      "Two championships run at once: the DRIVERS', which is you, and the "
      + "CONSTRUCTORS', which is both of your team's cars added together.",
      "When the calendar runs out the year is closed off, the grid develops over "
      + "the winter, and the next season opens. Everything you own and everything "
      + "you have earned carries over — that is the long arc.",
    ]));
    out.push(guideSection("RELIABILITY", [
      "A race setting, and it ships OFF. Turn it on and cars stop — "
      + (Reliability.REASONS.filter((r, i, a2) => a2.indexOf(r) === i)
          .map((r) => (/^[aeiou]/i.test(r) ? "an " : "a ") + r).join(", ")) + ".",
      ["Risk per race, best car to worst",
        Math.round(Reliability.TIER_RISK[0] * 100) + "% – "
        + Math.round(Reliability.TIER_RISK[Reliability.TIER_RISK.length - 1] * 100) + "%"],
      ["LOW", "half those odds"],
      "Two things buy the risk down: developing the team, and what you have spent "
      + "on the ENGINE and GEARBOX. So money buys finishes as well as lap time.",
      "A retirement is classified below every car that finished and scores "
      + "nothing. It also fails a CLEAN RACE brief — a car in the barriers on lap "
      + "two has not completed anything.",
      "Whether a car stops is decided at the green light, not while you drive, so "
      + "it is never a reaction to how your race is going.",
    ]));
    out.push(guideSection("RACE SETTINGS", [
      "Reachable on the way to every weekend. Race length, weather, time of day, "
      + "AI difficulty (" + Object.keys(PhysicsConsts.DIFF).join(" / ") + ") and "
      + "reliability.",
      "They change the weekend, never the economy: prize money is paid on where "
      + "you finished, whatever length or weather you chose to finish in.",
    ]));
    return out;
  }

  function driverGuide() {
    const out = [];
    out.push(guideSection("THE IDEA", [
      "You are a driver, not a team. You sign for whoever will have you — which "
      + "at the start is the back half of the grid — and the whole mode is the "
      + "climb out of it.",
      "Every round pays, and every round is scored against what your CAR should "
      + "have managed. Beating a bad one counts for more than cruising in a good "
      + "one.",
    ]));
    out.push(guideSection("A WEEKEND", [
      "The calendar decides where you race, so there is no track to pick — press "
      + "GO RACING and the weekend starts.",
      "QUALIFYING comes first. Drive the flying lap yourself, or take the "
      + "simulated time and go straight to the grid. Either way the sheet IS the "
      + "grid: no more starting twelfth every time.",
      "Then the race. Afterwards the results screen shows exactly what the round "
      + "paid — every figure, and the balance it leaves you on.",
    ]));
    out.push(guideSection("MONEY", [
      "Credits are the same units the garage prices parts in, so a result "
      + "converts straight into most of a new front wing.",
      ["Win a race", cr(Career.PRIZE[0])],
      ["Podium", cr(Career.PRIZE[2]) + " – " + cr(Career.PRIZE[1])],
      ["Last place", cr(Career.prizeFor(22))],
      ["Meet the round's brief", "+" + cr(Career.OBJ_BONUS)],
      ["Salary, per round", "your contract"],
      "Finishing last still pays. A career that can go bankrupt in one bad "
      + "weekend stops being worth playing.",
      "A worse car pays you MORE to sign it. That is the mechanism that stops a "
      + "first season being unwinnable: the seat you can actually get is also the "
      + "one that funds your first upgrades.",
    ]));
    out.push(guideSection("UPGRADING THE CAR", [
      "The garage is the R&D tree. Every part you do not own yet shows a RESEARCH "
      + "price; buy it once and it is yours for good, free to fit and unfit from "
      + "then on.",
      ["Research costs", Career.RESEARCH_MULT + "x the part's price"],
      ["You may FIT", "your team's own works car, at level 0"],
      ["Cap upgrades", "three, from the hub"],
      "Two limits, on purpose. Your BALANCE is what you can spend; the FITTED CAP "
      + "is what you may run at once. You will own more than you can fit, so "
      + "every weekend is a choice about which car to bring. RAISE THE CAP three "
      + "times to widen that choice — it is the only way a fully researched "
      + "garage turns into lap time.",
    ]));
    out.push(guideSection("THE FACTORY", [
      "The one upgrade that never runs out. Each level permanently cuts what "
      + "every future part costs to research, so money still buys progress long "
      + "after you own the parts you actually wanted.",
      ["Levels", String(Career.FACILITY_MAX)],
      ["At the top", "−" + Math.round(Career.FACILITY_DISCOUNT_MAX * 100) + "% on all research"],
    ]));
    out.push(guideSection("YOUR SEAT AND YOUR TEAM-MATE", [
      "You replace one of your team's two real drivers. The other one stays, and "
      + "they are the benchmark the whole mode measures you against — most race "
      + "briefs are about beating them, and a contract is easier to earn from the "
      + "seat that is beating the one next to it.",
      "The LEAD seat and the SECOND seat are the same car. What differs is who "
      + "you are being compared with.",
      "You can change teams at the end of a season, never during one. A contract "
      + "is a contract.",
    ]));
    out.push(guideSection("THE BRIEF", [
      "One objective a round — finish above a position, beat your team-mate, "
      + "out-qualify them, score points, or keep it clean. It pays, and it moves "
      + "your reputation either way.",
      "The brief is fixed for the round. It cannot be rerolled by leaving and "
      + "coming back.",
    ]));
    out.push(guideSection("REPUTATION AND CONTRACTS", [
      "Reputation is what the paddock thinks. It rises when you beat what the car "
      + "should have done and when you hit your briefs, and it falls when you do "
      + "not.",
      "WHO WOULD SIGN YOU on the hub is the ladder: every tier of team, and what "
      + "each of them wants to see before they will talk to you. Clear a bar and "
      + "that tier makes an offer at the end of the year.",
      "MOVING re-seeds your garage from the new team's car: you do not take your "
      + "parts with you. RENEWING keeps everything you built. Loyalty is not "
      + "punished.",
    ]));
    out.push(guideSection("THE WINTER", [
      "Drivers develop. Young ones get quicker, veterans slip, and a season that "
      + "beat the car counts for more than a title in the best one.",
      "Teams move too — the order you learned last year will not be this year's. "
      + "A team that gets ahead does not stay ahead for free.",
      "A seat or two changes hands, and the end-of-season sheet tells you which. "
      + "Enough that the grid feels alive; few enough that it is still the grid "
      + "you know.",
    ]));
    return out.concat(sharedSections(false));
  }

  function myTeamGuide() {
    const asks = Career.freeAgents().map((a) => a.ask);
    const lo = Math.min(...asks), hi = Math.max(...asks);
    const pays = Career.SPONSOR_KINDS.map((k) => k.pay);
    const out = [];
    out.push(guideSection("THE IDEA", [
      "You own the twelfth team, and you drive one of its two cars. The other "
      + "seat is a driver you hire and pay.",
      "So there are two championships in play at once: yours, and the "
      + "constructors' — which your team-mate scores in as well as you.",
    ]));
    out.push(guideSection("A WEEKEND", [
      "The same as any other: qualifying, then the race. Your team-mate qualifies "
      + "and races alongside you, and their result is yours too.",
      "Afterwards the results screen breaks down exactly what the round paid — "
      + "prize money for both cars, your sponsor, and the wages going out.",
    ]));
    out.push(guideSection("MONEY", [
      "You start with more than a driver does, and it has to go further: the car "
      + "is yours to build and the wage bill is yours to pay.",
      ["Starting balance", cr(Career.START_MONEY.myteam)],
      ["Win a race", cr(Career.PRIZE[0])],
      ["Meet the round's brief", "+" + cr(Career.OBJ_BONUS)],
      ["Your driver's wage, per round", cr(lo) + " – " + cr(hi)],
      "Prize money counts every finish, not just yours — two cars in the points "
      + "is two payments.",
    ]));
    out.push(guideSection("SPONSORS", [
      "A driver is paid a salary. An owner is paid by sponsors, and that is the "
      + "income the two modes do not share.",
      "A sponsor is a brief over SEVERAL rounds rather than one — score this many "
      + "points across five weekends, get both cars home in the points, keep the "
      + "season clean. The round brief asks how a weekend went; a sponsor asks "
      + "how the season is going, which is what a team principal is judged on.",
      ["Each deal pays", cr(Math.min(...pays)) + " – " + cr(Math.max(...pays))],
      "One lucky weekend cannot pay a sponsor and one bad one does not sink it. "
      + "The hub shows the deal you are on and how far through it you are.",
    ]));
    out.push(guideSection("THE DRIVER YOU HIRE", [
      "This is the choice the mode is built on. A quick driver scores "
      + "constructors' points you keep and pushes you every weekend; a cheap one "
      + "leaves you the money to build a better car.",
      ["Cheapest on the market", cr(lo) + " a round"],
      ["Dearest", cr(hi) + " a round"],
      "The wage comes off your BALANCE, never off the cap on what you may fit. "
      + "So hiring well costs you upgrades — not legality.",
    ]));
    out.push(guideSection("THEIR CONTRACT RUNS OUT", [
      "At the end of a season your driver's deal expires and they tell you what "
      + "they want for the next one. A season that beat the car costs you more; a "
      + "season that did not costs you less.",
      "Take it, or let them go and sign somebody else from the market — the seat "
      + "is yours either way.",
      "And occasionally you lose them. A driver who was genuinely quicker than "
      + "your car deserved gets looked at by the rest of the grid, and sometimes "
      + "simply goes. That only ever happens to a driver who OUTPERFORMED.",
      "The season cannot start with an empty car, so this is settled before you "
      + "go racing.",
    ]));
    out.push(guideSection("BUILDING THE CAR", [
      "You start with a startup team's car, not a works one: slower than the "
      + "grid, and entirely yours to fix.",
      ["Research costs", Career.RESEARCH_MULT + "x the part's price"],
      ["Your fitted cap", "your team's own works car, at level 0"],
      ["Cap upgrades", "three, from the hub"],
      "Buy a part once and it is yours for good. You will own more than you can "
      + "fit at one time, which is the point: the car you bring to a circuit is a "
      + "decision, not an inventory. RAISE THE CAP three times to widen it.",
      "Both cars run your build.",
    ]));
    out.push(guideSection("THE FACTORY", [
      "The one upgrade that never runs out. Each level permanently cuts what "
      + "every future part costs to research, so a well-run team keeps converting "
      + "money into progress long after the obvious parts are bought.",
      ["Levels", String(Career.FACILITY_MAX)],
      ["At the top", "−" + Math.round(Career.FACILITY_DISCOUNT_MAX * 100) + "% on all research"],
    ]));
    out.push(guideSection("DEVELOPING THE TEAM", [
      "The team itself has a level, separate from the car you bolt together. It "
      + "moves with results across a whole season, not with one weekend.",
      "A team that finishes above what its car should manage climbs; one that "
      + "finishes below slides back. Half of whatever you have gained evaporates "
      + "every winter, so nothing you build stays built for free.",
      "Team development is also what buys down your retirement risk once "
      + "RELIABILITY is on — a better-run team stops breaking.",
      "THE CAR card on the hub shows where you stand.",
    ]));
    out.push(guideSection("NOBODY CAN SIGN YOU", [
      "You own the constructor, so no team offers you a seat and no contract runs "
      + "out from under you. The only way out is to start a different career.",
      "What does change is the team itself: develop it and it climbs, neglect it "
      + "and it slides back toward where it started.",
    ]));
    return out.concat(sharedSections(true));
  }

  function buildGuide(flavour) {
    const body = $("cg-body");
    body.textContent = "";
    const my = flavour === "myteam";
    $("cg-title").textContent = my ? "HOW MY TEAM WORKS" : "HOW CAREER WORKS";
    for (const part of (my ? myTeamGuide() : driverGuide())) body.appendChild(part);
    // The two shared rules, said once at the foot of both.
    body.appendChild(guideSection("GOOD TO KNOW", [
      ["Save slots", Career.SLOTS + " for this mode, " + (Career.SLOTS * Career.FLAVOURS.length) + " in all"],
      ["Progress saves", "after every round"],
      "The two modes keep SEPARATE slots, so a driver career and a team can run "
      + "side by side and neither costs the other room.",
      "RELIABILITY is a race setting, and it ships off. Turn it on and cars retire "
      + "— an engine, a gearbox, an accident. Developing the team and spending on "
      + "the engine and gearbox both buy the risk down, so money buys finishes as "
      + "well as lap time.",
      "EXTRA FUNDS on the hub is a deliberate cheat, off unless you turn it on. It "
      + "stops money being the constraint — but it does NOT raise the cap on what "
      + "you may fit, so the car is still a choice.",
      "Your career car and your free-play car are separate builds. Nothing you do "
      + "here changes a Grand Prix or a Time Trial, and nothing there changes this.",
    ]));
    fillContents("cg-contents", body);
    ScrollFade.refresh();
  }
  function openGuide(flavour) {
    const c = Career.data();
    buildGuide(flavour || (c ? c.flavour : "driver"));
    $("career-guide").hidden = false;
  }
  function closeGuide() { $("career-guide").hidden = true; }

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
        // The slot belongs to the MODE's set, so changing mode here has to move
        // the target with it — slot 3 of the driver set is not slot 3 of MY TEAM.
        // When the set is FULL (-1) do NOT touch the slot pointer: useSlot(id, 0)
        // here loaded slot 0's EXISTING save, so Career.active() went true and
        // START CAREER silently continued someone's old career instead of the
        // one being configured. Career.start() then REFUSES a full set it was
        // given no slot for, and cr-go opens the picker — it does not pick.
        const free = Career.firstFree(id);
        if (free >= 0) { draft.slot = free; Career.useSlot(id, free); }
        else delete draft.slot;
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
            t.engine + " · CAR " + car + " · " + Career.salaryFor(t, 30) + " cr / round"));
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

    right.appendChild(head("BEFORE YOU START"));
    const learn = el("button", "cr-card cr-record");
    learn.id = "cr-learn";
    learn.append(
      el("span", "cr-record-line", draft.flavour === "myteam"
        ? "What owning a team involves"
        : "What a driver career involves"),
      el("span", "cr-record-cta", draft.flavour === "myteam" ? "HOW MY TEAM WORKS" : "HOW CAREER WORKS"));
    learn.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); openGuide(draft.flavour); };
    right.appendChild(learn);

    $("cr-title").textContent = "NEW CAREER";
    $("cr-sub").textContent = "";
    $("cr-meters").textContent = "";
    $("cr-go").textContent = "START CAREER";
    $("cr-go").hidden = false;
    $("cr-go").disabled = false;
    $("cr-garage").hidden = true;
  }

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

    if (Career.conflicted()) {
      const warn = el("div", "cr-card");
      warn.appendChild(el("div", "cr-obj-line", "SAVE CONFLICT"));
      warn.appendChild(el("p", "cr-note",
        "Another tab wrote this career. Garage and R&D will not save here until you reload."));
      left.appendChild(warn);
    }

    const meters = $("cr-meters");
    meters.textContent = "";
    meters.append(
      meter("BALANCE", Career.freeMoney() ? "UNLIMITED" : st.money.toLocaleString() + " cr"),
      meter("REPUTATION", Math.round(st.rep) + " / 100"),
      meter("ROUND", (Math.min(st.round + 1, st.rounds)) + " / " + st.rounds));

    // NEXT RACE lives on the LEFT. The foot is under this column, so the
    // UPCOMING list has to stay on the right or GO RACING clips it — but the
    // one card you act on this visit belongs with the brief, not under the
    // championship table. Hire / offers / season-done have no next round.
    const midSeason = !st.hire && !st.offers && !Career.seasonDone();
    if (midSeason) {
      left.appendChild(head("NEXT RACE"));
      const t = Tracks.SEASON[c.season.round];
      const nr = el("div", "cr-card cr-nextrace");
      nr.id = "cr-nextrace";
      nr.append(
        el("div", "cr-nr-round", "ROUND " + (c.season.round + 1)),
        el("div", "cr-nr-name", t ? t.name : "—"),
        el("div", "cr-nr-country", t && t.country ? t.country : ""));
      left.appendChild(nr);
    }

    if (!Career.seasonDone()) {
      const obj = Career.objective();
      left.appendChild(head("THIS ROUND"));
      const objCard = el("div", "cr-card cr-objective");
      objCard.append(el("div", "cr-obj-line", Career.objectiveLabel(obj)));
      if (c.deal) objCard.append(row("Season goal", "P" + c.deal.goal.value + " in the championship"));
      objCard.append(row("If you hit it", "+" + Career.OBJ_BONUS + " cr · +" + Career.OBJ_REP + " REP"));
      left.appendChild(objCard);
    }

    if (st.sponsor) {
      const sp = st.sponsor;
      left.appendChild(head("SPONSOR"));
      const card = el("div", "cr-card");
      card.appendChild(el("div", "cr-obj-line", sp.label));
      card.appendChild(row("Progress", sp.done + " / " + sp.need
        + (sp.met ? "  ·  MET" : "")));
      card.appendChild(row("Rounds left", sp.roundsLeft === 0 ? "this one" : String(sp.roundsLeft)));
      card.appendChild(row("Pays", sp.pay.toLocaleString() + " cr"));
      left.appendChild(card);
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
      row("Fitted", fittedCost.toLocaleString() + " / " + Career.budget().toLocaleString() + " cr"),
      row("Development", devLabel(c.tdev[c.team] || 0)),
      // The facility is the one upgrade that never runs out, so it belongs with
      // the car rather than in the economy: it is what late money buys.
      row("Facility", st.facility + " / " + Career.FACILITY_MAX
        + (st.facilityDiscount ? "  (−" + Math.round(st.facilityDiscount * 100) + "% research)" : "")),
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

    const used = Career.slots().filter((s) => s.used).length;
    const slotBtn = el("button", "cr-card cr-record");
    slotBtn.id = "cr-slots";
    slotBtn.append(
      el("span", "cr-record-line",
        (c.flavour === "myteam" ? "MY TEAM" : "Driver career") + " · slot "
        + (Career.slot().i + 1) + " of " + Career.SLOTS
        + " · " + used + (used === 1 ? " career saved" : " careers saved")),
      el("span", "cr-record-cta", "CAREER MODES"));
    slotBtn.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); openSlots(); };
    left.appendChild(slotBtn);

    // A disabled door says WHY. Both upgrade cards used to grey out with no
    // reason on the card — the balance is a header away, and a title alone
    // never shows on touch — so the shortfall rides on the affordance line
    // (.cr-record-cta wraps; it carries no nowrap, so it cannot truncate).
    const shortBy = (cost) => (Career.freeMoney() ? 0 : Math.max(0, cost - st.money));
    const shortNote = (n) => (n > 0 ? "  ·  SHORT " + n.toLocaleString() + " cr" : "");
    if (st.facilityCost != null) {
      const fac = el("button", "cr-card cr-record");
      fac.id = "cr-facility";
      const fShort = shortBy(st.facilityCost);
      fac.disabled = fShort > 0;
      if (fShort > 0) fac.title = "Needs " + fShort.toLocaleString() + " cr more than you have";
      fac.append(
        el("span", "cr-record-line", "Upgrade the factory · " + st.facilityCost.toLocaleString() + " cr"),
        el("span", "cr-record-cta", "LEVEL " + st.facility + " → " + (st.facility + 1)
          + "  ·  −" + Math.round((st.facilityDiscount + 0.05) * 100) + "% RESEARCH" + shortNote(fShort)));
      fac.onclick = () => {
        if (!Career.upgradeFacility()) return;
        if (G.soundOn) GameAudio.uiSelect();
        build();
      };
      left.appendChild(fac);
    }

    if (st.budgetCost != null) {
      const cap = el("button", "cr-card cr-record");
      cap.id = "cr-budget";
      const bShort = shortBy(st.budgetCost);
      cap.disabled = bShort > 0;
      if (bShort > 0) cap.title = "Needs " + bShort.toLocaleString() + " cr more than you have";
      cap.append(
        el("span", "cr-record-line", "Raise the fitted cap · " + st.budgetCost.toLocaleString() + " cr"),
        el("span", "cr-record-cta", "LEVEL " + st.budgetLvl + " → " + (st.budgetLvl + 1)
          + "  ·  CAP " + st.budget.toLocaleString() + " cr" + shortNote(bShort)));
      cap.onclick = () => {
        if (!Career.upgradeBudget()) return;
        if (G.soundOn) GameAudio.uiSelect();
        build();
      };
      left.appendChild(cap);
    }

    // EXTRA FUNDS is a practice cheat, not a season decision — native
    // <details> keeps #cr-grant / #cr-freemoney in the tree (career.spec
    // clicks them) without another always-open card on the left. The
    // summary reuses .sel-label so it reads as the same heading it replaced.
    const funds = el("details", "cr-card");
    funds.id = "cr-funds";
    funds.appendChild(el("summary", "sel-label", "EXTRA FUNDS"));
    const unlimited = Career.freeMoney();
    funds.appendChild(el("div", "cg-p",
      "Off by default. Money stops being the constraint; the cap on what you may "
      + "fit at once does not move, so the car is still a choice."));
    const cheatRow = el("div", "cr-cheats");
    const grantBtn = el("button", "sel-chip", "+" + Career.GRANT.toLocaleString() + " CR");
    grantBtn.id = "cr-grant";
    grantBtn.onclick = () => {
      Career.grant(Career.GRANT);
      if (G.soundOn) GameAudio.uiSelect();
      build();
    };
    const freeBtn = el("button", "sel-chip" + (unlimited ? " active" : ""),
      unlimited ? "UNLIMITED · ON" : "UNLIMITED · OFF");
    freeBtn.id = "cr-freemoney";
    freeBtn.setAttribute("aria-pressed", unlimited ? "true" : "false");
    freeBtn.onclick = () => {
      Career.freeMoney(!Career.freeMoney());
      if (G.soundOn) GameAudio.uiTick();
      build();
    };
    cheatRow.append(grantBtn, freeBtn);
    funds.appendChild(cheatRow);
    left.appendChild(funds);

    const guideBtn = el("button", "cr-card cr-record");
    guideBtn.id = "cr-guide";
    guideBtn.append(
      el("span", "cr-record-line", c.flavour === "myteam"
        ? "Running a team: money, the hire, the car"
        : "Contracts, money, upgrades and the climb"),
      el("span", "cr-record-cta", c.flavour === "myteam" ? "HOW MY TEAM WORKS" : "HOW CAREER WORKS"));
    guideBtn.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); openGuide(c.flavour); };
    left.appendChild(guideBtn);

    if (st.hire) {
      const h = st.hire;
      right.appendChild(head(h.kind === "left" ? "YOUR DRIVER HAS GONE" : "YOUR DRIVER IS OUT OF CONTRACT"));
      right.appendChild(el("div", "cr-note", h.kind === "left"
        ? h.name + " had a season good enough that somebody else came for them. "
          + "The seat is empty — the market is below."
        : h.name + " will re-sign for " + h.ask.toLocaleString() + " cr a round"
          + (h.ask > h.salary ? ", up from " + h.salary.toLocaleString()
            : h.ask < h.salary ? ", down from " + h.salary.toLocaleString() : "")
          + ". Take it, or let them go and sign somebody else."));

      if (h.kind === "renew") {
        const keep = el("button", "cr-card cr-record");
        keep.id = "cr-rehire";
        keep.append(
          el("span", "cr-record-line", "Keep " + h.name + " · " + h.ask.toLocaleString() + " cr / round"),
          el("span", "cr-record-cta", "RE-SIGN"));
        keep.onclick = () => {
          Career.renewHire(1);
          if (G.soundOn) GameAudio.uiSelect();
          build();
        };
        right.appendChild(keep);
      }

      right.appendChild(head(h.kind === "left" ? "THE MARKET" : "OR SIGN SOMEBODY ELSE"));
      const seats = el("div", "cr-seats");
      for (const a2 of Career.freeAgents()) {
        if (a2.code === h.code && h.kind === "renew") continue;   // they are the offer above
        const b2 = el("button", "cr-seat");
        b2.append(el("span", "cr-seat-role", a2.name),
          el("span", "cr-seat-who", a2.ask.toLocaleString() + " cr / round"));
        b2.onclick = () => {
          Career.hireDriver(a2.code, 1);
          if (G.soundOn) GameAudio.uiSelect();
          build();
        };
        seats.appendChild(b2);
      }
      right.appendChild(seats);
    } else if (st.offers) {
      right.appendChild(head("A SEAT TO SIGN"));
      right.appendChild(el("div", "cr-note", "The " + c.year + " season cannot start until you " +
        "have somewhere to drive it. " + st.offers + (st.offers === 1 ? " offer is" : " offers are") +
        " on the table."));
    } else if (Career.seasonDone()) {
      right.appendChild(head("SEASON COMPLETE"));
      right.appendChild(el("div", "cr-note", "All " + st.rounds + " rounds are done. " +
        "Close out the year to see where you finished."));
    } else {
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

    // Market ladder sits with the championship, not under the car — it is
    // "who talks to you this winter", not a left-column economy card.
    if (c.flavour !== "myteam") {
      right.appendChild(head("WHO WOULD SIGN YOU"));
      const mv = Math.round(Career.marketValue(Career.driverStandings()));
      const ladder = el("div", "cr-card");
      ladder.id = "cr-ladder";
      ladder.appendChild(row("Your market value", mv + " / 100"));
      // One row per tier, best first, so the climb reads top-down.
      const TIERS = [[0, "Front runners"], [1, "Title contenders"],
                     [2, "Upper midfield"], [3, "Midfield"], [4, "The back"]];
      for (const [tier, label] of TIERS) {
        const bar = Career.offerBar(tier);
        const openSeat = mv >= bar;
        const r = el("div", "cr-ladder" + (openSeat ? " open" : ""));
        const names = Teams.LIST.filter((t) => !t.custom && t.tier === tier)
          .map((t) => t.short || t.name).join(" · ");
        r.append(
          el("span", "cr-ladder-k", label),
          el("span", "cr-ladder-teams", names),
          el("span", "cr-ladder-v", openSeat ? "OPEN" : "needs " + bar));
        ladder.appendChild(r);
      }
      right.appendChild(ladder);
    }

    $("cr-go").textContent = st.hire ? "SIGN A DRIVER"
      : st.offers ? "SIGN A CONTRACT"
      : Career.seasonDone() ? "END OF SEASON" : "GO RACING";
    $("cr-go").hidden = false;
    // An empty second seat blocks the weekend outright — there is nothing for GO
    // RACING to do until the car has a driver in it.
    //
    // ORDER MATTERS, and getting it wrong cost nothing visible: this used to sit
    // ABOVE the `disabled = false` that restores the button after the picker
    // hides it, so the reset overwrote the rule on the very next line and the
    // seat never blocked anything. The rule was right, the button just never
    // heard about it. Set the reset first and let the rule have the last word.
    $("cr-go").disabled = !!st.hire || Career.conflicted();
    $("cr-garage").hidden = false;
  }

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

    if (c.goalResult) {
      body.appendChild(head("YOUR CONTRACT"));
      const g = el("div", "cr-card");
      g.appendChild(row("The team asked for", "P" + c.goalResult.value + " or better"));
      g.appendChild(row("You finished", "P" + c.goalResult.pos));
      g.appendChild(el("div", "cg-p", c.goalResult.met
        ? "Target met. Your reputation is up, and the paddock noticed."
        : "Target missed. Your reputation is down, and the seats that will talk "
          + "to you this winter sit further down the grid."));
      body.appendChild(g);
    }

    const moves = c.moves || [];
    if (moves.length) {
      body.appendChild(head("THE DRIVER MARKET"));
      const mv = el("div", "cr-card");
      for (const m of moves)
        mv.appendChild(row(m.name, m.fromName + " → " + m.toName));
      mv.appendChild(el("div", "cg-p", moves.length === 1
        ? "One seat changed hands over the winter."
        : moves.length + " seats changed hands over the winter."));
      body.appendChild(mv);
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
        G.openCareer();
      };
      body.appendChild(b);
    });
    ScrollFade.refresh();
  }

  function openOffers() { Log.info("ui", "CareerUI.openOffers"); buildOffers(); $("career-offers").hidden = false; }
  function closeOffers() { Log.info("ui", "CareerUI.closeOffers"); $("career-offers").hidden = true; }

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

    body.appendChild(head("CAREER TOTALS", "ch-totals"));
    const card = el("div", "cr-card");
    card.append(
      row("Seasons", t.seasons + " · " + c.year + " in progress"),
      row("Race starts", String(t.starts)),
      row("Wins", String(t.wins)),
      row("Podiums", String(t.podiums)),
      row("Points", t.points + " pts"),
      row("Championships", t.titles + " drivers' · " + t.cTitles + " constructors'"),
      row("Best championship", t.best ? "P" + t.best + " in " + t.bestYear : "no season finished yet"),
      row("Teams driven for", t.teams.map(teamName).join(", ")));
    body.appendChild(card);

    body.appendChild(head("SEASON BY SEASON", "ch-seasons"));
    if (!c.history.length) {
      body.appendChild(el("div", "cr-note",
        c.year + " is your first season and it is still running — there is nothing "
        + "archived yet. Finish the calendar and close the year out, and it lands here."));
    } else {
      if (c.history.length >= Career.HISTORY_MAX)
        body.appendChild(el("div", "cr-note",
          "This is localStorage, so the archive keeps the last " + Career.HISTORY_MAX +
          " seasons — anything older has rolled off."));
      // Newest first: the year you just closed out is the one you came to read.
      for (const h of c.history.slice().reverse()) {
        const team = Teams.LIST.find((x) => x.id === h.team);
        const r = el("div", "res-row" + (h.pos >= 1 && h.pos <= 3 ? " p" + h.pos : ""));
        const sw = el("span", "res-swatch");
        sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
        r.append(el("span", "res-pos", "P" + h.pos), sw,
          el("span", "res-name", h.year + " · " + teamName(h.team)),
          el("span", "res-pts", h.pts + " pts"));
        body.appendChild(r);
      }
    }
    fillContents("ch-contents", body);
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

  function build() {
    if (picking) { draft = null; buildSlotPanes(); }
    else if (Career.active()) { draft = null; buildHubPanes(); }
    else if (draft) buildSetupPanes();
    else buildSlotPanes();
    // The foot button must say where it GOES: from the slot picker over an
    // active career it returns to the HUB, and a button labelled MAIN MENU
    // that lands you back in the career was the one lying label in the app.
    const back = $("cr-back");
    if (back) back.textContent = (picking && Career.active()) ? "BACK" : "MAIN MENU";
    ScrollFade.refresh();
  }

  function openHub() {
    Log.info("ui", "CareerUI.openHub");
    picking = false;
    armedDelete = "";
    build();
    $("career").hidden = false;
  }
  function openSlots() {
    Log.info("ui", "CareerUI.openSlots");
    picking = true;
    armedDelete = "";
    build();
    $("career").hidden = false;
  }
  // close() is the one exit every path shares, so it is where the screen's
  // TRANSIENT state dies: the NEW CAREER draft, the slot it was borrowed from,
  // and an armed DELETE?. draftFrom was already restored at the MAIN MENU
  // button (2026-09-01); its siblings were not — a draft abandoned there came
  // back as NEW CAREER on the next openHub() with no career live, and an armed
  // DELETE? came back armed, one tap from deleting a save with no warning
  // (the hazard #ss-apply's disarm comment in season-ui.js describes).
  function close() {
    Log.info("ui", "CareerUI.close");
    $("career").hidden = true;
    draft = null; draftFrom = null; armedDelete = "";
  }

  $("cr-back").onclick = () => {
    if (picking && Career.active()) { picking = false; armedDelete = ""; build(); return; }
    if (draft && draftFrom && !Career.active()) { Career.useSlot(draftFrom.flavour, draftFrom.i); draftFrom = null; }
    // (build() retitles this button per state — see buildSlotPanes/buildHubPanes.)
    close();
    els.overlay.hidden = false;
    G.flow = "gp"; G.session = "race";
    G.season = G.store.get("season", null);
    G.refreshCareerButton();
    { const mb = $("mb-standings"); if (mb) mb.hidden = !(SeasonCal.hasProgress(G.season) && G.season && G.season.round < SeasonCal.rounds()); }
    if (G.soundOn) GameAudio.uiSelect();
  };
  $("cr-garage").onclick = () => { close(); G.openGarage("career"); };
  $("cr-go").onclick = () => {
    if (G.soundOn) GameAudio.uiSelect();
    // The picker comes first: a career is normally LOADED while it is open (you
    // are choosing another one), so the "no career yet" branch below would never
    // be reached and NEW CAREER would silently go racing instead.
    if (!Career.active()) {
      // start() REFUSES (null) when the chosen mode's slots are all used and
      // no slot was named — it will not pick one to overwrite. Send the
      // player to the picker so the replacement is their call, and leave
      // draftFrom alone so BACK still works.
      if (!Career.start(draft)) { openSlots(); return; }   // draft.slot, when the picker set one
      draftFrom = null;             // committed: the new slot IS the live one now
      G.openCareer();          // re-enters the hub with the save in place
      return;
    }
    const c = Career.data();
    if (c.offers && c.offers.length) { openOffers(); return; }
    // AND RE-POINT THE CIRCUIT. rollover() resets season.round to 0 but nothing
    // here refreshes G.trackIdx, and the only two career writers of it are
    // openCareer() and the results screen's NEXT — neither of which runs on this
    // path. NEXT left trackIdx clamped to the LAST circuit while round was 24,
    // so round 1 of the new season loaded the previous season's finale while the
    // hub header read "ROUND 1 · <opener>". Points still bank as round 0, so the
    // standings were right and only the track was wrong, and round 2 onward
    // self-corrected — which is why it never looked like a bug worth chasing.
    // It bites every MY TEAM season (makeOffers returns [] for myteam) and any
    // driver season entered on a multi-year deal; a driver who must accept an
    // offer is rescued by acceptOffer's openCareer().
    if (Career.seasonDone()) { Career.rollover(); G.trackIdx = Career.trackIndex(); build(); openOffers(); return; }
    G.openRaceSettings("career");
  };
  $("co-back").onclick = () => {
    closeOffers();
    build();
    if (G.soundOn) GameAudio.uiSelect();
  };
  $("ch-back").onclick = () => {
    closeHistory();
    if (G.soundOn) GameAudio.uiSelect();
  };
  $("cg-back").onclick = () => {
    closeGuide();
    if (G.soundOn) GameAudio.uiSelect();
  };

  mountContentsNav("cg-body", "cg-contents", "Career guide sections");
  mountContentsNav("ch-body", "ch-contents", "Career history sections");

  return { build, openHub, openSlots, close, openOffers, closeOffers,
           openHistory, closeHistory, openGuide, closeGuide };
}

return { create, STARTER_TIER_MIN };
})();
