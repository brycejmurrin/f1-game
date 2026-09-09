/* parts-distinct-mesh.test.mjs — every catalog option must CHANGE THE CAR.
 *
 * WHY THIS EXISTS. A part you pay 150 cr for and cannot see is indistinguishable
 * from a part that is not wired up, and nothing said which was which. The
 * catalog carries 297 options across 12 categories, each with a `visual` recipe
 * that Car3D.build consumes; a recipe key that gets renamed, a category that
 * stops reading one, or an option copied and left unedited all produce a row in
 * the GARAGE that quietly draws the previous car.
 *
 * The existing tool for this question, tools/car/audit-parts.mjs, renders every
 * option and writes a contact sheet — ~2 hours of SwiftShader here, and its
 * output is 300 PNGs for a human to compare, which docs say is sign-off only
 * and never an assertion source. Car3D.build is pure geometry (it returns
 * {pos,nrm,col,mat,idx} and touches no canvas), so the same question answers in
 * about a second by HASHING the mesh instead of looking at it.
 *
 * THE TRAP THIS TEST WAS BORN FROM. The first pass built every option against
 * one team and reported 100+ dead options. They were not dead: SIGNATURE parts
 * carry `teams: [id]` and manufacturer parts a supplier list, Parts._resolve
 * enforces both, and a Ferrari signature asked for on a McLaren correctly
 * resolves to the DEFAULT. That is the lock working. Every option is built
 * against a team it is legal for, and hashes are compared WITHIN a team — two
 * teams' cars differ by chassis style, so a cross-team comparison is noise.
 *
 * Run: node --test tests/unit/parts-distinct-mesh.test.mjs  (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const TEAMS = M.Teams.LIST.filter((t) => M.Parts.FACTORY_PRESETS[t.id]);
const byId = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

/** The team an option is actually legal for — mirrors audit-parts.mjs. */
function eligibleTeam(o) {
  if (o.teams && o.teams.length) return byId[o.teams[0]] || TEAMS[0];
  if (o.team) return byId[o.team] || TEAMS[0];
  const sup = o.suppliers || (o.supplier ? [o.supplier] : []);
  if (sup.length) return TEAMS.find((t) => sup.includes(t.engine)) || TEAMS[0];
  return byId.mclaren || TEAMS[0];
}

/* FNV-1a over the geometry that decides what you see. Positions are quantised
   to 1/4096 m (0.24 mm) — far below anything visible, and well above float
   noise, so the hash answers "is this a different car" and not "did a bit
   move". Vertex colours and material ids join it: an option that only recolours
   a part still changes the car. */
function meshHash(mesh) {
  let x = 0x811c9dc5;
  const feed = (arr) => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const v = Math.round(arr[i] * 4096) | 0;
      x ^= v & 255; x = Math.imul(x, 16777619);
      x ^= (v >>> 8) & 255; x = Math.imul(x, 16777619);
      x ^= (v >>> 16) & 255; x = Math.imul(x, 16777619);
    }
  };
  feed(mesh.pos); feed(mesh.col); feed(mesh.mat);
  return (x >>> 0).toString(16) + ":" + (mesh.pos ? mesh.pos.length : 0);
}
const buildFor = (setup, team) => meshHash(M.Car3D.build(team.color, team.color2,
  { teamId: team.id, num: 4, parts: M.Parts.getVisualTiers(setup, team) }));

test("every catalog option builds a car distinct from every other in its category", () => {
  const base = { ...M.Parts.DEFAULTS };
  const collisions = [];
  let total = 0;
  for (const cat of M.Parts.CATALOG) {
    const seen = new Map();
    for (const opt of cat.options) {
      const team = eligibleTeam(opt);
      const key = team.id + "|" + buildFor({ ...base, [cat.id]: opt.id }, team);
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(opt.id);
      total++;
    }
    for (const [, ids] of seen) {
      if (ids.length > 1) collisions.push(`${cat.id}: ${ids.join(" == ")}`);
    }
  }
  assert.ok(total > 250, `only ${total} options walked — the catalog shape changed`);
  assert.deepEqual(collisions, [],
    "two options in a category build the SAME car — one of them is a row the player pays for and cannot see");
});

test("no option leaves the car exactly as the team's default", () => {
  // Distinctness alone would pass a category where two options both do nothing
  // and differ only from each other. This is the other half: an option must
  // move the car off the baseline it starts from.
  const base = { ...M.Parts.DEFAULTS };
  const baseFor = {};
  for (const t of TEAMS) baseFor[t.id] = buildFor(base, t);
  const dead = [];
  for (const cat of M.Parts.CATALOG) {
    for (const opt of cat.options) {
      if (M.Parts.DEFAULTS[cat.id] === opt.id) continue;   // the baseline itself
      const team = eligibleTeam(opt);
      if (buildFor({ ...base, [cat.id]: opt.id }, team) === baseFor[team.id]) {
        dead.push(`${cat.id}/${opt.id} (on ${team.id})`);
      }
    }
  }
  assert.deepEqual(dead, [], "an option builds the default car — its visual recipe reaches nothing");
});
