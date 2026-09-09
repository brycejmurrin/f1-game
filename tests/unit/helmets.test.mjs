// helmets.test.mjs — one readable helmet per driver, and none of them the
// colour of the car it sits in.
//
// The helmet used to be the team's own paint: a papaya dome in a papaya
// McLaren, invisible at every distance the game is played at, and identical
// for both drivers in the team. js/car/helmets.js gives each race number a
// design — a base plus zones in (latitude, azimuth) — which js/car/car3d.js
// paints per vertex into the car mesh. This pins the properties that make that
// worth doing: every driver has one, every one separates from its own car, and
// the pieces the geometry depends on stay where car3d expects them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const load = (p, name) => new Function(read(p) + "; return " + name + ";")();
const Helmets = load("js/car/helmets.js", "Helmets");
const Teams = load("js/data/teams.js", "Teams");

const grid = () => {
  const out = [];
  for (const t of Teams.LIST) for (const d of t.drivers) out.push({ ...d, team: t.short, teamC: t.color });
  return out;
};
// The same "too close to the car" test the module uses to decide on the alt.
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

test("every driver on the grid has a hand-made design, not a generated one", () => {
  const missing = grid().filter((d) => !Helmets.DESIGNS[d.num]).map((d) => `${d.code} #${d.num}`);
  assert.deepEqual(missing, [], "add the number to DESIGNS in js/car/helmets.js");
  assert.equal(Object.keys(Helmets.DESIGNS).length, grid().length, "one design per seat, no orphans");
});

test("no helmet is the colour of the car it sits in", () => {
  // The whole point of the module: a helmet that matches its own car is
  // invisible in the only views that show it.
  const blend = [];
  for (const d of grid()) {
    const des = Helmets.designFor(d.num, d.teamC);
    if (dist(des.base, d.teamC) < 0.30) blend.push(`${d.code} (${d.team}) base ${des.base.map((x) => x.toFixed(2))}`);
  }
  assert.deepEqual(blend, [], "pick a base that separates from the team colour, or give the design an `alt`");
});

test("a design that WOULD blend falls back to its alt, and the alt is a real escape", () => {
  // A custom or career team can be painted anything, so the fallback has to
  // work — this drives each design with its OWN base as the car colour.
  for (const num of Object.keys(Helmets.DESIGNS).map(Number)) {
    const d = Helmets.DESIGNS[num];
    assert.ok(d.alt, `#${num} has no alt`);
    const shifted = Helmets.designFor(num, d.base);
    assert.equal(shifted.shifted, true, `#${num} did not fall back when the car matched its base`);
    assert.ok(dist(shifted.base, d.base) >= 0.30, `#${num}'s alt is too close to its own base`);
  }
});

test("every colour is a real rgb triple in range, and every zone kind exists", () => {
  const ok = (c, where) => {
    assert.ok(Array.isArray(c) && c.length === 3, `${where}: not an rgb triple`);
    for (const v of c) assert.ok(typeof v === "number" && v >= 0 && v <= 1, `${where}: ${v} out of 0..1`);
  };
  for (const num of Object.keys(Helmets.DESIGNS)) {
    const d = Helmets.DESIGNS[num];
    ok(d.base, `#${num} base`);
    ok(d.alt, `#${num} alt`);
    ok(d.visor, `#${num} visor`);
    for (const z of d.zones) {
      assert.ok(Helmets.ZONES[z.k], `#${num}: no zone kind "${z.k}"`);
      ok(z.c, `#${num} zone ${z.k}`);
    }
  }
});

test("the painter answers for every point of the shell, and paints more than the base", () => {
  for (const num of Object.keys(Helmets.DESIGNS).map(Number)) {
    const des = Helmets.designFor(num, null);
    const paint = Helmets.painter(des);
    const seen = new Set();
    for (let t = 0; t <= 1.0001; t += 0.05) {
      for (let az = 0; az < 360; az += 5) {
        const c = paint(Math.min(1, t), az);
        assert.ok(Array.isArray(c) && c.length === 3, `#${num}: no colour at t=${t.toFixed(2)} az=${az}`);
        seen.add(c.join(","));
      }
    }
    // a design nobody can tell from a plain ball is not a design
    assert.ok(seen.size >= 3, `#${num} paints only ${seen.size} colour(s) — its zones do not land on the shell`);
  }
});

