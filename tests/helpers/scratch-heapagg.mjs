// SCRATCH (never merged, #5288): the shortest GC-root path to the pine facet grid (a Float64Array held by `facets`).
export async function facetPath(cdp) {
  const chunks = []; const on = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  const snap = JSON.parse(chunks.join("")); chunks.length = 0;
  const m = snap.snapshot.meta, nf = m.node_fields, NF = nf.length, ef = m.edge_fields, EF = ef.length;
  const ntypes = m.node_types[0], etypes = m.edge_types[0];
  const iT = nf.indexOf("type"), iN = nf.indexOf("name"), iE = nf.indexOf("edge_count");
  const eT = ef.indexOf("type"), eN = ef.indexOf("name_or_index"), eTo = ef.indexOf("to_node");
  const { nodes, edges, strings } = snap;
  const N = nodes.length / NF, first = new Uint32Array(N + 1);
  for (let i = 0, e = 0; i < N; i++) { first[i] = e; e += nodes[i * NF + iE] * EF; }
  first[N] = edges.length;
  const nm = (o) => { const t = ntypes[nodes[o * NF + iT]]; return t === "object" || t === "native" || t === "closure" || t === "code" || t === "hidden" ? t + ":" + String(strings[nodes[o * NF + iN]]).slice(0, 60) : t; };
  const ename = (e) => { const t = etypes[edges[e + eT]]; return t === "element" || t === "hidden" ? `[${edges[e + eN]}]` : String(strings[edges[e + eN]]).slice(0, 40); };
  // BFS from the root over strong edges; stop at the first Float64Array reached through an edge named `facets`.
  const parent = new Int32Array(N).fill(-1), pedge = new Int32Array(N).fill(-1);
  const q = new Int32Array(N); let h = 0, t = 0; q[t++] = 0; parent[0] = 0;
  let hit = -1;
  while (h < t && hit < 0) {
    const o = q[h++];
    for (let e = first[o]; e < first[o + 1]; e += EF) {
      const et = etypes[edges[e + eT]]; if (et === "weak" || et === "shortcut") continue;
      const to = edges[e + eTo] / NF;
      // The owner {x, z, reach, facets} is the hit, whether or not its array was reached first by another edge.
      if (et === "property" && strings[edges[e + eN]] === "facets" && nm(to) === "Float64Array") { hit = o; break; }
      if (parent[to] >= 0) continue;
      parent[to] = o; pedge[to] = e; q[t++] = to;
    }
  }
  if (hit < 0) return { found: false };
  const path = []; for (let o = hit; o !== 0 && path.length < 40; o = parent[o]) path.push(nm(parent[o]) + " ." + ename(pedge[o]));
  return { found: true, path: path.reverse() };
}
