/* perf-vm-leak-cycles.test.mjs — race → QUIT TO MENU, again and again, must not grow any live count.
 *
 * tools/perf/vm-leak-census.mjs boots the real js/game.js in the VM harness and counts, after each race
 * and at the menu after it: GPU handles created but not freed (the js/render/gfx.js contract every
 * backend implements), event listeners live on window / document / elements, live setInterval handles
 * and pending timers. Counts, not megabytes: the same seed repeats them exactly (2026-10-24, monza +
 * spa × 3: monza 33 meshes / 23 textures / 31 batches, spa 33 / 23 / 32, 643 listeners, 0 intervals,
 * the same on every cycle), so the gate has no tolerance. Cycle 1 may warm a cache; from cycle 2 on
 * every count repeats for the same circuit and phase.
 *
 * The browser twins measure what lives BELOW this contract (three's render caches, the JS heap):
 * tests/specs/race-cycle-memory.spec.js and track-switch-memory.spec.js. This is the layer above,
 * in seconds instead of minutes.
 *
 * The positive control breaks two release paths on purpose (Tracks.free does nothing; QUIT TO MENU
 * adds a window listener it never removes) and requires the same verdict to name both: a leak gate
 * that cannot fail is not a gate.
 *
 * Run: node --test tests/unit/perf-vm-leak-cycles.test.mjs   (npm run test:game-vm)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCycles, leakVerdict } from "../../tools/perf/vm-leak-census.mjs";

test("monza + spa × 3: GPU handles, listeners and timers repeat exactly from cycle 2", async () => {
  const readings = await runCycles({ circuits: ["monza", "spa"], cycles: 3, steps: 240 });
  const fails = leakVerdict(readings);
  assert.ok(fails.length === 0, "live counts grew across race cycles:\n  " + fails.join("\n  "));
  // A census that counted nothing would pass for the wrong reason.
  const r = readings.find((x) => x.cycle === 3 && x.id === "spa" && x.at === "race");
  assert.ok(r.meshes > 0 && r.textures > 0 && r.batches > 0, "the census must see the track's GPU handles: " + JSON.stringify(r));
  assert.ok(r.listenersBy.window > 0 && r.listenersBy.document > 0, "the census must see the game's listeners: " + JSON.stringify(r.listenersBy));
});

test("positive control: a skipped Tracks.free and a listener added per quit are both caught", async () => {
  const readings = await runCycles({
    // Two circuits: racing the circuit already built reuses its world (game.js builtWorldFits), so
    // one circuit alone would never rebuild and never exercise the free path.
    circuits: ["monza", "spa"], cycles: 3, steps: 30,
    sabotage(g) {
      g.sandbox.Tracks.free = () => {};
      const quit = g.G.quitToMenu;
      g.G.quitToMenu = function (...a) { g.sandbox.addEventListener("resize", () => {}); return quit.apply(this, a); };
    },
  });
  const fails = leakVerdict(readings).join("\n");
  assert.match(fails, /meshes \d+ vs \d+ on cycle 2/, "a track whose meshes are never freed must fail the gate:\n" + fails);
  assert.match(fails, /batches \d+ vs \d+ on cycle 2/, "instanced batches never freed must fail the gate:\n" + fails);
  assert.match(fails, /menu: listeners \d+ vs \d+ on cycle 2/, "a listener added per quit must fail the gate:\n" + fails);
});
