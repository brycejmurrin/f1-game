#!/usr/bin/env node
// @doc Fleet audit of the pre-race FLYBY path (FlybySeq.solve) in the node VM: jumps, lift, ground, grid sightline, pan rate.
// @skill playwright-probe
/*
 * flyby-audit.cjs — MEASURE THE FLYBY PATH, NOT A PICTURE OF IT.
 *
 * FlybySeq.solve(track, u) is a pure function, so the defects a render shows
 * one frame at a time — a camera that pops up mid-shot, one lifted into a
 * crane, one under the grass, a grid shot looking across the infield, a whip
 * pan — are all numbers along u. auditTrack() walks one built track and
 * returns them per shot; the CLI boots the game once (tools/lib/game-vm.cjs)
 * and re-races every circuit, ~1 s each.
 *
 *   node tools/lib/flyby-audit.cjs                   # every Tracks.LIST circuit, table
 *   node tools/lib/flyby-audit.cjs monza bahrain     # just these
 *   node tools/lib/flyby-audit.cjs --json > artifacts/flyby-audit.json
 *
 * Metrics, per shot (the worst sample):
 *   jump   metres the eye moves vertically between two consecutive samples
 *   lift   metres the planned clearance raised the eye (solve().lift)
 *   under  metres the eye sits below the ground floor (terrain, or the road
 *          when over it) — > 0 is a camera underground
 *   gridOff  metres the grid shots' eye->target sightline strays past the
 *          road edge (|lat| - hw) — > 0 is looking across the infield
 *   pan    degrees/second the view direction turns, at FLY_MS
 *   tree   samples whose eye is inside a tall tree's box
 */
"use strict";

const FLY_MS = 24000;                 // js/ui/loading-screen.js
const TALL_TREES = ["pine", "stonePine", "cypress", "broadleafFall", "palm", "acacia", "tree"];

function auditTrack(S, track, opts) {
  const o = opts || {};
  const N = o.samples || 400;
  const FlybySeq = S.FlybySeq, Tracks = S.Tracks;
  const shots = o.shots || FlybySeq.DEFAULT;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  const dt = FLY_MS / 1000 / N;
  const per = {};
  const trees = [];
  const list = (track.props && track.props.list) || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (TALL_TREES.indexOf(r.kind) !== -1 && r.h >= 8) trees.push(r);
  }
  const inTree = (p) => {
    for (let i = 0; i < trees.length; i++) {
      const r = trees[i];
      if (Math.abs(p[0] - r.x) < r.w / 2 && Math.abs(p[2] - r.z) < r.d / 2 &&
          p[1] > r.y - r.h / 2 && p[1] < r.y + r.h / 2) return r;
    }
    return null;
  };
  const ground = (p) => {
    let g = Tracks.terrainY ? Tracks.terrainY(track, p[0], p[2]) : null;
    if (g == null || !isFinite(g)) g = -Infinity;
    const pr = Tracks.project(track, p[0], p[2], null, p[1]);
    if (pr) {
      Tracks.sample(track, pr.s, smp);
      if (Math.abs(pr.lat) <= (smp.hw || 10) + 2 && smp.p[1] > g) g = smp.p[1];
    }
    return g;
  };
  FlybySeq.reset();
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const v = FlybySeq.solve(track, u, shots);
    const eye = v.eye.slice(), tgt = v.tgt.slice();
    const id = v.id;
    const m = per[id] || (per[id] = { id, jump: 0, jumpU: 0, lift: 0, liftU: 0, under: -Infinity, underU: 0,
      gridOff: -Infinity, gridU: 0, pan: 0, panU: 0, tree: 0, treeU: null, inside: 0 });
    if (v.lift > m.lift) { m.lift = v.lift; m.liftU = u; }
    const un = ground(eye) - eye[1];
    if (un > m.under) { m.under = un; m.underU = u; }
    if (inTree(eye)) { m.tree++; if (m.treeU === null) m.treeU = u; }
    const sh = shots[v.index];
    const onRoad = sh && FlybySeq.onRoadPose(sh.eye[0]) && FlybySeq.onRoadPose(sh.eye[1]);
    if (!onRoad && FlybySeq.insideProp(track, eye, 0)) m.inside++;
    if (/^grid/.test(id)) {
      // The sightline, from the eye to the target, over the road or not.
      for (let k = 1; k <= 10; k++) {
        const f = k / 10;
        const x = eye[0] + (tgt[0] - eye[0]) * f, z = eye[2] + (tgt[2] - eye[2]) * f;
        const y = eye[1] + (tgt[1] - eye[1]) * f;
        const pr = Tracks.project(track, x, z, null, y);
        if (!pr) continue;
        Tracks.sample(track, pr.s, smp);
        const off = Math.abs(pr.lat) - (smp.hw || 10);
        if (off > m.gridOff) { m.gridOff = off; m.gridU = u; }
      }
    }
    if (prev && prev.index === v.index && !v.cut) {
      const dy = Math.abs(eye[1] - prev.eye[1]);
      if (dy > m.jump) { m.jump = dy; m.jumpU = u; }
      const a = dir(prev.eye, prev.tgt), b = dir(eye, tgt);
      const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const rate = Math.acos(c) * 180 / Math.PI / dt;
      if (rate > m.pan) { m.pan = rate; m.panU = u; }
    }
    prev = { index: v.index, eye, tgt };
  }
  return Object.values(per);
}

function dir(e, t) {
  const d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

function summary(rows) {
  const w = { jump: 0, lift: 0, under: -Infinity, gridOff: -Infinity, pan: 0, tree: 0, inside: 0 };
  for (const r of rows) {
    for (const k of Object.keys(w)) if (r[k] > w[k]) w[k] = r[k];
  }
  return w;
}

module.exports = { auditTrack, summary, FLY_MS, TALL_TREES };

if (require.main === module) {
  (async () => {
    const path = require("path");
    const { createGame } = require(path.join(__dirname, "game-vm.cjs"));
    const args = process.argv.slice(2);
    const json = args.includes("--json");
    let ids = args.filter((a) => !a.startsWith("--"));
    const g = await createGame({ track: ids[0] || "monza" });
    try {
      if (!ids.length) ids = g.sandbox.Tracks.LIST.map((t) => t.id || t);
      const out = {};
      for (const id of ids) {
        await g.race(id, "day", "dry");
        out[id] = auditTrack(g.sandbox, g.G.track, {});
        if (!json) {
          const s = summary(out[id]);
          const worst = (k) => out[id].reduce((a, b) => (b[k] > a[k] ? b : a));
          process.stdout.write(`${id.padEnd(16)} jump ${s.jump.toFixed(1).padStart(5)} (${worst("jump").id})` +
            `  lift ${s.lift.toFixed(1).padStart(5)} (${worst("lift").id})` +
            `  under ${s.under.toFixed(1).padStart(6)}  gridOff ${s.gridOff.toFixed(1).padStart(5)}` +
            `  pan ${s.pan.toFixed(0).padStart(4)} (${worst("pan").id})  tree ${s.tree}  inside ${s.inside}\n`);
        }
      }
      if (json) process.stdout.write(JSON.stringify(out, null, 1) + "\n");
    } finally { g.close(); }
  })().catch((e) => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1); });
}
