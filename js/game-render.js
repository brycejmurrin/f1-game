/* Apex 26 — render: camVantage() (12 camera-mode framing solver), render()
 * (the per-frame draw: camera, shadow pass, sky, track/car draws, post),
 * floodlight building (floodColor/buildTrackLights/setFrameLights), the
 * lighting-tuner runtime registry (TUNE_DEFS/LT — the pause-menu LIGHTING
 * TUNER panel and __apex.lightTune() both read/write this), and the car-mesh
 * builders (teamMesh/playerBodyMesh/drawPlayerWheels/cockpit dashboard rig).
 * Self-contained — reads AX/AXC directly, no game.js closures needed except
 * `store` (for the lightTune localStorage persistence). Exposes
 * teamMeshes/playerBodies so game.js's syncCustomTeam() can invalidate them
 * on a livery change, and the lighting-tuner registry (LT/TUNE_DEFS/ltKey/
 * setLightTune/persistLightTune/applyLightTune) so game.js, AXWeather and
 * AXUi can read/write it. */
"use strict";

const AXRender = (function () {
"use strict";

const { VMAX, LAT_MAX, BODY_ROLL_MAX, WHEEL_R, WHEEL_STEER_VIS, CAM_MODES, IDLE_RPM, MAX_RPM } = AXC;
const { store } = AX;
const { drawRain } = AXWeather;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));
function wrapS(s) { const L = AX.track.total; s %= L; return s < 0 ? s + L : s; }
function lerpS(prev, cur, a) {
  if (prev === undefined || a >= 1) return cur;
  const L = AX.track.total;
  let d = cur - prev;
  if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L;
  return wrapS(prev + d * a);
}
function isWetRoad() { return AX.raceWeather === "wet" || AX.raceWeather === "rain"; }
function isRaining() { return AX.raceWeather === "rain"; }
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // reusable sample
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const MAX_SKID = 120;
const skidMarks = Array.from({ length: MAX_SKID }, () => new Float32Array(16));
const teamMeshes = {};   // teamId -> GLX mesh
let _lastFloodEmit = 0;   // prop-emissive ramp actually used this frame (debug: lightState)
// game.js closures, handed over via init(deps) at boot:
let buildStudioRig = null, isStudioActive = null;
function init(d) { buildStudioRig = d.buildStudioRig; isStudioActive = d.isStudioActive; }

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
const PAINT_WET_NIGHT = { emissive: 0.12, roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_WET_DAY   = { roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 0.8, carPaint: 1.0 };
const PAINT_DRY_NIGHT = { emissive: 0.10, roughness: 0.36, metalness: 0.12, specular: 0.75, clearcoat: 0.9, carPaint: 1.0 };
const PAINT_DRY_DAY   = { roughness: 0.36, metalness: 0.12, specular: 0.75, clearcoat: 0.6, carPaint: 1.0 };
// Apply the CAR tuner group (LT.car*) to a base paint constant, into a reused
// scratch object (GLX.draw consumes the material synchronously, so one scratch
// is safe across every car in the frame). GLOSS divides roughness (higher =
// sharper); the rest are straight multipliers. carPaint (the paint MODEL) is
// left intact — the CAR REFLECTION strength lives in the composite (uCarReflect).
const _carPaintScratch = {};
function carPaintMat(base) {
  const m = _carPaintScratch;
  m.roughness = clamp((base.roughness != null ? base.roughness : 0.4) / LT.carGloss, 0.02, 1);
  m.metalness = clamp((base.metalness || 0) * LT.carMetal, 0, 1);
  m.specular  = (base.specular  || 0) * LT.carSpecular;
  m.clearcoat = (base.clearcoat || 0) * LT.carClearcoat;
  m.emissive  = (base.emissive  || 0) * LT.carGlow;
  m.carPaint  = base.carPaint != null ? base.carPaint : 0;
  return m;
}

function basisMat(r, u, f, p, out) {
  out[0] = r[0]; out[1] = r[1]; out[2] = r[2]; out[3] = 0;
  out[4] = u[0]; out[5] = u[1]; out[6] = u[2]; out[7] = 0;
  out[8] = f[0]; out[9] = f[1]; out[10] = f[2]; out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}
const tmpMat = new Float32Array(16);
const _cockMat = new Float32Array(16), _cockU = [0, 1, 0];   // stabilized cockpit-interior basis
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];
// Pre-allocated scratch matrices — zero-GC hot-path matrix math.
const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _mProj = new Float32Array(16), _mView = new Float32Array(16), _mVP = new Float32Array(16);
const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _mInvProj = new Float32Array(16);
const _sunVS = new Float32Array(3);
const _upVS = new Float32Array(3);   // world-up expressed in view space (wet-road SSR)
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)

// Optional imported car model (binary glTF / .glb). When loaded, team meshes are
// built from it — tinted to each livery — instead of the procedural Car3D.
// null => procedural (the shipped default; there is no bundled model).
AX.carModelBuf = null;
const CAR_MODEL_SCALE = 1;

function buildCarData(team) {
  if (AX.carModelBuf) {
    try { return GLTF.toMesh(AX.carModelBuf, { scale: CAR_MODEL_SCALE, tint: team.color }); }
    catch (e) { /* any parse trouble: fall through to the procedural car */ }
  }
  return Car3D.build(team.color, team.color2, { num: team.drivers && team.drivers[0] && team.drivers[0].num });
}

function teamMesh(team) {
  if (!teamMeshes[team.id]) teamMeshes[team.id] = GLX.createMesh(buildCarData(team));
  return teamMeshes[team.id];
}

// Player car gets animated wheels: a body-only mesh + four separate wheel meshes
// the render layer spins (∝ speed) and steers (fronts). Only for the procedural
// car — a loaded glb model is one piece, so playerBodyMesh returns null and the
// player falls back to the full static mesh. Wheels are team-independent (dark
// tyres), so the two wheel meshes (narrow front, wide rear) are shared/global.
const playerBodies = {};
AX.wheelMeshF = null; AX.wheelMeshR = null;
const WHEELS = [
  { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
  { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
];
const _wheelLocal = new Float32Array(16);
const _wheelWorld = new Float32Array(16);
const _ringWorld = new Float32Array(16);

// Brake-glow ring: a flat emissive annulus (axle-aligned, both windings so it
// reads from either side) drawn just proud of each wheel face while the discs
// are hot — the classic F1 glowing-brake cue. Shared by all four wheels.
let brakeRingMesh = null;
function getBrakeRing() {
  if (brakeRingMesh) return brakeRingMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const SEG = 18, R0 = 0.045, R1 = 0.160, HOT = [1.6, 0.50, 0.12];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const base = out.pos.length / 3;
    out.pos.push(0, R0 * c0, R0 * s0,  0, R1 * c0, R1 * s0,
                 0, R1 * c1, R1 * s1,  0, R0 * c1, R0 * s1);
    for (let v = 0; v < 4; v++) { out.nrm.push(1, 0, 0); out.col.push(HOT[0], HOT[1], HOT[2]); }
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
                 base, base + 2, base + 1, base, base + 3, base + 2);
  }
  brakeRingMesh = GLX.createMesh(out);
  return brakeRingMesh;
}

// Rain-light strobe overlay: a small rear-facing HDR-red quad drawn over the
// baked LED panel while the road is wet, blinking like the real FIA ~4 Hz
// strobe. Shared by all cars (one draw per car per frame during the on-phase).
let rainLightMesh = null;
function getRainLight() {
  if (rainLightMesh) return rainLightMesh;
  const R = [2.4, 0.10, 0.08], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.055, h = 0.07;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  rainLightMesh = GLX.createMesh(out);
  return rainLightMesh;
}
// Exhaust flame: a tiny HDR-amber quad behind the tailpipe, flickering while
// the player is on throttle after dark — an arcade heat-glow cue.
let exhaustMesh = null;
function getExhaustFlame() {
  if (exhaustMesh) return exhaustMesh;
  const R = [2.6, 1.05, 0.25], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.035, h = 0.030;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  exhaustMesh = GLX.createMesh(out);
  return exhaustMesh;
}
// Boost flame: a larger blue-white plasma quad behind the tailpipe while ERS
// boost is deploying — visible at every time of day.
let boostMesh = null;
function getBoostFlame() {
  if (boostMesh) return boostMesh;
  const R = [0.65, 1.7, 3.0], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.070, h = 0.055;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  boostMesh = GLX.createMesh(out);
  return boostMesh;
}
// ERS indicator: a thin cyan strip on the rear crash structure above the rain
// light — dim when boost is ARMED, bright strobing while DEPLOYING (the field
// reads your energy state the way real ERS boards do).
let ersMesh = null;
function getErsLight() {
  if (ersMesh) return ersMesh;
  const R = [0.25, 2.2, 2.0], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.075, h = 0.014;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  ersMesh = GLX.createMesh(out);
  return ersMesh;
}

