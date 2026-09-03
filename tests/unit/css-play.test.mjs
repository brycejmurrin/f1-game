/* css-play.test.mjs — the CSS-play loop's CLI and Playwright DOM surface.
 *
 * The loop is: host the working tree, open one screen, dump structured DOM
 * (boxes + computed + tokens), edit css/, hot-swap the stylesheet WITHOUT a
 * cache bump, screenshot. A tool that reloads via bump-cache mid-loop, or
 * that only has a screenshot and no DOM dump, is the failure this guards.
 *
 * PARSE / CONTRACT ONLY — the live Chromium path is a smoke the skill names,
 * not this suite (tooling-fast must stay no-browser).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = path.join(ROOT, "tools", "ui", "css-play.mjs");
const PW = path.join(ROOT, "tools", "playwright-mcp.sh");

const {
  parseCssPlayArgs,
  listScreens,
  resolveScreen,
  assertCssRel,
  collectDomInfo,
  SCREENS,
} = await import("../../tools/ui/css-play.mjs");

test("parseCssPlayArgs: screen, css hot-swap, sel, no-shot, json", () => {
  const a = parseCssPlayArgs([
    "--screen", "settings",
    "--css", "css/menus.css",
    "--sel", ".sheet",
    "--no-shot",
    "--json",
  ]);
  assert.equal(a.mode, "play");
  assert.equal(a.screen, "settings");
  assert.equal(a.css, "css/menus.css");
  assert.equal(a.sel, ".sheet");
  assert.equal(a.shot, false);
  assert.equal(a.json, true);
  assert.equal(a.viewport.width, 852);
  assert.equal(a.viewport.height, 393);
});

test("parseCssPlayArgs: positional screen and --list / --help", () => {
  assert.equal(parseCssPlayArgs(["garage"]).screen, "garage");
  assert.equal(parseCssPlayArgs(["--list"]).mode, "list");
  assert.equal(parseCssPlayArgs(["--help"]).mode, "help");
  assert.equal(parseCssPlayArgs(["--desktop"]).viewport.width, 1280);
});

test("resolveScreen aliases map onto the catalog", () => {
  assert.equal(resolveScreen("pmsettings"), "settings");
  assert.equal(resolveScreen("carsetup"), "garage");
  assert.equal(resolveScreen("overlay"), "title");
  assert.equal(resolveScreen("help"), "howtoplay");
  assert.equal(resolveScreen("pausemenu"), "pause");
  assert.throws(() => resolveScreen("not-a-screen"), /unknown screen/);
});

test("assertCssRel stays inside css/ and exists on disk", () => {
  assert.equal(assertCssRel("css/menus.css"), "css/menus.css");
  assert.throws(() => assertCssRel("../etc/passwd"), /css\/\*\.css|escapes/);
  assert.throws(() => assertCssRel("js/game.js"), /css\/\*\.css/);
  assert.throws(() => assertCssRel("css/../index.html"), /escapes|css\/\*\.css/);
});

test("every css-play screen id is a menu-screens screen", () => {
  const audit = fs.readFileSync(path.join(ROOT, "tools", "ui", "menu-screens.mjs"), "utf8");
  const known = new Set([...audit.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
  const ids = Object.keys(SCREENS);
  assert.ok(ids.length >= 6, `expected the title-path set, got ${ids.join(",")}`);
  const missing = ids.filter((id) => !known.has(id));
  assert.deepEqual(missing, [],
    "css-play invented a screen menu-screens does not open — reuse an audit id or add it there first");
});

test("listScreens names a root and a click path", () => {
  const rows = listScreens();
  const settings = rows.find((r) => r.id === "settings");
  assert.ok(settings, "settings missing from --list");
  assert.equal(settings.root, "#pmsettings");
  assert.ok(settings.clicks.includes("#mb-settings"));
});

test("collectDomInfo is a page-serialisable function (no Node closes)", () => {
  const src = collectDomInfo.toString();
  assert.match(src, /getBoundingClientRect/);
  assert.match(src, /getComputedStyle/);
  assert.match(src, /--tap/);
  assert.match(src, /UiLayers/);
  assert.match(src, /topEl\.id/);
  assert.match(src, /currentCSSZoom/);
  assert.doesNotMatch(src, /\bROOT\b|\b__dirname\b|\bprocess\./);
});

test("css-play --help answers without a browser and names the loop", () => {
  const r = spawnSync(process.execPath, [TOOL, "--help"], {
    encoding: "utf8", cwd: ROOT, timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const text = `${r.stdout}\n${r.stderr}`;
  assert.match(text, /--screen/);
  assert.match(text, /--css/);
  assert.match(text, /hot-swap|hot swap/i);
  assert.match(text, /--no-shot/);
  assert.match(text, /artifacts\/css-play/);
  assert.doesNotMatch(text, /bump-cache --apply/);
});

test("css-play --list prints screen ids without Chromium", () => {
  const r = spawnSync(process.execPath, [TOOL, "--list"], {
    encoding: "utf8", cwd: ROOT, timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /title/);
  assert.match(r.stdout, /settings/);
  assert.match(r.stdout, /#pmsettings/);
  assert.match(r.stdout, /pause/);
  assert.match(r.stdout, /#pausemenu/);
});

test("the tool uses harness.mjs and never bumps cache", () => {
  const src = fs.readFileSync(TOOL, "utf8");
  assert.match(src, /from ["']\.{1,2}\/(?:lib\/)?harness\.mjs["']/);
  assert.doesNotMatch(src, /bump-cache\.mjs/);
  assert.doesNotMatch(src, /spawn\(\s*["']python3["']/);
  assert.match(src, /visibility["']:\s*["']hidden["']|#game[\s\S]{0,80}hidden/);
  assert.match(src, /\?play=/);
});

test("playwright-mcp.sh grows play + dom commands that call css-play", () => {
  const help = spawnSync("bash", [PW, "help"], {
    encoding: "utf8", cwd: ROOT, timeout: 15000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /\bdom\b/);
  assert.match(help.stdout, /\bplay\b/);
  assert.match(help.stdout, /css-play\.mjs/);
  const src = fs.readFileSync(PW, "utf8");
  assert.match(src, /css-play\.mjs/);
  assert.match(src, /cmd_dom|dom\)/);
});
