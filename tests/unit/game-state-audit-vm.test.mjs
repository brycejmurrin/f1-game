/* game-state-audit-vm.test.mjs — the 2026-11-09 audit's simulation-state
 * fixes (W2) in the real js/game.js, booted headless. Via tools/lib/game-vm.cjs:
 *
 *   #1 G.teamIdx re-clamps driverIdx: a LEGENDS pick ≥ 2, then a two-seat team
 *      through a share code / settings import (they set G.teamIdx only), put
 *      the player in no car — the race started with player === null.
 *   #2 the drying line does not vanish on the tick a weather arc settles: grip
 *      under a car on the groove stepped 8.7 % in 1/60 s (Monza 0.898 → 0.820).
 *   #4 BOOST pressed on a flat battery does not latch ON (it fired by itself
 *      once regen refilled the battery).
 *   #6 aquaplaning reads the same surface as grip: wetnessAt(c.s, c.x) (a
 *      source pin: TyreModel is frozen, the read cannot be intercepted).
 *   #10 a tyre-wear level changed after boot survives quit-to-menu (MenuQuitTail
 *      was handed the boot-time value, so every quit reset tyres to it).
 * (#5, the lap-0 quali rescue, is in mechanics-race-vm.test.mjs beside the
 * rescue rules it amends.)
 * Run: node --test tests/unit/game-state-audit-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { gameSource } from "../helpers/game-source.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

async function drive() {
  g.G.driverIdx = 0; g.G.teamIdx = 0;   // a valid seat whatever #1 left behind
  await g.race("monza");
  g.apex.headless(true); g.apex.go(); g.apex.jump(0.3, 0, 0);
  return g.G.player;
}

test("#1 a LEGENDS seat ≥ 2, then a two-seat team set through G.teamIdx: the race still has a player", async () => {
  const T = g.sandbox.Teams.LIST;
  const legends = T.findIndex((t) => t.legends), two = T.findIndex((t) => !t.legends && !t.custom && t.drivers.length === 2);
  assert.ok(legends >= 0 && T[legends].drivers.length > 2 && two >= 0, "the fixture needs a LEGENDS team and a two-seat team");
  g.G.teamIdx = legends; g.G.driverIdx = 3;
  g.G.teamIdx = two;   // what ShareCode.apply's selectTeam does (js/ui/share-code.js, title-flow.js, settings-export.js)
  assert.ok(g.G.driverIdx >= 0 && g.G.driverIdx < 2, `driverIdx ${g.G.driverIdx} is not a seat of a two-seat team`);
  await g.race("monza");
  assert.ok(g.G.player, "the race started with no player car");
  assert.equal(g.G.player.team.id, T[two].id);
  // A seat that IS valid survives the switch: the clamp only clamps.
  g.G.driverIdx = 1; g.G.teamIdx = two;
  assert.equal(g.G.driverIdx, 1);
});

test("#2 grip on the drying line fades when a weather arc settles, it does not step", async () => {
  const p = await drive(), G = g.G;
  assert.ok(g.apex.weatherArc("dry", "wet", 20), "the arc must arm");
  const gripAt = (x) => { const x0 = p.x; p.x = x; const v = G.gripMult(p); p.x = x0; return v; };
  const groove = () => { let bx = 0, bv = -1; for (let x = -5; x <= 5; x += 0.25) { const v = gripAt(x); if (v > bv) { bv = v; bx = x; } } return bx; };
  let prev = null, worst = 0, endedAt = -1, onLine = null;
  for (let n = 0; n < 60 * 90; n++) {
    p.speed = 0; g.step(1);
    const gx = groove(), v = gripAt(gx);
    if (prev != null) worst = Math.max(worst, Math.abs(v - prev) / prev);
    prev = v;
    if (!G.weatherArc && endedAt < 0) { endedAt = n; onLine = v; }
    if (endedAt >= 0 && n > endedAt + 6 * 60) break;
  }
  assert.ok(endedAt > 0, "the arc never settled");
  assert.ok(worst < 0.01, `grip on the line stepped ${(worst * 100).toFixed(2)} % in one step`);
  assert.ok(onLine > prev + 0.05, `the groove gave no grip at the arc's end (${onLine} vs settled ${prev}) — nothing to fade`);
  const flat = gripAt(0), off = gripAt(4.5);
  assert.ok(Math.abs(flat - off) < 1e-12, "6 s after the arc a static weather is one even wetness again");
});

test("#4 BOOST pressed on a flat battery does not latch on", async () => {
  const p = await drive();
  const I = g.sandbox.Input, orig = I.consumeBoostToggle;
  let press = false;
  I.consumeBoostToggle = () => { const v = press; press = false; return v; };
  try {
    p.energy = 0; p.boostOn = false;
    press = true; g.step(1);
    assert.equal(p.boostOn, false, "a press with nothing in the battery latched BOOST on");
    p.energy = 0.5;
    g.step(30);
    assert.equal(p.boostOn, false, "BOOST engaged by itself once the battery had charge");
    press = true; g.step(1);
    assert.equal(p.boostOn, true, "a press with charge still turns BOOST on");
  } finally { I.consumeBoostToggle = orig; p.boostOn = false; }
});

// TyreModel is frozen, so the read cannot be intercepted in the VM: pin the source.
// Every per-car surface read in game.js passes the car's x (the drying line is lateral).
test("#6 aquaplaning reads the surface under the car at its x, as grip does", () => {
  const src = gameSource();
  const calls = [...src.matchAll(/wxArc\.wetnessAt\(([^()]*)\)/g)].map((m) => m[1].replace(/\s+/g, ""));
  assert.ok(calls.length >= 2, `found ${calls.length} wetnessAt reads — the pattern looks broken`);
  assert.deepEqual([...new Set(calls)], ["c.s,c.x"], "a per-car wetnessAt read without the car's x: " + calls.join(" | "));
  // aquaInto's read is one of these calls, so the set check above already pins it.
});

test("#10 a tyre-wear level changed after boot survives a quit to the menu", async () => {
  const G = g.G, boot = G.raceTyreWear, other = boot === "light" ? "real" : "light";
  try {
    G.raceTyreWear = other;
    await drive();
    G.quitToMenu();
    assert.equal(G.tyres.setLevel(), other, `quit reset the tyre level to the boot value ${boot}`);
  } finally { G.raceTyreWear = boot; }
});

// The code survey's two flow items (W2 follow-up). Neither is observable in the
// VM — audio is silent there and gfx has no warm to await — so pin the source.
test("survey: update() returns after a natural-flag endRace (no engine / brake-cue / rival audio over the results)", () => {
  const src = gameSource();
  assert.match(src, /RaceCeremony\.want\(true\); G\.endRace\(\); return; \}/, "update() must return after endRace()");
});
test("survey: loadTrackStepped re-checks live() after the warm await, before it frees the world", () => {
  const src = gameSource();
  const i = src.indexOf("await gfx.warmSettled();"), j = src.indexOf("dropTrackWorld();", i);
  assert.ok(i > 0 && j > i, "the warm await and the free must both be there");
  assert.match(src.slice(i, j), /if \(!live\(\)\) return false;/, "a superseded build must not free the world a newer selection wants");
});

// W29 (PR #5305) found it: in a DRIVEN real race the natural flag and SKIP called
// game.js's local endRace(), past RealRace's wrap of G.endRace (the only path that
// keeps the script's DSQ markers from SportingRegs.applyCompoundRule). Wrap
// G.endRace here the way RealRace does and drive SKIP in the real game.
test("SKIP after the player retires ends the race through G.endRace (the wrap RealRace installs)", async () => {
  const p = await drive(), G = g.G, A = g.apex;
  const orig = G.endRace;
  let wrapped = 0;
  G["endRace"] = function () { wrapped++; return orig.apply(this, arguments); };
  try {
    A.retire(G.cars.indexOf(p), "test");
    g.step(2);
    g.sandbox.document.getElementById("pm-skip-results").onclick();
    assert.equal(G.state, "results", `SKIP did not end the race (state ${G.state}) — the scenario needs postFinishWait()`);
    assert.equal(wrapped, 1, "SKIP ended the race past G.endRace: a driven real race's script DSQs would be wiped");
  } finally { G["endRace"] = orig; }
});
test("no game.js path ends a race past the G.endRace façade", () => {
  // game.js's own segment of the union (each file is headed `// ==== <file>`); ceremony.js
  // calls an INJECTED endRace (apex.js's finishRace dev hook), which is not this path.
  const all = gameSource(), head = "// ==== js/game.js\n", i = all.indexOf(head), j = all.indexOf("\n// ==== ", i + head.length);
  assert.ok(i === 0 && j > i, "the union no longer starts with the game.js segment");
  const src = all.slice(i, j).replace(/\/\/[^\n]*/g, "");
  const bare = [...src.matchAll(/(^|[^.\w])endRace\(/g)].length;
  // `function endRace(` is the one bare match allowed: every caller goes through G.endRace
  assert.equal(bare, 1, `${bare - 1} bare endRace( call(s) — call G.endRace() so RealRace's wrap applies`);
});
