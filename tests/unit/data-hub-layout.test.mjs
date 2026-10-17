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

test("narrow dashboard metric labels wrap inside auto-fit cells", () => {
  const label = ruleFor(rules, /body\[data-width="narrow"\]\s+\.dh-glabel/);
  assert.ok(label, "narrow metric label rule");
  assert.equal(label.decls.get("white-space"), "normal");
  assert.equal(label.decls.get("overflow-wrap"), "anywhere");
  assert.equal(label.decls.get("line-height"), "1.15");
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

test(".dh-content cancels sf-thumb width (no dead horizontal scroll)", () => {
  assert.equal(decl(rules, ".dh-content", "touch-action"), "pan-y");
  assert.equal(decl(rules, ".dh-content", "overscroll-behavior-x"), "none");
  // Sticky .sf-scroll::before is 6px in-flow; cancel it like height's margin-bottom.
  assert.equal(decl(rules, ".dh-content.sf-scroll::before", "margin-right"), "-6px");
  assert.match(
    decl(rules, ".dh-content.sf-scroll::before", "transform") || "",
    /translateX\(calc\(var\(--sf-pr,\s*0px\)\s*-\s*var\(--gap\)\s*\/\s*6\)\)/,
  );
  assert.match(DATA_CSS,
    /body\[data-width="wide"\]\s+\.dh-content\s*\{[^}]*padding-inline-end:\s*calc\(var\(--gap\) \* 2 \+ 6px\)/);
});

test("narrow standings names wrap with a floor (no 0px constructor collapse)", () => {
  assert.match(
    DATA_CSS,
    /body\[data-width="narrow"\]\s+\.dh-row\s+\.dh-name[\s\S]*?min-width:\s*6\.5em/,
  );
  assert.match(
    DATA_CSS,
    /body\[data-width="narrow"\]\s+\.dh-row\s+\.dh-name[\s\S]*?white-space:\s*normal/,
  );
  assert.match(
    DATA_CSS,
    /body\[data-width="narrow"\]\s+\.dh-h2h-wrap\s*\{[^}]*flex:\s*1\s+1\s+100%/,
  );
});

test(".dh-content.sf-b paints a bottom more-below cue (CSS only)", () => {
  assert.match(DATA_CSS, /\.dh-content\.sf-b\s*\{[^}]*box-shadow:\s*inset/);
  assert.match(
    DATA_CSS,
    /prefers-reduced-motion:\s*reduce\)[\s\S]*?\.dh-content\.sf-b\s*\{[^}]*box-shadow:\s*inset/,
  );
});
