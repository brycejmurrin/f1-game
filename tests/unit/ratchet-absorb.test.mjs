/* ratchet-absorb.test.mjs — the B+D boot-wall ratchet (Bryce, 2026-11-20 07:49Z; docs/notes/RATCHET-REVIEW-2026-11-20.md):
 * eagerCodeBytes counts stripped code, and a branch's own growth up to the entry's `absorb` needs no label.
 * Run: node --test tests/unit/ratchet-absorb.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { absorbOf, autoRaiseBlockReason, diffRatchets, compareToBase, loadAt, ownGrowth, retiredFor, RETIRED_TREE, TREE_METRICS, load } from "../../tools/check/ratchets.mjs";
import { treeRaises } from "../../tools/ci/merge-gate.mjs";
import { AT_REF } from "../../tools/check/tree-counts.mjs";

test("eagerCodeBytes is measured live and at a ref, and its entry grants a 5000 B absorb at slack 0", () => {
  assert.equal(typeof TREE_METRICS.eagerCodeBytes, "function");
  assert.equal(typeof AT_REF.eagerCodeBytes, "function");
  const e = load().tree.eagerCodeBytes;
  assert.equal(e.slack, 0, "exact: a lowering is still the branch's own fragment");
  assert.equal(absorbOf(e), 5000);
  assert.ok(!("eagerBytes" in load().tree), "raw eagerBytes is retired");
  assert.equal(RETIRED_TREE.eagerBytes, "eagerCodeBytes");
});

test("absorbOf: 0 for none, the value when set, a throw on a bad one", () => {
  assert.equal(absorbOf(12), 0);
  assert.equal(absorbOf({ ceiling: 1 }), 0);
  assert.equal(absorbOf({ ceiling: 1, absorb: 7 }), 7);
  assert.throws(() => absorbOf({ ceiling: 1, absorb: NaN }, "tree x"), /tree x: absorb NaN/);
  assert.throws(() => absorbOf({ ceiling: 1, absorb: -1 }), /absorb -1/);
});

test("the commit hook writes a tree raise inside the absorb, measured from the merge base; past it, it blocks", () => {
  const row = { tree: true, metric: "eagerCodeBytes", over: 900, slackMax: 0, absorb: 5000 };
  assert.equal(autoRaiseBlockReason({ ...row, ownGrowth: 5000 }), null);
  assert.equal(autoRaiseBlockReason({ ...row, ownGrowth: 5001 }),
    "the branch grows it by 5001, past its 5000 absorb — lazy-load it, or raise it as a fragment under Bryce's ratchet-raise");
  const shrinkOnly = "a tree-wide metric is shrink-only — never auto-raised";
  assert.equal(autoRaiseBlockReason({ ...row }), shrinkOnly, "no merge-base measurement: no absorb");
  assert.equal(autoRaiseBlockReason({ ...row, absorb: undefined, ownGrowth: 1 }), shrinkOnly, "no absorb on the entry: as before");
});

test("diffRatchets: a wider absorb is a loosen; the same or a narrower one is not", () => {
  const at = (absorb) => ({ files: {}, tree: { m: { ceiling: 10, slack: 0, absorb } } });
  assert.deepEqual(diffRatchets(at(5), at(9)).map((r) => [r.kind, r.what, r.base, r.now]), [["loosen", "absorb", 5, 9]]);
  assert.deepEqual(diffRatchets(at(5), at(5)), []);
  assert.deepEqual(diffRatchets(at(5), at(2)), []);
});

test("retiredFor: eagerBytes deleted beside eagerCodeBytes is the planned switch, not a removed guard", () => {
  assert.equal(retiredFor("eagerBytes", { eagerCodeBytes: { ceiling: 1 } }), "eagerCodeBytes");
  assert.equal(retiredFor("eagerBytes", {}), null, "deleting both still removes a guard");
  assert.equal(retiredFor("rawColor", { eagerCodeBytes: 1 }), null);
});

test("--base: a tree raise inside the base's absorb is no red; past it, it is", () => {
  const head = loadAt("HEAD");
  const bump = (n) => ({ ...head, tree: { ...head.tree, eagerCodeBytes: { ...head.tree.eagerCodeBytes, ceiling: head.tree.eagerCodeBytes.ceiling + n } } });
  const inside = [];
  assert.equal(compareToBase("HEAD", { current: bump(5000), print: (l) => inside.push(l), historyReasoned: false }), 0, inside.join("\n"));
  const msg = inside.find((l) => l.startsWith("RAISE  (tree) eagerCodeBytes:"));
  assert.equal(msg?.slice(msg.indexOf("(+5000)")), "(+5000) — inside its 5000 absorb (the branch's own growth; no label)", inside.join("\n"));
  const past = [];
  assert.notEqual(compareToBase("HEAD", { current: bump(5001), print: (l) => past.push(l), historyReasoned: false }), 0, past.join("\n"));
});

/* D-037 (Bryce, 2026-11-20 ~17:22Z, "Pin slack"): the two pin counters carry the same absorb, 5 pins. */
const PINS = ["assertPins", "assertPinsAll"];

