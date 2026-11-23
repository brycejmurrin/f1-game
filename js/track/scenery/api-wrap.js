/* Apex 26 — SceneryApiWrap: the scenery(api) coordinate wrap (origin shift, reverse side, authored-frame along/every).
   Mechanical peel from build-props.js. S1: along/every hand authored-frame k so wrapped helpers shift once. */
const SceneryApiWrap = (function () {
  "use strict";

  function transformSceneryApi(api, def, n) {
    const RK = (k) => TrackSpace.sceneryNode(def, k, n);
    const RS = (s) => TrackSpace.sceneryFrac(def, s);
    const SIDE = (side) => def.reverse ? -side : side;
    const w = Object.assign({}, api);
    // (k, side, ...rest): index + side based
    for (const name of ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree",
                        "palm", "conifer", "building", "house", "motorhome", "tower", "billboard",
                        "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast", "runoffApron",
                        "cameraTower", "broadcastCompound", "waterSurface",
                        "cypress", "stonePine", "broadleafFall", "acacia", "plane"]) {
      const f = api[name]; if (f) w[name] = (k, side, ...r) => f(RK(k), SIDE(side), ...r);
    }
    // (id, k, side, ...rest): the MODEL ID comes first. bakedModel must take the
    // same origin shift and reverse flip as the procedural call it stands in for
    // — unwrapped, the baked asset stood 2/3 of a lap away on every shifted
    // circuit that ships one — but it cannot ride the (k, side) list above,
    // because that list remaps argument 0, and argument 0 here is a string.
    // Measured before this line existed: across the 15 call sites on vegas,
    // monaco, spa, monza and silverstone, all 152 calls reached
    // Assets.modelSync as NaN (or, on a source-space def, a node number
    // coerced out of the id), so modelSync never matched a model, bakedModel
    // always returned false, and the whole baked pack was dead on every
    // circuit that asks for it — invisible because the `if (!bakedModel(…))`
    // fallback quietly drew the procedural shape instead.
    if (api.bakedModel)
      w.bakedModel = (id, k, side, ...r) => api.bakedModel(id, RK(k), SIDE(side), ...r);
    // (s, side, ...rest): single fraction + side
    for (const name of ["grandstand", "grandstandEx"]) {
      const f = api[name]; if (f) w[name] = (s, side, ...r) => f(RS(s), SIDE(side), ...r);
    }
    // (s0, s1, side, ...rest): fraction RANGE + side — swap ends and mirror both
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
    // (s0, s1, stepM, fn, tag?): fraction range, no side.
    // Remap the span into engine frame (same as wall/fence), but hand the
    // callback AUTHORIZED-frame k. along walks engine nodes; wrapped helpers
    // then apply sceneryNode once. Passing engine k through made every
    // anchor/tree/place/bakedModel inside the callback double-shift (Imola
    // ~1.8 km / Spa ~277 m — docs/BUGS.md S1). Engine-internal ctx.along
    // (wall/fence closures) is untouched and stays single-shift.
    if (api.along) w.along = (s0, s1, stepM, fn, tag) => {
      const range = TrackSpace.sceneryRange(def, s0, s1);
      if (typeof fn !== "function") return api.along(range.s0, range.s1, stepM, fn, tag);
      return api.along(range.s0, range.s1, stepM, (kEng, spacing) => {
        fn(TrackSpace.sceneryNodeToAuthored(def, kEng, n), spacing);
      }, tag);
    };
    // every() walks engine nodes (i + origin shift), the same frame `along`
    // used to hand its callback. Circuit files then call wrapped pine /
    // marshalPost, which shift again. Hand authored-frame k, as along does.
    // Raw every (plantRoadsideTrees, marshal posts) is not this wrapper.
    if (api.every) w.every = (m, fn) => {
      if (typeof fn !== "function") return api.every(m, fn);
      return api.every(m, (kEng) => fn(TrackSpace.sceneryNodeToAuthored(def, kEng, n)));
    };
    // (s, …): single fraction, no side (gantry / underpass portal)
    if (api.gantry) w.gantry = (s, ...r) => api.gantry(RS(s), ...r);
    if (api.underpassPortal) w.underpassPortal = (s, ...r) => api.underpassPortal(RS(s), ...r);

    // Six more entry points take a node index or a lap fraction and are absent
    // from the lists above, so they never moved with the rest: `groundPatch`
    // (34 circuits), `overheadSpan` (18), `circuitKit` (16), `groundedSegments`
    // (9), `waterField`, and the `frameAt` lookup itself. That gap is why
    // Miami's Turnpike overpass and Singapore's kit-built pit building were the
    // last two required models left in the road after the origin move.
    //
    // Default: ORIGIN SHIFT ONLY — no side flip, no reverse/mirror remap. That
    // is deliberate and conservative: the same emitters are unremapped on the
    // reverse-only circuits (monaco, kyalami, paul_ricard) TODAY, so giving
    // them the full treatment here would silently move already-shipped geometry.
    //
    // Exception: `sceneryLapMirror` circuits (singapore): ONLY frameAt and
    // overheadSpan take the mirrored remapS — the portal-deck case that landed
    // ~half a lap from anchor()-placed supports. The k-keyed helpers and
    // circuitKit stay SHIFT-ONLY on purpose: singapore's authored fracs are
    // tuned against shift-only (the KOLD legend in js/circuits/singapore.js).
    //
    // `frameAt` is wrapped at the API BOUNDARY rather than at its definition on
    // purpose. models/ and the kits hold the RAW frameAt and resolve fractions
    // the caller already handed them, so shifting it at source would apply the
    // shift twice to everything routed through the wrapped calls below.
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
