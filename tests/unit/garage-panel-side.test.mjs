// SETTINGS › APPEARANCE › GARAGE — PANEL SIDE / PANEL WIDTH / PANEL / STAT BARS.
// The CSS docks #cs-inner on either edge; js/garage/setup-camera.js panelCover
// says which way the panel leaves the car its room, and the lens shift moves
// the car into the free half. The RIGHT dock is the shipped default and must
// stay numerically identical, so most of this file pins that.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ctx = vm.createContext({ PhysicsConsts: { X_OPEN_RATE: 1, X_CLOSE_RATE: 1 } });
vm.runInContext(read("js/garage/setup-camera.js"), ctx);
const { panelCover } = vm.runInContext("SetupCamera", ctx);
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const noCam = () => { throw new Error("camTop must only be read on the portrait axis"); };
const CANVAS = rect(0, 0, 1440, 900);

test("a RIGHT dock returns the same unsigned fraction it always did", () => {
  for (const w of [0, 120, 410, 540, 1100, 1440]) {
    const c = panelCover(rect(1440 - w, 0, w, 900), CANVAS, 1440, 900, noCam);
    const old = Math.min(Math.max(w / 1440, 0), 0.85);   // the pre-side clamp(pr.width / cw, 0, 0.85)
    assert.equal(c.x, old, `width ${w}`);
    assert.ok(!Object.is(c.x, -0), "a right dock never goes negative, not even -0");
    assert.equal(c.y, 0);
  }
});

test("a LEFT dock is the exact mirror, so the car lands in the right half", () => {
  for (const w of [120, 410, 540, 1300]) {
    const r = panelCover(rect(1440 - w, 0, w, 900), CANVAS, 1440, 900, noCam);
    const l = panelCover(rect(0, 0, w, 900), CANVAS, 1440, 900, noCam);
    assert.equal(l.x, -r.x, `width ${w}`);
    assert.ok(l.x < 0);
    // GarageScene.recentre targets NDC -panelFrac: the centre of the uncovered
    // span [-1 + 2f, 1] for a left dock, [-1, 1 - 2f] for a right one.
    const f = Math.abs(l.x);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
    near(-l.x, ((-1 + 2 * f) + 1) / 2);
    near(-r.x, (-1 + (1 - 2 * f)) / 2);
  }
});

test("the side is judged against the canvas's own rect, not x = 0", () => {
  const off = rect(100, 0, 1440, 900);
  assert.ok(panelCover(rect(100, 0, 500, 900), off, 1440, 900, noCam).x < 0);
  assert.ok(panelCover(rect(1040, 0, 500, 900), off, 1440, 900, noCam).x > 0);
});

test("portrait keeps its vertical band and reads the camera panel lazily", () => {
  let reads = 0;
  const c = panelCover(rect(0, 0, 393, 597), rect(0, 0, 393, 852), 393, 852, () => { reads++; return 700; });
  assert.equal(reads, 1);
  assert.equal(c.x, 0);
  assert.equal(c.y, (597 + 700 - 852) / 852);
});

test("the fit takes the magnitude; the lens shift and recentre keep the sign", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /gfx\.aspect \* \(1 - Math\.abs\(panelFrac\)\), 0\.05\)\)/,
    "a signed fraction in (1 - panelFrac) would widen the fit past 1 for a left dock");
  assert.doesNotMatch(cam, /\(1 - panelFrac\)/);
  assert.match(cam, /_spProj\[8\] = panelFrac;/);
  assert.match(cam, /GarageScene\.recentre\(_spProj, _spView, _spVP, panelFrac,/);
  assert.match(read("js/garage/scene.js"), /proj\[8\] \+= \(lo \+ hi\) \/ 2 \+ panelFrac;/,
    "recentre must stay symmetric in the sign (target -panelFrac)");
});

test("the GARAGE look rules keep the car's floor and stay out of portrait", () => {
  const css = read("css/carsetup.css");
  // PANEL WIDTH scales the cap only — both variants keep the 410 floor and the car reserve.
  for (const reserve of ["320px", "420px"]) {
    assert.ok(css.includes(`clamp(410px, calc(100 * var(--vwz) - ${reserve} / var(--ui-scale)), calc(420px * var(--look-garage-pw, 1)))`),
      `PANEL WIDTH (${reserve} reserve) must keep the floor and the car's reserve`);
  }
  assert.match(css, /:root\[data-look-garage-side="left"\] #carsetup \{ place-items: stretch start; \}/);
  const stack = /@media \(orientation: landscape\) \{\s*:root\[data-look-garage-side="left"\] #carsetup #cs-stack \{([^}]*)\}/.exec(css);
  assert.ok(stack, "the mirrored camera stack is landscape-only: portrait spans the car band");
  assert.match(stack[1], /right: auto;/);
  assert.match(stack[1], /left: calc\(var\(--safe-l\) \+ var\(--cs-sheet-w\) \* var\(--sheet-eff-scale, var\(--ui-scale\)\) \+ var\(--gap\)\)/,
    "mirror the shipped right: expression, effective scale included");
  assert.match(css, /:root\[data-look-garage-glass="solid"\] #carsetup #cs-inner \{ background: var\(--carbon\); \}/);
  assert.match(css, /:root\[data-look-garage-glass="glass"\]:not\(\[data-ui-contrast="high"\]\) #carsetup #cs-inner \{/);
  assert.match(css, /:root\[data-look-garage-stats="hide"\] #carsetup #cs-stats-inner \{ display: none; \}/);
});
