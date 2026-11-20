// settings-export-lazy.test.mjs — the SAVES & DATA split (#4748). js/ui/settings-export.js is FULL
// (FORMAT, SPEC, the garage gates, a façade); collect / apply / the files UI are SettingsExportBody
// in js/ui/settings-export-body.js (LAZY_SAVES_DATA). Before the body lands the façade must answer
// its synchronous gates itself and hand body calls a Promise of the SAME answer; and Bryce's own
// export must come back byte-identical whichever path loaded it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const BRYCE = "tests/data/settings-live-export-2026-11-10.json";
const plain = (v) => JSON.parse(JSON.stringify(v));
const thenable = (v) => !!v && typeof v.then === "function";

/** A phone-shaped store over a Map "disk". lazy: the body is NOT evaluated; a LazyBundles stub injects it a
 *  macrotask after ensureSavesData is asked, the way a <script> lands. */
function boot({ lazy = false, mobile = true, disk: seed = {} } = {}) {
  const disk = new Map(Object.entries(seed));
  const full = (k) => (k.startsWith("apex26.") ? k : "apex26." + k);
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    set(k, v) { if (v === undefined) disk.delete("apex26." + k); else disk.set("apex26." + k, JSON.stringify(v)); return true; },
    raw(k) { const v = disk.get(full(k)); return v === undefined ? null : v; },
    rawSet(k, v) { disk.set(full(k), String(v)); return true; },
    rawDel(k) { disk.delete(full(k)); return true; },
  };
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String,
    setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    GameStore: { store },
    GfxQuality: { defaultId: (m) => (m ? "medium" : "high") },
    Input: { keysAreDefault: () => true, padsAreDefault: () => true },
    navigator: { userAgent: "test" },
    localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null) },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const body = () => vm.runInContext(read("js/ui/settings-export-body.js"), ctx, { filename: absSrc("js/ui/settings-export-body.js") });
  sb.asks = 0;
  sb.LazyBundles = { live: () => ({ ensureSavesData() {
    sb.asks++;
    return new Promise((resolve) => setImmediate(() => {
      if (vm.runInContext("typeof SettingsExportBody", ctx) === "undefined") body();
      resolve(true);
    }));
  } }) };
  for (const f of ["js/input/controller-profiles.js", "js/input/steer-tuning.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: absSrc("js/ui/settings-export.js") });
  if (!lazy) body();
  const SE = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: mobile } };
  return { sb, ctx, disk, SE, G, hasBody: () => vm.runInContext("typeof SettingsExportBody", ctx) !== "undefined" };
}

test("before the body lands: SPEC and the garage gates answer synchronously, body calls get a Promise of the same answer", async () => {
  const lazy = boot({ lazy: true }), eager = boot();
  assert.equal(lazy.hasBody(), false);
  assert.equal(lazy.SE.loaded(), false);
  // FULL half: SaveSchemaRegistry / team-identity / career-backup read these at once.
  assert.ok(Array.isArray(lazy.SE.SPEC) && lazy.SE.SPEC.length > 100);
  assert.equal(lazy.SE.isGarageKey("livery.custom.mercedes"), true);
  assert.equal(lazy.SE.isGarageKey("career.driver.0"), false);
  assert.equal(lazy.SE.isCareerKey("careerSlot"), true);
  assert.deepEqual(plain(lazy.SE.garageValue("livery.custom.x", [{ id: "a", c1: [2, -1, 0.5], c2: [0, 0, 0] }])),
    [{ id: "a", c1: [1, 0, 0.5], c2: [0, 0, 0] }]);
  assert.equal(lazy.sb.asks, 0, "a gate read never asks for the body");
  // Body calls: one Promise, one fetch, the eager path's answer.
  const p = lazy.SE.collect("changes", lazy.G), q = lazy.SE.collectGarage();
  assert.ok(thenable(p) && thenable(q));
  assert.equal(lazy.sb.asks, 1, "concurrent calls share one load");
  const [a, g] = await Promise.all([p, q]);
  assert.deepEqual({ ...plain(a), exportedAt: 0 }, { ...plain(eager.SE.collect("changes", eager.G)), exportedAt: 0 });
  assert.deepEqual({ ...plain(g), exportedAt: 0 }, { ...plain(eager.SE.collectGarage()), exportedAt: 0 });
  // Once resident the façade is the body's own synchronous call again.
  assert.equal(lazy.SE.loaded(), true);
  assert.equal(thenable(lazy.SE.collect("changes", lazy.G)), false);
  assert.equal(lazy.sb.asks, 1);
});

