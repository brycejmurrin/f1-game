/* hud-dom-budget-vm.test.mjs — the HUD's DOM write / forced-layout budget in the
 * game VM (issue #4782). game-vm's `domProbe` counts DOM writes per element and
 * kind and the layout reads that land on a dirty tree (a forced layout); this
 * drives a race the way the frame loop does — `__apex.step` then
 * `G.refreshHud(false, 16.7)` — and holds the numbers to tests/data/hud-dom-budget.json,
 * on the 1280x720 desktop page and the `phone844` preset (844x390, DPR 3, coarse touch).
 *
 * The VM has no layout engine: this proves the COUNT of writes and the ORDER of
 * write-then-read (the cause of forced layouts), not their cost. The cost number
 * is a browser trace census (CI or the phone bridge).
 * Run: node --test tests/unit/hud-dom-budget-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const BUDGET = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/hud-dom-budget.json"), "utf8"));
const FRAMES = 180;

async function measure(preset) {
  const g = await createGame({ track: "monza", domProbe: true, preset, carMeshes: false });
  try {
    g.apex.setInput({ throttle: true });
    g.step(120);   // off the grid, into a steady lap
    const p = g.domProbe;
    p.reset();
    const tick = [];
    for (let i = 0; i < FRAMES; i++) {
      p.frame();
      const f0 = p.forced, w0 = p.writes;
      g.step(1); g.G.refreshHud(false, 16.7);
      tick.push({ forced: p.forced - f0, writes: p.writes - w0 });
    }
    const idle = [];
    for (let i = 0; i < 30; i++) {   // a non-tick frame: the HUD refreshes, no physics step ran
      p.frame();
      const f0 = p.forced;
      g.G.refreshHud(false, 16.7);
      idle.push(p.forced - f0);
    }
    return { snap: p.snapshot(), tick, idle };
  } finally { g.close(); }
}

for (const preset of [undefined, "phone844"]) {
  const name = preset || "desktop";
  test(`HUD DOM budget — ${name}`, async () => {
    const b = BUDGET[name];
    const { snap, tick, idle } = await measure(preset);
    const maxForced = Math.max(...tick.map((t) => t.forced));
    const maxWrites = Math.max(...tick.map((t) => t.writes));
    const avgWrites = tick.reduce((a, t) => a + t.writes, 0) / tick.length;
    const detail = JSON.stringify({ forcedBy: snap.forcedBy, byKind: snap.byKind,
      top: Object.entries(snap.byEl).sort((x, y) => y[1].total - x[1].total).slice(0, 5) });
    assert.ok(snap.writes > 0, "the probe saw HUD writes (a zero means it is not wired): " + detail);
    assert.ok(maxForced <= b.forcedPerTick, `steady tick forced ${maxForced} > ${b.forcedPerTick}: ${detail}`);
    assert.ok(Math.max(...idle) <= b.idleForcedPerFrame, `non-tick frame forced layouts: ${detail}`);
    assert.ok(maxWrites <= b.maxWritesPerTick, `max writes/tick ${maxWrites} > ${b.maxWritesPerTick}: ${detail}`);
    assert.ok(avgWrites <= b.avgWritesPerTick, `avg writes/tick ${avgWrites.toFixed(2)} > ${b.avgWritesPerTick}: ${detail}`);
  });
}

test("domProbe model: write dirties, a layout read forces once, a frame clears", async () => {
  const g = await createGame({ domProbe: true, carMeshes: false });
  try {
    const p = g.domProbe, el = g.sandbox.document.getElementById("probe-model");
    p.reset();
    el.textContent = "a";
    el.getBoundingClientRect();
    el.getBoundingClientRect();
    assert.equal(p.forced, 1, "second read finds a clean tree");
    el.style.setProperty("--x", "1"); el.style.setProperty("--x", "1");
    assert.equal(p.byEl["#probe-model"].style, 1, "an identical style write is not a write");
    p.frame();
    void el.offsetWidth;
    assert.equal(p.forced, 1, "a frame boundary clears dirty");
    el.classList.add("k"); void el.clientHeight;
    assert.equal(p.forced, 2);
    assert.equal(p.byEl["#probe-model"].class, 1, "className set by classList counts once");
  } finally { g.close(); }
});

test("phone844 preset: iPhone landscape, coarse pointer", async () => {
  const g = await createGame({ preset: "phone844", carMeshes: false });
  try {
    const w = g.sandbox;
    assert.deepEqual([w.innerWidth, w.innerHeight, w.devicePixelRatio, w.navigator.maxTouchPoints], [844, 390, 3, 5]);
    assert.match(w.navigator.userAgent, /iPhone/);
    assert.equal(w.matchMedia("(pointer: coarse)").matches, true);
    assert.equal(w.matchMedia("(min-width: 1px)").matches, false);
  } finally { g.close(); }
});
