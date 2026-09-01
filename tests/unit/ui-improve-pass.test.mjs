import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("UI audit scale axis includes the product's 40% minimum", async () => {
  const { parseScales } = await import("../../tools/ui-scale-axis.mjs");
  assert.deepEqual(parseScales(["--scale=40,200"]), [40, 200]);
  assert.throws(() => parseScales(["--scale=39.75"]), /between 40 and 200/);
});

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

test("data hub card carries UI SIZE zoom (fit-capped like a sheet)", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");
  // var(--sheet-scale, var(--ui-scale)): the card is fit-managed, so
  // SheetShape may cap the requested slider on a short window — the fallback
  // keeps the plain UI SIZE contract this test originally pinned.
  assert.match(css, /\.dh-card\s*\{[\s\S]*?zoom:\s*var\(--sheet-scale,\s*var\(--ui-scale\)\)/);
  const js = fs.readFileSync(path.join(ROOT, "js/data/hub.js"), "utf8");
  assert.match(js, /dh-card fit-managed/, "the card must join the classifyFit scan");
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
  assert.match(read("css/menus.css"), /#sel-inner\s*\{[^}]*--pair-compact\s*:\s*wide/,
    "compact wide SELECT pairs so the catalogue sits in the right column");
  assert.match(read("js/game/sheetshape.js"), /mode === "wide"/);
  assert.doesNotMatch(read("js/game/scrollfade.js"), /"\.pane", "#sel-body"/);
  assert.doesNotMatch(read("js/game/menunav.js"), /\.pane,#sel-body/);
  assert.doesNotMatch(read("tools/layout-audit.mjs"), /\.pane,#sel-body/);
  assert.match(read("js/game/scrollfade.js"), /overflowY/,
    "fade thumbs require overflow-y auto/scroll, not hidden content height");
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
  assert.match(read("css/components.css"), /\.pane-pair\s*\{[^}]*--pair-compact\s*:\s*off/,
    "compact garage stacks to the horizontal strip via --pair-compact");
  assert.match(css, /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) #cs-tabs \{[\s\S]*?grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/,
    "short wide stacked garage packs fourteen tabs as two rows of seven");
  assert.match(css, /#cs-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\]:not\(\[data-shape="tall"\]\) #cs-tabs \{[\s\S]*?max-height:/,
    "wrapped play-shape tabs cap at two rows so #cs-options keeps a list");
  assert.doesNotMatch(css, /#cs-inner:not\(\[data-pair="on"\]\):is\(\[data-shape="tall"\], \[data-density="compact"\]\) #cs-tabs \{[\s\S]*?flex-wrap:\s*wrap/,
    "tall stacked garage must keep the horizontal strip — wrapping 14 tabs starved options");
  assert.match(read("css/components.css"), /\.pane-pair\s*\{[^}]*--pair-compact\s*:\s*off/,
    "garage still inherits the .pane-pair default stack");
  assert.match(read("css/career.css"), /#cr-inner\s*\{[^}]*--pair-compact\s*:\s*wide/,
    "compact career hub pairs on a short landscape sheet");
  assert.match(read("css/menus.css"), /#ss-inner\s*\{[^}]*--pair-compact\s*:\s*wide/,
    "compact season pairs on a short landscape sheet");
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

test("compact landscape catalogue spends its first viewport on a circuit", () => {
  const css = read("css/menus.css");
  assert.match(css,
    /#sel-inner\[data-density="compact"\]:not\(\[data-shape="tall"\]\) \.track-group-head\s*\{[^}]*display:\s*none/);
  assert.match(css,
    /#sel-inner\[data-density="compact"\]:not\(\[data-shape="tall"\]\) #sel-track-filter \{[\s\S]*?overflow-x:\s*auto/,
    "compact landscape filter pans in both stacked and paired columns");
  assert.match(css,
    /#sel-inner\[data-density="compact"\]:not\(\[data-shape="tall"\]\) #sel-track-search \{[\s\S]*?min-width:\s*12rem/,
    "search keeps a readable floor so the row actually overflows at 200%");
  assert.doesNotMatch(css, /@container sheet \(max-width: 360px\)/);
  assert.doesNotMatch(css, /@container sheet \(max-width: 440px\)/);
  assert.doesNotMatch(css,
    /#sel-inner\[data-density="compact"\]:not\(\[data-pair="on"\]\):not\(\[data-shape="tall"\]\)\s*>\s*#sel-body\s*>\s*#sel-track-section\s*\{[^}]*display:\s*none/,
    "compact stacked landscape must keep the thumbnail band; hiding the section dropped the map");
  const menusJs = read("js/game/menus.js");
  assert.match(css, /max-height:\s*min\(calc\(var\(--chip-h\) \* 3\.5\), 100%\)/);
  assert.match(css, /max-width:\s*min\(48%, calc\(var\(--chip-h\) \* 5\.2\)\)/);
  assert.match(css,
    /#sel-inner:not\(\[data-pair="on"\]\)\[data-density="compact"\] > #sel-body > #sel-track-section \{[\s\S]*?max-height:\s*58%/,
    "compact stacked band spends more of the body on the map without eating the list");
  assert.doesNotMatch(css, /#sel-inner\[data-fit="on"\] #sel-preview-map\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /@container sheet \(max-width: 420px\)/);
  assert.match(menusJs, /cardInnerW \* \(compact \? 0\.48 : 0\.42\)/);
  assert.match(menusJs, /chipH \* \(compact \? 5\.2 : 3\.5\)/);
  assert.match(menusJs, /slotH: chipH \* 3\.5/,
    "CSS and JS stay in lockstep — fitCanvas pins max-height inline");
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
  assert.match(components, /\.balanced-row\s*>\s*:not\(\[hidden\]\)/);
  assert.doesNotMatch(components, /@container sheet \(min-width: 380px\) and \(max-width: 519px\)/);
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

test("tuner tabs scroll the selected chip into view", () => {
  const lighting = read("js/game/tuner.js");
  const camera = read("js/game/cam-tuner.js");
  for (const src of [lighting, camera]) {
    assert.match(src, /scrollIntoView\(\{\s*block:\s*"nearest",\s*inline:\s*"center"\s*\}\)/);
  }
});

test("camera reset actions state their scope", () => {
  const html = read("index.html");
  assert.match(html, /id="ct-reset"[^>]*title=/);
  assert.match(html, /id="ct-reset-all"[^>]*title=/);
});

test("lighting tuner preview uses G facade, not __apex (Pages has no agent surface)", () => {
  const lighting = read("js/game/tuner.js");
  assert.doesNotMatch(lighting, /__apex/);
  assert.match(lighting, /setTimeOfDay/);
  assert.match(lighting, /weather/);
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
  assert.match(shape, /classifyRail\(el, wOwn, hOwn\)/);
  assert.match(shape, /rowsAvail >= 3/);
  assert.match(shape, /classifyFlag\(b, wOwn, "--wide-at"/);
  assert.match(menus, /--wide-at:\s*620px/);
  assert.match(tuner, /--rail-at:\s*500px/);
  assert.match(tuner, /\[data-density="compact"\]\[data-rail="on"\]/);
  assert.doesNotMatch(tuner, /@media \(min-width:\s*720px\)/);
  assert.doesNotMatch(tuner, /@media \(max-height: 430px\)/);
  assert.match(tuner, /\[data-density="compact"\]\[data-rail="off"\] #lt-head \{[^}]*display: block/);
  assert.match(tuner, /\[data-density="compact"\]\s*\{[^}]*overflow:\s*hidden/);
  assert.match(tuner, /\[data-density="compact"\] \.adv-help\s*\{\s*display:\s*none/);
  // The invariant is the UNIT, not the number: this box lives inside
  // `zoom: var(--ui-scale)`, so a viewport svh max ate slider rows at UI SIZE
  // 200%. The multiplier is free to move with the payload — it went 28 -> 38
  // when COPY VALUES stopped exporting 182,569 characters and started
  // exporting only the player's own overrides, which the box can now show.
  assert.match(tuner, /max-height:\s*min\(calc\(\d+ \* var\(--svhz\)/,
    "COPY VALUES box uses local --svhz, not 40svh");
  assert.doesNotMatch(tuner, /#lt-json[\s\S]{0,400}?max-height:[^;]*\d+svh/,
    "and never a raw viewport svh");
  assert.match(tuner, /#lt-head h2, #ct-head/);
  assert.match(career, /#cr-inner\[data-density="compact"\] #cr-foot[\s\S]*?grid-template-columns/);
  assert.match(data, /body\[data-density="compact"\] \.dh-tab[\s\S]*?min-height:\s*var\(--tap-min\)/);
  assert.match(data, /body\[data-density="compact"\] \.dh-overlay/);
  assert.doesNotMatch(data, /orientation:\s*landscape\) and \(max-height:/,
    "data hub short-height chrome must use body[data-density], not viewport max-height");
  assert.match(data, /body\[data-shape="tall"\]\[data-width="narrow"\] \.dh-tabs/,
    "portrait 2×3 destinations use the zoom-aware shape+width flags (not @media orientation)");
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

test("How to Play names every input and drops the retired screen-half lie", () => {
  const html = read("index.html");
  const start = html.indexOf('id="howtoplay"');
  const end = html.indexOf('id="advanced"');
  assert.ok(start > 0 && end > start, "howtoplay sheet is in the shell");
  const htp = html.slice(start, end);
  assert.match(htp, /<dt id="htp-controls">PC \/ KEYBOARD<\/dt>/);
  assert.match(htp, /<dt>CONTROLLER<\/dt>/);
  assert.match(htp, /<dt>TOUCH \/ MOBILE<\/dt>/);
  assert.match(htp, /ADAPTIVE BUTTONS/);
  assert.match(htp, /BRAKE CUE/);
  assert.match(htp, /default ON/);
  assert.match(htp, /STEERING &amp; ASSISTS/);
  assert.match(htp, /ADVANCED disclosure/);
  assert.match(htp, /TV SIDE/);
  assert.match(htp, /tap to toggle/);
  assert.match(htp, /pauses only if nothing is open/);
  assert.match(htp, /drag on the track/);
  assert.match(htp, /a tap does not steer/);
  assert.match(htp, /deny switches to BUTTONS/);
  assert.match(htp, /GEARS: MANUAL<\/span> \(tilt only/);
  assert.match(htp, /shifter left and the pedals right/);
  assert.match(htp, /triggers are analog/);
  assert.match(htp, /leave a list for the header or column beside it/);
  assert.match(htp, /hold to repeat/);
  assert.doesNotMatch(htp, /HALVES|TRACKSIDE|screen halves|tap left\/right/);
  const game = read("js/game.js");
  assert.match(game, /autoThrottle\(\) \? 1 : Math\.max\(0, Input\.throttleLevel\(\)\)/,
    "TOUCH auto-throttle must apply full pedal travel, not a 0 analog reading");
  assert.match(game, /steerMode === "tilt" \|\| !Input\.touchControlsNeeded\(\)/,
    "phone MANUAL gears stay tilt-only — BUTTONS already owns both thumbs");
  assert.match(game, /L\.push\(shifts, taps\); R\.push\(pedals\)/,
    "tilt+manual puts the shifter left and the pedals right");
  const nav = read("js/game/menunav.js");
  assert.match(nav, /return n \? list\[\(\(j % n\) \+ n\) % n\] : null/,
    "menu arrows wrap in every direction so a pad press is never a no-op");
  assert.match(nav, /function pickSideways\(/,
    "ArrowLeft/Right from a column must have an out-of-band pass to the side header");
});

test("How to Play exposes pinned semantic jump landmarks", () => {
  const html = read("index.html");
  const css = read("css/overlays.css");
  const components = read("css/components.css");
  assert.match(html, /id="htp-contents"[^>]*aria-label="How to play sections"/);
  for (const id of ["controls", "racing", "setup", "modes", "friends"]) {
    assert.match(html, new RegExp(`href="#htp-${id}"`));
    assert.match(html, new RegExp(`<dt id="htp-${id}">`));
  }
  assert.match(css, /#htp-contents\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /#htp-contents a\s*\{[\s\S]*?min-height:\s*var\(--chip-h\)/);
  assert.match(css, /#howtoplay-inner\[data-shape="wide"\] > #htp-contents/);
  assert.match(css, /#howtoplay-inner\[data-density="compact"\]:not\(\[data-shape="wide"\]\) > #htp-contents/);
  assert.match(read("index.html"), /id="vsfriend-inner"/);
  assert.match(css, /#howtoplay:has\(#htp-friends:target\)[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(css, /#howtoplay dt\[id\]\s*\{[^}]*scroll-margin-block-start/);
  assert.doesNotMatch(css, /#howtoplay dl\s*\{[^}]*max-content minmax\(0, 1fr\) max-content/,
    "help rows must not synchronize two unrelated answers");
  assert.match(components, /#howtoplay\s*\{\s*--sheet-w:\s*1000px/);
});

test("compact Career keeps its mode context instead of ellipsizing it", () => {
  const css = read("css/career.css");
  assert.match(css, /#cr-inner\[data-density="compact"\] #cr-sub\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(css, /#cr-inner\[data-density="compact"\] #cr-sub\s*\{[\s\S]*?text-overflow:\s*clip/);
});

test("variable control clusters use one content-driven balanced-row primitive", () => {
  const html = read("index.html");
  const components = read("css/components.css");
  const menus = read("css/menus.css");
  const tuner = read("css/tuner.css");
  const camera = read("js/game/cam-modes.js");
  assert.match(components, /\.balanced-row\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
  assert.match(components, /\.balanced-row > :not\(\[hidden\]\)\s*\{[^}]*flex:\s*1 1 var\(--balance-basis/);
  for (const id of ["pm-category-tabs", "menu-secondary", "rs-laps", "rs-weather",
    "rs-time", "rs-diff", "rs-quali", "rs-caution", "rs-reliab", "lt-tabs", "ct-modes"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*balanced-row`), `${id} must balance from local space`);
  }
  assert.match(camera, /className = "balanced-row"/);
  assert.doesNotMatch(html + components + menus + tuner + camera, /no-orphan-[235]/,
    "column-count-specific orphan patches must not return");
  assert.doesNotMatch(menus, /#rs-(?:laps|weather|diff|time)[^{}]*grid-template-columns:\s*repeat\([235]/);
});

test("overflowing Help navigation keeps its first landmark reachable", () => {
  const css = read("css/overlays.css");
  assert.match(css, /#htp-contents\s*\{[^}]*justify-content:\s*flex-start/);
  assert.match(css, /#htp-contents > :first-child\s*\{[^}]*margin-inline-start:\s*auto/);
});

function inputFn(src, name) {
  const re = new RegExp(`function ${name}\\([^)]*\\) \\{`);
  const m = src.match(re);
  assert.ok(m, `${name}() must exist in js/game/input.js`);
  let depth = 1;
  const start = m.index + m[0].length;
  let i = start;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}

test("gamepad menu nav seeds focus on open and uses a larger stick deadzone than driving", () => {
  const src = read("js/game/input.js");
  assert.match(src, /const PAD_DEADZONE = 0\.14/, "driving deadzone stays 0.14");
  const navDz = src.match(/const PAD_NAV_DEADZONE = ([0-9.]+)/);
  assert.ok(navDz, "PAD_NAV_DEADZONE must exist for menu stick nav");
  const menuDz = Number(navDz[1]);
  assert.ok(menuDz > 0.14, "menu stick deadzone must be larger than PAD_DEADZONE");
  assert.ok(menuDz >= 0.20 && menuDz <= 0.28, `menu deadzone should sit near 0.22, got ${menuDz}`);

  const driveAx = src.match(/let ax = \(pad\.axes[\s\S]*?padSteer = clamp\(ax/);
  assert.ok(driveAx, "driving stick rescale must still live in pollGamepad");
  assert.match(driveAx[0], /PAD_DEADZONE/);
  assert.doesNotMatch(driveAx[0], /PAD_NAV_DEADZONE/,
    "driving stick must not pick up the menu deadzone");

  const dirOf = inputFn(src, "padNavDirOf");
  assert.match(dirOf, /PAD_NAV_DEADZONE/, "menu stick nav uses PAD_NAV_DEADZONE");
  assert.doesNotMatch(dirOf, /PAD_DEADZONE/,
    "menu stick nav must not reuse the driving deadzone");
  assert.match(dirOf, /stick\(ax\[0\][^\n]*\)\s*\|\|\s*stick\(ax\[2\]/,
    "right stick remains the fallback when the left stick is centred");

  assert.match(src, /let padNavSeeded = false/,
    "one seed-per-open-menu flag so we do not re-seed every frame");
  assert.match(src, /let padNavSeedLayer = null/,
    "a new UiLayers.top() re-arms the seed (title→select, Start→pause)");
  const seed = inputFn(src, "padSeedFocus");
  assert.match(seed, /padDispatchKey\("ArrowDown"\)/,
    "seed is MenuNav's first-arrow path, not a second focus-mover");
  assert.doesNotMatch(seed, /\.focus\(/);
  assert.doesNotMatch(seed, /querySelector/);

  const activate = inputFn(src, "padActivate");
  assert.match(activate, /padSeedFocus\(\)/,
    "A's empty path must reuse padSeedFocus — not a second mover");
  assert.match(activate, /ty === "range" \|\| ty === "number"/,
    "A on a focused range/number must not click-to-jump the thumb");

  assert.match(src, /UiLayers\.navOpen\(\)/,
    "title #overlay is pad-navigable; anyOpen() stays false there");
  assert.match(read("js/game/uilayers.js"), /function navOpen\(\)/);
  assert.match(read("js/game/menunav.js"), /ty === "range" \|\| ty === "number"/,
    "range/number own only Left/Right so Up/Down leave the row");
  assert.match(read("js/game/ariastate.js"), /#vsfriend,#season-setup/,
    "AriaState watches the two DOM-built overlays UiLayers already lists");
  assert.match(read("js/game/scrollfade.js"), /"#menu-buttons"/,
    "title chrome fade watches the zoomed #menu-buttons scroller");
  assert.match(read("js/game/scrollfade.js"), /overflowX/,
    "sideways strips get .sf-l / .sf-r, not only overflow-y thumbs");

  const poll = inputFn(src, "padNavPoll");
  assert.match(poll, /padNavSeeded/, "first padNavPoll of a newly-open menu seeds once");
  assert.match(poll, /UiLayers\.top\(\)/, "seed re-arms when the top layer changes");
  assert.match(poll, /if \(!dir && !btnEdge\(pad,\s*0\)\) padSeedFocus\(\)/,
    "do not auto-seed on the same frame as a direction or A — those already seed");

  assert.match(src, /padNavSeeded = false/,
    "closing the menu / reset / disconnect must clear the seed flag");
  assert.match(src, /const PAD_NAV_DELAY_MS = 450/,
    "held D-pad/stick must wait before the first synthesized repeat");
  assert.match(src, /const PAD_NAV_REPEAT_MS = 130/,
    "held D-pad/stick must then repeat at a keyboard-like cadence");
});

test("dense sheets preserve a functional content height at extreme UI size", () => {
  const shape = read("js/game/sheetshape.js");
  const components = read("css/components.css");
  const garage = read("css/carsetup.css");
  const menus = read("css/menus.css");
  assert.match(shape, /function classifyFit\(el\)/);
  assert.match(shape, /available \/ at/);
  assert.match(shape, /el\.style\.setProperty\("--sheet-scale"/);
  assert.match(shape, /el\.dataset\.fit = state/);
  assert.match(components, /zoom:\s*var\(--sheet-scale, var\(--ui-scale\)\)/);
  assert.match(components, /\.sheet > :where\(\.sheet-head, \.sheet-body, \.sheet-foot\)\s*\{\s*min-width:\s*0/);
  assert.match(garage, /#cs-inner[^{]*\{[^}]*--fit-at:\s*340px/);
  assert.match(garage, /#cs-inner[^{]*\{[^}]*--fit-at:\s*240px/);
  assert.match(components, /#pmsettings-inner \{\s*--fit-at:\s*300px/);
  assert.match(components, /#pmsettings-inner[^{]*\{\s*--fit-at:\s*220px/);
  assert.match(components, /#vsfriend-inner \{\s*--fit-at:\s*280px/);
  assert.match(read("css/career.css"), /#cr-inner \{[^}]*--fit-at:\s*300px/);
  assert.match(read("css/career.css"), /#cr-inner[^{]*\{[^}]*--fit-at:\s*220px/);
  assert.match(menus, /#ss-inner \{[^}]*--fit-at:\s*300px/);
  assert.match(menus, /#ss-inner[^{]*\{[^}]*--fit-at:\s*220px/, "#ss-inner wide-shape fit-at 220px");
  assert.match(read("css/overlays.css"), /#vsfriend-inner\[data-shape="wide"\] \.vs-two/);
  assert.doesNotMatch(read("css/overlays.css"), /@container sheet \(min-width: 620px\) \{\s*#vsfriend \.vs-two/);
  assert.doesNotMatch(menus, /#sel-inner\[data-fit="on"\] #sel-preview-map\s*\{\s*display:\s*none/,
    "zoomed / data-fit SELECT keeps the map; caps bind instead of hiding it");
});

test("garage preview chips hug the sheet and season quali is a label", () => {
  const garage = read("css/carsetup.css");
  const game = read("js/game.js");
  const spotify = read("js/game/spotify.js");
  assert.match(garage, /#cs-stack \{[\s\S]*?left:\s*auto/);
  assert.match(garage, /#cs-stack \{[\s\S]*?width:\s*max-content/);
  assert.doesNotMatch(garage, /#cs-stack \{[\s\S]*?left:\s*calc\(var\(--safe-l\)/);
  assert.match(game, /qEl\.hidden = qForced != null/);
  assert.match(game, /QUALIFYING LAP" \+ \(qForced == null \? "" : " · " \+/);
  const menus = read("css/menus.css");
  assert.match(menus, /#rs-quali-section:has\(#rs-quali\[hidden\]\) \{\s*grid-column:\s*1 \/ -1;\s*grid-row:\s*1/);
  assert.match(menus, /:is\(#rs-diff-section, #rs-caution-section, #rs-reliab-section\) \{\s*grid-row:\s*3/);
  assert.match(menus, /#rs-body \{ overflow-y:\s*auto/);
  assert.match(menus, /#rs-reliab,[\s\S]*?#rs-diff \{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(menus, /#rs-body:not\(:has\(#rs-quali\[hidden\]\)\) > :is\(#rs-diff-section, #rs-caution-section, #rs-reliab-section\) \{\s*grid-row:\s*3/);
  assert.match(menus, /#rs-body:not\(:has\(#rs-quali\[hidden\]\)\) :is\(#rs-laps, #rs-weather\) \{\s*flex-wrap:\s*nowrap/);
  assert.match(menus, /\.sheet\[data-shape="tall"\] #rs-body:not\(:has\(#rs-quali\[hidden\]\)\) #rs-caution-section,[\s\S]*?grid-row:\s*4/);
  assert.match(read("css/components.css"), /#race-settings \.sheet \{ --compact-at:\s*760px/);
  assert.match(spotify, /if \(audio\) audio\.hidden = true/);
  assert.match(spotify, /if \(audio\) audio\.hidden = false/);
});

test("title settings, pause standings, and career modes stay reachable", () => {
  const game = read("js/game.js");
  const nav = read("js/game/settings-nav.js");
  const career = read("css/career.css");
  assert.match(nav, /return \{ showCurrent: \(\) => show\(current, false\), show \}/,
    "title Settings can land on MORE without a second click");
  assert.match(game, /settingsNav\.show\("more", false\);\s*openSettings\(\)/,
    "title Settings opens the MORE category (How to Play lives there)");
  assert.match(game,
    /pmStandings\.hidden = !\(isChampionship\(\) && SeasonCal\.hasProgress\(season\) && season\.round < SeasonCal\.rounds\(\)\)/,
    "pause STANDINGS matches the title: hide once the season is finished");
  assert.match(game, /\$\("pm-restart"\)\.disabled = !!\(netPlay\.active\(\) \|\| qualiNetDone\)/,
    "RESTART looks dead in net / quali-net, same gate as its click handler");
  assert.match(career,
    /#cr-inner:not\(\[data-pair="on"\]\):has\(#cr-left \.cr-slot\):has\(#cr-right \.cr-slot\) > #cr-body \{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
    "any stacked modes picker puts DRIVER and MY TEAM in one row");
});

test("neutral buttons share the settings tab-header plate", () => {
  const tokens = read("css/tokens.css");
  const components = read("css/components.css");
  const menus = read("css/menus.css");
  const carsetup = read("css/carsetup.css");
  assert.match(tokens, /--plate:\s*rgba\(255,\s*255,\s*255,\s*0\.045\)/);
  assert.match(tokens, /--plate-line:\s*rgba\(255,\s*255,\s*255,\s*0\.16\)/);
  assert.match(tokens, /--plate-on:\s*color-mix\(in oklab, var\(--red\) 18%/);
  assert.match(components, /#pm-category-tabs > button \{[\s\S]*?background:\s*var\(--plate\)/);
  assert.match(components, /#pm-category-tabs > button\.active,[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(components, /\.bigbtn\.alt \{[\s\S]*?background:\s*var\(--plate\)/);
  assert.match(menus, /\.sel-chip \{[\s\S]*?background:\s*var\(--plate\)/);
  assert.match(menus, /\.sel-chip\.active \{[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(menus, /#race-settings \.sel-chip\.active \{[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(carsetup, /\.cs-tab \{[\s\S]*?background:\s*var\(--plate\)/);
  assert.match(carsetup, /\.cs-tab\.active \{[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(read("css/data.css"), /\.dh-pill\.dh-active \{[\s\S]*?background:\s*var\(--plate-on\)/);
  assert.match(read("css/data.css"), /\.dh-livebtn\.dh-active \{[\s\S]*?background:\s*var\(--plate-on\)/);
});

test("tool doors and lone foot actions do not stretch into banners", () => {
  const components = read("css/components.css");
  assert.match(components, /\.pm-doors\s*\{[\s\S]*?--balance-basis:\s*12rem/);
  assert.match(components, /\.sheet-foot \.bigbtn:only-child\s*\{[\s\S]*?flex:\s*0 1 auto/);
  assert.match(components, /\.pm-group \.tune-row \.tune-label \{[\s\S]*?position:\s*static/);
  assert.match(components, /#pmsettings-inner \.pm-groups > \[role="tabpanel"\] button \{[\s\S]*?white-space:\s*normal/);
  assert.match(read("css/overlays.css"), /@container sheet \(max-width: 360px\) \{\s*#howtoplay dl/);
  assert.match(read("css/career.css"), /\.cr-cheats \.sel-chip \{[\s\S]*?min-width:\s*0/);
});

/* LIGHTING TUNER → COPY VALUES: what it copies, and that the copy can succeed.
 *
 * Reported: the button leaves you trying to hand-select the text. Two causes,
 * and the obvious one was not the main one.
 *
 * The payload was the file+local MERGE — measured at 805 conditions, 7,071
 * knobs, 182,569 characters against the shipped light-presets.js. In a 10px
 * textarea capped at 120px that is ~4,500 lines behind a 120px window: not hard
 * to select, impossible. And it could never be pasted into a message either,
 * which is the whole point of the button.
 *
 * The fallback was also engine-dependent, which is worse than broken because it
 * works on the machine you test on. execCommand("copy") was only reached from
 * the clipboard promise's REJECTION handler, a microtask later. Measured:
 * Chromium keeps transient activation ~5 s, so the late call still copied and
 * the OLD handler passed a clipboard read-back there. WebKit is documented as
 * requiring the copy during gesture processing, which would make that the path
 * that cannot fire on an iPhone — UNVERIFIED, this container's proxy blocks the
 * WebKit download. Ordering the synchronous attempt first takes the engine out
 * of the question without depending on which story is right. */
test("COPY VALUES exports the player's edits under a name bake.mjs will refuse", () => {
  const src = read("js/game/photomode.js");
  const h = src.slice(src.indexOf('$("lt-copy").onclick'));
  assert.match(h, /window\.LightEdits = \{/,
    "the export must be a LightEdits DELTA — the name is the interlock that stops " +
    "bake.mjs (a FULL REPLACE) from writing it and deleting every profile it omits");
  assert.doesNotMatch(h, /window\.LightPresets\s*=/,
    "and it must never wear the snapshot's name");
  assert.match(h, /G\._ltStore/, "built from the local overrides, not the shipped file");
  assert.doesNotMatch(h, /window\.LightPresets \|\| \{\}/,
    "re-sending the shipped presets is 182,569 characters of noise — they are already in the repo");
  // The player asked for their current condition first, then the rest.
  assert.ok(h.indexOf("THIS CONDITION") > -1 && h.indexOf("EVERYTHING ELSE") > -1,
    "both blocks are labelled for whoever reads the paste");
  assert.ok(h.indexOf("THIS CONDITION") < h.indexOf("EVERYTHING ELSE"),
    "the condition just tuned is emitted first");
});

test("COPY VALUES tries the synchronous copy while the click still has activation", () => {
  const src = read("js/game/photomode.js");
  const h = src.slice(src.indexOf('$("lt-copy").onclick'));
  const sync = h.indexOf('document.execCommand("copy")');
  const async_ = h.indexOf("navigator.clipboard");
  assert.ok(sync > -1 && async_ > -1, "both copy paths must exist");
  assert.ok(sync < async_,
    "execCommand(\"copy\") must run BEFORE the clipboard promise. From inside its " +
    "rejection handler it runs a microtask later — which Chromium still allows (~5 s of " +
    "transient activation, measured) and WebKit is documented not to. Ordering it first " +
    "is what stops the answer depending on the engine.");
  assert.doesNotMatch(h, /\.then\([^)]*,\s*\(\)\s*=>\s*\{[\s\S]{0,120}execCommand/,
    "and it must not go back into the rejection handler");
});

test("a lighting DELTA merges and an agent PROPOSAL replaces", () => {
  // The two inputs mean different things inside one condition and conflating
  // them loses data either way: a proposal is a considered whole profile (so it
  // may drop a knob it decided against), a delta is the handful of sliders a
  // person moved (so it may not delete the seven they did not touch).
  const mp = read(".claude/skills/bake-lighting/merge-proposals.mjs");
  assert.match(mp, /merged\[key\] = delta \? Object\.assign\(\{\}, merged\[key\], clean\) : clean;/,
    "delta merges into the shipped map, proposal replaces it");
  assert.match(mp, /if \(!delta\) delete merged\[key\];/,
    "only a proposal may empty a condition — a paste must never wipe a profile it never mentioned");
  assert.match(mp, /window\.LightPresets && !window\.LightEdits|w\.LightPresets && !w\.LightEdits/,
    "a snapshot fed to the merge tool is named as such, not merged as a delta");
  const bake = read(".claude/skills/bake-lighting/bake.mjs");
  assert.match(bake, /LightEdits\\s\*=/,
    "bake.mjs must detect a delta by name and refuse it — it is a full replace");
  assert.match(bake, /merge-proposals\.mjs/, "and point at the tool that does take one");
});
