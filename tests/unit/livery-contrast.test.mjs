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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAtlas, sweepAtlas, AREA_FLOOR } from "../../tools/car/livery-contrast.mjs";
import { paintAt } from "../../tools/car/crest-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("a colour you PICK is the colour that gets painted, contrast or not", () => {
  // The guards above exist for DERIVED defaults. A pick is a decision about the
  // car and is never re-derived — the field would be pointless if choosing a
  // colour only suggested it. So this deliberately picks one that FAILS the
  // floor (1.81:1 on McLaren's papaya) and asserts it survives to the paint on
  // every surface its field owns. Two of these used to be re-derived silently:
  // the wrap's sun ignored spineTint entirely, and the flank band had no
  // explicit field at all.
  const PICK = [0.62, 0.42, 0.20];
  const css = "rgba(158,107,51,";                 // PICK at 0-255
  const team = A.Teams.LIST.find((t) => t.id === "mclaren");
  const base = A.Liveries.forTeam(team)[0];
  assert.ok(A.LT.contrast(PICK, base.cover || base.c1) < AREA_FLOOR,
    "the pick has to be BELOW the floor or this test proves nothing");
  const dominant = (liv, region) => {
    const ops = A.paint("mclaren", Object.assign({}, base, liv));
    const R = A.LT.REGIONS[region], N = 24, seen = new Map();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = paintAt(ops, R.x + R.w * (i + 0.5) / N, R.y + R.h * (j + 0.5) / N);
      if (c) seen.set(c, (seen.get(c) || 0) + 1);
    }
    return ([...seen.entries()].sort((a, b) => b[1] - a[1])[0] || [""])[0];
  };
  const cases = [
    ["the crown band",       { spineLogo: "saddle", spineTint: PICK }, "crest"],
    ["the tail strip",       { spineLogo: "saddle", spineTint: PICK }, "tail"],
    ["the saddle's flank",   { spineLogo: "saddle", spineTint: PICK }, "spineSide"],
    ["the wrap's sun",       { spineLogo: "wrap",   spineTint: PICK }, "crest"],
    ["the flank band",       { spineLogo: "saddle", spineSide: "split", sideTint: PICK }, "spineSide"],
    ["the flank band, wrap", { spineLogo: "wrap",   spineSide: "bars",  sideTint: PICK }, "spineSide"],
  ];
  for (const [what, liv, region] of cases)
    assert.ok(dominant(liv, region).startsWith(css),
      `${what}: picked ${css}..) and got ${dominant(liv, region)}`);
});

test("pickOn guards Array.isArray(bg) before reading bg[0]", () => {
  // Array.isArray(bg[0]) alone threw when bg was null/undefined.
  const src = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");
  assert.match(src, /Array\.isArray\(bg\)\s*&&\s*bg\.length\s*&&\s*Array\.isArray\(bg\[0\]\)/,
    "pickOn must null-guard bg before treating it as a list of paints");
  assert.doesNotMatch(src, /const bgs = Array\.isArray\(bg\[0\]\)/,
    "the old bg[0]-only guard must not return");
});

test("SPINE TOP wrap survives a partial livery (no c1/c2)", () => {
  // CARVIEW.set({livery:{spineLogo:"wrap"}}) and any caller that patches only
  // the design field used to throw in markPalette (alt.slice on null) once
  // sunColour asked for a palette against [undefined, undefined].
  for (const t of A.Teams.LIST) {
    assert.doesNotThrow(() => A.LT.sunColour(t.id, { spineLogo: "wrap" }),
      `${t.id}: sunColour({spineLogo:"wrap"}) must not throw`);
    const P = A.LT.markPalette(t.id, { spineLogo: "wrap" }, [undefined, undefined], false);
    assert.ok(P.mark && P.mark.length === 3, `${t.id}: mark is an rgb`);
    assert.ok(P.alt && P.alt.length === 3, `${t.id}: alt is an rgb (was null → crash)`);
  }
});

