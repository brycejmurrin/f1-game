/* cover-legibility.test.mjs — every shipped cover design has to be VISIBLE.
 *
 * The design a team's default livery wears is a band of one colour painted on
 * the engine cover. Nothing checked that the two colours differ. Four covers
 * shipped that a player could not see:
 *
 *   haas     `carbon`, a dark weave, on a dark graphite car
 *   audi     `bigmark`, the team mark, on a black car
 *   ferrari  a white `saddle` on the near-white cover another session gave it
 *   mercedes teal `twin` stripes on its new silver cover
 *
 * The first two were found by eye, on track, after passing every test and a
 * review of the atlas — a 430 px crop flatters a graphic that a race camera
 * renders as forty pixels of mud. The other two were found by this file, in
 * seconds, and had already merged. That is the argument for measuring it.
 *
 * WHAT IS MEASURED. The atlas is replayed into the recording context and the
 * crown and flank regions are sampled on a grid. For each region the colour
 * covering the most sampled points is the design's dominant paint, and it is
 * scored against what it lands on — `liv.cover` when the livery repaints the
 * engine cover, else the body. A region nothing paints is fine: "none" and the
 * mark-only designs are legitimate.
 *
 * THE FLOOR is 2.0, not INK_FLOOR's 3.0. These are metre-long bands rather
 * than lettering: Red Bull's bull measures 2.26 against its navy and reads
 * clearly from a race camera (tools/shot/shot.mjs --team, 2026-09-08), so a
 * floor that failed it would be measuring the wrong thing.
 *
 * Run: node --test tests/unit/cover-legibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadCrests, paintAt } from "../../tools/car/crest-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { RecCtx } = loadCrests();

// The same VM the other atlas tests use: liverytex with a recording canvas.
function loadAtlas() {
  let last = null;
  const sb = { console, Math, Object, Array, String, Number, JSON, Map, Set, isNaN, isFinite, parseInt, parseFloat,
    document: { querySelector: () => null,
                createElement: () => ({ getContext: () => (last = new RecCtx()), width: 0, height: 0 }) } };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/data/teams.js", "js/car/liveries.js", "js/car/crest-paths.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  return { LT: vm.runInContext("LiveryTex", sb), Teams: vm.runInContext("Teams", sb),
           Liveries: vm.runInContext("Liveries", sb), ops: () => last.ops };
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const parseCss = (css) => {
  const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(css || "");
  return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : null;
};

const FLOOR = 2.0;
const GRID = 26;

function dominant(ops, R) {
  const tally = new Map();
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const style = paintAt(ops, R.x + (i + 0.5) / GRID * R.w, R.y + (j + 0.5) / GRID * R.h);
      if (style) tally.set(style, (tally.get(style) || 0) + 1);
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { style: top[0], share: top[1] / (GRID * GRID) } : null;
}

test("every shipped cover design is visible against the cover it sits on", () => {
  const A = loadAtlas();
  const bad = [];
  for (const team of A.Teams.LIST) {
    const liv = A.Liveries.forTeam(team)[0];   // the SHIPPED default, not a probe
    A.LT.buildAtlas(team.id, liv, 7, true);
    const ops = A.ops();
    const bg = liv.cover || liv.c1 || team.color;
    for (const [name, R] of [["crown", A.LT.REGIONS.crest], ["flank", A.LT.REGIONS.spineSide]]) {
      const top = dominant(ops, R);
      if (!top) continue;                       // bare is a legitimate design
      const paint = parseCss(top.style);
      if (!paint) continue;                     // an image mark, not a flat band
      const ratio = contrast(paint, bg);
      if (ratio < FLOOR)
        bad.push(`${team.id} ${name}: ${top.style} on the cover scores ${ratio.toFixed(2)} `
                 + `(floor ${FLOOR}) over ${(top.share * 100).toFixed(0)}% of the region`);
    }
  }
  assert.deepEqual(bad, []);
});