test("the visor is an aperture over the eyes: front only, and neither the crown nor the chin", () => {
  assert.equal(Helmets.isVisor(0.05, 0), false, "the crown is paint");
  assert.equal(Helmets.isVisor(0.30, 0), false, "the brow is paint — the aperture is not up on the forehead");
  assert.equal(Helmets.isVisor(0.53, 0), true, "straight ahead is visor");
  assert.equal(Helmets.isVisor(0.53, 180), false, "the back of the head is paint");
  assert.equal(Helmets.isVisor(0.53, 110), false, "the temples are paint");
  assert.equal(Helmets.isVisor(0.95, 0), false, "the chin bar is paint");
  // symmetric about the nose, and wrapping 0 rather than clipping at 359
  for (const az of [10, 25, 40]) assert.equal(Helmets.isVisor(0.53, az), Helmets.isVisor(0.53, 360 - az), `asymmetric at ${az}`);
  // a LENS: widest across the eyes, closing toward the brow and the nose
  const width = (t) => { let n = 0; for (let az = 0; az < 360; az++) if (Helmets.isVisor(t, az)) n++; return n; };
  assert.ok(width(0.53) > width(0.43) && width(0.53) > width(0.64), "the aperture is widest in the middle, not a rectangle");
});

test("shell() marks the visor as glass and the paint as paint", () => {
  const shell = Helmets.shell(Helmets.designFor(44, null));
  const eye = shell(0.53, 0), crown = shell(0.05, 0);
  assert.equal(eye.glass, true);
  assert.equal(crown.glass, false);
  assert.deepEqual([...eye.c], [...Helmets.DESIGNS[44].visor], "the aperture wears the design's visor tint");
});

test("the shell holds the proportions traced off the reference photographs", () => {
  // Not a judgement call any more. SHAPE's W comes off a straight-on front
  // shot and its F/B off the median of eleven side-on portraits, so what this
  // pins is what those photographs measured: 0.25 m tall, four fifths as wide
  // as it is tall, a quarter longer than it is tall, fattest just below the
  // middle, and ending at a neck rim rather than tapering to a point.
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  Helmets.build(out, 0, 0.63, -0.075, Helmets.designFor(44, null), { paint: 1, glass: 2 });
  let minY = Infinity, maxY = -Infinity, maxX = 0, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < out.pos.length; i += 3) {
    minY = Math.min(minY, out.pos[i + 1]); maxY = Math.max(maxY, out.pos[i + 1]);
    maxX = Math.max(maxX, Math.abs(out.pos[i]));
    minZ = Math.min(minZ, out.pos[i + 2]); maxZ = Math.max(maxZ, out.pos[i + 2]);
  }
  const h = maxY - minY, w = 2 * maxX, d = maxZ - minZ;
  assert.ok(h > 0.24 && h < 0.31, `height ${h.toFixed(3)} is not head-sized`);
  assert.ok(w > 0.18 && w < 0.24, `width ${w.toFixed(3)} is not head-sized`);
  assert.ok(h > w, "a helmet is taller than it is wide");
  assert.ok(d > w, "and a little deeper than it is wide");
  // the widest ring is at the ears, above the bottom of the shell
  const widest = Helmets.SHAPE.W.indexOf(Math.max(...Helmets.SHAPE.W));
  assert.ok(Helmets.SHAPE.T[widest] > 0.3 && Helmets.SHAPE.T[widest] < 0.75, "widest at the ears, not at the rim");
  assert.ok(d / h > 1.18 && d / h < 1.32, `length:height ${(d / h).toFixed(2)} — the photographs measured 1.21`);
  // FATTEST LOW. Both extremes sit level with the jaw, not up at the brow.
  // Four earlier hand-drawn tables put the maximum reach at the chin instead
  // and the profile read as a bus front.
  for (const col of ["F", "B"]) {
    const a = Helmets.SHAPE[col], t = Helmets.SHAPE.T[a.indexOf(Math.max(...a))];
    assert.ok(t > 0.5 && t < 0.75, `${col} reaches furthest at t=${t}, not at 55-70% of the height`);
  }
  // ONE HUMP, NO STEPS. The old table stepped the outline — a proud brow, a
  // recessed aperture, a chin bar jutting out under it. The photographs show
  // none of that: the silhouette rises once and falls once.
  for (const col of ["W", "F", "B"]) {
    const a = Helmets.SHAPE[col];
    // a 2 mm deadband: the traced width holds a genuine flat band across the
    // widest part of the shell, and reading each equal row as a turn would
    // count that plateau as a step
    let turns = 0, dir = 0;
    for (let i = 1; i < a.length; i++) {
      const d = a[i] - a[i - 1];
      if (Math.abs(d) <= 0.002) continue;
      if (dir && Math.sign(d) !== dir) turns++;
      dir = Math.sign(d);
    }
    assert.ok(turns <= 1, `${col} changes direction ${turns} times — the outline is stepped, not a single curve`);
  }
  // the neck rim is a flat cut: narrower than the widest ring, but still a
  // real opening rather than the point every view rounds off to in a photo
  const wMax = Math.max(...Helmets.SHAPE.W), wRim = Helmets.SHAPE.W[Helmets.SHAPE.W.length - 1];
  assert.ok(wRim < wMax * 0.8, "the shell does not taper in to the neck");
  assert.ok(wRim > wMax * 0.35, "the rim closes to a slit — the photo rounds off below it, the shell should not follow");
  // a closed, well-formed surface: every index in range, no degenerate normals
  const n = out.pos.length / 3;
  assert.ok(out.idx.every((i) => i >= 0 && i < n), "index out of range");
  for (let i = 0; i < out.nrm.length; i += 3) {
    const m = Math.hypot(out.nrm[i], out.nrm[i + 1], out.nrm[i + 2]);
    assert.ok(Math.abs(m - 1) < 1e-6, `normal ${i / 3} is not unit (${m})`);
  }
  assert.ok(out.mat.includes(2), "the visor vertices carry the glass surface");
});

