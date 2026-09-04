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

  function queueBrake(speed, blockerSpeed, street) {
    const excess = (speed || 0) - (blockerSpeed || 0);
    const thresh = street ? 4.5 : 3;
    if (excess <= thresh) return 0;
    return street ? clamp((excess - thresh) / 4, 0.2, 1) : 1;
  }

  // Metres of proactive lateral-sep bias. 2.6 m of yank is a wall on Monaco.
  function sepClamp(street) {
    return street ? 1.55 : 2.6;
  }

  function humanInvMass(street) {
    return street ? 0.42 : 0.5;
  }

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
    const margin = street ? 4 : 5;
    const closing = (ctx.speed || 0) >= (ctx.blockerSpeed || 0) + margin;
    const held = (ctx.freeSpeed || 0) >= (ctx.blockerSpeed || 0) + margin;
    if (!closing && !held) return 0;
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
  };
})();
