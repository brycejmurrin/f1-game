import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gWriteSites, gWriteReport, gWrites, byFile } from "../../tools/check/tree-counts.mjs";

const dflt = JSON.parse(fs.readFileSync(new URL("../../tools/check/g-owners.json", import.meta.url), "utf8")).default;

test("a G.<member> write in a fixture create() module is one row", async () => {
  assert.deepEqual(await gWriteSites("js/core/log.js", "function create(G){ G.raceT = 1; }", {}),
    [{ file: "js/core/log.js", member: "raceT", line: 1 }]);
});

test("a write in the member's owner file is not counted", async () => {
  const src = "function create(G){ G.raceT = 1; G.other = 2; }";
  assert.deepEqual(await gWriteSites("js/core/log.js", src, { raceT: "js/core/log.js" }),
    [{ file: "js/core/log.js", member: "other", line: 1 }]);
  assert.equal((await gWriteSites("js/core/log.js", src, { raceT: dflt })).length, 2);
});

test("a local G that is not the create() parameter is not counted", async () => {
  const src = "function create(ctx){ const G = {}; G.a = 1; ctx.b = 2; }";
  assert.deepEqual((await gWriteSites("js/core/log.js", src, {})).map((r) => r.member), ["b"]);
});

test("+= and ++ are writes; delete and reads are not", async () => {
  const src = "function create(G){ G.a += 1; G.b++; delete G.c; const x = G.d; }";
  assert.deepEqual((await gWriteSites("js/core/log.js", src, {})).map((r) => r.member), ["a", "b"]);
});

test("live tree: total equals the per-file sum; apex.js and agentview.js have rows", async () => {
  const rows = await gWriteReport();
  const files = byFile(rows);
  assert.equal(await gWrites(), Object.values(files).reduce((a, b) => a + b, 0));
  assert.ok(files["js/agent/apex.js"] > 0);
  assert.ok(Object.keys(files).some((f) => f.endsWith("agentview.js")));
});
