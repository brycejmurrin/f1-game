// Node: time the garage-preview Car3D.build (refinish:true, as setup-camera builds it) and a colour-only rebuild.
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const M = loadParts();
const team = M.Teams.LIST[0];
const parts = M.Parts.getVisualTiers(M.Parts.DEFAULTS, team);
const liv = (c1) => Object.assign({}, M.Teams.LIST[0].livery || {}, { c1, c2: [1, 1, 1] });
const b = (l) => M.Car3D.build(l.c1, l.c2, { livery: l, refinish: true, teamId: team.id, num: 1, parts });
for (let i = 0; i < 3; i++) b(liv([0.9, 0.1, 0.1]));
const N = 10, t0 = performance.now();
for (let i = 0; i < N; i++) b(liv([0.9, 0.1 + i * 0.01, 0.1]));
console.log("build ms", ((performance.now() - t0) / N).toFixed(1), "verts", b(liv([1, 0, 0])).pos.length / 3);
