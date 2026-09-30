/* title-layout — APPEARANCE › TITLE LAYOUT: move and size the title screen's
 * buttons, title and car drawing, plus button width / layout / side. Runs the
 * REAL module (and SettingRow) in node:vm over the mini DOM, and holds
 * index.html's first-paint copy of the arithmetic equal to the module's.
 *
 * Run: node --test tests/unit/title-layout.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SHELL = read("index.html");
const CSS = read("css/responsive.css");
const plain = (o) => JSON.parse(JSON.stringify(o));

function boot(stored = {}) {
  const dom = makeDom();
  const panel = dom.byId("pm-panel-appearance");
  const replay = dom.byId("pm-replay-intro");
  panel.appendChild(replay);
  // mini-dom's getElementById creates on a miss; the module's mount-once
  // guard needs a real miss, so only ids that exist are found.
  const get = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? get(id) : null);
  const data = Object.assign({}, stored);
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { if (v === null) delete data[k]; else data[k] = v; } };
  const timers = [];
  const sb = {
    document: dom.document, GameStore: { store }, Log: { info() {}, warn() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/ui/setting-row.js", "js/ui/title-layout.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const M = vm.runInContext("TitleLayout", ctx);
  return { dom, M, data, panel, html: dom.documentElement, timers };
}

test("normalize clamps every field and reads junk as shipped", () => {
  const { M } = boot();
  const d = plain(M.normalize(null));
  assert.deepEqual(d, { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 0, y: 0, size: 100 }, layout: "grid", side: "auto" });
  const n = plain(M.normalize({ btns: { x: 90, y: -90, size: 999, width: 5 }, title: { size: "big" }, art: { x: 12.6 }, layout: "diagonal", side: "left" }));
  assert.deepEqual(n.btns, { x: 50, y: -50, size: 200, width: 20 }, "clamped; a width under 20% of the screen is 20");
  assert.equal(n.title.size, 100, "junk is the shipped value");
  assert.equal(n.art.x, 13, "whole percents");
  assert.equal(n.layout, "grid"); assert.equal(n.side, "auto");
  assert.equal(M.isDefault(null), true); assert.equal(M.isDefault({ btns: { width: -4 } }), true, "a negative width is AUTO");
  assert.equal(M.isDefault({ side: "swap" }), false);
});

test("untouched, the page carries nothing; custom lands as --tl-* tokens and html attributes", () => {
  const { M, html, data } = boot();
  assert.equal(html.dataset.titleLayout, undefined);
  assert.deepEqual(plain(html.style._decls), {});
  M.set({ btns: { x: -10, y: 5, size: 120, width: 40 }, art: { size: 150 }, layout: "stack", side: "swap" });
  assert.equal(html.dataset.titleLayout, "on");
  assert.equal(html.dataset.titleSide, "swap");
  assert.equal(html.dataset.titleBtns, "stack");
  assert.equal(html.dataset.titleBtnw, "on");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "-10vw");
  assert.equal(html.style.getPropertyValue("--tl-btns-y"), "5vh");
  assert.equal(html.style.getPropertyValue("--tl-btns-size"), "1.2");
  assert.equal(html.style.getPropertyValue("--tl-btns-w"), "40");
  assert.equal(html.style.getPropertyValue("--tl-art-size"), "1.5");
  assert.ok(data.titleLayout, "stored");
  M.reset();
  assert.equal(data.titleLayout, undefined, "shipped stores null");
  assert.equal(html.dataset.titleLayout, undefined);
  assert.equal(html.dataset.titleSide, undefined);
  assert.deepEqual(plain(html.style._decls), {}, "every token taken back off");
});

test("a stored layout applies at eval", () => {
  const { html } = boot({ titleLayout: { title: { y: -20 }, layout: "row" } });
  assert.equal(html.dataset.titleLayout, "on");
  assert.equal(html.dataset.titleBtns, "row");
  assert.equal(html.style.getPropertyValue("--tl-title-y"), "-20vh");
});

test("index.html's first-paint copy writes exactly what the module writes", () => {
  const m = SHELL.match(/\/\/ Title layout: apex26\.titleLayout[\s\S]*?\n    try \{\n([\s\S]*?)\n    \} catch \(e\) \{ \/\* TitleLayout answers at eval \*\/ \}/);
  assert.ok(m, "the inline boot carries the title layout block");
  const cases = [
    { btns: { x: -10, y: 5, size: 120, width: 40 }, title: { x: 3, y: -4, size: 80 }, art: { x: 0, y: 12, size: 150 }, layout: "stack", side: "swap" },
    { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 20, y: 0, size: 100 }, layout: "row", side: "auto" },
  ];
  for (const layout of cases) {
    const { M, html } = boot({ titleLayout: layout });
    const de = { style: { _d: {}, setProperty(k, v) { this._d[k] = v; } }, dataset: {} };
    const sb = { localStorage: { getItem: (k) => (k === "apex26.titleLayout" ? JSON.stringify(layout) : null) }, document: { documentElement: de }, JSON };
    vm.runInContext(m[1], vm.createContext(sb));
    assert.deepEqual(de.style._d, plain(html.style._decls), "same tokens");
    assert.deepEqual(de.dataset, plain(html.dataset), "same attributes");
    assert.deepEqual(de.style._d, plain(M.vars(layout)), "and both are TitleLayout.vars");
  }
});

test("the APPEARANCE fold: built before REPLAY INTRO, sliders store and PEEK, choices wire, RESET clears", () => {
  const { dom, M, data, panel, html, timers } = boot();
  const fold = dom.byId("pm-titlelayout");
  assert.ok(fold, "built");
  assert.equal(panel.children.indexOf(fold) + 1, panel.children.indexOf(dom.byId("pm-replay-intro")), "just before REPLAY INTRO");
  const sum = dom.byId("pm-titlelayout-sum");
  assert.equal(sum.textContent, "TITLE LAYOUT · SHIPPED");
  for (const id of ["pm-tl-btns-size", "pm-tl-btns-width", "pm-tl-btns-x", "pm-tl-btns-y", "pm-tl-title-size", "pm-tl-title-x", "pm-tl-title-y", "pm-tl-art-size", "pm-tl-art-x", "pm-tl-art-y", "pm-tl-layout", "pm-tl-side", "pm-tl-reset"])
    assert.ok(dom.has(id), id);
  assert.equal(dom.byId("pm-tl-btns-width-v").textContent, "AUTO");
  const x = dom.byId("pm-tl-btns-x");
  dom.dispatch(x, { type: "pointerdown" });
  assert.ok(dom.body.classList.contains("tl-peek"), "holding a slider shows the title screen");
  x.value = "-25"; dom.dispatch(x, { type: "input" });
  assert.equal(data.titleLayout.btns.x, -25);
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "-25vw");
  assert.equal(dom.byId("pm-tl-btns-x-v").textContent, "25% left");
  assert.equal(sum.textContent, "TITLE LAYOUT · CUSTOM");
  timers.at(-1).fn();
  assert.equal(dom.body.classList.contains("tl-peek"), false, "and lets go of it after");
  const side = dom.byId("pm-tl-side-sel");
  side.value = "swap"; dom.dispatch(side, { type: "change" });
  assert.equal(data.titleLayout.side, "swap");
  assert.equal(html.dataset.titleSide, "swap");
  dom.byId("pm-tl-reset").click();
  assert.equal(data.titleLayout, undefined);
  assert.equal(sum.textContent, "TITLE LAYOUT · SHIPPED");
  assert.equal(x.value, "0", "sliders repaint to shipped");
  M.build();
  assert.equal(panel.children.filter((c) => c === fold).length, 1, "mount once");
});

test("CSS: every TITLE LAYOUT rule is gated on a custom layout (or the peek) and lives in the overlays layer", () => {
  const start = CSS.indexOf("/* ---------- TITLE LAYOUT player setting");
  const end = CSS.indexOf("} /* @layer overlays */");
  assert.ok(start > 0 && end > start, "the block sits inside @layer overlays");
  const block = CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = [...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
  assert.ok(sels.length >= 12, "rules found");
  for (const s of sels) assert.match(s, /^(:root\[data-title-(layout|btnw|btns|side)|body\.tl-peek)/, `gated: ${s}`);
  assert.match(block, /:root\[data-title-layout\] #menu-buttons \{[^}]*translate: var\(--tl-btns-x, 0\) var\(--tl-btns-y, 0\)/);
  assert.match(block, /zoom: calc\(var\(--ui-scale\) \* var\(--tl-btns-size, 1\)\)/);
  assert.match(block, /#title-car \{[^}]*scale: var\(--tl-art-size, 1\)/);
});

test("registered: manifest, export key, and the shell loads it", () => {
  assert.match(read("tools/manifest.cjs"), /"js\/ui\/title-layout\.js",/);
  assert.match(read("tools/manifest.cjs"), /\["js\/core\/store\.js", "js\/ui\/title-layout\.js"\]/);
  assert.match(read("js/ui/settings-export.js"), /k: "titleLayout", lane: "json", group: "appearance", def: null/);
  assert.match(SHELL, /<script defer crossorigin="anonymous" src="js\/ui\/title-layout\.js\?v=dev"><\/script>/);
});
