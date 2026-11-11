// FIA event maps number physical bends, not every detected curvature peak.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const Tracks = require("../../tools/track/verify-track.cjs").buildContext();

function circuit(id) {
  const def = Tracks.LIST.find(d => d.id === id);
  const track = Tracks.buildCenterline(def, { line: false });
  const corner = number => {
    const fraction = def.turns[number - 1], k = Math.round(fraction * track.n) % track.n;
    return { fraction, x: track.px[k], z: track.pz[k], curvature: track.curv[k] };
  };
  return { def, track, corner };
}

test("Imola timing anchors occupy physical Tosa and first Variante Alta bends", () => {
  // FIA 2025 Doc4/mapv3 (15 May): T7=Tosa, T14=first Alta right.
  // Spatial gates encompass the independently identified map shapes and
  // permit ordinary spline refinement; old T14 .5999 lies on the approach.
  const { def, track, corner } = circuit("imola");
  const tosa = corner(7), alta = corner(14), following = corner(15);
  assert.equal(def.turns.length, 19);
  assert.ok(Math.hypot(tosa.x - 835, tosa.z + 464) < 45 && tosa.curvature > .01);
  assert.ok(Math.hypot(alta.x + 355, alta.z + 18) < 25 && alta.curvature < -.01);
  assert.ok(following.curvature > .01 && following.fraction > alta.fraction);
  assert.ok(Math.abs((tosa.fraction - def.sectors[0]) * track.total - 115) < .01);
  assert.ok(Math.abs((alta.fraction - def.sectors[1]) * track.total - 190) < .01);
  assert.ok(corner(8).fraction > .42 && corner(8).curvature < 0,
    "T8 is the uphill right, not another peak within Tosa");
});

test("Hungaroring names its chicane and physical T5 exit consistently", () => {
  // FIA 2025 Hungarian event map: T4 left, T5 right, T6/T7 right/left,
  // T10 left. The old list doubled T2 and T14, omitting T7 and T10.
  const { def, corner } = circuit("hungaroring");
  assert.equal(def.turns.length, 14);
  assert.ok(corner(4).curvature > .01);
  assert.ok(corner(5).fraction > .40 && corner(5).fraction < .46 && corner(5).curvature < -.01);
  assert.ok(corner(6).curvature < -.01 && corner(7).curvature > .01);
  assert.ok(corner(10).fraction > .60 && corner(10).fraction < .63 && corner(10).curvature > .01);
  for (let i = 1; i < def.turns.length; i++) assert.ok(def.turns[i] > def.turns[i - 1]);
});

test("Hungaroring bankZone TN trailers name the nearest curated apex", () => {
  // Comment-only drift: frac 0.1888 said T1 while sitting on T2; 0.8506 said T11
  // while sitting on T13. Keep TN trailers honest against def.turns.
  const src = readFileSync(new URL("../../js/circuits/hungaroring.js", import.meta.url), "utf8");
  const { def } = circuit("hungaroring");
  const wrap = (d) => { d = Math.abs(d); return d > 0.5 ? 1 - d : d; };
  const nearest = (f) => {
    let best = 1, idx = -1;
    for (let i = 0; i < def.turns.length; i++) {
      const d = wrap(f - def.turns[i]);
      if (d < best) { best = d; idx = i; }
    }
    return { turn: idx + 1, d: best };
  };
  const bad = [];
  for (const line of src.split("\n")) {
    const m = line.match(/\{\s*frac:\s*([0-9.]+)[^}]*\}\s*,?\s*\/\/\s*T(\d+)\b/);
    if (!m) continue;
    const f = Number(m[1]), claimed = Number(m[2]);
    const n = nearest(f);
    if (n.turn !== claimed) bad.push(`frac ${f} trailer T${claimed} but nearest T${n.turn} (Δlap ${n.d.toFixed(4)})`);
  }
  assert.deepEqual(bad, []);
});

