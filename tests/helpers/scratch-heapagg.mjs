// SCRATCH (never merged, #5288): who retains Float64Arrays and big internal arrays in a heap snapshot.
export async function heapRetainers(cdp, top = 20) {
  const chunks = []; const on = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  const snap = JSON.parse(chunks.join("")); chunks.length = 0;
  const m = snap.snapshot.meta, nf = m.node_fields, NF = nf.length, ef = m.edge_fields, EF = ef.length;
  const ntypes = m.node_types[0], etypes = m.edge_types[0];
  const iT = nf.indexOf("type"), iN = nf.indexOf("name"), iS = nf.indexOf("self_size"), iE = nf.indexOf("edge_count");
  const eT = ef.indexOf("type"), eN = ef.indexOf("name_or_index"), eTo = ef.indexOf("to_node");
  const { nodes, edges, strings } = snap;
  const nm = (i) => { const t = ntypes[nodes[i + iT]]; return t === "object" || t === "native" || t === "closure" ? String(strings[nodes[i + iN]]).slice(0, 50) : t; };
  const agg = { f64: new Map(), arr: new Map() };
  let e = 0;
  for (let i = 0; i < nodes.length; i += NF) {
    const ec = nodes[i + iE], from = nm(i);
    for (let k = 0; k < ec; k++, e += EF) {
      const to = edges[e + eTo], et = etypes[edges[e + eT]];
      if (et === "weak" || et === "shortcut") continue;
      const tn = nm(to), sz = nodes[to + iS];
      const bucket = tn === "Float64Array" ? agg.f64 : (tn === "array" && sz > 4096 ? agg.arr : null);
      if (!bucket) continue;
      const en = et === "element" || et === "hidden" ? "[" + et + "]" : String(strings[edges[e + eN]]).slice(0, 30);
      const key = from + "." + en;
      const a = bucket.get(key) || bucket.set(key, { n: 0, b: 0 }).get(key); a.n++; a.b += sz;
    }
  }
  const fmt = (mp) => [...mp].sort((a, b) => b[1].b - a[1].b || b[1].n - a[1].n).slice(0, top).map(([k, v]) => [k, v.n, +(v.b / 1048576).toFixed(2)]);
  return { f64: fmt(agg.f64), arr: fmt(agg.arr) };
}
