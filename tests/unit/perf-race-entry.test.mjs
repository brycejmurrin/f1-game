import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStageTable, markdownStageTable } from "../helpers/perf-race-entry.mjs";

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
