// B·D3 fit probe: isolate each preview part's triangles (prefix/suffix diff vs
// its field-off build) and raycast from its contact points into the rest of the car.
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const M = loadParts();
const PREVIEW = { spoon_wing: ["aero", "low", "rwSpoon"], beam_twin: ["aero", "high", "beam2"],
  monkey_seat: ["aero", "extreme", "monkey"], bridge_wing: ["aero", "medium", "fwBridge"],
  x_wings: ["aero", "rake_setup", "xwing"], double_diffuser: ["floor", "gurney_edge", "ddiff"] };
export function builds(teamId, id) {
  const team = M.Teams.LIST.find((t) => t.id === teamId);
  const [cat, , field] = PREVIEW[id];
  const on = M.Parts.getVisualTiers({ ...M.Parts.DEFAULTS, [cat]: id }, team);
  const off = { ...on, _visual: { ...on._visual, [cat]: { ...on._visual[cat], [field]: 0 } } };
  const b = (p) => M.Car3D.build(team.color, team.color2, { teamId: team.id, num: 4, parts: p });
  return { on: b(on), off: b(off) };
}
export function split(on, off) {           // indexed mesh: the vertex block `on` inserts, as triangle soups
  const A = on.pos, B = off.pos; let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const v0 = Math.floor(p / 3), v1 = Math.ceil((A.length - s) / 3);
  const part = [], rest = [];
  for (let i = 0; i < on.idx.length; i += 3) {
    const tri = [on.idx[i], on.idx[i+1], on.idx[i+2]];
    const dst = tri.every((v) => v >= v0 && v < v1) ? part : rest;
    for (const v of tri) dst.push(A[v*3], A[v*3+1], A[v*3+2]);
  }
  return { part: Float32Array.from(part), rest: Float32Array.from(rest) };
}
export function ray(tris, o, d, maxT = 5) {    // nearest hit t (Moller-Trumbore), or null
  let best = null;
  for (let i = 0; i < tris.length; i += 9) {
    const e1 = [tris[i+3]-tris[i], tris[i+4]-tris[i+1], tris[i+5]-tris[i+2]];
    const e2 = [tris[i+6]-tris[i], tris[i+7]-tris[i+1], tris[i+8]-tris[i+2]];
    const h = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
    const a = e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2]; if (Math.abs(a) < 1e-12) continue;
    const f = 1/a, sv = [o[0]-tris[i], o[1]-tris[i+1], o[2]-tris[i+2]];
    const u = f*(sv[0]*h[0]+sv[1]*h[1]+sv[2]*h[2]); if (u < 0 || u > 1) continue;
    const q = [sv[1]*e1[2]-sv[2]*e1[1], sv[2]*e1[0]-sv[0]*e1[2], sv[0]*e1[1]-sv[1]*e1[0]];
    const v = f*(d[0]*q[0]+d[1]*q[1]+d[2]*q[2]); if (v < 0 || u + v > 1) continue;
    const t = f*(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2]);
    if (t > 1e-6 && t < maxT && (best == null || t < best)) best = t;
  }
  return best;
}
export const bbox = (t) => { const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], t[i+k]); hi[k] = Math.max(hi[k], t[i+k]); }
  return { lo: lo.map((v) => +v.toFixed(3)), hi: hi.map((v) => +v.toFixed(3)) }; };
export const TEAMS = M.Teams.LIST.map((t) => t.id);
export { M };
