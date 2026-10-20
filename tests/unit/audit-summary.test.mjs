/* audit-summary.test.mjs — the bounded layout-audit summary: worst cells first, skips apart, never the whole grid.
 *
 * Fixture rows only (no browser). The definitions under test are layout-audit's own: a red cell has clipped, offscreen,
 * tiny-tap, under-hardware, starved or error findings or a document x-overflow; a skipped cell was not measured and is
 * counted apart; deepScroll is amber.
 *
 * Run: node --test tests/unit/audit-summary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isBad, severity, findingHead, summarize, readAudit, DEFAULT_DIR } from "../../tools/ui/audit-summary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "tools/ui/audit-summary.mjs");
const el = (n, extra = {}) => ({ el: `#btn-${n}`, ...extra });
const row = (screen, viewport, o = {}) => ({ screen, viewport, ...o });

const GRID = {
  build: "abc123",
  rows: [
    row("title", "iphone", {}),
    row("title", "desktop", { smallTaps: [el(1), el(2)] }),
    row("settings", "iphone", { clipped: [el(3, { by: "#panel" }), el(4)], offscreen: [el(5)], tinyTaps: [el(6)] }),
    row("settings", "desktop", { docOverflowX: true }),
    row("garage", "iphone", { truncated: [{ el: "#name", text: "A very long driver name" }], deepScroll: [{ el: "#list" }] }),
    row("garage", "desktop", { skipped: "page.click: Timeout 12000ms exceeded" }),
    row("hud", "iphone", { starved: [el(7)], errors: ["TypeError: x is not a function"] }),
  ],
};

test("isBad follows layout-audit: hard findings and x-overflow are red; soft ones and skips are not", () => {
  assert.equal(isBad(row("a", "b", {})), false);
  assert.equal(isBad(row("a", "b", { smallTaps: [el(1)] })), false);
  assert.equal(isBad(row("a", "b", { truncated: [el(1)], deepScroll: [el(1)] })), false);
  for (const k of ["clipped", "offscreen", "tinyTaps", "underHardware", "starved", "errors"]) assert.equal(isBad(row("a", "b", { [k]: [el(1)] })), true, k);
  assert.equal(isBad(row("a", "b", { docOverflowX: true })), true);
  assert.equal(isBad(row("a", "b", { skipped: "boom", clipped: [el(1)] })), false, "a skipped cell was not measured");
});

test("severity orders hard findings above soft ones and gives a skipped cell nothing", () => {
  assert.equal(severity(row("a", "b", {})), 0);
  assert.equal(severity(row("a", "b", { skipped: "x", clipped: [el(1)] })), 0);
  assert.ok(severity(row("a", "b", { docOverflowX: true })) > severity(row("a", "b", { clipped: [el(1)] })));
  assert.ok(severity(row("a", "b", { clipped: [el(1)] })) > severity(row("a", "b", { smallTaps: Array.from({ length: 9 }, (_, i) => el(i)) })));
});

test("summarize counts cells, red cells, skips and deepScroll apart, with totals and the build", () => {
  const { lines, data } = summarize(GRID);
  assert.equal(lines[0], "AUDIT cells=7 bad=3 skipped=1 deepScroll=1 build=abc123");
  assert.deepEqual([data.cells, data.bad, data.skipped, data.deepScroll], [7, 3, 1, 1]);
  const totals = lines.find((l) => l.startsWith("TOTALS "));
  for (const part of ["clipped 2", "offscreen 1", "tapUnder24 1", "starved 1", "err 1", "tapSoft 2", "trunc 1", "deepScroll 1", "xOverflowCells 1"]) assert.ok(totals.includes(part), part);
  assert.ok(lines.includes("SKIPPED 1 (nothing measured: re-run each alone, not a finding)"));
  assert.ok(lines.includes("  garage @ desktop: page.click: Timeout 12000ms exceeded"));
});

test("worst cells come first, each with at most two finding heads, and the rollup counts red cells per screen", () => {
  const { lines } = summarize(GRID, { top: 3 });
  const cells = lines.filter((l) => l.startsWith("CELL "));
  assert.equal(cells.length, 3);
  assert.equal(cells[0], "CELL settings @ iphone: clipped 2 offscreen 1 tapUnder24 1");
  assert.ok(cells[1].startsWith("CELL hud @ iphone"));
  const afterFirst = lines.slice(lines.indexOf(cells[0]) + 1, lines.indexOf(cells[1]));
  assert.equal(afterFirst.length, 2);
  assert.ok(afterFirst[0].includes("clipped: #btn-3 by #panel"));
  assert.ok(lines.some((l) => l.startsWith("… ") && l.includes("more cells with findings")));
  assert.equal(lines.find((l) => l.startsWith("BYSCREEN ")), "BYSCREEN settings 2, hud 1");
});

test("filters narrow the cells and say how many were left out; an empty match says so", () => {
  const s = summarize(GRID, { screen: "settings" });
  assert.equal(s.lines[0], "AUDIT cells=2 (of 7) bad=2 skipped=0 deepScroll=0 build=abc123");
  assert.equal(summarize(GRID, { viewport: "desktop" }).data.cells, 3);
  const none = summarize(GRID, { screen: "nope" });
  assert.ok(none.lines.includes("NOCELLS the filters matched nothing"));
});

test("a clean grid says CLEAN; a grid with skips never does", () => {
  const clean = { rows: [row("a", "x", {}), row("b", "x", {})] };
  assert.ok(summarize(clean).lines.includes("CLEAN no cell has a red finding"));
  const skippy = { rows: [row("a", "x", {}), row("b", "x", { skipped: "no root" })] };
  assert.ok(!summarize(skippy).lines.includes("CLEAN no cell has a red finding"));
});

test("--cell expands one cell with each category capped at eight kinds of finding", () => {
  const many = { rows: [row("settings", "iphone", { clipped: Array.from({ length: 11 }, (_, i) => el(i)), docOverflowX: true })] };
  const { lines } = summarize(many, { cell: "settings@iphone" });
  assert.equal(lines[0], "CELL settings @ iphone: clipped 11 xOverflow");
  assert.ok(lines.includes("  clipped (11)"));
  assert.equal(lines.filter((l) => l.startsWith("    #btn-")).length, 8);
  assert.ok(lines.includes("    … 3 more kinds (3 findings)"));
  assert.ok(lines.includes("  document overflows horizontally"));
  assert.ok(summarize(many, { cell: "nope@x" }).lines[0].startsWith("NOCELL nope@x"));
});

test("--cell collapses identical finding heads into a count (a real clipped list repeated one line five times)", () => {
  const dup = { rows: [row("title", "desktop", { clipped: [...Array.from({ length: 5 }, () => ({ el: "g", by: "#title-car" })), { el: "#tc-frame", by: "#title-car" }, ...Array.from({ length: 2 }, () => ({ el: "path", by: "#title-car" }))] })] };
  const { lines } = summarize(dup, { cell: "title@desktop" });
  assert.deepEqual(lines.slice(1), ["  clipped (8)", "    g by #title-car ×5", "    #tc-frame by #title-car", "    path by #title-car ×2"]);
  const capped = { rows: [row("a", "b", { clipped: [...Array.from({ length: 9 }, (_, i) => el(i)), ...Array.from({ length: 4 }, () => el(0))] })] };
  assert.ok(summarize(capped, { cell: "a@b" }).lines.includes("    … 1 more kinds (1 findings)"));
});

test("the output is bounded: a 600-cell grid prints about top*3 plus a dozen lines, not 600", () => {
  const rows = Array.from({ length: 600 }, (_, i) => row(`screen${i % 24}`, `vp${i % 25}`, { clipped: [el(i), el(i + 1)], offscreen: [el(i)] }));
  const { lines } = summarize({ rows }, { top: 12 });
  assert.ok(lines.length <= 12 * 3 + 12, `${lines.length} lines`);
  assert.ok(lines.join("\n").length < 6000);
  assert.equal(lines[0].startsWith("AUDIT cells=600 bad=600"), true);
});

test("findingHead reads strings, el/by/text entries and unknown objects, cut with an ellipsis", () => {
  assert.equal(findingHead("plain text"), "plain text");
  assert.equal(findingHead({ el: "#a", by: "#b" }), "#a by #b");
  assert.equal(findingHead({ el: "#a", text: "hello" }), '#a "hello"');
  assert.equal(findingHead({ weird: 1 }), '{"weird":1}');
  assert.equal(findingHead({ el: "x".repeat(200) }, 20), `${"x".repeat(19)}…`);
  assert.equal(findingHead(null), "");
});

test("readAudit takes a directory or a file and refuses anything that is not an audit", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-summary-"));
  fs.writeFileSync(path.join(dir, "audit.json"), JSON.stringify(GRID));
  assert.equal(readAudit(dir).rows.length, 7);
  assert.equal(readAudit(path.join(dir, "audit.json")).build, "abc123");
  assert.throws(() => readAudit(path.join(dir, "missing")), /no audit\.json/);
  fs.writeFileSync(path.join(dir, "bad.json"), "{nope");
  assert.throws(() => readAudit(path.join(dir, "bad.json")), /not valid JSON/);
  fs.writeFileSync(path.join(dir, "other.json"), JSON.stringify({ rows: "x" }));
  assert.throws(() => readAudit(path.join(dir, "other.json")), /no rows array/);
});

test("the CLI prints the summary, defaults to layout-audit's folder, --json prints one object, and a bad argument exits 2 without a stack", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-summary-"));
  fs.writeFileSync(path.join(dir, "audit.json"), JSON.stringify(GRID));
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8", cwd: ROOT });
  const ok = run(dir, "--top", "2");
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.startsWith("AUDIT cells=7 bad=3"));
  const js = JSON.parse(run(dir, "--json").stdout);
  assert.equal(js.data.bad, 3);
  assert.ok(Array.isArray(js.lines));
  assert.equal(run(dir, "--cell", "settings@iphone").stdout.split("\n")[0], "CELL settings @ iphone: clipped 2 offscreen 1 tapUnder24 1");
  // no target = layout-audit's own output folder (the geometry run ignores --out), run from a cwd that has one
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "audit-summary-cwd-"));
  fs.mkdirSync(path.join(cwd, DEFAULT_DIR), { recursive: true });
  fs.writeFileSync(path.join(cwd, DEFAULT_DIR, "audit.json"), JSON.stringify(GRID));
  const bare = spawnSync(process.execPath, [CLI, "--top", "1"], { encoding: "utf8", cwd });
  assert.equal(bare.status, 0, bare.stdout);
  assert.ok(bare.stdout.startsWith("AUDIT cells=7 bad=3"));
  const missing = spawnSync(process.execPath, [CLI], { encoding: "utf8", cwd: fs.mkdtempSync(path.join(os.tmpdir(), "audit-summary-empty-")) });
  assert.equal(missing.status, 2);
  assert.ok(missing.stdout.includes("no audit.json at artifacts/layout-audit"));
  for (const bad of [[dir, "--top", "0"], [dir, "--top", "x"], [path.join(dir, "nope")]]) {
    const r = run(...bad);
    assert.equal(r.status, 2, bad.join(" "));
    assert.ok(r.stdout.startsWith("ERROR "), r.stdout);
    assert.equal(r.stderr, "");
  }
});
