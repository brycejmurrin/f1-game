"use strict";
/** Pins data-hub layout fixes (css/data.css, ui-fit round 3). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_CSS = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");
const rules = cssRules(DATA_CSS);

test("portrait schedule venue (.dh-race-sub) wraps on tall narrow", () => {
  assert.match(
    DATA_CSS,
    /body\[data-shape="tall"\]\[data-width="narrow"\]\s+\.dh-race-sub\s*\{[^}]*white-space:\s*normal/,
  );
});

test("wide desktop hub card widens so seven tabs fit one row", () => {
  const desk = ruleFor(rules, /body\[data-width="wide"\]\[data-density="normal"\]\s+\.dh-card/);
  assert.ok(desk, "desktop hub card rule");
  assert.equal(desk.decls.get("width"), "min(920px, 100%)", "desktop card cap");
});

test(".dh-content hides native scrollbar; ScrollFade owns the thumb", () => {
  assert.equal(decl(rules, ".dh-content", "scrollbar-width"), "none");
  assert.match(DATA_CSS, /\.dh-content::-webkit-scrollbar\s*\{\s*display:\s*none/);
});

test("session/GP selects meet the card tap-paint floor", () => {
  assert.equal(decl(rules, ".dh-pick-select", "min-height"), "var(--tap-paint)");
});

test("schedule/standings meta ink uses --dim (WCAG AA on hub panel)", () => {
  // Soft greys in these roles failed 4.5:1 on --panel composites; --dim clears it.
  for (const sel of [".dh-footnote", ".dh-race-time", ".dh-gap", ".dh-gdrs-pill"]) {
    assert.equal(decl(rules, sel, "color"), "var(--dim)", `${sel} meta color`);
  }
});

test("tall-narrow hub tabs are a 3-column grid (not one full-width column)", () => {
  assert.match(
    DATA_CSS,
    /body\[data-shape="tall"\]\[data-width="narrow"\]\s+\.dh-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
});

test(".dh-content clips sideways overflow (no dead horizontal scroll)", () => {
  const d = ruleFor(rules, /^\.dh-content$/);
  assert.ok(d, ".dh-content rule");
  // css-rules keeps the last overflow-x when duplicated (hidden then clip).
  assert.match(DATA_CSS, /\.dh-content\s*\{[^}]*overflow-x:\s*clip/, "overflow-x: clip present");
  assert.equal(decl(rules, ".dh-content", "touch-action"), "pan-y");
});
