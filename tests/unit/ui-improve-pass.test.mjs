/* ui-improve-pass.test.mjs — the menu/HUD improvement pass, pinned as
 * BEHAVIOUR where a module can run in a Node VM and as RULES (not text)
 * where the subject is a stylesheet.
 *
 * 2026-09 rewrite: this file used to quote ~235 fragments of source — CSS
 * blocks by regex over the raw file, JS by exact statement text — and one
 * of them broke on a one-token refactor that changed nothing. Now:
 *   - CSS is read through tests/helpers/css-rules.mjs: "selector S declares
 *     property P as V" survives reordering, reformatting and comments and
 *     still fails when the declaration goes.
 *   - MenuNav, SheetShape, Input (gamepad menu nav), CamModes, SettingsNav,
 *     Photomode (COPY VALUES), CssZoom and UiLayers are loaded in a VM on
 *     tests/helpers/mini-dom.mjs and asserted by what they DO.
 *   - bake.mjs is executed and must refuse a LightEdits delta.
 *   - What stays a source pin (menus.js, setup-ui.js, tuner panels, game.js
 *     wiring — modules whose create() needs the whole shell) is matched on
 *     the identifier and the shape of the statement, whitespace-free, on
 *     comment-stripped source, never on exact text.
 *
 * Run: node --test tests/unit/ui-improve-pass.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cssRules, decl, declares, ruleFor, rulesFor } from "../helpers/css-rules.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
// JS/HTML with comments stripped: a pin can only match code, never a comment.
const code = (name) => read(name).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const cssCache = new Map();
const css = (name) => { if (!cssCache.has(name)) cssCache.set(name, cssRules(read(name))); return cssCache.get(name); };
/** Brace-matched body of `function name(` in src. */
function fnBody(src, name, file) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(m, `${name}() must exist in ${file}`);
  let depth = 1;
  const start = m.index + m[0].length;
  let i = start;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}
const src = (p) => read(p).replace(/^const\b/gm, "var");

/** A VM sandbox for one js/game UI module on the mini DOM. */
function uiSandbox(dom, extra = {}) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn) => { sb.__timers.push(fn); return sb.__timers.length; }, clearTimeout() {}, __timers: [],
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "flex", flexDirection: "row", gridTemplateColumns: "none", paddingTop: "0px", paddingBottom: "0px" }),
    innerWidth: 1000, innerHeight: 600, requestAnimationFrame: () => 0,
    ...extra,
  };
  sb.window = sb;
  return sb;
}

test("UI audit scale axis includes the product's 40% minimum", async () => {
  const { parseScales } = await import("../../tools/ui-scale-axis.mjs");
  assert.deepEqual(parseScales(["--scale=40,200"]), [40, 200]);
  assert.throws(() => parseScales(["--scale=39.75"]), /between 40 and 200/);
});

test("CssZoom helper ships before sheetshape and menunav", () => {
  const man = read("tools/manifest.cjs");
  const iZoom = man.indexOf('"js/game/css-zoom.js"');
  const iSheet = man.indexOf('"js/game/sheetshape.js"');
  const iNav = man.indexOf('"js/game/menunav.js"');
  assert.ok(iZoom > 0, "css-zoom.js must be in the manifest");
  assert.ok(iZoom < iSheet, "css-zoom before sheetshape");
  assert.ok(iSheet < iNav, "sheetshape before menunav");
});

test("CssZoom exports its API surface", () => {
  const sb = uiSandbox(makeDom());
  vm.runInNewContext(src("js/game/css-zoom.js"), sb, { filename: "js/game/css-zoom.js" });
  const Z = sb.CssZoom;
  assert.ok(Z, "window.CssZoom is assigned");
  for (const name of ["of", "viewportRect", "localRect", "localBox", "toLocalDelta", "rectsAreVisual"]) {
    assert.equal(typeof Z[name], "function", `CssZoom.${name}`);
  }
});

