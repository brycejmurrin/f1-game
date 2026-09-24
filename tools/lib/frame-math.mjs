// @doc Pure framing math for frame-report.mjs: projection, ray-cast vs boxes/terrain, occlusion, horizon, motion, flags.
/*
 * frame-math.mjs — JUDGE A CAMERA SHOT WITH ARITHMETIC, NOT PIXELS.
 *
 * Everything here is a pure function of plain data, so a unit test can build a
 * three-box world by hand and assert exact answers. The game-facing adapter
 * (tools/shot/frame-report.mjs) turns a built track into that data:
 *
 *   cam    makeCamera({ eye, tgt, fovDeg, aspect })       vertical FOV, no roll
 *   scene  { boxes, groundAt(x, z) -> { y, road, s }, maxGroundY, range }
 *          box = { x, y, z, w, h, d, rot?, kind, id, op, subj?, car? }
 *          `op` is OPACITY 0..1: a sparse hull (`structure` at 20 % fill) or a
 *          foliage canopy blocks only part of a ray. In the raster a partial
 *          box is a deterministic dither; in occlusion it is transmittance.
 *   subj   { pts: [[x,y,z]...], roadS: [s0, s1] | "all" | null, total }
 *
 * The raster is a ray cast, not a rasteriser: one ray per cell against every
 * box in the view cone plus a marched height field. Casting is exact for
 * boxes (a rasterised AABB rect over-covers anything seen at an angle) and has
 * no near-plane trouble, which is what painted "100 % tree" in the old text
 * raster when a pine stood beside the lens.
 */

export const DEG = 180 / Math.PI;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A look-at pinhole camera. +Y up, no roll (the flyby never rolls); fovDeg is
 *  VERTICAL, like M4.perspective / three.js. */
export function makeCamera({ eye, tgt, fovDeg = 50, aspect = 16 / 9, near = 0.9 }) {
  const f = norm(sub(tgt, eye));
  let r = cross(f, [0, 1, 0]);
  if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = [1, 0, 0];     // looking straight down/up
  r = norm(r);
  const u = cross(r, f);
  const tanY = Math.tan(fovDeg / DEG / 2), tanX = tanY * aspect;
  return {
    eye: eye.slice(), tgt: tgt.slice(), f, r, u, fovDeg, aspect, near, tanX, tanY,
    pitch: Math.asin(Math.max(-1, Math.min(1, f[1]))),
    yaw: Math.atan2(f[0], f[2]),                // same convention as track headings
    halfDiag: Math.atan(Math.hypot(tanX, tanY)),
  };
}

/** World point → NDC (x right, y up, both -1..1 in frame) and view depth. Null
 *  when the point is behind the near plane. */
export function project(cam, p) {
  const v = sub(p, cam.eye);
  const z = dot(v, cam.f);
  if (!(z > cam.near)) return null;
  return { x: dot(v, cam.r) / (z * cam.tanX), y: dot(v, cam.u) / (z * cam.tanY), depth: z };
}

/** NDC → unit world ray direction. */
export function rayDir(cam, nx, ny) {
  const a = nx * cam.tanX, b = ny * cam.tanY;
  return norm([cam.f[0] + cam.r[0] * a + cam.u[0] * b,
               cam.f[1] + cam.r[1] * a + cam.u[1] * b,
               cam.f[2] + cam.r[2] * a + cam.u[2] * b]);
}

/** Ray vs box (centre + size; optional `rot` = [cos, sin], the unit world-XZ
 *  direction of the box's local X axis, for boxes laid along the road). Returns entry distance
 *  (0 when the origin is inside) or Infinity. */
