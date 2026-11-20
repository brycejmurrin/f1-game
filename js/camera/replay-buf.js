"use strict";
const ReplayBuf = (function () {
  const audioStatus = new WeakMap();
  function audioRetired(car) {
    let entry = audioStatus.get(car);
    if (entry && !entry.owner.valid()) { entry.owner.release(); entry = audioStatus.get(car); }
    return entry ? entry.retired : !!car.retired;
  }
  function boxU(car) {
    const entry = audioStatus.get(car);
    return entry && entry.owner.valid() && entry.boxU >= 0 ? entry.boxU : -1;
  }
  const HZ = 30;
  const WINDOW_S = 20;
  const MAX_FRAMES = HZ * WINDOW_S;
  const FLOATS = 9;
  const AUX = ["aeroX", "brakeHeat", "throttleDemand", "brakeDemand"];
  const BOX = AUX.length, AUXN = AUX.length + 1;
  const MAX_CARS = 24;
  const MAX_BYTES = 720 * 1024;
  const TAG_CAP = 64;
  const JUMP_M = 50;
  const RATES = [0.25, 0.5, 1];
  const POSE_FIELDS = ["pitState", "s", "x", "head", "speed", "px", "py", "pz", "steer", "yawVis",
    "rPrevS", "rPrevX", "rPrevPx", "rPrevPz", "rPrevHead", "rPrevYawVis"].concat(AUX);

  function frameBytes(nCars) {
    return 8 + nCars * FLOATS * 4 + nCars * AUXN + nCars + 1;
  }
  function budgetOk(nCars, frames) {
    return frameBytes(nCars) * frames <= MAX_BYTES;
  }
  function capacityFor(nCars) {
    const n = Math.max(1, Math.min(MAX_CARS, nCars | 0));
    let frames = MAX_FRAMES;
    while (frames > 8 && !budgetOk(n, frames)) frames = (frames * 3 / 4) | 0;
    return frames;
  }

  function lerpCar(out, a, b, u, L) {
    for (let i = 0; i < FLOATS; i++) out[i] = a[i] + (b[i] - a[i]) * u;
    if (L > 0) {
      let ds = b[0] - a[0];
      if (ds > L * 0.5) ds -= L; else if (ds < -L * 0.5) ds += L;
      let s = a[0] + ds * u;
      if (s < 0) s += L; else if (s >= L) s -= L;
      out[0] = s;
    }
    for (let i = 2; i <= 8; i += 6) {
      let delta = b[i] - a[i];
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      out[i] = a[i] + delta * u;
    }
    return out;
  }

  function create(G, eligible) {
    Log.info("game", "ReplayBuf.create");
    let audioCars = null;
    const audioOwner = {
      valid: () => !!audioCars && !!G.cars && G.cars.length === audioCars.length && audioCars.every((c, i) => G.cars[i] === c),
      release: () => {
        if (audioCars) for (const c of audioCars) {
          const entry = audioStatus.get(c);
          if (entry && entry.owner === audioOwner) audioStatus.delete(c);
        }
        audioCars = null;
      },
    };
    const allowed = () => (!eligible || eligible()) && !(G.netPlay && G.netPlay.active && G.netPlay.active());
    let nCars = 0, cap = 0, head = 0, count = 0, lastSlot = -1;
    let times = null, data = null, aux = null, status = null, brk = null, breakPending = false;
    let tags = [], tagsRev = 0, tagPicker = null, tagOptionsKey = null;
    let dockRefs = null, scrubInputRaf = 0, scrubInputU = null;
    const painted = new Map();
    let scrubbing = false, liveSnap = null;
    let scrubT = 0, scrubRate = 1, scrubPlaying = true;
    let prevStatus = null, sheetBusy = false, sheetGeneration = 0, sheetCancelled = false;

    function alloc(n) {
      nCars = Math.max(1, Math.min(MAX_CARS, n | 0));
      cap = capacityFor(nCars);
      times = new Float64Array(cap);
      data = new Float32Array(cap * nCars * FLOATS);
      aux = new Uint8Array(cap * nCars * AUXN);
      status = new Uint8Array(cap * nCars);
      brk = new Uint8Array(cap);
      head = 0; count = 0; lastSlot = -1; tags = [];
      prevStatus = new Uint8Array(nCars);
    }
    function clear() {
      sheetGeneration++; sheetBusy = false;
      head = 0; count = 0; lastSlot = -1; tags = []; breakPending = false;
      scrubbing = false; liveSnap = null; scrubPlaying = true; scrubRate = 1;
      audioOwner.release();
      hideDock();
    }
    function reset(cars) {
      alloc((cars && cars.length) || (G.cars && G.cars.length) || 1);
      clear();
    }
    function discardTimeline(time) {
      if (!count || !Number.isFinite(time)) return;
      const newest = times[(head + count - 1) % cap];
      if (time < newest || time - newest > WINDOW_S) clear();
    }
    function breakTimeline() {
      if (count) breakPending = true;
    }
    function writeCar(frame, i, c) {
      const o = (frame * nCars + i) * FLOATS;
      const po = count > 0 ? (((head + count - 1) % cap) * nCars + i) * FLOATS : -1;
      const put = (k, v) => { data[o + k] = Number.isFinite(v) ? v : (v == null || v === false ? 0 : (po >= 0 ? data[po + k] : 0)); };
      put(0, c.s); put(1, c.x); put(2, c.head); put(3, c.speed);
      put(4, c.px); put(5, c.py); put(6, c.pz); put(7, c.steer); put(8, c.yawVis);
      const q = (frame * nCars + i) * AUXN;
      for (let k = 0; k < AUX.length; k++) aux[q + k] = Math.round(Math.max(0, Math.min(1, +c[AUX[k]] || 0)) * 255);
      const stop = c.pitState === "box" ? (G.pits && G.pits.stopAnim ? G.pits.stopAnim(c).u : 0) : -1;
      aux[q + BOX] = stop >= 0 ? 1 + Math.round(Math.min(1, stop) * 254) : 0;
      status[frame * nCars + i] = (c.retired ? 1 : 0) | (c.finished ? 2 : 0);
    }
    function readCar(out, frame, i) {
      const o = (frame * nCars + i) * FLOATS;
      for (let k = 0; k < FLOATS; k++) out[k] = data[o + k];
      return out;
    }
    function sample(raceT, cars) {
      if (scrubbing || !allowed()) return false;
      if (!cars || !cars.length) return false;
      if (!data || Math.min(MAX_CARS, cars.length) !== nCars) reset(cars);
      discardTimeline(raceT);
      const slot = Math.floor((+raceT || 0) * HZ);
      if (slot === lastSlot) return false;
      lastSlot = slot;
      const frame = count < cap ? count : head;
      times[frame] = raceT;
      brk[frame] = breakPending ? 1 : 0;
      breakPending = false;
      const n = Math.min(nCars, cars.length);
      for (let i = 0; i < n; i++) {
        writeCar(frame, i, cars[i]);
        const st = status[frame * nCars + i];
        const prev = prevStatus[i];
        if ((st & 1) && !(prev & 1)) pushTag("retirement", raceT, i);
        else if ((st & 2) && !(prev & 2)) pushTag("chequered", raceT, i);
        prevStatus[i] = st;
      }
      if (count < cap) count++;
      else head = (head + 1) % cap;
      return true;
    }
    function pushTag(kind, t, carIdx) {
      if (tags.length >= TAG_CAP) tags.shift();
      tagsRev++;
      tags.push({ kind: String(kind || ""), t: +t || 0, car: carIdx | 0 });
    }
    function windowInfo() {
      const allocatedBytes = (times ? times.byteLength : 0) + (data ? data.byteLength : 0)
        + (aux ? aux.byteLength : 0) + (status ? status.byteLength : 0) + (brk ? brk.byteLength : 0);
      const fixedBytes = _a.byteLength + _b.byteLength + _o.byteLength + (prevStatus ? prevStatus.byteLength : 0);
      if (!count) return { t0: 0, t1: 0, frames: 0, bytes: 0, cars: nCars, allocatedBytes, fixedBytes };
      const oldest = times[head];
      const newest = times[(head + count - 1) % cap];
      return {
        t0: oldest, t1: newest, frames: count, cars: nCars,
        bytes: frameBytes(nCars) * count, allocatedBytes, fixedBytes,
      };
    }
    function frameIndexAt(t) {
      let lo = 0, hi = count - 1, k = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[(head + mid) % cap] <= t) { k = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return k < 0 ? -1 : (head + k) % cap;
    }
    const _a = new Float32Array(FLOATS), _b = new Float32Array(FLOATS), _o = new Float32Array(FLOATS);
    function at(t, out) {
      if (!count) return null;
      const w = windowInfo();
      const tt = Math.max(w.t0, Math.min(w.t1, t));
      let i0 = frameIndexAt(tt);
      if (i0 < 0) i0 = head;
      let i1 = i0, u = 0;
      const k0 = (i0 - head + cap) % cap;
      if (k0 < count - 1) i1 = (i0 + 1) % cap;
      const t0 = times[i0], t1 = times[i1];
      if (i1 !== i0 && t1 > t0) u = (tt - t0) / (t1 - t0);
      const snapU = u > 0.5 ? 1 : 0, cut = i1 !== i0 && brk[i1] === 1;
      const cars = out ? out.cars : [], L = (G.track && G.track.total) || 0;
      if (out) cars.length = nCars;
      for (let c = 0; c < nCars; c++) {
        readCar(_a, i0, c);
        readCar(_b, i1, c);
        let snap = cut;
        if (!cut && i1 !== i0) {
          const reach = JUMP_M + Math.max(Math.abs(_a[3]), Math.abs(_b[3])) * Math.max(0, t1 - t0);
          snap = Math.hypot(_b[4] - _a[4], _b[6] - _a[6]) > reach;
        }
        if (snap) _o.set(snapU ? _b : _a);
        else lerpCar(_o, _a, _b, u, L);
        const st = status[(snap && snapU ? i1 : i0) * nCars + c];
        let row = out ? cars[c] : null;
        if (!row) { row = {}; cars[c] = row; }
        row.s = _o[0]; row.x = _o[1]; row.head = _o[2]; row.speed = _o[3];
        row.px = _o[4]; row.py = _o[5]; row.pz = _o[6]; row.steer = _o[7]; row.yawVis = _o[8];
        row.status = st;
        const qa = (i0 * nCars + c) * AUXN, qb = (i1 * nCars + c) * AUXN, ua = snap ? snapU : u;
        for (let k = 0; k < AUX.length; k++) row[AUX[k]] = (aux[qa + k] + (aux[qb + k] - aux[qa + k]) * ua) / 255;
        const ba = aux[qa + BOX], bb = aux[qb + BOX];
        const bv = ba && bb ? ba + (bb - ba) * ua : (snap && snapU ? bb : ba);
        row.box = bv ? (bv - 1) / 254 : -1;
      }
      if (out) { out.t = tt; out.k = k0 + (cut && snapU ? 1 : 0); return out; }
      return { t: tt, cars };
    }
    function snapLive(cars) {
      return (cars || []).map((c) => {
        const p = {};
        for (const k of POSE_FIELDS) if (Object.prototype.hasOwnProperty.call(c, k)) p[k] = c[k];
        return p;
      });
    }
    function restoreLive(cars, poses) {
      for (let i = 0; i < Math.min(cars.length, poses.length); i++) {
        for (const k of POSE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(poses[i], k)) cars[i][k] = poses[i][k];
          else delete cars[i][k];
        }
      }
    }
    function applyPose(cars, poses) {
      const n = Math.min(cars.length, poses.length);
      for (let i = 0; i < n; i++) {
        const c = cars[i], p = poses[i];
        c.s = p.s; c.x = p.x; c.head = p.head; c.speed = p.speed;
        c.px = p.px; c.py = p.py; c.pz = p.pz; c.steer = p.steer;
        c.yawVis = p.yawVis;
        c.rPrevS = p.s; c.rPrevX = p.x; c.rPrevPx = p.px; c.rPrevPz = p.pz;
        c.rPrevHead = p.head; c.rPrevYawVis = p.yawVis;
        for (let k = 0; k < AUX.length; k++) c[AUX[k]] = p[AUX[k]];
        const inBox = p.box >= 0;
        if (inBox) c.pitState = "box"; else if (c.pitState === "box") c.pitState = "none";
        audioStatus.set(c, { owner: audioOwner, retired: !!(p.status & 1), boxU: inBox ? p.box : -1 });
      }
      if (typeof GameAudio !== "undefined" && GameAudio.syncReplayRpms) GameAudio.syncReplayRpms(cars);
    }
    function beginScrub(showControls = true) {
      if (!allowed()) return false;
      if (!scrubbing) discardTimeline(G.raceT);
      if (scrubbing || count < 2) return false;
      liveSnap = snapLive(G.cars);
      audioCars = G.cars.slice();
      scrubbing = true; shownK = -1;
      scrubPlaying = true;
      scrubRate = 1;
      const w = windowInfo();
      const last = lastTag();
      scrubT = (last && last.t >= w.t0 && last.t <= w.t1) ? last.t : Math.max(w.t0, w.t1 - 5);
      apply(scrubT);
      if (showControls) { showDock(); paintDock(); }
      return true;
    }
    function snapCamera() {
      snapped = !G.photoMode && !G.dbgCam && !!G.snapGameCam;
      if (snapped) G.snapGameCam();
    }
    const _applySnap = { t: 0, k: 0, cars: [] };
    let snapped = false;
    let shownK = -1;
    function apply(t, continuous = false) {
      if (!scrubbing) return false;
      if (!audioOwner.valid()) { audioOwner.release(); return false; }
      const snap = at(t, _applySnap);
      if (!snap || !G.cars) return false;
      const f = G.player && G.cars.indexOf(G.player) >= 0 ? G.player : G.cars[0];
      const fx = f ? f.px : 0, fz = f ? f.pz : 0, fv = f ? Math.abs(f.speed || 0) : 0, gap = Math.abs(snap.t - scrubT);
      let jump = false;
      if (continuous && shownK >= 0) for (let k = shownK + 1; k <= snap.k && !jump; k++) jump = brk[(head + k) % cap] === 1;
      scrubT = snap.t;
      applyPose(G.cars, snap.cars);
      if (continuous && !jump && f) jump = Math.hypot(f.px - fx, f.pz - fz) > JUMP_M + Math.max(fv, Math.abs(f.speed || 0)) * gap;
      shownK = snap.k;
      snapped = false;
      if (!continuous || jump) snapCamera();
      return true;
    }
    function adjacentFrame(t, direction) {
      if (!count || (direction !== -1 && direction !== 1)) return null;
      let lo = 0, hi = count - 1, k = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1, time = times[(head + mid) % cap];
        if (direction < 0) { if (time < t - 1e-9) { k = mid; lo = mid + 1; } else hi = mid - 1; }
        else if (time > t + 1e-9) { k = mid; hi = mid - 1; } else lo = mid + 1;
      }
      return k < 0 ? null : times[(head + k) % cap];
    }
    function stepFrame(direction) {
      if (!scrubbing || sheetBusy || !allowed() || (direction !== -1 && direction !== 1)) return false;
      scrubPlaying = false;
      const t = adjacentFrame(scrubT, direction);
      if (t === null) { paintDock(); return false; }
      const ok = apply(t);
      if (ok && !snapped) {
        if (typeof CamFeel !== "undefined") CamFeel.resetFollow();
        if (typeof GameCams !== "undefined") GameCams.resetSmoothing();
      }
      paintDock();
      return ok;
    }
    function endScrub() {
      sheetGeneration++; sheetBusy = false; scrubInputU = null;
      if (!scrubbing) return false;
      audioOwner.release();
      if (liveSnap && G.cars) restoreLive(G.cars, liveSnap);
      scrubbing = false; liveSnap = null; scrubPlaying = true;
      snapCamera();
      hideDock();
      return true;
    }
    function isScrubbing() { return scrubbing; }
    function lastTag() {
      return tags.length ? tags[tags.length - 1] : null;
    }
    function tagsOf() {
      return tags.map((g) => ({ kind: g.kind, t: g.t, car: g.car }));
    }
    function jumpLastTag() {
      const tag = lastTag();
      if (!tag || !scrubbing) return false;
      return apply(tag.t);
    }
    function tickScrub(dt) {
      if (!scrubbing) return false;
      if (!sheetBusy && scrubPlaying && dt > 0) {
        const w = windowInfo();
        scrubT = Math.min(w.t1, scrubT + dt * scrubRate);
        apply(scrubT, true);
        if (scrubT >= w.t1) scrubPlaying = false;
      }
      paintDock();
      return true;
    }
    function statusOf() {
      return Object.assign({
        scrubbing, scrubT, scrubRate, scrubPlaying, tags: tags.length,
      }, windowInfo());
    }

    async function contactSheet(tagIndex) {
      if (sheetBusy || !allowed() || !G.paused || !scrubbing || typeof PhotoStudio === "undefined") return false;
      const tag = tags[tagIndex], w = windowInfo();
      if (!tag || tag.t < w.t0 || tag.t > w.t1 || w.t1 - w.t0 < 2 / HZ) return false;
      const moment = Math.max(w.t0, Math.min(w.t1, tag.t));
      const times = [Math.max(w.t0, moment - 1), moment, Math.min(w.t1, moment + 1)];
      const photoPose = () => G.photoCam ? JSON.stringify([G.photoCam.pos, G.photoCam.yaw, G.photoCam.pitch, G.photoCam.fov]) : null;
      const debugPose = () => G.dbgCam ? JSON.stringify([G.dbgCam.eye, G.dbgCam.target, G.dbgCam.fov, G.dbgCam.roll]) : null;
      const studioOwner = () => { if (typeof PhotoStudio.state !== "function") return null; const state = PhotoStudio.state(); return JSON.stringify([state.open, state.generation]); };
      const saved = { t: scrubT, playing: scrubPlaying, rate: scrubRate, paused: G.paused, mode: G.camMode,
        dbg: G.dbgCam, player: G.player, photo: G.photoCam, photoMode: G.photoMode,
        photoPose: photoPose(), dbgPose: debugPose(), studio: studioOwner() };
      let ownedT = scrubT;
      const generation = ++sheetGeneration; sheetBusy = true; sheetCancelled = false; scrubPlaying = false; paintDock();
      const owns = () => generation === sheetGeneration && scrubbing && allowed() && G.paused === saved.paused &&
        G.camMode === saved.mode && (G.dbgCam === saved.dbg || saved.photoMode && debugPose() === saved.dbgPose) && G.player === saved.player && G.photoMode === saved.photoMode &&
        G.photoCam === saved.photo && photoPose() === saved.photoPose && debugPose() === saved.dbgPose && studioOwner() === saved.studio &&
        scrubT === ownedT && !scrubPlaying && scrubRate === saved.rate;
      const cancelled = () => sheetCancelled || !owns();
      const seek = (t) => {
        if (!owns()) throw new Error("Contact sheet ownership changed");
        if (!apply(t)) throw new Error("Replay frame unavailable");
        ownedT = scrubT;
        if (snapped) return;
        if (typeof CamFeel !== "undefined") { CamFeel.resetFollow(); CamFeel.resetFreeLook(); CamFeel.resetLatch(); }
        if (typeof GameCams !== "undefined") GameCams.resetSmoothing();
      };
      const say = (text) => { if (generation === sheetGeneration && typeof document !== "undefined") { const el = document.getElementById("pm-replay-sheet-status"); if (el) el.textContent = text; } };
      say("Capturing before, moment and after…");
      try { const ok = await PhotoStudio.contactSheet(times, seek, cancelled); if (cancelled()) return false; say("Contact sheet PNG download requested."); return ok; }
      catch (e) { say(sheetCancelled || (typeof PhotoStudio.shareCancelled === "function" && PhotoStudio.shareCancelled(e)) ? "Capture cancelled." : "Contact sheet unavailable. Try again."); Log.warn("ui", "Contact sheet failed", e); return false; }
      finally {
        if (owns()) {
          seek(saved.t); scrubPlaying = saved.playing; scrubRate = saved.rate;
        }
        if (generation === sheetGeneration) { sheetBusy = false; paintDock(); }
      }
    }

    function cancelContactSheet() { sheetCancelled = true; }

    function ensureButton() {
      if (typeof document === "undefined") return;
      if (document.getElementById("pm-replay")) return;
      const resume = document.getElementById("pm-resume");
      if (!resume || !resume.parentNode) return;
      const b = document.createElement("button");
      b.id = "pm-replay";
      b.type = "button";
      b.textContent = "REPLAY";
      b.hidden = true;
      b.onclick = () => {
        if (!beginScrub()) return;
        const menu = document.getElementById("pausemenu");
        if (menu) menu.hidden = true;
        Log.info("game", "ReplayBuf.scrub t=" + scrubT.toFixed(2));
      };
      const tray = document.getElementById("pm-quick-doors");
      if (tray) tray.insertBefore(b, tray.firstChild);
      else resume.parentNode.insertBefore(b, resume.nextSibling);
    }
    function ensureDock() {
      if (typeof document === "undefined") return null;
      let dock = document.getElementById("pm-replay-dock");
      if (dock) return dock;
      dock = document.createElement("div");
      dock.id = "pm-replay-dock";
      dock.hidden = true;
      dock.setAttribute("role", "group");
      dock.setAttribute("aria-label", "Instant replay");
      dock.innerHTML =
        '<button type="button" id="pm-replay-exit">EXIT</button>' +
        '<button type="button" id="pm-replay-play">PAUSE</button>' +
        '<button type="button" id="pm-replay-last">LAST</button>' +
        '<button type="button" id="pm-replay-prev" aria-label="Previous recorded frame">← FRAME</button>' +
        '<button type="button" id="pm-replay-next" aria-label="Next recorded frame">FRAME →</button>' +
        '<button type="button" id="pm-replay-rate">1×</button>' +
        '<input id="pm-replay-scrub" type="range" min="0" max="1000" value="1000" aria-label="Replay position">' +
        '<span id="pm-replay-label">0.0</span>' +
        '<select id="pm-replay-tag" aria-label="Contact sheet moment"></select>' +
        '<button type="button" id="pm-replay-sheet">CONTACT SHEET PNG</button>' +
        '<button type="button" id="pm-replay-sheet-cancel" hidden>CANCEL CAPTURE</button>' +
        '<span id="pm-replay-sheet-status" role="status"></span>';
      (document.body || document.documentElement).appendChild(dock);
      dock.querySelector("#pm-replay-sheet-cancel").onclick = cancelContactSheet;
      dock.querySelector("#pm-replay-sheet").onclick = () => contactSheet(+dock.querySelector("#pm-replay-tag").value);
      dock.querySelector("#pm-replay-exit").onclick = () => {
        endScrub();
        const menu = document.getElementById("pausemenu");
        if (menu && G.paused) menu.hidden = false;
      };
      dock.querySelector("#pm-replay-play").onclick = () => {
        if (sheetBusy) return;
        scrubPlaying = !scrubPlaying;
        paintDock();
      };
      dock.querySelector("#pm-replay-prev").onclick = () => stepFrame(-1);
      dock.querySelector("#pm-replay-next").onclick = () => stepFrame(1);
      dock.querySelector("#pm-replay-last").onclick = () => { if (!sheetBusy) { jumpLastTag(); paintDock(); } };
      dock.querySelector("#pm-replay-rate").onclick = () => {
        if (sheetBusy) return;
        const i = RATES.indexOf(scrubRate);
        scrubRate = RATES[(i + 1) % RATES.length];
        paintDock();
      };
      dock.querySelector("#pm-replay-scrub").oninput = (ev) => {
        if (sheetBusy) return;
        scrubPlaying = false;
        scrubInputU = (+ev.target.value || 0) / 1000;
        if (scrubInputRaf) return;
        const flush = () => {
          scrubInputRaf = 0;
          const u = scrubInputU; scrubInputU = null;
          if (u === null || sheetBusy || !scrubbing) return;
          const w = windowInfo();
          apply(w.t0 + (w.t1 - w.t0) * u);
          paintDock();
        };
        if (typeof requestAnimationFrame === "function") scrubInputRaf = requestAnimationFrame(flush);
        else flush();
      };
      return dock;
    }
    function showDock() {
      const d = ensureDock();
      if (d) d.hidden = false;
    }
    function hideDock() {
      if (typeof document === "undefined") return;
      const d = document.getElementById("pm-replay-dock");
      if (d) d.hidden = true;
    }
    const DOCK_IDS = { play: "pm-replay-play", rate: "pm-replay-rate", scrub: "pm-replay-scrub", label: "pm-replay-label",
      prev: "pm-replay-prev", next: "pm-replay-next", picker: "pm-replay-tag", sheet: "pm-replay-sheet",
      cancel: "pm-replay-sheet-cancel", last: "pm-replay-last" };
    function dockEls() {
      const dock = document.getElementById("pm-replay-dock");
      if (!dockRefs || dockRefs.dock !== dock || !dock) {
        dockRefs = { dock };
        for (const k in DOCK_IDS) dockRefs[k] = document.getElementById(DOCK_IDS[k]);
        painted.clear();
      }
      return dockRefs;
    }
    function put(el, prop, value) {
      if (!el) return;
      const slot = painted.get(el) || (painted.set(el, {}), painted.get(el));
      if (slot[prop] === value && el[prop] === value) return;
      el[prop] = value; slot[prop] = value;
    }
    function paintDock() {
      if (typeof document === "undefined" || !scrubbing) return;
      const w = windowInfo();
      const { play, rate, scrub, label, prev: prevFrame, next: nextFrame, picker, sheet, cancel, last } = dockEls();
      put(play, "textContent", scrubPlaying ? "PAUSE" : "PLAY");
      put(rate, "textContent", scrubRate + "×");
      if (scrub && w.t1 > w.t0 && scrubInputU === null) {
        const u = (scrubT - w.t0) / (w.t1 - w.t0);
        put(scrub, "value", String(Math.round(Math.max(0, Math.min(1, u)) * 1000)));
      }
      put(label, "textContent", scrubT.toFixed(3) + "s");
      put(prevFrame, "disabled", sheetBusy || adjacentFrame(scrubT, -1) === null);
      put(nextFrame, "disabled", sheetBusy || adjacentFrame(scrubT, 1) === null);
      if (picker && !sheetBusy) {
        const key = tagsRev + "|" + tags.length + "|" + w.t0 + "|" + w.t1;
        if (picker !== tagPicker || key !== tagOptionsKey) {
          const visible = tags.map((tag, i) => [i, tag]).filter(([, tag]) => tag.t >= w.t0 && tag.t <= w.t1);
          const selected = picker.value; picker.replaceChildren();
          visible.forEach(([i, tag]) => {
            const option = document.createElement("option"); option.value = String(i); option.textContent = tag.kind + " · " + tag.t.toFixed(1) + "s"; picker.appendChild(option); });
          if (Array.from(picker.options || picker.children).some((o) => o.value === selected)) picker.value = selected;
          tagPicker = picker; tagOptionsKey = key;
        }
      }
      put(cancel, "hidden", !sheetBusy);
      put(picker, "disabled", sheetBusy);
      if (sheet) {
        put(sheet, "disabled", sheetBusy || !allowed() || !G.paused || !picker || !picker.children.length || w.t1 - w.t0 < 2 / HZ);
        put(sheet, "textContent", sheetBusy ? "CAPTURING…" : "CONTACT SHEET PNG");
      }
      for (const el of [play, last, rate, scrub]) put(el, "disabled", sheetBusy);
    }
    function refreshButton() {
      if (!scrubbing) discardTimeline(G.raceT);
      ensureButton();
      const b = typeof document !== "undefined" ? document.getElementById("pm-replay") : null;
      if (!b) return;
      const w = windowInfo();
      b.hidden = !allowed() || w.frames < HZ * 3;
    }
    function onRaceStart(cars) { reset(cars); }
    function onTick(raceT, cars, st) {
      if (st !== "race" && st !== "count") return;
      sample(raceT, cars);
    }
    function onPause(p) {
      if (p) { endScrub(); refreshButton(); }
      else endScrub();
    }

    return {
      sample, clear, breakTimeline, reset, pushTag, window: windowInfo, at,
      beginScrub, apply, endScrub, contactSheet, cancelContactSheet, isScrubbing, lastTag, jumpLastTag, tags: tagsOf,
      tickScrub, stepFrame, adjacentFrame, status: statusOf,
      refreshButton, ensureButton,
      onRaceStart, onTick, onPause,
    };
  }

  return {
    create, audioRetired, boxU, HZ, WINDOW_S, FLOATS, MAX_CARS, MAX_FRAMES, MAX_BYTES,
    frameBytes, budgetOk, capacityFor, lerpCar,
  };
})();
Object.freeze(ReplayBuf);
