/* layout-audit CLI contracts (no browser) — gallery / list / survey flags. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  writeCaptureIndex,
  cellFileBase,
  cellPaths,
  cellRecorded,
  listScreenIds,
  parseMenuGalleryArgv,
  pickScreens,
  SCREENS,
} = await import("../../tools/ui/menu-capture.mjs");

test("cellFileBase and cellPaths agree", () => {
  const base = cellFileBase("settings", "ios-iphone-landscape");
  assert.equal(base, "settings__ios-iphone-landscape");
  const paths = cellPaths("/tmp/out", "settings", "ios-iphone-landscape");
  assert.match(paths.png, /settings__ios-iphone-landscape\.png$/);
  assert.match(paths.dom, /settings__ios-iphone-landscape\.dom\.json$/);
});

test("cellRecorded requires both png and dom", () => {
  const dir = path.join(ROOT, "artifacts", "layout-audit", "gallery");
  assert.equal(cellRecorded(dir, "missing", "ios-iphone-landscape"), false);
});

test("parseMenuGalleryArgv picks screens and viewports", () => {
  const a = parseMenuGalleryArgv(["--screens=title,garage", "--viewports=ios-iphone-landscape", "--jobs=1"]);
  assert.equal(a.jobs, 1);
  assert.deepEqual(a.screens.map((s) => s.id), ["title", "garage"]);
  assert.equal(a.viewports.length, 1);
  assert.equal(a.viewports[0][0], "ios-iphone-landscape");
});

test("pickScreens supports wildcards", () => {
  const picked = pickScreens(SCREENS, "data*");
  assert.ok(picked.length >= 4);
  assert.ok(picked.every((s) => s.id.startsWith("data")));
});

test("listScreenIds matches SCREENS length", () => {
  assert.equal(listScreenIds().length, SCREENS.length);
});

test("layout-audit --list exits 0 without Chromium", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ui/layout-audit.mjs"), "--list"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /screens:/);
  assert.match(r.stdout, /ios-iphone-landscape/);
});

test("layout-audit --help names gallery and survey", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ui/layout-audit.mjs"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /--gallery/);
  assert.match(r.stdout, /--survey/);
  assert.match(r.stdout, /--screen=/);
});

test('menu screenshot report renders responsive native screen navigation and DOM links', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'artifacts', 'menu-static-'));
  try {
    writeCaptureIndex(dir, [
      { screen: 'garage', viewport: 'phone', shot: 'garage.png', dom: 'garage.dom.json' },
      { screen: 'settings', viewport: 'desktop', shot: 'settings.png' },
      { screen: 'career', viewport: 'phone', skipped: 'boot failed' },
    ]);
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<script\b|<table\b|<select\b/);
    assert.match(html, /href="#gallery-2"/);
    assert.match(html, /href="garage.dom.json"/);
    assert.match(html, /name="viewport"/);
    assert.equal((html.match(/class="capture /g) || []).length, 2);
    assert.match(html, /SKIPPED \(1\)[\s\S]*career · phone — boot failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("layout-audit --diff flags a new finding, credits a fix, and never counts a skip as a pass", async () => {
  const { diffAudits, formatDiff } = await import("../../tools/ui/audit-diff.mjs");
  const before = { rows: [
    { screen: "title", viewport: "v1", clipped: [], offscreen: [{ el: "#a" }] },
    { screen: "garage", viewport: "v1", clipped: [] },
    { screen: "select", viewport: "v1", skipped: "timeout" },
    { screen: "career", viewport: "v1" },
  ] };
  const after = { rows: [
    { screen: "title", viewport: "v1", clipped: [], offscreen: [] },
    { screen: "garage", viewport: "v1", clipped: [{ el: "#tab", by: ".sheet" }], docOverflowX: true },
    { screen: "select", viewport: "v1", clipped: [{ el: "#x", by: "#y" }] },
  ] };
  const d = diffAudits(before, after);
  assert.deepEqual(d.added.map((x) => x.cell + " " + x.finding),
    ["garage|v1 clipped: #tab past .sheet", "garage|v1 docOverflowX"]);
  assert.deepEqual(d.removed.map((x) => x.finding), ["offscreen: #a"]);
  assert.deepEqual(d.skipped, ["select|v1"]);
  assert.deepEqual(d.missing, ["career|v1"]);
  assert.match(formatDiff(d).at(-1), /^= diff NEW: 2 cells compared, 2 new, 1 fixed, 1 skipped/);
  assert.match(formatDiff(diffAudits(after, after)).at(-1), /^= diff ok/);

  // The CLI path: exits before any browser launch, 1 on a new finding, 0 when clean.
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "audit-diff-test-"));
  try {
    const b = path.join(dir, "before.json"), a = path.join(dir, "after.json");
    fs.writeFileSync(b, JSON.stringify(before));
    fs.writeFileSync(a, JSON.stringify(after));
    const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, "tools/ui/layout-audit.mjs"), ...args], { encoding: "utf8" });
    const red = cli("--diff=" + b, "--after=" + a);
    assert.equal(red.status, 1, red.stderr || red.stdout);
    assert.match(red.stdout, /^\+ garage\|v1 {2}clipped: #tab past \.sheet$/m);
    const green = cli("--diff", a, "--after=" + a);
    assert.equal(green.status, 0, green.stderr || green.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
