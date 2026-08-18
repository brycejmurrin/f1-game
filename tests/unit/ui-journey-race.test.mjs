/* ui-journey-race.test.mjs — Step 5 race-layer CSS contract.
 *
 * HUD scaling stays --hud-scale / --hud-z, never --ui-scale. Pause owns paused
 * navigation (#campicker closes with the dim sheet). Photo-mode restore is
 * #pc-restore. Compact HUD keys on body[data-density], not orientation+max-height.
 *
 * Run: node --test tests/unit/ui-journey-race.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;
    out += "\n".repeat((src.slice(open, close).match(/\n/g) || []).length);
    i = close + 2;
  }
  return out;
}

/** Rule bodies whose prelude mentions `needle` (comment-stripped). */
function rulesMentioning(css, needle) {
  const stripped = stripComments(css);
  const out = [];
  let prev = 0;
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "{") {
      const prelude = stripped.slice(prev, i).trim();
      const end = stripped.indexOf("}", i);
      if (end < 0) break;
      if (prelude.includes(needle)) out.push({ prelude, body: stripped.slice(i + 1, end) });
      prev = end + 1;
      i = end;
    } else if (c === "}") prev = i + 1;
  }
  return out;
}

function zoomsFor(css, needle) {
  const zooms = [];
  for (const r of rulesMentioning(css, needle)) {
    for (const m of r.body.matchAll(/zoom:\s*([^;]+)/g)) zooms.push(m[1].trim());
  }
  return zooms;
}

test("HUD clusters zoom with --hud-z, never --ui-scale on #lights / .hud-bottom", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /#lights, #announce \{ --hud-z: var\(--hud-z-top, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/);
  assert.match(hud, /\.hud-bottom \{ --hud-z: var\(--hud-z-bot, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/);
  for (const sel of ["#lights", ".hud-bottom"]) {
    const zooms = zoomsFor(hud, sel);
    assert.ok(zooms.includes("var(--hud-z)"), `${sel} must declare zoom: var(--hud-z)`);
    assert.ok(!zooms.includes("var(--ui-scale)"), `${sel} must not use zoom: var(--ui-scale)`);
  }
});

test("photo-mode restore eye is #pc-restore when controls are hidden", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /#pc-restore\s*\{/);
  assert.match(hud, /body\.pc-uihidden #photo-controls > :not\(#pc-restore\)/);
  assert.match(hud, /body\.pc-uihidden #pc-restore \{\s*display:\s*block/);
});

test("compact race HUD uses body density, not orientation + max-height queries", () => {
  const hud = read("css/hud.css");
  const overlays = read("css/overlays.css");
  const added = hud + "\n" + overlays;
  assert.doesNotMatch(added, /orientation:\s*landscape\)\s*and\s*\(max-height:/,
    "race-layer hunks must not add orientation + max-height layout queries");
  assert.match(hud, /body\[data-density="compact"\] #minimap/);
  assert.match(hud, /body\[data-density="compact"\] \.hud-gaps \{[^}]*var\(--sal\) \/ var\(--hud-z\)/);
  assert.match(hud, /body\[data-density="compact"\] #hud-sectors/);
  assert.match(overlays, /body\[data-density="compact"\] #campicker/);
});

test("pause owns paused navigation: #campicker stands down with the dim sheet", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /body:has\(\.screen\.dim:not\(\[hidden\]\)\) #campicker \{\s*display:\s*none/);
});

test("sector box still clears unscaled #pausebtn via --tap / --hud-z", () => {
  const hud = read("css/hud.css");
  assert.match(hud,
    /#hud-sectors \{[\s\S]*?top:\s*calc\(\(8px \+ var\(--tap\) \+ 4px \+ var\(--sat\)\) \/ var\(--hud-z\)\)/);
});
