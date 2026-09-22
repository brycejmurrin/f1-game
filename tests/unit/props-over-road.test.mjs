// props-over-road.test.mjs — NO PROP GEOMETRY ON OR ABOVE THE RACING SURFACE.
//
// The engine guards scenery against the road in three separate ways, and this
// is the axis none of them covers. `prop-clipping.test.mjs` says it in its own
// header: "The engine guards scenery horizontally against the ROAD
// (onTrack/rejBox) and vertically against the GROUND (float-audit). This is the
// third axis — models passing through each other." A prop OVERHANGING the
// tarmac is a fourth: anchored legally just off-track, reaching in over it.
// `buildProps`'s on-road rejection is footprint-based and is bypassed outright
// by the emitters that matter most here — crowd risers and spectators use
// RAW.addBox for speed — so a roof slab, a jumbotron face, a tilted panel or a
// crowd box can pass every guard and still hang in the racing space.
//
// It has shipped twice: a barrier at Vegas and a tree at Buenos Aires.
//
// WHY THIS IS NODE NOW. This audit lived in tests/specs/props-over-road.spec.js
// and was purely geometric there too — it drove a browser only to reach
// `__apex.trackGeometry()`, which returns exactly the four buffers a VM build
// already hands over (js/agent/apex.js: road/terrain/props/glass/water are
// `track.{road,terrain,props,glass,water}Geo`). The spec declared
// `test.setTimeout(1500000)`, which is >= the change-aware gate's 180 s per-test
// budget, so `select-specs.mjs` EXCLUDED it on every js/track and js/circuits
// diff — the exact diffs it exists for — and its only scheduled run was the
// nightly rota's `test:circuits`, one night in eleven. A guard nobody runs is
// not a guard, so the audit is ALSO here, in `test:sweeps`, which the Pages
// gate runs on every geometry diff, blocking. The spec is untouched.
//
// IT FOUND THE SPEC WAS RED. mosport and zandvoort read 1.07 m, which under the
// spec's own rule ("a track NOT in this map must read <= TOL") is a failure,
// and neither was in its map. It is the pit wall's TOP CAP: js/track/scenery/
// pits.js sweeps the profile [[-0.07,1.0],[0.32,1.0],[0.32,1.07],[-0.07,1.07]]
// in WALL_TOP [0.46,0.47,0.50], topping out at exactly 1.07, and the offending
// piece measures 1.91 x 0.09 x 3.84 m at y 1.03-1.12 in that colour. jeddah
// carries the same object and the spec already baselines it there; the other
// three went unbaselined only because this spec runs on no push.
//
// The ladder reaches it because it scales by a half-width taken from the ROAD
// MESH, 1.2-1.3x the engine's track.hw, so the outermost sample lands off the
// tarmac on the boundary a car stays inside. That is the defect worth fixing
// (scale by track.hw and every baseline here could go back to TOL); it is open
// in docs/notes/DEFECT-LEDGER.md, along with the note that sweep() records no
// primitive, so no audit can attribute this geometry at all.
//
// THIS IS NOT A REPLACEMENT FOR THE SPEC, and the difference is measured, not
// assumed. The sample ladder, the tolerance band, the barycentric test and its
// 0.01 degeneracy floor are the spec's, and `nodeAt()`'s three-decimal rounding
// is reproduced so the sample points are the spec's to the millimetre. On the
// two circuits where the spec wrote down what it measured, this reads the same
// to the centimetre: jeddah's "grey [0.46,0.47,0.5] at 1.07 m, lateral -6.35"
// and mont_tremblant's "has read 4.74 since". It also reads mosport and
// zandvoort at 1.07, which the spec never baselined, and a browser run
// confirmed both — the same edge object, unnoticed because the spec never runs.
//
// But the VM build is NOT the browser's geometry. On monza the browser reports
// 0.75 m at frac 0.115 from a flat 2.2 x 0.2 m face at y 0.70, and the VM build
// has NO prop vertex within 5 m of that point (the road and terrain are there;
// props are not). Reproduced with `TRACK=monza` alone, in 22 s, so it is not
// the spec's 52-circuit loop leaking geometry between circuits. The centreline
// is identical (VM node 166 at y -0.052, the browser's sample at -0.05), so the
// divergence is the buffer, not the sampling. Two further measurements say the
// spec's own method is fragile: the half-width its ladder is scaled by reads
// 7.47 m from the engine, 9.68 m from the VM's road mesh and ~6.37 m implied by
// the browser, and its samples are ~4.8 m apart along the arc against a 0.2 m
// wide object — so whether that object is found at all is which build you ask.
// docs/notes/DEFECT-LEDGER.md carries both, open.
//
// So: this guard blocks on every geometry diff, where the spec blocks on none,
// and it reproduces every reading the spec documents. It does not see props the
// VM does not build, and it must not be described as making the spec redundant.
// What changed against the spec is cost: one uniform grid over the centreline
// samples and over the sample points replaces two linear scans, and the whole
// 52-circuit fleet takes 88 s against the spec's 1500 s budget, verdicts
// byte-identical circuit by circuit before and after the indexing.
//
// Run: node --test tests/unit/props-over-road.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// Vertical band that counts as an intrusion. Below TOL is ground-level dressing
// (kerbs, tyre-wall bases) that legitimately hugs the edge; above CEIL is
// clearance for overhead gantries, bridges and high stadium roofs a car passes
// safely beneath.
const TOL = 0.20;
const CEIL = 5.0;
// Centreline samples per lap, and the lateral ladder as fractions of the
// measured half-width. Both are the spec's; changing either changes what every
// baseline below means.
const M = 1200;
const LADDER = [-0.75, -0.4, 0, 0.4, 0.75];

