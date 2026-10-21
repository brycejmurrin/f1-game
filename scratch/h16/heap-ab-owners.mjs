// Who holds the ArrayBuffer bytes? For each JSArrayBufferData node walk retainers: data <- ArrayBuffer <- typed array <- owner (edge name) <- owner2.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(process.argv[2], "utf8")), M = s.snapshot.meta;
const NF = M.node_fields.length, EF = M.edge_fields.length, nt = M.node_types[0], et = M.edge_types[0];
const iT = M.node_fields.indexOf("type"), iN = M.node_fields.indexOf("name"), iS = M.node_fields.indexOf("self_size"), iE = M.node_fields.indexOf("edge_count");
const eT = M.edge_fields.indexOf("type"), eN = M.edge_fields.indexOf("name_or_index"), eTo = M.edge_fields.indexOf("to_node");
const N = s.nodes.length / NF, firstEdge = new Uint32Array(N + 1);
for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += s.nodes[i * NF + iE] * EF; } firstEdge[N] = s.edges.length;
const rev = Array.from({ length: N }, () => []);
for (let i = 0; i < N; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
  const t = et[s.edges[e + eT]]; if (t === "weak" || t === "shortcut") continue;
  rev[s.edges[e + eTo] / NF].push([i, t === "element" || t === "hidden" ? "[" + s.edges[e + eN] + "]" : s.strings[s.edges[e + eN]]]); }
const name = (i) => nt[s.nodes[i * NF + iT]] + ":" + s.strings[s.nodes[i * NF + iN]].slice(0, 40);
const agg = new Map();
for (let i = 0; i < N; i++) {
  if (s.strings[s.nodes[i * NF + iN]] !== "system / JSArrayBufferData") continue;
  const sz = s.nodes[i * NF + iS]; if (sz < 4096) continue;
  // up: data <- ArrayBuffer <- TypedArray(s) <- owner
  let path = [], cur = i;
  const seen = new Set([i]); for (let d = 0; d < 7 && path.length < 4; d++) { const r = rev[cur].filter(([p]) => !seen.has(p) && !/\(GC roots\)/.test(s.strings[s.nodes[p * NF + iN]])); if (!r.length) break; const [p, en] = r.find(([q]) => name(q) !== name(cur)) || r[0]; seen.add(p); if (name(p) !== name(cur)) path.push(en + "<" + name(p)); cur = p; }
  const k = path.slice(1).join(" | ");
  const e = agg.get(k) || [0, 0]; e[0] += sz; e[1]++; agg.set(k, e);
}
for (const [k, [b, n]] of [...agg].sort((a, b) => b[1][0] - a[1][0]).slice(0, +(process.argv[3] || 20))) console.log((b / 1048576).toFixed(1).padStart(6), "MB", String(n).padStart(5), "x ", k.slice(0, 230));
