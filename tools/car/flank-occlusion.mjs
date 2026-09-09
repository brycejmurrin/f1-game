#!/usr/bin/env node
// Does the CAR hide it? — the third rung of the ladder, without a browser.
// @doc Ray-tests cover-flank stations against the real car mesh + wheels from a garage camera; reports what is hidden.
// @skill garage-parts-livery
//
// spine-station.mjs answers where a design lands on the flat atlas. It cannot
// answer whether anything stands in front of it, and that is not a nitpick: the
// rear tyre sits at z -1.6 with a 0.38 m radius while the flank band runs
// z -0.66 to -1.90, so the band's aft HALF is alongside the tyre, and the tyre
// is 0.5 m further outboard than the cover — from a side camera it projects
// straight over it. Red Bull's `wrap` crown hands every flank mark exactly that
// station, which took a 5-minute garage run to notice and is a two-second
// geometry question.
//
// It is a geometry question because everything it needs is already offline. The
// station's 3D point comes from the REAL decal mesh (CarMesh.carDecalData emits
// the spineSide quad with its UVs, so a region coordinate interpolates straight
// to a point on the skin — no reimplementation of the cover profile to drift).
// The occluders are the REAL body mesh plus the four wheels at their anchors.
// Both are projected through one perspective camera and bucketed in image
// space, which is a rasteriser's depth test done sample-first.
//
//   node tools/car/flank-occlusion.mjs                    # the SIDE preset
//   node tools/car/flank-occlusion.mjs --az=1.9 --el=0.3  # any garage camera
//   node tools/car/flank-occlusion.mjs --grid=64 --json
//
// The camera defaults to the garage SIDE preset as garage-angles shoots it
// (az PI/2, el 0.10, the 4.6 m zoom floor, orbit centre Car3D-measured
// [0, 0.45, 0.245]) so a verdict here is about the shot you would have taken.
// A DIFFERENT camera is a different answer — this reports one viewpoint, not a
// claim about every angle.
import { loadParts } from "./parts-sweep.mjs";
import { makeFlags, runCli } from "../lib/cli-args.mjs";

// game.js WHEELS. Rear tyres are the wide ones and the ones that matter here.
const WHEELS = [
  { x: -0.79, y: 0.34, z: 1.7, r: 0.32 }, { x: 0.79, y: 0.34, z: 1.7, r: 0.32 },
  { x: -0.76, y: 0.34, z: -1.6, r: 0.38 }, { x: 0.76, y: 0.34, z: -1.6, r: 0.38 },
];
// game.js SP_CAR_CTR / SP_VIEWS.side, and the SP_DIST_MIN zoom floor.
export const SIDE_CAM = { az: Math.PI / 2, el: 0.10, dist: 4.6, ctr: [0, 0.45, 0.245], fov: 36 };

function tris(m, out, off) {
  for (let i = 0; i < m.idx.length; i += 3) {
    const t = [];
    for (let k = 0; k < 3; k++) {
      const j = m.idx[i + k] * 3;
      t.push([m.pos[j] + (off ? off[0] : 0), m.pos[j + 1] + (off ? off[1] : 0), m.pos[j + 2] + (off ? off[2] : 0)]);
    }
    out.push(t);
  }
  return out;
}

/** Body + all four wheels, in car space, as world-space triangles. */
export function occluders(M, teamId) {
  const team = M.Teams.LIST.find((t) => t.id === teamId) || M.Teams.LIST[0];
  const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
  const body = M.Car3D.build([0.9, 0.1, 0.1], [1, 1, 1], { livery: {}, teamId: team.id, num: 16, parts });
  const out = tris(body, [], null);
  const cache = {};
  for (const w of WHEELS) {
    const built = cache[w.r] || (cache[w.r] = M.Car3D.buildWheelLayers(w.r, [0.1, 0.1, 0.1], [0.6, 0.2, 0.2], [0.7, 0.7, 0.7], false));
    tris(built.rotating, out, [w.x, w.y, w.z]);
    tris(built.fixed, out, [w.x, w.y, w.z]);
  }
  return { tris: out, parts, team };
}

