/* ui-fit r6 rank 5 — lighting tuner over an open flyby on a short dock.
   Pins the stacked-state carve in css/tuner.css. Camera / flyby tap floors
   stay on their own blocks; standalone lighting tap floors stay on r6. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");
const rules = cssRules(css);

const BOTH = "body:has(> #lighting:not([hidden])):has(> #flyby:not([hidden]))";
const LT_ROWS = BOTH + " #lighting-inner[data-density=\"compact\"] #lt-rows";
const LT_SPREAD = BOTH + " #lighting-inner[data-density=\"compact\"] #lt-spread";
const FB_LEFT = BOTH + " #flyby-inner";

test("wide stacked lighting+flyby shrinks the dock so two sheets can sit side by side", () => {
  const rule = rules.find((r) => r.selector === BOTH && r.context.some((c) => c.includes("min-width: 800px")));
  assert.ok(rule, "--dock-w shrink lives inside min-width: 800px (portrait stays full dock)");
  assert.equal(rule.decls.get("--dock-w"), "min(calc(40 * var(--vwz)), 360px)");
});

test("stacked compact #lt-rows floors at three slider rows and hides COPY ALL", () => {
  assert.equal(decl(rules, LT_ROWS, "min-height"), "max(132px, calc(3 * 44px))");
  assert.equal(decl(rules, LT_SPREAD, "display"), "none");
});

test("wide stacked flyby docks on the left (lighting keeps the right)", () => {
  const rule = rules.find((r) => r.selector === FB_LEFT && r.context.some((c) => c.includes("min-width: 800px")));
  assert.ok(rule, "flyby left-dock rule lives inside min-width: 800px");
  assert.equal(rule.decls.get("left"), "calc((var(--sal) + 8px) / var(--sheet-eff-scale, var(--ui-scale)))");
  assert.equal(rule.decls.get("right"), "auto");
});

test("stacked carve does not retarget camera or lower flyby tap floors", () => {
  const m = css.match(/UI Fit r6: lighting over flyby stacked dock[\s\S]*?\}\s*\/\* ---------- UI Fit r6: flyby editor compact tap floor/);
  assert.ok(m, "stacked block sits immediately before the flyby tap-floor carve");
  assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera");
  assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-*");
  assert.doesNotMatch(m[0], /min-height:\s*var\(--tap-min\)/, "must not lower tap floors to --tap-min");
  assert.doesNotMatch(m[0], /#fb-[a-z]/, "must not retarget #fb-* tap-floor selectors");
});

test("flyby tap-paint floors from #1774 still stand", () => {
  assert.match(
    css,
    /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?min-height:\s*var\(--tap-paint\)/,
    "#1774 compact foot --tap-paint floor must remain",
  );
  assert.match(
    css,
    /#flyby-inner\s+#fb-rows\s+select,[\s\S]*?min-height:\s*var\(--tap-paint\)/,
    "#1774 pose-select --tap-paint floor must remain",
  );
});
