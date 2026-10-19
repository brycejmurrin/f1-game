// Per-component joint numbers for each preview part: gap = shortest axis-ray distance from the
// component's vertices to the rest of the car (or to its sibling components), buried = share of
// its vertices inside the rest (odd +x/-x/+y ray parity, all three agree).
// Usage: node fit-joints.mjs <id> [team|all]
import { builds, split, ray, bbox, TEAMS } from "./fit-probe.mjs";
const [id, tArg = "mclaren"] = process.argv.slice(2);
const teams = tArg === "all" ? TEAMS : [tArg];
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function comps(part) {                     // connected components by shared vertex position
  const key = (i) => `${part[i].toFixed(4)},${part[i+1].toFixed(4)},${part[i+2].toFixed(4)}`;
  const par = new Map(); const f = (k) => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; };
  const add = (k) => { if (!par.has(k)) par.set(k, k); };
  for (let i = 0; i < part.length; i += 9) { const ks = [key(i), key(i+3), key(i+6)]; ks.forEach(add);
    par.set(f(ks[1]), f(ks[0])); par.set(f(ks[2]), f(ks[0])); }
  const g = new Map();
  for (let i = 0; i < part.length; i += 9) { const r = f(key(i)); if (!g.has(r)) g.set(r, []); g.get(r).push(...part.slice(i, i + 9)); }
  return [...g.values()].map((a) => Float32Array.from(a));
}
const hits = (tris, o, d) => { let n = 0, oo = o; for (let k = 0; k < 40; k++) { const t = ray(tris, oo, d, 9); if (t == null) break; n++; oo = [oo[0]+d[0]*(t+1e-4), oo[1]+d[1]*(t+1e-4), oo[2]+d[2]*(t+1e-4)]; } return n; };
function gap(c, other) { let g = 9;
  for (let i = 0; i < c.length; i += 3) for (const d of DIRS) { const t = ray(other, [c[i], c[i+1], c[i+2]], d, g); if (t != null && t < g) g = t; }
  return g; }
function touches(a, b) {                  // any edge of a crosses a face of b (contact or penetration)
  for (let i = 0; i < a.length; i += 9) for (const [p, q] of [[0,3],[3,6],[6,0]]) {
    const o = [a[i+p], a[i+p+1], a[i+p+2]], d = [a[i+q]-o[0], a[i+q+1]-o[1], a[i+q+2]-o[2]];
    const L = Math.hypot(...d); if (L < 1e-9) continue;
    const t = ray(b, o, d.map((v) => v / L), L + 0.002); if (t != null) return true; }
  return false; }
function buried(c, rest) { let n = 0, m = 0; const seen = new Set();
  for (let i = 0; i < c.length; i += 3) { const k = `${c[i].toFixed(3)},${c[i+1].toFixed(3)},${c[i+2].toFixed(3)}`; if (seen.has(k)) continue; seen.add(k); m++;
    const o = [c[i], c[i+1], c[i+2]]; if ([[1,0,0],[-1,0,0],[0,1,0]].every((d) => hits(rest, o, d) % 2)) n++; }
  return n / m; }
for (const tm of teams) {
  const { on, off } = builds(tm, id); const { part, rest } = split(on, off);
  const cs = comps(part);
  console.log(`== ${id} ${tm}: ${cs.length} components, ${part.length / 9} tris`);
  cs.forEach((c, i) => {
    const others = Float32Array.from(cs.filter((_, j) => j !== i).flatMap((x) => [...x]));
    const b = bbox(c);
    console.log(`  #${i} lo ${b.lo} hi ${b.hi}  rest ${touches(c, rest) || touches(rest, c) ? "JOIN" : "gap " + gap(c, rest).toFixed(3)}  part ${!others.length ? "-" : touches(c, others) || touches(others, c) ? "JOIN" : "gap " + gap(c, others).toFixed(3)}  buried ${(buried(c, rest) * 100).toFixed(0)}%`);
  });
}
if (process.env.BURIED) {
  const { on, off } = builds(teams[0], id); const { part, rest } = split(on, off);
  const c = comps(part)[+process.env.BURIED]; const seen = new Set();
  for (let i = 0; i < c.length; i += 3) { const o = [c[i], c[i+1], c[i+2]]; const k = o.map((v) => v.toFixed(3)).join(","); if (seen.has(k)) continue; seen.add(k);
    if ([[1,0,0],[-1,0,0],[0,1,0]].every((d) => hits(rest, o, d) % 2)) console.log("buried", k); }
}
