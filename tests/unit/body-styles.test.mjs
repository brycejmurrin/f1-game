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
    assert.ok(Math.abs(last.z - -9) < 1e-9 && Math.abs(n.noseAt(tub.z).bottom - (root.y - root.h / 2)) < 1e-9
      && Math.abs(n.noseAt(tub.z).top - (root.y + root.h / 2)) < 1e-9, `${st}: nose root is not the chassis root at z ${tub.z}`);
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

const expansionIds = ["hammerhead", "swan", "manta", "wasp", "scorpion", "blade"];

test("expanded bodies have independent, recognizable profile relationships", () => {
  const at = (id, spine) => Car3D.bodyAnchors(tiers, id, spine);
  for (const id of expansionIds) assert.ok(Car3D.BODY_STYLE_IDS.includes(id), id);
  const hammer = at("hammerhead"), tip = hammer.noseAt(2.26), neck = hammer.noseAt(1.7552);
  assert.ok(tip.side > neck.side * 1.5, "hammerhead shovel is wider than its neck");
  assert.ok(tip.top - tip.bottom < 0.05, "hammerhead shovel stays thin");
  assert.ok(at("swan").noseAt(2.78).bottom > 0.39, "swan bridge clears the low nose line");
  const manta = at("manta");
  assert.ok(manta.podAt(0.62).x > manta.podAt(-0.62).x * 2, "manta sweeps into a pinched waist");
  const wasp = at("wasp");
  assert.ok(wasp.podAt(-0.62).x > wasp.podAt(0.62).x * 1.5, "wasp swells aft of its inlet");
  assert.ok(wasp.podAt(-0.62).top > wasp.podAt(0.62).top + 0.10, "wasp has high aft shoulders");
  for (const spine of ["standard", "dorsal"]) {
    const scorpion = at("scorpion", spine);
    assert.ok(scorpion.coverAt(-2).top > scorpion.coverAt(-0.55).top + 0.04,
      `scorpion tail rises with ${spine} cover`);
  }
  const blade = at("blade").noseAt(2.0);
  assert.ok(blade.top - blade.bottom > blade.side * 3.5, "blade nose is tall and thin");
});

test("expanded profiles retain canonical station order, positive sections and bounded mesh streams", () => {
  const reference = JSON.stringify(Car3D.AXLES);
  const accountingBytes = (d) => [d.pos, d.nrm, d.col, d.mat, d.idx]
    .reduce((n, stream) => n + stream.length * 4, 0);
  const legacyIds = [undefined, "needle", "brick", "anteater", "arched", "wedge", "barge"];
  const budgetModes = [["flat", Car3D], ["rounded", R.Car3D]].map(([name, X]) => {
    const opts = (id) => ({ livery: { c1: team.color, c2: team.color2, bodyStyle: id },
      teamId: team.id, num: 16, parts: tiers });
    const body = (id) => X.build(team.color, team.color2, { ...opts(id), noWheels: true });
    const complete = (id) => X.buildComplete(team.color, team.color2, opts(id));
    const ceiling = { bodyTriangles: 0, bodyBytes: 0, completeTriangles: 0, completeBytes: 0 };
    for (const id of legacyIds) {
      const b = body(id), c = complete(id);
      ceiling.bodyTriangles = Math.max(ceiling.bodyTriangles, b.idx.length / 3);
      ceiling.bodyBytes = Math.max(ceiling.bodyBytes, accountingBytes(b));
      ceiling.completeTriangles = Math.max(ceiling.completeTriangles, c.idx.length / 3);
      ceiling.completeBytes = Math.max(ceiling.completeBytes, accountingBytes(c));
    }
    return { name, body, complete, ceiling };
  });
  for (const id of expansionIds) {
    const a = Car3D.bodyAnchors(tiers, id);
    assert.equal(a.podStations.length, 7, `${id}: reuses the seven pod rings`);
    for (let i = 0; i < a.podStations.length; i++) {
      const p = a.podStations[i];
      if (i) assert.ok(a.podStations[i - 1].z > p.z, `${id}: ordered pod stations`);
      assert.ok(p.outer > p.inner && p.outerTop > p.outerBottom && p.innerTop > p.innerBottom,
        `${id}: positive pod section at ${p.z}`);
    }
    // Both regular and rounded builders sample the same two-station linear cover.
    for (const round of [false, true]) {
      const b = (round ? R.Car3D : Car3D).bodyAnchors(tiers, id, "dorsal", round);
      const f = b.coverAt(-0.55), r = b.coverAt(-2), m = b.coverAt(-1.275);
      assert.ok(Math.abs(m.top - (f.top + r.top) / 2) < 1e-12, `${id}: linear cover crown`);
      assert.ok(f.top > f.bottom && r.top > r.bottom, `${id}: positive cover sections`);
    }
    // Flat near bodies retain the declared fixed budget. Rounded meshes must fit
    // the existing rounded maximum under identical parts, including complete cars.
    for (const { name, body, complete, ceiling } of budgetModes) {
      const d = body(id), c = complete(id), label = `${id}/${name}`;
      const bodyTriangles = name === "flat" ? 12000 : ceiling.bodyTriangles;
      const bodyBytes = name === "flat" ? 1.75 * 1024 * 1024
        : ceiling.bodyBytes;
      assert.ok(d.idx.length / 3 <= bodyTriangles, `${label}: exceeds ${bodyTriangles} body triangles`);
      assert.ok(accountingBytes(d) <= bodyBytes, `${label}: exceeds ${bodyBytes} body accounting bytes`);
      assert.ok(c.idx.length / 3 <= ceiling.completeTriangles, `${label}: exceeds existing complete triangle maximum`);
      assert.ok(accountingBytes(c) <= ceiling.completeBytes, `${label}: exceeds existing complete byte maximum`);
    }
    assert.equal(JSON.stringify(Car3D.AXLES), reference, `${id}: leaves physics datums alone`);
  }
});


