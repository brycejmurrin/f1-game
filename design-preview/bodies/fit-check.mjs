// Round 3 fit check: each preview-body join measured on all 11 team chassis, square and rounded.
// A join PASSES when the two parts' skins overlap (seated) and nothing it hangs from is open air.
// node design-preview/bodies/fit-check.mjs   (ROUND=1 for the rounded build only)
const rows = [], fail = [];
for (const round of process.env.ROUND ? [true] : [false, true]) {
  process.env.ROUND = round ? "1" : "";
  const { build, cast, Teams } = await import(`./fit-probe.mjs?round=${round}`);
  for (const t of Teams.LIST) {
    const tag = `${t.id}${round ? "/round" : ""}`;
    const hn = build("highnose", t.id);   // wing arm top inside the raised nose
    const a = cast(hn, "y", 0.06, 2.41), armTop = Math.max(...(a.frontWing || [-1])), noseBot = (a.chassis || [9])[0];
    rows.push(["highnose arm top − nose bottom", tag, armTop - noseBot]);
    const sn = build("stepnose", t.id);   // hood front buried under the tub crown; camera pod on the skin
    for (const z of [1.10, 1.14]) { const c = cast(sn, "y", 0, z);
      rows.push([`stepnose crown − hood top z${z}`, tag, Math.max(...c.chassis) - Math.max(...(c.hood || [-1]))]); }
    for (const z of [1.48, 1.62]) { const c = cast(sn, "y", 0, z);
      rows.push([`stepnose skin − cam pod bottom z${z}`, tag, Math.max(...c.chassis) - Math.min(...(c.livery || [9]))]); }
    const sf = build("sharkfin", t.id);   // sail foot inside the main plane
    // foot vs plane top at the sail's end (chord t 0.30 = z -2.366); the plane is read at x 0.04,
    // clear of the 30 mm spine strut, and the foot is the sail's lowest crossing near it at x 0
    const m = cast(sf, "y", 0.04, -2.364), s = cast(sf, "y", 0, -2.364);
    const plane = m.rearAssembly.filter((y) => y > 0.28), mainTop = plane.length >= 2 ? plane[1] : -9;   // [bottom, top] of the main plane
    const feet = s.rearAssembly.filter((y) => y > mainTop - 0.02 && y < mainTop - 0.003), sailFoot = feet.length ? Math.min(...feet) : 9;
    rows.push(["sharkfin main top − sail foot", tag, mainTop - sailFoot]);
  }
}
const byJoin = {};
for (const [j, tag, v] of rows) { (byJoin[j] ||= []).push(v); if (!(v > 0)) fail.push(`${j} ${tag}: ${v.toFixed(4)}`); }
for (const [j, v] of Object.entries(byJoin)) console.log(`${j.padEnd(38)} min ${(Math.min(...v) * 1000).toFixed(1)} mm  max ${(Math.max(...v) * 1000).toFixed(1)} mm  (${v.length} builds)`);
console.log(fail.length ? "FAIL\n" + fail.slice(0, 20).join("\n") : "ALL SEATED");
process.exitCode = fail.length ? 1 : 0;
