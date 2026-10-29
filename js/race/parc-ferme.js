/* Apex 26 — PARC FERMÉ beat (ceremony plan slice 3 / #4069).
 * Park poses / pit subject, aimed orbit (or one frozen park pose on mobile /
 * PerfGov.tier() >= 2), dim "PARC FERMÉ" caption, wall timer + SKIP.
 *
 * RaceCeremony (slice 1 / #4067) owns phase transitions and calls this module
 * once the ceremony enters `parcFerme`. This file does not reach into game.js
 * and does not extend ResultsCam's phase enum — it publishes G.dbgCam with
 * `_parcFerme: true` (and reuses ResultsCam.orbitPose when present) so a later
 * ResultsCam `parcFerme` phase can absorb the same poses without a second
 * camera owner. One `create(G)`; pure helpers are exported for unit tests.
 *
 * Plan: docs/plans/2026-10-27-cooldown-podium.md */
"use strict";

var ParcFerme = (function () {
  const PARC_S = 8;                 // wall seconds; plan band 6–10
  const ORBIT_PERIOD_S = 22;        // slower than results orbit — park inspect
  const ORBIT_RADIUS = 14;
  const ORBIT_HEIGHT = 5;
  const FRAME_DT = 1 / 30;
  const CAPTION = "PARC FERMÉ";
  const SKIP_LABEL = "SKIP";
  const HOST_ID = "ceremony-parc";
  const SKIP_ID = "ceremony-parc-skip";

  /** Pure: mobile or high PerfGov → timers + SKIP only, no live orbit redraw. */
  function frozenPath(G) {
    const g = G && G.gfx;
    if (g && g.isMobile) return true;
    if (typeof PerfGov !== "undefined" && PerfGov.tier && PerfGov.tier() >= 2) return true;
    return false;
  }

  /** Pure: car to frame — prefer the human/player (parked after cooldown), else P1. */
  function pitSubject(G, hint) {
    if (hint && (hint.px != null || hint.s != null)) return hint;
    const cars = (G && G.cars) || [];
    const player = G && G.player;
    if (player && !player.retired) return player;
    let best = null;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.retired) continue;
      if (!best || (c.finPos > 0 && (!best.finPos || c.finPos < best.finPos))) best = c;
    }
    return best || player || cars[0] || null;
  }

  /**
   * Pure: world anchor for the park orbit. Prefers an explicit pit/box sample
   * when Tracks + a pit zone exist; otherwise the subject's world pose.
   */
  function parkAnchor(G, car) {
    const c = car || pitSubject(G);
    if (!c) return null;
    const track = G && G.track;
    const anchor = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    let x = c.px, y = c.py || 0, z = c.pz;
    if (track && typeof Tracks !== "undefined" && Tracks.sample) {
      let s = c.s;
      const L = track.total;
      // Prefer the player's pit-box arc when PitGeom can name the window.
      if (L > 0 && typeof PitGeom !== "undefined" && PitGeom.zoneOf) {
        const zz = PitGeom.zoneOf(track);
        if (zz && zz.sBox != null) s = zz.sBox;
      }
      if (s != null) {
        Tracks.sample(track, s, anchor);
        const lat = (c.x != null ? c.x : 0);
        x = anchor.p[0] + (anchor.r[0] || 0) * lat;
        y = anchor.p[1];
        z = anchor.p[2] + (anchor.r[2] || 0) * lat;
        if (Tracks.banking) {
          const bank = Tracks.banking(track, s, lat);
          if (bank) y += bank.dy || 0;
        }
      }
    }
    if (x == null || z == null) return null;
    return { x: x || 0, y: y || 0, z: z || 0, car: c };
  }

  /** Pure: aimed orbit eye/target around a park anchor (ResultsCam.orbitPose when loaded). */
  function parkPose(cx, cy, cz, yaw) {
    if (typeof ResultsCam !== "undefined" && ResultsCam.orbitPose) {
      const p = ResultsCam.orbitPose(cx, cy, cz, yaw);
      // Tighten the stock results orbit for a pit-bay inspect.
      if (p && p.eye) {
        const dx = p.eye[0] - cx, dz = p.eye[2] - cz;
        const len = Math.hypot(dx, dz) || 1;
        const scale = ORBIT_RADIUS / len;
        p.eye[0] = cx + dx * scale;
        p.eye[1] = cy + ORBIT_HEIGHT;
        p.eye[2] = cz + dz * scale;
        p.fov = 52;
      }
      return p;
    }
    const eye = [
      cx + Math.sin(yaw) * ORBIT_RADIUS,
      cy + ORBIT_HEIGHT,
      cz + Math.cos(yaw) * ORBIT_RADIUS,
    ];
    return { eye, target: [cx, cy + 1.0, cz], fov: 52 };
  }

  function create(G) {
    Log.info("game", "ParcFerme.create");
    let phase = "idle";   // idle | parcFerme | done
    let age = 0, orbitYaw = 0, frameAcc = 0;
    let frozen = false;
    let subjectCar = null;
    let skipFn = null;

    function live() { return phase === "parcFerme"; }

    function status() {
      return {
        phase: phase === "parcFerme" ? "parcFerme" : phase,
        age,
        live: live(),
        frozen,
        remaining: live() ? Math.max(0, PARC_S - age) : 0,
        caption: CAPTION,
      };
    }

    function publish(pose) {
      if (!pose || !pose.eye) return;
      G.dbgCam = {
        eye: pose.eye.slice(),
        target: pose.target.slice(),
        fov: pose.fov || 52,
        far: 6000,
        _parcFerme: true,
        _resultsCam: false,
      };
    }

    function poseNow() {
      const a = parkAnchor(G, subjectCar);
      if (!a) return null;
      return parkPose(a.x, a.y, a.z, orbitYaw);
    }

    function ensureHost() {
      if (typeof document === "undefined") return null;
      // Literal ids only — dynamicIdReads is shrink-only (shell-ids.mjs).
      let host = document.getElementById("ceremony-parc");
      if (host) return host;
      host = document.createElement("div");
      host.id = "ceremony-parc";
      host.hidden = true;
      host.setAttribute("data-ceremony-phase", "parcFerme");
      host.setAttribute("role", "region");
      host.setAttribute("aria-label", CAPTION);
      host.style.cssText = [
        "position:fixed", "inset:auto 0 0 0", "z-index:40",
        "display:flex", "flex-direction:column", "align-items:center", "gap:0.6rem",
        "padding:calc(var(--gap, 8px) * 1.5)", "padding-bottom:max(calc(var(--gap, 8px) * 1.5), env(safe-area-inset-bottom, 0px))",
        "pointer-events:none", "background:linear-gradient(transparent, rgba(0,0,0,0.55))",
      ].join(";");
      const cap = document.createElement("p");
      cap.setAttribute("data-parc-caption", "");
      cap.textContent = CAPTION;
      cap.style.cssText = "margin:0;letter-spacing:0.18em;font-weight:700;font-size:var(--fs-title, 1.1rem);color:#fff;text-shadow:0 1px 4px #000;opacity:0.9";
      const skip = document.createElement("button");
      skip.id = "ceremony-parc-skip";
      skip.type = "button";
      skip.className = "bigbtn";
      skip.textContent = SKIP_LABEL;
      skip.style.cssText = "pointer-events:auto;min-height:var(--tap, 44px);min-width:calc(var(--tap, 44px) * 2.5)";
      skip.addEventListener("click", () => { if (skipFn) skipFn(); });
      host.appendChild(cap);
      host.appendChild(skip);
      (document.body || document.documentElement).appendChild(host);
      return host;
    }

    function showHost(on) {
      const host = ensureHost();
      if (!host) return;
      host.hidden = !on;
      if (on) host.setAttribute("data-ceremony-phase", "parcFerme");
    }

    function clearCam() {
      if (G.dbgCam && G.dbgCam._parcFerme) G.dbgCam = null;
    }

    function finish(reason) {
      if (phase !== "parcFerme") return false;
      phase = "done";
      age = PARC_S;
      showHost(false);
      // Leave a frozen park pose on mobile so the next beat (podium/results)
      // inherits a still rather than a null cam; live path clears for ResultsCam.
      if (!frozen) clearCam();
      Log.debug("game", "ParcFerme.end reason=" + (reason || "timer"));
      return true;
    }

    function start(opts) {
      const o = opts || {};
      subjectCar = pitSubject(G, o.subject || o.car || null);
      frozen = o.frozen != null ? !!o.frozen : frozenPath(G);
      skipFn = typeof o.onSkip === "function" ? o.onSkip : () => skip();
      phase = "parcFerme";
      age = 0; orbitYaw = 0; frameAcc = 0;
      showHost(true);
      const pose = poseNow();
      if (pose) publish(pose);
      // Frozen path: one static park pose (or keep prior dbgCam if pose failed).
      Log.info("game", "ParcFerme.start frozen=" + frozen);
      return true;
    }

    function skip() {
      if (!live()) return false;
      return finish("skip");
    }

    function tick(dt) {
      if (!live()) return false;
      frameAcc += dt;
      if (frameAcc < FRAME_DT) return true;
      const step = frameAcc; frameAcc = 0;
      age += step;
      if (!frozen) {
        orbitYaw += (Math.PI * 2 / ORBIT_PERIOD_S) * step;
        const pose = poseNow();
        if (pose) publish(pose);
      }
      if (age >= PARC_S) return finish("timer") && false;
      return true;
    }

    function reset() {
      phase = "idle";
      age = 0; orbitYaw = 0; frameAcc = 0;
      frozen = false; subjectCar = null; skipFn = null;
      showHost(false);
      clearCam();
    }

    return {
      start, skip, tick, live, status, reset,
      ensureHost, frozenPath: () => frozenPath(G),
    };
  }

  return {
    create, PARC_S, ORBIT_PERIOD_S, ORBIT_RADIUS, ORBIT_HEIGHT, FRAME_DT,
    CAPTION, SKIP_LABEL, HOST_ID, SKIP_ID,
    frozenPath, pitSubject, parkAnchor, parkPose,
  };
})();
Object.freeze(ParcFerme);