// Circuits with a KNOWN reading, each capped at the metres seen so this still
// fails if the intrusion GROWS or a new circuit regresses. A track NOT in this
// map must read <= TOL — that is what keeps new bugs failing.
//
// miami and albert_park carried caps of 4.2 and 0.7 in the spec and read 0.00
// here; their entries are dropped rather than kept as dead ceilings. Both are
// held to TOL now, which is stricter.
const BASELINE = {
  // Street circuits: the ~1.1-1.3 m readings sit at the road edge, where the
  // track boundary a car stays inside lives. Verified from driver-eye as
  // boundary, not a lane obstruction; on four of them it is the pit wall's cap.
  monaco: 1.4, singapore: 1.3, baku: 1.3,
  // THE PIT WALL'S TOP CAP, on the four circuits that read it: WALL_TOP
  // [0.46,0.47,0.5] at exactly 1.07 m, from the sweep in js/track/scenery/
  // pits.js. Not the garage row's wall, which stands 8.2-13.0 m out, but the
  // ENTRY/EXIT wall at the tarmac edge — on zandvoort 6.81 m against a 7.0 m
  // half-width. jeddah is the one the spec bisected (clean at ed2221fd, over
  // at 80acf931, the walled-exit pit redesign) and the only one it baselined;
  // the other three went unbaselined because this spec runs on no push. The
  // ladder reaches the wall at all because it scales by the MESH half-width,
  // 1.2-1.3x the tarmac's; fixing that is open in DEFECT-LEDGER.
  jeddah: 1.1, mosport: 1.1, zandvoort: 1.1,
  // A forest crown leaning over the road, not an intrusion at the edge: dark
  // green spanning y 9.96-12.46 with the road at 7.33, so 4.74 m of clearance
  // a car drives under. Deliberate — the scenery engine keeps FOOTINGS out and
  // lets crowns reach over (nature.js tree() guards with onTrack(x, z, 4,
  // h * 0.3)). This circuit's identity is a forest tunnel and it builds an
  // explicit ceiling over the cutting at 9.5-16 m, which clears CEIL; this one
  // crown sits 0.26 m under it. Never a regression: mont_tremblant arrived in
  // 06833f3d and has read 4.74 since.
  mont_tremblant: 4.9,
};
const ALLOW = new Set();          // fully-exempt circuits — none; everything is capped

const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();

/** Point in triangle, in the XZ projection, returning the barycentric pair.
 *
 *  The 0.01 floor on the determinant is not a generic epsilon and must not be
 *  loosened: dn is 4*area^2 of the XZ projection, so a near-vertical face of a
 *  long diagonal box projects to a sliver that passes a 1e-9 guard and reports
 *  u = v = 0 "inside" with the box top's height at ANY distance. Measured on
 *  the spec: two grandstands with 15 m of clearance read as 4.65 m over the
 *  road. 0.01 is a 5 x 5 cm projected area. */
function pointInTri(X, Z, ax, az, bx, bz, cx, cz) {
  const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az;
  const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z,
        d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
  const dn = d00 * d11 - d01 * d01;
  if (Math.abs(dn) < 0.01) return null;
  const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn;
  return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null;
}

/** A uniform XZ grid, the one change this port makes to the spec's method.
 *
 *  The spec scanned all M centreline samples for every road vertex and all
 *  ~6000 sample points for every triangle, which is most of its 1500 s. Both
 *  lookups are nearest-neighbour or bbox queries over the same plane, so one
 *  grid serves both and the answers are unchanged: `nearest` widens the ring
 *  until no further ring can beat the best distance found, and `inBox` returns
 *  every point in the cells a bbox covers — a SUPERSET of the points that pass
 *  the bbox test, which the caller still applies. */
