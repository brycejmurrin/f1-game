/* Apex 26 — shared per-chunk lamp table bake (LampChunks). One backend-neutral
   home for "which baked track lamps reach which mesh chunk": GLXChunked binds
   each chunk's index list per draw, and WGX uploads the concatenated table to
   a storage buffer once per bake. Factored out of js/render/glx/chunked.js so
   the nearest-K selection, the cap formula, and the invalidation rule exist
   exactly once — the round-3 slot-remap and A/B-freeze bugs were both caused
   by a second hand-rolled copy of lamp logic drifting from the first. */
"use strict";

const LampChunks = (function () {

  // Per-chunk lamp cap. LightBudget.CHUNK (24), not MAX (48): each chunk binds
  // its own set and runs a full LIT loop per draw, so the cap is the
  // per-fragment cost knob. The player-facing PER-CHUNK LAMPS help and the
  // game.js rationale quote this number — change it there and they follow.
  // Eval-time read: tools/manifest.cjs HARD_EDGES (light-budget.js first).
  const CAP = LightBudget.CHUNK;

  // 0..1 knob -> effective cap. Verbatim the shipped GLX formula: a partial
  // knob shrinks the set (floor 8 keeps a chunk from losing its own lamp),
  // 0 and 1 both mean the full cap (0 never reaches here — the feature is off).
  function capFor(knob) {
    return (knob > 0 && knob < 1) ? Math.max(8, Math.round(CAP * knob)) : CAP;
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
        // Frustum.aabbDist2 (js/render/shared/frustum.js): the same reach test the
        // chunk culls use, call-time so this module still evaluates alone.
        const d2 = Frustum.aabbDist2(ch.min, ch.max, lights[o], lights[o + 1], lights[o + 2]);
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
  // slider is `step: 0.001` over 0..1 (js/lighting/knobs.js), so it has 1000
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

  // ── Grid form, for a backend with no per-draw binding ──────────────────
  //
  // GLX binds each chunk's list per draw and WGX passes (offset, count) in its
  // per-draw uniform. THREE HAS NEITHER: every visible chunk is drawn from one
  // pooled mesh sharing ONE material, so there is nowhere to put a per-chunk
  // value. Checked in the vendored r185 rather than assumed —
  // `nodeUniformDrawId` is declared only when `object.isBatchedMesh` and set
  // only in the BatchedMesh branch of WebGLBackend._draw, so `drawIndex` reads
  // nothing at all from a plain Mesh.
  //
  // What three CAN do is read `positionWorld` — and the chunks are a regular XZ
  // grid (js/render/three/tlx-chunked.js bins each triangle by centroid into
  // `cell`-sized cells keyed `gx * 4096 + gz`), so a FRAGMENT can find its own
  // cell without anyone telling it which chunk it belongs to. This flattens the
  // per-chunk table into a dense (offset, count) image over the occupied cells,
  // which the shader samples with one texelFetch.
  //
  // THE ONE SEMANTIC DIFFERENCE, and it is deliberate: GLX/WGX resolve lamps
  // PER CHUNK, this resolves PER FRAGMENT. A triangle is binned by its centroid,
  // so one straddling a cell boundary lights from the neighbouring cell's set
  // beyond that line. That is arguably the better answer — the lamps used are
  // the ones near the PIXEL — but it is not bit-parity with the other two
  // backends, and docs/ARCHITECTURE.md §Cross-backend parity is where that is
  // argued rather than discovered.
  //
  // Returns { gw, gh, gx0, gz0, data } — `data` is gw*gh*2 Uint32, (offset,
  // count) per cell, zero where no chunk occupies it. Cell (gx,gz) lives at
  // ((gz - gz0) * gw + (gx - gx0)) * 2. Empty input gives a 1x1 zero grid so a
  // consumer always has a texture to bind.
  function buildGrid(table, chunks) {
    const nc = chunks.length;
    let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c];
      // A chunk with no grid cell cannot be placed. Skipping it is correct and
      // not silent: its cells stay count 0, so those fragments fall back to the
      // global lamp set exactly as they do today.
      if (!(ch.gx >= 0) || !(ch.gz >= 0)) continue;
      if (ch.gx < gx0) gx0 = ch.gx;
      if (ch.gx > gx1) gx1 = ch.gx;
      if (ch.gz < gz0) gz0 = ch.gz;
      if (ch.gz > gz1) gz1 = ch.gz;
    }
    if (!(gx1 >= gx0)) return { gw: 1, gh: 1, gx0: 0, gz0: 0, data: new Uint32Array(2) };
    const gw = gx1 - gx0 + 1, gh = gz1 - gz0 + 1;
    const data = new Uint32Array(gw * gh * 2);
    for (let c = 0; c < nc; c++) {
      const ch = chunks[c];
      if (!(ch.gx >= 0) || !(ch.gz >= 0)) continue;
      const o = ((ch.gz - gz0) * gw + (ch.gx - gx0)) * 2;
      data[o] = table.offsets[c];
      data[o + 1] = table.counts[c];
    }
    return { gw, gh, gx0, gz0, data };
  }

  return { CAP, capFor, buildTable, resolve, buildGrid };
})();
