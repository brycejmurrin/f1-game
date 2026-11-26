/* owner-commands — #6920 U2.4: game.js owns the writes to G.state / G.frozen / G.paused / G.skyViewOverride.
   The four members are getter-only in the G literal and readonly in the d.ts; writes go through G.cmd / G.agentCtl. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { scanDts, scanGameCtx } from "../../tools/check/check-gctx.mjs";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const OWNED = ["state", "frozen", "paused", "skyViewOverride"];

test("the four owned members are readonly in the d.ts and getter-only in the G literal", () => {
  const dts = scanDts().members, lit = scanGameCtx();
  const g = lit.members;
  for (const k of OWNED) {
    assert.equal(dts.get(k).writable, false, `${k} must be readonly in types/game-ctx.d.ts`);
    assert.ok(g.has(k) && g.get(k).writable === false, `${k} must be getter-only in the G literal`);
  }
  for (const k of ["cmd", "agentCtl"]) {
    assert.ok(dts.has(k) && !dts.get(k).writable, `${k} is a readonly member of GameCtx`);
    assert.ok(g.has(k), `G declares ${k}`);
  }
});

test("G.cmd / G.agentCtl write the owned state; a direct write throws", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    G.cmd.setState("menu", "t");
    assert.equal(G.state, "menu");
    G.agentCtl.freeze(true);
    assert.equal(G.frozen, true);
    G.agentCtl.freeze(false);
    assert.equal(G.frozen, false);
    const o = { eye: [0, 1, 2], tgt: [0, 0, 0], fov: 78 };
    G.agentCtl.setSkyOverride(o);
    assert.equal(G.skyViewOverride, o);
    G.agentCtl.setSkyOverride(null);
    assert.equal(G.skyViewOverride, null);
    // park goes through G.cmd.setState, so select-screen's menu-exit wrap sees it (ctx-lost card)
    const seen = [], real = G.cmd.setState;
    G.cmd.setState = (n, why) => { seen.push([n, why]); return real(n, why); };
    G.agentCtl.park(1);
    G.cmd.setState = real;
    assert.deepEqual(seen, [["race", "agent-park"]]);
    assert.ok(G.raceT >= 1);
    // pause: a real pause only in race/count (setPaused gates on state)
    G.cmd.setState("menu", "t"); G.cmd.pause(true, "t");
    assert.equal(G.paused, false, "cmd.pause is a no-op in the menu");
    G.cmd.setState("race", "t"); G.cmd.pause(true, "t");
    assert.equal(G.paused, true);
    G.cmd.pause(false, "t");
    assert.equal(G.paused, false);
    assert.throws(() => { "use strict"; G.state = "race"; }, TypeError);
    assert.throws(() => { "use strict"; G.frozen = true; }, TypeError);
    assert.throws(() => { "use strict"; G.paused = true; }, TypeError);
    assert.throws(() => { "use strict"; G.skyViewOverride = null; }, TypeError);
  } finally { g.dispose && g.dispose(); }
});