/**
 * The spineSide decal quad, as the two triangles CarMesh actually emits, with
 * their region UVs. Read off the mesh so a change to the cover profile moves
 * this with it.
 */
export function flankQuad(M, team, parts) {
  const R = M.LiveryTex.REGIONS, S = M.LiveryTex.SIZE, SH = M.LiveryTex.SIZE_H || S;
  const d = M.CarMesh.carDecalData(1, parts, false, team.id, "standard", "dorsal");
  const reg = R.spineSide;
  const inReg = (u, v) => {
    const px = u * S, py = (1 - v) * SH;
    return px >= reg.x - 0.5 && px <= reg.x + reg.w + 0.5 && py >= reg.y - 0.5 && py <= reg.y + reg.h + 0.5;
  };
  // The +x quad is the one a camera at +x sees; spineSideL carries the mirror.
  const verts = [];
  for (let i = 0; i < d.pos.length / 3; i++) {
    const u = d.uv[i * 2], v = d.uv[i * 2 + 1];
    if (!inReg(u, v) || d.pos[i * 3] < 0) continue;
    verts.push({
      p: [d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]],
      // region-normalised: cu 0 at the region's canvas LEFT, cv 0 at its top.
      cu: (u * S - reg.x) / reg.w, cv: ((1 - v) * SH - reg.y) / reg.h,
    });
  }
  if (verts.length < 4) throw new Error(`the spineSide decal quad is not in the mesh (found ${verts.length} verts)`);
  return verts;
}

/**
 * Bilinear position for a region coordinate, off the quad's own corners.
 * `frontLeft` false: canvas-left is the REAR, so u (front-based) is 1 - cu.
 */
export function stationPoint(verts, u, v) {
  const cu = 1 - u;
  const pick = (wantU, wantV) => verts.reduce((best, q) =>
    (Math.abs(q.cu - wantU) + Math.abs(q.cv - wantV)) < (Math.abs(best.cu - wantU) + Math.abs(best.cv - wantV)) ? q : best);
  const a = pick(0, 0), b = pick(1, 0), c = pick(0, 1), e = pick(1, 1);
  const lerp = (p, q, t) => p.map((x, i) => x + (q[i] - x) * t);
  return lerp(lerp(a.p, b.p, cu), lerp(c.p, e.p, cu), v);
}

/** Camera basis + a projector. Right-handed, +Y up. */
export function camera({ az, el, dist, ctr, fov }, aspect = 16 / 9) {
  const ce = Math.cos(el), se = Math.sin(el);
  const eye = [ctr[0] + Math.sin(az) * dist * ce, ctr[1] + dist * se, ctr[2] + Math.cos(az) * dist * ce];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(sub(ctr, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = 1 / Math.tan((fov * Math.PI / 180) / 2);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return {
    eye,
    project(p) {
      const d = sub(p, eye), z = dot(d, fwd);
      if (z <= 1e-4) return null;
      return [dot(d, right) * f / (z * aspect), dot(d, up) * f / z, z];
    },
  };
}

const CELL = 0.02;   // image-space bucket, in projected units

/** Bucket projected triangles so a sample tests only its own neighbourhood. */
function buckets(cam, triangles) {
  const map = new Map();
  const key = (i, j) => i + "," + j;
  for (const t of triangles) {
    const p = [cam.project(t[0]), cam.project(t[1]), cam.project(t[2])];
    if (p.some((q) => !q)) continue;
    const x0 = Math.min(p[0][0], p[1][0], p[2][0]), x1 = Math.max(p[0][0], p[1][0], p[2][0]);
    const y0 = Math.min(p[0][1], p[1][1], p[2][1]), y1 = Math.max(p[0][1], p[1][1], p[2][1]);
    // A triangle spanning half the image is a floor or a wing plane; it still
    // has to go in every cell it covers or a sample over it reads as clear.
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
        const k = key(i, j);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(p);
      }
  }
  return map;
}

// Depth slack: the decal quad stands 14 mm proud of the skin it wraps, and the
// bodywork right under it projects to the same pixel. Anything within this of
// the station's own depth is the cover itself, not an occluder.
const SLACK = 0.05;

function hidden(cam, map, p) {
  const q = cam.project(p);
  if (!q) return true;
  const cell = map.get(Math.floor(q[0] / CELL) + "," + Math.floor(q[1] / CELL));
  if (!cell) return false;
  for (const t of cell) {
    const [a, b, c] = t;
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) continue;
    const w0 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / d;
    const w1 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    if (w0 * a[2] + w1 * b[2] + w2 * c[2] < q[2] - SLACK) return true;
  }
  return false;
}

