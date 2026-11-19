const GarageScene = (function () {
  "use strict";

let _gfx = null;
function init(gfx) { Log.info("game", "GarageScene.init"); if (_gfx && _gfx !== gfx) release(); _gfx = gfx; if (typeof GarageCrew !== "undefined") GarageCrew.init(gfx); }

const BACKDROP = [0.035, 0.038, 0.046];

const SKYLIGHT = [0.55, 0.55, 0.58];
const AMB_SKY = [0.200, 0.215, 0.250], AMB_GROUND = [0.130, 0.125, 0.118];

const { HALF_W, Z_BACK, Z_DOOR, CEIL_Y, PANEL, STEEL, DARK, panelGrid, block, cyl, tube, hose, MAT, smooth, scale, rgb, css, pushMat, tile } = GaragePrims;

let shellMesh = null;
function buildShell(out, liv, L) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.55, 0.57, 0.62]);
  const dado = scale(c1, 0.45), stripe = scale(c2, 0.8);
  const panelC = [PANEL[0] + (c1[0] - PANEL[0]) * 0.12,
                  PANEL[1] + (c1[1] - PANEL[1]) * 0.12,
                  PANEL[2] + (c1[2] - PANEL[2]) * 0.12];
  const wallAt = (y) => (y < 1.4995 ? dado : y < 1.6205 ? stripe : panelC);
  const seamed = (col, u, n) => (Math.round(u * n) % 2 ? scale(col, 0.62) : col);
  const W = HALF_W;
  const walls = [
    [[-W, 0, Z_BACK], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, 1], 8],
    [[-W, 0, Z_DOOR], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, -1], 8],
    [[-W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [1, 0, 0], 9],
    [[W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [-1, 0, 0], 9],
  ];
  const BANDS = [[0, 1.50, 2], [1.50, 1.62, 1], [1.62, CEIL_Y, 4]];
  const LW = L ? GarageDress.lookWall(L, liv) : null;
  const wallBands = (o0, uVec, nu, nrm, y0Lo, y1Hi) => {
    for (const [y0, y1, nv, fixed] of LW ? LW.bands : BANDS) {
      if (y1 <= y0Lo || y0 >= y1Hi) continue;
      const a = Math.max(y0, y0Lo), b = Math.min(y1, y1Hi);
      panelGrid(out, [o0[0], o0[1] + a, o0[2]], uVec, [0, b - a, 0], nu, nv, nrm,
        LW ? () => fixed || LW.wallAt((a + b) / 2, nrm[2] > 0.5)
          : (u, v) => seamed(wallAt(a + (b - a) * v), u, nu), LW ? LW.mat : MAT.CONCRETE);
    }
  };
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (i === 1) continue;
    wallBands(w[0], w[1], w[4] * 2, w[3], 0, CEIL_Y);
  }
  const APX = TrackPit.BAY.doorW / 2, APY = TrackPit.BAY.doorH;
  for (const sx of [-1, 1])
    wallBands([sx > 0 ? APX : -W, 0, Z_DOOR], [W - APX, 0, 0], 4, walls[1][3], 0, CEIL_Y);
  wallBands([-APX, 0, Z_DOOR], [APX * 2, 0, 0], 8, walls[1][3], APY, CEIL_Y);
  const RV = 0.30, revC = scale(PANEL, 0.72);
  for (const sx of [-1, 1])
    block(out, sx * APX, APY / 2, Z_DOOR - RV / 2, 0.02, APY / 2, RV / 2, revC);
  block(out, 0, APY, Z_DOOR - RV / 2, APX, 0.02, RV / 2, revC);
  block(out, 0, 0.022, Z_DOOR - 0.10, APX, 0.022, 0.10, scale(STEEL, 0.62), MAT.METAL);
  panelGrid(out, [-W, CEIL_Y, Z_BACK], [W * 2, 0, 0], [0, 0, Z_DOOR - Z_BACK], 4, 4,
    [0, -1, 0], () => (LW ? LW.ceil : DARK));
}
function buildTruss(out, L, bay) {
  if (GarageDress.lookTruss(out, L)) return;
  for (let s = -1; s <= 1; s += 2)
    block(out, s * 2.6, CEIL_Y - 0.42, 0, 0.06, 0.06, (Z_DOOR - Z_BACK) / 2, STEEL, MAT.METAL);
  for (let i = 0; i <= 4; i++) {
    const z = Z_BACK + (Z_DOOR - Z_BACK) * (i / 4);
    block(out, 0, CEIL_Y - 0.42, z, 2.7, 0.05, 0.06, STEEL, MAT.METAL);
    if (bay) for (let s = -1; s <= 1; s += 2) block(out, s * 2.6, CEIL_Y - 0.185, z, 0.015, 0.185, 0.015, STEEL, MAT.METAL);
  }
}

const SIDES = ["nx", "px", "back", "door", "mid", "shutter", "barrier"];
const COMPOUND = [[0.85, 0.12, 0.12], [0.92, 0.80, 0.10], [0.88, 0.88, 0.90]];
function tyreStack(out, x, z, seed) {
  for (let t = 0; t < 4; t++) {
    const y = t * 0.345;
    cyl(out, x, y, z, 0.36, 0.33, [0.045, 0.045, 0.050], 14);
    cyl(out, x, y + 0.30, z, 0.305, 0.025, COMPOUND[(seed + t) % 3], 14);
  }
}
function toolChest(out, x, z, c1) {
  const sgn = x > 0 ? -1 : 1;
  block(out, x, 0.62, z, 0.36, 0.52, 0.80, scale(c1, 0.55));
  block(out, x, 1.16, z, 0.38, 0.03, 0.82, STEEL);
  for (let d = 0; d < 4; d++) {
    block(out, x + sgn * 0.37, 0.26 + d * 0.24, z, 0.012, 0.09, 0.72, scale(STEEL, 0.8));
    block(out, x + sgn * 0.39, 0.26 + d * 0.24, z, 0.010, 0.02, 0.20, scale(STEEL, 1.15));
  }
  for (let w = 0; w < 4; w++)
    cyl(out, x + (w % 2 ? 0.26 : -0.26), 0, z + (w < 2 ? 0.6 : -0.6), 0.05, 0.10, DARK, 6);
}
function buildPropsLite(g, liv) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  tyreStack(g.nx, -4.55, 5.30, 0); tyreStack(g.px, 4.55, 4.6, 2);
  toolChest(g.nx, -4.92, 3.6, c1); toolChest(g.px, 4.92, -1.5, c1);
  tyreStack(g.door, -4.3, Z_DOOR + 0.55, 1); tyreStack(g.door, 4.3, Z_DOOR + 0.55, 0);
  block(g.door, -3.15, 0.30, Z_DOOR + 0.62, 0.55, 0.03, 0.34, STEEL);
  for (let w = 0; w < 4; w++)
    cyl(g.door, -3.15 + (w % 2 ? 0.42 : -0.42), 0, Z_DOOR + 0.62 + (w < 2 ? 0.24 : -0.24), 0.05, 0.27, scale(STEEL, 0.7), 6);
  block(g.mid, 1.55, 0.12, 4.35, 0.55, 0.05, 0.12, scale(STEEL, 0.8));
  cyl(g.mid, 1.55, 0.12, 4.55, 0.03, 0.85, STEEL, 6);
}
function buildProps(g, liv) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const stack = tyreStack;
  const toolbox = (out, x, z) => GarageEquipment.toolChest(out, x, z, c1);
  toolbox(g.nx, -4.92, 3.6);
  GarageEquipment.radioRack(g.nx, -4.92, 3.6, c1, 1.19);
  stack(g.nx, -4.55, 5.30, 0); stack(g.nx, -4.55, 6.02, 2);
  block(g.nx, -5.30, 1.90, 0.6, 0.05, 0.80, 1.60, DARK);
  for (let m = 0; m < 6; m++)
    block(g.nx, -5.22, 1.45 + (m < 3 ? 0 : 0.90), 0.6 + ((m % 3) - 1) * 0.98, 0.03, 0.36, 0.46, scale(STEEL, 0.55));
  block(g.nx, -5.02, 0.86, 0.6, 0.30, 0.03, 1.30, scale(STEEL, 0.9));
  for (let s = -1; s <= 1; s += 2) cyl(g.nx, -5.02, 0, 0.6 + s * 1.15, 0.04, 0.86, STEEL, 6);
  GarageEquipment.monitorGantry(g.nx, -4.70, -1.85, c1);
  GarageEquipment.wheelGunDock(g.px, 4.85, -1.5, c1);
  GarageEquipment.noseTrolley(g.px, 4.65, 0.4, c1);
  stack(g.px, 4.55, -5.4, 1); stack(g.px, 4.55, 4.6, 2);
  cyl(g.back, 4.70, 0, -6.15, 0.03, 1.80, STEEL, 6);
  block(g.back, 4.70, 2.30, -6.12, 0.45, 0.62, 0.03, DARK);
  cyl(g.back, -4.70, 0, -6.15, 0.03, 1.80, STEEL, 6);
  block(g.back, -4.70, 2.42, -6.12, 0.52, 0.20, 0.03, DARK);
  block(g.back, -4.70, 1.92, -6.12, 0.44, 0.16, 0.025, scale(STEEL, 0.45));
  block(g.back, 0, 4.22, -6.20, 5.10, 0.035, 0.10, scale(STEEL, 0.8));
  block(g.back, 0, 4.34, -6.20, 5.10, 0.030, 0.08, scale(STEEL, 0.65));
  for (let i = -4; i <= 4; i++) {
    block(g.back, i * 1.15, 4.28, -6.20, 0.025, 0.10, 0.085, scale(STEEL, 0.55));
    if (i % 2) block(g.back, i * 1.15, 3.92, -6.17, 0.16, 0.20, 0.09, scale(STEEL, 0.45));
  }
  const shutA = scale(STEEL, 0.75), shutB = [
    STEEL[0] * 0.42 + c1[0] * 0.34, STEEL[1] * 0.42 + c1[1] * 0.34, STEEL[2] * 0.42 + c1[2] * 0.34];
  for (let i = 0; i < 11; i++)
    block(g.shutter, 0, 2.05 + i * 0.26, Z_DOOR - 0.10, HALF_W * 0.72, 0.12,
          (i % 2) ? 0.035 : 0.05, (i % 3) ? shutA : shutB, MAT.METAL);
  block(g.shutter, 0, 1.98, Z_DOOR - 0.10, HALF_W * 0.74, 0.07, 0.07, scale(STEEL, 1.1));
  for (const sx of [-1, 1]) {
    block(g.door, sx * 2.79, 2.50, Z_DOOR - 0.10, 0.09, 5.00, 0.13, scale(STEEL, 0.9));
    block(g.door, sx * 2.79, 0.10, Z_DOOR - 0.16, 0.13, 0.20, 0.26, scale(STEEL, 0.6));
  }
  for (const sd of [-1, 1]) {
    const w = sd < 0 ? g.nx : g.px, x = sd * 5.20;
    block(w, x, 3.84, 0, 0.20, 0.04, 5.00, scale(STEEL, 0.7));
    block(w, x - sd * 0.20, 4.02, 0, 0.03, 0.16, 5.00, scale(STEEL, 0.5));
    for (let i = -2; i <= 2; i++) {
      block(w, x - sd * 0.09, 3.71, i * 2.30, 0.11, 0.09, 0.05, scale(STEEL, 0.45));
      if (i % 2 === 0)
        block(w, x - sd * 0.06, 4.06, i * 2.30, 0.14, 0.18, 0.34, scale(STEEL, 0.55));
      if (i % 2 === 0) block(w, x - sd * 0.12, 3.70, i * 2.30, 0.04, 0.02, 0.12, [1.06, 1.09, 1.16]);
    }
  }

  GarageEquipment.wingRack(g.px, 4.30, 2.6, -1, c1);
  for (let i = 0; i < 1; i++) {
    const z = -1.9 + i * 0.55;
    GarageEquipment.wheelGun(g.px, 5.16, z, 1, -1, c1, 1.34);
    block(g.px, 5.28, 1.52, z, 0.03, 0.15, 0.06, STEEL, MAT.METAL);
    tube(g.px, [5.28, 1.46, z], [5.16, 1.46, z], 0.015, STEEL, 6, MAT.METAL);
  }
  block(g.px, 5.20, 1.62, -1.35, 0.06, 0.03, 1.15, STEEL);
  for (let i = 0; i < 2; i++) {
    const z = 0.9 + i * 0.8;
    GarageEquipment.hoseReel(g.px, 5.14, 2.35, z, c1);
    tube(g.px, [5.38, 2.62, z], [5.14, 2.62, z], 0.02, STEEL, 6, MAT.METAL);
    hose(g.px, [[5.14, 2.17, z], [5.10, 1.98, z + 0.10], [5.10, 1.90, z]], 0.016, DARK, 6);
    block(g.px, 5.10, 1.87, z, 0.025, 0.035, 0.025, STEEL, MAT.METAL);
  }
  for (let sh = 0; sh < 2; sh++) {
    const y = 0.95 + sh * 0.72;
    block(g.door, -4.02, y, 6.15, 1.25, 0.025, 0.22, STEEL);
    for (let bx = 0; bx < 3; bx++)
      block(g.door, -5.07 + bx * 0.86, y + 0.17, 6.15, 0.32, 0.15, 0.17,
        scale(bx % 2 ? c1 : STEEL, bx % 2 ? 0.5 : 0.75));
  }
  block(g.door, -4.02, 0.42, 6.05, 1.30, 0.04, 0.32, scale(STEEL, 0.85));
  for (let lg = -1; lg <= 1; lg += 2) cyl(g.door, -4.02 + lg * 1.15, 0, 6.05, 0.035, 0.42, DARK, 6);
  for (let f = 0; f < 2; f++) GarageEquipment.extinguisher(g.nx, -5.22, -4.4 + f * 0.42, 1);
  cyl(g.nx, -4.75, 0, 4.7, 0.20, 0.52, scale(STEEL, 0.5), 8);
  GarageEquipment.rollingStool(g.nx, -4.10, 3.0, c1);
  for (let i = -1; i <= 1; i += 2) {
    cyl(g.barrier, i * 2.2, 0, Z_DOOR - 0.55, 0.05, 0.95, scale(STEEL, 0.8), 8);
    cyl(g.barrier, i * 2.2, 0.95, Z_DOOR - 0.55, 0.075, 0.05, [0.80, 0.70, 0.12], 8);
  }
  block(g.barrier, 0, 0.92, Z_DOOR - 0.55, 2.2, 0.02, 0.02, [0.80, 0.70, 0.12]);
  for (let sd = -1; sd <= 1; sd += 2)
    block(g.mid, sd * 4.6, 3.62, 0, 0.16, 0.05, 6.2, scale(STEEL, 0.6));
  GarageEquipment.serviceRig(g.px, 4.55, 5.55, c1);
  GarageEquipment.wheelDolly(g.px, 4.30, 3.90, c1);
  block(g.nx, -5.00, 0.74, -1.85, 0.32, 0.04, 0.62, scale(STEEL, 0.9));
  for (let l = -1; l <= 1; l += 2) cyl(g.nx, -5.00, 0, -1.85 + l * 0.5, 0.035, 0.74, DARK, 6);
  for (let l = 0; l < 2; l++) {
    block(g.nx, -4.94, 0.78, -2.10 + l * 0.5, 0.16, 0.012, 0.14, scale(STEEL, 1.05));
    block(g.nx, -4.80, 0.90, -2.10 + l * 0.5, 0.015, 0.11, 0.14, DARK);
  }
  for (let j = 0; j < 2; j++) {
    cyl(g.nx, -4.60, 0, -4.6 + j * 0.7, 0.16, 0.09, scale(STEEL, 0.65), 6);
    cyl(g.nx, -4.60, 0.09, -4.6 + j * 0.7, 0.05, 0.40, STEEL, 6);
  }
  GarageEquipment.floorFan(g.nx, -4.35, -3.05, c1);
  cyl(g.back, -4.60, 0, -5.95, 0.04, 1.45, STEEL, 6);
  block(g.back, -4.60, 1.45, -5.95, 0.18, 0.12, 0.10, DARK);
  for (let d = -1; d <= 1; d += 2)
    block(g.mid, d * 4.40, 4.80, 0, 0.26, 0.18, 6.10, scale(STEEL, 0.5));
  for (let s = -1; s <= 1; s += 2) {
    block(g.mid, s * 3.9, 0.035, 0.5, 0.09, 0.035, 5.4, DARK);
    block(g.mid, s * 4.6, 0.035, -5.9, 0.75, 0.035, 0.09, DARK);
  }
  block(g.mid, 2.85, 0.12, 4.55, 0.55, 0.05, 0.12, scale(STEEL, 0.8));
  cyl(g.mid, 2.85, 0.12, 4.75, 0.03, 0.85, STEEL, 6);
}

