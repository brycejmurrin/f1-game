/* title-menu-even.test.mjs — title doors stay even without px-capped columns. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("title 2-up rows share equal flex cells and fill them", () => {
  const menus = read("css/menus.css");
  assert.match(menus, /#menu-primary\s*\{[^}]*--balance-min:\s*calc\(50%/);
  assert.match(menus, /#menu-secondary\s*\{[^}]*--balance-basis:\s*5\.5rem/);
  assert.match(menus, /#menu-primary, #menu-secondary\s*\{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.7\)/);
  assert.match(
    menus,
    /#menu-buttons :is\(#menu-primary, #menu-secondary\)\.balanced-row > \.bigbtn \{ width: 100%/,
  );
  assert.doesNotMatch(
    menus,
    /#menu-buttons :is\(#menu-primary, #menu-secondary\)\.balanced-row > \.bigbtn \{ width: auto/,
  );
  assert.match(menus, /#menu-buttons \.bigbtn \{[^}]*border-width:\s*1px/);
});

test("compact landscape title doors fit without a nested scroller", () => {
  const menus = read("css/menus.css");
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-buttons \{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.35\)/,
    "compact-wide title stack is tighter than the desktop 0.9 gap",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-buttons \.bigbtn \{[^}]*min-height:\s*max\(32px, var\(--tap-min\)\)/,
    "play doors drop from --tap (52 on touch) so CAREER + 2×2 + rooms clear 343px",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-secondary \.minibtn \{[^}]*min-height:\s*max\(26px, var\(--tap-min\)\)/,
    "rooms sit one step below the play doors",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) :is\(#menu-primary, #menu-secondary\) \{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.45\)/,
    "2-up rows also tighten on the short landscape column",
  );
});

test("title overlay columns grow with --vwz instead of a pixel cap", () => {
  const menus = read("css/menus.css");
  const responsive = read("css/responsive.css");
  assert.match(menus, /#menu-hero, #menu-primary, #menu-secondary \{ width: min\(calc\(78 \* var\(--vwz\)\), 100%\)/);
  assert.match(menus, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(menus, /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-brand,[\s\S]*?42 \* var\(--vwz\)/,
    "landscape compact title uses 42vwz and data-shape=wide");
  assert.doesNotMatch(menus, /min\(calc\(42 \* var\(--vwz\)\), 300px\)/);
  assert.match(responsive, /32 \* var\(--vwz\)/);
  assert.doesNotMatch(responsive, /clamp\(320px, calc\(24 \* var\(--vwz\)\), 420px\)/);
  assert.doesNotMatch(menus, /minmax\(0, 1\.35fr\)/);
  assert.doesNotMatch(menus, /43vw|53vw/);
});
