// LiveryStations (js/car/livery-stations.js): the nose-tip cap, cockpit-side driver code,
// sidepod-top and halo-crown decals. Fit is measured against the geometry the body is built
// from: every decal vertex sits just proud of its own surface, never in clear air or inside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
function load() {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
                JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
                   "js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/livery-stations.js", "js/car/crest-draw.js",
                   "js/car/liverytex.js", "js/car/helmets.js", "js/car/car-geometry.js", "js/car/car-wheels.js",
                   "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-shade.js",
                   "js/car/car-body-geom.js", "js/car/car3d.js", "js/car/cockpit-rig.js", "js/car/car-mesh.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: path.join(ROOT, f) });
  const grab = (n) => vm.runInContext(n, ctx);
  return { S: grab("LiveryStations"), T: grab("LiveryTex"), Car3D: grab("Car3D"), CarMesh: grab("CarMesh"),
           Geom: grab("CarBodyGeom"), Teams: grab("Teams"), Parts: grab("Parts") };
}
const M = load();

// Capture what emit() lays down, per region.
function capture(regions, anchors, ctx) {
  const quads = [];
  const uvOf = (r) => ({ uL: r.x / 2048, uR: (r.x + r.w) / 2048, vT: 1 - r.y / 2560, vB: 1 - (r.y + r.h) / 2560 });
  M.S.emit((c, n, uv) => quads.push({ c, n, uv }), uvOf, regions, anchors, ctx);
  return quads;
}
const stationCtx = (teamId, cockpit, round) => {
  const style = M.Car3D.teamStyleOf(M.Car3D.bodyStyleKey(teamId));
  return { noseTipZ: M.Car3D.styledNoseStations(style)[0].z, monocoque: M.Car3D.CHASSIS.monocoque,
           halo: M.S.haloOf(cockpit || {}, round) };
};

test("new regions sit inside the atlas and overlap no other region", () => {
  const R = M.T.REGIONS, W = M.T.SIZE, H = M.T.SIZE_H;
  for (const id of M.S.IDS) {
    const r = R[id];
    assert.ok(r, id + " is an atlas region");
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, id + " inside the atlas");
  }
  const all = Object.entries(R);
  for (const id of M.S.IDS) for (const [k, o] of all) {
    if (k === id) continue;
    const r = R[id], hit = r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
    assert.ok(!hit, id + " overlaps " + k);
  }
});

test("halo literals stay in lockstep with the hoop car3d builds", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/car/car3d.js"), "utf8");
  const a = M.S.HALO_ARGS;
  assert.ok(src.includes(`haloHoopPath(${a[0]}, ${a[1]}, ${a[2]}, ${a[3].toFixed(2)}, ${a[4]}, crownY, ${a[6]})`), "car3d hoop call matches HALO_ARGS");
  assert.ok(src.includes(`const crownY = ${a[5]} - (haloSty === 1 ? 0.008 : 0)`), "crown height matches");
  assert.ok(src.includes("const hr = haloSty === 1 ? 0.024 : 0.028"), "tube radius matches");
  assert.ok(src.includes("addTube(out, shadeFlags.round ? CarShade.fine(hoop, 3, 3, 12) : hoop.slice(3, 12), hr + 0.008,"), "blade fairing tube matches");
  const faired = M.S.haloOf({ haloBlade: 1 }, false);
  assert.ok(faired && Math.abs(faired.r - 0.036) < 1e-9 && faired.path.length === 9, "the strip rides the blade fairing (pts 3..11, hr + 8 mm)");
  assert.equal(M.S.haloOf({ halo: 1, haloBlade: 2 }, false), null, "no strip under the full shroud's spine");
  assert.equal(M.S.haloOf({ halo: 2 }, false), null, "no strip between the fenced crown's vanes");
});

const segDist = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1)));
  return Math.hypot(w[0] - d[0] * t, w[1] - d[1] * t, w[2] - d[2] * t);
};

