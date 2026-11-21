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
    { name: "Mirabeau", turn: 5, sign: -1, halfM: 80 }, // official T5 Mirabeau Haute (def T7 before 2026-11-11)
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


test("Jeddah starts on the pit straight after T27 and numbers its turns as the FIA does", () => {
  // #5507: startFrac 0.9160 put the grid 288 m BEFORE the final hairpin (the
  // 2026-10-18 move read T27, also a left, as Turn 1), so every def.turns entry
  // was one corner late. The line now sits on the T27 -> T1 straight, ~250 m
  // before the T1 apex (F1: 168 m pole to the T1 braking point; FIA: 220 m grid
  // to Turn 1). Positions are OSM trace coordinates (def.path frame, metres).
  const { def, track, corner } = circuit("jeddah");
  const n = track.n, L = track.total, ds = L / n;
  assert.equal(def.turns.length, 27);
  for (let i = 1; i < def.turns.length; i++) assert.ok(def.turns[i] > def.turns[i - 1]);
  // The line: on the chord between the hairpin exit and T1, dead straight for the grid and the launch.
  assert.ok(Math.hypot(track.px[0] + 180, track.pz[0] + 695) < 6, `line at ${track.px[0].toFixed(1)}, ${track.pz[0].toFixed(1)}`);
  let bend = 0;
  for (let m = -200; m <= 150; m += ds) bend = Math.max(bend, Math.abs(track.curv[(Math.round(m / ds) + n) % n]));
  assert.ok(bend < 0.0035, `the grid and launch run bend (max |k| ${bend.toFixed(4)})`);
  // Turn 1 is the tight LEFT of the first chicane, Turn 2 its right, 40-80 m on.
  const t1 = corner(1), t2 = corner(2), t1m = t1.fraction * L;
  assert.ok(t1m > 240 && t1m < 260, `Turn 1 apex ${t1m.toFixed(0)} m after the line, want ~250`);
  assert.ok(t1.curvature > 0.02 && Math.hypot(t1.x + 92, t1.z + 462) < 30, `Turn 1 is the left at the chicane (k ${t1.curvature.toFixed(4)})`);
  const gap12 = (t2.fraction - t1.fraction) * L;
  assert.ok(t2.curvature < -0.02 && gap12 > 40 && gap12 < 80, `Turn 2 is the right ${gap12.toFixed(0)} m later (k ${t2.curvature.toFixed(4)})`);
  // Turn 27 is the final hairpin, BEHIND the line by the length of the pit straight.
  const t27 = corner(27), back = (1 - t27.fraction) * L;
  assert.ok(t27.curvature > 0.02 && Math.hypot(t27.x + 385, t27.z + 1495) < 40, `Turn 27 is the hairpin (k ${t27.curvature.toFixed(4)})`);
  assert.ok(back > 700 && back < 900, `the hairpin is ${back.toFixed(0)} m before the line`);
  // The other corners everyone can name: T4 left, T13 the banked left, T22 left.
  for (const t of [4, 13, 22]) assert.ok(corner(t).curvature > 0.01, `Turn ${t} is a left (k ${corner(t).curvature.toFixed(4)})`);
  assert.equal(def.pit.side, -1, "the pit lane is on the left of the straight (OSM way 1121870473)");
});