const { RUBBER, FAN, SCREEN } = GarageEquipment;
const KEY_TINT = [1.16, 1.00, 0.78];
const FILL_TINT = [0.86, 0.95, 1.14];
const WASH_TINT = [0.90, 0.97, 1.10];
const FIXTURES = [
  [ 0.00, 4.30,  1.60, KEY_TINT, 15.0, 11, 0, -1, 0,      0.72, 0.28, 0.10, 0.45, 1],
  [ 0.00, 4.30, -1.10, KEY_TINT, 15.0, 11, 0, -1, 0,      0.72, 0.28, 0.10, 0.45, 1],
  [-3.90, 4.25,  3.40, FILL_TINT, 9.5, 12, 0.62, -0.62, -0.48, 0.80, 0.42, 0.14, 0.35, 1],
  [ 3.90, 4.25,  3.40, FILL_TINT, 9.5, 12, -0.62, -0.62, -0.48, 0.80, 0.42, 0.14, 0.35, 1],
  [-3.90, 4.25, -3.40, FILL_TINT, 9.5, 12, 0.62, -0.62, 0.48, 0.80, 0.42, 0.14, 0.35, 1],
  [ 3.90, 4.25, -3.40, FILL_TINT, 9.5, 12, -0.62, -0.62, 0.48, 0.80, 0.42, 0.14, 0.35, 1],
  [-2.60, 4.60, -5.20, WASH_TINT, 8.0,  9, -0.10, -0.72, -0.69, 0.86, 0.50, 0.06, 0, 0],
  [ 2.60, 4.60, -5.20, WASH_TINT, 8.0,  9, 0.10, -0.72, -0.69, 0.86, 0.50, 0.06, 0, 0],
  [-2.60, 4.55,  5.10, WASH_TINT, 7.5,  9, -0.08, -0.70, 0.71, 0.86, 0.50, 0.08, 0, 0],
  [ 2.60, 4.55,  5.10, WASH_TINT, 7.5,  9, 0.08, -0.70, 0.71, 0.86, 0.50, 0.08, 0, 0],
];
const E = 0.55;
const LED_DROP = 0.06;

function hangerSpan(y) { return [y + 0.11, CEIL_Y]; }
const ledMesh = {};
function buildLed(g, liv) {
  const out = g.mid;
  {
    const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
    const zf = Z_BACK + 0.015;
    const X = 1.60, Y0 = 1.24, Y1 = 3.56, T = 0.06;
    const FRAME = scale(c1, 1.15), WELL = [0.03, 0.032, 0.038];
    block(g.back, 0, (Y0 + Y1) / 2, Z_BACK + 0.008, X, (Y1 - Y0) / 2, 0.008, WELL);
    for (const sy of [-1, 1])
      block(g.back, 0, sy > 0 ? Y1 : Y0, zf, X + T, T / 2, 0.05, FRAME);
    for (const sx of [-1, 1])
      block(g.back, sx * X, (Y0 + Y1) / 2, zf, T / 2, (Y1 - Y0) / 2 + T, 0.05, FRAME);
  }
  for (let i = 0; i < FIXTURES.length; i++) {
    const F = FIXTURES[i], x = F[0], y = F[1] + LED_DROP, z = F[2];
    const hw = F[13] ? 1.20 : 0.26, hd = F[13] ? 0.17 : 0.12;
    block(out, x, y + 0.06, z, hw, 0.05, hd, scale(STEEL, 0.55));
    block(out, x, y, z, hw * 0.95, 0.02, hd * 0.8, scale(F[3], 1.14));
    for (let s = -1; s <= 1; s += 2) {
      const hx = x + s * hw * 0.8, h = hangerSpan(y);
      block(out, hx, (h[0] + h[1]) / 2, z, 0.02, (h[1] - h[0]) / 2, 0.02, STEEL);
    }
  }
  const c1 = rgb(liv && liv.c1, [0.4, 0.45, 0.55]);
  for (let s = -1; s <= 1; s += 2) {
    const w = s < 0 ? g.nx : g.px;
    for (let i = -1; i <= 1; i++) {
      cyl(w, s * 5.05, 0.02, i * 3.5, 0.11, 0.22, scale(STEEL, 0.6), 8);
      cyl(w, s * 5.05, 0.24, i * 3.5, 0.09, 0.02, scale(c1, 1.5), 8);
    }
    for (let k = 0; k < 4; k++) {
      const cz = -4.65 + k * 3.10;
      block(w, s * 5.37, 1.56, cz, 0.05, 0.085, 1.475, scale(STEEL, 0.5));
      block(w, s * 5.34, 1.56, cz, 0.03, 0.038, 1.44, scale(c1, 1.35));
      for (let e = -1; e <= 1; e += 2)
        block(w, s * 5.36, 1.56, cz + e * 1.50, 0.045, 0.075, 0.035, scale(STEEL, 0.7));
    }
  }
  block(g.door, 0, 4.89, Z_DOOR - 0.14, 3.05, 0.13, 0.05, scale(c1, 0.55));
}
const LED_OPTS = { emissive: 0.62, roughness: 1.0, specular: 0, noAlphaWrite: true };