export function rayBox(o, d, b) {
  let ox = o[0] - b.x, oy = o[1] - b.y, oz = o[2] - b.z, dx = d[0], dy = d[1], dz = d[2];
  if (b.rot) {                                   // into the box frame: local X = rot
    const c = b.rot[0], s = b.rot[1];
    const rx = c * ox + s * oz, rz = -s * ox + c * oz; ox = rx; oz = rz;
    const qx = c * dx + s * dz, qz = -s * dx + c * dz; dx = qx; dz = qz;
  }
  let t0 = -Infinity, t1 = Infinity;
  const slab = (oo, dd, h) => {
    if (Math.abs(dd) < 1e-12) return Math.abs(oo) <= h;
    let a = (-h - oo) / dd, c = (h - oo) / dd;
    if (a > c) { const t = a; a = c; c = t; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    return t0 <= t1;
  };
  if (!slab(ox, dx, b.w / 2) || !slab(oy, dy, b.h / 2) || !slab(oz, dz, b.d / 2)) return Infinity;
  if (t1 < 0) return Infinity;
  return Math.max(0, t0);
}

export function insideBox(p, b, margin = 0) {
  let x = p[0] - b.x, z = p[2] - b.z;
  if (b.rot) { const c = b.rot[0], s = b.rot[1]; const rx = c * x + s * z; z = -s * x + c * z; x = rx; }
  return Math.abs(x) < b.w / 2 + margin && Math.abs(z) < b.d / 2 + margin && Math.abs(p[1] - b.y) < b.h / 2 + margin;
}

/** Boxes that can appear in this frame: within range and inside the view cone
 *  (bounding-sphere test against the half-diagonal of the frustum). */
export function cullBoxes(cam, boxes, range) {
  const out = [];
  for (const b of boxes) {
    const R = 0.5 * Math.hypot(b.w, b.h, b.d);
    const v = sub([b.x, b.y, b.z], cam.eye);
    const dist = Math.hypot(v[0], v[1], v[2]);
    if (dist - R > range) continue;
    if (dist <= R) { out.push(b); continue; }
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(v, cam.f) / dist)));
    if (ang - Math.asin(Math.min(1, R / dist)) <= cam.halfDiag) out.push(b);
  }
  return out;
}

// Deterministic per-(cell, box) dither in [0,1): a 30 %-opaque hull covers
// ~30 % of the cells it spans, the same every run.
function hash01(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** First ground hit along a ray, by marching the height field with a step that
 *  grows with distance, then bisecting. Returns { t, y, road, s } or null. */
export function marchGround(o, d, scene, tmax) {
  const { groundAt, maxGroundY } = scene;
  if (d[1] >= 0 && o[1] > maxGroundY) return null;
  let tPrev = 0, t = 0.5;
  const lim = Math.min(tmax, scene.range);
  while (t <= lim) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    if (d[1] >= 0 && y > maxGroundY) return null;
    const g = groundAt(x, z);
    if (g && y <= g.y) {
      let a = tPrev, b = t;
      for (let i = 0; i < 6; i++) {
        const m = (a + b) / 2;
        const gm = groundAt(o[0] + d[0] * m, o[2] + d[2] * m);
        if (gm && o[1] + d[1] * m <= gm.y) b = m; else a = m;
      }
      const gh = groundAt(o[0] + d[0] * b, o[2] + d[2] * b) || g;
      return { t: b, y: gh.y, road: !!gh.road, s: gh.s };
    }
    tPrev = t;
    t += Math.max(0.5, t * 0.02);
  }
  return null;
}

function inRoadS(subj, s) {
  if (!subj || subj.roadS == null || s == null) return false;
  if (subj.roadS === "all") return true;
  const [a, b] = subj.roadS;
  if (a <= b) return s >= a && s <= b;
  return s >= a || s <= b;                       // the range wraps the start line
}

/** Cast one ray; the cell's label. */
export function castRay(cam, scene, boxes, d, cellKey, subj) {
  let bestT = Infinity, best = null;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const t = rayBox(cam.eye, d, b);
    if (!(t < bestT) || t > scene.range) continue;
    if (b.op < 1 && hash01(cellKey, b._i != null ? b._i : i, 7) >= b.op) continue;
    bestT = t; best = b;
  }
  const g = marchGround(cam.eye, d, scene, bestT);
  if (g && g.t < bestT) {
    const isSubj = g.road && inRoadS(subj, g.s);
    return { cls: g.road ? "road" : "ground", t: g.t, subj: isSubj, box: null };
  }
  if (best) return { cls: best.car ? "car" : "prop", t: bestT, subj: !!best.subj, box: best };
  return { cls: d[1] > 0 ? "sky" : "ground", t: Infinity, subj: false, box: null };
}

