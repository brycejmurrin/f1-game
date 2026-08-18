import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

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
  // Portrait hands the leftover row to the button column (overlay scrollHeight
  // is a dead letter under zoom — see menus.css comment).
  assert.match(css, /orientation:\s*portrait[\s\S]*?minmax\(0,\s*1fr\)/);
  // HOW TO PLAY carries an icon like the other doors.
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /id="mb-help"[^>]*>[\s\S]*?btn-ico[\s\S]*?HOW TO PLAY/);
});

test("title keyboard navigation has an explicit default before stateful controls", () => {
  const html = read("index.html");
  const nav = read("js/game/menunav.js");
  assert.match(html, /id="mb-career"[^>]*\bdata-menu-default\b/);
  assert.match(nav, /const preferred = layer\.querySelector\("\[data-menu-default\]"\);/);
  assert.match(nav, /if \(preferred && list\.indexOf\(preferred\) >= 0\) return preferred;/);
  assert.match(nav, /const sel = layer\.querySelector\("\[aria-selected='true'\]/);
});

test("generated lighting and camera tabs carry the complete tab contract", () => {
  const html = read("index.html");
  const lighting = read("js/game/tuner.js");
  const camera = read("js/game/cam-tuner.js");

  assert.match(html, /id="lt-tabs"[^>]*role="tablist"[^>]*aria-label="Lighting categories"/);
  assert.match(html, /id="ct-modes"[^>]*role="tablist"[^>]*aria-label="Camera modes"/);
  assert.match(html, /id="ct-rows"[^>]*role="tabpanel"/);

  for (const src of [lighting, camera]) {
    assert.match(src, /setAttribute\("role", "tab"\)/);
    assert.match(src, /setAttribute\("aria-controls"/);
    assert.match(src, /setAttribute\("aria-selected"/);
    assert.match(src, /tabIndex = on \? 0 : -1/);
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      assert.match(src, new RegExp(`e\\.key === "${key}"`));
    }
  }

  assert.match(lighting, /wrap\.setAttribute\("role", "tabpanel"\)/);
  assert.match(lighting, /wrap\.setAttribute\("aria-labelledby"/);
  assert.match(lighting, /g\.hidden = !on/);
  assert.match(camera, /\$\("ct-rows"\)\.setAttribute\("aria-labelledby", b\.id\)/);
});

test("VS Friend text uses the menu type scale instead of sub-floor rem literals", () => {
  const css = read("css/overlays.css");
  const start = css.indexOf("/* ── VS FRIEND lobby");
  assert.notEqual(start, -1, "VS Friend CSS section missing");
  const section = css.slice(start);
  const offenders = [];
  for (const decl of section.matchAll(/font-size:\s*([^;}]*)/g)) {
    for (const size of decl[1].matchAll(/([0-9.]+)rem/g)) {
      if (parseFloat(size[1]) < 0.875) offenders.push(size[0]);
    }
  }
  assert.deepEqual(offenders, []);
  assert.match(section, /\.vs-ready\s*\{[\s\S]*?font-size:\s*var\(--fs-micro\)/);
  assert.match(section, /\.vs-summary dd\s*\{[^}]*font-size:\s*var\(--fs-2\)/);
});

test("closing track detail disconnects its observer and blocks queued hidden redraws", () => {
  const menus = read("js/game/menus.js");
  const game = read("js/game.js");
  assert.match(menus, /const drawDetail = function \(\) \{\s*\/\/[\s\S]*?if \(modal\.hidden\) return;/);
  assert.match(menus, /function closeTrackDetail\(\) \{[\s\S]*?detailRO\.disconnect\(\);[\s\S]*?detailRO = null;/);
  assert.match(menus, /return \{[^}]*openTrackDetail, closeTrackDetail,/);
  assert.match(game, /\$\("track-detail-close"\)\.onclick = closeTrackDetail;/);
});
