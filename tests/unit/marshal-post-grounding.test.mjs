// marshalPost style geometry must seat roofs on walls and chain the signal
// pole to the hut. ground-audit (GAP=0.15, TOUCH=0.05) flagged monaco/spa/
// brands_hatch poles + roofs as unsupported clusters when cabin/kiosk/tent
// roofs sat 0.27-0.30 m above the wall and the pole stood 1.4 m off the face
// with only a 0.35 m foot sink (2026-10-07). Pure Node — records instance ops.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function recordStyles(styles) {
  const sb = { Math, Map, Set, Object, Array, JSON, Number, Float32Array, Float64Array };
  vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/scenery/data.js", "js/track/scenery/structures.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb, { filename: f });
  const TG = sb.TrackGeom, n = 40;
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  const hw = new Float32Array(n).fill(6), px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = k * 4;
  const models = new Map();
  const S = sb.SceneryStructures.create({
    out, track: {}, def: { id: "stub" }, n, ds: 4, hw, px, py, pz, NIGHT: false, MAT: TG.MAT,
    addBox: TG.addBox, addCyl: TG.addCyl, addFrustum: TG.addFrustum, addPrism: TG.addPrism, RAW: TG,
    blockAt() {}, post() {}, recordBarrier() {}, indexBarrier() {},
    groundYAt: () => 0, terrainYAt: () => 0, onTrack: () => false, overheadSpan: () => true, rejBox: () => false,
    hash: () => 0.5, cross: TG.cross, norm: TG.norm, vadd: TG.vadd,
    anchor: (k, side, gap) => ({ c: [side * (6 + gap), 0, k * 4], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] }),
    kitOf: (_key, def) => def, noteSuppressed() {}, note() {},
    instance(key, _place, build) {
      if (models.has(key)) return;
      const ops = [];
      build({
        mat() {},
        box: (c, sz, col) => ops.push({ op: "box", c, sz, col }),
        prism: (c, sz, col) => ops.push({ op: "prism", c, sz, col }),
        cyl: (c, rad, h, col, seg) => ops.push({ op: "cyl", c, rad, h, col, seg }),
        frustum: (c, rB, rT, h, col, seg) => ops.push({ op: "frustum", c, rB, rT, h, col, seg }),
      });
      models.set(key, ops);
    },
  });
  styles.forEach((style, i) => S.marshalPost(i, 1, 4, { style }));
  return models;
}

/** Local-Y extent of a recorded op (canonical space, +Y up). */
function ySpan(op) {
  if (op.op === "box") return [op.c[1] - op.sz[1] / 2, op.c[1] + op.sz[1] / 2];
  if (op.op === "prism") return [op.c[1], op.c[1] + op.sz[1]];           // base-anchored
  if (op.op === "cyl" || op.op === "frustum") return [op.c[1], op.c[1] + op.h];
  return [0, 0];
}

test("marshalPost styles seat the roof on the wall and chain the pole to the hut", () => {
  const styles = ["hut", "cabin", "kiosk", "tent", "tower", "bunker", "container"];
  const models = recordStyles(styles);
  assert.equal(models.size, styles.length, "one model per style");
  for (const style of styles) {
    const key = [...models.keys()].find((k) => k.includes(`|${style}|`));
    assert.ok(key, `model for ${style}`);
    const ops = models.get(key);
    // Signal pole is the tall thin cyl at POLE_LAT (corner legs of tent/kiosk/
    // tower are shorter and sit on a ±1.0/1.1 grid, not exactly 1.12).
    const pole = ops.find((o) => o.op === "cyl" && Math.abs(Math.abs(o.c[0]) - 1.12) < 1e-9 && o.h >= 4.5);
    assert.ok(pole, `${style}: signal pole present at back face`);
    assert.ok(pole.c[1] <= -0.9, `${style}: pole foot sunk ≥ 0.9 m for grade (got ${pole.c[1]})`);
    // Mass the roof sits on: wall box, or for tower the deck, or tent the legs' top.
    const masses = ops.filter((o) =>
      (o.op === "box" && o.sz[0] >= 1.5 && o.sz[2] >= 1.5 && o.sz[1] >= 0.15) ||
      (o.op === "cyl" && o !== pole && Math.abs(o.c[0]) < 1.15));
    assert.ok(masses.length >= 1, `${style}: has a supporting mass`);
    const massTop = Math.max(...masses.map((o) => ySpan(o)[1]));
    const roofs = ops.filter((o) => o.op === "prism" ||
      (o.op === "box" && o.sz[1] <= 1.05 && o.sz[0] >= 2.4 && Math.abs(o.c[0]) < 0.5));
    assert.ok(roofs.length >= 1, `${style}: has a roof`);
    for (const roof of roofs) {
      const [y0] = ySpan(roof);
      assert.ok(y0 <= massTop + 0.05, `${style}: roof base ${y0.toFixed(2)} seats on mass top ${massTop.toFixed(2)}`);
    }
    // Pole r-extent overlaps some wall or the brace arm (TOUCH chain).
    const poleR0 = pole.c[0] - pole.rad, poleR1 = pole.c[0] + pole.rad;
    const chained = ops.some((o) => {
      if (o === pole) return false;
      if (o.op === "box") {
        const a = o.c[0] - o.sz[0] / 2, b = o.c[0] + o.sz[0] / 2;
        return a <= poleR1 + 0.05 && b >= poleR0 - 0.05;
      }
      return false;
    });
    assert.ok(chained, `${style}: pole AABB touches the hut or brace`);
  }
});
