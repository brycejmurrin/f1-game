/* menu-nav-spatial.test.mjs — ArrowLeft/Right from a scrollable column
 * must reach a header / adjacent column that does not vertically overlap
 * the current row. Vertical moves stay in-band (the Zandvoort trap).
 *
 * Two legs:
 *   1. source-lock step()'s fallback order so a later edit cannot sneak an
 *      out-of-band dy pass back in, or drop the sideways pass after an
 *      in-band miss;
 *   2. load MenuNav in a VM (no browser) and call pickSideways / step with
 *      fake getBoundingClientRect boxes — the shipped functions, not a
 *      reimplementation (same extract-or-eval idiom as debris-hazard-hint).
 *
 * Run: node --test tests/unit/menu-nav-spatial.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_PATH = path.join(ROOT, "js/ui/menu-nav.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in js/ui/menu-nav.js — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

function loadMenuNav() {
  const ctx = {
    window: null,
    document: { readyState: "loading", addEventListener() {} },
    Log: { info() {} },
  };
  ctx.window = ctx;
  ctx.window.UiLayers = { shown: () => true, top: () => null };
  ctx.window.Log = ctx.Log;
  ctx.window.addEventListener = () => {};
  vm.runInNewContext(SRC, ctx, { filename: "menunav.js" });
  return ctx.window.MenuNav;
}

function el(id, left, top, width, height, extra = {}) {
  return {
    id,
    getBoundingClientRect: () => ({
      left, top, right: left + width, bottom: top + height, width, height,
    }),
    closest: extra.closest || (() => null),
    ...extra,
  };
}

test("step() fallback order: in-band, then dx sideways, then dy wrap, then DOM wrap", () => {
  const stepSrc = extractFn(SRC, "step");
  const parts = stepSrc.split(/if \(best\) return best;/);
  assert.equal(parts.length, 2, "in-band nearest still wins via `if (best) return best`");
  const after = parts[1];

  assert.match(after, /if \(dx\)/,
    "after an in-band miss, a dx-gated second pass must exist");
  assert.match(after, /pickSideways\s*\(/,
    "the dx second pass must call pickSideways");
  assert.match(after, /if \(dy && edge\) return edge/,
    "vertical wrap via `if (dy && edge) return edge` stays");
  assert.match(after, /return n \? list\[\(\(j % n\) \+ n\) % n\] : null/,
    "DOM wrap remains the last resort so a press is never a no-op");

  const iDx = after.search(/if \(dx\)/);
  const iDy = after.search(/if \(dy && edge\) return edge/);
  const iWrap = after.search(/return n \? list\[\(\(j % n\) \+ n\) % n\] : null/);
  assert.ok(iDx < iDy && iDy < iWrap,
    "sideways pass, then dy wrap, then DOM wrap — not some other order");

  assert.doesNotMatch(after, /inBand/,
    "no second in-band / out-of-band geometry loop after the first miss");
  assert.doesNotMatch(after, /if \(dy && !best\)/,
    "dy must not grow an out-of-band phase (ArrowDown from BACK → Zandvoort)");
});

test("pickSideways weights Y lightly and only considers items really to that side", () => {
  const sideSrc = extractFn(SRC, "pickSideways");
  assert.match(sideSrc, /along\s*=\s*\(b\.x\s*-\s*a\.x\)\s*\*\s*dx/,
    "along = (b.x - a.x) * dx");
  assert.match(sideSrc, /along\s*>\s*1|along\s*<=\s*1/,
    "candidates must be really to that side (along > 1)");
  assert.match(sideSrc, /across\s*\*\s*0\.25/,
    "Y is a light tie-break (~0.25), not the in-band * 2");
  assert.doesNotMatch(sideSrc, /across\s*\*\s*2/,
    "must not reuse the in-band across * 2 weight");
});

test("MenuNav exports step so tests can call the spatial walker", () => {
  assert.match(SRC,
    /return \{ activeLayer, nearestPane, onWheel, onKeyDown, FOCUSABLE, step/,
    "step (and the rest of the surface) must stay on the MenuNav return object");
});

test("pickSideways: mid-list ArrowLeft lands in the adjacent column at similar height", () => {
  const { pickSideways } = loadMenuNav();
  const from = { id: "zandvoort", x: 400, y: 300 };
  const header = { id: "back", x: 100, y: 40 };
  const filters = { id: "filters", x: 100, y: 80 };
  const preview = { id: "preview", x: 100, y: 220 };
  const start = { id: "start", x: 100, y: 480 };
  const farRight = { id: "dom-next", x: 620, y: 305 };
  const hit = pickSideways(from, [header, filters, preview, start, farRight], -1);
  assert.equal(hit && hit.id, "preview",
    "closest-Y neighbour to the left wins; a far DOM neighbour to the right is ignored");
});

test("pickSideways: nothing to that side returns null (DOM wrap is step()'s job)", () => {
  const { pickSideways } = loadMenuNav();
  const from = { id: "leftmost", x: 40, y: 200 };
  const right = { id: "right", x: 400, y: 200 };
  assert.equal(pickSideways(from, [right], -1), null);
  assert.equal(pickSideways(from, [right], 1) && pickSideways(from, [right], 1).id, "right");
});

test("step(): in-band neighbour still beats an out-of-band header", () => {
  const { step } = loadMenuNav();
  const from = el("mid", 300, 286, 180, 28);
  const inBand = el("in-band-left", 200, 286, 80, 28);
  const header = el("header", 20, 10, 80, 28);
  assert.equal(step(from, -1, 0, [header, inBand, from]).id, "in-band-left");
});

test("step(): ArrowLeft from mid-list reaches a non-overlapping left column", () => {
  const { step } = loadMenuNav();
  const back = el("back", 20, 10, 80, 28);
  const filters = el("filters", 20, 48, 80, 28);
  const preview = el("preview", 20, 200, 80, 28);
  const start = el("start", 20, 460, 80, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const below = el("spa", 300, 320, 180, 28);
  const list = [back, filters, preview, mid, below, start];
  assert.equal(step(mid, -1, 0, list).id, "preview",
    "out-of-band left column at similar height, not DOM wrap to spa/start");
});

test("step(): ArrowDown stays in-band and does not jump to a sideways header", () => {
  const { step } = loadMenuNav();
  const back = el("back", 20, 10, 80, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const below = el("spa", 300, 320, 180, 28);
  const far = el("far-down-left", 20, 500, 80, 28);
  assert.equal(step(mid, 0, 1, [back, mid, below, far]).id, "spa");
});

test("step(): vertical wrap still uses the in-band edge, not an out-of-band item", () => {
  const { step } = loadMenuNav();
  const top = el("bahrain", 300, 40, 180, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const last = el("spa", 300, 320, 180, 28);
  const otherCol = el("start", 20, 460, 80, 28);
  assert.equal(step(last, 0, 1, [top, mid, last, otherCol]).id, "bahrain");
});

test("step(): chip-row Left/Right stay in-group until an end, then fall through", () => {
  const { step } = loadMenuNav();
  const a = el("chip-a", 40, 80, 48, 24);
  const b = el("chip-b", 96, 80, 48, 24);
  const side = el("rail", 20, 200, 80, 28);
  const row = { contains: (n) => n === a || n === b };
  a.closest = (sel) => sel === ".chip-row" ? row : null;
  b.closest = (sel) => sel === ".chip-row" ? row : null;
  const list = [side, a, b];
  assert.equal(step(a, 1, 0, list).id, "chip-b", "Right inside the group");
  assert.equal(step(b, -1, 0, list).id, "chip-a", "Left inside the group");
  assert.equal(step(a, -1, 0, list).id, "rail",
    "Left off the first chip falls through to the spatial sideways pass");
});
