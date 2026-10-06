/* season-setup-chrome.test.mjs — structural pins for #season-setup chrome.
 *
 * The 1280×800 pair shows two native scrollbars with OS-light white thumbs;
 * content-sized preset chips leave REVERSE alone on a trailing row; the last
 * pool row can sit under the foot fade. Fixes live in css/race-setup.css and
 * js/career/season-ui.js only (not race-settings.js / index.html).
 *
 * Run: node --test tests/unit/season-setup-chrome.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";
import { readCssSource } from "../helpers/css-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const raceRules = () => cssRules(fs.readFileSync(path.join(ROOT, "css/race-setup.css"), "utf8"));
const menusRules = () => cssRules(readCssSource("css/menus.css"));
const ui = () => fs.readFileSync(path.join(ROOT, "js/career/season-ui.js"), "utf8");

test("season-setup uses dark color-scheme so native thumbs follow Apex chrome", () => {
  const rules = raceRules();
  assert.equal(decl(rules, "#season-setup", "color-scheme"), "dark",
    "#season-setup must set color-scheme: dark (OS-light white thumbs otherwise)");
  assert.equal(decl(rules, ':root[data-ui-theme="light"] #season-setup', "color-scheme"), "light",
    "light UI theme flips the scheme with the tokens");
});

test("paired panes theme thin scrollbars and suppress the ScrollFade double bar", () => {
  const rules = raceRules();
  const panes = '#ss-inner[data-pair="on"] :is(#ss-cal, #ss-pool)';
  assert.equal(decl(rules, panes, "scrollbar-width"), "thin");
  assert.equal(decl(rules, panes, "scrollbar-color"), "var(--plate-line) transparent",
    "paired calendar/pool thumbs use --plate-line, not OS white");
  assert.match(decl(rules, panes, "padding-bottom") || "", /var\(--pad\)/,
    "last calendar/pool row clears the foot");
  assert.equal(
    decl(rules, '#ss-inner[data-pair="on"] :is(#ss-cal, #ss-pool).sf-scroll::before', "display"),
    "none",
    "native themed thumb + ScrollFade pseudo must not both paint");
  assert.ok(
    ruleFor(rules, /#ss-inner\[data-pair="on"\] :is\(#ss-cal, #ss-pool\)::-webkit-scrollbar-thumb/),
    "WebKit thumb rule keeps Chromium off the default white bar");
});

test("stacked season setup keeps one themed scroll owner on #ss-body", () => {
  // Logical menus family still exposes the stacked branch (css-tokens twin).
  const rules = menusRules();
  const body = '#ss-inner:not([data-pair="on"]) > #ss-body';
  assert.equal(decl(rules, body, "overflow-y"), "auto");
  assert.equal(decl(rules, body, "scrollbar-width"), "thin");
  assert.equal(decl(rules, body, "scrollbar-color"), "var(--plate-line) transparent");
  assert.match(decl(rules, body, "padding-bottom") || "", /var\(--pad\)/,
    "stacked body last row clears the foot");
  const panes = '#ss-inner:not([data-pair="on"]) > #ss-body > .pane';
  assert.equal(decl(rules, panes, "overflow"), "visible",
    "child panes must not grow a second scrollbar while stacked");
});

test("preset chips are a balanced-row with a quarter-row basis (no REVERSE orphan)", () => {
  assert.match(ui(), /el\("div",\s*"chip-row balanced-row"\)/,
    "#ss-presets must mint chip-row balanced-row so wraps share lines evenly");
  const rules = raceRules();
  assert.equal(decl(rules, "#ss-presets", "--balance-basis"), "calc(25% - var(--gap) * 0.5)",
    "quarter-row basis packs eight chips as 4+4 (never 7+1 REVERSE orphan)");
  assert.equal(decl(rules, "#ss-presets", "--balance-min"), "4.5rem");
});