const _rig = [];
let _rigK0 = NaN, _rigK1 = NaN, _rigK2 = NaN, _rigMood = "";
function lights(liv) {
  const c1 = rgb(liv && liv.c1, [0.4, 0.45, 0.55]);
  if (_rig.length && c1[0] === _rigK0 && c1[1] === _rigK1 && c1[2] === _rigK2 && _rigMood === moodId) return _rig;
  _rig.length = 0;
  _rigK0 = c1[0]; _rigK1 = c1[1]; _rigK2 = c1[2]; _rigMood = moodId;
  for (let i = 0; i < FIXTURES.length; i++) {
    const F = FIXTURES[i], e = F[4] * E * fixGain(i), t = fixTint(i, F[3]);
    _rig.push(F[0], F[1], F[2], t[0] * e, t[1] * e, t[2] * e, F[5],
              F[6], F[7], F[8], F[9], F[10], F[11], 0, F[12]);
  }
  const m = Math.max(c1[0], c1[1], c1[2]) || 1, ue = (3.0 / m) * E * MD.up;
  for (let s = -1; s <= 1; s += 2)
    _rig.push(s * 5.05, 0.25, 0, c1[0] * ue, c1[1] * ue, c1[2] * ue, 6,
              -s * 0.26, 0.97, 0, 0.90, 0.55, 0.05, 0, 0.12);
  for (const gx of [-9, -3, 3, 9])
    _rig.push(gx, 3.6, PIT_Z1 + 0.2, 0, 0, 0, 9, 0, -0.85, -0.53, 0.80, 0.45, 0.10, 0, 0);
  _rig.push(0, 1.7, 0, 0, 0, 0, 7, 0, -1, 0, 0.92, 0.70, 0.05, 0, 0);
  return _rig;
}
const GANTRY_AT = FIXTURES.length + 2, LAMP_AT = GANTRY_AT + 4;
const GANTRY_TINT = [1.0, 0.93, 0.78];
let liveNow = 0, pulseAt = -1e9, spotName = null, nightNow = false;
function pulse() { pulseAt = liveNow; }
function spot(name) { spotName = name || null; }
const SPOTS = {
  hero: [-2.6, -3.6, 0, 0.7, -1.4], bay: [-2.5, -3.8, 0, 0.7, -1.2],
  bayFront: [2.8, 4.2, 0.4, 0.6, 1.2],
  wingRear: [-2.2, -4.2, 0, 0.9, -2.7], rear: [-3.4, -4.6, 0, 0.6, -2.6],
  side: [2.6, 4.3, 0.8, 0.4, 0.6], front: [-3.4, 4.6, 0, 0.5, 2.4], wingFront: [-2.6, 4.4, 0, 0.5, 2.9],
};
const PARK = [-4.0, 2.2];
const lampAim = [PARK[0], PARK[1], 0, 0, PARK[0], 0, PARK[1]];
const _chase = [];
const LIVE_DECAL_SIDES = ["mid", "nx", "px", "door"];
const _inside = { nx: true, px: true, back: true, door: true, mid: true, shutter: true, barrier: true };
function live(liv, now, ctx) {
  const rig = lights(liv);
  liveNow = now;
  nightNow = !!(ctx && ctx.night);
  for (let k = 0; k < 3; k++) BACKDROP[k] = MD.bd ? MD.bd[k] : _bdBase[k] * MD.backdrop;
  const ge = nightNow && !(ctx && ctx.realExterior) ? 6.5 * E * MD.gantry : 0;
  for (let i = 0; i < 4; i++) {
    const o = (GANTRY_AT + i) * 15;
    rig[o + 3] = GANTRY_TINT[0] * ge; rig[o + 4] = GANTRY_TINT[1] * ge; rig[o + 5] = GANTRY_TINT[2] * ge;
    rig[o + 14] = ge ? 1.2 : 0;
  }
  {
    const c1 = rgb(liv && liv.c1, [0.4, 0.45, 0.55]), m = Math.max(c1[0], c1[1], c1[2]) || 1;
    const d = ctx && Number.isFinite(ctx.door) ? Math.max(0, Math.min(1, ctx.door)) : 1;
    const sw = ctx && Number.isFinite(ctx.swell) ? ctx.swell : 1;
    const ue = (3.0 / m) * E * MD.up * (1 + 2.2 * sw * Math.sin(d * Math.PI));
    for (let k = 0; k < 2; k++) {
      const o = (FIXTURES.length + k) * 15;
      rig[o + 3] = c1[0] * ue; rig[o + 4] = c1[1] * ue; rig[o + 5] = c1[2] * ue;
    }
  }
  for (let i = 0; i < FIXTURES.length; i++)
    rig[i * 15 + 14] = spotName === "top" ? 0 : FIXTURES[i][12];
  const sp = (!ctx || !ctx.spin) && spotName && SPOTS[spotName];
  const lx = sp ? sp[0] : PARK[0], lz = sp ? sp[1] : PARK[1];
  const ax = sp ? sp[2] : lx, ay = sp ? sp[3] : 0, az = sp ? sp[4] : lz;
  const yaw = Math.atan2(ax - lx, az - lz);
  lampAim[0] = lx; lampAim[1] = lz; lampAim[2] = yaw; lampAim[3] = sp ? 1 : 0;
  lampAim[4] = ax; lampAim[5] = ay; lampAim[6] = az;
  {
    const o = LAMP_AT * 15, hx = lx + Math.sin(yaw) * 0.18, hz = lz + Math.cos(yaw) * 0.18, hy = 1.72;
    const dx = ax - hx, dy = ay - hy, dz = az - hz, dl = Math.hypot(dx, dy, dz) || 1;
    const le = sp ? 7.0 * E : 0;
    rig[o] = hx; rig[o + 1] = hy; rig[o + 2] = hz;
    rig[o + 3] = 1.10 * le; rig[o + 4] = 1.00 * le; rig[o + 5] = 0.82 * le;
    rig[o + 7] = dx / dl; rig[o + 8] = dy / dl; rig[o + 9] = dz / dl;
    rig[o + 14] = sp ? 0.6 : 0;
  }
  {
    const t = now / 1000, f = (Math.sin(t * 23.1) + Math.sin(t * 7.3) + Math.sin(t * 41.7)) / 3;
    const on = ctx && ctx.ambient === false ? 1 : f > 0.62 ? 0.30 : f > 0.50 ? 0.72 : 1, F = FIXTURES[8], e = F[4] * E * fixGain(8) * on, o = 8 * 15, t8 = fixTint(8, F[3]);
    rig[o + 3] = t8[0] * e; rig[o + 4] = t8[1] * e; rig[o + 5] = t8[2] * e;
  }
  const lit = ctx && ctx.cue && hasCue(ctx.cue.id) ? cueRig(rig, ctx.cue) : rig;
  const u = (now - pulseAt) / 2200;
  if ((ctx && ctx.ambient === false) || u < 0 || u >= 1) return litRig(lit);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  const m = Math.max(c2[0], c2[1], c2[2]) || 1, ce = (2.6 / m) * E * Math.sin(u * Math.PI);
  const z = Z_BACK + (Z_DOOR - Z_BACK) * u;
  const chase = _chase;
  for (let i = 0; i < lit.length; i++) chase[i] = lit[i];
  chase.length = lit.length;
  chase.push(-4.6, 4.55, z, c2[0] * ce, c2[1] * ce, c2[2] * ce, 5, 0, -1, 0, 0.92, 0.55, 0.06, 0, 0.9);
  chase.push(4.6, 4.55, z, c2[0] * ce, c2[1] * ce, c2[2] * ce, 5, 0, -1, 0, 0.92, 0.55, 0.06, 0, 0.9);
  return litRig(chase);
}
const CUE_SHA256 = "e8b353793828f76cfa69b678b4e99fccae9fb67de48b5cf35aeeccb796f5a7a9";
const CUE_DATA = {"lightsup":{"label":"LIGHTS UP","len":2.4,"loop":false,"lin":[],"ch":{"key":[0.0,0.02,1.45,0.02,1.51,0.75,1.57,0.35,1.67,1.0,2.4,1.0],"fill":[0.0,0.04,0.85,0.04,0.91,0.75,0.97,0.35,1.07,1.0],"wash":[0.0,0.04,0.3,0.04,0.36,0.75,0.42,0.35,0.52,1.0],"up":[0.0,0.6,1.45,0.6,2.4,1.0]}},"flashes":{"label":"PHOTO FLASHES","len":4.0,"loop":true,"lin":[],"ch":{"key":[0.0,1.1,4.0,1.1],"up":[0.0,1.6,4.0,1.6],"flash":[0.0,0.0,0.179,0.0,0.2,1.0,0.31,0.0,0.519,0.0,0.54,0.7,0.605,0.0,0.609,0.0,0.63,0.9,0.74,0.0,1.239,0.0,1.26,1.0,1.37,0.0,1.709,0.0,1.73,0.55,1.795,0.0,1.799,0.0,1.82,0.8,1.93,0.0,2.459,0.0,2.48,1.0,2.59,0.0,2.979,0.0,3.0,0.65,3.065,0.0,3.069,0.0,3.09,0.9,3.145,0.0,3.149,0.0,3.17,0.5,3.28,0.0,3.619,0.0,3.64,1.0,3.75,0.0,4.0,0.0]}},"beacon":{"label":"AMBER BEACON","len":1.2,"loop":true,"lin":["angle"],"ch":{"key":[0.0,0.55,1.2,0.55],"fill":[0.0,0.5,1.2,0.5],"wash":[0.0,0.45,1.2,0.45],"up":[0.0,0.35,1.2,0.35],"tr":[0.0,1.06,1.2,1.06],"tg":[0.0,0.94,1.2,0.94],"tb":[0.0,0.8,1.2,0.8],"beacon":[0.0,1.0,1.2,1.0],"angle":[0.0,0.0,1.2,6.2832]}},"pulse":{"label":"PULSE","len":3.2,"loop":true,"lin":[],"ch":{"key":[0.0,1.0,1.6,0.86,3.2,1.0],"fill":[0.0,1.0,1.6,0.9,3.2,1.0],"up":[0.0,1.0,1.6,2.6,3.2,1.0]}},"lightsout":{"label":"LIGHTS OUT","len":6.0,"loop":false,"lin":[],"ch":{"key":[0.0,1.0,1.0,0.9,1.9,0.8,2.8,0.7,3.7,0.6,4.6,0.5,4.95,0.5,5.05,0.03,5.25,0.03,5.33,1.25,6.0,1.0],"fill":[0.0,1.0,1.0,0.86,1.9,0.72,2.8,0.58,3.7,0.44,4.6,0.3,4.95,0.3,5.05,0.02,5.25,0.02,5.33,1.2,6.0,1.0],"wash":[0.0,1.0,1.0,0.85,1.9,0.7,2.8,0.55,3.7,0.4,4.6,0.25,4.95,0.25,5.05,0.02,5.25,0.02,5.33,1.2,6.0,1.0],"up":[0.0,1.0,4.95,1.4,5.05,0.0,5.25,0.0,5.33,2.4,6.0,1.0],"tr":[0.0,1.0,1.0,1.08,1.9,1.16,2.8,1.24,3.7,1.32,4.6,1.4,5.25,1.4,5.33,1.0],"tg":[0.0,1.0,1.0,0.87,1.9,0.74,2.8,0.61,3.7,0.48,4.6,0.35,5.25,0.35,5.33,1.0],"tb":[0.0,1.0,1.0,0.87,1.9,0.74,2.8,0.61,3.7,0.48,4.6,0.35,5.25,0.35,5.33,1.0]}},"spotsweep":{"label":"SPOTLIGHT","len":4.0,"loop":false,"lin":["angle","spotx"],"ch":{"key":[0.0,1.0,0.4,0.25,3.0,0.25,4.0,0.6],"fill":[0.0,1.0,0.4,0.25,3.0,0.25,4.0,0.6],"wash":[0.0,1.0,0.4,0.25,3.0,0.25,4.0,0.6],"up":[0.0,1.0,0.4,0.4,3.0,0.4,4.0,1.0],"angle":[0.0,0.85,1.2,0.5,2.4,0.12,3.0,0.0],"spot":[0.0,0.0,0.25,1.0,4.0,1.0],"spotx":[0.0,-3.0,1.2,2.2,2.4,-0.6,3.0,0.0]}}};
const CUES = Object.freeze(Object.keys(CUE_DATA));
const CUE_GAINS = ["key", "fill", "wash", "up", "gantry"];
const CUE_DEF = { key: 1, fill: 1, wash: 1, up: 1, gantry: 1, tr: 1, tg: 1, tb: 1, flash: 0, beacon: 0, angle: 0, spot: 0, spotx: 0 };
const hasCue = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(CUE_DATA, id);
const cueLabel = (id) => hasCue(id) ? CUE_DATA[id].label : "";
const cueLen = (id) => hasCue(id) ? CUE_DATA[id].len : 0;
function cueValue(k, t, lin) {
  const n = k.length;
  if (!(t > k[0])) return k[1];
  if (t >= k[n - 2]) return k[n - 1];
  let i = 2;
  while (k[i] < t) i += 2;
  const f = (t - k[i - 2]) / (k[i] - k[i - 2]), e = lin ? f : (1 - Math.cos(Math.PI * f)) / 2;
  return k[i - 1] + (k[i + 1] - k[i - 1]) * e;
}
const cueGains = () => ({ key: 1, fill: 1, wash: 1, up: 1, gantry: 1, tint: null, flash: 0, beacon: null, spot: 0, spotx: 0, _tint: [1, 1, 1], _beacon: { angle: 0, gain: 0 } });
const cueClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function cueChan(c, name, t) { const k = c.ch[name]; return k ? cueValue(k, t, c.lin.indexOf(name) >= 0) : CUE_DEF[name]; }
function cueSample(id, t, out = cueGains()) {
  const c = hasCue(id) ? CUE_DATA[id] : null;
  let s = Number.isFinite(t) ? t : 0;
  if (c && c.loop && c.len > 0) s = ((s % c.len) + c.len) % c.len;
  for (const g of CUE_GAINS) out[g] = c ? cueClamp(cueChan(c, g, s), 0, 4) : 1;
  const tr = c ? cueClamp(cueChan(c, "tr", s), 0, 2) : 1, tg = c ? cueClamp(cueChan(c, "tg", s), 0, 2) : 1, tb = c ? cueClamp(cueChan(c, "tb", s), 0, 2) : 1;
  out._tint[0] = tr; out._tint[1] = tg; out._tint[2] = tb;
  out.tint = Math.abs(tr - 1) + Math.abs(tg - 1) + Math.abs(tb - 1) > 1e-6 ? out._tint : null;
  out.flash = c ? cueClamp(cueChan(c, "flash", s), 0, 1) : 0;
  const bg = c ? cueClamp(cueChan(c, "beacon", s), 0, 1) : 0;
  out._beacon.gain = bg; out._beacon.angle = c ? cueChan(c, "angle", s) : 0;
  out.beacon = bg > 0 ? out._beacon : null;
  out.spot = c ? cueClamp(cueChan(c, "spot", s), 0, 1) : 0;
  out.spotx = c ? cueChan(c, "spotx", s) : 0;
  return out;
}
const _cueRig = [];
let _cueG = null;
const STROBE_TINT = [1.0, 1.0, 1.04], BEACON_TINT = [1.0, 0.52, 0.06], SPOT_Y = 4.4;
function cueRig(rig, cue) {
  const g = cueSample(cue.id, cue.t, _cueG || (_cueG = cueGains())), out = _cueRig, t = g.tint;
  for (let i = 0; i < rig.length; i++) out[i] = rig[i];
  out.length = rig.length;
  for (let i = 0; i < FIXTURES.length; i++) {
    const o = i * 15, gn = i < 2 ? g.key : i < 6 ? g.fill : g.wash;
    for (let k = 0; k < 3; k++) out[o + 3 + k] *= gn * (t ? t[k] : 1);
  }
  for (let k = 0; k < 2; k++) for (let c = 3; c < 6; c++) out[(FIXTURES.length + k) * 15 + c] *= g.up;
  for (let i = 0; i < 4; i++) for (let c = 3; c < 6; c++) out[(GANTRY_AT + i) * 15 + c] *= g.gantry;
  if (g.flash > 0) {
    const fe = 34 * E * g.flash;
    out.push(0.7, 1.85, Z_DOOR + 0.8, STROBE_TINT[0] * fe, STROBE_TINT[1] * fe, STROBE_TINT[2] * fe, 14,
             -0.06, -0.16, -0.985, 0.55, 0.12, 0.20, 0, 1.6 * g.flash);
  }
  if (g.beacon) {
    const a = g.beacon.angle, be = 9 * E * g.beacon.gain, dx = 0.86 * Math.sin(a), dz = -0.86 * Math.cos(a);
    out.push(0, 4.55, Z_DOOR - 0.5, BEACON_TINT[0] * be, BEACON_TINT[1] * be, BEACON_TINT[2] * be, 10,
             dx, -0.51, dz, 0.93, 0.78, 0.10, 0, g.beacon.gain * (0.35 + 0.65 * (0.5 - 0.5 * Math.cos(a))));
  }
  if (g.spot > 0) {
    const se = 16 * E * g.spot, px = g.spotx, pz = SPOT_Y * Math.tan(g._beacon.angle), dl = Math.hypot(px, SPOT_Y, pz);
    out.push(0, SPOT_Y, 0, se, se, 0.98 * se, 10, px / dl, -SPOT_Y / dl, pz / dl, 0.97, 0.90, 0.04, 0, 0.5 * g.spot);
  }
  return out;
}
const _lit = [];
function litRig(src) {
  _lit.length = 0;
  const n = (src.length / 15) | 0;
  for (let i = 0; i < n; i++) {
    const o = i * 15;
    if (src[o + 3] + src[o + 4] + src[o + 5] <= 1e-4 && src[o + 14] <= 1e-4) continue;
    for (let k = 0; k < 15; k++) _lit.push(src[o + k]);
  }
  return _lit;
}
const MOOD_DEF = { key: 1, fill: 1, wash: 1, up: 1, gantry: 1, keyTint: null, fillTint: null, washTint: null,
  sky: 1, amb: 1, ambG: null, sun: null, bd: null, backdrop: 1, exposure: 1, bloom: 1, glare: 1, sheen: 1, night: null };
