#!/usr/bin/env node
// @doc Node-only FRAMING REPORT of flyby shots/poses: subject cover, occlusion, sky, near obstructions, motion, ASCII.
// @skill playwright-probe
/*
 * frame-report.mjs — JUDGE A SHOT WITHOUT RENDERING IT.
 *
 * tools/shot/flyby.mjs photographs the flyby through SwiftShader: ~10 s a
 * frame, a minute of boot per circuit, and at the end an agent squinting at a
 * JPEG. Most of what that picture is consulted for is geometry — is the subject
 * in frame, how big, is a tree trunk filling the left third, is it all sky —
 * and the game already knows that geometry: every circuit registers its
 * scenery as world-space boxes (track.props), the terrain is kept for
 * Tracks.terrainY, the road is a sampled spline, and FlybySeq.solve() is a pure
 * function of (track, u). So this boots the game in a node VM
 * (tools/lib/game-vm.cjs, ~3 s), ray-casts a coarse frame against those boxes
 * (tools/lib/frame-math.mjs) and prints numbers.
 *
 *   node tools/shot/frame-report.mjs --track monza                # every shot: start/mid/end
 *   node tools/shot/frame-report.mjs --track monaco --u 0.55,0.6  # exact points
 *   node tools/shot/frame-report.mjs --track bahrain --frames 18 --thumb 0
 *   node tools/shot/frame-report.mjs --track monza --shots scratch/shots.json
 *   node tools/shot/frame-report.mjs --track monza --pose=520,12,300:480,1,330:40 --subject corner:first
 *   node tools/shot/frame-report.mjs --track monza --json > artifacts/fr.json
 *
 * WHAT IT CANNOT SEE: materials, lighting, fog, billboards' faces, the look of
 * anything. Props are axis-aligned boxes (a long grandstand at 45 degrees
 * over-covers), trees are a trunk + a 80 %-opaque canopy box, sparse `structure`
 * hulls are dithered by their fill. It answers "what is where in the frame",
 * and a render is still the sign-off for "does it look good".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeFlags, CliArgError, runCli } from "../lib/cli-args.mjs";
import * as FM from "../lib/frame-math.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

const KNOWN = ["--track", "--u", "--frames", "--shots", "--pose", "--subject", "--json", "--out",
               "--thumb", "--aspect", "--range", "--res", "--quiet"];

function readShots(file) {
  const raw = fs.readFileSync(path.resolve(file), "utf8");
  const body = raw.replace(/^\s*(?:window\.)?[A-Za-z_$][\w$]*\s*=\s*/, "").replace(/;\s*$/, "");
  try { return JSON.parse(body); } catch (_) { return (0, eval)("(" + body + ")"); }
}

// The live flyby's length, read from its owner so a retune cannot desync
// the motion numbers (deg/s and m/s need a clock).
function flyMs() {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/loading-screen.js"), "utf8");
  const m = /const FLY_MS = (\d+)/.exec(src);
  return m ? +m[1] : 24000;
}

// ---------------------------------------------------------------------------
// The world as boxes + a height field
// ---------------------------------------------------------------------------

const TREEISH = /tree|pine|palm|cypress|acacia|broadleaf|conifer/i;