test("Monaco bank zones peak on Massenet and Mirabeau, not Ste Devote", () => {
  // As fracs 0.1286 / 0.2961 the _sceneryShift (~0.938) compensation centred
  // the "Massenet" zone on T1 Ste Devote and the "Mirabeau" zone on T4.
  // Turn anchors: T3 = Massenet's first apex (long left, +k), T7 = Mirabeau
  // Haute (right, -k). Reads the BUILT banking profile, not the def.
  const { def, track, corner } = circuit("monaco");
  const { lift } = track.bankP, n = track.n, ds = track.total / n;
  const peak = (f, halfM) => {   // arg-max of lift within ±halfM of fraction f
    const k0 = Math.round(f * n), w = Math.round(halfM / ds);
    let best = -1, off = 0;
    for (let i = -w; i <= w; i++) {
      const k = ((k0 + i) % n + n) % n;
      if (lift[k] > best) { best = lift[k]; off = i; }
    }
    return { lift: best, m: Math.abs(off) * ds };
  };
  const rows = [
    { name: "Massenet", turn: 3, sign: +1, halfM: 30 },
    { name: "Mirabeau", turn: 7, sign: -1, halfM: 80 },
  ];
  for (const r of rows) {
    assert.ok(def.bankZones.some(b => b.turn === r.turn), `${r.name}: a { turn: ${r.turn} } bank zone`);
    const c = corner(r.turn), p = peak(c.fraction, r.halfM);
    assert.equal(Math.sign(c.curvature), r.sign, `${r.name}: T${r.turn} curvature ${c.curvature.toFixed(4)}`);
    assert.ok(p.lift > 0.3 && p.m < 6, `${r.name}: lift ${p.lift.toFixed(2)} m peaks ${p.m.toFixed(1)} m from T${r.turn}`);
  }
  for (const t of [1, 4]) {
    const k = Math.round(def.turns[t - 1] * n) % n;
    assert.equal(lift[k], 0, `T${t} (where the old fracs landed) carries no authored bank`);
  }
});


test("Jeddah apexes follow the start line by the scenery arc shift", () => {
  // 2026-10-18 moved startFrac 0.9625 → 0.9160. The pre-move table matched the
  // curvature peaks. rotate-markings adds _sceneryShift (~0.0479 of a lap) and
  // re-sorts. The shipped table added 0.1916 instead: Turn 1 sat on the straight
  // (k ≈ 0 at 108 m) and the mean miss to a peak was 134 m.
  const { def, track } = circuit("jeddah");
  assert.equal(def.turns.length, 27);
  for (let i = 1; i < def.turns.length; i++) assert.ok(def.turns[i] > def.turns[i - 1]);
  const n = track.n, L = track.total, sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -2; j <= 2; j++) s += Math.abs(track.curv[(i + j + n) % n]);
    sm[i] = s / 5;
  }
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    if (sm[i] >= sm[a] && sm[i] > sm[b] && sm[i] > 0.004) peaks.push(i / n);
  }
  const used = new Set();
  const far = [];
  for (const t of def.turns) {
    let bi = -1, bd = 1;
    for (let i = 0; i < peaks.length; i++) {
      if (used.has(i)) continue;
      let d = Math.abs(peaks[i] - t);
      if (d > 0.5) d = 1 - d;
      if (d < bd) { bd = d; bi = i; }
    }
    used.add(bi);
    const metres = bd * L;
    if (metres > 15) far.push(`${t.toFixed(4)} is ${metres.toFixed(0)} m from the nearest free peak`);
  }
  assert.deepEqual(far, []);
  const t1 = Math.round(def.turns[0] * n) % n;
  const t1m = def.turns[0] * L;
  assert.ok(t1m > 240 && t1m < 340, `Turn 1 at ${t1m.toFixed(0)} m, want the left after the straight (~280 m)`);
  assert.ok(track.curv[t1] > 0.02, `Turn 1 is a left (k ${track.curv[t1].toFixed(4)})`);
});

test("Bahrain scenery landmarks track the current arc-length origin", () => {
  const { def, track } = circuit("bahrain");
  const source = readFileSync(new URL("../../js/circuits/scenery/bahrain.js", import.meta.url), "utf8");
  // Evaluate the callback's actual anchor declarations without emitting meshes.
  const begin = source.indexOf("      const wrapFrac");
  const end = source.indexOf("      if (circuitKit)", begin);
  assert.ok(begin > 0 && end > begin, "scenery anchor prelude exists");
  const anchors = new Function("def", source.slice(begin, end) + "return { SF, T1F, FC };");
  const wrap = f => ((f % 1) + 1) % 1;
  for (const shift of [def._sceneryShift, def._sceneryShift + 0.01]) {
    const a = anchors({ ...def, _sceneryShift: shift });
    // The final-complex fixtures start at T14; T15 was missing from the old
    // table. Restoring that marker must not move the camera or light ring.
    for (const [name, target] of [["SF", 0], ["T1F", def.turns[0]], ["FC", def.turns[13]]]) {
      const racing = wrap(a[name] + shift);
      const error = Math.min(wrap(racing - target), wrap(target - racing)) * track.total;
      assert.ok(error < 0.01, `${name}: ${error} m from its racing anchor`);
    }
  }
});
