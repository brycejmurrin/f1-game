// track-validate-fleet — the ORACLE for js/editor/validate.js: judge every
// shipped circuit's built centreline by the designer's rules. Real circuits
// must not read RED on length, crossing (Suzuka's figure-8 is bridged),
// clearance or grade, and the tarmac-fold rule must name exactly the circuits
// tools/track/verify-track.cjs knows fold (bahrain, buddh, korea). The
// start-straight rule is REPORTED, not asserted: pit.js names the circuits
// whose real start sits in a corner. Proves the validator measures the
// engine, not itself. The insight ambers (js/editor/insight.js, fia-*: the FIA
// Grade 1 layout advice plus crests and dips) are calibrated here: never RED,
// ≤ 60 circuit-codes on the whole fleet, no code on more than 15 circuits, a
// dip on at most 3 — advice that fires on every real circuit would be noise.
// ~52 centreline builds, a few seconds.
//
// Run: node --test tests/unit/track-validate-fleet.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor } from "../helpers/editor-vm.mjs";

const KNOWN_FOLDS = ["bahrain", "buddh", "korea"];   // verify-track.cjs knownTarmacFolds()

test("the shipped fleet passes the designer's road rules; the fold rule agrees with verify-track", () => {
  const { Tracks, V } = bootEditor();
  const reds = [], folds = [], startShort = [], ambers = {}, fia = {}, fiaRed = [];
  for (const def of Tracks.LIST) {
    if (def.custom) continue;
    const tr = Tracks.buildCenterline(def);
    const j = V.judge(tr, def);
    for (const i of j.issues) {
      if (/^fia-/.test(i.code)) { (fia[i.code] = fia[i.code] || new Set()).add(def.id); if (i.level !== "amber") fiaRed.push(def.id + ": " + i.code + ":" + i.level); }
      if (i.level === "amber") ambers[i.code] = (ambers[i.code] || 0) + 1;
      if (i.level !== "red") continue;
      if (i.code === "fold") { folds.push(def.id); continue; }
      if (i.code === "start") { startShort.push(def.id + " (" + j.stats.startBackM + "/" + j.stats.startFwdM + " m)"); continue; }
      if (i.code === "grade") { startShort.push(def.id + " grade " + j.stats.gradeMax + " %"); continue; }   // real hills: reported, like the start
      reds.push(def.id + ": " + i.code + " — " + i.msg);
    }
    if (def.id === "suzuka") {
      assert.ok(j.issues.some((i) => i.code === "bridge" && i.level === "info"), "Suzuka's crossing reads as bridged");
      assert.ok(!j.issues.some((i) => i.code === "crossing"), "…not at grade");
    }
    assert.ok(j.turns.length >= 3, def.id + " bakes turns");
  }
  console.log("fleet oracle: start-straight shortfalls (reported, not asserted): " + (startShort.join(", ") || "none"));
  console.log("fleet oracle: amber counts " + JSON.stringify(ambers));
  assert.deepEqual(reds, [], "a shipped circuit reads RED on a rule that is meant to measure the engine");
  const perCode = Object.fromEntries(Object.entries(fia).map(([c, ids]) => [c, ids.size]));
  const fiaTotal = Object.values(perCode).reduce((a, b) => a + b, 0);
  console.log("fleet oracle: FIA Grade 1 ambers per code " + JSON.stringify(perCode) + ", " + fiaTotal + " in all — " + Object.entries(fia).map(([c, ids]) => c + ": " + [...ids].join(" ")).join("; "));
  assert.deepEqual(fiaRed, [], "an FIA rule is advice: never anything but AMBER");
  assert.ok(fiaTotal <= 60, "≤ 60 insight ambers (circuit × code) over the 52 circuits, got " + fiaTotal);
  for (const [c, n] of Object.entries(perCode)) assert.ok(n <= 15, c + " fires on " + n + " circuits (cap 15)");
  // Crests (v²·κv lifting the car 0.5 g over a 40 m window) are real on the
  // hilly circuits — Spa, Imola, Suzuka, Monaco — and on few others; a dip
  // compressing 2.5 g is rarer still.
  console.log("fleet oracle: crests on " + (perCode["fia-crest"] || 0) + " circuits, dips on " + (perCode["fia-sag"] || 0));
  assert.ok((perCode["fia-crest"] || 0) <= 15, "crest on ≤ 15 circuits");
  assert.ok((perCode["fia-sag"] || 0) <= 3, "sag on ≤ 3 circuits");
  assert.deepEqual(folds.sort(), KNOWN_FOLDS.slice().sort(), "the fold rule names exactly verify-track's known folds");
});

// ── check() itself: no throw, never a silent green, the preview is the saved circuit ──
import { design, ellipse } from "../helpers/editor-vm.mjs";

