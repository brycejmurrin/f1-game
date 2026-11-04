// project-map — tools/map/build-project-map.mjs runs on the tree, and its node set IS the manifest's js roster.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { buildMap, checkFlows, manifestModules, scanFile } from "../../tools/map/build-project-map.mjs";

const require = createRequire(import.meta.url);
const manifest = require("../../tools/manifest.cjs");

test("the graph is non-empty and its nodes are exactly the manifest's js modules", async () => {
  const map = await buildMap({ flows: require("../../tools/map/flows.json") });
  const ids = new Set(map.nodes.map((n) => n.id));
  const roster = new Set(manifestModules(manifest).keys());
  assert.ok(map.nodes.length > 400, `only ${map.nodes.length} nodes`);
  assert.deepEqual([...ids].sort(), [...roster].sort());
  for (const f of manifest.FULL.filter((x) => x !== "@circuits")) assert.ok(ids.has(f), `FULL ${f} missing`);
  for (const f of manifest.LAZY_CIRCUIT) assert.ok(ids.has(f), `circuit ${f} missing`);
  assert.deepEqual(map.meta.missing, []);
  const types = new Set(map.edges.map((e) => e.type));
  for (const t of ["calls", "facade", "loads-before", "tested-by"]) assert.ok(types.has(t), `no ${t} edges`);
  for (const e of map.edges) assert.ok(ids.has(e.from), `edge from unknown ${e.from}`);
  // the stub that pre-declares a lazy global never takes its callers from the real module
  assert.ok(!map.edges.some((e) => e.type === "calls" && e.to === "js/audio/stub.js" && e.symbol === "GameAudio"));
  // every curated flow step still points at its symbol (a stale one means fix tools/map/flows.json)
  const stale = map.flows.flatMap((f) => f.steps.filter((s) => s.stale).map((s) => `${f.id}: ${s.file}:${s.line} ${s.symbol} (${s.stale})`));
  assert.deepEqual(stale, []);
});

test("scanFile reads an IIFE global's exported members and its cross-file references", () => {
  const src = "const Foo = (function () {\n  function a() { return Bar.baz(Log.info); }\n  return { a, b: 1 };\n})();\n";
  const s = scanFile("x.js", src);
  assert.deepEqual(s.globals.map((g) => [g.name, g.members]), [["Foo", ["a", "b"]]]);
  assert.deepEqual([...s.refs.get("Bar").members], ["baz"]);
  assert.ok(s.refs.has("Log"));
});

test("checkFlows flags a step whose line no longer names its symbol", () => {
  const [f] = checkFlows([{ id: "t", steps: [{ file: "js/core/log.js", symbol: "noSuchSymbolHere", line: 1, note: "" }] }]);
  assert.match(f.steps[0].stale, /noSuchSymbolHere/);
});
