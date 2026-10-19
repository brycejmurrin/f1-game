/* Apex 26 — per-circuit signature flyby shots + session when-variants.
 *
 * Patches are keyed by the stable DEFAULT shot id. A player's authored list
 * always wins; otherwise the circuit patch is layered over DEFAULT without
 * mutating either source. Circuit geometry remains in js/circuits/.
 *
 * WHEN variants (Phase 3.1 / #1569) share those ids and carry `when:
 * {night,wet}`. FlybySeq.select() picks the matching one per id so DEFAULT's
 * duration sum stays 1 for the bake. Night eyes sit closer/lower — lamps are
 * chosen near the camera.
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

  // Session catalog extras — not circuit patches. Same ids as DEFAULT; select()
  // replaces the unconditional shot when the session matches.
  const WHEN = Object.freeze([
    // ---- night: closer, lower so nearby lamps fill the frame -----------------
    Object.freeze({
      id: "wide", dur: 0.09, ease: "inOut", sway: 0.2, when: Object.freeze({ night: true }),
      eye: [{ at: "centre", bear: -0.30, distR: 0.72, yR: 0.18 },
            { at: "centre", bear: -0.12, distR: 0.62, yR: 0.15 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [40, 42],
    }),
    Object.freeze({
      id: "landmark1", dur: 0.09, ease: "inOut", when: Object.freeze({ night: true }),
      eye: [{ at: "landmark", rank: 0, bear: -0.22, distK: 1.05, yK: -0.05, y: 4.5 },
            { at: "landmark", rank: 0, bear: -0.06, distK: 0.90, yK: 0, y: 4.0 }],
      look: [{ at: "landmark", rank: 0, distK: 0, yK: 0.15 }, { at: "landmark", rank: 0, distK: 0, yK: 0.2 }],
      fov: [42, 44],
    }),
    Object.freeze({
      id: "landmark2", dur: 0.08, ease: "inOut", when: Object.freeze({ night: true }),
      eye: [{ at: "landmark", rank: 1, bear: 0.24, distK: 1.10, yK: -0.05, y: 4.5 },
            { at: "landmark", rank: 1, bear: 0.08, distK: 0.95, yK: 0, y: 4.0 }],
      look: [{ at: "landmark", rank: 1, distK: 0, yK: 0.12 }, { at: "landmark", rank: 1, distK: 0, yK: 0.18 }],
      fov: [42, 45],
    }),
    Object.freeze({
      id: "turn-first", dur: 0.09, ease: "inOut", when: Object.freeze({ night: true }),
      eye: [{ at: "corner", n: "first", off: -45, x: 10, y: 3.8 },
            { at: "corner", n: "first", off: 0, x: 11, y: 3.4 }],
      look: [{ at: "corner", n: "first", off: -8, x: 0, y: 0.6 },
             { at: "corner", n: "first", off: 24, x: 0, y: 0.6 }],
      fov: [44, 46],
    }),
    Object.freeze({
      id: "turn-mid", dur: 0.09, ease: "inOut", when: Object.freeze({ night: true }),
      eye: [{ at: "corner", n: "lore", off: -28, x: 10, y: 3.8 },
            { at: "corner", n: "lore", off: 0, x: 11, y: 3.4 }],
      look: [{ at: "corner", n: "lore", off: 0, x: 0, y: 0.6 },
             { at: "corner", n: "lore", off: 16, x: 0, y: 0.6 }],
      fov: [46, 48],
    }),
    Object.freeze({
      id: "turn-late", dur: 0.09, ease: "inOut", when: Object.freeze({ night: true }),
      eye: [{ at: "corner", n: "fastest", off: -28, x: 9, y: 3.2 },
            { at: "corner", n: "fastest", off: 16, x: 10, y: 2.8 }],
      look: [{ at: "corner", n: "fastest", off: 4, x: 0, y: 0.6 },
             { at: "corner", n: "fastest", off: 36, x: 0, y: 0.6 }],
      fov: [44, 46],
    }),
    // ---- wet: slightly lower and tighter so spray and reflections read -------
    Object.freeze({
      id: "wide", dur: 0.09, ease: "inOut", sway: 0.2, when: Object.freeze({ wet: true }),
      eye: [{ at: "centre", bear: -0.28, distR: 0.95, yR: 0.24 },
            { at: "centre", bear: -0.10, distR: 0.85, yR: 0.20 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [38, 40],
    }),
    Object.freeze({
      id: "turn-mid", dur: 0.09, ease: "inOut", when: Object.freeze({ wet: true }),
      eye: [{ at: "corner", n: "lore", off: -32, x: 13, y: 5.5 },
            { at: "corner", n: "lore", off: 0, x: 14, y: 5.0 }],
      look: [{ at: "corner", n: "lore", off: 0, x: 0, y: 0.6 },
             { at: "corner", n: "lore", off: 18, x: 0, y: 0.6 }],
      fov: [44, 46],
    }),
    Object.freeze({
      id: "turn-late", dur: 0.09, ease: "inOut", when: Object.freeze({ wet: true }),
      eye: [{ at: "corner", n: "fastest", off: -32, x: 11, y: 4.2 },
            { at: "corner", n: "fastest", off: 18, x: 12, y: 3.8 }],
      look: [{ at: "corner", n: "fastest", off: 4, x: 0, y: 0.6 },
             { at: "corner", n: "fastest", off: 40, x: 0, y: 0.6 }],
      fov: [42, 44],
    }),
    // Night + wet: the night framing wins the lamp priority, still lower for wet.
    Object.freeze({
      id: "turn-mid", dur: 0.09, ease: "inOut", when: Object.freeze({ night: true, wet: true }),
      eye: [{ at: "corner", n: "lore", off: -26, x: 9, y: 3.2 },
            { at: "corner", n: "lore", off: 0, x: 10, y: 2.9 }],
      look: [{ at: "corner", n: "lore", off: 0, x: 0, y: 0.6 },
             { at: "corner", n: "lore", off: 14, x: 0, y: 0.6 }],
      fov: [48, 50],
    }),
  ]);

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

  /** Catalog for select(): patched DEFAULT plus session when-variants. */
  function catalog(trackId, defaults, saved) {
    const base = resolve(trackId, defaults, saved);
    if (Array.isArray(saved) && saved.length) return base;
    return WHEN.length ? base.concat(WHEN) : base;
  }

  return Object.freeze({ BY_TRACK, WHEN, patches, resolve, catalog });
})();