/** Ray-cast the whole frame on a cols × rows grid of cell centres. */
export function castFrame(cam, scene, subj, cols, rows) {
  const boxes = cullBoxes(cam, scene.boxes, scene.range);
  boxes.forEach((b, i) => { if (b._i == null) b._i = i; });
  const cells = new Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const ny = 1 - (y + 0.5) / rows * 2;
    for (let x = 0; x < cols; x++) {
      const nx = (x + 0.5) / cols * 2 - 1;
      cells[y * cols + x] = castRay(cam, scene, boxes, rayDir(cam, nx, ny), y * cols + x, subj);
    }
  }
  return { cols, rows, cells, candidates: boxes.length };
}

/** How much of a straight segment eye → p survives: the product of (1 - op)
 *  over every box it passes through, and 0 if terrain rises above it. Boxes
 *  flagged `subj` never occlude their own subject. */
export function transmittance(eye, p, scene, boxes, skip) {
  const v = sub(p, eye), L = Math.hypot(v[0], v[1], v[2]);
  if (!(L > 0)) return { T: 1, by: [] };
  const d = [v[0] / L, v[1] / L, v[2] / L];
  let T = 1;
  const by = [];
  for (const b of boxes) {
    if (skip && skip(b)) continue;
    if (insideBox(p, b, 0.05)) continue;          // the target sits on/in it (a car on a kerb box)
    const t = rayBox(eye, d, b);
    if (t < L - 0.5) { T *= (1 - b.op); by.push({ b, t, op: b.op }); if (T < 1e-3) break; }
  }
  // Terrain: sample the segment; the endpoint itself is allowed to sit on the ground.
  const N = Math.min(60, Math.max(8, Math.ceil(L / 10)));
  for (let i = 1; i < N; i++) {
    const t = (i / N) * L;
    if (t > L - 2) break;
    const x = eye[0] + d[0] * t, y = eye[1] + d[1] * t, z = eye[2] + d[2] * t;
    const g = scene.groundAt(x, z);
    if (g && y < g.y - 0.3) { by.push({ b: { kind: g.road ? "road-crest" : "terrain", id: null }, t, op: 1 }); T = 0; break; }
  }
  return { T, by };
}

/** Distance from an NDC point to the nearest rule-of-thirds power point, in
 *  frame-width units (0 = on a power point, ~0.47 = a corner). */
export function thirdsDistance(nx, ny) {
  const u = (nx + 1) / 2, v = (ny + 1) / 2;
  let best = Infinity;
  for (const a of [1 / 3, 2 / 3]) for (const b of [1 / 3, 2 / 3]) best = Math.min(best, Math.hypot(u - a, v - b));
  return best;
}

/** Least-squares line through a per-column skyline (row index of the first
 *  non-sky cell; null where the whole column is sky/ground). Tilt in degrees
 *  of SCREEN angle, using the cell aspect so 1 row ≠ 1 column. */
export function fitHorizon(skyline, cols, rows, aspect) {
  const pts = [];
  skyline.forEach((r, x) => { if (r != null && r > 0 && r < rows) pts.push([x, r]); });
  if (pts.length < Math.max(3, cols * 0.25)) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  const slope = sxx > 0 ? sxy / sxx : 0;          // rows per column
  const cellW = aspect / cols, cellH = 1 / rows;   // screen units (height = 1)
  let rough = 0;
  for (const [x, y] of pts) rough += Math.abs(y - (my + slope * (x - mx)));
  return { row: my / rows, tiltDeg: Math.atan2(-slope * cellH, cellW) * DEG, coverage: n / cols, roughness: rough / n / rows };
}

/** Where the geometric horizon (elevation 0) crosses the frame, as a fraction
 *  from the top; <0 or >1 means it is off-frame. */
