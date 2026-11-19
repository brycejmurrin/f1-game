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

  function scenerySpace(def) {
    const mode = def && def.sceneryCoordinates;
    if (mode === "racing" || mode === "source") return mode;
    return def && def.reverse ? "source" : "racing";
  }

  function lapMirror(def) {
    return !!(def && def.reverse && def.sceneryLapMirror);
  }

  function sceneryOriginDelta(def) {
    return (def && def._sceneryShift) || 0;
  }

  function sceneryFrac(def, authoredFrac) {
    const shift = sceneryOriginDelta(def);
    if (scenerySpace(def) !== "racing") return wrap01(toRacingFrac(def, authoredFrac) + shift);
    return wrap01((lapMirror(def) ? -authoredFrac : authoredFrac) + shift);
  }

  function sceneryNode(def, node, count) {
    const n = Math.max(1, Math.round(count) || 1);
    const shift = Math.round(sceneryOriginDelta(def) * n);
    if (scenerySpace(def) !== "racing") return ((sourceNodeToRacing(def, node, n) + shift) % n + n) % n;
    const k = Math.round(node) * (lapMirror(def) ? -1 : 1) + shift;
    return ((k % n) + n) % n;
  }

  function sceneryNodeToAuthored(def, engineNode, count) {
    const n = Math.max(1, Math.round(count) || 1);
    const shift = Math.round(sceneryOriginDelta(def) * n);
    if (scenerySpace(def) !== "racing") {
      const racing = ((Math.round(engineNode) - shift) % n + n) % n;
      return racingNodeToSource(def, racing, n);
    }
    let k = Math.round(engineNode) - shift;
    if (lapMirror(def)) k = -k;
    return ((k % n) + n) % n;
  }

  function sceneryRange(def, s0, s1) {
    if (Math.abs(s1 - s0) >= 1 - 1e-9) return { s0: 0, s1: 1 };
    const r = range(def, s0, s1, scenerySpace(def));
    const shift = sceneryOriginDelta(def);
    if (!shift) return r;
    return { s0: wrap01(r.s0 + shift), s1: wrap01(r.s1 + shift) };
  }

  function range(def, s0, s1, coordinateSpace) {
    if (Math.abs(s1 - s0) >= 1 - 1e-9) return { s0: 0, s1: 1 };
    const racing = coordinateSpace === "racing";
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
    scenerySpace, sceneryFrac, sceneryNode, sceneryNodeToAuthored, sceneryRange, sceneryOriginDelta, range,
  };
})();
Object.freeze(TrackSpace);
