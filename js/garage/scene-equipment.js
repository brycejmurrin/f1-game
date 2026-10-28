/* Apex 26 — GarageEquipment: the pit equipment standing in the bay. The rear jack, the wheel guns on their hose reels, the tyre trolleys, floor boxes, the fan, the trophy cabinet and the timing-screen housing, built into the per-wall groups by build(g, liv, ctx). Split out of scene.js. */
const GarageEquipment = (function () {
  "use strict";
  const { Z_BACK, STEEL, DARK, block, cyl, tube, hose, MAT, scale, rgb, tile } = GaragePrims;

const RUBBER = [0.045, 0.045, 0.050];
const HOSE = [0.12, 0.14, 0.20];   // module-local paint colour (hoseReel / serviceRig)
const FAN = [4.5, 3.32];
const SCREEN = [2.9, 3.30, 5.15];   // shared with the blades and the live atlas quad
const COMPOUND = [[0.85, 0.12, 0.12], [0.92, 0.80, 0.10], [0.88, 0.88, 0.90],
                  [0.10, 0.60, 0.25], [0.15, 0.35, 0.85]];   // S M H, inter, wet
// Castors roll along Z, with horizontal axles and forks joining the chassis.
// Eight segments put a vertex exactly on the floor (Y=0).
function caster(out, x, z, radius) {
  tube(out, [x - 0.035, radius, z], [x + 0.035, radius, z], radius, RUBBER, 8);
  tube(out, [x - 0.048, radius, z], [x + 0.048, radius, z], radius * 0.36, STEEL, 8, MAT.METAL);
  for (const sx of [-1, 1]) block(out, x + sx * 0.043, radius + 0.05, z, 0.008, 0.06, 0.018, STEEL, MAT.METAL);
}
// Blender study coordinates (X right, Y back, Z up) → game Y-up metres.
// turn is a quarter turn: +1 faces +X, -1 faces -X, 0 faces +Z.
// Ported from the editable three-prop study; use existing runtime materials.
function workshopFrame(out, x, z, c1, baseY, turn) {
  const point = (p) => [x + (turn ? -turn * p[1] : p[0]), (baseY || 0) + p[2], z + (turn ? -turn * p[0] : -p[1])];
  const box = (p, size, color) => {
    const q = point(p), sx = turn ? size[1] : size[0], sz = turn ? size[0] : size[1];
    block(out, q[0], q[1], q[2], sx / 2, size[2] / 2, sz / 2, color, color === STEEL ? MAT.METAL : MAT.FLAT);
  };
  const rod = (a, b, r, color, segments) => tube(out, point(a), point(b), r, color, segments || 10, color === STEEL ? MAT.METAL : MAT.FLAT);
  return { box, rod, paint: scale(c1, 0.85) };
}
function noseTrolley(out, x, z, c1) {
  const { box, rod, paint } = workshopFrame(out, x, z, c1, 0, 0);
  for (const sx of [-0.4, 0.4]) {
    box([sx, 0, 0.18], [0.065, 1.2, 0.065], STEEL);
    for (const y of [-0.46, 0.46]) {
      rod([sx - 0.025, y, 0.07], [sx + 0.025, y, 0.07], 0.07, RUBBER, 12);
      rod([sx - 0.04, y, 0.07], [sx + 0.04, y, 0.07], 0.018, STEEL);
      box([sx, y, 0.135], [0.085, 0.035, 0.08], STEEL);
    }
    for (const y of [-0.37, 0.37]) {
      rod([sx, y, 0.2], [sx, y, 0.59], 0.025, STEEL);
      rod([sx, y + 0.16, 0.2], [sx, y, 0.5], 0.018, STEEL);
    }
    box([sx, 0, 0.62], [0.11, 0.96, 0.07], RUBBER);
    for (const y of [-0.48, 0.48]) box([sx, y, 0.66], [0.12, 0.035, 0.12], paint);
    rod([sx, 0.52, 0.2], [sx, 0.6, 0.95], 0.022, STEEL);
  }
  for (const y of [-0.48, 0.48]) box([0, y, 0.18], [0.8, 0.055, 0.065], paint);
  rod([-0.4, 0.6, 0.95], [0.4, 0.6, 0.95], 0.025, RUBBER);
}
function wheelGunDock(out, x, z, c1) {
  const { box, rod, paint } = workshopFrame(out, x, z, c1, 0, -1);
  box([0, 0, 0.025], [0.48, 0.43, 0.05], STEEL);
  rod([0, 0, 0.05], [0, 0, 0.78], 0.04, STEEL);
  box([0, 0, 0.8], [0.54, 0.39, 0.05], paint);
  for (const sx of [-0.25, 0.25]) box([sx, 0, 0.85], [0.025, 0.39, 0.08], STEEL);
  box([0, 0.18, 0.85], [0.54, 0.025, 0.08], STEEL);
  for (const sx of [-0.14, 0.14]) box([sx, -0.04, 0.855], [0.055, 0.17, 0.06], RUBBER);
  rod([-0.19, -0.04, 0.94], [0.16, -0.04, 0.94], 0.07, paint, 12);
  rod([-0.28, -0.04, 0.94], [-0.19, -0.04, 0.94], 0.039, STEEL);
  rod([0.08, -0.04, 0.93], [0.08, -0.04, 0.84], 0.026, RUBBER);
  for (const sx of [-0.12, 0]) rod([sx, 0.11, 0.825], [sx, 0.11, 0.9], 0.03, STEEL);
  rod([0.16, 0.11, 0.825], [0.16, 0.11, 0.89], 0.018, STEEL);
  rod([0.035, 0, 0.5], [0.18, 0, 0.5], 0.012, STEEL);
  rod([0.18, 0, 0.5], [0.18, 0, 0.55], 0.012, STEEL);
}
function radioRack(out, x, z, c1, baseY) {
  const { box, rod, paint } = workshopFrame(out, x, z, c1, baseY, 1);
  box([0, 0, 0.03], [0.7, 0.34, 0.06], STEEL);
  box([0, 0.14, 0.26], [0.7, 0.035, 0.46], STEEL);
  for (const sx of [-0.255, -0.085, 0.085, 0.255]) {
    box([sx, 0, 0.09], [0.13, 0.19, 0.06], paint);
    box([sx, 0, 0.22], [0.09, 0.065, 0.23], RUBBER);
    box([sx, -0.034, 0.26], [0.06, 0.008, 0.065], STEEL);
    rod([sx + 0.025, 0, 0.33], [sx + 0.025, 0, 0.49], 0.006, RUBBER, 8);
    rod([sx - 0.025, 0, 0.335], [sx - 0.025, 0, 0.35], 0.009, STEEL, 8);
    box([sx, -0.098, 0.1], [0.018, 0.008, 0.008], [0.08, 0.8, 0.3]);
  }
  box([0, 0.118, 0.1], [0.58, 0.05, 0.05], RUBBER);
  rod([0.35, 0.1, 0.1], [0.385, 0.1, 0.1], 0.012, STEEL);
}
function starterCart(out, cx, cz, c1) {
  block(out, cx, 0.40, cz, 0.30, 0.24, 0.24, scale(c1, 0.55));
  block(out, cx, 0.66, cz, 0.31, 0.02, 0.25, STEEL);
  // Three drawer fronts and pulls on the aisle-facing side.
  for (const y of [0.28, 0.42, 0.56]) {
    block(out, cx, y, cz + 0.245, 0.26, 0.058, 0.008, scale(c1, 0.32));
    block(out, cx, y + 0.018, cz + 0.262, 0.11, 0.009, 0.012, STEEL, MAT.METAL);
  }
  block(out, cx + 0.12, 0.72, cz - 0.05, 0.06, 0.04, 0.04, [0.75, 0.15, 0.10]);
  block(out, cx - 0.10, 0.688, cz - 0.05, 0.08, 0.008, 0.05, DARK); // charge display
  for (let i = 0; i < 3; i++) block(out, cx - 0.15 + i * 0.045, 0.699, cz - 0.05, 0.015, 0.004, 0.028, [0.2, 0.9, 0.3]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(out, cx + sx * 0.24, cz + sz * 0.18, 0.06);
  for (const sz of [-1, 1]) tube(out, [cx - 0.3, 0.20, cz + sz * 0.18], [cx - 0.55, 0.95, cz + sz * 0.18], 0.02, STEEL, 6, MAT.METAL);
  tube(out, [cx - 0.55, 0.95, cz - 0.18], [cx - 0.55, 0.95, cz + 0.18], 0.025, RUBBER, 8);
  // Umbilical is parked at the cart, clear of the car and the walk aisle.
  hose(out, [[cx + 0.2, 0.62, cz], [cx + 0.55, 0.22, cz + 0.28], [cx + 0.40, 0.08, cz + 0.08], [cx + 0.75, 0.08, cz + 0.42]], 0.02, [0.48, 0.22, 0.06], 6);
}
function tyreTrolley(out, x, z, comps, c1) {
  const dark = scale(STEEL, 0.55);
  for (const sx of [-1, 1]) tube(out, [x + sx * 0.42, 0.58, z - 1.3], [x + sx * 0.42, 0.58, z + 1.3], 0.025, STEEL, 6, MAT.METAL);
  for (const ez of [-1.3, 1.3]) tube(out, [x - 0.42, 0.58, z + ez], [x + 0.42, 0.58, z + ez], 0.025, STEEL, 6, MAT.METAL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    caster(out, x + sx * 0.38, z + sz * 1.2, 0.05);
    tube(out, [x + sx * 0.38, 0.15, z + sz * 1.2], [x + sx * 0.42, 0.58, z + sz * 1.2], 0.022, STEEL, 6, MAT.METAL);
  }
  // Lower rails support the tyres; the end handle stays below the pit board.
  for (const sz of [-1, 1]) tube(out, [x - 0.38, 0.15, z + sz * 1.2], [x + 0.38, 0.15, z + sz * 1.2], 0.025, STEEL, 6, MAT.METAL);
  for (const sx of [-1, 1]) {
    tube(out, [x + sx * 0.12, 0.12, z - 1.3], [x + sx * 0.12, 0.12, z + 1.3], 0.025, STEEL, 6, MAT.METAL);
    tube(out, [x + sx * 0.42, 0.58, z + 1.3], [x + sx * 0.42, 0.94, z + 1.3], 0.025, STEEL, 6, MAT.METAL);
  }
  tube(out, [x - 0.42, 0.94, z + 1.3], [x + 0.42, 0.94, z + 1.3], 0.03, RUBBER, 8);
  for (let i = 0; i < 4; i++) {
    const wz = z - 1.0 + i * 0.68;
    tube(out, [x - 0.17, 0.44, wz], [x + 0.17, 0.44, wz], 0.34, RUBBER, 14);
    tube(out, [x - 0.15, 0.44, wz], [x + 0.15, 0.44, wz], 0.36, scale(c1, 0.6), 14);   // blanket
    tube(out, [x - 0.10, 0.44, wz], [x - 0.20, 0.44, wz], 0.20, scale(STEEL, 0.9), 10, MAT.METAL);   // rim face
    block(out, x + 0.17, 0.62, wz, 0.012, 0.08, 0.12, COMPOUND[comps[i]]);          // sticker
    hose(out, [[x + 0.19, 0.30, wz], [x + 0.30, 0.20, wz + 0.1], [x + 0.30, 0.20, z + 1.45]], 0.012, HOSE, 5);
  }
  block(out, x + 0.30, 0.42, z + 1.50, 0.10, 0.14, 0.06, dark);                     // blanket controller
  for (let l = 0; l < 4; l++) block(out, x + 0.30 + (l % 2 ? 0.04 : -0.04), 0.50 + (l < 2 ? 0.04 : -0.02), z + 1.565, 0.012, 0.012, 0.005, l % 3 ? [0.2, 0.9, 0.3] : [0.9, 0.5, 0.1]);   // status LEDs
}
// Full-detail workshop models. The trackside lite bay keeps its cheaper recipe.
function toolChest(out, x, z, c1) {
  const s = x > 0 ? -1 : 1;
  block(out, x, 0.62, z, 0.36, 0.52, 0.80, scale(c1, 0.55));
  block(out, x, 1.16, z, 0.38, 0.03, 0.82, STEEL);
  for (let d = 0; d < 4; d++) {
    block(out, x + s * 0.37, 0.26 + d * 0.24, z, 0.012, 0.09, 0.72, scale(c1, 0.32));
    block(out, x + s * 0.39, 0.28 + d * 0.24, z, 0.010, 0.015, 0.24, STEEL, MAT.METAL);
  }
  block(out, x - s * 0.36, 1.22, z, 0.02, 0.025, 0.82, STEEL, MAT.METAL);
  for (const sz of [-1, 1]) block(out, x, 1.22, z + sz * 0.80, 0.36, 0.025, 0.02, STEEL, MAT.METAL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(out, x + sx * 0.26, z + sz * 0.60, 0.05);
}
function rearJack(out, x, z, c1) {
  const team = scale(c1, 0.85);
  block(out, x, 0.13, z, 0.36, 0.05, 0.09, team);
  for (const sx of [-1, 1]) caster(out, x + sx * 0.34, z, 0.06);
  cyl(out, x + 0.08, 0.16, z - 0.06, 0.06, 0.16, STEEL, 8, MAT.METAL);
  block(out, x + 0.08, 0.33, z - 0.06, 0.12, 0.025, 0.07, RUBBER);
  tube(out, [x, 0.20, z - 0.07], [x + 0.70, 0.62, z - 1.0], 0.03, STEEL, 6, MAT.METAL);
  tube(out, [x + 0.08, 0.18, z - 0.12], [x + 0.45, 0.43, z - 0.63], 0.045, team, 6);
  tube(out, [x + 0.48, 0.62, z - 1.03], [x + 0.92, 0.62, z - 1.03], 0.025, RUBBER, 8);
}
function wheelGun(out, x, z, direction, side, c1, baseY) {
  const y = baseY || 0;
  tube(out, [x, y + 0.12, z - direction * 0.10], [x, y + 0.12, z + direction * 0.16], 0.065, scale(c1, 0.85), 8);
  tube(out, [x, y + 0.12, z + direction * 0.16], [x, y + 0.12, z + direction * 0.30], 0.032, STEEL, 8, MAT.METAL);
  tube(out, [x, y + 0.12, z - direction * 0.10], [x, y + 0.12, z - direction * 0.14], 0.068, DARK, 8);
  tube(out, [x, y + 0.10, z], [x + side * 0.10, y + 0.04, z], 0.032, RUBBER, 6);
  block(out, x + side * 0.055, y + 0.105, z + direction * 0.035, 0.012, 0.025, 0.018, [0.75, 0.15, 0.10]);
  tube(out, [x + side * 0.08, y + 0.04, z], [x + side * 0.12, y + 0.05, z], 0.022, STEEL, 6, MAT.METAL);
}
function hoseReel(out, x, y, z, c1) {
  tube(out, [x - 0.075, y, z], [x + 0.075, y, z], 0.18, HOSE, 12);
  for (const sx of [-1, 1]) {
    tube(out, [x + sx * 0.08, y, z], [x + sx * 0.105, y, z], 0.21, scale(c1, 0.55), 12);
    block(out, x + sx * 0.13, y + 0.15, z, 0.015, 0.12, 0.045, STEEL, MAT.METAL);
  }
  tube(out, [x - 0.15, y, z], [x + 0.15, y, z], 0.04, STEEL, 8, MAT.METAL);
  tube(out, [x - 0.13, y + 0.27, z], [x + 0.13, y + 0.27, z], 0.02, STEEL, 6, MAT.METAL);
}
function wingRack(out, x, z, side, c1) {
  for (const sz of [-1, 1]) {
    block(out, x + side * 0.08, 0.04, z + sz * 0.85, 0.22, 0.04, 0.12, DARK);
    tube(out, [x, 0.08, z + sz * 0.85], [x, 1.16, z + sz * 0.85], 0.03, STEEL, 6, MAT.METAL);
  }
  tube(out, [x, 1.16, z - 0.85], [x, 1.16, z + 0.85], 0.025, STEEL, 6, MAT.METAL);
  for (let w = 0; w < 2; w++) {
    const y = 0.52 + w * 0.46;
    for (const sz of [-1, 1]) {
      tube(out, [x, y - 0.07, z + sz * 0.60], [x + side * 0.39, y - 0.07, z + sz * 0.60], 0.025, STEEL, 6, MAT.METAL);
      block(out, x + side * 0.18, y - 0.035, z + sz * 0.60, 0.18, 0.02, 0.035, RUBBER);
      block(out, x + side * 0.16, y + 0.07, z + sz * 0.84, 0.26, 0.13, 0.02, DARK);
    }
    for (let flap = 0; flap < 4; flap++)
      block(out, x + side * flap * 0.11, y + flap * 0.018, z, 0.06, 0.014, 0.82, scale(c1, 0.55 + flap * 0.08));
  }
}
function extinguisher(out, x, z, side) {
  const red = [0.72, 0.09, 0.07];
  block(out, x - side * 0.17, 0.55, z, 0.025, 0.24, 0.10, STEEL, MAT.METAL);
  tube(out, [x - side * 0.17, 0.39, z], [x, 0.39, z], 0.018, STEEL, 6, MAT.METAL);
  cyl(out, x, 0.32, z, 0.075, 0.44, red, 12);
  cyl(out, x, 0.45, z, 0.077, 0.14, [0.85, 0.85, 0.82], 12);
  block(out, x + side * 0.078, 0.52, z, 0.004, 0.07, 0.035, [0.85, 0.85, 0.82]); // aisle-facing label
  cyl(out, x, 0.76, z, 0.025, 0.05, STEEL, 8, MAT.METAL);
  tube(out, [x, 0.81, z - 0.05], [x, 0.81, z + 0.05], 0.012, DARK, 6);
  tube(out, [x, 0.835, z - 0.05], [x, 0.835, z + 0.05], 0.009, red, 6);
  hose(out, [[x + side * 0.035, 0.79, z + 0.03], [x + side * 0.12, 0.70, z + 0.05], [x + side * 0.12, 0.43, z + 0.05], [x + side * 0.10, 0.37, z + 0.04]], 0.012, RUBBER, 5);
}
function rollingStool(out, x, z, c1) {
  cyl(out, x, 0.52, z, 0.20, 0.06, scale(c1, 0.5), 12);
  cyl(out, x, 0.15, z, 0.035, 0.37, STEEL, 8, MAT.METAL);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, dx = Math.cos(a) * 0.22, dz = Math.sin(a) * 0.22;
    tube(out, [x, 0.16, z], [x + dx, 0.10, z + dz], 0.022, STEEL, 6, MAT.METAL);
    caster(out, x + dx, z + dz, 0.04);
  }
}
function floorFan(out, x, z, c1) {
  cyl(out, x, 0, z, 0.23, 0.045, DARK, 12);
  cyl(out, x, 0.045, z, 0.24, 0.012, scale(c1, 0.5), 12);
  tube(out, [x, 0.055, z], [x - 0.07, 0.35, z], 0.025, STEEL, 6, MAT.METAL);
  const cy = 0.35, radius = 0.28;
  for (const sx of [-1, 1]) {
    const ring = [];
    for (let i = 0; i <= 16; i++) {
      const a = i * Math.PI * 2 / 16;
      ring.push([x + sx * 0.07, cy + Math.cos(a) * radius, z + Math.sin(a) * radius]);
    }
    hose(out, ring, 0.01, STEEL, 4, MAT.METAL);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 4, dy = Math.cos(a) * radius, dz = Math.sin(a) * radius;
    tube(out, [x + 0.075, cy - dy, z - dz], [x + 0.075, cy + dy, z + dz], 0.008, STEEL, 4, MAT.METAL);
    const b = i * Math.PI / 2;
    tube(out, [x - 0.07, cy + Math.cos(b) * radius, z + Math.sin(b) * radius], [x + 0.07, cy + Math.cos(b) * radius, z + Math.sin(b) * radius], 0.01, STEEL, 4, MAT.METAL);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    tube(out, [x, cy + Math.cos(a) * 0.06, z + Math.sin(a) * 0.06], [x, cy + Math.cos(a + 0.25) * 0.22, z + Math.sin(a + 0.25) * 0.22], 0.045, scale(STEEL, 0.65), 4, MAT.METAL);
  }
  tube(out, [x - 0.08, cy, z], [x + 0.08, cy, z], 0.055, DARK, 10);
}
function serviceRig(out, x, z, c1) {
  block(out, x, 0.66, z, 0.42, 0.50, 0.36, scale(c1, 0.5));
  block(out, x, 0.18, z, 0.41, 0.025, 0.35, STEEL);
  block(out, x, 1.18, z, 0.44, 0.03, 0.38, STEEL);
  cyl(out, x, 1.21, z, 0.14, 0.40, scale(STEEL, 0.75), 12, MAT.METAL);
  cyl(out, x, 1.61, z, 0.04, 0.09, STEEL, 8, MAT.METAL);
  tube(out, [x, 1.71, z - 0.05], [x, 1.71, z + 0.05], 0.014, [0.75, 0.15, 0.10], 6);
  block(out, x - 0.43, 0.97, z, 0.012, 0.14, 0.18, DARK);
  tube(out, [x - 0.44, 1.0, z - 0.06], [x - 0.465, 1.0, z - 0.06], 0.065, STEEL, 12, MAT.METAL);
  tube(out, [x - 0.465, 1.0, z - 0.06], [x - 0.47, 1.0, z - 0.06], 0.05, [0.85, 0.85, 0.82], 12);
  block(out, x - 0.476, 1.01, z - 0.06, 0.005, 0.025, 0.006, [0.75, 0.15, 0.10]);
  for (const sz of [-1, 1]) {
    tube(out, [x - 0.36, 0.80, z + sz * 0.26], [x - 0.40, 1.30, z + sz * 0.26], 0.022, STEEL, 6, MAT.METAL);
    for (const sx of [-1, 1]) caster(out, x + sx * 0.30, z + sz * 0.26, 0.06);
  }
  tube(out, [x - 0.40, 1.30, z - 0.26], [x - 0.40, 1.30, z + 0.26], 0.025, RUBBER, 8);
  hose(out, [[x - 0.08, 1.50, z], [x - 0.30, 1.25, z + 0.10], [x - 0.30, 0.90, z + 0.10], [x - 0.25, 0.65, z + 0.10]], 0.02, HOSE, 6);
}
function wheelDolly(out, x, z, c1) {
  block(out, x, 0.18, z, 0.55, 0.035, 0.30, scale(c1, 0.55));
  for (const sx of [-1, 1]) {
    tube(out, [x + sx * 0.22, 0.25, z - 0.27], [x + sx * 0.22, 0.25, z + 0.27], 0.055, RUBBER, 8);
    for (const sz of [-1, 1]) caster(out, x + sx * 0.42, z + sz * 0.22, 0.05);
    tube(out, [x + sx * 0.42, 0.20, z + 0.22], [x + sx * 0.42, 0.64, z + 0.22], 0.022, STEEL, 6, MAT.METAL);
  }
  tube(out, [x - 0.42, 0.64, z + 0.22], [x + 0.42, 0.64, z + 0.22], 0.025, RUBBER, 8);
}

function buildEquipment(g, liv, ctx) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const dark = scale(STEEL, 0.55);
  // Parked outside the rear sight line.
  rearJack(g.mid, 2.85, -4.55, c1);
  // WHEEL GUNS on their hoses. A boom off each cable tray carries a reel over
  // the box with its hose RETRACTED — the first pass ran a hose from each reel
  // straight down to each gun, and four 5 m diagonals crossing the car read
  // as guy-lines in every preset. Between stops the guns lie by their wheels
  // on a coil of hose from a floor manifold at the box edge, which is what a
  // real bay looks like and keeps everything below knee height.
  // z -1.75, in the gap between the side walls' wordmark bays (z -1.1..1.1
  // and -2.4..-4.6): at z 0.1 the reel and its drop hung straight in front of
  // the middle wordmark, which the SIDE preset reads as a sign cut in two.
  const BZ = -1.75;
  for (const sd of [-1, 1]) {
    const bx = sd * 2.3;
    tube(g.mid, [sd * 4.6, 4.40, BZ], [bx, 4.40, BZ], 0.045, dark, 6, MAT.METAL);   // boom
    for (let i = 0; i < 3; i++)
      block(g.mid, sd * (2.9 + i * 0.6), 4.40, BZ, 0.02, 0.09, 0.02, STEEL);        // hangers
    hoseReel(g.mid, bx, 4.13, BZ, c1);
    hose(g.mid, [[bx, 3.95, BZ], [bx, 3.50, BZ]], 0.025, HOSE, 6);
    block(g.mid, bx, 3.46, BZ, 0.04, 0.05, 0.04, STEEL);                             // coupling
    block(g.mid, sd * 2.36, 0.08, BZ, 0.10, 0.08, 0.24, dark);                       // floor manifold
    for (const wz of [1.7, -1.6]) {
      const gx = sd * 2.65;
      const gz = wz + (wz > 0 ? 0.55 : -0.55);
      const cz = wz * 0.55;
      // The coil: six short legs zig-zagging at floor level beside the manifold.
      const pts = [[sd * 2.36, 0.08, BZ + (wz > 0 ? 0.14 : -0.14)]];
      for (let k = 0; k < 6; k++)
        pts.push([sd * (2.05 + (k % 2 ? 0.22 : -0.02)), 0.035 + (k % 3) * 0.02, cz + (k - 2.5) * 0.11]);
      pts.push([gx + sd * 0.12, 0.05, gz]);
      hose(g.mid, pts, 0.024, HOSE, 6);
      wheelGun(g.mid, gx, gz, wz > 0 ? -1 : 1, sd, c1);
    }
  }
  // Existing parking positions and static wall batches are preserved.
  starterCart(g.mid, -1.95, -4.75, c1);
  const wet = ctx && (ctx.weather === "wet" || ctx.weather === "rain");
  tyreTrolley(g.back, 3.65, -4.85, wet ? [3, 3, 4, 4] : [0, 0, 1, 1], c1);
  tyreTrolley(g.back, -3.65, -4.85, wet ? [3, 4, 1, 1] : [1, 2, 2, 0], c1);
  // FLOOR: a painted box at each wheel and the hazard hatch at the threshold.
  const PAINT = [0.66, 0.67, 0.70];
  const HAZ = [0.80, 0.68, 0.10];
  for (const w of [[0.79, 1.7], [-0.79, 1.7], [0.76, -1.6], [-0.76, -1.6]]) {
    const x = w[0];
    const z = w[1];
    const hx = 0.30;
    const hz = 0.46;
    const t = 0.035;
    tile(g.mid, x - hx, x + hx, z - hz, z - hz + t, PAINT, 0.003, MAT.ASPHALT);
    tile(g.mid, x - hx, x + hx, z + hz - t, z + hz, PAINT, 0.003, MAT.ASPHALT);
    tile(g.mid, x - hx, x - hx + t, z - hz, z + hz, PAINT, 0.003, MAT.ASPHALT);
    tile(g.mid, x + hx - t, x + hx, z - hz, z + hz, PAINT, 0.003, MAT.ASPHALT);
  }
  for (let i = -7; i <= 7; i++)
    tile(g.mid, i * 0.40 - 0.13, i * 0.40 + 0.13, 5.62, 5.98, i % 2 ? HAZ : DARK, 0.003, MAT.ASPHALT);
  // CONDUIT drops off the cable trays to a junction box on each side wall.
  for (const sd of [-1, 1]) {
    const w = sd < 0 ? g.nx : g.px;
    for (const z of [-2.3, 2.3]) {
      hose(w, [[sd * 4.6, 3.60, z], [sd * 5.30, 3.40, z], [sd * 5.30, 2.05, z]], 0.03, scale(STEEL, 0.5), 6, MAT.METAL);
      block(w, sd * 5.30, 1.92, z, 0.05, 0.11, 0.09, scale(STEEL, 0.45));
    }
  }
  // EXTRACTOR FAN housing, high on the back wall; the blades are a separate
  // mesh so they can turn (fanMesh, drawn in draw()).
  // At y 3.32, r 0.36 (top at 3.68): the FRONT preset's frame tops out at
  // y 3.76 on this wall and cut it at 3.75 and again at 3.45; the pit board
  // below tops out at 2.92.
  tube(g.back, [FAN[0], FAN[1], Z_BACK + 0.02], [FAN[0], FAN[1], Z_BACK + 0.22], 0.36, scale(STEEL, 0.7), 16, MAT.METAL);
  tube(g.back, [FAN[0], FAN[1], Z_BACK + 0.10], [FAN[0], FAN[1], Z_BACK + 0.24], 0.32, [0.03, 0.032, 0.038], 16);   // the dark throat
  for (let i = 0; i < 3; i++) {                                                  // guard bars
    const a = i * Math.PI / 3;
    const dx = Math.cos(a) * 0.33;
    const dy = Math.sin(a) * 0.33;
    tube(g.back, [FAN[0] - dx, FAN[1] - dy, Z_BACK + 0.27], [FAN[0] + dx, FAN[1] + dy, Z_BACK + 0.27], 0.012, STEEL, 5, MAT.METAL);
  }
  // TROPHY CABINET, counter height under the +X pit board: a glass case the
  // career fills. Empty in free play it still holds the two helmets.
  {
    const cx = 4.55;
    const cz = Z_BACK + 0.32;
    const wins = Math.min(8, (ctx && ctx.wins) | 0);
    block(g.back, cx, 0.55, cz, 0.62, 0.55, 0.30, scale(c1, 0.45));               // plinth
    block(g.back, cx, 1.40, cz, 0.64, 0.30, 0.32, DARK);                           // case back
    block(g.back, cx, 1.40, cz + 0.30, 0.64, 0.30, 0.008, [0.22, 0.26, 0.32]);     // glass (dark, reflective look)
    block(g.back, cx, 1.24, cz, 0.60, 0.012, 0.28, scale(STEEL, 0.9));             // shelf
    for (let i = 0; i < wins; i++) {                                               // trophies
      const tx = cx - 0.50 + (i % 4) * 0.33;
      const ty = i < 4 ? 1.25 : 1.55;
      cyl(g.back, tx, ty, cz, 0.05, 0.03, [0.85, 0.70, 0.25], 8, MAT.METAL);
      cyl(g.back, tx, ty + 0.03, cz, 0.018, 0.10, [0.92, 0.78, 0.30], 6, MAT.METAL);
      cyl(g.back, tx, ty + 0.13, cz, 0.045, 0.08, [0.95, 0.82, 0.32], 8, MAT.METAL);
    }
    if (wins < 5) block(g.back, cx, 1.55, cz, 0.60, 0.012, 0.28, scale(STEEL, 0.9));   // upper shelf
    for (const hx of [-0.42, 0.42]) {                                              // the drivers' helmets
      cyl(g.back, cx + hx, wins < 5 ? 1.565 : 1.25, cz, 0.11, 0.16, scale(c1, 1.1), 10);
      cyl(g.back, cx + hx, (wins < 5 ? 1.565 : 1.25) + 0.16, cz, 0.09, 0.05, scale(c1, 1.1), 10);
      block(g.back, cx + hx, (wins < 5 ? 1.565 : 1.25) + 0.10, cz + 0.10, 0.07, 0.03, 0.02, [0.06, 0.06, 0.07]);   // visor
    }
  }
  // TIMING SCREEN over the door end, hung from the truss and facing the car —
  // the REAR and HERO presets look straight at it. The face is a dress quad
  // from the live atlas (buildLive); this is only the housing and its hangers.
  // Off-centre (x +2.9, top-left from the REAR preset) so the shutter's
  // wordmark stays readable behind it, and at y 3.3 because that preset's
  // frame tops out at y 3.62 on the door wall.
  block(g.mid, SCREEN[0], SCREEN[1], SCREEN[2], 0.92, 0.72, 0.05, DARK);
  block(g.mid, SCREEN[0], SCREEN[1], SCREEN[2] + 0.04, 0.96, 0.76, 0.02, scale(STEEL, 0.5));   // bezel
  for (const hx of [-0.7, 0.7]) tube(g.mid, [SCREEN[0] + hx, SCREEN[1] + 0.72, SCREEN[2]], [SCREEN[0] + hx, 4.98, SCREEN[2]], 0.02, STEEL, 6, MAT.METAL);
}


  // HOSE stays module-local (hoseReel / serviceRig paint). COMPOUND + starterCart /
  // tyreTrolley / rearJack stay exported — garage-mesh unit seams.
  return { RUBBER, FAN, SCREEN, COMPOUND, noseTrolley, wheelGunDock, radioRack, starterCart, tyreTrolley, toolChest, rearJack, wheelGun, hoseReel, wingRack, extinguisher, rollingStool, floorFan, serviceRig, wheelDolly, build: buildEquipment };
})();
if (typeof window !== "undefined") window.GarageEquipment = GarageEquipment;
