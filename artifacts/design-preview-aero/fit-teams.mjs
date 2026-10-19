import { builds, split, ray, TEAMS } from "./fit-probe.mjs";
const down = (rest, x, z, y0 = 2) => { const t = ray(rest, [x, y0, z], [0, -1, 0], 3); return t == null ? "-" : (y0 - t).toFixed(3); };
const side = (rest, x0, y, z) => { const t = ray(rest, [x0, y, z], [1, 0, 0], 2); return t == null ? "-" : (x0 + t).toFixed(3); };
for (const tm of TEAMS) {
  const o = [tm.padEnd(12)];
  { const { on, off } = builds(tm, "x_wings"); const { rest } = split(on, off);
    o.push("podTop@.62 " + [0.03, -0.02, -0.07].map((z) => down(rest, 0.62, z)).join("/"));
    o.push("podTop@.55/.70 " + down(rest, 0.55, -0.02) + "/" + down(rest, 0.70, -0.02)); }
  { const { on, off } = builds(tm, "bridge_wing"); const { rest } = split(on, off);
    o.push("nose " + [2.15, 2.28, 2.40].map((z) => down(rest, 0, z, 0.445)).join("/"));
    o.push("mp@.34 " + [2.16, 2.30, 2.42].map((z) => down(rest, 0.34, z, 0.13)).join("/")); }
  { const { on, off } = builds(tm, "beam_twin"); const { rest } = split(on, off);
    o.push("epInner " + [0.47, 0.57, 0.67].map((y) => side(rest, 0.40, y, -2.44)).join("/")); }
  console.log(o.join(" | "));
}
