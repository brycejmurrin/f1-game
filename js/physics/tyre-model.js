/* Apex 26 — TYRE MODEL: wear, the grip it costs, and the fuel burn that argues
 * with it. `docs/PHYSICS.md` used to end "There are no pit stops. The compound
 * is a pre-race commitment"; this module is the half of that sentence that
 * makes a compound choice mean something over a race distance; the pit lane
 * that lets you do anything about it is the other half.
 *
 * WHY A MODULE AND NOT LINES IN game.js: tests/data/ratchets.json ratchets
 * game.js at its current size, and the grip seam there already takes external
 * scalars (DebrisWorld.marbleGrip). This follows js/race/reliability.js: a
 * small, mostly stateless rules module with an explicit LEVELS scale that
 * SHIPS OFF, plus a create(G) for the session-bound reads.
 *
 * THE NUMBER THAT MATTERS MOST IS NOT A PHYSICS NUMBER. Lap options are
 * 3/5/10/25/FULL, and a full Monza is 53 laps of ~124 s — 110 minutes. Real
 * degradation is ~0.06 s/lap, so over a 25-lap stint it accumulates ~1.5 s
 * against a ~21 s pit loss: at real-world rates a stop is never worth making at
 * any distance this game offers. So a compound's LIFE IS A FRACTION OF THE
 * SCHEDULED RACE DISTANCE, not a lap count — a soft is spent at ~67% of
 * whatever you selected and a hyper-soft at ~38%. That makes a 3-lap blast tyre-free (correct — it
 * should not be a strategy game), a 10-lap race a marginal one-stop, and
 * 25/FULL the classic shape. Research and the numbers behind every constant:
 * docs/research/TYRE-STRATEGY-DESIGN.md.
 *
 * THE ARC MUST NOT REACH THE DRIVER (AGENTS.md §Physics). Nothing here reads
 * the track's curvature LUT or the racing line. Wear integrates the forces the CAR
 * ACTUALLY MADE — lateral and longitudinal utilisation of the friction circle,
 * body slip, kerbs, off-track. That is also the correct physics: sliding wears
 * tyres and corners do not (docs/research/TYRE-STRATEGY-DESIGN.md §2.4).
 */
