import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("CssZoom helper ships before sheetshape and menunav", () => {
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  const iZoom = man.indexOf('"js/game/css-zoom.js"');
  const iSheet = man.indexOf('"js/game/sheetshape.js"');
  const iNav = man.indexOf('"js/game/menunav.js"');
  assert.ok(iZoom > 0, "css-zoom.js must be in the manifest");
  assert.ok(iZoom < iSheet, "css-zoom before sheetshape");
  assert.ok(iSheet < iNav, "sheetshape before menunav");
});

test("CssZoom API surface is documented in the file header and exports", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game/css-zoom.js"), "utf8");
  for (const name of ["of", "viewportRect", "localRect", "localBox", "toLocalDelta", "rectsAreVisual"]) {
    assert.match(src, new RegExp("\\b" + name + "\\b"), `CssZoom.${name}`);
  }
  assert.match(src, /window\.CssZoom/);
});

test("data hub card carries UI SIZE zoom", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");
  assert.match(css, /\.dh-card\s*\{[\s\S]*?zoom:\s*var\(--ui-scale\)/);
});

test("garage livery grid class is wired", () => {
  const js = fs.readFileSync(path.join(ROOT, "js/game/setup-ui.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
  assert.match(js, /cs-liv-grid/);
  assert.match(css, /#cs-options\.cs-liv-grid/);
  const clear = js.indexOf('optsEl.classList.remove("cs-liv-grid")');
  const team = js.indexOf('csActiveCat === "team"');
  assert.ok(clear > 0 && clear < team,
    "cs-liv-grid must be cleared before the TEAM branch, or the team card inherits the swatch grid");
});

test("select track filter persists via store", () => {
  const js = fs.readFileSync(path.join(ROOT, "js/game/menus.js"), "utf8");
  assert.match(js, /trackFilter/);
  assert.match(js, /store\.set\("trackFilter"/);
  assert.match(js, /\["classic", "CLASSICS"\]/);
});

test("compact title column scrolls instead of clipping at high UI SIZE", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/menus.css"), "utf8");
  // Cap + scroll on #menu-buttons under body[data-density=compact] (layout only).
  assert.match(css, /body\[data-density="compact"\]\)\s*#menu-buttons/);
  assert.match(css, /max-height:\s*calc\(100 \* var\(--svhz\)/);
  assert.match(css, /align-content:\s*safe center/);
  assert.match(css, /padding-inline:\s*var\(--gap\)/);
  // Portrait hands the leftover row to the button column (overlay scrollHeight
  // is a dead letter under zoom — see menus.css comment).
  assert.match(css, /orientation:\s*portrait[\s\S]*?minmax\(0,\s*1fr\)/);
  // HOW TO PLAY carries an icon like the other doors.
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /id="mb-help"[^>]*>[\s\S]*?btn-ico[\s\S]*?HOW TO PLAY/);
});
