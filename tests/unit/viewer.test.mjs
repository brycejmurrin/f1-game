// tools/viewer: the 3D viewer page must carry the car and circuit the ENGINE
// builds, not an approximation. The car payload is welded and quantised to
// millimetres for size, so this pins that the round trip loses nothing a viewer
// could see (≤ 0.5 mm per vertex, every triangle kept), that a circuit carries
// its real built length, and that the data splices into the template intact.
//
// Run: node --test tests/unit/viewer.test.mjs   (npm run test:tooling-fast; ~6 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carData, circuitData, viewerHtml, teamIds } from "../../tools/viewer/viewer-data.mjs";
import { parseArgs, resolveSelection, DEFAULT_CIRCUITS } from "../../tools/viewer/build-viewer.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const decode = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };

test("a car payload decodes to the Car3D mesh: every triangle, each corner within 0.5 mm", () => {
  const D = carData("ferrari");
  const pos = decode(D.pos, Int16Array), idx = decode(D.idx, D.idx32 ? Uint32Array : Uint16Array);
  assert.equal(pos.length, D.verts * 3);
  // The reference build, the same way viewer-data builds it.
  const M = loadParts();
  const Liveries = (() => { const ctx = { console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, "js/car/liveries.js"), "utf8"), ctx);
    return vm.runInContext("Liveries", ctx); })();
  const team = M.Teams.LIST.find((t) => t.id === "ferrari");
  const liv = Liveries.forTeam(team)[0];
  const ref = M.Car3D.buildComplete(liv.c1, liv.c2, { livery: liv, teamId: team.id, num: team.drivers[0].num,
    parts: M.Parts.getVisualTiers(M.Parts.getFactorySetup(team), team) });
  assert.equal(idx.length, ref.idx.length, "welding must keep every triangle");
  let worst = 0;
  for (let i = 0; i < idx.length; i++) for (let a = 0; a < 3; a++)
    worst = Math.max(worst, Math.abs(pos[idx[i] * 3 + a] / 1000 - ref.pos[ref.idx[i] * 3 + a]));
  assert.ok(worst <= 0.0005 + 1e-9, `worst corner error ${worst} m`);
  assert.ok(D.verts < ref.pos.length / 3, "welding shrinks the vertex count");
});

test("a circuit payload keeps the built lap and a closed, sampled centreline", () => {
  const D = circuitData("monza");
  assert.ok(D.total > 5000 && D.total < 6500, `monza lap ${D.total} m`);
  const n = D.x.length;
  for (const k of ["y", "z", "rx", "rz", "hw", "k", "l"]) assert.equal(D[k].length, n, k);
  assert.ok(n >= 300 && n <= 1000, `${n} nodes`);
  let len = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; len += Math.hypot(D.x[j] - D.x[i], D.z[j] - D.z[i]); }
  assert.ok(Math.abs(len - D.total) / D.total < 0.02, `sampled loop ${len.toFixed(0)} m vs built ${D.total} m`);
});

test("the page carries the data intact and nothing can close its <script>", () => {
  const html = viewerHtml({ cars: ["haas"], circuits: ["monaco"] });
  assert.ok(!html.includes("/*@DATA*/null"), "marker replaced");
  const json = html.match(/const DATA = (\{.*\});\n/)[1];
  const data = JSON.parse(json);
  assert.deepEqual(Object.keys(data.cars), ["haas"]);
  assert.deepEqual(Object.keys(data.circuits), ["monaco"]);
  assert.ok(!json.includes("</"), "no </ inside the inline script");
});

test("build-viewer: selection defaults, 'all', and refusals", () => {
  const valid = { cars: ["ferrari", "haas"], circuits: ["monza", "spa", "imola"] };
  assert.deepEqual(resolveSelection({}, valid), { cars: ["ferrari", "haas"], circuits: DEFAULT_CIRCUITS.filter((c) => valid.circuits.includes(c)) });
  assert.deepEqual(resolveSelection({ cars: "all" }, valid), { cars: ["ferrari", "haas"], circuits: [] });
  assert.deepEqual(resolveSelection({ circuits: "imola" }, valid), { cars: [], circuits: ["imola"] });
  assert.throws(() => resolveSelection({ cars: "ferari" }, valid), /unknown team: ferari/);
  assert.throws(() => parseArgs(["--car=x"]), /unknown argument/);
  assert.deepEqual(parseArgs(["--cars=a,b", "--json"]).cars, "a,b");
  assert.equal(parseArgs(["--shots"]).shots, true, "--shots is a flag");
  assert.equal(parseArgs([]).shots, false);
  assert.ok(teamIds().includes("ferrari"));
});
