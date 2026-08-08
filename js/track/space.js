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

  function sceneryFrac(def, authoredFrac) {
    return scenerySpace(def) === "racing"
      ? wrap01(authoredFrac) : toRacingFrac(def, authoredFrac);
  }

  function sceneryNode(def, node, count) {
    return scenerySpace(def) === "racing"
      ? ((Math.round(node) % count) + count) % count
      : sourceNodeToRacing(def, node, count);
  }

  // The range twin of sceneryFrac. Every SCENERY call site must use this and
  // never range() directly. range() keeps its explicit space parameter because
  // resolve()'s hwZones remap genuinely is source-space by convention, and that
  // call has nothing to do with what a def says about its scenery.
  function sceneryRange(def, s0, s1) {
    return range(def, s0, s1, scenerySpace(def));
  }

  function range(def, s0, s1, coordinateSpace) {
    const map = coordinateSpace === "racing"
      ? wrap01
      : (s) => toRacingFrac(def, s);
    const a = map(s0), b = map(s1);
    return def && def.reverse && coordinateSpace !== "racing"
      ? { s0: b, s1: a }
      : { s0: a, s1: b };
  }

  return {
    wrap01, toRacingFrac, toSourceFrac,
    sourceNodeToRacing, racingNodeToSource, sampleSource,
    scenerySpace, sceneryFrac, sceneryNode, sceneryRange, range,
  };
})();
