/* menu-capture.test.mjs — menu-shot / menu-dom-gallery CLI contracts (no browser). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  cellFileBase,
  cellPaths,
  cellRecorded,
  listScreenIds,
  parseMenuGalleryArgv,
  pickScreens,
  SCREENS,
} = await import("../../tools/menu-capture.mjs");

test("cellFileBase and cellPaths agree", () => {
  const base = cellFileBase("settings", "ios-iphone-landscape");
  assert.equal(base, "settings__ios-iphone-landscape");
  const paths = cellPaths("/tmp/out", "settings", "ios-iphone-landscape");
  assert.match(paths.png, /settings__ios-iphone-landscape\.png$/);
  assert.match(paths.dom, /settings__ios-iphone-landscape\.dom\.json$/);
});

test("cellRecorded requires both png and dom", () => {
  const dir = path.join(ROOT, "artifacts", "menu-dom-gallery");
  if (!fs.existsSync(path.join(dir, "shots")) || !fs.existsSync(path.join(dir, "dom"))) {
    assert.equal(cellRecorded(dir, "missing", "ios-iphone-landscape"), false);
    return;
  }
  const shot = fs.readdirSync(path.join(dir, "shots"))[0];
  if (!shot) return;
  const id = shot.replace(/__.*\.png$/, "");
  const vp = shot.slice(id.length + 2, -4);
  assert.equal(typeof cellRecorded(dir, id, vp), "boolean");
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

test("menu-dom-gallery --list exits 0 without Chromium", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/menu-dom-gallery.mjs"), "--list"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /screens:/);
  assert.match(r.stdout, /ios-iphone-landscape/);
});

test("menu-shot --list exits 0 without Chromium", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/menu-shot.mjs"), "--list"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /settings|title/);
});