// ── First-person cockpit rig (COCKPIT cam viewmodel) ─────────────────────────
// The car body is hidden in cockpit view and has no modelled interior, so the
// driver's-eye view draws the real car body (minus the helmet + halo) plus a steering
// wheel drawn separately so it can roll with the smoothed steering input.
// Everything is metres in car-local coords (+z nose, +y up; driver eye sits
// at roughly (0, 0.98, -0.05) — see the cockpit camVantage).
function _rigBox(out, cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const F = [
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
  ];
  for (const f of F) {
    const b = out.pos.length / 3, n = f[4];
    for (let i = 0; i < 4; i++) { const v = f[i]; out.pos.push(v[0], v[1], v[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}
let cockpitWheelMesh = null;
function getCockpitWheel() {
  if (cockpitWheelMesh) return cockpitWheelMesh;
  // A real modern F1 wheel carrying ALL the telemetry (that's where it lives on
  // the real car): shift-light LED row across the top, central LCD with the
  // gear/speed/pedal/energy readouts drawn live over it, button clusters,
  // rotary knobs, shift paddles. Built centred on the hub (origin), wheel
  // plane in XY facing the driver (-z side); rolled about Z by the draw call.
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.04, 0.04, 0.05], RUB = [0.085, 0.085, 0.095], KNOB = [0.75, 0.72, 0.15];
  _rigBox(out, -0.165, 0.0, 0, 0.05, 0.20, 0.062, RUB);        // hand grips
  _rigBox(out,  0.165, 0.0, 0, 0.05, 0.20, 0.062, RUB);
  _rigBox(out, -0.118, 0.112, 0, 0.06, 0.045, 0.05, CARB);     // upper corners
  _rigBox(out,  0.118, 0.112, 0, 0.06, 0.045, 0.05, CARB);
  _rigBox(out, 0, 0.128, 0, 0.18, 0.038, 0.05, CARB);          // top bar
  _rigBox(out, -0.122, -0.118, 0, 0.055, 0.045, 0.05, CARB);   // lower corners
  _rigBox(out,  0.122, -0.118, 0, 0.055, 0.045, 0.05, CARB);
  _rigBox(out, 0, -0.138, 0, 0.17, 0.038, 0.05, CARB);         // bottom bar
  _rigBox(out, 0, 0.0, 0.014, 0.215, 0.16, 0.042, CARB);       // fascia plate
  _rigBox(out, 0, 0.024, -0.016, 0.125, 0.080, 0.02, [0.025, 0.025, 0.035]);  // display bezel
  _rigBox(out, 0, 0.024, -0.028, 0.112, 0.068, 0.006, [0.012, 0.018, 0.028]); // LCD
  _rigBox(out, 0.048, 0.024, -0.0295, 0.012, 0.050, 0.003, [0.03, 0.035, 0.04]); // energy slot (vertical, centred)
  // Aligned display cells on one line: speed (navy) | gear (DARK RED box)
  _rigBox(out, -0.034, 0.022, -0.0292, 0.052, 0.040, 0.003, [0.10, 0.11, 0.13]); // speed cell frame
  _rigBox(out, -0.034, 0.022, -0.0296, 0.047, 0.035, 0.003, [0.010, 0.016, 0.026]); // speed cell face
  _rigBox(out, 0.014, 0.022, -0.0292, 0.034, 0.044, 0.003, [0.38, 0.07, 0.06]);  // gear cell frame (red)
  _rigBox(out, 0.014, 0.022, -0.0296, 0.029, 0.039, 0.003, [0.16, 0.025, 0.03]); // gear cell face (dark red)
  // Button clusters flanking the screen (bright HDR; glow slightly at night).
  const BTN = [[1.5, 0.15, 0.10], [0.15, 0.5, 1.5], [0.15, 1.3, 0.35], [1.35, 1.1, 0.12]];
  let bi = 0;
  for (const bx of [-0.096, 0.096]) for (const by of [0.045, 0.008])
    _rigBox(out, bx, by, -0.026, 0.02, 0.02, 0.012, BTN[bi++]);
  _rigBox(out, -0.05, -0.058, -0.026, 0.028, 0.028, 0.014, KNOB);  // rotary knobs
  _rigBox(out,  0.05, -0.058, -0.026, 0.028, 0.028, 0.014, KNOB);
  _rigBox(out, -0.082, 0.024, -0.0290, 0.024, 0.024, 0.003, [0.10, 0.11, 0.13]); // OT lamp bezel
  _rigBox(out, -0.082, 0.024, -0.0294, 0.019, 0.019, 0.003, [0.06, 0.05, 0.08]);  // OT lamp (off)
  // Shift paddles: wide blades poking out past the rim behind the wheel.
  const PADL = [0.11, 0.11, 0.125];
  _rigBox(out, -0.150, -0.01, 0.052, 0.085, 0.135, 0.015, PADL);
  _rigBox(out,  0.150, -0.01, 0.052, 0.085, 0.135, 0.015, PADL);
  cockpitWheelMesh = GLX.createMesh(out);
  return cockpitWheelMesh;
}
// Shift-light LED strip across the top of the wheel fascia — LIVE, keyed to
// RPM like the real wheel: greens, ambers, reds, then the blue "shift now"
// pair. One cached mesh per lit-count (9 tiny meshes, wheel-local coords).
const _ledMeshes = {};
function getLedStrip(lit) {
  if (_ledMeshes[lit]) return _ledMeshes[lit];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const COLS = [[0.2,1.8,0.4],[0.2,1.8,0.4],[0.2,1.8,0.4],[1.8,0.9,0.15],[1.8,0.9,0.15],[1.9,0.2,0.15],[1.9,0.2,0.15],[0.9,0.4,2.2]];
  for (let i = 0; i < 8; i++) {
    const col = i < lit ? COLS[i] : [0.05, 0.05, 0.06];
    _rigBox(out, -0.070 + i * 0.020, 0.082, -0.026, 0.013, 0.013, 0.010, col);
  }
  _ledMeshes[lit] = GLX.createMesh(out);
  return _ledMeshes[lit];
}
// 7-seg GEAR digit, wheel-local on the LCD centre (cached per gear).
const _gearMeshes = {};
function getGearDigit(g) {
  if (_gearMeshes[g]) return _gearMeshes[g];
  const SEG7 = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const GRN = [2.2, 0.85, 0.12];   // orange, like the real gear readout
  const h = 0.026, w = h * 0.55, t = h * 0.16, q = h / 4, cy = 0.022, cz = -0.0335;
  const L = [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
              [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
  const seg = SEG7[g % 10];
  for (let i = 0; i < 7; i++) if (seg[i])
    _rigBox(out, 0.014 + L[i][1], cy + L[i][0], cz, L[i][2], L[i][3], 0.006, GRN);
  _gearMeshes[g] = GLX.createMesh(out);
  return _gearMeshes[g];
}
// Small 7-seg digits for the LCD speed readout (cached 0-9, origin-centred —
// positioned per frame with a translate composed onto the wheel matrix).
const _spdMeshes = {};
function getSpeedDigit(d) {
  if (_spdMeshes[d]) return _spdMeshes[d];
  const SEG7 = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CYN = [0.3, 1.6, 2.0];
  const h = 0.017, w = h * 0.55, t = h * 0.18, q = h / 4;
  const L = [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
              [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
  const seg = SEG7[d % 10];
  for (let i = 0; i < 7; i++) if (seg[i])
    _rigBox(out, L[i][1], L[i][0], 0, L[i][2], L[i][3], 0.006, CYN);
  _spdMeshes[d] = GLX.createMesh(out);
  return _spdMeshes[d];
}
// Live ERS fill (anchored LEFT for matrix X-scale) + pedal bars (anchored
// BOTTOM for matrix Y-scale).
let _ersBarMesh = null;
function getErsBar() {
  if (_ersBarMesh) return _ersBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.9, 0.5]);  // anchored at y=0
  _ersBarMesh = GLX.createMesh(out);
  return _ersBarMesh;
}
let _otArmedMesh = null, _otActiveMesh = null;
function getOtLamp(active) {
  if (active ? _otActiveMesh : _otArmedMesh) return active ? _otActiveMesh : _otArmedMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, -0.082, 0.024, -0.031, 0.019, 0.019, 0.003, active ? [1.6, 0.5, 2.2] : [1.2, 1.2, 1.3]);
  const m = GLX.createMesh(out);
  if (active) _otActiveMesh = m; else _otArmedMesh = m;
  return m;
}
let _thrBarMesh = null, _brkBarMesh = null;
function getPedalBar(brake) {
  if (brake ? _brkBarMesh : _thrBarMesh) return brake ? _brkBarMesh : _thrBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, 0, 0.026, 0, 0.009, 0.052, 0.006, brake ? [1.9, 0.2, 0.15] : [0.2, 1.8, 0.4]);
  const m = GLX.createMesh(out);
  if (brake) _brkBarMesh = m; else _thrBarMesh = m;
  return m;
}
// The cockpit body: the REAL car (livery, nose, mirrors, number board) minus
// the driver helmet the camera sits inside. Cached per team like playerBodies.
const cockpitBodies = {};
function cockpitBodyMesh(team) {
  if (!cockpitBodies[team.id])
    cockpitBodies[team.id] = GLX.createMesh(Car3D.build(team.color, team.color2,
      { noWheels: true, noDriver: true, cockpit: true, num: team.drivers && team.drivers[0] && team.drivers[0].num }));
  return cockpitBodies[team.id];
}
// Hub transform (translate + slight upscale) and scratch matrices for the
// steering roll + per-element LCD offsets.
const _rigT = new Float32Array([0.80,0,0,0, 0,0.80,0,0, 0,0,0.80,0, 0,0.83,0.41,1]);
const _rigR = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _rigA = new Float32Array(16), _rigB = new Float32Array(16);
const _digT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _digM = new Float32Array(16);
function drawCockpitRig(c, base, dt, paint) {
  const nite = AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && AX.track.def.night);
  const opt = { roughness: 0.55, metalness: 0.15, specular: 0.40, emissive: nite ? 0.16 : 0 };
  // The actual car around you: body (minus helmet) with the real paint, plus
  // the steering/spinning FRONT wheels (the rears sit right beside the camera
  // in the wide FOV and blob the bottom corners — skipped). Nudged 0.35 m
  // forward of their real physics position so they read further out ahead of
  // the driver instead of hugging the cockpit edge (cosmetic-only offset —
  // the actual wheel/contact-patch physics is untouched).
  GLX.draw(cockpitBodyMesh(c.team), base, paint);
  drawPlayerWheels(c, base, dt, { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: nite ? 0.12 : 0 }, true, 0.35, 2.1);
  // Roll the wheel about the (car-local) column axis by the smoothed steering —
  // works identically for tilt / buttons / touch (steerVis is the resolved,
  // damped steering whatever the input mode). A second, slower damping stage
  // gives the wheel visual WEIGHT (it settles rather than flicking), the lock
  // is modest (~±46°), and the sign is flipped — it was rotating backwards.
  c._whlVis = damp(c._whlVis == null ? 0 : c._whlVis, clamp(c.steerVis || 0, -1, 1), 6, dt);
  const a = -c._whlVis * 0.80;
  const ca = Math.cos(a), sa = Math.sin(a);
  _rigR[0] = ca; _rigR[1] = sa; _rigR[4] = -sa; _rigR[5] = ca;
  M4.mulTo(_rigA, base, _rigT);
  M4.mulTo(_rigB, _rigA, _rigR);
  GLX.draw(getCockpitWheel(), _rigB, opt);
  // Live telemetry ON the wheel (all ride the wheel matrix, like the real LCD):
  // gear (auto or manual — c.gear is maintained by both paths), RPM shift
  // lights, speed, pedal bars, ERS energy.
  const fx = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true };
  GLX.draw(getGearDigit(clamp(c.gear || 1, 0, 9)), _rigB, fx);
  const rpmF = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  GLX.draw(getLedStrip(Math.round(rpmF * 8)), _rigB, fx);
  const kmh = Math.min(999, Math.round((c.speed || 0) * 3.6));
  const ds = String(kmh);
  for (let i = 0; i < ds.length; i++) {
    _digT[12] = -0.034 + (i - (ds.length - 1) / 2) * 0.0135; _digT[13] = 0.022; _digT[14] = -0.0335;
    M4.mulTo(_digM, _rigB, _digT);
    GLX.draw(getSpeedDigit(+ds[i]), _digM, fx);
  }
  // ERS charge fill in the slot under the LCD; pulses while deploying.
  const en = clamp(c.energy || 0, 0, 1);
  if (en > 0.01) {
    _digT[12] = 0.048; _digT[13] = 0.001; _digT[14] = -0.0315;
    M4.mulTo(_digM, _rigB, _digT);
    _digM[4] *= en; _digM[5] *= en; _digM[6] *= en;
    GLX.draw(getErsBar(), _digM, c.deploying
      ? { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 0.75 + 0.25 * Math.sin(AX.raceT * 22) }
      : fx);
  }
  // OVERTAKE lamp on the wheel: white when armed, pulsing purple while active
  // (the floating HUD OVERTAKE text is hidden in cockpit view).
  if (c.otT > 0) {
    GLX.draw(getOtLamp(true), _rigB, { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true,
      alpha: 0.7 + 0.3 * Math.sin(AX.raceT * 18) });
  } else if (c.otArmed) {
    GLX.draw(getOtLamp(false), _rigB, fx);
  }
  _digT[12] = _digT[13] = _digT[14] = 0;
}

function playerBodyMesh(team) {
  if (AX.carModelBuf) return null;   // glb model: single piece, no wheel split
  if (!playerBodies[team.id]) playerBodies[team.id] = GLX.createMesh(Car3D.build(team.color, team.color2, { noWheels: true, num: team.drivers && team.drivers[0] && team.drivers[0].num }));
  return playerBodies[team.id];
}
// Spin each wheel about its axle ∝ speed and steer the fronts by the smoothed
// driver input. local = translate(corner) ∘ rotY(steer) ∘ rotX(spin), composed
// straight into a scratch matrix (no per-frame allocation), then into world.
function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale) {
  if (!AX.wheelMeshF) { AX.wheelMeshF = GLX.createMesh(Car3D.buildWheel(0.32)); AX.wheelMeshR = GLX.createMesh(Car3D.buildWheel(0.38)); }
  c.wheelSpin = ((c.wheelSpin || 0) + (c.speed / WHEEL_R) * dt) % (Math.PI * 2);
  const sp = Math.sin(c.wheelSpin), cp = Math.cos(c.wheelSpin);
  const steerA = clamp(c.steerVis || 0, -1, 1) * WHEEL_STEER_VIS;
  const ws = wScale || 1;   // widen the tyre along its axle (cockpit view)
  for (let w = 0; w < WHEELS.length; w++) {
    const wd = WHEELS[w];
    if (frontsOnly && wd.rear) continue;   // cockpit: rears sit beside the camera and blob the corners
    const yaw = wd.front ? steerA : 0;
    const ss = Math.sin(yaw), cs = Math.cos(yaw);
    const L = _wheelLocal;
    // Local X is the wheel axle (tyre width); scale that column by ws to widen.
    L[0] = cs*ws;    L[1] = 0;      L[2] = -ss*ws;    L[3] = 0;
    L[4] = ss*sp;    L[5] = cp;     L[6] = cs*sp;     L[7] = 0;
    L[8] = ss*cp;    L[9] = -sp;    L[10] = cs*cp;    L[11] = 0;
    // Push the widened wheels outward so they don't intersect the tub.
    L[12] = wd.x + (wd.x < 0 ? -1 : 1) * (ws - 1) * 0.16; L[13] = wd.y; L[14] = wd.z + (fwdOffset || 0); L[15] = 1;
    M4.mulTo(_wheelWorld, base, L);
    GLX.draw(wd.rear ? AX.wheelMeshR : AX.wheelMeshF, _wheelWorld, opt);
    // Hot brake discs: an emissive ring floating just off the outer wheel face,
    // ramping with the render-only brakeHeat (bright orange → blooms when hot).
    const heat = c.brakeHeat || 0;
    if (heat > 0.05) {
      const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
      const W = _ringWorld;
      W.set(_wheelWorld);
      W[12] += W[0] * tx; W[13] += W[1] * tx; W[14] += W[2] * tx;
      GLX.draw(getBrakeRing(), W, {
        emissive: 0.30 + 0.70 * heat, roughness: 0.9, specular: 0,
        alpha: Math.min(1, 0.25 + heat * 0.9), noAlphaWrite: true,
      });
    }
  }
}