test("data hub card carries UI SIZE zoom (fit-capped like a sheet)", () => {
  // var(--sheet-scale, var(--ui-scale)): the card is fit-managed, so
  // SheetShape may cap the requested slider on a short window — the fallback
  // keeps the plain UI SIZE contract this test originally pinned.
  assert.equal(decl(css("css/data.css"), ".dh-card", "zoom"), "var(--sheet-scale, var(--ui-scale))");
  assert.match(code("js/data/hub.js"), /\bdh-card\b[^"'`\n]*\bfit-managed\b/, "the card must join the classifyFit scan (class list carries fit-managed)");
});

test("garage livery grid class is wired", () => {
  const js = code("js/game/setup-ui.js");
  assert.match(js, /\bcs-liv-grid\b/);
  assert.ok(ruleFor(css("css/carsetup.css"), /^#cs-options\.cs-liv-grid\b/), "carsetup.css styles #cs-options.cs-liv-grid");
  const clear = js.search(/classList\.remove\(\s*"cs-liv-grid"\s*\)/);
  const team = js.search(/csActiveCat\s*===\s*"team"/);
  assert.ok(clear > 0 && clear < team,
    "cs-liv-grid must be cleared before the TEAM branch, or the team card inherits the swatch grid");
});

test("select track filter persists via store", () => {
  const js = code("js/game/menus.js");
  assert.match(js, /\btrackFilter\b/);
  assert.match(js, /store\.set\(\s*"trackFilter"/);
  assert.match(js, /"classic"\s*,\s*"CLASSICS"/);
});

/* ── SheetShape on the mini DOM ─────────────────────────────────────────── */
function bootSheetShape(opts = {}) {
  const dom = makeDom({ readyState: "loading" });     // init() waits for DOMContentLoaded: never runs
  const vars = new Map();                               // el -> { "--fit-at": "300px", … }
  const style = (el) => ({
    getPropertyValue: (k) => (vars.get(el) && vars.get(el)[k]) || "",
    paddingTop: "0px", paddingBottom: "0px",
  });
  vars.set(dom.body, { "--tall-at": "1.05", "--wide-at": "620px", ...(opts.body || {}) });
  vars.set(dom.documentElement, { "--ui-scale": String(opts.uiScale || 1) });
  const sb = uiSandbox(dom, { getComputedStyle: style, innerWidth: opts.innerWidth || 1000, innerHeight: opts.innerHeight || 600 });
  vm.runInNewContext(src("js/game/sheetshape.js"), sb, { filename: "js/game/sheetshape.js" });
  const sheet = (id, o = {}) => {
    const host = dom.makeElement("div"); host._client = o.hostHeight || 0;
    const el = dom.makeElement("div"); el.id = id; host.appendChild(el);
    el._rect = { width: o.w || 800, height: o.h || 400, left: 0, top: 0, right: o.w || 800, bottom: o.h || 400 };
    vars.set(el, o.vars || {});
    return { el, host };
  };
  return { dom, sb, SS: sb.SheetShape, vars, sheet, body: dom.body };
}

test("circuit select stacked uses one list scroller", () => {
  const menus = css("css/menus.css");
  assert.ok(!menus.some((r) => [...r.decls.values()].some((v) => /40\s*\*\s*var\(--svhz\)/.test(v))),
    "the 300px / 40svhz list cap was the nested-scroller hotfix");
  assert.ok(!declares(menus, '#sel-inner:not([data-pair="on"]) > #sel-body > #sel-tracks', "order", "-1"),
    "list-above-preview order was only needed while the body scrolled");
  assert.equal(decl(menus, '#sel-inner:not([data-pair="on"]) > #sel-body', "overflow"), "hidden",
    "stacked body is a flex column, not a vertical scroller");
  assert.equal(decl(menus, '#sel-inner:not([data-pair="on"]) > #sel-body > #sel-tracks', "flex"), "1 1 0",
    "the track list fills leftover body height from a zero basis");
  assert.equal(decl(menus, '#sel-inner[data-pair="on"]:not([data-shape="tall"]) #sel-track-section', "overflow"), "hidden",
    "wide preview column fits instead of scrolling as a second document");
  assert.equal(decl(menus, "#sel-inner", "--pair-compact"), "wide",
    "compact wide SELECT pairs so the catalogue sits in the right column");
  // SheetShape BEHAVIOUR: `--pair-compact: wide` keeps a compact WIDE sheet
  // paired and stacks a compact TALL one; `off` stacks either.
  const h = bootSheetShape();
  const wide = h.sheet("sel-inner", { w: 900, h: 300, vars: { "--pair-compact": "wide", "--compact-at": "380px", "--pair-at": "620px" } });
  h.SS.observe(wide.el);
  assert.equal(wide.el.dataset.density, "compact");
  assert.equal(wide.el.dataset.pair, "on", "compact + wide shape + `wide` mode keeps the pair");
  const tall = h.sheet("sel-inner-tall", { w: 300, h: 360, vars: { "--pair-compact": "wide", "--compact-at": "380px", "--pair-at": "200px" } });
  h.SS.observe(tall.el);
  assert.equal(tall.el.dataset.shape, "tall");
  assert.equal(tall.el.dataset.pair, "off", "compact + tall shape stacks even above --pair-at");
  const off = h.sheet("cs-inner", { w: 900, h: 300, vars: { "--pair-compact": "off", "--compact-at": "380px", "--pair-at": "400px" } });
  h.SS.observe(off.el);
  assert.equal(off.el.dataset.pair, "off", "`off` stacks a compact sheet regardless of width");
  assert.doesNotMatch(code("js/game/scrollfade.js"), /"\.pane",\s*"#sel-body"/);
  assert.doesNotMatch(code("js/game/menunav.js"), /\.pane,#sel-body/);
  assert.doesNotMatch(read("tools/layout-audit.mjs"), /\.pane,#sel-body/);
  assert.match(code("js/game/scrollfade.js"), /\boverflowY\b/,
    "fade thumbs require overflow-y auto/scroll, not hidden content height");
});

test("density is judged by the sheet's ROOM, not its content height", () => {
  // SheetShape BEHAVIOUR: a content-sized sheet reports its content height,
  // and its compact layout is shorter than its normal one, so measuring the
  // content is self-fulfilling. MEASURED RACE SETTINGS at 1280x800: the
  // compact grid is 358 own px against --compact-at 760 with 776 px of room.
  const h = bootSheetShape();
  const roomy = h.sheet("rs-roomy", { w: 558, h: 358, hostHeight: 776, vars: { "--compact-at": "760px" } });
  h.SS.observe(roomy.el);
  assert.equal(roomy.el.dataset.density, "normal", "358 px of content in 776 px of room is NOT short");
  roomy.host._client = 366; h.SS.reclassify();
  assert.equal(roomy.el.dataset.density, "compact", "the same sheet on a 390-tall landscape phone is");
  roomy.host._client = 790; h.SS.reclassify();
  assert.equal(roomy.el.dataset.density, "compact", "790 is inside the 40 px release hysteresis (760 + 40)");
  roomy.host._client = 820; h.SS.reclassify();
  assert.equal(roomy.el.dataset.density, "normal", "…and releases once the room clears it");
  const pinned = h.sheet("rs-pinned", { w: 558, h: 900, hostHeight: 600, vars: { "--compact-at": "760px" } });
  h.SS.observe(pinned.el);
  assert.equal(pinned.el.dataset.density, "normal", "a sheet taller than its host is judged by its own height (max of the two)");
  const nohost = h.sheet("rs-nohost", { w: 558, h: 358, vars: { "--compact-at": "760px" } });
  h.SS.observe(nohost.el);
  assert.equal(nohost.el.dataset.density, "compact", "host 0 (hidden, or this harness) falls back to the sheet's own height");
  assert.match(code("js/game/sheetshape.js"), /function roomOwn\(el, hOwn\)/, "the room floor lives in sheetshape.js");
  // THE BODY IS EXEMPT: classifyBody() passes innerHeight ÷ --ui-scale, already
  // the room in the body's own units; the documentElement host would hand back
  // the raw viewport and un-compact every phone at UI SIZE 200%.
  const b = bootSheetShape({ innerWidth: 852, innerHeight: 393, uiScale: 2 });   // 196 own px
  b.vars.set(b.body, { "--tall-at": "1.05", "--wide-at": "620px", "--compact-at": "600px" });
  b.body._client = 393; b.dom.documentElement._client = 393;
  b.SS.reclassify();
  assert.equal(b.body.dataset.density, "compact", "852x393 at 200% is 196 own px of body — compact, whatever documentElement's client box says");
});

test("garage stacked categories are a horizontal strip", () => {
  const carsetup = css("css/carsetup.css");
  assert.ok(!declares(carsetup, "#cs-tabs", "max-height", "48%"),
    "stacked tabs must not keep the wrapping 48% vertical catalogue");
  assert.ok(ruleFor(carsetup, /^#cs-inner:not\(\[data-pair="on"\]\) #cs-tabs \.cs-tab\b/),
    "the strip is keyed on data-pair, not portrait orientation");
  assert.equal(decl(carsetup, "#cs-tabs", "overflow-x"), "auto", "stacked tabs pan sideways");
  assert.equal(decl(carsetup, "#cs-tabs", "overflow-y"), "hidden", "…and override .pane overflow-y");
  assert.equal(decl(carsetup, '#cs-inner[data-pair="on"] #cs-tabs', "overflow-y"), "auto",
    "pair-on rail may still scroll vertically");
  assert.equal(decl(css("css/components.css"), ".pane-pair", "--pair-compact"), "off",
    "compact garage / season stack to the horizontal strip via --pair-compact");
  const packed = '#cs-inner:not([data-pair="on"])[data-density="compact"]:not([data-shape="tall"]) #cs-tabs';
  assert.equal(decl(carsetup, packed, "grid-template-columns"), "repeat(7, minmax(0, 1fr))",
    "short wide stacked garage packs fourteen tabs as two rows of seven");
  assert.ok(decl(carsetup, packed, "max-height"), "wrapped play-shape tabs cap at two rows so #cs-options keeps a list");
  assert.ok(!declares(carsetup, /^#cs-inner:not\(\[data-pair="on"\]\):is\(\[data-shape="tall"\], \[data-density="compact"\]\) #cs-tabs$/, "flex-wrap", "wrap"),
    "tall stacked garage must keep the horizontal strip — wrapping 14 tabs starved options");
  assert.match(code("js/game/setup-ui.js"), /scrollIntoView\(\s*\{[^}]*\bblock:\s*"nearest"[^}]*\}\s*\)/, "the active tab is scrolled into view (nearest)");
  assert.match(code("js/game/setup-ui.js"), /scrollIntoView\(\s*\{[^}]*\binline:\s*"center"[^}]*\}\s*\)/, "…and centred sideways along the strip");
});

test("circuit catalogue has a searchable filter toolbar", () => {
  const js = code("js/game/menus.js");
  assert.match(js, /\.type\s*=\s*"search"/);
  assert.match(js, /setAttribute\(\s*"aria-label"\s*,\s*"Search circuits"\s*\)/);
  assert.match(js, /\.dataset\.search\s*=/);
  assert.match(js, /function\s+applyTrackSearch\s*\(/);
  assert.match(js, /setAttribute\(\s*"role"\s*,\s*"group"\s*\)/,
    "filters plus search are controls for one list, not a tablist");
  assert.match(js, /\.tabIndex\s*=\s*trackFilter\s*===\s*id\s*\?\s*0\s*:\s*-1/,
    "filter chips keep a roving tab stop; search is its own");
  assert.equal(decl(css("css/menus.css"), "#sel-track-search", "min-height"), "var(--chip-h)");
});

test("compact landscape catalogue spends its first viewport on a circuit", () => {
  const menus = css("css/menus.css");
  const compactWide = '#sel-inner[data-density="compact"]:not([data-shape="tall"])';
  assert.equal(decl(menus, `${compactWide} .track-group-head`, "display"), "none");
  assert.equal(decl(menus, `${compactWide} #sel-track-filter`, "overflow-x"), "auto",
    "compact landscape filter pans in both stacked and paired columns");
  assert.equal(decl(menus, `${compactWide} #sel-track-search`, "min-width"), "12rem",
    "search keeps a readable floor so the row actually overflows at 200%");
  for (const w of [360, 420, 440]) {
    assert.ok(!menus.some((r) => r.context.some((c) => c === `@container sheet (max-width: ${w}px)`)), `no @container sheet (max-width: ${w}px) block`);
  }
  assert.ok(!declares(menus, '#sel-inner[data-density="compact"]:not([data-pair="on"]):not([data-shape="tall"]) > #sel-body > #sel-track-section', "display", "none"),
    "compact stacked landscape must keep the thumbnail band; hiding the section dropped the map");
  assert.ok(menus.some((r) => r.decls.get("max-height") === "min(calc(var(--chip-h) * 3.5), 100%)"), "thumbnail slot height is 3.5 chips");
  assert.ok(menus.some((r) => r.decls.get("max-width") === "min(48%, calc(var(--chip-h) * 5.2))"), "compact thumbnail slot width is 48% / 5.2 chips");
  assert.equal(decl(menus, '#sel-inner:not([data-pair="on"])[data-density="compact"] > #sel-body > #sel-track-section', "max-height"), "58%",
    "compact stacked band spends more of the body on the map without eating the list");
  assert.ok(!declares(menus, '#sel-inner[data-fit="on"] #sel-preview-map', "display", "none"));
  const menusJs = code("js/game/menus.js");
  assert.match(menusJs, /cardInnerW\s*\*\s*\(\s*compact\s*\?\s*0\.48\s*:\s*0\.42\s*\)/);
  assert.match(menusJs, /chipH\s*\*\s*\(\s*compact\s*\?\s*5\.2\s*:\s*3\.5\s*\)/);
  assert.match(menusJs, /slotH:\s*chipH\s*\*\s*3\.5/, "CSS and JS stay in lockstep — fitCanvas pins max-height inline");
});

test("garage categories implement one roving tab system", () => {
  const js = code("js/game/setup-ui.js");
  assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tablist"\s*\)/);
  assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tab"\s*\)/);
  assert.match(js, /setAttribute\(\s*"aria-controls"\s*,\s*"cs-options"\s*\)/);
  assert.match(js, /\.tabIndex\s*=\s*csActiveCat\s*===\s*id\s*\?\s*0\s*:\s*-1/);
  assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tabpanel"\s*\)/);
  assert.match(js, /setAttribute\(\s*"aria-labelledby"\s*,\s*csTabId\(\s*csActiveCat\s*\)\s*\)/);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"])
    assert.match(js, new RegExp(`\\.key\\s*===\\s*"${key}"`));
});

test("high-scale settings and Last Race retain useful local width", () => {
  const components = css("css/components.css");
  const data = css("css/data.css");
  assert.ok(ruleFor(components, /^\.balanced-row\s*>\s*:not\(\[hidden\]\)$/));
  assert.ok(!components.some((r) => r.context.includes("@container sheet (min-width: 380px) and (max-width: 519px)")));
  assert.equal(decl(data, ".dh-table", "max-width"), "100%");
  assert.equal(decl(data, ".dh-table", "table-layout"), "fixed");
  assert.ok(!declares(data, ".dh-td-driver", "display", "flex"),
    "a table cell must not opt out of the fixed table layout");
});

test("compact title column scrolls instead of clipping at high UI SIZE", () => {
  const menus = css("css/menus.css");
  // Cap + scroll on #menu-buttons under body[data-density=compact] (layout only).
  const compactBtns = rulesFor(menus, /body\[data-density="compact"\]\)?\s*#menu-buttons/);
  assert.ok(compactBtns.length, "a compact-density #menu-buttons rule exists");
  const has = (prop, re) => compactBtns.some((r) => r.decls.has(prop) && re.test(r.decls.get(prop)));
  assert.ok(has("max-height", /calc\(100\s*\*\s*var\(--svhz\)/), "the column is capped in local svhz");
  assert.ok(has("align-content", /safe center/));
  assert.ok(has("padding-inline", /var\(--gap\)/));
  // Portrait is the zoom-aware body[data-shape="tall"] flag, never a viewport
  // media query (the old text pin here matched a COMMENT that said so).
  assert.ok(!menus.some((r) => r.context.some((c) => /orientation:\s*portrait/.test(c))), "no @media (orientation: portrait) rule in menus.css");
  assert.ok(rulesFor(menus, /data-shape="tall"/).some((r) => [...r.decls.values()].some((v) => /minmax\(0,\s*1fr\)/.test(v))),
    "the tall shape hands leftover rows to a minmax(0, 1fr) column");
  // HOW TO PLAY carries an icon like the other doors.
  assert.match(read("index.html"), /id="mb-help"[^>]*>[\s\S]*?btn-ico[\s\S]*?HOW TO PLAY/);
});

/* ── MenuNav on the mini DOM ────────────────────────────────────────────── */
function bootMenuNav(layerId = "overlay") {
  const dom = makeDom({ readyState: "loading" });
  const layer = dom.byId(layerId);
  layer._rect = { left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600 };
  const sb = uiSandbox(dom, { UiLayers: { shown: () => true, top: () => layer } });
  vm.runInNewContext(src("js/game/menunav.js"), sb, { filename: "js/game/menunav.js" });
  const button = (id, y, attrs = {}) => {
    const b = dom.makeElement("button"); b.id = id;
    b._rect = { left: 10, top: y, right: 210, bottom: y + 30, width: 200, height: 30 };
    for (const k of Object.keys(attrs)) b.setAttribute(k, attrs[k]);
    layer.appendChild(b);
    return b;
  };
  const key = (k) => sb.MenuNav.onKeyDown({ key: k, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false });
  return { dom, layer, MenuNav: sb.MenuNav, button, key, focused: () => dom.document.activeElement && dom.document.activeElement.id };
}

test("title keyboard navigation has an explicit default before stateful controls", () => {
  assert.match(read("index.html"), /id="mb-career"[^>]*\bdata-menu-default\b/);
  // BEHAVIOUR: with nothing focused, the first arrow lands on the
  // [data-menu-default] item even though an aria-pressed control precedes it
  // in document order.
  const h = bootMenuNav();
  h.button("mb-sound", 10, { "aria-pressed": "true" });
  h.button("mb-career", 50, { "data-menu-default": "" });
  h.button("mb-quick", 90);
  h.key("ArrowDown");
  assert.equal(h.focused(), "mb-career", "first press lands on the declared default, not the earlier aria-pressed Sound");
  // Without a default the stateful control wins.
  const g = bootMenuNav("overlay2");
  g.button("s-sound", 10, { "aria-pressed": "true" });
  g.button("s-career", 50);
  g.key("ArrowDown");
  assert.equal(g.focused(), "s-sound", "no data-menu-default → the aria-pressed control is the landing spot");
});

test("tuner tabs scroll the selected chip into view", () => {
  for (const file of ["js/game/tuner.js", "js/game/cam-tuner.js"]) {
    const s = code(file);
    assert.match(s, /scrollIntoView\(\s*\{[^}]*\bblock:\s*"nearest"[^}]*\binline:\s*"center"[^}]*\}\s*\)|scrollIntoView\(\s*\{[^}]*\binline:\s*"center"[^}]*\bblock:\s*"nearest"[^}]*\}\s*\)/, `${file} centres the selected chip`);
  }
});

test("camera reset actions state their scope", () => {
  const html = read("index.html");
  assert.match(html, /id="ct-reset"[^>]*title=/);
  assert.match(html, /id="ct-reset-all"[^>]*title=/);
});

test("lighting tuner preview uses G facade, not __apex (Pages has no agent surface)", () => {
  const lighting = code("js/game/tuner.js");
  assert.doesNotMatch(lighting, /__apex/);
  assert.match(lighting, /\bsetTimeOfDay\b/);
  assert.match(lighting, /\bweather\b/);
});

test("generated lighting and camera tabs carry the complete tab contract", () => {
  const html = read("index.html");
  const lighting = code("js/game/tuner.js");
  const camera = code("js/game/cam-tuner.js");

  assert.match(html, /id="lt-tabs"[^>]*role="tablist"[^>]*aria-label="Lighting categories"/);
  assert.match(html, /id="ct-modes"[^>]*role="tablist"[^>]*aria-label="Camera modes"/);
  assert.match(html, /id="ct-rows"[^>]*role="tabpanel"/);

  for (const s of [lighting, camera]) {
    assert.match(s, /setAttribute\(\s*"role"\s*,\s*"tab"\s*\)/);
    assert.match(s, /setAttribute\(\s*"aria-controls"/);
    assert.match(s, /setAttribute\(\s*"aria-selected"/);
    assert.match(s, /\.tabIndex\s*=\s*on\s*\?\s*0\s*:\s*-1/);
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      assert.match(s, new RegExp(`\\.key\\s*===\\s*"${key}"`));
    }
  }
  assert.match(lighting, /setAttribute\(\s*"role"\s*,\s*"tabpanel"\s*\)/);
  assert.match(lighting, /setAttribute\(\s*"aria-labelledby"/);
  assert.match(lighting, /\.hidden\s*=\s*!on\b/);
  assert.match(camera, /\$\(\s*"ct-rows"\s*\)\.setAttribute\(\s*"aria-labelledby"\s*,\s*b\.id\s*\)/);
});

test("VS Friend text uses the menu type scale instead of sub-floor rem literals", () => {
  const raw = read("css/overlays.css");
  const start = raw.indexOf("/* ── VS FRIEND lobby");
  assert.notEqual(start, -1, "VS Friend CSS section missing");
  const section = cssRules(raw.slice(start));
  const offenders = [];
  for (const r of section) {
    const fs = r.decls.get("font-size");
    if (!fs) continue;
    for (const size of fs.matchAll(/([0-9.]+)rem/g)) if (parseFloat(size[1]) < 0.875) offenders.push(`${r.selector}: ${size[0]}`);
  }
  assert.deepEqual(offenders, []);
  assert.equal(decl(section, /\.vs-ready$/, "font-size"), "var(--fs-micro)");
  assert.equal(decl(section, /\.vs-summary dd$/, "font-size"), "var(--fs-2)");
});

test("closing track detail disconnects its observer and blocks queued hidden redraws", () => {
  const menus = code("js/game/menus.js");
  const drawAt = menus.search(/drawDetail\s*=\s*function\s*\(\s*\)\s*\{/);
  assert.ok(drawAt >= 0, "drawDetail is the redraw closure");
  assert.match(menus.slice(drawAt, drawAt + 400), /if\s*\(\s*modal\.hidden\s*\)\s*return\s*;/, "a queued redraw of a hidden modal is dropped");
  const close = fnBody(menus, "closeTrackDetail", "js/game/menus.js");
  assert.match(close, /detailRO\.disconnect\(\s*\)/, "closing disconnects the ResizeObserver");
  assert.match(close, /detailRO\s*=\s*null/, "…and forgets it");
  const ret = menus.match(/return\s*\{([^}]*\bopenTrackDetail\b[^}]*)\}/);
  assert.ok(ret && /\bcloseTrackDetail\b/.test(ret[1]), "closeTrackDetail is exported beside openTrackDetail (game.js wires the close button to it)");
  assert.match(code("js/game.js"), /\$\(\s*"track-detail-close"\s*\)\.onclick\s*=\s*closeTrackDetail\b/);
});

test("extreme-scale journeys use local-width and compact-chrome contracts", () => {
  // SheetShape BEHAVIOUR: body data-width flips at --wide-at in the body's
  // OWN units (viewport ÷ --ui-scale) with hysteresis; the tuner rail needs
  // its --rail-at width AND three visible slider rows when compact.
  const h = bootSheetShape({ innerWidth: 1300, innerHeight: 600, uiScale: 2 });   // 650 own px
  h.SS.reclassify();
  assert.equal(h.body.dataset.width, "wide", "1300 px at UI SIZE 200% is 650 own px — past the 620 px --wide-at");
  h.sb.innerWidth = 1230; h.SS.reclassify();                                       // 615 own: inside hysteresis
  assert.equal(h.body.dataset.width, "wide", "16 px of hysteresis holds the flag just under the threshold");
  h.sb.innerWidth = 1100; h.SS.reclassify();                                       // 550 own
  assert.equal(h.body.dataset.width, "narrow");
  const rail = h.sheet("lighting-inner", { w: 600, h: 300, hostHeight: 300, vars: { "--rail-at": "500px", "--compact-at": "620px" } });
  const row = h.dom.makeElement("div"); row.className = "adv-item"; row._rect = { width: 100, height: 42 }; rail.el.appendChild(row);
  h.SS.observe(rail.el);
  assert.equal(rail.el.dataset.density, "compact");
  assert.equal(rail.el.dataset.rail, "on", "600 own px ≥ 500 --rail-at and 300/42 ≈ 7 rows → rail");
  rail.el._rect = { width: 600, height: 100, left: 0, top: 0, right: 600, bottom: 100 };
  h.SS.reclassify();
  assert.equal(rail.el.dataset.rail, "off", "wide enough, but only ~2.4 slider rows fit → the horizontal chip strip");
  const plain = h.sheet("sel-inner", { w: 600, h: 100, vars: { "--rail-at": "500px", "--compact-at": "620px" } });
  h.SS.observe(plain.el);
  assert.equal(plain.el.dataset.rail, "on", "the rows rule is the tuners' alone; another sheet rails on width");

  const tuner = css("css/tuner.css");
  const career = css("css/career.css");
  const data = css("css/data.css");
  assert.equal(decl(css("css/menus.css"), "body", "--wide-at"), "620px", "the body-level threshold SheetShape reads");
  assert.ok(tuner.some((r) => r.decls.get("--rail-at") === "500px"));
  assert.ok(rulesFor(tuner, /\[data-density="compact"\]\[data-rail="on"\]/).length, "compact + rail-on has its own rules");
  assert.ok(!tuner.some((r) => r.context.some((c) => /@media \(min-width:\s*720px\)/.test(c))));
  assert.ok(!tuner.some((r) => r.context.some((c) => /@media \(max-height: 430px\)/.test(c))));
  assert.equal(decl(tuner, /\[data-density="compact"\]\[data-rail="off"\] #lt-head/, "display"), "block");
  assert.ok(rulesFor(tuner, /\[data-density="compact"\]$/).some((r) => r.decls.get("overflow") === "hidden"));
  assert.equal(decl(tuner, /\[data-density="compact"\] \.adv-help$/, "display"), "none");
  // The invariant is the UNIT, not the number: this box lives inside
  // `zoom: var(--ui-scale)`, so a viewport svh max ate slider rows at UI SIZE
  // 200%. The multiplier is free to move with the payload.
  const ltJson = rulesFor(tuner, /#lt-json/).filter((r) => r.decls.has("max-height"));
  assert.ok(ltJson.length, "COPY VALUES box declares a max-height");
  for (const r of ltJson) {
    assert.match(r.decls.get("max-height"), /min\(calc\(\d+\s*\*\s*var\(--svhz\)/, "COPY VALUES box uses local --svhz, not 40svh");
    assert.doesNotMatch(r.decls.get("max-height"), /\d+svh\b/, "and never a raw viewport svh");
  }
  assert.ok(ruleFor(tuner, /#lt-head h2, #ct-head/), "tuner heads share one rule");
  assert.ok(decl(career, /^#cr-inner\[data-density="compact"\] #cr-foot\b/, "grid-template-columns"));
  assert.equal(decl(data, /^body\[data-density="compact"\] \.dh-tab\b/, "min-height"), "var(--tap-min)");
  assert.ok(ruleFor(data, /^body\[data-density="compact"\] \.dh-overlay\b/));
  assert.ok(!data.some((r) => r.context.some((c) => /orientation:\s*landscape\) and \(max-height:/.test(c))),
    "data hub short-height chrome must use body[data-density], not viewport max-height");
  assert.ok(ruleFor(data, /^body\[data-shape="tall"\]\[data-width="narrow"\] \.dh-tabs\b/),
    "portrait 2×3 destinations use the zoom-aware shape+width flags (not @media orientation)");
  assert.equal(decl(css("css/menus.css"), /^#ss-inner\[data-density="compact"\] #ss-cal \.season-upcoming-row/, "flex-wrap"), "wrap");
});

test("an active career locks team and seat selection in the garage", () => {
  const setup = code("js/game/setup-ui.js");
  assert.match(setup, /careerLocked\s*=\s*typeof\s+Career\s*!==\s*"undefined"\s*&&\s*Career\.inCareer\s*&&\s*Career\.inCareer\(\s*\)/);
  assert.match(setup, /card\.disabled\s*=\s*!!\s*careerLocked\b/);
  assert.match(setup, /\.disabled\s*=\s*taken\s*\|\|\s*careerLocked\b/);
  assert.doesNotMatch(code("js/game.js"), /careerActive:/);
});

/* ── CamModes on the mini DOM ───────────────────────────────────────────── */
function bootCamModes(camMode = 2) {
  const dom = makeDom();
  const sb = uiSandbox(dom, { CamTunerPanel: { refresh() {} } });
  vm.runInNewContext(src("js/game/tables.js") + "\n" + src("js/game/cam-modes.js"), sb, { filename: "js/game/cam-modes.js" });
  const store = {};
  const G = { $: (id) => dom.byId(id), camMode, camCutT: 0, store: { set: (k, v) => { store[k] = v; }, get: () => null } };
  const api = sb.CamModes.create(G);
  const trigger = dom.byId("btn-cam");
  const open = () => { dom.dispatch(trigger, { type: "contextmenu" }); return dom.document.querySelector("#campicker"); };
  return { dom, G, api, store, trigger, open, key: (el, k) => dom.dispatch(el, { type: "keydown", key: k }), active: () => dom.document.activeElement };
}

test("camera picker is a keyboard radio menu and cannot outlive the race layer", () => {
  const h = bootCamModes(2);
  assert.deepEqual(Object.keys(h.api).sort(), ["cycleCam", "hideCamPicker", "refreshCamBtn", "setCamMode"], "CamModes.create surface");
  assert.equal(h.trigger.getAttribute("aria-haspopup"), "menu");
  assert.equal(h.trigger.getAttribute("aria-expanded"), "false");
  const picker = h.open();
  assert.ok(picker, "hold / right-click builds the picker");
  assert.equal(picker.getAttribute("role"), "menu");
  assert.equal(picker.className, "balanced-row", "the picker balances from local space like every other cluster");
  assert.equal(picker.hidden, false);
  assert.equal(h.trigger.getAttribute("aria-expanded"), "true");
  assert.ok(picker.children.length >= 10 && picker.children.every((b) => b.getAttribute("role") === "menuitemradio"));
  assert.deepEqual(picker.children.map((b) => b.getAttribute("aria-checked") === "true"), picker.children.map((_, i) => i === 2), "only the live mode is aria-checked");
  assert.equal(h.active(), picker.children[2], "opening focuses the checked item");
  h.key(picker, "ArrowRight"); assert.equal(h.active(), picker.children[3]);
  h.key(picker, "ArrowDown");  assert.equal(h.active(), picker.children[4]);
  h.key(picker, "ArrowLeft");  assert.equal(h.active(), picker.children[3]);
  h.key(picker, "ArrowUp");    assert.equal(h.active(), picker.children[2]);
  h.key(picker, "End");        assert.equal(h.active(), picker.children[picker.children.length - 1]);
  h.key(picker, "ArrowRight"); assert.equal(h.active(), picker.children[0], "wraps");
  h.key(picker, "Home");       assert.equal(h.active(), picker.children[0]);
  h.key(picker, "Escape");
  assert.equal(picker.hidden, true, "Escape closes the picker");
  assert.equal(h.trigger.getAttribute("aria-expanded"), "false");
  h.open();
  h.api.hideCamPicker();
  assert.equal(picker.hidden, true, "hideCamPicker is the exported closer game.js calls on pause / quit");
  assert.equal(h.api.cycleCam(), "cockpit");
  assert.equal(h.store.camMode, 3, "the pick persists");
  // game.js closes it whenever the race layer goes away.
  const game = code("js/game.js");
  assert.match(fnBody(game, "quitToMenu", "js/game.js"), /hideCamPicker\(\s*\)/);
  assert.match(fnBody(game, "setPaused", "js/game.js"), /hideCamPicker\(\s*\)/);
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
  for (const phrase of ["ADAPTIVE BUTTONS", "BRAKE CUE", "default ON", "STEERING &amp; ASSISTS", "ADVANCED disclosure", "TV SIDE",
    "tap to toggle", "pauses only if nothing is open", "drag on the track", "a tap does not steer", "deny switches to BUTTONS",
    "shifter left and the pedals right", "triggers are analog", "leave a list for the header or column beside it", "hold to repeat"]) {
    assert.ok(htp.includes(phrase), `How to Play must say: ${phrase}`);
  }
  assert.match(htp, /GEARS: MANUAL<\/span> \(tilt only/);
  assert.doesNotMatch(htp, /HALVES|TRACKSIDE|screen halves|tap left\/right/);
  const game = code("js/game.js");
  assert.match(game, /autoThrottle\(\s*\)\s*\?\s*1\s*:\s*Math\.max\(\s*0\s*,\s*Input\.throttleLevel\(\s*\)\s*\)/,
    "TOUCH auto-throttle must apply full pedal travel, not a 0 analog reading");
  assert.match(game, /steerMode\s*===\s*"tilt"\s*\|\|\s*!Input\.touchControlsNeeded\(\s*\)/,
    "phone MANUAL gears stay tilt-only — BUTTONS already owns both thumbs");
  assert.match(game, /L\.push\(\s*shifts\s*,\s*taps\s*\)\s*;\s*R\.push\(\s*pedals\s*\)/,
    "tilt+manual puts the shifter left and the pedals right");
  // MenuNav BEHAVIOUR: arrows wrap in every direction so a pad press is never
  // a no-op. (The sideways out-of-band pass — pickSideways — is pinned as
  // behaviour by tests/unit/menu-nav-spatial.test.mjs and not repeated here.)
  const h = bootMenuNav();
  const first = h.button("a", 10), mid = h.button("b", 50), last = h.button("c", 90);
  assert.equal(h.MenuNav.step(last, 0, 1, [first, mid, last]), first, "Down from the last item wraps to the first");
  assert.equal(h.MenuNav.step(first, 0, -1, [first, mid, last]), last, "Up from the first item wraps to the last");
  assert.equal(h.MenuNav.step(last, 1, 0, [first, mid, last]), first, "Right off the end wraps in DOM order");
  assert.equal(h.MenuNav.step(first, -1, 0, [first, mid, last]), last, "Left off the start wraps in DOM order");
});

test("How to Play exposes pinned semantic jump landmarks", () => {
  const html = read("index.html");
  const overlays = css("css/overlays.css");
  assert.match(html, /id="htp-contents"[^>]*aria-label="How to play sections"/);
  for (const id of ["controls", "racing", "setup", "modes", "friends"]) {
    assert.match(html, new RegExp(`href="#htp-${id}"`));
    assert.match(html, new RegExp(`<dt id="htp-${id}">`));
  }
  assert.equal(decl(overlays, "#htp-contents", "overflow-x"), "auto");
  assert.equal(decl(overlays, "#htp-contents a", "min-height"), "var(--chip-h)");
  assert.ok(ruleFor(overlays, /^#howtoplay-inner\[data-shape="wide"\] > #htp-contents/));
  assert.ok(ruleFor(overlays, /^#howtoplay-inner\[data-density="compact"\] > #htp-contents/));
  assert.match(html, /id="vsfriend-inner"/);
  assert.ok(rulesFor(overlays, /^#howtoplay:has\(#htp-friends:target\)/).some((r) => r.decls.get("background") === "var(--plate-on)"));
  assert.ok(decl(overlays, "#howtoplay dt[id]", "scroll-margin-block-start"));
  assert.ok(!rulesFor(overlays, "#howtoplay dl").some((r) => /max-content minmax\(0, 1fr\) max-content/.test(r.decls.get("grid-template-columns") || "")),
    "help rows must not synchronize two unrelated answers");
  assert.equal(decl(css("css/components.css"), "#howtoplay", "--sheet-w"), "1000px");
});

test("compact Career keeps its mode context instead of ellipsizing it", () => {
  const career = css("css/career.css");
  assert.equal(decl(career, '#cr-inner[data-density="compact"] #cr-sub', "white-space"), "normal");
  assert.equal(decl(career, '#cr-inner[data-density="compact"] #cr-sub', "text-overflow"), "clip");
});

test("variable control clusters use one content-driven balanced-row primitive", () => {
  const html = read("index.html");
  const components = css("css/components.css");
  assert.equal(decl(components, ".balanced-row", "display"), "flex");
  assert.equal(decl(components, ".balanced-row", "flex-wrap"), "wrap");
  assert.match(decl(components, /^\.balanced-row > :not\(\[hidden\]\)$/, "flex") || "", /^1 1 var\(--balance-basis/);
  for (const id of ["pm-category-tabs", "menu-secondary", "rs-laps", "rs-weather",
    "rs-time", "rs-diff", "rs-quali", "rs-caution", "rs-reliab", "lt-tabs", "ct-modes"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*balanced-row`), `${id} must balance from local space`);
  }
  assert.equal(bootCamModes().open().className, "balanced-row", "the camera picker is a balanced-row too");
  const all = [html, read("css/components.css"), read("css/menus.css"), read("css/tuner.css"), read("js/game/cam-modes.js")].join("\n");
  assert.doesNotMatch(all, /no-orphan-[235]/, "column-count-specific orphan patches must not return");
  assert.ok(!rulesFor(css("css/menus.css"), /#rs-(?:laps|weather|diff|time)\b/).some((r) => /^repeat\([235]/.test(r.decls.get("grid-template-columns") || "")));
});

test("overflowing Help navigation keeps its first landmark reachable", () => {
  const overlays = css("css/overlays.css");
  assert.equal(decl(overlays, "#htp-contents", "justify-content"), "flex-start");
  assert.equal(decl(overlays, "#htp-contents > :first-child", "margin-inline-start"), "auto");
});

/* ── Input (gamepad menu nav) in a VM ───────────────────────────────────── */
function bootInput() {
  const dispatched = [];
  const state = { navOpen: false, top: null, now: 1000, pad: null, active: null };
  const sb = {
    Math, console, Object, Array, Number, String, Map, Set, Date, isFinite, parseFloat,
    performance: { now: () => state.now },
    document: {
      dispatchEvent: (e) => { dispatched.push(e.key); return true; },
      addEventListener() {}, get activeElement() { return state.active; }, readyState: "complete",
      getElementById: () => null, body: { classList: { contains: () => false } },
    },
    navigator: { getGamepads: () => [state.pad], maxTouchPoints: 0, userAgent: "node" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    KeyboardEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    UiLayers: { navOpen: () => state.navOpen, top: () => state.top },
    MenuNav: { activeLayer: () => state.top, FOCUSABLE: "button,input" },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    screen: { orientation: { type: "landscape-primary", angle: 0, addEventListener() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/log.js", "js/mat4.js", "js/game/input.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  const pad = (ax, buttons = [], ax2 = 0) => ({
    connected: true, axes: [ax, 0, ax2, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
  });
  // A pad is re-probed on a ~1 s throttle when no gamepadconnected event fired.
  state.pad = pad(0);
  for (let i = 0; i < 61; i++) Input.poll();
  assert.ok(Input.padConnected, "the harness pad is seen by the re-probe");
  return { Input, state, pad, dispatched, keys: () => dispatched.splice(0) };
}

test("gamepad menu nav seeds focus on open and uses a larger stick deadzone than driving", () => {
  const h = bootInput();
  // DRIVING: the left stick rescales past a 0.14 centre slop.
  h.state.pad = h.pad(0.13); h.Input.poll();
  assert.equal(h.Input.steer(), 0, "0.13 is inside the driving deadzone");
  h.state.pad = h.pad(0.16); h.Input.poll();
  assert.ok(h.Input.steer() > 0 && h.Input.steer() < 0.05, "0.16 just clears it and is rescaled from the edge, not stepped");
  h.state.pad = h.pad(0.5); h.Input.poll();
  assert.ok(Math.abs(h.Input.steer() - (0.5 - 0.14) / (1 - 0.14)) < 1e-9, "rescale is (|ax| - dz) / (1 - dz)");

  // MENU OPEN: the FIRST poll seeds focus with one ArrowDown, once per layer.
  h.state.navOpen = true; h.state.top = { id: "select" };
  h.state.pad = h.pad(0); h.Input.poll();
  assert.deepEqual(h.keys(), ["ArrowDown"], "opening a menu seeds MenuNav's first-arrow path");
  h.Input.poll();
  assert.deepEqual(h.keys(), [], "the seed fires once, not every frame");
  // Menu stick deadzone is LARGER than the driving one: 0.18 drives, but does not navigate.
  h.state.pad = h.pad(0.18); h.Input.poll();
  assert.deepEqual(h.keys(), [], "a resting stick at 0.18 must not creep through the menu");
  assert.ok(h.Input.steer() > 0, "…even though the same deflection steers the car");
  h.state.pad = h.pad(0.30); h.Input.poll();
  assert.deepEqual(h.keys(), ["ArrowRight"], "a deliberate push navigates");
  // Held: 450 ms before the first repeat, then every 130 ms.
  h.state.now += 400; h.Input.poll(); assert.deepEqual(h.keys(), [], "no repeat before the initial delay");
  h.state.now += 60;  h.Input.poll(); assert.deepEqual(h.keys(), ["ArrowRight"], "first repeat after ~450 ms");
  h.state.now += 100; h.Input.poll(); assert.deepEqual(h.keys(), [], "repeat cadence is slower than every frame");
  h.state.now += 40;  h.Input.poll(); assert.deepEqual(h.keys(), ["ArrowRight"], "…about every 130 ms");
  h.state.pad = h.pad(0); h.Input.poll(); assert.deepEqual(h.keys(), [], "release stops the repeat immediately");
  // The right stick is the fallback when the left is centred.
  h.state.pad = h.pad(0, [], 0.4); h.Input.poll();
  assert.deepEqual(h.keys(), ["ArrowRight"], "right stick navigates when the left stick is centred");
  h.state.pad = h.pad(0); h.Input.poll(); h.keys();
  // A new top layer re-arms the seed.
  h.state.top = { id: "garage" }; h.Input.poll();
  assert.deepEqual(h.keys(), ["ArrowDown"], "a new UiLayers.top() re-seeds (title→select, Start→pause)");
  // A on a focused range/number must not click-to-jump the thumb; on a button it clicks.
  let clicked = 0;
  const layer = { id: "garage", contains: () => true };
  h.state.top = layer; h.Input.poll(); h.keys();
  h.state.active = { tagName: "INPUT", type: "range", matches: () => true, click: () => clicked++ };
  h.state.pad = h.pad(0, [0]); h.Input.poll();
  assert.equal(clicked, 0, "A on a focused range does not click it");
  assert.deepEqual(h.keys(), [], "…and does not seed either");
  h.state.pad = h.pad(0); h.Input.poll();
  h.state.active = { tagName: "BUTTON", type: "", matches: () => true, click: () => clicked++ };
  h.state.pad = h.pad(0, [0]); h.Input.poll();
  assert.equal(clicked, 1, "A on a focused button activates it");
  // Closing the menu clears the seed so the next open seeds again — when
  // nothing in the layer holds focus; a focused control is left alone.
  h.state.pad = h.pad(0); h.state.navOpen = false; h.Input.poll(); h.keys();
  h.state.navOpen = true; h.Input.poll();
  assert.deepEqual(h.keys(), [], "a layer that still has a focused control is not re-seeded");
  h.state.navOpen = false; h.Input.poll(); h.keys();
  h.state.active = null; h.state.navOpen = true; h.Input.poll();
  assert.deepEqual(h.keys(), ["ArrowDown"], "reopening the same layer with nothing focused seeds again");

  // The seams the pad path relies on, as behaviour where a module loads alone.
  const sbU = uiSandbox(makeDom());
  vm.runInNewContext(src("js/game/uilayers.js"), sbU, { filename: "js/game/uilayers.js" });
  assert.equal(typeof sbU.UiLayers.navOpen, "function", "title #overlay is pad-navigable through UiLayers.navOpen()");
  assert.equal(sbU.UiLayers.navOpen(), false, "nothing open on a bare DOM");
  // Text fields joined range/number here (menu-a11y-audit.test.mjs pins the
  // behaviour): every <input> keeps only the caret keys, so Up/Down leave the row.
  assert.match(code("js/game/menunav.js"), /return !!CARET_KEYS\[key\]/,
    "inputs own only the caret keys (Left/Right/Home/End) so Up/Down leave the row");
  assert.match(code("js/game/ariastate.js"), /#vsfriend,\s*#season-setup/,
    "AriaState watches the two DOM-built overlays UiLayers already lists");
  assert.match(code("js/game/scrollfade.js"), /"#menu-buttons"/,
    "title chrome fade watches the zoomed #menu-buttons scroller");
  assert.match(code("js/game/scrollfade.js"), /\boverflowX\b/,
    "sideways strips get .sf-l / .sf-r, not only overflow-y thumbs");
});

test("dense sheets preserve a functional content height at extreme UI size", () => {
  // SheetShape BEHAVIOUR: a sheet that declares --fit-at is capped to what its
  // host can hold — written as --sheet-scale on the sheet and mirrored as
  // --sheet-eff-scale on the host — and released when the host grows.
  const h = bootSheetShape({ uiScale: 2 });
  const s = h.sheet("cs-inner", { w: 800, h: 400, hostHeight: 400, vars: { "--fit-at": "300px", "--compact-at": "380px" } });
  h.SS.observe(s.el);
  assert.equal(s.el.dataset.fit, "on", "400 px of host cannot hold 300 px × 200%");
  assert.equal(s.el.style.getPropertyValue("--sheet-scale"), "1.333", "capped to available / --fit-at");
  assert.equal(s.host.style.getPropertyValue("--sheet-eff-scale"), "1.333", "the host mirrors the effective scale for siblings");
  s.host._client = 700; h.SS.reclassify();
  assert.equal(s.el.dataset.fit, "off", "a tall enough host lifts the cap");
  assert.equal(s.el.style.getPropertyValue("--sheet-scale"), "", "…and removes the inline override");
  assert.equal(s.host.style.getPropertyValue("--sheet-eff-scale"), "");
  const nofit = h.sheet("plain", { w: 800, h: 400, hostHeight: 100, vars: {} });
  h.SS.observe(nofit.el);
  assert.equal(nofit.el.dataset.fit, undefined, "a sheet without --fit-at is never fit-managed");

  const components = css("css/components.css");
  const garage = css("css/carsetup.css");
  const menus = css("css/menus.css");
  assert.ok(components.some((r) => r.decls.get("zoom") === "var(--sheet-scale, var(--ui-scale))"), "sheets zoom by the capped scale");
  assert.equal(decl(components, ".sheet > :where(.sheet-head, .sheet-body, .sheet-foot)", "min-width"), "0");
  const fitAt = (rules, sel) => rulesFor(rules, sel).map((r) => r.decls.get("--fit-at")).filter(Boolean);
  assert.ok(fitAt(garage, /^#cs-inner/).includes("340px") && fitAt(garage, /^#cs-inner/).includes("240px"), "garage declares tall/wide --fit-at");
  assert.ok(fitAt(components, /^#pmsettings-inner/).includes("300px") && fitAt(components, /^#pmsettings-inner/).includes("220px"));
  assert.ok(fitAt(components, /^#vsfriend-inner/).includes("280px"));
  assert.ok(fitAt(css("css/career.css"), /^#cr-inner/).includes("300px") && fitAt(css("css/career.css"), /^#cr-inner/).includes("220px"));
  assert.ok(fitAt(menus, /^#ss-inner/).includes("300px") && fitAt(menus, /^#ss-inner/).includes("220px"), "#ss-inner wide-shape fit-at 220px");
  const vsTwo = rulesFor(css("css/overlays.css"), "#vsfriend .vs-two");
  assert.ok(vsTwo.some((r) => r.context.includes("@container sheet (min-width: 620px)")), "VS Friend columns are a container query");
  assert.ok(!vsTwo.some((r) => r.context.some((c) => /@media \(min-width: 620px\)/.test(c))));
  assert.ok(!declares(menus, '#sel-inner[data-fit="on"] #sel-preview-map', "display", "none"),
    "zoomed / data-fit SELECT keeps the map; caps bind instead of hiding it");
});

test("garage preview chips hug the sheet and season quali is a label", () => {
  const garage = css("css/carsetup.css");
  const game = code("js/game.js");
  const spotify = code("js/game/spotify.js");
  assert.equal(decl(garage, "#cs-stack", "left"), "auto");
  assert.equal(decl(garage, "#cs-stack", "width"), "max-content");
  assert.ok(!declares(garage, "#cs-stack", "left", /calc\(var\(--safe-l\)/));
  assert.match(game, /qEl\.hidden\s*=\s*qForced\s*!=\s*null/);
  assert.match(game, /QUALIFYING LAP"\s*\+\s*\(\s*qForced\s*==\s*null\s*\?\s*""\s*:\s*" · "\s*\+/);
  const menus = css("css/menus.css");
  const quali = ruleFor(menus, /#rs-quali-section:has\(#rs-quali\[hidden\]\)$/);
  assert.ok(quali && quali.decls.get("grid-column") === "1 / -1" && quali.decls.get("grid-row") === "1");
  assert.equal(decl(menus, /#rs-body:has\(#rs-quali\[hidden\]\) > :is\(#rs-diff-section, #rs-caution-section, #rs-reliab-section\)$/, "grid-row"), "3");
  assert.equal(decl(menus, /#rs-body$/, "overflow-y"), "auto", "the race-settings body is the one scroller (compact wide)");
  assert.ok(rulesFor(menus, /#rs-reliab,[\s\S]*#rs-diff$/).some((r) => r.decls.get("flex-wrap") === "nowrap"));
  assert.equal(decl(menus, /#rs-body:not\(:has\(#rs-quali\[hidden\]\)\) > :is\(#rs-diff-section, #rs-caution-section, #rs-reliab-section\)$/, "grid-row"), "3");
  assert.equal(decl(menus, /#rs-body:not\(:has\(#rs-quali\[hidden\]\)\) :is\(#rs-laps, #rs-weather\)$/, "flex-wrap"), "nowrap");
  assert.ok(rulesFor(menus, /^\.sheet\[data-shape="tall"\] #rs-body:not\(:has\(#rs-quali\[hidden\]\)\) #rs-caution-section,/).some((r) => r.decls.get("grid-row") === "4"));
  assert.equal(decl(css("css/components.css"), "#race-settings .sheet", "--compact-at"), "760px");
  assert.match(spotify, /audio\.hidden\s*=\s*true\b/);
  assert.match(spotify, /audio\.hidden\s*=\s*false\b/);
});

/* ── SettingsNav on the mini DOM ────────────────────────────────────────── */
function bootSettingsNav(stored) {
  const dom = makeDom();
  const sb = uiSandbox(dom, { ResizeObserver: class { observe() {} }, ScrollFade: { refresh() {} } });
  vm.runInNewContext(src("js/game/settings-nav.js"), sb, { filename: "js/game/settings-nav.js" });
  const st = { ...stored };
  let selected = 0;
  const nav = sb.SettingsNav.create({ get: (k, d) => (k in st ? st[k] : d), set: (k, v) => { st[k] = v; } }, () => selected++);
  return { dom, nav, st, selected: () => selected, panel: (id) => dom.byId("pm-panel-" + id), tab: (id) => dom.byId("pm-tab-" + id) };
}

test("title settings, pause standings, and career modes stay reachable", () => {
  // SettingsNav BEHAVIOUR: showCurrent() re-shows the stored category WITHOUT
  // moving focus (title Settings lands on MORE without a second click).
  const h = bootSettingsNav({ settingsCategory: "more" });
  assert.deepEqual(Object.keys(h.nav).sort(), ["show", "showCurrent"]);
  assert.equal(h.panel("more").hidden, false, "create() shows the stored category");
  assert.equal(h.panel("controls").hidden, true);
  assert.equal(h.dom.document.activeElement, null, "create() does not steal focus");
  h.nav.show("controls", true);
  assert.equal(h.dom.document.activeElement, h.tab("controls"), "show(id, true) focuses the tab");
  assert.equal(h.st.settingsCategory, "controls", "the pick persists");
  h.dom.document.activeElement = null;
  h.nav.showCurrent();
  assert.equal(h.panel("controls").hidden, false);
  assert.equal(h.dom.document.activeElement, null, "showCurrent() never focuses");
  h.nav.show("more", false);
  assert.equal(h.panel("more").hidden, false);
  assert.equal(h.tab("more").getAttribute("aria-selected"), "true");
  assert.equal(h.tab("controls").getAttribute("aria-selected"), "false");
  assert.equal(h.tab("more").tabIndex, 0);
  assert.equal(h.tab("controls").tabIndex, -1, "roving tab stop");
  const game = code("js/game.js");
  assert.match(game, /settingsNav\.show\(\s*"more"\s*,\s*false\s*\)\s*;\s*openSettings\(\s*\)/,
    "title Settings opens the MORE category (How to Play lives there)");
  assert.match(game, /pmStandings\.hidden\s*=\s*!\(\s*isChampionship\(\s*\)\s*&&\s*SeasonCal\.hasProgress\(\s*season\s*\)\s*&&\s*season\.round\s*<\s*SeasonCal\.rounds\(\s*\)\s*\)/,
    "pause STANDINGS matches the title: hide once the season is finished");
  assert.match(game, /\$\(\s*"pm-restart"\s*\)\.disabled\s*=\s*!!\s*\(\s*netPlay\.active\(\s*\)\s*\|\|\s*qualiNetDone\s*\)/,
    "RESTART looks dead in net / quali-net, same gate as its click handler");
  assert.equal(decl(css("css/career.css"), '#cr-inner:not([data-pair="on"]):has(#cr-left .cr-slot):has(#cr-right .cr-slot) > #cr-body', "grid-template-columns"),
    "minmax(0, 1fr) minmax(0, 1fr)", "any stacked modes picker puts DRIVER and MY TEAM in one row");
});

test("neutral buttons share the settings tab-header plate", () => {
  const tokens = css("css/tokens.css");
  const components = css("css/components.css");
  const menus = css("css/menus.css");
  const carsetup = css("css/carsetup.css");
  const data = css("css/data.css");
  assert.equal(decl(tokens, /:root/, "--plate"), "rgba(255, 255, 255, 0.045)");
  assert.equal(decl(tokens, /:root/, "--plate-line"), "rgba(255, 255, 255, 0.16)");
  assert.match(decl(tokens, /:root/, "--plate-on") || "", /^color-mix\(in oklab, var\(--red\) 18%/);
  assert.equal(decl(components, "#pm-category-tabs > button", "background"), "var(--plate)");
  assert.ok(rulesFor(components, /^#pm-category-tabs > button\.active,/).some((r) => r.decls.get("background") === "var(--plate-on)"));
  assert.equal(decl(components, ".bigbtn.alt", "background"), "var(--plate)");
  assert.equal(decl(menus, ".sel-chip", "background"), "var(--plate)");
  assert.equal(decl(menus, ".sel-chip.active", "background"), "var(--plate-on)");
  assert.equal(decl(menus, "#race-settings .sel-chip.active", "background"), "var(--plate-on)");
  assert.equal(decl(carsetup, ".cs-tab", "background"), "var(--plate)");
  assert.equal(decl(carsetup, ".cs-tab.active", "background"), "var(--plate-on)");
  assert.equal(decl(data, ".dh-pill.dh-active", "background"), "var(--plate-on)");
  assert.equal(decl(data, ".dh-livebtn.dh-active", "background"), "var(--plate-on)");
});

test("tool doors and lone foot actions do not stretch into banners", () => {
  const components = css("css/components.css");
  assert.equal(decl(components, ".pm-doors", "--balance-basis"), "12rem");
  assert.equal(decl(components, ".sheet-foot .bigbtn:only-child", "flex"), "0 1 auto");
  assert.equal(decl(components, ".pm-group .tune-row .tune-label", "position"), "static");
  assert.equal(decl(components, '#pmsettings-inner .pm-groups > [role="tabpanel"] button', "white-space"), "normal");
  assert.ok(rulesFor(css("css/overlays.css"), "#howtoplay dl").some((r) => r.context.includes("@container sheet (max-width: 360px)")));
  assert.equal(decl(css("css/career.css"), ".cr-cheats .sel-chip", "min-width"), "0");
});

/* ── Photomode COPY VALUES in a VM ──────────────────────────────────────── */
function bootCopyValues(opts = {}) {
  const dom = makeDom();
  const order = [];
  const sb = uiSandbox(dom, {
    GameAudio: { uiSelect() {}, uiTick() {} }, PerfGov: { tier: () => 0 },
    navigator: { clipboard: { writeText: () => { order.push("clipboard"); return opts.clipboardRejects ? Promise.reject(new Error("no")) : Promise.resolve(); } } },
  });
  sb.document.execCommand = (c) => { order.push("execCommand:" + c); return !!opts.execOk; };
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/game/photomode.js"), ctx, { filename: "js/game/photomode.js" });
  const G = {
    $: (id) => dom.byId(id), gfx: {}, photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 }, photoKeys: {}, photoMouse: {}, photoMove: {}, photoLook: {},
    applyResMode() {}, ltKey: () => opts.here || "monza|dusk|dry", persistLightTune() {}, applyLightTune() {}, refreshLightTunePanel() {},
    _ltStore: opts.store || { "monza|dusk|dry": { exposure: 1.2 }, "spa|night|wet": { fogDensityMul: 0.5, bloom: 0.3 }, "*": {} },
    track: { def: { name: "Monza" } }, camEye: [0, 0, 0], camTgt: [0, 0, -1], camFov: 60,
  };
  vm.runInContext("Photomode", ctx).create(G);
  dom.byId("lt-copy").onclick();
  return { dom, order, json: dom.byId("lt-json").value, btn: dom.byId("lt-copy"), sb };
}

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
  const h = bootCopyValues();
  assert.match(h.json, /^window\.LightEdits\s*=\s*\{/,
    "the export must be a LightEdits DELTA — the name is the interlock that stops " +
    "bake.mjs (a FULL REPLACE) from writing it and deleting every profile it omits");
  assert.doesNotMatch(h.json, /LightPresets/, "and it must never wear the snapshot's name");
  const w = {};
  vm.runInNewContext(h.json, { window: w });
  assert.deepEqual(Object.keys(w), ["LightEdits"], "the paste evaluates to exactly one assignment");
  assert.deepEqual(Object.keys(w.LightEdits), ["monza|dusk|dry", "spa|night|wet"],
    "built from the local overrides only — the condition just tuned FIRST, empty layers dropped");
  assert.deepEqual({ ...w.LightEdits["spa|night|wet"] }, { fogDensityMul: 0.5, bloom: 0.3 });   // spread: the VM object is another realm's
  // The player asked for their current condition first, then the rest.
  assert.ok(h.json.indexOf("THIS CONDITION") > -1 && h.json.indexOf("EVERYTHING ELSE") > -1,
    "both blocks are labelled for whoever reads the paste");
  assert.ok(h.json.indexOf("THIS CONDITION") < h.json.indexOf("EVERYTHING ELSE"),
    "the condition just tuned is emitted first");
  assert.ok(h.json.length < 2000, "a delta, not the 182,569-character merge");
  assert.equal(h.dom.byId("lt-json").hidden, false, "the textarea is revealed with the text selected");
  const none = bootCopyValues({ store: { "*": {} } });
  assert.equal(none.btn.textContent, "NOTHING TUNED", "no overrides → the button says so instead of exporting an empty object");
});

test("COPY VALUES tries the synchronous copy while the click still has activation", () => {
  const h = bootCopyValues({ execOk: true });
  assert.equal(h.order[0], "execCommand:copy",
    "execCommand(\"copy\") must run BEFORE the clipboard promise. From inside its " +
    "rejection handler it runs a microtask later — which Chromium still allows (~5 s of " +
    "transient activation, measured) and WebKit is documented not to. Ordering it first " +
    "is what stops the answer depending on the engine.");
  assert.ok(h.order.indexOf("clipboard") > 0, "the async clipboard API is still tried afterwards (the only path that survives a browser without execCommand)");
  const bare = bootCopyValues({ execOk: false, clipboardRejects: true });
  assert.deepEqual(bare.order, ["execCommand:copy", "clipboard"], "both paths are attempted even when the first fails");
});

test("a lighting DELTA merges and an agent PROPOSAL replaces", () => {
  // The two inputs mean different things inside one condition and conflating
  // them loses data either way: a proposal is a considered whole profile (so it
  // may drop a knob it decided against), a delta is the handful of sliders a
  // person moved (so it may not delete the seven they did not touch).
  const mp = code(".claude/skills/lighting-tuner/scripts/merge-proposals.mjs");
  assert.match(mp, /merged\[\s*key\s*\]\s*=\s*delta\s*\?\s*Object\.assign\(\s*\{\s*\}\s*,\s*merged\[\s*key\s*\]\s*,\s*clean\s*\)\s*:\s*clean\b/,
    "delta merges into the shipped map, proposal replaces it");
  assert.match(mp, /if\s*\(\s*!delta\s*\)\s*delete\s+merged\[\s*key\s*\]/,
    "only a proposal may empty a condition — a paste must never wipe a profile it never mentioned");
  assert.match(mp, /\.LightPresets\s*&&\s*!\w+\.LightEdits/,
    "a snapshot fed to the merge tool is named as such, not merged as a delta");
  // bake.mjs BEHAVIOUR: hand it a real COPY VALUES export and it must refuse,
  // naming the tool that does take one, before touching anything.
  const delta = bootCopyValues().json;
  const tmp = path.join(ROOT, "artifacts", "ui-improve-pass-delta.js");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, delta);
  try {
    const r = spawnSync(process.execPath, [".claude/skills/lighting-tuner/scripts/bake.mjs", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(r.status, 0, "bake.mjs must exit non-zero on a LightEdits delta");
    assert.match(r.stderr, /LightEdits/, "…and say why by name");
    assert.match(r.stderr, /merge-proposals\.mjs/, "…and point at the tool that does take one");
  } finally { fs.rmSync(tmp, { force: true }); }
});
