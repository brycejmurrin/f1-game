// load-census.test.mjs — tools/perf/load-census.mjs agrees with tools/manifest.cjs, and the #6609 budget file's shape.
// Deterministic, no browser: the census sizes files on disk, so it is held to the manifest and to boot-wall.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { census, manifestGroups, summary, toMarkdown, vendorThreeFiles } from "../../tools/perf/load-census.mjs";
import { wallNow } from "../../tools/check/boot-wall.mjs";

const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
const budget = JSON.parse(fs.readFileSync(new URL("../data/load-budget.json", import.meta.url), "utf8"));
const c = census({ withFiles: true });

test("every manifest file group is in the census, file for file, in manifest order", () => {
  const lazy = Object.keys(manifest).filter((k) => /^LAZY_/.test(k) && !/_EDGES$/.test(k) && Array.isArray(manifest[k]));
  const want = ["FULL", ...Object.keys(manifest.DEFERRED).map((k) => `DEFERRED.${k}`), ...lazy, "VENDOR_THREE"];
  assert.deepEqual(c.groups.map((g) => g.group), want);
  for (const { group, files } of manifestGroups(manifest)) {
    const row = c.groups.find((g) => g.group === group);
    assert.deepEqual(row.files.map((f) => f.file), files, group);
    assert.equal(row.count, files.length, group);
  }
});

test("group sums are the per-file sums; gzip and stripped code never exceed raw for app code", () => {
  for (const g of c.groups) {
    for (const k of ["raw", "gz", "code"]) assert.equal(g[k], g.files.reduce((a, f) => a + f[k], 0), `${g.group}.${k}`);
    if (g.group !== "VENDOR_THREE") assert.ok(g.gz < g.raw && g.code <= g.raw, g.group);
  }
});

test("FULL is the boot wall: same scripts and stripped bytes as boot-wall.mjs", () => {
  const wall = wallNow();
  const s = summary(c);
  assert.equal(s.eagerScripts, wall.scripts);
  assert.equal(s.eagerRaw, wall.bytes);
  assert.equal(s.eagerCodeBytes, wall.codeBytes);
});

test("VENDOR_THREE is the importmap's three files plus three.core", () => {
  const files = vendorThreeFiles();
  assert.ok(files.length >= 3, files.join(","));
  assert.ok(files.some((f) => f.endsWith("three.core.min.js")) && files.some((f) => f.endsWith("three.webgpu.min.js")));
});

test("the census is deterministic and every group says when it loads", () => {
  assert.deepEqual(census(), census());
  for (const g of c.groups) assert.ok(budget.groupWhen[g.group], `tests/data/load-budget.json groupWhen lacks ${g.group}`);
  for (const k of Object.keys(budget.groupWhen)) assert.ok(c.groups.some((g) => g.group === k), `groupWhen names unknown group ${k}`);
  const mdGroups = toMarkdown(census()).split("## Load ladder")[0].split("\n").filter((l) => /^\| [A-Z]/.test(l) && !l.startsWith("| group")).map((l) => l.split(" | ")[0].slice(2));
  assert.deepEqual(mdGroups, c.groups.map((g) => g.group), "the markdown has one row per group, in census order");
});

test("load-budget.json: P0..P4, phone budgets advisory (D1 b), sw budgets gate, no cinematics budget (D3)", () => {
  assert.deepEqual(budget.phases.map((p) => p.id), ["P0", "P1", "P2", "P3", "P4"]);
  for (const p of budget.phases) {
    assert.equal(p.phone.advisory, true, `${p.id} phone`);
    assert.equal(p.sw.gate, true, `${p.id} sw`);
    assert.ok(p.sw.enforcedBy || Number.isInteger(p.sw.step), `${p.id}: sw budget names its test or the #6609 step that wires it`);
    assert.ok(!JSON.stringify(p).match(/cinematic|flyby|driveOut/i), `${p.id}: D3 keeps the cinematics unbudgeted`);
  }
});
