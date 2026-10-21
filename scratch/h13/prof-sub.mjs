// Self time by function under the first frame matching a root name, across one cpuprofile.
import fs from "node:fs";
const [file, rootRe = "previewMesh"] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n])), par = new Map();
for (const n of p.nodes) for (const c of n.children || []) par.set(c, n.id);
const iv = (p.endTime - p.startTime) / p.samples.length / 1000, re = new RegExp(rootRe);
const self = new Map(); let total = 0;
for (const s of p.samples) {
  let cur = s, under = false;
  while (cur != null) { if (re.test(byId.get(cur).callFrame.functionName)) { under = true; break; } cur = par.get(cur); }
  if (!under) continue;
  const f = byId.get(s).callFrame, k = f.functionName + " " + (f.url || "").split("/").pop().split("?")[0] + ":" + (f.lineNumber + 1);
  self.set(k, (self.get(k) || 0) + iv); total += iv;
}
console.log("under", rootRe, Math.round(total), "ms");
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(Math.round(v)).padStart(5), k);