// Load an optional .glb car model at runtime. On success, rebuilds every team
// mesh from it; on any failure (missing file, bad data) silently keeps the
// procedural car. Returns Promise<boolean>. Not auto-called — so a missing asset
// never logs a 404 during normal startup. Drop in a model then call this (e.g.
// from the console or __apex.loadCarModel) once a CC-licensed .glb is available.
async function loadCarModel(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    GLTF.toMesh(buf, { scale: CAR_MODEL_SCALE });   // validate before adopting
    AX.carModelBuf = buf;
    for (const k in teamMeshes) delete teamMeshes[k];  // force rebuild from model
    for (const k in playerBodies) delete playerBodies[k];
    return true;
  } catch (e) { return false; }
}


// Floodlight set for ANY track (every circuit gets them; the caller only feeds
// them to the shader when the scene is dark — night/dusk/dawn). A light roughly
// every ~24 m (alternating sides) at mast height, capped to the nearest 48 by the
// per-frame cull. Flat [x,y,z, r,g,b, rad, …] septets. Colour, brightness, pool
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
// buildTrackLights re-runs on the next frame. `u` entries upload straight to
// a LIT_FS shader uniform via frame.tune (see glx.js begin()).
const TUNE_DEFS = [
  // Night energy budget
  { id: "exposureMul",  label: "EXPOSURE",        group: "NIGHT ENERGY", min: 0.5,  max: 1.6,  step: 0.01,  def: 1.0,  help: "Master brightness multiplier on the tone-map input (all times of day)." },
  { id: "bloomMul",     label: "BLOOM AMOUNT",    group: "NIGHT ENERGY", min: 0,    max: 2,    step: 0.05,  def: 1.0,  help: "Halo strength around bright HDR sources (lamps, neon, windows)." },
  { id: "threshOff",    label: "BLOOM THRESHOLD", group: "NIGHT ENERGY", min: -0.3, max: 0.1,  step: 0.01,  def: 0.0,  help: "Offset on what counts as bright enough to bloom. Lower = mid-tones glow (fog-of-glow)." },
  { id: "floodEmitMul", label: "LIT GEOMETRY",    group: "NIGHT ENERGY", min: 0,    max: 1.6,  step: 0.05,  def: 1.0,  help: "How lit the night buildings/windows/signage render (prop emissive ramp)." },
  { id: "glowAmp",      label: "EMISSIVE GLOW",   group: "NIGHT ENERGY", min: 0.5,  max: 4,    step: 0.1,   def: 2.3,  u: "uGlowAmp", help: "HDR push for windows / lenses / neon — roughly half the night frame energy." },
  // Lamps
  { id: "lampLevel",    label: "LAMP LEVEL",      group: "LAMPS", min: 0.05, max: 1,   step: 0.01, def: 0.26, help: "Overall floodlight brightness ceiling (on top of the twilight ramp)." },
  { id: "poolEnergy",   label: "POOL ENERGY",     group: "LAMPS", min: 0.1,  max: 1.2, step: 0.05, def: 0.55, rebuild: true, help: "Per-lamp pool luminance scale (physical energy per fixture)." },
  { id: "lampRadiusMul",label: "POOL RADIUS",     group: "LAMPS", min: 0.5,  max: 2,   step: 0.05, def: 1.0,  rebuild: true, help: "Reach of each lamp pool. Too small and the far pool corner dies." },
  { id: "bleedMul",     label: "VALLEY BLEED",    group: "LAMPS", min: 0,    max: 3,   step: 0.1,  def: 1.0,  rebuild: true, help: "Out-of-beam light floor — lifts the dark valleys between pools." },
  { id: "glareStr",     label: "LENS GLARE",      group: "LAMPS", min: 0,    max: 0.8, step: 0.02, def: 0.12, help: "Lens-halo billboard strength at every active lamp." },
  // Glowing fog
  { id: "lampFogBase",  label: "FOG GLOW BASE",   group: "GLOWING FOG", min: 0, max: 1,   step: 0.05, def: 0.45, help: "How strongly lamps tint the distant fog wall on a clear night." },
  { id: "lampFogHaze",  label: "FOG GLOW HAZE",   group: "GLOWING FOG", min: 0, max: 1.5, step: 0.05, def: 0.6,  help: "Extra lamp-fog glow added as ground mist / fog weather thickens." },
  { id: "mistShare",    label: "MIST GLOW SHARE", group: "GLOWING FOG", min: 0, max: 4,   step: 0.1,  def: 1.5,  u: "uMistShare", help: "Ground-mist share of the lamp glow vs the air-fog share." },
  { id: "fogClip",      label: "FOG GLOW CLIP",   group: "GLOWING FOG", min: 0, max: 1.5, step: 0.05, def: 0.7,  u: "uLampFogClip", help: "Soft shoulder stopping lamp clusters pushing the fog wall to white." },
  // Volumetrics
  { id: "lampVolBase",  label: "BEAMS (CLEAR)",   group: "VOLUMETRICS", min: 0, max: 0.4, step: 0.01, def: 0.05, help: "Volumetric lamp-beam strength in clear night air." },
  { id: "lampVolHaze",  label: "BEAMS (HAZE)",    group: "VOLUMETRICS", min: 0, max: 1.5, step: 0.05, def: 0.65, help: "How much haze/rain swells the lamp beams." },
  { id: "lampVolCap",   label: "BEAM CEILING",    group: "VOLUMETRICS", min: 0, max: 1,   step: 0.05, def: 0.70, help: "Hard cap on volumetric beam strength." },
  { id: "grMul",        label: "SUN GOD-RAYS",    group: "VOLUMETRICS", min: 0, max: 2.5, step: 0.05, def: 1.0,  help: "Volumetric sun-shaft strength (dawn/dusk drama)." },
  // Base light
  { id: "keyMul",       label: "KEY LIGHT (SUN)", group: "BASE LIGHT", min: 0,   max: 2.5,  step: 0.05,  def: 1.0,  help: "Direct sun/moon intensity — diffuse + speculars + shadows. Ambient, fog and sky reflection are untouched, so the scene stays coherent when dimmed." },
  { id: "ambientMul",   label: "AMBIENT FILL",    group: "BASE LIGHT", min: 0.3, max: 3,    step: 0.05,  def: 1.0,  help: "Hemisphere ambient multiplier — the shadow/unlit fill and night readability floor." },
  { id: "bounceK",      label: "LAMP BOUNCE",     group: "BASE LIGHT", min: 0,   max: 0.15, step: 0.005, def: 0.04, u: "uBounceK", help: "Pool light bounced onto walls/kerbs/car flanks outside the beam cone." },
  // Image & colour
  { id: "gradeStr",     label: "GRADE STRENGTH",  group: "IMAGE & COLOUR", min: 0, max: 2.5, step: 0.05, def: 1.0, help: "Cinematic split-tone amount (teal shadows / warm highlights). 0 = neutral, higher = stronger film look." },
  { id: "vibrance",     label: "VIBRANCE",        group: "IMAGE & COLOUR", min: 0, max: 0.8, step: 0.02, def: 0.20, u: "uVibrance", help: "Selective saturation — lifts dull/washed pixels (hazy sky, grass, tarmac) without over-cooking neon or kerbs." },
  { id: "saturation",   label: "SATURATION",      group: "IMAGE & COLOUR", min: 0, max: 2,   step: 0.05, def: 1.0, u: "uSaturation", help: "Overall colour intensity. 0 = greyscale, 1 = as-shipped, >1 = punchier." },
  { id: "contrast",     label: "CONTRAST",        group: "IMAGE & COLOUR", min: 0.7, max: 1.6, step: 0.02, def: 1.12, u: "uContrast", help: "Midtone-darkening gamma. Higher = deeper, filmic shadows; lower = flatter and brighter." },
  { id: "tint",         label: "WARM / COOL",     group: "IMAGE & COLOUR", min: -1, max: 1, step: 0.05, def: 0.0, u: "uTint", fmt: "signed", help: "White-balance shift. + warms (amber, sunny), − cools (blue, overcast/night)." },
  { id: "vignette",     label: "VIGNETTE",        group: "IMAGE & COLOUR", min: 0.4, max: 1, step: 0.02, def: 0.80, u: "uVignette", help: "Corner darkening. 1 = none, lower = stronger frame vignette." },
  // Reflections
  { id: "ssrWetMul",    label: "WET MIRROR",      group: "REFLECTIONS", min: 0, max: 1.5, step: 0.05, def: 1.0,  help: "Wet-road scene-mirror strength (scales the wetness ramp)." },
  { id: "ssrDryNight",  label: "DRY NIGHT SHEEN", group: "REFLECTIONS", min: 0, max: 0.5, step: 0.01, def: 0.08, help: "Dry tarmac lamp/neon sheen at night." },
  { id: "ssrDryDay",    label: "DRY DAY SHEEN",   group: "REFLECTIONS", min: 0, max: 0.3, step: 0.01, def: 0.07, help: "Faint tower-and-sky mirror on dry day tarmac." },
  // Car
  { id: "carReflect",   label: "CAR REFLECTION",  group: "CAR", min: 0,   max: 1.5, step: 0.05, def: 0.55, u: "uCarReflect", help: "How strongly the world (track, sky, lights) mirrors on the car bodywork." },
  { id: "carGloss",     label: "PAINT GLOSS",     group: "CAR", min: 0.3, max: 2.5, step: 0.05, def: 1.0,  help: "Sharpness of the paint's highlights & reflections. Higher = glassier (lower roughness)." },
  { id: "carSpecular",  label: "PAINT SPECULAR",  group: "CAR", min: 0,   max: 2,   step: 0.05, def: 1.0,  help: "Brightness of the specular highlight rolling over the bodywork." },
  { id: "carClearcoat", label: "CLEARCOAT",       group: "CAR", min: 0,   max: 2,   step: 0.05, def: 1.0,  help: "Lacquer coat that catches crisp sun / lamp glints over the base colour." },
  { id: "carMetal",     label: "PAINT METALNESS", group: "CAR", min: 0,   max: 3,   step: 0.05, def: 1.0,  help: "How metallic the paint reads — reflection tint and grazing falloff." },
  { id: "carGlow",      label: "BODY GLOW",       group: "CAR", min: 0,   max: 3,   step: 0.05, def: 1.0,  help: "Self-lit body glow after dark (only the night / wet liveries carry it)." },
  // Shadows & weather
  { id: "pcssPen",      label: "SHADOW SOFTEN",   group: "SHADOWS & WEATHER", min: 10, max: 300, step: 5, def: 80, u: "uPcssPen", help: "How fast shadows soften with caster distance (PCSS penumbra growth)." },
  { id: "wetness",      label: "WETNESS",         group: "SHADOWS & WEATHER", min: -0.05, max: 1, step: 0.05, def: -0.05, fmt: "auto", help: "Override the road wetness ramp (AUTO = follow weather; ramps over ~30 s)." },
];
// LT holds the LIVE values the driver reads every frame. They are resolved from
// a per-CONDITION profile store: each (track, time-of-day, weather) combination
// keeps its own set of overrides, so night+wet Monaco and day+dry Monza are
// tuned independently. Resolution per id: condition profile → migrated legacy
// global ("*") → TUNE_DEFS default. Only non-default values are stored.
const LT = {};
for (const d of TUNE_DEFS) LT[d.id] = d.def;
// Profile store shape: { "monza|night|wet": {lampLevel:0.4,…}, "*": {…legacy} }.
let _ltStore = {};
{
  const saved = store.get("lightTune", null);
  if (saved && typeof saved === "object") {
    const vals = Object.values(saved);
    // Legacy flat format was {id:number}. New format nests {key:{id:number}}.
    if (vals.length && vals.every((v) => typeof v === "number")) _ltStore = { "*": saved };
    else _ltStore = saved;
  }
}
// The profile key for the CURRENT session conditions ("default" TOD resolves to
// the track's actual day/night look so it shares one profile with an explicit
// pick of the same look).
function ltKey() {
  if (!AX.track || !AX.track.def) return null;
  let tod = AX.raceTimeOfDay;
  if (tod === "default") tod = AX.track.def.night ? "night" : "day";
  return AX.track.def.id + "|" + tod + "|" + AX.raceWeather;
}
// The resolution layers for the current condition, LOWEST precedence first:
//   TUNE_DEFS default → file "*" → file "track|tod|wx"
//     → localStorage "*" → localStorage "track|tod|wx"
// So a committed js/light-presets.js is the shipped baseline, and a player's
// local (localStorage) edits always win over it. A missing layer is skipped.
function ltLayers() {
  const F = window.LightPresets || null;
  const key = ltKey();
  return [
    F && F["*"], F && key && F[key],
    _ltStore["*"], key && _ltStore[key],
  ];
}
// What the current knob would resolve to WITHOUT the current condition's local
// profile — i.e. the value RESET falls back to. Used to decide whether a slider
// edit needs storing (store only when it differs from this fallback).
function ltFallback(id) {
  const d = TUNE_DEFS.find((t) => t.id === id);
  let v = d.def;
  const F = window.LightPresets || null, key = ltKey();
  if (F && F["*"] && typeof F["*"][id] === "number") v = F["*"][id];
  if (F && key && F[key] && typeof F[key][id] === "number") v = F[key][id];
  if (_ltStore["*"] && typeof _ltStore["*"][id] === "number") v = _ltStore["*"][id];
  return clamp(v, d.min, d.max);
}
// Rebuild LT for the current conditions. Called whenever the track/time/weather
// changes (via applyRaceSettings) so the right profile is live for both the
// tuner panel and actual racing.
function applyLightTune() {
  const layers = ltLayers();
  let rebuilt = false;
  for (const d of TUNE_DEFS) {
    let v = d.def;
    for (const L of layers) if (L && typeof L[d.id] === "number") v = L[d.id];
    v = clamp(v, d.min, d.max);
    if (LT[d.id] !== v) { LT[d.id] = v; if (d.rebuild) rebuilt = true; }
  }
  if (rebuilt && AX.track) AX.track._lights = null;
}
function setLightTune(id, v) {
  const d = TUNE_DEFS.find((t) => t.id === id);
  if (!d || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  LT[id] = v;
  const key = ltKey();
  if (key) {
    const prof = _ltStore[key] || (_ltStore[key] = {});
    // Store only when the value differs from what it would resolve to anyway
    // (default / file / legacy global). Storing an explicit value IS required
    // when it matches the default but the file/global would otherwise win —
    // that's how a local edit overrides a shipped value back down.
    if (v === ltFallback(id)) delete prof[id]; else prof[id] = v;
    if (!Object.keys(prof).length) delete _ltStore[key];
  }
  if (d.rebuild && AX.track) AX.track._lights = null;   // re-bake per-track light records next frame
  return true;
}
function persistLightTune() { store.set("lightTune", _ltStore); }
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
      const we = intensity * 0.30 * (4.5 * 4.5) * 0.55;
      lights.push(wx0, wy0, wz0,
        Math.max(0, nc[0]) * we, Math.max(0, nc[1]) * we, Math.max(0, nc[2]) * we,
        16, wdx, wdy, wdz, 0.55, 0.05, 0.10, 0.35, 0);
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
    const ge = intensity * 0.55 * (8 * 8) * 0.55;
    for (const lat of [-hwk * 0.55, 0, hwk * 0.55]) {
      lights.push(
        track.px[0] + track.rx[0] * lat, track.py[0] + 8, track.pz[0] + track.rz[0] * lat,
        1.02 * ge, 1.05 * ge, 1.12 * ge,
        26, 0, -1, 0, 0.92, 0.78, 0.06, 0.9, 0.3);
    }
  }
  return lights;
}

