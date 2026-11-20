const Quali = (function () {
  "use strict";

  const STEP = 4;

  const QUALI_TRIM = 0.92;
  const PACE_CORNER = 1.15;

  const CALIB = {
    abudhabi: 0.9508, albert_park: 0.9488, anderstorp: 0.9649, bahrain: 0.9662, baku: 0.9653, brands_hatch: 0.9610,
    buddh: 0.9575, buenos_aires: 0.9582, catalunya: 0.9586, cota: 0.9386, dijon: 0.9506, donington: 0.9693,
    estoril: 0.9635, fuji: 0.9605, hockenheim: 0.9675, hungaroring: 0.9491, imola: 0.9802, indianapolis: 0.9492,
    interlagos: 0.9533, istanbul: 0.9554, jacarepagua: 0.9558, jeddah: 0.9640, jerez: 0.9621, korea: 0.9518,
    kyalami: 0.9563, madrid: 0.9509, magny_cours: 0.9654, mexico: 0.9510, miami: 0.9491, monaco: 0.9678,
    mont_tremblant: 0.9709, montreal: 0.9656, monza: 0.9532, mosport: 0.9364, mugello: 0.9410, nurburgring: 0.9552,
    okayama: 0.9651, paul_ricard: 0.9403, portimao: 0.9719, qatar: 0.9699, redbull: 0.9637, sepang: 0.9715,
    shanghai: 0.9470, silverstone: 0.9340, singapore: 0.9629, sochi: 0.9698, spa: 0.9562, suzuka: 0.9429,
    vegas: 0.9498, watkins_glen: 0.9689, zandvoort: 0.9611, zolder: 0.9623,
  };
  const CALIB_DEFAULT = 0.9584;
  const QUALI_CENTRE = 0.993;

  const EXEC_SPREAD = 0.012;
  const QUALI_BIAS = 0.003;

  const MEDALS = [["gold", 1.0], ["silver", 1.03], ["bronze", 1.07]];
  const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3 };
  function medalFor(t, pole) {
    if (!(t > 0) || !(pole > 0)) return null;
    for (const [m, k] of MEDALS) if (t <= pole * k) return m;
    return null;
  }

  function create(G) {
    Log.info("game", "Quali.create");

    let classification = null;
    let classTrack = null;
    let classMode = null;
    let _kCache = new Float64Array(0), _kCacheTrack = null;
    const _kAnon = new WeakMap();

    function hereId() { return (G.track && G.track.def && G.track.def.id) || null; }
    function modeId() {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) {
        const sl = Career.slot ? Career.slot() : null;
        return "career:" + (sl ? sl.flavour + ":" + sl.i : "?");
      }
      return G.seasonMode ? "season" : "gp";
    }

    function lapTime(track, vCap, grip, shape) {
      const n = track.n, total = track.total;
      const m = Math.max(8, Math.floor(n / STEP));
      const ds = total / m;
      const latMax = G.LAT_MAX * grip;
      const accel = (shape ? G.aTop() / paceNow() * shape.pace : G.aTop()) * grip;
      const brake = G.BRAKE * grip;
      const vFree = shape ? shape.free : 0, cornerK = shape ? shape.corner : 1;

      const _kId = (track && track.def && track.def.id) || null;
      const anon = _kId == null && track && typeof track === "object";
      let kc = anon ? _kAnon.get(track) : (_kCacheTrack === _kId ? _kCache : null);
      if (!kc || kc.length !== m) {
        kc = new Float64Array(m);
        for (let i = 0; i < m; i++) kc[i] = Math.abs(Tracks.curvature(track, (i / m) * total));
        if (anon) _kAnon.set(track, kc);
        else { _kCacheTrack = _kId; _kCache = kc; }
      }
      const v = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const k = kc[i];
        v[i] = k > 1e-5 ? Math.min(vCap, Math.sqrt(latMax / k) * cornerK) : vCap;
      }

      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < m; i++) {
          const j = (i + 1) % m;
          const a = vFree ? accel * Math.max(0.02, 1 - v[i] / vFree) : accel;
          const reach = Math.sqrt(v[i] * v[i] + 2 * a * ds);
          if (v[j] > reach) v[j] = reach;
        }

      for (let pass = 0; pass < 2; pass++)
        for (let i = m - 1; i >= 0; i--) {
          const j = (i + 1) % m;
          const reach = Math.sqrt(v[j] * v[j] + 2 * brake * ds);
          if (v[i] > reach) v[i] = reach;
        }

      let t = 0;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        t += (2 * ds) / Math.max(v[i] + v[j], 1);
      }
      return t;
    }

    function paceNow() { const vm = PhysicsConsts.VMAX; return vm > 0 ? G.vTop() / vm : 1; }

    function diffRow() { return PhysicsConsts.DIFF[G.difficulty] || PhysicsConsts.DIFF.normal; }
    function freeFor(tierV, skill) { return G.vTop() * tierV * skill * diffRow().ai; }
    function cornerFor(skill) { const dc = diffRow().corner; return skill * (dc > 0 ? dc : 1); }
    function seatWing(t) { const s = t && typeof Parts !== "undefined" && (Career.inCareer() && Career.aiSetup && Career.aiSetup(t) || Parts.getFactorySetup(t)); return s ? Parts.aeroLoad(s, t) : 0.5; }
    function wingFor(c) { return typeof AiDrive !== "undefined" && AiDrive.aeroGrip ? Math.sqrt(AiDrive.aeroGrip(c.human ? seatWing(c.team) : c.aeroLoad)) : 1; }
    function calibFor(track) {
      const id = track && track.def && track.def.id;
      return id != null && Object.prototype.hasOwnProperty.call(CALIB, id) ? CALIB[id] : CALIB_DEFAULT;
    }

    function paceLap(track, free, grip, corner) {
      const p = paceNow();
      return QUALI_TRIM * lapTime(track, free, grip, { pace: p, free, corner: PACE_CORNER * corner });
    }
    function carLap(c, track, grip, raw) {
      const free = freeFor(c.tierV, c.skill);
      const t = lapTime(track, free, grip, { pace: paceNow(), free, corner: PACE_CORNER * cornerFor(c.skill) * wingFor(c) });
      return raw ? t : QUALI_CENTRE * calibFor(track) * t;
    }

    function referenceGrip() {
      const w = G.trackWetness ? G.trackWetness() : NaN;
      if (typeof TyreModel === "undefined" || !Number.isFinite(w)) return G.gripMult();
      return TyreModel.weatherGrip(TyreModel.treadFor(G.raceWeather, w), w);
    }
    function referencePole() {
      const track = G.track;
      if (!track || !track.n) return 0;
      return paceLap(track, freeFor(Teams.TIER_V[0], 1), referenceGrip(), cornerFor(1));
    }

    function simLap(c, track, grip, round, seed) {
      const base = carLap(c, track, grip);
      const r = DriverRatings.get(c.code, c.tier, Career.devFor(c.team && c.team.id, c.seat));
      const spread = EXEC_SPREAD * (1 - r.consistency / 100);
      const draw = Career.hash(seed, round, "quali", c.driverId || c.code) - 0.5;
      return base * (1 + draw * 2 * spread) * (r.qualiBias ? 1 - QUALI_BIAS * DriverRatings.style01(r.qualiBias) : 1);
    }

    function drivenMap(driven) {
      if (!driven) return null;
      if (typeof driven === "number") {
        if (!(driven > 0)) return null;
        const me = G.cars.find((c) => c.isPlayer);
        return me ? new Map([[me.driverId, driven]]) : null;
      }
      if (driven instanceof Map) return driven.size ? driven : null;
      const m = new Map();
      for (const k of Object.keys(driven)) if (driven[k] > 0) m.set(k, driven[k]);
      return m.size ? m : null;
    }

    function compute(driven) {
      const track = G.track;
      if (!track || !G.cars.length) return null;
      const inCareer = Career.inCareer();
      const round = inCareer ? Career.round()
        : (G.seasonMode ? (typeof SeasonCal !== "undefined" && SeasonCal.drawRound && G.season ? SeasonCal.drawRound(G.season) : G.seasonRound) : 0);
      const seed = inCareer ? Career.seasonSeed()
        : G.flow === "season" && G.season && typeof SeasonCal !== "undefined" && SeasonCal.luckSeed
          ? SeasonCal.luckSeed(G.season, G.simSeed()) : G.simSeed();
      const real = drivenMap(driven);

      const rows = G.cars.map((c) => ({
        driverId: c.driverId, code: c.code, name: c.name,
        team: c.team && c.team.id, isPlayer: !!c.isPlayer,
        human: !!(real && real.has(c.driverId)),
        t: (real && real.get(c.driverId) > 0) ? real.get(c.driverId) : simLap(c, track, G.gripMult(c), round, seed),
        car: c,
      }));
      let slow = 0;
      for (const r of rows) if (Number.isFinite(r.t) && r.t > slow) slow = r.t;
      for (const r of rows) if (!Number.isFinite(r.t)) { slow += 1; r.t = slow; r.noTime = true; }
      rows.sort((a, b) => a.t - b.t);
      const pole = rows[0].t;
      rows.forEach((r, i) => { r.pos = i + 1; r.gap = +(r.t - pole).toFixed(3); r.t = +r.t.toFixed(3); });
      return rows;
    }

    function persistSeason(s) {
      try {
        if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer()) Career.save();
        else if (typeof SeasonCal !== "undefined") SeasonCal.save(s);
      } catch {  }
    }

    function seatKey(driverId, team) { return driverId + "|" + (team && team.id || team || ""); }

    function persistOrder() {
      const s = G.season;
      if (!s || !classification) return;
      if (!classification.some((r) => r.human)) return;
      if (G.netLobby && G.netLobby.qualifying && G.netLobby.qualifying()) return;
      if (G.netPlay && G.netPlay.active && G.netPlay.active()) return;
      if (typeof Career !== "undefined" && Career.conflicted && Career.conflicted()) return;
      if (typeof SeasonCal !== "undefined" && SeasonCal.conflicted && SeasonCal.conflicted()) return;
      if (modeId() === "gp" && s.qualiOrder && s.qualiMode !== "gp") return;
      s.qualiOrder = classification.map((r) => r.noTime
        ? { id: r.driverId, t: r.t, human: !!r.human, noTime: true }
        : { id: r.driverId, t: r.t, human: !!r.human });
      const me = classification.find((r) => r.isPlayer);
      if (me) s.qualiSeat = seatKey(me.driverId, me.team);
      else delete s.qualiSeat;
      s.qualiTrack = hereId();
      s.qualiMode = modeId();
      persistSeason(s);
    }

    function restoreFromSeason() {
      const mode = modeId();
      if (classification && ((classTrack && hereId() && classTrack !== hereId()) ||
                             (classMode && classMode !== mode))) {
        classification = null; classTrack = null; classMode = null;
      }
      let raw = G.season && G.season.qualiOrder;
      if (classification || !Array.isArray(raw) || !raw.length) return !!classification;
      const here = hereId();
      if (G.season.qualiTrack && here && G.season.qualiTrack !== here) return false;
      if (G.season.qualiMode && G.season.qualiMode !== mode) return false;
      const byId = new Map();
      if (G.cars) for (const c of G.cars) byId.set(c.driverId, c);
      let ids = raw.map((e) => e && typeof e === "object" ? e.id : e);
      const duel = byId.size === 2 && G.cars.some((c) => c && c.duelRival);
      if (duel && new Set(ids).size === ids.length && [...byId.keys()].every((id) => ids.includes(id))) {
        raw = raw.filter((e, i) => byId.has(ids[i]));
        ids = ids.filter((id) => byId.has(id));
      }
      if (ids.length !== byId.size || new Set(ids).size !== byId.size ||
          ids.some((id) => !byId.has(id))) return false;
      const seat = G.season.qualiSeat;
      if (seat) {
        const me = G.cars && G.cars.find((c) => c.isPlayer);
        if (me && seatKey(me.driverId, me.team) !== seat) return false;
      }
      classification = raw.map((entry, i) => {
        const obj = entry && typeof entry === "object";
        const driverId = obj ? entry.id : entry;
        const car = byId.get(driverId);
        return {
          driverId,
          pos: i + 1,
          t: obj && entry.t > 0 ? entry.t : 0,
          gap: 0,
          code: car ? car.code : "",
          name: car ? car.name : "",
          team: car && car.team ? (car.team.id || car.team) : null,
          isPlayer: !!(car && car.isPlayer),
          human: !!(obj && entry.human),
          ...(obj && entry.noTime ? { noTime: true } : null),
        };
      });
      classTrack = G.season.qualiTrack || here;
      classMode = G.season.qualiMode || mode;
      const pole = classification[0] && classification[0].t > 0 ? classification[0].t : 0;
      for (const r of classification) r.gap = pole && r.t > 0 ? +(r.t - pole).toFixed(3) : 0;
      return true;
    }

    function simulate(driven) {
      const rows = compute(driven);
      if (rows) { classification = rows; classTrack = hereId(); classMode = modeId(); persistOrder(); }
      Log.info("game", "Quali.simulate n=" + (rows ? rows.length : 0));
      return rows;
    }

    function preview(driven) {
      const rows = compute(driven);
      return rows ? rows.map(({ car, ...row }) => row) : null;
    }

    function order(live) {
      restoreFromSeason();
      if (!classification || !live || !live.length) return null;
      const byId = new Map(live.map((c) => [c.driverId, c]));
      const out = [];
      for (const r of classification) {
        const c = byId.get(r.driverId);
        if (c) out.push(c);
      }
      return out.length === live.length ? out : null;
    }
    function results() {
      restoreFromSeason();
      if (!classification || !classification.some((r) => r.t > 0)) return null;
      return classification.map(({ car, ...row }) => row);
    }
    function forgetOrder() {
      const s = G.season;
      if (!s || !s.qualiOrder) return;
      delete s.qualiOrder;
      delete s.qualiTrack;
      delete s.qualiMode;
      delete s.qualiSeat;
      persistSeason(s);
    }
    function clear(forget) {
      classification = null;
      classTrack = null; classMode = null;
      if (forget) forgetOrder();
    }

    function begin() {
      restoreFromSeason();
      if (classification) return classification;
      return simulate(0);
    }

    function rows() {
      return classification ? classification.map(({ car, ...row }) => row) : null;
    }

    return { simulate, preview, order, results, rows, clear, begin, carLap, referencePole };
  }

  return { create, MEDALS, MEDAL_RANK, medalFor };
})();
Object.freeze(Quali);
