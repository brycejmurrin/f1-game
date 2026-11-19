const BodyAttitude = (function () {
  "use strict";

let G = null;
const LS_KEY = "apex26.bodyAttitude";
let enabled = true;

const PITCH_OMEGA = 9;
const PITCH_GAIN  = 0.00095;
const PITCH_MAX   = 0.024;
const ROLL_OMEGA  = 7;
const ROLL_MAX    = 0.055;
const ROLL_LIM    = 0.075;
const LAT_MAX     = PhysicsConsts.LAT_MAX;
const HEAVE_OMEGA = 20;
const HEAVE_GAIN  = 0.55;
const HEAVE_AERO_FLOOR = 0.35;
const HEAVE_MAX   = 0.05;
const TELEPORT_DY = 1.5;
const MAX_DT      = 0.05;

const AERO_DROP   = 0.012;
const AERO_RAKE   = 0.003;

const PLANK_Y = 0.04, PLANK_FRONT_Z = 1.3, PLANK_REAR_Z = 1.9;
const PLANK_STOP  = 0.008;
const PLANK_TOUCH = 0.014;
const PLANK_RANGE = 0.02;

const KERB_HOLD_M = 6;
const KERB_HEAVE_V = 1.2;
const KERB_ROLL_V = 0.6;
const KERB_OFF = 0.45;
const KERB_RIDGE_M = 0.35;
const KERB_SHIVER_H = 0.004;
const KERB_SHIVER_R = 0.004;

const ZERO = Object.freeze({ pitch: 0, roll: 0, heave: 0 });
const clamp = M4.clamp;
let decayDt = NaN, pitchDecay = 1, rollDecay = 1, heaveDecay = 1;

function crit(s, to, omega, dt, e) {
  const c1 = s.x - to;
  const c2 = s.v + omega * c1;
  const t = c1 + c2 * dt;
  s.x = to + t * e;
  s.v = (c2 - omega * t) * e;
}

function ridge(i) {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 2 * (h - Math.floor(h)) - 1;
}

function seed(c) {
  c._ba = { p: { x: 0, v: 0 }, r: { x: 0, v: 0 }, z: { x: 0, v: 0 }, ygV0: 0, prevYg: null, kerbM: 0, sh: 0 };
  c.baPitch = 0; c.baRoll = 0; c.baHeave = 0; c.baScrape = 0;
  return c._ba;
}

const _out = { pitch: 0, roll: 0, heave: 0 };
function update(c, groundY, dt, ygV, dfFrac, vFrac) {
  if (!c) return ZERO;
  const s = c._ba || seed(c);
  const ygVSafe = ygV || 0;
  if (!enabled) {
    s.p.x = s.p.v = s.r.x = s.r.v = s.z.x = s.z.v = 0;
    s.ygV0 = ygVSafe; s.prevYg = groundY; s.kerbM = 0;
    c.baPitch = 0; c.baRoll = 0; c.baHeave = 0; c.baScrape = 0;
    return ZERO;
  }
  const dtc = Math.max(0, Math.min(dt || 0, MAX_DT));
  if (dtc !== decayDt) {
    pitchDecay = Math.exp(-PITCH_OMEGA * dtc);
    rollDecay = Math.exp(-ROLL_OMEGA * dtc);
    heaveDecay = Math.exp(-HEAVE_OMEGA * dtc);
    decayDt = dtc;
  }
  const vF = vFrac > 0 ? (vFrac < 1 ? vFrac : 1) : 0;
  const spd = Math.abs(c.speed || 0);

  if (s.prevYg == null || Math.abs(groundY - s.prevYg) > TELEPORT_DY) {
    s.z.x = 0; s.z.v = 0; s.ygV0 = ygVSafe;
    s.kerbM = c.onKerb ? KERB_HOLD_M : 0;
  }
  const wasOn = s.kerbM > 0;
  if (c.onKerb) s.kerbM = KERB_HOLD_M;
  else if (wasOn) s.kerbM = Math.max(0, s.kerbM - spd * dtc);
  const onKerb = s.kerbM > 0;
  if (onKerb !== wasOn && vF > 0) {
    const kick = (onKerb ? 1 : -KERB_OFF) * vF;
    s.z.v += KERB_HEAVE_V * kick;
    s.r.v += KERB_ROLL_V * kick * ((c.x || 0) < 0 ? -1 : 1);
  }

  const ax = c.human ? (c.axEstSm || 0) : (c.corridorAccel || 0);
  const pitchT = clamp(-ax * PITCH_GAIN, -PITCH_MAX, PITCH_MAX);
  crit(s.p, pitchT, PITCH_OMEGA, dtc, pitchDecay);

  const aLat = c.human ? (c.speed || 0) * (c.yawRateCur || 0)
                          : -(c.speed || 0) * (c.speed || 0) * (c.kCur || 0);
  const rollT = clamp(aLat / LAT_MAX, -1, 1) * ROLL_MAX;
  crit(s.r, rollT, ROLL_OMEGA, dtc, rollDecay);

  const df = dfFrac > 0 ? (dfFrac < 1 ? dfFrac : 1) : 0;
  s.z.v -= (ygVSafe - s.ygV0) * HEAVE_GAIN * (1 - (1 - HEAVE_AERO_FLOOR) * df);
  s.ygV0 = ygVSafe;
  crit(s.z, 0, HEAVE_OMEGA, dtc, heaveDecay);
  s.prevYg = groundY;
  let heave = HEAVE_MAX * Math.tanh(s.z.x / HEAVE_MAX) - AERO_DROP * df;
  const pitch = clamp(s.p.x + AERO_RAKE * df, -PITCH_MAX, PITCH_MAX);
  const roll = clamp(s.r.x, -ROLL_LIM, ROLL_LIM);

  const clear = PLANK_Y + heave + Math.min(-PLANK_FRONT_Z * pitch, PLANK_REAR_Z * pitch);
  const scrape = clamp((PLANK_TOUCH - clear) / PLANK_RANGE, 0, 1);
  if (clear < PLANK_STOP) heave += PLANK_STOP - clear;

  let shH = 0, shR = 0;
  if (onKerb && vF > 0) {
    s.sh = (s.sh + spd * dtc) % 1e4;
    const i = Math.floor(s.sh / KERB_RIDGE_M);
    shH = KERB_SHIVER_H * vF * ridge(i);
    shR = KERB_SHIVER_R * vF * ridge(i + 7919);
  }

  c.baPitch = pitch; c.baRoll = roll; c.baHeave = heave; c.baScrape = scrape;
  _out.pitch = pitch; _out.roll = roll + shR; _out.heave = heave + shH;
  return _out;
}

function reset(c) {
  if (c) { seed(c); return; }
  const cars = (G && G.cars) || [];
  for (const cc of cars) seed(cc);
}

function offsets(c) {
  c = c || (G && G.player);
  if (!c) return { pitch: 0, roll: 0, heave: 0, enabled };
  return { pitch: c.baPitch || 0, roll: c.baRoll || 0, heave: c.baHeave || 0, scrape: c.baScrape || 0, enabled };
}

function setEnabled(v) {
  enabled = !!v;
  GameStore.store.rawSet(LS_KEY, enabled ? "1" : "0");
  if (!enabled) reset();
  return status();
}

function active() { return enabled; }
function status() { return { enabled, offsets: offsets() }; }

function create(ctx) {
  Log.info("game", "BodyAttitude.create");
  G = ctx;
  enabled = GameStore.store.raw(LS_KEY) !== "0";
  return { update, reset, offsets, setEnabled, active, status };
}

return { create, update, reset, offsets, setEnabled, active, status };
})();
Object.freeze(BodyAttitude);
