// BODY styles (livery `bodyStyle`, Car3D.BODY_STYLES / bodyStyleKey): a livery
// can put a concept chassis (or, when ALLOW_TEAM_BODY_SWAP, another team's) on
// any car. Pins that every picker body builds and moves nose/cover/pod anchors,
// that an unknown or "team" value falls back to the team's own, that decal
// anchors key on the SAME body the mesh is built from, that team ids still
// resolve when the picker hides them, that no concept body lowers
// CarBodyGeom's NOSE_DROOP_FLOOR — the flap solver's floor is derived over every
// style, so a deeper droop would move every car's wing — and (#3111) that every
// body is a valid chassis on every engine: pods not inside out, nose joined to
// the tub and clear of the wing, cover under the roll hoop, mirrors unburied.
//
// Run: node --test tests/unit/body-styles.test.mjs   (npm run test:tooling-fast; ~5 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const M = loadParts();
const R = loadParts({ shade: true });
const sculptIds = ["auralis", "cevora", "vantrel", "orynth"];
const { Car3D, Parts, Teams } = M;
const Liveries = (() => { const ctx = { console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync("js/car/liveries.js", "utf8"), ctx, { filename: absSrc("js/car/liveries.js") });
  return vm.runInContext("Liveries", ctx); })();
const team = Teams.LIST.find((t) => t.id === "ferrari");
const tiers = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
const build = (bodyStyle) => Car3D.buildComplete(team.color, team.color2,
  { livery: { c1: team.color, c2: team.color2, bodyStyle }, teamId: team.id, num: 16, parts: tiers });

test("bodyStyleKey: a known body wins, anything else is the team's own", () => {
  assert.equal(Car3D.bodyStyleKey("ferrari", "needle"), "needle");
  assert.equal(Car3D.bodyStyleKey("ferrari", "mclaren"), "mclaren");
  for (const v of [undefined, null, "", "team", "nope"]) assert.equal(Car3D.bodyStyleKey("ferrari", v), "ferrari", String(v));
  // Picker list is concepts only while ALLOW_TEAM_BODY_SWAP is off; team keys
  // still resolve above for saved liveries.
  assert.equal(Car3D.ALLOW_TEAM_BODY_SWAP, false);
  assert.deepEqual([...Car3D.BODY_STYLE_IDS].sort(), [...Object.keys(Car3D.BODY_STYLES)].sort());
  for (const id of Object.keys(Car3D.TEAM_STYLE)) assert.ok(!Car3D.BODY_STYLE_IDS.includes(id), id);
});

test("every body builds a finite car whose hull differs from the team's own", () => {
  const base = build(undefined);
  const baseNose = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, undefined)).noseAt(2.2);
  const baseCover = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, undefined)).coverAt(-0.55);
  const basePod = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, undefined)).podAt(0.22);
  for (const id of Car3D.BODY_STYLE_IDS) {
    if (id === team.id) continue;
    const d = build(id);
    assert.ok(d.pos.every(Number.isFinite), `${id}: non-finite vertex`);
    let moved = d.pos.length !== base.pos.length ? Infinity : 0;
    for (let i = 0; moved !== Infinity && i < d.pos.length; i++) moved = Math.max(moved, Math.abs(d.pos[i] - base.pos[i]));
    assert.ok(moved >= 0.05, `${id}: hull moved only ${(moved * 1000).toFixed(1)} mm (want ≥50 mm silhouette)`);
    // Global AABB often stays put (front wing / halo pin zmax/ymax). The outline
    // that a player reads is nose / cover / pod anchors — those must move.
    const a = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, id));
    const nose = a.noseAt(2.2), cover = a.coverAt(-0.55), pod = a.podAt(0.22);
    const outline = Math.max(
      Math.abs(nose.top - baseNose.top), Math.abs(nose.side - baseNose.side),
      Math.abs(cover.top - baseCover.top), Math.abs((pod.x || pod.outer) - (basePod.x || basePod.outer)),
      Math.abs((pod.top || pod.outerTop) - (basePod.top || basePod.outerTop)));
    assert.ok(outline >= 0.04, `${id}: nose/cover/pod outline only ${(outline * 1000).toFixed(0)} mm`);
  }
  // Saved team-body liveries still resolve and build even with the picker gated.
  const rb = build("redbull");
  assert.ok(rb.pos.every(Number.isFinite), "redbull body: non-finite");
  assert.equal(Car3D.bodyStyleKey(team.id, "redbull"), "redbull");
});

