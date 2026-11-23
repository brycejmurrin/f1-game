/* Flyby skip hint — WCAG contrast over a bright sky (#1896).
 * Run: node --test tests/unit/a11y-loading-hint.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCssSource } from "../helpers/css-source.mjs";
import { createRequire } from "node:module";
import { cssRules, rulesFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");

const lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const wcag = (fg, bg) => {
  const la = lum(fg), lb = lum(bg);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** "#fff" | "#rrggbb" | "rgb(a)(r, g, b[, a])" -> { rgb: 0–1 triple, a }, else null. */
function parseColor(v) {
  const s = String(v || "").trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), a: 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  return m ? { rgb: [m[1], m[2], m[3]].map((x) => Number(x) / 255), a: m[4] == null ? 1 : Number(m[4]) } : null;
}
/** Alpha-composite fg over bg (both 0–1 RGB). */
const over = (fg, fa, bg) => fg.map((c, i) => c * fa + bg[i] * (1 - fa));

const HINT_OPACITY = 0.85;
const PLATE_ALPHA = 0.72;
const SKY = [1, 0.92, 0.88]; // bright flyby sky (worst case from QA)
const WHITE = [1, 1, 1];

function hintEffectiveBg(sky) {
  const plateA = PLATE_ALPHA * HINT_OPACITY;
  const plateRgb = over([0, 0, 0], plateA, sky);
  return plateRgb;
}

test("a11y-loading.css is in the manifest after loading.css", () => {
  const i = manifest.CSS.indexOf("css/a11y-loading.css");
  const j = manifest.CSS.indexOf("css/loading.css");
  assert.ok(i > j, "a11y sheet must follow loading.css");
  assert.ok(manifest.CSS_DEFERRED.includes("css/a11y-loading.css"));
});

test("skip hint uses a dark backing plate, not ink alone", () => {
  const a11y = read("css/a11y-loading.css");
  assert.match(a11y, /#loading\[data-phase="run"\] #ld-card::after/);
  assert.match(a11y, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.72\)/);
  assert.match(a11y, /text-shadow:/);
  const css = readCssSource("css/overlays.css");
  const hint = css.match(/#loading\[data-phase="run"\] #ld-card::after\s*\{([^}]*)\}/g);
  assert.ok(hint && hint.length >= 2, "loading + a11y rules both target the hint");
});

test("hint text meets 4.5:1 over a bright sky at full fade-in opacity", () => {
  // Every input is READ from the shipped sheets — the ink colour and plate
  // that win the cascade on the hint, and the opacity its fade-in animation
  // ends on — so a dimmer ink, a thinner plate or a lower final opacity fails
  // here, not only the constants this used to be computed from.
  const rules = cssRules(readCssSource("css/overlays.css"));
  const HINT = '#loading[data-phase="run"] #ld-card::after';
  const last = (prop) => { const r = rulesFor(rules, HINT).filter((x) => x.decls.has(prop)).pop(); return r ? r.decls.get(prop) : null; };
  const ink = parseColor(last("color"));
  const plate = parseColor(last("background"));
  assert.ok(ink && plate, `hint ink ${last("color")} / plate ${last("background")} must be colours`);
  assert.equal(ink.a, 1, "the ink itself is opaque");
  assert.equal((last("animation") || "").split(/\s+/)[0], "ld-hint", "the hint fades in with ld-hint");
  const kf = read("css/loading.css").match(/@keyframes ld-hint\s*\{\s*to\s*\{\s*opacity:\s*([\d.]+);?\s*\}\s*\}/);
  assert.ok(kf, "@keyframes ld-hint ends on an opacity");
  const fade = Number(kf[1]);
  // The fade is GROUP opacity: ink and plate both composite over the sky at `fade`.
  const inkPx = over(ink.rgb, fade, SKY);
  const platePx = over(plate.rgb, plate.a * fade, SKY);
  const shipped = wcag(inkPx, platePx);
  assert.ok(shipped >= 4.5, `shipped hint ink on its plate over sky is ${shipped.toFixed(2)}:1; need 4.5:1`);
  assert.equal(fade, HINT_OPACITY, "the documented fade-in opacity below is the shipped one");
  assert.equal(plate.a, PLATE_ALPHA, "the documented plate alpha below is the shipped one");
  const bg = hintEffectiveBg(SKY);
  const ratio = wcag(WHITE, bg);
  assert.ok(ratio >= 4.5, `white hint on plate over sky is ${ratio.toFixed(2)}:1; need 4.5:1`);
  // Document the pre-fix failure mode (white at 0.85 with no plate).
  const oldInk = over(WHITE, HINT_OPACITY, SKY);
  const oldRatio = wcag(oldInk, SKY);
  assert.ok(oldRatio < 4.5, `old ink-only measured ~${oldRatio.toFixed(2)}:1 (QA saw 2.3–3.0)`);
});
