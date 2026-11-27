/* Apex 26 — the QUALIFYING sheet (`#quali`): pure DOM assembly of a classification the model in js/race/quali-model.js has already produced. No timing, no ordering, no persistence — hand it `quali.rows()` and it paints. */
const QualiSheet = (function () {
  "use strict";

function span(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  if (text != null) s.textContent = text;
  return s;
}

function create(G) {
  Log.info("ui", "QualiSheet.create");
  const { $ } = G;
  // POLE to the thousandth, like the +0.123 gaps under it: G.fmtTime is the
  // two-decimal HUD clock (js/game.js), and a classification printed 1:21.16
  // over a +0.004 gap. Dom.fmtLap is the timing-sheet formatter.
  const poleClock = (t) => (typeof Dom !== "undefined" && Dom.fmtLap ? Dom.fmtLap(t, "-") : G.fmtTime(t));

  // Paint `rows` (the model's classification, car refs already dropped) into
  // #q-table and retitle. null rows clear the table — the sheet opening on an
  // empty model is legitimate (nothing simulated yet).
  function build(rows) {
    const body = $("q-table");
    if (!body) return;
    body.textContent = "";
    body.setAttribute("role", "list");
    if (!rows) return;
    for (const r of rows) {
      const team = Teams.LIST.find((t) => t.id === r.team);
      // A rival's DRIVEN lap (r.human: a real time substituted for a simulated
      // one) is marked — on a sheet whose whole job is "who was quick", which
      // times are real is the one thing it must not leave out. `you` still
      // marks the local player.
      const driven = r.human && !r.isPlayer ? " q-real" : "";
      const nm = span("res-name", `${r.code}  ${r.name}`);
      if (driven) nm.appendChild(span("q-real-tag", " " + I18n.t("quali.driven", null, "DRIVEN")));
      // Text as well as colour (and weight): the YOU row must be nameable without seeing it.
      if (r.isPlayer) nm.appendChild(span("q-real-tag", " " + I18n.t("quali.you", null, "YOU")));
      const tm = span("res-pts q-time", r.noTime ? I18n.t("quali.noTime", null, "NO TIME") : r.pos === 1 ? poleClock(r.t) : `+${r.gap.toFixed(3)}`);
      // The row shell is GameResultsSheet.row, shared with the race classification (#7052).
      const row = GameResultsSheet.row({ pos: r.pos, color: G.cssCol(team ? team.color : [0.5, 0.5, 0.5]), name: nm, pts: tm,
        podium: r.pos, cls: `${r.isPlayer ? " you" : ""}${driven}` });
      if (r.isPlayer) row.setAttribute("aria-current", "true");
      body.appendChild(row);
    }
    const title = $("q-title");
    if (title) {
      const you = rows.find((r) => r.isPlayer);
      const name = G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.qualiLabel ? SeasonCal.qualiLabel(G.season) : I18n.t("quali.title", null, "QUALIFYING");
      title.textContent = you ? `${name} — P${you.pos}` : name;
    }
    // LICENCE BADGES: a DRIVEN pole only — a simulated time for a player who
    // never ran a lap is not one (js/career/badges.js).
    // The banner toast is hidden behind this sheet, so the unlock is a card on
    // it. Keep it across rebuilds that still show a driven pole (Badges.onPole
    // may already be empty after the award), but drop it when SIMULATE / a peer
    // update leaves the player off driven P1 while #quali stays open.
    const me = rows.find((r) => r.isPlayer);
    const drivenPole = !!(me && me.pos === 1 && me.human);
    if (drivenPole && typeof Badges !== "undefined" && Badges.onPole().length) poleNew = true;
    else if (!drivenPole) poleNew = false;
    if (poleNew) {
      const card = document.createElement("div"); card.className = "res-personal";
      const head = document.createElement("strong"); head.textContent = I18n.t("results.badgeUnlocked", null, "BADGE UNLOCKED");
      card.append(head, span("", Badges.labelOf("pole")));
      body.appendChild(card);
    }
  }
  let poleNew = false;

  function open(rows) {
    Log.info("ui", "QualiSheet.open");
    build(rows);
    $("quali").hidden = false;
    ScrollFade.refresh();
    // Say the pole badge (see results-sheet.js sayCards).
    if (poleNew && typeof LiveRegion !== "undefined") setTimeout(() => LiveRegion.say(I18n.t("results.badgeUnlocked", null, "BADGE UNLOCKED") + " " + Badges.labelOf("pole"), "save"), 0);
  }
  function close() {
    Log.info("ui", "QualiSheet.close");
    $("quali").hidden = true;
    poleNew = false;
  }

  return { build, open, close };
}

return { create };
})();
Object.freeze(QualiSheet);
