// p75 size envelope: every TEAM_STYLE body + every BODY_STYLES row except the new ones, on the mclaren chassis.
// node design-preview/concept-bodies/envelope.mjs [--json]   NEW=rift,keel,delta,serpent rows are compared, not counted.
import { lowerEnvelope, frozen } from "./envelope-limits.mjs";
import { dims } from "./measure.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const { Car3D } = loadParts();
const NEW = (process.env.NEW || "rift,keel,delta,serpent").split(",");
const pop = [...Object.keys(Car3D.TEAM_STYLE), ...Object.keys(Car3D.BODY_STYLES).filter((k) => !NEW.includes(k))];
const T = Object.fromEntries(pop.map((id) => [id, dims(id)]));
const keys = Object.keys(T[pop[0]]);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return Math.round(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)); };
const p75 = Object.fromEntries(keys.map((k) => [k, q(pop.map((id) => T[id][k]), 0.75)]));
const p25 = Object.fromEntries(keys.map((k) => [k, q(pop.map((id) => T[id][k]), 0.25)]));
const ceiling = lowerEnvelope(p75);
const out = { pop, p25, p75, frozen, ceiling, rows: {} };
for (const id of NEW.filter((k) => Car3D.BODY_STYLES[k])) {
  const d = dims(id); out.rows[id] = { dims: d, over: keys.filter((k) => d[k] > ceiling[k]).map((k) => `${k} ${d[k]}>${ceiling[k]}`) };
}
if (process.argv.includes("--json")) console.log(JSON.stringify(out));
else {
  console.log("pop " + pop.length + ": " + pop.join(","));
  console.log("".padEnd(9) + keys.map((k) => k.padStart(9)).join(""));
  for (const [n, r] of [["p25", p25], ["p75", p75], ["ceiling", ceiling], ...Object.entries(out.rows).map(([k, v]) => [k, v.dims])]) console.log(n.padEnd(9) + keys.map((k) => String(r[k]).padStart(9)).join(""));
  for (const [k, v] of Object.entries(out.rows)) console.log(k, v.over.length ? "OVER ceiling: " + v.over.join(", ") : "within current/frozen ceiling");
}
