/* ui-fit r7 — camera tuner rail-off portrait: place #ct-previews + shrink #ct-*.
   Preview grid placement stays camera-only; foot tap-paint floors live on the
   shared :is(#lighting-inner, #camtune-inner) rules (#6755). Preview chips wrap
   with full labels (no nowrap/ellipsis truncation, #6461 row 9). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");
const rules = cssRules(css);

const COL = "#camtune-inner[data-density=\"compact\"][data-rail=\"off\"]";
const PREV = "#camtune-inner[data-rail=\"off\"] #ct-previews";
const PREV_BTN = "#camtune-inner[data-rail=\"off\"] #ct-previews > button";
const D = '[data-density="compact"]';
const SHARED_OFF = `:is(#lighting-inner, #camtune-inner)${D}[data-rail="off"] > .sheet-foot button`;

test("compact rail-off camera sheet is one minmax column (no AUTO preview column)", () => {
  assert.equal(decl(rules, COL, "grid-template-columns"), "minmax(0, 1fr)");
});

test("rail-off #ct-previews sit in explicit grid row 3 and wrap with full labels", () => {
  assert.equal(decl(rules, PREV, "grid-row"), "3");
  assert.equal(decl(rules, PREV, "grid-column"), "1 / -1");
  assert.equal(decl(rules, PREV, "min-width"), "0");
  assert.equal(decl(rules, PREV, "flex-wrap"), "wrap",
    "preview row wraps so MONZA/SPA/MONACO labels are not truncated");
});

test("rail-off preview chips keep --tap-paint and do not ellipsize", () => {
  assert.equal(decl(rules, PREV_BTN, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, PREV_BTN, "min-width"), "0");
  const btn = rules.find((r) => r.selector === PREV_BTN);
  assert.ok(btn, "rail-off preview button rule is found");
  assert.ok(!btn.decls.has("text-overflow") || btn.decls.get("text-overflow") !== "ellipsis",
    "preview chips must not ellipsize labels");
  assert.ok(!btn.decls.has("overflow") || btn.decls.get("overflow") !== "hidden",
    "preview chips must not clip with overflow:hidden");
  assert.ok(!btn.decls.has("white-space") || btn.decls.get("white-space") !== "nowrap",
    "preview chips must not force nowrap");
});

test("shared rail-off foot owns the --tap-paint floor (no #ct-close carve)", () => {
  assert.equal(decl(rules, SHARED_OFF, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, SHARED_OFF, "width"), "auto");
  assert.equal(decl(rules, SHARED_OFF, "min-width"), "0");
  assert.equal(decl(rules, SHARED_OFF, "max-width"), "100%");
  assert.equal(decl(rules, SHARED_OFF, "flex"), "1 1 0");
  assert.ok(!rules.some((r) => r.selector === "#camtune-inner[data-rail=\"off\"] > .sheet-foot #ct-close"),
    "#ct-close carve is gone — shared foot button rule covers DONE");
});

test("camera preset chips and copy-all keep the --tap-paint floor", () => {
  assert.equal(decl(rules, "#camtune-inner [id^=\"ct-preset-\"]", "min-width"), "var(--tap-paint)");
  assert.equal(decl(rules, "#camtune-inner #ct-copy-all-btn", "min-height"), "var(--tap-paint)");
});

test("r7 preview placement stays camera-only (no lighting-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r7: camera tuner rail-off portrait[\s\S]*?\}\s*\/\* @layer components \*\//);
  assert.ok(m, "r7 block present before @layer components close");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r7 carve");
  assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors");
  assert.match(m[0], /#ct-previews/);
  assert.doesNotMatch(m[0], /#ct-close/, "foot/#ct-close carves folded into shared :is() rules");
});