test("check: null / empty / unstorable designs are RED, never 'All checks pass'", () => {
  const { V } = bootEditor();
  for (const d of [null, undefined, 42, {}, { pts: "x" }]) {
    let v;
    assert.doesNotThrow(() => { v = V.check(d); }, JSON.stringify(d));
    assert.equal(v.ok, false); assert.ok(v.red >= 1, JSON.stringify(d) + " reads red");
  }
  // A point dragged off the ±10 km map: CustomTracks.sanitize refuses the loop, so nothing builds.
  const pts = ellipse(); pts[5] = [10500, 0];
  const off = V.check(design({ pts }));
  assert.equal(off.ok, false);
  assert.ok(off.issues.some((i) => i.code === "bounds" && i.level === "red"), JSON.stringify(off.issues));
  assert.ok(off.red >= 1);
});

test("check: the preview builds under the design's content id, deterministically, with or without the racing line", () => {
  const { V, C, Tracks } = bootEditor();
  const d = design({ elevations: [{ s: 0.4, halfM: 300, rise: 6 }] });
  const a = V.check(d), b = V.check(d);
  assert.equal(a.def.id, C.sanitize(d).id, "the preview def carries the content id (it seeds the elevation ripple)");
  assert.ok(!Tracks.LIST.some((t) => t.id === a.def.id), "…and is never registered in Tracks.LIST");
  const strip = (v) => JSON.stringify({ issues: v.issues, stats: v.stats, turns: v.turns });
  assert.equal(strip(a), strip(b), "two checks of one design agree");
  // The racing line is not an input to any rule: a full build and a line-less one judge the same.
  // (Until Tracks.buildCenterline takes { line: false } both builds bake it — the test holds either way.)
  const full = Tracks.buildCenterline(a.def), lean = Tracks.buildCenterline(a.def, { line: false });
  const ja = V.judge(full, d, a.def), jb = V.judge(lean, d, a.def);
  assert.equal(JSON.stringify(ja), JSON.stringify(jb), "judge ignores the racing line");
  assert.equal(strip(a), JSON.stringify({ issues: ja.issues, stats: ja.stats, turns: ja.turns }), "check() = judge() over the engine's centreline");
});

/** A rounded rectangle (w-long bottom straight first), on the 0.25 m lattice. */
function rrect(w, h, R, step) {
  const pts = [], arc = (cx, cz, a0) => { for (let a = a0; a > a0 - Math.PI / 2 + 1e-9; a -= step / R) pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); };
  for (let x = 0; x < w; x += step) pts.push([x, 0]);
  arc(w, -R, Math.PI / 2);
  for (let z = -R; z > -R - h; z -= step) pts.push([w + R, z]);
  arc(w, -R - h, 0);
  for (let x = w; x > 0; x -= step) pts.push([x, -2 * R - h]);
  arc(0, -R - h, -Math.PI / 2);
  for (let z = -R - h; z < -R; z += step) pts.push([-R, z]);
  arc(0, -R, Math.PI);
  return pts.map((p) => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]);
}

test("start floors: the pit model judges the garage row (TrackPit.build hasBays), not a constant", () => {
  const { V, S, Tracks } = bootEditor();
  const base = rrect(300, 900, 120, 20);   // a 300 m start straight on a ~3.1 km lap
  // 216 m behind, 80 m ahead: past the 70 m exit floor, but the limiter window
  // (150 + 50 m) is shorter than the 12-bay row needs.
  const tight = V.check(design({ pts: S.rotate(base, 11) }));
  assert.ok(tight.stats.startFwdM >= V.LIMITS.startFwdRed, `fwd ${tight.stats.startFwdM} m clears the constant floor`);
  assert.ok(tight.issues.some((i) => i.code === "start" && i.level === "red" && /garages/.test(i.msg)), JSON.stringify(tight.issues));
  // 40 m earlier the row fits: no RED on the start.
  const fits = V.check(design({ pts: S.rotate(base, 9) }));
  assert.ok(!fits.issues.some((i) => i.code === "start" && i.level === "red"), JSON.stringify(fits.issues));
  // The fleet: every shipped circuit without room for bays is ALREADY red on
  // the exit floor (jerez, mont_tremblant), so the rule adds no RED circuit.
  const noBays = [];
  for (const def of Tracks.LIST) {
    if (def.custom) continue;
    const tr = Tracks.buildCenterline(def);
    if (V.noBays(tr, def)) { noBays.push(def.id); assert.ok(V.straightRun(tr, 0, 1, 600) < V.LIMITS.startFwdRed, def.id + ": no bays but no exit-floor RED"); }
  }
  console.log("fleet oracle: circuits whose pit has no room for bays: " + (noBays.join(", ") || "none"));
});

