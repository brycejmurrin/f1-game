import { loadParts } from "../../tools/car/parts-sweep.mjs";
const { Car3D, Teams } = loadParts({ shade: true });
for (const team of [Teams.LIST[0], Teams.LIST[2], Teams.LIST[0]]) {
  const steps = Car3D.buildSteps(team.color, team.color2, { teamId: team.id, num: 4 });
  const ts = []; let r, t = performance.now();
  do { r = steps.next(); const n = performance.now(); ts.push(+(n - t).toFixed(1)); t = n; } while (!r.done);
  console.log(team.id, "total", ts.reduce((a, b) => a + b, 0).toFixed(0), "ms steps:", ts.join(" "));
}
