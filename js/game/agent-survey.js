/* Apex 26 — AgentSurvey: geometry-defect payload behind AgentView.survey().
   Split out of js/game/agentview.js. Thresholds and comments move with the
   function (do not copy). Created once per AgentView.create() via
   AgentSurvey.create(ctx). Load order: before js/game/agentview.js. */
const AgentSurvey = (function () {
  "use strict";

  function create(ctx) {
    Log.info("game", "AgentSurvey.create");
    const { G, fail, scr, clamp, r1, r2, API_VERSION, CONVENTIONS } = ctx;

    // ── survey() — geometry defects, as a report ────────────────────────────
    // The survey-track workflow currently says "assert with screenshots + the
    // probe, not by reasoning about coordinates" — because the coordinates were
    // not trustworthy enough to reason about. With measured prop bounds they
    // are, so the defect classes that workflow hunts by eye become queryable:
    // terrain holes that make props float, cliffs and steps, a sagging ribbon,
    // props over the racing line, terrain above the road.
    //
    // Thresholds are calibrated, not guessed. Props are deliberately sunk below
    // grade (place() by 0.8 m, anchor() by 0.3 m) so a naive "base above ground"
    // test flags every prop in the game; FLOAT_M is measured against that.
    // Only things that are supposed to stand ON the ground can "float".
    // Gantries span the track overhead, anonymous structures include roofs and
    // canopies, and landforms are placed in world coords — a 12.8 x 1.1 x 49.3 m
    // slab 13 m up is a roof, not a defect, and flagging it buries the real ones.
    const GROUNDED_KINDS = ["tree", "pine", "palm", "conifer", "bush", "hedge",
                            "prop", "building", "house", "motorhome", "tower",
                            "grandstand", "billboard", "signBoard", "marshalPost"];
    const FLOAT_M = 0.6;        // base this far ABOVE terrain = floating
    const BURIED_M = 4;         // base this far BELOW terrain = swallowed
    // A CLIFF is a slope, not a height. Testing absolute rise between lateral
    // samples reported 157 "steps" on Spa, which is simply a hill: at 10 m
    // sample spacing a 1 m rise is a 10% grade. 0.55 is ~29 degrees.
    const CLIFF_SLOPE = 0.55;
    const OVER_ROAD_M = 0.15;   // terrain above road surface by this = poking through

    function survey(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const track = G.track, total = track.total;
      // `at` is a COUNT of evenly-spaced stations across the WHOLE lap, not a
      // position — survey always scans the full circuit and cannot be aimed at
      // one section. `stations` is the honest name; `at` stays for callers that
      // already use it. To look at one stretch, filter the returned rows by
      // `frac` — there is no fromS/toS window here the way query() has one.
      const nAt = clamp((o.stations | 0) || (o.at | 0) || 24, 2, 200);
      const reach = clamp(o.reachM || 60, 10, 400);
      const nLat = clamp(o.lats | 0 || 13, 3, 41);
      const cap = clamp(o.limit | 0 || 20, 1, 200);

      // ── lateral ground profile ──
      const profile = [], holes = [], cliffs = [], overRoad = [];
      for (let i = 0; i < nAt; i++) {
        const frac = i / nAt;
        const s = frac * total;
        Tracks.sample(track, s, scr);
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
        const roadY = scr.p[1];
        const row = [];
        for (let j = 0; j < nLat; j++) {
          const lat = -reach + (2 * reach) * (j / (nLat - 1));
          const ty = Tracks.terrainY(track, scr.p[0] + ex * lat, scr.p[2] + ez * lat);
          row.push({ latM: r1(lat), terrainY: ty == null ? null : r2(ty) });
          // terrain poking through the racing surface
          if (ty != null && Math.abs(lat) <= scr.hw && ty - roadY > OVER_ROAD_M) {
            overRoad.push({ frac: +frac.toFixed(3), latM: r1(lat),
                            aboveRoadM: r2(ty - roadY) });
          }
        }
        // A null BETWEEN solid readings is a hole in the ribbon — props out
        // there fall back to the closed-form estimate and float or sink. A
        // trailing null at the outer edge is just where the ribbon stops.
        //
        // Nulls over the ROAD are not holes: the terrain ribbon starts ~2.2 m
        // beyond the tarmac by design and the road mesh covers the middle.
        // Counting those reported one "hole" per station on a clean circuit.
        const ribbonFrom = scr.hw + 2.4;
        for (let j = 1; j < row.length - 1; j++) {
          if (Math.abs(row[j].latM) < ribbonFrom) continue;
          if (row[j].terrainY == null && row[j - 1].terrainY != null
              && row.slice(j + 1).some((c) => c.terrainY != null)) {
            holes.push({ frac: +frac.toFixed(3), latM: row[j].latM });
          }
        }
        for (let j = 1; j < row.length; j++) {
          const a = row[j - 1].terrainY, b = row[j].terrainY;
          const dLat = Math.abs(row[j].latM - row[j - 1].latM) || 1;
          if (a != null && b != null && Math.abs(b - a) / dLat > CLIFF_SLOPE) {
            cliffs.push({ frac: +frac.toFixed(3),
                          fromLatM: row[j - 1].latM, toLatM: row[j].latM,
                          riseM: r2(b - a), slope: r2(Math.abs(b - a) / dLat) });
          }
        }
        profile.push({ frac: +frac.toFixed(3), roadY: r2(roadY),
                       halfWidthM: r1(scr.hw), samples: row });
      }

      // ── prop grounding ──
      const reg = track.props;
      const floating = [], buried = [], voidProps = [], propsOverRoad = [];
      let checked = 0;
      if (reg) {
        for (const p of reg.list) {
          const grounded = GROUNDED_KINDS.indexOf(p.kind) >= 0;
          if (grounded && p.measured) {
            checked++;
            const base = p.y - p.h / 2;
            const ty = Tracks.terrainY(track, p.x, p.z);
            if (ty == null) {
              voidProps.push({ kind: p.kind, at: [p.x, p.y, p.z] });
            } else {
              const gap = base - ty;
              if (gap > FLOAT_M) {
                floating.push({ kind: p.kind, at: [p.x, p.y, p.z], gapM: r2(gap),
                                sizeM: [p.w, p.h, p.d] });
              } else if (gap < -BURIED_M) {
                buried.push({ kind: p.kind, at: [p.x, p.y, p.z], gapM: r2(gap),
                              sizeM: [p.w, p.h, p.d] });
              }
            }
          }
          // Footprint over the racing surface. The lateral half-extent is NOT
          // max(w,d)/2: a 160 m grandstand runs its length ALONG the track, and
          // treating that as a radius flagged every stand on the circuit as
          // sitting on the road. For a world-axis-aligned box the true extent
          // along the track's right vector is the support function |w/2*ex| +
          // |d/2*ez|.
          // Anonymous hulls are mostly air (see `fill`), so an AABB overlapping
          // the road is not evidence of geometry on it — that reported 181
          // offenders on a circuit whose real prop-over-road count is zero.
          // Named props have tight measured boxes and can be judged; a dense
          // structure still can.
          // Gantries straddle the road by design — flagging them is noise.
          const judgeable = p.kind !== "gantry"
                            && ((p.measured && p.kind !== "structure")
                                || (p.fill != null && p.fill > 0.3));
          const pr = judgeable ? Tracks.project(track, p.x, p.z, null, p.y) : null;   // p.y: pick the right deck where the track crosses itself
          if (pr) {
            Tracks.sample(track, pr.s, scr);
            const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
            const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
            const latHalf = Math.abs(p.w / 2 * ex) + Math.abs(p.d / 2 * ez);
            const over = scr.hw - (Math.abs(pr.lat) - latHalf);
            if (over > 0 && p.y + p.h / 2 > scr.p[1] + 0.3) {
              propsOverRoad.push({ kind: p.kind, at: [p.x, p.y, p.z],
                                   frac: +(pr.s / total).toFixed(3),
                                   lateralM: r1(pr.lat), halfWidthM: r1(scr.hw),
                                   overlapM: r2(over) });
            }
          }
        }
      }

      const md = track.modelDiagnostics || {};
      const byWorst = (a, b) => Math.abs(b.gapM || b.overlapM || 0)
                              - Math.abs(a.gapM || a.overlapM || 0);
      floating.sort(byWorst); buried.sort(byWorst); propsOverRoad.sort(byWorst);

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        track: { id: track.def.id, name: track.def.name, lengthM: r1(total) },
        sampledAt: nAt, reachM: reach, latsPerStation: nLat,
        thresholds: { floatingAboveM: FLOAT_M, buriedBelowM: BURIED_M,
                      cliffSlope: CLIFF_SLOPE, terrainAboveRoadM: OVER_ROAD_M,
                      note: "props are deliberately sunk below grade (place 0.8 m, "
                            + "anchor 0.3 m), so `floating` means base above "
                            + "TERRAIN, not above zero" },
        summary: {
          propsChecked: checked,
          floating: floating.length, buried: buried.length,
          overVoid: voidProps.length,
          propsOverRoadCandidates: propsOverRoad.length,
          terrainHoles: holes.length, groundCliffs: cliffs.length,
          terrainOverRoad: overRoad.length,
          modelsSuppressed: (md.suppressed || []).length,
          modelsInvalid: (md.invalid || []).length,
          // Candidates are deliberately NOT part of the verdict: they are a
          // screen with known over-reporting, not a defect count.
          clean: !floating.length && !buried.length && !overRoad.length
                 && !holes.length && !cliffs.length && !(md.invalid || []).length,
        },
        floating: floating.slice(0, cap),
        buried: buried.slice(0, cap),
        overVoid: voidProps.slice(0, cap),
        // A SCREEN, not a verdict. Registry boxes are world-axis-aligned and
        // carry no orientation, so an elongated object on a curve inflates its
        // apparent lateral extent: on Monza this lists 6 candidates where the
        // vertex-level ground truth (tools/measure-props-over-road.mjs) is 0.
        propsOverRoadCandidates: propsOverRoad.slice(0, cap),
        terrainHoles: holes.slice(0, cap),
        groundCliffs: cliffs.slice(0, cap),
        terrainOverRoad: overRoad.slice(0, cap),
        modelDiagnostics: { suppressed: (md.suppressed || []).slice(0, cap),
                            invalid: (md.invalid || []).slice(0, cap) },
        profile: o.profile ? profile : undefined,
        authoritative: {
          propsOverRoad: "tools/measure-props-over-road.mjs (vertex-level)",
          terrainOverRoad: "tests/specs/terrain-over-road.spec.js",
        },
        note: "pass {profile:true} for the full lateral ground table. A terrain "
              + "hole (null between solid readings) is the classic cause of "
              + "floating props — the closed-form ground estimate takes over there.",
      };
    }

    return { survey };
  }

  return { create };
})();
