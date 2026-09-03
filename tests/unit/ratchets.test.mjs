// ratchets.test.mjs — the size ratchets in tests/data/ratchets.json, checked
// in-process by tools/ratchets.mjs. LOWER a ceiling when you extract
// (`node tools/ratchets.mjs --update`); raising one is a deliberate edit of
// the JSON with a reason in the commit. History: docs/notes/CEILING-HISTORY.md.
// Run: node --test tests/unit/ratchets.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, measure, verdict, METRICS, SLACK_MIN, SLACK_PCT } from "../../tools/ratchets.mjs";

test("every ratcheted metric is at or under its ceiling", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.over.map((r) => `${r.file} ${r.metric}: ${r.value} > ${r.ceiling} (+${r.over})`), [],
    "a file grew past its ceiling — extract something, or raise the number in tests/data/ratchets.json deliberately and say why in the commit");
  assert.deepEqual(v.rows.filter((r) => r.missing).map((r) => r.file), [], "a ratcheted file is gone — drop its entry or fix the path");
});

test("no ceiling is left far above the value it guards (one slack rule)", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.loose.map((r) => `${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > max(${SLACK_MIN}, ${SLACK_PCT * 100}%))`), [],
    "a ceiling drifted above its file and stopped ratcheting — node tools/ratchets.mjs --update");
});

test("the data names only known metrics, and game.js carries the carve metrics", () => {
  const data = load();
  for (const [file, metrics] of Object.entries(data.files))
    for (const m of Object.keys(metrics)) assert.ok(METRICS[m], `${file}: unknown metric ${m}`);
  assert.deepEqual(Object.keys(data.files["js/game.js"]).sort(), ["codeLines", "gMembers", "lines", "topLets"],
    "js/game.js is ratcheted on lines, non-comment lines, G members and column-0 lets — the four numbers a carve must move");
});
