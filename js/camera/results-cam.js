/* Apex 26 — RESULTS CAM (ResultsCam.create(G)): chequered-flag finish cut,
 * slow orbit behind the results sheet, and a short highlights montage from the
 * solo ReplayBuf tags. Solo presentation only — never touches netplay authority
 * or career settlement. Off on mobile / PerfGov.tier() >= 2. Cap orbit/highlight
 * redraws at 30 fps. Curvature only via G.camVantage (broadcast-only). */
"use strict";
const ResultsCam = (function () {
  const CHEQ_S = 2.2;
  const ORBIT_PERIOD_S = 28;
  const ORBIT_RADIUS = 18;
  const ORBIT_HEIGHT = 6;
  const HIGHLIGHT_CLIP_S = 4;
  const HIGHLIGHT_MAX_S = 45;
  const FRAME_DT = 1 / 30;

  function enabled(G) {
    const g = G.gfx;
    if (g && g.isMobile) return false;
    if (typeof PerfGov !== "undefined" && PerfGov.tier && PerfGov.tier() >= 2) return false;
    return true;
  }

  /** Pure: finish-line side vantage extras for camVantage("side", …). */
  function chequeredExtra(player) {
    return {
      px: player && player.px, pz: player && player.pz,
      head: player && player.head, py: player && player.py,
      noLook: true,   // the player's look-back / glance never steers the cut
    };
  }

  /** Pure: orbit eye/target around a world point (winner). */
  function orbitPose(cx, cy, cz, yaw) {
    const eye = [
      cx + Math.sin(yaw) * ORBIT_RADIUS,
      cy + ORBIT_HEIGHT,
      cz + Math.cos(yaw) * ORBIT_RADIUS,
    ];
    const target = [cx, cy + 1.2, cz];
    return { eye, target, fov: 55 };
  }

  /** Pure: pick highlight windows from ReplayBuf-shaped tags inside [t0,t1]. */
  function highlightsReel(tags, t0, t1, maxS) {
    const list = (tags || []).filter((g) => g && g.t >= t0 && g.t <= t1);
    const out = [];
    let budget = maxS;
    for (let i = list.length - 1; i >= 0 && budget > 0; i--) {
      const g = list[i];
      const dur = Math.min(HIGHLIGHT_CLIP_S, budget);
      const start = Math.max(t0, g.t - dur * 0.55);
      out.push({ kind: g.kind || "tag", t0: start, t1: start + dur, car: g.car | 0 });
      budget -= dur;
    }
    return out.reverse();
  }

  function create(G, eligible) {
    Log.info("game", "ResultsCam.create");
    let phase = "idle";   // idle | chequered | orbit | highlights | done
    let age = 0, orbitYaw = 0, frameAcc = 0;
    let reel = [], reelIdx = 0, clipAge = 0;
    let replayApi = null;
    const allowed = () => enabled(G) && (!eligible || eligible()) &&
      !(G.netPlay && G.netPlay.active && G.netPlay.active());
    function endHighlights() {
      if (phase === "highlights" && replayApi) replayApi.endScrub();
    }

    function attachReplay(api) { replayApi = api || null; }

    function live() {
      return phase === "chequered" || phase === "orbit" || phase === "highlights";
    }
    function status() {
      return { phase, age, live: live(), clips: reel.length, clip: reelIdx };
    }
    function reset() {
      endHighlights();
      phase = "idle"; age = 0; orbitYaw = 0; frameAcc = 0;
      reel = []; reelIdx = 0; clipAge = 0;
      if (G.dbgCam && G.dbgCam._resultsCam) G.dbgCam = null;
      if (typeof document !== "undefined") {
        const b = document.getElementById("res-highlights");
        if (b) b.hidden = true;
      }
    }
    function publish(pose) {
      if (!pose || !pose.eye) return;
      G.dbgCam = {
        eye: pose.eye.slice(), target: pose.target.slice(),
        fov: pose.fov || 55, far: 6000, _resultsCam: true,
      };
    }
    function subject() {
      const cars = G.cars || [];
      let best = G.player;
      for (const c of cars) {
        if (!c || c.retired) continue;
        if (!best || (c.finPos > 0 && (!best.finPos || c.finPos < best.finPos))) best = c;
      }
      return best || cars[0] || null;
    }
    function cheqPose(p = subject()) {
      if (!p || !G.camVantage) return null;
      const mode = "side";
      const v = G.camVantage(mode, p.s || 0, p.x || 0, p.speed || 0, 0, chequeredExtra(p));
      if (!v || !v.eye) return null;
      return { eye: v.eye, target: v.tgt || v.target || [p.px, p.py || 1, p.pz], fov: v.fov || 58 };
    }
    function doOrbit(p = subject()) {
      if (!p) return null;
      return orbitPose(p.px || 0, p.py || 0, p.pz || 0, orbitYaw);
    }
    function onFlag() {
      reset();
      if (!allowed()) return false;
      phase = "chequered"; age = 0;
      const pose = cheqPose();
      if (pose) publish(pose);
      ensureHighlightsButton();
      return true;
    }
    function startOrbit() {
      if (!live() || !allowed()) return false;
      endHighlights();
      phase = "orbit"; age = 0; orbitYaw = 0;
      const pose = doOrbit();
      if (pose) publish(pose);
      return true;
    }
    function startHighlights() {
      if (!live() || !allowed() || phase === "highlights") return false;
      const buf = replayApi;
      if (!buf || !buf.window) return false;
      const w = buf.window();
      const tags = (buf.tags && buf.tags()) || [];
      reel = highlightsReel(tags, w.t0, w.t1, HIGHLIGHT_MAX_S);
      if (!reel.length && w.frames > 2) {
        const dur = Math.min(HIGHLIGHT_CLIP_S, Math.max(1, w.t1 - w.t0));
        reel = [{ kind: "window", t0: w.t1 - dur, t1: w.t1, car: -1 }];   // no tagged car: film the winner
      }
      if (!reel.length || !buf.beginScrub(false)) return false;
      phase = "highlights"; reelIdx = 0; clipAge = 0; age = 0;
      applyHighlightFrame();
      return true;
    }
    function applyHighlightFrame() {
      const buf = replayApi;
      const clip = reel[reelIdx];
      if (!buf || !clip) return;
      const t = clip.t0 + Math.min(clip.t1 - clip.t0, clipAge);
      buf.apply(t);
      // A retirement remains the subject of its clip; winner selection is
      // only for the flag/orbit and tags whose car is no longer available.
      const p = (G.cars || [])[clip.car] || subject();
      const pose = cheqPose(p) || doOrbit(p);
      if (pose) publish(pose);
    }
    function tick(dt) {
      if (!live()) return false;
      if (!allowed()) { reset(); return false; }
      frameAcc += dt;
      if (frameAcc < FRAME_DT) return true;   // still live, but skip work
      const step = frameAcc; frameAcc = 0;
      age += step;
      if (phase === "chequered") {
        const pose = cheqPose();
        if (pose) publish(pose);
        if (age >= CHEQ_S) startOrbit();
        return true;
      }
      if (phase === "orbit") {
        orbitYaw += (Math.PI * 2 / ORBIT_PERIOD_S) * step;
        const pose = doOrbit();
        if (pose) publish(pose);
        return true;
      }
      if (phase === "highlights") {
        clipAge += step;
        const clip = reel[reelIdx];
        if (!clip || clipAge >= (clip.t1 - clip.t0)) {
          reelIdx++; clipAge = 0;
          if (reelIdx >= reel.length) return startOrbit();
        }
        applyHighlightFrame();
        return true;
      }
      return false;
    }
    function ensureHighlightsButton() {
      if (typeof document === "undefined") return;
      const existing = document.getElementById("res-highlights");
      if (existing) { existing.hidden = !live() || !allowed(); return; }
      const menu = document.getElementById("res-menu");
      if (!menu || !menu.parentNode) return;
      const b = document.createElement("button");
      b.id = "res-highlights";
      b.hidden = !live() || !allowed();
      b.type = "button";
      b.textContent = "HIGHLIGHTS";
      b.onclick = () => { startHighlights(); };
      menu.parentNode.insertBefore(b, menu);
    }

    return {
      onFlag, startOrbit, startHighlights, tick, live, status, reset,
      ensureHighlightsButton, attachReplay, enabled: () => enabled(G),
    };
  }

  return {
    create, CHEQ_S, ORBIT_PERIOD_S, ORBIT_RADIUS, ORBIT_HEIGHT,
    HIGHLIGHT_CLIP_S, HIGHLIGHT_MAX_S, FRAME_DT,
    enabled, chequeredExtra, orbitPose, highlightsReel,
  };
})();
Object.freeze(ResultsCam);
