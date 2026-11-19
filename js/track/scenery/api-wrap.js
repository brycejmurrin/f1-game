const SceneryApiWrap = (function () {
  "use strict";

  function transformSceneryApi(api, def, n) {
    const RK = (k) => TrackSpace.sceneryNode(def, k, n);
    const RS = (s) => TrackSpace.sceneryFrac(def, s);
    const SIDE = (side) => def.reverse ? -side : side;
    const w = Object.assign({}, api);
    for (const name of ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree",
                        "palm", "conifer", "building", "house", "motorhome", "tower", "billboard",
                        "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast", "runoffApron",
                        "cameraTower", "broadcastCompound", "waterSurface",
                        "cypress", "stonePine", "broadleafFall", "acacia", "plane"]) {
      const f = api[name]; if (f) w[name] = (k, side, ...r) => f(RK(k), SIDE(side), ...r);
    }
    if (api.bakedModel)
      w.bakedModel = (id, k, side, ...r) => api.bakedModel(id, RK(k), SIDE(side), ...r);
    for (const name of ["grandstand", "grandstandEx"]) {
      const f = api[name]; if (f) w[name] = (s, side, ...r) => f(RS(s), SIDE(side), ...r);
    }
    for (const name of ["wall", "fence", "guardrail", "tyreWall", "hedge",
                        "forestEdge", "cityFront", "recordBarrier", "indexSolid",
                        "concreteCanyon",
                        "bankedKerbStrip", "bowlSeatWall", "pastelStreetRow",
                        "spectatorHill", "sponsorHoarding", "waterBand",
                        "bleacher", "scaffoldStand", "terrace", "tieredBowl"]) {
      const f = api[name]; if (f) w[name] = (s0, s1, side, ...r) => {
        const range = TrackSpace.sceneryRange(def, s0, s1);
        return f(range.s0, range.s1, SIDE(side), ...r);
      };
    }
    if (api.along) w.along = (s0, s1, stepM, fn, tag) => {
      const range = TrackSpace.sceneryRange(def, s0, s1);
      if (typeof fn !== "function") return api.along(range.s0, range.s1, stepM, fn, tag);
      return api.along(range.s0, range.s1, stepM, (kEng, spacing) => {
        fn(TrackSpace.sceneryNodeToAuthored(def, kEng, n), spacing);
      }, tag);
    };
    if (api.every) w.every = (m, fn) => {
      if (typeof fn !== "function") return api.every(m, fn);
      return api.every(m, (kEng) => fn(TrackSpace.sceneryNodeToAuthored(def, kEng, n)));
    };
    if (api.gantry) w.gantry = (s, ...r) => api.gantry(RS(s), ...r);
    if (api.underpassPortal) w.underpassPortal = (s, ...r) => api.underpassPortal(RS(s), ...r);

    const shiftS = TrackSpace.sceneryOriginDelta(def);
    const doMirror = !!(def.reverse && def.sceneryLapMirror);
    if (doMirror || shiftS) {
      const shiftK = Math.round(shiftS * n);
      const SK = (k) => (((Math.round(k) + shiftK) % n) + n) % n;
      const SS = (s) => TrackSpace.wrap01(s + shiftS);
      const remapS = doMirror ? RS : SS;
      for (const name of ["groundPatch", "waterField"]) {
        const f = api[name]; if (f) w[name] = (k, side, ...r) => f(SK(k), side, ...r);
      }
      if (api.frameAt) w.frameAt = (frac, ...r) => api.frameAt(remapS(frac), ...r);
      if (api.overheadSpan) w.overheadSpan = (spec) => api.overheadSpan(
        spec && Number.isFinite(spec.frac) && !spec.rawFrac
          ? Object.assign({}, spec, { frac: remapS(spec.frac) }) : spec);
      if (api.groundedSegments) w.groundedSegments = (spec) => api.groundedSegments(
        spec && Array.isArray(spec.points)
          ? Object.assign({}, spec, { points: spec.points.map((pt) => Object.assign({}, pt, { k: SK(pt.k) })) })
          : spec);
      if (api.circuitKit) {
        const kit = api.circuitKit, wk = {};
        for (const name of Object.keys(kit)) {
          const f = kit[name];
          wk[name] = typeof f === "function"
            ? (spec, ...r) => f(spec && Number.isFinite(spec.frac)
                ? Object.assign({}, spec, { frac: SS(spec.frac) }) : spec, ...r)
            : f;
        }
        w.circuitKit = wk;
      }
    }
    return w;
  }

  return { transform: transformSceneryApi };
})();
Object.freeze(SceneryApiWrap);
