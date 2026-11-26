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
  const g = lit.members || lit;
  for (const k of OWNED) {
    assert.equal(dts.get(k).writable, false, `${k} must be readonly in types/game-ctx.d.ts`);
    const kinds = g.get(k).kinds;
    assert.ok(kinds.has("get") && !kinds.has("set"), `${k} must be getter-only in the G literal`);
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
    assert.throws(() => { "use strict"; G.state = "race"; }, TypeError);
    assert.throws(() => { "use strict"; G.frozen = true; }, TypeError);
    assert.throws(() => { "use strict"; G.paused = true; }, TypeError);
    assert.throws(() => { "use strict"; G.skyViewOverride = null; }, TypeError);
  } finally { g.dispose && g.dispose(); }
});
