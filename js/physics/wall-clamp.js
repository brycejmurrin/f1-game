const WallClamp = (function () {
  "use strict";

  const clamp = M4.clamp;
  const _lim = { r: 0, l: 0, laneMin: 0, side: 0 };

  function apply(c, ctx) {
    const track = ctx.track;
    const dt = ctx.dt;
    const steer = ctx.steer;
    const postLim = ctx.postLim;
    const smp = ctx.smp;
    const wrapS = ctx.wrapS;
    const worldFromTrack = ctx.worldFromTrack;
    const soundOn = ctx.soundOn;
    const incidentSim = ctx.incidentSim;
    const addShake = ctx.addShake;
    const kStd = ctx.vStd ? ctx.vStd(1) : 1;

    const lim = ContactGeometry.wallLimits(track, c.s, c.x, _lim, postLim);
    const wallR = lim.r, wallL = lim.l, laneMin = lim.laneMin, pitSd = lim.side;
    let xPinned = false;
    if ((c.x > wallR || c.x < -wallL) && WallEndFace.apply(c, track, lim, dt)) xPinned = true;
    else if (c.x > wallR || c.x < -wallL) {
      const into = c.x > wallR ? 1 : -1;
      if (!c.wasOnWall && DebrisWorld.active()) {
        const xOver = into > 0 ? c.x - wallR : -wallL - c.x;
        DebrisWorld.wallImpact(c, into, xOver);
        const _wallSev = ((dt > 0 ? xOver / dt : 0) + Math.abs(c.speed || 0) * 0.15) * kStd;
        DebrisWorld.promoteBarrier(c, into, _wallSev);
        incidentSim.notifyWall(c, into, _wallSev);
      }
      c.x = into > 0 ? wallR : -wallL;
      xPinned = true;
      if (c.human) {
        Tracks.sample(track, c.s, smp);
        const dW = 3, wSd = into > 0 ? 1 : -1;
        const wSlope = clamp((Tracks.wallAt(track, wrapS(c.s + dW), wSd)
                            - Tracks.wallAt(track, wrapS(c.s - dW), wSd)) * wSd / (2 * dW), -2, 2);
        const wtx = smp.t[0] + smp.r[0] * wSlope, wtz = smp.t[2] + smp.r[2] * wSlope;
        const tHead = Math.atan2(wtx, wtz);
        let rel = c.head - tHead;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        const noseIn = into > 0 ? rel < 0 : rel > 0;
        const incidence = Math.min(1, Math.abs(Math.sin(rel)));
        if (c.vLat) c.vLat = 0;
        if (noseIn) {
          if (!c.wasOnWall) c.speed *= 1 - incidence * AiDrive.wallHitLoss(!!track.street);
          const wallAlign = (1 - Math.exp(-(4 + incidence * 8) * dt))
                          * clamp(Math.abs(c.speed) * kStd / 8, 0, 1);
          c.head -= rel * wallAlign;
          if (c.isPlayer && !c.wasOnWall && incidence > 0.12) c.wallHits = (c.wallHits | 0) + 1;
        }
        const WALL_SFX_REARM = 0.35;
        const WALL_SCRAPE_SPEED = 2;
        if (c.isPlayer && c.collideT <= 0) {
          const firstStrike = !c.wasOnWall && noseIn && incidence > 0.12;
          const grindScrape = c.wasOnWall && Math.abs(c.speed) >= WALL_SCRAPE_SPEED;
          if (firstStrike || grindScrape) {
            const fxInc = firstStrike ? incidence : Math.max(incidence, 0.2);
            if (soundOn) GameAudio.collision(fxInc, !firstStrike || incidence < 0.45, into);
            c.collideT = WALL_SFX_REARM;
            if (firstStrike && track.street) {
              if (addShake) addShake(0.1 + incidence * 0.3);
              Input.vibrate(15 + incidence * 35);
              Input.rumble(0.35 + incidence * 0.5, 100, "handles");
            }
          }
        } else if (!c.isPlayer && soundOn && typeof GameAudio !== "undefined" && GameAudio.fieldContact) {
          const firstStrike = !c.wasOnWall && noseIn && incidence > 0.12;
          const grindScrape = c.wasOnWall && noseIn && incidence > 0.08;
          if (firstStrike || grindScrape) {
            const fxInc = firstStrike ? incidence : Math.max(incidence, 0.2);
            const kind = firstStrike && incidence >= 0.45 ? "bump" : "scrape";
            let wx = c.px, wz = c.pz;
            if ((wx == null || wz == null) && worldFromTrack) {
              const w = worldFromTrack(c.s, c.x, smp);
              if (w) { wx = w.x; wz = w.z; }
            }
            let key = c._wireId;
            if (key == null) {
              const id = c.team && c.team.id;
              const list = typeof Teams !== "undefined" ? Teams.LIST : [];
              let ti = -1;
              for (let i = 0; i < list.length; i++) if (list[i].id === id) { ti = i; break; }
              key = (ti < 0 ? list.length : ti) * 4 + (c.seat | 0);
            }
            key = (key | 0) + 10000;
            GameAudio.fieldContact(kind, fxInc, wx, wz, key);
          }
        }
        const pushIn = Math.max(0, into * steer);
        if (pushIn > 0.02) {
          const scrub = pushIn * AiDrive.wallSteerScrub(!!track.street) * dt;
          if (c.speed > 0) c.speed = Math.max(0, c.speed - scrub);
          else if (c.speed < 0) c.speed = Math.min(0, c.speed + scrub);
          c.wallT = 0.35;
        }
      } else {
        c.speed = Math.max(0, c.speed - AiDrive.wallAiScrub(!!track.street) * dt);
        if (soundOn && typeof GameAudio !== "undefined" && GameAudio.fieldContact) {
          const spd = Math.abs(c.speed) || 0;
          const slipInc = spd > 1e-3 ? Math.min(1, Math.abs(c.vLat || 0) / spd) : 0;
          const pushIn = Math.max(0, into * (steer || 0));
          let incidence = Math.max(slipInc, pushIn > 0.02 ? Math.min(1, pushIn) : 0);
          if (!c.wasOnWall) {
            incidence = Math.max(incidence, Math.min(0.55, spd / 80));
          }
          const firstStrike = !c.wasOnWall && incidence > 0.12;
          const grindScrape = c.wasOnWall && incidence > 0.08;
          if (firstStrike || grindScrape) {
            const fxInc = firstStrike ? incidence : Math.max(incidence, 0.2);
            const kind = firstStrike && incidence >= 0.45 ? "bump" : "scrape";
            let wx = c.px, wz = c.pz;
            if ((wx == null || wz == null) && worldFromTrack) {
              const w = worldFromTrack(c.s, c.x, smp);
              if (w) { wx = w.x; wz = w.z; }
            }
            let key = c._wireId;
            if (key == null) {
              const id = c.team && c.team.id;
              const list = typeof Teams !== "undefined" ? Teams.LIST : [];
              let ti = -1;
              for (let i = 0; i < list.length; i++) if (list[i].id === id) { ti = i; break; }
              key = (ti < 0 ? list.length : ti) * 4 + (c.seat | 0);
            }
            key = (key | 0) + 10000;
            GameAudio.fieldContact(kind, fxInc, wx, wz, key);
          }
        }
      }
      c.wasOnWall = true;
    } else {
      c.wasOnWall = false;
      if (c.human) c.wallT = Math.max(0, (c.wallT || 0) - dt);
    }
    if (laneMin > 0 && c.x * pitSd < laneMin) {
      c.x = laneMin * pitSd; xPinned = true;
      if (c.vLat) c.vLat = 0;
      if (c.human) Tracks.sample(track, c.s, smp);
    }
    if (c.human && c.px != null) {
      if (xPinned) {
        const w = worldFromTrack(c.s, c.x, smp);
        c.px = w.x;
        c.pz = w.z;
      } else {
        Tracks.sample(track, c.s, smp);
      }
    }
  }

  return { apply };
})();
Object.freeze(WallClamp);
