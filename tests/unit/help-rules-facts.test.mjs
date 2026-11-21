// HOW TO PLAY quotes rule numbers the code owns. Audit 2026-11-09 (W3) found the
// sheet saying a 2.4 s stop (BOX_S is 2.2), 60 km/h "on a street circuit" (only
// Monaco authors 60), an Overtake "cooldown" that does not exist, "four in a row"
// for a ladder that never resets, the retired X-mode / Z-mode names, and ACTIVE
// AERO filed under CONTROLS. Each check reads the VALUE from its source and
// compares it to what the sheet says, so the next retune fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const num = (src, re) => { const m = src.match(re); return m ? +m[1] : NaN; };
const html = read("index.html");
const help = html.slice(html.indexOf('id="htp-racing"'), html.indexOf("<dt>PRACTICE A SECTION</dt>"));

test("help: the stop time is PitGeom.BOX_S", () => {
  assert.equal(num(help, /The stop itself is ([\d.]+) s/), num(read("js/race/pit-geom.js"), /const BOX_S = ([\d.]+);/));
});

test("help: the pit limit is LIMIT_KPH, and the one lower figure is Monaco's authored limit", () => {
  const said = help.match(/limited to (\d+) km\/h \((\d+) at Monaco\)/) || [];
  assert.deepEqual([+said[1], +said[2]], [
    num(read("js/track/core/pit.js"), /const LIMIT_KPH = (\d+)/),
    num(read("js/circuits/monaco.js"), /pit: \{[^}]*limitKph: (\d+)/),
  ]);
});

test("help: no retired mode names, Overtake cooldown, 'in a row' ladder or full-pack slowdown", () => {
  const retired = { "X-/Z-mode": /\b[XZ]-mode\b/, cooldown: /cooldown/i, "in a row": /in a row/,
    "full-pack slowdown (energy just caps at 1)": /super-clipped|feel a slowdown/, "street circuit 60": /street circuit\)/ };
  const tooltip = (html.match(/id="cs-aero"[^>]*title="([^"]*)"/) || [])[1] || "";
  assert.deepEqual(Object.keys(retired).filter((k) => retired[k].test(help + "\n" + tooltip)), []);
});

// #5308: the 1 s check happens at ONE place on the lap (js/race/overtake-mode.js
// Detection Line; FIA 2026 Sporting Regulations, formula1.com "EXPLAINED: the key
// terms for F1's new-for-2026 rules"), so the HOW TO PLAY entry must say where.
test("help: the OVERTAKE entry arms at the detection line, as overtake-mode.js does", () => {
  const entry = (help.match(/<dt>OVERTAKE<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [])[1] || "";
  assert.match(entry, /within one second at the detection line/);
  assert.match(read("js/race/overtake-mode.js"), /AT THE DETECTION LINE/);
});

test("help: ACTIVE AERO and GEARS are named in the panel that holds them", () => {
  const panelOf = (id) => { const at = html.indexOf('id="' + id + '"'); return (html.slice(html.lastIndexOf("<section", at), at).match(/id="([^"]+)"/) || [])[1]; };
  assert.deepEqual([panelOf("pm-aero"), panelOf("pm-gears")], ["pm-panel-driving", "pm-panel-driving"]);
  const paths = [...help.matchAll(/SETTINGS › ([A-Z ]+?) › (ACTIVE AERO|GEARS)\b/g)].map((m) => m[2] + " in " + m[1]);
  assert.deepEqual(paths, ["ACTIVE AERO in DRIVING AIDS", "GEARS in DRIVING AIDS"]);
});

// Clean-room fix 45: the game disqualifies for one dry compound
// (SportingRegs.applyCompoundRule) but HOW TO PLAY never said so. The figures in
// the entry are read from the code that enforces them.
test("help: TWO DRY COMPOUNDS states the rule's lap floor, warning and red-flag penalty", () => {
  // The entry must name the penalty: the capture only matches when its text says "disqualified".
  const entry = (help.match(/<dt>TWO DRY COMPOUNDS<\/dt>\s*<dd>([^<]*?disqualified[\s\S]*?)<\/dd>/) || [])[1] || "";
  assert.ok(entry, "the entry exists under PIT STOPS and says the one-compound finish is disqualified");
  const words = { eight: 8, five: 5 };
  const pit = read("js/race/pit-lane.js");
  assert.equal(words[(entry.match(/race of (\w+) laps or more/) || [])[1]], num(pit, /const TWO_COMPOUND_MIN_LAPS = (\d+)/));
  assert.equal(words[(entry.match(/warns you (\w+) laps out/) || [])[1]], num(pit, /const COMPOUND_WARN_LAPS = (\d+)/));
  assert.equal(num(entry, /costs (\d+) s/), num(read("js/race/sporting-regs.js"), /const SUSPENDED_PEN_S = (\d+)/));
});
