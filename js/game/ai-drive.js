/* Apex 26 — AI DRIVE: situation-aware decisions for the kinematic AI field.

   Extracted from js/game.js so the racecraft axes (craft / awareness /
   experience) and the OT/ERS/brake/lane policies can grow without paying the
   game.js line ratchet for every tweak. Pure rules — no DOM, no Tracks, no
   simRnd draws of its own. Callers pass curvature samples and the already-
   drawn roll so the seeded stream contract in makeCars()/updateCar stays
   exactly where it was.

   WHAT IT OWNS
     • rating → behaviour maps (stuck threshold, follow gap, contact give,
       steer damp, unstuck pull)
     • overtake FIRE rate (situation score; the roll stays in game.js)
     • ERS deploy want (catch / defend / clear-straight, not greedy always)
     • multi-sample brake target + soft pedal level + craft late-brake
     • slow adaptive preferred-lane nudge from traffic density

   WHAT STAYS IN game.js
     • the O(n) traffic scan (roomL/R, blocker, tow, chaser)
     • speed integration, X-mode arming, collisions
     • the Frenet lateral step itself */
const AiDrive = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));

  // ── ratings on the car (0..1), with the mid-grid default the old code used ──
  function traits(c) {
    return {
      craft: c.craft != null ? c.craft : 0.75,
      awareness: c.awareness != null ? c.awareness : 0.75,
      experience: c.experience != null ? c.experience : 0.75,
      skill: c.skill != null ? c.skill : 0.97,
    };
  }

  // High awareness digs out sooner (sees the box); low awareness sits longer.
  function stuckThreshold(t) {
    return lerp(1.15, 0.45, t.awareness);
  }

  // Following gap added to the street/permanent base. Aware drivers leave space.
  function followPad(t) {
    return lerp(-0.8, 2.2, t.awareness);
  }

  // Contact compliance: aware drivers yield more so a lean-on pass sticks.
  function contactGive(contacting, t) {
    if (!contacting) return 1;
    return lerp(0.55, 0.25, t.awareness);
  }

  // Steer command low-pass. Experience = smoother; rookies twitch.
  function steerDamp(t) {
    return lerp(5.5, 12.5, t.experience);
  }

  // Unstuck lateral pull (metres of target bias). Rookies panic harder.
  function unstuckPull(t) {
    return lerp(3.4, 2.0, t.experience);
  }

  // Street circuits: awareness shrinks the overtake pull so they don't wall.
  function streetOtScale(t) {
    return lerp(0.55, 1.0, t.awareness);
  }

  // ── OVERTAKE FIRE ─────────────────────────────────────────────────────────
  // Old behaviour: Poisson with fixed λ=0.7 whenever armed. That ignored craft
  // (who should commit) and awareness (who should wait for a cleaner window).
  // Situation score folds gap, closing speed, side room, and a mild straight
  // preference; craft raises the rate, awareness and inexperience cut it.
  function otFireRate(ctx) {
    const t = ctx.traits;
    const gap = ctx.blockerGap != null ? ctx.blockerGap : ctx.gapAhead;
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    const closing = (ctx.speed || 0) - (ctx.aheadSpeed != null ? ctx.aheadSpeed : ctx.speed || 0);
    // 0..1 pieces
    const gapScore = clamp(1 - (gap || 9) / 9, 0, 1);           // closer = better
    const roomScore = clamp(room / 3.2, 0, 1);
    const closeScore = clamp(0.45 + closing / 8, 0, 1);
    const straight = clamp(1 - Math.abs(ctx.kAhead || 0) / 0.012, 0, 1);
    const situ = (0.34 * gapScore + 0.28 * roomScore + 0.22 * closeScore + 0.16 * straight)
      * (ctx.street ? streetOtScale(t) : 1);
    // Mid-open window lands ~0.3–0.6 (unit-tested band), not the old fixed λ=0.7.
    const craftMul = lerp(0.45, 1.55, t.craft);
    const awareMul = lerp(1.25, 0.7, t.awareness);     // careful = slower to pull the trigger
    const expMul = lerp(0.75, 1.15, t.experience);      // rookies hesitate
    return clamp(0.55 * situ * craftMul * awareMul * expMul, 0.08, 2.4);
  }

  // roll is the caller's simRnd() — only invoke when otArmed (short-circuit).
  function otShouldFire(roll, dt, ctx) {
    const rate = otFireRate(ctx);
    return roll < 1 - Math.exp(-rate * dt);
  }

  // ── ERS DEPLOY ────────────────────────────────────────────────────────────
  // Old: any straight with energy>0.25. That emptied the battery by mid-race.
  // New: deploy to CATCH (tow + closing), DEFEND (chaser), or clear air with
  // plenty of charge; hold when a corner is imminent and charge is middling.
  function wantBoost(ctx) {
    const energy = ctx.energy || 0;
    if (energy <= 0.02) return false;
    if (ctx.otActive) return true;                 // OT always deploys
    const kAhead = Math.abs(ctx.kAhead60 || 0);
    const straight = kAhead < 0.006;
    if (!straight) return false;
    const catching = !!(ctx.towCar && ctx.towGap < 28 && (ctx.speed || 0) >= (ctx.towSpeed || 0) - 1);
    const defending = !!(ctx.chaser && ctx.chaserGap < 14 && (ctx.chaserSpeed || 0) > (ctx.speed || 0) - 2);
    const rich = energy > 0.55;  // straight already required above
    const desperate = energy > 0.25 && catching;
    // Awareness banks charge: low-awareness drivers still dump early (old feel).
    const bank = ctx.traits.awareness > 0.8 && energy < 0.4 && !catching && !defending;
    if (bank) return false;
    return desperate || defending || rich || (energy > 0.25 && straight && ctx.traits.awareness < 0.55);
  }

  // ── BRAKING ───────────────────────────────────────────────────────────────
  // Multi-sample: for each lookahead point, the speed we may carry NOW is the
  // corner limit there plus the braking distance back to us. Soft pedal when
  // only slightly over; craft late-brake when a pass is on and the side is open.
  function brakeTarget(ctx) {
    const t = ctx.traits;
    const samples = ctx.samples || [];
    const latMax = ctx.latMax || 22;
    const brake = ctx.brake || 22;
    const grip = ctx.grip || 1;
    const skill = t.skill;
    let vLim = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const k = Math.max(Math.abs(s.k || 0), 1e-5);
      const bankMu = 1 + Math.sin(s.bank || 0) * 0.8;
      const vC = Math.sqrt(latMax * bankMu * grip / k) * skill;
      // Distance budget: can scrub ~0.85·BRAKE over d metres (arcade, not perfect).
      const d = Math.max(s.d || 0, 1);
      const vEntry = Math.sqrt(vC * vC + 2 * brake * 0.85 * d);
      if (vEntry < vLim) vLim = vEntry;
    }
    if (!Number.isFinite(vLim)) vLim = 1e6;
    // Craft late-brake when attacking with room: allow a few % over the limit.
    const attacking = !!(ctx.blocker && ctx.blockerGap < 16 && (ctx.speed || 0) > (ctx.blockerSpeed || 0) - 1);
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    if (attacking && room > 1.6) {
      vLim *= lerp(1.0, 1.07, t.craft);
    }
    return vLim;
  }

  function brakeDecision(ctx) {
    const vLim = brakeTarget(ctx);
    const speed = ctx.speed || 0;
    const excess = speed - vLim;
    // Soft band: start easing at +1 m/s, full pedal by +7 m/s (was binary at +2).
    const soft = 1, full = 7;
    let brakeLvl = 0;
    let braking = false;
    if (excess > soft) {
      braking = true;
      brakeLvl = clamp((excess - soft) / (full - soft), 0.2, 1);
    }
    return { braking, brakeLvl, vLim, excess };
  }

  // ── ADAPTIVE LANE ─────────────────────────────────────────────────────────
  // Nudge the preferred lane toward the freer side when traffic is dense, so
  // midfield trains slowly fan out. Slow on purpose — must not fight overtake.
  function adaptLane(lane, ctx, dt) {
    const dens = ctx.nearby || 0;
    if (dens < 2) return lane;
    const freer = (ctx.roomR || 0) - (ctx.roomL || 0);
    if (Math.abs(freer) < 0.9) return lane;
    const sign = freer > 0 ? 1 : -1;
    // Awareness commits earlier; craft picks a more decisive bias.
    const step = lerp(0.08, 0.22, ctx.traits.craft) * lerp(0.7, 1.15, ctx.traits.awareness);
    // Bias around the grid home line (baseLane), not the live lane — otherwise
    // every frame adds another step and the field crawls to ±0.85.
    const home = ctx.baseLane != null ? ctx.baseLane : lane;
    const target = clamp(home + sign * step, -0.85, 0.85);
    return damp(lane, target, 0.35, dt);
  }

  return {
    traits, stuckThreshold, followPad, contactGive, steerDamp, unstuckPull,
    streetOtScale, otFireRate, otShouldFire, wantBoost, brakeTarget, brakeDecision,
    adaptLane,
  };
})();