/** track.props → cast boxes. Opacity is a judgement per kind, named here. */
function propBoxes(track, FlybySeq) {
  const out = [];
  track.props.list.forEach((p, i) => {
    if (!(p.w > 0 && p.h > 0 && p.d > 0)) return;
    const base = { kind: p.kind, id: i, rec: p };
    if (TREEISH.test(p.kind)) {
      // A trunk you cannot see through and a canopy you mostly cannot. Where
      // the canopy starts is a per-species judgement: a stone pine is an
      // umbrella on a bare stem, a palm a tuft on a pole.
      const y0 = p.y - p.h / 2, tw = Math.max(0.35, Math.min(p.w, p.d) * 0.12);
      const c0 = /stonePine|palm/.test(p.kind) ? 0.6 : /cypress/.test(p.kind) ? 0.1 : 0.35;
      out.push({ ...base, x: p.x, y: y0 + p.h * c0 / 2 + 0.1, z: p.z, w: tw, h: p.h * c0 + 0.2, d: tw, op: 1, part: "trunk" });
      out.push({ ...base, x: p.x, y: y0 + p.h * (1 + c0) / 2, z: p.z, w: p.w * 0.85, h: p.h * (1 - c0), d: p.d * 0.85,
                 op: 0.8, part: "canopy" });
      return;
    }
    if (p.kind === "gantry") {
      // A beam across the road on two posts, not a wall: keep the top third.
      out.push({ ...base, x: p.x, y: p.y + p.h / 3, z: p.z, w: p.w, h: p.h / 3, d: p.d, op: 1, solid: true });
      return;
    }
    if (/ridge|mountain|hill|peak/.test(p.kind)) {
      // An AABB round a mountain is mostly sky: stack three shrinking tiers so
      // the silhouette is a stepped pyramid, not a rectangle.
      const y0 = p.y - p.h / 2;
      for (let t = 0; t < 3; t++) {
        const k = 1 - t / 3;
        out.push({ ...base, x: p.x, y: y0 + p.h * (t + 0.5) / 3, z: p.z, w: p.w * k, h: p.h / 3, d: p.d * k, op: 0.9, part: "tier" + t });
      }
      return;
    }
    let op = 1;
    if (p.kind === "structure") op = Math.min(1, (p.fill || 0) * 1.6);
    else if (/bush|hedge/.test(p.kind)) op = 0.6;
    else if (p.kind === "prop") op = 0.7;
    if (op < 0.05) return;
    out.push({ ...base, x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, op, solid: FlybySeq.isSolid(p) });
  });
  return out;
}

/** Linear barriers (walls, fences, stands) carry an arc span, not a box: lay
 *  them as oriented 6 m slabs at hw + gap, the way the emitter did. */
function spanBoxes(track, Tracks) {
  const out = [], smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  const L = track.total;
  const OP = { wall: 1, fence: 0.25, guardrail: 1, tyreWall: 1, bleacher: 0.9, scaffoldStand: 0.6, terrace: 0.9, tieredBowl: 0.9 };
  const H = { guardrail: 0.9, tyreWall: 1.1 };
  track.props.spans.forEach((sp, j) => {
    let a = sp.s0 * L, b = sp.s1 * L;
    if (b < a) b += L;
    const h = sp.h || H[sp.kind] || 1.5;
    for (let s = a; s < b; s += 6) {
      Tracks.sample(track, s % L, smp);
      const rl = Math.hypot(smp.r[0], smp.r[2]) || 1, rx = smp.r[0] / rl, rz = smp.r[2] / rl;
      const lat = (smp.hw + (sp.gap || 0)) * (sp.side >= 0 ? 1 : -1);
      const thick = /bleacher|stand|terrace|bowl/.test(sp.kind) ? Math.max(4, h) : 0.5;
      out.push({ kind: sp.kind, id: "span" + j, x: smp.p[0] + rx * (lat + Math.sign(lat) * thick / 2),
                 y: smp.p[1] + h / 2, z: smp.p[2] + rz * (lat + Math.sign(lat) * thick / 2),
                 w: thick, h, d: 6.2, rot: [rx, rz], op: OP[sp.kind] != null ? OP[sp.kind] : 0.8 });
    }
  });
  return out;
}

function carBoxes(G, Tracks) {
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  return (G.cars || []).map((c, i) => {
    Tracks.sample(G.track, c.s, smp);
    const rl = Math.hypot(smp.r[0], smp.r[2]) || 1, rx = smp.r[0] / rl, rz = smp.r[2] / rl;
    return { kind: "car", id: c.code || i, car: true, x: smp.p[0] + rx * (c.x || 0), y: smp.p[1] + 0.5,
             z: smp.p[2] + rz * (c.x || 0), w: 2.0, h: 1.0, d: 5.6, rot: [rx, rz], op: 1 };
  });
}

/** Height field: the road (a 2 m grid rasterised from the spline, carrying
 *  arc `s` so a ray can tell WHICH road it hit) over Tracks.terrainY. */
