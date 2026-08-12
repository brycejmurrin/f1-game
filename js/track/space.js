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

  function sceneryFrac(def, authoredFrac) {
    if (scenerySpace(def) !== "racing") return toRacingFrac(def, authoredFrac);
    return wrap01(lapMirror(def) ? -authoredFrac : authoredFrac);
  }

  function sceneryNode(def, node, count) {
    if (scenerySpace(def) !== "racing") return sourceNodeToRacing(def, node, count);
    const k = Math.round(node) * (lapMirror(def) ? -1 : 1);
    return ((k % count) + count) % count;
  }

  // The range twin of sceneryFrac. Every SCENERY call site must use this and
  // never range() directly. range() keeps its explicit space parameter because
  // resolve()'s hwZones remap genuinely is source-space by convention, and that
  // call has nothing to do with what a def says about its scenery.
  function sceneryRange(def, s0, s1) {
    return range(def, s0, s1, scenerySpace(def));
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
    scenerySpace, sceneryFrac, sceneryNode, sceneryRange, range,
  };
})();
