/* Apex 26 — static gameplay/render data tables for js/game.js: the default custom team, AI tier speeds, gearbox ratios, difficulty presets, the player camera-mode… */
const GameTables = (function () {
  "use strict";

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
  hard:   { ai: 0.99, band: 0.02 },  // was 0.03 — smarter OT/ERS/brake cuts rubber-band need
};

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

const PAINT_WET_NIGHT = { emissive: 0.20, roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_WET_DAY   = { roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 0.8, carPaint: 1.0 };
const PAINT_DRY_NIGHT = { emissive: 0.20, roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_DRY_DAY   = { roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 0.9, carPaint: 1.0 };

  return { DEFAULT_CUSTOM, TIER_V, GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, CAM_MODES, PAINT_WET_NIGHT, PAINT_WET_DAY, PAINT_DRY_NIGHT, PAINT_DRY_DAY };
})();