function groundModel(track, Tracks) {
  const C = 2, smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity, mny = Infinity, mxy = -Infinity;
  for (let s = 0; s < track.total; s += 4) {
    Tracks.sample(track, s, smp);
    mnx = Math.min(mnx, smp.p[0]); mxx = Math.max(mxx, smp.p[0]);
    mnz = Math.min(mnz, smp.p[2]); mxz = Math.max(mxz, smp.p[2]);
    mny = Math.min(mny, smp.p[1]); mxy = Math.max(mxy, smp.p[1]);
  }
  mnx -= 40; mnz -= 40; mxx += 40; mxz += 40;
  const nx = Math.ceil((mxx - mnx) / C), nz = Math.ceil((mxz - mnz) / C);
  const roadY = new Float32Array(nx * nz).fill(NaN), roadS = new Float32Array(nx * nz);
  for (let s = 0; s < track.total; s += 1) {
    Tracks.sample(track, s, smp);
    const rl = Math.hypot(smp.r[0], smp.r[2]) || 1, rx = smp.r[0] / rl, rz = smp.r[2] / rl;
    for (let l = -smp.hw; l <= smp.hw; l += 1) {
      const i = Math.floor((smp.p[0] + rx * l - mnx) / C), j = Math.floor((smp.p[2] + rz * l - mnz) / C);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      roadY[j * nx + i] = smp.p[1]; roadS[j * nx + i] = s;
    }
  }
  let maxT = -Infinity;
  const pos = track.terrainGeo && track.terrainGeo.pos;
  if (pos) for (let k = 1; k < pos.length; k += 3) if (pos[k] > maxT) maxT = pos[k];
  const base = mny - 0.3;
  const tcache = new Map();
  const groundAt = (x, z) => {
    const i = Math.floor((x - mnx) / C), j = Math.floor((z - mnz) / C);
    if (i >= 0 && j >= 0 && i < nx && j < nz) {
      const y = roadY[j * nx + i];
      if (y === y) return { y, road: true, s: roadS[j * nx + i] };
    }
    const key = (Math.floor(x / C) + 1e5) * 2e5 + (Math.floor(z / C) + 1e5);
    let g = tcache.get(key);
    if (g === undefined) {
      const ty = Tracks.terrainY(track, (Math.floor(x / C) + 0.5) * C, (Math.floor(z / C) + 0.5) * C);
      g = { y: ty == null ? base : ty, road: false, s: null };
      tcache.set(key, g);
    }
    return g;
  };
  return { groundAt, maxGroundY: Math.max(maxT, mxy) + 0.5, cacheSize: () => tcache.size };
}

// ---------------------------------------------------------------------------
// Subjects: what each shot is ABOUT, read off its look poses
// ---------------------------------------------------------------------------

function subjectFor(ctx, look, shotId) {
  const { track, FlybySeq, Tracks, boxes, cars } = ctx;
  const L = track.total, wrap = (s) => ((s % L) + L) % L;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  const roadPts = (s0, s1, step) => {
    const pts = [];
    for (let s = s0; s <= s1; s += step) {
      Tracks.sample(track, wrap(s), smp);
      const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
      for (const f of [-0.85, 0, 0.85]) {
        const l = f * smp.hw;
        pts.push([smp.p[0] + smp.r[0] / rl * l, smp.p[1] + 0.3, smp.p[2] + smp.r[2] / rl * l]);
      }
    }
    return pts;
  };
  const a = look[0] || {}, b = look[1] || a;
  if (a.at === "landmark") {
    const lm = FlybySeq.landmarks(track);
    if (!lm.length) return null;
    const rec = lm[Math.min(a.rank || 0, lm.length - 1)];
    for (const bx of boxes) bx.subj = bx.rec === rec;
    const pts = [];
    for (const fx of [-0.45, 0, 0.45]) for (const fy of [-0.45, 0, 0.45]) for (const fz of [-0.45, 0, 0.45]) {
      pts.push([rec.x + fx * rec.w, rec.y + fy * rec.h, rec.z + fz * rec.d]);
    }
    return { kind: "landmark", label: `${rec.kind} ${rec.w}x${rec.h}x${rec.d} m (rank ${a.rank || 0})`, pts, roadS: null };
  }
  if (a.at === "centre") {
    for (const bx of boxes) bx.subj = false;
    return { kind: "lap", label: "the whole lap", pts: roadPts(0, L - 1, L / 96), roadS: "all" };
  }
  if (a.at === "corner") {
    const sc = FlybySeq.cornerS(track, a.n || 1);
    let sa = FlybySeq.anchorS(track, a), sb = FlybySeq.anchorS(track, b);
    const rel = (s) => { let d = s - sc; while (d > L / 2) d -= L; while (d < -L / 2) d += L; return d; };
    const lo = Math.min(rel(sa), rel(sb), 0) - 30, hi = Math.max(rel(sa), rel(sb), 0) + 30;
    for (const bx of boxes) bx.subj = false;
    return { kind: "corner", label: `corner ${a.n} (apex s=${sc.toFixed(0)}, road ${lo.toFixed(0)}..+${hi.toFixed(0)} m)`,
             pts: roadPts(sc + lo, sc + hi, 5), roadS: [wrap(sc + lo), wrap(sc + hi)] };
  }
  // grid / pole / start: the field
  for (const bx of boxes) bx.subj = !!bx.car;
  const pts = [];
  for (const c of cars) {
    const fx = c.rot[1], fz = -c.rot[0];     // along the car (perpendicular to its right vector)
    pts.push([c.x, c.y + 0.3, c.z], [c.x + fx * 2.2, c.y + 0.2, c.z + fz * 2.2], [c.x - fx * 2.2, c.y + 0.2, c.z - fz * 2.2]);
  }
  return { kind: "cars", label: `the grid (${cars.length} cars)`, pts, roadS: null };
}

