// Hash every factory team car and every shipped body on every chassis (square + rounded) — HEAD vs working tree.
import fs from "node:fs"; import crypto from "node:crypto"; import { execSync } from "node:child_process";
const HEAD = process.env.HEAD_REF ? (f) => execSync(`git show ${process.env.HEAD_REF}:${f}`, { encoding: "utf8", maxBuffer: 1 << 26 }) : null;
if (HEAD) { const rf = fs.readFileSync; fs.readFileSync = function (f, ...r) { const s = String(f); const m = s.match(/\/(js\/.*\.js)$/); if (m && r[0] === "utf8") { try { return HEAD(m[1]); } catch { } } return rf.call(fs, f, ...r); }; }
const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
const SKIP = (process.env.SKIP || "highnose,sharkfin,zeropod,lowline,stepnose").split(",");
const h = crypto.createHash("sha1"); let n = 0;
for (const shade of [false, true]) {
  const { Car3D, Parts, Teams } = loadParts(shade ? { shade: true } : undefined);
  const styles = [undefined, ...Object.keys(Car3D.BODY_STYLES).filter((k) => !SKIP.includes(k))];
  for (const t of Teams.LIST) { const T = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
    for (const st of styles) for (const o of [{}, { field: true }]) {
      const d = Car3D.buildComplete(t.color, t.color2, Object.assign({ livery: { c1: t.color, c2: t.color2, bodyStyle: st }, teamId: t.id, num: 4, parts: T }, o));
      h.update(Float32Array.from(d.pos)); h.update(Float32Array.from(d.col)); h.update(Uint32Array.from(d.idx)); n++; } }
}
console.log(n, "builds", h.digest("hex"));
