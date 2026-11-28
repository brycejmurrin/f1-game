/* title-portrait-photo-bg-7448.test.mjs — a portrait Home photo paints under the tall wash.
 *
 * #7448: the tall-shape wash used the `background` shorthand at the photo rule's
 * specificity and came later, so it reset background-image and every portrait
 * still stayed dark at 393x852. The tall photo rule must carry the photo layer.
 *
 * Run: node --test tests/unit/title-portrait-photo-bg-7448.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rules = cssRules(fs.readFileSync(path.join(ROOT, "css/experience.css"), "utf8"));

const PHOTO = '#overlay[data-home-scene="photo"][style*="data:image"]';
const TALL = ':where(body[data-shape="tall"]) ';
const index = (selector) => rules.findIndex((r) => r.selector === selector);
const BG_PROPS = ["background", "background-image"];

test("the base photo rule paints the saved image", () => {
  const rule = rules[index(PHOTO)];
  assert.ok(rule, "photo rule present");
  assert.equal(rule.decls.get("background-image"), "var(--home-scene-image)");
});

test("the tall wash keeps its gradient and exposes it as --home-tall-wash", () => {
  const rule = rules[index(TALL + '#overlay[data-home-scene]:not([data-home-scene="static"])')];
  assert.ok(rule, "tall live-scene rule present");
  assert.equal(rule.decls.get("--home-tall-wash"),
    "linear-gradient(0deg, var(--carbon) 45%, color-mix(in oklab, var(--carbon) 42%, var(--scrim-heavy)) 78%, var(--scrim))");
  assert.equal(rule.decls.get("background"), "var(--home-tall-wash)");
});

test("every later rule that resets the overlay background on tall keeps the photo layer (#7448)", () => {
  const photoAt = index(PHOTO);
  const tallPhoto = rules[index(TALL + PHOTO)];
  assert.ok(tallPhoto, "tall photo rule present");
  assert.ok(index(TALL + PHOTO) > index(TALL + '#overlay[data-home-scene]:not([data-home-scene="static"])'),
    "the tall photo rule follows the tall wash");
  assert.equal(tallPhoto.decls.get("background"), "var(--home-tall-wash), var(--home-scene-image) center / cover no-repeat",
    "wash drawn over the photo, photo covers the overlay");
  // Any tall overlay rule after the base photo rule that sets a background must
  // either be the photo-layered one or not match the photo state at all.
  for (const r of rules.slice(photoAt + 1)) {
    if (!r.selector.startsWith(TALL + "#overlay[data-home-scene]")) continue;
    if (/ #|::/.test(r.selector.slice(TALL.length))) continue;   // descendants / pseudo-elements
    if (!BG_PROPS.some((p) => r.decls.has(p))) continue;
    if (r.selector === TALL + PHOTO) continue;
    const later = index(TALL + PHOTO) > rules.indexOf(r);
    assert.ok(later, `${r.selector} resets background after the tall photo rule`);
  }
});
