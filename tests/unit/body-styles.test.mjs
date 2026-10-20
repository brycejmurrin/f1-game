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
import { auditMesh } from "../../tools/car/car-fit-audit.mjs";

const M = loadParts();
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

// User reference: the four independent Blender studies have a broad, short,
// downturned cone and a continuous rounded spine. These checks read emitted
// triangles as well as attachment datums, so a recipe flag alone cannot pass.
const BLENDER_BODIES = ["caldra", "rovik", "senzo", "talven"];
const STUDY_BODIES = [...BLENDER_BODIES, "orvex", "nacrel"];
function skinSection(mesh, range, z) {
  const points = [];
  for (let i = 0; i < mesh.idx.length; i += 3) {
    const ids = mesh.idx.slice(i, i + 3);
    if (!ids.every(v => v >= range.from && v < range.to)) continue;
    const tri = ids.map(v => mesh.pos.slice(v * 3, v * 3 + 3));
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      if ((z - a[2]) * (z - b[2]) > 0 || Math.abs(b[2] - a[2]) < 1e-9) continue;
      const f = (z - a[2]) / (b[2] - a[2]);
      points.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  assert.ok(points.length, `No emitted skin section at ${z}`);
  return [Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
test("six studies have distinct emitted nose/pod/spine silhouettes with common paint", () => {
  for (const smooth of [false, true]) {
    const profiles = STUDY_BODIES.map(bodyStyle => {
      const m = Car3D.build(team.color, team.color2, { smooth, measure: true, noWheels: true, teamId: team.id, livery: { bodyStyle } });
      return [[m.noseSkin, [2.40, 2.20, 1.70]], [m.podSkin, [.22, -.38, -.62, -.90]], [m.coverSkin, [-.80, -1.30, -1.70]]]
        .flatMap(([range, zs]) => zs.flatMap(z => skinSection(m, range, z)));
    });
    for (let a = 0; a < profiles.length; a++) for (let b = a + 1; b < profiles.length; b++)
      assert.ok(Math.max(...profiles[a].map((n, i) => Math.abs(n - profiles[b][i]))) >= .08,
        `${STUDY_BODIES[a]}/${STUDY_BODIES[b]}/${smooth}: no 80 mm silhouette difference`);
  }
});
function verticalHits(mesh, range, x, z) {
  const hits = [], P = mesh.pos;
  for (let i = 0; i < mesh.idx.length; i += 3) {
    const ids = mesh.idx.slice(i, i + 3);
    if (!ids.every((v) => v >= range.from && v < range.to)) continue;
    const [a, b, c] = ids.map((v) => P.slice(v * 3, v * 3 + 3));
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-12) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
    if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
      hits.push(u * a[1] + v * b[1] + (1 - u - v) * c[1]);
  }
  assert.ok(hits.length, `No skin at x${x},z${z}`);
  return hits;
}

test("Blender bodies emit short broad noses with a curved descending crown", () => {
  for (const bodyStyle of BLENDER_BODIES) {
    const m = Car3D.build(team.color, team.color2, { noWheels: true, measure: true, teamId: team.id, livery: { bodyStyle } });
    const chassis = m.parts.find((p) => p.name === "chassis");
    const points = Array.from({ length: chassis.to - chassis.from }, (_, i) => m.pos.slice((i + chassis.from) * 3, (i + chassis.from) * 3 + 3));
    const tipZ = Math.max(...points.map((p) => p[2]));
    assert.ok(tipZ >= 2.44 && tipZ <= 2.56 + 1e-9, `${bodyStyle}: long cone ${tipZ}`);
    const tipWidth = 2 * Math.max(...points.filter((p) => Math.abs(p[2] - tipZ) < 1e-8).map((p) => Math.abs(p[0])));
    assert.ok(tipWidth >= 0.25, `${bodyStyle}: needle tip ${tipWidth}`);
    const z0 = 1.12, z1 = tipZ - 0.02, zm = (z0 + z1) / 2;
    const top = (z) => Math.max(...verticalHits(m, chassis, 0, z));
    assert.ok(top(z0) > top(zm) && top(zm) > top(z1), `${bodyStyle}: crown does not descend`);
    assert.ok(top(zm) - (top(z0) + top(z1)) / 2 > 0.035, `${bodyStyle}: straight wedge instead of a curved crown`);
  }
});

test("Blender noses carry a broad painted shoulder over the front axle", () => {
  const paint = [0.72, 0.66, 0.54];
  for (const smooth of [false, true]) for (const bodyStyle of BLENDER_BODIES) {
    const options = { noWheels: true, measure: true, smooth, teamId: team.id, livery: { bodyStyle } };
    const plain = Car3D.build(team.color, team.color2, options);
    const m = Car3D.build(team.color, team.color2, { ...options, livery: { bodyStyle, nose: paint } });
    // Read the actual roof at both sides of a 320 mm shoulder, rather than
    // accepting a wide bottom edge or a cap at the very end of a thin cone.
    for (const x of [-0.16, 0.16])
      assert.ok(Math.max(...verticalHits(m, m.noseSkin, x, Car3D.AXLES.frontZ)) > 0.43,
        `${bodyStyle}/${smooth}: upper shoulder too narrow`);
    assert.deepEqual(m.pos, plain.pos, "nose colour must not add a straight overlay over the curved skin");
    for (let i = m.noseSkin.from; i < m.noseSkin.to; i++)
      assert.deepEqual(Array.from(m.col.slice(i * 3, i * 3 + 3)), paint, "nose paint must reach every skin station");
  }
});

test("study nose, pod and spine skins are closed, consistently wound and sampled by their anchors", () => {
  for (const round of [false, true]) {
    const X = round ? Shaded : Car3D;
    for (const bodyStyle of STUDY_BODIES) {
      const m = X.build(team.color, team.color2, { noWheels: true, measure: true, smooth: round, teamId: team.id, livery: { bodyStyle } });
      for (const [skin, range] of [["cover", m.coverSkin], ["nose", m.noseSkin], ["pod", m.podSkin]]) {
      assert.ok(range && range.to > range.from, `${bodyStyle}: no emitted ${skin} skin`);
      const edges = new Map(), zs = new Set(); let volume6 = 0, count = 0;
      const key = (p) => p.map((x) => Math.round(x * 1e8)).join(",");
      for (let i = 0; i < m.idx.length; i += 3) {
        const ids = m.idx.slice(i, i + 3);
        if (!ids.every((v) => v >= range.from && v < range.to)) continue;
        const [a, b, c] = ids.map((v) => m.pos.slice(v * 3, v * 3 + 3));
        const cross = [b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0]];
        volume6 += a.reduce((n, v, j) => n + v * cross[j], 0); count++;
        const verts = [a, b, c];
        for (let j = 0; j < 3; j++) {
          zs.add(Math.round(verts[j][2] * 1e8));
          const u = key(verts[j]), v = key(verts[(j+1)%3]), k = [u,v].sort().join("|");
          const e = edges.get(k) || { count: 0, direction: 0 }; e.count++; e.direction += u < v ? 1 : -1; edges.set(k,e);
        }
      }
      if (skin === "pod") assert.ok(zs.size >= 9 && zs.size <= 10, `${bodyStyle}/${round}: pod stations or inlet throat missing`);
      else assert.equal(zs.size, 9, `${bodyStyle}/${round}: longitudinal curve missing`);
      if (skin === "cover") assert.equal(count, 284, `${bodyStyle}/${round}: unexpected cover cost`);
      else if (skin === "nose") assert.ok(count >= 68 && count <= 300, `${bodyStyle}/${round}: unexpected nose cost ${count}`);
      else assert.ok(count <= 400, `${bodyStyle}/${round}: unexpected pod cost ${count}`);
      assert.ok(volume6 > 0, `${bodyStyle}/${round}: inward skin`);
      assert.ok([...edges.values()].every((e) => e.count === 2 && e.direction === 0), `${bodyStyle}/${round}: open or inconsistent skin`);
      const anchors = X.bodyAnchors(null, bodyStyle, undefined, round);
      if (skin === "cover") for (const z of [...zs].sort((a,b) => b-a).filter((_,i) => i%2 === 1).map(z => z/1e8)) {
        const actual = Math.max(...verticalHits(m, range, 0, z));
        assert.ok(Math.abs(actual - anchors.coverAt(z).top) < 1e-8, `${bodyStyle}/${round}: roof datum detached`);
      }
      }
    }
  }
});

test("thin study pods keep the accent flash above the sponsor board", () => {
  const accent = [0.123,0.456,0.789];
  for (const bodyStyle of STUDY_BODIES) {
    const m = Car3D.build(team.color,team.color2,{noWheels:true,measure:true,livery:{bodyStyle,accent}});
    const sec = m.parts.find(p=>p.name==="livery"), a = Car3D.bodyAnchors(null,bodyStyle);
    let count = 0;
    for (let v=sec.from;v<sec.to;v++) {
      const i=v*3,[x,y,z]=m.pos.slice(i,i+3);
      if (Math.abs(x)<0.35 || z<-.026 || z>.426 || !accent.every((c,k)=>Math.abs(c-m.col[i+k])<1e-8)) continue;
      const p=a.podAt(z);count++;
      assert.ok(y>=p.bottom+(p.top-p.bottom)*.82,`${bodyStyle}: flash overlaps sponsor band`);
    }
    assert.ok(count>0,`${bodyStyle}: flash missing`);
  }
});

test("Blender noses retain seated wing mounts and suspension roots", () => {
  const t=Teams.LIST.find(t=>t.id==="mercedes"), parts=Parts.getVisualTiers(Parts.getFactorySetup(t),t);
  for (const bodyStyle of STUDY_BODIES) {
    const m=Car3D.buildComplete([.8,.1,.1],[.1,.2,.85],{teamId:t.id,num:44,parts,measure:true,livery:{bodyStyle}});
    const {rows}=auditMesh(m,["GAP","PENETRATION"]);
    assert.deepEqual(rows.filter(r=>r.fail && r.a==="frontWing" && ["chassis","aeroFlaps"].includes(r.b)),[],`${bodyStyle}: main wing attachment`);
    assert.deepEqual(rows.filter(r=>r.fail && r.check==="PENETRATION" && r.a==="suspension" && r.b==="chassis"),[],`${bodyStyle}: suspension roots buried in the nose`);
    if (bodyStyle === "senzo") assert.deepEqual(rows.filter(r=>r.fail && r.check==="PENETRATION" && r.a==="bodyDetail" && r.b==="sidepods"),[],"Senzo must not stack the supplier duct inside its triangular inlet");
  }
});
