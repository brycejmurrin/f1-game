/* Apex 26 — AI DRIVE: situation-aware decisions for the kinematic AI field. Extracted from js/game.js so the racecraft axes (craft / awareness / experience) and t… */
const AiDrive = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));

  // ratings on the car (0..1), with a mid-grid default
  // Reused scratch — same contract as game.js pairContact/_ct. Callers must
  // read fields before the next traits() call (updateCar does; tests do).
  // aggression / optimism are signed style traits (−1..+1), default neutral.
  const _traits = {
    craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75,
    aggression: 0, optimism: 0,
  };
  function traits(c) {
    _traits.craft = c.craft != null ? c.craft : 0.75;
    _traits.awareness = c.awareness != null ? c.awareness : 0.75;
    _traits.experience = c.experience != null ? c.experience : 0.75;
    _traits.skill = c.skill != null ? c.skill : 0.97;
    _traits.consistency = c.consistency != null ? c.consistency : 0.75;
    _traits.aggression = c.aggression != null ? c.aggression : 0;
    _traits.optimism = c.optimism != null ? c.optimism : 0;
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

  function followBase(street) {
    return street ? 8 : 6;
  }

  // THE FOLLOW GAP IS A TIME — IDM's s0 + v·T. It was metres: followBase plus
  // an awareness pad of -0.8..+2.2 m, which at 80 m/s is a tenth of a second,
  // so every follower sat in the gearbox of the car ahead and the field ran as
  // trains no move could start from (ai-tactics, 2026-10-01: lap 1 with 85 %
  // of intervals under 1 s and trains of 12). s0 is the old base; T is
  // lerp(0.15, 0.30, awareness) s, scaled by house hold and team orders as the
  // pad was, and streets take 0.8 of it (low speeds; the old street pad was
  // halved). `tight` (0..1) shrinks T toward FOLLOW_TIGHT — a pass latched or
  // armed, or a tow on a straight: closing up is the point there — and
  // `extra` adds seconds (getting a run, the first lap). Capped at FOLLOW_MAX
  // so a car at the gap still feels the wake (TOW_RANGE 34 m faded over 28:
  // a fifth of the tow at 28 m).
  // MEASURED, NOT GUESSED (ai-tactics, silverstone, 2026-10-01): the first cut,
  // T 0.25-0.45 s tightening to 0.12 s, cost a third of the settled passes
  // (128 -> 83) and the conversion (19.9 -> 17.2 %) — a car 0.4 s back at the
  // corner exit is out of the tow for the straight that follows. 0.15-0.30 s
  // tightening to 0.05 s kept the passes (120) and raised the conversion (23.7 %)
  // with the contact, side-by-side and swap-back gains intact.
  const FOLLOW_TIGHT = 0.05, FOLLOW_MAX = 28;
  function followTime(t, street, team, seat, other, stats) {
    return lerp(0.15, 0.30, t.awareness) * houseMul(team, 0.92, 1.08, "hold", seat, stats)
      * ordersMul(team, seat, other, "follow");
  }
  // STREET CIRCUITS KEEP THE METRE GAP (2026-10-01): followBase 8 m plus the old
  // awareness pad (-0.4..+1.1 m), and only `extra` (the first lap) as time. At
  // monaco speeds the old gap IS ~0.25 s, and every headway tried there cost
  // passes the narrow zones cannot spare: ai-tactics, 5 seeds x 8 laps, settled
  // passes 48 base -> 33 with the time headway, 50 with this (conversion 4.8 %
  // both); docs/notes/AI-FIELD-RESEARCH.md has the street ablation.
  function followGap(t, street, speed, tight, team, seat, other, stats, extra) {
    const v = Math.max(speed || 0, 0);
    if (street) {
      return followBase(true) + lerp(-0.8, 2.2, t.awareness) * houseMul(team, 0.92, 1.08, "hold", seat, stats)
        * 0.5 * ordersMul(team, seat, other, "follow") + v * (extra || 0);
    }
    const T = lerp(followTime(t, street, team, seat, other, stats), FOLLOW_TIGHT, clamp(tight || 0, 0, 1)) + (extra || 0);
    return Math.min(followBase(street) + v * T, FOLLOW_MAX);
  }

  // Slipstream vmax gain. Streets get a half-size tow: with none, the 8 m train
  // can never close, and half still fits inside the follow cap.
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
  // `vScale` is vTop()/VMAX: the closing-rate bands (m/s) and the gap-demanded
  // deceleration (m/s^2, which PACE scales exactly as it scales speed) are
  // written on the pace-5 scale, so a bare literal shrank at every other pace.
  // (room / excess is a TIME and stays as written.)
  function queueBrake(speed, blockerSpeed, street, gap, follow, brakeRef, vScale) {
    const vs = vScale > 0 ? vScale : 1;
    const excess = (speed || 0) - (blockerSpeed || 0);
    const thresh = (street ? 4.5 : 3) * vs;
    let lvl = 0;
    if (excess > thresh && !(gap != null && follow != null && gap > follow + excess * 1.2))
      lvl = clamp((excess - thresh) / ((street ? 4 : 5) * vs), 0.2, 1);
    if (excess > 0.5 * vs && gap != null && follow != null) {
      const room = Math.max(gap - follow, 0.5);
      const aReq = excess * excess / (2 * room);
      if (room / excess < 3 && aReq > 5 * vs) lvl = Math.max(lvl, clamp(aReq / (brakeRef || 22), 0.15, 1));
    }
    // INSIDE the follow distance and still closing: a light brake sized to the
    // closing rate and to how deep inside we are. A small excess reaches
    // neither gate above — +1.5 m/s is under the +3 threshold, and with `room`
    // floored at 0.5 m its aReq is 2.25, under the 5 the creep gate asks — so
    // it was carried into the car ahead's tail: tools/check/ai-human.mjs
    // measured rear-ends on a player 3 % under the field's pace at 4.7-4.9 m
    // of arc, the car length. The vmax cap alone cannot do this: it lowers the
    // TARGET, and a car coasting toward a lower target loses 1.5 m/s in the
    // time it takes to close the last five metres.
    if (gap != null && follow != null && gap < follow && excess > 0.3 * vs) {
      lvl = Math.max(lvl, clamp(0.12 + (excess / (3 * vs)) * (1 - gap / follow), 0.12, 0.6));
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
  // Writes into `out` (module scratch when omitted — per-AI per-step, so no
  // allocation) and returns it.
  const _defOnce = { defend: 0, side: 0 };
  function defendOnce(defend, side, out) {
    const o = out || _defOnce;
    const sgn = defend > 0 ? 1 : (defend < 0 ? -1 : 0);
    if (!defend) { o.defend = 0; o.side = side; }
    else if (!side) { o.defend = defend; o.side = sgn; }
    else { o.defend = sgn === side ? defend : 0; o.side = side; }
    return o;
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
  // 0 -> 4 on monaco once the scrub no longer knocked the trailing car back).
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
  // …and NEITHER FLOOR APPLIES ON THE PIT LANE, where the gap below is held
  // instead. A queue in the lane is the one place the AI should be able to come
  // to a complete REST: the floors exist so a car declared stuck can shuffle
  // out of trouble, and a car on the lane rail has nowhere to shuffle to and
  // nothing to gain by closing. Held at a CAR LENGTH PLUS clear air rather than
  // the racing follow distance (6 m between 4.8 m cars is a metre of air, which
  // at pit speed is a tailgate): measured on a 20-lap Bahrain with 19 stops,
  // the lane's closest pair was 1.52 m and 427 of 8702 lane ticks had a pair
  // inside a car length.
  function laneFollow() { return 9; }
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
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;   // closing rates ride the pace scale (as otWant)
    // 0..1 pieces
    const gapScore = clamp(1 - (gap || 9) / 9, 0, 1);           // closer = better
    const roomScore = clamp(room / 3.2, 0, 1);
    const closeScore = clamp(0.45 + closing / (8 * ref / 72), 0, 1);
    const straight = clamp(1 - Math.abs(ctx.kAhead || 0) / 0.012, 0, 1);
    const situ = (0.34 * gapScore + 0.28 * roomScore + 0.22 * closeScore + 0.16 * straight)
      * (ctx.street ? streetOtScale(t) : 1);
    // Mid-open window lands ~0.3–0.6 (unit-tested band), not a fixed λ.
    const craftMul = lerp(0.45, 1.55, t.craft);
    const awareMul = lerp(1.25, 0.7, t.awareness);     // careful = slower to pull the trigger
    const expMul = lerp(0.75, 1.15, t.experience);      // rookies hesitate
    // Aggression (Slice 3 fire half): ±35 % around the craft/awareness window.
    // Spacing half (followTime / contactGive) stays out — stuck/bunching workstream.
    const aggrMul = 1 + clamp(t.aggression != null ? t.aggression : 0, -1, 1) * 0.22;
    const house = houseMulCtx(ctx, 0.88, 1.12, "attack");
    const orders = ordersMul(ctx.team, ctx.seat, ctx.other, "ot");
    return clamp(0.55 * situ * craftMul * awareMul * expMul * aggrMul * house * orders, 0.08, 2.4);
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

  // One feasible lateral envelope for the planner and the kinematic actuator.
  // speed is in world m/s; pace removes the ground-speed scale.
  //
  // THE SAME WINGS AS THE PLAYER. The player's grip RISES by DOWNFORCE (65 %)
  // from 20 m/s to the top speed (game.js aeroGrip); an AI envelope that does
  // not gives a player roughly twice the lateral grip at 60 m/s and every fast
  // corner a free second. Aero on the PLANNER alone fails too — the actuator
  // cannot turn at the speeds it plans (docs/notes/AI-FIELD-RESEARCH.md) — so
  // both share one function: planner (cornerSpeed
  // inverts this exactly) and actuator (game.js gripScale / yaw cap) read the
  // one curve, so they rise together. The player's PLAYER_GRIP forgiveness
  // headroom is NOT copied — the AI gets the car's aero, not the assist.
  const AI_DF = 0.65;   // PhysicsConsts.DOWNFORCE (not bound here: unit VMs load this file alone)
  // `aero` scales the wing term. The heading controller's YAW budget is the
  // exception that does not get the wings (yawScale below): it is how quickly
  // a lane change may bend the nose, a smoothness budget rather than grip, and
  // letting it rise with downforce took the solo-lap lateral-jerk figure in
  // ai-racecraft-vm from 5.9 to 8.1 m/s² (cap 7.5) — twitchier lane changes on
  // every straight for no corner speed at all.
  function lateralScale(speed, load = 0.5, grip = 1, pace = 1, vmax = 72, aero = 1) {
    const q = Math.min(1, Math.abs(speed) / (Math.max(0.05, pace) * Math.max(1, vmax)));
    return (1 + (load - 0.5) * 0.16) * Math.max(0.01, grip) * (1 + AI_DF * aero * q * q);
  }
  // The yaw budget keeps the OLD high-speed taper (1 - 0.28 at the top speed,
  // here as its quadratic twin) so the heading controller is exactly as calm
  // as it was measured to be.
  const YAW_AERO = -0.28 / AI_DF;
  function yawScale(speed, load, grip, pace, vmax) { return lateralScale(speed, load, grip, pace, vmax, YAW_AERO); }
  // Solve k*v² = lat*(1 + D*(v/V)²) analytically: v² = lat / (k - lat*D/V²)
  // below the top speed V, and the flat (1 + D) envelope past it.
  // No iterative solver in the per-car, per-node brake lookahead.
  function cornerSpeed(k, lat, pace = 1, vmax = 72) {
    const V = Math.max(0.05, pace) * Math.max(1, vmax), kk = Math.max(k, 1e-5), L = Math.max(0, lat);
    return cornerSpeedEnvelope(kk, L, V, V * V);
  }
  function cornerSpeedEnvelope(kk, L, V, vSq) {
    const den = kk - L * AI_DF / vSq;
    if (den > 0) {
      const v = Math.sqrt(L / den);
      if (v <= V) return v;
    }
    return Math.sqrt(L * (1 + AI_DF) / kk);
  }

  function brakeTarget(ctx) {
    const t = ctx.traits;
    const samples = ctx.samples || [];
    const load = ctx.aeroLoad != null ? ctx.aeroLoad : 0.5;
    const latMax = (ctx.latMax || 22) * (1 + (load - 0.5) * 0.16);
    const brake = ctx.brake || 22;
    const grip = ctx.grip || 1;
    const skill = t.skill;
    // The aero speed envelope is shared by every lookahead node this tick.
    // Keep the same solve as cornerSpeed without reclamping pace/vmax per node.
    const V = Math.max(0.05, ctx.pace === undefined ? 1 : ctx.pace)
      * Math.max(1, ctx.vmax === undefined ? 72 : ctx.vmax), vSq = V * V;
    let vLimSq = Infinity, bVC = 0, bD = 1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const k = Math.max(Math.abs(s.k || 0), 1e-5);
      const bankMu = 1 + Math.sin(s.bank || 0) * 0.8;
      const vC = cornerSpeedEnvelope(k, Math.max(0, latMax * bankMu * grip), V, vSq) * skill * (ctx.diffCorner || 1);
      // Distance budget: can scrub ~0.85·BRAKE over d metres (arcade, not perfect).
      const d = Math.max(s.d || 0, 1);
      const entrySq = vC * vC + 2 * brake * 0.85 * d;
      if (entrySq >= 0 && entrySq < vLimSq) { vLimSq = entrySq; bVC = vC; bD = d; }
    }
    // sqrt is monotonic: choose the tightest entry budget before taking it.
    // The tightest sample remains independent of sample order.
    let vLim = Math.sqrt(vLimSq);
    if (!Number.isFinite(vLim)) vLim = 1e6;
    const vLimRaw = vLim;
    const hold = houseStyle(ctx.team, ctx.seat, ctx.stats).hold;
    if (hold) vLim *= 1 - hold * 0.025;
    // Craft late-brake when attacking with room: allow a few % over the limit.
    const attacking = !!(ctx.blocker && ctx.blockerGap < 16 && (ctx.speed || 0) > (ctx.blockerSpeed || 0) - 1);
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    if (attacking && room > 1.6) {
      vLim *= lerp(1.0, 1.07, t.craft) * houseMulCtx(ctx, 0.99, 1.03, "attack");
    }
    // Optimism (Slice 3): over-confidence carries a little more speed into the
    // marker. Signed, zero-mean across the grid — not a top-speed product term.
    // Kept small (±1.2 %): a 3 % always-on term moved field median >1 % despite
    // zero-mean (nonlinear with who sits at the median).
    const opt = clamp(t.optimism != null ? t.optimism : 0, -1, 1);
    if (opt) vLim *= 1 + opt * 0.012;
    if (ctx.errMul) vLim *= ctx.errMul;   // a missed braking point (mistakeBrakeMul)
    // The BINDING sample, for brakeDecision's feed-forward: its corner speed
    // carries the same style/attack/optimism/error scale as the entry budget.
    _bind.vC = bVC * (vLimRaw > 0 && vLimRaw < 1e6 ? vLim / vLimRaw : 1); _bind.d = bD;
    return vLim;
  }
  const _bind = { vC: 0, d: 1 };

  const _br = { braking: false, brakeLvl: 0, vLim: 0, excess: 0, ff: 0 };
  function brakeDecision(ctx) {
    const vLim = brakeTarget(ctx);
    const speed = ctx.speed || 0;
    const excess = speed - vLim;
    // PACE is a ground-speed scale. Compare the overspeed on the standard
    // scale, otherwise the same speedometer error receives a different pedal at
    // every OVERALL SPEED setting (and at low pace may receive no brake at all).
    const pace = Math.max(0.05, Number.isFinite(ctx.pace) ? ctx.pace : 1);
    const excessStd = excess / pace;
    const d = (ctx.traits.consistency != null ? ctx.traits.consistency : 0.75) - 0.75;
    const soft = 1 - d * 0.8, full = 7 - d * 2;
    let brakeLvl = 0, ff = 0;
    let braking = false;
    if (excessStd > soft) {
      braking = true;
      // FEED-FORWARD + P trim (verify-physics #3, 2026-10-04). The planner
      // budgets 0.85·brake of deceleration, but a pure P band reaches pedal
      // 0.85 only at ~6 m/s of standing overspeed, so the AI arrived 12-41 %
      // above its own planned corner speed (VM, monza) and braked into the
      // apex. aNeed is the deceleration that lands the binding sample's speed
      // at its distance — on the envelope it IS 0.85·brake — and scale-free
      // against the executor (game.js decelerates at brake·brakeLvl).
      const brake = ctx.brake || 22, vC = _bind.vC, d = Math.max(_bind.d, 1);
      ff = Math.max(0, (speed * speed - vC * vC) / (2 * d * brake));
      brakeLvl = clamp(ff + (excessStd - soft) / (full - soft), 0.2, 1);
    }
    _br.braking = braking;
    _br.brakeLvl = brakeLvl;
    _br.vLim = vLim;
    _br.excess = excess;
    _br.ff = ff;
    return _br;
  }

  // Nudge the preferred lane toward the freer side when traffic is dense, so
  // midfield trains slowly fan out. Slow on purpose — must not fight overtake.
  // On streets, a one-car nose-to-tail also fans once queue pressure builds —
  // wall-lined packs otherwise lock on the racing line (monaco T1). Permanents
  // keep the dens≥2 gate: queue-pressure fan there thrashed monza oscillation.
  function adaptLane(lane, ctx, dt) {
    const dens = ctx.nearby || 0;
    if (dens < 2 && !(ctx.street && queuePress(ctx) >= 0.5)) return lane;
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
  // Comparing our straight-line vmax with the blocker's live speed is TRUE in
  // every corner and braking zone (where a pass cannot complete) and FALSE at
  // top speed on the straight (where it could) — inverted over the lap, and on
  // release the car re-centres on the line it just left. Compare vmax with vmax (every car stashes _vmaxNow; a human's is
  // its live vmax too), and scale the margin with the top speed so OVERALL
  // SPEED does not turn a 7 % edge into a 14 % one at pace 0.5.
  function otWant(ctx) {
    const street = !!ctx.street;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    // QUEUE PRESSURE lowers the bar: a car held behind the same car for its
    // patience window will take a 2 % edge (the tow alone is 4.5 %), not 7 %.
    // Aggression shrinks the pace edge needed to want the move (fire half).
    const aggr = clamp(ctx.traits && ctx.traits.aggression != null ? ctx.traits.aggression : 0, -1, 1);
    const margin = (street ? 0.055 : 0.07) * ref * lerp(1, 0.3, queuePress(ctx))
      * lerp(1.10, 0.88, (aggr + 1) * 0.5);
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
    // Impatient equal-pace: full queue pressure AND a clear side to go into.
    // Without the room gate every held car lunged and aborted (monza osc↑).
    // With it, packs that would sit forever behind an equal-pace car can split.
    const press = queuePress(ctx);
    const clear = Math.max(ctx.roomL || 0, ctx.roomR || 0) >= (street ? 2.2 : 2.8);
    const impatient = press >= 1 && clear && (ctx.freeSpeed || 0) + 0.005 * ref >= bv;
    return crawling || closing || held || impatient;
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

  // THE FIRST LAP IS NOT THE RACE. Off a standing start the whole field
  // arrived at turn 1 as one train (ai-tactics, 2026-10-01: lap 1 with 85 % of
  // intervals under a second, trains of 12, and the most contact of the race)
  // and attacked into it as if it were lap 20. A launching car — and for
  // START_CALM s from the green — leaves START_GAP_T s more headway and
  // attacks at START_ATTACK of the quality (attackOK); calm fades over the
  // last 8 s and nothing changes after. `until` is game.js's c.calmUntil,
  // set when the launch ends, so a car placed at speed (a test rig, a rolling
  // start) never had a launch and is never calm.
  const START_CALM = 20, START_GAP_T = 0.2, START_ATTACK = 0.5;
  function startCalm(launching, until, t) {
    if (launching) return 1;
    return until > t ? clamp((until - t) / 8, 0, 1) : 0;
  }
  function startCalmS() { return START_CALM; }
  function startGapT(calm) { return START_GAP_T * (calm || 0); }

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
  // IS THE PASS LANE STILL REACHABLE? Dropping the latch whenever less than a
  // car width (WCAR) of road is left beyond the passing car — checked every
  // frame, INCLUDING after it arrives in the lane (passTarget allows 0.6 m from
  // the edge) — cancels an outside pass the moment it gets there: on monza that
  // ended 73-105 of ~180 pass attempts per 240 s against ~20 completions, each
  // dropping the car back into the queue (the clump). The side is closed only when the room left is less than the
  // distance still to travel (`need`, capped at a car width), with 0.1 m of slack.
  function passSideClosed(sideRoom, need, wcar) {
    return sideRoom < Math.min(wcar || 2, Math.max(0, need || 0)) - 0.1;
  }
  // How long a committed pass is held without gaining ground before the car
  // gives it up (patience), and how long it then waits before trying the same
  // car again (the bt LAP_BACK_TIME_PENALTY shape, scaled to a same-lap fight).
  // Craft commits longer; experience retries sooner. Both are per-car, which is
  // also what stops twenty cars deciding the same thing on the same frame.
  function passHold(t) {
    // Aggression commits a touch longer once the move is on (attacker patience).
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    return lerp(2.4, 4.2, t.craft) * (1 + aggr * 0.12);
  }
  function passCooldown(t) {
    return lerp(3.5, 1.8, t.experience);
  }
  // THE RE-PASS LOCKOUT, scaled by the pace edge. A car just passed may not
  // attack the car that passed it for twice its cooldown — the same
  // "threshold endured" game.js gives an abandoned pass — unless it has the
  // pace to: `edge` is (its pace - the passer's) / the top speed, and a 6 %
  // edge (a car only passed on a tow or a mistake) cuts the lockout to 30 %.
  // 42-61 % of the field's order flips were the SAME pair swapping straight
  // back (ai-tactics swapBackPct, 2026-10-01): hysteresis on the overtake
  // state, Game AI Pro ch.38.
  function repassLock(t, edge) {
    return 2 * passCooldown(t) * clamp(1 - (edge || 0) / 0.06, 0.3, 1);
  }

  // A PER-ATTEMPT ROLL. attackOK's roll was c.phaseRoll — drawn once per car
  // per race, so a car that drew low was timid in every attack it ever
  // considered. Each braking zone (key = the turn-in's metre) on each lap is
  // a fresh attempt now: an integer hash of the car's race hash, the lap and
  // the zone — deterministic and seeded, never a simRnd() draw.
  function attemptRoll(hash, lap, key) {
    let h = ((hash | 0) ^ Math.imul(lap | 0, 0x9e3779b1) ^ Math.imul(key | 0, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // GET A RUN. Through the corner that leads onto a passing straight (the
  // next zone's quality `qNext` >= 0.4), a follower that wants the move hangs
  // back RUN_T s more: out of the dirty air it carries its own corner speed
  // and exits with a run instead of exiting in the gearbox of the car ahead.
  // On the straight it closes in the tow (followGap's tight term) and pulls
  // out LATE (latchLate): far from the braking zone it waits for a real
  // closing rate or a short gap, so the slingshot is used, not spent early.
  const RUN_T = 0.15;
  // Permanent circuits only, like latchLate, the side bonus and the lane
  // look-ahead: on a street every one of them cost monaco passes (the street
  // ablation, docs/notes/AI-FIELD-RESEARCH.md 2026-10-01).
  function runExtra(kHere, qNext, want, street) {
    return !street && want && Math.abs(kHere || 0) > 0.004 && qNext >= 0.4 ? RUN_T : 0;
  }
  // "On the gearbox" is the tight follow gap (FOLLOW_TIGHT) plus a little. A
  // car held for its whole patience goes anyway: at racing speed two cars
  // accelerate alike, so a 4 % car may never close the last metres in the tow
  // (measured: requiring it, a 4 % faster car never passed in 50 s at monza).
  function latchLate(ctx) {
    if (ctx.street) return true;
    if (!(ctx.toTurnIn > 150) || Math.abs(ctx.kAhead || 0) > 0.004) return true;   // the zone is near, or not a straight
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    if ((ctx.blockerSpeed || 0) < 0.12 * ref || queuePress(ctx) >= 1) return true;
    return (ctx.speed || 0) - (ctx.blockerSpeed || 0) >= 0.015 * ref
      || (ctx.blockerGap || 0) <= 6 + (FOLLOW_TIGHT + 0.03) * (ctx.speed || 0);
  }
  // THE NEXT CORNER'S DIRECTION: the curvature with the largest magnitude of
  // three samples into it (10 / 30 / 55 m past the turn-in). One sample just
  // past the turn-in read a near-zero entry spiral on long corners (monza's
  // Lesmo approach read 0.0003 where the corner runs at 0.014).
  function cornerK(k1, k2, k3) {
    let k = k1 || 0;
    if (Math.abs(k2 || 0) > Math.abs(k)) k = k2;
    if (Math.abs(k3 || 0) > Math.abs(k)) k = k3;
    return k;
  }

  // COMMIT OR YIELD. A side-by-side the rule has decided (sideYieldsA) was
  // still left to geometry: the yielder only kept a lane's gap, so a pair ran
  // alongside for seconds (ai-tactics: p90 5 s, max 20-25 s) and half of the
  // fights never changed the order. Past SBS_COMMIT s alongside as the
  // yielder, a car that is not clearly the faster lifts to SBS_EASE of the
  // other's speed and tucks in behind.
  function sbsCommitT() { return 2; }
  function sbsEase() { return 0.97; }

  // SIDE RUB: WHO YIELDS. Identical treatment of two cars alongside (sepShares
  // 50/50, contactGive cutting BOTH to 0.25-0.55, rubScrub bleeding BOTH by
  // 0.5 %/frame) gives nobody priority: both compute the mirror answer every
  // frame and the pair sinks to the speed where throttle and scrub balance —
  // 17.4 m/s at vmax 70 (closed form; measured standoffs 15-24). The car BEHIND on
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
  // IS THE MOVE ON? A pass is engaged only where it is deliberate: on a straight
  // (base quality 0.6 — a straight with a tow is always a place to pass), or in
  // an attack zone at the zone's baked quality (TrackLine.attackAt: straight
  // length x width). The utility is that quality times how hard we are closing,
  // scaled by craft (a good racer sees a move where a rookie does not) and a
  // per-car roll — Game AI Pro's "not every opportunity should be taken, and
  // randomness or a biorhythm trait should contribute". Below the threshold the
  // car shadows the one ahead (otPull) and waits for a better place. Measured
  // before: monza 3.7 sticking passes per field lap early in a race with a
  // third of all passes flipping straight back; monaco 1.3 (the real Monaco
  // sees a handful per race).
  function attackOK(ctx) {
    const inZone = (ctx.toTurnIn != null ? ctx.toTurnIn : 1e9) < 130;
    // A straight is a place to pass (0.6); a bend fades it out by 0.02 rad/m.
    const bend = clamp(1 - (Math.abs(ctx.kAhead || 0) - 0.004) / 0.016, 0, 1);
    let q = inZone ? (ctx.attackQ || 0) : lerp(0.15, 0.6, bend);
    // A car with genuinely LESS PACE is passed wherever: the quality floor rises
    // with the pace deficit (12 % of the top speed is a floor of 0.6; a car
    // crawling under 12 % is 1) — this is what keeps a slow player passable on
    // a street circuit whose zones are all narrow (measured without it: 3 of
    // 10 followers past a slow car at monaco in four minutes, 10 of 10 with).
    // The floor starts at a 6 % deficit — the field's own tier spread — and is
    // full at 12 %, so a slightly slower rival is still passed only where the
    // move is on, while a genuinely slow car (the 14 % slow player in the
    // bench) is attacked anywhere.
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    const deficit = clamp((((ctx.freeSpeed || 0) - bv) / ref - 0.06) / 0.06, 0, 1);
    if ((ctx.blockerSpeed || 0) < 0.12 * ref) q = 1; else q = Math.max(q, 0.6 * deficit);
    const closing = clamp(((ctx.speed || 0) - (ctx.blockerSpeed || 0)) / (6 * ref / 72), 0.25, 1);
    const craft = lerp(0.7, 1.25, ctx.traits ? ctx.traits.craft : 0.75);
    const roll = 0.85 + 0.3 * (ctx.roll != null ? ctx.roll : 0.5);
    q *= 1 - (1 - START_ATTACK) * (ctx.calm || 0);   // the first lap: not lap 20 into turn 1 (startCalm)
    // A queued car can never show a closing rate — the queue cap pins it to the
    // blocker's speed — so time held behind stands in for it (queuePress).
    return q * Math.max(closing, deficit, 0.7 * queuePress(ctx)) * craft * roll >= 0.32 && passReach(ctx);
  }

  // CAN IT BE HALF ALONGSIDE BY THE TURN-IN? game.js abandons a pass that is
  // not (the lunge rule: FIA's front axle past the mirror), so a move started
  // too close to the corner was always going to be given up — measured on
  // monza, 22-43 lunge aborts per 240 s with a median life of 0.5-0.8 s, each
  // one a car pulling out and dropping straight back into the queue. Ground to
  // gain is the gap less the half-car level; the closing rate is the larger of
  // the live one and the pace edge, floored at 1 m/s (pace-scaled) so a queued
  // car is judged on the tow it will get, and 1.25x the plain distance is
  // allowed because the late brake (brakeTarget) makes up the rest.
  function passReach(ctx) {
    const to = ctx.toTurnIn;
    if (!(to < 1e8) || !(ctx.blockerGap > 0)) return true;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    if ((ctx.blockerSpeed || 0) < 0.12 * ref) return true;   // an obstacle: go now
    const gain = ctx.blockerGap - SIDE_LEVEL;
    if (gain <= 0) return true;
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    const dv = Math.max((ctx.speed || 0) - (ctx.blockerSpeed || 0), (ctx.freeSpeed || 0) - bv, ref / 72);
    return (ctx.speed || 0) * gain / dv <= 1.25 * to;
  }

  // QUEUE PRESSURE. THE TRAIN: the queue cap holds a follower at the blocker's
  // speed, and otWant then asked for a 7 % pace edge (5 m/s) the field's own
  // 1.4 % spread can never produce — so evenly matched cars sat nose to tail
  // for whole races, which is what a player sees as "they clump and get stuck
  // behind each other". Real drivers get impatient: the longer they are held,
  // the smaller the edge they will try a move on. `queueT` counts seconds held
  // by the queue cap behind the SAME car (game.js); it decays at twice the
  // rate when free, so a brief break in the queue does not reset the clock.
  // Craft is patience spent: a racer tries after ~3.5 s, a rookie after ~7 s.
  function queueTime(prevT, held, dt) {
    return held ? (prevT || 0) + dt : Math.max(0, (prevT || 0) - 2 * dt);
  }
  function queuePatience(t) {
    // High aggression burns patience faster → higher queuePress sooner → otWant.
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    return lerp(7, 3.5, t ? t.craft : 0.75) * lerp(1.12, 0.88, (aggr + 1) * 0.5);
  }
  function queuePress(ctx) {
    return clamp((ctx.queueT || 0) / queuePatience(ctx.traits), 0, 1);
  }
  function sideLevel() { return SIDE_LEVEL; }

  // MISTAKES. An error-free field is a procession; F1 22's "two or three big
  // lock-ups a race" was what players called too many. rFactor 2 schedules
  // "bad driving zones" by Composure, AMS2 separates general errors from
  // pressure-forced ones, F1 Manager feeds pressure into a confidence state.
  // Here: once per braking zone a chance of a missed braking point —
  //   base 0.4 % x (1 + 2 x pressure) x (1.3 - consistency)
  // pressure being the fraction of the last six seconds spent with a car
  // within 0.6 s behind. A metronome (consistency 1) unpressured: 0.12 % a
  // zone, one every ~80 laps; a rookie (0.5) under sustained pressure: ~1 % a
  // zone, one every ~10 laps. The error is a LATE phase (brakes 5 % later,
  // runs wide, fronts locked for the render) then a GATHER phase (85 % pace
  // while the car is collected) — half a second to a second and a half lost,
  // and never while alongside another car.
  // TYRES AS STRATEGY. There are no pit stops (docs/PHYSICS.md), so the
  // compound IS the strategy, so the field must not run one. Each AI car
  // starts a race on a class drawn for the distance (sprints on softs, long
  // races mixed): a soft is up on pace and fades, a hard is down and lasts,
  // so soft-starters and hard-starters cross over mid-race — real F1 2026 deg
  // is ~0.07 s a lap per lap of age (0.08 % of a 90 s lap) with the compounds
  // ~0.4 s apart on a fresh set; de Groote's overtaking study found strategy
  // diversity the largest lever a race controls. Zero-mean across a mixed field
  // by construction, so the AI's pace against the player is unchanged on
  // average; the player's own compound stays the static garage choice.
  // Fresh: soft +0.4 %, hard -0.4 %; deg 0.12 / 0.07 / 0.04 % a lap, capped at
  // 2.5 %. Soft and hard cross at lap 10 — inside the 10- and 25-lap races
  // hards are drawn for.
  const TYRE = {
    soft:   { off: 0.004,  deg: 0.0012 },
    medium: { off: 0,      deg: 0.0007 },
    hard:   { off: -0.004, deg: 0.0004 },
  };
  function tyreClass(roll, laps) {
    const r = roll || 0;
    if (laps <= 5) return r < 0.7 ? "soft" : "medium";
    if (laps <= 15) return r < 0.4 ? "soft" : r < 0.8 ? "medium" : "hard";
    return r < 0.25 ? "soft" : r < 0.7 ? "medium" : "hard";
  }
  function tyrePace(cls, lapsDone) {
    const t = TYRE[cls] || TYRE.medium;
    return 1 + t.off - Math.min(t.deg * Math.max(lapsDone || 0, 0), 0.025);
  }

  // ── STRATEGY ───────────────────────────────────────────────────────────────
  // What the field does about a worn tyre once TYRE WEAR is on. With it OFF the
  // TYRE table above is the whole model and none of this runs.
  //
  // THE MODEL IS THE ONE STRATEGISTS ACTUALLY USE, shrunk to fit:
  //
  //   T = SUM over stints [ laps_i x (paceOffset(cls_i) + degCost(laps_i, life_i)) ]
  //       + stops x pitLossLaps
  //
  // — the formulation a 2026 MILP solves with 25 integers and 15 binaries
  // (docs/research/TYRE-STRATEGY-DESIGN.md §2.8). We do not need a solver: with
  // three compounds and at most two stops there are 39 candidate plans, and they
  // are enumerated once per car at the green light.
  //
  // EVERY COST IS IN LAP-TIME FRACTIONS so they add. `degCost` is the average
  // grip lost over a stint of `n` laps on a compound whose life is `life` laps:
  // linear wear makes that the area under the drop line, n/(2*life) of the full
  // drop, and anything past `life` is charged at the cliff rate — which is what
  // makes over-running a set the thing the planner avoids rather than a rounding
  // error. `pitLossLaps` is the stop's cost expressed the same way.
  // A FULL TANK EATS TYRES, and this is what makes strategies MIX. Without it
  // the cost is separable and the taste is constant, so the best compound for
  // the first stint is the best for the last one and every plan comes out
  // soft/soft/soft — which is not what anyone who watches the sport expects to
  // see. A heavy car works its tyres harder, so a stint's effective life falls
  // with the fuel still aboard, and the planner reaches for harder rubber early
  // and softer late. That is the real pattern, arrived at from the real cause.
  const FUEL_WEAR = 0.22;    // life lost at a full tank, as a fraction
  /* WHAT A STOP COSTS, when the caller has not measured it — ONE number, shared
     by stintPlan and wornPays() so "is it worth stopping" and "when should I
     stop" cannot answer the same question differently. js/race/pit-lane.js derives the real
     value (loss / lapRefS, clamped) and passes it; this is only for a caller
     that has none yet, and 0.18 is the planner's own long-standing figure. */
  const PIT_LOSS_FALLBACK = 0.18;
  const DEG_LIN = 0.05;      // lateral grip lost across a full stint (TyreModel.DROP_LIN)
  const DEG_CLIFF = 0.50;    // ...and per unit of wear past it (TyreModel.DROP_CLIFF)
  const GRIP_TO_LAP = 0.55;  // a fraction of grip is worth this much of a lap — sub-linear
  // THE STRATEGY TASTE (stintPlan): how far one driver's roll moves the plan.
  // At 0.66 / 0.006 a race split into two plans; the field needs a spread.
  const TASTE_BIAS = 0.8;      // x pitLossLaps: +/- 0.4 of a stop's cost (1.0 planned a lap-1 stop in a 5-lap race)
  const TASTE_SOFTEN = 0.010;  // grip-per-lap preference for softer rubber
  // A stop leaves at least MIN_STINT laps either side (a lap-1 stop is not a
  // strategy), and a race of ONE_SET_LAPS or fewer is run on one set: the
  // tyre model's MIN_LIFE_LAPS floor exists so that it can be.
  const MIN_STINT = 2;
  const ONE_SET_LAPS = 5;
  function degCost(n, life) {
    const L = Math.max(0.5, life);
    const over = Math.max(0, n - L);
    const inLife = Math.min(n, L);
    // The drop summed over the stint, as TyreModel.gripFor charges it: the
    // linear slope inside the life, then EVERY lap past it carries the full
    // DEG_LIN plus the cliff. Leaving out that DEG_LIN·over priced a 50 %
    // overrun ~29 % light, and the planner ran sets long for it.
    const mean = DEG_LIN * (inLife / (2 * L)) * inLife + DEG_LIN * over + DEG_CLIFF * (over * over) / (2 * L);
    return mean * GRIP_TO_LAP;
  }

  // Split `laps` into `k` stints in proportion to the compounds' lives, so the
  // marginal degradation at each stop is roughly equal — the classic result for
  // linear deg, and the reason real stint lengths come out similar.
  // `fuelWear`, when given, makes the split FUEL-AWARE. Without it the split
  // divided the race by the compounds' RAW lives while `degCost` priced every
  // stint against a fuel-ADJUSTED one — so the cost knew a full tank eats tyres
  // and the stint lengths could not answer. That is the mechanism the comment
  // above claims makes plans MIX ("harder rubber early and softer late"), and
  // it could not act: with the split fixed, a hard first stint could not take
  // the longer share its durability earns while the car is heavy.
  //
  // The dependency is circular — the fuel aboard a stint depends on where the
  // stint falls, which depends on the split — so it is solved by iterating. It
  // converges in two passes at these sizes; three is cheap and leaves margin.
  function splitStints(laps, lives, fuelWear) {
    const share = (v) => {
      const total = v.reduce((a, x) => a + x, 0) || 1;
      const out = v.map((x) => Math.max(1, Math.round(laps * x / total)));
      let drift = out.reduce((a, x) => a + x, 0) - laps;
      // Over-allocated: shave stints down to their 1-lap floor, last first.
      for (let i = out.length - 1; i >= 0 && drift > 0; i--) {
        const take = Math.min(drift, out[i] - 1);
        out[i] -= take; drift -= take;
      }
      // Under-allocated: the floor never limits a stint that GROWS, so the
      // last stint takes the shortfall (the 1-lap cap left [1,1,1] of 4 laps
      // summing to 3 and the plan finished a lap early).
      if (drift < 0) out[out.length - 1] -= drift;
      return out;
    };
    let out = share(lives);
    if (fuelWear > 0 && lives.length > 1) {
      for (let pass = 0; pass < 3; pass++) {
        let done = 0;
        const eff = lives.map((v, i) => {
          const fuel = 1 - (done + out[i] / 2) / laps;   // mean fuel across THIS stint
          done += out[i];
          // DIVIDED, matching stintPlan's cost below and the sim itself: fuel
          // multiplies tyre LOAD by (1 + FUEL_LOAD·fuel), so the life a set has
          // is v / (1 + fuelWear·fuel). This function only needs the RATIO
          // between stints, but the two forms weight that ratio differently,
          // so the form has to match or the lap numbers drift from the cost.
          return Math.max(0.5, v / (1 + fuelWear * fuel));
        });
        out = share(eff);
      }
    }
    return out;
  }

  // Enumerate 0-, 1- and 2-stop plans over the three classes and keep the best.
  // `roll` is the car's own deterministic draw and does two jobs: it breaks ties
  // so the field does not converge on one plan, and it biases the taste — real
  // strategy diversity is the largest lever a race controls over how much
  // overtaking happens, which is the same argument the TYRE table above makes.
  const MAX_STOPS = 2;
  const CLASSES = ["soft", "medium", "hard"];
  function stintPlan(ctx) {
    const laps = Math.max(1, Math.round(ctx.laps || 1));
    const lifeLaps = ctx.lifeLaps || ((cls) => (TYRE[cls] ? laps * 0.7 : laps));
    const pitLossLaps = ctx.pitLossLaps != null ? ctx.pitLossLaps : PIT_LOSS_FALLBACK;
    const roll = clamp(ctx.roll || 0, 0, 1);
    // TWO tastes, because one is not enough to spread a field. Biasing only the
    // STOP COUNT moves the stop/no-stop boundary and leaves every car choosing
    // the same rubber, which measured as a 20-car field on one plan — the
    // procession the TYRE table above exists to avoid.
    //
    //   `bias`   — a taste for stopping, +/- 0.4 of a stop's cost. A
    //              cautious driver stops early and often, an aggressive one
    //              runs the set long.
    //   `soften` — a taste for grip over durability, worth up to about half a
    //              compound step per lap. A low roll shops for hards, a high
    //              one for softs, and the field arrives at the first stop on
    //              different tyres.
    const bias = (roll - 0.5) * TASTE_BIAS * pitLossLaps;
    const soften = (roll - 0.5) * TASTE_SOFTEN;
    const taste = { soft: soften, medium: 0, hard: -soften };
    // THE PINS, for the PLAYER's reference plan (js/race/pit-lane.js): `stops`
    // holds the stop count the STRATEGY row chose, `start` the compound
    // already on the car when a plan is re-cut mid-race, and `firstLife` the
    // laps that set has left — the first stint is run on what is on the car,
    // not on a fresh set's life. An AI passes none of them.
    // …and never more stops than the race has laps to hold one on (laps - 1:
    // no stop on the last). The pin is stored per circuit, not per distance, so
    // a 2-stop pin met a 2-lap sprint leg and made a zero-length stint: "BOX L0".
    let pinStops = ctx.stops != null && ctx.stops >= 0 ? Math.min(MAX_STOPS, ctx.stops | 0, Math.max(0, laps - 1)) : null;
    let pinStart = ctx.start && TYRE[ctx.start] ? ctx.start : null;
    // TWO DRY SPECIFICATIONS (FIA Sporting Regulations B6.3.6): a dry race
    // must use at least two different compounds. `used` is what a mid-race
    // re-cut has already run; a plan that ends on one compound is refused.
    let twoCompound = !!ctx.twoCompound;
    const used = ctx.used || [];
    let best = null;
    const walk = (seq) => {
      const stops = seq.length - 1;
      if (pinStops != null && stops !== pinStops) return;
      if (twoCompound && new Set(used.concat(seq)).size < 2) return;
      if (pinStart && seq[0] !== pinStart) return;
      // No pin, no set already on the car: a sprint this short plans no stop
      // (measured: 2 low rolls of 21 planned hard-hard with a stop after lap 1).
      if (stops > 0 && laps <= ONE_SET_LAPS && pinStops == null && !pinStart && !(ctx.firstLife > 0)) return;
      const lives = seq.map((cls, i) => (i === 0 && ctx.firstLife > 0 ? ctx.firstLife : lifeLaps(cls)));
      const stints = splitStints(laps, lives, FUEL_WEAR);
      let cost = stops * pitLossLaps + stops * bias;
      let done = 0;
      for (let i = 0; i < seq.length; i++) {
        const t = TYRE[seq[i]] || TYRE.medium;
        // Mean fuel aboard across THIS stint, 1 on the grid to 0 at the flag.
        const fuel = 1 - (done + stints[i] / 2) / laps;
        cost += -(t.off + (taste[seq[i]] || 0)) * stints[i]
              // DIVIDED, NOT SUBTRACTED. The sim raises tyre LOAD by
              // (1 + FUEL_LOAD·fuel) — js/physics/tyre-model.js fuelLoadMul,
              // applied to the load that drives wear — so the life a set
              // actually has is life / (1 + 0.22·fuel). The first-order
              // life × (1 − 0.22·fuel) is short by 4.84% at a full tank (0.7800
              // against 0.8197), 2.72% at three-quarters, 1.21% at half.
              // Measured over 1620 plans against it (with the matching form in
              // splitStints above): 381 plans move, the first stint runs LONGER
              // in 326 and shorter in 46, and the stop COUNT is a wash.
              // Same constant on both sides; now the same FORM.
              + degCost(stints[i], lives[i] / (1 + FUEL_WEAR * fuel));
        done += stints[i];
      }
      if (!best || cost < best.cost) best = { cost, seq: seq.slice(), stints: stints.slice(), stops, lives: lives.slice() };
    };
    const rec = (seq) => {
      walk(seq);
      if (seq.length > MAX_STOPS) return;
      for (const cls of CLASSES) rec(seq.concat(cls));
    };
    for (const cls of CLASSES) rec([cls]);
    // A start pinned to a compound the planner does not enumerate (a wet on a
    // drying track) matches no sequence: plan from the classes instead.
    if (!best && pinStart) { pinStart = null; for (const cls of CLASSES) rec([cls]); }
    // A pinned NO STOP cannot satisfy the rule, and a plan that drops it is a
    // DSQ at the flag (endRace, SportingRegs.applyCompoundRule): the rule wins
    // and the pin rises to the one stop it needs. Only a race too short to
    // hold a stop at all plans on one set.
    if (!best && twoCompound && pinStops === 0 && laps > 1) { pinStops = 1; for (const cls of CLASSES) rec([cls]); }
    if (!best && twoCompound) { twoCompound = false; for (const cls of CLASSES) rec([cls]); }
    // Stop laps are the running totals of the stint lengths — STAGGERED by the
    // roll, a lap either way in thirds of the field. Without it a field on one
    // plan stopped on ONE lap: 22 cars into a twelve-box lane at once (Bahrain,
    // measured — five cars over a minute in the lane, every exit crawling
    // behind the next box's stop). A lap off the optimum costs the planner's
    // own curve almost nothing; the stints are re-cut to match.
    const shift = clamp(Math.round((roll - 0.5) * 3), -1, 1);
    const lapsAt = [];
    const stints = best.stints.slice();
    let acc = 0, prev = 0;
    // …but never past a set's life IN EITHER DIRECTION. At a severe circuit the
    // lives are short and the optimum already sits on the cliff. A +1 shift ran
    // a third of the field a lap past it (Austria, 10 laps, measured: 8 of 21
    // cars over 100 % wear before their stop); and a -1 shift is not "always
    // safe" — it lengthens the NEXT stint, and the early third finished on
    // 1.17-1.25 wear. A shift stands only while the stint it lengthens fits.
    const effLife = (i, from, len) => best.lives[i] / (1 + FUEL_WEAR * (1 - (from + len / 2) / laps));
    const minStint = Math.max(1, Math.min(MIN_STINT, Math.floor(laps / Math.max(1, stints.length))));
    for (let i = 0; i < stints.length - 1; i++) {
      acc += best.stints[i];
      const to = acc + shift, last = i + 1 === stints.length - 1;
      const nextEnd = last ? laps : acc + best.stints[i + 1];   // unshifted: the longer, safer bound
      const over = (shift > 0 && to - prev > effLife(i, prev, to - prev))
        || (shift < 0 && nextEnd - to > effLife(i + 1, to, nextEnd - to));
      const at = clamp(over ? acc : to, prev + minStint, laps - minStint * (stints.length - 1 - i));
      lapsAt.push(at); stints[i] = at - prev; prev = at;
    }
    if (stints.length) stints[stints.length - 1] = laps - prev;
    return { start: best.seq[0], seq: best.seq, stints, stops: best.stops, lapsAt, cost: best.cost };
  }

  // The compound for an UNPLANNED stop — a spent set, or a track that has dried
  // out. The plan has nothing to say about these (a 0-stop plan has no next
  // compound at all, and a fixed "medium" ignores whether there are three
  // laps left or thirty), so pick the fastest rubber that can still cover
  // what remains: softest first, and the hardest as the fallback when nothing
  // comfortably lasts.
  function compoundFor(lapsLeft, lifeLaps) {
    const need = Math.max(1, lapsLeft);
    for (const cls of CLASSES) if (lifeLaps(cls) >= need) return cls;
    return CLASSES[CLASSES.length - 1];
  }

  // Should this car come in NOW, ahead of its plan? Three rules, in the order
  // their value was measured (docs/research/TYRE-STRATEGY-DESIGN.md §2.7, §2.9).
  //
  //   1. THE FREE STOP. Under a safety car or VSC the whole field is slowed, so
  //      a stop costs 40-60% less — 8-12 s, the single biggest lever in the
  //      sport. A car within reach of its planned stop takes it.
  //   2. THE WRONG TYRE. A dry->rain arc punishes a slick; pitting IS the
  //      recourse (docs/PHYSICS.md).
  //   3. THE SET IS GONE. Past its life the cliff costs more than the stop.
  //
  // Returns a REASON string (or "") rather than a boolean, so the caller can say
  // why on the radio and a test can assert which rule fired.
  const CAUTION_REACH = 6;    // laps of the plan a free stop is worth pulling forward
  // THE RIVAL RULES, a pit wall reading the cars around it. Both only pull a
  // stop the plan already wants forward (within UNDERCUT_REACH laps, on a set
  // that has done some work), so neither can add a stop the race cannot pay for.
  //   cover    — the car directly BEHIND, within COVER_GAP_S, has boxed: it
  //              will come out on fresh rubber and take the place (the
  //              undercut). An alert wall (TEMPER.react) boxes to cover it.
  //   undercut — stuck within STUCK_GAP_S of the car AHEAD that has not
  //              stopped, for STUCK_LAPS, with the stop due next lap: an
  //              aggressive wall (TEMPER.attack) stops first.
  const UNDERCUT_REACH = 2;   // the cover's reach; the undercut itself only on the stop's own lap-before
  const UNDERCUT_LAPS = 1;
  // …and only after STUCK_LAPS stuck: a car a second behind for a corner is racing, not stuck.
  const UNDERCUT_MIN_WEAR = 0.4;
  const STUCK_GAP_S = 1.0;
  // …and cover only the car DIRECTLY behind, in a real fight: a stop's worth
  // of gap (the engineer's measure) chained — one stop pulled the car ahead
  // in, which pulled the one ahead of it (10 of 20 stops "cover", measured).
  const COVER_GAP_S = 2.0;
  const STUCK_LAPS = 1;
  // An AI re-cuts at most once in REPLAN_GAP laps: the measured wear is noisy
  // over a lap or two and a plan sitting on a boundary flipped every lap
  // (up to 10 re-cuts in a 25-lap race, measured).
  const REPLAN_GAP = 4;
  // ONE rival call a race. With the field nose to tail (Austria, 10 laps) the
  // rules fired for 18 of 31 stops and half the grid two-stopped; an undercut
  // or a cover is a call a pit wall makes once, not a habit. And never one the
  // next set cannot carry to its own stop (ctx.fits): pulling a stop forward
  // onto a stint too long for its set bought the extra stop it was meant to save.
  // STRATEGIC TEMPER from the ratings — who reacts, who attacks, who gambles.
  // react = 0.6·experience + 0.4·awareness; attack = craft; gamble = 1 − experience.
  const TEMPER = { REACT_MIN: 0.75, ATTACK_MIN: 0.85, GAMBLE_W: 0.8 };
  function strategyTemper(c) {
    const t = traits(c);
    return { react: 0.6 * t.experience + 0.4 * t.awareness, attack: t.craft, gamble: 1 - t.experience };
  }
  // The plan roll, widened by the gamble: a veteran runs close to the book,
  // a rookie's taste reaches the ends of the range (the extra stop, the
  // marathon first stint). Keeps 0.5 at 0.5, so a neutral roll stays neutral.
  function tasteRoll(roll, c) {
    return clamp(0.5 + (roll - 0.5) * (1 + TEMPER.GAMBLE_W * strategyTemper(c).gamble), 0, 1);
  }
  // A STOP YOU CANNOT RECOVER IS NOT WORTH MAKING. Rule 3 fired on wear alone,
  // with no regard for how much race was left, so a set that went over its life
  // near the flag sent the car down the lane to lose 15 s it had no laps to win
  // back: measured on an 8-lap Bahrain, TWELVE of 22 cars pitted on LAP 8 —
  // the last lap — every one of them for "worn".
  //
  // Fresh rubber pays back the drop it replaces, so the laps left have to
  // cover the stop: gain per lap is the whole drop of a set past its life
  // (DEG_LIN plus the cliff over how far past it is), and the stop costs `pitLossLaps`. Below the break-even the flag
  // comes first and the car drives it home, which is what a real team does.
  // The 0.1 floor keeps a set only just over its life from claiming an
  // enormous payback window and pitting on lap one past it.
  function wornPays(ctx) {
    if (ctx.lapsLeft == null) return true;            // caller has not said; behave as before
    const over = Math.max(0.1, (ctx.wear || 0) - 1);
    const gainPerLap = (DEG_LIN + DEG_CLIFF * over) * GRIP_TO_LAP;   // the drop a fresh set gives back
    const payback = (ctx.pitLossLaps > 0 ? ctx.pitLossLaps : PIT_LOSS_FALLBACK) / Math.max(1e-3, gainPerLap);
    return ctx.lapsLeft >= payback;
  }
  function pitNow(ctx) {
    if (!ctx) return "";
    // TWO RULES IGNORE THE PLAN'S STOP BUDGET, because both are about a tyre
    // that cannot do its job at all rather than about strategy. A car planning
    // no stops still has to come in for slicks in the rain, and still has to
    // change a set it has run off the cliff — gating these on `stopsLeft` left
    // every 0-stop car circulating on the wrong rubber, measured.
    if (ctx.wrongTread) return "weather";
    // A SCRIPTED plan (a real race replayed) stops on its real laps and nowhere
    // else: the caution reach would double-stop a car whose next real stop sat
    // inside a held safety car, and the worn rule would add one the real race never made.
    if (ctx.scripted) return ctx.stopsLeft > 0 && ctx.lapsToStop <= 0 ? "plan" : "";
    if (ctx.wear >= 1 && wornPays(ctx)) return "worn";
    if (ctx.stopsLeft <= 0) return "";
    // VSC and SC (2, 3) are the free stop; a red flag (4) is not a pit window.
    // …and only onto a set that can carry the stint it lengthens (ctx.fits,
    // as for the rival calls): an early SC pulled a one-stop's stop six laps
    // forward onto a set that could not reach the flag — a second stop.
    if (ctx.cautionLevel >= 2 && ctx.cautionLevel < 4 && ctx.fits !== false && ctx.lapsToStop <= CAUTION_REACH) return "caution";
    if (!ctx.rivalUsed && ctx.fits !== false && ctx.lapsToStop <= UNDERCUT_REACH && (ctx.wear || 0) >= UNDERCUT_MIN_WEAR) {
      if (ctx.rivalBehindBoxed && (ctx.react || 0) >= TEMPER.REACT_MIN) return "cover";
      if (ctx.stuckBehind && ctx.lapsToStop <= UNDERCUT_LAPS && (ctx.attack || 0) >= TEMPER.ATTACK_MIN) return "undercut";
    }
    if (ctx.lapsToStop <= 0) return "plan";
    return "";
  }

  // errMul is the difficulty-ladder rate scale (PhysicsConsts.DIFF[d].err) —
  // NOT the render-time brakeTarget multiplier of the same short name in
  // ctx.errMul (that one scales the braking limit once a mistake has already
  // fired; this one scales whether it fires at all). >0 multiplies the base
  // rate; undefined/0/negative leaves it at 1 so every existing caller and
  // test is unchanged.
  //
  // Slice 4: short races need visible late-brake/gather on easy/normal without
  // editing DIFF.err. Hard (errMul≈1) keeps the 0.004 base; easy/normal get a
  // visibility lift from (em−1). Optimism adds under pressure only (zero-mean
  // when unpressured).
  function mistakeChance(t, pressure, errMul) {
    const cons = t && t.consistency != null ? t.consistency : 0.75;
    const em = errMul > 0 ? errMul : 1;
    const press = clamp(pressure || 0, 0, 1);
    // Cap 8× once em≥2.5 (easy); normal (~1.8) gets ~5.7×. Hard (em=1)
    // stays on the 0.004 base so DIFF.err alone sets the hard rate.
    const base = 0.004 * (1 + 7.0 * clamp((em - 1) / 1.2, 0, 1));
    const opt = clamp(t && t.optimism != null ? t.optimism : 0, -1, 1);
    const optMul = 1 + 0.25 * opt * press;
    return base * (1 + 2 * press) * (1.3 - cons) * em * optMul;
  }
  const ERR_LATE = 1.2, ERR_GATHER = 1.8;
  function mistakeTotal() { return ERR_LATE + ERR_GATHER; }
  function mistakePhase(errT) { return !(errT > 0) ? 0 : errT > ERR_GATHER ? 1 : 2; }   // 1 late/wide, 2 gathering
  function mistakeBrakeMul() { return 1.05; }
  function mistakeGatherMul() { return 0.85; }

  // A HUMAN RUNS NO YIELD PROTOCOL, so electing one is electing nobody.
  // sideYieldsA picks exactly ONE car of an alongside pair to concede, and only
  // that car backs off. Between two AI cars that resolves, because both sides
  // run the rule. Elect the player and neither does: the player has no such
  // logic (and must not — the arc may not reach the driver), so the AI holds
  // its racing-line target and leans on a car that was never going to move.
  //
  // collide.js already encodes this once metal is touching ("with a HUMAN in
  // the pair there is no planner to mirror"), but that is the CONTACT layer;
  // nothing said it at the STEERING layer, where the AI picks where to aim.
  //
  // Measured (monza, 240 s, scripted player holding the racing line at racing
  // pace): of 276 frames alongside inside the clear gap, the rule elected the
  // HUMAN 276 times and the AI zero. Against another AI the elected car does
  // concede — 22,524 frames, gap opening +0.169 m/s.
  //
  // GRACE, not an exemption. The AI holds its line for this long first, so
  // racing a player is not a free pass and a clean side-by-side still happens;
  // only a lean that the player has demonstrably not answered flips the roles.
  // 0.3 s is about a driver's reaction time and roughly half the shortest
  // AI-AI alongside episode the bench sees.
  function humanYieldGrace() { return 0.3; }
  // Metres inside the clear gap before a lean counts as one. Matches the
  // steering deadzone the rub clamp already works to, so a pair sitting AT
  // the gap is settled rather than perpetually re-arming.
  function humanYieldBand() { return 0.3; }
  // The grace timer itself, so the RULE lives here and game.js only carries the
  // per-car state (the ownership split at the top of this file). Counts only
  // while we are alongside a human the rule has NOT given us to yield to;
  // anything else resets, so separating ends it with no special case.
  // `intruding` is the half that keeps this from being a free lane, and it is
  // the difference between the two directions of the same geometry:
  //
  //   the AI's own target is inside the clear gap   -> IT is leaning on a
  //     player who has nowhere to go. That is the reported bug, and the AI
  //     concedes once the grace is up.
  //   the AI is holding its line and the PLAYER drives into it -> the AI is
  //     not intruding on anything. It holds, and the result is a rub.
  //     (collision-contact-vm's "leaning on an AI wheel to wheel is a rub, not
  //     a brake" pins exactly this, and caught the first cut of this function,
  //     which conceded in BOTH directions — a player could shove any AI off
  //     its line by leaning on it for a third of a second.)
  //
  // Without it the fix for "the AI drives into my side" silently becomes "the
  // AI yields to any contact", which is the pushover outcome, not this one.
  //
  // HOLDING IS NOT YIELDING EITHER (2026-10-01). With the rule electing the
  // human and the AI only HOLDING its line inside the band (`inside`), the
  // pair still had no yielder at all: tools/check/ai-tactics.mjs --mode human
  // measured contact in 11-22 % of the frames an AI ran alongside the player.
  // A held line now arms the timer at HOLD_RATE, so a player leaning on an AI
  // gets grace / HOLD_RATE (1.2 s) of rub — a contest, not a free lane at
  // 0.3 s — and then the AI concedes, so ONE car always yields in the end.
  // `close` is STILL BESIDE THEM (game.js: the clear gap plus a metre), so a
  // concession is held while the pair stays alongside: released at the gap it
  // drifted straight back to its lane and re-armed, a 1.5 s in-out cycle.
  const HOLD_RATE = 0.25;
  function humanYieldT(prevT, close, aiElected, otherHuman, intruding, dt, inside) {
    if (!close || !otherHuman) return 0;
    if (aiElected) return 0;          // the normal path already has it; start clean
    if (intruding) return prevT + dt;
    return inside ? prevT + dt * HOLD_RATE : prevT;   // their lean: slower; at the gap: settled
  }
  function humanYieldTakes(t) { return (t || 0) > humanYieldGrace(); }

  // A HUMAN'S PACE. otWant / attackOK / the lunge rule compare our free pace
  // with the blocker's PACE (its vmax). An AI's vmax is its pace; a human's is
  // only the CAR's, so the old read for a human was its LIVE speed — and that
  // is low in every corner and braking zone, exactly where a pass cannot
  // complete: the AI attacked a player where it would never attack an AI
  // (2026-10-01 investigation). The like-for-like read is the human's speed
  // against what an AI does at the same metre of road: AI cars in free air
  // teach a per-node profile of speed / own vmax (paceRef, `ref` is a
  // Float32Array of track.n), and a human's paceF is its own speed / vmax
  // against that profile, smoothed over ~7 s. The human's pace vmax is then
  // vmax x paceF — 1 for a driver who drives like the field.
  // AI-only: it decides what the AI does about the player, never the car.
  function paceSample(ref, i, c, vmax, free, dt) {
    if (!(vmax > 1)) return;
    const f = c.speed / vmax;   // a ratio: the same at every OVERALL SPEED
    if (!(f > 0.02)) return;
    if (!c.human) { if (free) ref[i] = ref[i] > 0 ? ref[i] + (f - ref[i]) * 0.2 : f; return; }
    const r = ref[i];
    if (r > 0.05) c.paceF = damp(c.paceF > 0 ? c.paceF : 1, clamp(f / r, 0.6, 1.25), 0.15, dt);
  }

  // THE AIM, NOT THE CONTACT. Every side-by-side rule above keys on where the
  // two cars ARE (|dx| inside the clear gap), while the AI steers toward a
  // point 8-25 m ahead on its line — so a car overlapping us by half a length
  // and a lane over was aimed THROUGH until the boxes touched, and only then
  // did the rub clamp (or, for a human, the grace timer) begin. Measured with
  // tools/check/ai-human.mjs on 2026-09-16 (monza, a scripted player 3 %
  // under the field's pace): 4-5 AI-to-player contacts per 100 s, nearly all
  // "diagonal" — overlapping by 3-4 m on arc, first touch at 1.95 m lateral,
  // the car width. This asks the question one step earlier: is the AIM inside
  // the other car's clear gap, and on the other car's side of where we are —
  // i.e. are we steering INTO them, as opposed to holding while they come to
  // us (their move: hold, and the result is a rub, exactly as humanYieldT
  // reasons). game.js applies it with the same clamp the rub constraint uses,
  // but without the emergency (full-authority) controller: at aim distance the
  // heading state has time to bend the line, and that is the point.
  function aimIntrudes(desiredX, x, otherX, clear) {
    if (Math.abs(desiredX - otherX) >= clear) return false;
    return otherX <= x ? desiredX < x : desiredX > x;
  }

  // LEVEL, THE INSIDE OF THE NEXT CORNER OWNS IT. With `kTurn` (the
  // curvature just past the next turn-in, AI-only) the outer car is the one on
  // the outside of THAT corner — |x| from the centreline is the outside of the
  // corner only when the pair is already in it. Without it, as before.
  const SIDE_LEVEL = 2.4;
  function sideYieldsA(dProg, xA, xB, kTurn) {
    if (dProg < -SIDE_LEVEL) return true;        // A is behind B
    if (dProg > SIDE_LEVEL) return false;        // A is ahead
    if (Math.abs(kTurn || 0) > 0.004 && xA !== xB) return (xA - xB) * Math.sign(kTurn) > 0;   // A outside (+k = left: outside is +x)
    return Math.abs(xA) >= Math.abs(xB);         // level: the outer car concedes
  }

  // MIRRORS: how far back a car in our lane is SEEN — a time, not a distance. The
  // traffic scan (game.js) at a flat 13 m is 0.2 s at 60 m/s: the attacker is in
  // the gearbox before the defender knows it is there, and the two rules below
  // written in TIME — holdLineGap (a second behind) and the pressure timer
  // (0.6 s) — could not see past 13 m. Awareness
  // is the reach: a sharp driver watches a second back, a dull one about 0.6 s.
  function mirrorReach(t, speed) {
    const v = Math.max(speed || 0, 10);
    return clamp(v * lerp(0.6, 1.05, t ? t.awareness : 0.75), 13, 72);
  }
  // The COVER WINDOW, in seconds behind: the flat 12 m gate was 0.2 s at racing speed,
  // so the one defensive move (defendOnce) was spent with the attacker already on the
  // gearbox — too late to be a cover. Awareness widens it: 0.35 s .. 0.7 s.
  function defendWindowT(t) { return lerp(0.35, 0.7, t ? t.awareness : 0.75); }

  // MID-TRAIN TOO (2026-10-01): a car with a car ahead never defended at all,
  // so every car in a train was a free pass. It defends when the attack
  // behind is nearer than the car ahead (blockerGap) — the threat that matters.
  function defendPull(ctx) {
    if (!ctx.chaser || (ctx.blocker && (ctx.street || !(ctx.chaserGap < ctx.blockerGap)))) return 0;
    const gT = (ctx.chaserGap == null ? 99 : ctx.chaserGap) / Math.max(ctx.speed || 0, 10);
    const winT = defendWindowT(ctx.traits);
    if (gT >= winT) return 0;
    if ((ctx.chaserSpeed || 0) <= (ctx.speed || 0) - 3) return 0;
    const kA = ctx.kA || 0;
    // COVER SIDE. Into a corner the inside is the thing worth having, so the
    // side comes from curvature. On a STRAIGHT kA is ~0 and -Math.sign(kA) is
    // not a direction, but `return 0` there makes the whole straight
    // undefendable (no covering the line into turn 1, no breaking the tow) and
    // leaves defendOnce's "one defensive move per straight" limiter (game.js,
    // beside this call) nothing to limit.
    // A straight has its own answer: cover the side the attacker is lining up
    // on. dx is the chaser's lateral offset from us, +x = right, so the side to
    // take IS its sign. Dead behind is not yet a move to cover — hold the line
    // and let defendOnce spend the move when they commit.
    // PREDICT THE ATTACKER (Liniger's defender plans against the attacker's
    // best reply): dead behind on a straight, the move it will make is the
    // one otSide / passSideBonus make for it — the inside of the next corner
    // (kTurn) once that corner is within two seconds of road. Cover that.
    let coverSide, straight = false;
    if (Math.abs(kA) > 0.004) {
      coverSide = -Math.sign(kA);
    } else {
      const ox = ctx.other && Number.isFinite(ctx.other.x) ? ctx.other.x : 0;
      const dx = ox - (ctx.x || 0);
      const kT = ctx.kTurn || 0;
      if (Math.abs(dx) >= 0.35) coverSide = dx > 0 ? 1 : -1;
      else if (!ctx.street && Math.abs(kT) > 0.004 && ctx.toTurnIn < 2 * Math.max(ctx.speed || 0, 10)) coverSide = -Math.sign(kT);
      else return 0;
      straight = true;
    }
    const coverRoom = coverSide > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    if (ctx.street && coverRoom < 2.2) return 0;
    // LEAVE A CAR'S WIDTH at the edge (FIA): never pull closer to the road
    // edge than a car width plus half a metre. roadL/R are the room to the
    // ROAD edge (roomL/R reach into the run-off on a permanent circuit).
    const road = coverSide > 0 ? ctx.roadR : ctx.roadL;
    const edgeCap = road != null ? Math.max(0, road - 2.5) : Infinity;
    const mag = lerp(0.2, 1.1, ctx.traits.craft)
      * clamp(1 - gT / winT, 0, 1) * clamp(coverRoom / 2, 0, 1)
      * houseMulCtx(ctx, 0.90, 1.12, "hold")
      * ordersMul(ctx.team, ctx.seat, ctx.other, "defend");
    // A straight cover is a lane move, not a chop: three fifths of the corner
    // pull, and defendOnce still spends it once per straight.
    const scale = (ctx.street ? 0.45 : 1) * (straight ? 0.6 : 1);
    return coverSide * Math.min(mag * scale, edgeCap);
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

  // CONTACT IS NOT CONFINEMENT. `contactT > 0 => boxed` would declare ANY rub —
  // even a clean side-by-side on a 15 m-wide permanent — wedged. Boxed feeds
  // stuckT -> unstuckActive, which cancels braking and yanks the car sideways,
  // so a driver leaning on an AI would switch it into dig-out mode with a whole
  // lane free. Contact counts only when the room is already gone.
  function isBoxed(ctx) {
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    if (roomL < 1.3 && roomR < 1.3) return true;
    if ((ctx.contactT || 0) > 0 && roomL < 1.6 && roomR < 1.6) return true;
    if (!(ctx.blocker && ctx.blockerGap < 6)) return false;
    if (ctx.street) return roomL < 1.8 && roomR < 1.8;
    return true;
  }

  // Dig-out is the FIRST recovery (cancel brakes, yank sideways). When it fails
  // — wall both sides, sandwich, pit laneX overwrite — unstuckActive used to
  // permanently veto the rescue (`!unstuckActive` in aiStuck), so a car crawled
  // at 0 m/s with stuckT climbing forever (monaco: 7.6 s, rescueT = 0). Past
  // this budget, rescue may arm even while dig-out is still on. Streets escalate
  // sooner: the walls leave less room for dig-out to succeed.
  function digOutBudget(t, street) {
    const base = lerp(3.5, 2.0, t && t.awareness != null ? t.awareness : 0.75);
    return street ? base * 0.6 : base;
  }
  function digOutEscalated(stuckT, t, street) {
    return (stuckT || 0) > stuckThreshold(t) + digOutBudget(t, street);
  }
  // ONCE DIG-OUT HAS FAILED, IT STAYS FAILED UNTIL DIG-OUT ENDS. digOutEscalated
  // is a line on stuckT, and dig-out's own sideways yank un-boxes the car for a
  // few frames — stuckT decays back under the line while the car is still at
  // walking pace and still digging. Unlatched, that flicker put `!unstuckActive`
  // back in charge: dig-out re-vetoed the rescue it had just escalated to, and
  // rescueT bled to zero and restarted (monaco, stalled pole car, 2026-10-07:
  // rescueT 1.23 of 1.25 → 0, worst crawl 5.3 s). Held while dig-out is still on
  // (`digging` = unstuckActive); clears the moment stuckT falls under the dig-out
  // threshold, i.e. the car got free or was rescued.
  function digOutHeld(held, escalatedNow, digging) {
    return !!escalatedNow || (!!held && !!digging);
  }

  // How long an AI must sit slow before the rescue unwedges it. Contact used to
  // VETO the rescue outright (`contactT === 0` in the aiStuck conjunction), so
  // the commonest way to be genuinely stuck — welded to another car — was the
  // one case that could never recover. It is a patience knob now, not a veto:
  // a pack shuffle clears long before the contact timer elapses. Once dig-out
  // has already failed (`escalated`), contact patience ran during that window
  // — use the short arm so a street wall-pile is not another 7 s of crawl.
  function aiRescueDelay(contacting, escalated) {
    if (escalated) return contacting ? 2.0 : 1.25;
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
    const kA = Math.abs(ctx.kTurn || 0) > 0.002 ? ctx.kTurn : (ctx.kAhead || 0);   // the corner the pass is FOR, else the bend ahead
    if (Math.abs(kA) > 0.002) return kA > 0 ? -1 : 1;   // inside = -sign(k)
    const lane = ctx.lane || 0;
    if (Math.abs(lane) > 0.05) return lane > 0 ? 1 : -1;
    return diff >= 0 ? 1 : -1;
  }

  // THE INSIDE AT THE CATCH POINT. The pass completes at the next turn-in
  // (passReach), so the side worth having is the inside of THAT corner —
  // kTurn, not the curvature 18-70 m ahead (which on a straight is ~0 and
  // left the choice to a coin of lane and room). AiCorridor adds this to a
  // lane's score: 0.8 for the inside of a real corner within 250 m (worth
  // over 3 m of extra room), otherwise the old 0.3 for otSide's pick.
  function passSideBonus(ctx, side) {
    const k = ctx.kTurn || 0;
    if (!ctx.street && Math.abs(k) > 0.004 && ctx.toTurnIn < 250) return side === -Math.sign(k) ? 0.8 : 0;
    return otSide(ctx) === side ? 0.3 : 0;
  }

  // LET PASS. A car that is faster, right behind, and not held up by anything
  // ahead of us is going past whatever we do; fighting it just wastes both
  // laps and is where the "AI welded to my bumper" pile-ups start. After a
  // patience window (awareness commits earlier) the AI moves toward its free
  // side and stops accelerating away — TORCS' OPP_LETPASS, minus the blue flag.
  // LET PASS IS A BLUE FLAG: a quicker car inside 9 m on our gearbox, closing, with
  // nothing ahead of US holding it up — and LAPPING us. Never a same-lap rival (the
  // player included), or it reads as "the AI doesn't defend": a racer makes the
  // faster car pass; a backmarker moves over.
  // The closing rate rides the pace scale (vScale = vTop()/VMAX), like queueBrake's bands.
  function letPassCase(racing, blocker, chaser, chaserGap, chaserSpeed, speed, vScale, lapping) {
    if (!racing || blocker || !chaser || !lapping || !(chaserGap < 9)) return false;
    return (chaserSpeed || 0) > (speed || 0) + 2.5 * (vScale > 0 ? vScale : 1);
  }
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

  // How much of the baked racing line (TrackLine) a driver takes in a corner
  // window: nearly all of it — the line IS the fast way round — with a "hold"
  // house style keeping a little of its own lane (a defensive habit). Streets
  // slightly less: the line's margins are already the whole road there.
  function lineFollow(street, hold) {
    const base = street ? 0.86 : 0.92;
    return hold ? clamp(base - hold * 0.06, 0.7, 0.95) : base;
  }

  try { Log.info("game", "AiDrive ready"); } catch (_) { /* Log absent in isolated VM */ }
  return {
    lateralScale, yawScale, cornerSpeed, traits, houseStyle, isMate, ordersMul, stuckThreshold, followTime, followGap, followBase, towGain, queueBrake, sepClamp,
    humanInvMass, contactGive, steerDamp, unstuckPull, streetOtScale, otFireRate,
    otShouldFire, wantBoost, wantX, brakeTarget, brakeDecision, adaptLane, otPull,
    defendPull, mirrorReach, defendWindowT, isBoxed, minLatGap, wallHitLoss, wallSteerScrub,
    wallAiScrub, beginLook, pushLook, endLook, aiRescueDelay, otSide,
    letPassCase, letPassDelay, letPassPull, letPassEase, queueFloor, laneFollow, unstuckLatFloor,
    digOutBudget, digOutEscalated, digOutHeld,
    otWant, repassLock, attemptRoll, runExtra, latchLate, cornerK, sbsCommitT, sbsEase, passSideBonus, queueTime, queuePatience, queuePress, passReach, passTarget, passSideClosed, passHold, passCooldown, sideYieldsA, humanYieldGrace, humanYieldBand, humanYieldT, humanYieldTakes, aimIntrudes, paceSample,
    launchPlan, launchMul, launchDone, startCalm, startCalmS, startGapT, pacePhase, rubDecel, bumpRestitution, humanPuntCap, squeezeEase, squeezeBrake,
    holdLineGap, defendOnce, lineFollow, attackOK, sideLevel,
    mistakeChance, mistakeTotal, mistakePhase, mistakeBrakeMul, mistakeGatherMul,
    tyreClass, tyrePace, stintPlan, pitNow, wornPays, degCost, splitStints, compoundFor, strategyTemper, tasteRoll,
    STRAT: { MAX_STOPS, CLASSES, CAUTION_REACH, UNDERCUT_REACH, UNDERCUT_LAPS, UNDERCUT_MIN_WEAR, STUCK_GAP_S, STUCK_LAPS, COVER_GAP_S, REPLAN_GAP, TEMPER, DEG_LIN, DEG_CLIFF, GRIP_TO_LAP, FUEL_WEAR, PIT_LOSS_FALLBACK, TASTE_BIAS, TASTE_SOFTEN, MIN_STINT, ONE_SET_LAPS },
  };
})();
