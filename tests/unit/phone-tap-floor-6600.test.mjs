/* #6600 — taps under 44 painted px on Bryce's phone (UI SIZE 70, TITLE SIZE 80).
   Each control sat inside a zoom (the photo clusters and tuner sheets at --ui-scale, the title brand at
   --ui-scale x TITLE SIZE) with a floor that did not divide by it. The painted proof is
   `node tools/ui/layout-audit.mjs --viewports=bryce-portrait,bryce-standalone` (paint: taps under 44px 0);
   this pins the rules so a reformat cannot drop them. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, rulesFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => cssRules(fs.readFileSync(path.join(ROOT, f), "utf8"));
const hud = read("css/hud.css");
const experience = read("css/experience.css");
const has = (rules, sel, prop, re, ctx) => rulesFor(rules, sel).some((r) =>
  re.test(r.decls.get(prop) || "") && (!ctx || r.context.some((c) => ctx.test(c))));

test("portrait photo altitude discs (#pc-up / #pc-down) floor at --tap-paint", () => {
  for (const prop of ["width", "height"]) {
    assert.ok(has(hud, "body.lt-open:not(.pc-nopanel) .pc-altcol .pc-btn", prop, /max\(56px, var\(--tap-paint\)\)/, /portrait/),
      `${prop}: 56 own px painted 39.2 under the 0.7 zoom`);
  }
});

test("#pc-exit has a --tap-paint min-width (42.1 painted wide before)", () => {
  assert.ok(has(hud, "#pc-exit", "min-width", /^var\(--tap-paint\)$/));
});

test("portrait FREE CAMERA buttons (#pc-toggle, #fb-freecam) floor at --tap-paint", () => {
  assert.ok(has(hud, "#pc-toggle, #fb-freecam", "min-height", /^var\(--tap-paint\)$/, /orientation: portrait/),
    "48 own px painted 33.6 in portrait");
});

test("tall title SOUND divides its floor by the brand's TITLE SIZE zoom", () => {
  assert.ok(has(experience, 'body[data-shape="tall"] #overlay #soundbtn', "min-height",
    /44\.2px \/ var\(--ui-scale\) \/ var\(--tl-title-size, 1\) \/ var\(--tf, 1\)/, /@layer layout/),
    "in a layer above menus.css's components rule, deferred (the blocking census is full)");
});