const MOODS = {
  shipped: {},
  broadcast: { key: 2.2, fill: 3.0, wash: 2.5, up: 0.4, keyTint: [1.04, 1.0, 0.94], fillTint: [0.96, 1.0, 1.06],
    washTint: [0.97, 1.0, 1.04], sky: [2.0, 2.05, 2.15], amb: [2.3, 2.4, 2.5], exposure: 1.22, bloom: 0.5, glare: 0.6, sheen: 1.6, backdrop: 4 },
  night: { night: true, key: 3.4, fill: 0.5, wash: 0.4, up: 3.2, gantry: 2.0, keyTint: [1.25, 0.95, 0.60],
    fillTint: [0.75, 0.90, 1.25], sky: [0.08, 0.12, 0.30], amb: [0.28, 0.38, 0.85], bd: [0.010, 0.020, 0.070],
    exposure: 1.08, bloom: 2.2, glare: 2.2, sheen: 2.2 },
  showroom: { key: 4.0, fill: 0.10, wash: 0.05, up: 3.0, keyTint: [1.14, 1.0, 0.84], fillTint: [0.70, 0.84, 1.25],
    sky: 0.05, amb: 0.12, sun: [0, 0.97, 0.24], bd: [0.004, 0.004, 0.006], exposure: 1.15, bloom: 1.6, glare: 1.8, sheen: 3.0 },
  daylight: { night: false, key: 0.35, fill: 0.45, wash: 0.6, up: 0.25, keyTint: [0.92, 0.98, 1.10], fillTint: [0.90, 0.97, 1.12],
    sky: [3.4, 2.75, 1.85], amb: [1.25, 1.65, 2.6], ambG: [3.0, 2.3, 1.4], sun: [0, 0.42, 0.9075], bd: [0.62, 0.70, 0.82],
    exposure: 1.08, bloom: 0.7, glare: 0.25, sheen: 1.3 },
  inspection: { key: 1.2, fill: 3.6, wash: 3.4, up: 0.25, keyTint: [0.92, 0.98, 1.12], fillTint: [0.90, 1.0, 1.16],
    washTint: [0.94, 1.0, 1.10], sky: [1.8, 2.15, 2.8], amb: [2.0, 2.25, 2.65], ambG: [1.5, 1.7, 1.95],
    exposure: 1.08, bloom: 0.15, glare: 0.15, sheen: 0.45, backdrop: 2.5 },
  goldenhour: { night: false, key: 1.1, fill: 1.2, wash: 1.0, up: 0.35, keyTint: [1.24, 0.90, 0.62], fillTint: [0.82, 0.94, 1.18],
    washTint: [1.10, 0.96, 0.82], sky: [2.3, 1.55, 0.9], amb: [1.1, 1.35, 1.9], ambG: [3.8, 1.8, 0.65],
    sun: [0, 0.18, 0.9837], bd: [0.68, 0.42, 0.22], exposure: 1.08, bloom: 0.45, glare: 0.35, sheen: 1.1 },
  endurance: { night: true, key: 2.5, fill: 1.4, wash: 1.7, up: 1.8, gantry: 1.4, keyTint: [0.86, 0.95, 1.16],
    fillTint: [1.12, 0.97, 0.84], washTint: [0.78, 0.91, 1.17], sky: [0.35, 0.5, 0.95], amb: [0.85, 1.12, 1.6], ambG: [0.55, 0.7, 1.0],
    bd: [0.025, 0.04, 0.08], exposure: 1.1, bloom: 0.65, glare: 0.45, sheen: 1.1 },
  podium: { key: 2.8, fill: 1.3, wash: 1.1, up: 2.4, keyTint: [1.30, 1.02, 0.52], fillTint: [1.18, 0.98, 0.70],
    washTint: [1.20, 1.00, 0.66], sky: [1.6, 1.3, 0.7], amb: [1.4, 1.15, 0.7], ambG: [1.9, 1.4, 0.6],
    exposure: 1.12, bloom: 1.8, glare: 1.6, sheen: 2.0 },
  rain: { night: false, key: 0.9, fill: 1.6, wash: 1.3, up: 0.5, keyTint: [0.94, 0.99, 1.08], fillTint: [0.88, 0.96, 1.12],
    washTint: [0.90, 0.97, 1.10], sky: [1.3, 1.45, 1.65], amb: [1.2, 1.35, 1.6], ambG: [0.75, 0.82, 0.95],
    bd: [0.30, 0.33, 0.37], exposure: 1.0, bloom: 0.55, glare: 0.5, sheen: 2.6 },
  neon: { night: true, key: 1.6, fill: 0.9, wash: 1.6, up: 2.8, gantry: 1.6, keyTint: [1.25, 0.55, 1.20],
    fillTint: [0.45, 0.95, 1.35], washTint: [0.55, 0.80, 1.40], sky: [0.25, 0.08, 0.35], amb: [0.55, 0.35, 0.95],
    ambG: [0.75, 0.25, 0.65], bd: [0.030, 0.010, 0.050], exposure: 1.06, bloom: 2.4, glare: 2.0, sheen: 2.6 },
};
const SKY_BASE = SKYLIGHT.slice(), AMB_SKY_BASE = AMB_SKY.slice(), AMB_GROUND_BASE = AMB_GROUND.slice();
const _bdBase = BACKDROP.slice();
let moodId = "shipped", MD = Object.assign({}, MOOD_DEF);
function mood(id) {
  if (id === undefined) return moodId;
  const m = MOODS[id] ? id : "shipped";
  moodId = m; MD = Object.assign({}, MOOD_DEF, MOODS[m]);
  for (let k = 0; k < 3; k++) {
    const ch = (v) => (Array.isArray(v) ? v[k] : v), am = ch(MD.amb);
    SKYLIGHT[k] = SKY_BASE[k] * ch(MD.sky);
    AMB_SKY[k] = AMB_SKY_BASE[k] * am; AMB_GROUND[k] = AMB_GROUND_BASE[k] * (MD.ambG === null ? am : ch(MD.ambG));
  }
  return moodId;
}
function setMood(id) {
  const m = mood(id);
  try { if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.rawSet("garageMood", m); else localStorage.setItem("apex26.garageMood", m); } catch (_) {  }
  return m;
}
function moodDef() { return MD; }
function moodCtx(ctx) {
  if (ctx) ctx.night = MD.night !== null ? MD.night : ctx.bayNight !== undefined ? !!ctx.bayNight : ctx.night;
  return ctx;
}
function hourNight(ctx) { return !!(ctx && (ctx.bayNight !== undefined ? ctx.bayNight : ctx.night)); }
function fixGain(i) { return i < 2 ? MD.key : i < 6 ? MD.fill : MD.wash; }
function fixTint(i, t) { return (i < 2 ? MD.keyTint : i < 6 ? MD.fillTint : MD.washTint) || t; }
{
  let id = null;
  try { id = (typeof location !== "undefined" && new URLSearchParams(location.search).get("garageMood"))
    || (typeof localStorage !== "undefined" && localStorage.getItem("apex26.garageMood")); } catch (_) {  }
  if (id) mood(id);
}
function mk(out, tx, ty, tz, ay, az) {
  const cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  out[0] = cy * cz;  out[1] = sz;       out[2] = -sy * cz; out[3] = 0;
  out[4] = -cy * sz; out[5] = cz;       out[6] = sy * sz;  out[7] = 0;
  out[8] = sy;       out[9] = 0;        out[10] = cy;      out[11] = 0;
  out[12] = tx;      out[13] = ty;      out[14] = tz;      out[15] = 1;
  return out;
}
let fanMesh = null, lampMesh = null, lampFace = null, passMesh = null, mirrorFadeMesh = null;
const _mFan = new Float32Array(16), _mLamp = new Float32Array(16), _mPass = new Float32Array(16);
const MAT_MIRROR = new Float32Array([-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MIRROR_BIAS = [-2, -120];
const MIRROR_RESOLVE = { alpha: 1, roughness: 1, specular: 0, metalness: 0, clearcoat: 0, carFinish: true, depthBias: MIRROR_BIAS };
const MIRROR_SHEEN_PEAK = 0.14;
const _mirrorFadeOpts = { alpha: 0.86, roughness: 0.34, metalness: 0, specular: 0.46, clearcoat: 0 };
function mirrorSheen(eye, carMat) {
  const cx = carMat ? carMat[12] : 0, cz = carMat ? carMat[14] : 0;
  const ex = eye ? eye[0] : 0, ey = eye ? eye[1] : 1.6, ez = eye ? eye[2] : 5;
  const d = Math.hypot(ex - cx, ez - cz);
  const lateral = 1 / (1 + Math.max(0, d - 2.2) * 0.18);
  const height = 1 / (1 + Math.max(0, ey - 2.5) * 0.25);
  return MIRROR_SHEEN_PEAK * MD.sheen * lateral * height;
}
function ensureMirrorFade(liv) {
  if (mirrorFadeMesh || !_gfx) return;
  const out = acc();
  buildBayFloor(out, liv, GaragePrims.look());
  for (let i = 1; i < out.pos.length; i += 3) out.pos[i] += 0.002;
  mirrorFadeMesh = _gfx.createMesh(out);
}
function ensureDynamic() {
  if (fanMesh) return;
  const f = acc();
  tube(f, [0, 0, -0.04], [0, 0, 0.06], 0.07, scale(STEEL, 0.8), 8, MAT.METAL);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, r0 = 0.07, r1 = 0.30, w = 0.055;
    const P = (r, k) => [Math.cos(a) * r - Math.sin(a) * k, Math.sin(a) * r + Math.cos(a) * k, 0.01];
    const o = P(r0, -w), pu = P(r1, -w), pv = P(r0, w);
    panelGrid(f, o, [pu[0] - o[0], pu[1] - o[1], 0], [pv[0] - o[0], pv[1] - o[1], 0], 1, 1, [0, 0, 1], () => scale(STEEL, 0.62));
    panelGrid(f, o, [pu[0] - o[0], pu[1] - o[1], 0], [pv[0] - o[0], pv[1] - o[1], 0], 1, 1, [0, 0, -1], () => scale(STEEL, 0.5));
  }
  fanMesh = _gfx.createMesh(f);
  const l = acc();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    tube(l, [0, 0.95, 0], [Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42], 0.018, STEEL, 6, MAT.METAL);
    cyl(l, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.035, 0.03, RUBBER, 6);
  }
  cyl(l, 0, 0.3, 0, 0.025, 1.36, STEEL, 8, MAT.METAL);
  block(l, 0, 1.72, 0.10, 0.15, 0.11, 0.07, scale(STEEL, 0.55));
  block(l, 0, 1.72, 0.03, 0.05, 0.05, 0.04, scale(STEEL, 0.7));
  for (let i = 0; i < 4; i++) block(l, -0.12 + i * 0.08, 1.72, 0.18, 0.012, 0.10, 0.012, scale(STEEL, 0.8));
  lampMesh = _gfx.createMesh(l);
  const lf = acc();
  block(lf, 0, 1.72, 0.172, 0.13, 0.09, 0.006, [1.35, 1.28, 1.10]);
  lampFace = _gfx.createMesh(lf);
  const c = acc(), INK = [0.05, 0.05, 0.06];
  block(c, 0, 0.42, 0, 0.55, 0.16, 1.9, INK);
  block(c, 0, 0.68, -0.3, 0.32, 0.12, 0.6, INK);
  block(c, 0, 0.80, -2.2, 0.55, 0.05, 0.16, INK);
  block(c, 0, 0.30, 2.5, 0.85, 0.03, 0.14, INK);
  for (const wx of [-0.7, 0.7]) for (const wz of [1.6, -1.55])
    tube(c, [wx - 0.17, 0.34, wz], [wx + 0.17, 0.34, wz], 0.34, [0.03, 0.03, 0.035], 10);
  block(c, 0, 0.55, -2.55, 0.04, 0.08, 0.02, [1.6, 0.2, 0.15]);
  passMesh = _gfx.createMesh(c);
}
const GLARE_STR = 0.08;
function glareStr() { return GLARE_STR; }