test("a number off the grid gets a design of its own, stable and distinct", () => {
  const a = Helmets.generated(101), b = Helmets.generated(101), c = Helmets.generated(102);
  assert.deepEqual(a.base, b.base, "the same driver keeps the same head between sessions");
  assert.deepEqual(a.zones.map((z) => z.k), b.zones.map((z) => z.k));
  assert.equal(a.generated, true);
  assert.ok(a.zones.length > 0, "a generated design still has marks");
  assert.notDeepEqual([a.base, a.zones.length], [c.base, c.zones.length], "two career drivers do not share a helmet");
  const paint = Helmets.painter(Helmets.designFor(101, [0.5, 0.5, 0.5]));
  assert.ok(Array.isArray(paint(0.4, 40)));
});

test("car3d builds the helmet through Helmets, and keeps no head geometry of its own", () => {
  const car3d = read("js/car/car3d.js");
  assert.match(car3d, /Helmets\.designFor\(/, "the helmet build asks Helmets for the design");
  assert.match(car3d, /Helmets\.build\(out,/, "and hands the mesh to Helmets to fill");
  assert.doesNotMatch(car3d, /HELMET_ACCENT/, "the old eight-colour accent table is gone, not orphaned");
  assert.doesNotMatch(car3d, /function addDome\(/, "the hemisphere builder went with it — Helmets owns the shell");
});

test("the profile is a spline through the traced rows, not nineteen straight segments", () => {
  // Joining the rows with straight lines creased the shell at every one of
  // them, worst at the crown, where it drew a flat cap with a hard rim. The
  // check is that the slope does not jump as t crosses a row.
  const T = Helmets.SHAPE.T;
  const fwd = (t) => Helmets.pointAt(t, 0)[2];
  const worst = { jump: 0, t: null };
  for (let i = 1; i < T.length - 1; i++) {
    const t = T[i], e = 0.004;
    const before = (fwd(t) - fwd(t - e)) / e, after = (fwd(t + e) - fwd(t)) / e;
    const jump = Math.abs(after - before) / Math.max(0.02, Math.abs(before), Math.abs(after));
    if (jump > worst.jump) { worst.jump = jump; worst.t = t; }
  }
  assert.ok(worst.jump < 0.5, `slope jumps ${worst.jump.toFixed(2)}x across the row at t=${worst.t} — tab() is interpolating linearly`);
});

// ── the paint is a picture, not a grid ───────────────────────────────────────
// The mottled designs used to be a hash per (ring, slice) cell. That matched
// the DENSITY of a mottled helmet and none of its STRUCTURE, so it rendered as
// a scatter of axis-aligned rectangles — and RAISING the mesh resolution made
// it worse, because the speckle itself was the subject. These pin the two
// properties that fixed it, so neither can quietly regress to grid noise.

test("the mottle draws connected strokes, not one-cell speckle", () => {
  // Run LENGTH does not discriminate: a 30%-density cell hash has a mean ink
  // run of 1/(1-0.3) = 1.4 cells, and the doodle measures 1.3 — a test on that
  // would have passed either way. What actually separates them is COHERENCE
  // BETWEEN RINGS: a level set's strokes carry from one ring to the next, and
  // an independent per-cell hash agrees only at chance, d^2 + (1-d)^2.
  // Measured on the DOODLE ALONE: a whole design also carries a cap, bands, a
  // keyline and the visor, whose edges are ring-to-ring disagreements too, and
  // they drag the figure to 67% whatever the doodle does.
  for (const num of [1, 10, 27]) {
    const zone = (Helmets.designFor(num, [0.9, 0.35, 0.05]).zones || []).find((z) => z.k === "mottle");
    assert.ok(zone, `#${num} has no mottle zone — this test is checking nothing`);
    const skin = Helmets.shell({ name: "M", base: [1, 1, 1], alt: [0, 0, 0], visor: [0, 0, 0], zones: [zone] });
    const dt = 1 / Helmets.RINGS, cell = 360 / Helmets.SLICES;
    const ink = (t, az) => skin(t, ((az % 360) + 360) % 360).c[0] < 0.5;
    let same = 0, n = 0, on = 0;
    for (let t = 0.12; t < 0.55; t += dt)
      for (let az = 0; az < 360; az += cell) { if (ink(t, az) === ink(t + dt, az)) same++; if (ink(t, az)) on++; n++; }
    const d = on / n, chance = d * d + (1 - d) * (1 - d);
    assert.ok(same / n > chance + 0.12,
      `#${num}: ring-to-ring agreement ${(100 * same / n).toFixed(0)}% against ${(100 * chance).toFixed(0)}% at chance — the pattern is independent per cell, not a stroke`);
  }
});

test("the mottle is resolution-free — the same doodle at any tessellation", () => {
  // Scoped to the MOTTLE. Bands and keylines snap to ring lines ON PURPOSE, so
  // their edges land exactly on mesh edges and come out crisp; they are
  // supposed to move with the grid. The doodle is not.
  const src = read("js/car/helmets.js");
  const mk = (text) => new Function(text + "; return Helmets;")();
  const alt = mk(src.replace(/const RINGS = \d+, SLICES = \d+;/, "const RINGS = 26, SLICES = 40;"));
  assert.equal(alt.SLICES, 40, "the rebuild did not take — the test is checking nothing");
  // Take the zone from a real design: ZONES holds the PREDICATES, not the
  // constructors, so ZONES.mottle(...) returns false and a shell built from it
  // has no doodle at all — a version of this test built that way compared two
  // blank shells and passed without checking anything.
  const only = (H) => {
    const z = (H.designFor(1, [0.9, 0.35, 0.05]).zones || []).find((x) => x.k === "mottle");
    assert.ok(z, "#1 has no mottle zone — this test is checking nothing");
    return H.shell({ name: "M", base: [1, 1, 1], alt: [0, 0, 0], visor: [1, 1, 1], zones: [z] });
  };
  const a = only(Helmets), b = only(alt);
  for (let t = 0.10; t < 0.90; t += 0.017)
    for (let az = 0; az < 360; az += 7)
      assert.deepEqual(b(t, az).c, a(t, az).c, `the doodle moved with the grid at t=${t.toFixed(3)} az=${az}`);
});

test("a quad splits only where the paint changes, and never moves the shell", () => {
  const S = { paint: 7, glass: 9 };
  const build = (design) => {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    Helmets.build(out, 0, 0, 0, design, S);
    return out;
  };
  const base = Helmets.RINGS * Helmets.SLICES * 2;
  // A shell with no zones still has the visor and the neck trim, so it splits a
  // little; what it must not do is split everywhere.
  const flat = build({ name: "FLAT", base: [1, 1, 1], alt: [1, 1, 1], visor: [0, 0, 0], zones: [] });
  assert.ok(flat.idx.length / 3 < base * 1.5,
    `an unpainted shell emitted ${flat.idx.length / 3} against ${base} — the split is firing on quads whose corners agree`);
  // ...and a real design must split, or the whole mechanism is dead code.
  const nor = build(Helmets.designFor(1, [0.9, 0.35, 0.05]));
  assert.ok(nor.idx.length / 3 > base * 1.5, `#1 emitted ${nor.idx.length / 3} triangles — the split is not firing`);

  // Every vertex the split adds must lie ON the shell: this is a PAINT change,
  // and geometry that moved would be a silhouette change nothing else guards.
  // Y is monotone in t, so bisect t from the height, then check the radius.
  let worst = 0;
  for (let i = 0; i < nor.pos.length; i += 3) {
    const p = [nor.pos[i], nor.pos[i + 1], nor.pos[i + 2]];
    const az = Math.atan2(p[0], p[2]);
    let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Helmets.pointAt(m, az)[1] > p[1]) lo = m; else hi = m; }
    const q = Helmets.pointAt((lo + hi) / 2, az);
    worst = Math.max(worst, Math.hypot(q[0] - p[0], q[2] - p[2]));
  }
  assert.ok(worst < 1e-6, `a vertex sits ${worst.toExponential(2)} m off the shell — subdivision moved the geometry`);
});

test("maxSplit 0 is the unsplit grid, even on a busy design", () => {
  const base = Helmets.RINGS * Helmets.SLICES * 2;
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  Helmets.build(out, 0, 0, 0, Helmets.designFor(1, [0.9, 0.35, 0.05]), { paint: 7, glass: 9, maxSplit: 0 });
  assert.equal(out.idx.length / 3, base, `maxSplit 0 emitted ${out.idx.length / 3}, not the ${base}-tri grid`);
});
