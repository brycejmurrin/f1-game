/* pause-taps.test.mjs — #3274: pause primary doors keep a painted tapSoft
   floor (~44px) at --ui-scale 0.75. Layered rules in css/dialogs.css win over
   bare --tap / compact 36px so zoom cannot shrink the hit box under the house
   floor (layout-audit pause @75: tapSoft 10 phone / 13 desktop). */
import test from "node:test";
import assert from "node:assert/strict";
import { readCssSource } from "../helpers/css-source.mjs";
import { cssRules, rulesFor } from "../helpers/css-rules.mjs";

const FLOOR = "max(var(--tap), var(--tap-paint), calc(44px / var(--ui-scale)))";
const COMPACT_FLOOR = "max(36px, var(--tap-min), calc(44px / var(--ui-scale)))";

/** Last non-media min-height for sel — cascade winner among base/@layer rules. */
function baseMinHeight(rules, sel) {
  const hits = rulesFor(rules, sel).filter(
    (r) => r.decls.has("min-height") && !r.context.some((c) => c.startsWith("@media")),
  );
  return hits.length ? hits.at(-1).decls.get("min-height") : null;
}

test("pause primary doors floor at painted tapSoft (44/s + --tap-paint) for UI SIZE 75%", () => {
  const rules = cssRules(readCssSource("css/dialogs.css"));
  // One combined check: stack doors, RESUME, and compact density all carry a
  // painted floor (decl equal — no assert.match budget).
  assert.equal(
    baseMinHeight(rules, "#pausemenu .sheet-body.stack > button:not(.as-tbtn)"),
    FLOOR,
    "stack doors: max(--tap, --tap-paint, 44/ui-scale)",
  );
  assert.equal(
    baseMinHeight(rules, "#pausemenu #pm-resume"),
    FLOOR,
    "RESUME shares the painted floor",
  );
  assert.equal(
    baseMinHeight(rules, '#pausemenu .sheet[data-density="compact"] .stack button:not(.as-tbtn)'),
    COMPACT_FLOOR,
    "compact density lifts below 100% without dropping the 36px ≥100% tighten",
  );
});
