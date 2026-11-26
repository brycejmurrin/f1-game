/* Apex 26 — TLXTexPool: the retired-texture pool carved out of tlx.js (#6821, #6479 row 10). A retired same-size
 * texture takes the next source in place instead of a fresh GPU allocation (rationale below, verbatim from tlx.js).
 * create({ fx, texStandIn }): `fx()` returns the live fx shader set (null until TLX builds it); the pool state is
 * private to the instance. Loads before tlx.js (DEFERRED.three + DEFERRED_EDGES). */
"use strict";

const TLXTexPool = (function () {
  function create(env) {
    const fxOf = env.fx, texStandIn = env.texStandIn;
    // RETIRED TEXTURES ARE REUSED, NOT DESTROYED. A garage livery edit frees
    // and re-creates the same-sized atlases (the car's decal atlas and its
    // deferred hi-res swap, the bay's dress and live screens) on every change.
    // Destroy + create is a fresh GPU allocation per edit (~27 MB for the
    // desktop hi-res atlas), a fresh bind group per material, and on Safari's
    // WebGPU a destroyed GPUTexture's memory stays held while any bind group
    // that referenced it waits for GC (https://github.com/WebKit/WebKit/pull/76225),
    // so a long editing session stacks freed atlases. three r186 re-uploads a
    // texture whose .version moved INTO its existing GPU texture
    // (Textures.updateTexture creates only while isDefaultTexture; there is no
    // size check), so a retired texture of the SAME size and source kind takes
    // the next source in place. Same size is what makes that safe; same kind
    // keeps three's ImageBitmap flipY path what it was. Bounded by count and
    // aged out after TEX_POOL_MS idle, so a race never carries the garage's.
    const _texPool = [];   // { t, w, h, bmp, at } — oldest first
    // 10 s, not a frame or two: car-draw's hi-res swap re-fills its 2048 texture from an idle callback,
    // seconds after the edit on a slow device, and an aged-out entry is a fresh ~27 MB allocation again.
    const TEX_POOL_MAX = 4, TEX_POOL_MS = 10000;
    const _texStat = { made: 0, reused: 0, retired: 0, disposed: 0 };
    const _isBitmap = (img) => typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap;
    function takePooledTexture(src) {
      if (!src || !(src.width > 0 && src.height > 0)) return null;
      const bmp = _isBitmap(src);
      for (let i = 0; i < _texPool.length; i++) {
        const e = _texPool[i];
        if (e.w === src.width && e.h === src.height && e.bmp === bmp) { _texPool.splice(i, 1); return e.t; }
      }
      return null;
    }
    // The decal material cache keys on the texture: a pooled one keeps its
    // material (the next fill reuses both, no node build), a disposed one
    // drops it — kept, it pinned the freed texture until LRU pressure.
    function disposePooled(t) {
      _texStat.disposed++;
      const fx = fxOf();
      if (fx && fx.releaseTexture) { try { fx.releaseTexture(t); } catch (_) { /* cache bookkeeping only */ } }
      try { t.dispose(); } catch (_) { /* device already dying */ }
    }
    function retireTexture(t, now) {
      if (!t.__tlxPoolW) { disposePooled(t); return; }
      _texStat.retired++;
      // An owned source closes now, as its dispose would have; a canvas is
      // swapped for the stand-in so a never-uploaded one is not pinned here.
      if (t.__tlxRelease) t.__tlxRelease();
      else if (t.image && !_isBitmap(t.image)) { const stand = texStandIn(); if (stand) t.image = stand; }
      t.onUpdate = null;
      _texPool.push({ t, w: t.__tlxPoolW, h: t.__tlxPoolH, bmp: !!t.__tlxPoolBmp, at: now });
      while (_texPool.length > TEX_POOL_MAX) disposePooled(_texPool.shift().t);
    }
    function ageTexPool(now) {
      while (_texPool.length && now - _texPool[0].at > TEX_POOL_MS) disposePooled(_texPool.shift().t);
    }
    // A dropped track world: its retired atlases go now, not after TEX_POOL_MS, so the next circuit's build
    // does not run beside them (iPhone tab budget ~300 MB).
    function flushTexPool() {
      while (_texPool.length) disposePooled(_texPool.shift().t);
    }
    return { take: takePooledTexture, retire: retireTexture, age: ageTexPool, flush: flushTexPool,
             stat: _texStat, isBitmap: _isBitmap, size: () => _texPool.length, entries: () => _texPool };
  }
  return { create };
})();
Object.freeze(TLXTexPool);
