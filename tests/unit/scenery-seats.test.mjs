// @doc Scenery seats (#5111): qatar verges trimmed not dropped, crowds kept out from under another road section, props seated on the drawn ground.
// scenery-seats.test.mjs — four engine defects from hunt lane G (2026-11-04),
// each measured in this VM on the base and failing there:
//   #5080 qatar: 53 of 620 green verges dropped whole by modelGroup's mid-box
//         road test, though 45 never touch the tarmac (now trimmed per cell).
//   #5086 a crowd standing on a tread rejBox passed as "below the road" came
//         0.1-0.3 m under ANOTHER section's asphalt (estoril 12, shanghai 8).
//   #5088 props seated from the road frame float or sink on slopes (cota
//         motorhome posts 2.1 / 6.2 m under, shanghai's shed buried, sochi's
//         plaza strips 0.7-1.1 m under at their ends).
//   #5084 jeddah: 37 street-barrier panels on 1.7-2.3 m of air beside the
//         raised road platform (now skirted to the ground).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../../tools/lib/track-build-vm.cjs");
const { seatProbe } = require("../helpers/scenery-seat-probe.cjs");
let env = null;
const ctx = () => (env || (env = H.buildContext({})));
const def = (id) => ctx().Tracks.LIST.find((d) => d.id === id);

test("qatar's green verges near a kerb are trimmed, not dropped whole (#5080)", () => {
  const e = ctx(), m0 = e.mark(), t = e.Tracks.build(def("qatar"));
  try {
    const verge = t.modelDiagnostics.suppressed.filter((s) => /^qatar-green-verge-/.test(s.id));
    assert.ok(verge.length <= 8, `${verge.length} qatar verges suppressed (53 on the base; 8 overlap the tarmac): ` +
      verge.map((s) => `${s.id} ${s.reason}`).join(", "));
    // The pit complex still drops a patch whole.
    assert.ok(t.modelDiagnostics.suppressed.some((s) => /superseded by the pit complex/.test(s.reason)),
      "qatar's sand aprons are still superseded by the pit complex");
  } finally { e.trim(m0); e.release(t); }
});

test("no crowd body stands flush under another road section (#5086)", () => {
  const e = ctx(), bad = [];
  for (const id of ["estoril", "shanghai"]) {
    const m0 = e.mark(), t = e.Tracks.build(def(id));
    try {
      for (const p of H.shipped(e.prims.slice(m0), e.liveBufs)) {
        if (p.buf !== t.propsGeo) continue;
        const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
        for (let k = 0; k < t.n; k++) {
          const dx = cx - t.px[k], dz = cz - t.pz[k];
          if (dx * dx + dz * dz > 900) continue;
          const lat = dx * t.rx[k] + dz * t.rz[k], al = dx * t.tx[k] + dz * t.tz[k];
          if (Math.abs(lat) > t.hw[k] || Math.abs(al) > t.total / t.n / 2 + 0.01) continue;
          const top = p.maxY - (t.py[k] + t.ry[k] * lat);
          if (top >= -0.3 && top <= 0.2) bad.push(`${id} frac ${(k / t.n).toFixed(3)} lat ${lat.toFixed(1)} top ${top.toFixed(2)}`);
          break;
        }
      }
    } finally { e.trim(m0); e.release(t); }
  }
  assert.deepEqual(bad, [], `props tops within 0.3 m under the road (estoril 12, shanghai 8 on the base): ${bad.join("; ")}`);
});

test("props near the road are seated on the drawn ground, not the road frame (#5088, #5084)", () => {
  const e = ctx();
  for (const id of ["cota", "shanghai", "sochi"]) {
    const r = seatProbe(e, id);
    assert.equal(r.sunkNear, 0, `${id}: ${r.sunkNear} props buried within 40 m of the road ` +
      `(base: cota 2, shanghai 1, sochi 5): ${JSON.stringify(r.sunks)}`);
  }
  // Jeddah's street panels (boxes): skirted to the ground. Its tree trunks are
  // a separate, pre-existing 0.5-0.8 m case (cylinders) and not this rule's.
  const j = seatProbe(e, "jeddah");
  const panels = j.floats.filter((f) => f.name === "addBox");
  assert.deepEqual(panels, [], `jeddah: ${panels.length} boxes float near the road (37 panels on the base)`);
});
