// New body vs the same team's factory car, keyed check|a|b: NEW = failing key the factory lacks
// (past limit + NOISE), WORSE = past the factory value by the check's own threshold, or count up 25% and ≥3.
// node design-preview/concept-bodies/fit-diff.mjs artifacts/logs/d1d-fit-new.json
import fs from "node:fs";
const j = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const BASE = process.env.BASE || "factory";   // e.g. BASE=body:probe0 with BASE_JSON=<its audit json>
if (process.env.BASE_JSON) j.cars.push(...JSON.parse(fs.readFileSync(process.env.BASE_JSON, "utf8")).cars.filter((c) => c.style === BASE));
const TH = { GAP: 3, PENETRATION: 20, ZFIGHT: 1, OPEN: 50 }, NOISE = { GAP: 1, PENETRATION: 1, ZFIGHT: 0.5, OPEN: 10 };
const key = (r) => `${r.check}|${[r.a, r.b].sort().join("|")}`;   // unordered: the audit names a pair either way round
const fac = {}; for (const c of j.cars) if (c.style === BASE) fac[c.team] = new Map(c.rows.filter((r) => r.fail).map((r) => [key(r), r]));
const out = {};
for (const c of j.cars) { if (c.style === BASE || c.style === "factory" || c.style.startsWith("body:probe")) continue;
  const o = (out[c.style] ||= { NEW: [], WORSE: [], builds: 0 }); o.builds++;
  for (const r of c.rows) { if (!r.fail) continue; const b = fac[c.team].get(key(r)), t = TH[r.check] ?? 0;
    if (!b) { if (r.value > t + (NOISE[r.check] ?? 0)) o.NEW.push(`${c.team} ${key(r)} ${r.value}${r.unit} @${r.where}`); }
    else if (r.value > b.value + t || (r.count >= b.count * 1.25 && r.count - b.count >= 3)) o.WORSE.push(`${c.team} ${key(r)} ${r.value} (factory ${b.value}) x${r.count}/${b.count}`); } }
for (const [s, o] of Object.entries(out)) { console.log(`${s}: ${o.NEW.length} NEW, ${o.WORSE.length} WORSE over ${o.builds} builds`); for (const l of [...o.NEW, ...o.WORSE].slice(0, 14)) console.log("  " + l); }
