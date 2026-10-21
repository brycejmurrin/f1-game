// Aggregate a .heapsnapshot by node type+name (self size), and diff two: node scratch/h16/heap-diff.mjs A.heapsnapshot B.heapsnapshot [top]
import { readFileSync } from "node:fs";
function agg(path) {
  const s = JSON.parse(readFileSync(path, "utf8"));
  const f = s.snapshot.meta.node_fields, types = s.snapshot.meta.node_types[0], N = f.length;
  const iT = f.indexOf("type"), iN = f.indexOf("name"), iS = f.indexOf("self_size");
  const m = new Map(); let total = 0;
  for (let i = 0; i < s.nodes.length; i += N) {
    const t = types[s.nodes[i + iT]]; let n = s.strings[s.nodes[i + iN]];
    if (t === "string" || t === "concatenated string" || t === "sliced string") n = "(string)";
    else if (t === "code") n = "(code)";
    else if (n.length > 60) n = n.slice(0, 60);
    const k = t + ":" + n, sz = s.nodes[i + iS]; total += sz;
    const e = m.get(k) || [0, 0]; e[0] += sz; e[1]++; m.set(k, e);
  }
  return { m, total };
}
const [a, b, top = 25] = process.argv.slice(2);
const A = agg(a), B = agg(b);
console.log(`A ${(A.total / 1048576).toFixed(1)} MB  B ${(B.total / 1048576).toFixed(1)} MB  (self sizes)`);
const keys = new Set([...A.m.keys(), ...B.m.keys()]);
const d = [...keys].map((k) => { const x = A.m.get(k) || [0, 0], y = B.m.get(k) || [0, 0]; return [k, y[0] - x[0], y[1] - x[1], y[0]]; });
d.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
for (const [k, ds, dn, bs] of d.slice(0, +top)) console.log(`${(ds / 1024).toFixed(0).padStart(8)} KB  ${String(dn).padStart(7)} n  B=${(bs / 1024).toFixed(0)}KB  ${k}`);
