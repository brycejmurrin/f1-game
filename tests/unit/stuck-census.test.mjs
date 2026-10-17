// stuck-census — the counting rules behind `ai-race.mjs stuck` (#1692), on synthetic samples.
import test from "node:test";
import assert from "node:assert/strict";
import { createStuckTracker } from "../../tools/lib/stuck-census.mjs";

const DT = 1 / 60;
const feed = (tr, id, seq, thr = 1) => { for (const s of seq) tr.sample(id, Object.assign({ threshold: thr }, s), DT); };

test("a stuckT climb through the threshold is ONE episode until it falls back under half", () => {
  const tr = createStuckTracker();
  feed(tr, "A", [{ stuckT: 0.5 }, { stuckT: 1.2 }, { stuckT: 1.6 }, { stuckT: 0.8 }, { stuckT: 1.3 }]);   // dips to 0.8 (> 0.5): same episode
  assert.equal(tr.report()[0].stuckEpisodes, 1);
  feed(tr, "A", [{ stuckT: 0.2 }, { stuckT: 1.4 }]);                                                       // re-armed under 0.5, crosses again
  const r = tr.report()[0];
  assert.equal(r.stuckEpisodes, 2);
  assert.equal(r.maxStuckT, 1.6);
  assert.ok(r.stuckS > 0);
});

test("a rescue is rescueT dropping to exactly 0 in one frame; the idle decay and a pit box are not", () => {
  const tr = createStuckTracker();
  feed(tr, "A", [{ rescueT: 1.0 }, { rescueT: 0.975 }, { rescueT: 0.95 }]);   // decay by dt*1.5: no rescue
  assert.equal(tr.report()[0].rescues, 0);
  feed(tr, "A", [{ rescueT: 2.9 }, { rescueT: 0 }]);                          // the teleport
  assert.equal(tr.report()[0].rescues, 1);
  feed(tr, "B", [{ rescueT: 1.0 }, { rescueT: 0, pitBox: true }]);            // box zeroes it too
  assert.equal(tr.report().find((r) => r.id === "B").rescues, 0);
});

test("cars are counted independently and an idle car reports zeros", () => {
  const tr = createStuckTracker();
  feed(tr, "A", [{ stuckT: 2 }]);
  feed(tr, "B", [{ stuckT: 0 }]);
  const rep = Object.fromEntries(tr.report().map((r) => [r.id, r]));
  assert.equal(rep.A.stuckEpisodes, 1);
  assert.deepEqual([rep.B.stuckEpisodes, rep.B.rescues, rep.B.stuckS], [0, 0, 0]);
});
