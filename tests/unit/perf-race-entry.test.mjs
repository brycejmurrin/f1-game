import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStageTable, markdownStageTable, markdownDiffTable, raceOnlyStages, glLane, loadBaseline, longTaskFailures, loafUnlisted } from "../helpers/perf-race-entry.mjs";

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

test("longTaskFailures gates blockMs / maxBlockMs / count at baseline x ratio; null baseline records only (#4777)", () => {
  const base = loadBaseline("swiftshader");
  assert.ok(base.baseline.blockMs > 0 && base.ratio >= 1.3, "baseline set from measured runs");
  const at = (k, m) => ({ blockMs: base.baseline.blockMs, maxBlockMs: base.baseline.maxBlockMs, longTasks: new Array(base.baseline.longTaskCount).fill(0), ...m });
  assert.deepEqual([...longTaskFailures(at(), base)], []);
  assert.equal(longTaskFailures(at(0, { blockMs: base.baseline.blockMs * base.ratio + 1 }), base).length, 1);
  assert.equal(longTaskFailures(at(0, { maxBlockMs: base.baseline.maxBlockMs * base.ratio + 1 }), base).length, 1);
  assert.equal(longTaskFailures(at(0, { longTasks: new Array(Math.floor(base.baseline.longTaskCount * base.ratio) + 1).fill(0) }), base).length, 1);
  assert.deepEqual([...longTaskFailures(at(0, { blockMs: 1e12 }), { ratio: 1.3, baseline: { blockMs: null } })], []);
});

test("loafUnlisted names scripts outside the allow-list; empty URLs are ignored", () => {
  const snap = { loaf: [{ scripts: [{ url: "https://x/js/track/tracks.js?v=1" }, { url: "" }, { url: "https://x/js/new/thing.js" }] }] };
  assert.deepEqual([...loafUnlisted(snap, loadBaseline().loafScriptAllow)], ["https://x/js/new/thing.js"]);
});

test("baseline is per GL lane: llvmpipe records only, an unknown lane records only (#4777)", () => {
  assert.equal(glLane({}), "swiftshader");
  assert.equal(glLane({ APEX_GL: "llvmpipe" }), "llvmpipe");
  const huge = { blockMs: 1e12, maxBlockMs: 1e12, longTasks: new Array(64).fill(0) };
  assert.deepEqual([...longTaskFailures(huge, loadBaseline("llvmpipe"))], []);
  assert.deepEqual([...longTaskFailures(huge, loadBaseline("somegl"))], []);
  assert.equal(longTaskFailures(huge, loadBaseline("swiftshader")).length, 3);
});

test("loafUnlisted ignores incidental scripts below the minimum duration but flags heavy unlisted ones (#4777)", () => {
  const base = loadBaseline("swiftshader");
  assert.equal(base.loafMinScriptMs, 100);
  const snap = { loaf: [{ scripts: [
    { url: "https://x/js/ui/loading-screen.js?v=dev", ms: 5.5 },
    { url: "https://x/js/perf/race-entry-profile.js?v=dev", ms: 48.9 },
    { url: "https://x/js/new/heavy.js?v=dev", ms: 250 },
    { url: "https://x/js/car/car-draw.js?v=dev", ms: 2000 },
  ] }] };
  assert.deepEqual([...loafUnlisted(snap, base.loafScriptAllow, base.loafMinScriptMs)], ["https://x/js/new/heavy.js?v=dev"]);
  assert.equal(loafUnlisted(snap, base.loafScriptAllow, 0).length, 3);
});
