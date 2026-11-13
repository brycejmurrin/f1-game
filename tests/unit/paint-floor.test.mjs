// paint-floor — the painted-size judge and the owner-phone acceptance plan (tools/lib/paint-floor.mjs,
// tools/ui/bryce-paint.mjs, tests/data/bryce-phone-paint.json). Pure: no browser.
import test from "node:test";
import assert from "node:assert/strict";
import { PAINT_KINDS, judgePaint, paintCounts, paintInsets, paintLine, summarisePaint } from "../../tools/lib/paint-floor.mjs";
import { appliedTag } from "../../tools/ui/ui-scale-axis.mjs";
import fs from "node:fs";
import { ACCEPT_ROOTS, ACCEPT_SCREENS, CEILINGS_FILE, ceilingsFrom, cellKey, judgeCells, planRun, readCeilings } from "../../tools/ui/bryce-paint.mjs";
import { BRYCE_WINDOWS, UI_SIZE_AXIS } from "../../tools/lib/bryce-phone.mjs";

const flags = (o) => ({ flag: (k, d) => (k in o ? o[k] : d), has: (k) => k in o });
// A 102x48 chip and 14 px type under a 0.51 zoom: what the screen shows is 52x24.5 and 7.14 px.
const RAW = {
  taps: [{ el: "button.sel-chip", w: 52, h: 24.5, scale: 0.51 }, { el: "button#go", w: 120, h: 44, scale: 1 }, { el: "button#edge", w: 60, h: 43.6, scale: 1 }],
  texts: [{ el: "span.a", text: "MONZA", px: 7.14, own: 14, scale: 0.51 }, { el: "span.b", text: "GO", px: 12, own: 12, scale: 1 }, { el: "span.c", text: "x", px: 11.6, own: 11.6, scale: 1 }],
  outside: [{ el: "span.sec-lbl", kind: "text", at: "785,85 17x18" }],
  blocked: [],
  scroll: { x: 0, y: 0, left: 0, top: 0 },
};

test("summarisePaint judges what the SCREEN shows: 52x24.5 is under 44, 7.14 px is under 12; the half-pixel slack is kept", () => {
  const p = summarisePaint(RAW);
  assert.deepEqual(paintCounts(p), { taps: 1, text: 1, outside: 1, blocked: 0, scroll: 0 });
  assert.deepEqual(p.taps.smallest, { el: "button.sel-chip", w: 52, h: 24.5 });
  assert.deepEqual(p.taps.worst, ["button.sel-chip 52x24.5"]);
  assert.equal(p.text.smallest.px, 7.14);
  assert.equal(p.taps.n, 3);
  assert.equal(paintLine(p), "taps under 44px 1/3 (smallest 24.5px button.sel-chip); text under 12px 1/3 (smallest 7.14px span.a); outside safe box 1; blocked 0; page scroll no");
  assert.equal(summarisePaint({ ...RAW, scroll: { x: 0, y: 40, left: 0, top: 0 } }).scroll.under, 1, "a document taller than the window scrolls");
  assert.equal(summarisePaint({ ...RAW, scroll: { x: 0, y: 1, left: 0, top: 0 } }).scroll.under, 0, "one px of rounding does not");
  assert.deepEqual(paintCounts(summarisePaint({})), { taps: 0, text: 0, outside: 0, blocked: 0, scroll: 0 });
});

test("judgePaint is a ratchet: above the ceiling is a regression, below it is a stale ceiling, equal holds", () => {
  const p = summarisePaint(RAW);
  assert.deepEqual(judgePaint(p, { taps: 1, text: 1, outside: 1 }, "c"), []);
  const hard = judgePaint(p, {}, "standalone@61 select");
  assert.equal(hard.length, 3);
  assert.deepEqual(hard, [
    "standalone@61 select: 1 tap target(s) paint under 44px, ceiling 0 — button.sel-chip 52x24.5",
    'standalone@61 select: 1 text node(s) paint under 12px, ceiling 0 — span.a 7.14px "MONZA"',
    "standalone@61 select: 1 item(s) cross the safe box, ceiling 0 — span.sec-lbl text at 785,85 17x18",
  ]);
  const stale = judgePaint(p, { taps: 4, text: 1, outside: 1 }, "c");
  assert.equal(stale.length, 1);
  assert.deepEqual(stale, ["c: 1 tap target(s) paint under 44px, below the recorded ceiling 4 — lower the ceiling to 1 (it only ratchets down)"]);
});

test("judgeCells: an unopened screen, a screen with no control and an unrecorded cell (hard floor) are all failures", () => {
  const p = summarisePaint(RAW);
  const empty = summarisePaint({});
  const bad = judgeCells({ "standalone@61": { title: p, garage: { error: "root #carsetup is not visible" }, hud: empty } }, { cells: { "standalone@61": { title: { taps: 1, text: 1, outside: 1 } } } });
  assert.deepEqual(bad, ["standalone@61 garage: not measured — root #carsetup is not visible", "standalone@61 hud: no control was measured (the screen did not open, or its root moved)"]);
  assert.equal(judgeCells({ "w844@61": { title: p } }, { cells: {} }).length, 3, "no recorded ceiling = every kind must be 0");
});