test("halo strip lies 0-4 mm proud of the tube, on the crown bar only", () => {
  // haloBlade 1 is the Garage's stock cockpit for most teams (D5c 2026-10-20: the strip sat on the
  // hoop INSIDE the fairing, so no Garage shot ever showed it).
  for (const round of [false, true]) for (const halo of [0, 1]) for (const haloBlade of [0, 1]) {
    const c = stationCtx("mclaren", { halo, haloBlade }, round), H = c.halo;
    const q = capture({ haloTop: M.T.REGIONS.haloTop }, M.Car3D.bodyAnchors({}, "mclaren", undefined, round), c);
    assert.ok(q.length > 4, "strip emitted");
    for (const { c: cs } of q) for (const p of cs) {
      let d = Infinity;
      for (let i = 0; i < H.path.length - 1; i++) d = Math.min(d, segDist(p, H.path[i], H.path[i + 1]));
      // A vertex of the strip is r + 3 mm from the centreline; between path points the
      // chord pulls in, so allow the polygonal tube's own sag below r + 3 mm.
      assert.ok(d > H.r - 0.002 && d < H.r + 0.004, `round=${round} halo=${halo} blade=${haloBlade}: ${(d * 1000).toFixed(1)} mm from centreline (r ${H.r * 1000})`);
      assert.ok(p[2] >= H.midZ - 0.03, "on the crown bar, not down a leg");
    }
    // ON TOP of the bar: a strip on the tube's flank or underside is hidden inside the hoop (D5b
    // 2026-10-20: the transported frame had turned, so the "top" strip faced the cockpit).
    for (const { n } of q) assert.ok(n[1] > 0.5, `round=${round} halo=${halo} blade=${haloBlade}: strip normal y ${n[1].toFixed(2)} faces up`);
  }
});

test("cockpit-side code lies 5 mm proud of the monocoque's raked flank", () => {
  const mono = M.Car3D.CHASSIS.monocoque, c = stationCtx("ferrari");
  const q = capture({ cockpitSide: M.T.REGIONS.cockpitSide }, M.Car3D.bodyAnchors({}, "ferrari"), c);
  assert.equal(q.length, 2, "one decal a side");
  for (const { c: cs } of q) for (const p of cs) {
    const t = (mono[0].z - p[2]) / (mono[0].z - mono[1].z), L = (a, b) => a + (b - a) * t;
    const w = L(mono[0].w, mono[1].w), h = L(mono[0].h, mono[1].h), y = L(mono[0].y, mono[1].y), tt = L(mono[0].t, mono[1].t);
    const xb = w / 2, xt = w * tt / 2, yb = y - h / 2, x = Math.abs(p[0]);
    // signed distance from the flank line (xb,yb)→(xt,yb+h), outward positive
    const nx = h, ny = xb - xt, nl = Math.hypot(nx, ny), d = ((x - xb) * nx + (p[1] - yb) * ny) / nl;
    assert.ok(d > 0.004 && d < 0.006, (d * 1000).toFixed(2) + " mm off the flank");
    assert.ok(p[2] > 0.62, "ahead of the sidepod inlet (z 0.62)");
  }
});

test("nose-tip cap and sidepod-top band follow their anchors on every team", () => {
  for (const team of M.Teams.LIST) {
    const anchors = M.Car3D.bodyAnchors({}, M.Car3D.bodyStyleKey(team.id)), c = stationCtx(team.id);
    const nose = capture({ noseTip: M.T.REGIONS.noseTip }, anchors, c);
    assert.equal(nose.length, 4, team.id + ": top, two sides, front");
    for (const { c: cs } of nose) for (const p of cs) {
      assert.ok(p[2] <= c.noseTipZ + 0.005 && p[2] >= c.noseTipZ - 0.29, team.id + " cap within the last 280 mm");
      const s = anchors.noseAt(Math.min(p[2], c.noseTipZ));
      assert.ok(p[1] <= s.top + 0.006 && p[1] >= s.bottom - 0.006 && Math.abs(p[0]) <= s.side + 0.006, team.id + " cap hugs the nose section");
    }
    const pod = capture({ podTop: M.T.REGIONS.podTop }, anchors, c);
    assert.ok(pod.length >= 4, team.id + ": pod top both sides");
    for (const { c: cs } of pod) for (const p of cs) {
      const s = anchors.podAt(p[2]), x = Math.abs(p[0]);
      assert.ok(x > s.inner && x < s.x, team.id + " pod top stays between the pod's inner and outer edges");
      const g = (x - s.inner) / (s.x - s.inner), yTop = s.innerTop + (s.top - s.innerTop) * g;
      assert.ok(p[1] - yTop > 0.004 && p[1] - yTop < 0.012, team.id + ` pod top ${((p[1] - yTop) * 1000).toFixed(1)} mm proud`);
    }
  }
});

test("all 11 chassis still build and every car maps the four new decal regions", () => {
  for (const team of M.Teams.LIST) {
    const d = M.CarMesh.carDecalData(2, {}, false, team.id, "standard", undefined, undefined);
    assert.ok(d.pos.length > 0 && d.pos.every(Number.isFinite), team.id + " decal mesh finite");
    const uvs = [];
    for (let i = 0; i < d.uv.length; i += 2) uvs.push([d.uv[i] * 2048, (1 - d.uv[i + 1]) * 2560]);
    for (const id of M.S.IDS) {
      if (id === "noseTip") continue;   // a solid cap: its UVs are the region's corners, checked below
      const r = M.T.REGIONS[id];
      assert.ok(uvs.some(([x, y]) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5), team.id + " car mesh maps " + id);
    }
    const nt = M.T.REGIONS.noseTip;
    assert.ok(uvs.some(([x, y]) => Math.abs(x - nt.x) < 0.5 && Math.abs(y - nt.y - nt.h) < 0.5), team.id + " car mesh maps noseTip");
    const mesh = M.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true, teamId: team.id });
    assert.ok(mesh && mesh.pos && mesh.pos.length > 0, team.id + " chassis builds");
  }
});

