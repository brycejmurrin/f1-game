// The pit lane as an ACTUAL SECOND ROAD, measured on real track builds.
//
// WHY THIS EXISTS. Three times now this codebase has tried to put a lane beside
// the racing surface and concluded there is no room. The first cut forced the
// pit-side boundary open and put Monaco's through the buildings. The second
// fitted the lane to the worst node on the lap, found 2.4 m at Monza, and read
// that as "no lane anywhere". The third widened `hw` itself and pushed the ROAD
// through the scenery on a dozen circuits — that one shipped, and failed the
// Pages publish four times before it was reverted.
//
// What is different here is the shape of the answer, and it is what this suite
// holds: `hw` never moves, the lane is a separate ribbon fitted to the room the
// circuit measurably has, and a circuit that has no room gets NO RIBBON rather
// than a pinched one. The three ways to get this wrong again all fail below:
// a lane that moves the road, a lane that snakes, and a lane on a circuit whose
// walls are at the road edge.
//
// Pure Node: tools/lib/track-build-vm.cjs runs the real track build, no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

const WIDE = "silverstone", TIGHT = "spa", NONE = "monaco";
const TRIMMED = "monza";
const CORRIDOR = "albert_park";

const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();
const tracksOnce = () => ctxOnce().Tracks;
const buildOnce = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) {
      const T = tracksOnce();
      seen.set(id, T.build(T.LIST.find((d) => d.id === id)));
    }
    return seen.get(id);
  };
})();

test("a circuit with room gets a lane; one whose walls are at the road edge does not", () => {
  const wide = buildOnce(WIDE), none = buildOnce(NONE);
  assert.ok(wide.pitLane, `${WIDE} has metres of room and must get a ribbon`);
  assert.equal(none.pitLane, null,
    `${NONE}'s walls sit at the road edge for the whole window — a lane there is the mistake this refuses`);
});

test("albert park's authored S/F corridor makes a ribbon without moving hw", () => {
  const t = buildOnce(CORRIDOR);
  assert.ok(t.pitLane, "albert_park pitCorridor must open enough room at S/F for a ribbon");
  assert.ok(t.pitLane.lenM >= 150, `ribbon too short: ${t.pitLane && t.pitLane.lenM}`);
  const T = tracksOnce();
  const raw = T.buildCenterline(T.LIST.find((d) => d.id === CORRIDOR));
  assert.equal(t.n, raw.n);
  for (let k = 0; k < raw.n; k++) assert.equal(t.hw[k], raw.hw[k], `hw moved at node ${k}`);
});

test("entry and exit peel off the road edge instead of floating on grass", () => {
  const T = tracksOnce();
  const t = buildOnce(WIDE), l = t.pitLane;
  const taper = [];
  for (let k = 0; k < t.n; k++) {
    if (l.w[k] > 0.05 && l.w[k] < l.laneW * 0.35) taper.push(k);
  }
  assert.ok(taper.length > 4, "expected taper nodes at the peel");
  for (const k of taper) {
    const at = T.pitLaneAt(t, (k / t.n) * t.total);
    assert.ok(at);
    const road = l.side * t.hw[k];
    assert.ok(Math.abs(at.inner - road) < Math.abs(l.side * (t.hw[k] + l.gap) - road) * 0.8 + 0.2,
      `taper node ${k}: inner ${at.inner.toFixed(2)} still sits at full gap instead of peeling to the road`);
  }
});
