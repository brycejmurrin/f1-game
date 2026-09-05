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

test("tall title leftover-row is not gated on compact density", () => {
  const menus = read("css/menus.css");
  // A 393×844 phone is tall and still above --compact-at (600). The
  // leftover-row used to require both, so secondaries sat under the fold
  // with no working parent scroller.
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #overlay \{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    "every tall title hands leftover height to the door column",
  );
  assert.doesNotMatch(
    menus,
    /body\[data-shape="tall"\]\[data-density="compact"\]\) #overlay \{[^}]*grid-template-rows/,
    "leftover-row must not still require compact",
  );
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #menu-buttons \{[^}]*overflow-y:\s*auto/,
    "the leftover column itself scrolls — #overlay overflow is a dead letter",
  );
});

test("title overlay columns grow with --vwz instead of a pixel cap", () => {
  const menus = read("css/menus.css");
  const responsive = read("css/responsive.css");
  assert.match(menus, /#menu-hero, #menu-primary, #menu-secondary \{ width: min\(calc\(78 \* var\(--vwz\)\), 100%\)/);
  assert.match(menus, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(menus, /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-brand,[\s\S]*?width:\s*100%/,
    "landscape compact title fills its 1fr tracks (no 42vwz shrink)");
  assert.doesNotMatch(menus, /min\(calc\(42 \* var\(--vwz\)\), 300px\)/);
  assert.doesNotMatch(menus, /42 \* var\(--vwz\)/);
  assert.match(responsive, /32 \* var\(--vwz\)/);
  assert.doesNotMatch(responsive, /clamp\(320px, calc\(24 \* var\(--vwz\)\), 420px\)/);
  assert.doesNotMatch(menus, /minmax\(0, 1\.35fr\)/);
  assert.doesNotMatch(menus, /43vw|53vw/);
});
