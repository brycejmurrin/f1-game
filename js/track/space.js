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

  // Existing definitions are inconsistent by design: forward-lap scenery has
  // historically been interpreted in racing space while reversed scenery is
  // remapped from the source trace. New migrations can opt into an explicit
  // coordinate contract without moving legacy landmarks globally.
  function sceneryFrac(def, authoredFrac) {
    const mode = def && def.sceneryCoordinates;
    if (mode === "racing") return wrap01(authoredFrac);
    if (mode === "source") return toRacingFrac(def, authoredFrac);
    return def && def.reverse ? toRacingFrac(def, authoredFrac) : wrap01(authoredFrac);
  }

  function sceneryNode(def, node, count) {
    const mode = def && def.sceneryCoordinates;
    if (mode === "racing" || (!mode && !(def && def.reverse)))
      return ((Math.round(node) % count) + count) % count;
    return sourceNodeToRacing(def, node, count);
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
    sceneryFrac, sceneryNode, range,
  };
})();