test("Brands Hatch starts on the Brabham straight, so Paddock Hill is Turn 1 and Clearways the last", () => {
  // #5316 (Bryce's `decision: Brands Hatch A`, 2026-11-18): startFrac 0.1226 put
  // the line on the Stirlings -> Clearways link, so Clearways was "Turn 1" 104 m
  // after the line. The driver61 Start/Finish GPS point projects 0.9 m from
  // control node 29 (143.1, 401.7), on the Brabham straight 216 m before
  // Paddock Hill (docs/tracks/START-LINES.md). Positions are def.path metres.
  const { def, track, corner } = circuit("brands_hatch");
  const L = track.total;
  assert.ok(Math.hypot(track.px[0] - 143.1, track.pz[0] - 401.7) < 3, `line at ${track.px[0].toFixed(1)}, ${track.pz[0].toFixed(1)}`);
  const t1 = corner(1), t1m = t1.fraction * L;
  assert.ok(t1.curvature < -0.01 && t1m > 240 && t1m < 290, `Turn 1 is the right at Paddock Hill (${t1m.toFixed(0)} m, k ${t1.curvature.toFixed(4)})`);
  assert.ok(Math.hypot(t1.x + 105, t1.z - 454) < 30, `Turn 1 at ${t1.x.toFixed(0)}, ${t1.z.toFixed(0)}`);
  const last = corner(def.turns.length), back = (1 - last.fraction) * L;
  assert.ok(last.curvature < -0.01 && Math.hypot(last.x - 391, last.z - 78) < 30, `the last turn is Clearways (${last.x.toFixed(0)}, ${last.z.toFixed(0)})`);
  assert.ok(back > 400 && back < 550, `Clearways is ${back.toFixed(0)} m before the line`);
  assert.ok(!def.pit || def.pit.side !== -1, "the pit wall stays on the driver's right (driver61)");
});

test("Donington pit wall is on the driver's left of the Wheatcroft Straight", () => {
  // #5316 CIRC1-01 leftover: tip defaulted pit.side to +1 (right / infield).
  // Real guides put pit entry and the concrete pit wall on the LEFT
  // (ukCircuits paddock tour; oversteer48; driver61 / START-LINES.md).
  // buildCenterline has no pit complex — side is authored on the def; the
  // shoelace check uses the centreline only (same shape as the Kyalami pin).
  const { def, track } = circuit("donington");
  assert.equal(def.pit.side, -1);
  const probe = [track.px[0] - track.rx[0] * 80, track.pz[0] - track.rz[0] * 80];
  let inside = false;
  for (let i = 0, j = track.n - 1; i < track.n; j = i++) {
    const [xi, zi, xj, zj] = [track.px[i], track.pz[i], track.px[j], track.pz[j]];
    if ((zi > probe[1]) !== (zj > probe[1]) && probe[0] < (xj - xi) * (probe[1] - zi) / (zj - zi) + xi) inside = !inside;
  }
  assert.equal(inside, false, "a point 80 m to the driver's left of the line is outside the loop");
});

test("Kyalami runs anticlockwise with the SRO turns, line and infield pits", () => {
  // SRO/IGTC 2023 Kyalami 9 Hour briefing notes p. 8-9 (#5316 CIRC2-05): 16
  // turns, T1 The Kink a flat right a few hundred metres after S/F, T2
  // Crowthorne the left hairpin, T16 Ingwe the slow left onto the straight,
  // pit lane on the infield. The clockwise def had Crowthorne as T1, a right.
  const { def, track, corner } = circuit("kyalami");
  const L = track.total, ds = L / track.n;
  let turning = 0;
  for (let k = 0; k < track.n; k++) turning += track.curv[k] * ds;
  assert.ok(Math.abs(turning - 2 * Math.PI) < 0.05, `net turning ${turning.toFixed(3)} rad: +2π is anticlockwise`);
  assert.equal(def.turns.length, 16);
  const kink = corner(1), crowthorne = corner(2), ingwe = corner(16);
  assert.ok(kink.curvature < 0 && kink.curvature > -0.004, "T1 The Kink: a gentle right");
  assert.ok(kink.fraction * L > 200 && kink.fraction * L < 320, "The Kink 200-320 m after the line");
  assert.ok(crowthorne.curvature > 0.03 && Math.hypot(crowthorne.x + 733, crowthorne.z - 216) < 25,
    "T2 Crowthorne: the left hairpin at the trace's west end");
  assert.ok(ingwe.curvature > 0.03 && (1 - ingwe.fraction) * L > 200 && (1 - ingwe.fraction) * L < 350,
    "T16 Ingwe: a left hairpin 200-350 m before the line");
  // The pit side (engine -1, the driver's left) points INTO the loop.
  assert.equal(def.pit.side, -1);
  const probe = [track.px[0] - track.rx[0] * 100, track.pz[0] - track.rz[0] * 100];
  let inside = false;
  for (let i = 0, j = track.n - 1; i < track.n; j = i++) {
    const [xi, zi, xj, zj] = [track.px[i], track.pz[i], track.px[j], track.pz[j]];
    if ((zi > probe[1]) !== (zj > probe[1]) && probe[0] < (xj - xi) * (probe[1] - zi) / (zj - zi) + xi) inside = !inside;
  }
  assert.ok(inside, "a point 100 m to the driver's left of the line is on the infield");
});

