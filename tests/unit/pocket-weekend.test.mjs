/* pocket-weekend.test.mjs — the POCKET WEEKEND preset (#7042, roadmap #6884 D4): a one-lap quali shootout and a
 * sprint at a third of the laps, written onto the EXISTING quali/sprint toggles. No new mode.
 * Run: node --test tests/unit/pocket-weekend.test.mjs */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });
const S = () => g.sandbox || g.ctx;
const RS = () => S().RaceSettings;
const Cal = () => S().SeasonCal;
const FRESH = () => Object.assign({}, Cal().fresh(), { quali: false, sprint: "rounds", sprintIds: ["monza"], laps: 10, drop: 2 });

test("applying the preset reads back the toggles and the lap counts", () => {
  const def = Cal().DEFAULT_LAPS;
  const { next } = RS().pocketApply(FRESH(), def);
  assert.equal(next.quali, true);
  assert.equal(next.sprint, true);
  assert.equal(next.laps, def);
  assert.equal(next.drop, 2, "every other rule is untouched");
  assert.ok(RS().isPocket(next, def));
  // lapsFor reads the LIVE rules (season flow), so stage the config the way the game does
  const G = S().G || g.G;
  G.seasonMode = true;
  try {
    Cal().setConfig(next); Cal().restart();
    assert.equal(Cal().sprintOn({ round: 0 }), true, "a sprint on every round");
    assert.equal(Cal().lapsFor(10, { round: 0 }), 3, "10 laps -> a third");
    assert.equal(Cal().lapsFor(def, { round: 0 }), Math.max(2, Math.round(def / 3)));
  } finally { G.seasonMode = false; }
});

test("turning it off restores the previous settings exactly", () => {
  const before = FRESH();
  const snap = JSON.stringify(before);
  const { next, undo } = RS().pocketApply(before, Cal().DEFAULT_LAPS);
  assert.equal(JSON.stringify(before), snap, "apply does not mutate its input");
  assert.notEqual(JSON.stringify(next), snap);
  assert.equal(JSON.stringify(RS().pocketRestore(next, undo)), snap);
  assert.ok(!RS().isPocket(RS().pocketRestore(next, undo), Cal().DEFAULT_LAPS));
});

test("the whole weekend is at most 12 minutes on every circuit at default laps", () => {
  const def = Cal().DEFAULT_LAPS;
  const sprint = Math.max(2, Math.round(def / 3));
  const all = S().Tracks.LIST;   // not .filter() on it: node-plan reads that as "builds every circuit"
  const list = Array.from(all).filter((t) => t.lengthKm > 0);
  assert.ok(list.length > 10, "circuits listed");
  for (const t of list) {
    const lapS = t.lengthKm * 1000 / 61;   // modelled lap: ~220 km/h average (61 m/s), about 95 s at Silverstone
    const minutes = (1 + sprint + def) * lapS / 60;   // 1 quali lap + the sprint + the Grand Prix
    assert.ok(minutes <= 12, `${t.id}: ${minutes.toFixed(1)} min`);
  }
});