const BOX_HW = 2.20, BOX_ZF = 4.25, BOX_ZB = -4.00;
const PIT_B = TrackPit.BANDS;
const PIT_HW = 22, PIT_Z0 = Z_DOOR + 0.05;
const PIT_WORK1 = PIT_Z0 + PIT_B.work, PIT_CORR1 = PIT_WORK1 + PIT_B.corridor, PIT_Z1 = PIT_CORR1 + PIT_B.fast;
const PIT_FAST_Z = (PIT_CORR1 + PIT_Z1) / 2;
function buildPitLane(out, liv, night) {
  const APRON_Y = -0.04;
  const NK = night ? 0.46 : 1;
  const ASPHALT = [0.20, 0.205, 0.215], LINE = [0.88, 0.89, 0.91];
  const WALL = [0.30, 0.31, 0.34], WALL_TOP = [0.46, 0.47, 0.50];
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  panelGrid(out, [-PIT_HW, APRON_Y + 0.004, PIT_Z0], [PIT_HW * 2, 0, 0],
    [0, 0, PIT_Z1 - PIT_Z0], 12, 4, [0, 1, 0], (u, v) => {
      const h = ((u * 977 + v * 613) * 4093) % 1;
      const k = (0.94 + h * 0.10 + (1 - v) * 0.05) * NK;
      return [ASPHALT[0] * k, ASPHALT[1] * k, ASPHALT[2] * k];
    }, MAT.ASPHALT);
  for (const z of [PIT_WORK1, PIT_CORR1, PIT_Z1])
    tile(out, -PIT_HW, PIT_HW, z, z + 0.13, LINE, APRON_Y + 0.008, MAT.ASPHALT);
  const BX0 = PIT_Z0 + 0.30, BX1 = PIT_WORK1 - 0.30, BH = TrackPit.BOX_LEN / 2;
  for (const q of [[-BH, -BH + 0.12, BX0, BX1], [BH - 0.12, BH, BX0, BX1],
                   [-BH, BH, BX0, BX0 + 0.12], [-BH, BH, BX1 - 0.12, BX1]])
    tile(out, q[0], q[1], q[2], q[3], c1, APRON_Y + 0.010, MAT.ASPHALT);
  for (let i = -7; i <= 7; i++)
    cyl(out, i * 2.9, APRON_Y + 0.008, PIT_Z1 - 0.08, 0.055, 0.62,
        i % 2 ? [0.80, 0.80, 0.84] : [0.72, 0.30, 0.10], 6, MAT.METAL);
  for (let i = -7; i <= 7; i++) {
    block(out, i * 3.0, APRON_Y + 1.60, PIT_Z1 + 1.30, 1.42, 1.10, 0.60,
          scale(WALL, i % 2 ? 0.92 : 1.06), MAT.CONCRETE);
    block(out, i * 3.0, APRON_Y + 2.78, PIT_Z1 + 0.78, 1.46, 0.10, 0.08,
          scale(WALL_TOP, 1.1), MAT.METAL);
  }
  const AP = TrackPit.BAY.doorW / 2, DH = TrackPit.BAY.doorH, FZ = Z_DOOR + 0.025;
  for (const side of [-1, 1]) {
    panelGrid(out, [side < 0 ? -HALF_W : AP, 0, FZ], [HALF_W - AP, 0, 0], [0, CEIL_Y, 0], 4, 4, [0, 0, 1], () => WALL, MAT.CONCRETE);
    for (let bay = 1; bay <= 2; bay++) {
      const x = side * TrackPit.PITCH * bay;
      block(out, x, 2.5, Z_DOOR - 0.35, HALF_W - 0.10, 2.5, 0.35, scale(WALL, 0.85), MAT.CONCRETE);
      block(out, x, 4.65, Z_DOOR + 0.015, HALF_W - 0.16, 0.16, 0.04, c1, MAT.METAL);
    }
  }
  panelGrid(out, [-AP, DH, FZ], [AP * 2, 0, 0], [0, CEIL_Y - DH, 0], 8, 1, [0, 0, 1], () => c1, MAT.METAL);
  block(out, 0, APRON_Y + 0.50, PIT_Z1 + 0.18, PIT_HW, 0.50, 0.16, WALL, MAT.CONCRETE);
  block(out, 0, APRON_Y + 1.03, PIT_Z1 + 0.18, PIT_HW, 0.05, 0.20, WALL_TOP, MAT.METAL);
  for (let i = -5; i <= 5; i++)
    block(out, i * 3.6, APRON_Y + 0.62, PIT_Z1 + 0.02, 1.55, 0.26, 0.05,
          scale(c1, night ? 1.25 : (i % 2 ? 0.55 : 0.9)));
}
function buildApron(out) {
  const RINGS = 7, SEG = 40, R = 30, Y = -0.04;
  const HOT = [0.105, 0.107, 0.115];
  const push = (x, z, t) => {
    const k = smooth(t);
    out.pos.push(x, Y, z); out.nrm.push(0, 1, 0);
    out.col.push(HOT[0] + (BACKDROP[0] - HOT[0]) * k,
                 HOT[1] + (BACKDROP[1] - HOT[1]) * k,
                 HOT[2] + (BACKDROP[2] - HOT[2]) * k);
    pushMat(out, 1, MAT.ASPHALT);
  };
  const base = out.pos.length / 3;
  push(0, 0, 0);
  for (let r = 1; r <= RINGS; r++) {
    const t = r / RINGS, rad = R * t * t;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      push(Math.cos(a) * rad, Math.sin(a) * rad, t);
    }
  }
  for (let i = 0; i < SEG; i++) out.idx.push(base, base + 1 + ((i + 1) % SEG), base + 1 + i);
  for (let r = 0; r < RINGS - 1; r++) {
    const a0 = base + 1 + r * SEG, b0 = a0 + SEG;
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      out.idx.push(a0 + i, b0 + j, b0 + i, a0 + i, a0 + j, b0 + j);
    }
  }
}
function buildBayFloor(out, liv, lk) {
  const LF = lk ? GarageDress.lookFloorCols(lk, liv) : null;
  const SLAB = LF ? LF.SLAB : [0.088, 0.090, 0.098], IN = LF ? LF.IN : [0.115, 0.118, 0.126];
  const PAINT = LF ? LF.PAINT : [0.66, 0.67, 0.70], WALK = LF ? LF.WALK : [0.70, 0.60, 0.12];
  const band = LF ? LF.band : scale(rgb(liv && liv.c1, [0.3, 0.32, 0.36]), 0.7);
  const L = -HALF_W, R = HALF_W, B = Z_BACK, F = Z_DOOR, W = 0.11;
  const C = MAT.ASPHALT;
  const key = LF ? LF.key : rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.55, 0.57, 0.62]);
  tile(out, L, R, B, B + 0.8, band, 0, C);
  tile(out, L, R, B + 0.8, BOX_ZB - W, SLAB, 0, C);
  tile(out, L, -BOX_HW - W, BOX_ZB, BOX_ZF, SLAB, 0, C);
  tile(out, -BOX_HW, BOX_HW, BOX_ZB, BOX_ZF, IN, 0, C);
  tile(out, BOX_HW + W, R, BOX_ZB, BOX_ZF, SLAB, 0, C);
  tile(out, L, R, BOX_ZF + W, F, SLAB, 0, C);
  for (const q of [[L, R, BOX_ZB - W - 0.05, BOX_ZB - W], [L, R, BOX_ZF + W, BOX_ZF + W + 0.05],
                   [-BOX_HW - W - 0.05, -BOX_HW - W, BOX_ZB - W, BOX_ZF + W],
                   [BOX_HW + W, BOX_HW + W + 0.05, BOX_ZB - W, BOX_ZF + W]])
    tile(out, q[0], q[1], q[2], q[3], key, 0.001, C);
  const EH = 0.02;
  block(out, 0, EH / 2, BOX_ZB - W / 2, (R - L) / 2, EH / 2, W / 2, PAINT);
  block(out, 0, EH / 2, BOX_ZF + W / 2, (R - L) / 2, EH / 2, W / 2, PAINT);
  for (const sx of [-1, 1])
    block(out, sx * (BOX_HW + W / 2), EH / 2, (BOX_ZB + BOX_ZF) / 2,
          W / 2, EH / 2, (BOX_ZF - BOX_ZB) / 2, PAINT);
  for (let s = -1; s <= 1; s += 2) {
    tile(out, s * 4.25, s * 4.25 + 0.09, B + 0.8, BOX_ZB - W, WALK);
    tile(out, s * 4.25, s * 4.25 + 0.09, BOX_ZF + W, F, WALK);
  }
  const J = [0.042, 0.043, 0.048];
  for (let i = -2; i <= 2; i++) {
    const x = i * 2.4;
    const b2 = out.pos.length / 3;
    const p = [[x - 0.015, B], [x + 0.015, B], [x + 0.015, F], [x - 0.015, F]];
    for (let k = 0; k < 4; k++) { out.pos.push(p[k][0], 0.002, p[k][1]); out.nrm.push(0, 1, 0); out.col.push(J[0], J[1], J[2]); }
    pushMat(out, 4, MAT.ASPHALT);
    out.idx.push(b2, b2 + 2, b2 + 1, b2, b2 + 3, b2 + 2);
  }  if (lk) GarageDress.lookFloor(out, liv, lk);
}

