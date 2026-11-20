const QualiSheet = (function () {
  "use strict";

const PODIUM = ["", " p1", " p2", " p3"];

function span(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  if (text != null) s.textContent = text;
  return s;
}

function create(G) {
  Log.info("ui", "QualiSheet.create");
  const { $ } = G;
  const poleClock = (t) => (typeof Dom !== "undefined" && Dom.fmtLap ? Dom.fmtLap(t, "-") : G.fmtTime(t));

  function build(rows) {
    const body = $("q-table");
    if (!body) return;
    body.textContent = "";
    if (!rows) return;
    for (const r of rows) {
      const team = Teams.LIST.find((t) => t.id === r.team);
      const row = document.createElement("div");
      const driven = r.human && !r.isPlayer ? " q-real" : "";
      row.className = `res-row${PODIUM[r.pos] || ""}${r.isPlayer ? " you" : ""}${driven}`;
      const sw = span("res-swatch");
      sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
      const nm = span("res-name", `${r.code}  ${r.name}`);
      if (driven) nm.appendChild(span("q-real-tag", " " + I18n.t("quali.driven", null, "DRIVEN")));
      const tm = span("res-pts q-time", r.noTime ? I18n.t("quali.noTime", null, "NO TIME") : r.pos === 1 ? poleClock(r.t) : `+${r.gap.toFixed(3)}`);
      row.append(span("res-pos", r.pos), sw, nm, tm);
      body.appendChild(row);
    }
    const title = $("q-title");
    if (title) {
      const you = rows.find((r) => r.isPlayer);
      const name = G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.qualiLabel ? SeasonCal.qualiLabel(G.season) : I18n.t("quali.title", null, "QUALIFYING");
      title.textContent = you ? `${name} — P${you.pos}` : name;
    }
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
