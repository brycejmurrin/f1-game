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
     • street vs permanent boxed/min-gap/racing-line mix (pack seating)
     • street tow / queue-brake / OT+defend pull / sep clamp / player mass
     • team houseStyle (from team.stats) + consistency brake band

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

  // Team house style from the already-authored team.stats (garage 0..100).
  // Midfield mean is ~85; ±25 covers Mercedes..Cadillac. attack = straight-line
  // hunger (OT / ERS / dive); hold = park-the-car (follow / defend / bank).
  // Missing stats → 0,0 so existing unit tests that omit `team` stay bit-identical.
  const _house = { attack: 0, hold: 0 };
  function houseStyle(team) {
    const s = team && team.stats;
    if (!s) { _house.attack = 0; _house.hold = 0; return _house; }
    _house.attack = clamp(((s.speed + s.accel) * 0.5 - 85) / 25, -1, 1);
    _house.hold = clamp(((s.cornering + s.braking) * 0.5 - 85) / 25, -1, 1);
    return _house;
  }
  function houseMul(team, lo, hi, axis) {
    const h = houseStyle(team);
    return lerp(lo, hi, ((axis === "hold" ? h.hold : h.attack) + 1) * 0.5);
  }

  // Look-ahead sample pool for updateCar's brake scan. beginLook/pushLook/endLook
  // recycle the array and the {d,k,bank} rows so ~20 AI cars × ~10 samples no
  // longer allocate every physics step (vegas physics profile: brakeTarget 1.4%).
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

  // Following gap added to followBase(). Aware drivers leave space. Streets
  // use a smaller pad so a 22-car train does not accordion 14 m deep.
  function followPad(t, street, team) {
    const pad = lerp(-0.8, 2.2, t.awareness) * houseMul(team, 0.92, 1.08, "hold");
    return street ? pad * 0.5 : pad;
  }

  // Queue distance (m) before the follow pad. Streets used to sit at 12 m
  // and stack into a parking lot; 8 m still tucks more than a permanent.
  function followBase(street) {
    return street ? 8 : 6;
  }

  // Slipstream vmax gain. Streets used to get none, so the 8 m train could
  // never close; a half-size tow still fits inside the follow cap.
  function towGain(street) {
    return street ? 0.022 : 0.045;
  }

  // Closing-on-blocker brake. Permanent stamps at +3 m/s (old rule). Streets
  // wait longer and ease in so a slow corner does not accordion the field.
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

  // Player invMass in pairContact. Streets: heavier so an AI lean-on does
  // not bounce the human into Armco (permanents keep the 0.5 "heavier" rule).
  function humanInvMass(street) {
    return street ? 0.42 : 0.5;
  }

  // Contact compliance: aware drivers yield more so a lean-on pass sticks.
  // Streets yield extra so the player can move an AI instead of bouncing.
  function contactGive(contacting, t, street) {
    if (!contacting) return 1;
    const give = lerp(0.55, 0.25, t.awareness);
    return street ? give * 0.72 : give;
  }

  // Steer command low-pass. Experience = smoother; rookies twitch.
  function steerDamp(t) {
    return lerp(5.5, 12.5, t.experience);
  }

  // Unstuck lateral pull (metres of target bias). Rookies panic harder.
  // Streets scale it down — 3 m of yank is a wall on Monaco.
  function unstuckPull(t, street) {
    const pull = lerp(3.4, 2.0, t.experience);
    return street ? pull * 0.55 : pull;
  }

  // Street circuits: awareness shrinks the overtake pull so they don't wall.
  // Floor 0.72 (was 0.55) so a clean gap still gets used after the seating fix.
  function streetOtScale(t) {
    return lerp(0.72, 1.0, t.awareness);
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
    const house = houseMul(ctx.team, 0.88, 1.12, "attack");
    return clamp(0.55 * situ * craftMul * awareMul * expMul * house, 0.08, 2.4);
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
    const hs = houseStyle(ctx.team);
    const rich = energy > (0.55 - hs.attack * 0.08);  // attack teams spend earlier
    const desperate = energy > 0.25 && catching;
    // Awareness banks charge: low-awareness drivers still dump early (old feel).
    // Hold-car teams (high corner/brake stats) bank a little sooner.
    const bank = ctx.traits.awareness > (0.8 - hs.hold * 0.08)
      && energy < (0.4 - hs.hold * 0.05) && !catching && !defending;
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
      vLim *= lerp(1.0, 1.07, t.craft) * houseMul(ctx.team, 0.99, 1.03, "attack");
    }
    return vLim;
  }

  const _br = { braking: false, brakeLvl: 0, vLim: 0, excess: 0 };
  function brakeDecision(ctx) {
    const vLim = brakeTarget(ctx);
    const speed = ctx.speed || 0;
    const excess = speed - vLim;
    // Soft band: start easing at +1 m/s, full pedal by +7 m/s at mid consistency.
    // Low consistency widens the band (messy); high snaps onto the mark. d=0
    // at the 0.75 default so existing brakeDecision tests stay bit-identical.
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

  // ── ADAPTIVE LANE ─────────────────────────────────────────────────────────
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
    // Bias around the grid home line (baseLane), not the live lane — otherwise
    // every frame adds another step and the field crawls to ±0.85.
    const home = ctx.baseLane != null ? ctx.baseLane : lane;
    const target = clamp(home + sign * step, -0.85, 0.85);
    return damp(lane, target, 0.35, dt);
  }

  // Lateral metres of overtake pull. Permanent = craft-scaled dive; street
  // uses awareness (streetOtScale) and a slightly stronger open-gap move than
  // the old 0.6–2.2 band so a clean side after the seating fix still gets used.
  function otPull(ctx) {
    const street = !!ctx.street;
    const t = ctx.traits;
    const gap = ctx.blockerGap;
    if ((ctx.speed || 0) < (ctx.blockerSpeed || 0) + (street ? 4 : 5)) return 0;
    if (gap >= (street ? 14 : 16)) return 0;
    const side = (ctx.roomR || 0) >= (ctx.roomL || 0) ? 1 : -1;
    const need = side > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    const house = houseMul(ctx.team, 0.90, 1.12, "attack");
    if (street) {
      return side * lerp(0.7, 2.35, clamp(1 - gap / 14, 0, 1))
        * clamp(need / 2.3, 0, 1) * streetOtScale(t) * house;
    }
    return side * lerp(0.8, 2.6, clamp(1 - gap / 16, 0, 1))
      * clamp(need / 2.2, 0, 1) * lerp(0.75, 1.3, t.craft) * house;
  }

  // Inside-line cover when a chaser is close and a corner is coming.
  // Streets only cover when the inside is actually open (no Armco dive).
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
      * houseMul(ctx.team, 0.90, 1.12, "hold");
    return coverSide * (ctx.street ? mag * 0.45 : mag);
  }

  // First-hit speed loss (incidence 0..1). Streets were 0.50 then 0.36; 0.30
  // still bites a head-on without parking a graze. Permanents stay 0.28.
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

  // Street trains follow at ~12 m. The old boxed rule treated ANY in-lane
  // car within 6 m as a wedge, so every slow street corner armed unstuck
  // and the field yanked sideways into each other (the bounce). A follow
  // stack is not a wedge unless the sides are tight too.
  function isBoxed(ctx) {
    if ((ctx.contactT || 0) > 0) return true;
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    if (roomL < 1.3 && roomR < 1.3) return true;
    if (!(ctx.blocker && ctx.blockerGap < 6)) return false;
    if (ctx.street) return roomL < 1.8 && roomR < 1.8;
    return true;
  }

  // Centres, not body edges. Combined car width is 2.0 m — below that is
  // overlap. Permanents keep 2.8. Streets scale with half-width so a 2-wide
  // canyon train does not steer at an impossible 3-wide gap.
  function minLatGap(hw, street) {
    if (!street) return 2.8;
    return clamp((hw || 5) * 0.44, 2.12, 2.45);
  }

  // Fraction of the racing-line offset mixed into targetX. Streets hold the
  // grid home seat more so the field does not collapse onto one line.
  function racingLineMix(street) {
    return street ? 0.32 : 0.55;
  }

  try { Log.info("game", "AiDrive ready"); } catch (_) { /* Log absent in isolated VM */ }
  return {
    traits, houseStyle, stuckThreshold, followPad, followBase, towGain, queueBrake, sepClamp,
    humanInvMass, contactGive, steerDamp, unstuckPull, streetOtScale, otFireRate,
    otShouldFire, wantBoost, brakeTarget, brakeDecision, adaptLane, otPull,
    defendPull, isBoxed, minLatGap, racingLineMix, wallHitLoss, wallSteerScrub,
    wallAiScrub, beginLook, pushLook, endLook,
  };
})();
