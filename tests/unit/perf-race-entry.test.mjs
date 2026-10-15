import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStageTable, markdownStageTable, markdownDiffTable, raceOnlyStages } from "../helpers/perf-race-entry.mjs";

test("formatStageTable orders stages by duration", () => {
  const s = formatStageTable({
    stages: [{ n: "a", ms: 10 }, { n: "b", ms: 200 }],
  });
  assert.match(s, /b 200ms/);
  assert.ok(s.indexOf("b 200ms") < s.indexOf("a 10ms"));
});

test("markdownStageTable renders a GitHub table", () => {
  const md = markdownStageTable({ stages: [{ n: "warmCarAssets", ms: 1200.4 }] });
  assert.match(md, /\| warmCarAssets \| 1200 \|/);
});

test("markdownDiffTable and raceOnlyStages summarise race vs practice", () => {
  const diff = {
    rows: [
      { n: "flyby", raceMs: 20000, practiceMs: 700, deltaMs: 19300 },
      { n: "warmCarAssets", raceMs: 120, practiceMs: 1, deltaMs: 119 },
    ],
  };
  assert.match(markdownDiffTable(diff), /\| flyby \| 20000 \| 700 \| 19300 \|/);
  assert.deepEqual(raceOnlyStages(diff), ["warmCarAssets"]);
});
