/* store-null-default.test.mjs — a stored JSON `null` is a miss for an object/array reader.
 *
 * `apex26.parts.<team>` = "null" on disk (a hand edit, an import, a reset that
 * wrote null) came back from store.get("parts.<team>", {}) as null — only
 * `undefined` fell back — and GARAGE threw "Cannot read properties of null
 * (reading 'engine')" in js/garage/setup-sheet.js buildSetup. The rule now:
 * a stored null under a non-null object/array default answers the default; a
 * null/primitive default still answers null (title layout, season and career
 * slots store null to mean "cleared").
 *
 * The last test boots the REAL game in a VM (tools/lib/game-vm.cjs) with every
 * apex26.* key literal in js/, plus parts./livery./setup.<team> for every team,
 * stored as "null", and builds the setup sheet for every team.
 *
 * Run: node --test tests/unit/store-null-default.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/store.js"), "utf8") + "\n;globalThis.GameStore = GameStore;", ctx,
    { filename: absSrc("js/core/store.js") });
  return ctx.GameStore.store;
}

test("a stored null under an object or array default answers the default", () => {
  const store = loadStore({ "apex26.probe.obj": "null", "apex26.probe.arr": "null" });
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.obj", {}))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.arr", []))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.obj", { engine: "x" }))), { engine: "x" });
  // Cached path: the second read (served from _cache) applies the same rule.
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.obj", {}))), {});
  // getStored still reports what the player stored.
  assert.equal(store.getStored("probe.obj"), null);
});

test("a stored null under a null or primitive default still answers null", () => {
  const store = loadStore({ "apex26.probe.n": "null" });
  assert.equal(store.get("probe.n", null), null);
  assert.equal(store.get("probe.n", 5), null);
  assert.equal(store.get("probe.n", "on"), null);
  assert.equal(store.get("probe.n"), null);
});

test("a session set(k, null) followed by an object-default read answers the default", () => {
  const store = loadStore();
  store.set("probe.reset", null);
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.reset", {}))), {});
  assert.equal(store.get("probe.reset", null), null);
});

test("stored non-null values are untouched", () => {
  const store = loadStore({ "apex26.probe.v": JSON.stringify({ engine: "mine" }), "apex26.probe.z": "0" });
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("probe.v", {}))), { engine: "mine" });
  assert.equal(store.get("probe.z", {}), 0);
});

// Every apex26.* key literal under js/ (vendor excluded).
function apexKeyLiterals() {
  const keys = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "vendor") walk(p); }
      else if (p.endsWith(".js")) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/["'`]apex26\.([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)["'`]/g)) keys.add(m[1]);
      }
    }
  };
  walk(path.join(ROOT, "js"));
  return keys;
}

test("game VM: every apex26.* key stored as \"null\" boots and builds the setup sheet for every team", async () => {
  const keys = apexKeyLiterals();
  assert.ok(keys.size > 50, `key literal scan found ${keys.size} keys — the regex lost them`);
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const teamIds = vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8").replace(/^const\b/gm, "var")
    + "\n;Teams.LIST.map((t) => t.id)", { Math, Object, Array, Number, String, JSON, console }, { filename: absSrc("js/data/teams.js") });
  assert.ok(teamIds.length > 0);
  const storage = {};
  for (const k of keys) storage[k] = null;
  for (const t of teamIds) for (const p of ["parts.", "livery.", "setup."]) storage[p + t] = null;
  const g = await createGame({ storage });
  try {
    assert.deepEqual(g.record.scripts.filter((s) => s.error), [], "no script threw at boot");
    assert.deepEqual(g.record.rejections, [], "no unhandled rejection at boot");
    for (let i = 0; i < teamIds.length; i++) {
      g.G.teamIdx = i;
      assert.doesNotThrow(() => g.G.buildSetup(), `buildSetup for ${teamIds[i]} with stored null keys`);
    }
  } finally { g.close(); }
});