const { seatDriverAt, boardInfo, boardKey, paintDress, paintBoards, buildDress, resetSpec, releaseDress } = GarageDress;

const { LIVE, paintLive, paintTrace } = GarageLive;
let liveTex = null, liveCanvas = null, liveFail = 0, liveRetryAt = 0;
const liveMesh = {};
const LIVE_OPTS = { glow: 0.62 }, FLOOR_DECAL_OPTS = { glow: 0 };

let logoGen = 0;
if (typeof LiveryTex !== "undefined" && LiveryTex.onMarkChange)
  LiveryTex.onMarkChange(() => { logoGen++; });
const DRESS_OPTS = { glow: 0.62 };

let exteriorFallbackMesh = null, floorMesh = null, trussMesh = null, trussLook = "", cacheKey = "";
const dressMesh = {};
let dressTex = null, dressFail = 0, dressRetryAt = 0;
let geomKey = "", liveKey = "", dressIdKey = "", dressFullKey = "", dressCanvas = null;
const propMesh = {};
const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
function appendBuf(out, b) {
  const base = out.pos.length / 3;
  for (let i = 0; i < b.pos.length; i++) out.pos.push(b.pos[i]);
  for (let i = 0; i < b.nrm.length; i++) out.nrm.push(b.nrm[i]);
  for (let i = 0; i < b.col.length; i++) out.col.push(b.col[i]);
  for (let i = 0; i < b.mat.length; i++) out.mat.push(b.mat[i]);
  for (let i = 0; i < b.idx.length; i++) out.idx.push(base + b.idx[i]);
}
function buildStatic(liv, opts) {
  const o = opts || {};
  const out = acc();
  buildShell(out, liv);
  buildTruss(out);
  buildBayFloor(out, liv);
  const led = {};
  for (let i = 0; i < SIDES.length; i++) led[SIDES[i]] = acc();
  buildLed(led, liv);
  for (let i = 0; i < SIDES.length; i++) appendBuf(out, led[SIDES[i]]);
  if (o.props) {
    const g = {};
    for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = acc();
    if (o.props === "lite") buildPropsLite(g, liv);
    else {
      buildProps(g, liv);
      if (o.equipment && typeof GarageEquipment !== "undefined") GarageEquipment.build(g, liv, o.ctx || {});
    }
    for (let i = 0; i < SIDES.length; i++) appendBuf(out, g[SIDES[i]]);
  }
  return out;
}