// The five surfaces that used to have NO field of their own — they were derived
// from other parts of the livery, so a player could not choose them at all and
// changing an unrelated colour moved them. `dominant` is the wrong instrument
// for these: lettering and a keyline never own the most sampled points, so this
// asks whether the picked colour REACHES the region, and — the half that makes
// it a real test — that it is absent when the field is unset. Without the
// negative, a colour that happened to be in the livery already would pass.
test("the five formerly-derived surfaces are picks, and only when picked", () => {
  const PICK = [1, 0, 1];                       // magenta: in no shipped livery
  const hit = /^rgba?\(255,0,255[,)]/;          // css()/cssA() emit no spaces
  const reaches = (teamId, liv, region) => {
    const ops = A.paint(teamId, liv);
    const R = A.LT.REGIONS[region], N = 60;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = paintAt(ops, R.x + R.w * (i + 0.5) / N, R.y + R.h * (j + 0.5) / N);
      if (c && hit.test(c)) return true;
    }
    return false;
  };
  const cases = [
    ["crestInk  the crown's lettering", "mercedes", { spineLogo: "wordmark" }, "crest"],
    ["bandTint2 the tricolour's 2nd band", "alpine", { spineLogo: "tricolour" }, "crest"],
    ["sunTint   the wrap's sun", "redbull", { spineLogo: "wrap" }, "crest"],
    ["plateTint the flank number board", "ferrari", { spineSide: "plate" }, "spineSide"],
    ["plateInk  the number on that board", "ferrari", { spineSide: "plate" }, "spineSide"],
  ];
  const bad = [];
  for (const [what, teamId, design, region] of cases) {
    const key = what.split(/\s+/)[0];
    const team = A.Teams.LIST.find((t) => t.id === teamId);
    const off = Object.assign({}, A.Liveries.forTeam(team)[0], design);
    if (reaches(teamId, off, region)) bad.push(`${what}: the probe colour is already there unpicked`);
    if (!reaches(teamId, Object.assign({}, off, { [key]: PICK }), region))
      bad.push(`${what}: picked, and it never reaches the ${region}`);
  }
  assert.deepEqual(bad, []);
});

// THE TWO MARKS THAT LANDED ON A SURFACE NOBODY SCORED.
//
// The instrument took three tries and each failure is worth keeping, because
// each one PASSED while the defect was live:
//   - asking markPalette directly proved the option worked and never touched
//     the call site that had the bug;
//   - sweepAtlas filters anything under 15 % of a panel, and a crest or number
//     never owns that much, so every mark was excluded before being scored;
//   - taking the region's two most-covering colours assumes the second sits ON
//     the first, which is false under a wrap: the sun owns the front of the
//     flank and the mark sits aft of it, so it compared two colours that never
//     touch and reported a car that is fine.
//
// What is measured now: render the SAME livery with the mark and without it,
// and compare — at the pixels the mark actually changed — the colour it paints
// against the colour that was there before. That is the question, with no
// assumption about layout, share, or which colour is the surface.
const cssOf = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
// The tool keeps its own copy private; same expression, same reason.
const alphaOf = (st) => { const m = /rgba\([^)]*,\s*(0?\.\d+|0|1)\)/.exec(st || ""); return m ? +m[1] : 1; };
const markOnItsGround = (teamId, liv, region, key, ground, N = 32) => {
  const withM = A.paint(teamId, liv);
  const without = A.paint(teamId, Object.assign({}, liv, { [key]: "none" }));
  const R = A.LT.REGIONS[region];
  let worst = null, at = null, n = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = R.x + R.w * (i + 0.5) / N, y = R.y + R.h * (j + 0.5) / N;
    const a = paintAt(withM, x, y), b = paintAt(without, x, y);
    if (!a || a === b) continue;                 // the mark did not change this pixel
    // A translucent pass is a shade or a halo, not the mark: comparing a 28 %
    // black against the ground it barely tints measures the shading and reports
    // every car. Same rule sweepAtlas applies, for the same reason.
    if (alphaOf(a) < 0.5) continue;
    n++;
    // Where nothing is painted beneath, the ground is the COVER — that colour
    // comes from the mesh, not from an op, so `null` here means "the car's own
    // paint", not "black". Reading it as black compared the mark to a surface
    // that does not exist and reported every dark mark on a dark car as broken.
    const v = contrastCss(a, b || ground);
    if (v != null && (worst == null || v < worst)) { worst = v; at = `${a} on ${b}`; }
  }
  return { worst, at, n: n / (N * N) };
};

test("the plate-less crown mark clears the cover it is actually drawn on", () => {
  const bad = [];
  for (const t of A.Teams.LIST) {
    // The default plus the two pale showcases that measured 1.00:1 before the
    // fix — sweeping all ~69 liveries doubles the atlas builds for no new class.
    const pick3 = A.Liveries.forTeam(t).filter((l) => ["default", "tricolora", "chrome"].includes(l.id));
    for (const liv of pick3) {
      const l = Object.assign({}, liv, { spineLogo: "bigmark" });
      const r = markOnItsGround(t.id, l, "crest", "spineLogo", cssOf(liv.cover || liv.c1 || t.color));
      if (r.worst == null || r.n < 0.004) continue;
      if (r.worst < AREA_FLOOR) bad.push(`${t.id}/${liv.id}: bigmark ${r.at} at ${r.worst}:1`);
    }
  }
  assert.deepEqual(bad, [], `plate-less marks below ${AREA_FLOOR}:1 —\n  ${bad.join("\n  ")}`);
});

