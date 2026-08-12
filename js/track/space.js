/* Apex 26 — explicit source-trace ↔ racing-lap coordinate transforms.
   Pure IIFE global; loaded before tracks.js. */
const TrackSpace = (function () {
  "use strict";

  const wrap01 = (v) => {
    const n = Number(v) || 0;
    return ((n % 1) + 1) % 1;
  };

  function toRacingFrac(def, sourceFrac) {
    const phi = wrap01(def && def.startFrac);
    const source = wrap01(sourceFrac);
    return wrap01(def && def.reverse ? phi - source : source - phi);
  }

  function toSourceFrac(def, racingFrac) {
    const phi = wrap01(def && def.startFrac);
    const racing = wrap01(racingFrac);
    return wrap01(def && def.reverse ? phi - racing : phi + racing);
  }

  function sourceNodeToRacing(def, node, count) {
    const n = Math.max(1, Math.round(count) || 1);
    const source = Math.round(Number(node) || 0);
    const offset = Math.round(wrap01(def && def.startFrac) * n) % n;
    const racing = def && def.reverse ? offset - source : source - offset;
    return ((racing % n) + n) % n;
  }

  function racingNodeToSource(def, node, count) {
    const n = Math.max(1, Math.round(count) || 1);
    const racing = Math.round(Number(node) || 0);
    const offset = Math.round(wrap01(def && def.startFrac) * n) % n;
    const source = def && def.reverse ? offset - racing : offset + racing;
    return ((source % n) + n) % n;
  }

  function sampleSource(def, racingFrac, sampler) {
    return sampler(toSourceFrac(def, racingFrac));
  }

  // WHICH SPACE a def's scenery numbers are written in — the ONE answer, so
  // that the point path and the range path below cannot disagree about it.
  // They did: sceneryFrac()/sceneryNode() consulted def.sceneryCoordinates
  // while both scenery call sites of range() passed a hard-coded "source", so
  // on a def declaring "racing" AND reverse:true the point emitters stayed put
  // and the range emitters were mirrored about startFrac. Exactly two circuits
  // declare that pair, kyalami and paul_ricard, and both were wrong: kyalami's
  // Crowthorne gravel is a POINT at racing 0.078 and the tyre wall written to
  // back it is a RANGE at 0.060-0.098, which was landing at 0.912-0.950 — most
  // of a lap away, on the other side. Not merely cosmetic, either:
  // guardrail/fence/tyreWall feed recordBarrier, so barL/barR went with them.
  function scenerySpace(def) {
    const mode = def && def.sceneryCoordinates;
    if (mode === "racing" || mode === "source") return mode;
    // The legacy default, unchanged: forward-lap scenery has always been read
    // as racing space and reversed scenery as the source trace. New defs opt
    // into an explicit contract without moving legacy landmarks globally.
    return def && def.reverse ? "source" : "racing";
  }

  // Scenery authored in RACING space is tied to the direction of travel, so
  // flipping `reverse` moves every landmark to its mirror image. That is the
  // right answer for kyalami and paul_ricard, whose anchors were written
  // against the reversed lap they already drive. It is the wrong answer for a
  // circuit whose anchors were written against the FORWARD traversal and which
  // is only now being reversed — singapore, whose imported centreline turned
  // out to run clockwise while Marina Bay is anti-clockwise. Such a def sets
  // `sceneryLapMirror: true` and its racing anchors are mirrored (s → −s,
  // k → −k, ranges swapped) so the physical world stays put while the driving
  // direction flips. Sides need no help here: transformSceneryApi already
  // negates `side` for any reversed def, which is exactly the flip a mirrored
  // anchor needs to land back on the same kerb.
  function lapMirror(def) {
    return !!(def && def.reverse && def.sceneryLapMirror);
  }

  // WHERE THE SCENERY'S s=0 IS, when that is not the start line's.
  //
  // `startFrac` positions the start/finish line, and RACING-space scenery is
  // written relative to it — so correcting a wrong line drags every landmark on
  // the circuit round the lap with it. Measured, not assumed: rebuilding COTA
  // with startFrac 0.515 -> 0 moved 6 583 prop vertices, Istanbul 34 318, and
  // it took SEVEN circuits' required landmarks (Marina Bay Sands, the Katara
  // Towers, the Pudong skyline, the Silverstone Wing) off their footprints and
  // into the road.
  //
  // The dressing is not re-derivable from the line. It was placed circuit by
  // circuit against whatever s=0 that def happened to define, tuned by eye
  // against the geometry that produced, and it is INCONSISTENT about it: most
  // briefs put the pit building at lap 0.95-1.00 as though s=0 were the real
  // line, while Silverstone's Wing sits at 0.45 and its brief says "S=0.0 at
  // start/finish on the National pit straight" — a straight 1.3 km from the
  // real one, and a claim untrue even of its own def. No reinterpretation of
  // those numbers is globally right, so the only safe move is to keep every
  // landmark exactly where it is and move the line alone. `sceneryStartFrac`
  // records the startFrac a circuit's scenery was authored against and does
  // precisely that. Absent, it is a no-op everywhere below.
  //
  // THE SHIFT IS NOT `startFrac - sceneryStartFrac`. That was the first attempt
  // and it is wrong, because the two live in different spaces: `startFrac` is a
  // CONTROL-POINT INDEX fraction (resolve() uses it as
  // `round(startFrac * points.length)`) while an authored scenery fraction is
  // an ARC-LENGTH fraction of the lap — and the control points are nowhere near
  // arc-uniform (Monaco's run 21 m apart, Baku's 70 m). Subtracting one from
  // the other slid every landmark by the difference between the two
  // parameterisations: plausible-looking everywhere, and still moving 34 k
  // vertices at Istanbul.
  //
  // The right shift is one number — the ARC-LENGTH fraction at which the OLD
  // origin sits in the NEW lap. A point that was `f` of a lap past the old line
  // is `shift + f` past the new one, which is direction-agnostic and so needs
  // no forward/reverse branch. Only the built centreline knows it (it is a
  // lookup into the arc-length table), so buildCenterline computes it and
  // stashes it as `_sceneryShift`, exactly as it already stashes `_startFrac`.
  function sceneryOriginDelta(def) {
    return (def && def._sceneryShift) || 0;
  }

  function sceneryFrac(def, authoredFrac) {
    const shift = sceneryOriginDelta(def);
    if (scenerySpace(def) !== "racing") return wrap01(toRacingFrac(def, authoredFrac) + shift);
    return wrap01((lapMirror(def) ? -authoredFrac : authoredFrac) + shift);
  }

  function sceneryNode(def, node, count) {
    // Node units, not fractions: rounding the shift ONCE against the same node
    // count the caller is indexing keeps the node path and the fraction path
    // naming the same physical place. Deriving it per call from the fraction
    // would let them drift by a node at some circuits and not others.
    const n = Math.max(1, Math.round(count) || 1);
    const shift = Math.round(sceneryOriginDelta(def) * n);
    if (scenerySpace(def) !== "racing") return ((sourceNodeToRacing(def, node, n) + shift) % n + n) % n;
    const k = Math.round(node) * (lapMirror(def) ? -1 : 1) + shift;
    return ((k % n) + n) % n;
  }

  // The range twin of sceneryFrac. Every SCENERY call site must use this and
  // never range() directly. range() keeps its explicit space parameter because
  // resolve()'s hwZones remap genuinely is source-space by convention, and that
  // call has nothing to do with what a def says about its scenery.
  function sceneryRange(def, s0, s1) {
    const r = range(def, s0, s1, scenerySpace(def));
    // The origin shift goes HERE and not inside range(), because range() also
    // serves resolve()'s hwZones remap, which is source-authored and already
    // origin-independent — shifting that would drag every half-width zone off
    // its corner. Rotating both ends by the same amount preserves their order,
    // so the wrap/swap decision range() already made still holds.
    const shift = sceneryOriginDelta(def);
    if (!shift) return r;
    // A WHOLE LAP ROTATES ONTO ITSELF. `recordBarrier(0, 1, ...)` means "the
    // entire lap", and scanBarrier recovers that intent from `|s1 - s0| >= 1`.
    // Rotating both ends and wrapping collapses 0→1 to shift→shift, i.e. a
    // ONE-NODE barrier: measured, it took a full-lap wall down to a single
    // node and the characterization test read 1 where it wanted 471.
    if (Math.abs(r.s1 - r.s0) >= 1 - 1e-9) return r;
    return { s0: wrap01(r.s0 + shift), s1: wrap01(r.s1 + shift) };
  }

  function range(def, s0, s1, coordinateSpace) {
    const racing = coordinateSpace === "racing";
    // A mirrored racing range flips end-for-end just like a reversed source
    // range does — without the swap, [s0,s1] wraps the long way round and the
    // zone covers most of the lap instead of the arc that was authored.
    const mirror = racing && lapMirror(def);
    const map = racing
      ? (s) => wrap01(mirror ? -s : s)
      : (s) => toRacingFrac(def, s);
    const a = map(s0), b = map(s1);
    return (def && def.reverse && !racing) || mirror
      ? { s0: b, s1: a }
      : { s0: a, s1: b };
  }

  return {
    wrap01, toRacingFrac, toSourceFrac,
    sourceNodeToRacing, racingNodeToSource, sampleSource,
    scenerySpace, sceneryFrac, sceneryNode, sceneryRange, sceneryOriginDelta, range,
  };
})();
