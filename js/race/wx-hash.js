/* Apex 26 — WX HASH (WxHash): the FNV-1a unit draw shared by Forecast and RainCells. */
const WxHash = (function () {
  "use strict";

  // 32-bit FNV-1a of the key, then the forecast mixer, → [0, 1). Not Hash32.unit:
  // that finaliser is a different function, and these draws are already pinned.
  function fnv01(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }

  return { fnv01 };
})();
Object.freeze(WxHash);