// ---------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------

function reportFrame(ctx, pose, subj, opts) {
  const { scene, FlybySeq, track } = ctx;
  const cam = FM.makeCamera({ eye: pose.eye, tgt: pose.tgt, fovDeg: pose.fov, aspect: opts.aspect, near: FlybySeq.NEAR });
  // A box the eye stands in is reported, not drawn: casting from inside a box
  // paints every ray at t = 0 and the frame reads as 100 % of that box.
  const inside = scene.allBoxes.filter((b) => FM.insideBox(cam.eye, b));
  const insideHard = inside.find((b) => b.op >= 0.5 && !/ridge|mountain|hill/.test(b.kind));
  scene.boxes = inside.length ? scene.allBoxes.filter((b) => !inside.includes(b)) : scene.allBoxes;
  const frame = FM.castFrame(cam, scene, subj, opts.cols, opts.rows);
  const st = FM.frameStats(frame, 30);
  const g = scene.groundAt(cam.eye[0], cam.eye[2]);

  let subject = null;
  if (subj) {
    const geo = FM.subjectGeometry(cam, subj.pts);
    const cand = FM.cullBoxes(cam, scene.boxes, scene.range);
    let tSum = 0, n = 0;
    const lost = new Map();
    geo.proj.forEach((q, i) => {
      if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return;
      const { T, by } = FM.transmittance(cam.eye, subj.pts[i], scene, cand, (b) => b.subj);
      tSum += T; n++;
      // Attribute the lost fraction to the occluders, nearest first.
      let rem = 1;
      for (const o of by.sort((x, y) => x.t - y.t)) {
        const take = rem * o.op; rem -= take;
        const key = o.b.kind + "#" + (o.b.id != null ? o.b.id : "");
        const e = lost.get(key) || { kind: o.b.kind, id: o.b.id, part: o.b.part, distM: o.t, share: 0,
                                     size: o.b.w ? [o.b.w, o.b.h, o.b.d].map((v) => +v.toFixed(1)) : null };
        e.share += take; e.distM = Math.min(e.distM, o.t);
        lost.set(key, e);
      }
    });
    const occluders = [...lost.values()].sort((x, y) => y.share - x.share).slice(0, 4)
      .map((e) => ({ ...e, sharePct: +(e.share / Math.max(1, n) * 100).toFixed(1), distM: +e.distM.toFixed(1), share: undefined }));
    subject = {
      kind: subj.kind, label: subj.label,
      coverPct: st.subjectPct, bboxPct: geo.bboxPct, inFramePct: geo.inFramePct,
      visiblePct: n ? tSum / n * 100 : null, occluders,
      centroid: geo.centroid && geo.centroid.map((v) => +v.toFixed(2)),
      centreDist: geo.centreDist, thirdsDist: geo.thirdsDist, clipped: geo.clipped,
    };
  }
  const horizon = FM.fitHorizon(st.skyline, opts.cols, opts.rows, opts.aspect);
  const r = {
    eye: { pos: cam.eye.map((v) => +v.toFixed(1)), tgt: cam.tgt.map((v) => +v.toFixed(1)), fov: +pose.fov.toFixed(1),
           pitchDeg: +(cam.pitch * FM.DEG).toFixed(1), yawDeg: +(cam.yaw * FM.DEG).toFixed(1),
           tgtDistM: +Math.hypot(cam.tgt[0] - cam.eye[0], cam.tgt[1] - cam.eye[1], cam.tgt[2] - cam.eye[2]).toFixed(1),
           heightAboveGround: +(cam.eye[1] - g.y).toFixed(1), overRoad: !!g.road,
           insideProp: insideHard ? `${insideHard.kind}${insideHard.part ? "/" + insideHard.part : ""}` : null,
           belowGround: cam.eye[1] < g.y - 0.05, lift: pose.lift != null ? +pose.lift.toFixed(1) : undefined },
    subject,
    skyPct: st.skyPct, groundPct: st.groundPct, roadPct: st.roadPct, propPct: st.propPct, carPct: st.carPct,
    kindPct: st.kindPct,
    horizon: { geomRowFrac: +FM.geomHorizon(cam).toFixed(2),
               skylineRowFrac: horizon ? +horizon.row.toFixed(2) : null,
               tiltDeg: horizon ? +horizon.tiltDeg.toFixed(1) : null,
               roughness: horizon ? +horizon.roughness.toFixed(3) : null },
    nearest: st.nearest ? { distM: +st.nearest.t.toFixed(1), kind: st.nearest.kind, id: st.nearest.id,
                            third: ["left", "centre", "right"][st.nearest.third] } : null,
    nearThirdsPct: st.nearThirdsPct.map((v) => +v.toFixed(1)),
    cars: { visible: st.carsVisible },
    candidates: frame.candidates,
    motion: pose.motion || null,
  };
  const j = FM.judge(r);
  r.flags = j.flags; r.score = j.score;
  for (const k of ["skyPct", "groundPct", "roadPct", "propPct", "carPct"]) r[k] = +r[k].toFixed(1);
  for (const k of Object.keys(r.kindPct)) r.kindPct[k] = +r.kindPct[k].toFixed(1);
  if (subject) for (const k of ["coverPct", "bboxPct", "inFramePct", "visiblePct", "centreDist", "thirdsDist"]) {
    if (subject[k] != null) subject[k] = +subject[k].toFixed(k.endsWith("Dist") ? 2 : 1);
  }
  if (opts.thumbCols) r.thumb = FM.asciiThumb(frame, opts.thumbCols, opts.thumbRows);
  return r;
}

