// car-build-parity — did a car3d.js edit change a build it was NOT meant to
// @doc Did a `car3d.js` edit move a build it was not meant to touch? Hashes pos/nrm/col/idx per variant across two versions.
// @skill garage-parts-livery / car-viewer
// touch? Builds the same car from two versions of js/car/car3d.js and hashes
// pos/nrm/col/idx per build variant, so an option-gated change (cockpit-only,
// halo-only, a parts tier) can be PROVEN not to move any other camera.
// Offline (node:vm), no browser, deterministic.
//
//   node tools/car-build-parity.mjs <before-car3d.js> [after-car3d.js]
//     before: any copy of the file — `git show HEAD:js/car/car3d.js > /tmp/a.js`
//     after:  defaults to the working tree
//
// WHY THIS EXISTS: the cockpit accent-dimming round had to show that dimming a
// livery accent for the DRIVER left the chase/far/tcam cameras untouched. The
// livery is the product; silently desaturating it everywhere would have been a
// far worse bug than the one being fixed. Hashes settle that in one run.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";

const VARIANTS = [
  ["external chase",    {}],
  ["external no-wheels", { noWheels: true }],
  ["cockpit",           { noWheels: true, noDriver: true, cockpit: true, halo: true }],
];

function build(carPath, opts, c1, c2, teamId) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ["js/log.js", "js/mat4.js", "js/car/teams.js", "js/car/parts.js", carPath])
    vm.runInContext(readFileSync(f, "utf8"), ctx, { filename: f });
  const m = vm.runInContext("Car3D", ctx).build(c1, c2, { teamId, ...opts });
  const h = createHash("sha256");
  for (const k of ["pos", "nrm", "col", "idx"]) h.update(Buffer.from(Float64Array.from(m[k]).buffer));
  return { hash: h.digest("hex").slice(0, 16), tris: m.idx.length / 3 };
}

const before = process.argv[2];
const after = process.argv[3] || "js/car/car3d.js";
if (!before) { console.error("usage: node tools/car-build-parity.mjs <before-car3d.js> [after-car3d.js]"); process.exit(2); }

// Two liveries: a white accent (the case that motivated this) and a saturated
// one, so a change that only fires for near-neutral colours is still covered.
let changed = 0;
for (const [team, c1, c2] of [["ferrari", [0.86, 0, 0], [1, 1, 1]], ["mclaren", [1, 0.5, 0], [0.12, 0.12, 0.12]]]) {
  for (const [tag, opts] of VARIANTS) {
    const a = build(before, opts, c1, c2, team), b = build(after, opts, c1, c2, team);
    const same = a.hash === b.hash && a.tris === b.tris;
    if (!same) changed++;
    console.log(`${same ? "IDENTICAL" : "CHANGED  "}  ${team.padEnd(8)} ${tag.padEnd(18)} ` +
      `before=${a.hash}/${a.tris}t after=${b.hash}/${b.tris}t`);
  }
}
console.log(changed ? `${changed} variant(s) changed — confirm each was intended` : "every variant identical");
