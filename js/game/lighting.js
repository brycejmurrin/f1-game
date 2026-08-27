/* Apex 26 — lighting tuner data + parametric light builders for js/game.js:
   TUNE_DEFS (the LIGHTING TUNER slider registry — the def values ARE the
   shipped tuning), the live LT value object (mutated in place by
   js/game/light-store.js's profile resolution and __apex.lightTune),
   floodColor / LAMP_KINDS (per-theme + per-fixture light character) and
   buildTrackLights(track) (bakes the per-track light records). No game
   state: profile persistence and the (track, time-of-day, weather)
   resolution live in js/game/light-store.js. Must load BEFORE js/game.js
   (see index.html). */
const LightTune = (function () {
  "use strict";

// Lamp set for ANY track (street posts and flood banks share this list; the
// caller only feeds them to the shader when the scene is dark — night/dusk/dawn).
// A light roughly every ~22 m (alternating sides) at mast height, capped to the
// 48 shader slots (minus a small tail-light reservation in traffic) by the
// per-frame cull. Flat 15-float records [x,y,z, r,g,b, rad, aim, cone, bleed,
// vol, glare]. Colour, brightness, pool size and mast style all vary by circuit
// character (see floodColor). HDR (>1) so the pools bloom.
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
// the offline A/B harness (tools/lighting/ab-lighting.mjs targets these def values)
// all move the same single source of truth. Non-default values persist in
// localStorage (apex26.lightTune). `rebuild: true` entries are baked into the
// per-track light records — changing one invalidates track._lights so
// buildTrackLights re-runs on the next frame. `u` names the GLSL uniform this
// knob feeds — most are LIT_FS uniforms uploaded from frame.tune in glx.js
// begin(); a few (uSpread, uCarGloss, uVigSoft, uBloomKnee) are post-pass
// uniforms uploaded from opts.tune in present(). Knobs with NO `u` are applied
// driver-side in game.js/render/glx.js (they scale several values, not one uniform).
const TUNE_DEFS = [
  // ── SUN & MOON ──
  { id: "keyMul",       label: "KEY LIGHT (SUN)", group: "SUN & MOON", min: 0, max: 2.5, step: 0.005,  def: 1.0,  u: "uKeyMul", help: "Direct sun/moon intensity — diffuse + speculars + shadows, plus the paint sun-glint and window sun-flash terms (those two used to ignore this slider, so 0 left hotspots). Ambient, fog and sky reflection are untouched, so the scene stays coherent when dimmed. Floor stays 0 (already fully off); headroom is on the bright end." },
  { id: "sunTemp",      label: "SUN / MOON WARMTH", group: "SUN & MOON", min: -3.3, max: 8.3, step: 0.001, def: 0.0, fmt: "signed", help: "White-balance of the direct key light (sun by day, moonlight at night). − warm sunrise/sodium, + cool overcast/moonlight. Asymmetric on purpose: warm cuts blue at 0.30/unit (zero at −3.33) while cool cuts red at 0.12/unit (zero at +8.33), so the range stops at −3.3 / +8.3 — the last live notch on each side." },
  { id: "sunElev",      label: "SUN ELEVATION",   group: "SUN & MOON", min: -50, max: 50, step: 0.1, def: 0, fmt: "signed", help: "Sun/moon height offset from the time-of-day default (deg). − lowers it for longer raking shadows + more god-rays. 0 = as-shipped. The SUM with the time-of-day base is clamped to ±88.2° (js/game/atmosphere.js), so on a midday session anything past about +45 is a no-op; far enough negative the sun goes under the horizon and you get no key light and no god-rays at all — on a dawn session that is only about -7." },
  { id: "sunAzim",      label: "SUN AZIMUTH",     group: "SUN & MOON", min: -180, max: 180, step: 0.5, def: 0, fmt: "signed", help: "Rotates the key-light compass direction from the default — swings shadow direction across the track. 0 = as-shipped. Already a full compass turn, so only the step is worth refining; at 0.5 deg it is 720 notches." },
  { id: "moonBright",   label: "MOON BRIGHTNESS", group: "SUN & MOON", min: 0, max: 2.5, step: 0.001, def: 1.0, help: "Moon disc/halo + its soft blue fill on the night sky." },
  { id: "grMul",        label: "SUN GOD-RAYS",    group: "SUN & MOON", min: 0, max: 2.5, step: 0.001, def: 1.0,  help: "Volumetric sun-shaft strength (dawn/dusk drama). Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "godrayAniso",  label: "GOD-RAY FOCUS",   group: "SUN & MOON", min: 0, max: 0.95, step: 0.001, def: 0.60, u: "uHgAniso", help: "Shape of the volumetric SUN GOD-RAYS (Henyey-Greenstein forward-scatter anisotropy). 0 = diffuse glow spread evenly across the sky, 0.60 = as-shipped (a broad forward shaft), higher = a tight beam that only blazes when you look toward the sun. Only affects the volumetric god-ray pass. Stays live on GRAPHICS: LOW." },
  { id: "godrayFloor",  label: "GOD-RAY HAZE",    group: "SUN & MOON", min: 0, max: 0.2, step: 0.0002, def: 0.020, u: "uHgFloor", help: "Isotropic scatter floor added under the god-ray forward lobe — the ambient shaft haze that glows everywhere, not just toward the sun. 0 = shafts only where the sun's lobe reaches, 0.020 = as-shipped, higher = a milkier volumetric wash filling the whole sky. Stays live on GRAPHICS: LOW." },
  { id: "godrayLowBoost", label: "GOD-RAY LOW-SUN DRAMA", group: "SUN & MOON", min: 0, max: 1.375, step: 0.001, def: 0.55, help: "How much STRONGER the volumetric sun-shafts get at dawn/dusk (low sun) than at midday. Base shaft strength is GOD-RAY BASE (def 0.38); this adds up to this much more as the sun drops toward the horizon. 0.55 = as-shipped, 0 = flat shaft strength all day (no low-sun drama), higher = blazing god-rays at sunrise/sunset. Scales only the low-sun boost — SUN GOD-RAYS scales the whole thing." },
  { id: "godrayBase",   label: "GOD-RAY BASE",    group: "SUN & MOON", min: 0, max: 0.95, step: 0.002, def: 0.38, help: "The flat baseline strength of the volumetric sun-shafts at ALL sun heights, before GOD-RAY LOW-SUN DRAMA adds the dawn/dusk boost on top. 0.38 = as-shipped, 0 = shafts appear only when the sun is low (pure low-sun drama), higher = strong god-rays even at midday. Rides SUN GOD-RAYS (the master) like the rest of the shaft strength." },
  { id: "sunShaftMul",  label: "SCREEN SUN-SHAFT",group: "SUN & MOON", min: 0, max: 2.5, step: 0.002, def: 1.0,  help: "Screen-space crepuscular rays streaming radially from the sun disc (a separate post pass from the volumetric SUN GOD-RAYS). 0 = off, 1 = as-shipped, higher = dramatic light-ray fan. Only shows when the sun is up and bright, and bloom is on — this pass reads the bloom chain, so perf auto-tier 4 (or a crash floor) sheds it with bloom." },
  { id: "sunShaftDecay",label: "SUN-SHAFT REACH", group: "SUN & MOON", min: 0.08, max: 0.98, step: 0.001, def: 0.82, u: "uShaftDecay", help: "How far the screen-space SUN-SHAFT rays reach out from the sun (per-tap falloff of the radial march). 0.82 = as-shipped; lower = short stubby rays hugging the sun disc, higher = long shafts streaming across the frame. Pairs with SCREEN SUN-SHAFT (which sets strength). Needs bloom, same as SCREEN SUN-SHAFT." },
  // ── AMBIENT & BOUNCE ──
  { id: "ambientMul",   label: "AMBIENT FILL",    group: "AMBIENT & BOUNCE", min: 0, max: 2.5, step: 0.005,  def: 1.0,  help: "Hemisphere ambient multiplier — the shadow/unlit fill and night readability floor. Floor is true 0 now (was 0.3): with no direct light in a shadow, 0 ambient means that shadow reads pure black — the actual 'crushed shadow' extreme, not just 'dim'." },
  { id: "ambTemp",      label: "AMBIENT WARMTH",  group: "AMBIENT & BOUNCE", min: -4.16, max: 10, step: 0.001, def: 0.0, fmt: "signed", help: "White-balance of the hemisphere fill (shadow/unlit areas). − warm bounce, + cool sky fill. Asymmetric on purpose: warm cuts the blue fill at 0.24/unit (zero at −4.17) while cool cuts red at 0.10/unit (zero at +10), so the range stops at −4.16 / +10 — the last live notch on each side." },
  { id: "ambBalance",   label: "SKY / GROUND FILL", group: "AMBIENT & BOUNCE", min: -6, max: 6, step: 0.002, def: 0.0, fmt: "signed", help: "Tips ambient toward ground bounce (−) or sky dome (+) — which side of shadows reads warm vs cool." },
  { id: "nightAmbLift", label: "NIGHT AMBIENT",   group: "AMBIENT & BOUNCE", min: 0, max: 2.5, step: 0.002, def: 1.0, help: "Scales the moody-night ambient floor/cap band directly (the 'how dark is night' master, applied BEFORE AMBIENT FILL). 0 = crush night ambient toward pure black so only the lamps/neon read; 1 = as-shipped; higher = lift the whole night out of the shadows. Only affects night sessions." },
  { id: "bounceK",      label: "LAMP BOUNCE",     group: "AMBIENT & BOUNCE", min: 0, max: 0.3, step: 0.00025, def: 0.04, u: "uBounceK", help: "Pool light bounced onto walls/kerbs/car flanks outside the beam cone." },
  // ── SHADOWS ──
  { id: "shadowStr",    label: "SHADOW DARKNESS", group: "SHADOWS", min: 0, max: 3, step: 0.01, def: 1.15, u: "uShadowStr", help: "How much direct sun the cast shadow removes. 1 = full shadow (ambient fill only inside it), 0 = shadows gone — full sun bleeds back in. Floor stays 0 (already the 'no shadow' extreme); above 1 crushes shadows past neutral toward black for a harder, more graphic look." },
  { id: "shadowRange",  label: "SHADOW DISTANCE", group: "SHADOWS", min: 16, max: 200, step: 2, def: 80, u: "uShadowRange", help: "Half-size of the sun shadow box (m). Lower = crisper nearby shadows; higher = shadows reach further before fading. Car shadow reach and shadow-map texel density scale with this too, so very high values soften/blur shadows in exchange for reach." },
  { id: "pcssPen",      label: "SHADOW SOFTEN",   group: "SHADOWS", min: 5, max: 200, step: 5, def: 80, u: "uPcssPen", help: "How fast shadows soften with caster distance (PCSS penumbra growth). Live on WebGL2, WebGPU, three.js WebGPU, and three.js desktop WebGL2 (R16F depth-in-color blocker). Phones, software WebGL2, and a desktop PCSS-off fallback on three.js have no live blocker search — the slider still scales the fixed Poisson radius (identity at 80, same tap count). Not distance-based PCSS on those paths only." },
  { id: "shadowBias",   label: "SHADOW BIAS",     group: "SHADOWS", min: 0, max: 0.004, step: 0.0001, def: 0.001, u: "uShadowBias", help: "Depth offset. Too low = shadow acne (self-shadow shimmer); too high = shadows detach from feet. Repair tool." },
  { id: "shadowTintAmt",label: "SHADOW COOLNESS", group: "SHADOWS", min: 0, max: 1, step: 0.01, def: 0.0, u: "uShadowTintAmt", help: "Tints shadowed / ambient-only areas cool blue for a sunny-day contrast look. 0 = neutral, 1 = the designed cool mix (0.90, 0.96, 1.12). Ceiling is 1 — past that the shader extrapolates past the designed tint colour." },
  { id: "moonShadow",   label: "MOON SHADOWS",    group: "SHADOWS", min: 0, max: 1, step: 0.001, def: 0.25, help: "Floor for cast-shadow strength under a bright CLEAR moon — soft moonlight shadows at night. Fades out by itself as cloud rolls in, the road gets wet, or fog sets; 0 = night shadows fade fully off (old behaviour). Above 0.5, this ALSO starts overriding the clear-moon weather gate so buildings/props cast shadows at night through cloud/fog/wet too — 1.0 = shadows cast regardless of weather." },
  { id: "carShadow",    label: "CAR SUN SHADOWS", group: "SHADOWS", min: 0, max: 1, step: 1, def: 1, help: "Real sun-projected car shadows from a per-frame car-only shadow map (direction and length match the scene; cars shadow each other). 0 = blob contact shadow only. Desktop tier only, on all three renderers (WebGL2, three.js and WebGPU). Off on GRAPHICS: LOW (car-shadow cost shed)." },
  { id: "lampShadow",   label: "LAMP SHADOWS",    group: "SHADOWS", min: 0, max: 1, step: 1, def: 1, help: "Night: the single nearest lamp casts REAL shadows — a per-frame 512² depth map from that fixture, so cars/walls under it throw radial shadows away from the mast and its volumetric beam is carved by the same occluders. One lamp only (the rest stay cone-shaped, no shadow cost). 0 = off. Desktop tier only, on all three renderers (WebGL2, three.js and WebGPU). Off on GRAPHICS: LOW and MEDIUM (lamp-shadow cost shed)." },
  { id: "aoStr",        label: "AMBIENT OCCLUSION", group: "SHADOWS", min: 0, max: 1.05, step: 0.01, def: 1.0, help: "Crease/contact darkening (SSAO). Floor 0 = off. Ceiling is 1.05 — the pass uploads 0.95× this as uStrength, and `ao = 1 - occ * uStrength` writes the buffer raw, so past 1/0.95 the AO texture goes negative and the composite inverts creases (bright pits). 1.05 is the last notch that still crushes to black. Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "ssaoRadius",   label: "AO RADIUS",       group: "SHADOWS", min: 0.02, max: 1.465, step: 0.005, def: 0.6, u: "uRadius", help: "World-space reach of the AO sampling. Small = tight contact shading; large = broad soft occlusion. The screen-space sample radius saturates at close range past the default, so extra headroom mainly extends how far into the distance strong AO still reaches. Stays live on GRAPHICS: LOW with AMBIENT OCCLUSION." },
  { id: "contactStr",   label: "CONTACT SHADOW",  group: "SHADOWS", min: 0, max: 2, step: 0.01, def: 1.0, help: "Grounding shadow under the car/props where the sun map can't reach. Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "ambContactDark", label: "AMBIENT CONTACT DARK", group: "SHADOWS", min: 0, max: 2.5, step: 0.01, def: 1.0, u: "uAmbContactDark", help: "How much the ambient-occlusion term darkens the AMBIENT fill in creases/contact points (distinct from AMBIENT OCCLUSION, which darkens the whole shaded result). 1 = as-shipped (up to 12% ambient drop in deep creases), 0 = ambient fill is untouched by AO (flatter, brighter corners), higher = crushes contact points toward black. All three renderers (WebGL2, three.js and WebGPU)." },
  // ── LAMPS ── one tab for every track lamp (street posts + flood banks).
  // Was split as FLOODLIGHTS / LAMP BEHAVIOUR; both drove the same lampPosts
  // pipeline, so the two names read as two systems. Sections keep the old
  // visual grouping without a second tab.
  { id: "lampLevel",    label: "LAMP LEVEL",      group: "LAMPS", section: "POOLS", min: 0, max: 0.687, step: 0.001, def: 0.26, help: "Overall lamp brightness ceiling (on top of the twilight ramp). Applies to every track lamp — street posts and flood banks alike. 0 = fully off." },
  { id: "lampDensity",  label: "LAMP DENSITY",    group: "LAMPS", section: "POOLS", min: 0.1, max: 2.35, step: 0.005, def: 1.0, rebuild: true, help: "How densely lamps are placed along the track (1 = shipped ~22 m stride). Higher = more poles/pools per kilometre; lower = sparser. Light pools update live; pole geometry refreshes on the next track load. Distinct from LAMP COUNT (how many nearest lamps the shader keeps)." },
  { id: "floodDay",     label: "DAYTIME LAMPS",   group: "LAMPS", section: "POOLS", min: 0, max: 4.5, step: 0.001, def: 0.0, help: "Light track lamps during DAY sessions (normally off — the sun dominates). 0 = off (as-shipped), higher = brighter daytime pools. Lets you run a lit stadium look under a blue sky. Brightness still rides LAMP LEVEL and the per-lamp POOL ENERGY on top of this." },
  { id: "poolEnergy",   label: "POOL ENERGY",     group: "LAMPS", section: "POOLS", min: 0, max: 1.375, step: 0.001, def: 0.55, rebuild: true, help: "Per-lamp pool luminance scale (physical energy per fixture). Light pools rebake on the next slider tick; pole meshes wait for the next track load. 0 = no pool." },
  { id: "lampRadiusMul",label: "POOL RADIUS",     group: "LAMPS", section: "POOLS", min: 0.4, max: 1.9, step: 0.002, def: 1.0,  rebuild: true, help: "Reach of each lamp pool. Too small and the far pool corner dies." },
  { id: "bleedMul",     label: "VALLEY BLEED",    group: "LAMPS", section: "POOLS", min: 0, max: 2.5, step: 0.025,  def: 1.0,  rebuild: true, help: "Out-of-beam light floor — lifts the dark valleys between pools. Floor stays 0 (pitch-dark valleys already the minimum); headroom is on the bright side." },
  { id: "glareStr",     label: "LENS GLARE",      group: "LAMPS", section: "POOLS", min: 0, max: 0.3, step: 0.001, def: 0.12, help: "Lens-halo billboard strength at every active lamp." },
  { id: "lampTemp",     label: "LAMP TEMPERATURE",group: "LAMPS", section: "POOLS", min: -3.3, max: 8.3, step: 0.001, def: 0.0, fmt: "signed", help: "White-balance of ALL track lamps (street posts and flood banks). − warms toward sodium/amber, + cools toward LED/broadcast white. Layers over each lamp's own colour. Same mix as SUN / MOON WARMTH: warm cuts blue at 0.30/unit (zero at −3.33), cool cuts red at 0.12/unit (zero at +8.33), so the range stops at −3.3 / +8.3." },
  { id: "lampFlicker",  label: "LAMP FLICKER",    group: "LAMPS", section: "POOLS", min: 0, max: 0.6, step: 0.0005, def: 0.10, help: "How much aging lamps pulse. 0 = rock-steady, higher = strong buzz on the odd tube." },
  { id: "beamCone",     label: "BEAM CONE WIDTH", group: "LAMPS", section: "POOLS", min: 0.08, max: 2.2, step: 0.001, def: 1.0, rebuild: true, help: "Width of every lamp's illuminated cone. Wider = softer spread, narrower = tight hotspots." },
  { id: "lampWallSpill", label: "LAMP WALL SPILL", group: "LAMPS", section: "POOLS", min: 0, max: 3, step: 0.002, def: 1.0, u: "uLampWallSpill", help: "How much a lamp's light spills onto surfaces OUTSIDE its beam cone — the dim wash on walls/kerbs beside the lit pool (before the bright in-beam term takes over). 1 = as-shipped (a touch stronger on wet nights), 0 = the light is confined hard to its cone with pitch-black surroundings, higher = a broad ambient spill that lifts the whole surround, up to the point where the out-of-beam floor would exceed the in-beam value and invert the pool — which is where this range now stops. All three renderers (WebGL2, three.js and WebGPU)." },
  // Twilight ramp, warm-up, and the per-frame nearest-N cull
  { id: "twilightFloor", label: "TWILIGHT FLOOR",  group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 1, step: 0.005, def: 0.30, help: "Minimum lamp level at bright dawn/dusk while the sun is still up. Low = lamps stay dim until the sun drops; high = pools are already strong under a lit twilight sky. 0 = fully off until the sun-elevation ramp takes over. Only affects dawn/dusk sessions." },
  { id: "twilightRamp",  label: "TWILIGHT RAMP",   group: "LAMPS", section: "BEHAVIOUR", min: 0.4, max: 6, step: 0.05, def: 6, help: "How fast lamps climb from the twilight floor to full as the sun sets (steepness vs sun elevation). Higher = a quicker snap to full night lighting; lower = a long, gradual build. Dawn/dusk only." },
  { id: "twilightWarm",  label: "TWILIGHT WARMTH", group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 2.5, step: 0.005, def: 1.0, help: "How amber the lamps glow at twilight (the 'just switched on' sodium warmth that fades toward neutral by deep night). 0 = neutral lamps at dusk, 1 = as-shipped, higher = strong orange twilight cast. Dawn/dusk only." },
  { id: "lampWarmup",    label: "LAMP WARM-UP",    group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 2.5, step: 0.01, def: 1.0, help: "How long lamps take to ramp from a dim sodium-orange strike to full cool brightness when they switch on (scales the ~4-8 s warm-up). 0 = instant full brightness, 1 = as-shipped, higher = a long, staggered warm-up glow." },
  { id: "lampWarmupDim", label: "WARM-UP DIP",     group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 0.9, step: 0.005, def: 0.30, help: "How dim a freshly-struck lamp starts before warming to full (depth of the strike dip). 0 = lamps strike at full brightness, 0.30 = as-shipped (start at 70%), higher = a deeper cold start." },
  { id: "lampWarmupWarm",label: "WARM-UP WARMTH",  group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 2.5, step: 0.005, def: 1.0, help: "How orange a freshly-struck lamp glows before settling to its true colour (strike-warmth amount). 0 = strikes at final colour, 1 = as-shipped sodium-warm start, higher = a strong amber ignition." },
  { id: "lampCull",      label: "LAMP COUNT",      group: "LAMPS", section: "BEHAVIOUR", min: 16, max: 48, step: 1, def: 40, help: "How many of the nearest lamps light the scene at once when there's traffic (the shader has 48 slots; the rest are reserved for car tail-lights). Higher = more of the field lit but fewer tail-light slots on dense night grids. Solo running always uses all 48." },
  { id: "lampCullFade",  label: "LAMP CULL FADE",  group: "LAMPS", section: "BEHAVIOUR", min: 0.02, max: 0.9, step: 0.005, def: 0.35, help: "How far inside the lit radius a lamp reaches full brightness (the distance fade that hides lamps entering/leaving the set at speed). Measured on each lamp's TRUE distance, so turning the camera never changes it. Low = a thin fade band, a sharper edge to the lit zone; high = a broad, gentle falloff into the dark." },
  { id: "lampGapFill",   label: "DARK-GAP FILL",   group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 150, step: 5, def: 60, rebuild: true, help: "Longest stretch of road (m) allowed with no lamp before fill lights are inserted. Circuits that exclude the generic mast pass (dressingExclusions kind \"lamps\", or aliases \"floodlights\" / \"lighting\") can leave a stretch unlit — fill lights restore pools without mast geometry (no lens halo). 0 = off." },
  { id: "lampBehindBias",label: "BEHIND-CAM BIAS", group: "LAMPS", section: "BEHAVIOUR", min: 0.2, max: 8, step: 0.025, def: 5.25, help: "How strongly lamps behind the camera are deprioritised in the nearest-lamp cull, so the budget favours the road ahead. Also widens the radius the fade above is measured against, by the same amount, so the extra forward reach this buys stays lit instead of fading out. Low = lamps ranked closer to pure distance (the lit road ends in a hard line ahead); high = the lit zone pushes much further forward past the fog." },
  { id: "roadChunkLamps", label: "PER-CHUNK ROAD", group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 1, step: 1, def: 0, help: "EXPERIMENTAL, and needs PER-CHUNK LAMPS on to do anything. Extends the same per-chunk lamp binding to the ROAD, which is otherwise drawn as one mesh and so can only ever carry the single global set of 48. That is why the far road stays dark on a dense night circuit while the buildings beside it light up: the global cull picks the 48 lamps nearest the CAMERA, which covers the tarmac around the car and starves the road ahead. Splitting the road into spatial chunks lets each stretch carry its own lamps, and frustum-culls the ribbon as a side effect (today every metre of it is drawn every frame). Costs a second copy of the road geometry, built once on first use. WebGL2 and WebGPU — three.js has no per-chunk lamp binding." },
  { id: "perChunkLights", label: "PER-CHUNK LAMPS", group: "LAMPS", section: "BEHAVIOUR", min: 0, max: 1, step: 0.001, def: 0, help: "EXPERIMENTAL. 0 = off. ABOVE 0 it turns the feature on AND sets how strongly the per-chunk lamps light the scene \u2014 it is an amount, not a switch, because turning it on genuinely delivers more light: a fragment that used to see the handful of the global 48 that actually reach it now sees up to 24 that all do, so the whole night reads far too hot at the same LAMP LEVEL. Start around 0.2-0.4 and raise it; 1.0 is the original un-dimmed behaviour. Car tail-lights are NOT scaled by this.  Gives every chunk of scenery its OWN nearest-24 lamps instead of making the whole visible scene share one set of 48. The 48-lamp ceiling is the fragment shader\'s uniform-array size, so it limits lamps per DRAW, not per scene — and because lamps are baked per track and chunk bounds are fixed, the whole per-chunk table is baked once per track. On a dense night circuit this lights the far road without LAMP COUNT / LAMP REACH AHEAD having to ration slots, and per-fragment cost drops (a chunk binds only lamps that reach it). Costs one uniform upload per chunk draw, so it trades a little CPU for a lot of reach. 0 = as-shipped single global set. WebGL2 and WebGPU — three.js keeps the single global set. HELD OFF automatically below the top graphics tier (GRAPHICS must be HIGH or ULTRA) and after a display reset, because at full amount it can stall a weaker GPU — the slider then stores a value that takes effect once the tier allows it." },
  { id: "lampReach",     label: "LAMP REACH AHEAD", group: "LAMPS", section: "BEHAVIOUR", min: 1, max: 4, step: 0.01, def: 1.0, help: "How much extra priority lamps AHEAD of the camera get in the nearest-lamp cull, so the lit zone reaches further down the road before a dense track's lamp budget runs out. The number is the REACH MULTIPLIER for a lamp dead ahead: 4 = a lamp four times further away still wins a slot (lamps to the side are unaffected, and 1 = as-shipped, pure distance + BEHIND-CAM BIAS). Only matters once a track has more lamps in range than the LAMP COUNT budget (48 shader slots, 40 with traffic) — where it does, expect the far end of a lit straight to extend rather than the near road to brighten. Ceiling is 4: measured Singapore/Vegas sightlines saturate by reach 3 (no further lamps left to promote), so 4–12 was leftover-wide dead travel." },
  { id: "lampNearClamp", label: "LAMP NEAR CLAMP", group: "LAMPS", section: "BEHAVIOUR", min: 1, max: 8.5, step: 0.025, def: 4.0, u: "uLampNearClamp", help: "Minimum distance (m) used in each lamp's inverse-square falloff, so a surface right under a fixture can't blow out to infinite brightness. 4 = as-shipped, lower = a hot, tight pool with a fierce hotspot directly beneath the lamp, higher = a softer, flatter pool that never over-brightens up close. All three renderers (WebGL2, three.js and WebGPU)." },
  // ── NIGHT GLOW & BLOOM ──
  { id: "floodEmitMul", label: "LIT GEOMETRY",    group: "NIGHT GLOW & BLOOM", min: 0, max: 1.425, step: 0.005,  def: 1.0,  help: "How lit the night buildings/windows/signage render (prop emissive ramp). Ceiling is 1.425 — `Math.min(1, this × factor)` in game.js, and the dusk factor tops at 0.70, so anything higher was dead travel (night's 0.78 factor saturates even earlier, at 1.28)." },
  { id: "glowAmp",      label: "EMISSIVE GLOW",   group: "NIGHT GLOW & BLOOM", min: 0, max: 6, step: 0.005,   def: 2.3,  u: "uGlowAmp", help: "HDR push for windows / lenses / neon — roughly half the night frame energy. 0 = fully off." },
  { id: "neonBoost",    label: "NEON & LENS BLOOM", group: "NIGHT GLOW & BLOOM", min: 0, max: 1.5, step: 0.002, def: 0.6, u: "uBloomBoost", help: "Extra HDR glow for authored light-source surfaces — neon bands, signage panes, floodlight lenses (anything baked BRIGHTER than white). Scales with how far past white the surface is, so generic emissive (lit concrete, warm windows, night road glow) is untouched — neon pops without raising EMISSIVE GLOW or dropping BLOOM THRESHOLD for the whole scene. 0 = the old uniform push." },
  { id: "cityGlowMul",  label: "CITY SKYGLOW",    group: "NIGHT GLOW & BLOOM", min: 0, max: 2.75, step: 0.005,  def: 1.0, help: "Light-pollution dome hugging the horizon over lit circuits/cities." },
  { id: "cityGlowWarm", label: "SKYGLOW WARMTH",  group: "NIGHT GLOW & BLOOM", min: -5, max: 3.3, step: 0.002, def: 0.0, fmt: "signed", help: "White-balance of the city skyglow dome AND the warm hue it casts into the night ambient. − cools toward LED/mercury white-blue, + warms toward sodium amber. 0 = the per-theme shipped tint (magenta-ish neon canyons, amber towns). Asymmetric on purpose: warm cuts blue at 0.30/unit (zero at +3.33) while cool cuts red at 0.20/unit (zero at −5), so the range stops at −5 / +3.3 — the last live notch on each side." },
  { id: "cityGlowTint", label: "SKYGLOW ON AMBIENT", group: "NIGHT GLOW & BLOOM", min: 0, max: 0.7, step: 0.002, def: 0.28, help: "How strongly the city skyglow's colour bleeds into the night ambient fill — the neon/sodium hue you see wash the shadows in a lit city. 0 = neutral night ambient (glow only in the sky dome), 0.28 = as-shipped, higher = the whole night reads in the city's colour." },
  { id: "bloomMul",     label: "BLOOM AMOUNT",    group: "NIGHT GLOW & BLOOM", min: 0, max: 2.5, step: 0.005,  def: 1.0,  help: "Halo strength around bright HDR sources (lamps, neon, windows). Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "bloomSpread",  label: "BLOOM SPREAD",    group: "NIGHT GLOW & BLOOM", min: 0.25, max: 2.125, step: 0.001, def: 1.0, u: "uSpread", help: "Halo WIDTH, independent of amount. Higher = wider, dreamier glow; lower = tight core. Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "threshOff",    label: "BLOOM THRESHOLD", group: "NIGHT GLOW & BLOOM", min: -0.57, max: 0.4, step: 0.0025,  def: 0.0,  help: "Offset on what counts as bright enough to bloom. Lower = mid-tones glow (fog-of-glow). The composite is `clamp(base + this, 0.4, 1.2)` — night bases sit near 0.97 so the last +0.4 notch is already at the 1.2 ceiling; day bases sit near 0.78 so the last −0.5 notch is already at the 0.4 floor. Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  { id: "bloomKnee",    label: "BLOOM ON HIGHLIGHTS", group: "NIGHT GLOW & BLOOM", min: 0, max: 1, step: 0.002, def: 0.5, u: "uBloomKnee", help: "How much bloom is SUPPRESSED over already-bright pixels (highlight knee). 0 = bloom everything evenly (milky, dreamy); 1 = strongly hold bloom off blown highlights so only mid-bright HDR sources halo (crisp). 0.5 = as-shipped. Stays live on GRAPHICS: LOW; the governor or a crash floor can still shed the pass." },
  // ── ATMOSPHERE ──
  { id: "fogDensityMul",label: "FOG DENSITY",     group: "ATMOSPHERE", min: 0, max: 3.625, step: 0.001, def: 1.0, u: "uFogDensity", help: "Scales atmospheric haze depth — how fast distance fades into fog. 1 = as-shipped." },
  { id: "fogHeight",    label: "FOG HEIGHT FALLOFF", group: "ATMOSPHERE", min: 0, max: 0.25, step: 0.0005, def: 0.018, u: "uFogHeight", help: "How fast fog thins with altitude. 0 = uniform wall; higher = fog pools low and clears overhead." },
  { id: "fogTint",      label: "FOG WARM / COOL", group: "ATMOSPHERE", min: -6, max: 3.9, step: 0.001, def: 0.0, u: "uFogTint", fmt: "signed", help: "White-balance of the distance haze. + warm (amber/dusty), − cool (blue/overcast). Asymmetric on purpose: the shader's warm side cuts blue at 0.25/unit (zero at +4) while the cool side cuts red at 0.12/unit (zero at −8.3), so the range stops at 3.9 / −6 — the last live notch on each side." },
  { id: "fogColorSat",  label: "FOG COLOUR SATURATION", group: "ATMOSPHERE", min: 0, max: 2.5, step: 0.002, def: 1.0, help: "How colourful vs neutral-grey the base fog/haze colour is. 1 = as-shipped, 0 = a flat achromatic grey haze, higher = a vivid coloured murk (e.g. the amber dawn / blue overcast fog reads much stronger). Distinct from FOG WARM / COOL (which shifts the hue) — this sets how far the fog sits from grey. Applied to the condition-derived fog colour before the warm/cool balance." },
  { id: "mistDensity",  label: "GROUND MIST",     group: "ATMOSPHERE", min: 0, max: 3.75, step: 0.001, def: 1.0, u: "uGroundMist", help: "Amount of low-lying drifting ground mist (dawn/humid/fog). 0 = none. Ceiling is 3.75 — the shader mix-caps the bank at 0.45, and the thinnest authored groundMist (wet 0.12) hits that at 0.45/0.12. Thicker conditions (dawn 0.40, fog 0.58) saturate earlier; past 3.75 the visible bank is unchanged." },
  { id: "mistHeight",   label: "MIST HEIGHT BAND",group: "ATMOSPHERE", min: 0.05, max: 0.675, step: 0.001, def: 0.30, u: "uMistHeight", help: "How tall the ground-mist layer stands. Low = ankle fog, high = deep bank up to the eyeline." },
  { id: "lampFogBase",  label: "FOG GLOW BASE",   group: "ATMOSPHERE", min: 0, max: 0.9, step: 0.001, def: 0.45, help: "How strongly lamps tint the distant fog wall on a clear night. Tops out at 0.9 because its only consumer sums it with FOG GLOW HAZE under a Math.min(0.9, ...) ceiling (js/game.js) — the slider used to run to 1.5, so its top 40% moved nothing at all." },
  { id: "lampFogHaze",  label: "FOG GLOW HAZE",   group: "ATMOSPHERE", min: 0, max: 1.5, step: 0.001, def: 0.6,  help: "Extra lamp-fog glow added as ground mist / fog weather thickens." },
  { id: "mistShare",    label: "MIST GLOW SHARE", group: "ATMOSPHERE", min: 0, max: 3.75, step: 0.025,  def: 1.5,  u: "uMistShare", help: "Ground-mist share of the lamp glow vs the air-fog share." },
  { id: "hazeWetShare", label: "WET HAZE SHARE",  group: "ATMOSPHERE", min: 0, max: 0.55, step: 0.001, def: 0.22, help: "How much a WET road feeds the volumetric haze that god-rays and lamp-beams scatter through (spray/humidity hanging in the air). 0.22 = as-shipped, 0 = wet roads add no airborne haze (shafts only respond to mist/cloud), higher = rain sessions fill with thick light-catching spray. Separate from GROUND MIST and the on-road wetness sheen." },
  { id: "hazeCloudShare", label: "CLOUD HAZE SHARE", group: "ATMOSPHERE", min: 0, max: 0.3, step: 0.001, def: 0.12, help: "How much CLOUD COVER feeds the volumetric haze that god-rays and lamp-beams scatter through (an overcast sky's diffuse murk). 0.12 = as-shipped, 0 = cloud adds no airborne haze, higher = heavy overcast fills the air with light-catching haze. Separate from cloud SHADOWS and the sky dome cover." },
  { id: "fogClip",      label: "FOG GLOW CLIP",   group: "ATMOSPHERE", min: 0, max: 1.75, step: 0.002, def: 0.7,  u: "uLampFogClip", help: "Soft shoulder stopping lamp clusters pushing the fog wall to white." },
  { id: "fogSunCore",   label: "FOG SUN CORE",    group: "ATMOSPHERE", min: 0, max: 1.5, step: 0.002, def: 0.6, u: "uFogSunCore", help: "The tight hot bloom of the sun burning through haze — a concentrated bright core right at the sun's position in the fog (on top of the broad sun-glow scatter). 0.6 = as-shipped, 0 = no hot core (just the wide glow), higher = a fierce sun burning through the murk. Best seen at low dawn/dusk sun through fog." },
  { id: "overcastFogMul", label: "OVERCAST FOG BOOST", group: "ATMOSPHERE", min: 1, max: 2.75, step: 0.005, def: 1.7, help: "How much thicker the atmospheric haze gets in OVERCAST weather (multiplies the base fog density). 1.7 = as-shipped, 1 = overcast adds no extra haze (clear-day fog depth), higher = a soupier grey murk. Only affects overcast sessions; FOG BOOST does the same for fog weather." },
  { id: "fogWxMul",     label: "FOG BOOST",       group: "ATMOSPHERE", min: 1, max: 6, step: 0.005, def: 3.0, help: "How much thicker the atmospheric haze gets in FOG weather (multiplies the base fog density). 3.0 = as-shipped, 1 = fog weather adds no extra haze, higher = near-zero-visibility pea-soup. Only affects fog sessions; OVERCAST FOG BOOST does the same for overcast." },
  { id: "lampVolBase",  label: "BEAMS (CLEAR)",   group: "ATMOSPHERE", min: 0, max: 0.7, step: 0.001, def: 0.05, help: "Volumetric lamp-beam strength in clear night air. Stays live on GRAPHICS: LOW (desktop). Mobile tier renders no beams regardless (the volumetric pass is shed for GPU headroom)." },
  { id: "lampVolHaze",  label: "BEAMS (HAZE)",    group: "ATMOSPHERE", min: 0, max: 1.5, step: 0.005, def: 0.65, help: "How much haze/rain swells the lamp beams." },
  { id: "lampVolCap",   label: "BEAM CEILING",    group: "ATMOSPHERE", min: 0, max: 1.5, step: 0.001, def: 0.70, help: "Hard cap on volumetric beam strength." },
  { id: "renderDistMul", label: "RENDER DISTANCE", group: "ATMOSPHERE", min: 0.3, max: 2.05, step: 0.005, def: 1.0, help: "Scales how far the camera can see — the far clipping plane AND the scenery draw-distance cull move together. 1 = as-shipped (900 m). Higher reveals more distant track/scenery at a real GPU cost (more chunks drawn every frame); lower saves performance on weak devices. Fog still fades distant geometry out visually regardless of this setting." },
  // ── REFLECTIONS ──
  { id: "ssrWetMul",    label: "WET MIRROR",      group: "ROAD & REFLECTIONS", min: 0, max: 2.4, step: 0.01, def: 1.0,  help: "Wet-road scene-mirror strength (scales the wetness ramp). Off on GRAPHICS: LOW and MEDIUM (SSR cost shed)." },
  { id: "ssrDryNight",  label: "DRY NIGHT SHEEN", group: "ROAD & REFLECTIONS", min: 0, max: 1, step: 0.0005, def: 0.08, help: "Dry tarmac lamp/neon sheen at night. Off on GRAPHICS: LOW and MEDIUM (SSR cost shed)." },
  { id: "ssrDryDay",    label: "DRY DAY SHEEN",   group: "ROAD & REFLECTIONS", min: 0, max: 0.6, step: 0.0005, def: 0.07, help: "Faint tower-and-sky mirror on dry day tarmac. Off on GRAPHICS: LOW and MEDIUM (SSR cost shed)." },
  { id: "roadRough",    label: "TARMAC ROUGHNESS",group: "ROAD & REFLECTIONS", min: 0.05, max: 1.175, step: 0.005, def: 1.0, help: "Scales dry-tarmac roughness — lower = glossier asphalt with a tighter sun streak. Bounds now track the shader's actual roughness clamp (0.85×value clamped to 0.04..1): below ~0.05 or above ~1.2 the old wider slider was just dead range that did nothing extra." },
  { id: "surfDetail",   label: "SURFACE DETAIL",  group: "ROAD & REFLECTIONS", min: 0, max: 2.5, step: 0.01, def: 1.0, help: "Road/terrain procedural grain + micro-normal relief (aggregate, patches, cracks). 0 = flat." },
  { id: "matTexMix",    label: "BAKED MATERIALS", group: "ROAD & REFLECTIONS", min: 0, max: 1, step: 0.002, def: 1.0, u: "uMatTexMix", help: "Blends the BAKED PBR material maps (assets/pack — real CC0 photoscans: albedo, roughness and normal, indexed by the surface's MAT id) over the procedural noise. 1 = as-shipped, full baked detail. 0 = pure procedural, the pre-scan look (the pack still loads at boot; this only blends it off). Multiplicative, so the per-track tarmac tint and racing-line wear survive at any setting. Does nothing when no asset pack is installed. All three renderers (WebGL2, three.js and WebGPU). If tarmac ever crawls or shimmers at speed, this is the slider to pull." },
  { id: "ssrThick",     label: "SSR THICKNESS",   group: "ROAD & REFLECTIONS", min: 0.05, max: 1, step: 0.01, def: 0.20, u: "uSsrThick", help: "Minimum view-space depth gap (m) for a wet-road reflection hit (`dz > this` and `dz < max(5, step)`). Lower = more hits, more smear; higher = crisper with more gaps. The 5 m far-window is a reject, not this slider — at 5 the hit test is empty, so the range stops at 1. Off on GRAPHICS: LOW and MEDIUM (SSR cost shed)." },
  { id: "wetDark",      label: "WET ROAD DARKEN", group: "ROAD & REFLECTIONS", min: 0, max: 1.72, step: 0.005, def: 1.0, u: "uWetDark", help: "How much darker wet asphalt reads (water absorption). Independent of the wetness amount." },
  { id: "windowSunFlash", label: "WINDOW SUN FLASH", group: "ROAD & REFLECTIONS", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uWindowSunFlash", help: "The mirror-bright flash of the sun off building glass — the hot specular pinpoint that slides across reflective façades as you pass. 1 = as-shipped, 0 = flat matte glass with no sun hotspot, higher = a blazing glare off every window. Day-only; scales with how directly the glass faces the sun. All three renderers (WebGL2, three.js and WebGPU)." },
  { id: "skyRimGlow",   label: "SKY RIM GLOW",    group: "ROAD & REFLECTIONS", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uSkyRimGlow", help: "Fresnel rim light along the grazing edges of reflective surfaces (glass, wet bodywork) picking up the sky — the bright sheen where a surface curves away from you. 1 = as-shipped, 0 = no edge sheen (matte silhouettes), higher = a strong glassy rim halo. Strongest on smooth surfaces at grazing angles. All three renderers (WebGL2, three.js and WebGPU)." },
  // ── CAR ──
  { id: "carReflect",   label: "CAR REFLECTION",  group: "CAR", min: 0, max: 1, step: 0.005, def: 0.05, u: "uCarReflect", help: "How strongly the world (track, sky, lights) mirrors on the car bodywork. Off on GRAPHICS: LOW and MEDIUM (SSR cost shed)." },
  { id: "carEnvCube",   label: "ENV REFLECTION",  group: "CAR", min: 0, max: 1, step: 0.01,
    // Desktop default ON (0.3): the live probe pass is cheap there and the paint
    // mirroring the real surroundings is a marquee look. Mobile stays OFF — the
    // extra per-frame world pass + HDR cube can exhaust memory-limited mobile
    // GPUs and drop the WebGL context (tier-gated at the def, so presets /
    // localStorage still override either way).
    def: (typeof GLX !== "undefined" && GLX.isMobile) ? 0.0 : 0.3,
    help: "Live cubemap probe: the paint mirrors the REAL surroundings (one face re-rendered per frame). Default ON (0.3) on desktop; OFF on phones — the extra per-frame world pass + HDR cube can exhaust memory-limited mobile GPUs and drop the WebGL context. 0 = analytic sky reflection only (no probe pass). It's a 0..1 cross-fade so the range is already exact — only the step got finer. Off on GRAPHICS: LOW and MEDIUM (env-probe cost shed)." },
  { id: "carGloss",     label: "PAINT GLOSS",     group: "CAR", min: 0.2, max: 1.4, step: 0.005, def: 1.0,  u: "uCarGloss", help: "Sharpness of the paint's highlights & reflections. Higher = glassier (lower roughness). Ceiling is 1.4 — `carSoft = clamp((1.4 - gloss)*0.5, 0, 1)` in the SSR streak is already 0 there, so anything higher was dead travel. Floor 0.15 is where typical paint roughness (`base/gloss`) hits the 1.0 clamp." },
  { id: "carSpecular",  label: "PAINT SPECULAR",  group: "CAR", min: 0, max: 2.5, step: 0.002, def: 1.0,  help: "Brightness of the specular highlight rolling over the bodywork." },
  { id: "carClearcoat", label: "CLEARCOAT",       group: "CAR", min: 0, max: 1, step: 0.005, def: 0.05, help: "Lacquer coat that catches crisp sun / lamp glints over the base colour. Ceiling is 1 — night paint ships at clearcoat 1.0, and the shader treats the term as a 0..1 amount." },
  { id: "carMetal",     label: "PAINT METALNESS", group: "CAR", min: 0, max: 2.5, step: 0.01, def: 1.0,  help: "How metallic the paint reads — reflection tint and grazing falloff." },
  { id: "carGlow",      label: "BODY GLOW",       group: "CAR", min: 0, max: 2.5, step: 0.02, def: 1.0,  help: "Self-lit body glow after dark (only the night / wet liveries carry it)." },
  { id: "tailLightMul", label: "TAIL-LIGHT GLOW", group: "CAR", min: 0, max: 2.5, step: 0.005, def: 1.0, help: "Brightness of the red glow trailing nearby cars after dark." },
  { id: "brakeGlowMul", label: "BRAKE FLARE",     group: "CAR", min: 0, max: 2.5, step: 0.005, def: 1.0, help: "How hard the tail-light glow surges while a car is braking (scales the brake-heat flare on top of TAIL-LIGHT GLOW). 0 = steady tail light, no flare." },
  { id: "tailRange",    label: "TAIL-LIGHT RANGE", group: "CAR", min: 60, max: 310, step: 5, def: 160, help: "How far (m) a car's tail-light keeps working as a real light source on nearby traffic. Beyond this it's dropped from the light budget. Higher = traffic glow reaches further back down the field." },
  { id: "tailFade",     label: "TAIL-LIGHT FADE",  group: "CAR", min: 0, max: 60, step: 0.5, def: 0, help: "Distance (m) over which a car's tail-light eases out before TAIL-LIGHT RANGE, so it doesn't pop in/out abruptly as traffic drifts past the limit. 0 = hard cutoff (as-shipped), higher = softer, longer fade." },
  { id: "carSunGlint",  label: "PAINT SUN GLINT",  group: "CAR", min: 0, max: 30, step: 0.05, def: 12.0, u: "uCarSunGlint", help: "The mirror-bright pinpoint reflection of the sun off the car's clearcoat (the moving hotspot that slides over the bodywork). 12 = as-shipped, 0 = no sun hotspot on the paint, higher = a blazing HDR glint that blooms hard. Separate from PAINT SPECULAR (the broad highlight)." },
  { id: "carSparkle",   label: "METALLIC SPARKLE", group: "CAR", min: 0, max: 4, step: 0.005, def: 1.6, u: "uCarSparkle", help: "Gain of the metallic-flake glitter in the paint — the tiny individual flakes that flash as the camera moves. 1.6 = as-shipped, 0 = a flat non-metallic finish, higher = a denser, brighter sparkle field. Only affects metallic-flagged liveries." },
  // ── SKY & WEATHER ──
  { id: "cloudCover",   label: "CLOUD COVER",     group: "SKY & WEATHER", min: -1, max: 1, step: 0.001, def: 0.0, fmt: "signed", help: "Shifts cloud amount up/down from the weather default (also drives cloud shadows). 0 = as-shipped. A full ±1 swing already forces clear or overcast from any starting weather." },
  { id: "cloudShadowDim", label: "CLOUD SHADOW DEPTH", group: "SKY & WEATHER", min: 0, max: 1, step: 0.002, def: 0.80, u: "uCloudShadowDim", help: "How darkly drifting clouds dim the sun where their shadow passes over the track. 0 = clouds cast no shade (flat, evenly-lit ground even under heavy cover), 0.80 = as-shipped, 1 = clouds fully block the sun in their shadow. Pairs with CLOUD COVER (which sets how much cloud there is)." },
  { id: "cloudSpeed",   label: "CLOUD SPEED",     group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.005, def: 1.0, u: "uCloudSpeed", help: "How fast clouds drift and evolve. 0 = frozen sky, higher = fast-moving weather." },
  { id: "starBright",   label: "STAR BRIGHTNESS", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.001, def: 1.0, u: "uStarBright", help: "Night star intensity. 0 = washed sky, higher = vivid starfield." },
  { id: "starDensity",  label: "STAR DENSITY",    group: "SKY & WEATHER", min: 0.2, max: 2.2, step: 0.01, def: 1.0, u: "uStarDensity", help: "How MANY stars fill the night sky (independent of STAR BRIGHTNESS, which sets how bright each one is). 1 = as-shipped, lower = a sparse sky, higher = a dense field. Floored so a near-zero setting still leaves a scattering of stars rather than an empty sky." },
  { id: "skyGrad",      label: "SKY GRADIENT",    group: "SKY & WEATHER", min: 0.03, max: 0.829, step: 0.001, def: 0.35, u: "uSkyGrad", help: "Shape of the horizon→zenith sky gradient (the exponent). 0.35 = as-shipped (deep zenith blue reaching well down the sky); lower pulls the rich colour even lower for a moodier dome; higher washes the mid-sky pale and keeps saturation to the very top." },
  { id: "daySkyBlue",   label: "DAY SKY BLUE",    group: "SKY & WEATHER", min: 0, max: 2, step: 0.002, def: 1.0, u: "uDaySkyBlue", help: "Strength of the deep saturated-blue band pushed into the low/mid daytime sky so the gameplay sky strip isn't a flat pale wash. 0 = off (plain gradient), 1 = as-shipped. Ceiling is 3 — the shader clamps the mix at 1, so the peak of the band saturates at 1 and extra range only punches the band edges; past 3 (bandLM < 1/3) that is dead travel too. Day-only; fades out under overcast and at dawn/dusk/night." },
  { id: "mieScatter",   label: "SKY SUN GLOW",    group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uMieScatter", help: "Mie forward-scatter glow around the sun — the bright haze bloom filling the sky in the sun's direction, strongest near the horizon. 1 = as-shipped, 0 = a clean sky with no glow, 2.5 = 2.5× shipped (the shader mix-clamps at 4.54; this range stops where the default sits in a usable band)." },
  { id: "cloudSilver",  label: "CLOUD SILVER LINING", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uCloudSilver", help: "Backlit sun-facing cloud-edge glow (the bright silver/gold rim on clouds between you and the sun). 1 = as-shipped, 0 = flat matte clouds with no rim light, higher = blazing fire-lit edges. Most intense at golden hour." },
  { id: "coronaAureole",label: "SUN AUREOLE",     group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uCoronaAureole", help: "The broad soft halo of light around the sun disc (distinct from the tight inner ring and the sun disc itself). 1 = as-shipped, 0 = a bare sun disc with no surrounding glow, higher = a large radiant aureole." },
  { id: "sunDiscSize",  label: "SUN DISC SIZE",   group: "SKY & WEATHER", min: 0.06, max: 2.405, step: 0.005, def: 1.0, u: "uSunDiscSize", help: "Angular size of the sun disc in the sky. 1 = as-shipped (real-sun size), larger = a bigger dramatic sun (sunset-photo look), smaller = a tighter pinpoint. Scales the disc radius without touching the corona or aureole." },
  { id: "sunCorona",    label: "SUN CORONA RING", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uSunCorona", help: "The tight bright inner ring hugging the sun disc (distinct from the broad SUN AUREOLE and the disc itself). 1 = as-shipped, 0 = no ring (bare disc + aureole), higher = a fierce hot halo right at the disc edge." },
  { id: "sunSquash",    label: "SUN HORIZON SQUASH", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uSunSquash", help: "How much the sun disc flattens vertically as it nears the horizon (atmospheric-refraction oval, strongest at golden hour). 1 = as-shipped, 0 = a perfectly round sun at any height, higher = a strongly squashed sunset oval." },
  { id: "starSize",     label: "STAR SIZE",       group: "SKY & WEATHER", min: 0.2, max: 2.2, step: 0.002, def: 1.0, u: "uStarSize", help: "Angular size of each night star point. 1 = as-shipped, lower = fine pinpricks, higher = fatter stars. Independent of STAR BRIGHTNESS (how bright) and STAR DENSITY (how many)." },
  { id: "starTwinkle",  label: "STAR TWINKLE",    group: "SKY & WEATHER", min: 0, max: 4, step: 0.002, def: 1.0, u: "uStarTwinkle", help: "How much the stars pulse in brightness over time (twinkle amplitude). 1 = as-shipped, 0 = rock-steady stars, higher = a lively shimmering sky. Driven by the sky clock, so frozen CLOUD SPEED still twinkles." },
  { id: "moonDiscSize", label: "MOON DISC SIZE",  group: "SKY & WEATHER", min: 0.06, max: 2.405, step: 0.005, def: 1.0, u: "uMoonDiscSize", help: "Angular size of the moon disc at night. 1 = as-shipped, larger = a big dramatic moon, smaller = a distant pinpoint. Scales the disc without touching the halo." },
  { id: "moonHalo",     label: "MOON HALO SPREAD", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, u: "uMoonHalo", help: "The soft glow spreading out from the moon disc. 1 = as-shipped, 0 = a bare disc with no halo, higher = a broad hazy glow (moon through thin cloud). Scales both the halo strength and how far it reaches." },
  { id: "cityGlowReach", label: "CITY GLOW REACH", group: "SKY & WEATHER", min: 0.04, max: 2.44, step: 0.002, def: 1.0, u: "uCityGlowReach", help: "How high up the sky the city light-pollution dome climbs from the horizon. 1 = as-shipped (hugs the horizon), lower = the glow reaches higher up toward the zenith, higher = a thin band pinned to the horizon. Pairs with CITY SKYGLOW (strength)." },
  { id: "cloudDef",     label: "CLOUD DEFINITION", group: "SKY & WEATHER", min: 0, max: 1.2, step: 0.002, def: 1.0, u: "uCloudDef", help: "How sharply the billow octave carves lumpy cumulus edges onto the cloud cover. 1 = as-shipped, 0 = soft flat cloud smears, higher = harder-edged cauliflower puffs. All three renderers (WebGL2, three.js and WebGPU)." },
  { id: "skyColorSat",  label: "SKY COLOUR SATURATION", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, help: "How colourful vs neutral-grey the sky dome is (zenith + horizon bands). 1 = as-shipped, 0 = a flat achromatic grey sky, higher = a punchy oversaturated dome (deeper blue day, more vivid dawn/dusk colour). Applied to the condition-derived sky colours; the reflected sky (glass/wet-road mirror) follows it too, so the whole scene stays coherent. Distinct from SKY GRADIENT (gradient shape) and DAY SKY BLUE (the daytime blue band)." },
  { id: "wetness",      label: "WETNESS",         group: "SKY & WEATHER", min: -0.05, max: 1, step: 0.005, def: -0.05, fmt: "auto", help: "Override the road wetness ramp (AUTO = follow weather; ramps in over a few seconds after a weather flip)." },
  { id: "rainCount",    label: "RAIN INTENSITY",  group: "SKY & WEATHER", min: 20, max: 1000, step: 5, def: 360, reinitRain: true, help: "Number of falling rain streaks (storm density)." },
  { id: "rainStreak",   label: "RAIN STREAK LEN", group: "SKY & WEATHER", min: 0.04, max: 2.44, step: 0.002, def: 1.0, reinitRain: true, help: "Length of rain streaks — short spits vs long driving streaks." },
  { id: "rainSpeed",    label: "RAIN FALL SPEED", group: "SKY & WEATHER", min: 0.04, max: 2.44, step: 0.002, def: 1.0, reinitRain: true, help: "How fast the rain streaks fall down the screen (base velocity of each drop before the speed-reactive shear). 1 = as-shipped, lower = a slow drifting drizzle, higher = a hard driving downpour. Drizzle (WET, no storm) still falls at 60% of this." },
  { id: "drizzleCount", label: "DRIZZLE DENSITY",  group: "SKY & WEATHER", min: 0, max: 1, step: 0.002, def: 0.30, reinitRain: true, help: "How many streaks a DRIZZLE (WET road, no storm) draws vs a full downpour. 0.30 = as-shipped (30% of RAIN INTENSITY), 0 = a damp track with no visible fall, 1 = drizzle as dense as a storm. Only affects WET (non-raining) sessions." },
  { id: "drizzleLen",   label: "DRIZZLE STREAK",   group: "SKY & WEATHER", min: 0, max: 1, step: 0.002, def: 0.50, reinitRain: true, help: "Length of DRIZZLE streaks vs a full storm. 0.50 = as-shipped (half-length spits), lower = fine mist dots, higher = longer streaks approaching storm rain. Only affects WET (non-raining) sessions." },
  { id: "drizzleSpeed", label: "DRIZZLE FALL SPEED", group: "SKY & WEATHER", min: 0, max: 1, step: 0.002, def: 0.60, reinitRain: true, help: "How fast DRIZZLE falls vs a full storm. 0.60 = as-shipped (a slow soft fall), lower = a drifting haze, higher = a brisker fall approaching storm speed. Only affects WET (non-raining) sessions." },
  { id: "rainOpacity",  label: "RAIN OPACITY",    group: "SKY & WEATHER", min: 0, max: 4, step: 0.002, def: 1.0, help: "How visible the falling rain is (alpha of the streak layer). 1 = as-shipped, 0 = invisible rain, higher = a dense, near-opaque sheet. Drizzle draws fainter than a full storm at any setting." },
  { id: "rainWind",     label: "RAIN WIND",       group: "SKY & WEATHER", min: -3, max: 3, step: 0.001, def: 0.18, fmt: "signed", help: "Horizontal wind slant on the rain (angle of the streaks). Unclamped drift term, so widened like the white-balance knobs — high settings rake the rain almost horizontal." },
  { id: "rainShearWind", label: "RAIN SPEED SLANT", group: "SKY & WEATHER", min: 0, max: 2.25, step: 0.002, def: 0.9, help: "How much the rain slants toward you as the car speeds up (apparent-wind shear added to RAIN WIND, ramping in to full by ~90 m/s). 0.9 = as-shipped, 0 = rain falls at the same angle standing still or flat-out, higher = the streaks rake hard sideways at speed." },
  { id: "rainShearLen", label: "RAIN SPEED STRETCH", group: "SKY & WEATHER", min: 0, max: 5, step: 0.005, def: 2.0, help: "How much the rain streaks stretch out as the car speeds up (motion-streak elongation, ramping to full by ~90 m/s). 2.0 = as-shipped (up to 3× length flat-out), 0 = streaks keep their standing length at any speed, higher = long driving streaks at speed." },
  { id: "lightning",    label: "LIGHTNING FREQ",  group: "SKY & WEATHER", min: 0, max: 2.75, step: 0.001, def: 1.0, help: "Storm lightning strike rate. 0 = off, higher = more frequent flashes." },
  { id: "lightningFlash", label: "LIGHTNING FLASH", group: "SKY & WEATHER", min: 0, max: 2, step: 0.002, def: 1.0, help: "How brightly a lightning strike bleaches the scene (scales the ambient spike + exposure lift together). 1 = as-shipped, 0 = thunder only with no visible flash, higher = a blinding strobe. LIGHTNING FREQ sets how often; this sets how hard." },
  { id: "lightningDecay", label: "LIGHTNING DECAY", group: "SKY & WEATHER", min: 0.4, max: 19.35, step: 0.05, def: 8.0, help: "How fast a lightning flash fades after the strike (exponential decay rate). 8 = as-shipped (~0.9 s glow), lower = a lingering sky-wide flicker, higher = a snappy instant flash." },
  { id: "weatherSunMute", label: "WEATHER SUN MUTE", group: "SKY & WEATHER", min: 0, max: 2.5, step: 0.002, def: 1.0, help: "How much wet/rain/overcast/fog weather dims the direct sun. 0 = weather doesn't mute the sun at all (bright, hard light through the storm); 1 = as-shipped; higher = deeper flat-grey murk. No effect in clear/dry weather." },
  // ── IMAGE & COLOUR ──
  { id: "exposureMul",  label: "EXPOSURE",        group: "IMAGE & COLOUR", min: 0.1, max: 2.35, step: 0.005,  def: 1.0,  help: "Master brightness multiplier on the tone-map input (all times of day) — applied before the tone-mapper, so this is the most direct way to darken or blow out the whole frame. 1 = as-shipped; the range is centred on that so everyday nudges are selectable." },
  { id: "contrast",     label: "CONTRAST",        group: "IMAGE & COLOUR", min: 0.5, max: 2.05, step: 0.001, def: 1.12, u: "uContrast", help: "Midtone-darkening gamma. Higher = deeper, filmic shadows; lower = flatter and brighter." },
  { id: "blacks",     label: "BLACKS",     group: "IMAGE & COLOUR", section: "TONAL RANGE", min: -0.6, max: 0.6, step: 0.001, def: 0, fmt: "signed", help: "Exposure of the deepest detail near black. Positive reveals it; negative crushes it. 0 is neutral." },
  { id: "shadows",    label: "SHADOWS",    group: "IMAGE & COLOUR", min: -0.55, max: 0.55, step: 0.001, def: 0, fmt: "signed", help: "Exposure of dark asphalt, tyres and unlit bodywork above the black point. 0 is neutral." },
  { id: "midtones",   label: "MIDTONES",   group: "IMAGE & COLOUR", min: -2, max: 1.4, step: 0.001, def: 0, fmt: "signed", help: "Exposure around middle grey: most paint, grass and track detail. 0 is neutral." },
  { id: "highlights", label: "HIGHLIGHTS", group: "IMAGE & COLOUR", min: -1, max: 1.5, step: 0.001, def: 0, fmt: "signed", help: "Exposure of bright bodywork, clouds and lamp pools below peak white. 0 is neutral." },
  { id: "whites",     label: "WHITES",     group: "IMAGE & COLOUR", min: -1.8, max: 3, step: 0.001, def: 0, fmt: "signed", help: "Exposure of the brightest HDR values feeding the ACES shoulder. Negative protects peaks; positive drives them harder. 0 is neutral." },
  { id: "toe",        label: "TOE",        group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.001, def: 0, fmt: "signed", help: "Shapes the transition out of black. Positive deepens the toe; negative lifts it. 0 is neutral." },
  { id: "shoulder",   label: "SHOULDER",   group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.001, def: 0, fmt: "signed", help: "Shapes highlight compression before ACES. Positive protects bright detail; negative expands it. 0 is neutral." },

  { id: "liftR", label: "LIFT · RED", group: "IMAGE & COLOUR", section: "RGB LIFT / GAMMA / GAIN", min: -0.3, max: 0.3, step: 0.00025, def: 0, fmt: "signed", help: "Red offset at the black end of the RGB grade. 0 is neutral." },
  { id: "liftG", label: "LIFT · GREEN", group: "IMAGE & COLOUR", min: -0.3, max: 0.3, step: 0.00025, def: 0, fmt: "signed", help: "Green offset at the black end of the RGB grade. 0 is neutral." },
  { id: "liftB", label: "LIFT · BLUE", group: "IMAGE & COLOUR", min: -0.3, max: 0.3, step: 0.00025, def: 0, fmt: "signed", help: "Blue offset at the black end of the RGB grade. 0 is neutral." },
  { id: "gammaR", label: "GAMMA · RED", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Red-channel midpoint control. Above 1 lifts red midtones; below 1 deepens them. 1 is neutral." },
  { id: "gammaG", label: "GAMMA · GREEN", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Green-channel midpoint control. Above 1 lifts green midtones; below 1 deepens them. 1 is neutral." },
  { id: "gammaB", label: "GAMMA · BLUE", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Blue-channel midpoint control. Above 1 lifts blue midtones; below 1 deepens them. 1 is neutral." },
  { id: "gainR", label: "GAIN · RED", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Red scale at the white end of the RGB grade. 1 is neutral." },
  { id: "gainG", label: "GAIN · GREEN", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Green scale at the white end of the RGB grade. 1 is neutral." },
  { id: "gainB", label: "GAIN · BLUE", group: "IMAGE & COLOUR", min: 0.4, max: 2.5, step: 0.001, def: 1, help: "Blue scale at the white end of the RGB grade. 1 is neutral." },

  { id: "saturation",   label: "SATURATION",      group: "IMAGE & COLOUR", section: "COLOUR", min: 0, max: 2.5, step: 0.001, def: 1.0, u: "uSaturation", help: "Overall colour intensity. 0 = greyscale, 1 = as-shipped, >1 = punchier." },
  { id: "vibrance",     label: "VIBRANCE",        group: "IMAGE & COLOUR", min: 0, max: 1.5, step: 0.001, def: 0.20, u: "uVibrance", help: "Selective saturation — lifts dull/washed pixels (hazy sky, grass, tarmac) without over-cooking neon or kerbs." },
  { id: "tint",         label: "WARM / COOL",     group: "IMAGE & COLOUR", min: -6, max: 6, step: 0.001, def: 0.0, u: "uTint", fmt: "signed", help: "White-balance shift. + warms (amber, sunny), − cools (blue, overcast/night). Symmetric 0.07/unit on red/blue (channel-zero at ±14.3) — ±6 is the last notch that still leaves both channels well above black, not a saturate clip." },
  { id: "gradeStr",     label: "GRADE STRENGTH",  group: "IMAGE & COLOUR", min: 0, max: 2.5, step: 0.001, def: 1.0, help: "Cinematic split-tone amount (teal shadows / warm highlights). 0 = neutral, higher = stronger film look." },
  { id: "shadowHue",    label: "SHADOW TINT HUE", group: "IMAGE & COLOUR", min: -180, max: 180, step: 1, def: 0.0, fmt: "signed", help: "Rotates the split-tone SHADOW colour (default cool teal) around the hue wheel." },
  { id: "hiHue",        label: "HIGHLIGHT TINT HUE", group: "IMAGE & COLOUR", min: -180, max: 180, step: 1, def: 0.0, fmt: "signed", help: "Rotates the split-tone HIGHLIGHT colour (default warm amber) around the hue wheel." },
  { id: "vignette",     label: "VIGNETTE",        group: "IMAGE & COLOUR", section: "LENS & FINISH", min: 0, max: 1, step: 0.001, def: 0.80, u: "uVignette", help: "Corner darkening. 1 = none, lower = stronger frame vignette. Floor is true 0 (pure black corners) — the frame centre is mixed in separately so it never darkens no matter how low this goes. Ceiling stays 1: past that the corners would read brighter than the centre, which isn't a 'vignette' anymore." },
  { id: "vignetteSoft", label: "VIGNETTE REACH",  group: "IMAGE & COLOUR", min: 0.1, max: 0.69, step: 0.001, def: 0.35, u: "uVigSoft", help: "How far the vignette reaches in from the corners (the inner edge of the darkening ramp). 0.35 = as-shipped. Lower = broad, soft gradient creeping toward the centre; higher = a thin dark ring hugging only the extreme corners. Ceiling is 0.94 — the shader does `smoothstep(0.95, min(this, 0.94), r)`, so anything above 0.94 was a no-op. Pairs with VIGNETTE (which sets how dark)." },
  { id: "blackLift",    label: "BLACK FLOOR",      group: "IMAGE & COLOUR", min: 0, max: 0.2, step: 0.0001, def: 0.005, u: "uBlackLift", help: "Raises the darkest blacks toward a faded film base. 0 = pure black, higher = matte shadows. Floor is already the true-black extreme so it can't go lower; only the matte ceiling was raised." },
  { id: "whitePoint",   label: "ACES WHITE SCALE", group: "IMAGE & COLOUR", min: 0.08, max: 2.38, step: 0.002, def: 1.0, u: "uWhitePoint", help: "Highlight roll-off knee. Lower clips highlights sooner (punchy, brighter overall), higher preserves highlight detail AND reads darker/more filmic overall (it divides the whole image before tone-mapping). Ceiling raised for a much moodier, darker top-end." },
  { id: "acesA",        label: "TONE CURVE SHOULDER", group: "IMAGE & COLOUR", min: 1.6, max: 4, step: 0.001, def: 2.51, u: "uAcesA", help: "ACES filmic tone-curve numerator quadratic coefficient (a in the Narkowicz fit). Governs the highlight SHOULDER — how hard bright HDR values roll off toward white. 2.51 = as-shipped; lower softens the roll-off (highlights bloom to white sooner), higher tightens it (holds more highlight detail). Advanced: reshapes the whole tone-map — pairs with the other TONE CURVE knobs." },
  { id: "acesB",        label: "TONE CURVE TOE LIFT", group: "IMAGE & COLOUR", min: 0, max: 0.08, step: 0.0002, def: 0.03, u: "uAcesB", help: "ACES tone-curve numerator linear coefficient (b). Lifts the low end — brightens deep shadows/blacks slightly as they enter the curve. 0.03 = as-shipped, 0 = a touch crushier toe, higher = milkier lifted blacks. Advanced: part of the raw ACES fit (distinct from BLACK FLOOR, which is applied separately)." },
  { id: "acesC",        label: "TONE CURVE CONTRAST", group: "IMAGE & COLOUR", min: 1.6, max: 4, step: 0.001, def: 2.43, u: "uAcesC", help: "ACES tone-curve denominator quadratic coefficient (c). The main midtone-contrast lever of the filmic curve — trades brightness against contrast through the mids. 2.43 = as-shipped; changing it rebalances the whole S-curve. Advanced: pairs with TONE CURVE SHOULDER (both are the dominant shape terms)." },
  { id: "acesD",        label: "TONE CURVE MIDS",  group: "IMAGE & COLOUR", min: 0.2, max: 1.2, step: 0.001, def: 0.59, u: "uAcesD", help: "ACES tone-curve denominator linear coefficient (d). Shifts the midtone brightness of the filmic curve — where the mid-grey point sits. 0.59 = as-shipped, lower = brighter mids, higher = darker/denser mids. Advanced: part of the raw ACES fit." },
  { id: "acesE",        label: "TONE CURVE BLACK",  group: "IMAGE & COLOUR", min: 0.02, max: 0.45, step: 0.0002, def: 0.14, u: "uAcesE", help: "ACES tone-curve denominator constant (e). Sets the true black floor / overall lift of the filmic curve. 0.14 = as-shipped, lower = deeper blacks and more contrast, higher = a lifted, hazier low end. Floored at 0.02 so the curve's denominator stays positive (no divide-by-zero). Advanced: part of the raw ACES fit." },
  { id: "chromAb",      label: "CHROMATIC AB.",   group: "IMAGE & COLOUR", min: 0, max: 15, step: 0.002, def: 0.0, u: "uChromAb", help: "Lens colour-fringing toward the frame edges — RGB split. Subtle = filmic, high = arcade." },
  { id: "grain",        label: "FILM GRAIN",      group: "IMAGE & COLOUR", min: 0, max: 0.3, step: 0.0002, def: 0.0, u: "uGrain", help: "Per-pixel sensor noise. A little sells the cinematic night-camera look." },
  { id: "lensDirt",     label: "LENS DIRT",       group: "IMAGE & COLOUR", min: 0, max: 1, step: 0.001, def: 0.15, u: "uLensDirt", help: "Grime on the lens: bright light (sun, floodlights, neon) scatters into a smudgy veil and the sun flare goes blotchy where dirt catches the glare. 0 = clean lens; only shows where the frame carries bright energy." },
  { id: "flareMul",     label: "LENS FLARE",      group: "IMAGE & COLOUR", min: 0, max: 2.5, step: 0.001, def: 1.0, help: "Sun/lamp anamorphic streak + ghost strength. 0 = off, 1 = as-shipped." },
  { id: "flareStreak",  label: "FLARE STREAK",    group: "IMAGE & COLOUR", min: 2, max: 10, step: 0.05, def: 7.0, u: "uFlareStreak", help: "Width of the horizontal anamorphic sun-flare streak (its horizontal tightness). 7 = as-shipped; lower spreads it into a wide screen-spanning band of light, higher pulls it into a tight contained highlight hugging the sun. Pairs with LENS FLARE (which sets strength)." },
  { id: "flareStreak2", label: "FLARE CORE STREAK", group: "IMAGE & COLOUR", min: 0, max: 1.25, step: 0.002, def: 0.5, u: "uFlareStreak2", help: "Strength of the second thin hot-white core streak layered over the main FLARE STREAK (a tighter, brighter inner blade of the anamorphic flare). 0.5 = as-shipped, 0 = single-streak flare, higher = a piercing hot core line. Pairs with LENS FLARE (strength) and FLARE STREAK (width)." },
  { id: "sharpen",      label: "SHARPEN",         group: "IMAGE & COLOUR", min: 0, max: 2.5, step: 0.002, def: 0.0, u: "uSharpen", help: "Crispness recovered after FXAA — counteracts softening on kerbs, wires and distant detail." },
  { id: "speedBlur",    label: "SPEED BLUR",      group: "IMAGE & COLOUR", min: 0, max: 3, step: 0.002, def: 0.0, u: "uSpeedBlur", help: "Radial blur from screen centre that grows with car speed — a velocity cue at high speed." },

  // ── FX ── transient particle effects (js/game/particles.js pool)
  { id: "particleMul",  label: "PARTICLE FX",     group: "FX", min: 0, max: 2, step: 0.005, def: 1.0, help: "Transient particle amount — tyre smoke, collision sparks, gravel kickup and rain spray. 0 = off, 1 = as-shipped, 2 = double the emission rate." },
];
// LT holds the LIVE values the driver reads every frame. They are resolved by
// js/game/light-store.js from a per-CONDITION profile store: each (track,
// time-of-day, weather) combination keeps its own set of overrides, so
// night+wet Monaco and day+dry Monza are tuned independently. Resolution per
// id, lowest precedence first: TUNE_DEFS default → LightPresets["*"] →
// LightPresets[key] → player "*" → player [key] (the player layers live in
// localStorage). Only non-default values are stored.
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
// Pool radius for one fixture. `themeRadius` (floodColor) is sized for a verge
// lamp — "the pool's far corner sits 21-25 m from the lens" — and a tall flood
// bank throws far beyond that: Sakhir's ring stands 39 m up and 34 m out, so its
// lens sits ~52 m from the road it aims at, past a 34 m radius, where the
// (1-(d/r)^4)^2 window is exactly 0. Every mast lit nothing (measured: bahrain
// covered 2 of 135 centreline samples, and the 2 were the start line, lit by the
// fixture-less gantry bar below). floodMast now registers its real throw, and a
// MAST record's radius is read as a FLOOR over the theme value rather than as an
// override — so a short mast keeps the tuned theme radius, and the hand-placed
// luminaires that deliberately want a SMALL one (Monaco's tunnel soffits at
// 21-27 m) are unaffected because lampPost writes those without `mast`.
// Energy needs no retune: ePhys already scales by the true lens->road distance
// squared, so opening the window restores the pool the mast was always emitting.
function lampRadius(post, themeRadius) {
  if (!post || post.radius == null) return themeRadius;
  return post.mast ? Math.max(themeRadius, post.radius) : post.radius;
}
// Re-seat each fixture's node index on the node it actually stands next to.
//
// `k` on a lampPosts record is meant to say "which bit of road this fixture is
// beside", and TWO things here depend on it: the gap-fill/density spacing walk
// (which sorts by k and measures spans in nodes), and the beam aim + throw
// energy (which read px/py/pz/hw at k). The world position is authoritative —
// it is what the shader lights from — but the k travelled by a different route
// and can disagree.
//
// It disagrees on circuits with a `_sceneryShift`. The scenery api remaps node
// arguments into racing space for the emitters listed in tracks.js (`anchor`,
// `floodMast`, …), but `lampPost` takes a node index and is in none of those
// lists, so a circuit that hand-places lamps stores the k it was handed while
// its position came back through the remap. Measured: imola 74/74 fixtures with
// k up to 2030 m from their own lamp, hungaroring 96/96 up to 431 m. The
// visible cost is the spacing walk filling where the lamps are NOT — imola ran
// a 716 m stretch of unlit road at frac 0.46 with zero lights within 200 m.
//
// Resolving from the position instead of trusting the caller's frame makes the
// disagreement unexpressible, and needs no shift lookup here. Coarse scan then
// a local refine — this runs once per bake over at most ~600 fixtures.
const _postNodeMemo = new WeakMap();   // track -> { src, out } (LT-independent)
function resolvePostNodes(track, posts) {
  const n = track.n, px = track.px, pz = track.pz;
  if (!n || !px || !pz) return posts;
  // Pure function of (track geometry, posts) — a lamp-density knob drag
  // rebuilds lights every tick and was re-running this ~124k-iteration scan
  // each time. Keyed on both identities; a track rebuild replaces both.
  const hit = _postNodeMemo.get(track);
  if (hit && hit.src === posts) return hit.out;
  let out = null;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    if (!p || !Number.isFinite(p.x)) continue;
    let best = Infinity, bk = 0;
    for (let k = 0; k < n; k += 8) {
      const dx = p.x - px[k], dz = p.z - pz[k];
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    for (let j = bk - 8; j <= bk + 8; j++) {
      const k = ((j % n) + n) % n;
      const dx = p.x - px[k], dz = p.z - pz[k];
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    if (bk === p.k) continue;
    if (!out) out = posts.slice();
    out[i] = { ...p, k: bk };
  }
  const res = out || posts;
  _postNodeMemo.set(track, { src: posts, out: res });
  return res;
}
function lampDensityFactor() {
  const d = LT.lampDensity;
  return (typeof d === "number" && isFinite(d) && d > 0) ? d : 1;
}
// Shared mast/light spacing in metres. Density 1 = shipped ~22 m; higher denser.
function lampStrideM() { return 22 / lampDensityFactor(); }
function lampStrideNodes(ds) {
  return Math.max(1, Math.round(lampStrideM() / ds));
}
// Thin or densify the fixture list so live LAMP DENSITY matches without a full
// track rebuild. dens<1 drops posts below the target spacing; dens>1 inserts
// synthetic roadside lights (no lens halo) between fixtures — poles catch up
// on the next Tracks.build (which reads the same LT.lampDensity).
function applyLampDensity(posts, track, height, onlyAlways) {
  if (!posts || !posts.length || onlyAlways) return posts;
  const dens = lampDensityFactor();
  if (Math.abs(dens - 1) < 0.01) return posts;
  const n = track.n, ds = track.total / n;
  const targetGap = lampStrideNodes(ds);
  const sorted = posts.slice().sort((a, b) => a.k - b.k);
  if (dens < 1) {
    const out = [];
    let lastK = null;
    for (const p of sorted) {
      if (lastK == null) { out.push(p); lastK = p.k; continue; }
      const span = (p.k - lastK + n) % n;
      if (span >= targetGap) { out.push(p); lastK = p.k; }
    }
    return out.length ? out : posts;
  }
  const fill = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], bN = sorted[(i + 1) % sorted.length];
    const span = (i === sorted.length - 1) ? (bN.k + n - a.k) : (bN.k - a.k);
    if (span <= targetGap) continue;
    // Insert count: floor((span-1)/targetGap), NOT floor(span/targetGap)-0 via
    // `j < steps` with steps=floor(span/targetGap). That old form needs
    // span >= 2*targetGap before the first insert — so a gap of 3 nodes with
    // dens=2 target 2 was a silent no-op (MCP: monza dens 1→2 both baked 292).
    const nFill = Math.floor((span - 1) / targetGap);
    for (let j = 1; j <= nFill; j++) {
      const k = (a.k + j * targetGap) % n;
      const side = (j % 2 === 0) ? a.side : -a.side;
      const hwk = track.hw[k] || 7;
      fill.push({
        k, side, synth: true, densified: true, kind: a.kind || null,
        x: track.px[k] + track.rx[k] * (hwk + 6) * side,
        y: track.py[k] + height,
        z: track.pz[k] + track.rz[k] * (hwk + 6) * side,
      });
    }
  }
  if (!fill.length) return posts;
  // Cap growth so a maxed density slider cannot explode the baked set.
  const cap = 800;
  return sorted.concat(fill.slice(0, Math.max(0, cap - sorted.length)));
}
// `onlyAlways` builds ONLY the fixtures a circuit marked always-on (see
// lampPost() in js/track/tracks.js) — the set game.js uploads in a BRIGHT
// session, where the ordinary lamps stay off.
function buildTrackLights(track, onlyAlways) {
  const lights = [];
  const n = track.n, total = track.total;
  // Guard against a not-yet-complete track (centreline arrays missing): return
  // empty so the caller's rebuild-if-empty retries next frame rather than caching
  // a bad empty result.
  if (!n || !total || !track.px || !track.rx) return lights;
  // Debug-gated: a lamp-density knob drag rebuilds every frame and this line
  // alone was flooding the ring buffer.
  if (Log.enabled("game", Log.DEBUG))
    Log.debug("game", "LightTune.buildTrackLights track=" + ((track.def && track.def.id) || "?"));
  const ds = total / n;
  const stride = lampStrideNodes(ds);   // matches buildProps mast stride (+ LAMP DENSITY)
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
  // exact world position of each mast lens (track.lampPosts — same density-aware
  // stride, side parity and onTrack suppression as the drawn masts), so glare
  // halos, specular streaks, volumetric beams and reflections all anchor to
  // geometry. Fallback: synthetic stride walk when lampPosts is absent.
  let posts = (track.lampPosts && track.lampPosts.length) ? track.lampPosts : null;
  // BEFORE the always-filter, density and gap fill: they all walk `k`, so they
  // need it to mean the place the fixture actually stands — and resolving the
  // stable track.lampPosts array (not a fresh filter copy) lets the memo hit.
  if (posts) posts = resolvePostNodes(track, posts);
  if (onlyAlways) {
    posts = posts ? posts.filter((p) => p && p.always) : null;
    if (!posts || !posts.length) return lights;
  }
  posts = applyLampDensity(posts, track, height, onlyAlways);
  // ── DARK-GAP FILL ─────────────────────────────────────────────────────────
  // Circuits suppress the generic mast pass over a stretch (dressingExclusions
  // kind "lamps" / "floodlights" / "lighting") so bespoke fixtures own that ground.
  // Suppressing the mast also deleted the light — gap-fill restores pools without geometry.
  // Shared floodMast()/floodMastRing() register into track.lampPosts (unless
  // opts.light:false). Fill lights get no lens halo (glareW 0). Never runs for
  // the always-on subset (tunnel soffits etc.).
  if (posts && LT.lampGapFill > 0 && !onlyAlways) {
    const sorted = posts.slice().sort((a, b) => a.k - b.k);
    const maxGap = Math.max(stride * 2, Math.round(LT.lampGapFill / ds));
    const fill = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], bN = sorted[(i + 1) % sorted.length];
      const span = (i === sorted.length - 1) ? (bN.k + n - a.k) : (bN.k - a.k);
      if (span <= maxGap) continue;
      const steps = Math.floor(span / stride);
      for (let j = 1; j < steps; j++) {
        const k = (a.k + j * stride) % n;
        const side = (j % 2 === 0) ? 1 : -1;
        const hwk = track.hw[k] || 7;
        fill.push({
          k, side, synth: true, kind: null,
          x: track.px[k] + track.rx[k] * (hwk + 6) * side,
          y: track.py[k] + height,
          z: track.pz[k] + track.rz[k] * (hwk + 6) * side,
        });
      }
    }
    if (fill.length) posts = sorted.concat(fill);
  }
  const nPosts = posts ? posts.length : Math.ceil(n / stride);
  for (let i = 0; i < nPosts; i++) {
    const post = posts ? posts[i] : null;
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
    // Custom fixtures are exempt: a circuit-placed luminaire is a specific,
    // modelled thing, and hanging a random magenta signage washer off it would
    // invent a light source that has no fixture.
    if (street && kindRoll < 0.10 && !pitStraight && !(post && post.custom)) {
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
    // A fill light has no fixture, so it must not draw a lens halo hanging in
    // mid-air; damp its volumetric beam for the same reason.
    if (posts && posts[i].synth) { glareW = 0; volW = Math.min(volW, 0.3); }
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
    // THROW DISTANCE (lens → the road it lights) drives the inverse-square energy
    // below and must be measured from this geometric vector, never from the beam
    // direction: a registered fixture may name its own aim, and those vectors are
    // unit-length, which would collapse the al² term to 1 and leave the lamp ~30×
    // too dim.
    const al = Math.hypot(ax, ay, az) || 1;
    // A registered fixture may name its own beam direction. The near-lane aim
    // above is right for a lamp standing BESIDE the road; a soffit luminaire is
    // already over it and must throw straight down, not rake sideways at a wall.
    if (post && post.aim) { ax = post.aim[0]; ay = post.aim[1]; az = post.aim[2]; }
    const anorm = Math.hypot(ax, ay, az) || 1;
    ax /= anorm; ay /= anorm; az /= anorm;
    // Physically-based punctual light: intensity is in inverse-square units (the
    // shader divides by d²), so scale by the lens→road distance² AND the surface
    // incidence at the aim point (NoL = h/al for an up-facing road) — a raking
    // beam needs more flux than a top-down one to land the same pool luminance.
    // The incidence divisor is CLAMPED so a mast beside banked/elevated road
    // (lens barely above the aim point) can't blow the energy up.
    const hAim = Math.max(ly - track.py[k], 1);
    const ePhys = intensity * bri * eMul * (al * al) * LT.poolEnergy / Math.max(hAim / al, 0.35)
                * (post && post.energy != null ? post.energy : 1);
    lights.push(
      lx, ly, lz,
      Math.max(0, mr) * ePhys,
      Math.max(0, mg) * ePhys,
      Math.max(0, mb) * ePhys,
      lampRadius(post, radius) * LT.lampRadiusMul,
      ax, ay, az, coneIn, coneOut, Math.min(0.9, bleed * LT.bleedMul), volW, glareW,
    );
  }
  // START-GANTRY DOWNLIGHTS: a crisp white bar of light straight down over the
  // start/finish at node 0 (typical gantry height) — marks the line the way
  // broadcast lighting does. Placement is independent of the scenery gantry mesh.
  // Skipped in the always-on subset: that set is "fixtures that burn in daylight",
  // and broadcast lighting over the grid is not one of them.
  if (!onlyAlways) {
    const hwk = track.hw[0] || 7;
    // Halved (1.15 -> 0.55 weight): three of these stack right over the grid, on
    // top of the flood_bank pit-straight lamps — the start line was the hottest
    // spot on every night circuit, blowing the road out exactly where every race
    // (and the player's first impression of the night lighting) begins.
    const ge = intensity * 0.55 * (8 * 8) * LT.poolEnergy;
    // POOL ENERGY / POOL RADIUS / BEAM CONE / VALLEY BLEED tuner knobs apply
    // here too — the gantry bar previously ignored them ("every floodlight" per
    // help text; the energy factor was a 0.55 literal = poolEnergy's default).
    // volW 0 / glareW 0: this bar is NOT parented to the scenery gantry (see the
    // note in js/track/scenery-structures.js), so there is no fixture at its
    // position — and drawGlow paints a lens halo for any record with glareW > 0.
    // Shipped at glareW 0.3 it put three glowing orbs 8 m over the start line
    // with nothing holding them up, each with a volumetric shaft under it; on
    // Bahrain the nearest real fixture is 42 m away. Same rule the synth fill
    // lights follow above ("A fill light has no fixture, so it must not draw a
    // lens halo hanging in mid-air"). The downward pool on the grid is unchanged.
    for (const lat of [-hwk * 0.55, 0, hwk * 0.55]) {
      lights.push(
        track.px[0] + track.rx[0] * lat, track.py[0] + 8, track.pz[0] + track.rz[0] * lat,
        1.02 * ge, 1.05 * ge, 1.12 * ge,
        26 * LT.lampRadiusMul, 0, -1, 0,
        0.92, 0.92 - 0.14 * (LT.beamCone || 1), Math.min(0.9, 0.06 * LT.bleedMul), 0, 0);
    }
  }
  return lights;
}

// ── Per-frame light assembly (extracted from js/game.js) ─────────────────────
const _clampNum = (v, a, b) => (v < a ? a : v > b ? b : v);

// Car rain lights as REAL light sources after dark: the nearest few cars carry a
// small red point light at the tail, so traffic reads as moving light sources —
// a red glow trailing each car on the road surface.
const _tlSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tlSel = [];
function appendCarTailLights(frame, track, cars, player, mobileTier) {
  const L = frame.lights;
  // PER-CHUNK LAMPS needs to know which records here are the DYNAMIC ones, and
  // it cannot be derived by measuring frame.lights before/after: when the set is
  // already at cap this function TRIMS the farthest static lamps before pushing,
  // so the length is unchanged and a before/after diff reports zero. Record the
  // range authoritatively instead, and zero it on every early return.
  frame.tailStart = L ? (L.length / 15) | 0 : 0;
  frame.tailCount = 0;
  // frame.lights is always the per-frame copy (flicker copies every frame), so
  // appending here never mutates the cached track set.
  if (!L || L === track._lights || !player) return;
  _tlSel.length = 0;
  const tlRange = LT.tailRange != null ? LT.tailRange : 160;   // TAIL-LIGHT RANGE knob
  let _tlN = 0;
  for (const c of cars) {
    const ds = Math.abs(c.s - player.s);
    const d = Math.min(ds, track.total - ds);
    if (d < tlRange) {
      // Reuse pooled {c,d} entries in place (same pattern as _lightCullBuf) —
      // fresh objects here were per-car-per-frame GC churn on night tracks.
      const e = _tlSel[_tlN];
      if (e) { e.c = c; e.d = d; } else _tlSel[_tlN] = { c: c, d: d };
      _tlN++;
    }
  }
  _tlSel.length = _tlN;      // drop stale entries from earlier (busier) frames
  _tlSel.sort(_byDistAsc);   // hoisted comparator, shared with setFrameLights
  const nT = Math.min(_tlSel.length, 5);
  if (nT <= 0) return;
  // Reserve up to nT slots for the nearest cars' tail-lights. On a dense night
  // grid the floodlights alone can fill the frame's light budget, so appending
  // overflowed and the shader dropped the tail-lights. Evict that many of the
  // FARTHEST floods instead (setFrameLights sorts ascending by distance, so the
  // tail end is farthest). Measure against the SAME budget setFrameLights culled
  // to — against the literal 32 this whole reserve was a no-op on the mobile
  // tier, i.e. on exactly the devices it was written to protect.
  // Measure against the TOTAL slot budget, not the LAMP budget. lampCap conflates
  // the two: with traffic it returns lampCull (40) because — in its own words —
  // "~8 of the 48 shader slots stay free for tail-lights". setFrameLights culls
  // lamps to that 40, so room came out 40 - 40 = 0 and this evicted lamps into
  // eight slots that were sitting empty. The eviction is a hard delete with no
  // fade (the cull's distance ramp has already been applied and baked in), so on
  // a desktop night grid three lamps at FULL brightness vanished the moment a
  // third rival came inside tailRange, and which three depended on camera yaw
  // because the set is ordered by the yaw-biased metric.
  // Mobile still evicts, deliberately: there the cap IS 24 lights total, which is
  // the per-fragment budget the tier exists to protect.
  const SLOTS = mobileTier ? 24 : 48;   // js/render/glx.js MAX_LIGHTS
  const room = SLOTS - ((L.length / 15) | 0);
  if (room < nT && L.length >= nT * 15) L.length -= (nT - room) * 15;
  // TAIL-LIGHT FADE: ease the glow out over the last `tailFade` m before the range
  // cutoff so a car doesn't pop in/out abruptly as it drifts past the limit. 0 =
  // hard cutoff (as-shipped), so the fade term is 1 for every selected car.
  const tlFade = LT.tailFade != null ? LT.tailFade : 0;
  for (let j = 0; j < nT; j++) {
    const sel = _tlSel[j], c = sel.c;
    Tracks.sample(track, c.s, _tlSmp);
    const tx = _tlSmp.t[0], tz = _tlSmp.t[2];
    // rear-facing, tilted down: the glow lands on the road behind the car
    let dx = -tx * 0.87, dy = -0.5, dz = -tz * 0.87;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    // BRAKE FLARE: the tail glow surges while the car is braking. brakeHeat is
    // the render-only 0..1 disc-heat ramp every car already tracks (rises under
    // braking, cools after) — read-only here, physics untouched.
    const bAmt = _clampNum(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul;
    const fadeF = tlFade > 0 ? _clampNum((tlRange - sel.d) / tlFade, 0, 1) : 1;
    const tlm = LT.tailLightMul * (1 + bAmt * 1.6) * fadeF;
    L.push(
      _tlSmp.p[0] + _tlSmp.r[0] * c.x - tx * 2.4,
      _tlSmp.p[1] + 0.55,
      _tlSmp.p[2] + _tlSmp.r[2] * c.x - tz * 2.4,
      4.5 * tlm, 0.14 * tlm, 0.10 * tlm,
      8 * (1 + bAmt * 0.45), dx, dy, dz, 0.5, -0.2, 0.12, 0.25, 0.4);
  }
  // The nT tail-lights are the LAST nT records — after any trim above.
  frame.tailCount = nT;
  frame.tailStart = ((L.length / 15) | 0) - nT;
}

// Cull the track light set to the nearest CAP lamps (shader max 48; traffic uses
// LT.lampCull, def 40, leaving room for car tail lights) and flatten into
// `frame.lights`. Called each frame only when floodlights are lit.
const _lightCullBuf = [];
const _lightScaleBuf = [];
const _lightHeap = [];         // pooled max-heap (≤CAP entries) for nearest-N selection
const _gHeap = [];             // pooled max-heap of GEOMETRIC squared distances (see gCap)
const _byDistAsc = (a, b) => a.d - b.d;   // hoisted sort comparator (no per-frame closure)
// The CAP-th smallest value in `buf[i].g` — the radius an UNBIASED nearest-CAP cull
// would cut at. It depends only on where the camera IS, never on where it POINTS,
// which is the whole reason the fade below is anchored to it. Same partial-selection
// shape as the main heap (max-heap of size CAP, one pass), on plain numbers.
function capRadius2(buf, count, CAP) {
  const h = _gHeap; h.length = 0;
  for (let i = 0; i < count; i++) {
    const g = buf[i].g;
    if (h.length < CAP) {
      let ci = h.length; h.push(g);
      while (ci > 0) { const pi = (ci - 1) >> 1; if (h[pi] < h[ci]) { const t = h[pi]; h[pi] = h[ci]; h[ci] = t; ci = pi; } else break; }
    } else if (g < h[0]) {
      h[0] = g;
      let pi = 0;
      for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && h[l] > h[lg]) lg = l; if (rr < CAP && h[rr] > h[lg]) lg = rr; if (lg === pi) break; const t = h[pi]; h[pi] = h[lg]; h[lg] = t; pi = lg; }
    }
  }
  return h[0] || 1;
}
let _lampWarmT0 = -1e9;        // wall-clock (s) when the floods last switched ON (warmup ramp origin)
let _lampLastT = -1e9;         // last frame we copied lights — a gap means the floods were off
const _flScr = [1, 1, 1];      // per-lamp rgb factor scratch (flicker × breathe × warmup tint)
const _flSteady = [1, 1, 1];   // identity when flicker+warmup would leave intensity unchanged
// Flicker/warmup factors — closed over by hoisted `_flLive` so setFrameLights
// does not allocate a fresh closure every frame on night tracks.
let _flFlick = 0, _flWarmK = 1, _flTNow = 0;
function _flSteadyFn() { return _flSteady; }
function _flLive(o) {
  const flick = _flFlick, tNow = _flTNow, warmK = _flWarmK;
  const x = Math.sin((o + 13) * 91.17) * 43758.5453;
  const hsh = x - Math.floor(x);
  const amp = hsh > 0.90 ? flick : flick * 0.2;
  let f = 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40)
            + flick * 0.15 * Math.sin(tNow * (0.35 + hsh * 0.5) + hsh * 20);
  const warmDur = (4 + hsh * 4) * warmK;
  const wu = warmDur > 0 ? Math.min(1, Math.max(0, (tNow - _lampWarmT0) / warmDur)) : 1;
  const dip = LT.lampWarmupDim != null ? LT.lampWarmupDim : 0.30;
  f *= (1 - dip) + dip * wu;
  const cold = (1 - wu) * (LT.lampWarmupWarm != null ? LT.lampWarmupWarm : 1);
  _flScr[0] = f * (1 + cold * 0.22);
  _flScr[1] = f * (1 - cold * 0.10);
  _flScr[2] = f * (1 - cold * 0.38);
  return _flScr;
}
// Ranked-set cache: skip the O(count·log CAP) rebuild when the eye/fwd have not
// moved enough to change membership. Fade still uses geometric g (not yaw).
const _RANK_EYE_EPS2 = 0.25;   // 0.5 m eye motion → rebuild
const _RANK_FWD_EPS2 = 1e-4;   // unnormalized fwd delta (yaw/aim change)
let _rankSrc = null, _rankCap = -1, _rankCount = -1;
let _rankEyeX = NaN, _rankEyeY = NaN, _rankEyeZ = NaN;
let _rankFwdX = NaN, _rankFwdZ = NaN;
let _rankGRef = 1, _rankDEdge = 1, _rankTrunc = false;
let _rankReach = NaN, _rankBias = NaN, _rankFade = NaN;
// How many lights this frame may end up carrying. Named because BOTH movers need
// the same answer — setFrameLights culls down to it, and appendCarTailLights has
// to evict against it to make room. appendCarTailLights used to measure its room
// against the shader's literal 32 instead, so on the mobile tier (CAP 24) it saw
// 8 free slots that did not exist, evicted nothing, and left the phone running 29
// lights through the per-fragment loop the 24 was chosen to protect.
function lampCap(carCount, mobileTier) {
  // With traffic, CAP defaults to lampCull (40) so ~8 of the 48 shader slots stay
  // free for tail-lights; solo runs use the full 48. Mobile tier clamps both
  // paths to 24: the per-fragment lamp loop (GGX + clearcoat per lamp) is the
  // dominant night fill cost on phones, and clamping HERE (not the knob's def)
  // means a per-track preset can't push a phone back up to 48.
  let cap = Math.min(
    carCount > 1 ? Math.round(LT.lampCull != null ? LT.lampCull : 40) : 48,
    mobileTier ? 24 : 48);
  // Shed the nearest-lamp budget under PerfGov load before the fragment loop
  // pays for distant slots (tier 1 drops env probe; tier 2 drops lamp shadow).
  if (typeof PerfGov !== "undefined") {
    const tier = PerfGov.tier();
    if (tier >= 2) cap = Math.min(cap, 24);
    else if (tier >= 1) cap = Math.min(cap, 32);
  }
  return cap;
}
function setFrameLights(frame, track, cars, eye, scale, fwd, mobileTier, srcSet) {
  // srcSet overrides the session light set (the daylight always-on subset);
  // absent, the baked full set is used exactly as before.
  const src = srcSet || track._lights;
  // Empty set / not a lit session (caller usually gates, but count===0 is free).
  if (!src || !src.length) { frame.lights = null; _rankSrc = null; return; }
  // Reserve slots for car tail lights: appendCarTailLights fills AFTER this
  // cull, against the same budget (see lampCap).
  const CAP = lampCap(cars.length, mobileTier);
  // scale may be a scalar (uniform dim) or a [r,g,b] vector (time-of-day brightness
  // + warmth: dim & warm at twilight, full & neutral at deep night).
  const sr = Array.isArray(scale) ? scale[0] : (scale == null ? 1 : scale);
  const sg = Array.isArray(scale) ? scale[1] : sr;
  const sb = Array.isArray(scale) ? scale[2] : sr;
  const count = src.length / 15;
  const out = _lightScaleBuf;
  // Per-lamp FLICKER, computed CPU-side each frame (zero shader cost): healthy
  // lamps barely breathe (±2%), the occasional aging tube visibly pulses (±10%).
  // Hash on the lamp's stable source offset so the same lamp always flickers the
  // same way — the night stops being a frozen still.
  const tNow = performance.now() * 0.001;
  // WARMUP: when the floods switch on (race start on a night track, a live
  // day→night flip) discharge lamps don't snap to full — they run slightly dim
  // and sodium-warm and settle to their true colour over a few seconds, each
  // lamp on its own stagger. A >1 s gap since the last copy means the floods
  // were off, so this frame is a fresh switch-on. Per-frame copy only — the
  // baked track records are never touched.
  if (tNow - _lampLastT > 1.0) { _lampWarmT0 = tNow; _rankSrc = null; }
  _lampLastT = tNow;
  // Skip sin/hash work when intensity would be unchanged: flicker knob at 0 and
  // warmup fully settled (or warmup knob 0 = instant). Max warmDur is 8×knob.
  const flick = LT.lampFlicker || 0;
  const warmK = LT.lampWarmup != null ? LT.lampWarmup : 1;
  const warmDone = !(warmK > 0) || (tNow - _lampWarmT0) >= 8 * warmK;
  const skipFl = !(flick > 0) && warmDone;
  _flFlick = flick; _flWarmK = warmK; _flTNow = tNow;
  const fl = skipFl ? _flSteadyFn : _flLive;
  // Cheap unsorted copy ONLY when every lamp fits with the full 5-slot tail-light
  // reserve to spare. It used to run for any count ≤ 32, which broke two promises
  // downstream: appendCarTailLights evicts overflow from the array TAIL on the
  // assumption the set is sorted farthest-last (it wasn't — on a 29-32-lamp track
  // it could snap off the nearest floods instead), and the CAP reservation was
  // silently ignored. 24+-lamp tracks now take the sorted heap path below.
  if (count + 5 <= CAP) {
    _rankSrc = null;   // dense path doesn't use the ranked cache
    // Copy + scale rgb (time-of-day scale × flicker); geometry params pass through.
    out.length = 0;
    for (let i = 0; i < src.length; i += 15) {
      const f = fl(i);
      out.push(src[i], src[i+1], src[i+2],
        src[i+3] * sr * f[0], src[i+4] * sg * f[1], src[i+5] * sb * f[2], src[i+6],
        src[i+7], src[i+8], src[i+9], src[i+10], src[i+11], src[i+12], src[i+13], src[i+14]);
    }
    frame.lights = out;
    return;
  }
  // Distance-rank: select the nearest CAP. Reuse a pooled object array + the
  // output buffer so a dense night grid doesn't allocate fresh garbage every
  // frame (was the main source of Minor-GC jitter on Vegas/Singapore).
  // Lights BEHIND the camera rank farther: a purely radial nearest-N wastes
  // half the budget on lamps you can't see, ending the lit road in a hard dark
  // boundary ahead. The forward bias (LT.lampBehindBias) pushes that boundary
  // further out — past the night fog wall.
  const fx = fwd ? fwd[0] : 0, fz = fwd ? fwd[2] : 0;
  const flen2 = fx * fx + fz * fz || 1;
  // LAMP REACH AHEAD knob: as-shipped this is 1 (no-op). Above 1, lamps roughly
  // ahead of the camera get their ranked distance shrunk (mirror of the
  // BEHIND-CAM BIAS penalty below, applied as a divisor instead of a
  // multiplier), so they win the nearest-CAP budget from farther out and the
  // lit zone reaches further down the road on a dense track.
  const reach = LT.lampReach != null ? LT.lampReach : 1;
  const bias = LT.lampBehindBias != null ? LT.lampBehindBias : 5.25;
  const fade = LT.lampCullFade != null ? LT.lampCullFade : 0.35;   // LAMP CULL FADE knob
  const heap = _lightHeap;
  const edx = eye[0] - _rankEyeX, edy = eye[1] - _rankEyeY, edz = eye[2] - _rankEyeZ;
  const fdx = fx - _rankFwdX, fdz = fz - _rankFwdZ;
  const reuseRank = _rankSrc === src && _rankCap === CAP && _rankCount === count
    && _rankReach === reach && _rankBias === bias && _rankFade === fade
    && heap.length > 0
    && (edx * edx + edy * edy + edz * edz) < _RANK_EYE_EPS2
    && (fdx * fdx + fdz * fdz) < _RANK_FWD_EPS2;
  let gRef, dEdge, truncated;
  if (reuseRank) {
    // Membership + geometric fade terms unchanged — only re-tint with scale/flicker.
    gRef = _rankGRef; dEdge = _rankDEdge; truncated = _rankTrunc;
  } else {
    const buf = _lightCullBuf;
    for (let i = 0; i < count; i++) {
      const o = i * 15, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
      let d = dx * dx + dy * dy + dz * dz;
      // Behind-camera penalty RAMPED in over ~14° past the camera plane (was a hard
      // sign test ×6.25: the instant a lamp crossed the plane its rank leapt several
      // places in ONE frame, stepping its pool's brightness — and a fast chase-cam
      // yaw flipped the half-space for many lamps at once, a whole-field shudder).
      const b = dx * fx + dz * fz;
      if (b < 0) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2 * 0.0625);
        // BEHIND-CAM BIAS knob scales how hard rearward lamps are pushed down the
        // nearest-N rank (def 5.25 = as-shipped forward push).
        d *= 1 + bias * Math.min(1, ratio2);
      } else if (reach > 1) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2);
        // SQUARED divisor, because `d` here is a SQUARED distance: dividing it by
        // k shortens the ranked LINEAR distance only by sqrt(k), so the plain
        // `d /= 1 + (reach-1)*ratio2` this replaced delivered sqrt(reach) — a
        // slider reading 4 bought 2x reach, not 4x, and measured as a barely
        // visible +44% at Singapore 0.55. Squaring makes the knob mean what its
        // label says: a dead-ahead lamp (ratio2 = 1) ranks as if `reach` times
        // nearer, so REACH 4 really is 4x. Still an exact no-op at the shipped
        // default of 1, and untouched for lamps to the side (ratio2 -> 0).
        const k = 1 + (reach - 1) * ratio2;
        d /= k * k;
      }
      const e = buf[i];
      // g = the TRUE squared distance, kept alongside the biased rank distance d.
      // Ranking wants the bias (that is what buys forward reach); the brightness
      // fade must not have it — see the cullF block after the heap.
      const g = dx * dx + dy * dy + dz * dz;
      if (e) { e.d = d; e.g = g; e.o = o; } else buf[i] = { d: d, g: g, o: o };
    }
    buf.length = count;
    // Partial selection: keep only the nearest CAP in a max-heap instead of sorting
    // all ~count entries every frame (O(count·log CAP) vs O(count·log count)).
    heap.length = 0;
    for (let i = 0; i < count; i++) {
      const e = buf[i];
      if (heap.length < CAP) {
        let ci = heap.length; heap.push(e);
        while (ci > 0) { const pi = (ci - 1) >> 1; if (heap[pi].d < heap[ci].d) { const t = heap[pi]; heap[pi] = heap[ci]; heap[ci] = t; ci = pi; } else break; }
      } else if (e.d < heap[0].d) {
        heap[0] = e;
        let pi = 0;
        for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && heap[l].d > heap[lg].d) lg = l; if (rr < CAP && heap[rr].d > heap[lg].d) lg = rr; if (lg === pi) break; const t = heap[pi]; heap[pi] = heap[lg]; heap[lg] = t; pi = lg; }
      }
    }
    // Sort just those 32 ascending so the tail fade eases the farthest of the set.
    // (Comparator hoisted to module scope — this runs every lit frame.)
    heap.sort(_byDistAsc);
    // DISTANCE-based tail fade (was rank-quantised in 1/6 steps: a lamp entered the
    // set at an instant 16.7% and its brightness stepped by 16.7% every rank churn —
    // visible stepping as the set shifted at speed). Fading by closeness to the set
    // boundary is continuous: 0 exactly at the boundary, full by ~35% inside it, so
    // membership changes are invisible.
    dEdge = heap[heap.length - 1].d || 1;
    // The boundary fade only makes sense when lamps were actually culled — if the
    // whole baked set fit inside CAP (the 24-32-lamp tracks that now take this
    // path for its sorting), there is no set boundary, and fading "the farthest
    // of the set" would black out a real lamp that used to be lit.
    truncated = count > CAP;
    // ── THE FADE MUST NOT KNOW WHICH WAY THE CAMERA POINTS ────────────────────
    // This was `(dEdge - e.d) / (dEdge * 0.35)`, and BOTH terms carry camera yaw:
    // e.d is the behind-biased rank distance, and dEdge is the biased edge of a set
    // whose composition changes as the camera turns. So a lamp that never moved
    // changed brightness when the player merely looked somewhere else. Measured on
    // bahrain/night with the eye pinned and only the aim yawing ±60°
    // (scratch harness, cap forced to 12 so the cull engages): a lamp 81 m ahead
    // swung 2.35× — DIMMEST looking straight down the road, because that is when
    // the most lamps compete and dEdge shrinks — and one at 208 m swung 23.5×.
    // That is the reported "road section in front of me gets darker when I turn".
    //
    // Fade on the lamp's own GEOMETRIC distance g against gRef, a radius built from
    // the CAP-th nearest lamp by TRUE distance. capRadius2 has no camera direction
    // in it at all, so the steady-state brightness of every lamp is now a function
    // of where the camera IS and nothing else. (Temporal smoothing was considered
    // and rejected: a yaw that is held converges to the same wrong value, so it
    // turns the step into a ramp without removing the artifact.)
    //
    // gRef is scaled by the MAXIMUM rank advantage the bias can grant, so the reach
    // the bias buys is still fully lit rather than being faded to black the moment
    // it exceeds the unbiased radius: a behind lamp's d is at most (1+behindBias)·g,
    // and an ahead lamp under REACH ABOVE 1 has d ≥ g/reach², so no member of the
    // set can sit beyond gRef.
    //
    // edgeGuard keeps the one property the old form did have — a lamp must be at
    // zero by the time it is dropped, or membership churn pops. It still measures
    // against the true boundary, but over a NARROWER shell than the old 35%, so the
    // residual yaw dependence is confined to lamps near the set boundary.
    //
    // THIS WIDTH IS THE YAW-COUPLING DIAL — DO NOT WIDEN IT. dEdge is the one term
    // left that moves with the camera, so every lamp inside the shell inherits that
    // movement. Measured on bahrain/night, eye pinned, aim swept ±60°, worst
    // stationary-lamp brightness swing (scratch harness, wrapping setFrameLights):
    //   old 0.35 form  5.01x / 2.99x / 2.86x / 2.77x / 2.55x
    //   0.20           5.01x / 2.67x / 2.52x / 2.39x / 2.13x   <- gives the fix back
    //   0.08           2.07x / 1.07x / 1.01x / 1.00x / 1.00x
    // 0.20 was tried specifically to give appendCarTailLights' eviction more cover
    // (it drops the last nT records by ARRAY POSITION, not by brightness, whenever a
    // rival comes inside tailRange) and it cost almost the whole decoupling. That
    // eviction is worth fixing at its source — the CAP reserve, lampCap() — not by
    // widening a band whose width IS the artifact.
    gRef = truncated
      ? capRadius2(buf, count, CAP) * (1 + bias) * (reach * reach)
      : 1;
    _rankSrc = src; _rankCap = CAP; _rankCount = count;
    _rankEyeX = eye[0]; _rankEyeY = eye[1]; _rankEyeZ = eye[2];
    _rankFwdX = fx; _rankFwdZ = fz;
    _rankGRef = gRef; _rankDEdge = dEdge; _rankTrunc = truncated;
    _rankReach = reach; _rankBias = bias; _rankFade = fade;
  }
  const _cullBand = gRef * fade;
  const _guardBand = dEdge * 0.08;
  out.length = 0;
  for (let i = 0; i < heap.length; i++) {
    const e = heap[i], o = e.o;
    const cullF = truncated
      ? Math.min(Math.max(0, Math.min(1, (gRef - e.g) / _cullBand)),
                 Math.max(0, Math.min(1, (dEdge - e.d) / _guardBand)))
      : 1;
    const f = fl(o);
    out.push(src[o], src[o+1], src[o+2],
      src[o+3] * sr * f[0] * cullF, src[o+4] * sg * f[1] * cullF, src[o+5] * sb * f[2] * cullF,
      src[o+6], src[o+7], src[o+8], src[o+9], src[o+10], src[o+11], src[o+12], src[o+13],
      // glareW fades with the cull too: drawGlow normalises the lamp colour, so a
      // colour-only fade barely dims the halo — it blinked off at ~full brightness
      // when the lamp left the set.
      src[o+14] * cullF);
  }
  frame.lights = out;
}

  return { TUNE_DEFS, LT, buildTrackLights, lampStrideNodes,
           setFrameLights, appendCarTailLights };
})();
