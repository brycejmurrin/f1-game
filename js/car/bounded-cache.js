"use strict";
// BoundedCache — a key→mesh cache bounded to `max` most-recent entries (#7516; lifted out of
// CarDraw.create so car3d / car-mesh / car-wheels can share it). The cache is a plain object
// and `order` its key list; both stay owned by the caller.
// - put: a hit promotes, a miss creates; past `max` the least recently used is evicted and its
//   disposer called exactly once (deleted from the map first). A null create (lost context) is
//   not cached: its key would re-push onto `order` on every miss and the duplicates could evict
//   a live entry (#7365).
// - LRU by STAMP: a hit writes one number (it was an indexOf + splice + push per drawn car per
//   pass); only an eviction, a miss past `max`, scans `order` for the oldest stamp.
// - drop: one key out, disposed. clear: disposes every entry, empties the map, `order` and its stamps.
const BoundedCache = (() => {
  const _lruStamp = new WeakMap();   // order array -> Map(key -> last-use tick)
  let _lruTick = 0;
  function stamps(order) {
    let st = _lruStamp.get(order);
    if (!st) { st = new Map(); _lruStamp.set(order, st); }
    return st;
  }
  function put(cache, order, key, create, max, dispose) {
    const st = stamps(order);
    if (cache[key]) { st.set(key, ++_lruTick); return cache[key]; }
    const mesh = create();
    if (!mesh) return mesh;
    cache[key] = mesh;
    order.push(key);
    st.set(key, ++_lruTick);
    while (order.length > max) {
      let oi = 0, ot = Infinity;
      for (let i = 0; i < order.length; i++) {
        const t = st.get(order[i]);
        if (t === undefined) { oi = i; break; }   // a key with no stamp is older than any stamped one
        if (t < ot) { ot = t; oi = i; }
      }
      const old = order.splice(oi, 1)[0];
      st.delete(old);
      const victim = cache[old];
      delete cache[old];
      if (dispose) dispose(victim);
    }
    return mesh;
  }
  // One key out (an invalidation): disposed, off `order` and its stamps.
  function drop(cache, order, key, dispose) {
    const v = cache[key];
    delete cache[key];
    if (order) {
      const i = order.indexOf(key);
      if (i >= 0) order.splice(i, 1);
      const st = _lruStamp.get(order); if (st) st.delete(key);
    }
    if (v && dispose) dispose(v);
  }
  function clear(cache, order, dispose) {
    for (const k in cache) { const v = cache[k]; delete cache[k]; if (dispose) dispose(v); }
    if (order) { order.length = 0; _lruStamp.delete(order); }
  }
  return { put, drop, clear };
})();
Object.freeze(BoundedCache);
