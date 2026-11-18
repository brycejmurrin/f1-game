/* game-flow-5100-vm.test.mjs — batch #5100 (js/game.js flow & records), each member
 * reproduced in the Node VM (tools/lib/game-vm.cjs) before its fix.
 *
 *   #5017 a second pause while paused (hidden tab, blur, audio interruption) re-showed
 *         the pause card over a tool opened from it (the lighting tuner).
 *
 * Run: node --test tests/unit/game-flow-5100-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

// The VM has no stylesheet, so #rotate-device reads as shown and the card is always
// hidden; answer "none" for it so the card logic runs as on a landscape phone.
function noRotateGate(g) {
  const gcs = g.sandbox.getComputedStyle;
  g.sandbox.getComputedStyle = (el, ...r) => (el && el.id === "rotate-device" ? { display: "none", getPropertyValue: () => "" } : gcs(el, ...r));
}

test("#5017: a hidden tab or a blur while already paused leaves a tool's hidden card hidden", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const doc = g.sandbox.document, pm = doc.getElementById("pausemenu");
    await g.race("monza", "day", "dry", { laps: 5 });
    g.apex.go(); g.step(30); noRotateGate(g);
    doc.getElementById("pmsettings").hidden = true;
    doc.getElementById("pausebtn").onclick();
    assert.equal(g.G.paused, true);
    assert.equal(pm.hidden, false, "the pause card is up");
    pm.hidden = true;   // LIGHTING from pause hides the pause sheets (js/lighting/tuner-panel.js)
    doc.hidden = true; doc._fire({ type: "visibilitychange" }); doc.hidden = false;
    assert.equal(pm.hidden, true, "hidden tab: the card stays off the tuner");
    doc.hasFocus = () => false; g.sandbox.dispatchEvent({ type: "blur" }); g.flushTimers();
    assert.equal(pm.hidden, true, "blur: the card stays off the tuner");
    assert.equal(g.G.paused, true);
  } finally { g.close(); }
});

test("#5027: the settling-finish quit is not deferred on physics that cannot step (hidden tab)", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza", "day", "dry", { laps: 5 });
    g.apex.go(); g.step(30);
    // A solo player home while a rival's penalty-adjusted finish is still pending.
    vm.runInContext(`RaceControl = Object.assign({}, RaceControl, { finishPending: () => true })`, g.ctx);
    const p = g.G.player; p.finished = true;
    g.sandbox.document.hidden = true;
    g.G.quitToMenu();
    g.sandbox.document.hidden = false;
    assert.equal(g.G.state, "menu", "EXIT quits now instead of waiting on a frozen sim");
  } finally { g.close(); }
});
