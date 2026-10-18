// tools/viewer: the 3D viewer page must show the car and circuit the ENGINE
// builds, not an approximation. Cars are built in the page from an embedded copy
// of the js/car roster, so this pins that the embedded script builds exactly the
// mesh the game's own loader builds; that a circuit carries its real built
// length; and that the data splices into the template intact.
//
// Run: node --test tests/unit/viewer.test.mjs   (npm run test:tooling-fast; ~6 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { carBundle, circuitData, viewerHtml, teamIds } from "../../tools/viewer/viewer-data.mjs";
import { parseArgs, resolveSelection, DEFAULT_CIRCUITS } from "../../tools/viewer/build-viewer.mjs";
import { parseSheet, pixelDiffPct, CAT_FRAME } from "../../tools/viewer/viewer-shots.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

test("the page's embedded car roster builds the same mesh the game's loader does", () => {
  // The page builds cars itself from carBundle(); run that exact script in a VM
  // and compare against tools/car/parts-sweep.mjs loadParts() for one team.
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(carBundle(), ctx);
  const [Car3D, Parts, Teams, Liveries] = ["Car3D", "Parts", "Teams", "Liveries"].map((n) => vm.runInContext(n, ctx));
  const build = (C3, P, T, liv) => {
    const team = T.LIST.find((t) => t.id === "ferrari");
    const l = liv || { c1: team.color, c2: team.color2 };
    return C3.buildComplete(l.c1, l.c2, { livery: l, teamId: team.id, num: 16, parts: P.getVisualTiers(P.getFactorySetup(team), team) });
  };
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const liv = Liveries.forTeam(team)[0];
  const page = build(Car3D, Parts, Teams, liv);
  const M = loadParts();
  const ref = build(M.Car3D, M.Parts, M.Teams, liv);
  assert.equal(page.pos.length, ref.pos.length, "same vertex count");
  assert.deepEqual(Array.from(page.idx), Array.from(ref.idx), "same triangles");
  assert.ok(page.pos.every((v, i) => v === ref.pos[i]), "same positions");
  assert.ok(Liveries.forTeam(team).length > 20, "the page offers the garage's full livery list");
  assert.ok(!carBundle().match(/<\/script/i), "nothing in the bundle can close its <script>");
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
  assert.deepEqual(data.cars, ["haas"]);
  assert.ok(html.includes("const Car3D"), "the car roster is embedded when a car is asked for");
  assert.ok(!viewerHtml({ circuits: ["monaco"] }).includes("const Car3D"), "and left out when none is");
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
  assert.equal(parseArgs(["--sheet=liveries:ferrari"]).sheet, "liveries:ferrari");
  assert.equal(parseArgs(["--match=^neo_"]).match, "^neo_");
  assert.equal(parseArgs(["--frame=nose"]).frame, "nose");
  assert.deepEqual(parseSheet("bodies:haas"), { kind: "bodies", team: "haas" });
  assert.deepEqual(parseSheet("parts:aero:haas"), { kind: "parts", cat: "aero", team: "haas" });
  assert.deepEqual(parseSheet("finishes:haas"), { kind: "finishes", team: "haas" });
  assert.throws(() => parseSheet("wheels:haas"), /unknown --sheet kind/);
  assert.throws(() => parseSheet("parts:aero"), /parts:<category>:<team>/);
  assert.ok(teamIds().includes("ferrari"));
});

test("close-ups: every part category has a frame the page defines, and the pair diff measures pixels", async () => {
  const html = viewerHtml({ cars: ["haas"] });
  for (const [cat, f] of Object.entries(CAT_FRAME)) assert.match(html, new RegExp(`\\b${f}:\\s*\\[\\[`), `${cat} -> ${f} is not a FRAMES entry`);
  const sharp = (await import("sharp")).default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viewer-diff-"));
  const png = (name, g) => sharp({ create: { width: 10, height: 10, channels: 3, background: { r: g, g, b: g } } }).png().toFile(path.join(dir, name)).then(() => path.join(dir, name));
  const [a, b, c] = await Promise.all([png("a.png", 0), png("b.png", 0), png("c.png", 200)]);
  assert.equal(await pixelDiffPct(a, b), 0);
  assert.equal(await pixelDiffPct(a, c), 100);
  fs.rmSync(dir, { recursive: true, force: true });
});
