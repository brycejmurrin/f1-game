// kerb-berm-surface — designer kerb styles (flat/sausage/rumble) change the
// kerb ribbon height profile, and def.berms raises the outer terrain on a
// banked corner. Shipped circuits without those fields stay on engine defaults.
//
// Run: node --test tests/unit/kerb-berm-surface.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bootEditor, design, ellipse } from "../helpers/editor-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

let Tracks = null;
const engine = () => { Tracks = Tracks || buildContext(null, { quiet: true }); return Tracks; };

/** Build a shipped circuit with optional def overrides (kerbStyle / berms). */
function buildShip(id, extra) {
  const T = engine();
  const base = T.LIST.find((d) => d.id === id);
  assert.ok(base, id);
  const def = Object.assign({}, base, extra || {});
  return { def, track: T.build(def), Surface: T._vmContext.TrackSurface };
}

/** Kerb ribbon ring stats from palette-matched verts (pairs = one ring). */
function kerbRingStats(track, def) {
  const g = track.roadGeo, pal = def.palette;
  const ka = pal.kerbA, kb = pal.kerbB;
  const near = (i, c) => {
    const r = g.col[i * 3], gg = g.col[i * 3 + 1], b = g.col[i * 3 + 2];
    return Math.abs(r - c[0]) < 1e-3 && Math.abs(gg - c[1]) < 1e-3 && Math.abs(b - c[2]) < 1e-3;
  };
  const isKerb = (i) => near(i, ka) || near(i, kb);
  // buildKerbs emits rings as consecutive vert pairs; collect |ΔY| across rails
  // and along successive rings (skipping coincident stripe-boundary dups).
  let railSum = 0, railN = 0, alongSum = 0, alongN = 0, meanY = 0, n = 0;
  let prevMid = null;
  for (let i = 0; i + 1 < g.pos.length / 3; i++) {
    if (!isKerb(i) || !isKerb(i + 1)) continue;
    // A ring is two verts; skip if they are not a left/right pair (same colour stripe).
    const y0 = g.pos[i * 3 + 1], y1 = g.pos[(i + 1) * 3 + 1];
    const mid = 0.5 * (y0 + y1);
    railSum += Math.abs(y0 - y1); railN++;
    meanY += mid; n++;
    if (prevMid != null) {
      const d = Math.abs(mid - prevMid);
      // Coincident stripe-boundary copies share a position (d ≈ 0); skip those.
      if (d > 1e-5) { alongSum += d; alongN++; }
    }
    prevMid = mid;
    i++; // consume the pair
  }
  assert.ok(n > 100, "expected kerb rings, got " + n);
  return { meanY: meanY / n, railDelta: railSum / railN, alongDelta: alongN ? alongSum / alongN : 0, n };
}

test("kerbStyle sausage rises higher than flat; rumble varies along the ribbon", () => {
  const f = buildShip("monza", { kerbStyle: "flat" });
  const s = buildShip("monza", { kerbStyle: "sausage" });
  const r = buildShip("monza", { kerbStyle: "rumble" });
  const sf = kerbRingStats(f.track, f.def);
  const ss = kerbRingStats(s.track, s.def);
  const sr = kerbRingStats(r.track, r.def);
  assert.ok(ss.meanY > sf.meanY + 0.003, `sausage mean ${ss.meanY.toFixed(4)} > flat ${sf.meanY.toFixed(4)}`);
  // Sausage crowns the outer rail — larger |ΔY| across the two rails.
  assert.ok(ss.railDelta > sf.railDelta + 0.005, `sausage rail Δ ${ss.railDelta.toFixed(4)} > flat ${sf.railDelta.toFixed(4)}`);
  // Rumble corrugates along the lap — larger mean |ΔY| between successive rings.
  assert.ok(sr.alongDelta > sf.alongDelta + 0.01, `rumble along Δ ${sr.alongDelta.toFixed(4)} > flat ${sf.alongDelta.toFixed(4)}`);
});

test("berms:true lifts outer terrain on a banked node; berms:false does not", () => {
  // Custom banked loop through the designer codec path (toRaw → fromRaw).
  const { Tracks: T, C } = bootEditor();
  const mk = (berms) => {
    const it = C.sanitize(design({
      pts: ellipse(48, 700, 450),
      bankZones: [{ frac: 0.25, angleDeg: 18, widthM: 160 }],
      berms,
      kerbStyle: "flat",
    }));
    const def = T._vmContext.TrackDef.fromRaw(C.toRaw(it));
    void def.points;
    const track = T.build(def);
    return { def, track, Surface: T._vmContext.TrackSurface };
  };
  const on = mk(true);
  const off = mk(false);
  assert.equal(on.def.berms, true);
  assert.equal(off.def.berms, false);
  const bp = on.track.bankP;
  assert.ok(bp, "bank profile present");
  let kBank = -1;
  for (let k = 0; k < on.track.n; k++) if (bp.lift[k] > 1) { kBank = k; break; }
  assert.ok(kBank >= 0, "a banked node exists");
  const outer = bp.bsign[kBank];
  assert.ok(outer === 1 || outer === -1, "outer side signed");
  const pOn = on.Surface.profile(on.def, on.track);
  const pOff = off.Surface.profile(off.def, off.track);
  const yOn = pOn.heightAt(kBank, 8, outer);
  const yOff = pOff.heightAt(kBank, 8, outer);
  const yIn = pOn.heightAt(kBank, 8, -outer);
  assert.ok(yOn > yOff + 0.3, `outer berm ${yOn.toFixed(2)} > off ${yOff.toFixed(2)}`);
  assert.ok(yOn > yIn + 0.2, `outer berm ${yOn.toFixed(2)} > inner ${yIn.toFixed(2)}`);
});

test("shipped circuit without kerbStyle/berms still builds (defaults)", () => {
  const { def, track } = buildShip("monza");
  assert.equal(def.kerbStyle, undefined);
  assert.equal(def.berms, undefined);
  assert.ok(track.roadGeo && track.roadGeo.pos.length > 1000);
});