test("planRun: the default plan is every window × the UI SIZE axis × the seven screens; bad values throw", () => {
  const plan = planRun(flags({}));
  assert.deepEqual(plan.windows, ["standalone", "safari", "w844"]);
  assert.deepEqual(plan.scales, [50, 70, 109]);
  assert.deepEqual(plan.screens, ["title", "select", "garage", "settings", "hud", "pause", "results"]);
  assert.equal(plan.profile, true);
  assert.deepEqual(planRun(flags({ "--screens": "results,title", "--ui-scale": "61", "--window": "safari", "--profile": "legacy" })),
    { windows: ["safari"], scales: [61], screens: ["title", "results"], profile: "legacy" });
  assert.throws(() => planRun(flags({ "--window": "ipad" })), /unknown "ipad"/);
  assert.throws(() => planRun(flags({ "--ui-scale": "20" })), /percent in \[40, 200\]/);
  assert.throws(() => planRun(flags({ "--screens": "career" })), /unknown "career"/);
  assert.throws(() => planRun(flags({ "--check": true, "--write": true })), /exclusive/);
  assert.deepEqual(Object.keys(ACCEPT_ROOTS), [...ACCEPT_SCREENS]);
});

test("ceilingsFrom keeps counts only, merges into the previous file and never records an unmeasured screen", () => {
  const p = summarisePaint(RAW);
  const out = ceilingsFrom({ "safari@61": { title: p, hud: { error: "x" } } }, { known: { "w844@40 title outside": "#5385" }, cells: { "w844@40": { title: { taps: 9, text: 9, outside: 0, blocked: 0, scroll: 0 } } } });
  assert.deepEqual(Object.keys(out.cells), ["safari@61", "w844@40"]);
  assert.deepEqual(out.cells["safari@61"], { title: { taps: 1, text: 1, outside: 1, blocked: 0, scroll: 0 } });
  assert.deepEqual(out.floors, { tap: 44, text: 12 });
  assert.deepEqual(out.known, { "w844@40 title outside": "#5385" }, "hand-written known offenders survive --write");
});

test(`${CEILINGS_FILE} records every acceptance cell and screen, with whole non-negative counts of the five kinds`, () => {
  const c = readCeilings();
  assert.deepEqual(c.floors, { tap: 44, text: 12 });
  const want = Object.keys(BRYCE_WINDOWS).flatMap((w) => UI_SIZE_AXIS.map((s) => cellKey(w, s))).sort();
  assert.deepEqual(Object.keys(c.cells), want);
  for (const [cell, screens] of Object.entries(c.cells)) {
    assert.deepEqual(Object.keys(screens), [...ACCEPT_SCREENS], cell);
    for (const [screen, counts] of Object.entries(screens)) {
      assert.deepEqual(Object.keys(counts), [...PAINT_KINDS], `${cell} ${screen}`);
      for (const [k, n] of Object.entries(counts)) assert.ok(Number.isInteger(n) && n >= 0, `${cell} ${screen} ${k} = ${n}`);
    }
  }
});

test("#5234: the paint block carries the sheet zoom — own 102x48 at zoom 0.51 is the painted 52x24.5 the block reports", () => {
  const p = summarisePaint({ ...RAW, zoom: 0.51 });
  assert.equal(p.zoom, 0.51);
  assert.equal(+(102 * p.zoom).toFixed(1), p.taps.smallest.w, "own width x zoom = the painted width");
  assert.equal(+(48 * p.zoom).toFixed(1), p.taps.smallest.h, "own height x zoom = the painted height");
  assert.ok(paintLine(p).startsWith("zoom 0.51; taps under 44px 1/3"), paintLine(p));
  assert.equal(summarisePaint(RAW).zoom, null, "no measured zoom stays null, and the log line keeps its old shape");
});

test("#5234: every layout-audit cell is painted — insets come from the viewport entry, not only an owner preset", () => {
  const notched = ["ios-iphone-landscape-844", {}, "why", { t: 0, r: 47, b: 21, l: 47 }];
  assert.deepEqual(paintInsets(notched), { top: 0, right: 47, bottom: 21, left: 47 });
  assert.equal(paintInsets(["desktop-1280x800", {}, "why"]), null, "a desktop cell has no safe-area box");
  const owner = { insets: { top: 0, right: 62, bottom: 21, left: 62 } };
  assert.deepEqual(paintInsets(notched, owner), owner.insets, "an owner preset's real insets win");
  const src = fs.readFileSync(new URL("../../tools/ui/layout-audit.mjs", import.meta.url), "utf8");
  const line = src.split("\n").find((l) => l.includes("page.evaluate(measurePaintInPage"));
  assert.ok(line, "layout-audit measures paint");
  assert.match(line, /^\s*cell\.paint = /, "no gate in front of the paint measure (it was `if (owner)`)");
  assert.match(line, /\{ roots: screen\.root, insets: paintBox \}/, "the cell's insets come from paintInsets(vpEntry, owner)");
});

test("#5234: appliedTag names a slider that clamped the requested scale; the cell key never changes", () => {
  assert.equal(appliedTag(51, { ui: 51, hud: 70 }), " hud@70", "HUD floors at 70 %: a @51 cell says so");
  assert.equal(appliedTag(130, { ui: 130, hud: 130 }), "", "taken as asked: no suffix");
  assert.equal(appliedTag(null, { ui: 61, hud: 100 }), "", "the device default has nothing to clamp");
  assert.equal(appliedTag(40, null), "");
});