// ---------------------------------------------------------------------------

function parsePose(str) {
  const parts = str.split(":");
  const v = (s) => s.split(",").map(Number);
  const eye = v(parts[0]), tgt = v(parts[1] || "");
  if (eye.length !== 3 || tgt.length !== 3 || eye.concat(tgt).some((n) => !isFinite(n))) {
    throw new CliArgError("--pose=ex,ey,ez:tx,ty,tz[:fov] — use the = form so negative numbers survive");
  }
  return { eye, tgt, fov: parts[2] ? +parts[2] : 40 };
}

function parseSubject(str) {
  if (!str) return [{ at: "grid" }];
  const [k, a] = str.split(":");
  if (k === "landmark") return [{ at: "landmark", rank: +(a || 0) }];
  if (k === "corner") return [{ at: "corner", n: isNaN(+a) ? (a || "first") : +a, off: 0 }];
  if (k === "lap") return [{ at: "centre" }];
  if (k === "grid") return [{ at: "grid" }];
  throw new CliArgError("--subject landmark:<rank> | corner:<n|first|mid|late> | lap | grid");
}

function fmtRow(r, u, id) {
  const s = r.subject || {};
  const pct = (v) => v == null ? "  -" : String(Math.round(v)).padStart(3);
  const near = r.nearest ? `${r.nearest.distM.toFixed(0).padStart(4)}m ${String(r.nearest.kind).slice(0, 10).padEnd(10)} ${r.nearest.third[0]}` : "   -".padEnd(17);
  const m = r.motion;
  return [
    (u != null ? u.toFixed(3) : "  -  ").padEnd(6), String(id || "pose").padEnd(11), String(r.score).padStart(3),
    pct(s.coverPct) + "%", pct(s.visiblePct) + "%", pct(s.inFramePct) + "%",
    s.thirdsDist != null ? s.thirdsDist.toFixed(2) : "  - ",
    pct(r.skyPct) + "%", pct(r.roadPct) + "%", near,
    String(r.cars.visible).padStart(2),
    m ? `${m.panDps.toFixed(0).padStart(3)} ${m.parallaxDps.toFixed(0).padStart(3)}${m.cut ? "|" : " "}` : "  -   - ",
    r.flags.join(" "),
  ].join(" ");
}
const HEADER = "u      shot       scr subj  vis  inF 3rds  sky road nearest-obstruction cars pan par  flags\n" +
  "                   (score; subject % of frame / % visible / % of its points in frame; thirds dist; pan & parallax deg/s, | = first frame of a shot)";

