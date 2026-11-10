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

test("WIDTH runs from the shipped column (20) to the whole box (100)", () => {
  assert.match(block, /--home-t: clamp\(0, calc\(\(var\(--tl-btns-w, 20\) - 20\) \/ 80\), 1\)/);
  assert.match(block, /width: calc\(100% \+ 85\.185% \* var\(--home-t\)\)/);
});
