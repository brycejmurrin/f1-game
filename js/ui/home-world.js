/* Home's prepared circuit: camera ownership and a bounded render budget only.
   The caller prepares/draws the world; this controller never starts a race. */
const HomeWorld = (function () {
  "use strict";
  const SHOTS = ["hero", "front", "side", "rear"], FPS = 24;
  const TRACK_POSES = [
    [{ at: "start", off: -50, x: -5, y: 8 }, { at: "start", off: 38, x: 0, y: 1 }, 48],
    [{ at: "corner", n: "first", off: -40, x: 0, y: 7 }, { at: "corner", n: "first", off: 25, x: 0, y: 1 }, 48],
    [{ at: "corner", n: "lore", off: -35, x: 0, y: 8 }, { at: "corner", n: "lore", off: 25, x: 0, y: 1 }, 48],
    [{ at: "start", off: 50, x: 0, y: 7 }, { at: "start", off: -35, x: 0, y: 1 }, 48],
  ];
  const PIT_POSES = [[-18, 3.6, 0, 14], [18, 3.2, 1, -14], [-8, 4.5, 2, 15], [25, 3.6, 1, -10]];
  const finite3 = v => v && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
  const sample = () => ({ p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 10 });

  function create(G, deps) {
    deps = deps || {};
    let mode = "", motion = "still", shot = 0, key, viewKey, pane = null, saved = null, owned = false;
    let track = null, endpoints = null, painted = false, pending = true, cut = true;
    let clock = 0, credit = 0, moving = false, fallback = false;
    const pose = { eye: [0, 6, -10], tgt: [0, 0, 0], fov: 45, shiftX: 0, shiftY: 0, cut: true };
    const a = sample(), b = sample();
    const eligible = () => deps.eligible ? !!deps.eligible() : G.state === "menu" && !G.setupPreviewOn;
    const context = () => deps.contextKey ? deps.contextKey() : null;
    const reduced = () => typeof TitleFx !== "undefined" && TitleFx.mode() === "reduce";
    const warming = () => !!(G.gfx && G.gfx.warming && G.gfx.warming());
    const ready = () => !!G.track && (!deps.worldReady || !!deps.worldReady());
    function snapshot() {
      if (deps.capture) return deps.capture();
      return { eye: finite3(G.camEye) ? G.camEye.slice() : [0, 6, -10],
        tgt: finite3(G.camTgt) ? G.camTgt.slice() : [0, 0, 0], fov: Number.isFinite(G.camFov) ? G.camFov : 62 };
    }
    function restore(value) {
      if (deps.restore) { deps.restore(value); return; }
      if (!value) return;
      // Array copies also work with façades exposing getter-only vectors.
      for (let i = 0; i < 3; i++) {
        if (G.camEye) G.camEye[i] = value.eye[i];
        if (G.camTgt) G.camTgt[i] = value.tgt[i];
      }
      const d = Object.getOwnPropertyDescriptor(G, "camFov");
      if (!d || d.set || d.writable) G.camFov = value.fov;
    }
    function dirty() { painted = false; pending = true; cut = true; credit = 0; }
    function begin(want, opts) {
      opts = opts || {};
      if (want !== "track" && want !== "pitlane") { end(); return false; }
      const nextShot = typeof opts.shot === "number" ? Math.max(0, Math.min(3, opts.shot | 0)) : Math.max(0, SHOTS.indexOf(opts.shot));
      const nextMotion = opts.motion === "ambient" ? "ambient" : "still", nextKey = context();
      if (owned && mode === want && shot === nextShot && motion === nextMotion && key === nextKey && viewKey === opts.viewKey) return true;
      if (!owned) { saved = snapshot(); owned = true; }
      const prepare = !mode || key !== nextKey;
      mode = want; shot = nextShot; motion = nextMotion; key = nextKey; viewKey = opts.viewKey; pane = opts.pane || null;
      track = null; endpoints = null; clock = 0; fallback = false; dirty();
      moving = motion === "ambient" && !reduced();
      if (prepare && deps.prepareTrack) deps.prepareTrack();
      return true;
    }
    function end() {
      if (!owned) return;
      const before = saved;
      owned = false; saved = null; mode = ""; track = null; endpoints = null; clock = 0; dirty();
      restore(before);
    }
    function wantsTrack() { return owned && !!mode && eligible() && key === context(); }
    function active() { return wantsTrack() && ready(); }
    function sync() {
      const move = motion === "ambient" && !reduced();
      if (move !== moving) { moving = move; clock = 0; dirty(); }
      if (track !== G.track) { track = G.track; endpoints = null; fallback = false; dirty(); }
    }
    function needsFrame(dt, opts) {
      if (!active() || warming()) return false;
      sync();
      const interactive = !!(opts && opts.interactive);
      const delta = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
      const animate = moving && !fallback;
      if (animate) clock = (clock + delta) % 240;
      if (animate || interactive) credit = Math.min(1 / FPS, credit + delta);
      return pending || !!(opts && opts.force) || ((animate || interactive) && credit >= 1 / FPS - 1e-9);
    }
    function point(out, s, lateral, height) {
      Tracks.sample(track, s, a);
      for (let i = 0; i < 3; i++) out[i] = a.p[i] + a.r[i] * lateral;
      out[1] += height;
    }
    function pitEndpoints() {
      const span = Tracks.pitLaneSpan && Tracks.pitLaneSpan(track);
      if (!span || !(span.lenM > 0) || !Tracks.pitLaneAt) return null;
      let lane = null, arc = 0;
      // Prefer the full work lane, not a tapered entry/exit. Bounded, once/shot.
      for (let i = 0; i < 11; i++) {
        const f = i === 0 ? 0.5 : 0.5 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.08;
        const s = span.sIn + span.lenM * f, at = Tracks.pitLaneAt(track, s);
        if (at && Number.isFinite(at.width) && (!lane || at.width > lane.width)) { lane = at; arc = s; }
      }
      if (!lane || !Number.isFinite(lane.inner) || !Number.isFinite(lane.centre)) return null;
      const spec = PIT_POSES[shot], lookX = Number.isFinite(lane.workCentre) ? lane.workCentre : lane.centre;
      const eyeX = lane.centre - lane.side * spec[2], e = [[0, 0, 0], [0, 0, 0]], t = [[0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 2; i++) {
        const slide = i ? 5 : -5;
        point(e[i], arc + spec[0] + slide, eyeX, spec[1]);
        point(t[i], arc + spec[3] + slide * 0.25, lookX, 1.8);
      }
      return { eye: e, tgt: t, fov: 44 };
    }
    function trackEndpoints() {
      const spec = TRACK_POSES[shot], e = [[0, 0, 0], [0, 0, 0]], t = [[0, 0, 0], [0, 0, 0]];
      if (typeof FlybySeq !== "undefined" && FlybySeq.posePoint) {
        for (let i = 0; i < 2; i++) {
          const eye = Object.assign({}, spec[0]), look = Object.assign({}, spec[1]);
          if (eye.at === "centre") eye.bear += i ? 0.06 : -0.06;
          else eye.off += i ? 6 : -6;
          FlybySeq.posePoint(track, eye, e[i]); FlybySeq.posePoint(track, look, t[i]);
        }
      } else {
        fallback = true;
        const s = (track.total || 1) * (shot === 2 ? 0.3 : 0);
        Tracks.sample(track, s, b);
        for (let i = 0; i < 2; i++) {
          point(e[i], s - 70 + i * 8, (b.hw || 10) + 18, 24);
          point(t[i], s + 18, 0, 1);
        }
      }
      return { eye: e, tgt: t, fov: spec[2] };
    }
    function camera() {
      if (!active()) return null;
      sync();
      if (!endpoints) {
        endpoints = mode === "pitlane" ? pitEndpoints() : null;
        if (!endpoints) { fallback = mode === "pitlane"; endpoints = trackEndpoints(); }
        if (!finite3(endpoints.eye[0]) || !finite3(endpoints.eye[1]) || !finite3(endpoints.tgt[0]) || !finite3(endpoints.tgt[1])) {
          fallback = true;
          const base = saved && finite3(saved.eye) && finite3(saved.tgt) ? saved : { eye: [0, 6, -10], tgt: [0, 0, 0] };
          endpoints = { eye: [base.eye, base.eye], tgt: [base.tgt, base.tgt], fov: 45 };
        }
      }
      const u = moving && !fallback ? 0.5 + 0.38 * Math.sin(clock * Math.PI / 20) : 0.5;
      for (let i = 0; i < 3; i++) {
        pose.eye[i] = endpoints.eye[0][i] + (endpoints.eye[1][i] - endpoints.eye[0][i]) * u;
        pose.tgt[i] = endpoints.tgt[0][i] + (endpoints.tgt[1][i] - endpoints.tgt[0][i]) * u;
      }
      if (typeof FlybySeq !== "undefined") {
        if (FlybySeq.clearEye) FlybySeq.clearEye(track, pose.eye);
        if (FlybySeq.floorEye) FlybySeq.floorEye(track, pose.eye);
      }
      pose.fov = endpoints.fov; pose.cut = cut;
      pose.shiftX = pane ? 1 - pane.left - pane.right : 0;
      pose.shiftY = pane ? pane.top + pane.bottom - 1 : 0;
      return pose;
    }
    function didRender() {
      if (!active() || warming()) return false;
      painted = true; pending = false; cut = false; credit = 0;
      return true;
    }
    function state() { return { mode, motion, shot: SHOTS[shot], active: active(), painted, moving: moving && !fallback, fallback, clock }; }
    return { begin, end, wantsTrack, active, needsFrame, camera, didRender, state };
  }
  return { create };
})();
Object.freeze(HomeWorld);
