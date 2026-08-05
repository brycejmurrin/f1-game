/* css-type-scale.test.mjs — ratchet: menu stylesheets stay on --fs-* tokens.
 *
 * P1 of the UI improvement program migrates raw `font-size: Npx` onto the
 * seven-rung scale in css/tokens.css. Once a file is migrated, new raw px
 * sizes are a regression unless they are a documented hero/HUD one-off.
 *
 * Run: node --test tests/css-type-scale.test.mjs  (via test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Stylesheets that have completed B1 migration. Add a file here when its
 *  commit lands — that is what makes the ratchet bite. */
const MIGRATED = [
  "css/components.css",
  "css/data.css",
  "css/menus.css",
  "css/carsetup.css",
  "css/career.css",
  "css/overlays.css",
  "css/tuner.css",
  "css/track-detail.css",
  "css/responsive.css",
];

/** Paths that intentionally keep raw px (hero titles, HUD digits, etc.).
 *  Each entry is `file:line` after a migration dump; prefer comments in CSS
 *  over growing this list. Empty until a deliberate one-off is needed. */
const ALLOW = new Set([
  "css/overlays.css:207",  // HUD digit one-off
  "css/overlays.css:209",  // HUD digit one-off
  "css/overlays.css:392",  // HUD digit one-off
  "css/overlays.css:395",  // HUD digit one-off
  "css/overlays.css:471",  // HUD digit one-off
  "css/overlays.css:474",  // HUD digit one-off
  "css/responsive.css:106",  // HUD digit one-off
  "css/responsive.css:109",  // HUD digit one-off
  "css/responsive.css:110",  // HUD digit one-off
]);

const PX_RE = /font-size:\s*[0-9.]+px\b/g;

test("migrated menu stylesheets have no raw font-size px outside the allow-list", () => {
  const offenders = [];
  for (const rel of MIGRATED) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!PX_RE.test(line)) return;
      PX_RE.lastIndex = 0;
      const key = `${rel}:${i + 1}`;
      if (ALLOW.has(key)) return;
      // Strip comments — a commented example is not a live declaration.
      const code = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/, "");
      if (!PX_RE.test(code)) return;
      PX_RE.lastIndex = 0;
      offenders.push(`${key}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    "raw font-size px in a migrated sheet — map it to --fs-*, or add file:line to ALLOW with a reason");
});
