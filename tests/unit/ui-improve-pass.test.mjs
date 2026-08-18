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

test("circuit select stacked uses one list scroller", () => {
  const css = read("css/menus.css");
  assert.doesNotMatch(css, /40 \* var\(--svhz\)/,
    "the 300px / 40svhz list cap was the nested-scroller hotfix");
  assert.doesNotMatch(css, /#sel-inner:not\(\[data-pair="on"\]\) > #sel-body > #sel-tracks \{[^}]*order:\s*-1/,
    "list-above-preview order was only needed while the body scrolled");
  assert.match(css, /#sel-inner:not\(\[data-pair="on"\]\) > #sel-body \{[\s\S]*?overflow:\s*hidden/,
    "stacked body is a flex column, not a vertical scroller");
  assert.match(css, /#sel-inner:not\(\[data-pair="on"\]\) > #sel-body > #sel-tracks \{[\s\S]*?flex:\s*1 1 0/,
    "the track list fills leftover body height from a zero basis");
  assert.match(css, /#sel-inner\[data-pair="on"\]:not\(\[data-shape="tall"\]\) #sel-track-section \{[\s\S]*?overflow:\s*hidden/,
    "wide preview column fits instead of scrolling as a second document");
});

test("garage stacked categories are a horizontal strip", () => {
  const css = read("css/carsetup.css");
  assert.doesNotMatch(css, /#cs-tabs\s*\{[\s\S]*?max-height:\s*48%/,
    "stacked tabs must not keep the wrapping 48% vertical catalogue");
  assert.match(css, /#cs-inner:not\(\[data-pair="on"\]\) #cs-tabs \.cs-tab/,
    "the strip is keyed on data-pair, not portrait orientation");
  assert.match(css, /#cs-tabs\s*\{[\s\S]*?overflow-x:\s*auto[\s\S]*?overflow-y:\s*hidden/,
    "stacked tabs pan sideways and override .pane overflow-y");
  assert.match(css, /#cs-inner\[data-pair="on"\] #cs-tabs \{[\s\S]*?overflow-y:\s*auto/,
    "pair-on rail may still scroll vertically");
  const js = read("js/game/setup-ui.js");
  assert.match(js, /scrollIntoView\(\{ block: "nearest", inline: "center" \}\)/);
});

test("circuit catalogue has a searchable filter toolbar", () => {
  const js = read("js/game/menus.js");
  const css = read("css/menus.css");
  assert.match(js, /search\.type = "search"/);
  assert.match(js, /search\.setAttribute\("aria-label", "Search circuits"\)/);
  assert.match(js, /row\.dataset\.search =/);
  assert.match(js, /function applyTrackSearch\(value\)/);
  assert.match(js, /bar\.setAttribute\("role", "group"\)/,
    "filters plus search are controls for one list, not a tablist");
  assert.match(js, /b\.tabIndex = trackFilter === id \? 0 : -1/,
    "filter chips keep a roving tab stop; search is its own");
  assert.match(css, /#sel-track-search\s*\{[\s\S]*?min-height:\s*var\(--chip-h\)/);
});

test("garage categories implement one roving tab system", () => {
  const js = read("js/game/setup-ui.js");
  assert.match(js, /tabs\.setAttribute\("role", "tablist"\)/);
  assert.match(js, /tab\.setAttribute\("role", "tab"\)/);
  assert.match(js, /tab\.setAttribute\("aria-controls", "cs-options"\)/);
  assert.match(js, /tab\.tabIndex = csActiveCat === id \? 0 : -1/);
  assert.match(js, /optsEl\.setAttribute\("role", "tabpanel"\)/);
  assert.match(js, /optsEl\.setAttribute\("aria-labelledby", csTabId\(csActiveCat\)\)/);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"])
    assert.match(js, new RegExp(`e\\.key === "${key}"`));
});

test("high-scale settings and Last Race retain useful local width", () => {
  const components = read("css/components.css");
  const data = read("css/data.css");
  assert.match(components, /@container sheet \(min-width: 380px\) and \(max-width: 519px\)[\s\S]*?repeat\(3/);
  assert.match(data, /\.dh-table\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?table-layout:\s*fixed/);
  assert.doesNotMatch(data, /\.dh-td-driver\s*\{[^}]*display:\s*flex/,
    "a table cell must not opt out of the fixed table layout");
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

test("extreme-scale journeys use local-width and compact-chrome contracts", () => {
  const shape = read("js/game/sheetshape.js");
  const tuner = read("css/tuner.css");
  const career = read("css/career.css");
  const data = read("css/data.css");
  const menus = read("css/menus.css");
  assert.match(shape, /function classifyFlag\(el, w, cssVar, attr, hyst/);
  assert.match(shape, /classifyRail\(el, wOwn\)/);
  assert.match(shape, /classifyFlag\(b, window\.innerWidth \/ scale, "--wide-at"/);
  assert.match(menus, /--wide-at:\s*620px/);
  assert.match(tuner, /--rail-at:\s*500px/);
  assert.match(tuner, /\[data-density="compact"\]\[data-rail="on"\]/);
  assert.doesNotMatch(tuner, /@media \(max-height: 430px\)/);
  assert.match(tuner, /\[data-density="compact"\]\[data-rail="off"\] #lt-head \{[^}]*display: block/);
  assert.match(tuner, /#lt-head h2, #ct-head/);
  assert.match(career, /#cr-inner\[data-density="compact"\] #cr-foot[\s\S]*?grid-template-columns/);
  assert.match(data, /body\[data-density="compact"\] \.dh-tab[\s\S]*?min-height:\s*var\(--tap-min\)/);
  assert.match(menus, /#ss-inner\[data-density="compact"\] #ss-cal \.season-upcoming-row[^{]*\{[^}]*flex-wrap:\s*wrap/);
});

test("an active career locks team and seat selection in the garage", () => {
  const setup = read("js/game/setup-ui.js");
  assert.match(setup, /const careerLocked = typeof Career !== "undefined" && Career\.inCareer && Career\.inCareer\(\)/);
  assert.match(setup, /card\.disabled = !!careerLocked/);
  assert.match(setup, /b\.disabled = taken \|\| careerLocked/);
  const game = read("js/game.js");
  assert.doesNotMatch(game, /careerActive:/);
});

test("camera picker is a keyboard radio menu and cannot outlive the race layer", () => {
  const camera = read("js/game/cam-modes.js");
  const game = read("js/game.js");
  assert.match(camera, /el\.setAttribute\("role", "menu"\)/);
  assert.match(camera, /b\.setAttribute\("role", "menuitemradio"\)/);
  assert.match(camera, /b\.setAttribute\("aria-checked", on \? "true" : "false"\)/);
  assert.match(camera, /setAttribute\("aria-haspopup", "menu"\)/);
  assert.match(camera, /setAttribute\("aria-expanded", "true"\)/);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End", "Escape"])
    assert.match(camera, new RegExp(`e\\.key === "${key}"`));
  assert.match(camera, /return \{ refreshCamBtn, setCamMode, cycleCam, hideCamPicker: camPicker\.hide \}/);
  assert.match(game, /function quitToMenu\(\) \{[\s\S]*?hideCamPicker\(\)/);
  assert.match(game, /function setPaused\(p\) \{[\s\S]*?hideCamPicker\(\)/);
});
