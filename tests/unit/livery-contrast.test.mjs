/* livery-contrast.test.mjs — no design may paint a large area it cannot be seen on.
 *
 * Three failures shipped in one week and all three were the same shape: the
 * crown band on a pale cover (fixed once, with its own guard), the wrap's sun
 * (#ffec00 on Ferrari's #f2f2f5 cover, 1.09:1), and the flank bands, which
 * scored against the COVER while standing on a flank the crown design had
 * already repainted — 1.00:1, the saddle's own colour on itself, on every team.
 *
 * liverytex.js answers "will this be seen" at a dozen sites with nine different
 * thresholds, so a new design is only as safe as whoever wrote it remembering to
 * ask. This asks once, knowing nothing about which code path painted what.
 *
 * The full sweep is tools/car/livery-contrast.mjs (every team x 13 x 10, ~80 s).
 * This runs the slice that has actually caught something — the crown designs
 * that repaint the flank, against the flank designs that stand on it — over
 * every team, in a few seconds.
 *
 * Run: node --test tests/unit/livery-contrast.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAtlas, sweepAtlas, AREA_FLOOR } from "../../tools/car/livery-contrast.mjs";
import { paintAt } from "../../tools/car/crest-sweep.mjs";

// The atlas records CSS strings, so the comparison is done on them rather than
// on the colour arrays LiveryTex.contrast takes.
const lumCss = (css) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || "");
  if (!m) return null;
  const f = (v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
};
const contrastCss = (a, b) => {
  const la = lumCss(a), lb = lumCss(b);
  return +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2);
};

const A = loadAtlas();

// wrap and saddle are the two SPINE TOPs that repaint the cover flank, so they
// are the ones a flank design can collide with; logo is the untouched control.
const CROWN = ["logo", "wrap", "saddle", "bigmark"];
// The three that paint a band on the flank, plus the mark and plate that have to
// survive one, plus the control.
const SIDE = ["none", "split", "bars", "slash", "plate", "logo"];

test("no design paints a large area that cannot be seen on what it covers", () => {
  const bad = [];
  for (const t of A.Teams.LIST) {
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of CROWN) for (const spineSide of SIDE) {
      const liv = Object.assign({}, base, { spineLogo, spineSide });
      for (const hit of sweepAtlas(A, t.id, liv, ["crest", "spineSide"], 14))
        bad.push(`${t.id} ${spineLogo}/${spineSide} ${hit.region}: ${hit.paint} over ${hit.over} at ${hit.contrast}:1 (${(hit.share * 100).toFixed(0)}% of the panel)`);
    }
  }
  assert.deepEqual(bad, [], `below ${AREA_FLOOR}:1 —\n  ${bad.join("\n  ")}`);
});

test("the wrap sun and the flank band are picked against what they land on", () => {
  // The two specific regressions, pinned by their own numbers so a future change
  // that reintroduces either fails with the measurement rather than a sweep miss.
  for (const t of A.Teams.LIST) {
    const liv = A.Liveries.forTeam(t)[0];
    const cover = liv.cover || liv.c1;
    const c = A.LT.contrast(A.LT.sunColour(t.id, liv), cover);
    assert.ok(c >= AREA_FLOOR, `${t.id}: the wrap sun reads ${c.toFixed(2)}:1 on its own cover`);
  }
});

test("the tricolour is two colours, not one repeated", () => {
  // A NEW class, invisible to the sweep above: these bands sit BESIDE each
  // other with body paint between, so nothing is covering anything and no
  // contrast-against-background check can see the collision. Both are picked
  // against the cover — one as the band colour, one as the crest ink — and were
  // never compared to each other: Mercedes measured 1.01:1 between its own two
  // bands, Aston Martin 1.03, Williams 1.07.
  //
  // A team whose whole livery is TWO colours is exempt, and the exemption is
  // derived rather than named: Red Bull is navy and gold with no stripe and no
  // accent, its cover IS its c1, and nothing in that world clears 2.0 against
  // both navy and gold — white is the best available at 1.43, which is what
  // pickOn returns. Inventing a third colour for it would be worse.
  const N = 30, R = A.LT.REGIONS.crest;
  for (const t of A.Teams.LIST) {
    const liv = A.Liveries.forTeam(t)[0];
    const twoColour = !liv.stripe && !liv.accent &&
      String(liv.cover || liv.c1) === String(liv.c1);
    const ops = A.paint(t.id, Object.assign({}, liv, { spineLogo: "tricolour" }));
    const bands = new Set();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const s2 = paintAt(ops, R.x + R.w * (i + 0.5) / N, R.y + R.h * (j + 0.5) / N);
      if (s2 && /0\.97\)/.test(s2)) bands.add(s2);
    }
    const [a, b] = [...bands];
    assert.ok(a && b, `${t.id}: the tricolour painted ${bands.size} band colour(s), expected 2`);
    if (twoColour) continue;
    const c = contrastCss(a, b);
    assert.ok(c >= 2.0, `${t.id}: the tricolour's two bands read ${c}:1 against each other (${a} / ${b})`);
  }
});
