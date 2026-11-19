"use strict";

const ShadowPass = (function () {
  function create(G, deps) {
    Log.info("game", "ShadowPass.create");
    const LT = LightTune.LT;
    const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const _shPlanes = [0,0,0,0,0,0].map(() => new Float32Array(4));
    const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
    const _mCView = new Float32Array(16), _mCProj = new Float32Array(16), _mCVP = new Float32Array(16);
    const _mFlView = new Float32Array(16), _mFlProj = new Float32Array(16), _mFlVP = new Float32Array(16);
    const _flReach = [0, 0, 0, 0];
    let _carMapEmpty = false;

    const _upX = [1, 0, 0], _upY = [0, 1, 0];
    const _shEye = [0, 0, 0], _shCtr = [0, 0, 0], _flEye = [0, 0, 0], _flTgt = [0, 0, 0];
    const CULL_NO_UPLOAD = { upload: false };
    const CULL_NO_UPLOAD_REACH = { upload: false, reach: _flReach };
    const SUN_BACK_MIN = 150, SUN_BACK_MAX = 400, SUN_RECV = 170;
    const CAR_BACK = 150, CAR_FAR = 320;
    let MOON_CADENCE = true;
    try { MOON_CADENCE = localStorage.getItem("apex26.moonShadowCadence") !== "0"; } catch (_) {  }
    let SUN_BACK = SUN_BACK_MAX, SUN_FAR = SUN_BACK_MAX + SUN_RECV;
    function sunSpan(track, box) {
      const top = track && track.propTop;
      SUN_BACK = (typeof top === "number" && top >= 0)
        ? Math.min(SUN_BACK_MAX, Math.max(SUN_BACK_MIN, Math.ceil(Math.hypot(top, box)) + 10)) : SUN_BACK_MAX;
      SUN_FAR = SUN_BACK + SUN_RECV;
    }
    let _shadowSnapX = null, _shadowSnapZ = null, _shadowBox = null;
    let _shadowSunX = null, _shadowSunY = null, _shadowSunZ = null;
    let _lampShX = null, _lampShY = null, _lampShZ = null;
    let _lampShR = null, _lampShC = null, _lampShDx = null, _lampShDy = null, _lampShDz = null;
    let _lampShCarKey = 0;
    const LAMP_HANDOVER = 1.2;
    const LAMP_PAD_IN = 36, LAMP_PAD_OUT = 72;
    let _lampNear = false;
    const _shadowCtr = [0, 0, 0];

    const _shadowMats = [];
    const _shadowTeams = [];
    const _shadowCars = [];
    const _shadowCast = [];
    const _livePlayerShadowMat = new Float32Array(16);
    const _cockpitShadowMat = new Float32Array(16);
    let _playerCockpit = null;
    let _shadowCount = 0;

    function _castPropBatchesShadow(reach) {
      const _pb = G.track.meshes.propBatches;
      if (!_pb || !G.gfx.castShadowInstanced) return;
      const planes = (G.gfx.shadowCullVP && G.gfx.makeFrustumPlanes)
        ? G.gfx.makeFrustumPlanes(G.gfx.shadowCullVP, _shPlanes) : null;
      for (let i = 0; i < _pb.length; i++) {
        if (planes && G.gfx.cullInstances) {
          G.gfx.castShadowInstanced(_pb[i], G.gfx.cullInstances(_pb[i], planes, reach ? CULL_NO_UPLOAD_REACH : CULL_NO_UPLOAD));
        } else G.gfx.castShadowInstanced(_pb[i]);
      }
    }
    function _castRibbonSh(geo, key, plain, allow = true) {
      if (G.track.meshes[key] === undefined) {
        G.track.meshes[key] = null;
        const tierOk = typeof PerfGov === "undefined" || PerfGov.tier() < 3;
        if (allow && tierOk && geo && G.gfx.createChunkedMesh) {
          geo._keepPositions = true;
          G.track.meshes[key] = G.gfx.createChunkedMesh(geo, 72);
          if (typeof Tracks !== "undefined" && Tracks.dropRibbonCpuIfReady) Tracks.dropRibbonCpuIfReady(G.track);
        }
      }
      const ch = G.track.meshes[key];
      if (ch && ch.chunks) G.gfx.castShadowChunked(ch, MAT_IDENT);
      else G.gfx.castShadow(plain, MAT_IDENT);
    }

    function reset() {
      _shadowSnapX = _shadowSnapZ = _shadowBox = null;
      _shadowSunX = _shadowSunY = _shadowSunZ = null;
      _lampShX = _lampShY = _lampShZ = null; _lampShR = _lampShC = _lampShDx = _lampShDy = _lampShDz = null; _lampShCarKey = 0;
      _lampNear = false;
      _shadowCount = 0;
      _shadowCars.length = 0; _shadowTeams.length = 0; _shadowCast.length = 0;
      _carMapEmpty = true;
    }
    function beginFrame() { _shadowCount = 0; }
    function pushCaster(groundMat, team, car, cast) {
      let _sm = _shadowMats[_shadowCount];
      if (!_sm) { _sm = new Float32Array(16); _shadowMats[_shadowCount] = _sm; }
      _sm.set(groundMat);
      _shadowTeams[_shadowCount] = team;
      _shadowCars[_shadowCount] = car;
      _shadowCast[_shadowCount] = cast !== false;
      _shadowCount++;
    }
    function resolvePlayer(smp, yv) {
      _playerCockpit = null;
      if (!deps.cockpitCaster || !G.player || G.state === "menu") return;
      const tier = PerfGov.tier();
      const mapped = (G.gfx.carShadowEnabled !== false && G.gfx.carShadowBegin && LT.carShadow && !(LT.shadowStr <= 0) && tier < 3) ||
        (G.gfx.lampShadowEnabled !== false && G.gfx.lampShadowBegin && LT.lampShadow && tier < 2 && !G._studioRig);
      if (mapped) _playerCockpit = deps.cockpitCaster(G.player, smp, yv, _cockpitShadowMat);
    }
    function _playerMat() { return _playerCockpit ? _cockpitShadowMat : _livePlayerShadowMat; }
    function _castPlayer() {
      G.gfx.castShadow(_playerCockpit || deps.teamMesh(G.player.team, G.player, true), _playerMat());
    }
    function _carCastable(i, r2) {
      const m = _shadowMats[i], dx = m[12] - _shadowCtr[0], dz = m[14] - _shadowCtr[2];
      return dx * dx + dz * dz <= r2 && !!_shadowCast[i] && _shadowCars[i] !== G.player;
    }
    function flushBlobs() {
      const gfx = G.gfx;
      for (let i = 0; i < _shadowCount; i++) gfx.drawShadow(_shadowMats[i], 2.4, 5.8);
    }

    function sunPass(frame, _frameNo, _hasLivePlayerShadow) {
      if (G.track) {
        const sd = frame.sunDir;
        const up = Math.abs(sd[1]) > 0.98 ? _upX : _upY;
        const zx = sd[0], zy = sd[1], zz = sd[2];
        let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
        const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        const sBox = LT.shadowRange != null ? LT.shadowRange : 80;
        sunSpan(G.track, sBox);
        const step = sBox / 4;
        let fbx = G.camTgt[0] - G.camEye[0], fbz = G.camTgt[2] - G.camEye[2];
        if (G.player && G.player.head != null) { fbx = Math.sin(G.player.head); fbz = Math.cos(G.player.head); }
        const fbl = Math.hypot(fbx, fbz), fBias = Math.min(20, sBox * 0.3);
        if (fbl > 1e-6) { fbx = fbx / fbl * fBias; fbz = fbz / fbl * fBias; } else { fbx = 0; fbz = 0; }
        _shadowCtr[0] = G.camEye[0] + fbx; _shadowCtr[1] = G.camTgt[1]; _shadowCtr[2] = G.camEye[2] + fbz;
        frame.shadowCtr = _shadowCtr;
        const cx = _shadowCtr[0], cy = _shadowCtr[1], cz = _shadowCtr[2];
        const lu = Math.round((xx * cx + xy * cy + xz * cz) / step) * step;
        const lv = Math.round((yx * cx + yy * cy + yz * cz) / step) * step;
        const _shKeyG = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        const _shadowsRead = _shKeyG > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01);
        if (!_shadowsRead) {
          _shadowSnapX = _shadowSnapZ = _shadowBox = null;
          _shadowSunX = _shadowSunY = _shadowSunZ = null;
        } else if (lu !== _shadowSnapX || lv !== _shadowSnapZ || sBox !== _shadowBox ||
            sd[0] !== _shadowSunX || sd[1] !== _shadowSunY || sd[2] !== _shadowSunZ) {
          _shadowSnapX = lu; _shadowSnapZ = lv; _shadowBox = sBox;
          _shadowSunX = sd[0]; _shadowSunY = sd[1]; _shadowSunZ = sd[2];
          const lw = zx * cx + zy * cy + zz * cz;
          const wx = xx * lu + yx * lv + zx * lw;
          const wy = xy * lu + yy * lv + zy * lw;
          const wz = xz * lu + yz * lv + zz * lw;
          _shEye[0] = wx + sd[0] * SUN_BACK; _shEye[1] = wy + sd[1] * SUN_BACK; _shEye[2] = wz + sd[2] * SUN_BACK;
          _shCtr[0] = wx; _shCtr[1] = wy; _shCtr[2] = wz;
          M4.lookAtTo(_mLView, _shEye, _shCtr, up);
          M4.orthoTo(_mLProj, -sBox, sBox, -sBox, sBox, 1.0, SUN_FAR);
          M4.mulTo(_mLVP, _mLProj, _mLView);
          G.gfx.shadowBegin(_mLVP);
          _castRibbonSh(G.track.terrainGeo, "terrainChunked", G.track.meshes.terrain);
          _castRibbonSh(G.track.roadGeo, "roadChunked", G.track.meshes.road, G.gfx.chunkedTrackCoords !== false);
          const _shKey = _shKeyG;
          if (_shKey > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
            G.gfx.castShadowChunked(G.track.meshes.props, MAT_IDENT);
            _castPropBatchesShadow();
          }
          G.gfx.shadowEnd();
        }
        const _carSpd = G.player ? Math.abs(G.player.speed) : 0;
        const _carTier = PerfGov.tier();
        const _carShadowFrame = (_frameNo & 1) === 0 ||
            (_carTier < 2 && deps.vStd(_carSpd) > 0.15 && !(MOON_CADENCE && _shKeyG <= 0.28));
        const _carMapWanted = G.gfx.carShadowEnabled !== false && !(LT.shadowStr <= 0);
        const _carShadowWanted = _carMapWanted && G.gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 &&
            (_hasLivePlayerShadow || _shadowCount > 0) && G.player && G.state !== "menu" &&
            (_shKeyG > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01));
        if (_carShadowWanted && !_carShadowFrame && G.gfx.carShadowKeep && !_carMapEmpty) G.gfx.carShadowKeep();
        if (_carMapWanted && G.gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 && _carShadowFrame &&
            (_hasLivePlayerShadow || _shadowCount > 0) && G.player && G.state !== "menu") {
          const _ck = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
          if (_ck > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
            _shEye[0] = _shadowCtr[0] + sd[0] * CAR_BACK; _shEye[1] = _shadowCtr[1] + sd[1] * CAR_BACK; _shEye[2] = _shadowCtr[2] + sd[2] * CAR_BACK;
            M4.lookAtTo(_mCView, _shEye, _shadowCtr, up);
            const cBox = 42 * Math.max(1, sBox / 80);
            M4.orthoTo(_mCProj, -cBox, cBox, -cBox, cBox, 1.0, CAR_FAR);
            M4.mulTo(_mCVP, _mCProj, _mCView);
            let _csH2 = 0;
            for (let v = 0; v < 8; v++) {
              const a = v & 1 ? cBox : -cBox, b = v & 2 ? cBox : -cBox, c = v & 4 ? CAR_BACK - 1 : CAR_BACK - CAR_FAR;
              const hx = a * xx + b * yx + c * zx, hz = a * xz + b * yz + c * zz;
              if (hx * hx + hz * hz > _csH2) _csH2 = hx * hx + hz * hz;
            }
            const _csR = Math.sqrt(_csH2) + 8;
            const _csR2 = _csR * _csR;
            const _cpm = _playerMat();
            const _cpdx = _cpm[12] - _shadowCtr[0], _cpdz = _cpm[14] - _shadowCtr[2];
            const _carPlayerIn = _hasLivePlayerShadow && _cpdx * _cpdx + _cpdz * _cpdz <= _csR2;
            let _carAny = _carPlayerIn;
            for (let i = 0; i < _shadowCount && !_carAny; i++) _carAny = _carCastable(i, _csR2);
            _carMapEmpty = !_carAny;
            if (_carAny) {
              G.gfx.carShadowBegin(_mCVP, cBox / 42);
              if (_carPlayerIn) _castPlayer();
              for (let i = 0; i < _shadowCount; i++) {
                if (_carCastable(i, _csR2)) G.gfx.castShadow(deps.teamMesh(_shadowTeams[i], _shadowCars[i], true), _shadowMats[i]);
              }
              G.gfx.carShadowEnd();
            }
          }
        }
      }
    }

    function _lampCasterKey(k, m) {
      k = (k * 31 + Math.round(m[12] * 4)) | 0;
      k = (k * 31 + Math.round(m[13] * 4)) | 0;
      k = (k * 31 + Math.round(m[14] * 4)) | 0;
      k = (k * 31 + Math.round(m[8] * 8)) | 0;
      k = (k * 31 + Math.round(m[9] * 8)) | 0;
      return (k * 31 + Math.round(m[10] * 8)) | 0;
    }
    function lampPass(frame, _frameNo, _hasLivePlayerShadow) {
      if (G.gfx.lampShadowEnabled !== false && G.gfx.lampShadowBegin && LT.lampShadow && PerfGov.tier() < 2 && frame.lights && !G._studioRig &&
          G.player && G.state !== "menu") {
        const _flk = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        if (_flk <= 0.30) {
          const L = frame.lights, nRec = (L.length / 15) | 0;
          const tailFrom = frame.tailCount > 0 ? frame.tailStart : nRec;
          const lum = frame.lampLum && frame.lampLum.length >= tailFrom ? frame.lampLum : null;
          let flBest = -1, flScore = Infinity, flCur = -1, flCurScore = Infinity;
          for (let i = 0; i < nRec; i++) {
            const o = i * 15;
            if (i >= tailFrom) continue;
            if (L[o + 6] < 12) continue;
            const dx = L[o] - G.camEye[0], dy = L[o + 1] - G.camEye[1], dz = L[o + 2] - G.camEye[2];
            const s = (dx * dx + dy * dy + dz * dz) /
                      Math.max(lum ? lum[i] : Math.max(L[o + 3], L[o + 4], L[o + 5]), 1);
            if (s < flScore) { flScore = s; flBest = i; }
            if (L[o] === _lampShX && L[o + 1] === _lampShY && L[o + 2] === _lampShZ) { flCur = i; flCurScore = s; }
          }
          if (flCur >= 0 && flBest !== flCur && flScore * LAMP_HANDOVER >= flCurScore) flBest = flCur;
          if (flBest >= 0) {
            const o = flBest * 15;
            const rad = L[o + 6];
            const _camDx = L[o] - G.camEye[0], _camDy = L[o + 1] - G.camEye[1], _camDz = L[o + 2] - G.camEye[2];
            const _camD2 = _camDx * _camDx + _camDy * _camDy + _camDz * _camDz;
            const _pad = _lampNear ? LAMP_PAD_OUT : LAMP_PAD_IN;
            const _lim = rad + _pad;
            if (_camD2 > _lim * _lim) _lampNear = false;
            else {
            _lampNear = true;
            const _lx = L[o], _ly = L[o + 1], _lz = L[o + 2];
            const _sameLamp = _lx === _lampShX && _ly === _lampShY && _lz === _lampShZ &&
              rad === _lampShR && L[o + 11] === _lampShC &&
              L[o + 7] === _lampShDx && L[o + 8] === _lampShDy && L[o + 9] === _lampShDz;
            const _lsR = rad + 8, _lsR2 = _lsR * _lsR;
            const _pm = _playerMat();
            const _pdx = _pm[12] - _lx, _pdy = _pm[13] - _ly, _pdz = _pm[14] - _lz;
            const _playerIn = _hasLivePlayerShadow && (_pdx * _pdx + _pdy * _pdy + _pdz * _pdz) <= _lsR2;
            let _carKey = _playerIn ? _lampCasterKey(1, _pm) : 0;
            for (let i = 0; i < _shadowCount; i++) {
              const _cm = _shadowMats[i];
              if (_shadowCars[i] === G.player || !_shadowCast[i]) continue;
              const _cdx = _cm[12] - _lx, _cdy = _cm[13] - _ly, _cdz = _cm[14] - _lz;
              if (_cdx * _cdx + _cdy * _cdy + _cdz * _cdz > _lsR2) continue;
              _carKey = _lampCasterKey(_carKey, _cm);
            }
            const _carOnly = _sameLamp && _carKey !== _lampShCarKey;
            const _deferCars = _carOnly && (_frameNo & 1) === 1 &&
                (PerfGov.tier() >= 1 || typeof G.gfx.lampCarsBegin !== "function");
            if ((_sameLamp && _carKey === _lampShCarKey) || _deferCars) {
              if (G.gfx.lampShadowKeep) G.gfx.lampShadowKeep(flBest);
            } else {
            if (!_sameLamp) {
              const fov = Math.min(2.6, 2 * Math.acos(M4.clamp(L[o + 11], -0.999, 0.999)) * 1.1 + 0.15);
              const up = Math.abs(L[o + 8]) > 0.95 ? _upX : _upY;
              _flEye[0] = L[o]; _flEye[1] = L[o + 1]; _flEye[2] = L[o + 2];
              _flTgt[0] = L[o] + L[o + 7]; _flTgt[1] = L[o + 1] + L[o + 8]; _flTgt[2] = L[o + 2] + L[o + 9];
              M4.lookAtTo(_mFlView, _flEye, _flTgt, up);
              M4.perspectiveTo(_mFlProj, fov, 1, 2.5, Math.max(rad, 10));
              M4.mulTo(_mFlVP, _mFlProj, _mFlView);
            }
            _lampShX = _lx; _lampShY = _ly; _lampShZ = _lz; _lampShCarKey = _carKey;
            _lampShR = rad; _lampShC = L[o + 11]; _lampShDx = L[o + 7]; _lampShDy = L[o + 8]; _lampShDz = L[o + 9];
            let _carsOnlyPass = _carOnly && G.gfx.lampCarsBegin && G.gfx.lampCarsBegin(_mFlVP, flBest);
            _flReach[0] = L[o]; _flReach[1] = L[o + 1]; _flReach[2] = L[o + 2]; _flReach[3] = _lsR;
            if (!_carsOnlyPass && G.gfx.lampStaticBegin && G.gfx.lampStaticBegin(_mFlVP)) {
              G.gfx.castShadowChunked(G.track.meshes.props, MAT_IDENT, _flReach);
              _castPropBatchesShadow(_flReach);
              G.gfx.lampStaticEnd();
              _carsOnlyPass = !!(G.gfx.lampCarsBegin && G.gfx.lampCarsBegin(_mFlVP, flBest));
            }
            if (!_carsOnlyPass) G.gfx.lampShadowBegin(_mFlVP, flBest);
            if (_playerIn) _castPlayer();
            for (let i = 0; i < _shadowCount; i++) {
              const _lm = _shadowMats[i];
              const _ldx = _lm[12] - L[o], _ldy = _lm[13] - L[o + 1], _ldz = _lm[14] - L[o + 2];
              if (_ldx * _ldx + _ldy * _ldy + _ldz * _ldz > _lsR2 || !_shadowCast[i]) continue;
              if (_shadowCars[i] !== G.player) G.gfx.castShadow(deps.teamMesh(_shadowTeams[i], _shadowCars[i], true), _shadowMats[i]);
            }
            if (!_carsOnlyPass) {
              G.gfx.castShadowChunked(G.track.meshes.props, MAT_IDENT, _flReach);
              _castPropBatchesShadow(_flReach);
            }
            G.gfx.lampShadowEnd();
            }
            }
          }
        }
      }
    }

    return {
      reset, beginFrame, pushCaster, flushBlobs, sunPass, lampPass, resolvePlayer,
      livePlayerMat: _livePlayerShadowMat,
      get count() { return _shadowCount; },
    };
  }
  return { create };
})();
Object.freeze(ShadowPass);
