/* Apex 26 — INSTANT REPLAY RING (ReplayBuf.create(G)): a solo-only 20 s /
 * 30 Hz Float32 ring of the live field (~0.7 MB / 22 cars). Pause-card scrub
 * restores captured pose fields bit-exactly and never touches netplay authority
 * or career settlement. RAM only — never writes the Ghost best-lap store
 * (512 KiB budget). Sampling mirrors Ghost's cadence; tags come from car
 * status edges and RaceInsights-shaped pushTag calls. */
"use strict";
const ReplayBuf = (function () {
  const HZ = 30;
  const WINDOW_S = 20;
  const MAX_FRAMES = HZ * WINDOW_S;           // 600
  const FLOATS = 8;                           // s, x, yaw, speed, px, py, pz, steer
  const MAX_CARS = 22;
  const MAX_BYTES = 720 * 1024;               // 0.7 MB hard cap
  const TAG_CAP = 64;
  const RATES = [0.25, 0.5, 1];

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
  function lerpCar(out, a, b, u) {
    for (let i = 0; i < FLOATS; i++) out[i] = a[i] + (b[i] - a[i]) * u;
    return out;
  }

  function create(G) {
    Log.info("game", "ReplayBuf.create");
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
      status[frame * nCars + i] = (c.retired ? 1 : 0) | (c.finished ? 2 : 0);
    }
    function readCar(out, frame, i) {
      const o = (frame * nCars + i) * FLOATS;
      for (let k = 0; k < FLOATS; k++) out[k] = data[o + k];
      return out;
    }
    function sample(raceT, cars) {
      if (scrubbing) return false;
      if (G.netPlay && G.netPlay.active && G.netPlay.active()) return false;
      if (!cars || !cars.length) return false;
      if (!data || cars.length !== nCars) reset(cars);
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
      const cars = [];
      for (let c = 0; c < nCars; c++) {
        readCar(_a, i0, c);
        readCar(_b, i1, c);
        lerpCar(_o, _a, _b, u);
        cars.push({
          s: _o[0], x: _o[1], head: _o[2], speed: _o[3],
          px: _o[4], py: _o[5], pz: _o[6], steer: _o[7],
          status: status[i0 * nCars + c],
        });
      }
      return { t: tt, cars };
    }
    function snapLive(cars) {
      return (cars || []).map((c) => ({
        s: c.s, x: c.x, head: c.head, speed: c.speed,
        px: c.px, py: c.py, pz: c.pz, steer: c.steer,
        retired: !!c.retired, finished: !!c.finished,
      }));
    }
    function applyPose(cars, poses) {
      const n = Math.min(cars.length, poses.length);
      for (let i = 0; i < n; i++) {
        const c = cars[i], p = poses[i];
        c.s = p.s; c.x = p.x; c.head = p.head; c.speed = p.speed;
        c.px = p.px; c.py = p.py; c.pz = p.pz; c.steer = p.steer;
      }
    }
    function beginScrub() {
      if (G.netPlay && G.netPlay.active && G.netPlay.active()) return false;
      if (scrubbing || count < 2) return false;
      liveSnap = snapLive(G.cars);
      scrubbing = true;
      scrubPlaying = true;
      scrubRate = 1;
      const w = windowInfo();
      const last = lastTag();
      scrubT = (last && last.t >= w.t0 && last.t <= w.t1) ? last.t : Math.max(w.t0, w.t1 - 5);
      apply(scrubT);
      showDock();
      paintDock();
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
      if (liveSnap && G.cars) applyPose(G.cars, liveSnap);
      scrubbing = false; liveSnap = null; scrubPlaying = true;
      hideDock();
      return true;
    }
    function isScrubbing() { return scrubbing; }
    function lastTag() {
      return tags.length ? tags[tags.length - 1] : null;
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
      resume.parentNode.insertBefore(b, resume.nextSibling);
    }
    function ensureDock() {
      if (typeof document === "undefined") return null;
      let dock = document.getElementById("pm-replay-dock");
      if (dock) return dock;
      dock = document.createElement("div");
      dock.id = "pm-replay-dock";
      dock.hidden = true;
      dock.style.cssText = "position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:40;" +
        "display:flex;gap:8px;align-items:center;padding:8px 12px;background:rgba(0,0,0,.72);color:#fff;font:12px monospace";
      dock.innerHTML =
        '<button type="button" id="pm-replay-exit">EXIT</button>' +
        '<button type="button" id="pm-replay-play">PAUSE</button>' +
        '<button type="button" id="pm-replay-last">LAST</button>' +
        '<button type="button" id="pm-replay-rate">1×</button>' +
        '<input id="pm-replay-scrub" type="range" min="0" max="1000" value="1000" style="width:12rem">' +
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
      ensureButton();
      const b = typeof document !== "undefined" ? document.getElementById("pm-replay") : null;
      if (!b) return;
      const net = !!(G.netPlay && G.netPlay.active && G.netPlay.active());
      const w = windowInfo();
      b.hidden = net || w.frames < HZ * 3;   // need ~3 s before offering
    }
    /** game.js call-site helpers — keep the entry thin. */
    function onRaceStart(cars) { reset(cars); }
    function onTick(raceT, cars, st) {
      if (st !== "race" && st !== "count") return;
      sample(raceT, cars);
    }
    function onPause(p) {
      if (p) refreshButton();
      else endScrub();
    }

    return {
      sample, clear, reset, pushTag, window: windowInfo, at,
      beginScrub, apply, endScrub, isScrubbing, lastTag, jumpLastTag,
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