test("Sepang T5-T6 bank is turn-anchored and the K1 stand is a T1 approach kit", () => {
  // #5652: bankZones frac 0.330 sat 183 m before T5 with no turn claim; the K1
  // stand stays at racing 0.058 (moving it floats) and names Turn 1 & 2
  // approach so APPROACH_M covers the 72 m run-up.
  const CF = require("../../tools/track/corner-frames.cjs");
  const { def } = circuit("sepang");
  assert.ok(def.bankZones.some((b) => b.turn === 5),
    "T5-T6 sweep bank must use { turn: 5 }, not a bare frac");
  const bad = CF.audit(["sepang"]).filter((r) => r.bad).map((r) => `${r.key} ${r.offsetM}m`);
  assert.deepEqual(bad, [], "sepang must have no corner-frame offenders");
});

test("Portimao T12 bank is turn-anchored and Norte stand is a T1 braking kit", () => {
  // #5652: bankZones frac 0.640 sat 72 m past T12 with no turn claim; the Norte
  // / MEO kit names Turn 1 but its head line omitted "braking", so the 96 m
  // approach window was judged against KIT_M (60) instead of APPROACH_M (300).
  const CF = require("../../tools/track/corner-frames.cjs");
  const { def } = circuit("portimao");
  assert.ok(def.bankZones.some((b) => b.turn === 12),
    "T12 bank must use { turn: 12 }, not a bare frac");
  const bad = CF.audit(["portimao"]).filter((r) => r.bad).map((r) => `${r.key} ${r.offsetM}m`);
  assert.deepEqual(bad, [], "portimao must have no corner-frame offenders");
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

test("Spa crossfall follows the measured Bruxelles hairpin and both Pouhon apexes", () => {
  const { track } = circuit("spa");
  // SPW 2021–22 0.5 m DTM. Projected bacinger vertices, signed angle measured
  // across ±3 m of the road centre; positive means the right side is higher.
  // Pin physical locations so adjusting the timing line cannot move the check.
  for (const [x, z, measured] of [
    [-301.3, -1031.9, -2.92], [-259.4, -990.5, -1.71], [-283.7, -938.0, -2.98],
    [-301.3, -373.4, 2.37], [-214.0, -306.7, 1.97], [-83.5, -320.9, 2.74],
  ]) {
    let nearest = 0, distance = Infinity;
    for (let k = 0; k < track.n; k++) {
      const d = Math.hypot(track.px[k] - x, track.pz[k] - z);
      if (d < distance) { nearest = k; distance = d; }
    }
    assert.ok(distance < 5, `survey station (${x}, ${z}) missed the road by ${distance} m`);
    const s = nearest * track.total / track.n;
    const rise = Tracks.banking(track, s, 3).dy - Tracks.banking(track, s, -3).dy;
    const actual = Math.atan2(rise, 6) * 180 / Math.PI;
    // Smooth authored bowls approximate an archived raster, including small
    // direction and registration errors between its trace and the spline.
    assert.ok(Math.abs(actual - measured) < 1.2, `at (${x}, ${z}): ${actual}° vs ${measured}°`);
  }
});