test("garageRow / careerRow are null before the body and ask for it; create(G) hands G to the body that lands", async () => {
  const b = boot({ lazy: true, disk: { "apex26.gfxPreset": '"medium"' } });   // the phone's own default
  const made = b.SE.create(b.G);
  assert.equal(b.SE.garageRow(), null, "the garage door preloads; a cold row is absent, never a throw");
  assert.equal(b.SE.careerRow(), null);
  assert.equal(b.sb.asks, 1);
  assert.equal(await b.SE.ready(), true);
  assert.equal(b.hasBody(), true);
  // The instance create() returned before the body still answers, through the body, with the recorded G.
  const viaCreate = plain(await made.collect("changes"));
  assert.ok(!JSON.stringify(viaCreate.changed).includes("gfxPreset"),
    "the G create() recorded (a phone) reached the body: MEDIUM is the phone default, so not a change");
  assert.ok(JSON.stringify(plain(b.SE.collect("changes", { gfx: { isMobile: false } })).changed).includes("gfxPreset"),
    "the same store read with a desktop G does report it, so the check above can fail");
  assert.equal(b.SE.garageRow(), null, "no document in this VM: the body's create took its node branch");
});

test("a failed body load rejects the call, and the next call asks again", async () => {
  const b = boot({ lazy: true });
  let fail = true;
  b.sb.LazyBundles = { live: () => ({ ensureSavesData() {
    b.sb.asks++;
    if (fail) return Promise.resolve(false);
    vm.runInContext(read("js/ui/settings-export-body.js"), b.ctx, { filename: absSrc("js/ui/settings-export-body.js") });
    return Promise.resolve(true);
  } }) };
  await assert.rejects(b.SE.collect("changes", b.G), /did not load/);
  fail = false;
  const r = await b.SE.collect("changes", b.G);
  assert.equal(r.format, b.SE.FORMAT);
  assert.equal(b.sb.asks, 2);
});

// Bryce's own SAVE ALL SETTINGS (Home Screen app, 2026-11-10; tools/lib/bryce-phone.mjs). The split moved the
// importer and the exporter into another file: every byte they write and read must be what it was.
test("Bryce's export round-trips byte-identical through the lazy façade and the eager body alike", async () => {
  const file = JSON.parse(read(BRYCE));
  assert.equal(file.mode, "all");
  assert.equal(file.device.desktop, false);
  // What boot itself writes on the phone (scale.js RES_SCHEMA, steer-tuning.js STEER_SCHEMA): info rows, never imported.
  const BOOTED = { "apex26.resSchema": "2", "apex26.steerSchema": "5" };
  const eager = boot({ disk: BOOTED }), lazy = boot({ lazy: true, disk: BOOTED });
  const r1 = plain(eager.SE.applySettings(file, eager.G));
  const r2 = plain(await lazy.SE.applySettings(file, lazy.G));
  assert.deepEqual(r2, r1);
  assert.deepEqual({ ok: r1.ok, skipped: r1.skipped, failed: r1.failed }, { ok: true, skipped: 0, failed: 0 });
  assert.deepEqual([...lazy.disk].sort(), [...eager.disk].sort(), "both paths wrote the same bytes to the same keys");

  // EXACT VALUES: every row the file carries comes back as the same JSON text (143.25 stays 143.25, "1" stays "1").
  const back = plain(eager.SE.collect("all", eager.G));
  const lost = [];
  let rows = 0;
  for (const row of eager.SE.SPEC) {
    const g = file.settings[row.group];
    if (!g || !Object.hasOwn(g, row.k)) continue;
    rows++;
    if (JSON.stringify(back.settings[row.group][row.k]) !== JSON.stringify(g[row.k])) lost.push(`${row.group}.${row.k}`);
  }
  assert.deepEqual(lost, []);
  assert.equal(rows, Object.values(file.settings).reduce((n, grp) => n + Object.keys(grp).length, 0), "no value lacks a SPEC row");
  assert.equal(JSON.stringify(plain(await lazy.SE.collect("all", lazy.G)).settings), JSON.stringify(back.settings));

  // FIXED POINT: the re-exported file, loaded on a fresh phone, writes the first import's exact bytes at every key
  // that import wrote (the newer ALL file also names rows this build added since, at their defaults) and exports
  // the identical file again (timestamps and build aside).
  const again = boot({ lazy: true, disk: BOOTED });
  const r3 = plain(await again.SE.applySettings(back, again.G));
  assert.equal(r3.failed, 0);
  const drift = [...eager.disk].filter(([k, v]) => again.disk.get(k) !== v).map(([k]) => k);
  assert.deepEqual(drift, []);
  const strip = (f) => JSON.stringify({ ...f, exportedAt: 0, build: 0 });
  assert.equal(strip(plain(again.SE.collect("all", again.G))), strip(back));
});