// Car rain lights as REAL light sources after dark: the nearest few cars carry a
// small red point light at the tail, so traffic reads as moving light sources —
// a red glow trailing each car on the road surface.
const _tlSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tlSel = [];
function appendCarTailLights() {
  const L = AX.frame.lights;
  // frame.lights is always the per-frame copy (flicker copies every frame), so
  // appending here never mutates the cached track set.
  if (!L || L === AX.track._lights || !AX.player) return;
  let budget = 32 - ((L.length / 15) | 0);
  if (budget <= 0) return;
  _tlSel.length = 0;
  for (const c of AX.cars) {
    const ds = Math.abs(c.s - AX.player.s);
    const d = Math.min(ds, AX.track.total - ds);
    if (d < 160) _tlSel.push({ c, d });
  }
  _tlSel.sort((a, b) => a.d - b.d);
  const nT = Math.min(_tlSel.length, Math.min(5, budget));
  for (let j = 0; j < nT; j++) {
    const c = _tlSel[j].c;
    Tracks.sample(AX.track, c.s, _tlSmp);
    const tx = _tlSmp.t[0], tz = _tlSmp.t[2];
    // rear-facing, tilted down: the glow lands on the road behind the car
    let dx = -tx * 0.87, dy = -0.5, dz = -tz * 0.87;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    L.push(
      _tlSmp.p[0] + _tlSmp.r[0] * c.x - tx * 2.4,
      _tlSmp.p[1] + 0.55,
      _tlSmp.p[2] + _tlSmp.r[2] * c.x - tz * 2.4,
      4.5, 0.14, 0.10,
      8, dx, dy, dz, 0.5, -0.2, 0.12, 0.25, 0.4);
  }
}

// Cull the track light set to the nearest 48 to the camera and flatten into
// `frame.lights`. Called each frame only when the session is at night.
const _lightCullBuf = [];
const _lightScaleBuf = [];
function setFrameLights(eye, scale) {
  const src = AX.track._lights;
  if (!src || !src.length) { AX.frame.lights = null; return; }
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
  const fl = (o) => {
    const x = Math.sin((o + 13) * 91.17) * 43758.5453;
    const hsh = x - Math.floor(x);
    const amp = hsh > 0.90 ? 0.10 : 0.02;
    return 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40);
  };
  if (count <= 32) {
    // Copy + scale rgb (time-of-day scale × flicker); geometry params pass through.
    out.length = 0;
    for (let i = 0; i < src.length; i += 15) {
      const f = fl(i);
      out.push(src[i], src[i+1], src[i+2],
        src[i+3] * sr * f, src[i+4] * sg * f, src[i+5] * sb * f, src[i+6],
        src[i+7], src[i+8], src[i+9], src[i+10], src[i+11], src[i+12], src[i+13], src[i+14]);
    }
    AX.frame.lights = out;
    return;
  }
  // distance-rank: select the nearest 32. Reuse a pooled object array + the
  // output buffer so a dense night grid doesn't allocate fresh garbage every
  // frame (was the main source of Minor-GC jitter on Vegas/Singapore).
  const buf = _lightCullBuf;
  for (let i = 0; i < count; i++) {
    const o = i * 15, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
    const d = dx * dx + dy * dy + dz * dz;
    const e = buf[i];
    if (e) { e.d = d; e.o = o; } else buf[i] = { d: d, o: o };
  }
  buf.length = count;
  buf.sort((a, b) => a.d - b.d);
  out.length = 0;
  for (let i = 0; i < 32; i++) {
    const o = buf[i].o;
    const f = fl(o);
    out.push(src[o], src[o+1], src[o+2], src[o+3] * sr * f, src[o+4] * sg * f, src[o+5] * sb * f,
      src[o+6], src[o+7], src[o+8], src[o+9], src[o+10], src[o+11], src[o+12], src[o+13], src[o+14]);
  }
  AX.frame.lights = out;
}

// ---------- render ----------
// Reusable camera-vantage solver. For a player camera `mode` with the car at arc
// position `s`, lateral `x`, speed `spd` (m/s) and wall-clock `now` (ms, for the
// orbiting cinematic cam), returns { eye, tgt, fov } — the exact framing render()
// drives the live camera with. Centralising it means snapCam() (clean first frame)
// and the previewCam() debug hook frame EVERY mode the same way, not just the three
// chase/cockpit/hood cases the old snapCam hand-rolled. `extra` carries player-only
// spice — { bankDy (banking lift), deploy (ERS FOV kick), slipLat (lateral slip m/s,
// for the drift cam) } — all optional and treated as 0 when absent.
const cvA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const cvB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function camVantage(mode, s, x, spd, now, extra) {
  extra = extra || {};
  const bankDy = extra.bankDy || 0;
  const dep = extra.deploy ? 1 : 0;
  const spN = clamp(spd / VMAX, 0, 1);
  Tracks.sample(AX.track, wrapS(s), cvA);
  const p = [cvA.p[0] + cvA.r[0] * x, cvA.p[1] + bankDy, cvA.p[2] + cvA.r[2] * x];
  const t = cvA.t, r = cvA.r;
  // Curved look-ahead: aim at the actual centreline `d` m up the road — it bends
  // with the corner — instead of a straight tangent extrapolation, so the chase
  // and onboard cams look INTO the bend rather than out the side of it. `lat`
  // keeps a fraction of the car's offset so the aim still leads where it's headed.
  const aheadPt = (d, h, lat) => {
    Tracks.sample(AX.track, wrapS(s + d), cvB);
    const lx = lat || 0;
    return [cvB.p[0] + cvB.r[0] * lx, cvB.p[1] + (h || 0), cvB.p[2] + cvB.r[2] * lx];
  };
  // Curvature of the bend we're approaching (speed-scaled look-ahead) — drives the
  // broadcast cams to the OUTSIDE of the corner so they shoot across the apex.
  const kA = Tracks.curvature(AX.track, wrapS(s + lerp(15, 45, spN)));
  // Street-circuit camera corridor: city tracks run a continuous building wall a
  // few metres past the barriers, and the wide broadcast offsets (15-25 m) put
  // the eye INSIDE the towers — the whole view fills with a glowing facade
  // interior. The verge strip just outside the barriers is no better: it's where
  // the trees and lamp masts stand, so a camera there stares into foliage.
  // Instead, on street tracks the broadcast cams stay over the ROAD EDGE itself
  // (furniture is never on the tarmac) and trade the lost width for extra
  // height — a crane-over-the-circuit shot. Open circuits keep the full framing.
  const corr = AX.track.def && AX.track.def.street ? Math.max(cvA.hw - 1.0, 4) : Infinity;
  let eye, tgt, fov;
  if (mode === "cockpit" || mode === "hood") {
    // COCKPIT: at the DRIVER's eye — the helmet dome sits at z -0.08 with its
    // top at ~0.73 m, so the eye rides just above it (0.98) and fractionally
    // behind the car origin, instead of floating 1.15 m up over the monocoque
    // ahead of the driver. Low + at the seat = the authentic "barely see over
    // the nose" F1 sensation, and the ground genuinely rushes.
    // HOOD: pulled back onto the chassis spine just ahead of the cockpit (was
    // 1.9 m out — past most of the bodywork, so no car was in frame). From
    // 0.85 m the nose and front wing read at the bottom of the frame, which
    // is what makes it a hood cam rather than a floating drone.
    // Cockpit eye: pulled back to z -0.18 (still IN FRONT of the airbox front
    // at z -0.28, so the roll hoop / rear structure never wraps into frame —
    // that was the "seeing the tail" bug) and raised to 1.06 m, so the forward
    // wheels sit further ahead and the view looks down over them enough to see
    // where they meet the track.
    const eyeFwd = mode === "cockpit" ? 0.02 : 0.55;
    const eyeUp  = mode === "cockpit" ? 0.99 : 0.95;
    eye = [p[0] + t[0] * eyeFwd, p[1] + eyeUp, p[2] + t[2] * eyeFwd];
    if (mode === "cockpit") {
      // Face straight FORWARD down the car's own heading (the tangent at the
      // car, not the curved centreline ahead) — the driver looks where the
      // NOSE points, so the view doesn't swing toward the apex on corner
      // entry. A tiny fraction of the curved look-ahead is kept so it still
      // gently leads into a bend rather than staring rigidly at a fixed point.
      // Look height at eye level (tilt slightly DOWN vs the old +0.4) so the
      // raised hood / nose deck ahead fills the lower-centre of the frame,
      // while the horizon still sits high enough to read the track ahead.
      const straight = [p[0] + t[0] * 30, p[1] + eyeUp - 0.15, p[2] + t[2] * 30];
      const lead = aheadPt(30, eyeUp - 0.15, x * 0.4);
      tgt = [straight[0] * 0.85 + lead[0] * 0.15,
             straight[1] * 0.85 + lead[1] * 0.15,
             straight[2] * 0.85 + lead[2] * 0.15];
    } else {
      tgt = aheadPt(30, eyeUp + 1.2, x * 0.6);
    }
    fov = lerp(64, 78, spN) + dep * 3;               // wider = faster feel
  } else if (mode === "overhead") {
    eye = [p[0] - t[0] * 9, p[1] + 42, p[2] - t[2] * 9];
    tgt = [p[0] + t[0] * 12, p[1], p[2] + t[2] * 12];
    fov = 46;
  } else if (mode === "heli") {
    // Broadcast helicopter — now corner-aware: hovers on the OUTSIDE of the
    // upcoming bend so it looks across the apex (was always camera-right).
    Tracks.sample(AX.track, wrapS(s - 26), cvB);
    const sgn = kA > 0.001 ? -1 : kA < -0.001 ? 1 : 1;
    const hl = Math.min(18, corr);              // stay inside the street canyon
    eye = [cvB.p[0] + cvB.r[0] * hl * sgn, cvB.p[1] + 21 + (18 - hl) * 0.6 + bankDy, cvB.p[2] + cvB.r[2] * hl * sgn];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 36 + dep * 2;
  } else if (mode === "reverse") {
    eye = [p[0] + t[0] * 5.5, p[1] + 1.35, p[2] + t[2] * 5.5];
    tgt = [p[0] - t[0] * 26, p[1] + 0.9, p[2] - t[2] * 26];
    fov = lerp(60, 72, spN);
  } else if (mode === "side") {
    // TV trackside: sits on the OUTSIDE of the bend looking across the apex.
    const sgn = kA > 0.002 ? 1 : kA < -0.002 ? -1 : 1;
    const sl = Math.min(25, corr);              // stay inside the street canyon
    eye = [p[0] + r[0] * sgn * sl, p[1] + 5.5 + (25 - sl) * 0.30, p[2] + r[2] * sgn * sl];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 44 + (25 - sl) * 0.5;                 // closer eye → widen so framing holds
  } else if (mode === "cinematic") {
    // Outside-of-corner cinematic that gently breathes its angle instead of doing
    // full disorienting loops. Auto-picks the outside of the bend; on a straight it
    // slowly drifts a three-quarter angle. Angle is measured around the car from
    // the track tangent, so the framing reads consistently corner to corner.
    const base = kA === 0 ? 0.6 : (kA > 0 ? -1 : 1) * 1.15;
    const a = base + Math.sin(now * 0.00022) * 0.5;
    // Cap the orbit distance so the LATERAL component stays inside the street
    // canyon (|sin a|·od ≤ corridor); the angle keeps breathing, the eye just
    // orbits tighter between the walls.
    const od = Math.min(15, corr / Math.max(Math.abs(Math.sin(a)), 0.25));
    const dir = [Math.cos(a) * t[0] + Math.sin(a) * r[0], 0, Math.cos(a) * t[2] + Math.sin(a) * r[2]];
    eye = [p[0] + dir[0] * od, p[1] + 6.5 + (15 - od) * 0.45, p[2] + dir[2] * od];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = lerp(50, 60, spN);
  } else if (mode === "low") {
    Tracks.sample(AX.track, wrapS(s - 10), cvB);
    const cx = x * 0.3;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 0.45 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.6, p[2]];
    fov = lerp(55, 68, spN);
  } else if (mode === "tcam") {
    // Broadcast T-cam: perched on the T-bar above/behind the driver, tilted
    // DOWN enough that the helmet, airbox and nose fill the lower frame — the
    // signature F1 onboard. (The old mount looked level 25 m ahead, so none of
    // the car was in frame and it read as a floating drone.)
    eye = [p[0] - t[0] * 0.52, p[1] + 1.46, p[2] - t[2] * 0.52];
    tgt = aheadPt(20, 0.35, x * 0.5);
    fov = 46 + dep * 2;
  } else if (mode === "rear") {
    // Onboard rear-view, remounted: the old eye (0.5 m back at 0.85 up) sat
    // INSIDE the engine cover with the rear wing (elements 0.8-1.1 m at
    // z -2.3..-2.6) filling the whole lens. Now perched above the airbox
    // looking back OVER the wing — wing at the bottom of frame, the road and
    // the chasing pack actually visible.
    eye = [p[0] - t[0] * 0.95, p[1] + 1.38, p[2] - t[2] * 0.95];
    tgt = [p[0] - t[0] * 26, p[1] + 0.7, p[2] - t[2] * 26];
    fov = lerp(58, 70, spN) + dep * 2;
  } else if (mode === "drift") {
    // Action chase that swings to the OUTSIDE of the slide so the car's flank faces
    // camera under oversteer, then settles directly behind once the car hooks up.
    const slipN = clamp((extra.slipLat || 0) / 8, -1, 1);
    Tracks.sample(AX.track, wrapS(s - 6.2), cvB);
    const cx = x * 0.5 - slipN * 5.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 2.4 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.75, p[2]];
    fov = lerp(55, 70, spN) + dep * 3;
  } else {
    // chase / far — anchored a FIXED arc-distance behind so the car stays a constant
    // readable size; the target leads into the curved road ahead.
    const far = mode === "far";
    const back  = far ? 10.5 : 5.8;
    const eyeUp = far ? 4.2 : 2.1;
    Tracks.sample(AX.track, wrapS(s - back), cvB);
    const cx = x * 0.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + eyeUp + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = aheadPt(far ? 9 : 6, far ? 1.0 : 0.7, x * 0.4);
    fov = lerp(52, 66, spN) + (far ? 4 : 0) + dep * 3;
  }
  return { eye, tgt, fov };
}

