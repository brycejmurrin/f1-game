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
