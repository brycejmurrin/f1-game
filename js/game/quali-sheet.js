/* Apex 26 — the QUALIFYING sheet (`#quali`): pure DOM assembly of a classification the model in js/game/quali.js has already produced. No timing, no ordering, no persistence — hand it `quali.rows()` and it paints. */
const QualiSheet = (function () {
  "use strict";

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
      const podium = r.pos === 1 ? " p1" : r.pos === 2 ? " p2" : r.pos === 3 ? " p3" : "";
      // A DRIVEN lap is marked. compute() has always worked out r.human — a
      // real time substituted for a simulated one — and then this sheet used
      // to throw it away, so three rivals' actual laps were drawn identically
      // to the eighteen the model guessed. On a sheet whose whole job is "who
      // was quick", not saying which times are real is the one thing it must
      // not leave out. `you` still marks the local player, exactly as before.
      const driven = r.human && !r.isPlayer ? " q-real" : "";
      row.className = "res-row" + podium + (r.isPlayer ? " you" : "") + driven;
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = r.pos;
      const sw = document.createElement("span"); sw.className = "res-swatch";
      sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
      const nm = document.createElement("span"); nm.className = "res-name";
      nm.textContent = r.code + "  " + r.name;
      if (driven) {
        const tag = document.createElement("span");
        tag.className = "q-real-tag";
        tag.textContent = " DRIVEN";
        nm.appendChild(tag);
      }
      const tm = document.createElement("span"); tm.className = "res-pts q-time";
      tm.textContent = r.pos === 1 ? G.fmtTime(r.t) : "+" + r.gap.toFixed(3);
      row.append(pos, sw, nm, tm);
      body.appendChild(row);
    }
    const title = $("q-title");
    if (title) {
      const you = rows.find((r) => r.isPlayer);
      title.textContent = you ? "QUALIFYING — P" + you.pos : "QUALIFYING";
    }
  }

  function open(rows) { Log.info("ui", "QualiSheet.open"); build(rows); $("quali").hidden = false; ScrollFade.refresh(); }
  function close() { Log.info("ui", "QualiSheet.close"); $("quali").hidden = true; }

  return { build, open, close };
}

return { create };
})();
