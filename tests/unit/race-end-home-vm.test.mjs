/* race-end-home-vm.test.mjs — #4956: the RACE END drive-in (#4745) on a phone.
 * ResultsCam stands down on gfx.isMobile, so render()'s results freeze used to return
 * before the garage branch: the show never stepped, the sheet never came, and DONE /
 * BACK fell through to the main menu. The REAL game (tools/lib/game-vm.cjs), frames pumped.
 * Mutation evidence: drop `&& !raceEndHome.fin` from render()'s freeze → "frames"; drop either
 * `if (leaveRaceEnd()) return;` → that button's case.
 * Run: node --test tests/unit/race-end-home-vm.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

/** A phone race taken through the ceremony to its results phase, the garage show running. */
async function phoneRaceEnd() {
  const g = await createGame({ track: "bahrain" });
  const $ = (id) => g.ctx.document.getElementById(id);
  g.apex.headless(false);
  g.step(20);
  g.G.gfx.isMobile = true;
  $("results").hidden = true; $("carsetup").hidden = true; $("overlay").hidden = true;
  assert.equal(g.apex.finishRace({ ceremony: true }).state, "results");
  let s = null;
  for (let i = 0; i < 6 && !(s && s.phase === "results"); i++) s = g.apex.ceremony("skip");
  assert.equal(s && s.phase, "results");
  assert.equal($("carsetup").hidden, false, "the car comes home to the garage first");
  assert.equal($("results").hidden, true, "the sheet waits for the show");
  assert.equal($("cs-done").textContent, "SEE RESULTS");
  assert.equal($("cs-arrival-skip").textContent, "SKIP TO RESULTS");
  return { g, $ };
}

test("frames: on a phone the show plays and ends on the results sheet", async () => {
  const { g, $ } = await phoneRaceEnd();
  try {
    let t = 1000, n = 0;
    for (; n < 1800 && $("results").hidden; n++) g.pumpFrame((t += 33));
    assert.equal($("results").hidden, false, `the sheet is revealed (${n} frames)`);
    assert.equal($("carsetup").hidden, true, "and the garage is closed");
  } finally { g.close(); }
});

for (const id of ["cs-done", "cs-back"]) {
  test(`#${id} during the show goes to the results sheet, not the menu`, async () => {
    const { g, $ } = await phoneRaceEnd();
    try {
      $(id).onclick();
      assert.equal($("results").hidden, false, "the sheet is revealed");
      assert.equal($("carsetup").hidden, true, "the garage is closed");
      assert.equal($("overlay").hidden, true, "the main menu stays down");
    } finally { g.close(); }
  });
}