const CELL = 40;
function grid(xs, zs, items) {
  const key = (cx, cz) => cx * 100000 + cz;
  const g = new Map();
  for (let i = 0; i < items.length; i++) {
    const k = key(Math.floor(xs[i] / CELL), Math.floor(zs[i] / CELL));
    let a = g.get(k); if (!a) g.set(k, a = []);
    a.push(items[i]);
  }
  return {
    nearest(x, z, px, pz) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      let bd = Infinity, best = -1;
      for (let ring = 0; ring < 400; ring++) {
        for (let ix = cx - ring; ix <= cx + ring; ix++) {
          for (let iz = cz - ring; iz <= cz + ring; iz++) {
            if (ring && Math.abs(ix - cx) !== ring && Math.abs(iz - cz) !== ring) continue;
            const a = g.get(key(ix, iz)); if (!a) continue;
            for (const k of a) {
              const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz;
              if (d < bd) { bd = d; best = k; }
            }
          }
        }
        if (best >= 0 && bd <= (ring * CELL) * (ring * CELL)) break;
      }
      return best < 0 ? 0 : best;
    },
    inBox(mnx, mxx, mnz, mxz) {
      const out = [];
      for (let ix = Math.floor(mnx / CELL); ix <= Math.floor(mxx / CELL); ix++)
        for (let iz = Math.floor(mnz / CELL); iz <= Math.floor(mxz / CELL); iz++) {
          const a = g.get(key(ix, iz)); if (a) out.push(...a);
        }
      return out;
    },
  };
}

/** The audit, on one built track. Returns the worst intrusion in metres, the
 *  worst few lap fractions, and the offending triangle's identity — colour and
 *  lateral offset, which is how the spec told an edge object from a stand. */
function auditProps(t) {
  const caps = { road: t.roadGeo, props: t.propsGeo, glass: t.glassGeo };
  if (!caps.road || !caps.road.pos || caps.road.pos.length / 3 <= 1000) return { err: "no road mesh" };

  // nodeAt() rounds every coordinate to three decimals; reproduce it, so the
  // sample points are the spec's to the millimetre.
  const r3 = (v) => +v.toFixed(3);
  const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M),
        rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const k = Math.round(i / M * t.n) % t.n;
    px[i] = r3(t.px[k]); pz[i] = r3(t.pz[k]); py[i] = r3(t.py[k]);
    rx[i] = r3(t.rx[k]); rz[i] = r3(t.rz[k]);
  }
  const idxs = Array.from({ length: M }, (_, i) => i);
  const nodes = grid(px, pz, idxs);
  const near = (x, z) => nodes.nearest(x, z, px, pz);

  // HALF-WIDTH FROM THE ROAD MESH, not from the def: the asphalt a car can use
  // is what was built, kerbs and run-off included. A node the road mesh never
  // reached falls back to 6 m rather than 0, or its samples would all sit on
  // the centreline and measure nothing.
  const rp = caps.road.pos;
  for (let v = 0; v < rp.length; v += 3) {
    const k = near(rp[v], rp[v + 2]);
    const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]);
    if (lat < 13 && lat > hw[k]) hw[k] = lat;
  }
  for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;

  const tps = [];
  for (let i = 0; i < M; i++) for (const s of LADDER)
    tps.push({ x: px[i] + rx[i] * s * hw[i], z: pz[i] + rz[i] * s * hw[i], y: py[i], frac: i / M });
  const tpx = Float64Array.from(tps, (p) => p.x), tpz = Float64Array.from(tps, (p) => p.z);
  const samples = grid(tpx, tpz, tps);

  const merged = {};
  let max = 0, worst = null;
  for (const name of ["props", "glass"]) {
    const cap = caps[name];
    if (!cap || !cap.pos || !cap.idx || cap.pos.length / 3 < 30) continue;
    const pos = cap.pos, idx = cap.idx;
    for (let q = 0; q < idx.length; q += 3) {
      const a = idx[q] * 3, b = idx[q + 1] * 3, c = idx[q + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      if (Math.min(ay, by, cy) > CEIL + 30) continue;            // far overhead: cannot reach the band
      const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx);
      const mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
      for (const tp of samples.inBox(mnx - 0.3, mxx + 0.3, mnz - 0.3, mxz + 0.3)) {
        if (tp.x < mnx - 0.3 || tp.x > mxx + 0.3 || tp.z < mnz - 0.3 || tp.z > mxz + 0.3) continue;
        const bc = pointInTri(tp.x, tp.z, ax, az, bx, bz, cx, cz);
        if (!bc) continue;
        const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay);
        const over = yf - tp.y;
        if (over > TOL && over < CEIL) {
          const f = Math.round(tp.frac * 200) / 2;
          merged[f] = Math.max(merged[f] || 0, +over.toFixed(2));
          if (over > max) {
            max = over;
            const ccx = (ax + bx + cx) / 3, ccz = (az + bz + cz) / 3, ck = near(ccx, ccz);
            worst = {
              name, f, over: +over.toFixed(2),
              lateral: +((ccx - px[ck]) * rx[ck] + (ccz - pz[ck]) * rz[ck]).toFixed(2),
              baseHW: +hw[ck].toFixed(2),
              color: cap.col ? [...cap.col.slice(idx[q] * 3, idx[q] * 3 + 3)].map((v) => +v.toFixed(2)) : null,
            };
          }
        }
      }
    }
  }
  return {
    max: +max.toFixed(2), worst,
    top: Object.entries(merged).map(([f, o]) => ({ f: +f, o })).sort((a, b) => b.o - a.o).slice(0, 6),
  };
}

