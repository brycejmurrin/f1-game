/* Apex 26 — INSTANT REPLAY RING (ReplayBuf.create(G)): a solo-only 20 s /
 * 30 Hz Float32 ring of the live field (~0.5 MB / 24 cars, under a 0.7 MB cap). Pause-card scrub
 * restores captured pose fields bit-exactly and never touches netplay authority
 * or career settlement. RAM only — never writes the Ghost best-lap store
 * (512 KiB budget). Sampling mirrors Ghost's cadence; tags come from car
 * status edges and RaceInsights-shaped pushTag calls. */
"use strict";
const ReplayBuf = (function () {
  const HZ = 30;
  const WINDOW_S = 20;
  const MAX_FRAMES = HZ * WINDOW_S;           // 600
  const FLOATS = 9;                           // s, x, yaw, speed, px, py, pz, steer, yawVis
  const MAX_CARS = 24;                         // MY TEAM / LEGENDS grids run 23-24 cars
  const MAX_BYTES = 720 * 1024;               // 0.7 MB hard cap
  const TAG_CAP = 64;
  const RATES = [0.25, 0.5, 1];
  const POSE_FIELDS = ["s", "x", "head", "speed", "px", "py", "pz", "steer", "yawVis",
    "rPrevS", "rPrevX", "rPrevPx", "rPrevPz", "rPrevHead", "rPrevYawVis"];

  function frameBytes(nCars) {
    return nCars * FLOATS * 4 + nCars;        // floats + Uint8 status lane
  }
  function budgetOk(nCars, frames) {
    return frameBytes(nCars) * frames <= MAX_BYTES;
  }
  /** Largest frame count that fits under MAX_BYTES for nCars (≤ MAX_FRAMES). */
  function capacityFor(nCars) {
    const n = Math.max(1, Math.min(MAX_CARS, nCars | 0));
    let frames = MAX_FRAMES;
    while (frames > 8 && !budgetOk(n, frames)) frames = (frames * 3 / 4) | 0;
    return frames;
  }

  // Pure: interpolate one car's floats between two frames (Ghost.at shape).
  // `L` (the lap length, G.track.total) makes arc `s` wrap-aware: a car
  // crossing the line goes L-1.3 -> 1.37, and a plain lerp swept it (and the
  // camera on it) through the whole lap the other way in one sample. Without L
  // (or L <= 0) `s` lerps plainly, as before.
  function lerpCar(out, a, b, u, L) {
    for (let i = 0; i < FLOATS; i++) out[i] = a[i] + (b[i] - a[i]) * u;
    if (L > 0) {
      let ds = b[0] - a[0];
      if (ds > L * 0.5) ds -= L; else if (ds < -L * 0.5) ds += L;   // M4.wrapDelta, inlined: the ring is dependency-free
      let s = a[0] + ds * u;
      if (s < 0) s += L; else if (s >= L) s -= L;
      out[0] = s;
    }
    // Heading (2) and mesh yaw (8), without allocating per sampled car.
    for (let i = 2; i <= 8; i += 6) {
      let delta = b[i] - a[i];
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      out[i] = a[i] + delta * u;
    }
    return out;
  }

  // The caller can reserve pose ownership (for example, a recorded WATCH).
  function create(G, eligible) {
    Log.info("game", "ReplayBuf.create");
    const allowed = () => (!eligible || eligible()) && !(G.netPlay && G.netPlay.active && G.netPlay.active());
    let nCars = 0, cap = 0, head = 0, count = 0, lastSlot = -1;
    let times = null, data = null, status = null;
    let tags = [];
    let scrubbing = false, liveSnap = null;
    let scrubT = 0, scrubRate = 1, scrubPlaying = true;
    let prevStatus = null;

    function alloc(n) {
      nCars = Math.max(1, Math.min(MAX_CARS, n | 0));
      cap = capacityFor(nCars);
      times = new Float64Array(cap);
      data = new Float32Array(cap * nCars * FLOATS);
      status = new Uint8Array(cap * nCars);
      head = 0; count = 0; lastSlot = -1; tags = [];
      prevStatus = new Uint8Array(nCars);
    }
    function clear() {
      head = 0; count = 0; lastSlot = -1; tags = [];
      scrubbing = false; liveSnap = null; scrubPlaying = true; scrubRate = 1;
      if (prevStatus) prevStatus.fill(0);
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
    function writeCar(frame, i, c) {
      const o = (frame * nCars + i) * FLOATS;
      data[o] = c.s || 0;
      data[o + 1] = c.x || 0;
      data[o + 2] = c.head || 0;
      data[o + 3] = c.speed || 0;
      data[o + 4] = c.px || 0;
      data[o + 5] = c.py || 0;
      data[o + 6] = c.pz || 0;
      data[o + 7] = c.steer || 0;
      data[o + 8] = c.yawVis || 0;
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
      if (!data || Math.min(MAX_CARS, cars.length) !== nCars) reset(cars);   // >MAX_CARS must not reset every sample
      discardTimeline(raceT);   // Practice rewind or a mid-race JUMP IN starts a new timeline.
      // Slot gate (not wall-delta): FP-safe at exact 1/HZ spacing.
      const slot = Math.floor((+raceT || 0) * HZ);
      if (slot === lastSlot) return false;
      lastSlot = slot;
      const frame = count < cap ? count : head;
      times[frame] = raceT;
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
      tags.push({ kind: String(kind || ""), t: +t || 0, car: carIdx | 0 });
    }
    function windowInfo() {
      if (!count) return { t0: 0, t1: 0, frames: 0, bytes: 0, cars: nCars };
      const oldest = times[head];
      const newest = times[(head + count - 1) % cap];
      return {
        t0: oldest, t1: newest, frames: count, cars: nCars,
        bytes: frameBytes(nCars) * count,
      };
    }
    function frameIndexAt(t) {
      let best = -1, bestT = -Infinity;
      for (let k = 0; k < count; k++) {
        const i = (head + k) % cap;
        const ti = times[i];
        if (ti <= t && ti >= bestT) { bestT = ti; best = i; }
      }
      return best;
    }
    const _a = new Float32Array(FLOATS), _b = new Float32Array(FLOATS), _o = new Float32Array(FLOATS);
    function at(t) {
      if (!count) return null;
      const w = windowInfo();
      const tt = Math.max(w.t0, Math.min(w.t1, t));
      let i0 = frameIndexAt(tt);
      if (i0 < 0) i0 = head;
      let i1 = i0, u = 0;
      for (let k = 0; k < count - 1; k++) {
        const i = (head + k) % cap;
        if (i === i0) { i1 = (head + k + 1) % cap; break; }
      }
      const t0 = times[i0], t1 = times[i1];
      if (i1 !== i0 && t1 > t0) u = (tt - t0) / (t1 - t0);
      const cars = [], L = (G.track && G.track.total) || 0;
      for (let c = 0; c < nCars; c++) {
        readCar(_a, i0, c);
        readCar(_b, i1, c);
        lerpCar(_o, _a, _b, u, L);
        cars.push({
          s: _o[0], x: _o[1], head: _o[2], speed: _o[3],
          px: _o[4], py: _o[5], pz: _o[6], steer: _o[7], yawVis: _o[8],
          status: status[i0 * nCars + c],
        });
      }
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
        // Paused frames retain renderAlpha: both interpolation endpoints must
        // belong to this recorded pose, never the live frame we paused from.
        c.yawVis = p.yawVis;
        c.rPrevS = p.s; c.rPrevX = p.x; c.rPrevPx = p.px; c.rPrevPz = p.pz;
        c.rPrevHead = p.head; c.rPrevYawVis = p.yawVis;
      }
      if (typeof GameAudio !== "undefined" && GameAudio.syncReplayRpms) GameAudio.syncReplayRpms(cars);   // revs follow the replayed speed
    }
    function beginScrub(showControls = true) {
      if (!allowed()) return false;
      if (!scrubbing) discardTimeline(G.raceT);   // a paused clock jump can precede the next sample
      if (scrubbing || count < 2) return false;
      liveSnap = snapLive(G.cars);
      scrubbing = true;
      scrubPlaying = true;
      scrubRate = 1;
      const w = windowInfo();
      const last = lastTag();
      scrubT = (last && last.t >= w.t0 && last.t <= w.t1) ? last.t : Math.max(w.t0, w.t1 - 5);
      apply(scrubT);
      if (showControls) { showDock(); paintDock(); }
      return true;
    }
    function apply(t) {
      if (!scrubbing) return false;
      const snap = at(t);
      if (!snap || !G.cars) return false;
      scrubT = snap.t;
      applyPose(G.cars, snap.cars);
      return true;
    }
    function endScrub() {
      if (!scrubbing) return false;
      if (liveSnap && G.cars) restoreLive(G.cars, liveSnap);
      scrubbing = false; liveSnap = null; scrubPlaying = true;
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
      if (scrubPlaying && dt > 0) {
        const w = windowInfo();
        scrubT = Math.min(w.t1, scrubT + dt * scrubRate);
        apply(scrubT);
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

    // Pause-card REPLAY + scrub dock (JS-built — no shell-node growth).
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
      // First tile of the pause card's RACE TOOLS tray when it exists.
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
      // Styled by `#pm-replay-dock` in css/dialogs.css (safe-area, wrap, tokens).
      dock.setAttribute("role", "group");
      dock.setAttribute("aria-label", "Instant replay");
      dock.innerHTML =
        '<button type="button" id="pm-replay-exit">EXIT</button>' +
        '<button type="button" id="pm-replay-play">PAUSE</button>' +
        '<button type="button" id="pm-replay-last">LAST</button>' +
        '<button type="button" id="pm-replay-rate">1×</button>' +
        '<input id="pm-replay-scrub" type="range" min="0" max="1000" value="1000" aria-label="Replay position">' +
        '<span id="pm-replay-label">0.0</span>';
      (document.body || document.documentElement).appendChild(dock);
      dock.querySelector("#pm-replay-exit").onclick = () => {
        endScrub();
        const menu = document.getElementById("pausemenu");
        if (menu && G.paused) menu.hidden = false;
      };
      dock.querySelector("#pm-replay-play").onclick = () => {
        scrubPlaying = !scrubPlaying;
        paintDock();
      };
      dock.querySelector("#pm-replay-last").onclick = () => { jumpLastTag(); paintDock(); };
      dock.querySelector("#pm-replay-rate").onclick = () => {
        const i = RATES.indexOf(scrubRate);
        scrubRate = RATES[(i + 1) % RATES.length];
        paintDock();
      };
      dock.querySelector("#pm-replay-scrub").oninput = (ev) => {
        const w = windowInfo();
        const u = (+ev.target.value || 0) / 1000;
        scrubPlaying = false;
        apply(w.t0 + (w.t1 - w.t0) * u);
        paintDock();
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
    function paintDock() {
      if (typeof document === "undefined" || !scrubbing) return;
      const w = windowInfo();
      const play = document.getElementById("pm-replay-play");
      const rate = document.getElementById("pm-replay-rate");
      const scrub = document.getElementById("pm-replay-scrub");
      const label = document.getElementById("pm-replay-label");
      if (play) play.textContent = scrubPlaying ? "PAUSE" : "PLAY";
      if (rate) rate.textContent = scrubRate + "×";
      if (scrub && w.t1 > w.t0) {
        const u = (scrubT - w.t0) / (w.t1 - w.t0);
        scrub.value = String(Math.round(Math.max(0, Math.min(1, u)) * 1000));
      }
      if (label) label.textContent = scrubT.toFixed(1) + "s";
    }
    function refreshButton() {
      if (!scrubbing) discardTimeline(G.raceT);
      ensureButton();
      const b = typeof document !== "undefined" ? document.getElementById("pm-replay") : null;
      if (!b) return;
      const w = windowInfo();
      b.hidden = !allowed() || w.frames < HZ * 3;   // need ~3 s before offering
    }
    /** game.js call-site helpers — keep the entry thin. */
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
      sample, clear, reset, pushTag, window: windowInfo, at,
      beginScrub, apply, endScrub, isScrubbing, lastTag, jumpLastTag, tags: tagsOf,
      tickScrub, status: statusOf,
      refreshButton, ensureButton,
      onRaceStart, onTick, onPause,
    };
  }

  return {
    create, HZ, WINDOW_S, FLOATS, MAX_CARS, MAX_FRAMES, MAX_BYTES,
    frameBytes, budgetOk, capacityFor, lerpCar,
  };
})();
Object.freeze(ReplayBuf);
