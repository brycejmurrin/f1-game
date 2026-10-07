/* GameAudioToneModel: constant manufacturer timbre, player presets and positive pitch ranges. patchTune mutates the supplied tune using recognized finite fields; nameForTune derives its matching preset, preserving the current name on ties. No audio nodes or context state. */
"use strict";

var GameAudioToneModel = (function () {
  // Per-manufacturer engine character, keyed by team.engine (js/data/teams.js).
  // Every field is CONSTANT TIMBRE — a fixed multiplier or filter, never a
  // function of rev — so tools/check/audio-test.cjs's invariants (pitch monotonic in
  // rev per gear, gear1 < gear4 at redline) hold for every voice by
  // construction. rateTrim ±3% pitch offset · detune cents on the sample ·
  // formantHz/Gain a peaking EQ between engFilter and engGain (0 gain = no
  // node) · cutTrim scales the lowpass (bright vs muffled) · whineHz/Lvl the
  // turbo/MGU character · synthSpread/subLvl shape the oscillator fallback.
  const ENGINE_VOICES = {
    "default":       { rateTrim: 1.00, detune: 0,   formantHz: 0,    formantGain: 0, cutTrim: 1.00, whineHz: 1500, whineLvl: 1.0, synthSpread: 1.009, subLvl: 1.0 },
    "Mercedes":      { rateTrim: 1.00, detune: 0,   formantHz: 1250, formantGain: 3, cutTrim: 1.05, whineHz: 1600, whineLvl: 0.9, synthSpread: 1.007, subLvl: 0.9 },
    "Ferrari":       { rateTrim: 1.03, detune: 25,  formantHz: 1900, formantGain: 5, cutTrim: 1.12, whineHz: 1500, whineLvl: 0.8, synthSpread: 1.013, subLvl: 0.8 },
    "Red Bull Ford": { rateTrim: 0.99, detune: -15, formantHz: 800,  formantGain: 4, cutTrim: 0.96, whineHz: 1350, whineLvl: 0.7, synthSpread: 1.018, subLvl: 1.2 },
    "Honda":         { rateTrim: 1.01, detune: 10,  formantHz: 1500, formantGain: 2, cutTrim: 1.04, whineHz: 1750, whineLvl: 1.1, synthSpread: 1.005, subLvl: 0.95 },
    "Audi":          { rateTrim: 0.98, detune: -20, formantHz: 950,  formantGain: 3, cutTrim: 0.92, whineHz: 2100, whineLvl: 1.5, synthSpread: 1.010, subLvl: 1.1 },
  };

  // PLAYER TUNE — a second trim layered OVER the manufacturer voice, owned by
  // the player instead of the team. It keeps the SAME constant-timbre contract
  // ENGINE_VOICES states above: every field is a fixed multiplier, never a
  // function of rev, so tools/check/audio-test.cjs's invariants (pitch
  // monotonic in rev per gear, gear1 < gear4 at redline) hold by construction.
  //
  // THE PITCH CURVE IS FOUR KNOBS, and they are independent on purpose.
  //   rate(rev) = (IDLE_RATE * idle + SPAN_RATE * revRange * rev^curve) * pitch
  // The first cut had only `pitch` and `revRange`, and `pitch` scaled BOTH
  // ends: the only way to a lower, lumpier idle was to pull the whole curve
  // down, and REV RANGE topped out well before it could put the redline back.
  // Measured: PITCH 0.6 + REV RANGE 2.5 reached a redline rate of 0.83 against
  // the stock 0.70 — a fifth of an octave, for a slider that reads "2.5x". A
  // low grumble at idle with a proper scream at the top was simply not in the
  // reachable set. So `idle` now moves the idle end ALONE, `revRange` the span
  // alone, `pitch` transposes the finished curve, and `curve` bends the path
  // between them — an exponent on rev, so above 1 the note hangs low through
  // the mid-range and climbs late, which is the V10-era shape; below 1 it
  // rises early and flattens.
  //
  // Every one of them is clamped strictly positive and none is a function of
  // rev, which is exactly what monotonicity needs: the rev term keeps its sign
  // (rev^curve is increasing for any curve > 0), and both gears take the same
  // factors, so the ordering is untouched. `sub` weights the sub-octave;
  // `gravel` the crank-rate roughness that fades with rev; `brakes` the
  // carbon-brake roar; `shift` the gear-change crack.
  //
  // The LIMITER is three knobs because a chop has three things to hear:
  // `limiter` is the DEPTH of the cut, `limRate` how many times a second it
  // cuts (13 Hz stock), `limPitch` how far the note sags on each cut, which is
  // the rpm dropping under a dead ignition. BOOST is two: `boost` the level of
  // the ERS whine and the deploy whoosh, `boostPitch` the rev lift under
  // deploy (4% stock). `harvest`, `wind`, `screech` and `rivals` are levels
  // for layers that only had a switch.
  // The SHIPPED voice, no longer a pure identity trim over the sample core:
  // pitch down and the rev range widened so the climb to the limiter is
  // longer, detune off (the chorus that blurred the top end; on the sample
  // core 0..1 is no offset — engine.js sampleDetuneCents), the sub layer
  // well back, a hard fast limiter, and the 2026 PU electric layer pulled up
  // (MGU-K-forward, whine + BOOST above the turbo-era trim). Every value is
  // inside TUNE_RANGE below; the panel's step table still lands on each one.
  const TUNE_DEF = Object.freeze({
    pitch: 0.85, idle: 1, revRange: 1.3, curve: 1, detune: 0, brightness: 1, gravel: 1, sub: 0.25,
    limiter: 2.25, limRate: 0.8, limPitch: 0, boost: 1.12, boostPitch: 1,
    whine: 0.62, harvest: 1, wind: 1, screech: 1, brakes: 1, shift: 1, rivals: 1, reverb: 1, overrun: 1,
  });
  // WIDER THAN IS SENSIBLE, on purpose. The first cut of these ranges was
  // conservative enough that several trims could not be pushed far enough to
  // hear at all — a tuner whose extremes sound like its middle is a tuner
  // nobody can learn. Every range still contains 1.0 EXACTLY (the panel's step
  // table is chosen so an integer slider position lands on it), and the four
  // pitch-curve fields stay strictly positive, which is the whole of what the
  // pitch invariants need. The far ends are meant to be too much; that is what
  // ends are for. Reach, at the corners, on the sample core: idle rate 0.051
  // (IDLE 0.5 x PITCH 0.6) up to a redline rate of 4.17 (IDLE 1.6, REV RANGE
  // 4, PITCH 1.8) — an 80:1 spread against the shipped 4.9:1 (engine.js
  // RATE_IDLE / RATE_SPAN, the same in every gear).
  const TUNE_RANGE = Object.freeze({
    pitch:      [0.60, 1.80], idle:  [0.50, 1.60], revRange: [0.20, 4.00], curve: [0.40, 2.50],
    detune:     [0, 4],       brightness: [0.30, 2.50], gravel: [0, 4],    sub: [0, 4],
    limiter:    [0, 3],       limRate: [0.40, 3.00], limPitch: [0, 4],
    boost:      [0, 4],       boostPitch: [0, 4],
    whine:      [0, 4],       harvest: [0, 4],     wind:     [0, 4],    screech: [0, 4],
    brakes:     [0, 4],       shift: [0, 3],       rivals:   [0, 4],    reverb:  [0, 4],   overrun: [0, 4],
  });

  // Layer switches. Each names a node that already exists, so muting one is a
  // gain target of 0 — and because every muted layer goes through aimGain, its
  // steady state costs no per-frame scheduling at all (the _apexAimTgt guard,
  // the same idiom limGain/lfoG use further down).
  const LAYER_DEF = Object.freeze({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true, sub: true, gravel: true, brakes: true, rivals: true, reverb: true, overrun: true });

  // Named tune presets the player picks INSTEAD of inheriting the team's
  // engine. "team" is the shipped behaviour: identity trims, and ENGINE_VOICES
  // still keys off team.engine. The rest layer over whatever voice the team
  // gave, so a Ferrari on COCKPIT is still recognisably a Ferrari.
  // Fields a profile omits fall back to TUNE_DEF (setProfile), so a preset
  // only names what it moves.
  const SOUND_PROFILES = Object.freeze({
    team:      null,
    broadcast: { pitch: 1.02, detune: 0.9, revRange: 1.05, brightness: 1.18, whine: 1.30, sub: 0.80, limiter: 1.00, gravel: 0.60, brakes: 0.90, shift: 1.10, boost: 1.20, rivals: 1.20, wind: 0.80 },
    trackside: { pitch: 0.99, detune: 1.3, revRange: 1.00, brightness: 0.82, whine: 0.65, sub: 1.15, limiter: 0.85, idle: 0.95, gravel: 1.40, brakes: 1.20, shift: 0.90, wind: 1.40, screech: 1.30, rivals: 1.50, limPitch: 0.70 },
    cockpit:   { pitch: 1.00, detune: 1.0, revRange: 0.92, brightness: 0.68, whine: 0.85, sub: 1.60, limiter: 1.35, curve: 0.95, gravel: 1.30, brakes: 1.50, shift: 1.40, limPitch: 1.30, harvest: 1.20, wind: 0.70, boost: 1.10 },
    // A V10 idles low and lazy, hangs there, then climbs to a shriek: low idle,
    // wide span, a late curve, almost none of the turbo-era roughness, a hard
    // fast limiter — and no hybrid, so the ERS layers all but vanish.
    v10:       { pitch: 1.07, detune: 2.2, revRange: 1.60, brightness: 1.28, whine: 0.10, sub: 0.70, limiter: 1.15, idle: 0.85, curve: 1.25, gravel: 0.30, brakes: 0.80, shift: 1.20, limRate: 1.30, limPitch: 1.50, boost: 0.15, boostPitch: 0.50, harvest: 0.20 },
  });

  function patchTune(tune, patch) {
    if (patch) for (const k of Object.keys(TUNE_DEF)) {
      const v = patch[k];
      if (typeof v !== "number" || !isFinite(v)) continue;
      const [lo, hi] = TUNE_RANGE[k];
      tune[k] = Math.max(lo, Math.min(hi, v));
    }
  }
  // The profile the live tune actually IS, or "custom". Derived rather than
  // latched: dragging a slider away and back again should relight the preset it
  // matches, and a one-way flip to "custom" would leave the row dark until the
  // player pressed RESET. The current name wins any tie so identical presets
  // could never make the row jump between two equally-true labels.
  function nameForTune(tune, profileName) {
    const fits = (name) => {
      if (!Object.prototype.hasOwnProperty.call(SOUND_PROFILES, name)) return false;
      const want = Object.assign({}, TUNE_DEF, SOUND_PROFILES[name] || {});
      return Object.keys(TUNE_DEF).every((k) => Math.abs(tune[k] - want[k]) < 1e-9);
    };
    if (fits(profileName)) return profileName;
    return Object.keys(SOUND_PROFILES).find(fits) || "custom";
  }

  return { ENGINE_VOICES, TUNE_DEF, TUNE_RANGE, LAYER_DEF, SOUND_PROFILES, patchTune, nameForTune };
})();
Object.freeze(GameAudioToneModel);
