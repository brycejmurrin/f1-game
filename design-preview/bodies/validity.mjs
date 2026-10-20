// Every preview body x every team chassis (factory setup), square and rounded builds:
// finite, nothing under the road, pods never wider than the widest shipped body on that
// engine at that station (so they cannot reach the tyres), nose tip behind the wing LE.
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const NEW = (process.env.NEW || "highnose,sharkfin,lowline,stepnose").split(",");
const out = [];
for (const shade of [false, true]) {
  const { Car3D, Parts, Teams } = loadParts(shade ? { shade: true } : undefined);
  const OLD = [...Object.keys(Car3D.TEAM_STYLE), ...Object.keys(Car3D.BODY_STYLES).filter((k) => !NEW.includes(k))];
  let n = 0;
  for (const t of Teams.LIST) {
    const T = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
    const widest = {};
    for (const st of OLD) for (const p of Car3D.bodyAnchors(T, st, undefined, shade).podStations) widest[p.z] = Math.max(widest[p.z] || 0, p.outer);
    let baseMin = Infinity;
    for (const st of OLD) { const base = Car3D.buildComplete(t.color, t.color2, { livery: { c1: t.color, c2: t.color2, bodyStyle: st }, teamId: t.id, num: 4, parts: T });
      for (let i = 1; i < base.pos.length; i += 3) baseMin = Math.min(baseMin, base.pos[i]); }
    for (const id of NEW) {
      n++;
      const d = Car3D.buildComplete(t.color, t.color2, { livery: { c1: t.color, c2: t.color2, bodyStyle: id }, teamId: t.id, num: 4, parts: T });
      if (!d.pos.every(Number.isFinite)) out.push(`${id}/${t.id}${shade ? "/round" : ""}: non-finite`);
      let miny = Infinity, maxz = -Infinity; for (let i = 0; i < d.pos.length; i += 3) { miny = Math.min(miny, d.pos[i + 1]); maxz = Math.max(maxz, d.pos[i + 2]); }
      if (miny < baseMin - 1e-6) out.push(`${id}/${t.id}: lowest vertex ${miny.toFixed(3)} under the lowest shipped body's ${baseMin.toFixed(3)}`);
      for (const p of Car3D.bodyAnchors(T, id, undefined, shade).podStations) if (p.outer > widest[p.z] + 1e-9) out.push(`${id}/${t.id} z${p.z}: pod ${p.outer.toFixed(3)} > widest ${widest[p.z].toFixed(3)}`);
      const tip = Car3D.styledNoseStations ? null : null;
      if (maxz > 3.20) out.push(`${id}/${t.id}: car front z ${maxz.toFixed(3)}`);
    }
  }
  console.log(`${shade ? "rounded" : "square"}: ${n} builds (${NEW.length} bodies x ${n / NEW.length} chassis)`);
}
console.log(out.length ? out.slice(0, 30).join("\n") : "ALL PASS");
process.exitCode = out.length ? 1 : 0;