test("decal anchors follow the body the mesh is built from", () => {
  const own = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, undefined));
  for (const id of Object.keys(Car3D.BODY_STYLES)) {
    const a = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, id));
    assert.notEqual(a.key, own.key, `${id}: anchors key on the team, not the body`);
    assert.notDeepEqual(a.noseAt(2.1), own.noseAt(2.1), `${id}: nose anchor did not move`);
  }
});

test("no concept body lowers the flap solver's nose-droop floor", () => {
  // NOSE_DROOP_FLOOR is derived over every style's noseDroop; concept bodies
  // stay at or above the team worst so it (and every car's wing) is unchanged.
  const worst = (styles) => Math.min(0, ...styles.map((st) => st.noseDroop || 0));
  const teams = Object.values(Car3D.TEAM_STYLE);
  assert.ok(worst(Object.values(Car3D.BODY_STYLES)) >= worst(teams));
});

// ── #3111: every body is a valid chassis on EVERY engine ─────────────────────
// The style offsets are raw metres, so a body tuned on the Ferrari pod (1.06)
// turned inside out on the narrow Honda/Audi/Aston pods. One matrix: every
// style (team + concept) x every team's factory setup AND every catalog engine,
// square and rounded (CarShade) anchors.
const ENGINES = [
  ...Teams.LIST.map((t) => ({ id: "factory:" + t.id, T: Parts.getVisualTiers(Parts.getFactorySetup(t), t) })),
  ...Parts.CATALOG.find((c) => c.id === "engine").options.filter((o) => o.visual)
    .map((o) => ({ id: o.id, T: { engine: o.visualTier, _visual: { engine: o.visual } } })),
];
const BODIES = Object.keys(Car3D.BODY_STYLES), TEAMS = Object.keys(Car3D.TEAM_STYLE);
const Shaded = loadParts({ shade: true }).Car3D;   // round anchors need CarShade (a second realm)
const each = (styles, fn) => { for (const st of styles) for (const e of ENGINES) for (const round of [false, true])
  fn(st, e, (round ? Shaded : Car3D).bodyAnchors(e.T, st, undefined, round), round); };