export function geomHorizon(cam) {
  return 0.5 + Math.tan(cam.pitch) / cam.tanY / 2;
}

/** Camera motion between two samples dt seconds apart. */
export function motion(a, b, dt) {
  if (!a || !b || !(dt > 0)) return null;
  const dEye = Math.hypot(b.eye[0] - a.eye[0], b.eye[1] - a.eye[1], b.eye[2] - a.eye[2]);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(a.f, b.f))));
  let dyaw = b.yaw - a.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  // PARALLAX: eye speed over distance to what it looks at. 100 m/s is a
  // crawl for a helicopter 800 m out and a blur for a camera 10 m from a car.
  const dist = Math.hypot(b.tgt[0] - b.eye[0], b.tgt[1] - b.eye[1], b.tgt[2] - b.eye[2]) || 1;
  return { eyeMps: dEye / dt, panDps: ang * DEG / dt, yawDps: dyaw * DEG / dt, parallaxDps: dEye / dt / dist * DEG,
           tiltDps: (b.pitch - a.pitch) * DEG / dt, zoomDps: (b.fovDeg - a.fovDeg) / dt };
}

const GLYPH = {
  sky: " ", ground: ".", road: "=", car: "c", subjRoad: "%", subjBox: "@",
  tree: "t", trunk: "i", building: "b", grandstand: "a", structure: "s", terrain: "^", barrier: "|", other: "o",
};
const TREE = /tree|pine|palm|cypress|acacia|broadleaf|conifer|bush|hedge/i;
export function kindClass(kind) {
  if (!kind) return "other";
  if (TREE.test(kind)) return "tree";
  if (/building|house|motorhome|pit|garage|tower/.test(kind)) return "building";
  if (/grandstand/.test(kind)) return "grandstand";
  if (kind === "structure") return "structure";
  if (/ridge|mountain|hill|peak/.test(kind)) return "terrain";
  if (/wall|fence|guardrail|armco|tyre|barrier/.test(kind)) return "barrier";
  return "other";
}
export const LEGEND = "' ' sky  . ground  = road  % SUBJECT road  @ SUBJECT prop  c/C car  t tree canopy  i trunk  b building  a grandstand  s structure  ^ ridge  | barrier  o other;  UPPERCASE = nearer than 30 m";

function cellGlyph(c, nearM) {
  let g;
  if (c.subj) g = c.box ? (c.box.car ? "C" : GLYPH.subjBox) : GLYPH.subjRoad;
  else if (c.cls === "prop") g = c.box.part === "trunk" ? GLYPH.trunk : (GLYPH[kindClass(c.box.kind)] || "o");
  else if (c.cls === "car") g = GLYPH.car;
  else g = GLYPH[c.cls] || "?";
  if (c.box && c.t < nearM && /[a-z]/.test(g)) g = g.toUpperCase();
  return g;
}

/** Downsample a cast into a character thumbnail: each character is the label
 *  that wins its block, a subject label winning with a third of the block. */
export function asciiThumb(frame, tcols, trows, nearM = 30) {
  const { cols, rows, cells } = frame;
  const bx = cols / tcols, by = rows / trows, lines = [];
  for (let ty = 0; ty < trows; ty++) {
    let line = "";
    for (let tx = 0; tx < tcols; tx++) {
      const votes = {};
      let n = 0, subj = 0, subjG = null;
      for (let y = Math.floor(ty * by); y < Math.floor((ty + 1) * by); y++) {
        for (let x = Math.floor(tx * bx); x < Math.floor((tx + 1) * bx); x++) {
          const c = cells[y * cols + x], g = cellGlyph(c, nearM);
          votes[g] = (votes[g] || 0) + 1; n++;
          if (c.subj) { subj++; subjG = g; }
        }
      }
      let g;
      if (subjG && subj * 3 >= n) g = subjG;
      else g = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
      line += g;
    }
    lines.push(line);
  }
  return lines;
}

