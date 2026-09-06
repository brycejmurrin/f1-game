/* Apex 26 — AI DRIVE: situation-aware decisions for the kinematic AI field. Extracted from js/game.js so the racecraft axes (craft / awareness / experience) and t… */
const AiDrive = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));

  // ratings on the car (0..1), with the mid-grid default the old code used
  // Reused scratch — same contract as game.js pairContact/_ct. Callers must
  // read fields before the next traits() call (updateCar does; tests do).
  const _traits = { craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75 };
  function traits(c) {
    _traits.craft = c.craft != null ? c.craft : 0.75;
    _traits.awareness = c.awareness != null ? c.awareness : 0.75;
    _traits.experience = c.experience != null ? c.experience : 0.75;
    _traits.skill = c.skill != null ? c.skill : 0.97;
    _traits.consistency = c.consistency != null ? c.consistency : 0.75;
    return _traits;
  }

  const _house = { attack: 0, hold: 0 };
  function houseStyle(team, seat, stats) {
    const s = stats || (team && team.stats);
    if (!s) { _house.attack = 0; _house.hold = 0; return _house; }
    _house.attack = clamp(((s.speed + s.accel) * 0.5 - 85) / 25, -1, 1);
    _house.hold = clamp(((s.cornering + s.braking) * 0.5 - 85) / 25, -1, 1);
    if (seat === 0) {
      _house.attack = clamp(_house.attack + 0.10, -1, 1);
      _house.hold = clamp(_house.hold - 0.06, -1, 1);
    } else if (seat === 1) {
      _house.attack = clamp(_house.attack - 0.14, -1, 1);
      _house.hold = clamp(_house.hold + 0.12, -1, 1);
    }
    return _house;
  }
  function houseMul(team, lo, hi, axis, seat, stats) {
    const h = houseStyle(team, seat, stats);
    return lerp(lo, hi, ((axis === "hold" ? h.hold : h.attack) + 1) * 0.5);
  }
  function houseMulCtx(ctx, lo, hi, axis) {
    return houseMul(ctx && ctx.team, lo, hi, axis, ctx && ctx.seat, ctx && ctx.stats);
  }

  function isMate(team, other) {
    const id = team && team.id;
    const oid = other && other.team && other.team.id;
    return !!(id && oid && id === oid);
  }
  function ordersMul(team, seat, other, kind) {
    if (!isMate(team, other)) return 1;
    const os = other.seat;
    if (seat == null || os == null) return kind === "ot" ? 0.55 : (kind === "defend" ? 0.4 : 1);
    if (kind === "ot") {
      if (seat > os) return 0.22;
      if (seat < os) return 1.18;
      return 0.55;
    }
    if (kind === "defend") {
      if (seat > os) return 0.15;
      if (seat < os) return 1.06;
      return 0.35;
    }
    if (seat > os) return 1.12;
    if (seat < os) return 0.88;
    return 1;
  }

  const _look = [];
  const _lookPool = [];
  function beginLook() { _look.length = 0; }
  function pushLook(d, k, bank) {
    let s = _lookPool[_look.length];
    if (!s) s = _lookPool[_look.length] = { d: 0, k: 0, bank: 0 };
    s.d = d; s.k = k; s.bank = bank;
    _look.push(s);
  }
  function endLook() { return _look; }

  // High awareness digs out sooner (sees the box); low awareness sits longer.
  function stuckThreshold(t) {
    return lerp(1.15, 0.45, t.awareness);
  }

  function followPad(t, street, team, seat, other, stats) {
    const pad = lerp(-0.8, 2.2, t.awareness) * houseMul(team, 0.92, 1.08, "hold", seat, stats);
    const out = street ? pad * 0.5 : pad;
    return out * ordersMul(team, seat, other, "follow");
  }

  function followBase(street) {
    return street ? 8 : 6;
  }

  // Slipstream vmax gain. Streets used to get none, so the 8 m train could
  // never close; a half-size tow still fits inside the follow cap.
  function towGain(street) {
    return street ? 0.022 : 0.045;
  }

  // FULL BRAKES AT +3 m/s, AT ANY GAP, was the shape on permanents — and it
  // killed every run at the car ahead: a follower 15 m back closing at 4 m/s
  // got brakeLvl 1 (22 m/s²), which also takes the throttle branch away, so it
  // arrived at the follow distance with no speed differential left to pass
  // with. The street branch already graded it; permanents now grade the same
  // way, and neither fires while the closing rate can still be absorbed by the
  // gap before the follow distance (a time-to-contact gate, the bt filterBColl
  // idea: brake for a car you are actually going to hit, not one you are
  // catching).
  // Two gates, the larger wins. The ORIGINAL one fires on a closing rate above
  // the lift-only band (3 m/s permanent, 4.5 street) inside the gap lift can
  // still absorb. The TIME-TO-COLLISION one (Speed Dreams simplix: catch time
  // under 3 s AND the deceleration the gap demands above 5 m/s^2) catches the
  // slow creep the first misses — a 2.5 m/s closing rate a metre from the
  // follow distance needs 6 m/s^2 of braking NOW — and brakes in proportion to
  // what the gap needs (aReq / BRAKE), so a train brakes smoothly instead of a
  // car tapping the one ahead and then stamping on it.
  function queueBrake(speed, blockerSpeed, street, gap, follow, brakeRef) {
    const excess = (speed || 0) - (blockerSpeed || 0);
    const thresh = street ? 4.5 : 3;
    let lvl = 0;
    if (excess > thresh && !(gap != null && follow != null && gap > follow + excess * 1.2))
      lvl = clamp((excess - thresh) / (street ? 4 : 5), 0.2, 1);
    if (excess > 0.5 && gap != null && follow != null) {
      const room = Math.max(gap - follow, 0.5);
      const aReq = excess * excess / (2 * room);
      if (room / excess < 3 && aReq > 5) lvl = Math.max(lvl, clamp(aReq / (brakeRef || 22), 0.15, 1));
    }
    return lvl;
  }

  // NO MOVING UNDER BRAKING (FIA driving standards: no change of direction by
  // the defending car once the deceleration phase has begun, except to follow
  // the racing line). The window is the chaser within about a second behind;
  // eight metres is the floor so a slow corner still counts.
  function holdLineGap(speed) {
    return Math.max(8, speed || 0);
  }
  // ...and ONE defensive move per straight: the first pull fixes the side, a
  // pull the other way is a second change of direction and is refused. The
  // side resets when the braking zone begins — the next straight is new.
  function defendOnce(defend, side) {
    if (!defend) return { defend: 0, side };
    const sgn = defend > 0 ? 1 : -1;
    if (!side) return { defend, side: sgn };
    return sgn === side ? { defend, side } : { defend: 0, side };
  }

  // Metres of proactive lateral-sep bias. 2.6 m of yank is a wall on Monaco.
  function sepClamp(street) {
    return street ? 1.55 : 2.6;
  }

  function humanInvMass(street) {
    return street ? 0.42 : 0.5;
  }

  // Side-rub deceleration, m/s^2 — a FORCE, absolute like BRAKE (the offroad
  // block says why a scrub rate does not ride the pace scale). Bodywork on
  // bodywork costs little speed; wheels interlocking is the incident sim's job.
  // It replaced a proportional 0.5 %/frame (12 m/s^2 at 40 m/s, and applied per
  // relaxation pass, 48): the racecraft bench's alongside standoffs were pairs
  // sitting at the throttle-vs-scrub balance that rate produced.
  function rubDecel(street) {
    return street ? 3.5 : 3;
  }

  // Rear-end restitution by closing speed: 0 below 1 m/s (a resting contact —
  // Box2D's velocity threshold, so a car sitting on a bumper does not jitter
  // off it), 0.1 from 3 m/s up (crash reconstruction's floor for real cars at
  // speed), a ramp between. Zero to a tenth: bumps are near-inelastic.
  function bumpRestitution(relV) {
    const v = relV || 0;
    if (v <= 1) return 0;
    if (v >= 3) return 0.1;
    return 0.1 * (v - 1) / 2;
  }
  // Closing speed (m/s at PACE 1) above which the player's forward punt from a
  // rear-end stops growing. The AI behind pays its full share regardless.
  function humanPuntCap() { return 8; }

  // SQUEEZED: in contact, ours to yield, and no room on the side away from the
  // other car. A yielder that can move away does (the planner constraint); one
  // that cannot backs OUT — its pace ceiling drops under the other car's speed
  // until it is clear. Without this the rub being cheap (rubDecel) let AI pairs
  // grind along a barrier for seconds (racecraft bench: prolonged-contact pairs
  // 0 -> 4 on monaco once the old scrub stopped knocking the trailing car back).
  function squeezeEase(street) {
    return street ? 0.88 : 0.9;
  }
  // ...and a dab of brake with it: a vmax cap only stops the car accelerating,
  // and at 5 % under the other car it took three seconds to drop a car length —
  // the rub lasted that long (contact diagnostics, Lesmo). BRAKE x this.
  function squeezeBrake() { return 0.25; }

  function contactGive(contacting, t, street) {
    if (!contacting) return 1;
    const give = lerp(0.55, 0.25, t.awareness);
    return street ? give * 0.72 : give;
  }

  // Steer command low-pass. Experience = smoother; rookies twitch.
  function steerDamp(t) {
    return lerp(5.5, 12.5, t.experience);
  }

  // THE WELD, and it is two mechanisms locking each other. The queue cap
  // (`blocker.speed + clamp(gap - follow, -6, 8)`) goes NEGATIVE behind a car
  // that has stopped inside the follow distance, so an AI that caught a parked
  // player was commanded to a dead stop — and a stopped car has ZERO lateral
  // authority, because latFac scales with speed. It could neither drive past
  // nor steer around, so it sat welded to the player for the rest of the race.
  // Two floors break it: the queue never commands a standstill, and a car that
  // has been declared stuck may shuffle sideways at walking pace.
  //
  // Both are FLOORS ON THE AI'S OWN COMMAND, never on the car: the caller caps
  // the crawl at whatever vmax race control already granted, so a VSC or red
  // flag still stops the field.
  function queueFloor(street) {
    return street ? 2.5 : 3.5;
  }
  function unstuckLatFloor(street) {
    return street ? 0.10 : 0.16;
  }

  function unstuckPull(t, street) {
    const pull = lerp(3.4, 2.0, t.experience);
    return street ? pull * 0.55 : pull;
  }

  // Street circuits: awareness shrinks the overtake pull so they don't wall.
  // Floor 0.72 (was 0.55) so a clean gap still gets used after the seating fix.
  function streetOtScale(t) {
    return lerp(0.72, 1.0, t.awareness);
  }

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
    const house = houseMulCtx(ctx, 0.88, 1.12, "attack");
    const orders = ordersMul(ctx.team, ctx.seat, ctx.other, "ot");
    return clamp(0.55 * situ * craftMul * awareMul * expMul * house * orders, 0.08, 2.4);
  }

  // roll is the caller's simRnd() — only invoke when otArmed (short-circuit).
  function otShouldFire(roll, dt, ctx) {
    const rate = otFireRate(ctx);
    return roll < 1 - Math.exp(-rate * dt);
  }

  function wantBoost(ctx) {
    const energy = ctx.energy || 0;
    if (energy <= 0.02) return false;
    if (ctx.otActive) return true;                 // OT always deploys
    const kAhead = Math.abs(ctx.kAhead60 || 0);
    const straight = kAhead < 0.006;
    if (!straight) return false;
    const catching = !!(ctx.towCar && ctx.towGap < 28 && (ctx.speed || 0) >= (ctx.towSpeed || 0) - 1);
    const defending = !!(ctx.chaser && ctx.chaserGap < 14 && (ctx.chaserSpeed || 0) > (ctx.speed || 0) - 2);
    const hs = houseStyle(ctx.team, ctx.seat, ctx.stats);
    const dep = ctx.ersDeploy != null ? ctx.ersDeploy : 0.5;
    const regen = ctx.ersRegen != null ? ctx.ersRegen : 0.5;
    const rich = energy > (0.55 - hs.attack * 0.08 - (dep - 0.5) * 0.10);
    const desperate = energy > 0.25 && catching;
    const bank = ctx.traits.awareness > (0.8 - hs.hold * 0.08)
      && energy < (0.4 - hs.hold * 0.05 + (regen - 0.5) * 0.08) && !catching && !defending;
    if (bank) return false;
    return desperate || defending || rich || (energy > 0.25 && straight && ctx.traits.awareness < 0.55);
  }

  function wantX(ctx) {
    if (ctx && ctx.armed === false) return false;
    if (ctx && (ctx.catching || ctx.otActive)) return true;
    const hs = houseStyle(ctx && ctx.team, ctx && ctx.seat, ctx && ctx.stats);
    const energy = ctx && ctx.energy;
    if (energy == null) return true;
    return energy > (0.20 - hs.attack * 0.08);
  }

  function brakeTarget(ctx) {
    const t = ctx.traits;
    const samples = ctx.samples || [];
    const load = ctx.aeroLoad != null ? ctx.aeroLoad : 0.5;
    const latMax = (ctx.latMax || 22) * (1 + (load - 0.5) * 0.16);
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
    const hold = houseStyle(ctx.team, ctx.seat, ctx.stats).hold;
    if (hold) vLim *= 1 - hold * 0.025;
    // Craft late-brake when attacking with room: allow a few % over the limit.
    const attacking = !!(ctx.blocker && ctx.blockerGap < 16 && (ctx.speed || 0) > (ctx.blockerSpeed || 0) - 1);
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    if (attacking && room > 1.6) {
      vLim *= lerp(1.0, 1.07, t.craft) * houseMulCtx(ctx, 0.99, 1.03, "attack");
    }
    return vLim;
  }

  const _br = { braking: false, brakeLvl: 0, vLim: 0, excess: 0 };
  function brakeDecision(ctx) {
    const vLim = brakeTarget(ctx);
    const speed = ctx.speed || 0;
    const excess = speed - vLim;
    const d = (ctx.traits.consistency != null ? ctx.traits.consistency : 0.75) - 0.75;
    const soft = 1 - d * 0.8, full = 7 - d * 2;
    let brakeLvl = 0;
    let braking = false;
    if (excess > soft) {
      braking = true;
      brakeLvl = clamp((excess - soft) / (full - soft), 0.2, 1);
    }
    _br.braking = braking;
    _br.brakeLvl = brakeLvl;
    _br.vLim = vLim;
    _br.excess = excess;
    return _br;
  }

  // Nudge the preferred lane toward the freer side when traffic is dense, so
  // midfield trains slowly fan out. Slow on purpose — must not fight overtake.
  function adaptLane(lane, ctx, dt) {
    const dens = ctx.nearby || 0;
    if (dens < 2) return lane;
    const freer = (ctx.roomR || 0) - (ctx.roomL || 0);
    const minFree = ctx.street ? 1.35 : 0.9;
    if (Math.abs(freer) < minFree) return lane;
    const sign = freer > 0 ? 1 : -1;
    const destRoom = sign > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    if (ctx.street && destRoom < 1.7) return lane;
    // Awareness commits earlier; craft picks a more decisive bias.
    const step = lerp(0.08, 0.22, ctx.traits.craft) * lerp(0.7, 1.15, ctx.traits.awareness)
      * (ctx.street ? 0.55 : 1);
    const home = ctx.baseLane != null ? ctx.baseLane : lane;
    const target = clamp(home + sign * step, -0.85, 0.85);
    return damp(lane, target, 0.35, dt);
  }

  function otPull(ctx) {
    const street = !!ctx.street;
    const t = ctx.traits;
    const gap = ctx.blockerGap;
    if (gap >= (street ? 14 : 16)) return 0;
    // The old trigger was "I am ALREADY going faster than the car ahead", which
    // a queued car can never be: the queue cap holds it 6 m/s BELOW the
    // blocker's pace by construction, so the one car that most needs to pull
    // out was the one car that never did. A train therefore formed and stayed
    // formed — the "they just sit behind me" complaint. The incentive is the
    // car's FREE pace (vmax before the queue cap), the same comparison MOBIL
    // makes: would I be going faster if this car were not there?
    if (!otWant(ctx)) return 0;
    const side = otSide(ctx);
    const need = side > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    const house = houseMulCtx(ctx, 0.90, 1.12, "attack")
      * ordersMul(ctx.team, ctx.seat, ctx.other, "ot");
    if (street) {
      return side * lerp(0.7, 2.35, clamp(1 - gap / 14, 0, 1))
        * clamp(need / 2.3, 0, 1) * streetOtScale(t) * house;
    }
    return side * lerp(0.8, 2.6, clamp(1 - gap / 16, 0, 1))
      * clamp(need / 2.2, 0, 1) * lerp(0.75, 1.3, t.craft) * house;
  }

  // THE INCENTIVE, on PACE rather than on the blocker's speed this instant.
  // `held` used to compare our straight-line vmax with the blocker's live
  // speed — so it was TRUE in every corner and braking zone (where a pass
  // cannot complete) and FALSE at top speed on the straight (where it could),
  // then released, and on release the pull snapped to zero and the car
  // re-centred on the line it had just left. Inverted over the lap, with no
  // memory. Compare vmax with vmax (every car stashes _vmaxNow; a human's is
  // its live vmax too), and scale the margin with the top speed so OVERALL
  // SPEED does not turn a 7 % edge into a 14 % one at pace 0.5.
  function otWant(ctx) {
    const street = !!ctx.street;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const margin = (street ? 0.055 : 0.07) * ref;
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    // A car under ~12 % of the top speed is an OBSTACLE whatever its pace: the
    // follower behind it sits on the queue crawl floor, which is below the
    // closing margin, so neither test below could ever fire — measured as an
    // AI creeping at 3 m/s into the back of a parked player and welding there.
    // ...unless it is PULLING AWAY: at lights-out every car ahead is under that
    // speed for four seconds, and without the acceleration test the whole grid
    // latched a pass on the car ahead (measured: 21 of 22 at t=1). ~1.5 m/s^2
    // at PACE 1, scaled like everything else.
    const crawling = (ctx.blockerSpeed || 0) < 0.12 * ref && (ctx.blockerAccel || 0) < 0.016 * ref;
    const closing = (ctx.speed || 0) >= (ctx.blockerSpeed || 0) + margin;
    const held = (ctx.freeSpeed || 0) >= bv + margin;
    return crawling || closing || held;
  }

  // THE LAUNCH. Real lights-out is a reaction (a driver-dependent fraction of a
  // second) and a getaway that varies car to car; the model had neither, so a
  // 22-car field held its 8 m grid pitch for fifteen seconds and braked for T1
  // as one train (measured: median gap 8.0-8.6 m from t=1 to t=15, every speed
  // within 2 m/s of every other). The plan is drawn once per car per race from
  // a hash, NOT from simRnd(): the seeded stream's draw count is a contract.
  //   react — seconds after lights-out before the throttle goes down; awareness
  //           reads the lights, the roll is the day.
  //   grip  — the getaway's acceleration multiplier, fading to 1 over 3 s; craft
  //           and skill manage the wheelspin, the roll is the clutch bite.
  const _launch = { react: 0, grip: 1 };
  function launchPlan(t, roll) {
    const r = roll || 0, r2 = (r * 7919) % 1;
    _launch.react = clamp(lerp(0.52, 0.16, t.awareness) + (r - 0.5) * 0.22, 0.05, 0.75);
    const hands = 0.5 * t.craft + 0.5 * clamp((t.skill - 0.9) * 10, 0, 1);
    _launch.grip = clamp(lerp(0.80, 1.0, hands) + (r2 - 0.5) * 0.2, 0.7, 1.08);
    return { react: _launch.react, grip: _launch.grip };
  }
  const LAUNCH_FADE = 3;   // seconds over which the getaway becomes ordinary acceleration
  function launchMul(tSince, plan) {
    if (!plan) return 1;
    if (tSince < plan.react) return 0;
    return lerp(plan.grip, 1, clamp((tSince - plan.react) / LAUNCH_FADE, 0, 1));
  }
  function launchDone(tSince, plan) { return !plan || tSince > plan.react + LAUNCH_FADE; }

  // PACE PHASE. Two AI cars of equal pace ran in lockstep for a whole race:
  // identical vmax, identical acceleration, so the gap between them never
  // changed and neither ever had a reason to pass (the field spread and the
  // train counts in the racecraft bench). A driver's pace drifts over a stint —
  // tyres, traffic, focus — so each AI car carries a slow sinusoid on its vmax:
  // ±0.5 % for a metronome, ±1.6 % for a rookie, period 24-60 s, phase from the
  // same per-race hash as the launch. Zero-mean, so lap times keep their centre;
  // AI-only, so nothing here reaches the driver.
  function pacePhase(t, consistency, roll) {
    const r = roll || 0;
    const amp = lerp(0.016, 0.005, consistency == null ? 0.75 : consistency);
    const period = 24 + r * 36;
    return 1 + amp * Math.sin((t || 0) * (2 * Math.PI / period) + r * 6 * Math.PI);
  }

  // A PASS IS A POSITION, NOT A BIAS. otPull's return is a lateral offset
  // added to the follower's OWN target line — and the car it is passing sits
  // on ITS target line, which for two grid neighbours is half a metre away.
  // So a full 2.0-2.5 m pull landed the follower 2.0 ± 0.7 m from the blocker:
  // straddling the 2.2 m edge of the box that DEFINES a blocker. Inside it,
  // still queue-capped; at the edge the classification flickered, the pull
  // snapped to zero, the car re-centred and was queued again. Measured on
  // monaco: |dx| held at 2.16-2.23 and crossed 2.2 eighty-eight times in one
  // 43 s dwell behind a car 14 % slower. The pursuer never committed because
  // its incentive was a function of the very thing the pass changes.
  //
  // passTarget returns the ABSOLUTE lateral the pass wants — the passed car's
  // x plus one clear lane on the chosen side — so game.js can express the
  // pull as (target − targetX) and the box edge stops mattering. CLEAR is the
  // same minLatGap the proactive separation pushes toward, so the two never
  // fight over the last half metre.
  function passTarget(passX, side, clear, hw) {
    const lim = (hw || 5) - 0.6;
    return clamp(passX + side * clear, -lim, lim);
  }
  // How long a committed pass is held without gaining ground before the car
  // gives it up (patience), and how long it then waits before trying the same
  // car again (the bt LAP_BACK_TIME_PENALTY shape, scaled to a same-lap fight).
  // Craft commits longer; experience retries sooner. Both are per-car, which is
  // also what stops twenty cars deciding the same thing on the same frame.
  function passHold(t) {
    return lerp(2.4, 4.2, t.craft);
  }
  function passCooldown(t) {
    return lerp(3.5, 1.8, t.experience);
  }

  // SIDE RUB: WHO YIELDS. Two cars alongside used to get identical treatment —
  // sepShares splits the push 50/50 for AI-AI, contactGive cut BOTH cars'
  // steering authority to 0.25-0.55, and rubScrub bled BOTH by 0.5 %/frame.
  // Nobody had priority, so both computed the mirror answer every frame and
  // the pair sank to the speed where throttle and scrub balance — 17.4 m/s at
  // vmax 70 (closed form; measured standoffs sat at 15-24). The car BEHIND on
  // arc yields (it is the one overlapping); dead level, the car further from
  // the centreline yields, which on a corner is the outside car — bt's
  // filterSColl and usr's asymmetric side margin both give the inside car the
  // road. Deterministic, so the symmetry is broken on frame one.
  // "Behind" is LESS THAN HALF ALONGSIDE, not "half a metre back". The old ±0.5 m
  // band made a car 0.6 m back — 87 % of a 4.8 m car alongside — the one that
  // yields, which is how a player rubbing wheels with an AI a bumper ahead was
  // scrubbed to a crawl. Racing's own rule (the FIA driving standards' "a
  // significant portion alongside" — front axle past the other car's mirror) is
  // half a car: inside that, both must leave room, so the OUTER car concedes.
  const SIDE_LEVEL = 2.4;
  function sideYieldsA(dProg, xA, xB) {
    if (dProg < -SIDE_LEVEL) return true;        // A is behind B
    if (dProg > SIDE_LEVEL) return false;        // A is ahead
    return Math.abs(xA) >= Math.abs(xB);         // level: the outer car concedes
  }

  function defendPull(ctx) {
    if (ctx.blocker || !ctx.chaser || (ctx.chaserGap || 99) >= 12) return 0;
    if ((ctx.chaserSpeed || 0) <= (ctx.speed || 0) - 3) return 0;
    const kA = ctx.kA || 0;
    if (Math.abs(kA) <= 0.004) return 0;
    const coverSide = -Math.sign(kA);
    const coverRoom = coverSide > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    if (ctx.street && coverRoom < 2.2) return 0;
    const mag = lerp(0.2, 1.1, ctx.traits.craft)
      * clamp(1 - ctx.chaserGap / 12, 0, 1) * clamp(coverRoom / 2, 0, 1)
      * houseMulCtx(ctx, 0.90, 1.12, "hold")
      * ordersMul(ctx.team, ctx.seat, ctx.other, "defend");
    return coverSide * (ctx.street ? mag * 0.45 : mag);
  }

  function wallHitLoss(street) {
    return street ? 0.30 : 0.28;
  }

  // Steer-into-wall scrub (m/s²). Streets 40→26→20; permanents 16.
  function wallSteerScrub(street) {
    return street ? 20 : 16;
  }

  // AI has no heading slide; this is the clamp-frame speed scrub.
  function wallAiScrub(street) {
    return street ? 12 : 12;
  }

  // CONTACT IS NOT CONFINEMENT. `contactT > 0 => boxed` used to be the first
  // line here, so ANY rub — including a clean side-by-side on a 15 m-wide
  // permanent — declared the car wedged. Boxed feeds stuckT, which feeds
  // unstuckActive, which cancels braking and yanks the car sideways; a driver
  // leaning on an AI therefore switched it into dig-out mode while it still had
  // a whole lane free. Contact now only counts when the room is already gone,
  // which is the state the flag was named for.
  function isBoxed(ctx) {
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    if (roomL < 1.3 && roomR < 1.3) return true;
    if ((ctx.contactT || 0) > 0 && roomL < 1.6 && roomR < 1.6) return true;
    if (!(ctx.blocker && ctx.blockerGap < 6)) return false;
    if (ctx.street) return roomL < 1.8 && roomR < 1.8;
    return true;
  }

  // How long an AI must sit slow before the rescue unwedges it. Contact used to
  // VETO the rescue outright (`contactT === 0` in the aiStuck conjunction), so
  // the commonest way to be genuinely stuck — welded to another car — was the
  // one case that could never recover. It is a patience knob now, not a veto:
  // a pack shuffle clears long before the contact timer elapses.
  function aiRescueDelay(contacting) {
    return contacting ? 7 : 4;
  }

  // Which way to go around a blocker. `roomR >= roomL ? 1 : -1` was the whole
  // rule, and behind a car holding the racing line the two sides are equal — so
  // every pursuer picked RIGHT, single file, and the queue never split. A clear
  // difference still wins; a tie breaks toward the inside of the next corner
  // (where the pass completes), then toward the car's own lane so a pack fans
  // out both ways instead of stacking. Same tiebreak shape as unstuckSide.
  function otSide(ctx) {
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    const diff = roomR - roomL;
    if (Math.abs(diff) >= 0.6) return diff > 0 ? 1 : -1;
    const kA = ctx.kAhead || 0;
    if (Math.abs(kA) > 0.002) return kA > 0 ? -1 : 1;   // inside = -sign(k)
    const lane = ctx.lane || 0;
    if (Math.abs(lane) > 0.05) return lane > 0 ? 1 : -1;
    return diff >= 0 ? 1 : -1;
  }

  // LET PASS. A car that is faster, right behind, and not held up by anything
  // ahead of us is going past whatever we do; fighting it just wastes both
  // laps and is where the "AI welded to my bumper" pile-ups start. After a
  // patience window (awareness commits earlier) the AI moves toward its free
  // side and stops accelerating away — TORCS' OPP_LETPASS, minus the blue flag.
  function letPassDelay(t) {
    return lerp(4.2, 1.8, t.awareness);
  }
  // Lateral metres of yield, bounded by the room the caller gates on
  // (freeRoom > 1.6) so it can never ask for more lane than was just checked;
  // the caller scales it by that room too, the same shape otPull uses.
  function letPassPull(t, street) {
    const pull = lerp(0.9, 1.5, t.experience);
    return street ? pull * 0.5 : pull;
  }
  function letPassEase(t) {
    return lerp(0.965, 0.99, t.experience);
  }

  function minLatGap(hw, street) {
    if (!street) return 2.8;
    return clamp((hw || 5) * 0.44, 2.12, 2.45);
  }

  function racingLineMix(street, hold) {
    const base = street ? 0.32 : 0.55;
    return hold ? clamp(base - hold * 0.08, 0.22, 0.62) : base;
  }

  try { Log.info("game", "AiDrive ready"); } catch (_) { /* Log absent in isolated VM */ }
  return {
    traits, houseStyle, isMate, ordersMul, stuckThreshold, followPad, followBase, towGain, queueBrake, sepClamp,
    humanInvMass, contactGive, steerDamp, unstuckPull, streetOtScale, otFireRate,
    otShouldFire, wantBoost, wantX, brakeTarget, brakeDecision, adaptLane, otPull,
    defendPull, isBoxed, minLatGap, racingLineMix, wallHitLoss, wallSteerScrub,
    wallAiScrub, beginLook, pushLook, endLook, aiRescueDelay, otSide,
    letPassDelay, letPassPull, letPassEase, queueFloor, unstuckLatFloor,
    otWant, passTarget, passHold, passCooldown, sideYieldsA,
    launchPlan, launchMul, launchDone, pacePhase, rubDecel, bumpRestitution, humanPuntCap, squeezeEase, squeezeBrake,
    holdLineGap, defendOnce,
  };
})();