test("D-037: assertPins and assertPinsAll grant a 5-pin absorb", () => {
  for (const m of PINS) assert.equal(absorbOf(load().tree[m]), 5, m);
});

test("D-037: the hook takes a branch's own +5 pins as its fragment; +6 still blocks", async () => {
  for (const metric of PINS) {
    const row = (own) => ({ tree: true, metric, value: 8146, over: own, slackMax: 200, absorb: 5 });
    const grow = (n) => ownGrowth([row(n)], { base: "MB", pinGrowth: async (m, ref) => (assert.equal(ref, "MB"), assert.equal(m, metric), n) });
    assert.equal(autoRaiseBlockReason((await grow(5))[0]), null, `${metric} +5`);
    assert.equal(autoRaiseBlockReason((await grow(6))[0]),
      "the branch grows it by 6, past its 5 absorb — convert a source pin to a behaviour assertion, or raise it as a fragment under Bryce's ratchet-raise");
    const blind = await ownGrowth([row(1)], { base: "MB", pinGrowth: async () => { throw new Error("no base"); } });
    assert.equal(autoRaiseBlockReason(blind[0]), "a tree-wide metric is shrink-only — never auto-raised", "unmeasured: no absorb");
  }
});

test("D-037: the tip's own growth does not count, only the branch's since its merge base", () => {
  // Merge base 8140 plus fragments other PRs landed on the tip (+4) and a sync brought in: both sides carry them.
  const before = { assertPins: 8144, assertPinsAll: 10370 }, absorb = { assertPins: 5, assertPinsAll: 5 };
  assert.deepEqual(treeRaises(before, { assertPins: 8149, assertPinsAll: 10375 }, absorb, absorb), [], "+5 own: no raise");
  assert.deepEqual(treeRaises(before, { assertPins: 8150, assertPinsAll: 10370 }, absorb, absorb).map((r) => [r.metric, r.from, r.to]),
    [["assertPins", 8144, 8150]], "+6 own: Bryce's ratchet-raise");
  // --base on CI: +5 is named inside the absorb; +6 is a named RAISE (under the 40 per-file absorb a warning there),
  // and the raise row above is what asks Bryce.
  const head = loadAt("HEAD");
  for (const m of PINS) {
    if (!absorbOf(head.tree[m])) continue; // HEAD predates D-037 (a pre-commit run): the merged table carries it
    const bump = (n) => ({ ...head, tree: { ...head.tree, [m]: { ...head.tree[m], ceiling: head.tree[m].ceiling + n } } });
    const out = [];
    assert.equal(compareToBase("HEAD", { current: bump(5), print: (l) => out.push(l), historyReasoned: false }), 0, out.join("\n"));
    assert.ok(out.some((l) => l.startsWith(`RAISE  (tree) ${m}:`) && l.endsWith("inside its 5 absorb (the branch's own growth; no label)")), out.join("\n"));
    const past = [];
    compareToBase("HEAD", { current: bump(6), print: (l) => past.push(l), historyReasoned: false });
    const line = past.find((l) => l.startsWith(`RAISE  (tree) ${m}:`));
    assert.ok(line && !line.includes("inside its"), past.join("\n"));
  }
});