test("a flank mark clears the flank the crown design actually left it", () => {
  const bad = [];
  for (const t of A.Teams.LIST) {
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of ["saddle", "wrap"]) {
      for (const spineSide of ["number", "code", "logo", "wordmark", "duo"]) {
        const liv = Object.assign({}, base, { spineLogo, spineSide });
        const r = markOnItsGround(t.id, liv, "spineSide", "spineSide", cssOf(base.cover || base.c1 || t.color));
        if (r.worst == null || r.n < 0.004) continue;
        if (r.worst < AREA_FLOOR) bad.push(`${t.id} ${spineLogo}/${spineSide}`);
      }
    }
  }
  // KNOWN — measured, not waived. One class: a mark that SPANS the saddle's
  // raked edge. saddleFlanks fills to u 0.58 tapering to 0.40 while the wordmark
  // and duo boxes run out to u 0.96, so they start on the saddle and finish on
  // bare cover, and no single ink clears both. Inking against the pair was tried
  // and is WORSE — Red Bull's number, code and wordmark all fell to 1.31:1 on
  // its gold saddle, surfaces that had been fine. The answer is the HALO
  // markPalette already builds for marks, which is a change to the flank
  // painting path, not a better choice of ink. wrap/logo leftovers are the
  // brand PLATE, which wins outright by an explicit identity-over-legibility
  // decision documented in markPalette — a different argument, not this one.
  //
  // Fails if the list GROWS and fails if an entry starts PASSING, so the fix
  // cannot leave a stale allowance behind and a regression cannot hide in one.
  const KNOWN = new Set([
    "audi saddle/wordmark", "audi saddle/duo",
    "cadillac saddle/wordmark", "cadillac saddle/duo",
    "ferrari saddle/wordmark", "ferrari saddle/duo", "ferrari wrap/logo",
    "mercedes saddle/wordmark", "mercedes saddle/duo",
    "racingbulls saddle/wordmark", "racingbulls saddle/duo",
    "redbull saddle/wordmark", "redbull saddle/duo", "redbull saddle/logo",
    "williams saddle/wordmark", "williams saddle/duo",
  ]);
  assert.deepEqual(bad.filter((k) => !KNOWN.has(k)), [], "a flank mark went invisible");
  assert.deepEqual([...KNOWN].filter((k) => !bad.includes(k)), [],
    "these KNOWN gaps now pass — delete them from KNOWN");
});

// A flank pick has to land where the flank can be SEEN — measured, and NOT
// currently satisfied. tools/car/flank-occlusion.mjs projects the real body and
// both rear wheels through the garage side camera: the tyre sits 0.5 m outboard
// of the cover and covers its aft half (12 % hidden at u 0.5, 48 % at 0.6, 86 %
// at 0.7, 100 % past 0.8). Pure car geometry, identical for every team.
//
// Red Bull is the only team whose bull is TRACED, so wrapMarkSpan gives it a
// span of u 0.06 -> 0.61 while the visible flank ends at 0.62 — the bull fills
// the whole visible band. `sideFrom` then starts every flank pick aft of it, at
// u 0.57-0.79, which is behind the tyre.
//
// THERE ARE ONLY TWO POSITIONS, and this is why the entry below is recorded
// rather than fixed. Clamping sideFrom to 0.41 puts the mark at u 0.49-0.62:
// 0 % hidden, and INSIDE the bull's own span, so it lands on the bull's haunch
// and reads as a smudge (shot 2026-09-09, garage side view, artifacts/
// CLAMP-FLANK-CROP.png). Hidden or colliding — no third placement exists while
// the bull is that wide. The real choices are to shrink the bull under `wrap`
// or to stop putting a second mark on a flank that already wears one, and both
// change a shipped car's look, so both are the owner's call and not a guard's.
//
// The clamp was written, measured, SHOT, and reverted on the strength of the
// shot: the metric improved and the render got worse.
test("a flank MARK lands where the flank is visible, under every crown", async () => {
  const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
  const { occlusionMap } = await import("../../tools/car/flank-occlusion.mjs");
  const { sweep } = await import("../../tools/car/spine-station.mjs");
  const MARKS = ["number", "logo", "code", "plate"];
  // Measured on this tree. Fails if the list GROWS and fails if an entry starts
  // passing, so neither a regression nor the fix can land unremarked.
  const KNOWN = new Set(["redbull wrap/number", "redbull wrap/logo",
                         "redbull wrap/code", "redbull wrap/plate"]);
  const bad = [];
  for (const teamId of ["redbull", "ferrari", "mercedes"]) {
    const om = occlusionMap(loadParts(), { team: teamId, grid: 96 });
    const hiddenAt = (u, v) => om.cell[Math.min(om.rows - 1, (v * om.rows) | 0) * om.cols
                                       + Math.min(om.cols - 1, (u * om.cols) | 0)] === 1;
    for (const logo of ["wrap", "panel"]) {
      const r = sweep(A, { team: teamId, logo, sides: MARKS, hiddenAt });
      for (const row of r.rows) {
        if (!row.px || row.hidden == null) continue;
        if (row.hidden > 0.25) bad.push(`${teamId} ${logo}/${row.spineSide}`);
      }
    }
  }
  assert.deepEqual(bad.filter((k) => !KNOWN.has(k)), [], "a flank mark went behind the car");
  assert.deepEqual([...KNOWN].filter((k) => !bad.includes(k)), [],
    "these KNOWN gaps now pass — delete them from KNOWN");
});
