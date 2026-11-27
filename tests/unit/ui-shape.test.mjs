// UiShape (#7259): pins today's answer from the five phone / screen-shape predicates on a viewport matrix, and
// that no second copy of the touch / <=500 px rule lives outside js/ui/ui-shape.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(root, "js/ui/ui-shape.js"), "utf8");
const windows = JSON.parse(fs.readFileSync(path.join(root, "tests/data/phone-windows.json"), "utf8")).windows;

const MATRIX = [
  { name: "iphone15 landscape touch", w: 852, h: 393, coarse: true },
  { name: "iphone15 portrait touch", w: 393, h: 852, coarse: true },
  { name: "480x900 mouse", w: 480, h: 900, coarse: false },
  { name: "near-square 700x720 mouse", w: 700, h: 720, coarse: false },
  { name: "desktop 1728x1117 mouse", w: 1728, h: 1117, coarse: false },
  { name: "tablet 820x1180 touch", w: 820, h: 1180, coarse: true },
  ...Object.entries(windows).map(([k, v]) => ({ name: `phone-windows ${k}`, w: v.width, h: v.height, coarse: true })),
];

function load({ w, h, coarse }) {
  const win = { innerWidth: w, innerHeight: h,
    matchMedia: (q) => ({ matches: q === "(pointer: coarse)" ? coarse : q === "(orientation: portrait)" ? h >= w : false }) };
  win.window = win;
  vm.runInNewContext(src, win, { filename: path.join(root, "js/ui/ui-shape.js") });
  return win.UiShape;
}
// The inline rules exactly as the callers wrote them before the module existed.
const OLD = {
  phone: ({ w, h, coarse }) => coarse && Math.min(w, h) <= 500,
  portraitNarrow: ({ w, h }) => h > w && w <= 500,
  orientation: ({ w, h }) => (h >= w ? "portrait" : "landscape"),
};
const oldSheet = (was, ratio, on, off) => was === "tall" ? (ratio <= off ? "wide" : "tall") : (ratio >= on ? "tall" : "wide");

for (const vp of MATRIX) {
  test(`UiShape pin: ${vp.name} ${vp.w}x${vp.h}`, () => {
    const s = load(vp);
    assert.equal(s.phone(), OLD.phone(vp));
    assert.equal(s.phoneUi(), OLD.phone(vp));
    assert.equal(s.coarsePointer(), vp.coarse);
    assert.equal(s.shortSide(), Math.min(vp.w, vp.h));
    assert.equal(s.portraitNarrow(), OLD.portraitNarrow(vp));
    assert.equal(s.orientation(), OLD.orientation(vp));
  });
}

test("UiShape.sheetShape keeps the tall latch and its hysteresis band", () => {
  const s = load(MATRIX[0]);
  for (const was of [undefined, "wide", "tall"]) for (const ratio of [0.4, 0.94, 0.95, 1, 1.04, 1.05, 2.2])
    assert.equal(s.sheetShape(was, ratio, 1.05, 0.95), oldSheet(was, ratio, 1.05, 0.95));
});

test("the touch / <=500 px phone rule has one copy, in ui-shape.js", () => {
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (f.endsWith(".js") && !f.endsWith(path.join("ui", "ui-shape.js"))) {
      const t = fs.readFileSync(f, "utf8");
      if (/\(pointer: coarse\)"\)[^\n]*\.matches[^\n]*<= ?500|Math\.min\(window\.innerWidth, window\.innerHeight\) <= 500|coarse\w*\(\) && shortSide\(\) <= 500/.test(t)) hits.push(path.relative(root, f));
    } } };
  walk(path.join(root, "js"));
  assert.deepEqual(hits, []);
});