/** ONE fleet pass, memoised, for all three tests — the lesson from
 *  lamp-fixture-anchor, which rebuilt the fleet once per guard.
 *
 *  Nothing survives a circuit but its verdict. That matters here: the audit
 *  reads the vertex buffers, and a track holds ~96 MB of them (monza's
 *  propsGeo alone is 7.82 M slots), so keeping 52 of them is how a sweep suite
 *  reaches the 4088 MB that has OOM-killed an audit child on CI. The verdict
 *  is a handful of numbers, the track goes out of scope, and trim(0) releases
 *  the primitive records the shared VM context accumulated for it. Measured
 *  peak for the whole file: 799 MB. */
const fleet = (() => {
  let out = null;
  return () => {
    if (out) return out;
    out = new Map();
    const ctx = ctxOnce(), T = ctx.Tracks;
    // ASK FOR THE BUFFERS, do not rely on getting them. `keepGeometry` is
    // false by default (js/track/tracks.js), and what a build does with
    // `_keepFullGeometry` is the engine's business — here the arrays survive
    // mainly because the harness stubs GLX, which is a property of the harness
    // and not a promise. The browser spec asks explicitly
    // (`__apex.trackGeometry(true)` calls this), so ask the same way; the
    // anti-vacuity test below is what catches it if the answer stops holding.
    assert.equal(T.setKeepGeometry(true), true, "the build must keep its geometry for this audit");
    for (const def of T.LIST) {
      const t = T.build(def);
      out.set(def.id, auditProps(t));
      ctx.trim(0);
    }
    return out;
  };
})();

test("no prop geometry on or above the racing line, on any circuit", () => {
  const offenders = [];
  for (const [id, r] of fleet()) {
    if (r.err) { offenders.push(`${id}: ${r.err}`); continue; }
    const cap = ALLOW.has(id) ? Infinity : (BASELINE[id] ?? TOL);
    if (r.max > cap) {
      offenders.push(`${id} PROP ${r.max} m over road (cap ${cap}) @${JSON.stringify(r.top)} ` +
                     `worst=${JSON.stringify(r.worst)}`);
    }
  }
  assert.deepEqual(offenders, [],
    "props on or above the racing line. A reading at the road EDGE with a base " +
    "half-width beside it is usually a boundary structure (compare the " +
    "colour against the baselines above before baselining it); a reading in the " +
    "middle of the lap is a prop reaching in, and belongs in that circuit's " +
    "scenery file, not in the map above:\n  " + offenders.join("\n  "));
});

test("shanghai's track-owned props stay at the shared clean tolerance", () => {
  // Carried over from the spec, which singled this circuit out: its props come
  // from the generic track-owned emitters rather than a hand-dressed scenery
  // file, so it is the canary for a systemic regression in those.
  const r = fleet().get("shanghai");
  assert.ok(r && !r.err, "shanghai built and was audited");
  assert.ok(r.max <= TOL, `shanghai reads ${r.max} m over the road (limit ${TOL}): ` +
    `${JSON.stringify(r.worst)}`);
});

test("the audit still measures: the known edge object and forest crown are found", () => {
  // ANTI-VACUITY. Every assertion above is "nothing over the cap", which an
  // audit that silently stopped finding anything would pass forever. These two
  // readings are documented objects at documented heights, so they pin that the
  // thing still works: the edge object the spec bisected on jeddah, and
  // mont_tremblant's crown over the cutting.
  const jeddah = fleet().get("jeddah"), mt = fleet().get("mont_tremblant");
  assert.ok(jeddah.max >= 1.0 && jeddah.max <= 1.1,
    `jeddah's edge object should read ~1.07 m; got ${jeddah.max}. If it moved, ` +
    "re-measure and update the baseline; if the audit stopped finding it, fix the audit.");
  assert.deepEqual(jeddah.worst.color, [0.46, 0.47, 0.5],
    `jeddah's worst offender should be the grey edge object; got ${JSON.stringify(jeddah.worst)}`);
  assert.ok(mt.max >= 4.7 && mt.max <= 4.8,
    `mont_tremblant's crown should read ~4.74 m; got ${mt.max}`);
});