test("expanded pod sections stay open across every team's available engine and extreme recipes", () => {
  const engineCat = Parts.CATALOG.find((c) => c.id === "engine");
  const extreme = [
    { podWidth: 0.72, shoulderHeight: 0.76, undercut: 1.38, coke: 1.38, tailWidth: 0.70, coverHeight: 0.78 },
    { podWidth: 1.28, shoulderHeight: 1.28, undercut: 0.72, coke: 0.72, tailWidth: 1.30, coverHeight: 1.28 },
  ];
  for (const t of Teams.LIST) {
    const factory = Parts.getFactorySetup(t);
    const cases = [["factory", Parts.getVisualTiers(factory, t)]];
    for (const e of engineCat.options.filter((o) => Parts.isOptionAvailable(o, t)))
      cases.push([e.id, Parts.getVisualTiers({ ...factory, engine: e.id }, t)]);
    for (let i = 0; i < extreme.length; i++) cases.push([`extreme-${i}`, {
      ...cases[0][1], _visual: { ...cases[0][1]._visual, engine: {
        in: 1, inlet: 1, outlet: 1, ...extreme[i],
      } },
    }]);
    for (const [engineId, parts] of cases) for (const id of expansionIds) for (const round of [false, true]) {
      const a = (round ? R.Car3D : Car3D).bodyAnchors(parts, id, "dorsal", round);
      const label = `${t.id}/${engineId}/${id}/${round ? "round" : "flat"}`;
      for (const p of a.podStations) {
        assert.ok(p.outer - p.inner >= 0.08 - 1e-12, `${label}: open span at ${p.z}`);
        assert.ok(p.outerTop > p.outerBottom && p.innerTop > p.innerBottom,
          `${label}: positive height at ${p.z}`);
      }
      const inlet = a.podAt(0.62);
      assert.ok(inlet.x - inlet.inner >= 0.08 - 1e-12, `${label}: positive inlet mouth`);
    }
  }
});


// Recover connected central supports from the emitted front-wing triangles.
// This deliberately observes mesh output rather than restating the mount recipe.
function emittedNoseSupports(mesh) {
  let from = 0;
  for (const p of mesh.parts) { if (p.name === "frontWing") break; from += p.vertices; }
  const count = mesh.parts.find((p) => p.name === "frontWing").vertices;
  const verts = new Map(), groups = [];
  const point = (i) => mesh.pos.slice(i * 3, i * 3 + 3);
  for (let i = from; i < from + count; i += 3) {
    const tri = [point(i), point(i + 1), point(i + 2)];
    if (!tri.every((p) => Math.abs(p[0]) < 0.20 && p[2] > 2 && p[2] < 2.75)
        || !tri.some((p) => p[1] > 0.18)) continue;
    const keys = tri.map((p) => p.join(","));
    let group = groups.find((g) => keys.some((k) => g.has(k)));
    if (!group) { group = new Set(); groups.push(group); }
    for (const other of groups.slice()) if (other !== group && keys.some((k) => other.has(k))) {
      for (const k of other) group.add(k); groups.splice(groups.indexOf(other), 1);
    }
    keys.forEach((k, j) => { group.add(k); verts.set(k, tri[j]); });
  }
  return groups.map((g) => [...g].map((k) => verts.get(k)))
    .filter((g) => Math.min(...g.map((p) => p[1])) < 0.12 && Math.max(...g.map((p) => p[1])) > 0.20);
}

