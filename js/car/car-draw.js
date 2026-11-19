"use strict";

const CarDraw = (function () {
  function carVisual(team, num, own, getTeamParts) {
    const setup = own ? getTeamParts(team.id) : (Career.inCareer() && Career.aiSetup ? Career.aiSetup(team) : null);
    let stamp = "";
    if (setup) {
      const ids = Parts.resolveSetup(setup, team).ids, works = Parts.getFactorySetup(team);
      if (Parts.CATALOG.some((cat) => ids[cat.id] !== works[cat.id])) stamp = Parts.CATALOG.map((cat) => setup[cat.id] || "").join(",");
    }
    return { visualSetup: stamp ? setup : null, visStamp: stamp, visPaint: stamp ? stamp + ":" + num : "", visSh: stamp ? stamp + ":sh" : "" };
  }
  function create(G, deps) {
    Log.info("game", "CarDraw.create");
    FieldLod.init(G.store);
    const { getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getSpinDisc, getCompoundRing, getCrewMesh, getCockpitWheel, getCockpitDash, getCockpitCabin, getCockpitGlass, getMirrorFallback, getMirrorGlass,
            getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, getWheelStatus, getAeroLamp, getAeroBar,
            drawWheelExtras } = CarMesh;

    let _mirrorBodies = null;
    function freeBodyPair(mesh) {
      if (!mesh) return;
      const low = _mirrorBodies && _mirrorBodies.get(mesh);
      if (low) { _mirrorBodies.delete(mesh); if (G.gfx.freeMesh) G.gfx.freeMesh(low.mesh); }
      if (G.gfx.freeMesh) G.gfx.freeMesh(mesh);
    }

    function invalidateCustomMeshCache(cache, order, prefix = "custom:") {
      Object.keys(cache).forEach((key) => {
        if (key.indexOf(prefix) !== 0) return;
        if (cache[key]) freeBodyPair(cache[key]);
        delete cache[key];
        if (order) {
          const i = order.indexOf(key);
          if (i >= 0) order.splice(i, 1);
          const st = _lruStamp.get(order); if (st) st.delete(key);
        }
      });
    }
    const _lruStamp = new WeakMap();
    let _lruTick = 0;
    function putBoundedMesh(cache, order, key, create, max, freeOne) {
      let st = _lruStamp.get(order);
      if (!st) { st = new Map(); _lruStamp.set(order, st); }
      if (cache[key]) { st.set(key, ++_lruTick); return cache[key]; }
      const mesh = create();
      cache[key] = mesh;
      order.push(key);
      st.set(key, ++_lruTick);
      const free = freeOne || ((m) => { if (m) freeBodyPair(m); });
      while (order.length > max) {
        let oi = 0, ot = Infinity;
        for (let i = 0; i < order.length; i++) {
          const t = st.get(order[i]);
          if (t === undefined) { oi = i; break; }
          if (t < ot) { ot = t; oi = i; }
        }
        const old = order.splice(oi, 1)[0];
        st.delete(old);
        const victim = cache[old];
        delete cache[old];
        free(victim);
      }
      return mesh;
    }
    const PEER_TAG = "~p";
    const FACTORY_TAG = "default";
    const _paintTeams = new WeakMap();
    let _aiRev = -1;
    const _aiCustom = new Map();
    function storeCustom(team) {
      if (_aiRev !== G.store.rev) { _aiRev = G.store.rev; _aiCustom.clear(); }
      let v = _aiCustom.get(team.id);
      if (v === undefined) { v = G.getLiveryId(team.id) !== "default"; _aiCustom.set(team.id, v); }
      return v;
    }
    const FACTORY = Object.freeze({ factory: true });
    function paintOf(c) {
      if (c.netPaint) return c.netPaint;
      if (c.isPlayer) return null;
      const mine = G.player ? G.player.team : Teams.LIST[G.teamIdx];
      return mine && c.team.id !== mine.id && storeCustom(c.team) ? FACTORY : null;
    }
    function paintTeam(c) {
      const p = c && c.team ? paintOf(c) : null;
      if (!p) return c && c.team;
      if (p.factory && !storeCustom(c.team)) return c.team;
      const livery = p.factory ? deps.factoryLivery(c.team) : p.livery;
      let e = _paintTeams.get(c);
      if (!e || e.livery !== livery || e.base !== c.team) {
        const team = Object.create(c.team), tag = p.factory ? FACTORY_TAG : p.tag;
        team.peerLivery = livery; team.peerTag = tag; team.peerKey = c.team.id + (p.factory ? "~f" : tag);
        e = { livery, base: c.team, team };
        _paintTeams.set(c, e);
      }
      return e.team;
    }
    const carTeam = (team, car) => (car && team === car.team ? paintTeam(car) : team);
    function livOf(team) { return team.peerLivery || deps.resolveLivery(team); }
    function kid(team) { return team.peerKey || team.id; }
    function livTag(team) { return team.peerTag || G.getLiveryId(team.id); }
    const teamMeshes = {}, teamMeshOrder = [];
    if (typeof CockpitPreview !== "undefined") CockpitPreview.bind(() => {
      const team = G.player ? G.player.team : Teams.LIST[G.teamIdx];
      const liv = deps.resolveLivery(team);
      return { teamId: team.id, livery: liv, parts: Car3D.appearanceParts(Parts.getVisualTiers(G.getTeamParts(team.id), team), liv), units: AppearanceOpts.units() };
    });
    const teamBodies = {}, teamBodyOrder = [];
    const TEAM_MESH_CACHE_MAX = 40, DECAL_TEX_CACHE_MAX = 36;
    let playerTyreTier = 1, playerBrakesTier = 1, playerTyreId = "medium", playerBrakeId = "standard";
    let playerTyreVisual = null, playerBrakeVisual = null;
    let playerWheelId = "standard", playerWheelVisual = null;
    let playerVisualKey = "111111111111", playerParts = null, playerPartsTeam = "";
    function playerPartsFor(team, visualKey) {
      return playerParts && playerPartsTeam === team.id && visualKey === playerVisualKey
        ? playerParts : Parts.getVisualTiers(G.getTeamParts(team.id), team);
    }

    let carModelBuf = null;
    const CAR_MODEL_SCALE = 1;

    function legendLid(team) {
      if (!team || team.id !== "legends") return undefined;
      const d = team.drivers && team.drivers[G.driverIdx | 0];
      return d && d.code ? d.code : undefined;
    }
    const lidKey = (team, suffix) => team.id === "legends" ? suffix + ":" + legendLid(team) : suffix;
    function buildCarData(team, extra) {
      const liv = livOf(team);
      if (carModelBuf) {
        try { return GLTF.toMesh(carModelBuf, { scale: CAR_MODEL_SCALE, tint: liv.c1 }); }
        catch (e) {  }
      }
      const setup = (extra && extra.setup) || Parts.getFactorySetup(team);
      return Car3D.build(liv.c1, liv.c2, {
        livery: liv,
        teamId: team.id,
        num: (extra && extra.num != null) ? extra.num : (team.drivers && team.drivers[0] && team.drivers[0].num),
        helmetKey: legendLid(team),
        parts: Parts.getVisualTiers(setup, team),
        noWheels: !!(extra && extra.noWheels),
        field: !!(extra && extra.noWheels),
        silhouette: !!(extra && extra.silhouette),
        seats: extra && extra.seats,
      });
    }

    const _teamMeshKeyCache = new Map();
    function teamMeshEntry(team) {
      const rev = G.store.rev, leg = Parts.legalityKey();
      let c = _teamMeshKeyCache.get(kid(team));
      if (c && c.rev === rev && c.leg === leg) return c;
      const val = team.id + ":" + livTag(team) + ":" + Parts.factoryKey(team);
      c = { val, rev, leg, full: new Map() };
      _teamMeshKeyCache.set(kid(team), c);
      return c;
    }
    function teamMeshKey(team) { return teamMeshEntry(team).val; }
    function teamMeshKeyFor(team, suffix) {
      const c = teamMeshEntry(team);
      let k = c.full.get(suffix);
      if (k === undefined) { k = c.val + ":" + suffix; c.full.set(suffix, k); }
      return k;
    }
    let _pbMirror = false;
    let _pbTeam = null, _pbNum = null, _pbKind = 0, _pbSetup = null;
    let _pbCar = null, _pbKey = "", _pbMates = null;
    const _seatData = new Map(), SEAT_DATA_MAX = 12;
    function seatMates(team, car, num) {
      let want = null;
      for (const c of _pbMates || G.cars || []) {
        if (!c || c === car || c.isPlayer || kid(paintTeam(c)) !== kid(team) || !c.visualSetup !== !_pbSetup) continue;
        const n = carDecalNum(team, c);
        if (n === num || (_pbSetup && c.visStamp !== car.visStamp)) continue;
        const key = teamMeshKeyFor(team, lidKey(team, (c.visualSetup && c.visPaint) || n));
        if (!teamBodies[key] && !_seatData.has(key)) (want || (want = new Map())).set(n, key);
      }
      return want;
    }
    function buildPendingTeamMesh() {
      const team = _pbTeam, num = _pbNum, setup = _pbSetup;
      const extra = _pbKind === 1 ? { num, silhouette: true, setup }
        : _pbKind === 2 ? { noWheels: true, num, setup } : { num, setup };
      let data = _pbKind === 2 ? _seatData.get(_pbKey) : null;
      if (data) _seatData.delete(_pbKey);
      else {
        const mates = _pbKind === 2 && !carModelBuf ? seatMates(team, _pbCar, num) : null;
        if (mates) extra.seats = new Map(Array.from(mates.keys(), (n) => [n, null]));
        data = buildCarData(team, extra);
        if (mates) for (const [n, key] of mates) if (extra.seats.get(n)) _seatData.set(key, extra.seats.get(n));
        for (const k of _seatData.keys()) if (_seatData.size > SEAT_DATA_MAX) _seatData.delete(k);
      }
      const mesh = G.gfx.createMesh(data);
      if (mesh && _pbKind === 2 && _pbMirror && !carModelBuf && data.pos && data.idx && data.nrm && data.col) {
        try {
          const low = mirrorBodyGeometry(data);
          if (low.idx.length < data.idx.length * 0.8) {
            let radius = 0;
            for (let i = 0; i < data.pos.length; i += 3) radius = Math.max(radius, Math.hypot(data.pos[i], data.pos[i+1], data.pos[i+2]));
            const lowMesh = G.gfx.createMesh(low);
            if (lowMesh) _mirrorBodies.set(mesh, { mesh: lowMesh, radius });
          }
        } catch (e) { Log.warn("gfx", "mirror body preparation failed", e); }
      }
      return mesh;
    }
    function teamMesh(team, car, silhouette) {
      team = carTeam(team, car);
      const sil = silhouette === true || (car == null && silhouette !== false);
      const num = carDecalNum(team, car);
      _pbTeam = team; _pbNum = num; _pbKind = sil ? 1 : 0;
      _pbSetup = (car && car.visualSetup) || null;
      const painted = lidKey(team, (_pbSetup && car.visPaint) || num);
      const shadow = (_pbSetup && car.visSh) || "sh";
      return putBoundedMesh(teamMeshes, teamMeshOrder, teamMeshKeyFor(team, sil ? shadow : painted),
        buildPendingTeamMesh, TEAM_MESH_CACHE_MAX);
    }
    let _mirrorOptIn = null, _mirrorWarmAllowed = false;
    function mirrorWarmPolicy() {
      if (_mirrorOptIn === null) {
        let v = 0;
        try { v = G.store.get("mirrorBodyLod", 0); } catch (_) {  }
        _mirrorOptIn = v === 1 || v === "1";
      }
      if (!_mirrorOptIn || !FieldLod.on || G.headlessMode) return false;
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance ? MirrorPass.instance() : null;
      if (!mp || !mp.mode || !mp.state || !mp.drawing) return false;
      if (mp.mode() !== "on" && !mp.drawing()) return false;
      if (!G.gfx || typeof G.gfx.mirrorBegin !== "function") return false;
      if (document.body.classList.contains("bc-on")) return false;
      if (typeof XrBoot !== "undefined" && XrBoot.comfort && XrBoot.comfort()) return false;
      const state = mp.state();
      return !state.collapsed && !(state.pip && state.pip.shown) && !(state.backend && state.backend.dead);
    }
    function teamBodyMesh(team, car, mirrorWarm, mates) {
      team = carTeam(team, car);
      _pbMirror = !!mirrorWarm && _mirrorWarmAllowed && FieldLod.on;
      if (_pbMirror && !_mirrorBodies) { _mirrorBodies = new WeakMap(); _mirrorBodyLow = new WeakMap(); }
      const num = carDecalNum(team, car);
      _pbTeam = team; _pbNum = num; _pbKind = 2;
      _pbSetup = (car && car.visualSetup) || null;
      const suffix = lidKey(team, (_pbSetup && car.visPaint) || _pbNum);
      _pbCar = car; _pbMates = mates || null; _pbKey = teamMeshKeyFor(team, suffix);
      const mesh = putBoundedMesh(teamBodies, teamBodyOrder, _pbKey, buildPendingTeamMesh, TEAM_MESH_CACHE_MAX);
      _pbMates = null;
      return mesh;
    }
    function mirrorBodyGeometry(src) {
      const cell = 0.06;
      const groups = new Map(), out = { pos: [], nrm: [], col: [], idx: [] }, n = src.pos.length / 3;
      if (src.mat) out.mat = [];
      const remap = new Int32Array(n);
      const extreme = new Set(), locked = new Set();
      for (let d = 0; d < 3; d++) {
        let lo = src.idx[0], hi = src.idx[0];
        for (const i of src.idx) {
          if (src.pos[3*i+d] < src.pos[3*lo+d]) lo = i;
          if (src.pos[3*i+d] > src.pos[3*hi+d]) hi = i;
        }
        extreme.add(lo); extreme.add(hi);
      }
      for (let t = 0; t < src.idx.length; t += 3) {
        const a = src.idx[t], b = src.idx[t+1], c = src.idx[t+2];
        if (extreme.has(a) || extreme.has(b) || extreme.has(c)) { locked.add(a); locked.add(b); locked.add(c); }
      }
      for (let i = 0; i < n; i++) {
        const j = 3*i;
        const key = `${Math.floor(src.pos[j]/cell)},${Math.floor(src.pos[j+1]/cell)},${Math.floor(src.pos[j+2]/cell)}:${src.col[j]},${src.col[j+1]},${src.col[j+2]}:${src.mat?.[i] ?? 0}` + (locked.has(i) ? `:locked${i}` : '');
        let v = groups.get(key);
        if (v === undefined) {
          v = out.pos.length / 3; groups.set(key, v);
          for (let d = 0; d < 3; d++) { out.pos.push(src.pos[j+d]); out.nrm.push(src.nrm[j+d]); out.col.push(src.col[j+d]); }
          if (out.mat) out.mat.push(src.mat[i]);
        }
        remap[i] = v;
      }
      for (let i = 0; i < src.idx.length; i += 3) {
        const a = remap[src.idx[i]], b = remap[src.idx[i+1]], c = remap[src.idx[i+2]];
        if (a !== b && b !== c && a !== c) out.idx.push(a,b,c);
      }
      return out;
    }

    const FAR_BODY_TRIS = 1500;
    let _sharedRivalBody = null, _sharedRivalGeom = null, _farRivalBody = null, _farRivalKick = false;
    let _sharedRivalEpoch = 0;
    function freeSharedRivalBodies() {
      _sharedRivalEpoch++;
      const near = _sharedRivalBody, far = _farRivalBody;
      _sharedRivalBody = _farRivalBody = _sharedRivalGeom = null;
      _farRivalKick = false;
      if (G.gfx.freeMesh) {
        if (near) G.gfx.freeMesh(near);
        if (far && far !== near) G.gfx.freeMesh(far);
      }
    }
    function buildFarRivalBody(epoch) {
      if (epoch !== _sharedRivalEpoch || carModelBuf || _farRivalBody || !_sharedRivalGeom) return;
      const geom = _sharedRivalGeom;
      _farRivalKick = true;
      let mesh = null;
      try { mesh = G.gfx.createMesh(CarGeometry.decimate(geom, FAR_BODY_TRIS)); }
      catch (e) { Log.warn("gfx", "far rival body failed", e); }
      if (epoch !== _sharedRivalEpoch || carModelBuf || _farRivalBody) {
        if (mesh && G.gfx.freeMesh) G.gfx.freeMesh(mesh);
        return;
      }
      if (mesh) { _farRivalBody = mesh; if (_sharedRivalGeom === geom) _sharedRivalGeom = null; }
      else _farRivalKick = false;
    }
    function sharedRivalBodyMesh(far) {
      if (carModelBuf) return null;
      if (!_sharedRivalBody) {
        const team = Teams.LIST[0];
        const setup = Parts.getFactorySetup(team);
        const geom = Car3D.build([0.72, 0.72, 0.72], [0.72, 0.72, 0.72], {
          field: true, silhouette: true, noDriver: true, noWheels: true, livery: {}, smooth: false,
          parts: Parts.getVisualTiers(setup, team),
        });
        _sharedRivalBody = G.gfx.createMesh(geom);
        _sharedRivalGeom = geom;
      }
      if (far && _farRivalBody) return _farRivalBody;
      if (far && !_farRivalKick && _sharedRivalGeom && typeof CarGeometry !== "undefined" && CarGeometry.decimate) {
        _farRivalKick = true;
        const epoch = _sharedRivalEpoch;
        const make = () => buildFarRivalBody(epoch);
        if (typeof requestIdleCallback === "function") requestIdleCallback(make, { timeout: 2000 }); else setTimeout(make, 0);
      }
      return _sharedRivalBody;
    }
    function farRivalBodyReady() { return !!_farRivalBody; }

    const _decalTexCache = {}, _decalTexFail = {}, _decalTexOrder = [];
    const _decalTexUse = new Map();
    let _decalTexTick = 0;
    const DECAL_TEX_BYTES_MAX = 160 * 1024 * 1024;
    const _decalTexBytes = {};
    const atlasBytes = (canvas) => canvas && canvas.width > 0 && canvas.height > 0
      ? Math.round(canvas.width * canvas.height * 4 * 4 / 3) : 0;
    function trimDecalCache(keep) {
      for (;;) {
        let bytes = 0;
        for (let i = 0; i < _decalTexOrder.length; i++) bytes += _decalTexBytes[_decalTexOrder[i]] || 0;
        if (_decalTexOrder.length <= 1 || (_decalTexOrder.length <= DECAL_TEX_CACHE_MAX && bytes <= DECAL_TEX_BYTES_MAX)) return;
        let oi = -1, ot = Infinity;
        for (let i = 0; i < _decalTexOrder.length; i++) {
          if (_decalTexOrder[i] === keep) continue;
          const u = _decalTexUse.get(_decalTexOrder[i]);
          if (u === undefined) { oi = i; break; }
          if (u < ot) { ot = u; oi = i; }
        }
        if (oi < 0) return;
        dropDecalTexture(_decalTexOrder[oi]);
      }
    }
    function dropDecalTexture(key) {
      const tex = _decalTexCache[key];
      if (tex && G.gfx.freeTexture && !parkDraftAtlas(key, tex)) G.gfx.freeTexture(tex);
      delete _decalTexCache[key]; delete _decalTexFail[key]; delete _decalTexBytes[key];
      _decalTexUse.delete(key); _photoKeys.delete(key);
      _hiResDone.delete(key); _hiResPending.delete(key); _hiResFail.delete(key); _decalSeen.delete(key);
      const oi = _decalTexOrder.indexOf(key); if (oi >= 0) _decalTexOrder.splice(oi, 1);
      if (_hiResGrave.length) {
        for (let i = _hiResGrave.length - 1; i >= 0; i--) {
          const g = _hiResGrave[i];
          if (!g || g.key !== key) continue;
          if (g.tex && g.tex !== tex && G.gfx && G.gfx.freeTexture) G.gfx.freeTexture(g.tex);
          _hiResGrave.splice(i, 1);
        }
      }
    }
    const DECAL_STALE_FRAMES = 600, DECAL_SWEEP_EVERY = 120;
    const _decalSeen = new Map();
    let _flushFrame = 0;
    function sweepStaleDecals() {
      if (G.photoMode || (G.state !== "race" && G.state !== "count")) return 0;
      const field = new Set(), cars = G.cars || [];
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c && c.team) field.add(decalKeyFor(paintTeam(c), carDecalNum(c.team, c), !!c.isPlayer));
      }
      let n = 0;
      for (const key of _decalTexOrder.slice()) {
        if (field.has(key)) continue;
        const seen = _decalSeen.get(key);
        if (seen === undefined) { _decalSeen.set(key, _flushFrame); continue; }
        if (_flushFrame - seen <= DECAL_STALE_FRAMES || _photoKeys.has(key) || _hiResPending.has(key)) continue;
        dropDecalTexture(key); n++;
      }
      return n;
    }
    function decalBytes() {
      let b = 0;
      for (let i = 0; i < _decalTexOrder.length; i++) b += _decalTexBytes[_decalTexOrder[i]] || 0;
      return { bytes: b, live: _decalTexOrder.length, recorded: Object.keys(_decalTexBytes).length, hiPending: _hiResPending.size };
    }
    const _draftSpare = [], DRAFT_SPARE_MAX = 2;
    const isDraftKey = (key) => key.indexOf(":" + DRAFT_TAG) > 0;
    function parkDraftAtlas(key, tex) {
      if (!G.gfx.refillTexture || !G.livDraftOverride || !isDraftKey(key)) return false;
      _draftSpare.push(tex);
      while (_draftSpare.length > DRAFT_SPARE_MAX) G.gfx.freeTexture(_draftSpare.shift());
      return true;
    }
    function takeDraftSpare(key, canvas) {
      if (!isDraftKey(key)) return null;
      for (let i = 0; i < _draftSpare.length; i++) {
        if (G.gfx.refillTexture(_draftSpare[i], canvas)) return _draftSpare.splice(i, 1)[0];
      }
      return null;
    }
    function freeDraftSpares() {
      while (_draftSpare.length) G.gfx.freeTexture(_draftSpare.pop());
    }
    function invalidateDecalTextures(teamId, draftOnly) {
      const prefix = teamId + ":" + (draftOnly ? DRAFT_TAG : "");
      Object.keys(_decalTexCache).forEach(function (key) {
        if (key.indexOf(prefix) === 0) dropDecalTexture(key);
      });
    }
    function dropSupersededFittedAtlases(team) {
      const d = G.livDraftOverride;
      if (d && d.teamId === team.id) return;
      const keep = team.id + ":" + G.getLiveryId(team.id) + ":";
      const teamColon = team.id + ":";
      const draftPrefix = teamColon + DRAFT_TAG;
      const keys = Object.keys(_decalTexCache);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key.indexOf(teamColon) !== 0) continue;
        if (key.indexOf(draftPrefix) === 0 || key.indexOf(teamColon + PEER_TAG) === 0) continue;
        if (key.indexOf(keep) === 0) continue;
        dropDecalTexture(key);
      }
    }

    const PHOTO_ATLAS_MAX = 6;
    const _photoKeys = new Map();
    let _photoFrame = 0, _photoMint = null, _photoOn = false;
    function releasePhotoAtlases() {
      for (const key of [..._photoKeys.keys()]) dropDecalTexture(key);
    }
    function planPhotoAtlases() {
      _photoMint = null;
      if (!G.photoMode) {
        if (_photoOn) releasePhotoAtlases();
        _photoOn = false;
        return;
      }
      _photoOn = true;
      _photoFrame++;
      const eye = G.camEye;
      let best = null, bestD2 = Infinity;
      for (let i = 0; i < _decalCount; i++) {
        if (_decalSetup[i]) continue;
        const key = decalKeyFor(_decalTeams[i], _decalNums[i], true);
        const m = _decalMats[i];
        const dx = m[12] - eye[0], dy = m[13] - eye[1], dz = m[14] - eye[2], d2 = dx * dx + dy * dy + dz * dz;
        const rec = _photoKeys.get(key);
        if (rec) { rec.f = _photoFrame; rec.d2 = d2; continue; }
        if (key in _decalTexCache) continue;
        if (d2 < bestD2) { bestD2 = d2; best = key; }
      }
      if (best === null) return;
      if (_photoKeys.size < PHOTO_ATLAS_MAX) { _photoMint = best; return; }
      let victim = null, vf = Infinity, far = null, farD2 = -1;
      for (const [k, r] of _photoKeys) {
        if (r.f < _photoFrame) { if (r.f < vf) { vf = r.f; victim = k; } }
        else if (r.d2 > farD2) { farD2 = r.d2; far = k; }
      }
      if (victim === null && far !== null && bestD2 < farD2 * 0.81) victim = far;
      if (victim === null) return;
      dropDecalTexture(victim);
      _photoMint = best;
    }
    function decalTextureFor(team, num, usePlayerSetup) {
      if (usePlayerSetup || !G.photoMode) return getCarDecalTexture(team, num, usePlayerSetup);
      const key = decalKeyFor(team, num, true);
      if (_photoKeys.has(key) || key === _photoMint) {
        const minting = key === _photoMint;
        if (minting) _photoMint = null;
        const tex = getCarDecalTexture(team, num, true, false);
        if (minting && tex) _photoKeys.set(key, { f: _photoFrame, d2: 0 });
        if (tex) return tex;
      }
      return getCarDecalTexture(team, num, false);
    }
    const DRAFT_TAG = "~d";
    let _draftSrc = null, _draftGen = 0;
    function draftTag(team) {
      const d = G.livDraftOverride;
      if (!d || d.teamId !== team.id) return "";
      if (d !== _draftSrc) { _draftSrc = d; _draftGen++; }
      return DRAFT_TAG + _draftGen;
    }
    const _decalPrefixCache = new Map();
    function decalKeyEntry(team) {
      const c = _decalPrefixCache.get(kid(team)), tag = team.peerTag ? "" : draftTag(team);
      if (c && c.rev === G.store.rev && c.tag === tag) return c;
      const val = team.id + ":" + (tag || livTag(team)) + ":";
      const e = { val, tag, rev: G.store.rev, full: new Map(), fullP: new Map() };
      _decalPrefixCache.set(kid(team), e);
      return e;
    }
    function decalKeyFor(team, num, isPlayer) {
      const e = decalKeyEntry(team), m = isPlayer ? e.fullP : e.full;
      let k = m.get(num);
      if (k === undefined) { k = e.val + (num == null ? "_" : num) + (isPlayer ? ":P" : ""); m.set(num, k); }
      return k;
    }
    function crispPlayerDecal(t) {
      const tex = t && t.tex;
      if (!tex || typeof tex.anisotropy !== "number") return t;
      try {
        if (tex.anisotropy < 8) { tex.anisotropy = 8; tex.needsUpdate = true; }
      } catch (_) {  }
      return t;
    }
    const _hiResPending = new Map(), _hiResDone = new Set();
    const HIRES_TRIES = 2, _hiResFail = new Map();
    const HIRES_IDLE_MAX_MS = 4000;
    const _hiResGrave = [];
    function reapHiResGrave() {
      if (!_hiResGrave.length) return;
      if (G.gfx && G.gfx.freeTexture) {
        for (let i = 0; i < _hiResGrave.length; i++) G.gfx.freeTexture(_hiResGrave[i].tex);
      }
      _hiResGrave.length = 0;
    }
    function liveryAsyncOn() {
      try { const v = G.store && G.store.get ? G.store.get("liveryAsync", 1) : 1; return !(v === 0 || v === "0" || v === false); } catch (_) { return true; }
    }
    function liveryBitmapOpts(backend) {
      return backend === "three" || backend === "webgpu"
        ? { premultiplyAlpha: "premultiply" }
        : { imageOrientation: "flipY", premultiplyAlpha: "premultiply" };
    }
    function liveryBitmap(canvas) {
      if (typeof createImageBitmap !== "function" || !liveryAsyncOn()) return null;
      try {
        const p = createImageBitmap(canvas, liveryBitmapOpts(G.gfx && G.gfx.backend));
        return p && typeof p.then === "function" ? p : null;
      } catch (_) { return null; }
    }
    function closeBitmap(b) { try { if (b && typeof b.close === "function") b.close(); } catch (_) {  } }
    function schedulePlayerHiRes(team, num, key) {
      if (typeof LiveryTex === "undefined" || !LiveryTex.playerHiResDeferred) return;
      if (!LiveryTex.playerHiResDeferred(!!LiveryTex.IS_MOBILE)) return;
      if (LiveryTex.IS_PHONE) return;
      if (_hiResDone.has(key) || _hiResPending.has(key) || (_hiResFail.get(key) || 0) >= HIRES_TRIES) return;
      if (G.livDraftOverride) return;
      const livery = livOf(team), pickAt = G.teamIdx;
      const owns = () => _hiResPending.get(key) === kick
        && (key in _decalTexCache)
        && decalKeyFor(team, num, true) === key
        && G.teamIdx === pickAt;
      const done = () => { if (_hiResPending.get(key) === kick) _hiResPending.delete(key); };
      const fail = (e) => {
        _hiResFail.set(key, (_hiResFail.get(key) || 0) + 1);
        Log.warn("gfx", "deferred hi-res decal atlas failed for " + key, e);
        done();
      };
      const finish = function (src, canvas) {
        const bitmap = src !== canvas ? src : null;
        let keep = false;
        try {
          if (!owns()) return;
          const transfer = !!bitmap && G.gfx.backend === "three";
          const next = crispPlayerDecal(G.gfx.createTexture(src, transfer ? { disposeSource: closeBitmap, anisotropy: 8 } : { anisotropy: 8 }));
          if (!next) throw new Error("no texture");
          keep = transfer;
          const prev = _decalTexCache[key];
          _decalTexCache[key] = next;
          _decalTexBytes[key] = atlasBytes(canvas);
          _hiResDone.add(key);
          if (prev && prev !== next) _hiResGrave.push({ key: key, tex: prev });
          if (typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(next);
          trimDecalCache(key);
        } catch (e) {
          fail(e);
        } finally {
          if (bitmap && !keep) closeBitmap(bitmap);
          done();
        }
      };
      const kick = function () {
        try {
          if (!owns() || G.livDraftOverride) { done(); return; }
          if (!G.gfx || !G.gfx.createTexture) { done(); return; }
          const canvas = LiveryTex.buildAtlas(team.id, livery, num, true, true);
          const bmp = liveryBitmap(canvas);
          if (!bmp) { finish(canvas, canvas); return; }
          bmp.then(function (b) { finish(b, canvas); }, function (e) {
            Log.info("gfx", "livery bitmap refused, uploading the canvas: " + (e && e.message || e));
            finish(canvas, canvas);
          });
        } catch (e) {
          fail(e);
        }
      };
      _hiResPending.set(key, kick);
      const since = Date.now();
      const enqueue = function () {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(function (deadline) {
            if (!owns()) { done(); return; }
            const starved = !deadline || deadline.didTimeout || Date.now() - since >= HIRES_IDLE_MAX_MS;
            if (!starved && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 10) {
              enqueue();
              return;
            }
            kick();
          }, { timeout: 2000 });
        } else {
          setTimeout(kick, 0);
        }
      };
      enqueue();
    }
    function getCarDecalTexture(team, num, isPlayer, allowHiRes) {
      if (typeof LiveryTex === "undefined" || !G.gfx.createTexture) return null;
      if (_draftSpare.length && !G.livDraftOverride) freeDraftSpares();
      if (isPlayer) dropSupersededFittedAtlases(team);
      const key = decalKeyFor(team, num, isPlayer);
      const wantHi = !!isPlayer && allowHiRes !== false;
      if (key in _decalTexCache) {
        _decalTexUse.set(key, ++_decalTexTick);
        _decalSeen.set(key, _flushFrame);
        if (wantHi) schedulePlayerHiRes(team, num, key);
      } else {
        let t = null;
        try {
          const canvas = LiveryTex.buildAtlas(team.id, livOf(team), num, !!isPlayer, false);
          t = takeDraftSpare(key, canvas) || G.gfx.createTexture(canvas, isPlayer ? { anisotropy: 8 } : undefined);
          if (!t) throw new Error("createTexture returned no texture");
          if (isPlayer) t = crispPlayerDecal(t);
          _decalTexBytes[key] = atlasBytes(canvas);
        }
        catch (e) {
          const n = _decalTexFail[key] = (_decalTexFail[key] || 0) + 1;
          if (n === 1) Log.warn("gfx", "decal atlas build failed for " + key, e);
          if (n < 3) return null;
        }
        _decalTexCache[key] = t; _decalTexOrder.push(key); _decalTexUse.set(key, ++_decalTexTick); _decalSeen.set(key, _flushFrame);
        if (wantHi && t) schedulePlayerHiRes(team, num, key);
        trimDecalCache(key);
      }
      return _decalTexCache[key];
    }
    function carDecalNum(team, car) {
      if (car && car.num != null) return car.num;
      return (team.drivers && team.drivers[0] && team.drivers[0].num != null) ? team.drivers[0].num : null;
    }
    const _aeroLevelCache = [new Map(), new Map()];
    const _aeroCustom = new Map();
    const AERO_CUSTOM_CACHE_MAX = 32;
    let _aeroCustomTick = 0;
    const partStyleFields = Object.keys(Car3D.PART_STYLE_FIELDS || { aeroShape: "aero", floorShape: "floor" });
    function samePartStyles(state, liv) {
      for (const key of partStyleFields) if (state.styles[key] !== liv[key]) return false;
      return true;
    }
    function rememberPartStyles(liv) {
      const styles = {};
      for (const key of partStyleFields) styles[key] = liv[key];
      return styles;
    }
    function teamDecalState(team, usePlayerSetup, setup, stamp) {
      const liv = livOf(team);
      if (setup) {
        let byTeam = _aeroCustom.get(kid(team));
        if (!byTeam) { byTeam = new Map(); _aeroCustom.set(kid(team), byTeam); }
        const leg = Parts.legalityKey();
        const key = stamp || "";
        const c = byTeam.get(key);
        if (c && c.leg === leg && samePartStyles(c, liv)) { c.lastUse = ++_aeroCustomTick; return c; }
        const parts = Car3D.appearanceParts(Parts.getVisualTiers(setup, team), liv);
        const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                        aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                        parts, rev: -1, leg, styles: rememberPartStyles(liv), fwKey: null, fwKeyWt: null, fwKeyFull: "", lastUse: ++_aeroCustomTick };
        byTeam.set(key, state);
        if (byTeam.size > AERO_CUSTOM_CACHE_MAX) {
          let oldestKey, oldestUse = Infinity;
          for (const [k, cached] of byTeam) {
            if (cached.lastUse < oldestUse) { oldestKey = k; oldestUse = cached.lastUse; }
          }
          byTeam.delete(oldestKey);
        }
        return state;
      }
      const cache = _aeroLevelCache[usePlayerSetup ? 1 : 0];
      const rev = usePlayerSetup ? G.store.rev : -1, leg = Parts.legalityKey();
      const vk = usePlayerSetup ? playerVisualKey : "";
      const c = cache.get(kid(team));
      if (c && c.rev === rev && c.leg === leg && c.vk === vk && samePartStyles(c, liv)) return c;
      const parts = usePlayerSetup && playerParts && playerPartsTeam === team.id
        ? Car3D.appearanceParts(playerParts, liv)
        : Car3D.appearanceParts(Parts.getVisualTiers(
            usePlayerSetup ? G.getTeamParts(team.id) : Parts.getFactorySetup(team), team), liv);
      const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                      aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                      parts, rev, leg, vk, styles: rememberPartStyles(liv), fwKey: null, fwKeyWt: null, fwKeyFull: "" };
      cache.set(kid(team), state);
      return state;
    }
    function warmCarAssets() {
      if (carModelBuf) return;
      const at = performance.now();
      _mirrorWarmAllowed = mirrorWarmPolicy();
      const casters = shadowCastersWanted();
      const gfx = G.gfx || {};
      const lodWarm = FieldLod.on && !G.headlessMode &&
        !!(casters || typeof gfx.mirrorBegin === "function");
      const sliced = carWarmSliceOn();
      for (let i = 0; i < G.cars.length; i++) {
        const c = G.cars[i];
        try {
          for (let ph = 0; ph < WARM_PHASES; ph++) warmCarPhase(c, ph, casters, lodWarm, sliced);
        } catch (e) { Log.warn("gfx", "car asset warm-up failed for " + (c.team && c.team.id), e); }
      }
      if (lodWarm) warmLazyRaceMeshes();
      if (lodWarm) { const p = G.cars.find((c) => c && c.isPlayer); if (p) _deferredCarWarm.push({ c: p, crew: true }); }
      Log.info("gfx", "race car assets ready", { cars: G.cars.length, casters, lodWarm, cpuMs: Math.round(performance.now() - at) });
    }
    const WARM_PHASES = 4;
    const _deferredCarWarm = [];
    function drainDeferredCarWarm(budgetMs) {
      const t0 = performance.now(), budget = budgetMs > 0 ? budgetMs : 4;
      while (_deferredCarWarm.length) {
        const it = _deferredCarWarm.shift();
        try {
          if (it.atlas) { warmDecalMesh(it.c); const tex = getCarDecalTexture(paintTeam(it.c), carDecalNum(paintTeam(it.c), it.c), !!it.c.isPlayer); if (tex && typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(tex); }
          else if (it.caster) teamMesh(it.c.team, it.c, true);
          else if (it.crew && typeof PitCrewAnim !== "undefined") PitCrewAnim.warm(G, it.c);
        } catch (e) { Log.warn("gfx", "deferred car warm failed for " + (it.c && it.c.team && it.c.team.id), e); }
        if (performance.now() - t0 >= budget) break;
      }
      return _deferredCarWarm.length;
    }
    function warmCarPhase(c, ph, casters, lodWarm, sliced, defer) {
      if (ph === 0) {
        if (c.isPlayer) playerBodyMesh(c.team, c); else teamBodyMesh(c.team, c, true);
        if (c.isPlayer && ["cockpit", "helmet"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitBodyMesh(c.team, c);
      } else if (ph === 1) {
        if (defer) { _deferredCarWarm.push({ c, atlas: true }); return; }
        warmDecalMesh(c);
        const tex = getCarDecalTexture(paintTeam(c), carDecalNum(paintTeam(c), c), !!c.isPlayer);
        if (sliced && tex && typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(tex);
      } else if (ph === 2) {
        if (casters) { if (defer) _deferredCarWarm.push({ c, caster: true }); else teamMesh(c.team, c, true); }
        if (casters && c.isPlayer && ["cockpit", "helmet", "visor"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitShadowMesh(c.team, c);
      } else if (lodWarm) {
        if (!c.isPlayer) getFieldWheelMeshes(c.team, c);
        if (!c.isPlayer) warmFlaps(c);
        CarMesh.getExhaustFlame(c.fuelVisual && c.fuelVisual.fxFlame);
        if (c.isPlayer) CarMesh.getErsLight();
      }
    }
    function warmFlaps(c) {
      const aSt = teamDecalState(paintTeam(c), false, c.visualSetup, c.visStamp);
      const flaps = Car3D.aeroFlaps(aSt.val, aSt.aero);
      if (!flaps || !flaps.length || typeof CarMesh.getAeroFlapSet !== "function") return;
      const team = paintTeam(c), liv = livOf(team);
      const col = liv.wingCarbon === "carbon" && typeof CarMaterials !== "undefined" && CarMaterials.CARBON
        ? CarMaterials.CARBON : (liv.wing || liv.c2 || team.color2);
      const finish = (typeof CarMaterials !== "undefined" && CarMaterials.finishOf)
        ? CarMaterials.finishOf(liv, "wingFinish") : null;
      const surface = liv.wingCarbon === "carbon" ? "carbon" : "paint";
      const rearCol = surface === "carbon" ? col : (liv.rearWing || liv.c2 || team.color2);
      CarMesh.getAeroFlapSet(aSt.val, col, aSt.aero, finish, false, null, surface, rearCol);
      CarMesh.getAeroFlapSet(aSt.val, col, aSt.aero, finish, true, null, surface, rearCol);
      if (typeof CarMesh.getAeroFlap === "function") {
        for (let i = 0; i < flaps.length; i++) {
          const fg = flaps[i];
          CarMesh.getAeroFlap(aSt.val, fg.paint ? rearCol : col, i, aSt.aero, fg, finish, surface);
        }
      }
    }
    function warmLazyRaceMeshes(cars, phase) {
      const doFlaps = !phase || phase === "flaps";
      const doShared = !phase || phase === "shared";
      if (doFlaps) {
        try {
          const list = cars || G.cars;
          const me = list && list.find((c) => c.isPlayer);
          if (me) warmFlaps(me);
        } catch (e) { Log.warn("gfx", "player flap mesh warm failed", e); }
        try {
          getBrakeRing(); getSpinDisc();
          if (typeof TyreModel !== "undefined" && TyreModel.AI_CLASS) {
            for (const k of Object.keys(TyreModel.AI_CLASS)) {
              const rec = TyreModel.AI_CLASS[k];
              if (rec && rec.colour) getCompoundRing(rec.colour);
            }
          }
        } catch (e) { Log.warn("gfx", "wheel-extra mesh warm failed", e); }
        try {
          if (typeof CarMesh.getBoostFlame === "function") CarMesh.getBoostFlame();
          getErsBar(); getOtLamp(false); getOtLamp(true);
          for (let g = 0; g <= 9; g++) getGearDigit(g);
          for (let d = 0; d <= 9; d++) getSpeedDigit(d);
          _primeArmed = 1;
          const styles = (CarMesh.LED_ROWS && Object.keys(CarMesh.LED_ROWS)) || ["std"];
          for (let s = 0; s < styles.length; s++) {
            for (let lit = 0; lit <= 9; lit++) getLedStrip(lit, styles[s]);
          }
          const mph = typeof AppearanceOpts !== "undefined" && AppearanceOpts.units() === "mph";
          for (let th = 0; th <= 4; th++) {
            for (let br = 0; br <= 4; br++) getWheelStatus(mph, th, br);
          }
          getAeroLamp(0); getAeroLamp(1); getAeroLamp(2);
          getAeroBar(false); getAeroBar(true);
        } catch (e) { Log.warn("gfx", "cockpit/LCD mesh warm failed", e); }
      }
      if (doShared) {
        try {
          sharedRivalBodyMesh(false);
          if (!_farRivalBody && _sharedRivalGeom && typeof CarGeometry !== "undefined" && CarGeometry.decimate) {
            buildFarRivalBody(_sharedRivalEpoch);
          }
        } catch (e) { Log.warn("gfx", "shared rival body warm failed", e); }
      }
    }
    function carWarmSliceOn() {
      try { const v = G.store && G.store.get ? G.store.get("carWarmSlice", 1) : 1; return !(v === 0 || v === "0" || v === false); } catch (_) { return true; }
    }
    async function warmCarAssetsAsync(current, sliceMs, opts) {
      if (carModelBuf) return true;
      if (!carWarmSliceOn()) { warmCarAssets(); return true; }
      const at = performance.now(), budget = sliceMs > 0 ? sliceMs : 8;
      _mirrorWarmAllowed = mirrorWarmPolicy();
      const casters = shadowCastersWanted(), gfx = G.gfx || {};
      const lodWarm = FieldLod.on && !G.headlessMode && !!(casters || typeof gfx.mirrorBegin === "function");
      const cars = G.cars.slice();
      _deferredCarWarm.length = 0;
      const me = cars.find((c) => c.isPlayer), playerPos = me && me.gridPos > 0 ? me.gridPos : 0;
      const rear = (c) => !!(opts && opts.deferRear) && !c.isPlayer && playerPos > 0 && c.gridPos > playerPos + 1;
      let sliceAt = performance.now(), cpuMs = 0, maxStepMs = 0, yields = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i], defer = rear(c);
        for (let ph = 0; ph < WARM_PHASES; ph++) {
          if (performance.now() - sliceAt >= budget) {
            await yieldWarm(); yields++;
            sliceAt = performance.now();
            if (current && !current()) {
              Log.info("gfx", "race car warm abandoned", { at: i, of: cars.length, yields });
              return false;
            }
          }
          const t = performance.now();
          try { warmCarPhase(c, ph, casters, lodWarm, true, defer); }
          catch (e) { Log.warn("gfx", "car asset warm-up failed for " + (c.team && c.team.id), e); }
          const ms = performance.now() - t; cpuMs += ms; if (ms > maxStepMs) maxStepMs = ms;
        }
      }
      if (lodWarm) {
        for (const phase of ["flaps", "shared"]) {
          await yieldWarm(); yields++;
          sliceAt = performance.now();
          if (current && !current()) {
            Log.info("gfx", "race car warm abandoned", { at: cars.length, of: cars.length, yields, phase });
            return false;
          }
          const t = performance.now();
          try { warmLazyRaceMeshes(null, phase); }
          catch (e) { Log.warn("gfx", "lazy race mesh warm failed", e); }
          const ms = performance.now() - t; cpuMs += ms; if (ms > maxStepMs) maxStepMs = ms;
        }
      }
      if (lodWarm) { const p = G.cars.find((c) => c && c.isPlayer); if (p) _deferredCarWarm.push({ c: p, crew: true }); }
      Log.info("gfx", "race car assets ready", { cars: cars.length, casters, lodWarm, cpuMs: Math.round(cpuMs),
        maxStepMs: Math.round(maxStepMs), yields, wallMs: Math.round(performance.now() - at), deferred: _deferredCarWarm.length });
      if (typeof RaceEntryProfile !== "undefined") RaceEntryProfile.mark("warmCarAssets:steps yields=" + yields + " maxStepMs=" + Math.round(maxStepMs) + " cpuMs=" + Math.round(cpuMs));
      return true;
    }
    function yieldWarm() {
      return (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function")
        ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
    }
    function menuStepYield() {
      return new Promise((resolve) => {
        let done = false;
        const go = () => { if (!done) { done = true; resolve(); } };
        setTimeout(go, 32);
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(go, 0));
      });
    }
    function shadowCastersWanted() {
      const LT = typeof LightTune !== "undefined" && LightTune.LT, gfx = G.gfx || {};
      if (G.headlessMode || !LT) return false;
      const tier = typeof PerfGov === "undefined" ? 0 : PerfGov.tier();
      const carMap = gfx.carShadowEnabled !== false && !(LT.shadowStr <= 0);
      const lampMap = gfx.lampShadowEnabled !== false;
      return !!((carMap && gfx.carShadowBegin && LT.carShadow && tier < 3) || (lampMap && gfx.lampShadowBegin && LT.lampShadow && tier < 2));
    }
    async function prepareMenuCarAssets(current) {
      if (carModelBuf || G.headlessMode) return;
      const teamPick = G.teamIdx, driverPick = G.driverIdx, rev = G.store.rev, solo = deps.isTimeTrial() || deps.isQuali();
      const valid = () => current() && !G.headlessMode && !carModelBuf && G.teamIdx === teamPick && G.driverIdx === driverPick && G.store.rev === rev
        && solo === (deps.isTimeTrial() || deps.isQuali());
      const field = [];
      Teams.LIST.forEach((team, ti) => {
        if (!Teams.isReal(team) && ti !== teamPick) return;
        Career.gridDrivers(team).forEach((seat, di) => {
          if (team.legends && di !== driverPick) return;
          const d = Career.driverOverride(team.id, di) || seat, isPlayer = ti === teamPick && di === driverPick;
          const c = Object.assign({ team, num: d.num, isPlayer }, carVisual(team, d.num, ti === teamPick && (isPlayer || !!team.custom), G.getTeamParts));
          if (c.isPlayer) field.unshift(c); else if (!solo) field.push(c);
        });
      });
      const visualKey = Teams.LIST[teamPick] ? deps.partsVisualKey(Teams.LIST[teamPick].id) : "";
      _mirrorWarmAllowed = mirrorWarmPolicy();
      const casters = shadowCastersWanted();
      const steps = casters ? field.flatMap(c => [c, { caster: c }]) : field;
      const lodPrep = carWarmSliceOn() && FieldLod.on && !!(casters || typeof G.gfx.mirrorBegin === "function");
      const plan = lodPrep ? steps.concat(field.filter(c => !c.isPlayer).map(c => ({ lod: c }))) : steps;
      let cpuMs = 0, maxCpuMs = 0, yields = 0, sliceAt = performance.now();
      const t0 = sliceAt;
      for (const step of plan) {
        if (performance.now() - sliceAt >= 8) {
          await menuStepYield(); yields++;
          sliceAt = performance.now();
        }
        if (!valid() || (G.gfx.warming && G.gfx.warming())) return;
        const at = performance.now(), c = step.caster || step.lod || step;
        try {
          if (step.lod) { getFieldWheelMeshes(c.team, c); warmFlaps(c); }
          else {
            if (step.caster && c.isPlayer && ["cockpit", "helmet", "visor"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitShadowMesh(c.team, c, visualKey);
            if (step.caster) teamMesh(c.team, c, true);
            else {
              if (c.isPlayer) {
                playerBodyMesh(c.team, c, visualKey);
                if (["cockpit", "helmet"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitBodyMesh(c.team, c, visualKey);
              } else teamBodyMesh(c.team, c, true, field);
              const tex = getCarDecalTexture(paintTeam(c), carDecalNum(paintTeam(c), c), c.isPlayer);
              if (tex && typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(tex);
            }
          }
        } catch (e) { Log.warn("gfx", "selector car asset preparation failed", e); }
        const elapsed = performance.now() - at; cpuMs += elapsed; maxCpuMs = Math.max(maxCpuMs, elapsed);
      }
      if (lodPrep) {
        await menuStepYield(); yields++;
        if (!valid() || (G.gfx.warming && G.gfx.warming())) return;
        const atLazy = performance.now();
        try { warmLazyRaceMeshes(field); }
        catch (e) { Log.warn("gfx", "selector lazy race mesh warm failed", e); }
        const elapsed = performance.now() - atLazy; cpuMs += elapsed; maxCpuMs = Math.max(maxCpuMs, elapsed);
      }
      const done = { cars: field.length, steps: plan.length, casters, lod: lodPrep, cpuMs: Math.round(cpuMs), maxCpuMs: Math.round(maxCpuMs), yields, wallMs: Math.round(performance.now() - t0), at: Math.round(performance.now()) };
      Log.info("gfx", "selector car assets ready", done);
      return done;
    }
    function decalMeshFor(team, cockpit, usePlayerSetup, setup, stamp) {
      const state = teamDecalState(team, usePlayerSetup, setup, stamp);
      const legacyBody = !!carModelBuf;
      const rl = livOf(team);
      return cockpit ? getCockpitDecalMesh(legacyBody ? null : state.parts, team.id, rl.bodyStyle) :
        getCarDecalMesh(state.val, state.parts, legacyBody, team.id, rl.finShape, rl.spineHeight, rl.bodyStyle);
    }
    function warmDecalMesh(c) { decalMeshFor(paintTeam(c), false, !!c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp); }
    function drawCarDecals(team, modelMat, night, num, cockpit, usePlayerSetup, setup, stamp) {
      const mesh = decalMeshFor(team, cockpit, usePlayerSetup, setup, stamp);
      const tex = decalTextureFor(team, num, usePlayerSetup);
      if (mesh && tex) { _decalOpts.glow = night ? 0.35 : 0; G.gfx.drawDecal(mesh, modelMat, tex, _decalOpts); }
      if (!_decalFlushing) reapHiResGrave();
    }
    const _decalOpts = { glow: 0 };

    const PLAYER_BODY_CACHE_MAX = 3;
    const COCKPIT_BODY_CACHE_MAX = 3;
    const WHEEL_MESH_CACHE_MAX = 8;
    const playerBodies = {};
    const playerBodyOrder = [];
    const WHEELS = [
      { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
      { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
      { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
      { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
    ];
    const _wheelLocal = new Float32Array(16);
    const _wheelWorld = new Float32Array(16);
    const _fixedWheelLocal = new Float32Array(16);
    const _fixedWheelWorld = new Float32Array(16);
    const _ringWorld = new Float32Array(16);
    const _ringOpts = { emissive: 0, roughness: 0.9, specular: 0, alpha: 1, noAlphaWrite: true };
    const _wq = [], _wqMesh = [], _rq = [], _rqEmis = [], _rqAlpha = [], _rqMesh = [];
    let _wqN = 0, _rqN = 0;
    const _coSib = new WeakMap();
    function coOpt(o) {
      if (!o || G.gfx.coalesce !== true || (o.alpha !== undefined && o.alpha < 1)) return o;
      let s = _coSib.get(o);
      if (!s) { s = {}; _coSib.set(o, s); }
      for (const k in o) s[k] = o[k];
      s.coalesce = true;
      return s;
    }
    const _decalMats = [];
    const _decalTeams = [];
    const _decalNums = [];
    const _decalCockpit = [];
    const _decalSetup = [];
    const _decalVis = [];
    const _decalStamp = [];
    let _decalCount = 0;
    function queueCarDecals(team, modelMat, num, cockpit, usePlayerSetup, setup, stamp) {
      let m = _decalMats[_decalCount];
      if (!m) { m = new Float32Array(16); _decalMats[_decalCount] = m; }
      m.set(modelMat);
      _decalTeams[_decalCount] = team;
      _decalNums[_decalCount] = num;
      _decalCockpit[_decalCount] = !!cockpit;
      _decalSetup[_decalCount] = !!usePlayerSetup;
      _decalVis[_decalCount] = setup || null;
      _decalStamp[_decalCount] = stamp || null;
      _decalCount++;
    }
    const cockpitBodies = {};
    const cockpitBodyOrder = [];
    let _cbFinish = -1;
    let _cbTeam = null, _cbId = null, _cbVk = null, _cbHalo = null, _cbBody = null, _cbBs = null, _cbNum = null, _cbKey = "", _cbShKey = "", _cbParts = null;
    function buildPendingCockpitBody() {
      const team = _cbTeam, source = deps.resolveLivery(team);
      const view = typeof CockpitFinishes !== "undefined" ? CockpitFinishes.view(source) : null, liv = view ? view.livery : source;
      return G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, cockpitHalo: view && view.halo, teamId: team.id, noWheels: true, noDriver: true, cockpit: true, cockpitBody: CockpitOpts.body(), halo: _cbHalo, num: _cbNum,
          parts: _cbParts }));
    }
    function buildPendingCockpitShadow() {
      const team = _cbTeam, liv = deps.resolveLivery(team);
      return G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, silhouette: true, noDriver: true, ownHalo: true, halo: _cbHalo, num: _cbNum,
          parts: _cbParts }));
    }
    function cockpitKey(team, car, visualKey) {
      const num = carDecalNum(team, car), haloSz = CockpitOpts.haloSize();
      const rawBs = deps.resolveLivery(team).bodyStyle;
      const bk = Car3D.bodyStyleKey ? Car3D.bodyStyleKey(team.id, rawBs) : rawBs, bs = bk && bk !== team.id ? bk : "";
      const body = CockpitOpts.body();
      const finish = typeof CockpitFinishes !== "undefined" ? CockpitFinishes.stamp() : 0;
      if (team.id !== _cbId || visualKey !== _cbVk || haloSz !== _cbHalo || body !== _cbBody || bs !== _cbBs || num !== _cbNum || finish !== _cbFinish) {
        _cbKey = team.id + ":" + visualKey + ":H" + haloSz + ":B" + body + (bs ? ":S" + bs : "") + ":" + num;
        _cbKey += ":F" + finish; _cbFinish = finish;
        _cbShKey = _cbKey + ":FP";
        _cbId = team.id; _cbVk = visualKey; _cbHalo = haloSz; _cbBody = body; _cbBs = bs; _cbNum = num;
      }
      _cbTeam = team;
      _cbParts = playerPartsFor(team, visualKey);
    }
    function cockpitBodyMesh(team, car, visualKey = playerVisualKey) {
      cockpitKey(team, car, visualKey);
      return putBoundedMesh(cockpitBodies, cockpitBodyOrder, _cbKey, buildPendingCockpitBody, COCKPIT_BODY_CACHE_MAX);
    }
    function cockpitShadowMesh(team, car, visualKey = playerVisualKey) {
      cockpitKey(team, car, visualKey);
      return putBoundedMesh(cockpitBodies, cockpitBodyOrder, _cbShKey, buildPendingCockpitShadow, COCKPIT_BODY_CACHE_MAX);
    }
    const _ckR = [0, 0, 0], _ckU = [0, 1, 0], _ckF = [0, 0, 0], _ckP = [0, 0, 0];
    function cockpitCaster(c, smp, yv, out) {
      const id = !G.dbgCam && (G.state === "race" || G.state === "count") ? CamModes.CAM_MODES[G.camMode].id : "";
      if (id !== "cockpit" && id !== "helmet" && id !== "visor") return null;
      const seat = id === "visor" ? "visor" : "cockpit";
      GameCams.cockpitViewmodelAxes(smp.r, smp.t, yv, G.camEye, _ckR, _ckU, _ckF, _ckP, GameCams.seatFwd(seat), GameCams.seatUp(seat));
      out[0] = _ckR[0]; out[1] = _ckR[1]; out[2] = _ckR[2]; out[3] = 0;
      out[4] = _ckU[0]; out[5] = _ckU[1]; out[6] = _ckU[2]; out[7] = 0;
      out[8] = _ckF[0]; out[9] = _ckF[1]; out[10] = _ckF[2]; out[11] = 0;
      out[12] = _ckP[0]; out[13] = _ckP[1]; out[14] = _ckP[2]; out[15] = 1;
      return cockpitShadowMesh(c.team, c);
    }
    const _rigT = new Float32Array([0.80,0,0,0, 0,0.80,0,0, 0,0,0.80,0, 0,0.63,0.26,1]);
    const _rigR = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const _rigA = new Float32Array(16), _rigB = new Float32Array(16);
    const _digT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const _digM = new Float32Array(16);
    const _mirrorFbOpts = { doubleSided: true, roughness: 0.92, specular: 0.06, emissive: 0.55, clearcoat: 0 };
    const _glassBase = new Float32Array(16);
    let _glassQuads = null, _glassLive = 0, _glassFb = 0;
    function drawMirrorLens(c, base, nite) {
      const cm = teamDecalState(c.team, true).parts, vis = cm && cm._visual && cm._visual.cockpit;
      const quads = Car3D.cockpitMirrorGlass(vis && vis.mirror), gfx = G.gfx;
      const mp = typeof MirrorPass !== "undefined" ? MirrorPass.instance() : null;
      _glassQuads = quads; _glassBase.set(base);
      const mesh = mp && mp.drawing() && typeof gfx.drawMirrorGlass === "function" ? getMirrorGlass(quads) : null;
      if (mesh && gfx.drawMirrorGlass(mesh, base, null)) { _glassLive++; return true; }
      _mirrorFbOpts.emissive = nite ? 0.85 : 0.55;
      _mirrorFbOpts.roughness = 0.92;
      _mirrorFbOpts.specular = 0.06;
      gfx.draw(getMirrorFallback(quads, !!nite), base, _mirrorFbOpts);
      _glassFb++;
      return false;
    }
    function glassState() {
      const vp = G.frame && G.frame.viewProj, b = _glassBase;
      const screen = _glassQuads && vp ? _glassQuads.map((q) => q.map((p) => {
        const w = [0, 1, 2].map((i) => b[i] * p[0] + b[4 + i] * p[1] + b[8 + i] * p[2] + b[12 + i]);
        const cl = [0, 1, 3].map((i) => vp[i] * w[0] + vp[4 + i] * w[1] + vp[8 + i] * w[2] + vp[12 + i]);
        return cl[2] > 1e-6 ? [(cl[0] / cl[2] + 1) / 2, (1 - cl[1] / cl[2]) / 2] : null;
      })) : null;
      return { live: _glassLive, fallback: _glassFb, screen };
    }
    const _rmq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const motionReduced = () => !!(_rmq && _rmq.matches)
      || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce");
    const _glassOpts = { alpha: 0.16, roughness: 0.05, specular: 0.9, doubleSided: true, noAlphaWrite: true };
    const _pinned = new WeakSet();
    const pin = (m) => { if (m && !_pinned.has(m)) { _pinned.add(m); if (typeof G.gfx.pinMesh === "function") G.gfx.pinMesh(m); } return m; };
    const _rigFx = { doubleSided: true, emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true }, _rigFxA = { doubleSided: true, emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };
    let _primeArmed = 0;
    const _primeZ = new Float32Array(16);
    const _primeWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
    function primeRace(paint, night) {
      if (!_primeArmed || carModelBuf || !G.cars || !G.cars.length) return 0;
      const gfx = G.gfx, held = !!((gfx.warming && gfx.warming()) || (gfx.warmQueued && gfx.warmQueued()));
      if (!held && _primeArmed === 2) { _primeArmed = 0; return 0; }
      _primeArmed = held ? 2 : 0;
      const Z = _primeZ; let n = 0;
      if (typeof gfx.primeChunkMerge === "function") gfx.primeChunkMerge();
      if (typeof Particles !== "undefined" && Particles.armPrime) Particles.armPrime();
      const d = (mesh, opts) => { if (mesh) { gfx.draw(mesh, Z, opts); n++; } };
      for (let k = 0; k <= 9; k++) { d(getGearDigit(k), _rigFx); for (let j = 0; j < 3; j++) d(getSpeedDigit(k), _rigFx); }
      const ws = CockpitOpts.wheel();
      if (CockpitOpts.wheelHasScreen(ws)) for (let lit = 0; lit <= 9; lit++) d(getLedStrip(lit, ws), _rigFx);
      d(getErsBar(), _rigFx); _rigFxA.alpha = 0.75; d(getErsBar(), _rigFxA);
      d(getOtLamp(false), _rigFx); _rigFxA.alpha = 0.7; d(getOtLamp(true), _rigFxA);
      if (typeof CarMesh.primeWheelExtras === "function") { CarMesh.primeWheelExtras(Z); n += 29; }
      if (ws === "retro" && typeof CarMesh.primeRetroDigits === "function") { CarMesh.primeRetroDigits(Z); n += 40; }
      if (paint) {
        const co = coOpt(paint), cars = G.cars;
        _primeWheelOpts.emissive = night ? 0.12 : 0;
        const wo = coOpt(_primeWheelOpts);
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          if (!c) continue;
          const pt = paintTeam(c);
          if (gfx.drawShadow) { gfx.drawShadow(Z, 2.4, 5.8); n++; }
          if (gfx.drawMark) { gfx.drawMark(Z, 1, 1); n++; }
          queueCarDecals(pt, Z, carDecalNum(c.team, c), false, !!c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp); n++;
          _ringOpts.emissive = 0; _ringOpts.alpha = 0.5;
          for (let k = 0; k < 4; k++) d(getSpinDisc(), _ringOpts);
          if (c.isPlayer) continue;
          d(_sharedRivalBody, co); d(_farRivalBody, co);
          d(teamBodyMesh(c.team, c), paint);
          const aSt = teamDecalState(pt, false, c.visualSetup, c.visStamp);
          for (const b of [0, 1, 0.5]) { deps.drawAeroFlaps(pt, aSt.val, b, Z, paint, aSt.aero, null, b !== 0.5); n++; }
          const wm = getFieldWheelMeshes(c.team, c);
          if (wm) for (let k = 0; k < 2; k++) { d(wm.F, wo); d(wm.R, wo); d(wm.FFixed, wo); d(wm.RFixed, wo); }
        }
      }
      return n;
    }
    const _rigWarmBase = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    function warmCockpitRig(c, paint, mirrorKey) {
      if (!c || carModelBuf || typeof G.gfx.warmDraws !== "function") return Promise.resolve(false);
      return G.gfx.warmDraws(() => { drawCockpitRig(c, _rigWarmBase, 0, paint, false); drawCockpitRig(c, _rigWarmBase, 0, paint, true); },
        { mirror: mirrorKey || null });
    }
    function warmCockpitTelemetry() {
      if (carModelBuf || typeof G.gfx.warmDraws !== "function") return Promise.resolve(false);
      return G.gfx.warmDraws(() => {
        const ws = CockpitOpts.wheel();
        G.gfx.draw(getGearDigit(1), _rigWarmBase, _rigFx);
        G.gfx.draw(getSpeedDigit(0), _rigWarmBase, _rigFx);
        if (CockpitOpts.wheelHasScreen(ws)) G.gfx.draw(getLedStrip(0, ws), _rigWarmBase, _rigFx);
      });
    }
    function drawCockpitRig(c, base, dt, paint, noWheel) {
      const nite = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && G.track.def.night);
      _cockpitOpts.emissive = nite ? 0.20 : 0.14;
      const opt = _cockpitOpts;
      const wheelStyle = noWheel ? "none" : CockpitOpts.wheel(), lay = CockpitOpts.layout(wheelStyle, noWheel ? "std" : null);
      G.gfx.draw(cockpitBodyMesh(c.team, c), base, paint);
      if (!carModelBuf) drawMirrorLens(c, base, nite);
      const cab = CockpitOpts.interior();
      G.gfx.draw(getCockpitCabin(cab, deps.resolveLivery(c.team)), base, opt);
      if (cab === "classic") {
        CarMesh.drawClassicTelemetry(base,c,G.dashKph(c.speed || 0),opt);
        G.gfx.draw(getCockpitGlass(cab), base, _glassOpts);
      }
      _rigT[0] = _rigT[5] = _rigT[10] = lay.wheelS; _rigT[13] = lay.wheelY; _rigT[14] = lay.wheelZ;
      if (!carModelBuf) {
        const aSt = teamDecalState(c.team, c.isPlayer);
        const liv = typeof CockpitFinishes !== "undefined" ? CockpitFinishes.view(deps.resolveLivery(c.team)).livery : undefined;
        deps.drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, base, paint, aSt.aero, "front", false, liv);
      }
      queueCarDecals(c.team, base, carDecalNum(c.team, c), true, true);
      _cockpitWheelOpts.emissive = nite ? 0.12 : 0;
      drawPlayerWheels(c, base, dt, _cockpitWheelOpts, true, 0.30, 1.4);
      if (wheelStyle === "none") {
        M4.mulTo(_rigA, base, _rigT);
        G.gfx.draw(getCockpitDash(), _rigA, opt);
        return;
      }
      c._whlVis = deps.damp(c._whlVis == null ? 0 : c._whlVis, M4.clamp(c.steerVis || 0, -1, 1), CarMesh.WHEEL_ROLL_LAMBDA, dt);
      const a = CarMesh.cockpitWheelRoll(c._whlVis);
      const ca = Math.cos(a), sa = Math.sin(a);
      _rigR[0] = ca; _rigR[1] = sa; _rigR[4] = -sa; _rigR[5] = ca;
      M4.mulTo(_rigA, base, _rigT);
      M4.mulTo(_rigB, _rigA, _rigR);
      if (typeof CockpitFinishes !== "undefined") CarMesh.wheelFinish(CockpitFinishes.get("wheel"));
      G.gfx.draw(getCockpitWheel(deps.resolveLivery(c.team), wheelStyle), _rigB, CarMesh.cockpitWheelOpts(opt));
      if (wheelStyle === "retro") {
        CarMesh.drawRetroTelemetry(_rigB,c,G.dashKph(c.speed || 0),G.raceT);
        return;
      }
      if (!CockpitOpts.wheelHasScreen(wheelStyle)) return;
      const fx = _rigFx;
      G.gfx.draw(getGearDigit(M4.clamp(c.gear || 1, 0, 9)), _rigB, fx);
      const rpmF = M4.clamp(((c.rpm || PhysicsConsts.IDLE_RPM) - PhysicsConsts.IDLE_RPM) / (PhysicsConsts.MAX_RPM - PhysicsConsts.IDLE_RPM), 0, 1);
      G.gfx.draw(getLedStrip(rpmF > 0.965 ? (motionReduced() || G.raceT * 14 % 1 < 0.5 ? 9 : 8) : Math.round(rpmF * 8), wheelStyle), _rigB, fx);
      drawWheelExtras(_rigB, c, G.raceT);
      const dash = G.dashKph(c.speed || 0);
      const kmh = (typeof HudReadouts !== "undefined" && HudReadouts.spdDigits)
        ? HudReadouts.spdDigits(dash)
        : Math.max(0, Math.min(999, typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(dash) : Math.round(dash)));
      const kv = Math.max(0, Math.min(999, Math.round(kmh) || 0)), nd = kv >= 100 ? 3 : kv >= 10 ? 2 : 1;
      for (let i = 0, div = nd === 3 ? 100 : nd === 2 ? 10 : 1; i < nd; i++, div /= 10) {
        _digT[12] = -0.034 + (i - (nd - 1) / 2) * 0.0135; _digT[13] = 0.022; _digT[14] = -0.0335;
        M4.mulTo(_digM, _rigB, _digT);
        G.gfx.draw(getSpeedDigit(Math.floor(kv / div) % 10), _digM, fx);
      }
      const en = M4.clamp(c.energy || 0, 0, 1);
      if (en > 0.01) {
        _digT[12] = 0.048; _digT[13] = 0.001; _digT[14] = -0.0315;
        M4.mulTo(_digM, _rigB, _digT);
        _digM[4] *= en; _digM[5] *= en; _digM[6] *= en;
        G.gfx.draw(pin(getErsBar()), _digM, c.deploying ? (_rigFxA.alpha = 0.75 + 0.25 * Math.sin(G.raceT * 22), _rigFxA) : fx);
      }
      if (c.otT > 0) {
        G.gfx.draw(pin(getOtLamp(true)), _rigB, (_rigFxA.alpha = 0.7 + 0.3 * Math.sin(G.raceT * 18), _rigFxA));
      } else if (c.otArmed) {
        G.gfx.draw(getOtLamp(false), _rigB, fx);
      }
      _digT[12] = _digT[13] = _digT[14] = 0;
    }

    function playerBodyMesh(team, car, visualKey = playerVisualKey) {
      if (carModelBuf) return null;
      const ld = team.id === "legends" && team.drivers ? team.drivers[G.driverIdx | 0] : null, lid = ld && ld.code || undefined;
      const key = team.id + ":" + visualKey + ":" + carDecalNum(team, car) + (lid ? ":" + lid : "");
      const liv = deps.resolveLivery(team);
      return putBoundedMesh(playerBodies, playerBodyOrder, key, () => G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, noWheels: true, num: carDecalNum(team, car), helmetKey: lid,
          parts: playerPartsFor(team, visualKey) })), PLAYER_BODY_CACHE_MAX);
    }
    const wheelMeshCache = {};
    const wheelMeshOrder = [];
    function freeWheelPair(m) {
      if (!m) return;
      if (G.gfx.freeMesh) {
        if (m.F) G.gfx.freeMesh(m.F);
        if (m.R) G.gfx.freeMesh(m.R);
        if (m.FFixed) G.gfx.freeMesh(m.FFixed);
        if (m.RFixed) G.gfx.freeMesh(m.RFixed);
      }
    }
    function getPlayerWheelMeshes(team) {
      const wt = CarWheels.tints(team && deps.resolveLivery(team));
      const key = playerTyreId + ":" + playerBrakeId + ":" + playerWheelId + wt.key;
      return putBoundedMesh(wheelMeshCache, wheelMeshOrder, key, () => {
        const band = playerTyreVisual && playerTyreVisual.band || Car3D.TYRE_BAND[playerTyreTier];
        const caliper = wt.cal || (playerBrakeVisual ? playerBrakeVisual.cal : Car3D.BRAKE_CALIPER[playerBrakesTier]);
        const rim = wt.rim || (playerBrakeVisual && playerBrakeVisual.rim);
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual, wt.ink, wt.surf);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual, wt.ink, wt.surf);
        return {
          F: G.gfx.createMesh(front.rotating),
          R: G.gfx.createMesh(rear.rotating),
          FFixed: G.gfx.createMesh(front.fixed),
          RFixed: G.gfx.createMesh(rear.fixed),
        };
      }, WHEEL_MESH_CACHE_MAX, freeWheelPair);
    }
    const fieldWheelCache = {};
    const fieldWheelOrder = [];
    const FIELD_WHEEL_CACHE_MAX = 12;
    let _fwTints = null;
    let _fwVt = null;
    function getFieldWheelMeshes(team, car) {
      team = carTeam(team, car);
      const setup = car && car.visualSetup;
      const st = setup ? teamDecalState(team, false, setup, car.visStamp) : teamDecalState(team, false);
      const vt = st.parts;
      const wt = CarWheels.tints(livOf(team));
      const base = st.fwKey || (st.fwKey = "field:" + (vt._ids ? vt._ids.tyres + ":" + vt._ids.brakes + ":" + vt._ids.wheels : "1:1:1"));
      let key = base;
      if (wt.key) { if (st.fwKeyWt !== wt) { st.fwKeyWt = wt; st.fwKeyFull = base + wt.key; } key = st.fwKeyFull; }
      _fwVt = vt; _fwTints = wt;
      return putBoundedMesh(fieldWheelCache, fieldWheelOrder, key, buildPendingFieldWheels, FIELD_WHEEL_CACHE_MAX, freeWheelPair);
    }
    function buildPendingFieldWheels() {
        const vt = _fwVt;
        const tyre = vt._visual && vt._visual.tyres;
        const brake = vt._visual && vt._visual.brakes;
        const wheel = vt._visual && vt._visual.wheels;
        const band = (tyre && tyre.band) || Car3D.TYRE_BAND[vt.tyres] || Car3D.TYRE_BAND[1];
        const wt = _fwTints;
        const caliper = wt.cal || (brake ? brake.cal : Car3D.BRAKE_CALIPER[vt.brakes]);
        const rim = wt.rim || (brake && brake.rim);
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false, tyre, brake, wheel, wt.ink, wt.surf);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false, tyre, brake, wheel, wt.ink, wt.surf);
        front.rotating._field = front.fixed._field = rear.rotating._field = rear.fixed._field = true;
        return {
          F: G.gfx.createMesh(front.rotating),
          R: G.gfx.createMesh(rear.rotating),
          FFixed: G.gfx.createMesh(front.fixed),
          RFixed: G.gfx.createMesh(rear.fixed),
        };
    }
    const _cq = [], _cqMesh = [];
    let _cqN = 0;
    const _crewOpts = { emissive: 0, doubleSided: true };
    let _crewDrawn = 0;
    function drawPitCrew(c, base, opt) {
      if (!c || c.pitState !== "box") return false;
      const dx = base[12] - G.camEye[0], dy = base[13] - G.camEye[1], dz = base[14] - G.camEye[2];
      if (dx * dx + dy * dy + dz * dz > 90 * 90) return false;
      if (typeof PitCrewAnim !== "undefined" && PitCrewAnim.draw(G, c, base, opt || _crewOpts)) { _crewDrawn++; return true; }
      const col = (c.team && c.team.color) || [0.30, 0.32, 0.36];
      const m = getCrewMesh(col);
      if (!m) return false;
      G.gfx.draw(m, base, opt || _crewOpts);
      _crewDrawn++;
      return true;
    }
    function pitCrewDrawn() { const n = _crewDrawn; _crewDrawn = 0; return n; }
    const VIS_WHEELBASE = WHEELS[0].z - WHEELS[2].z;
    const _wheelPhases = new WeakMap();
    function advanceWheelPhases(dt) {
      if (_mirrorBodies) { _mirrorViewRead = false; _mirrorViewContext = null; }
      const R = PhysicsConsts.WHEEL_R || CarWheels.WHEEL_R;
      for (let i = 0; i < G.cars.length; i++) {
        const c = G.cars[i];
        let phase = _wheelPhases.get(c);
        if (!phase) { phase = { rear: 0, front: 0 }; _wheelPhases.set(c, phase); }
        const d = CarWheels.phaseStep(c.speed, dt, R, c.wheelLock || 0);
        phase.rear = CarWheels.wrapPhase((phase.rear || 0) + d.rear);
        phase.front = CarWheels.wrapPhase((phase.front || 0) + d.front);
      }
    }
    function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale, bare) {
      const wm = c.isPlayer ? getPlayerWheelMeshes(c.team) : getFieldWheelMeshes(c.team, c);
      const phase = _wheelPhases.get(c);
      const spR = Math.sin(phase ? phase.rear : 0), cpR = Math.cos(phase ? phase.rear : 0);
      const spF = Math.sin(phase ? phase.front : 0), cpF = Math.cos(phase ? phase.front : 0);
      const flat = (c.flatSpot || 0) * 0.004 * (0.5 + 0.5 * cpF);
      const WSV = PhysicsConsts.WHEEL_STEER_VIS;
      let steerA = M4.clamp(c.steerVis || 0, -1, 1) * WSV;
      if (!c.human) steerA = M4.clamp(steerA - Math.atan(VIS_WHEELBASE * (c.kCur || 0)), -WSV, WSV);
      else if (G.STEER_SPEED_REF > 0) steerA /= 1 + Math.abs(c.speed || 0) * PhysicsConsts.VMAX / (G.vTop() * G.STEER_SPEED_REF);
      const steerSin = Math.sin(steerA), steerCos = Math.cos(steerA);
      const ws = wScale || 1;
      const wo = coOpt(opt);
      const anim = c.pitState === "box" && G.pits && G.pits.stopAnim ? G.pits.stopAnim(c) : null;
      const lift = anim ? anim.lift : 0, off = anim ? anim.off : 0;
      let camD2 = 0;
      if (!c.isPlayer && !bare) {
        const dx = base[12] - G.camEye[0], dy = base[13] - G.camEye[1], dz = base[14] - G.camEye[2];
        camD2 = dx * dx + dy * dy + dz * dz;
      }
      const lodT = c._lodTier, haveTier = FieldLod.on && (lodT === 0 || lodT === 1 || lodT === 2);
      const lite = bare || (!c.isPlayer && (haveTier ? lodT >= 1 : FieldLod.wheelsLite(camD2, G.lens && G.lens.fovY)));
      const dropFixed = bare || (!c.isPlayer && haveTier && lodT >= 2);
      const tyreCol = !dropFixed && c.tyre && c.tyre.colour
        && (c.isPlayer || lite || camD2 < 60 * 60) ? c.tyre.colour : null;
      const spinRate = (c.speed / PhysicsConsts.WHEEL_R) * dt;
      const blur = !lite && camD2 < 120 * 120 ? Math.min(1, Math.max(0, (Math.abs(spinRate) - 0.6) / 1.2)) : 0;
      const heatF = c.brakeHeat || 0;
      const flareA = !bare && !c.isPlayer && heatF > 0.15 && camD2 >= 40 * 40 && camD2 < 240 * 240 && typeof Particles !== "undefined"
        ? (heatF - 0.15) / 0.85 * (opt && opt.emissive > 0 ? 0.9 : 0.3) : 0;
      for (let w = 0; w < WHEELS.length; w++) {
        const wd = WHEELS[w];
        if (frontsOnly && wd.rear) continue;
        const ss = wd.front ? steerSin : 0, cs = wd.front ? steerCos : 1;
        const sp = wd.front ? spF : spR, cp = wd.front ? cpF : cpR;
        const L = _wheelLocal;
        L[0] = cs*ws;    L[1] = 0;      L[2] = -ss*ws;    L[3] = 0;
        L[4] = ss*sp;    L[5] = cp;     L[6] = cs*sp;     L[7] = 0;
        L[8] = ss*cp;    L[9] = -sp;    L[10] = cs*cp;    L[11] = 0;
        L[12] = wd.x + (wd.x < 0 ? -1 : 1) * ((ws - 1) * 0.16 + off); L[13] = wd.y + (wd.front ? flat : 0) + lift; L[14] = wd.z + (fwdOffset || 0); L[15] = 1;
        M4.mulTo(_wheelWorld, base, L);
        G.gfx.draw(wd.rear ? wm.R : wm.F, _wheelWorld, wo);
        if (dropFixed) {
          if (flareA > 0 && wd.front) {
            const tx = (wd.x < 0 ? -1 : 1) * 0.19, W = _wheelWorld;
            Particles.flare(W[12] + W[0] * tx, W[13] + W[1] * tx, W[14] + W[2] * tx,
              0.16 + 0.10 * heatF, 2.4, 0.85, 0.22, flareA);
          }
          continue;
        }
        const F = _fixedWheelLocal;
        F[0] = cs*ws; F[1] = 0; F[2] = -ss*ws; F[3] = 0;
        F[4] = 0; F[5] = 1; F[6] = 0; F[7] = 0;
        F[8] = ss; F[9] = 0; F[10] = cs; F[11] = 0;
        F[12] = L[12]; F[13] = L[13]; F[14] = L[14]; F[15] = 1;
        M4.mulTo(_fixedWheelWorld, base, F);
        _wq[_wqN] || (_wq[_wqN] = new Float32Array(16));
        _wq[_wqN].set(_fixedWheelWorld);
        _wqMesh[_wqN] = wd.rear ? wm.RFixed : wm.FFixed;
        _wqN++;
        const heat = c.brakeHeat || 0;
        const ringOk = heat > 0.05 && camD2 < 40 * 40;
        if (tyreCol) {
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.012);
          _cq[_cqN] || (_cq[_cqN] = new Float32Array(16));
          const Wc = _cq[_cqN];
          Wc.set(_wheelWorld);
          Wc[12] += Wc[0] * tx; Wc[13] += Wc[1] * tx; Wc[14] += Wc[2] * tx;
          _cqMesh[_cqN] = getCompoundRing(tyreCol);
          _cqN++;
        }
        if (blur > 0.01) {
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.020);
          _rq[_rqN] || (_rq[_rqN] = new Float32Array(16));
          const Wd = _rq[_rqN];
          Wd.set(_wheelWorld);
          Wd[12] += Wd[0] * tx; Wd[13] += Wd[1] * tx; Wd[14] += Wd[2] * tx;
          _rqEmis[_rqN] = 0; _rqAlpha[_rqN] = 0.72 * blur; _rqMesh[_rqN] = getSpinDisc();
          _rqN++;
        }
        if (ringOk) {
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
          const W = _ringWorld;
          W.set(_wheelWorld);
          W[12] += W[0] * tx; W[13] += W[1] * tx; W[14] += W[2] * tx;
          _rq[_rqN] || (_rq[_rqN] = new Float32Array(16));
          _rq[_rqN].set(W);
          _rqEmis[_rqN] = 0.30 + 0.70 * heat;
          _rqAlpha[_rqN] = Math.min(1, 0.25 + heat * 0.9);
          _rqMesh[_rqN] = null;
          _rqN++;
        } else if (flareA > 0 && wd.front) {
          const tx = (wd.x < 0 ? -1 : 1) * 0.19, W = _wheelWorld;
          Particles.flare(W[12] + W[0] * tx, W[13] + W[1] * tx, W[14] + W[2] * tx,
            0.16 + 0.10 * heatF, 2.4, 0.85, 0.22, flareA);
        }
      }
      for (let i = 0; i < _wqN; i++) G.gfx.draw(_wqMesh[i], _wq[i], wo);
      for (let i = 0; i < _cqN; i++) G.gfx.draw(_cqMesh[i], _cq[i], wo);
      _cqN = 0;
      const ro = _ringOpts;
      for (let i = 0; i < _rqN; i++) {
        ro.emissive = _rqEmis[i]; ro.alpha = _rqAlpha[i];
        G.gfx.draw(_rqMesh[i] || getBrakeRing(), _rq[i], ro);
      }
      _wqN = 0; _rqN = 0;
    }

    const _mirWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
    let _mirrorBodyLow = null, _mirrorViewRead = false, _mirrorViewContext = null, _mirrorContext = null;
    function mirrorBodyContext() {
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance ? MirrorPass.instance() : null;
      if (!mp || !mp.drawing || !mp.drawing() || !mp.state || document.body.classList.contains("bc-on")) return null;
      if (_mirrorViewRead) return _mirrorViewContext;
      _mirrorViewRead = true;
      const frame = G.frame;
      if (!frame || !frame.view || !frame.proj || !frame.viewProj ||
          frame.view.length !== 16 || frame.proj.length !== 16 || frame.viewProj.length !== 16 ||
          typeof frame.mirrorLite !== "boolean") return null;
      const state = mp.state();
      if (!state.shown || !state.rect || (state.pip && state.pip.shown)) return null;
      const canvas = document.getElementById("game");
      if (!canvas || !canvas.getBoundingClientRect) return null;
      const box = canvas.getBoundingClientRect();
      const width = state.rect[2] * box.width, height = state.rect[3] * box.height;
      if (!(width > 0 && height > 0)) return null;
      const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
      const scale = Math.max(width * Math.abs(frame.proj[0]), height * Math.abs(frame.proj[5])) * dpr * 0.5;
      if (!(scale > 0 && Number.isFinite(scale))) return null;
      if (!_mirrorContext) _mirrorContext = { pixelScale: 0, view: null, vp: null };
      _mirrorContext.pixelScale = scale; _mirrorContext.view = frame.view; _mirrorContext.vp = frame.viewProj;
      return (_mirrorViewContext = _mirrorContext);
    }
    function mirrorBodyLow(c, mat, context, radius) {
      const vp = context.vp, view = context.view;
      const x = mat[12], y = mat[13], z = mat[14];
      const w = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
      const depth = w - radius;
      if (!(depth > 0)) { _mirrorBodyLow.set(c, false); return false; }
      const vx = Math.abs(view[0]*x + view[4]*y + view[8]*z + view[12]);
      const vy = Math.abs(view[1]*x + view[5]*y + view[9]*z + view[13]);
      const px = context.pixelScale * (1 + (Math.max(vx, vy) + radius) / depth) / depth;
      const low = px <= (_mirrorBodyLow.get(c) ? 5 : 4);
      _mirrorBodyLow.set(c, low);
      return low;
    }
    function drawMirrorCar(c, mat, paint, night) {
      const body = carModelBuf ? null : (c.isPlayer ? playerBodyMesh(c.team, c) : teamBodyMesh(c.team, c));
      if (!body) { G.gfx.draw(teamMesh(c.team, c), mat, paint); return; }
      const context = _mirrorBodies && !c.isPlayer && FieldLod.on ? mirrorBodyContext() : null;
      const low = context ? _mirrorBodies.get(body) : null;
      G.gfx.draw(low && mirrorBodyLow(c, mat, context, low.radius) ? low.mesh : body, mat, paint);
      const aSt = teamDecalState(paintTeam(c), c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      deps.drawAeroFlaps(paintTeam(c), aSt.val, c.aeroX || 0, mat, paint, aSt.aero, null, true);
      _mirWheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, mat, 0, _mirWheelOpts, false, 0, 1, true);
    }

    const _ersLightOpts = { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true, alpha: 1 };
    const _flameOpts = { emissive: 1.0, roughness: 1, specular: 0, alpha: 1, noAlphaWrite: true };
    const _fxWorld = new Float32Array(16);
    function drawExhaustFx(c, mat, ersOn, flameOk) {
      const raceT = G.raceT, W = _fxWorld;
      if (ersOn) {
        W.set(mat);
        W[12] += W[4] * 0.605 - W[8] * 2.615;
        W[13] += W[5] * 0.605 - W[9] * 2.615;
        W[14] += W[6] * 0.605 - W[10] * 2.615;
        _ersLightOpts.alpha = 0.5 + 0.5 * (Math.sin(raceT * 28.0) > 0 ? 1 : 0.2);
        G.gfx.draw(pin(CarMesh.getErsLight()), W, _ersLightOpts);
      }
      if ((c.exhaustPop || 0) > 0.05 && flameOk) {
        const fl = 0.6 + 0.4 * Math.sin(raceT * 41.0 + Math.sin(raceT * 23.0) * 3.0);
        W.set(mat);
        W[12] += W[4] * 0.40 - W[8] * 2.63;
        W[13] += W[5] * 0.40 - W[9] * 2.63;
        W[14] += W[6] * 0.40 - W[10] * 2.63;
        _flameOpts.alpha = (0.30 + 0.55 * fl) * c.exhaustPop;
        G.gfx.draw(pin(CarMesh.getExhaustFlame(c.fuelVisual && c.fuelVisual.fxFlame)), W, _flameOpts);
      }
    }

    async function loadCarModel(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        GLTF.toMesh(buf, { scale: CAR_MODEL_SCALE });
        carModelBuf = buf;
        for (const k in teamMeshes) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamMeshes[k]); delete teamMeshes[k]; }
        for (const k in teamBodies) { freeBodyPair(teamBodies[k]); delete teamBodies[k]; }
        _seatData.clear();
        for (const k in playerBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
        freeSharedRivalBodies();
        playerBodyOrder.length = teamMeshOrder.length = teamBodyOrder.length = 0;
        for (const k in cockpitBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
        cockpitBodyOrder.length = 0;
        for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
        wheelMeshOrder.length = 0;
        for (const k in fieldWheelCache) { freeWheelPair(fieldWheelCache[k]); delete fieldWheelCache[k]; }
        fieldWheelOrder.length = 0;
        return true;
      } catch (e) { return false; }
    }

    const _cockpitOpts = { doubleSided: true, roughness: 0.88, metalness: 0.04, specular: 0.14, emissive: 0 };
    const _cockpitWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };

    function beginDecals() { _decalCount = 0; }
    let _decalFlushing = false;
    function flushDecals(night) {
      planPhotoAtlases();
      if (++_flushFrame % DECAL_SWEEP_EVERY === 0) sweepStaleDecals();
      _decalFlushing = true;
      try {
        for (let i = 0; i < _decalCount; i++)
          drawCarDecals(_decalTeams[i], _decalMats[i], night, _decalNums[i], _decalCockpit[i], _decalSetup[i], _decalVis[i], _decalStamp[i]);
      } finally { _decalFlushing = false; }
      reapHiResGrave();
    }
    function setPlayerParts(vt, visualKey) {
      const team = G.player ? G.player.team : Teams.LIST[G.teamIdx];
      playerParts = vt;
      playerPartsTeam = team ? team.id : "";
      if (team) vt = Car3D.appearanceParts(vt, deps.resolveLivery(team));
      playerTyreTier = vt.tyres; playerBrakesTier = vt.brakes;
      playerTyreId = vt._ids ? vt._ids.tyres : "medium";
      playerBrakeId = vt._ids ? vt._ids.brakes : "standard";
      playerTyreVisual = vt._visual && vt._visual.tyres || null;
      playerBrakeVisual = vt._visual && vt._visual.brakes || null;
      playerWheelId = vt._ids ? vt._ids.wheels : "standard";
      playerWheelVisual = vt._visual && vt._visual.wheels || null;
      playerVisualKey = visualKey;
      if (G.player && team && playerParts && playerParts._ids) {
        const recipe = {};
        for (const cat of Parts.CATALOG) recipe[cat.id] = playerParts._ids[cat.id] || "";
        const stamped = carVisual(team, carDecalNum(team, G.player), true, () => recipe);
        G.player.visualSetup = stamped.visualSetup;
        G.player.visStamp = stamped.visStamp;
        G.player.visPaint = stamped.visPaint;
        G.player.visSh = stamped.visSh;
      }
    }
    function invalidateCustomMeshCaches(teamId) {
      const prefix = (teamId || "custom") + ":";
      invalidateCustomMeshCache(teamMeshes, teamMeshOrder, prefix);
      invalidateCustomMeshCache(teamBodies, teamBodyOrder, prefix); _seatData.clear();
      invalidateCustomMeshCache(playerBodies, playerBodyOrder, prefix);
      invalidateCustomMeshCache(cockpitBodies, cockpitBodyOrder, prefix);
    }
    function invalidateFactoryMeshCaches() {
      for (const k in teamMeshes) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamMeshes[k]); delete teamMeshes[k]; }
      for (const k in teamBodies) { freeBodyPair(teamBodies[k]); delete teamBodies[k]; }
      _seatData.clear();
      for (const k in playerBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
      for (const k in cockpitBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
      playerBodyOrder.length = teamMeshOrder.length = teamBodyOrder.length = cockpitBodyOrder.length = 0;
      for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
      wheelMeshOrder.length = 0;
      for (const k in fieldWheelCache) { freeWheelPair(fieldWheelCache[k]); delete fieldWheelCache[k]; }
      fieldWheelOrder.length = 0;
      freeSharedRivalBodies();
      _teamMeshKeyCache.clear();
    }

    let _menuCarPrep = null;
    return (_instance = {
      teamMesh, teamBodyMesh, sharedRivalBodyMesh, farRivalBodyReady, playerBodyMesh, cockpitBodyMesh, cockpitShadowMesh, cockpitCaster,
      teamDecalState, carDecalNum, getCarDecalTexture, paintTeam, livOf, invalidateDecalTextures, sweepStaleDecals, decalBytes,
      drawCarDecals, queueCarDecals, beginDecals, flushDecals,
      advanceWheelPhases, drawPlayerWheels, drawPitCrew, pitCrewDrawn, drawCockpitRig, warmCockpitRig, warmCockpitTelemetry, primeRace, drainDeferredCarWarm, drawExhaustFx, glassState, drawMirrorCar,
      warmCarAssets, warmCarAssetsAsync, loadCarModel, buildCarData,
      prepareMenuCarAssets: (current) => prepareMenuCarAssets(current).then((r) => { if (r) _menuCarPrep = r; return r; }),
      setPlayerParts, invalidateCustomMeshCaches, invalidateFactoryMeshCaches,
      WHEELS, coOpt, liveryBitmapOpts,
      get modelBuf() { return carModelBuf; },
      get playerVisualKey() { return playerVisualKey; },
      get menuCarAssets() { return _menuCarPrep; },
    });
  }
  let _instance = null;
  return { create, carVisual, instance: () => _instance, coOpt: (o) => (_instance ? _instance.coOpt(o) : o) };
})();
Object.freeze(CarDraw);