/** Subject points → frame coverage numbers (independent of the raster). */
export function subjectGeometry(cam, pts) {
  let inF = 0, front = 0, sx = 0, sy = 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const proj = [];
  for (const p of pts) {
    const q = project(cam, p);
    proj.push(q);
    if (!q) continue;
    front++;
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) { inF++; sx += q.x; sy += q.y; }
  }
  const clipped = [];
  if (front) {
    if (x0 < -1) clipped.push("left"); if (x1 > 1) clipped.push("right");
    if (y1 > 1) clipped.push("top"); if (y0 < -1) clipped.push("bottom");
  }
  if (front < pts.length) clipped.push("behind");
  const cx = inF ? sx / inF : null, cy = inF ? sy / inF : null;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const bboxPct = front ? (clamp(x1) - clamp(x0)) * (clamp(y1) - clamp(y0)) / 4 * 100 : 0;
  return {
    proj, inFramePct: pts.length ? inF / pts.length * 100 : 0,
    bboxPct: Math.max(0, bboxPct), clipped,
    centroid: cx == null ? null : [cx, cy],
    centreDist: cx == null ? null : Math.hypot(cx, cy) / Math.SQRT2,
    thirdsDist: cx == null ? null : thirdsDistance(cx, cy),
  };
}

/** Aggregate a cast frame into the report's coverage numbers. */
export function frameStats(frame, nearM = 30) {
  const { cols, rows, cells } = frame, N = cols * rows;
  const cnt = { sky: 0, ground: 0, road: 0, prop: 0, car: 0, subj: 0 };
  const kinds = {}, carIds = new Set(), subjCarIds = new Set();
  const thirds = [0, 0, 0], thirdN = [0, 0, 0];
  let nearest = null;
  const skyline = new Array(cols).fill(null);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[y * cols + x];
      cnt[c.cls]++;
      if (c.subj) cnt.subj++;
      if (c.cls !== "sky" && skyline[x] == null) skyline[x] = y;
      const th = Math.min(2, Math.floor(x / cols * 3));
      thirdN[th]++;
      if (c.box) {
        if (c.box.car) { carIds.add(c.box.id); if (c.subj) subjCarIds.add(c.box.id); }
        if (!c.subj && !c.box.car) {
          const k = kindClass(c.box.kind);
          kinds[k] = (kinds[k] || 0) + 1;
          if (c.t < nearM) thirds[th]++;
          if (!nearest || c.t < nearest.t) nearest = { t: c.t, kind: c.box.kind, id: c.box.id, third: th, box: c.box };
        }
      }
    }
  }
  // an all-sky column's skyline is the bottom; an all-ground column's is the top (0)
  for (let x = 0; x < cols; x++) if (skyline[x] == null) skyline[x] = rows;
  const pct = (n) => n / N * 100;
  const kindPct = {};
  for (const k of Object.keys(kinds)) kindPct[k] = pct(kinds[k]);
  return {
    skyPct: pct(cnt.sky), groundPct: pct(cnt.ground), roadPct: pct(cnt.road), propPct: pct(cnt.prop),
    carPct: pct(cnt.car), subjectPct: pct(cnt.subj), kindPct,
    nearThirdsPct: thirds.map((n, i) => n / thirdN[i] * 100),
    nearest, skyline, carsVisible: carIds.size, subjectCarsVisible: subjCarIds.size,
  };
}

/** Rule-based flags + a provisional 0..100 score. Thresholds are named here so
 *  an agent can read why a frame was flagged. */
