// issue-labels — the label-scheme audit (tools/ci/issue-labels.mjs): one type, at least one area:*, PRs skipped,
// the verdict line and exit codes, every TYPE present in .github/labels.json, and that the CLI only ever GETs.
// No network: `api` is a stand-in. Every check is an exact equality.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TYPES, gapsOf, audit, render, labelsJsonNames, main } from "../../tools/ci/issue-labels.mjs";

test("gaps: no type, two types and no area are each named; source/phone/needs-device are never required", () => {
  assert.deepEqual(gapsOf(["bug", "area:ui"]), []);
  assert.deepEqual(gapsOf(["tracking", "area:tooling", "source:hunt", "phone"]), []);
  assert.deepEqual(gapsOf(["area:ui", "claimed"]), ["no type"]);
  assert.deepEqual(gapsOf(["bug", "tracking", "area:race"]), ["2 types: bug, tracking"]);
  assert.deepEqual(gapsOf(["refactor"]), ["no area"]);
  assert.deepEqual(gapsOf([]), ["no type", "no area"]);
});

test("audit skips pull requests and renders one OFF line per issue plus the verdict", () => {
  const issues = [
    { number: 1, title: "ok", labels: ["bug", "area:ui"] },
    { number: 2, title: "bare", labels: [] },
    { number: 3, title: "a PR", labels: [], pull_request: { url: "x" } },
  ];
  const r = audit(issues);
  assert.deepEqual(r.counts, { open: 2, off: 1 });
  assert.deepEqual(render(r), ["OFF #2 no type; no area [no labels]  — bare", "= issue-labels: 2 open, 1 off the scheme"]);
});

test("every type label is in .github/labels.json, the label source", () => {
  const names = labelsJsonNames();
  assert.deepEqual(TYPES.filter((t) => !names.includes(t)), []);
  assert.deepEqual(["area:input", "source:hunt", "source:gardener", "source:review", "phone", "needs-device"].filter((n) => !names.includes(n)), []);
});

test("CLI: GETs only; exit 0 on the scheme, 2 off it, 1 on a bad flag", () => {
  const seen = [];
  const api = (p, opts = {}) => { seen.push([opts.method || "GET", p]); return { json: p.includes("page=1") ? [{ number: 9, title: "t", labels: [{ name: "perf" }, { name: "area:perf" }] }] : [] }; };
  const out = [];
  assert.equal(main([], { api, log: (l) => out.push(l) }), 0);
  assert.deepEqual(out, ["= issue-labels: 1 open, 0 off the scheme"]);
  assert.ok(seen.every(([m]) => m === "GET"));
  const off = (p) => ({ json: p.includes("page=1") ? [{ number: 8, title: "t", labels: [] }] : [] });
  assert.equal(main([], { api: off, log: () => {} }), 2);
  assert.equal(main(["--bogus"], { api, log: () => {} }), 1);
});

test("labels.json rows are what labels-sync.yml can apply: unique names, 6-hex colours, 1-100 char descriptions", () => {
  const rows = JSON.parse(fs.readFileSync(new URL("../../.github/labels.json", import.meta.url), "utf8"));
  const bad = rows.filter((l) => !/^[0-9a-f]{6}$/.test(l.color) || !(l.description.length >= 1 && l.description.length <= 100)).map((l) => l.name);
  assert.deepEqual(bad, []);
  assert.equal(new Set(rows.map((l) => l.name)).size, rows.length);
});