function insideSection(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
        && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

test("expanded wing supports penetrate the nose while retaining their lower wing mounts", () => {
  for (const t of Teams.LIST.filter((t) => ["ferrari", "mercedes", "astonmartin"].includes(t.id))) {
    const parts = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
    for (const id of expansionIds) for (const [name, X] of [["flat", M], ["rounded", R]]) {
      const mesh = X.Car3D.build(t.color, t.color2, { noWheels: true, measure: true,
        teamId: t.id, parts, livery: { c1: t.color, c2: t.color2, bodyStyle: id } });
      const label = `${t.id}/${id}/${name}`, supports = emittedNoseSupports(mesh);
      assert.equal(supports.length, 2, `${label}: both emitted supports were found`);
      const anchors = X.Car3D.bodyAnchors(parts, id, undefined, name === "rounded");
      for (const support of supports) {
        const side = support.reduce((n, p) => n + p[0], 0) < 0 ? -1 : 1;
        const foot = [side * 0.09, 0.085, 2.54];
        support.sort((a, b) => Math.hypot(...a.map((v, i) => v - foot[i])) - Math.hypot(...b.map((v, i) => v - foot[i])));
        const half = support.length / 2;
        assert.equal(half, name === "rounded" ? 10 : 4, `${label}: unchanged ring topology`);
        const centre = (pts) => pts.reduce((p, q) => p.map((v, i) => v + q[i] / pts.length), [0, 0, 0]);
        const lower = centre(support.slice(0, half)), upper = centre(support.slice(half));
        assert.ok(lower.every((v, i) => Math.abs(v - foot[i]) < 1e-9), `${label}: original lower root retained`);
        const n = anchors.noseAt(upper[2]);
        const hull = name === "rounded" ? X.CarShade.ring({ z: upper[2], w: n.side * 2,
          h: n.top - n.bottom, y: (n.top + n.bottom) / 2, t: n.topSide / n.side })
          : [[-n.side, n.bottom], [n.side, n.bottom], [n.topSide, n.top], [-n.topSide, n.top]];
        assert.ok(insideSection(upper, hull), `${label}: emitted upper cap penetrates actual nose section`);
        assert.ok(support.slice(half).every((p) => p[2] <= Car3D.CHASSIS.nose[0].z + Car3D.BODY_STYLES[id].noseTipZ),
          `${label}: entire upper cap stays behind the nose tip`);
      }
    }
  }
});


const DETAIL_INK = [0.137, 0.419, 0.683];
function detailPoints(mesh, color, keep) {
  const points = [];
  for (let i = 0; i < mesh.pos.length; i += 3) if (color.every((v, j) => mesh.col[i + j] === v)) {
    const p = mesh.pos.slice(i, i + 3); if (keep(p)) points.push(p);
  }
  return points;
}

test("expanded cover stripes stay on the crown instead of bridging to the roll structure", () => {
  for (const id of expansionIds) for (const [name, X] of [["flat", M], ["rounded", R]]) {
    const mesh = X.Car3D.build(team.color, team.color2, { noWheels: true, teamId: team.id, parts: tiers,
      livery: { c1: team.color, c2: team.color2, bodyStyle: id, stripe: DETAIL_INK, spineHeight: "dorsal" } });
    const anchors = X.Car3D.bodyAnchors(tiers, id, "dorsal", name === "rounded");
    const points = detailPoints(mesh, DETAIL_INK, (p) => [-0.64, -0.94, -1.95].includes(p[2]));
    assert.ok(points.length >= 48, `${id}/${name}: both cover stripe lofts emitted`);
    for (const p of points) {
      const c = anchors.coverAt(p[2]), profile = X.Car3D.coverProfile(c);
      assert.ok(Math.abs(p[0]) < profile.pts[profile.pts.length - 1][0], `${id}/${name}: stripe fits flat crown`);
      const gap = p[1] - X.Car3D.coverSurfaceY(c, p[0]);
      assert.ok(gap >= -0.016 && gap <= 0.006, `${id}/${name}: stripe touches cover skin (${gap})`);
    }
  }
});

test("scorpion cover clears actual factory T-wings and their supports bridge the gap", () => {
  let checked = 0;
  for (const t of Teams.LIST) {
    const parts = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
    if (!parts._visual.aero.tvane) continue;
    for (const spineHeight of ["standard", "dorsal"]) for (const [name, X] of [["flat", M], ["rounded", R]]) {
      const mesh = X.Car3D.build(t.color, t.color2, { noWheels: true, teamId: t.id, parts,
        livery: { c1: t.color, c2: t.color2, bodyStyle: "scorpion", rearWing: DETAIL_INK, spineHeight } });
      const anchors = X.Car3D.bodyAnchors(parts, "scorpion", spineHeight, name === "rounded");
      const wing = detailPoints(mesh, DETAIL_INK, (p) => p[2] > -2.05 && p[2] < -1.92 && Math.abs(p[0]) <= 0.171);
      const label = `${t.id}/${spineHeight}/${name}`;
      assert.ok(wing.length > 0, `${label}: actual factory T-wing emitted`);
      for (const p of wing.filter((p) => p[2] >= -2)) {
        const skin = X.Car3D.coverSurfaceY(anchors.coverAt(p[2]), p[0]);
        assert.ok(p[1] > skin + 0.002, `${label}: foil clears cover (${p[1] - skin})`);
      }
      const stem = detailPoints(mesh, [0.05, 0.05, 0.05], (p) => Math.abs(Math.abs(p[0]) - 0.015) < 1e-9
        && [-1.9925, -1.9675].some((z) => Math.abs(z - p[2]) < 1e-9));
      assert.ok(stem.length > 0, `${label}: support emitted`);
      const floor = Math.min(...stem.map((p) => p[1])), top = Math.max(...stem.map((p) => p[1]));
      const skin = X.Car3D.coverSurfaceY(anchors.coverAt(-1.98), 0);
      assert.ok(floor < skin && floor > skin - 0.020, `${label}: support root touches cover`);
      assert.ok(top >= Math.min(...wing.map((p) => p[1])) && top <= Math.max(...wing.map((p) => p[1])),
        `${label}: support reaches foil`);
      checked++;
    }
  }
  assert.ok(checked >= 4, "at least one actual factory T-wing checked in both modes and cover heights");
});


test("expanded nose roots meet the canonical tub without moving their tip or mid sections", () => {
  const tub = Car3D.CHASSIS.monocoque[0];
  for (const t of Teams.LIST) {
    const parts = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
    for (const id of expansionIds) for (const [name, X] of [["flat", M], ["rounded", R]]) {
      const a = X.Car3D.bodyAnchors(parts, id, "dorsal", name === "rounded"), root = a.noseAt(tub.z);
      const label = `${t.id}/${id}/${name}`;
      assert.equal(root.side, tub.w / 2, `${label}: nose/tub width seam`);
      assert.equal(root.topSide, tub.w * tub.t / 2, `${label}: nose/tub crown seam`);
      assert.equal(root.top, tub.y + tub.h / 2, `${label}: nose/tub upper seam`);
      assert.equal(root.bottom, tub.y - tub.h / 2, `${label}: nose/tub underside seam`);
      const forward = a.noseAt(tub.z + 0.0001);
      assert.ok(Math.abs(forward.top - root.top) < 0.0001 && Math.abs(forward.bottom - root.bottom) < 0.0001,
        `${label}: continuous nose immediately ahead of tub`);
    }
  }
  const wasp = Car3D.bodyAnchors(tiers, "wasp").noseAt(2.2016);
  assert.ok(Math.abs(wasp.side - 0.11115) < 1e-10 && Math.abs(wasp.top - 0.38155625) < 1e-10,
    "Wasp keeps its shaped mid-nose when cover lift is zero");
});

test("Wasp airbox and principal hoop remain below the fixed hoop crowns", () => {
  const engineCat = Parts.CATALOG.find((c) => c.id === "engine");
  assert.equal(Car3D.BODY_STYLES.wasp.coverLift, 0, "Wasp adds no extra crown lift to inherited spines");
  const cases = engineCat.options.map((engine) => {
    const t = Teams.LIST.find((t) => Parts.isOptionAvailable(engine, t));
    assert.ok(t, `${engine.id}: a compatible team exists`);
    return [t, { ...Parts.getFactorySetup(t), engine: engine.id }];
  });
  for (const [t, setup] of cases) for (const [name, X] of [["flat", M], ["rounded", R]]) {
    const parts = Parts.getVisualTiers(setup, t);
    assert.equal(parts._ids.engine, setup.engine, `${setup.engine}: probe uses the requested engine`);
    const mesh = X.Car3D.build(t.color, t.color2, { noWheels: true, teamId: t.id, parts,
      livery: { c1: t.color, c2: t.color2, bodyStyle: "wasp", cover: DETAIL_INK } });
    for (const [z, cap] of [[-0.33, 0.968], [-0.63, 0.938]]) {
      const points = detailPoints(mesh, DETAIL_INK, (p) => p[2] === z);
      assert.ok(points.length >= 8, `${t.id}/${setup.engine}/${name}: principal hoop ring emitted`);
      assert.ok(points.every((p) => p[1] <= cap + 1e-9), `${t.id}/${setup.engine}/${name}: fixed hoop crown at ${z}`);
    }
  }
});


test("low concept floor fences clear the emitted tray with every engine and lowest available suspension", () => {
  const engineCat = Parts.CATALOG.find((c) => c.id === "engine");
  const suspensionCat = Parts.CATALOG.find((c) => c.id === "suspension");
  const cases = engineCat.options.map((engine) => {
    const t = Teams.LIST.find((t) => Parts.isOptionAvailable(engine, t));
    assert.ok(t, `${engine.id}: compatible team`);
    const suspension = suspensionCat.options.filter((o) => Parts.isOptionAvailable(o, t))
      .reduce((lowest, o) => (o.visual.ride || 0) < (lowest.visual.ride || 0) ? o : lowest);
    const parts = Parts.getVisualTiers({ ...Parts.getFactorySetup(t), engine: engine.id, suspension: suspension.id }, t);
    assert.equal(parts._ids.engine, engine.id, "probe uses the requested engine");
    return { label: engine.id, t, parts };
  });
  const base = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
  cases.push({ label: "synthetic-positive-clearance", t: team, parts: { ...base,
    _visual: { ...base._visual, suspension: { ...base._visual.suspension, ride: -0.10 } } } });
  for (const { label, t, parts } of cases) for (const id of ["hammerhead", "manta"])
    for (const [name, X] of [["flat", M], ["rounded", R]]) {
      const mesh = X.Car3D.build(t.color, t.color2, { noWheels: true, measure: true, teamId: t.id, parts,
        livery: { c1: t.color, c2: t.color2, bodyStyle: id } });
      const chassis = mesh.parts.find((p) => p.name === "chassis");
      let trayBottom = Infinity;
      for (let i = 1; i < chassis.vertices * 3; i += 3) trayBottom = Math.min(trayBottom, mesh.pos[i]);
      const aero = parts._visual.aero, edge = Math.max(0.72, Math.min(1.35, aero.floorEdge ?? 1));
      const cut = Math.max(0, Math.min(0.24, aero.floorCut ?? 0.04));
      const width = (k) => Math.min(0.95 - 0.055, k * edge); // existing 1900 mm assembly envelope
      const stations = [[0.78, width(0.69), 0.031], [-0.42 - cut, width(0.72), 0.026],
        [-0.48 + cut, width(0.70), 0.024], [-1.58, width(0.54 + cut * 0.35), 0.020],
        [-0.479, width(0.71), 0.019], [-0.421, width(0.71), 0.019]];
      for (const [z, centre, half] of stations) {
        const fence = [];
        for (let i = 0; i < mesh.mat.length; i++) if (mesh.mat[i] === X.Car3D.SURFACES.carbon) {
          const p = mesh.pos.slice(i * 3, i * 3 + 3);
          if (Math.abs(p[2] - z) < 1e-9 && Math.abs(Math.abs(Math.abs(p[0]) - centre) - half) < 1e-9) fence.push(p);
        }
        const tag = `${label}/${id}/${name}/${z}`;
        assert.ok(fence.length >= 8, `${tag}: original-width fence endpoint emitted`);
        assert.ok(fence.every((p) => p[1] >= trayBottom - 1e-9 && p[1] >= 0), `${tag}: fence clears tray and road`);
      }
    }
});