const TyreModel = (function () {
  "use strict";

  const clamp = M4.clamp;

  // What the TYRE WEAR race setting means, as a scale on the wear rate. OFF is
  // a TRUE no-op: gripMul/tractionMul/fuelMul all return exactly 1, so
  // tests/specs/physics-characterization.spec.js stays bit-identical with it
  // selected. It is NOT the shipped default any more — the default is "real",
  // and it lives in js/data/settings-defaults.js, NOT at the call site:
  // store.get's _def() makes SettingsDefaults outrank the fallback argument, so
  // the `store.get("tyreWear", ...)` literal in js/game.js decides nothing.
  // This comment claimed "light" for four days after the owner file moved to
  // "real" — 1/0.55 = 1.82x the wear it documented — because the two landed 75
  // minutes apart from parallel sessions on the shared deploy branch. The
  // assertion at the foot of tests/unit/tyre-model.test.mjs does NOT guard this:
  // it checks that the setter calls tyres.setLevel, not what ships. The browser
  // fixtures still pin OFF so a physics baseline measures the driving model
  // rather than this month's default, which is why no spec would notice.
  // A set's life is nominal / LEVELS[level] laps — see planLaps().
  const LEVELS = { off: 0, light: 0.55, real: 1 };
  function isLevel(v) { return Object.prototype.hasOwnProperty.call(LEVELS, v); }

  // LATERAL FORCE CURVE — the shape of the tyre past its limit, for the
  // player's per-axle bicycle model in game.js (AI cars take the Frenet step
  // and never evaluate it). Input x = cs·α/mu (cornering stiffness times slip
  // angle over the axle's friction limit), output the normalised force in
  // [-1, 1], multiplied back by mu at the call site.
  //
  // It used to be tanh(x): slope 1 at the origin, saturating at 1 and NEVER
  // falling — so the front could be driven to 16° of slip with the force still
  // at 100 %, a flick at full lock turned the car 2.4× as far as a moderate
  // input at no cost, and nothing the driver overdid ever came back to bite.
  // Every developer account of tyre feel (docs/notes/PLAYER-PHYSICS-RESEARCH-
  // 2026-09.md §4) says the same thing: the linear range and the peak are the
  // easy part; the WIDTH of the plateau past the peak and the STEEPNESS of the
  // fall after it are what make a tyre feel real and drivable.
  //
  // Three regions, same units as before so every CS_* constant keeps its
  // meaning: sin(x) up to the peak at x = π/2 (slope 1 at 0, peak force exactly
  // mu), then a Gaussian fall from 1 to CURVE_FLOOR of width CURVE_FALL_W:
  // ≥ 0.97 of peak out to x ≈ 2.1 (the "limit zone" a driver leans on), 0.85 at
  // x = 3, the floor by x ≈ 5. Never oscillates, never negative, C¹ at the peak
  // — a Magic Formula with a sharpening E goes NEGATIVE at spin-sized slip
  // angles, which this model reaches every time a car goes round. The floor is
  // the "forgiving" end of the range shipped titles use (0.73 relative in
  // Vehicle Physics Pro's default curve; competition curves drop to ~0.55):
  // overdriving costs a quarter of the grip, enough to make smooth inputs
  // faster than flicks without turning the limit into a cliff on a keyboard.
  const CURVE_PEAK_X = Math.PI / 2;
  const CURVE_FLOOR = 0.75;
  const CURVE_FALL_W = 1.4;
  // The REAR's fall is gentler and shallower than the front's. Two reasons,
  // one physical and one for the hands on the controls: a rear tyre is the
  // wider, more progressive one, and a rear that lets go as sharply as the
  // front turns every yaw overshoot at a low-speed full-lock turn-in into a
  // spin nobody on a keyboard or a pad can feel coming (measured: 32 m/s, full
  // lock, coasting — rear 22° and gone with the front's parameters; held with
  // these). The front keeps the sharper fall: that is what makes a flick cost
  // grip and understeer legible. Both floors sit inside the "forgiving" range
  // shipped titles use (0.73–0.8 of peak).
  const CURVE_FLOOR_R = 0.80;
  const CURVE_FALL_W_R = 2.0;
  const CURVE_HOLD_R = 2.6;    // the rear holds its peak out to here before the fall starts (x; ≈ 11° at 30 m/s)
  function lateralCurve(x, floor, fallW, hold) {
    const ax = Math.abs(x);
    if (ax <= CURVE_PEAK_X) return Math.sin(x);
    const h = hold == null ? CURVE_PEAK_X : hold;
    if (ax <= h) return x < 0 ? -1 : 1;
    const fl = floor == null ? CURVE_FLOOR : floor, w = fallW == null ? CURVE_FALL_W : fallW;
    const d = (ax - h) / w;
    const g = fl + (1 - fl) * Math.exp(-d * d);
    return x < 0 ? -g : g;
  }

  // ── COMPOUND LIFE ─────────────────────────────────────────────────────────
  // Life as a fraction of the scheduled race distance (see the header). Derived
  // from the catalog row's own `cornering` stat rather than authored per row, so
  // a new tyre in js/car/parts.js gets a sane life without a second edit — and
  // so the catalog's grip ladder and its durability ladder cannot drift apart.
  //
  // The curve is exponential because the catalog's cornering spread is
  // multiplicative (0.92 hard → 1.36 hyper-soft) and because a linear fit puts
  // the softest compound at a negative life. Anchored at LIFE_MID for a medium
  // (cornering 1.00) and tuned so the named compounds land where the real ones
  // do relative to each other:
  //
  //   hard 0.92 → 1.06   medium 1.00 → 0.88   soft 1.12 → 0.67   hyper 1.36 → 0.38
  //
  // THE SPREAD IS 2.9x, NOT THE CATALOG'S OWN 5x. Deriving straight off the
  // cornering stat gave the hyper-soft 0.22 of a distance — four stops in a
  // 25-lap race, which is a gimmick and not a strategy. The catalog's cornering
  // spread (0.92 → 1.36) is a CAREER PROGRESSION ladder wearing compound names,
  // about three times wider than a real compound range, so the curve is
  // deliberately flatter than the stat it reads. Real soft-vs-hard stint life is
  // roughly 15-25 laps against 40+, i.e. ~2.3x; at 25 laps this lands hyper-soft
  // on 9, soft on 17, medium on 22 and hard on 26 — two stops, one stop, one
  // stop, none. That is the strategy space, and it is what these two numbers buy.
  //
  // Every row in js/car/parts.js carries its own `life` (authored from this
  // curve, so the ladder guard and the tool can both read it as plain data).
  // Exactly one row overrides it: `endurance_tyre` is sold as "holds its shape
  // lap after lap", and the derived value would make it an ordinary mid-life
  // tyre, erasing the only thing it is.
  const LIFE_MID = 0.88;
  const LIFE_K = 2.31;
  const LIFE_MIN = 0.30, LIFE_MAX = 1.20;
  function deriveLife(cornering) {
    const c = Number(cornering);
    return clamp(LIFE_MID * Math.exp(LIFE_K * (1 - (isFinite(c) ? c : 1))), LIFE_MIN, LIFE_MAX);
  }
  function lifeOf(opt) {
    if (!opt) return LIFE_MID;
    return opt.life != null ? clamp(+opt.life, LIFE_MIN, LIFE_MAX) : deriveLife(opt.cornering);
  }

  // A stint shorter than this many laps is not a stint, it is a gimmick. The
  // floor clears the SHORTEST race the lap ladder offers (3 laps) with margin,
  // so a 3-lap blast on the softest compound finishes on one set however the
  // fraction works out — which is the failure the whole distance-fraction idea
  // exists to prevent. It is deliberately only just clear: at 5 laps the softest
  // compound is spent right at the flag, so the extreme end of the catalog still
  // costs something even in a sprint.
  const MIN_LIFE_LAPS = 4;
  function lifeLaps(life, lapsTarget) {
    return Math.max(MIN_LIFE_LAPS, (life || LIFE_MID) * Math.max(1, lapsTarget || 1));
  }

  // ── LOAD ──────────────────────────────────────────────────────────────────
  // How hard this car is working its tyres THIS TICK, normalised so that a
  // clean racing lap averages ~1.0 and `lifeLaps` therefore means what it says.
  //
  // THE PLAYER AND THE AI ARE MEASURED DIFFERENTLY, AND THAT IS FORCED BY THE
  // ENGINE, not a shortcut. Only human cars run the full bicycle model, so
  // vLat / yawRateCur / axFrac / skidIntensity exist for them and for nobody
  // else (game.js gates all four on `c.human`). An AI car carries its own
  // simpler state — accSm, the kerb and off-track flags — so it is scored on
  // that plus a per-driver style factor. The two are calibrated to the same
  // ~1.0 clean-lap mean, which is what keeps a strategy fight fair.
  // THE REFERENCE IS MEASURED, NOT GUESSED. `lifeLaps` only means what its name
  // says if a clean racing lap scores ~1.0, and the raw weighted sum does not:
  // driven by the autopilot controller (tests/specs/autopilot.spec.js) with this
  // model armed, the DISTANCE-WEIGHTED load of a clean lap came out at
  //
  //   monza 0.35        monaco 0.535        (2026-09-14, tools/lib/harness.mjs)
  //
  // — because lateral load is what wears a tyre and Monza is mostly straight.
  // The ordering is right and worth keeping, so the divisor is set near the
  // middle of that range rather than at either end. Re-measured over three laps
  // with the divisor in (the first pass was dragged down by the standing start
  // and its out-lap), a clean lap now scores:
  //
  //   monza 0.944       monaco 1.221
  //
  // (Re-anchored to 0.49 when the fuel term below landed: a lap now carries a
  // fuel multiplier averaging ~1.11 over a race, so the divisor absorbs it and
  // a MID-RACE clean lap is what scores ~1.0. A lap on full tanks scores more,
  // which is the point of the term.)
  //
  // which at 25 laps gives stints of 28 / 23 / 18 / 8 laps at Monza and
  // 22 / 18 / 14 / 6 at Monaco for hard / medium / soft / hyper-soft. That is
  // the strategy space: at Monza the harder half goes the distance and the soft
  // is a one-stopper; at Monaco everything stops.
  //
  // CAVEAT, and the reason `tyreSeverity` exists. This severity EMERGES from
  // geometry — a circuit with more cornering wears more — while the real thing
  // also turns on speed and surface, and by those Monaco is one of the LOWEST
  // deg circuits on the calendar (0.050 s/lap against Austria's 0.097). So the
  // emergent number is the right shape and the wrong ranking for the slow
  // street circuits, and their defs are where that gets corrected.
  const LOAD_REF = 0.49;
  const LOAD_IDLE = 0.30;    // a tyre rolling in a straight line still wears
  const W_LAT = 0.95;        // squared lateral utilisation — the dominant term
  const W_LONG = 0.30;       // squared longitudinal (braking + traction)
  const W_SLIDE = 0.90;      // body slip: sliding is what actually wears rubber
  const W_KERB = 0.35;
  const W_OFF = 1.20;
  const LOAD_MIN = 0.20, LOAD_MAX = 3.0;

  // Squared, not linear, for two reasons: tyre energy is not linear in load, and
  // it is what makes a tidy lap materially cheaper than a scrappy one — the
  // thing this system exists to reward.
  function humanLoad(c, latMax) {
    const lat = clamp(Math.abs((c.speed || 0) * (c.yawRateCur || 0)) / Math.max(1, latMax), 0, 1.2);
    const lng = clamp(c.axFrac || 0, 0, 1);
    const slide = clamp(c.skidIntensity || 0, 0, 1);
    const raw = clamp(LOAD_IDLE + W_LAT * lat * lat + W_LONG * lng * lng + W_SLIDE * slide
      + (c.onKerb ? W_KERB : 0) + (c.offroad ? W_OFF : 0), LOAD_MIN, LOAD_MAX);
    return raw / LOAD_REF;
  }

  // The AI has no slip angle to read, so its lateral term is implicit: a car
  // driving the line at racing pace is doing LOAD_AI_BASE of work by
  // definition, and what varies is how ragged the driver is. Consistency is the
  // right axis — js/physics/ai-drive.js already uses it for mistakes, and a
  // driver who misses braking points is the same driver who abuses tyres.
  //
  // These are authored DIRECTLY on the normalised scale (a mid-rated driver
  // scores ~1.03), which is why there is no LOAD_REF here: the player's raw sum
  // has to be divided into that scale, the AI's is simply written in it.
  // A FULL TANK EATS TYRES. A heavier car works its rubber harder, which is
  // both true and the thing that makes a strategy MIX — harder rubber early,
  // softer late (AiDrive.stintPlan carries the same constant and would believe
  // it whether or not the sim did, which is the inconsistency this removes).
  // Applied to both load scales, so the player and the field pay it alike.
  const FUEL_LOAD = 0.22;
  function fuelLoadMul(c, lapsTarget) { return 1 + FUEL_LOAD * fuelFrac(c, lapsTarget); }

  const LOAD_AI_BASE = 0.92;
  const LOAD_AI_STYLE = 0.45;   // full spread across the consistency axis
  const LOAD_AI_LONG = 0.30;
  // …AND THE AI NEEDS ITS OWN DIVISOR, for the reason the player has LOAD_REF.
  // The three constants above were authored to read ~1.03 for a mid driver, but
  // that is the base and the style term ALONE: the longitudinal term adds to
  // every lap, and `fuelLoadMul` then multiplies the whole thing by ~1.11 over a
  // race. LOAD_REF absorbed that fuel factor for the player when the fuel term
  // landed; nothing absorbed it here, so the field quietly ran a fifth hot and
  // `lifeLaps` stopped meaning what its name says on the AI side only.
  //
  // MEASURED (scratch/tyre-load-check.cjs, 20-lap races, life-laps actually
  // consumed per racing lap, ~200 lap samples each):
  //
  //   monza 1.216      bahrain 1.231      monaco 1.248
  //
  // Tight, because unlike the player's path this one carries no geometry — only
  // consistency and longitudinal accel — so one divisor fits the calendar
  // instead of straddling a range the way LOAD_REF must. Divided AFTER the
  // clamp, exactly as humanLoad does, so the two paths stay the same shape.
  const LOAD_AI_REF = 1.23;
  function aiLoad(c, aTop) {
    const cons = clamp(c.consistency != null ? c.consistency : 0.75, 0, 1);
    const lng = clamp(Math.abs(c.accSm || 0) / Math.max(1, aTop), 0, 1);
    return clamp(LOAD_AI_BASE + LOAD_AI_STYLE * (1 - cons) + LOAD_AI_LONG * lng * lng
      + (c.offroad ? W_OFF : 0), LOAD_MIN, LOAD_MAX) / LOAD_AI_REF;
  }

  // ── GRIP ──────────────────────────────────────────────────────────────────
  // Piecewise: linear across the tyre's life, then a knee. The knee is the
  // "cliff" — real modern compounds mostly degrade linearly (Pirelli tried to
  // re-engineer a cliff for 2016 and failed), so the steep part is deliberately
  // only reachable by a driver who ignored every warning the HUD gave them.
  //
  // DROP_LIN is 5% of lateral grip across a full stint, which lands the
  // fresh-vs-worn delta at the 1-2 s/lap the real sport measures. DROP_CLIFF is
  // per unit of wear PAST life, so a lap or two over is survivable and five is
  // not. GRIP_FLOOR stops a forgotten set from turning the car into a boat.
  const DROP_LIN = 0.05;
  const DROP_CLIFF = 0.25;
  const GRIP_FLOOR = 0.70;
  // A tyre that lost only CORNERING grip reads as a handling bug rather than a
  // worn tyre, so traction and braking take a share of the same drop — smaller,
  // because degradation really is mostly lateral.
  const LONG_SHARE = 0.45;

  function gripFor(wear) {
    const w = Math.max(0, wear || 0);
    return clamp(1 - DROP_LIN * Math.min(w, 1) - DROP_CLIFF * Math.max(0, w - 1), GRIP_FLOOR, 1);
  }
  function longFor(wear) { return 1 - (1 - gripFor(wear)) * LONG_SHARE; }

  // ── PER-AXLE ──────────────────────────────────────────────────────
  // One wear number makes every set go off the same way, and that is not how a
  // driver experiences a tyre: fronts going means the car stops turning in,
  // rears going means it steps out on exit. Those are opposite complaints with
  // opposite answers — brake earlier vs. get on the throttle later — so the
  // split is what turns "the tyres are done" into something you can drive
  // around (docs/research/TYRE-STRATEGY-DESIGN.md §5.4).
  //
  // It is a BIAS ON THE SAME INTEGRATION, not a second model. The two shares
  // average to exactly 1, so c.tyreWear — the number the strategy planner, the
  // AI, the HUD and the pit call all read — is untouched, and what differs is
  // only the grip each axle sees. Braking loads the front and brake bias says
  // how much; traction loads the rear; the resting split leans slightly front
  // because a car set up for a race is understeer-limited on purpose.
  //
  // Only the PLAYER consumes it: game.js runs the per-axle bicycle model for
  // human cars alone (muF/muR), so an AI car accumulates the two numbers for
  // telemetry and drives on the mean. Same asymmetry the load model documents.
  const AXLE_LONG = 0.55;   // a full-effort brake or traction event tips this far
  const AXLE_REST = 0.06;   // the front's tilt on a neutral, purely lateral lap
  const AXLE_BB = 1.8;      // brake bias authority over the braking tilt
  const BB_REF = PhysicsConsts.BB_REF;   // 0.56 — the split with no front/rear tilt

  /** Signed longitudinal effort: -1 full braking .. +1 full traction. */
  function longSigned(c, aTop) {
    if (c.human) return ((c.axEstSm || 0) < 0 ? -1 : 1) * clamp(c.axFrac || 0, 0, 1);
    return clamp((c.accSm || 0) / Math.max(1, aTop), -1, 1);
  }
  /** [frontShare, rearShare] for this tick. Averages to exactly 1, by construction. */
  function axleShare(c, aTop) {
    const lng = longSigned(c, aTop);
    const bb = c.brakeBias != null && isFinite(c.brakeBias) ? c.brakeBias : BB_REF;
    // One expression for both directions: braking is lng < 0, so -lng tilts
    // front, and traction is lng > 0, so -lng tilts rear. Brake bias only gets
    // a say over the braking half — it does not move a traction event.
    const bias = lng < 0 ? clamp(1 + AXLE_BB * (bb - BB_REF), 0.3, 1.7) : 1;
    const d = clamp(AXLE_REST - lng * AXLE_LONG * bias, -0.9, 0.9);
    return [1 + d, 1 - d];
  }
  const AXLE_EVEN = Object.freeze({ f: 1, r: 1 });

  // ── TEMPERATURE ───────────────────────────────────────────────────────────
  // TWO STATES, and the second one is not decoration. Real tyres fail in two
  // opposite ways that a single temperature cannot tell apart
  // (docs/research/TYRE-STRATEGY-DESIGN.md §2.2): GRAINING is SURFACE damage
  // from cold or sliding rubber, costs 0.1-0.3 s/lap, and drives itself clean
  // again; BLISTERING is BULK damage from a core that got too hot, costs
  // 1 s/lap or more, and never recovers. One state gives you one failure and
  // therefore no decision — with two, backing off is a real move.
  //
  // What this buys, in the order it matters:
  //   1. THE OUT-LAP. A fresh set leaves the pits at blanket temperature and is
  //      worth ~0.4-0.6 s less than a warm one for a lap or so. That is the
  //      counterweight the undercut needs: without it a stop is free and always
  //      correct, which is a worse game than the one with the trade in it.
  //   2. PUSH VS MANAGE. Overheat a set and it goes off NOW and comes back if
  //      you ease — the one tyre decision a 5-lap race can contain.
  //   3. COMPOUND CHARACTER. Softs switch on in about a lap, hards take two or
  //      three, so the compound choice reaches the out-lap too.
  //
  // Degrees Celsius, because that is the unit the research is in and the unit a
  // HUD can show. Everything is 0/no-op while the setting is off.
  const T_AMBIENT = { dry: 30, overcast: 22, fog: 18, wet: 16, rain: 13 };
  const T_BLANKET = 70;      // FIA max blanket temperature; where a fresh set starts
  // Optimum window, per compound. Real slicks want 90-140 C by compound and the
  // usable band between "too cold to grip" and "too hot to survive" is only
  // 15-20 C wide. Softer compounds work cooler, so the optimum is derived from
  // `life` — the same number the whole model is keyed on — rather than authored
  // twice. Soft (0.48) lands ~91 C, medium (0.88) 105 C, hard (1.05) ~111 C.
  const T_OPT_MID = 105, T_OPT_SPAN = 35, T_WINDOW = 18;
  function optTemp(life) { return T_OPT_MID + T_OPT_SPAN * ((life == null ? LIFE_MID : life) - LIFE_MID); }

  // Heating is slip power: how hard the tyre is working times how fast the car
  // is going. Cooling is airflow, so it rises with speed too — which is why a
  // tyre cools on a straight and heats in a corner rather than simply tracking
  // pace. Calibrated so a clean racing lap settles inside the window from a
  // 30 C ambient, and a blanket-warm set reaches it in about a lap.
  // Calibrated so a car at racing load settles INSIDE its window and a cruising
  // one sits below it. COOL_V is deliberately small: cooling rises with airflow,
  // but heating rises with speed too, and a large COOL_V makes them cancel until
  // temperature stops depending on pace at all. At 1.5 a flat-out lap equilibrated
  // at 144 C against a 100 C optimum — measured, and the reason both this and
  // HEAT_K came down.
  const HEAT_K = 7.8, COOL_K = 0.06, COOL_V = 0.8;
  // The carcass follows the surface slowly and sheds heat slowly: a ~35 s time
  // constant against the surface's ~9 s. That gap IS the graining/blistering
  // distinction — the surface can be cold while the core is fine, and the core
  // can be cooking while the surface reads normal.
  const EXCH = 0.020, COOL_B = 0.008;
  // Softer compounds switch on faster (about a lap against two or three).
  function warmRate(life) { return clamp(1.35 - 0.4 * ((life == null ? LIFE_MID : life) / LIFE_MID), 0.7, 1.5); }

  // EACH COMPOUND EQUILIBRATES NEAR ITS OWN WINDOW at racing load, and that has
  // to be built in rather than hoped for. Scaling only the HEAT by warmRate made
  // a soft both heat faster AND want less heat, so it settled 19 C ABOVE its
  // window and was permanently overheating — measured at 128 C against a 91 C
  // optimum. Cooling is therefore solved for: given the reference lap below,
  // pick the cooling coefficient that puts equilibrium on the optimum. What
  // still differs between compounds is the TIME CONSTANT (both terms scale
  // together), which is exactly the "softs switch on in a lap, hards in three"
  // the research describes.
  //
  // The reference AMBIENT is fixed at dry on purpose: solving against the live
  // ambient would put every compound on its optimum in every weather, and a
  // cold track is supposed to give you a cold tyre.
  const T_REF_LOAD = 1.10, T_REF_V = 0.95;
  function coolFor(life) {
    const rise = Math.max(20, optTemp(life) - T_AMBIENT.dry);
    return HEAT_K * warmRate(life) * T_REF_LOAD * T_REF_V / ((1 + COOL_V * T_REF_V) * rise);
  }

  /** One tick of the two-state thermal model. Returns [surface, bulk] in C. */
  function stepTemp(ts, tb, { load, vFrac, amb, life, dt }) {
    const w = warmRate(life);
    const heat = HEAT_K * w * Math.max(0, load) * clamp(vFrac, 0, 1);
    const cool = coolFor(life) * (1 + COOL_V * clamp(vFrac, 0, 1)) * (ts - amb);
    const ns = ts + (heat - cool - EXCH * (ts - tb)) * dt;
    const nb = tb + (EXCH * (ts - tb) - COOL_B * (tb - amb)) * dt;
    // Clamped well outside anything the model produces, purely so a pathological
    // dt can never NaN a car's grip.
    return [clamp(ns, -40, 400), clamp(nb, -40, 400)];
  }

  // Grip against the window. Quadratic either side so the edges are forgiving
  // and the extremes are not; TEMP_FLOOR stops a stone-cold set from being
  // undriveable rather than merely slow.
  const COLD_PEN = 0.12, HOT_PEN = 0.12, TEMP_SPAN = 40, TEMP_FLOOR = 0.80;
  function tempGrip(ts, life) {
    if (ts == null) return 1;
    const opt = optTemp(life);
    const cold = Math.max(0, (opt - T_WINDOW) - ts) / TEMP_SPAN;
    const hot = Math.max(0, ts - (opt + T_WINDOW)) / TEMP_SPAN;
    return clamp(1 - COLD_PEN * cold * cold - HOT_PEN * hot * hot, TEMP_FLOOR, 1);
  }

  // GRAINING accumulates when the SURFACE is below its window and the tyre is
  // sliding — cold rubber tears rather than keys into the road — and heals once
  // the surface is back in the window. Recoverable by construction.
  // BLISTERING accumulates when the BULK is over its limit and never heals.
  const GRAIN_RATE = 0.055, GRAIN_HEAL = 0.02, GRAIN_GRIP = 0.05;
  const BLIST_OVER = 35, BLIST_RATE = 0.0012, BLIST_GRIP = 0.14;
  function stepGrain(grain, { ts, life, slide, dt }) {
    const opt = optTemp(life);
    const cold = clamp(((opt - T_WINDOW) - ts) / TEMP_SPAN, 0, 1);
    const g = (grain || 0) + (cold > 0 ? GRAIN_RATE * cold * clamp(slide, 0, 1) : -GRAIN_HEAL) * dt;
    return clamp(g, 0, 1);
  }
  function stepBlister(blister, { tb, life, dt }) {
    const over = tb - (optTemp(life) + T_WINDOW + BLIST_OVER);
    return clamp((blister || 0) + (over > 0 ? BLIST_RATE * over * dt : 0), 0, 1);
  }
  /** The two surface defects, as one grip multiplier. */
  function defectGrip(grain, blister) {
    return clamp(1 - GRAIN_GRIP * clamp(grain || 0, 0, 1) - BLIST_GRIP * clamp(blister || 0, 0, 1), 0.6, 1);
  }

  // ── FUEL ──────────────────────────────────────────────────────────────────
  // The counterweight, and the reason a stint has a SHAPE rather than a slope.
  // The car burns off fuel and gets faster while the tyre goes off and gets
  // slower; where those two curves cross is the pit window, and without this
  // term the crossing does not exist (docs/research/TYRE-STRATEGY-DESIGN.md §2.5).
  //
  // Scaled by the scheduled distance for the same reason life is: a 3-lap race
  // carries three laps of fuel, not a 305 km load. FUEL_ACCEL is the
  // acceleration penalty at a full tank, decaying linearly to nothing at the
  // flag — 2026 cars start on ~70 kg, worth ~2.1-2.8 s of lap time across a
  // race, so this is deliberately a small number that matters only cumulatively.
  const FUEL_ACCEL = 0.060;
  const FUEL_VMAX = 0.012;
  function fuelFrac(c, lapsTarget) {
    const n = Math.max(1, lapsTarget || 1);
    return clamp(1 - Math.max(0, c.lap || 0) / n, 0, 1);
  }

  // ── COMPOUND RECORDS ──────────────────────────────────────────────────────
  // Every car carries the same shape whether its compound came from the garage
  // catalog (the player and the MY TEAM team-mate) or from an AI class draw.
  // `off` is the AI's pace offset ONLY: the player's compound pace already lives
  // in mods.cornering via the catalog stat, and adding it here would double-count.
  // THE WET CLASSES ARE NOT OPTIONAL. An AI field with only slicks cannot answer
  // a dry->rain arc: it pits for the weather, fits another slick, is still on
  // the wrong tyre, and pits again — measured as a stop every lap. The two wet
  // rows are what make the weather call terminate.
  // The HUD/strip letter for a compound, from its LIFE and tread. One
  // classifier, because there were two: AI_CLASS below codes its soft at life
  // 0.48 "S", while optionRecord's inline ladder cut at 0.40 — so every soft in
  // the player's catalog (Soft 0.67, Super Soft 0.50, Sprint Soft 0.44,
  // C5 0.52, P Zero Red 0.56) read "M" on the strip while an AI on a longer-
  // lived compound read "S". Only the two one-lap specials fell under 0.40.
  // The boundaries sit in the catalog's own gaps (parts.js): softs run
  // 0.30-0.67, mediums 0.76-0.92, hards 1.00 up.
  function codeForLife(life, tread) {
    if (tread === 2) return "W";
    if (tread === 1) return "I";
    return life < 0.70 ? "S" : life < 0.95 ? "M" : "H";
  }

  const AI_CLASS = {
    soft:   { code: "S", life: 0.48, off: 0.004,  tread: 0, colour: [0.92, 0.12, 0.10] },
    medium: { code: "M", life: 0.74, off: 0,      tread: 0, colour: [0.96, 0.80, 0.10] },
    hard:   { code: "H", life: 1.05, off: -0.004, tread: 0, colour: [0.90, 0.90, 0.93] },
    // A player who owns no weather tyre gets the class fallback. Its dry-stat
    // cost must travel with it just as a catalog row's does; AI cars have no
    // tyreBaseMods and continue to use `off` instead, so this is not counted
    // twice on the field.
    inter:  { code: "I", life: 1.00, off: -0.010, tread: 1, colour: [0.10, 0.72, 0.24],
              mods: { speed: 0.92, accel: 0.93, cornering: 0.94, braking: 0.98 } },
    wet:    { code: "W", life: 1.10, off: -0.020, tread: 2, colour: [0.10, 0.40, 0.92],
              mods: { speed: 0.88, accel: 0.90, cornering: 0.90, braking: 0.94 } },
  };
  function classRecord(cls) {
    const t = AI_CLASS[cls] || AI_CLASS.medium;
    return { id: cls, code: t.code, life: t.life, off: t.off, tread: t.tread || 0, colour: t.colour,
             mods: t.mods || null };
  }
  // Which tread the conditions ask for: slick / intermediate / full wet. The
  // same ladder js/physics/consts.js WET_GRIP is indexed by, so "the right tyre"
  // means the one that actually wins there.
  function wetness(weather, arc) {
    const value = w => w === "rain" ? 1 : w === "wet" ? 0.5 : 0;
    if (!arc) return value(weather);
    const f = clamp(arc.t / Math.max(1, arc.dur), 0, 1);
    return value(arc.from) + (value(arc.to) - value(arc.from)) * f;
  }
  function weatherGrip(tread, w) {
    const table = PhysicsConsts.WET_GRIP, t = Number.isInteger(tread) && tread >= 0 && tread <= 2 ? tread : 0;
    w = clamp(w, 0, 1);
    return w <= 0.5 ? 1 + (table.wet[t] - 1) * w * 2 : table.wet[t] + (table.rain[t] - table.wet[t]) * (w - 0.5) * 2;
  }
  function treadFor(weather, wetness) {
    if (Number.isFinite(wetness)) return wetness >= 0.72 ? 2 : wetness >= 0.25 ? 1 : 0;
    return weather === "rain" ? 2 : weather === "wet" ? 1 : 0;
  }
  function classForTread(tread) { return tread === 2 ? "wet" : tread === 1 ? "inter" : null; }
  // The catalog row IS the compound (docs/research/TYRE-STRATEGY-DESIGN.md §6):
  // one axis, not a compound axis multiplied by an upgrade tier. The single
  // letter the HUD shows is derived from life rather than from the row's name,
  // so a signature-liveried clone reads as what it actually is.
  function optionRecord(opt) {
    if (!opt) return classRecord("medium");
    const life = lifeOf(opt);
    const tread = opt.wetTread || 0;
    return {
      id: opt.id, code: codeForLife(life, tread),
      life, off: 0, tread,
      colour: (opt.visual && opt.visual.band) || [0.9, 0.9, 0.93],
      // Fitted performance, separate from the rest of the build. game.js stores
      // a tyre-free base on a human car; applyCompound always rebuilds from it,
      // so repeated stops cannot multiply a compound into itself.
      mods: {
        speed: opt.speed == null ? 1 : opt.speed,
        accel: opt.accel == null ? 1 : opt.accel,
        cornering: opt.cornering == null ? 1 : opt.cornering,
        braking: opt.braking == null ? 1 : opt.braking,
      },
    };
  }

  const STAT_KEYS = ["speed", "accel", "cornering", "braking"];
  function applyCompound(c, record) {
    if (!c) return null;
    c.tyre = record || classRecord("medium");
    // `null` is the competent-field sentinel: ordinary AI is assumed to have
    // the right weather tyre. Player and MY TEAM cars carry an explicit tread,
    // which a real stop must replace.
    if (c.tread !== null) c.tread = c.tyre.tread || 0;
    if (c.tyreBaseMods) {
      const out = c.mods || (c.mods = {}), tm = c.tyre.mods || null;
      for (const k of STAT_KEYS) out[k] = c.tyreBaseMods[k] * (tm && tm[k] != null ? tm[k] : 1);
    }
    return c.tyre;
  }

  // An AI strategy owns its starting compound when wear is enabled. In
  // particular, a MY TEAM mate's saved garage tyre must not override the plan.
  function startRecord(c) {
    if (c && c.pitPlan && !c.human) return classRecord(c.pitPlan.start);
    return c && c.tyreOpt ? optionRecord(c.tyreOpt) : classRecord(c && c.tyreClass);
  }

  // ── SESSION ───────────────────────────────────────────────────────────────
  function create(G) {
    Log.info("game", "TyreModel.create");
    let level = "off";

    function on() { return LEVELS[level] > 0; }
    function setLevel(v) { if (isLevel(v)) level = v; return level; }
    // How many laps a set ACTUALLY lasts at the setting in force — the number a
    // STRATEGY has to plan against. lifeLaps() is the nominal, level-free life,
    // and wear then accrues at LEVELS[level]/lifeLaps per lap, so a set survives
    // lifeLaps / LEVELS[level] laps. The planner used to ask lifeLaps() direct,
    // which is only right at `real` (1.0); at `light` (0.55, one click away)
    // a set lasts 1.82x longer and the AI pitted for tyres it had not used —
    // measured identical first stops (lap 7) and stop counts at light and real,
    // because the plan could not see the setting. At `off` nothing wears, so the
    // honest answer is "the whole race".
    function planLaps(life, lapsTarget) {
      const k = LEVELS[level];
      return k > 0 ? lifeLaps(life, lapsTarget) / k : Math.max(1, lapsTarget || 1);
    }

    // Put a fresh set on a car. The ONLY place c.tyreWear is cleared, so a stop
    // and a re-grid cannot disagree about what "fresh" means.
    function fit(c, record) {
      if (!c) return;
      applyCompound(c, record);
      c.tyreWear = 0;
      c.tyreWearF = 0; c.tyreWearR = 0;
      // A FRESH SET COMES OUT OF BLANKETS, not up to temperature. This one line
      // is the out-lap: the set is below its window for a lap or so and worth
      // ~0.4-0.6 s less, which is the counterweight that stops an undercut from
      // being free and therefore always correct.
      c.tyreTs = T_BLANKET; c.tyreTb = T_BLANKET;
      c.tyreGrain = 0; c.tyreBlister = 0;
      c.tyreLap0 = c.lap || 0;
      c.tyreStints = (c.tyreStints || 0) + 1;
      // THE STINT LOG, which is what the results sheet draws. Recorded HERE
      // because fit() is the only place a set is ever changed, so the log and
      // the car can never disagree about what was on it — the alternative,
      // reconstructing stints from the pit events afterwards, loses the grid
      // set entirely (nobody pits for it) and gets the lap numbers off by one
      // whenever a stop straddles the line. `lap1` stays null on the set the
      // car is on; closeStints() at the flag fills the last one in.
      const log = c.tyreLog || (c.tyreLog = []);
      const last = log[log.length - 1];
      if (last && last.lap1 == null) last.lap1 = c.lap || 0;
      log.push({ code: c.tyre.code, id: c.tyre.id, colour: c.tyre.colour,
                 lap0: c.lap || 0, lap1: null });
    }
    /** Close the open stint at the flag, so the results strip has an end lap. */
    function closeStints(c) {
      const log = c && c.tyreLog;
      if (!log || !log.length) return;
      const last = log[log.length - 1];
      if (last.lap1 == null) last.lap1 = c.lap || 0;
    }
    /** The stint strip for one car: [{code, colour, lap0, lap1, laps}, …]. */
    function stints(c) {
      if (!c || !c.tyreLog) return [];
      const end = c.lap || 0;
      return c.tyreLog.map(function (e) {
        const lap1 = e.lap1 == null ? end : e.lap1;
        return { code: e.code, id: e.id, colour: e.colour,
                 lap0: e.lap0, lap1, laps: Math.max(0, lap1 - e.lap0) };
      });
    }

    // The circuit's own tyre severity, 1.0 at the median. Authored per circuit
    // in js/circuits/<id>.js beside the other per-circuit tables; the real
    // spread is 0.022-0.097 s/lap (Austria highest, China lowest), normalised.
    /** Track/air temperature for the current conditions. */
    function ambient() {
      const t = T_AMBIENT[G.raceWeather];
      return t == null ? T_AMBIENT.dry : t;
    }

    function severity() {
      const def = G.track && G.track.def;
      const v = def && def.tyreSeverity;
      return v != null && isFinite(v) ? clamp(+v, 0.4, 2.0) : 1;
    }

    // Integrate one physics tick. Distance-based, not time-based: wear reaches
    // 1.0 after `lifeLaps` laps at load 1.0, which is what makes the constant
    // above mean what its name says regardless of pace, PACE or lap time.
    function update(c, dt) {
      if (!on() || !c || c.retired || c.finished) return;
      const track = G.track;
      if (!track || !(track.total > 0) || !(dt > 0)) return;
      if (!c.tyre) fit(c, classRecord("medium"));
      const load = (c.human ? humanLoad(c, G.LAT_MAX) : aiLoad(c, G.aTop()))
        * fuelLoadMul(c, G.lapsTarget);
      c._tyreLoad = load;    // debug/telemetry only — see __apex.tyres()
      // TEMPERATURE FIRST, and on the CLOCK rather than on distance. Heat is a
      // rate: a car held in its pit box at zero speed must cool, and a car
      // parked on the grid must not stay at blanket temperature forever. This
      // ran after the distance early-return at first, which meant a stationary
      // car's tyres never changed temperature at all — measured.
      const amb = ambient();
      if (c.tyreTs == null) { c.tyreTs = amb; c.tyreTb = amb; }
      const vFrac = Math.abs(c.speed || 0) / Math.max(1, G.vTop());
      const t = stepTemp(c.tyreTs, c.tyreTb, { load, vFrac, amb, life: c.tyre.life, dt });
      c.tyreTs = t[0]; c.tyreTb = t[1];
      // Graining needs a measured slide, which only human cars have (the same
      // asymmetry the load model documents). An AI car still heats, cools and
      // blisters; it just never grains, and the field is scored on one curve
      // either way because blistering is the bulk-temperature failure.
      const slide = c.human ? (c.skidIntensity || 0) : 0;
      c.tyreGrain = stepGrain(c.tyreGrain, { ts: c.tyreTs, life: c.tyre.life, slide, dt });
      c.tyreBlister = stepBlister(c.tyreBlister, { tb: c.tyreTb, life: c.tyre.life, dt });
      // WEAR is distance, so it stops when the car does.
      const lapFrac = Math.abs(c.speed || 0) * dt / track.total;
      if (!(lapFrac > 0)) return;
      const laps = lifeLaps(c.tyre.life, G.lapsTarget);
      const dw = lapFrac * load * severity() * LEVELS[level] / laps;
      c.tyreWear = (c.tyreWear || 0) + dw;
      const sh = axleShare(c, G.aTop());
      c.tyreWearF = (c.tyreWearF || 0) + dw * sh[0];
      c.tyreWearR = (c.tyreWearR || 0) + dw * sh[1];
    }

    // The three multipliers game.js reads. Each is EXACTLY 1 when the setting is
    // off, which is what keeps the characterization baseline honest.
    // The three things that cost grip, multiplied: how worn the set is, how far
    // it is from its window, and what the surface and core have done to it.
    function gripMul(c) {
      if (!on() || !c) return 1;
      const life = c.tyre ? c.tyre.life : null;
      return gripFor(c.tyreWear) * tempGrip(c.tyreTs, life) * defectGrip(c.tyreGrain, c.tyreBlister);
    }
    // Traction and braking take the same SHARE of the whole drop that wear alone
    // used to take — a cold set is down on traction too, not only on cornering.
    function tractionMul(c) {
      if (!on() || !c) return 1;
      return 1 - (1 - gripMul(c)) * LONG_SHARE;
    }
    // The FRONT/REAR grip split, RELATIVE to gripMul. game.js already carries
    // the shared part in muBase, so handing it absolute axle grip would count
    // wear twice; a ratio is what the per-axle seam actually wants, and it
    // cancels the temperature and defect terms (both axles share them) down to
    // the one thing that really differs. Exactly 1/1 while the setting is off.
    function axleSplit(c) {
      if (!on() || !c || c.tyreWearF == null) return AXLE_EVEN;
      const base = gripFor(c.tyreWear);
      return { f: gripFor(c.tyreWearF) / base, r: gripFor(c.tyreWearR) / base };
    }
    function fuelAccelMul(c) {
      return on() && c ? 1 / (1 + FUEL_ACCEL * fuelFrac(c, G.lapsTarget)) : 1;
    }
    function fuelVmaxMul(c) {
      return on() && c ? 1 / (1 + FUEL_VMAX * fuelFrac(c, G.lapsTarget)) : 1;
    }

    // Laps this set has run, and how far through its life that is. `wearOf` is
    // the raw state; `spent` is what the HUD bar and the engineer read, because
    // "80% through the stint" is the thing a driver can act on.
    function lapsOn(c) { return c && c.tyre ? Math.max(0, (c.lap || 0) - (c.tyreLap0 || 0)) : 0; }
    function spent(c) { return c ? clamp(c.tyreWear || 0, 0, 2) : 0; }

    function info(c) {
      if (!c) return null;
      const t = c.tyre || null;
      return {
        level, on: on(),
        compound: t ? t.id : null,
        code: t ? t.code : null,
        life: t ? t.life : null,
        lifeLaps: t ? +lifeLaps(t.life, G.lapsTarget).toFixed(2) : null,
        wear: +spent(c).toFixed(4),
        wearF: c.tyreWearF != null ? +c.tyreWearF.toFixed(4) : null,
        wearR: c.tyreWearR != null ? +c.tyreWearR.toFixed(4) : null,
        lapsOn: lapsOn(c),
        stints: c.tyreStints || 0,
        load: +(c._tyreLoad || 0).toFixed(3),
        severity: +severity().toFixed(3),
        // Temperature and the two surface defects (see the TEMPERATURE block).
        tempS: c.tyreTs != null ? +c.tyreTs.toFixed(1) : null,
        tempB: c.tyreTb != null ? +c.tyreTb.toFixed(1) : null,
        tempOpt: t ? +optTemp(t.life).toFixed(1) : null,
        tempWindow: T_WINDOW,
        ambient: ambient(),
        grain: +(c.tyreGrain || 0).toFixed(4),
        blister: +(c.tyreBlister || 0).toFixed(4),
        tempGrip: +tempGrip(c.tyreTs, t ? t.life : null).toFixed(4),
        defectGrip: +defectGrip(c.tyreGrain, c.tyreBlister).toFixed(4),
        grip: +gripMul(c).toFixed(4),
        traction: +tractionMul(c).toFixed(4),
        axleF: +axleSplit(c).f.toFixed(4),
        axleR: +axleSplit(c).r.toFixed(4),
        fuel: +fuelFrac(c, G.lapsTarget).toFixed(3),
      };
    }

    return {
      fit, update, gripMul, tractionMul, axleSplit, fuelAccelMul, fuelVmaxMul,
      stints, closeStints,
      lapsOn, spent, info, severity,
      level: () => level, setLevel, on, planLaps,
      classRecord, optionRecord, applyCompound, startRecord,
    };
  }

  return {
    LEVELS, isLevel, lateralCurve, CURVE_PEAK_X, CURVE_FLOOR, CURVE_FALL_W, CURVE_FLOOR_R, CURVE_FALL_W_R, CURVE_HOLD_R, deriveLife, lifeOf, lifeLaps, MIN_LIFE_LAPS,
    gripFor, longFor, humanLoad, aiLoad, fuelFrac,
    optTemp, warmRate, coolFor, stepTemp, tempGrip, stepGrain, stepBlister, defectGrip,
    axleShare, longSigned, AXLE_LONG, AXLE_REST, BB_REF,
    T_AMBIENT, T_BLANKET, T_OPT_MID, T_OPT_SPAN, T_WINDOW, TEMP_FLOOR,
    GRAIN_GRIP, BLIST_GRIP, BLIST_OVER,
    classRecord, optionRecord, applyCompound, startRecord, AI_CLASS, codeForLife, treadFor, classForTread, wetness, weatherGrip,
    DROP_LIN, DROP_CLIFF, GRIP_FLOOR, LONG_SHARE, LIFE_MIN, LIFE_MAX, FUEL_LOAD,
    create,
  };
})();
Object.freeze(TyreModel);
