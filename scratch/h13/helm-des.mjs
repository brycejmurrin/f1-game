import { loadParts } from "../../tools/car/parts-sweep.mjs";
const M = loadParts();
const H = M.Helmets || M.ctx?.Helmets;
console.log(Object.keys(M).join(","));