export const THRESH = {
  subjectMinPct: 2, subjectMaxPct: 55, subjectHiddenPct: 50, steepPitchDeg: 25, tooCloseM: 15, nearObsThirdPct: 25, nearObsFramePct: 12,
  skyMaxPct: 65, groundMaxPct: 70, panMaxDps: 25, parallaxMaxDps: 30,
};
export function judge(r) {
  const f = [];
  const T = THRESH;
  if (r.eye.insideProp) f.push(`EYE_INSIDE:${r.eye.insideProp}`);
  if (r.eye.belowGround) f.push("EYE_BELOW_GROUND");
  const s = r.subject;
  if (s) {
    const subjCover = s.coverPct;
    if (subjCover < T.subjectMinPct) f.push(`SUBJECT_SMALL(${subjCover.toFixed(1)}%)`);
    if (subjCover > T.subjectMaxPct) f.push(`SUBJECT_FILLS_FRAME(${subjCover.toFixed(0)}%)`);
    if (s.inFramePct < 50 && s.kind !== "lap") f.push(`SUBJECT_OFF_FRAME(${s.inFramePct.toFixed(0)}% in)`);
    if (s.visiblePct != null && s.visiblePct < 100 - T.subjectHiddenPct) {
      const who = s.occluders[0] ? s.occluders[0].kind : "?";
      f.push(`SUBJECT_OCCLUDED(${s.visiblePct.toFixed(0)}% visible, by ${who})`);
    }
  }
  // Looking down with no horizon anywhere in frame: the "filmed a kerb from
  // above" shot. geomRowFrac < 0 means elevation 0 is above the top edge.
  if (r.horizon && r.horizon.geomRowFrac < 0 && r.eye.pitchDeg < -T.steepPitchDeg) f.push(`STEEP_DOWN(${r.eye.pitchDeg.toFixed(0)}deg, no horizon)`);
  if (r.eye.tgtDistM != null && r.eye.tgtDistM < T.tooCloseM && s && s.kind !== "cars") f.push(`AIM_TOO_CLOSE(${r.eye.tgtDistM.toFixed(0)}m)`);
  const nt = r.nearThirdsPct;
  const sides = ["left", "centre", "right"];
  nt.forEach((p, i) => { if (p > T.nearObsThirdPct) f.push(`NEAR_OBSTRUCTION_${sides[i].toUpperCase()}(${p.toFixed(0)}% ${r.nearest ? r.nearest.kind : ""} <30m)`); });
  if (r.skyPct > T.skyMaxPct) f.push(`SKY_HEAVY(${r.skyPct.toFixed(0)}%)`);
  if (r.groundPct > T.groundMaxPct) f.push(`EMPTY_GROUND(${r.groundPct.toFixed(0)}%)`);
  // No flag for skyline slope: the flyby never rolls, so the TRUE horizon is
  // level by construction and a sloping skyline is sloping scenery. The
  // number is reported (horizon.tiltDeg) for a camera that does roll.
  if (r.motion && !r.motion.cut) {
    if (r.motion.panDps > T.panMaxDps) f.push(`FAST_PAN(${r.motion.panDps.toFixed(0)}deg/s)`);
    if (r.motion.parallaxDps > T.parallaxMaxDps) f.push(`FAST_MOVE(${r.motion.parallaxDps.toFixed(0)}deg/s parallax)`);
  }
  // Provisional score: start at 100, pay for each defect in proportion.
  let score = 100;
  if (r.eye.insideProp) score -= 60;
  if (r.eye.belowGround) score -= 60;
  if (r.horizon && r.horizon.geomRowFrac < 0 && r.eye.pitchDeg < -T.steepPitchDeg) score -= 25;
  if (s) {
    score -= Math.max(0, T.subjectMinPct * 4 - s.coverPct) * 4;
    score -= Math.max(0, s.coverPct - T.subjectMaxPct) * 0.8;
    if (s.visiblePct != null) score -= (100 - s.visiblePct) * 0.4;
    if (s.thirdsDist != null) score -= Math.max(0, Math.min(s.thirdsDist, s.centreDist != null ? s.centreDist : 1) - 0.12) * 40;
    if (s.kind !== "lap") score -= (100 - s.inFramePct) * 0.15;
  }
  score -= Math.max(0, Math.max(...nt) - 10) * 0.6;
  score -= Math.max(0, r.skyPct - T.skyMaxPct) * 0.5 + Math.max(0, r.groundPct - T.groundMaxPct) * 0.5;
  return { flags: f, score: Math.max(0, Math.round(score)) };
}
