/* Apex 26 — session atmosphere for js/game.js: applyRaceSettings(), the
   lighting/weather/time-of-day monolith (sun + sky + ambient + fog branches
   for night/dawn/dusk/day, wet/overcast/fog post-modifiers, ground mist,
   floodlight build, lightning arming) plus the per-track atmosphere bias
   table. Extracted verbatim; live state (frame, frameSky, track, weather,
   cloud/lightning timers) is reached through the ctx façade G handed to
   Atmosphere.create(G); stable helpers (clamp, satAdjust, weather predicates,
   applyLightTune) arrive by destructure. Consumes globals LightTune, V3,
   Tracks. Must load BEFORE js/game.js (see index.html). */
const Atmosphere = (function () {
  "use strict";

function create(G) {
// Stable helpers from the game.js closure.
const { clamp, satAdjust, isRaining, isWetRoad, isFloodActiveSession,
        _nightAmbientBand, applyLightTune } = G;
const { LT, buildTrackLights } = LightTune;

function applyRaceSettings() {
  // Load the lighting-tuner profile for the current (track, time, weather) so
  // the right per-condition values are live. Cheap (a few dozen assignments);
  // applyRaceSettings only fires on track load / time / weather change.
  // `true` = called from inside applyRaceSettings: suppresses applyLightTune's
  // own reapply-on-change call back into this function (this run derives from
  // the fresh LT values anyway — the re-entrant call ran everything twice).
  if (typeof applyLightTune === "function") applyLightTune(true);
  const isNightSession = G.raceTimeOfDay === "night" ||
    (G.raceTimeOfDay === "default" && G.track && G.track.def && G.track.def.night);
  // City light-pollution SKYGLOW: at night the lit circuit domes the horizon —
  // strong + tinted over neon cities, a faint warm haze over flood-lit open
  // circuits. Cleared here so day/dusk skies never inherit it.
  if (isNightSession && G.track && G.track.def) {
    const _ct = G.track.def.theme === "street_night" || G.track.def.theme === "modern";
    G.frameSky.cityGlow = _ct ? [0.050, 0.038, 0.055] : [0.024, 0.018, 0.012];
    // SKYGLOW WARMTH knob: white-balance the glow dome (and, via _nightAmbientBand's
    // hue-mix, the warm cast it throws into the night ambient). + warm sodium,
    // − cool LED/mercury. Unclamped-style mix, floored at 0.
    const _cgw = LT.cityGlowWarm || 0;
    if (_cgw) {
      const g = G.frameSky.cityGlow;
      G.frameSky.cityGlow = [
        Math.max(0, g[0] * (1 + 0.20 * _cgw)),
        Math.max(0, g[1] * (1 - 0.02 * Math.abs(_cgw))),
        Math.max(0, g[2] * (1 - 0.30 * _cgw)),
      ];
    }
  } else {
    G.frameSky.cityGlow = null;
  }
  // Pre-build the floodlight set at race start so the first dark-session frame is
  // never unlit (the render path rebuilds it if empty as a fallback). Floodlights
  // are used on ANY track at night/dusk/dawn, so build whenever the scene is dark.
  const floodActive = isFloodActiveSession();
  if (floodActive && G.track && (!G.track._lights || !G.track._lights.length)) G.track._lights = buildTrackLights(G.track);
  if (G.raceTimeOfDay !== "default") {
    const night = G.raceTimeOfDay === "night";
    G.frameSky.stars = night ? 1 : 0;
    if (night) {
      G.frameSky.zenith = [0.01, 0.02, 0.05];
      G.frameSky.horizon = [0.04, 0.03, 0.06];
      G.frame.sunColor = [0.12, 0.14, 0.22];   // faint cool moonlight key (unified w/ default-night)
      // MOON key-light direction: reset from the shipped palette (or a fixed
      // high default) EVERY call. This branch previously never set sunDir, so it
      // inherited whatever direction the previous time-of-day left behind — and
      // the sunElev/sunAzim tuner offsets applied further down COMPOUNDED on
      // each re-run (applyRaceSettings fires on every slider tick) instead of
      // offsetting a stable baseline, so the moon ran away while dragging.
      const _npal = G.track && G.track.def && G.track.def.palette;
      G.frame.sunDir = V3.norm(_npal && _npal.sunDir ? _npal.sunDir.slice() : [0.42, 0.66, 0.36]);
      G.frameSky.sunDir = G.frame.sunDir;
      // Re-derive the SKY sun tint from a stable base EVERY call (like dawn/dusk/
      // day do). This branch never set it, so the wet/overcast/fog multipliers
      // below (frameSky.sunColor *= 0.8/0.7) compounded on their own previous
      // output — dragging any night slider in a wet/foggy night race decayed the
      // moon/cloud/horizon tint toward black. Same palette base loadTrack uses.
      G.frameSky.sunColor = _npal && _npal.sun ? _npal.sun.slice() : [1.0, 0.95, 0.84];
      // NEAR-BLACK cool ambient: the world is genuinely dark, the LIGHT SOURCES
      // (lamps, neon, lit windows) do all the lifting. A high ambient here is the
      // #1 cause of a flat-grey "night that looks like dim day".
      G.frame.ambientGround = [0.0012, 0.0015, 0.0045];
      G.frame.ambientSky = [0.0034, 0.0046, 0.0110];
      // Same moody-night floor/cap + city-glow hue the default-night path applies,
      // so explicit setTimeOfDay("night") matches default-night (was ~5× darker,
      // no neon cast). cityGlow is already set above (before this branch).
      _nightAmbientBand();
      G.frame.fogColor = [0.015, 0.017, 0.035];
      G.frame.fogDensity = 0.004;
      // When raceTimeOfDay !== "default", sync sky colours to frame too
      G.frame.skyZenith  = G.frameSky.zenith;
      G.frame.skyHorizon = G.frameSky.horizon;
      // Moon: high visibility at night to give soft blue fill light
      G.frameSky.moon = 0.85;
      // Night skies: few scattered clouds (don't block stars)
      G._cloudBase = 0.22;
      // Night: low exposure keeps the dark dark under ACES so the bright lamp
      // pools and lit windows punch through (raising exposure re-greys the night).
      // Theme-aware to MATCH the default-night path: neon cities carry their own
      // light (0.86); open/desert circuits lean on the floods alone, so they get
      // the same gentle lift default mode gives them (0.90).
      G.frame.exposure = (G.track && G.track.def && G.track.def.theme === "street_night") ? 0.86 : 0.90;
    } else if (G.raceTimeOfDay === "dawn") {
      // Pre-sunrise: deep teal-indigo zenith fading to a warm peach/rose horizon.
      // Sun is barely above the horizon — very low elevation, coming from the east.
      // Richer pre-sunrise: a deeper teal-indigo zenith over a luminous
      // pink/coral-magenta horizon (the defining first-light colour), not a muddy
      // brown-orange. Warm sun, with the DIRECT sun slightly warmer/stronger than
      // the sky tint (sky is always a touch cooler/dimmer than the key light).
      // Per-track variety (same clr/ovc pattern as the day branch): clear/arid
      // circuits get the vivid coral-magenta first light and crisp air; overcast
      // ones (Spa, Silverstone) a paler, mistier, grey-rose daybreak.
      const _dwBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dwClr = Math.max(0, -_dwBias);   // 0 … 0.55 clearness
      const _dwOvc = Math.max(0, _dwBias);    // 0 … 0.85 overcast
      G.frameSky.zenith  = [0.07 + _dwOvc * 0.09, 0.12 + _dwOvc * 0.09, 0.27 + _dwOvc * 0.04 - _dwClr * 0.03];
      G.frameSky.horizon = [0.88 - _dwOvc * 0.26 + _dwClr * 0.08, 0.50 - _dwOvc * 0.06, 0.40 + _dwOvc * 0.12 - _dwClr * 0.06];
      G.frameSky.sunColor = [1.0, 0.74 - _dwClr * 0.06 + _dwOvc * 0.10, 0.44 - _dwClr * 0.08 + _dwOvc * 0.16];
      // Sun rising in the east; azimuth varies per circuit (mirrors _duskAz) so
      // the low raking light doesn't strike every track from the same angle.
      const _dawnAz = G.track && G.track.def ? ((_trackAtmoBias(G.track.def) * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = V3.norm([-0.62 - _dawnAz, 0.08, 0.28]);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dwOvc * 0.10, 0.80 - _dwClr * 0.04 + _dwOvc * 0.06, 0.50 - _dwClr * 0.08 + _dwOvc * 0.16];
      // Cool teal fill from the sky, soft warm rose bounce from the ground
      G.frame.ambientGround = [0.20 - _dwOvc * 0.03, 0.13 + _dwOvc * 0.02, 0.10 + _dwOvc * 0.04];
      G.frame.ambientSky    = [0.22 + _dwOvc * 0.05, 0.26 + _dwOvc * 0.05, 0.40 + _dwOvc * 0.03];
      // Fog: overcast dawns wake up under a thick grey-rose mist bank; clear
      // desert dawns are crisp with only a thin warm haze at the horizon.
      G.frame.fogColor      = [0.52 + _dwOvc * 0.06 - _dwClr * 0.02, 0.36 + _dwOvc * 0.10, 0.34 + _dwOvc * 0.14 - _dwClr * 0.04];
      G.frame.fogDensity    = 0.0028 + _dwOvc * 0.0018 - _dwClr * 0.0012;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0.30;   // fading moon still visible in the pre-dawn sky
      // Dawn: lingering cloud banks catch the first pink/gold light
      G._cloudBase = 0.56;
      // Low sun + low ambient → lift exposure so the scene reads (kept moderate for
      // a realistic, un-washed dawn).
      G.frame.exposure = 1.08;
    } else if (G.raceTimeOfDay === "dusk") {
      // Richer golden hour: deeper indigo zenith, warmer coral/amber horizon,
      // a sun closer to the deck for that low-angle drama.
      // Per-track variety (same clr/ovc pattern as the day/dawn branches):
      // clear circuits burn a saturated amber-orange sunset; overcast ones cool
      // and grey it toward a muted rose-slate evening.
      const _dkBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dkClr = Math.max(0, -_dkBias);   // 0 … 0.55 clearness
      const _dkOvc = Math.max(0, _dkBias);    // 0 … 0.85 overcast
      G.frameSky.zenith  = [0.08 + _dkOvc * 0.08, 0.10 + _dkOvc * 0.08, 0.28 + _dkOvc * 0.03];
      G.frameSky.horizon = [0.72 - _dkOvc * 0.20 + _dkClr * 0.10, 0.34 + _dkOvc * 0.02, 0.08 + _dkOvc * 0.14 - _dkClr * 0.02];
      G.frameSky.sunColor = [1.0, 0.55 + _dkOvc * 0.10 - _dkClr * 0.05, 0.18 + _dkOvc * 0.16 - _dkClr * 0.05];
      // Sun low in the west; vary azimuth slightly per track so not every
      // circuit has identical low-angle raking light.
      const _duskAz = G.track && G.track.def ? ((_trackAtmoBias(G.track.def) * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = V3.norm([0.50 + _duskAz, 0.10, 0.22]);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dkOvc * 0.12, 0.62 + _dkOvc * 0.04 - _dkClr * 0.05, 0.22 + _dkOvc * 0.14 - _dkClr * 0.06];
      // Warm amber ground bounce, cool sky fill from the blue zenith overhead
      G.frame.ambientGround = [0.28 - _dkOvc * 0.05, 0.16 + _dkOvc * 0.01, 0.06 + _dkOvc * 0.05];
      G.frame.ambientSky    = [0.32 + _dkOvc * 0.03, 0.22 + _dkOvc * 0.04, 0.28 + _dkOvc * 0.04];
      // Fog: overcast evenings thicken into a grey-mauve murk; clear ones keep
      // a thin amber haze hugging the horizon.
      G.frame.fogColor      = [0.58 - _dkOvc * 0.08, 0.28 + _dkOvc * 0.06, 0.10 + _dkOvc * 0.14];
      G.frame.fogDensity    = 0.0022 + _dkOvc * 0.0014 - _dkClr * 0.0008;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0;
      // Dusk: plenty of cloud to catch the orange light and set the sky alight
      G._cloudBase = 0.58;
      // Low sun energy but rich colour — slightly lifted exposure (kept moderate
      // so golden hour reads filmic, not washed).
      G.frame.exposure = 1.03;
    } else {
      // Bright day — a deep, saturated sky with PER-TRACK atmosphere so no two
      // circuits share the same flat blue. `bias` runs -0.55 (clear desert) …
      // +0.85 (overcast Spa): clear days get a deep saturated zenith, crisp low
      // haze, a warm punchy sun and long shadows; humid/overcast days pale out,
      // haze up and flatten. (The old single flat blue at exposure 0.92 is what
      // read "washed/flat".)
      const _bias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const clr = Math.max(0, -_bias);    // 0 … 0.55 clearness
      const ovc = Math.max(0, _bias);     // 0 … 0.85 overcast
      // Zenith: a DEEP saturated blue when clear (the visible sky strip read pale
      // and flat before), washing to flat grey when overcast.
      G.frameSky.zenith  = [0.09 - clr * 0.04 + ovc * 0.28, 0.26 - clr * 0.10 + ovc * 0.26, 0.95 - ovc * 0.24];
      G.frameSky.horizon = [0.54 + ovc * 0.22, 0.68 + ovc * 0.12, 0.90 - clr * 0.02];
      // A lower, raking afternoon sun — high overhead light gave almost no shadow
      // modelling, which is what read "flat". Dropping the elevation casts long
      // building shadows for depth; azimuth varies per track so shadows fall
      // differently circuit to circuit. (Track palettes may ship a low/odd sun
      // tuned for their default ambience — override it for a clean day session.)
      // Circuits with a real-world sun geography carry an explicit
      // def.sunAzimBias (radians-ish horizontal offset, ±0.5 = strong tilt);
      // everything else falls back to the atmosphere-bias heuristic.
      const _dayAz = (G.track && G.track.def && G.track.def.sunAzimBias != null)
        ? G.track.def.sunAzimBias : _bias * 0.6;
      G.frameSky.sunDir = V3.norm([0.46 + _dayAz, 0.58, 0.42]);
      G.frame.sunDir    = G.frameSky.sunDir;
      // Strong WARM sun vs a cooler, slightly darker sky-fill: neutral concrete
      // then reads with a warm sunlit side and a cool shadow side (chiaroscuro),
      // which is what lifts a grey city out of "dull/flat". Overcast neutralises
      // the split toward a flat even grey.
      // Clear days drop the blue channel → warmer key against the cool sky fill
      // (stronger warm/cool chiaroscuro); overcast lifts blue back toward neutral.
      G.frame.sunColor   = [1.13 + clr * 0.04, 0.95 - ovc * 0.05, 0.72 - clr * 0.12 + ovc * 0.12];
      G.frameSky.sunColor = [1.0, 0.95, 0.84];
      // Warm low ground bounce; cool, restrained sky fill so shadows keep depth
      // (high flat ambient was washing the modelling out).
      G.frame.ambientGround = [0.24 + clr * 0.04, 0.19, 0.12];
      G.frame.ambientSky    = [0.26 + ovc * 0.12, 0.33 + ovc * 0.10, 0.50 + ovc * 0.06];
      // Fog: clearer (lower density, sky-matched colour) so distance reads crisp
      // instead of a flat grey wash; overcast hazes it back up.
      G.frame.fogColor      = [0.66 + ovc * 0.08, 0.74 + ovc * 0.05, 0.88 - clr * 0.05];
      G.frame.fogDensity    = 0.0008 + ovc * 0.0012;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0;
      G._cloudBase = 0.44 + ovc * 0.42;     // modest broken cloud (sky shader adds the cumulus richness); overcast → heavy deck
      // Brighter, punchier midday (was a flat 0.92). Clear days run a touch
      // hotter; overcast pulled back so the grey doesn't glare.
      G.frame.exposure = 0.99 + clr * 0.05 - ovc * 0.08;
    }
  } else {
    // "default" — the base sun/ambient come from the track palette (set ONCE at
    // load). Re-derive them from the palette HERE, every call, so the live tuner
    // offsets applied further down (sunElev/sunAzim/sunTemp/ambTemp/ambBalance/
    // cloudCover) never COMPOUND: applyRaceSettings fires on every slider input
    // event, and without this reset each event stacked its offset on the previous
    // result, so those knobs ran away in one direction regardless of drag
    // direction. The explicit-time branches above already rebuild their base.
    if (G.track && G.track.def && G.track.def.palette) {
      const _bp = G.track.def.palette;
      if (_bp.sunDir)        { G.frame.sunDir = V3.norm(_bp.sunDir); G.frameSky.sunDir = G.frame.sunDir; }
      if (_bp.sunColor)      G.frame.sunColor = _bp.sunColor.slice();
      if (_bp.ambientSky)    G.frame.ambientSky = _bp.ambientSky.slice();
      if (_bp.ambientGround) G.frame.ambientGround = _bp.ambientGround.slice();
      if (_bp.sun)           G.frameSky.sunColor = _bp.sun.slice();
      // Sky dome zenith/horizon too: the overcast/fog weather branches below
      // OVERWRITE frameSky.horizon to grey, and nothing restored it on the way
      // back to clear (only loadTrack set it) — so a clear→fog→clear cycle left
      // the horizon band + every reflection (frame.skyHorizon at 1603 feeds the
      // LIT env mirror / SSR fallback) stuck fog-grey under a correct blue
      // zenith. Re-derive from the palette each call, same base loadTrack uses.
      if (_bp.zenith)        G.frameSky.zenith  = _bp.zenith.slice();
      if (_bp.horizon)       G.frameSky.horizon = _bp.horizon.slice();
      G.frameSky.cloud = _bp.cloud !== undefined ? _bp.cloud : (isNightSession ? 0.22 : 0.4);
      // Fog too (mirrors the sun/ambient reset above): the weather branches below
      // MULTIPLY frame.fogDensity in place, so without a fresh base HERE every
      // weather() flip or _APPLY_RACE_IDS slider drag compounded it (fog raced to
      // white after a few ticks) and it stayed STUCK tripled after switching back
      // to dry. Re-derive from the palette each call — same base loadTrack sets.
      if (_bp.fog) G.frame.fogColor = _bp.fog.slice();
      G.frame.fogDensity = _bp.fogDensity != null ? _bp.fogDensity : (isNightSession ? 0.004 : 0.0012);
    }
    // Keep the REFLECTED sky (frame.skyZenith/Horizon → LIT env/rim/SSR fallback)
    // in sync with the sky dome so glass/wet-road/clearcoat mirror the sky the
    // player actually sees (the weather post-modifiers below re-sync on their side).
    G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
    // "default" — driven by the track palette; set moon + stars for night tracks.
    // stars must be reset here symmetrically with moon: only the explicit-TOD
    // branch used to write it, so a live explicit-night → default flip (any
    // applyRaceSettings re-run without a track reload) kept stars in a day sky.
    G.frameSky.moon = isNightSession ? 0.85 : 0;
    G.frameSky.stars = isNightSession ? 1 : 0;
    // Dim the SCENE sun to soft moonlight at night. Many night palettes ship a
    // bright, near-overhead sun (it drives the sky glow) — left undimmed it lit
    // the road/scenery like daytime, which is why night looked washed (Singapore).
    // frameSky.sunColor is left alone so the warm sky/dusk glow survives; the
    // floodlights (buildTrackLights) now carve out the actually-lit areas.
    if (isNightSession) G.frame.sunColor = [0.12, 0.14, 0.22];   // unified moonlight key (matches explicit-night)
    G._cloudBase = G.frameSky.cloud !== undefined ? G.frameSky.cloud
               : (isNightSession ? 0.22 : 0.44);   // modest cover; the sky shader carries the richer cumulus look

    // Global night ambient FLOOR: some night tracks ship very dark palette
    // ambients and rely entirely on per-mesh emissive to stay legible. Lift
    // any night track up to a baseline so the road and scenery always read,
    // without touching tracks that are already brighter (a floor, not a
    // multiply — brilliantly-lit street circuits keep their tuned values).
    // Moody-night ambient floor/cap + city-glow hue (shared with explicit-night
    // via _nightAmbientBand so the two night paths match).
    if (isNightSession) _nightAmbientBand();

    // ── Per-track atmosphere (default mode only) ──────────────────────────
    // Nudge cloud cover and fog to give circuits a characteristic sky
    // without overriding any explicit raceWeather or raceTimeOfDay choice.
    if (G.track && G.track.def) {
      const _def  = G.track.def;
      const _pal  = _def.palette || {};   // built def carries `palette` (not `pal`);
                                          // the old `_def.pal` was always undefined,
                                          // silently disabling the fog/sunDir nudges below.
      const _bias = _trackAtmoBias(_def);   // -1 (clear) … +1 (overcast)

      // Cloud cover: start from the existing base then nudge by the bias.
      // Bias +1 = +0.20 cloud; bias -1 = -0.18 cloud. Cap so stars remain.
      const _cloudNudge = _bias > 0 ? _bias * 0.20 : _bias * 0.18;
      G._cloudBase = Math.max(0.10, Math.min(isNightSession ? 0.45 : 0.80,
                            G._cloudBase + _cloudNudge));

      // Fog density: cloudy/misty circuits get a touch more atmospheric haze.
      if (_bias > 0.2 && _pal.fogDensity != null) {
        G.frame.fogDensity = Math.min(0.005, _pal.fogDensity * (1 + _bias * 0.30));
      }

      // Exposure: night tracks already bright with floodlights; desert night
      // tracks get a gentle lift; daytime green tracks sit near neutral.
      if (isNightSession) {
        // Low night exposure so the dark stays dark and the neon/floodlights punch.
        G.frame.exposure = (_def.theme === "street_night") ? 0.86 : 0.90;
      } else if (_def.theme === "desert") {
        // Daytime desert: very bright, slight exposure pull-back
        G.frame.exposure = 0.88;
      } else if (_bias > 0.3) {
        // Overcast / grey-sky circuits: lift exposure so the scene isn't muddy
        G.frame.exposure = 1.08;
      } else {
        G.frame.exposure = 1.0;
      }

      // Per-track sun azimuth variation: rotate the default sun direction
      // horizontally by a small per-circuit offset so the raking shadows
      // fall at a slightly different angle on each track. This is a purely
      // cosmetic tweak applied only when the palette supplies a sunDir.
      if (_pal.sunDir && !isNightSession) {
        const _sd = _pal.sunDir.slice();
        // def.sunAzimBias (real-world sun geography) wins; otherwise a mild
        // tilt proportional to the atmosphere bias.
        const _azOffset = _def.sunAzimBias != null ? _def.sunAzimBias * 0.2 : _bias * 0.12;
        // Rotate the horizontal (X,Z) components by _azOffset radians
        const _sx = _sd[0], _sz = _sd[2];
        const _cos = Math.cos(_azOffset), _sin = Math.sin(_azOffset);
        _sd[0] = _sx * _cos - _sz * _sin;
        _sd[2] = _sx * _sin + _sz * _cos;
        const _sdn = V3.norm(_sd);
        G.frame.sunDir = _sdn;
        G.frameSky.sunDir = _sdn;
      }
    }
  }
  // Wet / rain: overcast the sky and flatten the light (soft, diffuse, fewer
  // shadows) — clouds roll in and the sun is muted while ambient lifts. A full
  // storm ("rain") rolls in heavier cloud and mutes the sun more than a merely
  // damp track ("wet"), which sits between clear and storm.
  // WEATHER SUN MUTE knob: scale how deeply bad weather dims the direct sun.
  // Each branch below mutes the sun by a fixed factor f (<1); _mute reshapes that
  // as 1−(1−f)·knob so 0 = weather never mutes the sun, 1 = as-shipped, >1 = deeper
  // murk (floored at 0). No-op in clear/dry weather (branches skipped).
  const _wsm = LT.weatherSunMute != null ? LT.weatherSunMute : 1;
  const _mute = (f) => Math.max(0, 1 - (1 - f) * _wsm);
  if (isWetRoad()) {
    const _storm = isRaining();
    // Heavier cloud cover in the rain; cap at 0.96 to let the shader still vary
    G._cloudBase = Math.min(0.96, G._cloudBase + (_storm ? 0.52 : 0.32));
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(_storm ? 0.5 : 0.68));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(_storm ? 0.65 : 0.80));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    // Wet + overcast: lift exposure to keep the scene moody but readable — BUT a
    // wet NIGHT must stay dark (lifting it to 1.10 greys out the night and kills
    // the lamp-pool contrast), so dark sessions only get a whisker of lift.
    const _wetDark = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && isNightSession);
    G.frame.exposure = _wetDark
      ? Math.max(G.frame.exposure != null ? G.frame.exposure : 0.90, 0.95)
      : Math.max(G.frame.exposure != null ? G.frame.exposure : 1.0, _storm ? 1.03 : 1.00);
  } else if (G.raceWeather === "overcast") {
    // Dry but heavy grey cloud: flat, soft, shadow-light. No rain, dry grip.
    G._cloudBase = Math.min(0.90, G._cloudBase + 0.50);
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.7));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.8));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.06));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.06));
    // Moody haze: thicker fog + a warm yellow-grey horizon (the "about to rain"
    // light) so heavy overcast reads atmospheric, not just a flat grey dim.
    G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * (LT.overcastFogMul != null ? LT.overcastFogMul : 1.7);
    if (G.raceTimeOfDay === "default") { G.frameSky.horizon = [0.74, 0.73, 0.74]; G.frame.skyHorizon = G.frameSky.horizon; }
    // A night session must stay dark under overcast too — same guard the wet/fog
    // branches use. Without it the 0.86/0.90 night exposure was forced up to 1.0,
    // greying out the night and killing lamp-pool contrast.
    const _ovcDark = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && isNightSession);
    const _ovcFloor = _ovcDark ? 0.95 : 1.0;
    if (G.frame.exposure == null || G.frame.exposure < _ovcFloor) G.frame.exposure = _ovcFloor;
  } else if (G.raceWeather === "fog") {
    // Low-visibility mist: dense pale fog, muted sun, moderate cloud. No rain, dry grip.
    G.frameSky.cloud = Math.min(0.85, G._cloudBase + 0.35);
    G.frame.fogDensity = (G.frame.fogDensity || 0.0017) * (LT.fogWxMul != null ? LT.fogWxMul : 3.0);
    const fc = [0.74, 0.76, 0.78];
    G.frame.fogColor = fc;
    // Don't erase an explicit twilight horizon (dawn magenta / dusk coral) — only
    // flatten the horizon to fog-grey in default mode. Sync frame.skyHorizon so
    // reflections (glass/wet road/clearcoat) match the grey dome, not a stale blue.
    if (G.raceTimeOfDay === "default") { G.frameSky.horizon = fc.slice(); G.frame.skyHorizon = G.frameSky.horizon; }
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.6));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.7));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.05));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.05));
    // Lift for visibility in the murk — but a NIGHT fog must stay night: forcing
    // 1.08 over the 0.86-0.90 night base (+25%) grey-washed the dark and killed
    // the lamp-glow-in-fog mood. Dark sessions get a smaller floor.
    const _fogDark = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && isNightSession);
    const _fogFloor = _fogDark ? 0.95 : 1.08;
    if (G.frame.exposure == null || G.frame.exposure < _fogFloor) G.frame.exposure = _fogFloor;
  } else {
    G.frameSky.cloud = G._cloudBase;
    // Guarantee frame.exposure always has a value (default = 1.0 if nothing set above)
    if (G.frame.exposure == null) G.frame.exposure = 1.0;
  }
  // Low-lying ground mist: rolling morning mist at dawn, atmospheric haze in
  // wet/overcast/fog, a touch at night for mood; a clear day has none. Plus a
  // per-track lean — humid circuits hold mist, arid deserts stay crisp.
  {
    let gm = 0;
    if (G.raceTimeOfDay === "dawn") gm = 0.40;
    else if (G.raceTimeOfDay === "dusk") gm = 0.22;
    else if (G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && isNightSession)) gm = 0.16;
    if (isWetRoad()) gm = Math.max(gm, isRaining() ? 0.18 : 0.12);
    else if (G.raceWeather === "overcast") gm = Math.max(gm, 0.34);
    else if (G.raceWeather === "fog") gm = Math.max(gm, 0.58);
    const _mb = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;   // +overcast/humid, -arid
    gm *= 1.0 + clamp(_mb, -0.6, 0.6) * 0.5;
    G.frame.groundMist = clamp(gm, 0, 0.7);
  }
  // ── Live lighting-tuner overrides on the CONDITION-derived values ──
  // Re-derived fresh from the branch values every call (applyRaceSettings re-runs
  // whenever one of these knobs changes — see _APPLY_RACE_IDS), so they never
  // compound. All default to a no-op.
  {
    // SUN / MOON WARMTH — white-balance the final direct key colour.
    const st = LT.sunTemp || 0;
    if (st && G.frame.sunColor) {
      const sr = 1 + Math.max(0, -st) * 0.18 - Math.max(0, st) * 0.12;
      const sb = 1 - Math.max(0, -st) * 0.30 + Math.max(0, st) * 0.20;
      G.frame.sunColor = [G.frame.sunColor[0] * sr, G.frame.sunColor[1] * (1 - Math.abs(st) * 0.02), G.frame.sunColor[2] * sb];
    }
    // SUN ELEVATION / AZIMUTH offset — rebuild sunDir from the default direction.
    if ((LT.sunElev || LT.sunAzim) && G.frame.sunDir) {
      const d = G.frame.sunDir;
      let el = Math.asin(clamp(d[1], -1, 1)) + (LT.sunElev || 0) * Math.PI / 180;
      let az = Math.atan2(d[0], d[2]) + (LT.sunAzim || 0) * Math.PI / 180;
      el = clamp(el, -1.54, 1.54);
      const ce = Math.cos(el), nd = [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)];
      G.frame.sunDir = nd; G.frameSky.sunDir = nd;
    }
    // CLOUD COVER offset (also drives cloud shadows via uCloudCover).
    if (LT.cloudCover) G.frameSky.cloud = clamp((G.frameSky.cloud != null ? G.frameSky.cloud : 0) + LT.cloudCover, 0, 1);
    // MOON BRIGHTNESS.
    if (G.frameSky.moon) G.frameSky.moon *= LT.moonBright;
    // CITY SKYGLOW (fresh array — never mutate the palette in place).
    if (G.frameSky.cityGlow && LT.cityGlowMul !== 1) G.frameSky.cityGlow = G.frameSky.cityGlow.map((v) => v * LT.cityGlowMul);
    // AMBIENT WARMTH + SKY/GROUND FILL BALANCE — white-balance the hemisphere
    // fill and tip its energy toward sky dome (+) or ground bounce (−). Fresh
    // arrays; both default to a no-op.
    const at = LT.ambTemp || 0, ab = LT.ambBalance || 0;
    if ((at || ab) && G.frame.ambientSky && G.frame.ambientGround) {
      const ar = 1 + Math.max(0, -at) * 0.16 - Math.max(0, at) * 0.10;
      const ag = 1 - Math.abs(at) * 0.02;
      const abb = 1 - Math.max(0, -at) * 0.24 + Math.max(0, at) * 0.16;
      const skyG = 1 + Math.max(0, ab) * 0.5, grdG = 1 + Math.max(0, -ab) * 0.5;
      G.frame.ambientSky = [G.frame.ambientSky[0] * ar * skyG, G.frame.ambientSky[1] * ag * skyG, G.frame.ambientSky[2] * abb * skyG];
      G.frame.ambientGround = [G.frame.ambientGround[0] * ar * grdG, G.frame.ambientGround[1] * ag * grdG, G.frame.ambientGround[2] * abb * grdG];
    }
    // SKY COLOUR SATURATION — push the sky dome toward grey (0) or oversaturate
    // (>1) around its luma anchor. Fresh arrays; the reflected sky (glass / wet
    // road / SSR fallback reads frame.skyZenith/Horizon) is re-synced so the
    // mirror matches the dome the player sees. Default 1 = exact no-op.
    const _sat = LT.skyColorSat != null ? LT.skyColorSat : 1;
    if (_sat !== 1) {
      if (G.frameSky.zenith)  G.frameSky.zenith  = satAdjust(G.frameSky.zenith, _sat);
      if (G.frameSky.horizon) G.frameSky.horizon = satAdjust(G.frameSky.horizon, _sat);
      G.frame.skyZenith  = G.frameSky.zenith;
      G.frame.skyHorizon = G.frameSky.horizon;
    }
    // FOG COLOUR SATURATION — same treatment for the distance-haze base colour,
    // applied BEFORE the in-shader FOG WARM / COOL balance. Fresh array, def 1.
    const _fsat = LT.fogColorSat != null ? LT.fogColorSat : 1;
    if (_fsat !== 1 && G.frame.fogColor) G.frame.fogColor = satAdjust(G.frame.fogColor, _fsat);
  }
  // Save base ambient + exposure so the lightning system can restore them each
  // frame. Exposure matters: the flash SETS frame.exposure from this base — the
  // old `frame.exposure +=` compounded ~+1.65 per strike and never restored, so
  // every strike left the whole scene permanently brighter (a stormy race washed
  // out to white over a few minutes).
  G._ltBase = {
    ambientSky:    G.frame.ambientSky.slice(),
    ambientGround: G.frame.ambientGround.slice(),
    exposure:      G.frame.exposure != null ? G.frame.exposure : 1.0,
  };
  // Arm lightning timing (first strike after a random 3-8 s delay) — but only
  // when no countdown is already pending: applyRaceSettings re-runs on EVERY
  // tuner drag tick for the _APPLY_RACE_IDS knobs, and unconditionally
  // re-arming here kept pushing the strike 3-8 s away, so lightning never
  // fired while a sun/ambient slider was being dragged in the rain.
  if (!(G._ltNextT > 0)) { G._ltFlash = 0; G._ltNextT = 3 + Math.random() * 5; }
}