/** Hidden fraction over the region, as a grid of region coordinates. */
export function occlusionMap(M, { team = "mclaren", cam = SIDE_CAM, grid = 48 } = {}) {
  const O = occluders(M, team);
  const verts = flankQuad(M, O.team, O.parts);
  const C = camera(cam);
  const map = buckets(C, O.tris);
  const cols = grid, rows = Math.max(4, Math.round(grid * 0.53));   // the region is 304x160
  const cell = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
    cell[j * cols + i] = hidden(C, map, stationPoint(verts, u, v)) ? 1 : 0;
  }
  return { cols, rows, cell, eye: C.eye };
}

/** The hidden share of one u-band, which is what a design occupies. */
export function hiddenIn(om, u0, u1, v0 = 0, v1 = 1) {
  let n = 0, h = 0;
  for (let j = 0; j < om.rows; j++) for (let i = 0; i < om.cols; i++) {
    const u = (i + 0.5) / om.cols, v = (j + 0.5) / om.rows;
    if (u < u0 || u > u1 || v < v0 || v > v1) continue;
    n++; h += om.cell[j * om.cols + i];
  }
  return n ? +(h / n).toFixed(3) : 0;
}

const KNOWN = ["--team", "--az", "--el", "--dist", "--grid", "--json"];

async function main() {
  // `--k=v` only, previously: `--team redbull` measured McLaren and said so
  // nowhere. Both spellings now, and an unknown flag stops the run.
  const F = makeFlags(process.argv.slice(2), KNOWN);
  const arg = (k, d) => F.flag("--" + k, d);
  const M = loadParts();
  const cam = Object.assign({}, SIDE_CAM, {
    az: +arg("az", SIDE_CAM.az), el: +arg("el", SIDE_CAM.el), dist: +arg("dist", SIDE_CAM.dist),
  });
  const team = arg("team", "mclaren");
  const om = occlusionMap(M, { team, cam, grid: +arg("grid", 48) });
  const bands = [];
  for (let k = 0; k < 10; k++) bands.push({ u0: k / 10, u1: (k + 1) / 10, hidden: hiddenIn(om, k / 10, (k + 1) / 10) });
  if (F.has("--json")) {
    console.log(JSON.stringify({ team, cam, eye: om.eye, whole: hiddenIn(om, 0, 1), bands }, null, 1));
    return;
  }
  console.log(`${team} — cover flank from az ${cam.az.toFixed(3)} el ${cam.el} dist ${cam.dist} `
    + `(eye ${om.eye.map((n) => n.toFixed(2)).join(", ")})`);
  console.log(`  hidden over the whole flank: ${(hiddenIn(om, 0, 1) * 100).toFixed(0)}%`);
  console.log("  u band     0.0  0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  0.9   (front -> rear)");
  console.log("  hidden %  " + bands.map((b) => String(Math.round(b.hidden * 100)).padStart(4)).join(" "));
  for (let j = 0; j < om.rows; j += Math.max(1, Math.round(om.rows / 12))) {
    let row = "";
    for (let i = 0; i < om.cols; i++) row += om.cell[j * om.cols + i] ? "#" : ".";
    console.log(`  v ${((j + 0.5) / om.rows).toFixed(2)}  ${row}`);
  }
  console.log("  (# = hidden. rows run crease -> sidepod, columns FRONT -> REAR)");
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli(main);
