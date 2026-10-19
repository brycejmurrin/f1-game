import { loadParts } from "../../tools/car/parts-sweep.mjs";
const M = loadParts(); const out = {};
for (const t of M.Teams.LIST) {
  const P = M.Parts.FACTORY_PRESETS[t.id]; if (!P) continue;
  const m = M.Car3D.build(t.color, t.color2, { teamId: t.id, num: 4, parts: M.Parts.getVisualTiers({ ...M.Parts.DEFAULTS, ...P }, t) });
  let x = 0x811c9dc5; for (const a of [m.pos, m.col, m.mat, m.idx]) for (let i = 0; i < a.length; i++) { x ^= Math.round(a[i] * 65536) | 0; x = Math.imul(x, 16777619); }
  out[t.id] = (x >>> 0).toString(16) + ":" + m.pos.length;
}
console.log(JSON.stringify(out));
