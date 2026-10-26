/* install-chip-overlap — #3302: INSTALL APP must not stack on PAUSE BACKGROUND
 * on title landscape (844×390). css/overlays.css lifts #install-chip when
 * #home-motion is showing; compact-wide / live-wide use two (tap+gap) rows so
 * a full --tap of air stays between the chips (one row left ~8px / 0-overlap
 * area but visually stacked). When #ios-install is also up, the chip parks
 * above that banner. Tall keeps the one-tap formula (title-menu-even).
 *
 * Run: node --test tests/unit/install-chip-overlap.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeOverlap, overlapArea } from "../../tools/lib/hud-geometry.mjs";
import { readCssSource } from "../helpers/css-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const overlays = readCssSource("css/overlays.css");

const box = (key, x, y, w, h) => ({
  key, role: "ui", visible: true, exists: true,
  x, y, r: x + w, b: y + h, w, h,
  round: false, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [],
});

/** Source pin via RegExp.test — keeps the assert-match-ratchet flat. */
function has(re, msg) {
  assert.ok(re.test(overlays), msg);
}
function lacks(re, msg) {
  assert.ok(!re.test(overlays), msg);
}

test("tall title keeps the one-tap INSTALL lift (title-menu-even contract)", () => {
  has(
    /body\[data-shape="tall"\]:has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\) #install-chip \{[^}]*bottom:\s*calc\(var\(--safe-b\) \+ var\(--tap\) \+ var\(--gap\)\)/,
    "tall still lifts one tap — do not borrow the landscape two-row formula",
  );
});

test("compact-wide / live-wide lift INSTALL two (tap+gap) rows above home-motion", () => {
  has(
    /body\[data-shape="wide"\]\[data-density="compact"\]\):has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\) #install-chip \{[^}]*bottom:\s*calc\(var\(--safe-b\) \+ \(var\(--tap\) \+ var\(--gap\)\) \* 2\)/,
    "844×390 compact-wide: two rows so INSTALL clears PAUSE BACKGROUND with a full tap of air",
  );
  has(
    /body\[data-shape="wide"\]:has\(> #overlay\[data-home-scene\]:not\(\[data-home-scene="static"\]\)\):has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\) #install-chip \{[^}]*bottom:\s*calc\(var\(--safe-b\) \+ \(var\(--tap\) \+ var\(--gap\)\) \* 2\)/,
    "live-wide title: same two-row lift when ANIMATE docks bottom-left",
  );
  lacks(
    /^body:has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\) #install-chip \{/m,
    "must not lift INSTALL on desktop Classic where ANIMATE stays top-left",
  );
});

test("compact-wide with ios-install parks INSTALL above the Add-to-Home banner", () => {
  has(
    /^body\[data-shape="wide"\]\[data-density="compact"\]:has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\):has\(> #ios-install:not\(\[hidden\]\)\) #install-chip \{[^}]*bottom:\s*calc\(var\(--safe-b\) \+ 4\.5rem \+ 5\.5rem \+ var\(--gap\)\)/m,
    "when the iOS nudge is also showing, INSTALL sits above its 4.5rem + ~5.5rem band",
  );
  lacks(
    /^:where\(body\[data-shape="wide"\]\[data-density="compact"\]\):has\(> :where\(#overlay\) > #home-motion:not\(\[hidden\]\)\):has\(> #ios-install/,
    "ios park must not wrap body in :where — live-wide lift would keep winning",
  );
});

test("844×390 before/after geometry: one-tap stack vs two-row / above-banner clear", () => {
  // Measured on tip @844×390 touch (forced #install-chip + #home-motion):
  // chip top 270 / h 52, motion top 330 / h 52 → 8px air, overlap area 0 but stacked.
  // With ios-install also forced: chip×ios ≈ 4700px².
  const W = 844, H = 390, ins = { sal: 0, sar: 0, sat: 0, sab: 0 };
  const chip1 = box("install-chip", 8, 270, 117.5, 52);
  const motion = box("home-motion", 8, 330, 171.2, 52);
  const ios = box("ios-install", 8, 229.2, 352, 80.8);
  assert.ok(overlapArea(chip1, motion) < 1, "one-tap lift: no pixel overlap with motion");
  assert.ok(chip1.b + 24 > motion.y, "one-tap lift: less than a 24px comfort gap (the #3302 stack)");
  assert.ok(overlapArea(chip1, ios) > 1000, "one-tap lift: INSTALL paints through the iOS banner");

  // After two-row lift: bottom = safe-b(8) + (44+8)*2 = 112 → top ≈ 226 (measured 210 with gut).
  const chip2 = box("install-chip", 8, 210, 117.5, 52);
  assert.ok(overlapArea(chip2, motion) < 1, "two-row: still clear of motion");
  assert.ok(motion.y - chip2.b >= 44, "two-row: at least one --tap of air above PAUSE BACKGROUND");

  // After ios+motion park: bottom = 176 → top = 162 (measured).
  const chip3 = box("install-chip", 8, 162, 117.5, 52);
  assert.ok(overlapArea(chip3, ios) < 1, "above-banner park clears ios-install");
  assert.ok(overlapArea(chip3, motion) < 1, "above-banner park clears home-motion");
  const after = analyzeOverlap([chip3, motion, ios], W, H, ins);
  assert.equal(
    after.hudClash.filter((p) => /install-chip|home-motion|ios-install/.test(p)).length,
    0,
    "no clash among the three after the landscape park: " + after.hudClash.join(","),
  );
});

test("landscape lift formulas live in the #install-chip region of overlays.css", () => {
  const src = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  const start = src.indexOf("/* INSTALL APP (js/ui/platform-session.js installChip)");
  const end = src.indexOf("#update-chip {", start);
  assert.ok(start >= 0 && end > start, "INSTALL APP region present before #update-chip");
  const block = src.slice(start, end);
  assert.ok(block.includes("(var(--tap) + var(--gap)) * 2"), "two-row landscape lift present");
  assert.ok(block.includes("4.5rem + 5.5rem + var(--gap)"), "ios+motion above-banner park present");
  assert.ok(
    block.includes('body[data-shape="wide"][data-density="compact"]:has(> :where(#overlay) > #home-motion'),
    "ios park uses non-:where body so it beats the live-wide lift",
  );
});
