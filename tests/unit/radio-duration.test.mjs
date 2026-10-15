/* radio-duration.test.mjs — race-radio card life matches RadioVoice speech budget.
 *
 * Every phrasebook line must fit plan() at the duration durFor() asks for, with
 * the same courtesy lead showAnnounce hands to the voice. Truncation or a card
 * that ends before the words finish is what this guards.
 *
 * Run: node --test tests/unit/radio-duration.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set, String, RegExp,
    Float64Array, Int32Array });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/audio/radio-voice.js", "js/race/radio-lines.js", "js/race/race-facts.js", "js/race/race-radio.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return {
    RV: vm.runInContext("RadioVoice", ctx),
    RL: vm.runInContext("RadioLines", ctx),
    RR: vm.runInContext("RaceRadio", ctx),
  };
}
const { RV, RL, RR } = load();

const LONG = { pos: 20, passed: "VERSTAPPEN", by: "VERSTAPPEN", n: 12, gap: "10.5", ahead: "VERSTAPPEN",
  behind: "VERSTAPPEN", rate: "0.8", laps: 12, gapA: "10.5", gapB: "10.5", time: "1:32.4", delta: "2.3",
  left: 10, grid: 20, name: "VERSTAPPEN", leader: "VERSTAPPEN", a: "VERSTAPPEN", b: "HULKENBERG",
  why: "MECHANICAL TROUBLE" };

function lineCase(key, msg) {
  const tv = key.startsWith("tv.");
  const kind = tv ? "comm" : "info";
  const lead = tv ? 0 : RV.RADIO_LEAD_S;
  const dur = RR.durFor(msg, kind);
  const life = Math.max(RV.ANN_CARD_MIN_S, dur + RV.ANN_CARD_PAD_S);
  const p = RV.plan({ msg, life, kind, lead, enabled: true, soundOn: true, api: true, state: "race" });
  const voiceEnd = lead + (p.budgetMs || 0) / 1000;
  return { key, msg, kind, lead, dur, life, p, voiceEnd };
}

test("durFor and cardLifeS agree with js/game.js showAnnounce", () => {
  const msg = "GAP TO VERSTAPPEN 10.5. CLOSING 0.8 A LAP";
  const dur = RR.durFor(msg, "info");
  const want = RV.cardDurS({ msg, kind: "info", lead: RV.RADIO_LEAD_S });
  assert.equal(dur, want);
  const life = Math.max(RV.ANN_CARD_MIN_S, dur + RV.ANN_CARD_PAD_S);
  assert.equal(life, RV.cardLifeS({ msg, kind: "info", lead: RV.RADIO_LEAD_S }));
});

test("every phrasebook line fits its card when spoken (no truncation)", () => {
  const refused = [];
  const truncated = [];
  let n = 0;
  for (const [key, pool] of Object.entries(RL.POOLS)) {
    for (const tpl of pool) {
      const msg = RL.fill(tpl, LONG);
      if (!msg) continue;
      const c = lineCase(key, msg);
      n++;
      if (!c.p.speak) refused.push(`${c.key}: "${c.msg}" (${c.p.reason})`);
      else if (c.voiceEnd > c.life + 0.001) truncated.push(`${c.key}: "${c.msg}" (voice ${c.voiceEnd.toFixed(2)}s > card ${c.life.toFixed(2)}s)`);
    }
  }
  assert.ok(n > 100, `expected the whole phrasebook, checked ${n}`);
  assert.deepEqual(refused, []);
  assert.deepEqual(truncated, []);
});
