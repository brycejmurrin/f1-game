import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverCatalog, carFilterArgv, validateCarFilters } from "../../tools/mcp/catalog-discovery.mjs";
import { loadParts, catalogRows, sweep, sweepParallel } from "../../tools/car/parts-sweep.mjs";
import { TARGETS, CAM_ALIAS, STATIONS, FIELD_STATIONS } from "../../tools/shot/lib/garage-camera-catalog.mjs";

const M = loadParts();
test("parts are canonical, paginated and never expose unavailable team options", () => {
  const first = discoverCatalog({ section: "parts", limit: 2 });
  const next = discoverCatalog({ section: "parts", limit: 2, offset: first.nextOffset });
  assert.equal(first.total, Array.from(M.Parts.CATALOG).reduce((n, c) => n + c.options.length, 0));
  assert.deepEqual(first.rows.map((r) => r.id), ["stock", "lean_burn"]);
  assert.notEqual(next.rows[0].id, first.rows[0].id);
  assert.equal(first.budget, M.Parts.BUDGET);
  const team = M.Teams.LIST.find((t) => t.id === "haas");
  const result = discoverCatalog({ section: "parts", category: "engine", team: team.id, limit: 100 });
  const cat = M.Parts.CATALOG.find((c) => c.id === "engine");
  assert.deepEqual(result.rows.map((r) => r.id), Array.from(cat.options).filter((o) => M.Parts.isOptionAvailable(o, team)).map((o) => o.id));
  assert.ok(result.rows.some((r) => r.restrictions.suppliers.length));
  assert.ok(result.rows.every((r) => r.category === "engine" && r.availableTeams.includes("haas")));
  assert.equal(discoverCatalog({ section: "parts", offset: 9999 }).rows.length, 0);
});
test("liveries expose per-team ids and canonical editable fields without reading saved state", () => {
  const result = discoverCatalog({ section: "liveries", team: "redbull", limit: 100 });
  assert.ok(result.rows.some((r) => r.kind === "livery" && r.id === "default" && r.team === "redbull"));
  assert.ok(result.rows.some((r) => r.id === "stealth" && r.team === null));
  const fields = discoverCatalog({ section: "liveries", team: "redbull", filter: "spineLogo", limit: 100 });
  const spine = fields.rows.find((r) => r.kind === "field" && r.id === "spineLogo");
  assert.ok(spine.values.includes("wrap"));
  assert.ok(spine.stations.includes("spineTop"));
  const finishes = discoverCatalog({ section: "liveries", filter: "finish", limit: 100 });
  const finish = finishes.rows.find((r) => r.kind === "field" && r.id === "finish");
  // The garage offers default gloss before finishes that remap paint surfaces.
  assert.deepEqual(finish.values, ["gloss", ...Object.keys(M.Car3D.FINISH_SURFACE)]);
  assert.equal(finish.values.filter((value) => value === "gloss").length, 1);
  assert.ok(result.readOnly && !result.browser);
});
test("camera metadata has the shape consumers rely on, and the CLI reads the one canonical module", () => {
  // (Used to diff against `git show HEAD:...`, an oracle that moves on every commit and throws without history.)
  assert.ok(Object.keys(TARGETS).length >= 4 && "car" in TARGETS);
  for (const [alias, spec] of Object.entries(CAM_ALIAS)) assert.equal(typeof spec, "string", `${alias} aliases a camera spec string`);
  assert.ok(Object.keys(STATIONS).length >= 10);
  for (const [id, st] of Object.entries(STATIONS)) {
    assert.ok(Number.isFinite(st.az) && Number.isFinite(st.el) && Number.isFinite(st.dist) && st.dist > 0, `${id}: finite az/el and positive dist`);
    const named = typeof st.target === "string";
    assert.ok(named ? st.target in TARGETS : Array.isArray(st.target) && st.target.length === 3 && st.target.every(Number.isFinite),
      `${id}: target is a finite [x,y,z] or a TARGETS key`);
  }
  for (const [field, stations] of Object.entries(FIELD_STATIONS)) {
    assert.ok(Array.isArray(stations) && stations.length > 0, `${field} names at least one station`);
    for (const id of stations) assert.ok(id in STATIONS, `${field} → unknown station ${id}`);
  }
  const cli = fs.readFileSync(new URL("../../tools/shot/garage-angles.mjs", import.meta.url), "utf8");
  assert.match(cli, /garage-camera-catalog\.mjs/);
  assert.doesNotMatch(cli, /^const (TARGETS|STATIONS|FIELD_STATIONS|CAM_ALIAS) = \{/m, "the CLI must not re-declare the catalog");
  const result = discoverCatalog({ section: "garage", filter: "spineTop", limit: 100 });
  assert.deepEqual(result.rows.find((r) => r.id === "spineTop").target, STATIONS.spineTop.target);
  assert.ok(result.rows.find((r) => r.id === "spineTop").fields.includes("spineLogo"));
});
test("catalogs reject invalid ids, oversized responses, and nonliteral inputs", () => {
  for (const args of [
    { section: "../parts" }, { section: "parts", category: "unknown" }, { section: "parts", team: "mclaren;touch x" },
    { section: "garage", team: "mclaren" }, { section: "liveries", category: "engine" },
    { section: "parts", limit: 101 }, { section: "parts", limit: -1 }, { section: "parts", offset: 0.5 },
    { section: "parts", filter: "x".repeat(81) }, { section: "parts", filter: {} },
  ]) assert.throws(() => discoverCatalog(args));
  assert.equal(discoverCatalog({ section: "parts", filter: ".*" }).total, 0);
});
test("audit argv allows only exact canonical ids, never shell args or paths", () => {
  assert.deepEqual(carFilterArgv({ categories: ["wheels", "wheels", "aero"], team: "mclaren" }), ["--cats=wheels,aero", "--team=mclaren"]);
  assert.deepEqual(carFilterArgv({}), []);
  for (const args of [ { categories: [] }, { categories: "wheels" }, { category: "../../x" },
    { categories: ["--json"] }, { category: "engine", categories: ["engine"] }, { team: "../haas" },
    { team: "haas\n--json" }, { team: { id: "haas" } } ]) assert.throws(() => carFilterArgv(args));
  assert.throws(() => validateCarFilters({ team: "haas" }, { allowTeam: false }));
});
test("team restriction changes real sweep rows and rejects unknown teams", () => {
  const all = catalogRows(M.Parts, M.Teams);
  const rows = catalogRows(M.Parts, M.Teams, "mclaren", "haas");
  assert.ok(rows.length < all.length);
  assert.ok(rows.every((r) => r.teamId === "haas"));
  for (const row of rows) {
    const option = M.Parts.CATALOG.find((c) => c.id === row.cat).options.find((o) => o.id === row.optionId);
    assert.ok(M.Parts.isOptionAvailable(option, M.Teams.LIST.find((t) => t.id === "haas")));
  }
  assert.throws(() => catalogRows(M.Parts, M.Teams, "mclaren", "unknown"));
});
test("serial and parallel sweep paths apply team selection before mesh measurement", { timeout: 60000 }, async () => {
  const args = { cats: ["fuel", "cockpit"], teamId: "haas", vis: false };
  const serial = sweep({ ...args, M });
  const parallel = await sweepParallel({ ...args, M, workers: 2 });
  assert.ok(serial.length > 0);
  assert.ok(serial.every((r) => r.teamId === "haas" && ["fuel", "cockpit"].includes(r.cat)));
  assert.deepEqual(parallel, serial);
  assert.throws(() => sweepParallel({ teamId: "unknown", M }));
});