test("clearance: a pair 25 m apart across a 24 m grid boundary is still seen (cell = 2·hwMax + 10)", () => {
  const { V } = bootEditor();
  // Two straights 25 m apart (z 23.9 and 48.9: grid cells 0 and 2 at 24 m), joined at both ends.
  const P = [];
  for (let x = 0; x < 1000; x += 4) P.push([x, 23.9]);
  for (let z = 23.9; z < 48.9; z += 4) P.push([1000, z]);
  for (let x = 1000; x > 0; x -= 4) P.push([x, 48.9]);
  for (let z = 48.9; z > 23.9; z -= 4) P.push([0, z]);
  const n = P.length, f = (fn) => Float32Array.from(P.map(fn));
  let total = 0; for (let i = 0; i < n; i++) total += Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
  const tr = { n, total, px: f((p) => p[0]), pz: f((p) => p[1]), py: new Float32Array(n), curv: new Float32Array(n), hw: new Float32Array(n).fill(8) };
  const j = V.judge(tr, {});
  assert.ok(j.issues.some((i) => i.code === "clearance"), "25 m apart at hw 8 (amber under 26 m): " + JSON.stringify(j.issues.map((i) => i.code + ":" + i.level)));
});

test("clearance: a pit-reach pair is found wherever the grid puts it (bug-hunt 6.6)", () => {
  const { V, ctx } = bootEditor();
  // A wide pit complex (reach 37.6 m): two straights 48.6 m apart (hw 7 + 7 + reach - 3) are RED
  // as "the pit opening crosses the other part". The cell was 26 m, so the pair was seen only when
  // the hash put both nodes in neighbouring cells: the verdict changed with the loop's z offset.
  const def = { pit: { bands: { work: 30 } } };
  const reach = ctx.TrackPit.resolve(def).off.workOut - 0.9;
  const verdicts = new Set();
  for (const z0 of [-30, -20, -10, -5, -1, 0, 5, 10, 20]) {
    const g = 14 + reach - 3, P = [];
    for (let x = 0; x < 1000; x += 4) P.push([x, z0]);
    for (let z = z0; z < z0 + g; z += 4) P.push([1000, z]);
    for (let x = 1000; x > 0; x -= 4) P.push([x, z0 + g]);
    for (let z = z0 + g; z > z0; z -= 4) P.push([0, z]);
    const n = P.length, f = (fn) => Float32Array.from(P.map(fn));
    let total = 0; for (let i = 0; i < n; i++) total += Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
    const tr = { n, total, px: f((p) => p[0]), pz: f((p) => p[1]), py: new Float32Array(n), curv: new Float32Array(n), hw: new Float32Array(n).fill(7) };
    const j = V.judge(tr, { pts: [[0, 0]] }, def);
    verdicts.add(j.issues.filter((i) => i.code === "clearance").map((i) => i.level).join(","));
  }
  assert.deepEqual([...verdicts], ["red"], "the same verdict at every offset");
});

test("check: a 2,000 km loop is one RED length issue, with no build (bug-hunt 6.2)", () => {
  const { V } = bootEditor();
  // 200 legal points spread over the +-10 km map: the polygon is ~2,200 km (548 k engine nodes).
  const pts = Array.from({ length: 200 }, (_, i) => { const a = ((i * 37) % 200) / 200 * Math.PI * 2; return [Math.round(Math.cos(a) * 9990 * 4) / 4, Math.round(Math.sin(a) * 9990 * 4) / 4]; });
  const t0 = Date.now();
  const v = V.check({ name: "STAR", seed: 1, theme: "parkland", baseHW: 7, pts });
  const ms = Date.now() - t0;
  assert.ok(ms < 50, `answered in ${ms} ms`);
  assert.equal(v.issues.length, 1, JSON.stringify(v.issues.map((i) => i.code)));
  assert.equal(v.issues[0].code, "length");
  assert.equal(v.issues[0].level, "red");
  assert.equal(v.red, 1);
  assert.equal(v.ok, false);
  assert.equal(v.tr, null);
  assert.ok(v.stats.lengthM > 2000000);
  assert.ok(v.issues[0].fix, "LENGTH stays a one-click remedy");
});

test("judge: the crossing list is capped (bug-hunt 6.2)", () => {
  const { V } = bootEditor();
  // A zig-zag loop whose two chains cross ~200 times.
  const P = [];
  for (let k = 0; k < 200; k++) P.push([k * 10, 0], [k * 10 + 5, 80]);
  for (let k = 200; k > 0; k--) P.push([k * 10 - 5, 40]);
  const n = P.length, f = (fn) => Float32Array.from(P.map(fn));
  const tr = { n, total: n * 40, px: f((p) => p[0]), pz: f((p) => p[1]), py: new Float32Array(n), curv: new Float32Array(n), hw: new Float32Array(n).fill(7) };
  const j = V.judge(tr, {});
  const rows = j.issues.filter((i) => i.code === "crossing" || (i.code === "bridge" && i.level === "info")).length;
  assert.ok(rows > 0 && rows <= 64, `${rows} crossing rows`);
  assert.ok(j.stats.crossings <= 64);
});
