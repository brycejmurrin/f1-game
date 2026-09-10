/* Apex 26 — stateless FNV-1a + murmur-style mix for career, daily challenge, and driver ratings. Not simRnd(): same string always yields the same uint32 / unit float. */
"use strict";

const Hash32 = (function () {
  function fnv1a(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function mix(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }
  /** seed + colon-joined parts → [0, 1) — Career.hash namespace only. */
  function unit(seed, ...parts) {
    return mix(fnv1a(seed + ":" + parts.join(":"))) / 4294967296;
  }
  return { fnv1a, mix, unit };
})();
Object.freeze(Hash32);
