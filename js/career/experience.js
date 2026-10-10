/* Apex 26 — CareerExperience: race brief, real season story and management
 * navigation. Presentation only: reads the active career, never writes a save. */
const CareerExperience = (function () {
  "use strict";

  function part(tag, name) {
    const node = Dom.el(tag); node.setAttribute("data-career-part", name); return node;
  }

  // Cumulative, from c.tally: c.history is only the last HISTORY_MAX seasons.
  // A career without one (a hand-built object) sums what history it has.
  function totals(c) {
    const history = c && Array.isArray(c.history) ? c.history : [];
    const results = c && Array.isArray(c.results) ? c.results : [];
    const tally = c && c.tally && typeof c.tally === "object" ? c.tally : {
      seasons: history.length,
      wins: history.reduce((n, h) => n + (h.wins || 0), 0),
      podiums: history.reduce((n, h) => n + (h.podiums || 0), 0),
      titles: history.filter((h) => h.pos === 1).length,
      cTitles: history.filter((h) => h.cPos === 1).length,
    };
    return {
      wins: results.filter((r) => r.p === 1).length + tally.wins,
      podiums: results.filter((r) => r.p > 0 && r.p <= 3).length + tally.podiums,
      titles: tally.titles,
      teamTitles: tally.cTitles,
      seasons: tally.seasons + (c ? 1 : 0),
    };
  }

  function garageMetadata() {
    if (typeof Career === "undefined" || !Career.inCareer()) return { active: false };
    const c = Career.data(), st = Career.state();
    if (!c || !st) return { active: false };
    return Object.assign({ active: true, teamId: c.team, year: c.year,
      facility: st.facility, facilityMax: Career.FACILITY_MAX,
      discount: st.facilityDiscount, points: c.season.pts[c.team + ":" + c.seat] || 0,
    }, totals(c));
  }

  function calendar(c, tracks) {
    const results = new Map(((c && c.results) || []).map((r) => [r.r, r]));
    const round = c && c.season ? c.season.round : 0;
    return (tracks || []).map((t, i) => ({ track: t, round: i + 1,
      state: i < round ? "complete" : i === round ? "next" : "future",
      result: results.get(i) || null,
    }));
  }

  // The calendar the career STAMPED at its season start (Career.calendar), else the shipped one.
  function seasonCal() { return typeof Career !== "undefined" && Career.calendar ? Career.calendar() : Tracks.SEASON; }

  function raceBrief(G, c, st, team) {
    const el = Dom.el, t = seasonCal()[c.season.round];
    const card = el("section", "cr-card cr-nextrace");
    card.id = "cr-nextrace";
    if (!t) return card;
    if (team) card.style.setProperty("--career-team", G.cssCol(team.color));
    const image = el("img");
    image.src = "assets/stills/" + t.id + ".webp"; image.alt = "";
    image.loading = "lazy"; image.decoding = "async";
    image.onerror = () => { image.hidden = true; };
    card.appendChild(image);
    const body = el("div");
    body.append(el("div", "cr-nr-round", "ROUND " + (c.season.round + 1) + " OF " + st.rounds),
      el("h3", "cr-nr-name", t.name), el("p", "cr-nr-country", t.gp || t.country || ""));
    const facts = part("div", "facts");
    if (t.lengthKm) facts.appendChild(el("span", "", t.lengthKm + " km"));
    if (t.country) facts.appendChild(el("span", "", t.country));
    facts.appendChild(el("span", "", team ? team.name : c.team));
    body.appendChild(facts);
    const objective = st.obj;
    if (objective) {
      const brief = part("p", "objective");
      brief.append(el("strong", "", "Your next objective"), el("span", "", Career.objectiveLabel(objective)));
      body.appendChild(brief);
    }
    card.appendChild(body);
    return card;
  }

  function seasonStory(G, c, st, team) {
    const el = Dom.el, story = part("section", "story");
    story.setAttribute("aria-label", "Your season story");
    if (team) story.style.setProperty("--career-team", G.cssCol(team.color));
    story.appendChild(el("h3", "sel-label", c.year + " SEASON STORY"));
    const cal = seasonCal();
    const completed = Math.min(c.season.round, cal.length);
    story.appendChild(el("p", "cr-note", completed + " of " + cal.length + " rounds complete"));
    const rail = part("ol", "calendar");
    rail.setAttribute("aria-label", "Season calendar and results");
    for (const item of calendar(c, cal)) {
      const tile = el("li");
      tile.dataset.stage = item.state;
      if (item.state === "next") tile.setAttribute("aria-current", "step");
      tile.append(el("span", "", "R" + item.round), el("strong", "", item.track.name));
      const r = item.result;
      tile.appendChild(el("span", "", r ? (r.dnf ? "DNF" : "P" + r.p) + " · " + (r.pts || 0) + " pts"
        : item.state === "next" ? "NEXT RACE" : item.state === "complete" ? "Complete" : "Ahead"));
      rail.appendChild(tile);
    }
    story.appendChild(rail);
    const milestones = part("div", "milestones");
    if (c.deal) {
      const contract = el("div");
      contract.append(el("strong", "", "Contract"), el("span", "", Career.goalLabel(c.deal.goal)),
        el("small", "", c.deal.left + (c.deal.left === 1 ? " season remaining" : " seasons remaining")));
      milestones.appendChild(contract);
    }
    if (st.era) {
      const rules = el("div");
      const categories = st.era.cats.map((id) => {
        const cat = typeof Parts !== "undefined" ? Parts.CATALOG.find((p) => p.id === id) : null;
        return cat ? cat.label : id;
      });
      rules.append(el("strong", "", st.era.name), el("span", "", categories.length
        ? "Regulated: " + categories.join(", ") : "No restricted categories"),
        el("small", "", st.era.left + (st.era.left === 1 ? " season until the next regulations" : " seasons until the next regulations")));
      milestones.appendChild(rules);
    }
    story.appendChild(milestones);
    return story;
  }

  function clear(G) {
    const nav = G.$("cr-header").querySelector("[data-career-nav]");
    if (nav) nav.remove();
  }

  function mount(G, c, st, team) {
    const el = Dom.el, left = G.$("cr-left"), right = G.$("cr-right");
    right.insertBefore(seasonStory(G, c, st, team), right.firstChild);
    clear(G);
    const nav = part("nav", "nav");
    nav.setAttribute("data-career-nav", "");
    nav.setAttribute("aria-label", "Career management");
    const heading = (text) => [left, right].flatMap((p) => Array.from(p.querySelectorAll("h3")))
      .find((h) => h.textContent === text);
    const destinations = [
      ["Race brief", G.$("cr-nextrace") || heading("THIS ROUND")],
      ["Calendar", right.querySelector("[data-career-part=story]")],
      ["Development", heading("THE CAR")],
      ["Team & contract", heading(c.flavour === "myteam" ? "THE TEAM" : "CONTRACT")],
      ["Career record", heading("CAREER RECORD")],
    ];
    for (const [label, target] of destinations) {
      if (!target) continue;
      const button = el("button", "sel-chip", label);
      button.type = "button";
      button.onclick = () => {
        for (const sibling of nav.children) sibling.removeAttribute("aria-current");
        button.setAttribute("aria-current", "location");
        // The panes have independent scroll ownership. scrollIntoView resolves
        // the owning pane, works when stacked, and never steals keyboard focus.
        target.scrollIntoView({ block: "start", behavior: "instant" });
        if (typeof ScrollFade !== "undefined") ScrollFade.refresh();
      };
      nav.appendChild(button);
    }
    G.$("cr-header").appendChild(nav);
  }

  return { totals, calendar, garageMetadata, raceBrief, mount, clear };
})();
Object.freeze(CareerExperience);
