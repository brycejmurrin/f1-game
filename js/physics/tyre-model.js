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
  // the shipped default and is a TRUE no-op: gripMul/tractionMul/fuelMul all
  // return exactly 1, so tests/specs/physics-characterization.spec.js stays
  // bit-identical until somebody turns this on. Same argument as
  // js/race/reliability.js — an existing save must not start losing races
  // because the game was updated.
  const LEVELS = { off: 0, light: 0.55, real: 1 };
  function isLevel(v) { return Object.prototype.hasOwnProperty.call(LEVELS, v); }

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
  const LOAD_REF = 0.44;
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
  const LOAD_AI_BASE = 0.92;
  const LOAD_AI_STYLE = 0.45;   // full spread across the consistency axis
  const LOAD_AI_LONG = 0.30;
  function aiLoad(c, aTop) {
    const cons = clamp(c.consistency != null ? c.consistency : 0.75, 0, 1);
    const lng = clamp(Math.abs(c.accSm || 0) / Math.max(1, aTop), 0, 1);
    return clamp(LOAD_AI_BASE + LOAD_AI_STYLE * (1 - cons) + LOAD_AI_LONG * lng * lng
      + (c.offroad ? W_OFF : 0), LOAD_MIN, LOAD_MAX);
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
  const AI_CLASS = {
    soft:   { code: "S", life: 0.48, off: 0.004,  colour: [0.92, 0.12, 0.10] },
    medium: { code: "M", life: 0.74, off: 0,      colour: [0.96, 0.80, 0.10] },
    hard:   { code: "H", life: 1.05, off: -0.004, colour: [0.90, 0.90, 0.93] },
  };
  function classRecord(cls) {
    const t = AI_CLASS[cls] || AI_CLASS.medium;
    return { id: cls, code: t.code, life: t.life, off: t.off, tread: 0, colour: t.colour };
  }
  // The catalog row IS the compound (docs/research/TYRE-STRATEGY-DESIGN.md §6):
  // one axis, not a compound axis multiplied by an upgrade tier. The single
  // letter the HUD shows is derived from life rather than from the row's name,
  // so a signature-liveried clone reads as what it actually is.
  function optionRecord(opt) {
    if (!opt) return classRecord("medium");
    const life = lifeOf(opt);
    const tread = opt.wetTread || 0;
    return {
      id: opt.id, code: tread === 2 ? "W" : tread === 1 ? "I" : life < 0.40 ? "S" : life < 0.90 ? "M" : "H",
      life, off: 0, tread,
      colour: (opt.visual && opt.visual.band) || [0.9, 0.9, 0.93],
    };
  }

  // ── SESSION ───────────────────────────────────────────────────────────────
  function create(G) {
    Log.info("game", "TyreModel.create");
    let level = "off";

    function on() { return LEVELS[level] > 0; }
    function setLevel(v) { if (isLevel(v)) level = v; return level; }

    // Put a fresh set on a car. The ONLY place c.tyreWear is cleared, so a stop
    // and a re-grid cannot disagree about what "fresh" means.
    function fit(c, record) {
      if (!c) return;
      c.tyre = record || classRecord("medium");
      c.tyreWear = 0;
      c.tyreLap0 = c.lap || 0;
      c.tyreStints = (c.tyreStints || 0) + 1;
    }

    // The circuit's own tyre severity, 1.0 at the median. Authored per circuit
    // in js/circuits/<id>.js beside the other per-circuit tables; the real
    // spread is 0.022-0.097 s/lap (Austria highest, China lowest), normalised.
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
      const lapFrac = Math.abs(c.speed || 0) * dt / track.total;
      if (!(lapFrac > 0)) return;
      const load = c.human ? humanLoad(c, G.LAT_MAX) : aiLoad(c, G.aTop());
      const laps = lifeLaps(c.tyre.life, G.lapsTarget);
      c.tyreWear = (c.tyreWear || 0) + lapFrac * load * severity() * LEVELS[level] / laps;
      c._tyreLoad = load;    // debug/telemetry only — see __apex.tyres()
    }

    // The three multipliers game.js reads. Each is EXACTLY 1 when the setting is
    // off, which is what keeps the characterization baseline honest.
    function gripMul(c) { return on() && c ? gripFor(c.tyreWear) : 1; }
    function tractionMul(c) { return on() && c ? longFor(c.tyreWear) : 1; }
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
        lapsOn: lapsOn(c),
        stints: c.tyreStints || 0,
        load: +(c._tyreLoad || 0).toFixed(3),
        severity: +severity().toFixed(3),
        grip: +gripMul(c).toFixed(4),
        traction: +tractionMul(c).toFixed(4),
        fuel: +fuelFrac(c, G.lapsTarget).toFixed(3),
      };
    }

    return {
      fit, update, gripMul, tractionMul, fuelAccelMul, fuelVmaxMul,
      lapsOn, spent, info, severity,
      level: () => level, setLevel, on,
      classRecord, optionRecord,
    };
  }

  return {
    LEVELS, isLevel, deriveLife, lifeOf, lifeLaps, MIN_LIFE_LAPS,
    gripFor, longFor, humanLoad, aiLoad, fuelFrac,
    classRecord, optionRecord, AI_CLASS,
    DROP_LIN, DROP_CLIFF, GRIP_FLOOR, LONG_SHARE, LIFE_MIN, LIFE_MAX,
    create,
  };
})();
Object.freeze(TyreModel);
