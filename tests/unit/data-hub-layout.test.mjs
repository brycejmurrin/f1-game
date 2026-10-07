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
