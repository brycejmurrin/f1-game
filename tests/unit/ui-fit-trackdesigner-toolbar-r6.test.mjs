/* ui-fit round 6 — Track Designer tool-strip labels (survey r5 rank 4).
   Pins toolbar-only overrides in css/editor.css. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/editor.css"), "utf8");
const rules = cssRules(css);
const CHIP = "#trackdesigner .td-stage > .td-chips[data-role=\"toolbar\"] .sel-chip, #trackdesigner[data-mode=\"scenery\"] .td-stage > .td-chips[data-role=\"toolbar\"] .sel-chip";

test("Track Designer toolbar chips wrap+balance labels (r6)", () => {
  assert.equal(decl(rules, CHIP, "white-space"), "normal");
  assert.equal(decl(rules, CHIP, "text-wrap"), "balance");
  assert.equal(decl(rules, CHIP, "overflow-wrap"), "break-word");
  assert.equal(decl(rules, CHIP, "overflow"), "visible");
});

test("Track Designer toolbar chips floor taps at --tap (r6)", () => {
  assert.equal(decl(rules, CHIP, "min-height"), "var(--tap)");
  assert.equal(decl(rules, CHIP, "min-width"), "var(--tap)");
});

test("compact short-landscape toolbar stays inside its stage grid cell", () => {
  assert.match(
    css,
    /@media \(max-height:\s*500px\) and \(orientation:\s*landscape\)[\s\S]*?body\[data-density="compact"\][\s\S]*?\.td-chips\[data-role="toolbar"\][\s\S]*?display:\s*grid/,
  );
  assert.match(
    css,
    /body\[data-density="compact"\][\s\S]*?\.td-chips\[data-role="toolbar"\][\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
});

test("r6 carve stays Track Designer toolbar (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Track Designer tool-strip[\s\S]*?\n\}[\s\S]*?\n\}/);
  assert.ok(m, "r6 toolbar block present before @layer close");
  assert.doesNotMatch(m[0], /#hud|#lighting|#camtune|#ps-|#menu-buttons|\.bigbtn/,
    "must not retarget HUD / tuner / Photo Studio / menu-button selectors");
  assert.match(m[0], /\.td-chips\[data-role="toolbar"\]/);
});
