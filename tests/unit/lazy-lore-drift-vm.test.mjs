/* lazy-lore-drift-vm.test.mjs — #6911: CircuitLore (LAZY_AUDIO) and ThermalDrift (LAZY_PERF) are off the boot wall
 * and still work on first use. Full game VM. Run: node --test tests/unit/lazy-lore-drift-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install } = require("./fake-audio-vm.cjs");
const { FULL, LAZY_AUDIO, LAZY_PERF } = require(path.join(ROOT, "tools/manifest.cjs"));

test("the roster: both files are lazy, neither is boot code", () => {
  for (const f of ["js/data/circuit-lore.js", "js/perf/thermal-drift.js"]) assert.ok(!FULL.includes(f), f + " must not be eager");
  assert.ok(LAZY_AUDIO.indexOf("js/data/circuit-lore.js") >= 0 && LAZY_AUDIO.indexOf("js/data/circuit-lore.js") < LAZY_AUDIO.indexOf("js/audio/announcer.js"));
  assert.ok(LAZY_PERF.includes("js/perf/thermal-drift.js"));
});

test("CircuitLore is absent at boot and gives its first line once the audio bundle lands", async () => {
  const g = await createGame({ carMeshes: false, storage: { sound: true }, onSandbox: (sb) => { install(sb); } });
  const sb = g.sandbox, ev = (c) => vm.runInContext(c, g.ctx, { filename: "lazy-lore-drift:probe" });
  try {
    assert.ok(ev("typeof CircuitLore") !== "object", "boot must not carry circuit-lore.js");
    const pd = { type: "pointerdown", pointerType: "mouse", target: sb.document.body };
    sb.dispatchEvent(pd);
    sb.document.dispatchEvent(pd);
    await settle(() => ev("typeof CircuitLore") === "object", 4000);
    assert.ok(ev("typeof CircuitLore") === "object");
    const row = ev('CircuitLore.forId("monza")');
    assert.ok(row && Object.keys(row).length > 0, "the first lore row reads after the lazy load");
  } finally { g.close(); }
});

test("a saved thermal-drift opt-in arms the detector when the perf rig lands", async () => {
  const g = await createGame({ carMeshes: false, storage: { "apex26.thermalDrift": "1" } });
  const sb = g.sandbox, ev = (c) => vm.runInContext(c, g.ctx, { filename: "lazy-lore-drift:probe" });
  try {
    assert.ok(ev("typeof ThermalDrift") !== "object", "boot must not carry thermal-drift.js");
    ev("PerfGov.setThermalDrift(true)");   // what PerfGov.init does from the saved opt-in, before the rig is resident
    assert.ok(ev("PerfGov.thermalDrift()") == null, "no detector without the module");
    await ev("LazyBundles.live().ensurePerfRig()");
    await settle(() => ev("typeof ThermalDrift") === "object", 4000);
    assert.ok(ev("typeof ThermalDrift") === "object");
    assert.ok(ev("PerfGov.thermalDrift()"), "PerfGov.thermalDrift() reads a state after the lazy load");
  } finally { g.close(); }
});