test("every station quad winds counter-clockwise about its normal, like every other decal", () => {
  const d = M.CarMesh.carDecalData(2, {}, false, "williams", "standard");
  const P = (i) => [d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]], N = (i) => [d.nrm[i * 3], d.nrm[i * 3 + 1], d.nrm[i * 3 + 2]];
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = P(d.idx[t]), b = P(d.idx[t + 1]), c = P(d.idx[t + 2]), n = N(d.idx[t]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const w = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
    assert.ok(w > 0, "triangle " + t / 3 + " faces away from its normal (culled)");
  }
});

test("driver code comes from the race number, else the team short name", () => {
  assert.equal(M.S.driverCode("mercedes", 63), "RUS");
  assert.equal(M.S.driverCode("ferrari", 44), "HAM");
  assert.ok(/^[A-Z]{3}$/.test(M.S.driverCode("ferrari", 999)), "falls back to a 3-letter short name");
});

test("each station has a livery ON / OFF, and OFF paints nothing in its region", () => {
  const R = { noseTip: { id: "noseTip" }, cockpitSide: { id: "cockpitSide" }, podTop: { id: "podTop" }, haloTop: { id: "haloTop" } };
  const painted = (colors) => {
    const hit = [];
    const h = { teamId: "mclaren", colors, c1: [1, 0.5, 0], accent: [0, 0, 0], names: ["A", "B", "C", "D", "E", "F"], num: 4,
      fillRegion: (_, r) => hit.push(r.id), drawWordmark: (_, __, r) => hit.push(r.id), inkOn: () => [1, 1, 1], haloIf: () => null };
    M.S.paint(null, R, h); return hit.sort();
  };
  assert.deepEqual(painted({}), ["cockpitSide", "haloTop", "noseTip", "podTop"], "on by default");
  for (const [id, field] of Object.entries(M.S.TOGGLES)) {
    assert.ok(painted({ [field]: "off" }).indexOf(id) < 0, field + " off");
    assert.equal(painted({ [field]: "off" }).length, 3, field + " leaves the other three");
  }
  const src = fs.readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8");
  for (const field of Object.values(M.S.TOGGLES)) assert.ok(src.includes(field + ': "on"'), field + " persists through LIV_DRAFT_PILLS");
});

test("the sidepod-top sponsor is inked against the SIDEPOD colour, not the primary", () => {
  const seen = [];
  const h = { teamId: "mclaren", colors: { pod: [0, 0, 0] }, c1: [1, 1, 1], accent: [0, 0, 0], names: ["A", "B", "C", "D", "E", "F"], num: 4,
    fillRegion: () => {}, drawWordmark: (_, __, r) => seen.push(r.id), haloIf: () => null,
    inkOn: (bg) => { seen.push(bg); return [1, 1, 1]; } };
  M.S.paint(null, { podTop: { id: "podTop" } }, h);
  assert.equal(JSON.stringify(seen), '[[[0,0,0]],"podTop"]', "a black sidepod on a white car picks its ink for black");
  seen.length = 0; h.colors = {};
  M.S.paint(null, { podTop: { id: "podTop" } }, h);
  assert.equal(JSON.stringify(seen), '[[[1,1,1]],"podTop"]', "no SIDEPOD colour: the pod wears c1");
});

test("on sculpted bodies the sidepod-top band drapes the roof's channel and crown", () => {
  for (const id of ["auralis", "cevora", "vantrel", "orynth"]) for (const round of [false, true]) {
    const anchors = M.Car3D.bodyAnchors({}, id, undefined, round), c = stationCtx("ferrari", null, round);
    assert.equal(typeof anchors.podRoof, "function", id + ": sculpted anchors expose the roof");
    const pod = capture({ podTop: M.T.REGIONS.podTop }, anchors, c);
    assert.ok(pod.length >= 16, id + ": the band is laid in strips across the curved roof");
    for (const { c: cs } of pod) for (const p of cs) {
      const s = anchors.podAt(p[2]), roof = anchors.podRoof(p[2], (Math.abs(p[0]) - s.inner) / (s.x - s.inner));
      assert.ok(p[1] - roof[1] > 0.004 && p[1] - roof[1] < 0.012, id + ` pod top ${((p[1] - roof[1]) * 1000).toFixed(1)} mm off the roof`);
    }
  }
});