async function main() {
  const F = makeFlags(process.argv.slice(2), KNOWN);
  const track = F.flag("--track", "monza");
  const asp = String(F.flag("--aspect", "16/9")).split("/").map(Number);   // "16/9" or "1.78"
  const aspect = (asp.length === 2 ? asp[0] / asp[1] : asp[0]) || 16 / 9;
  const thumbCols = +F.flag("--thumb", 48);
  const thumbRows = Math.max(4, Math.round(thumbCols / aspect / 2));
  const res = +F.flag("--res", 2);                   // rays per thumbnail char, per axis (x2 → 96 × 28 for 48 × 14)
  const cols = Math.max(24, (thumbCols || 48) * res), rows = Math.max(12, (thumbRows || 14) * res);
  const range = +F.flag("--range", 2500);
  const opts = { aspect, cols, rows, thumbCols, thumbRows };
  const shots = F.has("--shots") ? readShots(F.flag("--shots")) : null;

  const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
  const t0 = Date.now();
  const g = await createGame({ track });
  const bootMs = Date.now() - t0;
  const sb = g.sandbox, G = g.G, T = G.track, FlybySeq = sb.FlybySeq, Tracks = sb.Tracks;
  const props = propBoxes(T, FlybySeq), spans = spanBoxes(T, Tracks), cars = carBoxes(G, Tracks);
  const gm = groundModel(T, Tracks);
  const scene = { allBoxes: props.concat(spans, cars), boxes: null, groundAt: gm.groundAt, maxGroundY: gm.maxGroundY, range };
  const ctx = { track: T, FlybySeq, Tracks, boxes: scene.allBoxes, cars, scene };
  const list = shots && shots.length ? shots : FlybySeq.DEFAULT;
  const FLY = flyMs();
  const t1 = Date.now();

  const frames = [];
  if (F.has("--pose")) {
    const pose = parsePose(F.flag("--pose"));
    const subj = subjectFor(ctx, parseSubject(F.flag("--subject", "")), "pose");
    frames.push({ u: null, id: "pose", r: reportFrame(ctx, pose, subj, opts) });
  } else {
    // Which u to judge: explicit, evenly spaced, or (default) each shot's first, middle and last moment.
    let us = [];
    const total = list.reduce((a, s) => a + (s.dur || 0), 0) || 1;
    if (F.has("--u")) us = F.list("--u").map(Number);
    else if (F.has("--frames")) { const n = +F.flag("--frames"); for (let i = 0; i < n; i++) us.push((i + 0.5) / n); }
    else { let acc = 0; for (const s of list) { const d = (s.dur || 0) / total; us.push(acc + d * 0.03, acc + d * 0.5, acc + d * 0.97); acc += d; } }
    const solve = (u) => { const v = FlybySeq.solve(T, u, shots); return { eye: v.eye.slice(), tgt: v.tgt.slice(), fov: v.fov, index: v.index, id: v.id, lift: v.lift }; };
    FlybySeq.reset();
    let prevIdx = -1;
    const EPS = 0.001;                                // 24 ms of the flyby
    for (const u of us) {
      // Motion from a second solve 24 ms away, on the same side of any cut.
      const pose = solve(u);
      let q = solve(Math.min(1, u + EPS));
      if (q.index !== pose.index) q = solve(Math.max(0, u - EPS));
      const ca = FM.makeCamera({ eye: pose.eye, tgt: pose.tgt, fovDeg: pose.fov });
      const cb = FM.makeCamera({ eye: q.eye, tgt: q.tgt, fovDeg: q.fov });
      const mo = q.index === pose.index ? FM.motion(ca, cb, EPS * FLY / 1000) : null;
      pose.motion = {
        eyeMps: mo ? +mo.eyeMps.toFixed(1) : 0, panDps: mo ? +mo.panDps.toFixed(1) : 0,
        parallaxDps: mo ? +mo.parallaxDps.toFixed(1) : 0,
        zoomDps: mo ? +Math.abs(mo.zoomDps).toFixed(2) : 0, cut: pose.index !== prevIdx,
      };
      prevIdx = pose.index;
      const shot = list[pose.index];
      const subj = subjectFor(ctx, shot.look, shot.id);
      frames.push({ u, id: pose.id, r: reportFrame(ctx, pose, subj, opts) });
    }
  }
  // Cuts: how different is the frame either side of each shot boundary? A cut
  // between two near-identical framings reads as a jump cut.
  const cuts = [];
  if (!F.has("--pose")) {
    const total = list.reduce((a, s) => a + (s.dur || 0), 0) || 1;
    let acc = 0;
    for (let i = 0; i < list.length - 1; i++) {
      acc += (list[i].dur || 0) / total;
      const a = FlybySeq.solve(T, acc - 1e-4, shots), ea = a.eye.slice(), ta = a.tgt.slice(), fa = a.fov;
      const b = FlybySeq.solve(T, acc + 1e-4, shots);
      const ca = FM.makeCamera({ eye: ea, tgt: ta, fovDeg: fa }), cb = FM.makeCamera({ eye: b.eye, tgt: b.tgt, fovDeg: b.fov });
      const jump = Math.hypot(b.eye[0] - ea[0], b.eye[1] - ea[1], b.eye[2] - ea[2]);
      const ang = Math.acos(Math.max(-1, Math.min(1, ca.f[0] * cb.f[0] + ca.f[1] * cb.f[1] + ca.f[2] * cb.f[2]))) * FM.DEG;
      cuts.push({ from: list[i].id, to: list[i + 1].id, eyeJumpM: +jump.toFixed(1), turnDeg: +ang.toFixed(1),
                  // same place, same way: reads as a glitch, not a cut
                  jumpCutRisk: jump < 15 && ang < 15,
                  // same axis, further along it: a cut-in, legitimate but worth knowing
                  axialCut: jump >= 15 && ang < 10 });
    }
  }
  const out = { track, bootMs, analyseMs: Date.now() - t1, aspect: +aspect.toFixed(3), raster: [cols, rows],
                legend: FM.LEGEND, thresholds: FM.THRESH, frames: frames.map((f) => ({ u: f.u, shot: f.id, ...f.r })), cuts };
  g.close();
  if (F.has("--out")) {
    const file = path.resolve(F.flag("--out"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
  }
  if (F.has("--json")) { process.stdout.write(JSON.stringify(out, null, 1) + "\n"); return; }
  console.log(`frame-report ${track}: ${frames.length} frames, raster ${cols}x${rows}, boot ${bootMs} ms, analysis ${out.analyseMs} ms`);
  console.log(HEADER);
  for (const f of frames) console.log(fmtRow(f.r, f.u, f.id));
  if (cuts.length) console.log("cuts: " + cuts.map((c) => `${c.from}>${c.to} ${c.eyeJumpM}m/${c.turnDeg}°${c.jumpCutRisk ? " JUMP-CUT?" : c.axialCut ? " axial" : ""}`).join("  "));
  if (thumbCols && !F.has("--quiet")) {
    console.log("\nlegend: " + FM.LEGEND);
    for (const f of frames) {
      const s = f.r.subject;
      console.log(`\n-- u=${f.u != null ? f.u.toFixed(3) : "-"} ${f.id}  score ${f.r.score}  subject: ${s ? s.label : "-"}` +
        (s && s.occluders.length ? `  occluded by ${s.occluders.map((o) => `${o.kind}${o.part ? "/" + o.part : ""} ${o.sharePct}% @${o.distM}m`).join(", ")}` : ""));
      console.log("+" + "-".repeat(thumbCols) + "+");
      for (const line of f.r.thumb) console.log("|" + line + "|");
      console.log("+" + "-".repeat(thumbCols) + "+");
    }
  }
}

runCli(main);