test("every body x engine: pod top above bottom, outer edge outboard, undercut in the team envelope", () => {
  const bad = [];
  each([...TEAMS, ...BODIES], (st, e, a, round) => {
    for (const p of a.podStations) {
      const at = `${st}/${e.id}${round ? "/round" : ""} z${p.z}`;
      // Floors: the thinnest grid section at the tail (2 cm wide, ~3 cm tall
      // after the rounded downwash ramp) — no body may go under a team car.
      if (!(p.outer - p.inner >= 0.0195)) bad.push(`${at} width ${(p.outer - p.inner).toFixed(3)}`);
      if (!(p.innerTop - p.innerBottom >= 0.08)) bad.push(`${at} inner height ${(p.innerTop - p.innerBottom).toFixed(3)}`);
      if (!(p.outerTop - p.outerBottom >= (round ? 0.025 : 0.06))) bad.push(`${at} outer height ${(p.outerTop - p.outerBottom).toFixed(3)}`);
      if (!(p.outerBottom >= p.innerBottom - 0.0401)) bad.push(`${at} belly ${(p.outerBottom - p.innerBottom).toFixed(3)} under the inboard edge`);
      // 0.12: the quali-engine grid car's tail belly (z -0.62), the lowest shipped.
      if (!(Math.min(p.innerBottom, p.outerBottom) >= 0.12)) bad.push(`${at} belly under the floor rail`);
    }
  });
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} invalid pod stations`);
});

test("the pod clamp never binds on a grid car (team stations clear every floor)", () => {
  // Mirror of POD_MIN_W / POD_MIN_H / POD_TOP_MAX in car-body-geom.js
  // clampPodStation: every TEAM_STYLE x engine station must clear them, so the
  // clamp leaves the shipped grid bit-identical and moves only concept bodies.
  const MIN_W = { "0.62": 0.10, "0.5": 0.10, "0.22": 0.12, "-0.38": 0.10, "-0.62": 0.06, "-1.05": 0.04, "-1.48": 0.02 };
  const MIN_H = { "0.62": 0.10, "0.5": 0.10, "0.22": 0.12, "-0.38": 0.12, "-0.62": 0.12, "-1.05": 0.10, "-1.48": 0.08 };
  const bad = [];
  each([undefined, ...TEAMS], (st, e, a, round) => {
    if (round) return;   // the clamp runs before the rounded downwash ramp
    for (const p of a.podStations) {
      const k = String(p.z), at = `${st || "default"}/${e.id} z${k}`;
      if (p.outer - p.inner < MIN_W[k]) bad.push(`${at} width`);
      if (p.innerTop - p.innerBottom < MIN_H[k] || p.outerTop - p.outerBottom < MIN_H[k]) bad.push(`${at} height`);
      if (Math.max(p.innerTop, p.outerTop) > 0.65) bad.push(`${at} top`);
      if (p.outerBottom < p.innerBottom - 0.04 - 1e-9 || p.outerBottom < Math.min(p.innerBottom, 0.13)) bad.push(`${at} belly`);
    }
  });
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} team stations the clamp would move`);
});

