/* a11y-text.css — Accessibility TEXT SIZE scales menu/settings --fs-* only.
 *
 * Run: node --test tests/unit/a11y-text.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = fs.readFileSync(path.join(ROOT, "css/a11y-text.css"), "utf8");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const MANIFEST = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");

test("manifest lists a11y-text.css after responsive.css", () => {
  const iResp = MANIFEST.indexOf('"css/responsive.css"');
  const iA11y = MANIFEST.indexOf('"css/a11y-text.css"');
  assert.ok(iResp >= 0 && iA11y > iResp, "a11y-text.css must follow responsive.css in CSS order");
});

test("shell includes a11y-text.css", () => {
  assert.match(SHELL, /href="css\/a11y-text\.css\?v=dev"/);
});

test("data-text-scale sets --a11y-text-mul and scales --fs-* under menu roots", () => {
  assert.match(CSS, /:root\[data-text-scale="125"\][\s\S]*--a11y-text-mul:\s*1\.25/);
  assert.match(CSS, /:root\[data-text-scale="150"\][\s\S]*--a11y-text-mul:\s*1\.5/);
  assert.match(CSS, /:root\[data-text-scale\] #overlay[\s\S]*--fs-2:\s*calc\(var\(--fs-2\) \* var\(--a11y-text-mul\)\)/);
  assert.match(CSS, /#pmsettings/);
  assert.doesNotMatch(CSS, /#hud-speed/, "HUD must not be in the scaled subtree list");
});
