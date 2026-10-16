/* Apex 26 — ResultsStory: a short classification reveal from the SAME canonical
 * verdict and points rules as GameResults. No timers, save writes or guessed gaps. */
const ResultsStory = (function () {
  "use strict";

  function part(tag, name) {
    const node = Dom.el(tag); node.setAttribute("data-results-part", name); return node;
  }

  function summary(order, options) {
    const o = options || {}, out = o.dnfOf || ((c) => c.dsq ? "DSQ" : c.retired ? c.dnf || "DNF" : null);
    const points = o.points || [];
    const scored = (c, i) => c.classified !== false && (!out(c) || (c.classified && !c.dsq)) ? (points[i] || 0)
      + (!out(c) && o.fastestLap === c.driverId ? 1 : 0) : 0;
    const self = order.findIndex((c) => c.isPlayer);
    return { podium: order.slice(0, 3).filter((c) => !out(c) && c.classified !== false).map((c) => ({ car: c, pos: order.indexOf(c) + 1 })),
      player: self >= 0 ? { car: order[self], pos: self + 1,
        out: out(order[self]) || (order[self].classified === false ? "NC" : null), points: scored(order[self], self) } : null };
  }

  function render(G, order, options) {
    if (!order.length) return null;
    const el = Dom.el, o = options || {}, data = summary(order, o);
    const story = part("section", "story");
    story.setAttribute("aria-label", o.watched ? "Race classification" : G.practice ? "Practice session result" : "Your race story");
    const head = part("div", "head");
    if (G.practice && !o.watched) {
      head.appendChild(el("strong", "", "Practice complete"));
      const p = data.player;
      head.appendChild(el("span", "", "Unscored session" + (p ? " · " + (p.out || "P" + p.pos) : "")));
    } else if (data.player && !o.watched) {
      const p = data.player;
      head.append(el("strong", "", p.out ? "A tough finish" : p.pos === 1 ? "Race winner" : p.pos <= 3 ? "On the podium" : "Across the line"),
        el("span", "", p.out === "NC" ? "NC · 0 points" : p.out ? String(p.out) : "P" + p.pos + " · " + p.points + " points"));
      if (G.careerSettlement && G.careerSettlement.obj) head.appendChild(el("span", "", G.careerSettlement.obj.done
        ? "Round objective achieved" : "Round objective missed"));
    } else head.appendChild(el("strong", "", "At the chequered flag"));
    story.appendChild(head);
    // A duel is a benchmark; practice carries no scored podium.
    if (order.length >= 3 && !o.duel && !G.practice && data.podium.length) {
      const podium = part("ol", "podium");
      podium.setAttribute("aria-label", "Podium classification");
      for (const p of data.podium) {
        const car = p.car, tile = el("li");
        tile.style.setProperty("--podium-place", String(p.pos));
        if (car.team && car.team.color) tile.style.setProperty("--career-team", G.cssCol(car.team.color));
        tile.append(el("span", "", "P" + p.pos), el("strong", "", car.code || car.name),
          el("span", "", car.name || ""), el("small", "", car.team ? car.team.name || "" : ""));
        podium.appendChild(tile);
      }
      story.appendChild(podium);
    }
    return story;
  }

  return { summary, render };
})();
Object.freeze(ResultsStory);
