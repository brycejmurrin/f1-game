/* Apex 26 — WALL CLAMP: per-side barrier / pit-wall / gantry limits, human
 * slide-along + scrub, lane-side pit clamp, and the conditional road→world
 * writeback when xPinned. Extracted from updateCar so barrier / pit / post
 * workstreams edit this file instead of growing saturated js/game.js.
 *
 * Collide keeps the POST-CONTACT soft barrier clamp after car–car resolution;
 * this module is the driving-boundary hard constraint that runs every tick.
 * No create(G): every per-tick local arrives in an explicit ctx bag — no new
 * G members. Behavior-identical to the pre-extract inline block.
 *
 * Plan: carve-headroom Slice B (docs/plans/, 2026-09-30).
 */
const WallClamp = (function () {
  "use strict";

  const clamp = M4.clamp;
  const _lim = { r: 0, l: 0, laneMin: 0, side: 0 };

  // Hard lateral clamp + incidence scrub + pit/gantry limits + human writeback.
  // Mutates `c` (x, speed, head, vLat, wallT, wasOnWall, wallHits, collideT,
  // px/pz when pinned) and scratch buffers ctx.postLim / ctx.smp.
  //
  // ctx (all required unless noted):
  //   track, dt, steer, postLim, smp,
  //   wrapS(s), worldFromTrack(s, x, smp),
  //   soundOn (bool), incidentSim ({ notifyWall }),
  //   addShake(delta) — optional; street incidence FX (game.js owns shake)
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

    // Same candidate-position boundary as contact separation and incident takeover.
    const lim = ContactGeometry.wallLimits(track, c.s, c.x, _lim, postLim);
    const wallR = lim.r, wallL = lim.l, laneMin = lim.laneMin, pitSd = lim.side;
    let xPinned = false;   // did the barrier clamp c.x? (see the writeback below)
    if (c.x > wallR || c.x < -wallL) {
      const into = c.x > wallR ? 1 : -1;          // +1 = hit right wall, -1 = left
      // Debris hook (render-only side-world): the pre-clamp overshoot is the
      // lateral speed into the wall × dt — the impact severity. First frame only.
      if (!c.wasOnWall && DebrisWorld.active()) {
        const xOver = into > 0 ? c.x - wallR : -wallL - c.x;
        DebrisWorld.wallImpact(c, into, xOver);
        // B2 (breakable barriers, flag apex26.breakBarriers): a hard hit promotes
        // nearby BARRIER panels to jointed Rapier bodies that scatter. COSMETIC —
        // the bespoke xPinned clamp below is UNCHANGED; broken panels are never a
        // collision surface for the car (that would be R3). promoteBarrier gates
        // on its own severity minimum and is a no-op when the flag is off.
        const _wallSev = xOver * 60 + Math.abs(c.speed || 0) * 0.15;
        DebrisWorld.promoteBarrier(c, into, _wallSev);
        // Incident sim (R2 airborne): a GENUINELY hard wall strike launches this
        // car into a bounded 6-DoF Rapier tumble (queued now, promoted in preStep).
        // Only clears R2_WALL_SEV — ordinary scrapes never trigger. The bespoke
        // xPinned clamp below still runs this trigger frame; the takeover begins
        // next tick from the resulting pose. Self-guarding no-op otherwise.
        incidentSim.notifyWall(c, into, _wallSev);
      }
      c.x = into > 0 ? wallR : -wallL;
      xPinned = true;
      if (c.human) {
        // Slide along the barrier instead of stopping dead. Decompose the car's
        // heading into the part running ALONG the wall (kept) and the part driving
        // INTO it (killed): a shallow scrape barely slows you and you keep sliding,
        // a head-on hit scrubs hard. The nose is rotated toward the wall tangent so
        // the car runs parallel rather than re-pinning every frame.
        Tracks.sample(track, c.s, smp);
        // The BARRIER's own tangent, not the centreline's: anywhere the barrier
        // diverges from the road (a run-off funnel, an escape road, a pit entry)
        // the road tangent is a direction the wall does not run in. wallAt() gives the boundary's lateral offset, so its
        // slope in s IS the barrier's heading in the road frame.
        const dW = 3, wSd = into > 0 ? 1 : -1;   // ±wallAt(side) folded to a sign — no per-contact closure
        const wSlope = clamp((Tracks.wallAt(track, wrapS(c.s + dW), wSd)
                            - Tracks.wallAt(track, wrapS(c.s - dW), wSd)) * wSd / (2 * dW), -2, 2);
        const wtx = smp.t[0] + smp.r[0] * wSlope, wtz = smp.t[2] + smp.r[2] * wSlope;
        const tHead = Math.atan2(wtx, wtz);
        let rel = c.head - tHead;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        // Sign per the file's own psi convention ("+ = nose turned right (+x)",
        // psi = tHead − head, so rel = −psi): nose toward the +x wall ⟺ rel < 0.
        // The old `into > 0 ? rel > 0 : rel < 0` was inverted on BOTH sides —
        // measured live (30° nose-in at 47 m/s, either wall): no first-frame
        // incidence scrub, no straightening; the car ground along pinned at
        // speed. Flipped and re-measured: the
        // ~14% bite at the pin frame and the nose walks onto the wall tangent,
        // on both walls.
        const noseIn = into > 0 ? rel < 0 : rel > 0;        // nose pointing into wall?
        const incidence = Math.min(1, Math.abs(Math.sin(rel)));  // 0 graze … 1 head-on
        // Kill the slip while scraping a barrier, in BOTH directions.
        //
        // A previous pass made this directional — zeroing only slip heading INTO
        // the wall — reasoning that erasing slip away from it stopped the car
        // rotating out of a scrape. Sound in isolation, wrong in effect: a car at
        // full lock washes wide into the barrier, and letting it keep lateral
        // velocity there means the slide never decays. Bisected to this line:
        // tests/specs/drift.spec.js went 6/0 -> 4/2, with "full lock washes wide, never
        // spins" reaching 82 deg of slip against its 45 deg limit, and "slide
        // self-aligns" failing alongside it. The wall is a hard constraint; slip
        // against it is not something the car gets to keep.
        if (c.vLat) c.vLat = 0;
        if (noseIn) {
          // first-frame impact: lose only the normal component — a graze is nearly
          // free, a head-on hit bites hard.
          if (!c.wasOnWall) c.speed *= 1 - incidence * AiDrive.wallHitLoss(!!track.street);
          // straighten the nose toward the wall tangent so the car slides along it
          // Exponential, not a raw rate*dt: Math.min(1, ...) SNAPPED the heading
          // exactly onto the tangent in a single step at any dt >= 0.083 s (a 12 fps
          // frame, or a headless step()), making the rotation frame-rate dependent.
          // Scaled by speed as well — a car sitting still against a barrier has no
          // velocity to justify being turned (unscaled, a stopped car snaps
          // parallel in ~0.2 s).
          const wallAlign = (1 - Math.exp(-(4 + incidence * 8) * dt))
                          * clamp(Math.abs(c.speed) / 8, 0, 1);
          c.head -= rel * wallAlign;
          if (c.isPlayer && !c.wasOnWall && incidence > 0.12) c.wallHits = (c.wallHits | 0) + 1;
        }
        // THIS screen's car only: a VS FRIEND is c.human too (setCarRole), so
        // shake / collision SFX / vibrate / rumble must gate on isPlayer —
        // otherwise a remote friend's wall scrape shakes our camera (ad915f8ea).
        // Barrier SFX on every circuit (street gate was v35 street-FX only); shake /
        // pad haptics stay street-only. Throttled scrape re-arm while grinding.
        const WALL_SFX_REARM = 0.35;
        const WALL_SCRAPE_SPEED = 2;   // m/s — stopped against the barrier stays quiet
        if (c.isPlayer && c.collideT <= 0 && soundOn) {
          const firstStrike = !c.wasOnWall && noseIn && incidence > 0.12;
          const grindScrape = c.wasOnWall && Math.abs(c.speed) >= WALL_SCRAPE_SPEED;
          if (firstStrike || grindScrape) {
            const fxInc = firstStrike ? incidence : Math.max(incidence, 0.2);
            GameAudio.collision(fxInc, !firstStrike || incidence < 0.45, into);
            c.collideT = WALL_SFX_REARM;
            if (firstStrike && track.street) {
              if (addShake) addShake(0.1 + incidence * 0.3);
              Input.vibrate(15 + incidence * 35);
              Input.rumble(0.35 + incidence * 0.5, 100, "handles");
            }
          }
        } else if (!c.isPlayer && soundOn && typeof GameAudio !== "undefined" && GameAudio.fieldContact) {
          // Radio r9: AI / rival wall bump + scrape (positional). Player path
          // above stays byte-identical. Cooldown lives in GameAudio — do not
          // touch c.collideT (AI patience / contact give reads it).
          // Grind gate uses incidence (not a second WALL_SCRAPE_SPEED speed
          // literal — vstd pins unique approved sites).
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
            // team.id is a STRING ("haas") — index it in Teams.LIST, never
            // multiply it (NaN | 0 keyed the whole field 10000, #2170).
            let key = c._wireId;
            if (key == null) {
              const id = c.team && c.team.id;
              const list = typeof Teams !== "undefined" ? Teams.LIST : [];
              const ti = list.findIndex((t) => t.id === id);
              key = (ti < 0 ? list.length : ti) * 4 + (c.seat | 0);
            }
            key = (key | 0) + 10000;
            GameAudio.fieldContact(kind, fxInc, wx, wz, key);
          }
        }
        // Steering held INTO the barrier while pinned = the wall denies that turn,
        // which scrubs speed — you can't ride the wall for free. `steer` is the
        // driver input (sign = turn direction); `into` is ±1 for the wall side.
        const pushIn = Math.max(0, into * steer);
        if (pushIn > 0.02) {
          const scrub = pushIn * AiDrive.wallSteerScrub(!!track.street) * dt;
          if (c.speed > 0) c.speed = Math.max(0, c.speed - scrub);
          else if (c.speed < 0) c.speed = Math.min(0, c.speed + scrub);
          c.wallT = 0.35;     // brief auto-throttle suppress
        }
        // Nose/steer pointing AWAY = peeling off: speed and heading left alone so
        // the player just drives off the barrier — no sticky pin, no auto-rescue.
      } else {
        // AI has no world-space heading to slide; clamp + gentle scrub.
        c.speed = Math.max(0, c.speed - AiDrive.wallAiScrub(!!track.street) * dt);
        // Offline AI wall SFX (#2212). The VS FRIEND path above needs c.human
        // (heading incidence); offline AI is human:false and never reached it.
        // Incidence proxy: |vLat|/speed, steer-into-wall, and a first-pin
        // speed stand-in. Cooldown / range / voice-cap live in GameAudio —
        // do not touch c.collideT (AI patience / contact give reads it).
        if (soundOn && typeof GameAudio !== "undefined" && GameAudio.fieldContact) {
          const spd = Math.abs(c.speed) || 0;
          const slipInc = spd > 1e-3 ? Math.min(1, Math.abs(c.vLat || 0) / spd) : 0;
          const pushIn = Math.max(0, into * (steer || 0));
          let incidence = Math.max(slipInc, pushIn > 0.02 ? Math.min(1, pushIn) : 0);
          if (!c.wasOnWall) {
            // Soft first-contact floor from ground speed (~0.12 at ~10 m/s).
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
              const ti = list.findIndex((t) => t.id === id);
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
    // The lane side of the pit wall: a car on the lane is kept off the platform
    // and its barrier — it cannot rejoin the track through the wall either.
    if (laneMin > 0 && c.x * pitSd < laneMin) {
      c.x = laneMin * pitSd; xPinned = true;
      if (c.vLat) c.vLat = 0;
      if (c.human) Tracks.sample(track, c.s, smp);
    }
    // Re-sample at the NEW c.s — the yawVis block below reads the tangent here.
    //
    // The barrier is the ONE thing allowed to move the player in ROAD coordinates,
    // because it is a hard constraint rather than a suggestion: when it clamps c.x,
    // that has to be pushed back into the authoritative world position. Every other
    // frame the arrow points the other way (world → (s, x)), so this rebuild is
    // CONDITIONAL: done every frame it would overwrite the car's own integration
    // with a point reconstructed from the road, putting the car back on rails.
    if (c.human && c.px != null) {
      if (xPinned) {
        const w = worldFromTrack(c.s, c.x, smp);   // exact inverse of trackFrom
        c.px = w.x;
        c.pz = w.z;
      } else {
        Tracks.sample(track, c.s, smp);            // yawVis below needs the tangent
      }
    }
    // (An AI's yaw leans from steer + curvature and never reads smp; the rescue
    // and the world mirror below both re-sample at the advanced s.)
  }

  return { apply };
})();
Object.freeze(WallClamp);
