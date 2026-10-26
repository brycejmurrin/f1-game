/* ios-input-zoom.test.mjs — iOS Safari focus auto-zoom floor (issue #3558).
 *
 * iOS Safari zooms the page when a focused text input's computed font-size is
 * under 16px, and the zoom sticks after the keyboard closes. This suite pins
 * the OWNED free surfaces (controller.html, css/editor.css, and the already-
 * compliant text-input recipes in css/race-setup.css / css/tuner.css) so a
 * clamp or token regression cannot drop below the floor again.
 *
 * NOT covered here (HELD elsewhere — list in the #3558 PR body): index.html /
 * css/settings.css `.pm-accent-hextext` (W21c / other holders).
 *
 * Run: node --test tests/unit/ios-input-zoom.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const FLOOR = 16;

/** Token ladder used when a rule says `font-size: var(--fs-*)`. */
function tokenPx(name) {
  const rules = cssRules(read("css/tokens.css"));
  const raw = decl(rules, ":root", name);
  if (!raw) return null;
  if (raw.endsWith("px")) return Number.parseFloat(raw);
  // e.g. --fs-1: var(--fs-micro)
  if (raw.startsWith("var(")) {
    const inner = raw.slice(4, raw.indexOf(")")).trim().split(",")[0].trim();
    return tokenPx(inner);
  }
  return null;
}

/**
 * Smallest painted px a font-size declaration can resolve to at default scale.
 * Literals and clamp()/max()/min() mins; var(--fs-*) via tokens.css.
 */
function floorPx(value) {
  if (!value) return null;
  const v = value.trim();
  if (v.endsWith("px") && !/[()]/.test(v)) return Number.parseFloat(v);
  const clamp = /^clamp\(\s*([^,]+)\s*,/i.exec(v);
  if (clamp) return floorPx(clamp[1].trim());
  const max = /^max\(\s*([^,)]+)/i.exec(v);
  if (max) {
    // max(a,b,…) never paints below the largest arm — take the max of floors.
    const arms = splitArgs(v.slice(v.indexOf("(") + 1, v.lastIndexOf(")")));
    const floors = arms.map(floorPx).filter((n) => n != null);
    return floors.length ? Math.max(...floors) : null;
  }
  const min = /^min\(\s*([^,)]+)/i.exec(v);
  if (min) {
    const arms = splitArgs(v.slice(v.indexOf("(") + 1, v.lastIndexOf(")")));
    const floors = arms.map(floorPx).filter((n) => n != null);
    return floors.length ? Math.min(...floors) : null;
  }
  const vr = /^var\(\s*(--[\w-]+)/.exec(v);
  if (vr) return tokenPx(vr[1]);
  return null;
}

function splitArgs(inner) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function styleFromHtml(html) {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
  assert.ok(m, "controller.html must ship an inline <style> block");
  return m[1];
}

/** True when a selector clearly targets a text-ish form control. */
function looksLikeTextInput(sel) {
  // Type selectors only — ids like #phone-input-options must not match.
  if (/(^|[\s>+~,(])textarea([\s.#[:{>+~,)]|$)/i.test(sel)) return true;
  if (/\.td-input\b/.test(sel) || /#code\b/.test(sel)) return true;
  if (!(/(^|[\s>+~,(])input([\s.#[:{>+~,)]|$)/i.test(sel))) return false;
  if (/\[type\s*=\s*["']?(button|submit|reset|checkbox|radio|range|color|file|image|hidden)["']?\]/i.test(sel)) {
    return false;
  }
  return true;
}

test("#code private-room mode keeps a 16px floor (was clamp(12px,…))", () => {
  const rules = cssRules(styleFromHtml(read("controller.html")));
  const size = decl(rules, '#code[maxlength="32"]', "font-size");
  assert.equal(size, "16px",
    "private-code pairing input must be an explicit 16px (iOS zoom floor)");
  assert.ok(floorPx(size) >= FLOOR, `resolved floor ${floorPx(size)} < ${FLOOR}`);
});

test(".td-input uses 16px, not var(--fs-2) (15px at default scale)", () => {
  const rules = cssRules(read("css/editor.css"));
  const size = decl(rules, ".td-input", "font-size");
  assert.equal(size, "16px",
    "track-designer text/number fields must be 16px, not --fs-2 (15px)");
  assert.ok(floorPx(size) >= FLOOR);
  // Confirm the token that used to paint under the floor is still 15px — so
  // this pin stays meaningful if someone "restores" var(--fs-2).
  assert.equal(tokenPx("--fs-2"), 15);
});

test("OWNED sheets: every text-input font-size rule floors at ≥ 16px", () => {
  const sheets = [
    { path: "controller.html", css: styleFromHtml(read("controller.html")) },
    { path: "css/editor.css", css: read("css/editor.css") },
    { path: "css/race-setup.css", css: read("css/race-setup.css") },
    { path: "css/tuner.css", css: read("css/tuner.css") },
  ];
  const offenders = [];
  for (const sheet of sheets) {
    for (const rule of cssRules(sheet.css)) {
      if (!looksLikeTextInput(rule.selector)) continue;
      if (!rule.decls.has("font-size")) continue;
      const raw = rule.decls.get("font-size");
      const px = floorPx(raw);
      if (px == null) {
        offenders.push(`${sheet.path} ${rule.selector} font-size:${raw} (unresolved)`);
        continue;
      }
      if (px < FLOOR) offenders.push(`${sheet.path} ${rule.selector} → ${px}px (${raw})`);
    }
  }
  assert.deepEqual(offenders, [],
    "text inputs under 16px trigger iOS Safari focus auto-zoom (#3558)");
});
