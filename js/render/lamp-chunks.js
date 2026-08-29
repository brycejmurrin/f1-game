/* Apex 26 — shared per-chunk lamp table bake (LampChunks). One backend-neutral
   home for "which baked track lamps reach which mesh chunk": GLXChunked binds
   each chunk's index list per draw, and WGX uploads the concatenated table to
   a storage buffer once per bake. Factored out of js/render/glx/chunked.js so
   the nearest-K selection, the cap formula, and the invalidation rule exist
   exactly once — the round-3 slot-remap and A/B-freeze bugs were both caused
   by a second hand-rolled copy of lamp logic drifting from the first. */
"use strict";

const LampChunks = (function () {

  // Per-chunk lamp cap. 24, not MAX_LIGHTS=48: each chunk binds its own set
  // and runs a full LIT loop per draw, so the cap is the per-fragment cost
  // knob. The player-facing PER-CHUNK LAMPS help and the game.js rationale
  // quote this number — change it here and they follow.
  const CAP = 24;

  // 0..1 knob -> effective cap. Verbatim the shipped GLX formula: a partial
  // knob shrinks the set (floor 8 keeps a chunk from losing its own lamp),
  // 0 and 1 both mean the full cap (0 never reaches here — the feature is off).
  function capFor(knob) {
    return (knob > 0 && knob < 1) ? Math.max(8, Math.round(CAP * knob)) : CAP;
  }

  // Squared distance from an AABB to a point (0 inside) — the same reach test
  // GLX frustum culling uses, local so the module stays dependency-free.
  function _aabbDist2(mn, mx, x, y, z) {
    let d = 0, t;
    t = mn[0] - x; if (t > 0) d += t * t; t = x - mx[0]; if (t > 0) d += t * t;
    t = mn[1] - y; if (t > 0) d += t * t; t = y - mx[1]; if (t > 0) d += t * t;
    t = mn[2] - z; if (t > 0) d += t * t; t = z - mx[2]; if (t > 0) d += t * t;
    return d;
  }

  // Bake the whole table for one (lights, chunks, knob) triple. lights is the
  // flat stride-15 baked track set; chunks carry {min,max} AABBs. Returns
  //   lists   Int32Array per chunk — indices into lights, nearest first
  //   concat  Uint32Array — all lists back to back (the WGX storage layout)
  //   offsets/counts Uint32Array per chunk into concat
  // Deterministic: lamps are baked per track and chunk bounds never move, so
  // this is genuine build-time work — never a per-frame cull.
  function buildTable(lights, chunks, knob) {
    const cap = capFor(knob), n = (lights.length / 15) | 0, nc = chunks.length;
    const lists = new Array(nc);
    let total = 0;
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c], hits = [];
      for (let i = 0; i < n; i++) {
        const o = i * 15, rad = lights[o + 6];
        if (!(rad > 0)) continue;
        const d2 = _aabbDist2(ch.min, ch.max, lights[o], lights[o + 1], lights[o + 2]);
        if (d2 <= rad * rad) hits.push({ i, d2 });
      }
      hits.sort((a, b) => a.d2 - b.d2);
      const m = Math.min(cap, hits.length), li = new Int32Array(m);
      for (let k = 0; k < m; k++) li[k] = hits[k].i;
      lists[c] = li; total += m;
    }
    const concat = new Uint32Array(total);
    const offsets = new Uint32Array(nc), counts = new Uint32Array(nc);
    let off = 0;
    for (let c = 0; c < nc; c++) {
      offsets[c] = off; counts[c] = lists[c].length;
      concat.set(lists[c], off); off += lists[c].length;
    }
    return { lists, concat, offsets, counts };
  }

  // Re-cap an existing bake WITHOUT re-testing a single lamp.
  //
  // The cap can only ever TRUNCATE: `hits` was sorted nearest-first before the
  // cap was applied, and capFor() never exceeds CAP, so the list for cap N is
  // exactly the first N entries of the list baked at CAP. Slicing a sorted
  // prefix is precisely what buildTable already does with its `Math.min(cap,
  // hits.length)` — this is the same operation without the O(chunks x lamps)
  // distance tests and the per-chunk sort that produced the order.
  function _reCap(full, cap) {
    const nc = full.lists.length, lists = new Array(nc);
    let total = 0;
    for (let c = 0; c < nc; c++) {
      const src = full.lists[c], m = Math.min(cap, src.length);
      // slice(), not subarray(): a view would share the full bake's buffer, so
      // any consumer writing through it would corrupt the master copy. m <= 24.
      lists[c] = m === src.length ? src : src.slice(0, m);
      total += m;
    }
    const concat = new Uint32Array(total);
    const offsets = new Uint32Array(nc), counts = new Uint32Array(nc);
    let off = 0;
    for (let c = 0; c < nc; c++) {
      offsets[c] = off; counts[c] = lists[c].length;
      concat.set(lists[c], off); off += lists[c].length;
    }
    return { lists, concat, offsets, counts };
  }

  // Cached bake. Keyed on the chunks array (WeakMap) plus lights ARRAY
  // IDENTITY — the exact invalidation the per-chunk expandos used: rebuild:true
  // tuner knobs null track._lights, the next build mints a new array, and the
  // stale table falls out for free.
  //
  // The knob is NOT part of that key, and used to be. The PER-CHUNK LAMPS
  // slider is `step: 0.001` over 0..1 (js/game/lighting.js), so it has 1000
  // distinct values — but capFor() maps all of them onto at most 17 distinct
  // caps, and the bake depends on the knob ONLY through that cap. Keying on the
  // raw float meant dragging 0.300 -> 0.301 re-ran the whole
  // O(chunks x lamps) bake — object literal per hit, Array.sort per chunk — to
  // produce a byte-identical table, once per input event, on the render thread
  // with the pass open. Measured first-on bake: 37.3 ms vegas / 25.9 ms
  // singapore (docs/PERF-FINDINGS.md); a drag paid that per frame. The
  // slider's own help text already promises the table is "baked once per
  // track", which is now true again.
  const _cache = new WeakMap();
  function resolve(lights, chunks, knob) {
    const cap = capFor(knob);
    let e = _cache.get(chunks);
    if (!e || e.src !== lights) {
      // Bake at the FULL cap once; every narrower cap is a prefix of it.
      const full = buildTable(lights, chunks, CAP);
      e = { src: lights, full, cap: CAP, table: full };
      _cache.set(chunks, e);
    }
    if (e.cap !== cap) { e.table = cap === CAP ? e.full : _reCap(e.full, cap); e.cap = cap; }
    return e.table;
  }

  return { CAP, capFor, buildTable, resolve };
})();
