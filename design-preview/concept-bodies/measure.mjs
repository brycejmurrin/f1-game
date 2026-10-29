// Round 4 size table (B·D1c): part sizes in mm, ray-cast on the built mesh, for Bryce's
// "some are too big" review. node design-preview/concept-bodies/measure.mjs [team] [--json]
// IDS=team,highnose,... picks rows. The shipped envelope is team + the six shipped bodies.
import { build, cast } from "./fit-probe.mjs";
const mm = (v) => Math.round(v * 1000);
const up = (o, ks, lo = 0.1) => ks.flatMap((k) => o[k] || []).filter((y) => y > lo);
export function dims(id, team = "mclaren") {
  const d = build(id, team), r = {};
  for (const z of [2.2, 1.9, 1.6]) {           // nose cone: depth, width, top
    const ys = up(cast(d, "y", 0, z), ["chassis"]); if (ys.length < 2) { r[`n${z}h`] = r[`n${z}w`] = r[`n${z}top`] = 0; continue; }
    const top = Math.max(...ys), bot = Math.min(...ys), xs = cast(d, "x", (top + bot) / 2, z).chassis || [0];
    r[`n${z}h`] = mm(top - bot); r[`n${z}w`] = mm(Math.max(...xs) - Math.min(...xs)); r[`n${z}top`] = mm(top);
  }
  for (const z of [0.2, -0.4]) {                // sidepod: outer half-width, shoulder top (max over x)
    let w = 0, t = 0;
    for (let y = 0.15; y < 0.7; y += 0.02) { const x = cast(d, "x", y, z).sidepods; if (x) w = Math.max(w, ...x); }
    for (let x = 0.32; x < 0.8; x += 0.03) { const y = cast(d, "y", x, z).sidepods; if (y) t = Math.max(t, ...y); }
    r[`pod${z}w`] = mm(w); r[`pod${z}top`] = mm(t);
  }
  for (const z of [-0.55, -0.95, -1.5]) {       // engine cover + body fin on the centreline
    const ys = up(cast(d, "y", 0, z), ["engineCover"]); r[`cov${z}`] = ys.length ? mm(Math.max(...ys)) : 0;
  }
  let cw = 0; for (let y = 0.3; y < 0.95; y += 0.02) { const x = cast(d, "x", y, -0.95).engineCover; if (x) cw = Math.max(cw, ...x.filter((v) => v < 0.5)); }
  r.covHalfW = mm(cw);
  return r;
}
const SHIPPED = ["team", "needle", "brick", "anteater", "arched", "wedge", "barge"];
const NEW = ["highnose", "sharkfin", "stepnose", "lowline"];
function table(team = "mclaren", ids = [...SHIPPED, ...NEW]) {
  return Object.fromEntries(ids.map((id) => [id, dims(id === "team" ? undefined : id, team)]));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const team = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "mclaren";
  const T = table(team, process.env.IDS ? process.env.IDS.split(",") : undefined);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(T)); process.exit(0); }
  const keys = Object.keys(Object.values(T)[0]);
  console.log("".padEnd(9) + keys.map((k) => k.padStart(9)).join(""));
  for (const [n, r] of Object.entries(T)) console.log(n.padEnd(9) + keys.map((k) => String(r[k]).padStart(9)).join(""));
  const env = Object.fromEntries(keys.map((k) => [k, Math.max(...SHIPPED.filter((s) => T[s]).map((s) => T[s][k]))]));
  console.log("envMAX".padEnd(9) + keys.map((k) => String(env[k]).padStart(9)).join(""));
  const tm = T.team; if (tm) console.log("team".padEnd(9) + keys.map((k) => String(tm[k]).padStart(9)).join(""));
}