function render(dt) {
  if (AX.headlessMode) return;
  GLX.resize();
  if (!AX.track) { GLX.begin({ viewProj: M4.ident(), eye: [0,0,0], sunDir: [0,1,0], sunColor: [1,1,1], ambientGround: [0.2,0.2,0.2], ambientSky: [0.4,0.4,0.5], fogColor: [0.04,0.04,0.06], fogDensity: 0.002 }); GLX.present(); return; }

  // camera
  let eyeT, tgtT, fovT;
  if (AX.state === "menu" || AX.state === "select") {
    // slow flyby
    const s = wrapS((performance.now() * 0.012) % AX.track.total);
    Tracks.sample(AX.track, s, smp);
    eyeT = [smp.p[0] + smp.r[0] * 26 , smp.p[1] + 17, smp.p[2] + smp.r[2] * 26];
    tgtT = [smp.p[0] + smp.t[0] * 40, smp.p[1] + 2, smp.p[2] + smp.t[2] * 40];
    fovT = 58;
  } else {
    if (!AX.player) return;
    // Interpolated arc/lateral position so the chase anchor tracks the car
    // smoothly between physics steps (no high-refresh judder).
    const pS = lerpS(AX.player.rPrevS, AX.player.s, AX.renderAlpha);
    const px = (AX.player.rPrevX === undefined) ? AX.player.x
             : AX.player.rPrevX + (AX.player.x - AX.player.rPrevX) * AX.renderAlpha;
    Tracks.sample(AX.track, pS, smp);
    // ride the bank with the car so the camera doesn't sink into the banked road
    const bankCam = Tracks.banking(AX.track, pS, px);
    const bankDy = bankCam ? bankCam.dy : 0;
    const mode = CAM_MODES[AX.camMode].id;
    // All per-mode framing lives in camVantage() so the live cam, snapCam() and the
    // previewCam() debug hook stay identical. bankDy keeps the eye riding the bank.
    const vant = camVantage(mode, pS, px, AX.player.speed, performance.now(), {
      bankDy, deploy: AX.player.deploying, slipLat: AX.player.vLat || 0,
    });
    eyeT = vant.eye; tgtT = vant.tgt; fovT = vant.fov;
    if (AX.shake > 0) {
      AX.shake = Math.max(0, AX.shake - dt * 1.6);
      const amt = AX.shake * AX.shake * 0.9;   // squared: grazes barely move, crashes slam
      eyeT[0] += (Math.random() - 0.5) * amt; eyeT[1] += (Math.random() - 0.5) * amt * 0.7;
      tgtT[0] += (Math.random() - 0.5) * amt * 0.6; tgtT[1] += (Math.random() - 0.5) * amt * 0.6;
    }
    // Onboard speed vibration: a subtle high-frequency buzz on the rigid-mounted
    // cams (cockpit/hood/tcam) that grows with speed² — the visceral
    // "the car is alive under you" cue every onboard broadcast has. Two mixed
    // sine bands (not random) so it reads as vibration, not noise; tiny target
    // jitter so the whole frame trembles slightly rather than swimming.
    if (AX.state === "race" && (mode === "cockpit" || mode === "hood" || mode === "tcam")) {
      const spV = clamp(AX.player.speed / VMAX, 0, 1);
      const vAmp = spV * spV * 0.022 + (AX.player.deploying ? 0.008 : 0);
      if (vAmp > 0.001) {
        const tv = performance.now() * 0.001;
        const j1 = Math.sin(tv * 61.0) * 0.6 + Math.sin(tv * 97.0 + 1.7) * 0.4;
        const j2 = Math.sin(tv * 73.0 + 0.9) * 0.6 + Math.sin(tv * 111.0 + 2.3) * 0.4;
        eyeT[0] += j1 * vAmp; eyeT[1] += j2 * vAmp * 0.7;
        tgtT[0] += j1 * vAmp * 0.35; tgtT[1] += j2 * vAmp * 0.25;
      }
    }
  }
  // Sky-view override: __apex.sky() positions the camera to show the horizon
  // and clouds instead of the normal low chase angle.
  if (AX.frozen && AX.skyViewOverride) {
    eyeT = AX.skyViewOverride.eye;
    tgtT = AX.skyViewOverride.tgt;
    fovT = AX.skyViewOverride.fov;
  }

  // High lambda in-race: the anchor already follows the car along the track,
  // so we only smooth bumps — no speed lag. Low lambda for the menu flyby.
  // Onboard cams ride ON the car (cockpit/hood/tcam), so they need very high
  // lambda or the eye lags behind/into the bodywork at speed.
  const racing = AX.state === "race" || AX.state === "count";
  const camId = CAM_MODES[AX.camMode].id;
  const onboard = racing && (camId === "cockpit" || camId === "hood" || camId === "tcam");
  // Just after a cut, ease the external cams in with a gentler lambda so the angle
  // sweeps to its new vantage instead of snapping. Onboard cams ignore it (must lock).
  const cutEase = AX.camCutT > 0 ? (AX.camCutT = Math.max(0, AX.camCutT - dt), 0.4) : 1;
  // Onboard cams LOCK to the car (λ400 ≈ instant): at λ40 the exponential
  // smoothing left a steady-state lag of ~0.7-1 m at top speed, which slid the
  // cockpit eye backwards INSIDE the engine cover / shark fin — the "black
  // rectangle fills the screen at sustained speed" bug. The EYE must stay
  // locked, but the look-AHEAD target (camVantage curves it toward upcoming
  // corners) locking too made the head "snap" toward every apex instead of
  // panning — cockpit/hood ease the target gently, like a driver's eyes
  // leading into a corner rather than their whole head whipping around.
  const lE = onboard ? 400 : (racing ? 14 : 1.6) * cutEase;
  const gentleHead = onboard && (camId === "cockpit" || camId === "hood");
  const lT = gentleHead ? 7 : onboard ? 400 : (racing ? 16 : 10) * cutEase;
  for (let i = 0; i < 3; i++) {
    AX.camEye[i] = damp(AX.camEye[i], eyeT[i], lE, dt);
    AX.camTgt[i] = damp(AX.camTgt[i], tgtT[i], lT, dt);
  }
  AX.camFov = damp(AX.camFov, fovT, onboard ? 4 : 4 * cutEase, dt);

  // Camera roll: lean ~2-4° into corners proportional to lateral slip, like Codemasters F1/GRID
  {
    const slip = AX.player && AX.player.speed > 1 ? (AX.player.vLat || 0) / AX.player.speed : 0;
    AX.camRoll += (clamp(slip, -1, 1) * 0.07 - AX.camRoll) * Math.min(1, dt / 0.15);
  }

  // Debug free camera (set via __apex.view) overrides the chase cam — instant
  // (no damping), uncapped FOV, far plane and fog pushed out — for inspecting
  // whole-track layouts and trackside scenery from any angle.
  let fovY, farPlane = 900;
  if (AX.dbgCam) {
    AX.camEye[0] = AX.dbgCam.eye[0]; AX.camEye[1] = AX.dbgCam.eye[1]; AX.camEye[2] = AX.dbgCam.eye[2];
    AX.camTgt[0] = AX.dbgCam.target[0]; AX.camTgt[1] = AX.dbgCam.target[1]; AX.camTgt[2] = AX.dbgCam.target[2];
    fovY = AX.dbgCam.fov * Math.PI / 180;
    farPlane = AX.dbgCam.far;
  } else {
    // camFov is a vertical FOV. On a wide (landscape) screen a fixed vertical FOV
    // blows the horizontal field out past ~100°, which makes the car look tiny and
    // far away. Cap the horizontal FOV so wide screens zoom in and the car stays a
    // readable size; portrait (narrow) is unaffected.
    fovY = AX.camFov * Math.PI / 180;
    const HFOV_MAX = 86 * Math.PI / 180;
    const fovYCap = 2 * Math.atan(Math.tan(HFOV_MAX / 2) / Math.max(GLX.aspect, 0.0001));
    fovY = Math.min(fovY, fovYCap);
  }

  M4.perspectiveTo(_mProj, fovY, GLX.aspect, 0.1, farPlane);
  // Tilt the up vector by camRoll to roll the camera into corners. Inlined into
  // module-scope scratch vectors (no per-frame V3 array allocation); same math.
  {
    let bx = AX.camEye[0] - AX.camTgt[0], by = AX.camEye[1] - AX.camTgt[1], bz = AX.camEye[2] - AX.camTgt[2];
    let bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    // right = normalize(worldUp × back), worldUp = (0,1,0)
    let rx = 1 * bz - 0 * by, ry = 0 * bx - 0 * bz, rz = 0 * by - 1 * bx;
    let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    // up = normalize(worldUp + right*sin(roll))
    const s = Math.sin(AX.camRoll);
    let ux = rx * s, uy = 1 + ry * s, uz = rz * s;
    let ul = Math.hypot(ux, uy, uz) || 1;
    _camUp[0] = ux / ul; _camUp[1] = uy / ul; _camUp[2] = uz / ul;
  }
  M4.lookAtTo(_mView, AX.camEye, AX.camTgt, _camUp);
  M4.mulTo(_mVP, _mProj, _mView);
  M4.invertTo(_mInvProj, _mProj);   // for view-space reconstruction in SSAO
  M4.invertTo(_mInvVP, _mVP);       // for world-space reconstruction in god-rays
  // Sun direction in VIEW space (for screen-space contact shadows): mat3(view)·sunDir.
  {
    const sd = AX.frame.sunDir || [0, 1, 0];
    let x = _mView[0]*sd[0] + _mView[4]*sd[1] + _mView[8]*sd[2];
    let y = _mView[1]*sd[0] + _mView[5]*sd[1] + _mView[9]*sd[2];
    let z = _mView[2]*sd[0] + _mView[6]*sd[1] + _mView[10]*sd[2];
    const l = Math.hypot(x, y, z) || 1;
    _sunVS[0] = x/l; _sunVS[1] = y/l; _sunVS[2] = z/l;
  }
  // World-up (0,1,0) in VIEW space: the second column of mat3(view). Used by the
  // wet-road screen-space reflection to pick out up-facing road pixels.
  {
    const l = Math.hypot(_mView[4], _mView[5], _mView[6]) || 1;
    _upVS[0] = _mView[4]/l; _upVS[1] = _mView[5]/l; _upVS[2] = _mView[6]/l;
  }
  AX.frame.viewProj = _mVP;
  AX.frame.proj = _mProj;
  AX.frame.invProj = _mInvProj;
  AX.frame.invViewProj = _mInvVP;
  AX.frame.sunViewDir = _sunVS;
  AX.frame.upViewDir = _upVS;
  AX.frame.eye = AX.camEye;

  // Shadow pass — render terrain + road from sun's perspective.
  // Snap the frustum centre to a 10 m grid so the shadow map only re-renders
  // when the camera moves enough to shift the snapped cell.
  if (AX.track) {
    const sd = AX.frame.sunDir;
    const up = Math.abs(sd[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    const cx = smp.p[0], cy = smp.p[1], cz = smp.p[2];
    const snapX = Math.round(cx / 10) * 10, snapZ = Math.round(cz / 10) * 10;
    if (snapX !== AX._shadowSnapX || snapZ !== AX._shadowSnapZ) {
      AX._shadowSnapX = snapX; AX._shadowSnapZ = snapZ;
      M4.lookAtTo(_mLView, [snapX + sd[0] * 150, cy + sd[1] * 150, snapZ + sd[2] * 150], [snapX, cy, snapZ], up);
      // Tighter box than the old 140 m: +27% texel density (5.4 cm/texel) for
      // crisper contacts; the finer 10 m snap keeps coverage seamless.
      M4.orthoTo(_mLProj, -55, 55, -55, 55, 1.0, 320);
      M4.mulTo(_mLVP, _mLProj, _mLView);
      GLX.shadowBegin(_mLVP);
      GLX.castShadow(AX.track.meshes.terrain, MAT_IDENT);
      GLX.castShadow(AX.track.meshes.road, MAT_IDENT);
      // Perf: skip casting the (heavy, up to ~5 M-vert) props/city into the shadow
      // map once the sun is below the horizon — directional sun shadows are
      // invisible under the dim moonlight, so this is the biggest night saving.
      if (sd[1] > -0.03) GLX.castShadowChunked(AX.track.meshes.props, MAT_IDENT);
      GLX.shadowEnd();
    }
  }

  // ── Sky animation & weather FX ──────────────────────────────────────────
  // Advance the render clock regardless of physics freeze so the sky always
  // animates (cloud drift, star twinkle).
  AX._skyT += dt;
  AX.frameSky.time = AX._skyT;
  // Feed the same clock + cloud cover to the lit shader for drifting cloud shadows.
  AX.frame.time = AX._skyT;
  AX.frame.cloud = AX.frameSky.cloud !== undefined ? AX.frameSky.cloud : AX._cloudBase;
  // Wet-road material (rain): ramp wetness in/out smoothly so the surface
  // darkens and starts mirroring lamps/sky over ~1s rather than popping.
  if (LT.wetness >= 0) {
    // Tuner override: pin the road wetness directly (skips the slow ramp — the
    // real ramp takes ~30-60 s of session time to saturate after a weather flip).
    AX.frame.wetness = LT.wetness;
  } else {
    const wetTarget = isWetRoad() ? 1.0 : 0.0;
    const cur = AX.frame.wetness || 0;
    AX.frame.wetness = cur + (wetTarget - cur) * Math.min(1, dt * 0.8);
  }

  // Moon: use the value set by applyRaceSettings; pass through for default
  // night tracks that didn't go through the explicit raceTimeOfDay branch.
  // (frameSky.moon is already set in applyRaceSettings for non-default modes;
  // here we make sure default+track.night also gets a moon each frame.)
  if (AX.raceTimeOfDay === "default" && AX.track && AX.track.def && AX.track.def.night) {
    AX.frameSky.moon = 0.85;
  }

  // ── Lightning (active rain only) ─────────────────────────────────────────
  const wet = isWetRoad();      // wet-road material applies to "wet" AND "rain"
  const raining = isRaining();  // falling rain, lightning + thunder only in "rain"
  if (raining && AX._ltBase) {
    // Count down to the next strike
    AX._ltNextT -= dt;
    if (AX._ltNextT <= 0) {
      // Trigger a new flash: intensity 1 → decays at ~8×/s
      AX._ltFlash = 1.0;
      // Next strike in 4–12 seconds
      AX._ltNextT = 4 + Math.random() * 8;
      // Queue thunder to lag the flash (sound travels slower than light): a
      // near strike cracks ~0.3 s later, a distant one rumbles up to ~2 s later.
      AX._thunderT = 0.3 + Math.random() * 1.7;
    }
    if (AX._thunderT >= 0) {
      AX._thunderT -= dt;
      if (AX._thunderT < 0 && typeof GameAudio !== "undefined" && GameAudio.thunder) {
        GameAudio.thunder(clamp(1.0 - (AX._thunderT + dt) / 2.0, 0.15, 1.0));
      }
    }
    if (AX._ltFlash > 0.001) {
      // Decay: fast leading edge, then slow dying glow
      AX._ltFlash *= Math.exp(-8 * dt);
      if (AX._ltFlash < 0.001) AX._ltFlash = 0;
    }
    if (AX._ltFlash > 0) {
      // Spike ambient to a cool blue-white; the decay reads as a natural flash.
      // A brief exposure lift too, so the whole frame bleaches for the strike.
      // Written IN PLACE (no per-frame array allocation — this ran every rain
      // frame, exactly when the frame is already heaviest).
      const f = AX._ltFlash, aS = AX.frame.ambientSky, aG = AX.frame.ambientGround;
      for (let i = 0; i < 3; i++) {
        aS[i] = Math.min(1, AX._ltBase.ambientSky[i] + 0.55 * f);
        aG[i] = Math.min(1, AX._ltBase.ambientGround[i] + 0.40 * f);
      }
      AX.frame.exposure = (AX.frame.exposure || 1.0) + 0.22 * f;
    } else {
      // Restore base ambient so normal ticks aren't tinted (in place).
      const aS = AX.frame.ambientSky, aG = AX.frame.ambientGround;
      for (let i = 0; i < 3; i++) { aS[i] = AX._ltBase.ambientSky[i]; aG[i] = AX._ltBase.ambientGround[i]; }
    }
  }

  // Floodlights: EVERY track has them (see buildTrackLights); they're fed to the
  // shader whenever the scene is dark enough to read them — night, dusk, or dawn
  // on any circuit, or a night-default track in default mode. In bright day the
  // sun dominates so they're left off (no washed-out daylight pools).
  const _floodActive = AX.raceTimeOfDay === "night" || AX.raceTimeOfDay === "dusk" || AX.raceTimeOfDay === "dawn" ||
    (AX.raceTimeOfDay === "default" && AX.track.def.night);
  if (_floodActive) {
    // Rebuild if empty (not just undefined): a light set built before the track
    // centreline finished is empty; retry until it yields lights. Tracks always
    // produce a full set once complete, so this self-heals in a frame.
    if (!AX.track._lights || AX.track._lights.length === 0) AX.track._lights = buildTrackLights(AX.track);
    // Time-dependent floodlights: brightness + COLOUR ramp with sun elevation.
    // At twilight (sun near/just below horizon) the lamps are dim and WARM, as if
    // freshly switched on / still warming up; by deep night they reach full
    // brightness and cool to their neutral tint. Smooth, no hard dusk/night step.
    // The dusk sky sits at a near-constant ~10-20 degree sun elevation for the
    // WHOLE session (see the dusk sunDir above) — the old (0.07-sy)/0.22 ramp
    // pinned at nightF=0 the entire time, floundering at a fixed 0.34 floor no
    // matter how bright that golden-hour sky still was. Lamps that bright, fed
    // through the wet-road SSR mirror, blew out the whole reflected scene.
    // Full "night" sessions deliberately keep sunY slightly positive for the sky
    // glow (see _floodEmit below) — ramp by elevation ONLY for dusk/dawn, and
    // stay at full brightness for a real night session, same branching as
    // _floodEmit uses.
    const _sy = AX.frame.sunDir ? AX.frame.sunDir[1] : -1;
    const nightF = (AX.raceTimeOfDay === "dusk" || AX.raceTimeOfDay === "dawn")
      ? clamp(1 - _sy * 6, 0, 1)                       // 0 = bright dusk sky, 1 = sun at/below horizon
      : 1;                                              // night / default-night: full ramp
    // Overall dimmer: the per-lamp base intensities (floodColor) are tuned as
    // raw physical HDR values (16-20) — at full ceiling they overpowered the
    // scene (blown-out wet-road SSR mirror, washed neon night city, blown-white
    // barrier walls beside close-mounted masts). Cap the ceiling well below 1.0,
    // on top of the twilight ramp above.
    const lvl  = (0.05 + 0.95 * nightF) * LT.lampLevel;
    const warmth = (1 - nightF);                       // 1 at twilight → 0 deep night
    const floodScale = [lvl * (1 + warmth * 0.14), lvl, lvl * (1 - warmth * 0.22)];
    setFrameLights(AX.camEye, floodScale);
    appendCarTailLights();
  } else {
    AX.frame.lights = null;
  }
  // Studio rig override: replaces the session lamps with the inspection ring.
  if (isStudioActive()) {
    const rig = buildStudioRig();
    if (rig) AX.frame.lights = rig;
  }
  // GLOWING FOG driver: on whenever lamps are lit, swelling with haze so a
  // fog-weather night is the money shot while a clear night keeps only a hint.
  // Day / lights-off => 0, so daytime fog stays a pure sun tint. Faded by SUN
  // BRIGHTNESS (not elevation - the night key stays above the horizon for sky
  // glow): at dawn/dusk the sun in-scatter already lights the mist, and lamp
  // glow on top blew the dawn mist band out.
  const _lfSun = AX.frame.sunColor ? Math.max(AX.frame.sunColor[0], AX.frame.sunColor[1], AX.frame.sunColor[2]) : 1;
  const _lfGate = clamp((0.55 - _lfSun) / 0.30, 0, 1);
  AX.frame.lampFog = AX.frame.lights ? Math.min(0.9, LT.lampFogBase + LT.lampFogHaze * (AX.frame.groundMist || 0)) * _lfGate : 0;
  // Shader-side tunables ride along on the frame (glx begin() uploads them).
  AX.frame.tune = LT;

  if (AX.dbgCam) {
    const bf = AX.frame.fogDensity;
    AX.frame.fogDensity = bf * (AX.dbgCam.fog != null ? AX.dbgCam.fog : 0.15);
    GLX.begin(AX.frame);
    AX.frame.fogDensity = bf;
  } else GLX.begin(AX.frame);
  M4.invertTo(_mInvVP, _mVP);
  AX.frameSky.invViewProj = _mInvVP;
  AX.frameSky.lightning = AX._ltFlash || 0;
  GLX.drawSky(AX.frameSky);

  const night = AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && AX.track.def.night);
  // (`wet` is already declared above in the sky/lightning block)
  // Per-surface materials drive the GGX specular term.
  // Wet weather: rain films lower effective roughness dramatically — road becomes
  // mirror-like, cars and barriers pick up sharper reflections.
  // Base floor first (under everything) — fills the void on street circuits (no
  // terrain ribbon) and the far infield/horizon on open circuits. No detail noise
  // so the huge plane stays flat and recedes into fog.
  if (!AX.hideMeshes.terrain && AX.track.meshes.floor) GLX.draw(AX.track.meshes.floor, MAT_IDENT,
    night ? { emissive: 0.14, roughness: 0.98, specular: 0.05 }
          : { roughness: 0.98, specular: 0.05 });
  if (!AX.hideMeshes.terrain) GLX.draw(AX.track.meshes.terrain, MAT_IDENT,
    night ? { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0.42 }
          : { roughness: 0.97, specular: 0.06, detail: 0.42 });
  if (!AX.hideMeshes.road) GLX.draw(AX.track.meshes.road, MAT_IDENT,
    wet   ? (night ? { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0.06 }
                   : { roughness: 0.14, specular: 0.85, detail: 0.06 })
          : (night ? { emissive: 0.09, roughness: 0.85, specular: 0.20, detail: 0.22 }
                   : { roughness: 0.85, specular: 0.20, detail: 0.22 }));
  if (!AX.hideMeshes.startline && AX.track.meshes.startline) GLX.draw(AX.track.meshes.startline, MAT_IDENT,
    wet   ? { roughness: 0.16, specular: 0.80, detail: 0 }
          : (night ? { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0 }
                   : { roughness: 0.80, specular: 0.22, detail: 0 }));
  // Prop emissive (lit windows / signage / neon) drives how strongly the
  // buildings glow after dark. A full night session goes to full emissive
  // REGARDLESS of the palette's sun elevation — many night palettes keep the sun
  // above the horizon for the sky glow (sunY≈0.25), which previously pinned the
  // ramp near 0.10 and left the glowing-glass towers reading as dark boxes.
  // Dusk/dawn ramp by the (genuinely low) sun elevation; day stays dark.
  const _sunY = AX.frame.sunDir ? AX.frame.sunDir[1] : (night ? -1 : 1);
  const _floodEmit = LT.floodEmitMul * (
    (AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && AX.track.def.night)) ? 0.78
      : (AX.raceTimeOfDay === "dusk" || AX.raceTimeOfDay === "dawn")
        ? Math.min(0.70, 0.05 + 0.58 * clamp(1 - _sunY * 6, 0, 1))
        : 0);
  _lastFloodEmit = _floodEmit;   // exposed via __apex.lightState()
  // Per-lamp lens CORONAS: soft additive billboards at every active lamp — each
  // light gets a visible halo (colored per lamp) without inflating bloom.
  // (Skipped for the studio rig — its lamps have no fixtures, and floating
  // glow-cone billboards ringing the car read as artifacts.)
  // Corona strength trimmed 0.20 -> 0.12: the lens-glare halos are drawn from
  // frame.lights COLOURS (already time-of-day scaled) but the billboard str was
  // an independent knob — with the point-light energy dimmed, the untouched
  // coronas became the brightest thing left at every mast. Now the LENS GLARE
  // tuner slider (LT.glareStr, default 0.12).
  if (AX.frame.lights && !isStudioActive()) GLX.drawGlow(AX.frame.lights, LT.glareStr);
  if (!AX.hideMeshes.props) GLX.drawChunked(AX.track.meshes.props, MAT_IDENT,
    wet   ? (night ? { emissive: Math.min(0.80, _floodEmit), roughness: 0.55, specular: 0.38 }
                   : { roughness: 0.55, specular: 0.38 })
          : (night ? { emissive: _floodEmit, roughness: 0.85, specular: 0.20 }
                   : { roughness: 0.85, specular: 0.20 }));
  // Building glass: a low-roughness reflective pass so the lit shader mirrors the
  // sky in the windows (real, view-dependent reflection). Only populated for day
  // builds; empty at night (lit windows live in the emissive props mesh).
  if (!AX.hideMeshes.props && AX.track.meshes.glass) GLX.draw(AX.track.meshes.glass, MAT_IDENT,
    { roughness: 0.13, specular: 0.82, metalness: 0.12, clearcoat: 1.0 });
  // Water (lakes/marina/sea): low roughness so the lit shader's env term mirrors
  // the live sky + sun glint — reflective by day, warm at dusk, dark by night.
  // A touch glossier (calmer) when not raining; a little rougher in the wet.
  if (!AX.hideMeshes.props && AX.track.meshes.water) GLX.draw(AX.track.meshes.water, MAT_IDENT,
    wet ? { roughness: 0.16, specular: 0.85, metalness: 0.05 }
        : { roughness: 0.10, specular: 0.92, metalness: 0.05 });
  if (!AX.hideMeshes.gate) GLX.draw(AX.track.meshes.gate, MAT_IDENT,
    wet ? { roughness: 0.32, metalness: 0.35, specular: 0.65 }
        : { roughness: 0.45, metalness: 0.30, specular: 0.50 });

  // skid marks drawn oldest-first (newest on top). When buffer is full the
  // oldest entry is at skidIdx; before that all live entries are 0..skidActive-1.
  // Cull marks beyond ~170 m of the camera: once the ring buffer fills this was
  // 120 draw calls every frame regardless of where the trail sat on the lap.
  {
    const ex = AX.camEye[0], ez = AX.camEye[2], SKID_CULL = 170 * 170;
    const full = AX.skidActive >= MAX_SKID, cnt = full ? MAX_SKID : AX.skidActive;
    for (let i = 0; i < cnt; i++) {
      const m = full ? skidMarks[(AX.skidIdx + i) % MAX_SKID] : skidMarks[i];
      const dx = m[12] - ex, dz = m[14] - ez;
      if (dx * dx + dz * dz > SKID_CULL) continue;
      GLX.drawMark(m, 0.6, 2.2);
    }
  }

  // cars — skip AI cars more than 550 m of track arc from the player (past fog)
  const hidePlayerCar = !AX.dbgCam && (AX.state === "race" || AX.state === "count") &&
    CAM_MODES[AX.camMode].id === "cockpit";   // don't draw the car you're sitting in
  // Cockpit view still draws a first-person RIG (wheel/halo/mirrors) + the car's
  // shadow — only the body mesh is skipped. Bumper hides everything as before.
  const cockpitRigOnly = hidePlayerCar && CAM_MODES[AX.camMode].id === "cockpit";
  for (const c of AX.cars) {
    if (c.isPlayer && hidePlayerCar && !cockpitRigOnly) continue;
    if (!c.isPlayer && AX.player) {
      const ds = Math.abs(c.s - AX.player.s);
      if (Math.min(ds, AX.track.total - ds) > 550) continue;
    }
    // Interpolate the arc/lateral position between the last two physics steps so
    // the car renders smoothly between fixed steps (no judder on high-refresh).
    const cS = lerpS(c.rPrevS, c.s, AX.renderAlpha);
    const cX = (c.rPrevX === undefined) ? c.x
             : c.rPrevX + (c.x - c.rPrevX) * AX.renderAlpha;
    Tracks.sample(AX.track, cS, smp2);
    // Smooth RENDERED lateral position. Physics c.x stays exact (used for walls,
    // collisions, racing-line assist). Only the mesh position is low-passed so
    // Frenet-projection noise doesn't appear as visible left-right wobble.
    // Player rate 30 (≈0.1 s lag) is fast enough to feel instant but cuts the
    // per-frame projection noise; AI rate 16 kills the harsher collision jitter.
    if (c.xVis === undefined) c.xVis = cX;
    else c.xVis = damp(c.xVis, cX, c.isPlayer ? 30 : 16, dt);
    let renderX = c.xVis;
    // banking: sit the car ON the banked surface (raise it by the local lift)
    // instead of the flat centreline, so it doesn't float/sink in the corner.
    const bankC = Tracks.banking(AX.track, cS, renderX);
    tmpP[0] = smp2.p[0] + smp2.r[0] * renderX;
    tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);
    tmpP[2] = smp2.p[2] + smp2.r[2] * renderX;
    // yaw the forward/right around up by yawVis
    const cy = Math.cos(c.yawVis || 0), sy = Math.sin(c.yawVis || 0);
    for (let i = 0; i < 3; i++) {
      tmpF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
      tmpR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
    }
    tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
    tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
    tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
    // Pitch: rotate forward+up around the right axis by pitchVis (positive = nose up).
    // This gives throttle-squat (nose lifts) and brake-dive (nose dips) without
    // moving the contact point — it's purely a mesh animation.
    if (c.pitchVis) {
      const cp = Math.cos(c.pitchVis), sp = Math.sin(c.pitchVis);
      for (let i = 0; i < 3; i++) {
        const f = tmpF[i], u = tmpU[i];
        tmpF[i] = f * cp + u * sp;
        tmpU[i] = u * cp - f * sp;
      }
    }
    // Cornering lean (render-only): roll the chassis toward the OUTSIDE of the
    // corner, proportional to lateral g, so the car visibly leans into turns like
    // a real F1 car. The body already follows the road slope via the tangent
    // basis, so only roll (not gradient pitch) is added here. Player uses its real
    // centripetal accel (speed·yawRate); AI uses curvature·speed².
    // (curvature sign is opposite the yaw-rate sign — see the racing-line code,
    // racingLine = -k·130 toward the inside — so the AI term is negated to lean
    // outward like the player.)
    const aLat = c.isPlayer ? c.speed * (c.yawRateCur || 0)
                            : -c.speed * c.speed * (c.kCur || 0);
    const rollTgt = clamp(aLat / LAT_MAX, -1, 1) * BODY_ROLL_MAX;
    c.rollVis = (c.rollVis === undefined) ? rollTgt : damp(c.rollVis, rollTgt, 6, dt);
    // roll the right/up basis about the forward axis: road bank + cornering lean.
    const rollTot = (bankC && bankC.roll ? bankC.roll : 0) + (c.rollVis || 0);
    if (rollTot) {
      const cr = Math.cos(rollTot), sr = Math.sin(rollTot);
      for (let i = 0; i < 3; i++) {
        const r = tmpR[i], u = tmpU[i];
        tmpR[i] = r * cr + u * sr;
        tmpU[i] = u * cr - r * sr;
      }
    }
    basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
    GLX.drawShadow(tmpMat, 2.4, 5.8);
    // Glossy automotive paint; wet adds a water film (sharper highlights, lower roughness).
    const paint = carPaintMat(wet
      ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY)
      : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY));
    // Cockpit view: draw the interior with a STABILIZED basis — the plain track
    // tangent/right at the car position (+bank dy already in tmpP), WITHOUT the
    // body's visual yaw/pitch/roll/lean. Those rotate the interior relative to
    // the fixed onboard camera, swinging dark bodywork across the frame ("black
    // box when braking/slowing"). This frame matches the camera exactly, so the
    // cockpit is rock-steady. (Shadow above still uses the real animated tmpMat.)
    if (c.isPlayer && cockpitRigOnly) {
      const sR = smp2.r, sF = smp2.t;
      _cockU[0] = sR[1]*sF[2] - sR[2]*sF[1];
      _cockU[1] = sR[2]*sF[0] - sR[0]*sF[2];
      _cockU[2] = sR[0]*sF[1] - sR[1]*sF[0];
      basisMat(sR, _cockU, sF, tmpP, _cockMat);
      drawCockpitRig(c, _cockMat, dt, paint);
      continue;
    }
    // Player: body-only mesh + animated (spinning/steering) wheels. Others (and
    // the player when a glb model is loaded) draw the full mesh with baked wheels.
    const body = c.isPlayer ? playerBodyMesh(c.team) : null;
    if (body) {
      GLX.draw(body, tmpMat, paint);
      drawPlayerWheels(c, tmpMat, dt, { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: night ? 0.12 : 0 });
    } else {
      GLX.draw(teamMesh(c.team), tmpMat, paint);
      // AI brake glow: rings at the four baked wheel positions (outer face).
      const aiHeat = c.brakeHeat || 0;
      if (aiHeat > 0.08) {
        for (let w = 0; w < WHEELS.length; w++) {
          const wd = WHEELS[w];
          const tx = wd.x + (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
          const W = _ringWorld;
          W.set(tmpMat);
          W[12] += W[0] * tx + W[4] * wd.y + W[8] * wd.z;
          W[13] += W[1] * tx + W[5] * wd.y + W[9] * wd.z;
          W[14] += W[2] * tx + W[6] * wd.y + W[10] * wd.z;
          GLX.draw(getBrakeRing(), W, {
            emissive: 0.30 + 0.70 * aiHeat, roughness: 0.9, specular: 0,
            alpha: Math.min(1, 0.25 + aiHeat * 0.9), noAlphaWrite: true,
          });
        }
      }
    }
    // FIA rain-light strobe: every car flashes its rear LED in the wet (~4 Hz,
    // 55% duty). Overlaid on the baked LED panel; the HDR-red quad blooms.
    if (wet && ((AX.raceT * 4.4) % 1) < 0.55) {
      const W = _ringWorld;
      W.set(tmpMat);
      // 15 mm behind the baked LED face (z -2.60) — coplanar quads z-fight.
      W[12] += W[4] * 0.50 - W[8] * 2.615;
      W[13] += W[5] * 0.50 - W[9] * 2.615;
      W[14] += W[6] * 0.50 - W[10] * 2.615;
      GLX.draw(getRainLight(), W, { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true });
    }
    // BOOST: blue-white plasma flame + strobing rear ERS strip while deploying
    // (any time of day); the strip glows steady dim while boost is armed.
    if (c.isPlayer && c.boostOn) {
      const dep = c.energy > 0.01;
      const fl = 0.65 + 0.35 * Math.sin(AX.raceT * 47.0 + Math.sin(AX.raceT * 19.0) * 4.0);
      const W = _ringWorld;
      if (dep && c.speed > 5) {
        // In the clear "pocket" between the rain-light LED plane (z -2.60) and
        // the diffuser rear face (z -2.70): nothing occludes it from any rear
        // camera — the housing/pipe are all forward of it, the diffuser is a
        // backdrop behind it.
        W.set(tmpMat);
        W[12] += W[4] * 0.40 - W[8] * 2.66;
        W[13] += W[5] * 0.40 - W[9] * 2.66;
        W[14] += W[6] * 0.40 - W[10] * 2.66;
        GLX.draw(getBoostFlame(), W, { emissive: 1.0, roughness: 1, specular: 0, alpha: 0.45 + 0.5 * fl, noAlphaWrite: true });
      }
      W.set(tmpMat);
      W[12] += W[4] * 0.605 - W[8] * 2.615;
      W[13] += W[5] * 0.605 - W[9] * 2.615;
      W[14] += W[6] * 0.605 - W[10] * 2.615;
      GLX.draw(getErsLight(), W, { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true,
        alpha: dep ? (0.5 + 0.5 * (Math.sin(AX.raceT * 28.0) > 0 ? 1 : 0.2)) : 0.35 });
    }
    // Exhaust heat glow: night-only flicker behind the tailpipe on throttle.
    if (night && c.isPlayer && (c.exhaustPop || 0) > 0.05) {
      const fl = 0.6 + 0.4 * Math.sin(AX.raceT * 41.0 + Math.sin(AX.raceT * 23.0) * 3.0);
      const W = _ringWorld;
      W.set(tmpMat);
      // 3 cm forward of the boost quad in the same clear pocket (see above) —
      // the old z -2.24 was hidden behind the rain-light housing from chase cam.
      W[12] += W[4] * 0.40 - W[8] * 2.63;
      W[13] += W[5] * 0.40 - W[9] * 2.63;
      W[14] += W[6] * 0.40 - W[10] * 2.63;
      GLX.draw(getExhaustFlame(), W, { emissive: 1.0, roughness: 1, specular: 0, alpha: (0.30 + 0.55 * fl) * c.exhaustPop, noAlphaWrite: true });
    }
    if (c.isPlayer && AX.state === "race") {
      const skid = c.skidIntensity || 0;
      if ((skid > 0.25 || c.offroad) && c.speed > 10) {
        AX.skidFrameT--;
        if (AX.skidFrameT <= 0) {
          AX.skidFrameT = 5;
          skidMarks[AX.skidIdx].set(tmpMat);
          AX.skidIdx = (AX.skidIdx + 1) % MAX_SKID;
          if (AX.skidActive < MAX_SKID) AX.skidActive++;
        }
      } else {
        AX.skidFrameT = 0;
      }
    }
  }
  // Ghost car (time trial): replay best-lap position as a bright emissive silhouette
  if (AX.timeTrial && AX.player && (AX.state === "race" || AX.state === "count")) {
    const g = Ghost.at(AX.player.lapTime);
    // Skip the ghost while it overlaps the player — at the lap start it sits on
    // your exact grid position, and in the cockpit/onboard cams its bodywork
    // fills the camera as a black box until you pull away ("starts dark, clears
    // after throttle"). Once there's real separation it draws normally.
    let gDs = Infinity;
    if (g && !g.done) { const d = Math.abs(g.s - AX.player.s); gDs = Math.min(d, AX.track.total - d); }
    if (g && !g.done && gDs > 3.0) {
      Tracks.sample(AX.track, g.s, smp2);
      tmpP[0] = smp2.p[0] + smp2.r[0] * g.x;
      tmpP[1] = smp2.p[1];
      tmpP[2] = smp2.p[2] + smp2.r[2] * g.x;
      for (let i = 0; i < 3; i++) { tmpF[i] = smp2.t[i]; tmpR[i] = smp2.r[i]; }
      tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
      tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
      tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
      basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
      GLX.draw(teamMesh(AX.player.team), tmpMat, { emissive: 0.60, roughness: 0.20, metalness: 0.08, specular: 0.35 });
    }
  }

  // Per-time cinematic grade + bloom. DRAMATIC = high contrast, deep shadows,
  // bloom ONLY on genuinely bright sources (floodlights, sun disc, neon) against
  // a darker frame — not a low-threshold wash that milks the whole image. Strong
  // teal-orange split-tone gives cinematic colour separation without brightening.
  let _grade, _bloom = 0.55, _thresh = 0.78;
  if (AX.raceTimeOfDay === "night" || (AX.raceTimeOfDay === "default" && AX.track.def.night)) {
    _grade = { shadow: [0.86, 0.94, 1.14], hi: [1.07, 1.00, 0.92], str: 0.30 };
    // Moderate bloom, HIGH threshold: only the genuinely bright HDR sources
    // (lamps, neon, lit windows >1.0) bloom into halos — the dark scene between
    // them stays dark. Dialled back from the previous heavy bloom. Neon-heavy
    // city circuits (street/modern) get LESS bloom + a higher threshold so the
    // dense neon doesn't over-glow; open circuits keep more bloom for the lamps.
    const _neonCity = AX.track.def.theme === "street_night" || AX.track.def.theme === "modern";
    _bloom = _neonCity ? 0.48 : 0.55;
    _thresh = 0.97;
  } else if (AX.raceTimeOfDay === "dusk") {
    _grade = { shadow: [0.88, 0.97, 1.12], hi: [1.13, 1.02, 0.84], str: 0.36 };
    // Higher threshold so the low sun + lifted exposure + stronger god-rays don't
    // bloom the whole hazy horizon into a wash — only the sun/glints glow.
    _bloom = 0.52; _thresh = 0.82;
  } else if (AX.raceTimeOfDay === "dawn") {
    _grade = { shadow: [0.90, 0.96, 1.10], hi: [1.12, 1.00, 0.90], str: 0.30 };
    _bloom = 0.52; _thresh = 0.82;
  } else {
    // Bright day: a punchier teal-shadow / warm-highlight split with real bloom
    // on highlights so chrome, kerbs, glass and bright sky sparkle instead of
    // reading flat. (Old str 0.15 / bloom 0.50 was the washed-out look.)
    _grade = { shadow: [0.90, 0.98, 1.13], hi: [1.13, 1.04, 0.87], str: 0.34 };
    _bloom = 0.60; _thresh = 0.82;
  }
  // (Lamp volumetric beam/halo cones removed — they read as hazy light shafts;
  // the lamps now carry the scene through brighter point-light pools instead,
  // and dropping the per-lamp glow draw saves frame time on dense night grids.)
  // Volumetric sun shafts: dramatic at dawn/dusk (low sun), moderate by day,
  // off at night (sun below horizon). Low-sun factor drives the big boost.
  const _grSunY = AX.frame.sunDir ? AX.frame.sunDir[1] : -1;
  const _grLow = clamp(1 - _grSunY * 1.4, 0, 1);     // ~1 at dawn/dusk, ~0.2 at noon
  // Stronger base so the low-sun god-ray shafts at dawn/dusk are a signature
  // dramatic cue (was 0.28); still tapers to a moderate amount by noon.
  // Atmospheric haze gate for volumetric in-scatter (ground mist dominates;
  // wet + cloud add). Sun shafts catch more in haze; lamp beams only show in it.
  const _mist = clamp((AX.frame.groundMist || 0) * 0.9 + (AX.frame.wetness || 0) * 0.22
                      + (AX.frame.cloud || 0) * 0.12, 0, 1);
  // Gate by the sun's actual BRIGHTNESS too: at night the key is dim moonlight
  // held above the horizon for sky glow, and ungated it marched faint stripey
  // "moon rays" through the cloud gaps.
  const _sunLumGR = AX.frame.sunColor ? Math.max(AX.frame.sunColor[0], AX.frame.sunColor[1], AX.frame.sunColor[2]) : 1;
  const _sunGateGR = clamp((_sunLumGR - 0.35) / 0.45, 0, 1);
  const _gr = (_grSunY > 0.02 ? (0.38 + 0.55 * _grLow) : 0) * (1 + 0.25 * _mist) * _sunGateGR * LT.grMul;
  // Night lamp volumetrics: visible light beams in the air from the lamps when
  // floodlights are on (frame.lights) and there's haze to catch them. Scales with
  // haze — subtle on a near-dry night, dramatic in fog/rain. Additive + mist-gated
  // in the shader, so it never greys out the dark night.
  // Always a subtle beam glow whenever lamps are on (clear night air still
  // scatters a little), swelling with haze/rain into full volumetric shafts —
  // and coloured per lamp, so neon-spill lights throw coloured beams.
  const _lampVol = AX.frame.lights ? clamp(LT.lampVolBase + LT.lampVolHaze * _mist, 0, LT.lampVolCap) : 0;
  // Resolve the HDR scene (bloom + tonemap + grade + vignette) to the screen.
  // SSAO grounds the scene (creases/contacts) at every time of day.
  // Contact shadows only when the sun is meaningfully above the horizon.
  const _cs = _grSunY > 0.05 ? 0.5 : 0;
  // Wet-road screen-space reflection of the scene: runs at ALL times of day so a
  // wet road mirrors the world — buildings/barriers/cars by day, neon + glowing
  // lamp heads at night — on top of the in-shader sky env reflection. Driven purely
  // by wetness (road-mask + Fresnel + distance-fade in the shader guard it).
  // Wet: full mirror. Dry night: a subtle sheen — clean racing tarmac still
  // reflects the lamps/neon a little at grazing angles.
  // Wet: full mirror. Dry night: lamp/neon sheen. Dry DAY: a faint floor so
  // clean tarmac still mirrors towers and sky (real asphalt is never fully
  // matte at grazing angles).
  // Dry-night floor lowered 0.16 -> 0.08: at 0.16 the mirror substitution ran at
  // ~80% of full wet strength, so a DRY night road flanked by lit towers (Baku /
  // Vegas start straight) rendered as a bright silver mirror of the buildings —
  // the single biggest "night is too bright" driver on city circuits. 0.08 keeps
  // a subtle lamp/neon sheen (fade is quadratic below 0.20) without the mirror.
  // Now the DRY NIGHT SHEEN tuner slider (LT.ssrDryNight, default 0.08).
  const _ssr = ((AX.frame.wetness || 0) > 0.01) ? AX.frame.wetness * LT.ssrWetMul
             : (AX.frame.lights ? LT.ssrDryNight : LT.ssrDryDay);
  // Perf: skip the SSAO pass (+ its two blur passes) once the sun is well below
  // the horizon. Night ambient is near-black, so the AO darkening is invisible
  // anyway — and night street grids are where the frame budget is tightest.
  const _ao = _grSunY > -0.04 ? 0.95 : 0;
  if (_grade) _grade.str = (_grade.str || 0) * LT.gradeStr;   // GRADE STRENGTH tuner slider
  GLX.present({ exposure: AX.frame.exposure * LT.exposureMul, bloom: _bloom * LT.bloomMul,
    threshold: clamp(_thresh + LT.threshOff, 0.4, 1.2), grade: _grade, ssao: _ao,
    godray: _gr, contact: _cs, reflect: _ssr, lampVol: _lampVol, mist: _mist, tune: LT });
  if (AX.raceWeather === "rain" && AX.rainDrops.length) drawRain(dt);  // incl. lightning veil
}


return {
  init, camVantage, render, floodColor, buildTrackLights, setFrameLights,
  teamMeshes, playerBodies,
  teamMesh, playerBodyMesh, drawPlayerWheels, buildCarData, loadCarModel,
  LT, TUNE_DEFS, _ltStore, ltKey, setLightTune, persistLightTune, applyLightTune,
  getFloodEmit: () => _lastFloodEmit,
};
})();