const _rkNow = [], _rkWas = [];
let _rkKeys = null;
function rkColour(out, c) {
  if (!c) { out.push(null, null, null, 0); return; }
  const v = rgb(c, [0, 0, 0]);
  out.push(v[0], v[1], v[2], 1);
}
function roomStamp(team, liv, info, ctx) {
  const o = _rkNow;
  o.length = 0;
  const d0 = seatDriverAt(team, 0), d1 = seatDriverAt(team, 1);
  o.push(team && team.id, (team && team.legend) || "", info, d0 && d0.num, d1 && d1.num, logoGen, GaragePrims.lookId());
  rkColour(o, liv && liv.c1); rkColour(o, liv && (liv.accent || liv.stripe || liv.c2)); rkColour(o, liv && liv.c2);
  rkColour(o, liv && liv.logo); rkColour(o, liv && liv.logo2); rkColour(o, liv && liv.logo3);
  o.push((liv && liv.sponsors) || "-", !!ctx);
  if (ctx) {
    const last = ctx.last, a = ctx.achievements, sp = ctx.sponsor;
    const hyd = ctx.track && typeof Tracks !== "undefined" && Tracks.circuitPayloadResident && Tracks.circuitPayloadResident(ctx.track) ? 1 : 0;
    o.push(ctx.track ? ctx.track.id : "-", hyd, ctx.weather, ctx.tod, ctx.wins | 0, !!ctx.night, !!ctx.career, ctx.round | 0,
      !!last, last && last.dnf, last && (last.p | 0), last && (last.pts | 0), sp && sp.label, !!ctx.studio,
      !!(a && a.active), a && a.facility, a && a.wins, a && a.podiums, a && a.titles);
  }
  return o;
}
function roomKeys(team, liv, info, ctx) {
  const st = roomStamp(team, liv, info, ctx);
  if (_rkKeys && st.length === _rkWas.length) {
    let same = true;
    for (let i = 0; i < st.length; i++) if (st[i] !== _rkWas[i]) { same = false; break; }
    if (same) return _rkKeys;
  }
  _rkWas.length = st.length;
  for (let i = 0; i < st.length; i++) _rkWas[i] = st[i];
  _rkKeys = roomKeyStrings(team, liv, info, ctx);
  return _rkKeys;
}
function roomKeyStrings(team, liv, info, ctx) {
  const drv = [seatDriverAt(team, 0), seatDriverAt(team, 1)];
  const kc = (c) => (c ? rgb(c, [0, 0, 0]).map((v) => v.toFixed(3)).join(",") : "-");
  const paint = `${kc(liv && liv.c1)}/${kc(liv && (liv.accent || liv.stripe || liv.c2))}/${kc(liv && liv.c2)}`;
  const marks = `${kc(liv && liv.logo)}/${kc(liv && liv.logo2)}/${kc(liv && liv.logo3)}`;
  const nums = `${drv[0] && drv[0].num}-${drv[1] && drv[1].num}`;
  const ck = ctxKey(ctx);
  const geom = `${team && team.id}|${(team && team.legend) || ""}|${paint}`
               + `|${hourNight(ctx) ? 1 : 0}|${(ctx && ctx.weather) || "-"}|${GarageExperience.careerKey(ctx)}|${GaragePrims.lookId()}`;
  const live = `${paint}|${(liv && liv.sponsors) || "-"}|${ck}`;
  const dressId = `${team && team.id}|${(team && team.legend) || ""}|${paint}|${marks}|${logoGen}|${nums}`;
  const board = boardKey(info);
  return { geom, live, dressId, board, key: `${geom}|${live}|${dressId}|${board}` };
}
function reuploadTex(old, canvas) {
  if (old && _gfx.refillTexture && _gfx.refillTexture(old, canvas)) return old;
  if (old && _gfx.freeTexture) _gfx.freeTexture(old);
  return _gfx.createTexture(canvas);
}
function uploadLive(team, liv, ctx, now) {
  if (!_gfx.createTexture || !_gfx.createTexMesh || typeof LiveryTex === "undefined") return;
  try {
    if (!liveCanvas) { liveCanvas = document.createElement("canvas"); liveCanvas.width = liveCanvas.height = LIVE; }
    paintLive(liveCanvas, team, liv, ctx);
    GarageExperience.paintCareer(liveCanvas, ctx);
    if ((!ctx || ctx.ambient !== false) && !(ctx && ctx.studio) && traceFail < 3) {
      lastTrace = ctx && Number.isFinite(ctx.sceneNow) ? ctx.sceneNow : now;
      try { paintTrace(liveCanvas, liv, lastTrace); traceFail = 0; }
      catch (e) { traceFail++; Log.warn("game", `GarageScene live trace failed: ${e && e.message}`); }
    }
    const prev = liveTex;
    liveTex = null;
    liveTex = reuploadTex(prev, liveCanvas);
    if (!liveTex || liveTex._phase === 4) throw new Error("live texture upload returned no handle");
    if (!liveMesh.mid) {
      const lg = GarageLive.build(FIXTURES);
      for (const k in lg) if (lg[k].idx.length) liveMesh[k] = _gfx.createTexMesh(lg[k]);
    }
    liveFail = 0; liveRetryAt = 0;
  } catch (e) {
    if (liveTex && _gfx.freeTexture) _gfx.freeTexture(liveTex);
    liveFail++; liveRetryAt = now + 1000; liveTex = null; Log.warn("game", `GarageScene live atlas failed: ${e && e.message}`); }
}
function rebuild(team, liv, info, ctx) {
  const { geom, live, dressId, board, key } = roomKeys(team, liv, info, ctx);
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const uploads = !!(_gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined");
  if (live !== liveKey) { liveFail = 0; liveRetryAt = 0; }
  if (key === cacheKey && shellMesh &&
      (liveTex || liveFail >= 3 || now < liveRetryAt || !uploads) &&
      (dressTex || dressFail >= 3 || now < dressRetryAt ||
       !_gfx.createTexture || !_gfx.createTexMesh || typeof LiveryTex === "undefined")) return;
  if (geom !== geomKey || !shellMesh) {
    dressFail = 0; dressRetryAt = 0; traceFail = 0;
    if (shellMesh) _gfx.freeMesh(shellMesh);
    for (let i = 0; i < SIDES.length; i++)
      if (ledMesh[SIDES[i]]) { _gfx.freeMesh(ledMesh[SIDES[i]]); ledMesh[SIDES[i]] = null; }
    if (floorMesh) _gfx.freeMesh(floorMesh);
    if (exteriorFallbackMesh) _gfx.freeMesh(exteriorFallbackMesh);
    if (mirrorFadeMesh) { _gfx.freeMesh(mirrorFadeMesh); mirrorFadeMesh = null; }
    for (let i = 0; i < SIDES.length; i++)
      if (propMesh[SIDES[i]]) { _gfx.freeMesh(propMesh[SIDES[i]]); propMesh[SIDES[i]] = null; }
    const look = GaragePrims.look();
    const shell = acc();
    buildShell(shell, liv, look);
    shellMesh = _gfx.createMesh(shell);
    if (!trussMesh || trussLook !== GaragePrims.lookId()) {
      if (trussMesh) _gfx.freeMesh(trussMesh);
      const truss = acc();
      buildTruss(truss, look, true);
      trussMesh = _gfx.createMesh(truss);
      trussLook = GaragePrims.lookId();
    }
    const led = {};
    for (let i = 0; i < SIDES.length; i++) led[SIDES[i]] = acc();
    buildLed(led, liv);
    if (look) GarageDress.lookLed(led, liv, look);
    for (let i = 0; i < SIDES.length; i++)
      if (led[SIDES[i]].idx.length) ledMesh[SIDES[i]] = _gfx.createMesh(led[SIDES[i]]);
    const flr = acc();
    buildBayFloor(flr, liv, look);
    const fallback = acc(); buildApron(fallback); buildPitLane(fallback, liv, hourNight(ctx));
    exteriorFallbackMesh = _gfx.createMesh(fallback);
    const bd = hourNight(ctx) ? [0.020, 0.022, 0.030] : [0.048, 0.052, 0.064];
    BACKDROP[0] = _bdBase[0] = bd[0]; BACKDROP[1] = _bdBase[1] = bd[1]; BACKDROP[2] = _bdBase[2] = bd[2];
    floorMesh = _gfx.createMesh(flr);
    const g = {};
    for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = acc();
    buildProps(g, liv);
    GarageEquipment.build(g, liv, ctx);
    GarageExperience.buildFacility(g, liv, ctx);
    if (look) GarageDress.lookProps(g, liv, look);
    for (let i = 0; i < SIDES.length; i++)
      if (g[SIDES[i]].idx.length) propMesh[SIDES[i]] = _gfx.createMesh(g[SIDES[i]]);
    resetSpec();
    geomKey = geom;
    liveKey = ""; liveFail = 0; liveRetryAt = 0;
    dressFullKey = "";
  }
  if (uploads && (live !== liveKey || !liveTex) && liveFail < 3 && now >= liveRetryAt) {
    uploadLive(team, liv, ctx, now);
    liveKey = live;
  }
  if (dressId !== dressIdKey) { dressCanvas = null; dressIdKey = dressId; }
  const dressFull = dressId + "|" + board;
  if (dressFull === dressFullKey && dressTex) { cacheKey = key; return; }
  const prevDress = dressTex;
  dressTex = null;
  if (!(dressFail < 3 && _gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined") &&
      prevDress && _gfx.freeTexture) _gfx.freeTexture(prevDress);
  if (dressFail < 3 && _gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined") {
    try {
      if (!dressCanvas) dressCanvas = paintDress(team, liv).canvas;
      paintBoards(dressCanvas, team, liv, info);
      dressTex = reuploadTex(prevDress, dressCanvas);
      if (!dressMesh.back) {
        const dg = buildDress(SIDES);
        for (let i = 0; i < SIDES.length; i++)
          if (dg[SIDES[i]].idx.length) dressMesh[SIDES[i]] = _gfx.createTexMesh(dg[SIDES[i]]);
      }
      if (!dressTex || dressTex._phase === 4) throw new Error("dress texture upload returned no handle");
      dressFail = 0; dressRetryAt = 0;
      dressFullKey = dressFull;
    } catch (e) {
      if (dressTex && _gfx.freeTexture) _gfx.freeTexture(dressTex);
      dressFail++; dressRetryAt = now + 1000; dressTex = null; dressCanvas = null;
      Log.warn("game", `GarageScene dress failed: ${e && e.message}`);
    }
  }
  cacheKey = key;
}

const FLOOR_OPTS = { roughness: 0.34, metalness: 0, specular: 0.46, clearcoat: 0 };
const SHELL_OPTS = { roughness: 0.86, metalness: 0.05, specular: 0.16, clearcoat: 0 };

const MAT_I = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function ctxKey(ctx) {
  if (!ctx) return "-";
  const last = ctx.last;
  const hyd = ctx.track && typeof Tracks !== "undefined" && Tracks.circuitPayloadResident && Tracks.circuitPayloadResident(ctx.track) ? 1 : 0;
  return `${ctx.track ? ctx.track.id : "-"}:${hyd}|${ctx.weather || "-"}|${ctx.tod || "-"}`
         + `|${ctx.wins | 0}|${ctx.night ? 1 : 0}|${ctx.career ? 1 : 0}|${ctx.round | 0}`
         + `|${last ? (last.dnf || "") + ":" + (last.p | 0) + ":" + (last.pts | 0) : "-"}`
         + `|${ctx.sponsor && ctx.sponsor.label || "-"}|${ctx.studio ? 1 : 0}|${GarageExperience.careerKey(ctx)}`;
}
let lastTrace = -1e9, traceFail = 0;
const shutterMat = new Float32Array(MAT_I), arrivalMirror = new Float32Array(MAT_MIRROR);
function draw(team, liv, eye, getParts, driverIdx, ctx, carMesh, arrival, carMat) {
  if (!_gfx) return;
  rebuild(team, liv, boardInfo(team, getParts, driverIdx, ctx), ctx);
  ensureDynamic();
  const now = ctx && Number.isFinite(ctx.sceneNow) ? ctx.sceneNow : typeof performance !== "undefined" ? performance.now() : Date.now();
  _gfx.draw(floorMesh, MAT_I, FLOOR_OPTS);
  if (!(ctx && ctx.realExterior)) _gfx.draw(exteriorFallbackMesh, MAT_I, FLOOR_OPTS);
  const studio = !!(ctx && ctx.studio);
  const ex = eye ? eye[0] : 0, ez = eye ? eye[2] : 0;
  const inside = _inside;
  inside.nx = ex > -HALF_W; inside.px = ex < HALF_W; inside.back = ez > Z_BACK;
  inside.door = ez < Z_DOOR; inside.mid = true; inside.shutter = ez < Z_DOOR;
  inside.barrier = ez < Z_DOOR && !arrival;
  if (!studio) {
  _gfx.draw(shellMesh, MAT_I, SHELL_OPTS);
  const hideRoof = spotName === "top";
  if (trussMesh && !hideRoof) _gfx.draw(trussMesh, MAT_I, SHELL_OPTS);
  shutterMat[5] = arrival ? (4.77 * (1 - arrival.door) + 0.06) / 2.86 : 1;
  shutterMat[13] = arrival ? 4.77 * (1 - shutterMat[5]) : 0;
  for (let i = 0; i < SIDES.length; i++) {
    if (!inside[SIDES[i]]) continue;
    if (propMesh[SIDES[i]]) _gfx.draw(propMesh[SIDES[i]], SIDES[i] === "shutter" ? shutterMat : MAT_I, SHELL_OPTS);
    if (ledMesh[SIDES[i]] && !(hideRoof && SIDES[i] === "mid")) _gfx.draw(ledMesh[SIDES[i]], MAT_I, LED_OPTS);
  }
  if (dressTex)
    for (let i = 0; i < SIDES.length; i++)
      if (inside[SIDES[i]] && dressMesh[SIDES[i]])
        _gfx.drawDecal(dressMesh[SIDES[i]], SIDES[i] === "shutter" ? shutterMat : MAT_I, dressTex, DRESS_OPTS);
  if (inside.back && fanMesh) _gfx.draw(fanMesh, mk(_mFan, FAN[0], FAN[1], Z_BACK + 0.17, 0, now * 0.0065), SHELL_OPTS);
  if (arrival && typeof GarageCrew !== "undefined") GarageCrew.draw(liv, eye, arrival, SHELL_OPTS, team && team.id);
  if (lampMesh) {
    mk(_mLamp, lampAim[0], 0, lampAim[1], lampAim[2], 0);
    _gfx.draw(lampMesh, _mLamp, SHELL_OPTS);
    if (lampAim[3]) _gfx.draw(lampFace, _mLamp, LED_OPTS);
  }
  {
    const cyc = (now / 1000) % 34;
    if ((!ctx || ctx.ambient !== false) && cyc < 6.5 && passMesh)
      _gfx.draw(passMesh, mk(_mPass, -24 + 48 * (cyc / 6.5), -0.04, PIT_FAST_Z, Math.PI / 2, 0), SHELL_OPTS);
  }
  const traceMs = (_gfx.isMobile || _gfx.mobileTier) ? 4000 : 1500;
  if ((!ctx || ctx.ambient !== false) && liveTex && liveCanvas && traceFail < 3 && (now < lastTrace || now - lastTrace > traceMs)) {
    lastTrace = now;
    try {
      paintTrace(liveCanvas, liv, now);
      const nextTex = _gfx.refillTexture && _gfx.refillTexture(liveTex, liveCanvas) ? liveTex : _gfx.createTexture(liveCanvas);
      if (!nextTex || nextTex._phase === 4) throw new Error("trace texture upload returned no handle");
      if (nextTex !== liveTex && _gfx.freeTexture) _gfx.freeTexture(liveTex);
      liveTex = nextTex;
      traceFail = 0;
    } catch (e) {
      traceFail++;
      Log.warn("game", `GarageScene live trace failed: ${e && e.message}`);
    }
  }
  }
  if (carMesh) {
    if (carMat) { arrivalMirror.set(carMat); arrivalMirror[1] = -carMat[1]; arrivalMirror[5] = -carMat[5]; arrivalMirror[9] = -carMat[9]; arrivalMirror[13] = -carMat[13]; }
    else arrivalMirror.set(MAT_MIRROR);
    const sheen = mirrorSheen(eye, carMat);
    if (sheen > 0.02) {
      _gfx.draw(carMesh, arrivalMirror, MIRROR_RESOLVE);
      if (ctx && ctx.departureWheels) ctx.departureWheels(arrivalMirror, MIRROR_RESOLVE);
      ensureMirrorFade(liv);
      if (mirrorFadeMesh) {
        _mirrorFadeOpts.alpha = 1 - sheen;
        _gfx.draw(mirrorFadeMesh, MAT_I, _mirrorFadeOpts);
      }
    }
  }
  if (studio) return;
  if (liveTex) {
    if (liveMesh.floor) _gfx.drawDecal(liveMesh.floor, MAT_I, liveTex, FLOOR_DECAL_OPTS);
    for (let i = 0; i < LIVE_DECAL_SIDES.length; i++) {
      const k = LIVE_DECAL_SIDES[i];
      if (inside[k] && liveMesh[k] && !(arrival && k === "door")) _gfx.drawDecal(liveMesh[k], MAT_I, liveTex, LIVE_OPTS);
    }
  }
}

function framingHull(data) {
  const p = data && data.pos;
  if (!p || !p.length) return null;
  const n = p.length / 3;
  let ylo = 1e9, yhi = -1e9;
  const M = 8, best = new Float64Array(M).fill(-1e9), bi = new Int32Array(M);
  const dx = new Float64Array(M), dz = new Float64Array(M);
  for (let k = 0; k < M; k++) { const a = Math.PI + 2 * Math.PI * k / M; dx[k] = Math.cos(a); dz[k] = Math.sin(a); }
  for (let i = 0; i < n; i++) {
    const x = -p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (y < ylo) ylo = y;
    if (y > yhi) yhi = y;
    for (let k = 0; k < M; k++) {
      const v = x * dx[k] + z * dz[k];
      if (v > best[k]) { best[k] = v; bi[k] = i; }
    }
  }
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const qx = new Float64Array(M), qz = new Float64Array(M);
  for (let k = 0; k < M; k++) { qx[k] = -p[bi[k] * 3]; qz[k] = p[bi[k] * 3 + 2]; }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = -p[i * 3], z = p[i * 3 + 2];
    let inside = true;
    for (let k = 0; k < M && inside; k++) {
      const j = (k + 1) % M;
      if ((qx[j] - qx[k]) * (z - qz[k]) - (qz[j] - qz[k]) * (x - qx[k]) <= 0) inside = false;
    }
    if (!inside) pts.push([x, z]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (arr) => {
    const h = [];
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      while (h.length >= 2 && cross2(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const rev = pts.slice().reverse();
  const ring = half(pts).concat(half(rev));
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    out.push(ring[i][0], ylo, ring[i][1]);
    out.push(ring[i][0], yhi, ring[i][1]);
  }
  return out;
}
function recentre(proj, view, vp, panelFrac, on, hull) {
  if (!on || !hull) return;
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < hull.length; i += 3) {
    const x = hull[i], y = hull[i + 1], z = hull[i + 2];
    const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (w <= 0.001) continue;
    const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
    if (nx < lo) lo = nx;
    if (nx > hi) hi = nx;
  }
  if (lo > hi) return;
  proj[8] += (lo + hi) / 2 + panelFrac;
  M4.mulTo(vp, proj, view);
}

const PREVIEW_SLOTS = 6;
const HULL_SLOTS = PREVIEW_SLOTS * 2;
const previewMeshes = new Map(), previewHulls = new Map();
function previewMesh(key, hullKey, build) {
  let ent = previewMeshes.get(key);
  if (ent) { previewMeshes.delete(key); previewMeshes.set(key, ent); return ent; }
  const data = build();
  let hull = previewHulls.get(hullKey);
  if (hull) previewHulls.delete(hullKey);
  else hull = framingHull(data);
  previewHulls.set(hullKey, hull);
  ent = { mesh: _gfx.createMesh(data), hull, hullKey };
  previewMeshes.set(key, ent);
  while (previewMeshes.size > PREVIEW_SLOTS) {
    const old = previewMeshes.keys().next().value;
    const victim = previewMeshes.get(old);
    _gfx.freeMesh(victim.mesh);
    previewMeshes.delete(old);
    if (victim.hullKey) {
      let used = false;
      for (const e of previewMeshes.values()) {
        if (e.hullKey === victim.hullKey) { used = true; break; }
      }
      if (!used) previewHulls.delete(victim.hullKey);
    }
  }
  if (previewHulls.size > HULL_SLOTS) {
    const live = new Set([...previewMeshes.values()].map((e) => e.hullKey));
    for (const k of [...previewHulls.keys()]) {
      if (previewHulls.size <= HULL_SLOTS) break;
      if (!live.has(k)) previewHulls.delete(k);
    }
  }
  return ent;
}
function dropPreviewMeshes() {
  for (const ent of previewMeshes.values()) _gfx.freeMesh(ent.mesh);
  previewMeshes.clear();
}

function prepare(team, liv, getParts, driverIdx, ctx) {
  if (!_gfx) return false;
  rebuild(team, liv, boardInfo(team, getParts, driverIdx, ctx), ctx);
  ensureDynamic();
  return prepared(team, liv, getParts, driverIdx, ctx);
}
function prepared(team, liv, getParts, driverIdx, ctx) {
  return !!shellMesh && roomKeys(team, liv, boardInfo(team, getParts, driverIdx, ctx), ctx).key === cacheKey;
}

function release() {
  if (!_gfx) return 0;
  let n = typeof GarageCrew !== "undefined" && GarageCrew.free ? GarageCrew.free() : 0;
  const fm = (m) => { if (m) { _gfx.freeMesh(m); n++; } return null; };
  const ft = (t) => { if (t && _gfx.freeTexture) { _gfx.freeTexture(t); n++; } return null; };
  shellMesh = fm(shellMesh); floorMesh = fm(floorMesh); exteriorFallbackMesh = fm(exteriorFallbackMesh); trussMesh = fm(trussMesh);
  for (const tbl of [ledMesh, propMesh, dressMesh, liveMesh]) for (const k of Object.keys(tbl)) { fm(tbl[k]); delete tbl[k]; }
  fanMesh = fm(fanMesh); lampMesh = fm(lampMesh); lampFace = fm(lampFace); passMesh = fm(passMesh); mirrorFadeMesh = fm(mirrorFadeMesh);
  dressTex = ft(dressTex); liveTex = ft(liveTex);
  for (const ent of previewMeshes.values()) fm(ent.mesh);
  previewMeshes.clear(); previewHulls.clear();
  dressCanvas = null; liveCanvas = null; releaseDress();
  cacheKey = ""; geomKey = ""; liveKey = ""; dressIdKey = ""; dressFullKey = ""; dressFail = 0; dressRetryAt = 0; liveFail = 0; liveRetryAt = 0; traceFail = 0; lastTrace = -1e9;
  _rigK0 = NaN; _rigK1 = NaN; _rigK2 = NaN; _rigMood = ""; _rig.length = 0; _chase.length = 0;
  return n;
}

function debug() {
  return { bay: [HALF_W * 2, Z_DOOR - Z_BACK, CEIL_Y], lights: lights(null).length / 15, key: cacheKey,
           geomKey, previewMeshes: previewMeshes.size, previewHulls: previewHulls.size };
}

  return { init, buildStatic, BACKDROP, SKYLIGHT, AMB_SKY, AMB_GROUND, lights, live, glareStr, CUES, cueLabel, cueLen, cueSample, CUE_SHA256, mood, setMood, moodDef, moodCtx, MOODS, hangerSpan, FIXTURES, LED_DROP, CEIL_Y, draw, framingHull, recentre,
           previewMesh, dropPreviewMeshes, pulse, spot, debug, seatDriverAt, ctxKey, prepare, prepared, release };
})();
if (typeof window !== "undefined") window.GarageScene = GarageScene;