// ── Per-track atmosphere bias ─────────────────────────────────────────────────
// Returns a value in roughly -1 (clear/arid) to +1 (overcast/misty) for the
// given track def, based on known geographic/meteorological character.
// Used by applyRaceSettings() to nudge _cloudBase and fog density.
function _trackAtmoBias(def) {
  if (!def) return 0;
  const id = def.id;
  // Specific well-known circuits first (highest priority)
  const _specific = {
    // Notoriously overcast / changeable
    spa:        0.85,
    silverstone: 0.70,
    zandvoort:  0.60,
    interlagos: 0.55,
    // High-altitude / hazy
    mexico:    -0.10,
    // Crisp mountain air
    redbull:    0.10,
    // Mediterranean / sunny
    monaco:    -0.25,
    imola:     -0.20,
    // Asian circuits — moderate humidity but generally good visibility
    suzuka:     0.05,
    shanghai:   0.15,
    // Street circuits in sunny climates
    baku:      -0.10,
    jeddah:    -0.20,
    singapore:  0.10,   // humid but the night keeps it dark regardless
    vegas:     -0.30,   // desert night, very clear
    miami:     -0.05,
    madrid:    -0.15,
    montreal:   0.20,
    albert_park: 0.05,
    // Pure desert / very clear skies
    bahrain:   -0.50,
    qatar:     -0.55,
    abudhabi:  -0.45,
    cota:       0.10,
    hungaroring: 0.15,
  };
  if (_specific[id] !== undefined) return _specific[id];
  // Fall back to theme
  if (def.theme === "desert") return -0.45;
  if (def.theme === "street_night") return -0.10;
  return 0;
}
return { applyRaceSettings, trackAtmoBias: _trackAtmoBias };
}

return { create };
})();
