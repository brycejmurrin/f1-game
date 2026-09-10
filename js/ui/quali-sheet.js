/* Apex 26 — the QUALIFYING sheet (`#quali`): pure DOM assembly of a classification the model in js/race/quali-model.js has already produced. No timing, no ordering, no persistence — hand it `quali.rows()` and it paints. */
const QualiSheet = (function () {
  "use strict";

const PODIUM = ["", " p1", " p2", " p3"];   // indexed by position; 4+ is ""

function span(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  if (text != null) s.textContent = text;
  return s;
}

function create(G) {
  Log.info("ui", "QualiSheet.create");
  const { $ } = G;

  // Paint `rows` (the model's classification, car refs already dropped) into
  // #q-table and retitle. null rows clear the table — the sheet opening on an
  // empty model is legitimate (nothing simulated yet).
  function build(rows) {
    const body = $("q-table");
    if (!body) return;
    body.textContent = "";
    if (!rows) return;
    for (const r of rows) {
      const team = Teams.LIST.find((t) => t.id === r.team);
      const row = document.createElement("div");
      // A rival's DRIVEN lap (r.human: a real time substituted for a simulated
      // one) is marked — on a sheet whose whole job is "who was quick", which
      // times are real is the one thing it must not leave out. `you` still
      // marks the local player.
      const driven = r.human && !r.isPlayer ? " q-real" : "";
      row.className = `res-row${PODIUM[r.pos] || ""}${r.isPlayer ? " you" : ""}${driven}`;
      const sw = span("res-swatch");
      sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
      const nm = span("res-name", `${r.code}  ${r.name}`);
      if (driven) nm.appendChild(span("q-real-tag", " DRIVEN"));
      const tm = span("res-pts q-time", r.pos === 1 ? G.fmtTime(r.t) : `+${r.gap.toFixed(3)}`);
      row.append(span("res-pos", r.pos), sw, nm, tm);
      body.appendChild(row);
    }
    const title = $("q-title");
    if (title) {
      const you = rows.find((r) => r.isPlayer);
      title.textContent = you ? `QUALIFYING — P${you.pos}` : "QUALIFYING";
    }
  }

  function open(rows) {
    Log.info("ui", "QualiSheet.open");
    build(rows);
    $("quali").hidden = false;
    ScrollFade.refresh();
  }
  function close() {
    Log.info("ui", "QualiSheet.close");
    $("quali").hidden = true;
  }

  return { build, open, close };
}

return { create };
})();
Object.freeze(QualiSheet);
