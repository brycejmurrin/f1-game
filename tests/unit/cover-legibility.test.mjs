/* cover-legibility.test.mjs — every cover design a player can PICK has to be
 * VISIBLE.
 *
 * The design on a team's engine cover is paint on paint. Nothing checked that
 * the two colours differ. Four covers shipped that a player could not see:
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
 * WHAT IS MEASURED, and the four ways the first version of it lied:
 *
 *  1. THE WHOLE PICKABLE SPACE, not the twelve defaults. The crown design is a
 *     row in the livery editor: any team can wear any of SPINE_LOGO_IDS, so a
 *     guard that only scores what ships today says nothing about the eleven
 *     other things a player can choose. `carbon` was invisible on ELEVEN of the
 *     twelve cars and no default wore it.
 *  2. COMPOSITED colour, not the top op's declared style. `carbon`'s weave is
 *     rgba(255,255,255,0.07) over its own near-black panel; read as opaque
 *     white it scored 1.70 against a silver cover, which is a number about a
 *     colour that never reaches the screen. paintStackAt blends every covering
 *     op in paint order over the background, which is what a canvas does.
 *  3. Composited over WHAT IS BENEATH, not over the cover. Paint stacks: the
 *     weave lands on the panel, not on the car.
 *  4. READABLE AREA, not the best contrast anywhere. "Some pixel contrasts"
 *     passes a design whose one bright keyline is its only visible part —
 *     which is exactly what `carbon` was. The fraction of the region that
 *     clears the floor is the statistic that matches the question.
 *
 * THE CONTRAST FLOOR is 2.0, not INK_FLOOR's 3.0. These are metre-long bands
 * rather than lettering: Red Bull's bull measures 2.26 against its navy and
 * reads clearly from a race camera (tools/shot/shot.mjs --team, 2026-09-08), so
 * a floor that failed it would be measuring the wrong thing.
 *
 * THE AREA FLOOR is 3 %, and it is calibrated on a design rather than chosen.
 * The thinnest thing that ships is Mercedes' `twin` — two pinstripes on the
 * shoulder creases, 5.0 % of the crown — and it reads on track. 3 % keeps that
 * clear with room to spare while still being 3x what the failures measure.
 * A region NOTHING paints is skipped: `none` is a legitimate design.
 *
 * NOT the same question as livery-contrast.test.mjs, which arrived alongside
 * this and looks close enough to delete one of them. That one asks whether an
 * op owning a LARGE SHARE of a panel separates from what is directly UNDER it,
 * and catches paint landing on paint — a saddle colour drawn onto itself, which
 * this file scores as perfectly readable because both of them separate from the
 * car. This one asks whether enough of the region can be seen AT ALL against
 * the body, which is the only way to catch what its 15 % share floor excludes
 * by design: the thin keyline, the wordmark, the number. Each of the two
 * defects fixed here is invisible to that sweep — carbon is not in its fast
 * slice, and lettering never reaches its share floor. Keep both.
 *
 * Run: node --test tests/unit/cover-legibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadCrests, paintAt, paintStackAt } from "../../tools/car/crest-sweep.mjs";

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

const FLOOR = 2.0;        // contrast a band must clear to count as visible
// Readable area floor, PER REGION, once anything is painted at all. One rule,
// calibrated twice, because the two regions hold different KINDS of design and
// a single number cannot be honest about both: the crown wears metre-long
// bands, the flank wears a badge in a much larger panel. Each floor sits under
// the thinnest thing that SHIPS there and reads on track, so it is a measured
// bar rather than a chosen one.
const AREA = {
  crown: 0.03,            // thinnest shipped: mercedes `twin`, 5.0 %
  flank: 0.015,           // thinnest shipped: astonmartin `logo`, 2.6 %
};
const GRID = 40;

// The fraction of a region that READS, and the fraction that carries any paint
// at all. The second is what separates "this design is subtle" from "this
// design is not there": `none` paints nothing and is fine, while `carbon` on a
// dark car painted 74 % of the crown and only 5 % of it could be seen.
function survey(ops, R, bg) {
  let read = 0, painted = 0, n = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = R.x + (i + 0.5) / GRID * R.w, y = R.y + (j + 0.5) / GRID * R.h;
      n++;
      if (paintAt(ops, x, y)) painted++;
      if (contrast(paintStackAt(ops, x, y, bg), bg) >= FLOOR) read++;
    }
  }
  return { read: read / n, painted: painted / n };
}

// KNOWN GAPS — measured, not waived. An entry is a design a player can pick
// that does not reach the floor today. The test fails if this list GROWS and
// fails if an entry stops failing, so a fix cannot leave a stale allowance
// behind and a regression cannot hide behind one. It is EMPTY, and it earned
// that: it carried cadillac/logo and cadillac/bigmark for one commit, and the
// second assertion is what reported them fixed rather than letting the
// allowance rot into a permanent exemption.
const KNOWN = new Set([]);

// Each editor ROW is measured in the region it CONTROLS. Sweeping the crown row
// while sampling the flank re-measures one unchanged flank thirteen times and
// then reports it as thirteen failures — which is how the first version of this
// arrived at "Aston's flank is broken in ten designs" for a badge that is fine.
const ROWS = [
  { key: "spineLogo", name: "crown", region: "crest",     ids: "SPINE_LOGO_IDS" },
  { key: "spineSide", name: "flank", region: "spineSide", ids: "SPINE_SIDE_IDS" },
];

test("every cover design a player can pick is visible on every car", () => {
  const A = loadAtlas();
  const failing = [];
  for (const team of A.Teams.LIST) {
    const base = A.Liveries.forTeam(team)[0];   // the SHIPPED default livery
    const bg = base.cover || base.c1 || team.color;
    for (const row of ROWS) {
      const floor = AREA[row.name];
      for (const id of A.LT[row.ids]) {
        const liv = Object.assign({}, base, { [row.key]: id });
        A.LT.buildAtlas(team.id, liv, 7, true);
        const s = survey(A.ops(), A.LT.REGIONS[row.region], bg);
        if (s.painted === 0) continue;          // bare is a legitimate design
        if (s.read >= floor) continue;
        failing.push(`${team.id}/${id}/${row.name}`
          + ` reads ${(s.read * 100).toFixed(1)}% of the region (floor ${(floor * 100).toFixed(1)}%)`
          + ` while painting ${(s.painted * 100).toFixed(0)}%`);
      }
    }
  }
  const keyOf = (line) => line.split(" ")[0];
  const New = failing.filter((f) => !KNOWN.has(keyOf(f)));
  assert.deepEqual(New, [], "a cover design went invisible");
  const fixed = [...KNOWN].filter((k) => !failing.some((f) => keyOf(f) === k));
  assert.deepEqual(fixed, [], "these KNOWN gaps now pass — delete them from KNOWN");
});
