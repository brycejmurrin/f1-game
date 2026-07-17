/* Apex 26 — lighting tuner data + parametric light builders for js/game.js:
   TUNE_DEFS (the LIGHTING TUNER slider registry — the def values ARE the
   shipped tuning), the live LT value object (mutated in place by game.js's
   profile resolution and __apex.lightTune), floodColor / LAMP_KINDS (per-
   theme + per-fixture light character) and buildTrackLights(track) (bakes
   the per-track light records). No game state: profile persistence and the
   (track, time-of-day, weather) resolution live in game.js. Must load
   BEFORE js/game.js (see index.html). */
const LightTune = (function () {
  "use strict";

// Floodlight set for ANY track (every circuit gets them; the caller only feeds
// them to the shader when the scene is dark — night/dusk/dawn). A light roughly
// every ~24 m (alternating sides) at mast height, capped to the 32 shader slots
// (minus a small tail-light reservation in traffic) by the per-frame cull.
// Flat [x,y,z, r,g,b, rad, …] septets. Colour, brightness, pool
// size and mast style all vary by circuit character (see floodColor). HDR (>1)
// so the pools bloom.
function floodColor(theme, id) {
  // tint (relative RGB), HDR intensity, pool radius (m), and `street` = slim
  // lamp-post masts (vs tall flood banks). Per-theme so each circuit reads right.
  let base;
  switch (theme) {
    // Radii sized for the raking throw from the verge mast: the pool's far
    // corner sits 21-25 m from the lens, and the (1-(d/r)^4)^2 window must not
    // eat it (smaller radii lost up to 31% there).
    case "street_night": base = { tint: [0.92, 0.96, 1.08], intensity: 20.0, radius: 30, street: true }; break;  // cool LED white, city
    case "modern":       base = { tint: [1.00, 0.98, 0.92], intensity: 19.0, radius: 30, street: true }; break;  // warm-white LED
    case "street_day":   base = { tint: [1.10, 1.00, 0.80], intensity: 16.0, radius: 28, street: true }; break;  // warm street lamps (Monaco/Madrid)
    case "desert":       base = { tint: [1.28, 1.00, 0.60], intensity: 18.0, radius: 34, street: false }; break; // warm sodium flood banks
    default:             base = { tint: [1.14, 1.06, 0.84], intensity: 19.0, radius: 36, street: false }; break; // green/classic warm-white
  }
  // Per-LOCALE character so night circuits don't all share one tint: humid/warm
  // cities glow amber (sodium + sea-haze scatter), crisp desert/LED cities stay
  // cool. Only the tint shifts; intensity/radius/mast style keep the theme tuning.
  const WARM = { singapore: [1.06, 0.99, 0.88], jeddah: [1.16, 1.02, 0.78],
                 interlagos: [1.10, 1.01, 0.84], montreal: [1.05, 1.00, 0.90],
                 baku: [1.08, 1.00, 0.86] };
  const COOL = { vegas: [0.90, 0.95, 1.10], miami: [0.95, 0.99, 1.10] };
  if (id && WARM[id]) base.tint = WARM[id];
  else if (id && COOL[id]) base.tint = COOL[id];
  return base;
}
// ── LIGHT TUNE ──────────────────────────────────────────────────────────────
// Runtime lighting/rendering tuning registry. Every entry is a live slider in
// the in-race LIGHTING TUNER panel (pause menu) and settable via
// __apex.lightTune({id: value}). The `def` values ARE the shipped tuning —
// the driver code reads LT.<id> instead of a literal, so panel, dev hook and
// the offline A/B harness (tools/ab-lighting.mjs targets these def values)
// all move the same single source of truth. Non-default values persist in
// localStorage (apex26.lightTune). `rebuild: true` entries are baked into the
// per-track light records — changing one invalidates track._lights so
// buildTrackLights re-runs on the next frame. `u` names the GLSL uniform this
// knob feeds — most are LIT_FS uniforms uploaded from frame.tune in glx.js
// begin(); a few (uSpread, uCarGloss, uVigSoft, uBloomKnee) are post-pass
// uniforms uploaded from opts.tune in present(). Knobs with NO `u` are applied
// driver-side in game.js/glx.js (they scale several values, not one uniform).
const TUNE_DEFS = [
  // ── SUN & MOON ──
  { id: "keyMul",       label: "KEY LIGHT (SUN)", group: "SUN & MOON", min: 0,   max: 4,  step: 0.02,  def: 1.0,  u: "uKeyMul", help: "Direct sun/moon intensity — diffuse + speculars + shadows. Ambient, fog and sky reflection are untouched, so the scene stays coherent when dimmed. Floor stays 0 (already fully off); headroom is on the bright end." },
  { id: "sunTemp",      label: "SUN / MOON WARMTH", group: "SUN & MOON", min: -2, max: 2, step: 0.02, def: 0.0, fmt: "signed", help: "White-balance of the direct key light (sun by day, moonlight at night). − warm sunrise/sodium, + cool overcast/moonlight. The tint math is a plain unclamped mix, so both ends scale evenly past the old ±1." },
  { id: "sunElev",      label: "SUN ELEVATION",   group: "SUN & MOON", min: -60, max: 60, step: 1, def: 0, fmt: "signed", help: "Sun/moon height offset from the time-of-day default (deg). − lowers it for longer raking shadows + more god-rays. 0 = as-shipped. Capped at ±60° — the renderer clamps elevation to ±88° internally, so a wider slider would just hit that ceiling once combined with the time-of-day base." },
  { id: "sunAzim",      label: "SUN AZIMUTH",     group: "SUN & MOON", min: -180, max: 180, step: 2, def: 0, fmt: "signed", help: "Rotates the key-light compass direction from the default — swings shadow direction across the track. 0 = as-shipped. Already a full compass turn; only the step got finer." },
  { id: "moonBright",   label: "MOON BRIGHTNESS", group: "SUN & MOON", min: 0, max: 3, step: 0.02, def: 1.0, help: "Moon disc/halo + its soft blue fill on the night sky." },
  { id: "grMul",        label: "SUN GOD-RAYS",    group: "SUN & MOON", min: 0, max: 4, step: 0.02, def: 1.0,  help: "Volumetric sun-shaft strength (dawn/dusk drama)." },
  { id: "sunShaftMul",  label: "SCREEN SUN-SHAFT",group: "SUN & MOON", min: 0, max: 4, step: 0.02, def: 1.0,  help: "Screen-space crepuscular rays streaming radially from the sun disc (a separate post pass from the volumetric SUN GOD-RAYS). 0 = off, 1 = as-shipped, higher = dramatic light-ray fan. Only shows when the sun is up and bright." },
  // ── AMBIENT & BOUNCE ──
  { id: "ambientMul",   label: "AMBIENT FILL",    group: "AMBIENT & BOUNCE", min: 0, max: 4,    step: 0.02,  def: 1.0,  help: "Hemisphere ambient multiplier — the shadow/unlit fill and night readability floor. Floor is true 0 now (was 0.3): with no direct light in a shadow, 0 ambient means that shadow reads pure black — the actual 'crushed shadow' extreme, not just 'dim'." },
  { id: "ambTemp",      label: "AMBIENT WARMTH",  group: "AMBIENT & BOUNCE", min: -2, max: 2, step: 0.02, def: 0.0, fmt: "signed", help: "White-balance of the hemisphere fill (shadow/unlit areas). − warm bounce, + cool sky fill. Unclamped mix, so widened symmetrically like the other white-balance knobs." },
  { id: "ambBalance",   label: "SKY / GROUND FILL", group: "AMBIENT & BOUNCE", min: -2, max: 2, step: 0.02, def: 0.0, fmt: "signed", help: "Tips ambient toward ground bounce (−) or sky dome (+) — which side of shadows reads warm vs cool." },
  { id: "nightAmbLift", label: "NIGHT AMBIENT",   group: "AMBIENT & BOUNCE", min: 0, max: 4, step: 0.02, def: 1.0, help: "Scales the moody-night ambient floor/cap band directly (the 'how dark is night' master, applied BEFORE AMBIENT FILL). 0 = crush night ambient toward pure black so only the lamps/neon read; 1 = as-shipped; higher = lift the whole night out of the shadows. Only affects night sessions." },
  { id: "bounceK",      label: "LAMP BOUNCE",     group: "AMBIENT & BOUNCE", min: 0,   max: 0.3, step: 0.0025, def: 0.04, u: "uBounceK", help: "Pool light bounced onto walls/kerbs/car flanks outside the beam cone." },
  // ── SHADOWS ──
  { id: "shadowStr",    label: "SHADOW DARKNESS", group: "SHADOWS", min: 0, max: 2, step: 0.02, def: 1.0, u: "uShadowStr", help: "How much direct sun the cast shadow removes. 1 = full shadow (ambient fill only inside it), 0 = shadows gone — full sun bleeds back in. Floor stays 0 (already the 'no shadow' extreme); above 1 crushes shadows past neutral toward black for a harder, more graphic look." },
  { id: "shadowRange",  label: "SHADOW DISTANCE", group: "SHADOWS", min: 16, max: 160, step: 2, def: 64, u: "uShadowRange", help: "Half-size of the sun shadow box (m). Lower = crisper nearby shadows; higher = shadows reach further before fading." },
  { id: "pcssPen",      label: "SHADOW SOFTEN",   group: "SHADOWS", min: 5, max: 500, step: 5, def: 80, u: "uPcssPen", help: "How fast shadows soften with caster distance (PCSS penumbra growth)." },
  { id: "shadowBias",   label: "SHADOW BIAS",     group: "SHADOWS", min: 0, max: 0.01, step: 0.0001, def: 0.001, u: "uShadowBias", help: "Depth offset. Too low = shadow acne (self-shadow shimmer); too high = shadows detach from feet. Repair tool." },
  { id: "shadowTintAmt",label: "SHADOW COOLNESS", group: "SHADOWS", min: 0, max: 1.5, step: 0.02, def: 0.0, u: "uShadowTintAmt", help: "Tints shadowed / ambient-only areas cool blue for a sunny-day contrast look. 0 = neutral." },
  { id: "aoStr",        label: "AMBIENT OCCLUSION", group: "SHADOWS", min: 0, max: 3, step: 0.02, def: 1.0, help: "Crease/contact darkening (SSAO). Floor 0 = off (already the minimum); above 1 pushes creases toward crushed black." },
  { id: "ssaoRadius",   label: "AO RADIUS",       group: "SHADOWS", min: 0.1, max: 4.1, step: 0.05, def: 0.6, u: "uRadius", help: "World-space reach of the AO sampling. Small = tight contact shading; large = broad soft occlusion. The screen-space sample radius saturates at close range past the default, so extra headroom mainly extends how far into the distance strong AO still reaches." },
  { id: "contactStr",   label: "CONTACT SHADOW",  group: "SHADOWS", min: 0, max: 3, step: 0.02, def: 1.0, help: "Grounding shadow under the car/props where the sun map can't reach." },
  // ── FLOODLIGHTS ──
  { id: "lampLevel",    label: "LAMP LEVEL",      group: "FLOODLIGHTS", min: 0.02, max: 1.5,   step: 0.01, def: 0.26, help: "Overall floodlight brightness ceiling (on top of the twilight ramp)." },
  { id: "floodDay",     label: "DAYTIME FLOODS",  group: "FLOODLIGHTS", min: 0, max: 1.5, step: 0.01, def: 0.0, help: "Light the floodlights during DAY sessions (normally off — the sun dominates). 0 = off (as-shipped), higher = brighter daytime pools. Lets you run a lit stadium look under a blue sky. Brightness still rides LAMP LEVEL and the per-lamp POOL ENERGY on top of this." },
  { id: "poolEnergy",   label: "POOL ENERGY",     group: "FLOODLIGHTS", min: 0.05,  max: 2, step: 0.02, def: 0.55, rebuild: true, help: "Per-lamp pool luminance scale (physical energy per fixture)." },
  { id: "lampRadiusMul",label: "POOL RADIUS",     group: "FLOODLIGHTS", min: 0.3,  max: 3,   step: 0.02, def: 1.0,  rebuild: true, help: "Reach of each lamp pool. Too small and the far pool corner dies." },
  { id: "bleedMul",     label: "VALLEY BLEED",    group: "FLOODLIGHTS", min: 0,    max: 5,   step: 0.05,  def: 1.0,  rebuild: true, help: "Out-of-beam light floor — lifts the dark valleys between pools. Floor stays 0 (pitch-dark valleys already the minimum); headroom is on the flood side." },
  { id: "glareStr",     label: "LENS GLARE",      group: "FLOODLIGHTS", min: 0,    max: 1.5, step: 0.01, def: 0.12, help: "Lens-halo billboard strength at every active lamp." },
  { id: "lampTemp",     label: "LAMP TEMPERATURE",group: "FLOODLIGHTS", min: -2, max: 2, step: 0.02, def: 0.0, fmt: "signed", help: "White-balance of ALL floodlights/street lamps. − warms toward sodium/amber, + cools toward LED/broadcast white. Layers over each lamp's own colour. Unclamped mix, widened symmetrically like the other white-balance knobs." },
  { id: "lampFlicker",  label: "LAMP FLICKER",    group: "FLOODLIGHTS", min: 0, max: 0.6, step: 0.005, def: 0.10, help: "How much aging lamps pulse. 0 = rock-steady, higher = strong buzz on the odd tube." },
  { id: "beamCone",     label: "BEAM CONE WIDTH", group: "FLOODLIGHTS", min: 0.4, max: 2.2, step: 0.02, def: 1.0, rebuild: true, help: "Width of every floodlight's illuminated cone. Wider = softer spread, narrower = tight hotspots." },
  // ── LAMP BEHAVIOUR ── twilight ramp, warm-up, and the per-frame nearest-N cull
  { id: "twilightFloor", label: "TWILIGHT FLOOR",  group: "LAMP BEHAVIOUR", min: 0.05, max: 1, step: 0.05, def: 0.30, help: "Minimum floodlight level at bright dawn/dusk while the sun is still up. Low = floods stay dim until the sun drops; high = pools are already strong under a lit twilight sky. Only affects dawn/dusk sessions." },
  { id: "twilightRamp",  label: "TWILIGHT RAMP",   group: "LAMP BEHAVIOUR", min: 2, max: 14, step: 0.5, def: 6, help: "How fast floods climb from the twilight floor to full as the sun sets (steepness vs sun elevation). Higher = a quicker snap to full night lighting; lower = a long, gradual build. Dawn/dusk only." },
  { id: "twilightWarm",  label: "TWILIGHT WARMTH", group: "LAMP BEHAVIOUR", min: 0, max: 3, step: 0.05, def: 1.0, help: "How amber the floods glow at twilight (the 'just switched on' sodium warmth that fades toward neutral by deep night). 0 = neutral floods at dusk, 1 = as-shipped, higher = strong orange twilight cast. Dawn/dusk only." },
  { id: "lampWarmup",    label: "LAMP WARM-UP",    group: "LAMP BEHAVIOUR", min: 0, max: 4, step: 0.1, def: 1.0, help: "How long floodlights take to ramp from a dim sodium-orange strike to full cool brightness when they switch on (scales the ~4-8 s warm-up). 0 = instant full brightness, 1 = as-shipped, higher = a long, staggered warm-up glow." },
  { id: "lampWarmupDim", label: "WARM-UP DIP",     group: "LAMP BEHAVIOUR", min: 0, max: 0.9, step: 0.05, def: 0.30, help: "How dim a freshly-struck lamp starts before warming to full (depth of the strike dip). 0 = lamps strike at full brightness, 0.30 = as-shipped (start at 70%), higher = a deeper cold start." },
  { id: "lampWarmupWarm",label: "WARM-UP WARMTH",  group: "LAMP BEHAVIOUR", min: 0, max: 3, step: 0.05, def: 1.0, help: "How orange a freshly-struck lamp glows before settling to its true colour (strike-warmth amount). 0 = strikes at final colour, 1 = as-shipped sodium-warm start, higher = a strong amber ignition." },
  { id: "lampCull",      label: "LAMP COUNT",      group: "LAMP BEHAVIOUR", min: 16, max: 32, step: 1, def: 28, help: "How many of the nearest lamps light the scene at once when there's traffic (the shader has 32 slots; the rest are reserved for car tail-lights). Higher = more of the field lit but fewer tail-light slots on dense night grids. Solo running always uses all 32." },
  { id: "lampCullFade",  label: "LAMP CULL FADE",  group: "LAMP BEHAVIOUR", min: 0.1, max: 0.9, step: 0.05, def: 0.35, help: "How far inside the nearest-lamp boundary a lamp reaches full brightness (the distance fade that hides lamps entering/leaving the set at speed). Low = a thin fade band, a sharper edge to the lit zone; high = a broad, gentle falloff into the dark." },
  { id: "lampBehindBias",label: "BEHIND-CAM BIAS", group: "LAMP BEHAVIOUR", min: 1, max: 10, step: 0.25, def: 5.25, help: "How strongly lamps behind the camera are deprioritised in the nearest-lamp cull, so the budget favours the road ahead. 0/low = lamps ranked purely by distance (the lit road ends in a hard line ahead); high = the lit zone pushes much further forward past the fog." },
  // ── NIGHT GLOW & BLOOM ──
  { id: "floodEmitMul", label: "LIT GEOMETRY",    group: "NIGHT GLOW & BLOOM", min: 0,    max: 3,  step: 0.02,  def: 1.0,  help: "How lit the night buildings/windows/signage render (prop emissive ramp)." },
  { id: "glowAmp",      label: "EMISSIVE GLOW",   group: "NIGHT GLOW & BLOOM", min: 0.2,  max: 6,    step: 0.05,   def: 2.3,  u: "uGlowAmp", help: "HDR push for windows / lenses / neon — roughly half the night frame energy." },
  { id: "cityGlowMul",  label: "CITY SKYGLOW",    group: "NIGHT GLOW & BLOOM", min: 0, max: 5,   step: 0.05,  def: 1.0, help: "Light-pollution dome hugging the horizon over lit circuits/cities." },
  { id: "cityGlowWarm", label: "SKYGLOW WARMTH",  group: "NIGHT GLOW & BLOOM", min: -2, max: 2, step: 0.02, def: 0.0, fmt: "signed", help: "White-balance of the city skyglow dome AND the warm hue it casts into the night ambient. − cools toward LED/mercury white-blue, + warms toward sodium amber. 0 = the per-theme shipped tint (magenta-ish neon canyons, amber towns)." },
  { id: "cityGlowTint", label: "SKYGLOW ON AMBIENT", group: "NIGHT GLOW & BLOOM", min: 0, max: 1.5, step: 0.02, def: 0.28, help: "How strongly the city skyglow's colour bleeds into the night ambient fill — the neon/sodium hue you see wash the shadows in a lit city. 0 = neutral night ambient (glow only in the sky dome), 0.28 = as-shipped, higher = the whole night reads in the city's colour." },
  { id: "bloomMul",     label: "BLOOM AMOUNT",    group: "NIGHT GLOW & BLOOM", min: 0,    max: 4,    step: 0.02,  def: 1.0,  help: "Halo strength around bright HDR sources (lamps, neon, windows)." },
  { id: "bloomSpread",  label: "BLOOM SPREAD",    group: "NIGHT GLOW & BLOOM", min: 0.3, max: 4, step: 0.02, def: 1.0, u: "uSpread", help: "Halo WIDTH, independent of amount. Higher = wider, dreamier glow; lower = tight core." },
  { id: "threshOff",    label: "BLOOM THRESHOLD", group: "NIGHT GLOW & BLOOM", min: -0.5, max: 0.2,  step: 0.005,  def: 0.0,  help: "Offset on what counts as bright enough to bloom. Lower = mid-tones glow (fog-of-glow)." },
  { id: "bloomKnee",    label: "BLOOM ON HIGHLIGHTS", group: "NIGHT GLOW & BLOOM", min: 0, max: 1, step: 0.02, def: 0.5, u: "uBloomKnee", help: "How much bloom is SUPPRESSED over already-bright pixels (highlight knee). 0 = bloom everything evenly (milky, dreamy); 1 = strongly hold bloom off blown highlights so only mid-bright HDR sources halo (crisp). 0.5 = as-shipped." },
  // ── ATMOSPHERE ──
  { id: "fogDensityMul",label: "FOG DENSITY",     group: "ATMOSPHERE", min: 0, max: 5, step: 0.02, def: 1.0, u: "uFogDensity", help: "Scales atmospheric haze depth — how fast distance fades into fog. 1 = as-shipped." },
  { id: "fogHeight",    label: "FOG HEIGHT FALLOFF", group: "ATMOSPHERE", min: 0, max: 0.2, step: 0.001, def: 0.018, u: "uFogHeight", help: "How fast fog thins with altitude. 0 = uniform wall; higher = fog pools low and clears overhead." },
  { id: "fogTint",      label: "FOG WARM / COOL", group: "ATMOSPHERE", min: -2, max: 2, step: 0.02, def: 0.0, u: "uFogTint", fmt: "signed", help: "White-balance of the distance haze. + warm (amber/dusty), − cool (blue/overcast). Unclamped mix in-shader, so widened like the other white-balance knobs." },
  { id: "mistDensity",  label: "GROUND MIST",     group: "ATMOSPHERE", min: 0, max: 4, step: 0.02, def: 1.0, u: "uGroundMist", help: "Amount of low-lying drifting ground mist (dawn/humid/fog). 0 = none, higher = thick rolling bank." },
  { id: "mistHeight",   label: "MIST HEIGHT BAND",group: "ATMOSPHERE", min: 0.04, max: 1.2, step: 0.01, def: 0.30, u: "uMistHeight", help: "How tall the ground-mist layer stands. Low = ankle fog, high = deep bank up to the eyeline." },
  { id: "lampFogBase",  label: "FOG GLOW BASE",   group: "ATMOSPHERE", min: 0, max: 1.5,   step: 0.01, def: 0.45, help: "How strongly lamps tint the distant fog wall on a clear night." },
  { id: "lampFogHaze",  label: "FOG GLOW HAZE",   group: "ATMOSPHERE", min: 0, max: 2.5, step: 0.02, def: 0.6,  help: "Extra lamp-fog glow added as ground mist / fog weather thickens." },
  { id: "mistShare",    label: "MIST GLOW SHARE", group: "ATMOSPHERE", min: 0, max: 6,   step: 0.05,  def: 1.5,  u: "uMistShare", help: "Ground-mist share of the lamp glow vs the air-fog share." },
  { id: "fogClip",      label: "FOG GLOW CLIP",   group: "ATMOSPHERE", min: 0, max: 2.5, step: 0.02, def: 0.7,  u: "uLampFogClip", help: "Soft shoulder stopping lamp clusters pushing the fog wall to white." },
  { id: "lampVolBase",  label: "BEAMS (CLEAR)",   group: "ATMOSPHERE", min: 0, max: 0.8, step: 0.005, def: 0.05, help: "Volumetric lamp-beam strength in clear night air." },
  { id: "lampVolHaze",  label: "BEAMS (HAZE)",    group: "ATMOSPHERE", min: 0, max: 2.5, step: 0.05, def: 0.65, help: "How much haze/rain swells the lamp beams." },
  { id: "lampVolCap",   label: "BEAM CEILING",    group: "ATMOSPHERE", min: 0, max: 1.5,   step: 0.01, def: 0.70, help: "Hard cap on volumetric beam strength." },
  // ── REFLECTIONS ──
  { id: "ssrWetMul",    label: "WET MIRROR",      group: "ROAD & REFLECTIONS", min: 0, max: 2.5, step: 0.02, def: 1.0,  help: "Wet-road scene-mirror strength (scales the wetness ramp)." },
  { id: "ssrDryNight",  label: "DRY NIGHT SHEEN", group: "ROAD & REFLECTIONS", min: 0, max: 1, step: 0.005, def: 0.08, help: "Dry tarmac lamp/neon sheen at night." },
  { id: "ssrDryDay",    label: "DRY DAY SHEEN",   group: "ROAD & REFLECTIONS", min: 0, max: 0.6, step: 0.005, def: 0.07, help: "Faint tower-and-sky mirror on dry day tarmac." },
  { id: "roadRough",    label: "TARMAC ROUGHNESS",group: "ROAD & REFLECTIONS", min: 0.05, max: 1.2, step: 0.01, def: 1.0, help: "Scales dry-tarmac roughness — lower = glossier asphalt with a tighter sun streak. Bounds now track the shader's actual roughness clamp (0.85×value clamped to 0.04..1): below ~0.05 or above ~1.2 the old wider slider was just dead range that did nothing extra." },
  { id: "surfDetail",   label: "SURFACE DETAIL",  group: "ROAD & REFLECTIONS", min: 0, max: 3.5, step: 0.02, def: 1.0, help: "Road/terrain procedural grain + micro-normal relief (aggregate, patches, cracks). 0 = flat." },
  { id: "ssrThick",     label: "SSR THICKNESS",   group: "ROAD & REFLECTIONS", min: 0.02, max: 5, step: 0.02, def: 0.20, u: "uSsrThick", help: "Depth tolerance for a wet-road reflection hit. Lower = crisper but more gaps; higher = fewer holes, more smear. Ceiling raised to 5 — the hit-test's own far-plane reject means values above that would be a no-op." },
  { id: "wetDark",      label: "WET ROAD DARKEN", group: "ROAD & REFLECTIONS", min: 0, max: 2, step: 0.01, def: 1.0, u: "uWetDark", help: "How much darker wet asphalt reads (water absorption). Independent of the wetness amount." },
  // ── CAR ──
  { id: "carReflect",   label: "CAR REFLECTION",  group: "CAR", min: 0,   max: 2.5, step: 0.01, def: 0.05, u: "uCarReflect", help: "How strongly the world (track, sky, lights) mirrors on the car bodywork." },
  { id: "carEnvCube",   label: "ENV REFLECTION",  group: "CAR", min: 0,   max: 1,   step: 0.02,
    // Desktop default ON (0.3): the live probe pass is cheap there and the paint
    // mirroring the real surroundings is a marquee look. Mobile stays OFF — the
    // extra per-frame world pass + HDR cube can exhaust memory-limited mobile
    // GPUs and drop the WebGL context (tier-gated at the def, so presets /
    // localStorage still override either way).
    def: (typeof GLX !== "undefined" && GLX.isMobile) ? 0.0 : 0.3,
    help: "Live cubemap probe: the paint mirrors the REAL surroundings (one face re-rendered per frame). Default ON (0.3) on desktop; OFF on phones — the extra per-frame world pass + HDR cube can exhaust memory-limited mobile GPUs and drop the WebGL context. 0 = analytic sky reflection only (no probe pass). It's a 0..1 cross-fade so the range is already exact — only the step got finer." },
  { id: "carGloss",     label: "PAINT GLOSS",     group: "CAR", min: 0, max: 1.6, step: 0.02, def: 1.0,  u: "uCarGloss", help: "Sharpness of the paint's highlights & reflections. Higher = glassier (lower roughness). Range now tracks the SSR-streak formula's own clamp window (roughly 0..1.4): below 0 or above ~1.4 the old slider was pushing a value the shader already saturates on." },
  { id: "carSpecular",  label: "PAINT SPECULAR",  group: "CAR", min: 0,   max: 3.5,   step: 0.02, def: 1.0,  help: "Brightness of the specular highlight rolling over the bodywork." },
  { id: "carClearcoat", label: "CLEARCOAT",       group: "CAR", min: 0,   max: 3.5,   step: 0.01, def: 0.05, help: "Lacquer coat that catches crisp sun / lamp glints over the base colour." },
  { id: "carMetal",     label: "PAINT METALNESS", group: "CAR", min: 0,   max: 5,   step: 0.02, def: 1.0,  help: "How metallic the paint reads — reflection tint and grazing falloff." },
  { id: "carGlow",      label: "BODY GLOW",       group: "CAR", min: 0,   max: 5,   step: 0.02, def: 1.0,  help: "Self-lit body glow after dark (only the night / wet liveries carry it)." },
  { id: "tailLightMul", label: "TAIL-LIGHT GLOW", group: "CAR", min: 0, max: 5, step: 0.05, def: 1.0, help: "Brightness of the red glow trailing nearby cars after dark." },
  { id: "brakeGlowMul", label: "BRAKE FLARE",     group: "CAR", min: 0, max: 3, step: 0.05, def: 1.0, help: "How hard the tail-light glow surges while a car is braking (scales the brake-heat flare on top of TAIL-LIGHT GLOW). 0 = steady tail light, no flare." },
  { id: "tailRange",    label: "TAIL-LIGHT RANGE", group: "CAR", min: 60, max: 320, step: 10, def: 160, help: "How far (m) a car's tail-light keeps working as a real light source on nearby traffic. Beyond this it's dropped from the light budget. Higher = traffic glow reaches further back down the field." },
  { id: "tailFade",     label: "TAIL-LIGHT FADE",  group: "CAR", min: 0, max: 120, step: 5, def: 0, help: "Distance (m) over which a car's tail-light eases out before TAIL-LIGHT RANGE, so it doesn't pop in/out abruptly as traffic drifts past the limit. 0 = hard cutoff (as-shipped), higher = softer, longer fade." },
  // ── SKY & WEATHER ──
  { id: "cloudCover",   label: "CLOUD COVER",     group: "SKY & WEATHER", min: -1, max: 1, step: 0.01, def: 0.0, fmt: "signed", help: "Shifts cloud amount up/down from the weather default (also drives cloud shadows). 0 = as-shipped. Capped at ±1 — the underlying cloud amount is itself clamped to 0..1, so a full ±1 swing already overrides any base value to clear or overcast; more range would be a no-op." },
  { id: "cloudSpeed",   label: "CLOUD SPEED",     group: "SKY & WEATHER", min: 0, max: 8, step: 0.05, def: 1.0, u: "uCloudSpeed", help: "How fast clouds drift and evolve. 0 = frozen sky, higher = fast-moving weather." },
  { id: "starBright",   label: "STAR BRIGHTNESS", group: "SKY & WEATHER", min: 0, max: 4, step: 0.02, def: 1.0, u: "uStarBright", help: "Night star intensity. 0 = washed sky, higher = vivid starfield." },
  { id: "wetness",      label: "WETNESS",         group: "SKY & WEATHER", min: -0.05, max: 1, step: 0.05, def: -0.05, fmt: "auto", help: "Override the road wetness ramp (AUTO = follow weather; ramps in over a few seconds after a weather flip). Already an exact 0..1 ramp plus its AUTO sentinel — left untouched." },
  { id: "rainCount",    label: "RAIN INTENSITY",  group: "SKY & WEATHER", min: 20, max: 1400, step: 10, def: 360, reinitRain: true, help: "Number of falling rain streaks (storm density)." },
  { id: "rainStreak",   label: "RAIN STREAK LEN", group: "SKY & WEATHER", min: 0.2, max: 4, step: 0.02, def: 1.0, reinitRain: true, help: "Length of rain streaks — short spits vs long driving streaks." },
  { id: "rainWind",     label: "RAIN WIND",       group: "SKY & WEATHER", min: -2, max: 2, step: 0.02, def: 0.18, fmt: "signed", help: "Horizontal wind slant on the rain (angle of the streaks). Unclamped drift term, so widened like the white-balance knobs — high settings rake the rain almost horizontal." },
  { id: "lightning",    label: "LIGHTNING FREQ",  group: "SKY & WEATHER", min: 0, max: 6, step: 0.05, def: 1.0, help: "Storm lightning strike rate. 0 = off, higher = more frequent flashes." },
  { id: "weatherSunMute", label: "WEATHER SUN MUTE", group: "SKY & WEATHER", min: 0, max: 2, step: 0.02, def: 1.0, help: "How much wet/rain/overcast/fog weather dims the direct sun. 0 = weather doesn't mute the sun at all (bright, hard light through the storm); 1 = as-shipped; higher = deeper flat-grey murk. No effect in clear/dry weather." },
  // ── IMAGE & COLOUR ──
  { id: "exposureMul",  label: "EXPOSURE",        group: "IMAGE & COLOUR", min: 0.1,  max: 3,  step: 0.02,  def: 1.0,  help: "Master brightness multiplier on the tone-map input (all times of day) — applied before the tone-mapper, so this is the most direct way to darken or blow out the whole frame. Floor dropped toward near-black; ceiling raised for a hard overexposed look." },
  { id: "contrast",     label: "CONTRAST",        group: "IMAGE & COLOUR", min: 0.5, max: 3, step: 0.02, def: 1.12, u: "uContrast", help: "Midtone-darkening gamma. Higher = deeper, filmic shadows; lower = flatter and brighter. Ceiling pushed further than the floor since the ask is specifically for harder shadow crush." },
  { id: "saturation",   label: "SATURATION",      group: "IMAGE & COLOUR", min: 0, max: 3,   step: 0.02, def: 1.0, u: "uSaturation", help: "Overall colour intensity. 0 = greyscale, 1 = as-shipped, >1 = punchier." },
  { id: "vibrance",     label: "VIBRANCE",        group: "IMAGE & COLOUR", min: 0, max: 1.5, step: 0.01, def: 0.20, u: "uVibrance", help: "Selective saturation — lifts dull/washed pixels (hazy sky, grass, tarmac) without over-cooking neon or kerbs." },
  { id: "tint",         label: "WARM / COOL",     group: "IMAGE & COLOUR", min: -2, max: 2, step: 0.02, def: 0.0, u: "uTint", fmt: "signed", help: "White-balance shift. + warms (amber, sunny), − cools (blue, overcast/night). Unclamped mix, widened symmetrically like the other white-balance knobs." },
  { id: "gradeStr",     label: "GRADE STRENGTH",  group: "IMAGE & COLOUR", min: 0, max: 4, step: 0.02, def: 1.0, help: "Cinematic split-tone amount (teal shadows / warm highlights). 0 = neutral, higher = stronger film look." },
  { id: "shadowHue",    label: "SHADOW TINT HUE", group: "IMAGE & COLOUR", min: -180, max: 180, step: 2, def: 0.0, fmt: "signed", help: "Rotates the split-tone SHADOW colour (default cool teal) around the hue wheel. Already a full hue wheel — only the step got finer." },
  { id: "hiHue",        label: "HIGHLIGHT TINT HUE", group: "IMAGE & COLOUR", min: -180, max: 180, step: 2, def: 0.0, fmt: "signed", help: "Rotates the split-tone HIGHLIGHT colour (default warm amber) around the hue wheel. Already a full hue wheel — only the step got finer." },
  { id: "vignette",     label: "VIGNETTE",        group: "IMAGE & COLOUR", min: 0, max: 1, step: 0.01, def: 0.80, u: "uVignette", help: "Corner darkening. 1 = none, lower = stronger frame vignette. Floor is true 0 (pure black corners) — the frame centre is mixed in separately so it never darkens no matter how low this goes. Ceiling stays 1: past that the corners would read brighter than the centre, which isn't a 'vignette' anymore." },
  { id: "vignetteSoft", label: "VIGNETTE REACH",  group: "IMAGE & COLOUR", min: 0.1, max: 0.92, step: 0.01, def: 0.35, u: "uVigSoft", help: "How far the vignette reaches in from the corners (the inner edge of the darkening ramp). 0.35 = as-shipped. Lower = broad, soft gradient creeping toward the centre; higher = a thin dark ring hugging only the extreme corners. Pairs with VIGNETTE (which sets how dark)." },
  { id: "blackLift",    label: "BLACK LIFT",      group: "IMAGE & COLOUR", min: 0, max: 0.2, step: 0.001, def: 0.005, u: "uBlackLift", help: "Raises the darkest blacks toward a faded film base. 0 = pure black, higher = matte shadows. Floor is already the true-black extreme so it can't go lower; only the matte ceiling was raised." },
  { id: "whitePoint",   label: "WHITE POINT",     group: "IMAGE & COLOUR", min: 0.4, max: 4, step: 0.02, def: 1.0, u: "uWhitePoint", help: "Highlight roll-off knee. Lower clips highlights sooner (punchy, brighter overall), higher preserves highlight detail AND reads darker/more filmic overall (it divides the whole image before tone-mapping). Ceiling raised for a much moodier, darker top-end." },
  { id: "chromAb",      label: "CHROMATIC AB.",   group: "IMAGE & COLOUR", min: 0, max: 5, step: 0.02, def: 0.0, u: "uChromAb", help: "Lens colour-fringing toward the frame edges — RGB split. Subtle = filmic, high = arcade." },
  { id: "grain",        label: "FILM GRAIN",      group: "IMAGE & COLOUR", min: 0, max: 0.3, step: 0.002, def: 0.0, u: "uGrain", help: "Per-pixel sensor noise. A little sells the cinematic night-camera look." },
  { id: "lensDirt",     label: "LENS DIRT",       group: "IMAGE & COLOUR", min: 0, max: 1, step: 0.01, def: 0.15, u: "uLensDirt", help: "Grime on the lens: bright light (sun, floodlights, neon) scatters into a smudgy veil and the sun flare goes blotchy where dirt catches the glare. 0 = clean lens; only shows where the frame carries bright energy." },
  { id: "flareMul",     label: "LENS FLARE",      group: "IMAGE & COLOUR", min: 0, max: 3.5, step: 0.02, def: 1.0, help: "Sun/lamp anamorphic streak + ghost strength. 0 = off, 1 = as-shipped." },
  { id: "sharpen",      label: "SHARPEN",         group: "IMAGE & COLOUR", min: 0, max: 2, step: 0.02, def: 0.0, u: "uSharpen", help: "Crispness recovered after FXAA — counteracts softening on kerbs, wires and distant detail." },
  { id: "speedBlur",    label: "SPEED BLUR",      group: "IMAGE & COLOUR", min: 0, max: 2, step: 0.02, def: 0.0, u: "uSpeedBlur", help: "Radial blur from screen centre that grows with car speed — a velocity cue at high speed." },

  // ── FX ── transient particle effects (js/game/particles.js pool)
  { id: "particleMul",  label: "PARTICLE FX",     group: "FX", min: 0, max: 2, step: 0.05, def: 1.0, help: "Transient particle amount — tyre smoke, collision sparks, gravel kickup and rain spray. 0 = off, 1 = as-shipped, 2 = double the emission rate." },
];
// LT holds the LIVE values the driver reads every frame. They are resolved from
// a per-CONDITION profile store: each (track, time-of-day, weather) combination
// keeps its own set of overrides, so night+wet Monaco and day+dry Monza are
// tuned independently. Resolution per id: condition profile → migrated legacy
// global ("*") → TUNE_DEFS default. Only non-default values are stored.
const LT = {};
for (const d of TUNE_DEFS) LT[d.id] = d.def;

// Per-KIND light parameters. The kind itself is decided ONCE in tracks.js
// (buildProps mast block) and carried on track.lampPosts, so the painted lens
// albedo always matches the light emitted here. CCT-authentic palette (HPS
// sodium 2100K → broadcast flood 5700K). Cones are a tight HOT CORE (the bright
// pool under the fixture) + a wide soft skirt reaching the far edge; bleed is
// LOW so the valleys between lamps stay visibly darker than the pools — that
// pool/valley contrast is what makes the light read as CAST by the fixture
// instead of an ambient wash.
const LAMP_KINDS = {
  flood_bank: { col: [1.02, 1.06, 1.18], eMul: 1.00, cIn: 0.80, cOut: 0.50, blB: 0.08, blV: 0.06, volW: 1.0,  glareW: 1.2, tintMix: 0.12 }, // 5700K broadcast bank (eMul 1.35 stacked too hot on the pit straight)
  halide:     { col: [0.96, 1.03, 1.05], eMul: 1.05, cIn: 0.80, cOut: 0.46, blB: 0.06, blV: 0.06, volW: 0.8,  glareW: 1.0, tintMix: 0.30 }, // 4300K metal halide
  sodium:     { col: [1.42, 0.72, 0.24], eMul: 0.85, cIn: 0.82, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.9, tintMix: 0.25 }, // 2100K HPS deep amber
  halogen:    { col: [1.22, 0.98, 0.55], eMul: 0.95, cIn: 0.80, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.55, glareW: 1.0, tintMix: 0.30 }, // 3000K warm white
  led:        { col: [0.92, 1.00, 1.15], eMul: 1.05, cIn: 0.84, cOut: 0.48, blB: 0.10, blV: 0.08, volW: 0.45, glareW: 0.7, tintMix: 0.30 }, // 5000K crisp LED
  globe:      { col: [1.30, 0.92, 0.52], eMul: 0.60, cIn: 0.30, cOut: 0.02, blB: 0.16, blV: 0.10, volW: 0.30, glareW: 1.6, tintMix: 0.25 }, // 2700K heritage globe (near-omni)
  work:       { col: [1.38, 0.74, 0.30], eMul: 0.55, cIn: 0.70, cOut: 0.44, blB: 0.08, blV: 0.06, volW: 0.4,  glareW: 0.8, tintMix: 0.20 }, // orange work lamp
  fluor:      { col: [1.00, 1.10, 0.94], eMul: 0.92, cIn: 0.80, cOut: 0.46, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.85, tintMix: 0.28 }, // 4000K greenish fluorescent
};
function buildTrackLights(track) {
  const lights = [];
  const n = track.n, total = track.total;
  // Guard against a not-yet-complete track (centreline arrays missing): return
  // empty so the caller's rebuild-if-empty retries next frame rather than caching
  // a bad empty result.
  if (!n || !total || !track.px || !track.rx) return lights;
  const ds = total / n;
  const stride = Math.max(1, Math.round(22 / ds));   // denser than before; matches the masts in buildProps
  const { tint, intensity, radius, street } = floodColor(track.def.theme, track.def.id);
  const height = street ? 9 : 13;   // at the mast-top lens (buildProps masts)
  // Deterministic per-lamp hash in [0,1) so a circuit's lamp pattern is stable.
  const lh = (j) => { const x = Math.sin((j + 1) * 127.13) * 43758.5453; return x - Math.floor(x); };
  // Saturated accent palette for "neon spill" lamps on city circuits — coloured
  // light washing off signage onto the street (magenta/cyan/lime/red-orange).
  // Kept PASTEL and dim — real signage spill is a subtle tint on the street, not
  // a saturated paint-bucket pool.
  const NEON_SPILL = [[1.35, 0.75, 1.1], [0.75, 1.15, 1.3], [0.9, 1.25, 0.85], [1.3, 0.85, 0.65]];
  // Every point light is emitted FROM a visible fixture: buildProps exports the
  // exact world position of each mast lens (track.lampPosts — same 22 m stride,
  // side parity and onTrack suppression as the drawn masts), so glare halos,
  // specular streaks, volumetric beams and reflections all anchor to geometry.
  // Fallback: synthetic stride walk when lampPosts is absent (older track build).
  const posts = (track.lampPosts && track.lampPosts.length) ? track.lampPosts : null;
  const nPosts = posts ? posts.length : Math.ceil(n / stride);
  for (let i = 0; i < nPosts; i++) {
    const k = posts ? posts[i].k : Math.min(n - 1, i * stride);
    const side = posts ? posts[i].side : ((i % 2 === 0) ? 1 : -1);
    const bri  = 0.70 + lh(i + 97) * 0.62;      // 0.70 … 1.32 brightness (wide)
    const hard = lh(i + 53);                    // 0 = soft wide rim, 1 = hard crisp rim
    // ── LAMP TYPOLOGY ─────────────────────────────────────────────────────────
    // Not one kind of lamp: the pit straight runs dense cool-white broadcast
    // flood banks; city circuits mix sodium street posts with saturated NEON
    // SPILL (signage light washing the street in colour); permanent circuits are
    // flood masts with the odd warm "work lamp" (aging bulb). Each kind has its
    // own colour, cone and energy.
    const frac = k / n;
    const pitStraight = frac < 0.045 || frac > 0.985;   // start/finish zone
    const kindRoll = lh(i + 71);
    if (street && kindRoll < 0.10 && !pitStraight) {
      // EDGE WASHER: coloured signage light belongs on WALLS and verges, never on
      // the racing line. A low pastel lamp at the track edge aimed OUTWARD washes
      // the barrier/building side in colour while the road stays neutral. It is
      // ADDITIONAL to the mast light below — the mast lens above it still glows,
      // and a glowing lens with no pool reads as broken.
      const nc = NEON_SPILL[Math.floor(lh(i + 5) * NEON_SPILL.length) % NEON_SPILL.length];
      const wx0 = track.px[k] + track.rx[k] * (track.hw[k] + 2.5) * side;
      const wy0 = track.py[k] + 4.5;
      const wz0 = track.pz[k] + track.rz[k] * (track.hw[k] + 2.5) * side;
      let wdx = track.rx[k] * side * 0.55, wdy = -0.83, wdz = track.rz[k] * side * 0.55;
      const wdl = Math.hypot(wdx, wdy, wdz) || 1; wdx /= wdl; wdy /= wdl; wdz /= wdl;
      const we = intensity * 0.30 * (4.5 * 4.5) * LT.poolEnergy;
      // POOL ENERGY / POOL RADIUS / BEAM CONE / VALLEY BLEED tuner knobs apply
      // to these washer lights too (their help text promises "each/every lamp")
      // — same maths as the mast lamps below. (The energy factor was a 0.55
      // literal — poolEnergy's default — so the shipped look is identical.)
      lights.push(wx0, wy0, wz0,
        Math.max(0, nc[0]) * we, Math.max(0, nc[1]) * we, Math.max(0, nc[2]) * we,
        16 * LT.lampRadiusMul, wdx, wdy, wdz,
        0.55, 0.55 - 0.50 * (LT.beamCone || 1), Math.min(0.9, 0.10 * LT.bleedMul), 0.35, 0);
    }
    let eMul = 1.0, coneIn, coneOut, pr, pg, pb, tintMix = 0.38;
    // Per-type VOLUMETRIC weight (record field 13): how strongly this lamp's
    // beam shows in the air. Per-type GLARE weight (field 14): lens-halo size/
    // strength in drawGlow (0 = fixture-less light, no halo).
    let volW = 0.55, glareW = 1.0, bleed;
    const KP = posts && posts[i].kind ? LAMP_KINDS[posts[i].kind] : null;
    if (KP) {
      // KIND path: parameters from the table; the visible lens in tracks.js was
      // painted with this kind's albedo, so fixture and light always agree.
      pr = KP.col[0]; pg = KP.col[1]; pb = KP.col[2];
      eMul = KP.eMul; coneIn = KP.cIn; coneOut = KP.cOut;
      tintMix = KP.tintMix; volW = KP.volW; glareW = KP.glareW;
      bleed = KP.blB + lh(i + 31) * KP.blV;
    } else if (pitStraight) {
      // Legacy fallback (no lampPosts / unknown kind string): broadcast bank.
      eMul = 1.3; volW = 1.0;
      pr = 1.02; pg = 1.06; pb = 1.18; tintMix = 0.12;
      coneIn = 0.78; coneOut = 0.58;
    } else if (!street && kindRoll < 0.08) {
      // Work lamp: a dimmer, orange aging bulb among the floods.
      eMul = 0.55; volW = 0.4;
      pr = 1.38; pg = 0.74; pb = 0.30; tintMix = 0.2;
      coneIn = 0.70; coneOut = 0.48;
    } else {
      // Standard street post / flood mast: sodium-orange ↔ warm-yellow ↔ cool-white
      // temperature mix so a row of lamps reads like real aged street lighting.
      const ct = lh(i + 17);
      if (ct < 0.34)      { pr = 1.34; pg = 0.70; pb = 0.32; }   // orange sodium
      else if (ct < 0.68) { pr = 1.16; pg = 1.00; pb = 0.55; }   // warm yellow
      else                { pr = 0.93; pg = 0.99; pb = 1.15; }   // cool white
      coneIn  = 0.66 + hard * 0.10;   // 48.7° → 40.5° inner half-angle
      coneOut = coneIn - 0.26;        // soft outer skirt
    }
    // BEAM CONE WIDTH knob: scale the soft-skirt angular width (coneIn−coneOut).
    // >1 widens the illuminated cone (lower outer cos), <1 tightens the hotspot.
    coneOut = coneIn - (coneIn - coneOut) * (LT.beamCone || 1);
    const mr = tint[0] * tintMix + pr * (1 - tintMix);
    const mg = tint[1] * tintMix + pg * (1 - tintMix);
    const mb = tint[2] * tintMix + pb * (1 - tintMix);
    if (bleed == null) {
      // Legacy bleed: street/city circuits bleed more between pools.
      const bleedBase = street ? 0.30 : 0.14;
      const bleedVar  = street ? 0.18 : 0.12;
      bleed = bleedBase + lh(i + 31) * bleedVar;
    }
    // Beam aim: from the mast lens at the CENTRE OF THE NEAR LANE (side·hw/2) —
    // the pool spans centreline→near edge and sits under/near the fixture, so
    // the lamp visibly throws its light DOWN onto the road it stands over.
    const lx = posts ? posts[i].x : track.px[k] + track.rx[k] * (track.hw[k] + 6) * side;
    const ly = posts ? posts[i].y : track.py[k] + height;
    const lz = posts ? posts[i].z : track.pz[k] + track.rz[k] * (track.hw[k] + 6) * side;
    const nlOff = track.hw[k] * 0.5 * side;
    let ax = track.px[k] + track.rx[k] * nlOff - lx;
    let ay = track.py[k] - ly;
    let az = track.pz[k] + track.rz[k] * nlOff - lz;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    // Physically-based punctual light: intensity is in inverse-square units (the
    // shader divides by d²), so scale by the lens→road distance² AND the surface
    // incidence at the aim point (NoL = h/al for an up-facing road) — a raking
    // beam needs more flux than a top-down one to land the same pool luminance.
    // The incidence divisor is CLAMPED so a mast beside banked/elevated road
    // (lens barely above the aim point) can't blow the energy up.
    const hAim = Math.max(ly - track.py[k], 1);
    const ePhys = intensity * bri * eMul * (al * al) * LT.poolEnergy / Math.max(hAim / al, 0.35);
    lights.push(
      lx, ly, lz,
      Math.max(0, mr) * ePhys,
      Math.max(0, mg) * ePhys,
      Math.max(0, mb) * ePhys,
      radius * LT.lampRadiusMul,
      ax, ay, az, coneIn, coneOut, Math.min(0.9, bleed * LT.bleedMul), volW, glareW,
    );
  }
  // START-GANTRY DOWNLIGHTS: a crisp white bar of light straight down over the
  // start/finish line from the overhead gantry — marks the line the way
  // broadcast lighting does.
  {
    const hwk = track.hw[0] || 7;
    // Halved (1.15 -> 0.55 weight): three of these stack right over the grid, on
    // top of the flood_bank pit-straight lamps — the start line was the hottest
    // spot on every night circuit, blowing the road out exactly where every race
    // (and the player's first impression of the night lighting) begins.
    const ge = intensity * 0.55 * (8 * 8) * LT.poolEnergy;
    // POOL ENERGY / POOL RADIUS / BEAM CONE / VALLEY BLEED tuner knobs apply
    // here too — the gantry bar previously ignored them ("every floodlight" per
    // help text; the energy factor was a 0.55 literal = poolEnergy's default).
    for (const lat of [-hwk * 0.55, 0, hwk * 0.55]) {
      lights.push(
        track.px[0] + track.rx[0] * lat, track.py[0] + 8, track.pz[0] + track.rz[0] * lat,
        1.02 * ge, 1.05 * ge, 1.12 * ge,
        26 * LT.lampRadiusMul, 0, -1, 0,
        0.92, 0.92 - 0.14 * (LT.beamCone || 1), Math.min(0.9, 0.06 * LT.bleedMul), 0.9, 0.3);
    }
  }
  return lights;
}

  return { TUNE_DEFS, LT, floodColor, LAMP_KINDS, buildTrackLights };
})();
