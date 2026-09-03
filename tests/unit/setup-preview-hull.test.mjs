// The garage turntable's framing hull is cached across colour-only rebuilds
// (js/game.js getSetupPreviewMesh). That cache is only correct while its
// SP_HULL_GEOM_FIELDS list names EVERY livery field whose presence can move a
// vertex — so this test does not pin the list, it re-derives it from the real
// Car3D.build and compares.
//
// Why it matters: livePreviewDraft busts _spMeshKey on every distinct colour
// value, and an <input type=color> emits those continuously while dragged. The
// hull is a monotone-chain convex hull over ~19k positions (~16 ms), so before
// the cache the turntable paid it once per frame of a drag to arrive at the same
// silhouette. If a future edit gates geometry on, say, `wing`, the cache would
// hand back a stale silhouette and the car would re-centre wrong — this goes red
// first.
//
// Pure Node: tools/car/parts-sweep.mjs's loadParts runs car3d.js in a VM with no
// browser, so this belongs in `npm run test:tooling`, not the Playwright projects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Every optional livery colour the editor exposes (js/game.js CZ_LIV_FIELDS).
const OPTIONAL = ["stripe", "noseStripe", "accent", "nose", "pod", "wing",
                  "fin", "finArt", "logo", "logo2", "logo3", "halo"];

function declaredGeomFields() {
  const src = readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const m = /const SP_HULL_GEOM_FIELDS = \[([^\]]*)\]/.exec(src);
  assert.ok(m, "SP_HULL_GEOM_FIELDS not found — getSetupPreviewMesh moved");
  return m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

const M = loadParts();
const team = M.Teams.LIST[0];
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
const BASE = { c1: [0.9, 0.1, 0.1], c2: [1, 1, 1], finish: null };
for (const k of OPTIONAL) BASE[k] = null;

const build = (liv) => M.Car3D.build(liv.c1, liv.c2, {
  livery: liv, teamId: team.id, num: 1, parts,
});
const samePos = (a, b) =>
  a.pos.length === b.pos.length && a.pos.every((v, i) => v === b.pos[i]);
const withField = (k, v) => Object.assign({}, BASE, { [k]: v });

test("a HUE change never moves a vertex — only presence can", () => {
  const base = build(BASE);
  const hue = build(Object.assign({}, BASE, { c1: [0.1, 0.2, 0.9], c2: [0.2, 0.9, 0.2] }));
  assert.ok(samePos(base, hue),
    "c1/c2 hue moved geometry — the hull cache's whole premise is gone, not just its field list");
  for (const k of OPTIONAL) {
    const on = build(withField(k, [0.3, 0.4, 0.5]));
    const on2 = build(withField(k, [0.9, 0.1, 0.2]));
    assert.ok(samePos(on, on2), `a hue change of \`${k}\` moved geometry`);
  }
});

test("SP_HULL_GEOM_FIELDS names exactly the fields whose PRESENCE moves a vertex", () => {
  const base = build(BASE);
  const measured = OPTIONAL.filter((k) => !samePos(base, build(withField(k, [0.3, 0.4, 0.5]))));
  const declared = declaredGeomFields();
  assert.deepEqual(measured.slice().sort(), declared.slice().sort(),
    `js/game.js SP_HULL_GEOM_FIELDS is [${declared}] but Car3D.build moves geometry for ` +
    `[${measured}]. A field that is MISSING makes the garage turntable re-centre against a ` +
    `stale silhouette; an extra one only costs a needless hull rebuild.`);
});

// ── the auto-fit must not orbit the camera out of the bay ────────────────────
//
// The turntable self-frames by BACKING OFF: spFitD = SP_FIT_HALF_W / (tan18 *
// aspect * (1 - panelFrac)). That diverges as the visible region narrows, and
// the only thing that ever bounded it was SP_DIST_MAX (15) — the MANUAL zoom
// ceiling. js/garage/scene.js says a camera at 15 m "is outside the bay on
// at least one axis nearly always", and that is what the owner reported as "the
// camera is further back and appears to rotate around the outside of the room
// till I zoom thru that wall".
//
// MEASURED in a real browser at the panel widths the sheet actually takes
// (artifacts/garage-900x820-broken.png vs -fixed.png):
//
//   viewport    aspect  panelFrac   before   after (3.15 half-W)
//   1440x900     1.60     0.29       9.08     8.54
//   1280x800     1.60     0.33       9.62     9.05
//    844x390     2.16     0.498      9.49     8.95
//    900x820     1.10     0.467     15.00    11.00   was pinned on the clamp
//    390x844     0.46     0          15.00    11.00   was pinned on the clamp
//
// Only the pinned cases move: the cap cannot touch a viewport that was already
// framing correctly, which is the property that makes it safe.
test("the garage auto-fit is capped below the manual zoom ceiling", () => {
  const src = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");

  const fitMax = /const SP_FIT_DIST_MAX = (\d+(?:\.\d+)?)/.exec(src);
  const distMax = /SP_DIST_MIN = [\d.]+, SP_DIST_MAX = (\d+(?:\.\d+)?)/.exec(src);
  assert.ok(fitMax, "SP_FIT_DIST_MAX must exist — the auto fit needs its own ceiling");
  assert.ok(distMax, "SP_DIST_MAX moved; check this test, not the code");
  assert.ok(Number(fitMax[1]) < Number(distMax[1]),
    `the AUTO fit ceiling (${fitMax[1]}) must sit below the MANUAL zoom ceiling ` +
    `(${distMax[1]}): a player who zooms out that far asked for the wide shot, ` +
    "whereas the auto fit reaching it means the fit diverged on a narrow viewport");

  // And it must actually bound the fit, not merely exist.
  const fit = /const spFitD = ([\s\S]{0,220}?);/.exec(src);
  assert.ok(fit, "spFitD moved; check this test, not the code");
  assert.match(fit[1], /Math\.min\(SP_FIT_DIST_MAX/,
    "spFitD must be capped by SP_FIT_DIST_MAX — an unbounded fit is the defect");

  // The cap is a MINIMUM over the fit, so it can only ever pull the camera IN.
  // If this ever became a Math.max the fix would invert into the bug.
  assert.doesNotMatch(fit[1], /Math\.max\(SP_FIT_DIST_MAX/,
    "the cap must bound the fit from above, never raise it");
});

// The framing the camera USED, not the one the zoom stored. Without this the
// defect above is unobservable: garageCam() reported setupPreviewDist (8.5)
// while the camera sat at the 15 m clamp, so no hook and no test could see it.
test("__apex.garageCam reports the effective distance, not just the stored zoom", () => {
  const apex = readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8");
  // Bound the slice at the NEXT hook rather than by a character budget: this
  // block carries its own explanation, so a fixed window silently ran past the
  // end of it (or, with a shorter one, stopped before the fields).
  const at = apex.indexOf("garageCam:");
  assert.ok(at > 0, "garageCam moved; check this test, not the code");
  const nextHook = apex.indexOf("garageAero", at);
  const block = [apex.slice(at, nextHook > at ? nextHook : at + 1400)];
  for (const field of ["effDist", "fitD", "panelFrac"]) {
    assert.match(block[0], new RegExp(`\\b${field}\\b`),
      `garageCam must expose ${field} — the auto path is the one that can misframe`);
  }
  // fitD is the fit BEFORE the clamp, so a test can see the fit diverge rather
  // than only its clamped symptom. It must not be the same source as effDist.
  const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.match(game, /_spEffDist = spDist; _spEffFit = spFitD;/,
    "the effective distance and the raw fit must be published from the render path");
});
