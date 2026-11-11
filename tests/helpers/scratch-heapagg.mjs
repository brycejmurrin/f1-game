// Aggregate a CDP heap snapshot by (type, constructor name): self bytes and count. Scratch only.
export async function heapByCtor(cdp, top = 30) {
  const chunks = [];
  const on = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  const snap = JSON.parse(chunks.join(""));
  const m = snap.snapshot.meta, nf = m.node_fields, NF = nf.length, types = m.node_types[0];
  const iT = nf.indexOf("type"), iN = nf.indexOf("name"), iS = nf.indexOf("self_size");
  const agg = new Map(); let total = 0;
  const nodes = snap.nodes, strings = snap.strings;
  for (let i = 0; i < nodes.length; i += NF) {
    const t = types[nodes[i + iT]], sz = nodes[i + iS]; total += sz;
    let name = t === "object" || t === "closure" || t === "native" ? strings[nodes[i + iN]] : t;
    if (t === "closure") name = "closure:" + String(name).slice(0, 40);
    name = String(name).slice(0, 60);
    const a = agg.get(name) || agg.set(name, { n: 0, b: 0 }).get(name); a.n++; a.b += sz;
  }
  return { totalMB: +(total / 1048576).toFixed(1), top: [...agg].sort((a, b) => b[1].b - a[1].b).slice(0, top).map(([k, v]) => [k, v.n, +(v.b / 1048576).toFixed(2)]) };
}
