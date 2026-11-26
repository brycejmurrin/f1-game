/* ui-fit round 6 — lighting tuner short-tab tap floors.
   Foot tap-paint floors live on the shared :is(#lighting-inner, #camtune-inner)
   rules (folded with camera in #6755); category chips stay lighting-only.
   Read as RULES (tests/helpers/css-rules.mjs): a regex over the raw file also
   matched a commented-out rule and ran across rule boundaries. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");
const rules = cssRules(css);
const D = '[data-density="compact"]';
const SHARED_OFF = `:is(#lighting-inner, #camtune-inner)${D}[data-rail="off"] > .sheet-foot button`;
const SHARED_ON = `:is(#lighting-inner, #camtune-inner)${D}[data-rail="on"] > .sheet-foot button`;

test("shared compact foot buttons floor at --tap-paint (rail off and on)", () => {
  assert.equal(decl(rules, SHARED_OFF, "min-height"), "var(--tap-paint)",
    "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min");
  assert.equal(decl(rules, SHARED_OFF, "padding"), "calc(var(--gap) / 2) calc(var(--gap) * 2 / 3)",
    "foot padding restored via --gap tokens so tap-paint height is reachable");
  assert.equal(decl(rules, SHARED_ON, "min-height"), "var(--tap-paint)",
    "rail-on compact foot must also floor at --tap-paint");
  assert.equal(decl(rules, SHARED_ON, "padding"), "calc(var(--gap) / 2) calc(var(--gap) * 2 / 3)",
    "rail-on foot padding matches the shared tap-paint floor");
});

test("lighting category chips keep a --tap-paint min-width (short labels like FX)", () => {
  assert.equal(decl(rules, "#lighting-inner #lt-tabs .lt-tab", "min-width"), "var(--tap-paint)",
    "FX and other short category chips are at least --tap-paint wide");
});

test("foot tap-paint lives on the shared :is() rules (no lighting-only foot carve)", () => {
  const litOnly = `#lighting-inner${D}[data-rail="off"] > .sheet-foot button, #lighting-inner${D}[data-rail="on"] > .sheet-foot button`;
  assert.ok(!rules.some((r) => r.selector === litOnly),
    "lighting-only combined foot carve is gone — shared :is() owns the floor");
  assert.ok(rules.some((r) => r.selector === "#lighting-inner #lt-tabs .lt-tab"),
    "lighting category chip min-width carve remains");
});
