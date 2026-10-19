// Surface heights under/around each suspect contact, per team. Usage: node fit-seats.mjs [team]
import { builds, split, ray, bbox, TEAMS } from "./fit-probe.mjs";
const teams = process.argv[2] ? [process.argv[2]] : TEAMS;
const down = (rest, x, z, y0 = 2) => { const t = ray(rest, [x, y0, z], [0, -1, 0], 3); return t == null ? null : +(y0 - t).toFixed(3); };
const up = (rest, x, z, y0 = 0.0) => { const t = ray(rest, [x, y0, z], [0, 1, 0], 3); return t == null ? null : +(y0 + t).toFixed(3); };
for (const tm of teams) {
  const row = { team: tm };
  { const { on, off } = builds(tm, "x_wings"); const { part, rest } = split(on, off);
    row.xw_part = bbox(part); row.xw_podTop = [-0.02, 0.05, -0.09].map((z) => down(rest, 0.62, z)); }
  { const { on, off } = builds(tm, "bridge_wing"); const { part, rest } = split(on, off);
    row.br_part = bbox(part); row.br_noseTop = [2.18, 2.30, 2.42].map((z) => down(rest, 0, z));
    row.br_strutFoot = [2.16, 2.42].map((z) => down(rest, 0.34, z, 0.2)); }
  { const { on, off } = builds(tm, "monkey_seat"); const { part, rest } = split(on, off);
    row.mk_part = bbox(part); row.mk_crashTop = [-2.08, -2.12, -2.16].map((z) => down(rest, 0, z, 0.63)); }
  console.log(JSON.stringify(row));
}
