// ratchets.test.mjs — the size ratchets in tests/data/ratchets.json, checked
// in-process by tools/check/ratchets.mjs. LOWER a ceiling when you extract
// (`node tools/check/ratchets.mjs --update`); raising one is a deliberate edit of
// the JSON with a reason in the commit. History: docs/notes/CEILING-HISTORY.md.
// Run: node --test tests/unit/ratchets.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, measure, verdict, METRICS, TREE_METRICS, SLACK_MIN, SLACK_PCT } from "../../tools/check/ratchets.mjs";

test("every ratcheted metric is at or under its ceiling", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.over.map((r) => `${r.file} ${r.metric}: ${r.value} > ${r.ceiling} (+${r.over})`), [],
    "a file grew past its ceiling — extract something, or raise the number in tests/data/ratchets.json deliberately and say why in the commit");
  assert.deepEqual(v.rows.filter((r) => r.missing).map((r) => r.file), [], "a ratcheted file is gone — drop its entry or fix the path");
});

test("no ceiling is left far above the value it guards (one slack rule)", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.loose.map((r) => `${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > max(${SLACK_MIN}, ${SLACK_PCT * 100}%))`), [],
    "a ceiling drifted above its file and stopped ratcheting — node tools/check/ratchets.mjs --update");
});

test("the data names only known metrics, and game.js carries the carve metrics", () => {
  const data = load();
  for (const [file, metrics] of Object.entries(data.files))
    for (const m of Object.keys(metrics)) assert.ok(METRICS[m], `${file}: unknown metric ${m}`);
  assert.deepEqual(Object.keys(data.files["js/game.js"]).sort(), ["codeLines", "gMembers", "lines", "topLets"],
    "js/game.js is ratcheted on lines, non-comment lines, G members and column-0 lets — the four numbers a carve must move");
});

test("every declared tree metric actually resolves", async () => {
  // The defect this exists for: `subFloorFontSize` was wired into TREE_METRICS
  // on 2026-09-03 pointing at a tools/check/tree-counts.mjs export that was
  // never written. measure() only calls the metrics NAMED IN ratchets.json, so
  // a dangling entry sits green until the day someone ratchets it — and then
  // throws "is not a function" from inside the fast gate, at the exact moment
  // they are trying to lock a win in. A registry is only as good as the promise
  // that every name in it points at something.
  for (const [metric, fn] of Object.entries(TREE_METRICS)) {
    const v = await fn();
    assert.equal(typeof v, "number", `TREE_METRICS.${metric} did not return a number`);
    assert.ok(Number.isFinite(v) && v >= 0, `TREE_METRICS.${metric} returned ${v}`);
  }
  for (const metric of Object.keys(METRICS)) assert.equal(typeof METRICS[metric], "function", `METRICS.${metric}`);
});

test("the ratchet bites, in both directions", async () => {
  // Anti-vacuity. A ratchet that cannot fail is a comment. Both halves are
  // exercised against the REAL measurement with a doctored ceiling, so this
  // stays true however the metrics are implemented.
  const real = load();
  const shrunk = { files: {}, tree: { cssClasses: { ceiling: 1, slack: 0 } } };
  const over = verdict(await measure(shrunk));
  assert.equal(over.ok, false, "a ceiling of 1 on the CSS class count must fail");
  assert.equal(over.over[0].metric, "cssClasses");

  const loose = { files: {}, tree: { cssClasses: real.tree.cssClasses.ceiling + 500 } };
  const v = verdict(await measure(loose));
  assert.equal(v.ok, false, "a ceiling 500 above the value has stopped ratcheting and must be reported LOOSE");
  assert.equal(v.loose[0].metric, "cssClasses");
});

test("an entry may tighten the slack rule, never widen it", async () => {
  // Folding five mechanisms into one must not quietly widen any of them: the
  // four CSS token-adoption counts asserted EXACT equality before the fold and
  // carry slack 0 after it. A slack above the computed default is refused.
  await assert.rejects(
    () => measure({ files: {}, tree: { cssClasses: { ceiling: 535, slack: 9999 } } }),
    /looser than the default/);
});
