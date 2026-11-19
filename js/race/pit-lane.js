var PitLane = (function () {
  "use strict";

  const clamp = M4.clamp;
  const {
    ENTRY_M, ENTRY_MIN, EXIT_M, PIT_K, entryRunM, LIMIT_FRAC, STRAIGHT_V, LIMIT_FRAC_STREET, BOX_SPEED_FRAC, BOX_TOL, BOX_BRAKE, PIT_SIDE, LANE_W, LANE_MIN, MIN_RACING, laneWidth, laneWidthOn, teamRow, BOX_LAT, BOX_SQUARE_LAT, BOX_SQUARE_RAD, SQUARE_BY_M, pitch, GRID_POLE_M, COMMIT_M, CUE_M, CUE_WEAR, COMMIT_CLEAR, GRID_CLEAR, COMMIT_S, COMMIT_V, COMMIT_IN, ABORT_S, CRAWL_V, APPROACH_M, ENTRY_BRAKE, ROAD_IN, WORK_IN_M, EXIT_WALL_W, zoneOf, inWindow, inSpan, throughM,
  } = PitGeom;


  function create(G) {
    Log.info("game", "PitLane.create");
    let zone = null, zoneFor = null;

    function z() {
      const t = G.track;
      if (!t) return null;
      if (zoneFor !== t) { zoneFor = t; zone = zoneOf(t); }
      return zone;
    }

    function enabled() { return !!(z() && G.tyres && G.tyres.on()); }

    function limit() {
      const zz = z();
      return zz ? G.vTop() * zz.limitFrac : Infinity;
    }

    function limitKphShown() {
      const l = limit();
      return Number.isFinite(l) ? G.dashKph(l) : Infinity;
    }

    function limitText() {
      const k = limitKphShown();
      const AO = typeof AppearanceOpts !== "undefined" ? AppearanceOpts : null;
      if (!AO || typeof AO.speed !== "function" || !Number.isFinite(k)) return String(Math.round(k));
      const unit = typeof AO.unitLabel === "function" ? AO.unitLabel() : "KM/H";
      return AO.speed(k) + (unit === "KM/H" ? "" : " " + unit);
    }

    function ribbonRange(zz, L) {
      if (typeof Tracks === "undefined" || !Tracks.pitLaneSpan || !G.track) return null;
      const sp = Tracks.pitLaneSpan(G.track);
      if (!sp) return null;
      const a = throughM(zz, sp.sIn, L);
      return { a, b: a + sp.lenM };
    }
    function boxThroughFor(c, zz, L) {
      const model = G.track && G.track.pit;
      if (model && model.row && model.row.boxes.length) {
        const t = c && c.team;
        const id = t ? (typeof t === "object" ? t.id : t) : null;
        let i = TrackPit.rowOf(model, id);
        if (i < 0) i = model.row.boxes.length - 1;
        return model.row.boxes[i].through;
      }
      const row = teamRow(c);
      const n = row < 0 ? 1 : Teams.LIST.length;
      const BOX_PITCH = pitch();
      const span = (n - 1) * BOX_PITCH;
      const poleS = ((-GRID_POLE_M % L) + L) % L;
      const wantFirst = throughM(zz, poleS, L) + GRID_CLEAR;
      const rib = ribbonRange(zz, L);
      const lo = rib ? rib.a + 20 : COMMIT_M + 20;
      const hi = Math.max(lo, (rib ? rib.b : zz.lenM) - 30 - span);
      const first = clamp(Math.max(wantFirst, throughM(zz, zz.sBox, L) - span / 2), lo, hi);
      if (row < 0) return first + span / 2;
      return first + row * BOX_PITCH;
    }

    function estimate(c) {
      const zz = z();
      if (!zz) return null;
      const flag = cautionLevel();
      if (flag >= 4) return null;
      const roadFrac = Math.min(STRAIGHT_V, flag === 3 ? 0.45 : flag === 2 ? 0.6 : 1);
      const loss = lossAt(roadFrac);
      let behind = null;
      for (const o of G.cars || []) {
        if (o !== c && !o.retired && !o.finished && o.prog < c.prog && (!behind || o.prog > behind.prog)) behind = o;
      }
      const gapS = behind ? (c.prog - behind.prog) / Math.max(1, behind.speed || G.vTop() * roadFrac) : null;
      return { lossS: loss, gapS, marginS: gapS == null ? null : gapS - loss, caution: flag >= 2, estimated: true };
    }
    function choices(c) {
      if (!G.tyres) return [];
      const list = ownedRecords(G.tyres).slice();
      const automatic = pickFor(c);
      if (automatic && !list.some(r => r.id === automatic.id)) list.push(automatic);
      return list;
    }
    function selectNext(c, id) {
      if (!c || !c.local || c.pitState === "box") return false;
      if (id == null || id === "auto") { c.pitNext = null; return true; }
      const record = choices(c).find(r => r.id === id);
      if (!record) return false;
      setNext(c, record); return true;
    }

    function toBox(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c || !inWindow(zz, c.s, t.total)) return -1;
      return boxThroughFor(c, zz, t.total) - throughM(zz, c.s, t.total);
    }

    function toEntry(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c) return -1;
      if (inWindow(zz, c.s, t.total)) return 0;
      const d = ((zz.sIn - c.s) % t.total + t.total) % t.total;
      return d;
    }

    const BOX_CUE_M = 90;
    const MOVE_M = 36;
    const SERVED_S = 1.2;
    const MERGE_S = 3;
    const _said = {};
    let _lastCue = null;
    function taught() { return G.store && G.store.get ? !!G.store.get("pitTaught", 0) : false; }
    function teach(k, msg) {
      if (_said[k] || taught()) return;
      _said[k] = true;
      if (G.announce) G.announce(msg, 2.2, "race");
    }
    function cautionLevel() {
      if (G.cautionLevel) return G.cautionLevel();
      return G.cautionInfo ? G.cautionInfo().level : 0;
    }
    function closingCar(c) {
      const cars = G.cars || [];
      const L = G.track && G.track.total;
      if (!(L > 0)) return null;
      let best = null, bestGap = MERGE_S;
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o === c || o.retired || o.finished || inLane(o)) continue;
        const behind = ((c.s - o.s) % L + L) % L;
        if (!(behind > 0 && behind < L * 0.5)) continue;
        const gap = behind / Math.max(1, o.speed || 0);
        if (gap < bestGap) { bestGap = gap; best = o; }
      }
      return best;
    }
    function toExit(c) {
      const zz = z(), t = G.track;
      if (!zz || !t) return 0;
      const p = t.pit, end = p && !p.painted && p.sB != null ? p.sB : zz.sOut;
      const d = ((end - c.s) % t.total + t.total) % t.total;
      return d > zz.lenM + exitRoadM() + 50 ? 0 : d;
    }
    function exitRoadM() {
      const t = G.track, p = t && t.pit;
      return p && !p.painted && p.sB != null ? ((p.sB - p.sOut) % t.total + t.total) % t.total : 0;
    }
    function exitLen(c) {
      const zz = z(), t = G.track;
      return Math.max(1, zz.lenM - boxThroughFor(c, zz, t.total) + exitRoadM());
    }
    function worthStopping(c) {
      if (!enabled() || !c || c.retired || c.finished) return false;
      const wear = G.tyres.spent(c);
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      const free = !!caution && caution.level >= 2 && caution.level < 4 && wear >= 0.35;
      return wear >= CUE_WEAR || wrongTread || free;
    }
    function cue(c) {
      const r = cueOf(c);
      if (c && c.local) _lastCue = r;
      return r;
    }
    function cueOf(c) {
      if (!enabled() || !c || !c.local || c.retired || c.finished) return null;
      const st = c.pitState || "none";
      if (st === "box") return { phase: "box", text: "STOP", dist: 0, frac: 1 };
      if (st === "lane") {
        const togo = toBox(c);
        if (togo > -BOX_TOL && togo < BOX_CUE_M) {
          Tracks.sample(G.track, c.s, _smp);
          const zz = z(), frac = 1 - togo / BOX_CUE_M;
          if (togo > MOVE_M) {
            return { phase: "lane", text: "STAY IN LANE · BOX " + Math.round(togo) + "m", dist: togo, frac };
          }
          if (!inBoxLat(c, _smp.hw || 0, zz.side)) {
            return { phase: "keep", text: zz.side > 0 ? "KEEP RIGHT" : "KEEP LEFT", dist: 0, frac };
          }
          teach("gate", "STOP ON THE GLOWING GATE");
          if (togo > BOX_TOL) {
            return { phase: "near-box", text: "PULL IN · " + Math.round(togo) + "m", dist: togo, frac };
          }
          return boxSquare(c, _smp, zz.side)
            ? { phase: "stop", text: "STOP HERE", dist: 0, frac: 1 }
            : { phase: "square", text: "SQUARE IT UP", dist: 0, frac: 1 };
        }
        if (togo < -BOX_TOL * 2) return { phase: "missed", text: "BOX MISSED", dist: togo, frac: 0 };
        teach("line", "HOLD THE LANE — STOP AT YOUR CREST");
        return { phase: "lane", text: "STAY IN LANE · " + limitText() + " LIMIT", dist: 0, frac: 0 };
      }
      if (st === "out") {
        const o = closingCar(c);
        if ((c.pitOutT || 0) > 0) return { phase: "served", text: o ? "GO — " + (o.code || "CAR") + " CLOSING" : "GO GO GO", dist: 0, frac: 1 };
        if (o) return { phase: "merge", text: "MERGE — " + (o.code || "CAR") + " CLOSING", dist: 0, frac: 1 };
        const m = toExit(c);
        return m > 0 ? { phase: "out", text: "EXIT " + Math.round(m) + "m", dist: m, frac: clamp(1 - m / exitLen(c), 0, 1) } : null;
      }
      const d = toEntry(c);
      if (d < 0 || d > CUE_M) return null;
      if (c.pitArmed) {
        const next = nextFor(c);
        return { phase: "armed", text: "STAY IN LANE · BOX BOX" + (next && next.code ? " — " + next.code : ""), dist: 0, frac: 1 };
      }
      if (!worthStopping(c)) return null;
      if (roadOf(c) === "entry" || (d === 0 && throughM(z(), c.s, G.track.total) <= COMMIT_M)) {
        teach("road", "PIT ENTRY — TAKE THE PIT ROAD TO BOX");
        return { phase: "enter", text: "HOLD THE LANE", dist: 0, frac: 1 };
      }
      if (d === 0) return null;
      return { phase: "near", text: "PIT " + Math.round(d) + "m", dist: d, frac: 1 - d / CUE_M };
    }

    function approachV(c) {
      if (c.pitState === "out" || c.pitState === "box") return Infinity;
      const togo = toBox(c);
      if (togo < 0) return Infinity;
      const v = Math.sqrt(2 * BOX_BRAKE * Math.max(0, togo - BOX_TOL * 0.5));
      if (v >= CRAWL_V) return v;
      Tracks.sample(G.track, c.s, _smp);
      return inBoxLat(c, _smp.hw || 0, z().side) ? v : CRAWL_V;
    }

    function entryV(c) {
      const d = toEntry(c);
      if (!(d > 0)) return Infinity;
      const lim = limit();
      const p = G.track && G.track.pit;
      const road = p && !p.painted ? p.entryRoadM || 0 : 0;
      return Math.sqrt(lim * lim + 2 * ENTRY_BRAKE * Math.max(0, d - road - 4));
    }

    function exitV(c) {
      if (!c || c.pitState !== "out" || roadOf(c) !== "exit") return Infinity;
      Tracks.sample(G.track, c.s, _smp);
      return Math.abs(c.x || 0) > (_smp.hw || 0) - 0.5 ? limit() : Infinity;
    }

    function roadOf(c) {
      const p = G.track && G.track.pit;
      if (!p || !c || p.painted) return null;
      const L = G.track.total;
      if (inSpan(p.sA, p.sIn, c.s, L)) return "entry";
      if (inSpan(p.sOut, p.sB, c.s, L)) return "exit";
      return null;
    }

    function inLane(c) {
      if (!c) return false;
      if (c.pitState === "lane" || c.pitState === "box") return true;
      return c.pitState === "out" && inWindowOf(c);
    }

    function held(c) {
      return inLane(c) || (!!c && c.pitState === "out" && roadOf(c) === "exit");
    }

    function inWindowOf(c) {
      const zz = z(), t = G.track;
      return !!(zz && t && c && inWindow(zz, c.s, t.total));
    }

    function arm(c, on) {
      if (!c || !enabled()) return false;
      c.pitArmed = on == null ? !c.pitArmed : !!on;
      if (!c.pitArmed) c.pitPos0 = 0;
      if (c.pitArmed && !(c.pitPos0 > 0)) c.pitPos0 = rankOf(c);
      return c.pitArmed;
    }
    function rankOf(c) { const r = G.ranked; return r ? r.indexOf(c) + 1 : 0; }
    function release(c, zz) {
      c.pitOutT = SERVED_S;
      Log[c.local ? "info" : "debug"]("race", "Pit stop done car=" + c.code + " lap=" + c.lap + " stop=" + (c.pitStops || 0) +
        " held=" + ((zz ? zz.boxS : 0) + (c.pitWorked || 0)).toFixed(1) + "s pos=" + rankOf(c) + (c.pitWorked > 0 ? " work" : ""));
      if (!c.local) return;
      const pos = rankOf(c), k = c.pitPos0 > 0 && pos > 0 ? c.pitPos0 - pos : 0;
      const places = k === 0 ? "" : ", " + (k > 0 ? "+" : "") + k + (Math.abs(k) === 1 ? " PLACE" : " PLACES");
      const held = zz.boxS + (c.pitWorked || 0);
      if (G.announce) G.announce("STOP " + held.toFixed(1) + "s" + (c.pitWorked > 0 ? " — WORK DONE" : "") + (pos > 0 ? " — P" + pos + places : ""), 2.2, "race");
      c.pitPos0 = 0; c.pitWorked = 0;
      if (G.store && G.store.set && !taught()) G.store.set("pitTaught", 1);
    }

    const WORK_S = 15;
    function canWork(c) {
      return !!(c && c.local && !c.retired && !c.finished &&
                c.pitState === "box" && (c.pitT || 0) > 0);
    }
    function addWork(c) {
      if (!canWork(c)) return 0;
      c.pitWorked = (c.pitWorked || 0) + WORK_S;
      c.pitT = (c.pitT || 0) + WORK_S;
      return WORK_S;
    }

    const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    function lw(hw) { return laneWidthOn(G.track, hw); }
    function laneEdge(hw, side) { return (hw - lw(hw)) * side; }
    function ribbonAt(s) {
      if (typeof Tracks === "undefined" || !Tracks.pitLaneAt || !G.track || s == null) return null;
      return Tracks.pitLaneAt(G.track, s);
    }
    function laneCentre(hw, side, s) {
      const rib = ribbonAt(s);
      if (rib) return rib.workCentre != null ? rib.workCentre : rib.centre;
      return (hw - lw(hw) * 0.5) * side;
    }
    function laneDrive(hw, side, s, lead) {
      const rib = ribbonAt(s);
      if (!rib) return laneCentre(hw, side, s);
      const p = G.track.pit;
      const inner = rib.inner * side + (lead ? p.off.fastIn * (1 - rib.v) : 0);
      const fastC = inner + p.bands.fast * 0.5;
      const roadC = hw - ROAD_IN;
      let x = roadC + (fastC - roadC) * rib.w;
      if (!lead) {
        const hold = hw + p.bands.verge * rib.v + 1.45;
        if (rib.w >= EXIT_WALL_W) x = Math.max(x, hold);
        else x = roadC + (hold - roadC) * Math.pow(rib.w / EXIT_WALL_W, 2);
      }
      return side * x;
    }
    function inLaneLat(c, hw, side) {
      const rib = ribbonAt(c && c.s);
      if (rib) return (c.x || 0) * side >= rib.inner * side - BOX_LAT;
      return (c.x || 0) * side >= Math.max(1, hw - lw(hw) - BOX_LAT);
    }
    function inBoxLat(c, hw, side) {
      const rib = ribbonAt(c && c.s);
      if (rib && rib.workIn != null) return (c.x || 0) * side >= rib.workIn * side - BOX_LAT;
      return inLaneLat(c, hw, side);
    }
    function boxBusy(c) {
      const zz = z(), t = G.track;
      if (!zz || !t || !c) return false;
      const cars = G.cars;
      if (!cars || cars.length < 2) return false;
      const mine = boxThroughFor(c, zz, t.total);
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o === c || !o || o.retired || o.pitState !== "box") continue;
        if (Math.abs(boxThroughFor(o, zz, t.total) - mine) < 1e-6) return true;
      }
      return false;
    }

    function boxSquare(c, smp, side) {
      if (!inBoxLat(c, (smp && smp.hw) || 0, side)) return false;
      if (!c.local) return true;
      const want = laneCentre((smp && smp.hw) || 0, side, c && c.s);
      if (Math.abs((c.x || 0) - want) > BOX_SQUARE_LAT) return false;
      if (!(Number.isFinite(c.head) && smp && smp.t)) return true;
      let rel = c.head - Math.atan2(smp.t[0], smp.t[2]);
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      return Math.abs(rel) <= BOX_SQUARE_RAD;
    }
    function laneX(c, hw, want) {
      const zz = z();
      if (!zz || !c) return want;
      const road = roadOf(c);
      const guided = inLane(c) || (c.pitState === "out" && road === "exit") ||
                     (!c.human && c.pitArmed && road === "entry");
      if (!guided) {
        const p = G.track && G.track.pit;
        if (!c.human && c.pitArmed && p && !p.painted && road == null && !inWindowOf(c)) {
          const d = toEntry(c) - p.entryRoadM;
          if (d > 0 && d < APPROACH_M) return (hw - ROAD_IN) * zz.side;
        }
        return want;
      }
      const togo = inWindowOf(c) ? toBox(c) : -Infinity;
      const fast = laneDrive(hw, zz.side, c.s, road === "entry");
      if (c.pitState === "out" || !(togo > -BOX_TOL && togo < WORK_IN_M)) return fast;
      const span = Math.max(1, WORK_IN_M - SQUARE_BY_M);
      const u = Math.min(1, Math.max(0, (WORK_IN_M - togo) / span));
      return fast + (laneCentre(hw, zz.side, c.s) - fast) * u;
    }
    function committing(c, zz, L) {
      if (c.offroad || c.wrongWay || c.rescueT > 0) return false;
      if (!((c.speed || 0) > G.vTop() * COMMIT_V)) return false;
      const at = inWindowOf(c) ? throughM(zz, c.s, L) : -1;
      if (at > boxThroughFor(c, zz, L) - COMMIT_CLEAR) return false;
      const rib = ribbonAt(c.s);
      if (rib) return (c.x || 0) * zz.side >= rib.inner * zz.side + COMMIT_IN;
      Tracks.sample(G.track, c.s, _smp);
      const hw = _smp.hw || 0;
      return (c.x || 0) * zz.side >= laneEdge(hw, zz.side) * zz.side;
    }

    const _boxU = [0, 0], _laneU = [0, 0, 0, 0];

    function boxUniform() {
      const zz = z(), t = G.track, car = G.player;
      if (!enabled() || !zz || !t || !car) return null;
      if (t.pit && !t.pit.painted) return null;
      _boxU[0] = boxThroughFor(car, zz, t.total); _boxU[1] = BOX_TOL * 0.75;
      return _boxU;
    }

    function laneUniform() {
      const zz = z(), t = G.track;
      if (!enabled() || !zz || !t) return null;
      if (t.pit && !t.pit.painted) return null;
      _laneU[0] = zz.sIn; _laneU[1] = zz.lenM; _laneU[2] = zz.side; _laneU[3] = t.total;
      return _laneU;
    }

    function commitFrac(c) {
      return c ? clamp((c.pitCommitT || 0) / COMMIT_S, 0, 1) : 0;
    }

    function commitNow(c) {
      c.pitCommitT = 0; c.pitCommitted = true;
      arm(c, true);
      const next = nextFor(c);
      if (G.announce) G.announce("PIT ENTRY — LIMITER ON" + (next ? " — " + next.code : ""), 1.6, "race");
    }
    function update(c, dt) {
      if (!c || c.retired) return;
      if (!enabled()) { clearArm(c); c.pitNext = null; return; }
      const st = c.pitState || "none";
      if (!c.human && c.pitArmed && st === "none" && !owesCompound(c) &&
          ((G.lapsTarget > 0 && (c.lap || 0) >= G.lapsTarget) || flagNow())) clearArm(c);
      const zz = z(), L = zoneFor.total;
      if (st === "out" && c.pitOutT > 0) c.pitOutT = Math.max(0, c.pitOutT - dt);
      if (c.pitPlan && c.lap !== c._planLap && (c.human ? c.local : !c.pitPlan.scripted)) { c._planLap = c.lap; if ((c.lap || 0) > 1) replan(c); }
      if (!inWindowOf(c)) {
        if (st === "out" && roadOf(c) === "exit") return;
        if (st !== "none") { c.pitState = "none"; c.pitT = 0; if (c.local) { arm(c, false); c.pitCommitted = false; } }
        if (c.local && roadOf(c) === "entry") {
          if (!c.pitArmed) {
            c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
            if (c.pitCommitT >= COMMIT_S) commitNow(c);
          } else if (c.pitCommitted) {
            Tracks.sample(G.track, c.s, _smp);
            c.pitAbortT = inLaneLat(c, _smp.hw || 0, zz.side) ? 0 : (c.pitAbortT || 0) + dt;
            if (c.pitAbortT >= ABORT_S) {
              c.pitAbortT = 0; c.pitCommitted = false; arm(c, false);
              if (G.announce) G.announce("PIT ENTRY ABORTED", 1.4, "race");
            }
          }
        }
        return;
      }
      if (st === "box") {
        if (!c.pitFitted) {
          const a = stopAnim(c);
          if (a.u >= 0.50) { serviceCar(c); c.pitFitted = true; }
        }
        c.pitT = (c.pitT || 0) - dt;
        if (c.pitT <= 0) {
          if (!c.pitFitted) { serviceCar(c); c.pitFitted = true; }
          c.pitState = "out"; c.pitT = 0; release(c, zz);
        }
        return;
      }
      if (st === "out") return;
      if (!c.pitArmed && c.local) {
        c.pitCommitT = committing(c, zz, L) ? (c.pitCommitT || 0) + dt : 0;
        if (c.pitCommitT >= COMMIT_S) commitNow(c);
      }
      if (!c.pitArmed && !inLane(c)) return;
      const at = throughM(zz, c.s, L), boxAt = boxThroughFor(c, zz, L);
      if (st === "none" && at > boxAt + BOX_TOL * 2) return;
      if (st === "none" && ribbonAt(c.s)) {
        Tracks.sample(G.track, c.s, _smp);
        if (!inLaneLat(c, _smp.hw || 0, zz.side)) return;
      }
      c.pitState = "lane";
      if (boxBusy(c)) return;
      if (at >= boxAt - BOX_TOL && at <= boxAt + BOX_TOL * 2 && Math.abs(c.speed) < G.vTop() * BOX_SPEED_FRAC) {
        Tracks.sample(G.track, c.s, _smp);
        if (!boxSquare(c, _smp, zz.side)) return;
        c.pitState = "box";
        c.pitT = zz.boxS;
        c.pitArmed = false;
        c.pitStops = (c.pitStops || 0) + 1;
        c.pitFitted = false;
      }
    }


    let tyreCat;
    function ownedTyres() {
      const cat = tyreCat || (tyreCat = Parts.CATALOG.find(function (x) { return x.id === "tyres"; }));
      const opts = (cat && cat.options) || [];
      const team = G.player && G.player.team;
      const own = team && typeof Career !== "undefined" && Career.owned
        ? Career.owned(team.id) : null;
      return own ? opts.filter(function (o) { return own.has(o.id); }) : opts;
    }

    const recMemo = { tyres: null, rows: null, recs: null }, pickMemo = new WeakMap();
    function ownedRecords(tyres) {
      const rows = ownedTyres(), m = recMemo;
      let same = m.tyres === tyres && !!m.rows && m.rows.length === rows.length;
      for (let i = 0; same && i < rows.length; i++) same = m.rows[i] === rows[i];
      if (!same) { m.tyres = tyres; m.rows = rows.slice(); m.recs = rows.map(function (o) { return tyres.optionRecord(o); }); }
      return m.recs;
    }
    function pickFor(c) {
      const tyres = G.tyres;
      if (!tyres || !c) return null;
      const want = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      const list = ownedRecords(tyres), log = c.tyreLog;
      const rule = want === 0 && twoCompoundApplies() && typeof SportingRegs !== "undefined";
      const plan = c.pitPlan, cls = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      const lapsLeft = Math.max(1, lapsToFlag(c));
      let mask = 0;
      for (let i = 0; i < list.length && i < 30; i++) if (tyres.planLaps(list[i].life, G.lapsTarget) >= lapsLeft) mask |= 1 << i;
      const logLen = rule && log ? log.length : -1, logLast = logLen > 0 ? log[logLen - 1] && log[logLen - 1].code : null;
      let m = pickMemo.get(c);
      if (m && list.length <= 30 && m.recs === list && m.want === want && m.rule === rule && m.log === log && m.logLen === logLen
        && m.logLast === logLast && m.cls === cls && m.mask === mask) return m.out;
      const out = pickUncached(c, tyres, want, list, rule, log, cls, lapsLeft);
      if (!m) pickMemo.set(c, m = {});
      m.recs = list; m.want = want; m.rule = rule; m.log = log; m.logLen = logLen; m.logLast = logLast; m.cls = cls; m.mask = mask; m.out = out;
      return out;
    }
    function pickUncached(c, tyres, want, list, rule, log, cls, lapsLeft) {
      let right = list.filter(function (r) { return (r.tread || 0) === want; });
      if (!right.length) {
        const tc = TyreModel.classForTread(want);
        return tc ? tyres.classRecord(tc) : (list[0] || null);
      }
      if (rule && SportingRegs.compoundShort(log)) {
        const ran = new Set((log || []).map(function (e) { return e && e.code; }));
        const fresh = right.filter(function (r) { return !ran.has(r.code); });
        if (fresh.length) right = fresh;
      }
      const code = cls && TyreModel.AI_CLASS[cls] ? TyreModel.AI_CLASS[cls].code : null;
      const planned = code ? right.filter(function (r) { return r.code === code; }) : [];
      if (planned.length) right = planned;
      const lasts = right.filter(function (r) {
        return tyres.planLaps(r.life, G.lapsTarget) >= lapsLeft;
      });
      const pool = lasts.length ? lasts : right;
      return pool.reduce(function (best, r) {
        if (!best) return r;
        return lasts.length ? (r.life < best.life ? r : best)
                            : (r.life > best.life ? r : best);
      }, null);
    }

    function nextFor(c) {
      if (c && !c.local && !c.human && c.pitNext) { refreshAiNext(c); return c.pitNext; }
      const automatic = c && (c.local || c.pitNext) ? pickFor(c) : null;
      const selected = c && c.pitNext;
      if (!selected || !automatic) return selected || automatic;
      return (selected.tread || 0) === (automatic.tread || 0) ? selected : automatic;
    }

    function serviceCar(c) {
      const next = nextFor(c), from = c.tyre ? c.tyre.id : "none";
      G.tyres.fit(c, next || (c.tyreOpt ? G.tyres.optionRecord(c.tyreOpt) : G.tyres.classRecord(c.tyreClass || "medium")));
      Log[c.local ? "info" : "debug"]("race", "Pit tyres fitted car=" + c.code + " lap=" + c.lap + " stop=" + (c.pitStops || 0) + " tyre=" + from + "->" + (c.tyre ? c.tyre.id : "none"));
      c.pitNext = null;
    }

    function setNext(c, record) { if (c) c.pitNext = record || null; }

    function aiClassFor(c, wantTread, wrongTread) {
      const wetCls = TyreModel.classForTread(wantTread);
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget);
      const lapsLeft = Math.max(1, lapsToFlag(c));
      const plan = c.pitPlan, planned = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      return wrongTread ? (wetCls || AiDrive.compoundFor(lapsLeft, lifeLaps))
           : wantTread > 0 && wetCls ? wetCls
           : (planned || AiDrive.compoundFor(lapsLeft, lifeLaps));
    }
    function refreshAiNext(c) {
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      if ((c.pitNext.tread || 0) === wantTread) return;
      setNext(c, G.tyres.classRecord(aiClassFor(c, wantTread, !!c.tyre && (c.tyre.tread || 0) !== wantTread)));
    }


    const RACE_PACE = 1.03;
    function referenceLapS() {
      const pole = G.referencePole ? G.referencePole() : 0;
      if (pole > 0) return pole * RACE_PACE;
      const t = G.track;
      return t && t.total > 0 ? t.total / Math.max(1, G.vTop() * 0.6) : 100;
    }

    const CLASS_OF_CODE = { S: "soft", M: "medium", H: "hard" };
    function classOfCode(code) { return CLASS_OF_CODE[code] || null; }

    function planFor(roll, player, laps, car) {
      const zz = z();
      if (!zz) return null;
      const loss = lossS();
      const n = laps > 0 ? laps : G.lapsTarget;
      const lapRefS = referenceLapS();
      const pitLossLaps = clamp(loss / Math.max(1, lapRefS), 0.02, 0.9);
      const pin = player ? pinnedStops() : null;
      const rec = player && car ? (G.tyres && G.tyres.startRecord ? G.tyres.startRecord(car, TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness())) : TyreModel.startRecord(car)) : null;
      const start = rec && !(rec.tread > 0) ? classOfCode(rec.code) : null;
      if (!player && car && AiDrive.tasteRoll) roll = AiDrive.tasteRoll(roll, car);
      const plan = AiDrive.stintPlan({
        laps: n,
        lifeLaps: (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, n),
        pitLossLaps, roll, stops: pin, twoCompound: twoCompoundRule(n),
        start: start || undefined,
        firstLife: start && Number.isFinite(rec.life) ? G.tyres.planLaps(rec.life, n) : undefined,
      });
      if (plan) { plan.pitLossLaps = pitLossLaps; plan.pin = pin; plan.roll = roll; }
      return plan;
    }
    const TWO_COMPOUND_MIN_LAPS = 8;
    function sprintLeg() {
      return !!G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.stage(G.season) === "sprint";
    }
    function twoCompoundRule(laps) {
      return laps >= TWO_COMPOUND_MIN_LAPS
        && TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness()) === 0
        && !sprintLeg();
    }
    const COMPOUND_WARN_LAPS = 5;
    function twoCompoundApplies() { return enabled() && twoCompoundRule(G.lapsTarget); }
    function lapsToFlag(c) {
      return Math.max(0, (G.lapsTarget || 0) - ((c && c.lap) || 0) + 1);
    }
    function owesCompound(c) {
      return !!c && twoCompoundApplies() && typeof SportingRegs !== "undefined" && SportingRegs.compoundShort(c.tyreLog);
    }
    function compoundDue(c) {
      if (!c || !twoCompoundApplies() || typeof SportingRegs === "undefined") return false;
      return lapsToFlag(c) <= COMPOUND_WARN_LAPS && SportingRegs.compoundShort(c.tyreLog);
    }
    function pinKey(id) { const t = G.track, d = t && t.def; return "pitPlan." + ((typeof id === "string" && id.trim() ? id : null) || (d && d.id) || (t && t.id) || "track"); }
    function pinnedStops(id) {
      const v = G.store && G.store.get ? G.store.get(pinKey(id), "auto") : "auto";
      return v == null || v === "auto" ? null : Math.max(0, Math.min(2, v | 0));
    }
    function setPinnedStops(v, id) { if (G.store && G.store.set) G.store.set(pinKey(id), v == null ? "auto" : (v | 0)); }
    function lossS() { return lossAt(STRAIGHT_V); }
    function lossAt(roadFrac) {
      const zz = z();
      if (!zz) return 0;
      const p = G.track && G.track.pit;
      const slowM = p && !p.painted ? p.lenM + p.entryRoadM + p.exitRoadM : zz.lenM;
      const straight = Math.max(1, G.vTop() * roadFrac);
      const aUp = G.aTop ? Math.max(1, G.aTop()) : 12, aDn = G.BRAKE ? Math.max(1, G.BRAKE) : 35;
      const dv = Math.max(0, straight - Math.max(1, limit()));
      const swing = (dv * dv) / (2 * straight) * (1 / aUp + 1 / aDn);
      return Math.max(zz.boxS, slowM / Math.max(1, limit()) + zz.boxS - slowM / straight + swing);
    }

    function planInfo(c, readouts) {
      const plan = c && c.pitPlan;
      if (!plan || !enabled()) return null;
      const done = c.pitStops || 0, lap = c.lap || 0, stops = plan.stops || 0;
      const next = plan.lapsAt[done];
      const code = nextCode(c);
      const label = stops ? stops + "-STOP" : "NO STOP";
      if (next == null) return { text: "PLAN " + label + (stops ? " · DONE" : ""), state: "", stops, next: null, lapsToStop: null, code };
      const lapsToStop = next - lap;
      const caution = G.cautionInfo ? G.cautionInfo() : null;
      let est = null;
      if (caution && caution.level >= 2 && caution.level < 4) {
        if (readouts && readouts.player === c) {
          if (readouts.estimate === undefined) readouts.estimate = estimate(c);
          est = readouts.estimate;
        } else est = estimate(c);
      }
      const busy = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      let state = "", text = "PLAN " + label + " · BOX L" + next + (code ? " " + code : "");
      if (busy) state = "";
      else if (est && est.marginS > 0 && lapsToStop <= (typeof AiDrive !== "undefined" && AiDrive.STRAT ? AiDrive.STRAT.CAUTION_REACH : 6)) {
        state = "cheap";
        const loss = est.lossS != null ? Math.round(est.lossS) : null;
        text = "CHEAPER STOP" + (loss != null ? " · ~" + loss + "s" : "") + " · BOX NOW" + (code ? " " + code : "");
      }
      else if (lapsToStop <= 0) { state = "now"; text = "BOX BOX BOX" + (code ? " · " + code : ""); }
      else if (lapsToStop === 1) { state = "soon"; text = "BOX NEXT LAP" + (code ? " · " + code : ""); }
      return { text, state, stops, next, lapsToStop, code };
    }
    function nextCode(c) {
      const plan = c && c.pitPlan;
      if (c && c.local) { const r = nextFor(c); if (r && r.code) return r.code; }
      const cls = plan && plan.seq ? plan.seq[(c.pitStops || 0) + (c.pitState === "box" && !c.pitFitted ? 0 : 1)] : null;
      return cls && TyreModel.AI_CLASS[cls] ? TyreModel.AI_CLASS[cls].code : "";
    }
    function windowOf(o) {
      if (!o || !o.pitPlan) return "";
      if (o.pitState && o.pitState !== "none") return "IN";
      const n = o.pitPlan.lapsAt[o.pitStops || 0];
      if (n == null) return "";
      const d = n - (o.lap || 0);
      return d >= 0 && d <= 3 ? "P" + n : "";
    }
    function planBLine(oldNext, newNext) {
      if (newNext == null) return "PLAN B — NO MORE STOPS, MANAGE TO THE FLAG";
      if (oldNext == null) return "PLAN B — TYRES WON'T LAST, BOX LAP " + newNext;
      return newNext < oldNext ? "PLAN B — TYRES WEARING FAST, BOX LAP " + newNext
                               : "PLAN B — TYRES HOLDING UP, EXTEND TO LAP " + newNext;
    }
    function replan(c) {
      const plan = c.pitPlan, zz = z();
      if (!plan || !zz || !G.tyres || !c.tyre || typeof AiDrive === "undefined") return false;
      const ai = !c.human;
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      if (!ai && (c.tyre.tread || 0) !== wantTread) return false;
      if (ai && (c.pitArmed || (c.pitState && c.pitState !== "none") || (c.tyre.tread || 0) > 0
          || TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness()) > 0
          || (G.tyres.lapsOn ? G.tyres.lapsOn(c) : 0) < 2
          || (c.lap || 0) - (c._recutLap || -99) < AiDrive.STRAT.REPLAN_GAP)) return false;
      const done = c.pitStops || 0, lap = Math.max(1, c.lap || 1);
      const lapsLeft = lapsToFlag({ lap });
      const oldNext = plan.lapsAt[done];
      if (lapsLeft < 2) return false;
      const fittedLife = Number.isFinite(c.tyre.life) ? c.tyre.life : TyreModel.AI_CLASS.medium.life;
      const nominal = G.tyres.planLaps(fittedLife, G.lapsTarget);
      const spent = G.tyres.spent(c);
      const onSet = G.tyres.lapsOn ? G.tyres.lapsOn(c) : 0;
      const midFuel = clamp(1 - (lap - onSet / 2) / Math.max(1, G.lapsTarget), 0, 1);
      const fuelMul = 1 + AiDrive.STRAT.FUEL_WEAR * midFuel;
      if (onSet >= 1 && spent > 0) plan.loadK = clamp(nominal * spent / (onSet * fuelMul), 0.6, 2.5);
      const loadK = plan.loadK || 1;
      const lifeLaps = (cls) => G.tyres.planLaps(TyreModel.AI_CLASS[cls].life, G.lapsTarget) / loadK;
      const wetCls = c.tyre.tread > 0 ? TyreModel.classForTread(c.tyre.tread) : null;
      let wetRel = null;
      if (!ai && wetCls) {
        const next = nextFor(c) || c.tyre;
        const fresh = Math.max(1, G.tyres.planLaps(next.life, G.lapsTarget) / loadK);
        let left = lapsLeft, at = 0;
        let life = G.tyres.lapsLeft ? G.tyres.lapsLeft(c) : null;
        if (life == null) life = nominal / loadK * (1 - Math.min(1, spent));
        wetRel = { seq: [wetCls], lapsAt: [], stops: 0 };
        while (life < left) {
          const stint = Math.max(1, Math.floor(life));
          at += stint; left -= stint;
          wetRel.lapsAt.push(at); wetRel.seq.push(TyreModel.classForTread(next.tread));
          wetRel.stops++;
          const n = Math.max(1, G.lapsTarget), k = AiDrive.STRAT.FUEL_WEAR;
          const a = 1 + k * clamp(1 - (lap - 1 + at) / n, 0, 1), b = k / (2 * n);
          life = fresh >= left * (a - b * left) ? left : 2 * fresh / (a + Math.sqrt(a * a - 4 * b * fresh));
        }
        const pinned = plan.pin == null ? 0 : Math.max(0, plan.pin - done);
        while (wetRel.stops < pinned && wetRel.stops < lapsLeft - 1) {
          const edges = [0].concat(wetRel.lapsAt, [lapsLeft]);
          let split = 0;
          for (let i = 1; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > edges[split + 1] - edges[split]) split = i;
          wetRel.lapsAt.splice(split, 0, Math.floor((edges[split] + edges[split + 1]) / 2));
          wetRel.seq.push(TyreModel.classForTread(next.tread)); wetRel.stops++;
        }
      }
      const cls = wetCls || classOfCode(c.tyre.code);
      const firstLife = cls ? Math.max(1, nominal / loadK * (1 - spent)) : undefined;
      const stops = plan.pin != null ? Math.max(0, plan.pin - done) : null;
      const log = Array.isArray(c.tyreLog) ? c.tyreLog : [];
      const used = log.slice(0, -1).map((e) => classOfCode(e && e.code)).filter(Boolean);
      const owes = typeof SportingRegs === "undefined" || SportingRegs.compoundShort(log);
      const rel = wetRel || AiDrive.stintPlan({ laps: lapsLeft, lifeLaps, pitLossLaps: plan.pitLossLaps || AiDrive.STRAT.PIT_LOSS_FALLBACK, roll: ai && plan.roll != null ? plan.roll : 0.5,
                                      start: cls || undefined, firstLife, stops,
                                      twoCompound: twoCompoundRule(G.lapsTarget) && owes, used });
      if (!rel) return false;
      const newNext = rel.stops > 0 ? lap - 1 + rel.lapsAt[0] : null;
      const minMove = wetRel ? 1 : !ai ? 2 : AiDrive.strategyTemper(c).react >= AiDrive.STRAT.TEMPER.REACT_MIN ? 2 : 3;
      const sameTread = plan.seq[done] === cls && (!wetRel || plan.stops === done + rel.stops);
      if (sameTread && newNext != null && oldNext != null && Math.abs(newNext - oldNext) < minMove) return false;
      if (sameTread && newNext == null && oldNext == null) return false;
      plan.seq = plan.seq.slice(0, done).concat(cls ? [cls] : plan.seq.slice(done, done + 1)).concat(rel.seq.slice(1));
      const made = log.length === done + 1 ? log.slice(1).map((e) => e.lap0) : plan.lapsAt.slice(0, done);
      plan.lapsAt = made.concat(rel.lapsAt.map((k) => lap - 1 + k));
      const at = [0].concat(plan.lapsAt, [G.lapsTarget]);
      plan.stints = at.slice(1).map((v, i) => Math.max(0, v - at[i]));
      plan.stops = done + rel.stops;
      if (ai) { c.pitReplans = (c.pitReplans || 0) + 1; c._recutLap = c.lap || 0; return true; }
      if (G.announce) G.announce(planBLine(oldNext, newNext), 2.2, "info");
      return true;
    }

    const _rivals = { behind: false, stuck: false };
    function rivalsOf(c) {
      _rivals.behind = false; _rivals.stuck = false;
      const v = Math.max(1, c.speed || 1), S = AiDrive.STRAT;
      let next = null, nextGap = Infinity;
      let ahead = null, aheadGap = Infinity;
      for (const o of G.cars) {
        if (o === c || o.retired || o.finished) continue;
        const gap = ((c.prog || 0) - (o.prog || 0)) / v;
        if (gap > 0 && gap < nextGap) { next = o; nextGap = gap; }
        else if (gap < 0 && -gap < aheadGap) { ahead = o; aheadGap = -gap; }
      }
      _rivals.behind = !!next && nextGap < S.COVER_GAP_S && !!(next.pitState && next.pitState !== "none");
      if (ahead && aheadGap < S.STUCK_GAP_S) {
        const inLane = !!(ahead.pitState && ahead.pitState !== "none");
        if (!inLane && (ahead.pitStops || 0) <= (c.pitStops || 0)) _rivals.stuck = true;
      }
      return _rivals;
    }
    function wetLapsToStop(c, tread) {
      const lap = c.lap || 0, len = G.track && G.track.total;
      const done = lap >= 1 && len > 0 ? Math.min(1, Math.max(0, (c.s || 0) / len)) : 0;
      const left = lapsToFlag(c) - done;
      if (!G.tyres.lapsLeft || !G.tyres.lapsOn) return 99;
      const fresh = G.tyres.planLaps(TyreModel.AI_CLASS[TyreModel.classForTread(tread)].life, G.lapsTarget) / (c.pitPlan.loadK || 1);
      const n = G.tyres.lapsOn(c);
      let onSet = n >= 2 ? G.tyres.lapsLeft(c) : fresh * (1 - Math.min(1, G.tyres.spent(c)));
      if (n >= 2 && onSet != null) {
        const N = Math.max(1, G.lapsTarget || 1), x = Math.max(0, lap - 1) + done, fw = AiDrive.STRAT.FUEL_WEAR;
        const fuelAt = (mid) => 1 + fw * clamp(1 - (mid - 0.5) / N, 0, 1);
        onSet *= fuelAt(Math.max(0, x - n - done) / 2 + x / 2) / fuelAt((x + Math.max(x, N)) / 2);
      }
      if (onSet == null || onSet * 1.1 >= left) return 99;
      return Math.max(0, Math.round(((G.lapsTarget - fresh) + (lap + onSet)) / 2) - lap);
    }
    const _pitCtx = { stopsLeft: 0, lapsToStop: 0, rivalBehindBoxed: false, stuckBehind: false, rivalUsed: false, fits: true,
      react: 0, attack: 0, cautionLevel: 0, wear: 0, wrongTread: false, lapsLeft: 0, pitLossLaps: 0, scripted: false };
    _pitCtx.react = _pitCtx.attack = _pitCtx.wear = 0.5; _pitCtx.react = _pitCtx.attack = _pitCtx.wear = 0;
    let _flagStep = false, _flagMemo = null, _pitReads = 0, _cautionMemo = 0, _treadMemo = 0;
    function stepBegin() { _flagStep = true; _flagMemo = null; _pitReads = 0; }
    function stepEnd() { _flagStep = false; _flagMemo = null; _pitReads = 0; }
    function flagNow() {
      if (_flagStep && _flagMemo !== null) return _flagMemo;
      const out = typeof RaceControl !== "undefined" && RaceControl.flagOut(G.cars);
      if (_flagStep) _flagMemo = out;
      return out;
    }
    function cautionNow() {
      if (_flagStep && (_pitReads & 1)) return _cautionMemo;
      const out = cautionLevel();
      if (_flagStep) { _cautionMemo = out; _pitReads |= 1; }
      return out;
    }
    function treadNow() {
      if (_flagStep && (_pitReads & 2)) return _treadMemo;
      const out = TyreModel.treadFor(G.raceWeather, G.trackWetness && G.trackWetness());
      if (_flagStep) { _treadMemo = out; _pitReads |= 2; }
      return out;
    }
    function think(c) {
      const plan = c && c.pitPlan;
      if (c && c.pitNext && !c.human && !c.local) refreshAiNext(c);
      if (!plan || c.human || c.pitArmed || (c.pitState && c.pitState !== "none")) return "";
      if (G.flyingStart && G.flyingStart.owns(c)) return "";
      if ((G.lapsTarget > 0 && (c.lap || 0) >= G.lapsTarget) || flagNow()) return "";
      if (cautionNow() >= 4) return "";
      let stopsLeft = plan.stops - (c.pitStops || 0);
      const nextAt = plan.lapsAt[c.pitStops || 0];
      const wantTread = treadNow();
      const wrongTread = !!c.tyre && (c.tyre.tread || 0) !== wantTread;
      const wetRun = wantTread > 0 && !wrongTread;
      let lapsToStop = nextAt == null ? 99 : nextAt - (c.lap || 0);
      if (wetRun) { lapsToStop = wetLapsToStop(c, wantTread); stopsLeft = lapsToStop < 99 ? 1 : 0; }
      const wear = G.tyres.spent(c);
      const near = stopsLeft > 0 && lapsToStop <= AiDrive.STRAT.UNDERCUT_REACH && wear >= AiDrive.STRAT.UNDERCUT_MIN_WEAR
        ? rivalsOf(c) : null;
      const temper = near ? AiDrive.strategyTemper(c) : null;
      if (near && near.stuck) { if (c._stuckFrom == null) c._stuckFrom = c.prog || 0; }
      else c._stuckFrom = null;
      const stuckLong = c._stuckFrom != null && (c.prog || 0) - c._stuckFrom >= AiDrive.STRAT.STUCK_LAPS * G.track.total;
      const caution = cautionNow();
      let fits = true;
      if (near || (caution >= 2 && caution < 4 && stopsLeft > 0 && lapsToStop <= AiDrive.STRAT.CAUTION_REACH)) {
        const nextCls = wetRun ? TyreModel.classForTread(wantTread) : plan.seq[(c.pitStops || 0) + 1];
        const nextStop = wetRun ? null : plan.lapsAt[(c.pitStops || 0) + 1];
        const life = nextCls && TyreModel.AI_CLASS[nextCls] ? G.tyres.planLaps(TyreModel.AI_CLASS[nextCls].life, G.lapsTarget) / (plan.loadK || 1) : Infinity;
        const end = nextStop != null ? nextStop : (G.lapsTarget || 0);
        const need = end - (c.lap || 0) + (nextStop == null && lapsToStop > 0 ? 1 : 0);
        fits = need <= life * 1.1;
      }
      const q = _pitCtx;
      q.stopsLeft = stopsLeft;
      q.lapsToStop = lapsToStop;
      q.rivalBehindBoxed = !!(near && near.behind); q.stuckBehind = !!(near && near.stuck && stuckLong);
      q.rivalUsed = !!c._rivalStop; q.fits = fits;
      q.react = temper ? temper.react : 0; q.attack = temper ? temper.attack : 0;
      q.cautionLevel = caution;
      q.wear = wear;
      q.wrongTread = wrongTread;
      q.lapsLeft = lapsToFlag(c);
      q.pitLossLaps = plan.pitLossLaps;
      q.scripted = !!plan.scripted;
      const why = AiDrive.pitNow(q);
      if (!why) return "";
      const want = aiClassFor(c, wantTread, wrongTread);
      arm(c, true);
      setNext(c, G.tyres.classRecord(want));
      c.pitWhy = why;
      if (why === "cover" || why === "undercut") c._rivalStop = true;
      return why;
    }


    const _anim = { lift: 0, off: 0, u: -1 };
    _anim.lift = _anim.off = _anim.u = 0.5; _anim.lift = _anim.off = 0; _anim.u = -1;
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function stopAnim(c) {
      const zz = z();
      _anim.lift = 0; _anim.off = 0; _anim.u = -1;
      if (!c || c.pitState !== "box") return _anim;
      const ru = typeof ReplayBuf !== "undefined" && ReplayBuf.boxU ? ReplayBuf.boxU(c) : -1;
      if (!(ru >= 0) && (!zz || !(zz.boxS > 0))) return _anim;
      const span = ru >= 0 ? 1 : zz.boxS;
      const remain = Math.min(span, Math.max(0, (c.pitT || 0) - (c.pitWorked || 0)));
      const u = ru >= 0 ? ru : Math.min(1, Math.max(0, 1 - remain / span));
      _anim.u = u;
      _anim.lift = 0.22 * (u < 0.5 ? ease(u / 0.12) : ease((1 - u) / 0.12));
      _anim.off = 0.55 * (u < 0.5 ? ease((u - 0.15) / 0.12) : ease((0.80 - u) / 0.12));
      return _anim;
    }

    function reset(c) {
      if (!c) return;
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0; c.pitNext = null; c.pitStops = 0; c.pitWhy = "";
      c.pitCommitT = 0; c.pitAbortT = 0; c.pitCommitted = false; c.pitOutT = 0; c.pitPos0 = 0;
      c.pitFitted = false; c.pitReplans = 0; c._recutLap = null; c._planLap = null; c._rivalStop = false; c._stuckFrom = null;
      if (c.local) { for (const k in _said) delete _said[k]; _lastCue = null; }
    }

    function clearArm(c) {
      if (!c) return;
      if (c.pitState === "box" && !c.pitFitted) c.pitStops = Math.max(0, (c.pitStops | 0) - 1);
      c.pitArmed = false; c.pitState = "none"; c.pitT = 0;
      c.pitCommitT = 0; c.pitAbortT = 0; c.pitCommitted = false; c.pitOutT = 0;
      c.pitFitted = false;
      c.pitPos0 = 0; c.pitWorked = 0; c.pitWhy = "";
    }

    function info(c) {
      const zz = z();
      if (!zz) return null;
      const car = c || G.player;
      const L = G.track ? G.track.total : 0;
      const at = car && L ? throughM(zz, car.s, L) : -1;
      let lat = null;
      if (car && inWindowOf(car)) { Tracks.sample(G.track, car.s, _smp); lat = { hw: _smp.hw || 0 }; }
      return {
        enabled: enabled(),
        lenM: +zz.lenM.toFixed(1),
        boxM: +boxThroughFor(car, zz, L || 1).toFixed(1),
        atM: +at.toFixed(1),
        limitKph: +(limit() * 3.6).toFixed(1),
        boxS: zz.boxS,
        armed: !!(car && car.pitArmed),
        state: (car && car.pitState) || "none",
        inLane: !!(car && inLane(car)),
        inLaneLat: lat ? inLaneLat(car, lat.hw, zz.side) : false,
        inBoxLat: lat ? inBoxLat(car, lat.hw, zz.side) : false,
        laneX: lat ? +laneCentre(lat.hw, zz.side, car && car.s).toFixed(2) : null,
        driveX: lat ? +laneDrive(lat.hw, zz.side, car && car.s).toFixed(2) : null,
        inWindow: !!(car && inWindowOf(car)),
        stops: (car && car.pitStops) || 0,
        commit: +commitFrac(car).toFixed(3),
        side: zz.side,
        lane: laneUniform(),
        laneEdgeX: +laneEdge(7, zz.side).toFixed(2),
        anim: (car && car.pitState === "box") ? (function () {
          const a = stopAnim(car);
          return { lift: +a.lift.toFixed(3), off: +a.off.toFixed(3), u: +a.u.toFixed(3),
                   fitted: !!car.pitFitted };
        })() : null,
      };
    }

    function releaseTrack() { zone = null; zoneFor = null; }
    return { zoneOf: () => z(), releaseTrack, limit, approachV, entryV, exitV, stopAnim, inLane, held,
             arm, update, reset, clearArm, info, serviceCar, planFor, think, stepBegin, stepEnd,
             pickFor, ownedTyres, choices, selectNext, estimate, commitFrac, toEntry, cue,
             worthStopping, canWork, addWork, workS: WORK_S,
             cueM: CUE_M, boxCueM: BOX_CUE_M, moveM: MOVE_M,
             boxTol: BOX_TOL, squareByM: SQUARE_BY_M, squareLat: BOX_SQUARE_LAT,
             servedS: SERVED_S, mergeS: MERGE_S, lastCue: () => _lastCue,
             planInfo, nextCode, nextFor, windowOf, replan, lossS, pinnedStops, setPinnedStops, twoCompoundApplies, compoundDue,
             laneEdge, laneCentre, laneDrive, laneUniform, boxUniform, laneX, inLaneLat, inBoxLat,
             boxSquare: (c) => { const zz = z(); if (!zz || !c || !G.track) return false;
                                 Tracks.sample(G.track, c.s, _smp); return boxSquare(c, _smp, zz.side); },
             boxThroughFor: (c) => { const zz = z(); return zz && G.track ? boxThroughFor(c, zz, G.track.total) : -1; } };
  }

  return { create, zoneOf, inWindow, throughM,
           ENTRY_M, EXIT_M, LIMIT_FRAC, LIMIT_FRAC_STREET, BOX_SPEED_FRAC,
           BOX_TOL, PIT_SIDE, COMMIT_M, COMMIT_S, COMMIT_CLEAR,
           GRID_POLE_M,
           LANE_W, LANE_MIN, MIN_RACING, BOX_LAT,
           get BOX_PITCH() { return pitch(); }, laneWidth, teamRow, ENTRY_MIN, PIT_K, entryRunM };
})();
Object.freeze(PitLane);
