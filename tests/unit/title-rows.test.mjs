/* title-rows.test.mjs — the phone-landscape title is ONE composition (#5199).
   CSS-source pins for the PHONE LANDSCAPE HOME block in css/menu-destinations.css;
   tests/specs/title-fit.spec.js measures the painted rows (1/2/2/2/2/2/3/4). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/menu-destinations.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const start = css.indexOf("PHONE LANDSCAPE HOME (#5199)");
const block = css.slice(css.indexOf("@media (max-height: 519px) and (min-aspect-ratio: 1/1) {", start));
const P = 'body[data-shape="wide"]:not([hidden]) #overlay #menu-buttons';

test("the block exists and keys on the layout viewport only", () => {
  assert.ok(start > 0 && block.length > 500, "PHONE LANDSCAPE HOME block present");
  assert.doesNotMatch(block, /data-density|data-home-live|\.desktop/, "no density, scene or desktop gate: one title per phone");
  assert.doesNotMatch(block.replace(/\[data-title-btns="(stack|row)"\]/g, ""), /:not\(\[data-title-(btnw|btns|side)\]/, "a stored layout does not select another composition");
});

test("rows: hero, retention pair, four two-up rows, three-up, four-up", () => {
  assert.ok(block.includes(`${P} {`) && /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(block), "two door tracks");
  assert.ok(block.includes(`${P} :is(#menu-primary, #menu-garage) { display: contents; }`), "play + garage doors are grid cells");
  assert.ok(block.includes(`${P} :is(#menu-hero, #menu-explore, #menu-create, #menu-secondary) { grid-column: 1 / -1;`), "groups span the cluster");
  assert.ok(block.includes(`${P} :is(#menu-hero, #menu-retention, #menu-explore, #menu-create, #menu-secondary) { display: flex; flex-flow: row nowrap;`), "group rows never wrap");
  const ids = (group) => [...html.slice(html.indexOf(`<div id="${group}"`)).split("</div>")[0].matchAll(/<button id="(mb-[a-z]+)"([^>]*)>/g)].filter((m) => !/\shidden[\s>]/.test(m[2] + ">") || m[1] === "mb-continue" || m[1] === "mb-phonepad").map((m) => m[1]);
  assert.deepEqual(ids("menu-retention"), ["mb-continue", "mb-daily"]);
  assert.deepEqual(ids("menu-primary"), ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice"]);
  assert.deepEqual(ids("menu-garage"), ["mb-garage"]);
  assert.deepEqual(ids("menu-explore"), ["mb-watch", "mb-data"]);
  assert.deepEqual(ids("menu-create"), ["mb-photo", "mb-designer", "mb-visual"]);
  assert.deepEqual(ids("menu-secondary"), ["mb-settings", "mb-phonepad", "mb-help", "mb-saves"]);
});

test("the look: italic slanted doors, subtitles on the hero and retention only", () => {
  assert.match(block, /font-style: italic/);
  assert.match(block, /transform: skewX\(-6deg\); border-radius/);
  assert.ok(block.includes(`${P} .mb-sub { display: none; }`));
  assert.ok(block.includes(`${P} :is(#mb-career, #menu-retention) .mb-sub {\n  display: block;`));
  const quiet = css.slice(css.indexOf("Destination presentation: one quiet control family"), css.indexOf("At comfortable heights"));
  assert.match(quiet, /@media \(min-height: 520px\), \(max-aspect-ratio: 1\/1\) \{\n#overlay #menu-buttons \.bigbtn \{\n  transform: none;/, "the quiet restyle stays off the short landscape screen");
});

test("WIDTH moves the split: 54 % of the box at 20, 80 % at 100, the doors never wider than their track", () => {
  assert.match(block, /#overlay \{[^}]*--home-t: clamp\(0, calc\(\(var\(--tl-btns-w, 20\) - 20\) \/ 80\), 1\);\n  grid-template-columns: minmax\(0, calc\(46% - 26% \* var\(--home-t\)\)\) minmax\(0, 1fr\);/);
  assert.match(block, /\[data-title-side="swap"\][^{]*#overlay \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, calc\(46% - 26% \* var\(--home-t\)\)\); \}/, "SWAPPED mirrors the split");
  // A cluster wider than its track covered the brand (#5150 rule 3) and, at the box's edge, tripped the fit.
  assert.match(block, /grid-column: 2; grid-row: 1; justify-self: stretch; align-self: center;\n  width: 100%; min-width: 0;/);
  assert.doesNotMatch(block.replace(/\/\*[^]*?\*\//g, ""), /width: calc\(100% \+/);
});

test("UI SIZE under 100 % does not shrink the Home: the pieces are sized by TITLE LAYOUT and the fit", () => {
  assert.match(block, /zoom: calc\(max\(1, var\(--ui-compact-scale\)\) \* var\(--tl-btns-size, 1\) \* var\(--tf, 1\)\)/, "doors: floor 1");
  assert.match(block, /#menu-brand \{[^}]*zoom: calc\(var\(--tl-title-size, 1\) \* var\(--tf, 1\)\)/, "brand: no UI SIZE factor");
  assert.doesNotMatch(block.replace(/\/\*[^]*?\*\//g, ""), /--ui-compact-brand-scale|var\(--ui-scale\)/, "no other UI SIZE zoom in the block");
});

test("a slider stops at the edge: the box's answer is stored, not the request", () => {
  const js = fs.readFileSync(path.join(ROOT, "js/ui/title-layout.js"), "utf8");
  assert.match(js, /function hold\(l, part, k\)/);
  assert.match(js, /l = hold\(set\(l\), part, k\);/, "the fold's sliders");
  assert.match(js, /hold\(set\(l\), ed\.sel, k\);/, "the editor's steps and keys");
  assert.match(js, /hold\(hold\(h, d\.part, "x"\), d\.part, "y"\); else hold\(h, d\.part, "size"\);/, "the editor's drags");
});
