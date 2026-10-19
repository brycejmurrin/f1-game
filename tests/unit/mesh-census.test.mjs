/* mesh-census.test.mjs — parser/aggregation for tools/perf/mesh-census-lib.mjs.
 * No browser. Run: node --test tests/unit/mesh-census.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceBand, classifySource, classifyPass, aggregateRows, tableRows,
  formatBandTable, recommend, parseSummaryLine, perFrame,
} from "../../tools/perf/mesh-census-lib.mjs";

test("distanceBand: 150 m cut", () => {
  assert.equal(distanceBand(0), "near");
  assert.equal(distanceBand(149.9), "near");
  assert.equal(distanceBand(150), "far");
  assert.equal(distanceBand(400), "far");
  assert.equal(distanceBand(NaN), "unknown");
});

test("classifySource: ribbon vs props vs other", () => {
  assert.equal(classifySource("tlxLgRoad"), "ribbon");
  assert.equal(classifySource("tlxBatch,inst"), "props");
  assert.equal(classifySource("chunked.js:road"), "ribbon");
  assert.equal(classifySource("props/scenery"), "props");
  assert.equal(classifySource("sky"), "other");
  assert.equal(classifySource(""), "other");
});

test("classifyPass: never treat shadow as main (#2631)", () => {
  assert.equal(classifyPass("canvas"), "main");
  assert.equal(classifyPass("output 576x324"), "main");
  assert.equal(classifyPass("mirror 207x59"), "mirror");
  assert.equal(classifyPass("rt 207x59"), "mirror", "unnamed TLX mirRT is still the mirror");
  assert.equal(classifyPass("rt 138x39"), "mirror", "phone lite mirror rung");
  assert.equal(classifyPass("rt 160x90"), "aux", "bloom mip must not count as mirror");
  assert.equal(classifyPass("rt 80x45"), "aux", "bloom mip chain");
  assert.equal(classifyPass("TLXSunShadow 512x512"), "shadow");
  assert.equal(classifyPass("rt 512x512"), "shadow", "square pot → shadow atlas");
  assert.equal(classifyPass("car shadow depth"), "shadow");
  assert.equal(classifyPass("bloom mip"), "aux");
});

test("aggregateRows: bands and sources; drops shadow/aux", () => {
  const agg = aggregateRows([
    { pass: "main", source: "ribbon", band: "near", tris: 1000, calls: 2, draws: 2 },
    { pass: "main", source: "ribbon", band: "far", tris: 500, calls: 1, draws: 1 },
    { pass: "mirror", source: "ribbon", band: "far", tris: 800, calls: 1, draws: 1 },
    { pass: "shadow", source: "ribbon", band: "far", tris: 99999, calls: 9, draws: 9 },
    { passKey: "TLXSunShadow 512x512", group: "tlxLgRoad", dist: 200, tris: 50, calls: 1, draws: 1 },
  ]);
  assert.equal(agg.by.main.ribbon.near.tris, 1000);
  assert.equal(agg.by.main.ribbon.far.tris, 500);
  assert.equal(agg.by.mirror.ribbon.far.tris, 800);
  assert.equal(agg.by.shadow, undefined);
  assert.equal(agg.passTotals.main.tris, 1500);
});

test("tableRows + formatBandTable are stable", () => {
  const agg = aggregateRows([
    { pass: "main", source: "ribbon", band: "far", tris: 4000, calls: 4, draws: 4 },
    { pass: "mirror", source: "ribbon", band: "near", tris: 2000, calls: 2, draws: 2 },
  ]);
  const rows = tableRows(agg, 2);
  assert.equal(rows.length, 2);
  assert.equal(perFrame(agg.by.main.ribbon.far, 2).tris, 2000);
  const md = formatBandTable(rows, { title: "TLX — monaco" });
  assert.match(md, /### TLX — monaco/);
  assert.match(md, /\| main \| ribbon \| far/);
  assert.match(md, /\| mirror \| ribbon \| near/);
});

test("recommend: mirror-first when mirror ribbon is huge", () => {
  const r = recommend({
    mainRibbonNear: 40_000, mainRibbonFar: 20_000,
    mirrorRibbon: 130_000, mainPropsFar: 5_000,
    mainTris: 180_000, mirrorTris: 140_000,
    culledChunks: 20, totalChunks: 80, mainCalls: 75, mirrorCalls: 12,
  });
  assert.equal(r.lodPays, true);
  assert.equal(r.passFirst, "mirror");
  assert.match(r.summary, /PAYS/);
  assert.ok(r.experiments.some((e) => /road-chunking|chunk-merge/i.test(e)));
});

test("recommend: no clear pay when far share and mirror are small", () => {
  const r = recommend({
    mainRibbonNear: 90_000, mainRibbonFar: 5_000,
    mirrorRibbon: 8_000, mainPropsFar: 1_000,
    mainTris: 100_000, mirrorTris: 10_000,
    culledChunks: 70, totalChunks: 80, mainCalls: 30, mirrorCalls: 4,
  });
  assert.equal(r.lodPays, false);
  assert.equal(r.passFirst, "none");
  assert.match(r.summary, /does NOT clearly pay/);
});

test("parseSummaryLine reads = mesh-census JSON", () => {
  const log = "noise\n= mesh-census {\"tracks\":[\"monaco\"],\"errors\":0}\n";
  assert.deepEqual(parseSummaryLine(log), { tracks: ["monaco"], errors: 0 });
  assert.equal(parseSummaryLine("nope"), null);
});
