// HOW TO PLAY quotes rule numbers the code owns. Audit 2026-11-09 (W3) found the
// sheet saying a 2.4 s stop (BOX_S is 2.2), 60 km/h "on a street circuit" (only
// Monaco authors 60), an Overtake "cooldown" that does not exist, "four in a row"
// for a ladder that never resets, and the retired X-mode / Z-mode names. Each
// check below reads the number from its source so the next retune fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const html = read("index.html");
const help = html.slice(html.indexOf('id="htp-racing"'), html.indexOf("<dt>PRACTICE A SECTION</dt>"));

test("help: the stop time is PitGeom.BOX_S", () => {
  const boxS = +read("js/race/pit-geom.js").match(/const BOX_S = ([\d.]+);/)[1];
  const said = help.match(/The stop itself is ([\d.]+) s/);
  assert.ok(said, "the pit section names the stop time");
  assert.equal(+said[1], boxS);
});

test("help: the pit limit is 80 km/h, 60 only where a circuit authors it (Monaco)", () => {
  assert.match(read("js/track/core/pit.js"), /const LIMIT_KPH = 80\b/);
  const authored = /pit: \{[^}]*limitKph: 60/;
  assert.match(read("js/circuits/monaco.js"), authored);
  assert.match(help, /limited to 80 km\/h \(60 at Monaco\)/);
  assert.doesNotMatch(help, /street circuit\)/);
});

test("help: no retired mode names, no Overtake cooldown, no 'in a row' track-limits ladder", () => {
  assert.doesNotMatch(html, /title="[^"]*\b[XZ]-mode/, "the aero button tooltip uses Straight/Corner Mode");
  assert.doesNotMatch(help, /\b[XZ]-mode\b/);
  assert.doesNotMatch(help, /cooldown/i);
  assert.doesNotMatch(help, /in a row/);
  assert.doesNotMatch(help, /super-clipped|feel a slowdown/, "a full pack has no physics effect (game.js energy caps at 1)");
});