test("every body x engine: the pod shoulder stays under the mirror housings", () => {
  const bad = [];
  for (const st of BODIES) {
    const housingBottom = Math.min(...Car3D.mirrorLightAnchors(st, 1).map((m) => m.y)) - 0.0375;
    for (const e of ENGINES) {
      const p = Car3D.bodyAnchors(e.T, st).podAt(0.24);
      const top = Math.max(p.top, p.innerTop);
      if (top > housingBottom - 0.01) bad.push(`${st}/${e.id} pod top ${top.toFixed(3)} vs housing ${housingBottom.toFixed(3)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} buried mirrors`);
});

test("every body: the nose meets the tub and clears the front-wing flap ceiling", () => {
  const root = Car3D.CHASSIS.nose[2], tub = Car3D.CHASSIS.monocoque[0];
  // The lowest TEAM nose underside over the NOSE_UNDER window (z 1.96-2.16):
  // the flap solver's ceiling is derived from the team noses, so a concept nose
  // must never hang under it.
  const zs = [1.96, 2.00, 2.05, 2.10, 2.16];
  const floor = zs.map((z) => Math.min(...[undefined, ...TEAMS].map((st) => Car3D.bodyAnchors(null, st).noseAt(z).bottom)));
  for (const st of BODIES) {
    const n = Car3D.bodyAnchors(null, st);
    const last = n.noseAt(-9);   // sampleStations clamps to the root station
    const seam = Car3D.BODY_STYLES[st].fitBodyDetails ? tub : root;
    assert.ok(Math.abs(last.z - -9) < 1e-9 && Math.abs(n.noseAt(tub.z).bottom - (seam.y - seam.h / 2)) < 1e-9
      && Math.abs(n.noseAt(tub.z).top - (seam.y + seam.h / 2)) < 1e-9, `${st}: nose root is not the chassis root at z ${tub.z}`);
    assert.ok(n.noseAt(tub.z).side * 2 <= tub.w + 1e-9, `${st}: nose root wider than the tub`);
    zs.forEach((z, i) => assert.ok(n.noseAt(z).bottom >= floor[i] - 1e-9,
      `${st}: nose underside ${n.noseAt(z).bottom.toFixed(3)} under the team floor ${floor[i].toFixed(3)} at z ${z}`));
  }
});

test("every body x engine x spine: the engine cover stays under the roll hoop", () => {
  // The hoop crown is 0.968 at z -0.33 and 0.938 at -0.63 (car3d PRINCIPAL ROLL
  // STRUCTURE). A concept body's coverLift may not lift the cover past the team
  // car on the same engine and spine, and on a standard spine stays under 0.93.
  const bad = [];
  for (const sp of ["standard", "raised", "high", "dorsal"]) for (const e of ENGINES) {
    const team = Car3D.bodyAnchors(e.T, undefined, sp).coverAt(-0.55).top;
    for (const st of BODIES) {
      const top = Car3D.bodyAnchors(e.T, st, sp).coverAt(-0.55).top;
      if (top > Math.max(team, 0.92) + 1e-9) bad.push(`${st}/${e.id}/${sp} cover ${top.toFixed(3)} (team ${team.toFixed(3)})`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} covers through the hoop`);
});

test("bodyStyle is a published livery field and the garage's copy list carries it", () => {
  assert.ok(Liveries.FIELDS.includes("bodyStyle"));
  assert.match(fs.readFileSync("js/car/custom-liveries.js", "utf8"), /"bodyStyle"\]/);
  assert.match(fs.readFileSync("js/garage/setup-camera.js", "utf8"), /SP_HULL_GEOM_FIELDS = \[[^\]]*"bodyStyle"/);
});

test("renamed sculpted bodies and matching aero options expose unique new IDs", () => {
  const aero = Parts.CATALOG.find(c => c.id === "aero");
  const medium = aero.options.find(o => o.id === "medium");
  for (const id of sculptIds) {
    assert.ok(Car3D.BODY_STYLE_IDS.includes(id));
    assert.equal(Car3D.bodyStyleKey(team.id, id), id);
    const opt = aero.options.find(o => o.id === "style_aero_" + id);
    assert.equal(opt.label, id[0].toUpperCase() + id.slice(1) + " Contour");
    for (const key of ["cost", ...Parts.STAT_KEYS.map(k => k.key)]) assert.equal(opt[key], medium[key], `${id}/${key}`);
    assert.equal(opt.equivalent, "medium");
  }
});

test("Auralis, Cevora, Vantrel and Orynth have distinct post-clamp silhouettes", () => {
  const at = (id) => Car3D.bodyAnchors(tiers, id);
  const auralis = at("auralis"), cevora = at("cevora"), vantrel = at("vantrel"), orynth = at("orynth");
  const riftRing = auralis.podRing(0.22, 1), riftPod = auralis.podAt(0.22);
  assert.ok(riftRing[6][1] < (riftPod.innerTop + riftPod.top) / 2 - 0.04, "auralis has a real transverse roof channel");
  assert.ok(cevora.podAt(0.22).x < vantrel.podAt(0.22).x - 0.20, "cevora leaves much more floor exposed than vantrel");
  assert.ok(cevora.podAt(0.22).bottom > vantrel.podAt(0.22).bottom + 0.08, "cevora pods sit higher");
  assert.ok(vantrel.noseAt(2.95).side > cevora.noseAt(2.95).side * 1.5, "vantrel tip is broader while keeping the reference's tapered nose");
  assert.ok(orynth.podAt(-0.62).top > orynth.podAt(0.22).top + 0.06, "orynth roof swells aft");
  for (const X of [M, R]) {
    const hashes = new Set();
    for (const id of ["auralis", "cevora", "vantrel", "orynth"]) {
      const mesh = X.Car3D.build(team.color, team.color2, { teamId: team.id, parts: tiers,
        livery: { c1: team.color, c2: team.color2, bodyStyle: id } });
      assert.ok(mesh.pos.every(Number.isFinite), `${id}: finite mesh`);
      hashes.add(JSON.stringify(mesh.pos));
    }
    assert.equal(hashes.size, 4, "all four geometry streams differ in both shading modes");
  }
});

test("sculpted pods keep mirrored, positive closed sections and sampled detail stops", () => {
  for (const X of [M, R]) for (const id of ["auralis", "cevora", "vantrel", "orynth"]) {
    const a = X.Car3D.bodyAnchors(tiers, id, undefined, X === R);
    assert.ok(X.Car3D.BODY_STYLES[id].noseTipZ <= 0.12, `${id}: nose ends within the front-wing leading edge`);
    assert.equal(a.podStops.length, X === R ? 15 : 7, `${id}: bounded longitudinal refinement in the smooth mesh only`);
    const cover = a.coverAt(-0.85), profile = X.Car3D.coverProfile(cover);
    assert.ok(cover.xb < cover.x * 0.60, `${id}: haunched cover has a recessed foot`);
    assert.ok(profile.d >= (cover.top - cover.bottom) * 0.30, `${id}: rounded shoulder replaces the tall slab`);
    const measured = X.Car3D.build(team.color, team.color2, { livery: { bodyStyle: id }, parts: tiers, measure: true });
    assert.ok(!measured.parts.some(p => p.name === "sponsorBoard"), `${id}: clean wing has no separate number-board block`);
    for (const p of a.podStops) {
      const right = a.podRing(p.z, 1), left = a.podRing(p.z, -1).slice().reverse();
      assert.equal(right.length, 9);
      right.forEach((v, i) => {
        assert.ok(v.every(Number.isFinite));
        assert.ok(Math.abs(v[0] + left[i][0]) < 1e-12 && v[1] === left[i][1] && v[2] === left[i][2]);
        assert.ok(v[1] >= Math.min(p.innerBottom, p.outerBottom) - 1e-9);
      });
      const skin = a.podAt(p.z);
      assert.ok(Math.abs(skin.x - p.outer) < 1e-12 && Math.abs(skin.top - p.outerTop) < 1e-12);
      assert.ok(right[6][1] > Math.min(p.innerBottom, p.outerBottom) + 0.02, "channel never cuts through belly");
      assert.ok(right[2][0] < right[3][0] && right[4][0] < right[3][0], "flank rolls into its shoulder instead of a vertical slab");
      for (const f of [0.19, 0.32, 0.65, 0.80, 0.88]) {
        const point = a.podFlank(p.z, f);
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[0] <= p.outer && point[0] >= p.inner);
        assert.ok(Math.abs(point[1] - (skin.bottom + (skin.top - skin.bottom) * f)) < 1e-12,
          "detail and decal samples share the rolled skin");
      }
    }
  }
});

test("reference study smooth rings curve off their chords and Orynth belly recovers aft", () => {
  const a = R.Car3D.bodyAnchors(tiers, "orynth", undefined, true);
  const p = a.podStations[2], q = a.podStations[3], z = p.z + (q.z - p.z) / 3;
  const stop = a.podStops.find(s => Math.abs(s.z - z) < 1e-10);
  assert.ok(stop, "third-point sample is emitted, not just queried by decals");
  assert.ok(Math.abs(stop.outer - (p.outer + (q.outer - p.outer) / 3)) > 0.002, "sample departs from the straight chord");
  assert.equal(a.podRing(z, 1)[3][0], stop.outer, "emitted skin uses the sampled shoulder");
  for (const X of [M, R]) {
    const body = X.Car3D.bodyAnchors(tiers, "orynth", undefined, X === R);
    assert.ok(body.podAt(-0.62).bottom > body.podAt(-1.05).bottom + 0.04, "scallop recovers before the tail");
    const auralis = X.Car3D.bodyAnchors(tiers, "auralis", undefined, X === R), ring = auralis.podRing(-0.38, 1);
    assert.ok(ring[3][0] - ring[2][0] > 0.10, "Auralis waist is genuine concave body geometry");
  }
});

test("complete concepts emit shaped cover rings, deep ducts and full finite car assemblies", () => {
  for (const X of [M, R]) for (const id of sculptIds) {
    const a = X.Car3D.bodyAnchors(tiers, id, undefined, X === R), recipe = X.Car3D.BODY_STYLES[id].podSculpt;
    assert.equal(a.coverStops.length, 17, `${id}: refined longitudinal cover mesh`);
    const f = a.coverAt(-0.55), r = a.coverAt(-2), m = a.coverAt(-1.275);
    assert.ok(Math.abs(m.top - (f.top + r.top) / 2) > 0.01, `${id}: authored crown is not a straight end-to-end loft`);
    assert.ok(recipe.ductDepth >= 0.10 && recipe.exitDepth >= 0.04, `${id}: real recessed duct dimensions`);
    const setup = { ...Parts.getFactorySetup(team), aero: `style_aero_${id}` };
    const parts = X.Parts.getVisualTiers(setup, team);
    const mesh = X.Car3D.buildComplete(team.color, team.color2, { teamId: team.id, parts,
      noDriver: true, livery: { bodyStyle: id }, measure: true });
    for (const key of ["pos", "nrm", "col", "mat", "idx"]) assert.ok(mesh[key].every(Number.isFinite), `${id}/${key}`);
    assert.ok(mesh.idx.length / 3 < 24000, `${id}: complete mesh stays bounded`);
    for (const name of ["hood", "sidepods", "engineCover", "frontWing", "rearAssembly", "chassis"])
      assert.ok(mesh.parts.some(p => p.name === name && p.vertices > 0), `${id}: ${name} is real emitted geometry`);
  }
});

test("complete concept cover skins are welded, closed and outward in both LODs", () => {
  const ink = [0.213, 0.517, 0.811], key = p => p.map(v => v.toFixed(7)).join(",");
  for (const X of [M, R]) for (const id of sculptIds) {
    const mesh = X.Car3D.build(team.color, team.color2, { teamId: team.id, parts: tiers,
      noWheels: true, livery: { bodyStyle: id, cover: ink }, measure: true });
    const tris = [], links = new Map();
    for (let i = 0; i < mesh.idx.length; i += 3) {
      const ids = Array.from(mesh.idx.slice(i, i + 3));
      if (!ids.every(v => ink.every((c, k) => mesh.col[v * 3 + k] === c))) continue;
      const tri = ids.map(v => Array.from(mesh.pos.slice(v * 3, v * 3 + 3)));
      const n = tris.push(tri) - 1;
      for (const p of tri) { const k = key(p); if (!links.has(k)) links.set(k, []); links.get(k).push(n); }
    }
    const seen = new Set(), groups = [];
    for (let i = 0; i < tris.length; i++) {
      if (seen.has(i)) continue;
      const stack = [i], group = []; seen.add(i);
      while (stack.length) { const n = stack.pop(); group.push(tris[n]);
        for (const p of tris[n]) for (const j of links.get(key(p))) if (!seen.has(j)) { seen.add(j); stack.push(j); }
      }
      groups.push(group);
    }
    const shell = groups.find(g => { const z = g.flat().map(p => p[2]);
      return Math.abs(Math.max(...z) + 0.55) < 1e-7 && Math.abs(Math.min(...z) + 2) < 1e-7 && g.length >= 128; });
    assert.ok(shell, `${id}: closed longitudinal cover shell is emitted`);
    const edges = new Map(); let volume = 0;
    for (const [a, b, c] of shell) {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = key(p) + ">" + key(q); edges.set(k, (edges.get(k) || 0) + 1); }
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    for (const [edge, count] of edges) { const [a, b] = edge.split(">");
      assert.equal(count, 1, `${id}: duplicate directed edge`); assert.equal(edges.get(b + ">" + a), 1, `${id}: open edge`); }
    assert.ok(volume > 0, `${id}: outward signed volume`);
  }
});

test("complete cover artwork keeps continuous UVs at shared longitudinal rings", () => {
  for (const X of [M, R]) for (const id of sculptIds) {
    const d = X.CarMesh.carDecalData(2, tiers, false, team.id, "none", "standard", id);
    const region = X.LiveryTex.REGIONS.crest, size = X.LiveryTex.SIZE;
    for (let v = 0; v < d.pos.length / 3; v++) {
      const z = d.pos[v * 3 + 2];
      if (Math.abs(d.nrm[v * 3 + 2] - 0.06) > 1e-8 || z < -1.279 || z > -0.62) continue;
      assert.ok(d.uv[v * 2] >= region.x / size - 1e-8 && d.uv[v * 2] <= (region.x + region.w) / size + 1e-8,
        `${id}: bulged cover must not sample outside crest atlas region`);
    }
    for (const z of [-0.66, -0.90, -1.13]) {
      const front = [], rear = [];
      for (let v = 0; v < d.pos.length / 3; v += 4) {
        if (Math.abs(d.nrm[v * 3 + 2] - 0.06) > 1e-8) continue;
        for (let k = 0; k < 4; k++) if (Math.abs(d.pos[(v + k) * 3 + 2] - z) < 1e-8)
          (k < 2 ? front : rear).push(d.uv[(v + k) * 2].toFixed(8));
      }
      assert.ok(front.length && rear.length, `${id}/${z}: artwork spans both sides of the shared ring`);
      assert.deepEqual(front.sort(), rear.sort(), `${id}/${z}: no texture tear across cover sections`);
    }
  }
});

test("reference noses are short, broad and curved downward; spines have rounded crown sections", () => {
  for(const X of [M,R]) for(const id of sculptIds) {
    const a=X.Car3D.bodyAnchors(tiers,id,undefined,X===R);
    assert.equal(a.noseStops.length,9,`${id}: curved nose is emitted in sections`);
    const tip=a.noseAt(a.noseStops[0]);
    assert.ok(tip.z<=2.48 && tip.side*2>=0.14,`${id}: shorter broad tip, not a long pencil`);
    assert.ok(tip.top<0.30,`${id}: crown curves down to a low tip`);
    const frontSlope=(a.noseAt(2.24).top-a.noseAt(2.34).top)/0.10;
    const rearSlope=(a.noseAt(1.20).top-a.noseAt(1.30).top)/0.10;
    assert.ok(frontSlope>rearSlope+0.08,`${id}: front slope steepens into the drooping tip`);
    const profile=X.Car3D.coverProfile(a.coverAt(-0.90));
    assert.equal(profile.pts.length,10,`${id}: rounded crown geometry in both detail levels`);
    assert.ok(profile.pts[4][1]>profile.shoulder && profile.pts[4][1]<profile.top);
    const d=X.CarMesh.carDecalData(2,tiers,false,team.id,"none","standard",id);
    const label=[];
    for(let v=0;v<d.pos.length/3;v++) if(Math.abs(d.nrm[v*3+2]-0.05)<1e-8 && d.pos[v*3+2]>=1.72 && d.pos[v*3+2]<=2.10) {
      label.push(v);
      assert.ok(Math.abs(d.pos[v*3+1]-a.noseAt(d.pos[v*3+2]).top-0.020)<1e-8,`${id}: number follows nose skin`);
    }
    assert.ok(label.length>4,`${id}: number drape spans the new curved nose sections`);
    assert.equal(X.Car3D.BODY_STYLES[id].wingStyle.canard,0,`${id}: clean front-wing surface`);
    const ink=[0.219,0.487,0.813],m=X.Car3D.build(team.color,team.color2,{parts:tiers,teamId:team.id,noWheels:true,livery:{bodyStyle:id,noseStripe:ink}});
    let painted=0;
    for(let v=0;v<m.pos.length/3;v++) if(ink.every((c,k)=>m.col[v*3+k]===c)) {
      painted++;
      assert.ok(Math.abs(m.pos[v*3+1]-a.noseAt(m.pos[v*3+2]).top)<0.025,`${id}: optional stripe follows curved skin`);
    }
    assert.ok(painted>48,`${id}: optional stripe uses multiple sections`);
    const whiteSupport=[];
    for(let v=0;v<m.pos.length/3;v++) if(Math.abs(m.pos[v*3])<0.14 && m.pos[v*3+1]<0.16 && m.pos[v*3+2]>2.42
      && team.color.every((c,k)=>m.col[v*3+k]===c)) whiteSupport.push(v);
    assert.equal(whiteSupport.length,0,`${id}: no painted support horn ahead of the short nose`);
  }
});
