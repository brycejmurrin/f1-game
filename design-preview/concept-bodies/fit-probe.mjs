// Fit probe (round 3): ray-cast a build and list each part section's skin crossings, so a join is
// a pair of numbers (gap > 0 floats, overlap = seated). ROUND=1 for the rounded build.
// node -e 'import("./design-preview/concept-bodies/fit-probe.mjs").then(({build,cast})=>console.log(cast(build("highnose"),"y",0.06,2.45)))'
import fs from "node:fs";
const _rf = fs.readFileSync;
fs.readFileSync = function (f, ...r) { const o = _rf.call(fs, f, ...r); return String(f).endsWith("car3d.js") && typeof o === "string" ? o.replace("return { name: sec.name, vertices", "return { name: sec.name, from: sec.from, to: sec.to, vertices") : o; };
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const shade = !!process.env.ROUND;
const { Car3D, Parts, Teams } = loadParts(shade ? { shade: true } : undefined);
export function build(id, teamId = "mclaren") {
  const t = Teams.LIST.find((x) => x.id === teamId);
  const T = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
  return Car3D.buildComplete(t.color, t.color2, { livery: { c1: t.color, c2: t.color2, bodyStyle: id }, teamId: t.id, num: 4, parts: T, measure: true });
}
// axis: 'y' ray along y at (x,z); 'z' along z at (x,y); 'x' along x at (y,z)
export function cast(d, axis, a, b) {
  const P = d.pos, I = d.idx; const ax = { x: 0, y: 1, z: 2 }[axis];
  const [ia, ib] = { x: [1, 2], y: [0, 2], z: [0, 1] }[axis];
  const secOf = (v) => (d.parts.find((s) => v >= s.from && v < s.to) || {}).name;
  const hits = [];
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    const p = v.map((k) => [P[k * 3 + ia], P[k * 3 + ib], P[k * 3 + ax]]);
    const den = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    if (Math.abs(den) < 1e-12) continue;
    const l0 = ((p[1][1] - p[2][1]) * (a - p[2][0]) + (p[2][0] - p[1][0]) * (b - p[2][1])) / den;
    const l1 = ((p[2][1] - p[0][1]) * (a - p[2][0]) + (p[0][0] - p[2][0]) * (b - p[2][1])) / den;
    const l2 = 1 - l0 - l1; if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    hits.push({ s: secOf(v[0]), h: l0 * p[0][2] + l1 * p[1][2] + l2 * p[2][2] });
  }
  const by = {}; for (const h of hits) (by[h.s] ||= []).push(+h.h.toFixed(4));
  for (const k in by) by[k] = [...new Set(by[k].sort((x, y) => x - y))];
  return by;
}
