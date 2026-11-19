var PitGeom = (function () {
  "use strict";

  const clamp = M4.clamp;

  const ENTRY_M = 260;
  const ENTRY_MIN = 150;
  const EXIT_M = 110;
  const BOX_M = 40;

  const PIT_K = 0.0035;
  const PIT_STEP = 8;

  function entryRunM(track) {
    const L = track.total;
    if (!(L > 0) || typeof Tracks === "undefined" || !Tracks.curvature) return ENTRY_M;
    let d = 0;
    for (; d < ENTRY_M; d += PIT_STEP) {
      const s = ((-(d + PIT_STEP / 2)) % L + L) % L;
      if (Math.abs(Tracks.curvature(track, s)) > PIT_K) break;
    }
    return clamp(d, ENTRY_MIN, ENTRY_M);
  }

  const LIMIT_FRAC = 22.2 / 72;
  const STRAIGHT_V = 0.85;
  const LIMIT_FRAC_STREET = 16.7 / 72;

  const BOX_S = 2.2;

  const BOX_SPEED_FRAC = 0.06;
  const BOX_TOL = 8;
  const BOX_BRAKE = 6;

  const PIT_SIDE = 1;
  const LANE_W = 3.2;
  const LANE_MIN = 2.4;
  const MIN_RACING = 7.0;
  function laneWidth(hw) {
    return Math.min(LANE_W, Math.max(LANE_MIN, 2 * hw - MIN_RACING));
  }
  function laneWidthOn(track, hw) {
    return track && track.pitW ? track.pitW.laneW : laneWidth(hw);
  }
  function teamRow(c) {
    const t = c && c.team;
    if (!t || typeof Teams === "undefined" || !Teams.LIST) return -1;
    const id = typeof t === "object" ? t.id : t;
    return Teams.LIST.findIndex(function (x) { return x.id === id; });
  }
  const BOX_LAT = 1.0;
  const BOX_SQUARE_LAT = 1.2;
  const BOX_SQUARE_RAD = 0.22;
  const SQUARE_BY_M = 6;
  const pitch = () => (typeof TrackPit !== "undefined" ? TrackPit.PITCH : 11);
  const GRID_POLE_M = 14;
  const COMMIT_M = 120;
  const CUE_M = 550;
  const CUE_WEAR = 0.55;
  const COMMIT_CLEAR = 25;
  const GRID_CLEAR = COMMIT_CLEAR + 15;
  const COMMIT_S = 0.55;
  const COMMIT_V = 0.10;
  const COMMIT_IN = 0.5;
  const ABORT_S = 1.0;
  const CRAWL_V = 3;
  const APPROACH_M = 200;
  const ENTRY_BRAKE = 10;
  const ROAD_IN = 1.6;
  const WORK_IN_M = 20;
  const EXIT_WALL_W = typeof TrackPit !== "undefined" && TrackPit.EXIT_WALL_W != null ? TrackPit.EXIT_WALL_W : 0.45;

  function zoneOf(track) {
    if (!track || !(track.total > 0)) return null;
    const L = track.total;
    const z = (track.def && track.def.pitZone) || {};
    const wrap = (v) => ((v % L) + L) % L;
    const model = track.pit;
    if (model) {
      return {
        sIn: model.sIn, sOut: model.sOut, sBox: wrap(-(z.boxM != null ? z.boxM : BOX_M)),
        lenM: model.lenM,
        limitFrac: z.limitFrac != null ? z.limitFrac : (model.limitKph / 3.6) / 72,
        boxS: z.boxS != null ? z.boxS : BOX_S,
        side: model.side,
      };
    }
    const eng = typeof Tracks !== "undefined" && Tracks.pitWindow ? Tracks.pitWindow(track) : null;
    const entryM = z.entryM != null ? z.entryM : (eng ? eng.entryM : entryRunM(track));
    const exitM = z.exitM != null ? z.exitM : EXIT_M;
    const cap = L / 3;
    const inM = Math.min(entryM, cap * 0.7), outM = Math.min(exitM, cap * 0.3);
    const zone = {
      sIn: wrap(-inM), sOut: wrap(outM), sBox: wrap(-(z.boxM != null ? z.boxM : BOX_M)),
      lenM: inM + outM,
      limitFrac: z.limitFrac != null ? z.limitFrac
        : (track.def && track.def.street ? LIMIT_FRAC_STREET : LIMIT_FRAC),
      boxS: z.boxS != null ? z.boxS : BOX_S,
      side: z.side === -1 ? -1 : PIT_SIDE,
    };
    return zone;
  }

  function inWindow(zone, s, L) {
    return !!zone && inSpan(zone.sIn, zone.sOut, s, L);
  }
  function inSpan(a, b, s, L) {
    const v = ((s % L) + L) % L;
    return a <= b ? (v >= a && v <= b) : (v >= a || v <= b);
  }

  function throughM(zone, s, L) {
    const v = ((s % L) + L) % L;
    return ((v - zone.sIn) % L + L) % L;
  }

  return { ENTRY_M, ENTRY_MIN, EXIT_M, PIT_K, entryRunM, LIMIT_FRAC, STRAIGHT_V, LIMIT_FRAC_STREET, BOX_SPEED_FRAC, BOX_TOL, BOX_BRAKE, PIT_SIDE, LANE_W, LANE_MIN, MIN_RACING, laneWidth, laneWidthOn, teamRow, BOX_LAT, BOX_SQUARE_LAT, BOX_SQUARE_RAD, SQUARE_BY_M, pitch, GRID_POLE_M, COMMIT_M, CUE_M, CUE_WEAR, COMMIT_CLEAR, GRID_CLEAR, COMMIT_S, COMMIT_V, COMMIT_IN, ABORT_S, CRAWL_V, APPROACH_M, ENTRY_BRAKE, ROAD_IN, WORK_IN_M, EXIT_WALL_W, zoneOf, inWindow, inSpan, throughM };
})();
Object.freeze(PitGeom);
