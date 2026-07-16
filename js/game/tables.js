/* Apex 26 — static gameplay/render data tables for js/game.js: the default
   custom team, AI tier speeds, gearbox ratios, difficulty presets, the player
   camera-mode list and the car-paint material constants. Pure constants, no
   game state. Must load BEFORE js/game.js (see index.html). */
const GameTables = (function () {
  "use strict";

// Custom "MY TEAM": a player-defined team injected into Teams.LIST. It only
// joins the grid when the player actually selects it (see makeCars).
const DEFAULT_CUSTOM = {
  id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
  color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
  stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
  drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
};

const TIER_V = [1.0, 0.988, 0.973, 0.958, 0.942];

const GEARS = 8;
const GEAR_TOP = [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0];
const IDLE_RPM = 5000, MAX_RPM = 15000;   // F1 V6 turbo: idle ~5k, rev limit 15k

const DIFF = {
  easy:   { ai: 0.86, band: 0.18 },
  normal: { ai: 0.92, band: 0.08 },
  hard:   { ai: 0.99, band: 0.03 },
};

// Player camera modes, cycled with the CAM button / C key and persisted. Each is
// a distinct vantage computed in render(): a close action chase, a higher/wider
// chase for race-craft, an in-cockpit eye, and a nose/hood cam. Index into CAM_MODES.
const CAM_MODES = [
  { id: "chase",     label: "CHASE" },
  { id: "far",       label: "FAR" },
  { id: "drift",     label: "DRIFT" },
  { id: "cockpit",   label: "COCKPIT" },
  { id: "hood",      label: "HOOD" },
  { id: "overhead",  label: "OVERHEAD" },
  { id: "heli",      label: "HELI" },
  { id: "reverse",   label: "REVERSE" },
  { id: "side",      label: "TV SIDE" },
  { id: "cinematic", label: "CINEMATIC" },
  { id: "low",       label: "LOW" },
  { id: "tcam",      label: "T-CAM" },
  { id: "rear",      label: "REAR CAM" },
];

// Car paint materials, hoisted to module scope so the render loop reads a shared
// const per (wet/dry × night/day) combo instead of allocating a fresh object for
// every car every frame.
// Car paint is a slightly-metallic gloss through the BASE material path (no
// clearcoat term — an additive sky layer bleaches the livery on the gently
// curved tops). Lower roughness gives the crisp GGX sun streak on the smooth
// bodywork; the mild metalness tints specular + reflections toward the team
// colour like real metallic flake, and scales the sky env down so the paint
// stays saturated. Wet adds a water film: glossier and more mirror-like.
// carPaint drives the duotone-pigment + silhouette-rim paint model (glx.js):
// grazing angles darken the livery toward a deep shade of the same hue and the
// silhouette catches a thin clamped sky rim — deep gloss that cannot bleach.
// clearcoat keeps the crisp sun + night-lamp glints of the lacquer shell.
// Night emissive 0.20: uEmissive blends toward raw albedo, so this is a 20%
// self-lit floor on the LIVERY panels — a car seen from behind at night (rear
// faces get no downward floodlight beam) reads as a car instead of a black
// void filling the cockpit view. Carbon/tyres (near-black albedo) stay dark.
const PAINT_WET_NIGHT = { emissive: 0.20, roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_WET_DAY   = { roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 0.8, carPaint: 1.0 };
// Dry paint roughness dropped 0.36 → 0.22 and clearcoat raised so the base coat
// is glossy all the time (sharper GGX highlight + a crisper env-cube mirror),
// not just when wet — a showroom lacquer read.
const PAINT_DRY_NIGHT = { emissive: 0.20, roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_DRY_DAY   = { roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 0.9, carPaint: 1.0 };

  return { DEFAULT_CUSTOM, TIER_V, GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, CAM_MODES, PAINT_WET_NIGHT, PAINT_WET_DAY, PAINT_DRY_NIGHT, PAINT_DRY_DAY };
})();
