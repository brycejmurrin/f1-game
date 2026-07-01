/* Apex 26 — weather & atmosphere: applyRaceSettings() (time-of-day/weather ->
 * sun/sky/fog/exposure/floodlights/paint), the per-circuit atmosphere bias,
 * and the 2D rain-overlay canvas. Reads/writes AX.frame / AX.frameSky.
 * game.js hands over DOM + helpers via AXWeather.init(deps) at boot. */
"use strict";

const AXWeather = (function () {
"use strict";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let els = null, isWetRoad = null, isRaining = null, buildTrackLights = null, applyLightTune = null;
function init(d) {
  els = d.els; isWetRoad = d.isWetRoad; isRaining = d.isRaining;
  buildTrackLights = d.buildTrackLights; applyLightTune = d.applyLightTune;
}


// ---------- rain overlay ----------
const rainCanvas = document.createElement("canvas");
rainCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none;";
document.body.appendChild(rainCanvas);
const rainCtx2d = rainCanvas.getContext("2d");
AX.rainDrops = [];
function initRainDrops() {
  rainCanvas.width = window.innerWidth;
  rainCanvas.height = window.innerHeight;
  AX.rainDrops = Array.from({ length: 360 }, () => ({
    x: Math.random() * rainCanvas.width,
    y: Math.random() * rainCanvas.height,
    len: 14 + Math.random() * 22,
    speed: 380 + Math.random() * 360,
    opacity: 0.16 + Math.random() * 0.34,
  }));
}
function drawRain(dt) {
  const w = rainCanvas.width, h = rainCanvas.height;
  rainCtx2d.clearRect(0, 0, w, h);
  rainCtx2d.lineWidth = 1;
  for (const d of AX.rainDrops) {
    d.y += d.speed * dt;
    d.x += d.speed * dt * 0.18;
    if (d.y - d.len > h || d.x > w) { d.y = -d.len; d.x = Math.random() * w; }
    rainCtx2d.globalAlpha = d.opacity;
    rainCtx2d.strokeStyle = "#afc8e8";
    rainCtx2d.beginPath();
    rainCtx2d.moveTo(d.x, d.y);
    rainCtx2d.lineTo(d.x + d.len * 0.18, d.y + d.len);
    rainCtx2d.stroke();
  }
  rainCtx2d.globalAlpha = 1;
  // Lightning veil: drawn on top of rain drops so it bleaches the rain too.
  // Stronger bleach (was 0.18) so a strike is a real concussive sky-flash.
  if (AX._ltFlash > 0.001) {
    rainCtx2d.save();
    rainCtx2d.globalAlpha = Math.min(0.55, AX._ltFlash * 0.40);
    rainCtx2d.fillStyle = "#dcecff";
    rainCtx2d.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
    rainCtx2d.restore();
  }
}
function setRainVisible(on) { rainCanvas.style.display = on ? "block" : "none"; }

// ---------- race atmosphere ----------
function applyRaceSettings() {
  // Load the lighting-tuner profile for the current (track, time, weather) so
  // the right per-condition values are live. Cheap (a few dozen assignments);
  // applyRaceSettings only fires on track load / time / weather change.
  if (typeof applyLightTune === "function") applyLightTune();
  const isNightSession = AX.raceTimeOfDay === "night" ||
    (AX.raceTimeOfDay === "default" && AX.track && AX.track.def && AX.track.def.night);
  // City light-pollution SKYGLOW: at night the lit circuit domes the horizon —
  // strong + tinted over neon cities, a faint warm haze over flood-lit open
  // circuits. Cleared here so day/dusk skies never inherit it.
  if (isNightSession && AX.track && AX.track.def) {
    const _ct = AX.track.def.theme === "street_night" || AX.track.def.theme === "modern";
    AX.frameSky.cityGlow = _ct ? [0.050, 0.038, 0.055] : [0.024, 0.018, 0.012];
  } else {
    AX.frameSky.cityGlow = null;
  }
  // Pre-build the floodlight set at race start so the first dark-session frame is
  // never unlit (the render path rebuilds it if empty as a fallback). Floodlights
  // are used on ANY track at night/dusk/dawn, so build whenever the scene is dark.
  const floodActive = AX.raceTimeOfDay === "night" || AX.raceTimeOfDay === "dusk" ||
    AX.raceTimeOfDay === "dawn" || (AX.raceTimeOfDay === "default" && AX.track && AX.track.def && AX.track.def.night);
  if (floodActive && AX.track && (!AX.track._lights || !AX.track._lights.length)) AX.track._lights = buildTrackLights(AX.track);
  if (AX.raceTimeOfDay !== "default") {
    const night = AX.raceTimeOfDay === "night";
    AX.frameSky.stars = night ? 1 : 0;
    if (night) {
      AX.frameSky.zenith = [0.01, 0.02, 0.05];
      AX.frameSky.horizon = [0.04, 0.03, 0.06];
      AX.frame.sunColor = [0.12, 0.14, 0.22];   // faint cool moonlight key (unified w/ default-night)
      // NEAR-BLACK cool ambient: the world is genuinely dark, the LIGHT SOURCES
      // (lamps, neon, lit windows) do all the lifting. A high ambient here is the
      // #1 cause of a flat-grey "night that looks like dim day".
      AX.frame.ambientGround = [0.0012, 0.0015, 0.0045];
      AX.frame.ambientSky = [0.0034, 0.0046, 0.0110];
      AX.frame.fogColor = [0.015, 0.017, 0.035];
      AX.frame.fogDensity = 0.004;
      // When raceTimeOfDay !== "default", sync sky colours to frame too
      AX.frame.skyZenith  = AX.frameSky.zenith;
      AX.frame.skyHorizon = AX.frameSky.horizon;
      // Moon: high visibility at night to give soft blue fill light
      AX.frameSky.moon = 0.85;
      // Night skies: few scattered clouds (don't block stars)
      AX._cloudBase = 0.22;
      // Night: low exposure keeps the dark dark under ACES so the bright lamp
      // pools and lit windows punch through (raising exposure re-greys the night).
      // Theme-aware to MATCH the default-night path: neon cities carry their own
      // light (0.86); open/desert circuits lean on the floods alone, so they get
      // the same gentle lift default mode gives them (0.90).
      AX.frame.exposure = (AX.track && AX.track.def && AX.track.def.theme === "street_night") ? 0.86 : 0.90;
    } else if (AX.raceTimeOfDay === "dawn") {
      // Pre-sunrise: deep teal-indigo zenith fading to a warm peach/rose horizon.
      // Sun is barely above the horizon — very low elevation, coming from the east.
      // Richer pre-sunrise: a deeper teal-indigo zenith over a luminous
      // pink/coral-magenta horizon (the defining first-light colour), not a muddy
      // brown-orange. Warm sun, with the DIRECT sun slightly warmer/stronger than
      // the sky tint (sky is always a touch cooler/dimmer than the key light).
      AX.frameSky.zenith  = [0.07, 0.12, 0.27];
      AX.frameSky.horizon = [0.88, 0.50, 0.40];
      AX.frameSky.sunColor = [1.0, 0.74, 0.44];
      AX.frameSky.sunDir  = V3.norm([-0.62, 0.08, 0.28]);
      AX.frame.sunDir     = AX.frameSky.sunDir;
      AX.frame.sunColor   = [1.0, 0.80, 0.50];
      // Cool teal fill from the sky, soft warm rose bounce from the ground
      AX.frame.ambientGround = [0.20, 0.13, 0.10];
      AX.frame.ambientSky    = [0.22, 0.26, 0.40];
      AX.frame.fogColor      = [0.52, 0.36, 0.34];
      AX.frame.fogDensity    = 0.0028;
      AX.frame.skyZenith     = AX.frameSky.zenith;
      AX.frame.skyHorizon    = AX.frameSky.horizon;
      AX.frameSky.moon = 0.30;   // fading moon still visible in the pre-dawn sky
      // Dawn: lingering cloud banks catch the first pink/gold light
      AX._cloudBase = 0.56;
      // Low sun + low ambient → lift exposure so the scene reads (kept moderate for
      // a realistic, un-washed dawn).
      AX.frame.exposure = 1.08;
    } else if (AX.raceTimeOfDay === "dusk") {
      // Richer golden hour: deeper indigo zenith, warmer coral/amber horizon,
      // a sun closer to the deck for that low-angle drama.
      AX.frameSky.zenith  = [0.08, 0.10, 0.28];
      AX.frameSky.horizon = [0.72, 0.34, 0.08];
      AX.frameSky.sunColor = [1.0, 0.55, 0.18];
      // Sun low in the west; vary azimuth slightly per track so not every
      // circuit has identical low-angle raking light.
      const _duskAz = AX.track && AX.track.def ? ((_trackAtmoBias(AX.track.def) * 0.28) - 0.14) : 0;
      AX.frameSky.sunDir  = V3.norm([0.50 + _duskAz, 0.10, 0.22]);
      AX.frame.sunDir     = AX.frameSky.sunDir;
      AX.frame.sunColor   = [1.0, 0.62, 0.22];
      // Warm amber ground bounce, cool sky fill from the blue zenith overhead
      AX.frame.ambientGround = [0.28, 0.16, 0.06];
      AX.frame.ambientSky    = [0.32, 0.22, 0.28];
      AX.frame.fogColor      = [0.58, 0.28, 0.10];
      AX.frame.fogDensity    = 0.0022;
      AX.frame.skyZenith     = AX.frameSky.zenith;
      AX.frame.skyHorizon    = AX.frameSky.horizon;
      AX.frameSky.moon = 0;
      // Dusk: plenty of cloud to catch the orange light and set the sky alight
      AX._cloudBase = 0.58;
      // Low sun energy but rich colour — slightly lifted exposure (kept moderate
      // so golden hour reads filmic, not washed).
      AX.frame.exposure = 1.03;
    } else {
      // Bright day — a deep, saturated sky with PER-TRACK atmosphere so no two
      // circuits share the same flat blue. `bias` runs -0.55 (clear desert) …
      // +0.85 (overcast Spa): clear days get a deep saturated zenith, crisp low
      // haze, a warm punchy sun and long shadows; humid/overcast days pale out,
      // haze up and flatten. (The old single flat blue at exposure 0.92 is what
      // read "washed/flat".)
      const _bias = AX.track && AX.track.def ? _trackAtmoBias(AX.track.def) : 0;
      const clr = Math.max(0, -_bias);    // 0 … 0.55 clearness
      const ovc = Math.max(0, _bias);     // 0 … 0.85 overcast
      // Zenith: a DEEP saturated blue when clear (the visible sky strip read pale
      // and flat before), washing to flat grey when overcast.
      AX.frameSky.zenith  = [0.09 - clr * 0.04 + ovc * 0.28, 0.26 - clr * 0.10 + ovc * 0.26, 0.95 - ovc * 0.24];
      AX.frameSky.horizon = [0.54 + ovc * 0.22, 0.68 + ovc * 0.12, 0.90 - clr * 0.02];
      // A lower, raking afternoon sun — high overhead light gave almost no shadow
      // modelling, which is what read "flat". Dropping the elevation casts long
      // building shadows for depth; azimuth varies per track so shadows fall
      // differently circuit to circuit. (Track palettes may ship a low/odd sun
      // tuned for their default ambience — override it for a clean day session.)
      const _dayAz = _bias * 0.6;
      AX.frameSky.sunDir = V3.norm([0.46 + _dayAz, 0.58, 0.42]);
      AX.frame.sunDir    = AX.frameSky.sunDir;
      // Strong WARM sun vs a cooler, slightly darker sky-fill: neutral concrete
      // then reads with a warm sunlit side and a cool shadow side (chiaroscuro),
      // which is what lifts a grey city out of "dull/flat". Overcast neutralises
      // the split toward a flat even grey.
      // Clear days drop the blue channel → warmer key against the cool sky fill
      // (stronger warm/cool chiaroscuro); overcast lifts blue back toward neutral.
      AX.frame.sunColor   = [1.13 + clr * 0.04, 0.95 - ovc * 0.05, 0.72 - clr * 0.12 + ovc * 0.12];
      AX.frameSky.sunColor = [1.0, 0.95, 0.84];
      // Warm low ground bounce; cool, restrained sky fill so shadows keep depth
      // (high flat ambient was washing the modelling out).
      AX.frame.ambientGround = [0.24 + clr * 0.04, 0.19, 0.12];
      AX.frame.ambientSky    = [0.26 + ovc * 0.12, 0.33 + ovc * 0.10, 0.50 + ovc * 0.06];
      // Fog: clearer (lower density, sky-matched colour) so distance reads crisp
      // instead of a flat grey wash; overcast hazes it back up.
      AX.frame.fogColor      = [0.66 + ovc * 0.08, 0.74 + ovc * 0.05, 0.88 - clr * 0.05];
      AX.frame.fogDensity    = 0.0008 + ovc * 0.0012;
      AX.frame.skyZenith     = AX.frameSky.zenith;
      AX.frame.skyHorizon    = AX.frameSky.horizon;
      AX.frameSky.moon = 0;
      AX._cloudBase = 0.44 + ovc * 0.42;     // modest broken cloud (sky shader adds the cumulus richness); overcast → heavy deck
      // Brighter, punchier midday (was a flat 0.92). Clear days run a touch
      // hotter; overcast pulled back so the grey doesn't glare.
      AX.frame.exposure = 0.99 + clr * 0.05 - ovc * 0.08;
    }
  } else {
    // "default" — driven by the track palette; set moon for night tracks
    AX.frameSky.moon = isNightSession ? 0.85 : 0;
    // Dim the SCENE sun to soft moonlight at night. Many night palettes ship a
    // bright, near-overhead sun (it drives the sky glow) — left undimmed it lit
    // the road/scenery like daytime, which is why night looked washed (Singapore).
    // frameSky.sunColor is left alone so the warm sky/dusk glow survives; the
    // floodlights (buildTrackLights) now carve out the actually-lit areas.
    if (isNightSession) AX.frame.sunColor = [0.12, 0.14, 0.22];   // unified moonlight key (matches explicit-night)
    AX._cloudBase = AX.frameSky.cloud !== undefined ? AX.frameSky.cloud
               : (isNightSession ? 0.22 : 0.44);   // modest cover; the sky shader carries the richer cumulus look

    // Global night ambient FLOOR: some night tracks ship very dark palette
    // ambients and rely entirely on per-mesh emissive to stay legible. Lift
    // any night track up to a baseline so the road and scenery always read,
    // without touching tracks that are already brighter (a floor, not a
    // multiply — brilliantly-lit street circuits keep their tuned values).
    if (isNightSession && AX.frame.ambientSky && AX.frame.ambientGround) {
      // Floor: lift very-dark night palettes so the road/scenery always read.
      // Ceiling: pull DOWN over-bright night palettes so a night race actually
      // looks like night — the road is up-facing so it's lit mostly by ambSky,
      // and a value like 0.55 renders it daylight-gray. Neon/floodlights survive
      // because lit windows etc. use emissive (sun/ambient-independent). Result:
      // a consistent moody-night ambient band regardless of per-track tuning.
      // Dark, moody base now that floodlights/street lights carve out the lit
      // areas (see buildTrackLights). Floor keeps the unlit scene barely legible;
      // the low cap stops over-bright palettes from washing the night to daylight.
      // (Raised from a near-black band: between-pool road/verge was rendering
      // pitch black at eye level — night should be dark, not unreadable.)
      // NEON CITY circuits get a distinctly higher, warm-tinted band: a real
      // neon canyon is bathed in skyglow bounce off the towers, so its street
      // never drops to black the way an open desert circuit's verge does.
      const _neonAmb = AX.track && AX.track.def &&
        (AX.track.def.theme === "street_night" || AX.track.def.theme === "modern");
      const floorSky = _neonAmb ? [0.017, 0.017, 0.026] : [0.006, 0.0075, 0.016];
      const floorGnd = _neonAmb ? [0.009, 0.008, 0.013] : [0.0026, 0.0032, 0.0085];
      const capSky   = _neonAmb ? [0.048, 0.048, 0.068] : [0.020, 0.023, 0.042];
      const capGnd   = _neonAmb ? [0.022, 0.020, 0.030] : [0.0085, 0.0098, 0.019];
      // Replace (not mutate) — frame.ambient* alias the shared palette arrays.
      AX.frame.ambientSky    = AX.frame.ambientSky.map((v, i)    => Math.min(capSky[i], Math.max(v, floorSky[i])));
      AX.frame.ambientGround = AX.frame.ambientGround.map((v, i) => Math.min(capGnd[i], Math.max(v, floorGnd[i])));
      // Hue the clamped ambient band toward the city glow: neon canyons get a
      // magenta-warm ambient cast, sodium towns amber. Near energy-neutral
      // (dominant channel x1.10, others pulled down) so the band stays a band.
      const _cgA = AX.frameSky.cityGlow;
      if (_cgA) {
        const _cgm = Math.max(_cgA[0], _cgA[1], _cgA[2]) || 1;
        AX.frame.ambientSky    = AX.frame.ambientSky.map((v, i) => v * (0.82 + 0.28 * _cgA[i] / _cgm));
        AX.frame.ambientGround = AX.frame.ambientGround.map((v, i) => v * (0.82 + 0.28 * _cgA[i] / _cgm));
      }
    }

    // ── Per-track atmosphere (default mode only) ──────────────────────────
    // Nudge cloud cover and fog to give circuits a characteristic sky
    // without overriding any explicit raceWeather or raceTimeOfDay choice.
    if (AX.track && AX.track.def) {
      const _def  = AX.track.def;
      const _pal  = _def.pal || {};
      const _bias = _trackAtmoBias(_def);   // -1 (clear) … +1 (overcast)

      // Cloud cover: start from the existing base then nudge by the bias.
      // Bias +1 = +0.20 cloud; bias -1 = -0.18 cloud. Cap so stars remain.
      const _cloudNudge = _bias > 0 ? _bias * 0.20 : _bias * 0.18;
      AX._cloudBase = Math.max(0.10, Math.min(isNightSession ? 0.45 : 0.80,
                            AX._cloudBase + _cloudNudge));

      // Fog density: cloudy/misty circuits get a touch more atmospheric haze.
      if (_bias > 0.2 && _pal.fogDensity != null) {
        AX.frame.fogDensity = Math.min(0.005, _pal.fogDensity * (1 + _bias * 0.30));
      }

      // Exposure: night tracks already bright with floodlights; desert night
      // tracks get a gentle lift; daytime green tracks sit near neutral.
      if (isNightSession) {
        // Low night exposure so the dark stays dark and the neon/floodlights punch.
        AX.frame.exposure = (_def.theme === "street_night") ? 0.86 : 0.90;
      } else if (_def.theme === "desert") {
        // Daytime desert: very bright, slight exposure pull-back
        AX.frame.exposure = 0.88;
      } else if (_bias > 0.3) {
        // Overcast / grey-sky circuits: lift exposure so the scene isn't muddy
        AX.frame.exposure = 1.08;
      } else {
        AX.frame.exposure = 1.0;
      }

      // Per-track sun azimuth variation: rotate the default sun direction
      // horizontally by a small per-circuit offset so the raking shadows
      // fall at a slightly different angle on each track. This is a purely
      // cosmetic tweak applied only when the palette supplies a sunDir.
      if (_pal.sunDir && !isNightSession) {
        const _sd = _pal.sunDir.slice();
        // Derive a stable per-track hash in -1..+1 from the track id chars
        const _azOffset = _bias * 0.12;   // mild tilt proportional to bias
        // Rotate the horizontal (X,Z) components by _azOffset radians
        const _sx = _sd[0], _sz = _sd[2];
        const _cos = Math.cos(_azOffset), _sin = Math.sin(_azOffset);
        _sd[0] = _sx * _cos - _sz * _sin;
        _sd[2] = _sx * _sin + _sz * _cos;
        const _sdn = V3.norm(_sd);
        AX.frame.sunDir = _sdn;
        AX.frameSky.sunDir = _sdn;
      }
    }
  }
  // Wet / rain: overcast the sky and flatten the light (soft, diffuse, fewer
  // shadows) — clouds roll in and the sun is muted while ambient lifts. A full
  // storm ("rain") rolls in heavier cloud and mutes the sun more than a merely
  // damp track ("wet"), which sits between clear and storm.
  if (isWetRoad()) {
    const _storm = isRaining();
    // Heavier cloud cover in the rain; cap at 0.96 to let the shader still vary
    AX._cloudBase = Math.min(0.96, AX._cloudBase + (_storm ? 0.52 : 0.32));
    AX.frameSky.cloud = AX._cloudBase;
    AX.frame.sunColor = AX.frame.sunColor.map((v) => v * (_storm ? 0.5 : 0.68));
    AX.frameSky.sunColor = AX.frameSky.sunColor.map((v) => v * (_storm ? 0.65 : 0.80));
    AX.frame.ambientSky = AX.frame.ambientSky.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    AX.frame.ambientGround = AX.frame.ambientGround.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    // Wet + overcast: lift exposure to keep the scene moody but readable — BUT a
    // wet NIGHT must stay dark (lifting it to 1.10 greys out the night and kills
    // the lamp-pool contrast), so dark sessions only get a whisker of lift.
    const _wetDark = AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && isNightSession);
    AX.frame.exposure = _wetDark
      ? Math.max(AX.frame.exposure != null ? AX.frame.exposure : 0.90, 0.95)
      : Math.max(AX.frame.exposure != null ? AX.frame.exposure : 1.0, _storm ? 1.03 : 1.00);
  } else if (AX.raceWeather === "overcast") {
    // Dry but heavy grey cloud: flat, soft, shadow-light. No rain, dry grip.
    AX._cloudBase = Math.min(0.90, AX._cloudBase + 0.50);
    AX.frameSky.cloud = AX._cloudBase;
    AX.frame.sunColor = AX.frame.sunColor.map((v) => v * 0.7);
    AX.frameSky.sunColor = AX.frameSky.sunColor.map((v) => v * 0.8);
    AX.frame.ambientSky = AX.frame.ambientSky.map((v) => Math.min(1, v * 1.06));
    AX.frame.ambientGround = AX.frame.ambientGround.map((v) => Math.min(1, v * 1.06));
    // Moody haze: thicker fog + a warm yellow-grey horizon (the "about to rain"
    // light) so heavy overcast reads atmospheric, not just a flat grey dim.
    AX.frame.fogDensity = (AX.frame.fogDensity || 0.0016) * 1.7;
    if (AX.raceTimeOfDay === "default") AX.frameSky.horizon = [0.74, 0.73, 0.74];
    if (AX.frame.exposure == null || AX.frame.exposure < 1.0) AX.frame.exposure = 1.0;
  } else if (AX.raceWeather === "fog") {
    // Low-visibility mist: dense pale fog, muted sun, moderate cloud. No rain, dry grip.
    AX.frameSky.cloud = Math.min(0.85, AX._cloudBase + 0.35);
    AX.frame.fogDensity = (AX.frame.fogDensity || 0.0017) * 3.0;
    const fc = [0.74, 0.76, 0.78];
    AX.frame.fogColor = fc;
    // Don't erase an explicit twilight horizon (dawn magenta / dusk coral) — only
    // flatten the horizon to fog-grey in default mode.
    if (AX.raceTimeOfDay === "default") AX.frameSky.horizon = fc.slice();
    AX.frame.sunColor = AX.frame.sunColor.map((v) => v * 0.6);
    AX.frameSky.sunColor = AX.frameSky.sunColor.map((v) => v * 0.7);
    AX.frame.ambientSky = AX.frame.ambientSky.map((v) => Math.min(1, v * 1.05));
    AX.frame.ambientGround = AX.frame.ambientGround.map((v) => Math.min(1, v * 1.05));
    // Lift for visibility in the murk — but a NIGHT fog must stay night: forcing
    // 1.08 over the 0.86-0.90 night base (+25%) grey-washed the dark and killed
    // the lamp-glow-in-fog mood. Dark sessions get a smaller floor.
    const _fogDark = AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && isNightSession);
    const _fogFloor = _fogDark ? 0.95 : 1.08;
    if (AX.frame.exposure == null || AX.frame.exposure < _fogFloor) AX.frame.exposure = _fogFloor;
  } else {
    AX.frameSky.cloud = AX._cloudBase;
    // Guarantee frame.exposure always has a value (default = 1.0 if nothing set above)
    if (AX.frame.exposure == null) AX.frame.exposure = 1.0;
  }
  // Low-lying ground mist: rolling morning mist at dawn, atmospheric haze in
  // wet/overcast/fog, a touch at night for mood; a clear day has none. Plus a
  // per-track lean — humid circuits hold mist, arid deserts stay crisp.
  {
    let gm = 0;
    if (AX.raceTimeOfDay === "dawn") gm = 0.40;
    else if (AX.raceTimeOfDay === "dusk") gm = 0.22;
    else if (AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && isNightSession)) gm = 0.16;
    if (isWetRoad()) gm = Math.max(gm, isRaining() ? 0.18 : 0.12);
    else if (AX.raceWeather === "overcast") gm = Math.max(gm, 0.34);
    else if (AX.raceWeather === "fog") gm = Math.max(gm, 0.58);
    const _mb = AX.track && AX.track.def ? _trackAtmoBias(AX.track.def) : 0;   // +overcast/humid, -arid
    gm *= 1.0 + clamp(_mb, -0.6, 0.6) * 0.5;
    AX.frame.groundMist = clamp(gm, 0, 0.7);
  }
  // Save base ambient values so the lightning system can restore them each frame
  AX._ltBase = {
    ambientSky:    AX.frame.ambientSky.slice(),
    ambientGround: AX.frame.ambientGround.slice(),
  };
  // Reset lightning timing: first strike after a random 3-8 s delay
  AX._ltFlash = 0;
  AX._ltNextT = 3 + Math.random() * 5;
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

return { init, applyRaceSettings, _trackAtmoBias, initRainDrops, drawRain, setRainVisible };
})();
