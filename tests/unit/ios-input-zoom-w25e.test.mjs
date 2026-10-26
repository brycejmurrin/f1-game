/* ios-input-zoom-w25e.test.mjs — iOS Safari focus auto-zoom floor (#3558)
 * for Fleet D·W25e OWNED free sheets only.
 *
 * iOS Safari zooms the page when a focused text input's computed font-size is
 * under 16px, and the zoom sticks after the keyboard closes. This suite pins
 * css/appearance-studio.css (was --fs-2 = 15px on inputs/selects) plus the
 * already-compliant recipes in css/race-setup.css / css/tuner.css.
 *
 * NOT covered (HELD / out of OWNED — see PR body): controller.html (#3638),
 * css/editor.css (#3638), css/overlays.css (#3634), css/settings.css
 * `.pm-accent-hextext` (F2 still 14px via --fs-micro; free but not OWNED).
 *
 * Run: node --test tests/unit/ios-input-zoom-w25e.test.mjs
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

/** True when a selector clearly targets a text-ish form control. */
function looksLikeTextInput(sel) {
  if (/(^|[\s>+~,(])textarea([\s.#[:{>+~,)]|$)/i.test(sel)) return true;
  if (/(^|[\s>+~,(])select([\s.#[:{>+~,)]|$)/i.test(sel)) return true;
  if (!(/(^|[\s>+~,(])input([\s.#[:{>+~,)]|$)/i.test(sel))) return false;
  if (/\[type\s*=\s*["']?(button|submit|reset|checkbox|radio|range|color|file|image|hidden)["']?\]/i.test(sel)) {
    return false;
  }
  return true;
}

test("appearance-studio text inputs / selects use an explicit 16px floor", () => {
  const rules = cssRules(read("css/appearance-studio.css"));
  const size = decl(rules,
    '#appearance-studio input[type="text"], #appearance-studio input[type="number"], #appearance-studio input[type="search"], #appearance-studio input:not([type]), #appearance-studio select',
    "font-size");
  assert.equal(size, "16px",
    "APPEARANCE profile name + selects must be 16px (was var(--fs-2) = 15px)");
  assert.ok(floorPx(size) >= FLOOR);
  assert.equal(tokenPx("--fs-2"), 15,
    "--fs-2 must still be 15px so this pin stays meaningful");
});

test("OWNED free sheets: every text-input font-size rule floors at ≥ 16px", () => {
  const sheets = [
    { path: "css/appearance-studio.css", css: read("css/appearance-studio.css") },
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
