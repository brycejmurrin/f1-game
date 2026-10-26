// Suzuka Circuit Wheel must own the Casio / S/F Motopia skyline (#3366).
// Day orbit surveys showed pits/trees/stands but no readable Ferris disc when
// the wheel sat at 38 m radius / 62 m out behind a dense Motopia forest edge
// and a mid-lap orange flex stand at gap 8 occluded orbit @ 0.50.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

function blockYRange(track, id) {
  const geo = track.propsGeo;
  const b = (geo.__blocks || []).find((x) => x.id === id);
  if (!b) return null;
  const pos = geo.pos;
  let ymin = Infinity, ymax = -Infinity;
  let cx = 0, cz = 0;
  for (let i = 0; i < b.count; i++) {
    const i3 = (b.base + i) * 3;
    const y = pos[i3 + 1];
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
    cx += pos[i3];
    cz += pos[i3 + 2];
  }
  return { ymin, ymax, h: ymax - ymin, cx: cx / b.count, cz: cz / b.count };
}

test("suzuka-circuit-wheel owns Motopia skyline and clears orbit @ 0.50", () => {
  const body = fs.readFileSync(path.resolve("js/circuits/scenery/suzuka.js"), "utf8");
  const rec = JSON.parse(fs.readFileSync("tests/data/landmarks/suzuka.json", "utf8"));
  const gapM = body.match(/stand\(\s*0\.50\s*,\s*1\s*,\s*(\d+(?:\.\d+)?)\s*,/);
  const Tracks = buildContext(null, { quiet: true });
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === "suzuka"));
  const md = track.modelDiagnostics;
  const wheelMeta = md.emitted.find((e) => e.id === "suzuka-circuit-wheel");
  const wheel = blockYRange(track, "suzuka-circuit-wheel");
  const n = track.n;
  const roadY = track.py[Math.round(0.015 * n) % n];
  let minDist = Infinity;
  for (const f of [0.015, 0.94, 0.00]) {
    const k = Math.round(f * n) % n;
    minDist = Math.min(minDist, Math.hypot(wheel.cx - track.px[k], wheel.cz - track.pz[k]));
  }
  const hard = []
    .concat(md.invalid, md.unsafe, md.suppressed)
    .filter((d) => d.id === "suzuka-circuit-wheel");

  // One compound pin: registration + emit + skyline geometry + mid-lap camera gap.
  assert.equal(
    [
      /modelGroup\("suzuka-circuit-wheel"[\s\S]{0,2200}\{\s*required:\s*true\s*\}\s*\)/.test(body),
      rec.ids.includes("suzuka-circuit-wheel"),
      !!wheelMeta && wheelMeta.required === true && hard.length === 0,
      !!wheel && wheel.h >= 95 && minDist >= 70 && (wheel.ymax - roadY) >= 85,
      !!gapM && Number(gapM[1]) >= 18,
    ].every(Boolean),
    true,
    `wheel landmark/skyline/orbit-gap contract failed (h=${wheel && wheel.h.toFixed(1)}, dist=${minDist.toFixed(1)}, tip=${wheel && (wheel.ymax - roadY).toFixed(1)}, gap=${gapM && gapM[1]}, hard=${hard.length})`,
  );
});
