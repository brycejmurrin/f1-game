/* Apex 26 — per-circuit signature flyby shots.
 *
 * Patches are keyed by the stable DEFAULT shot id. A player's authored list
 * always wins; otherwise the circuit patch is layered over DEFAULT without
 * mutating either source. Circuit geometry remains in js/circuits/.
 */
"use strict";
window.FlybyOverrides = (function () {
  const BY_TRACK = Object.freeze({
    monaco: Object.freeze({
      // Tunnel exit into the harbour chicane: low and close to the barriers,
      // looking from the dark straight towards the daylight and braking zone.
      "turn-mid": Object.freeze({
        eye: [{ at: "corner", n: 8, off: -105, x: 8, y: 3.2 },
              { at: "corner", n: 8, off: -62, x: 8, y: 3.6 }],
        look: [{ at: "corner", n: 8, off: -38, x: 0, y: 0.8 },
               { at: "corner", n: 8, off: 12, x: 0, y: 0.8 }],
        fov: [34, 38],
      }),
    }),
    spa: Object.freeze({
      // Eau Rouge and Raidillon from the compression: the eye stays below the
      // climb while the look runs through the left crest.
      "turn-mid": Object.freeze({
        eye: [{ at: "corner", n: 2, off: -115, x: 10, y: 3.2 },
              { at: "corner", n: 2, off: -58, x: 12, y: 4.2 }],
        look: [{ at: "corner", n: 3, off: -24, x: 0, y: 0.8 },
               { at: "corner", n: 3, off: 30, x: 0, y: 0.8 }],
        fov: [36, 40],
      }),
    }),
  });

  function patches(trackId) {
    return BY_TRACK[trackId] || null;
  }

  function resolve(trackId, defaults, saved) {
    if (Array.isArray(saved) && saved.length) return saved;
    const patch = patches(trackId);
    if (!patch) return defaults;
    return defaults.map((shot) => Object.prototype.hasOwnProperty.call(patch, shot.id)
      ? Object.assign({}, shot, patch[shot.id])
      : shot);
  }

  return Object.freeze({ BY_TRACK, patches, resolve });
})();
