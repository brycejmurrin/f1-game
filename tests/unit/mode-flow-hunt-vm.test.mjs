/* mode-flow-hunt-vm.test.mjs — the three mode-flow defects of the 2026-11-25 runtime hunt
 * (hunt note, PR #6433), each reproduced in the Node VM (tools/lib/game-vm.cjs):
 *
 *   - F1: career results → NEXT ROUND on a software raster. quitToMenu deferred its tail
 *     (MenuTeardown.deferQuitTail) and the tail's setFlow("gp") landed after openCareer, so the hub
 *     ran a one-off GP (START RACE, the team's real driver, no money). The hub now opens from
 *     quitToMenu's continuation, after the tail.
 *   - F2: a Season round, then NEXT ROUND → quali BACK → race settings BACK → circuit BACK reached the
 *     title without quitToMenu, and #mb-standings stayed hidden until a reload.
 *   - F3: a click by id on the hidden #cr-go of the slot picker (no draft) threw on draft.flavour.
 *
 * Run: node --test tests/unit/mode-flow-hunt-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

/** PerfGov.softwareRaster() reads gfx.backendState(): the VM's stub backend reports a hardware adapter. */
function softwareRaster(G) {
  const orig = G.gfx.backendState;
  G.gfx.backendState = () => Object.assign({}, orig ? orig.call(G.gfx) : {}, { softwareGL: true });
}

/** Drain MenuTeardown.deferUi (rAF → setTimeout) and any lazy bundle a screen loads. */
async function drain(g, rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    g.pumpFrame();
    g.flushTimers();
    await g.settle(() => false, 20);
  }
}

test("F1: career NEXT ROUND on a software raster opens the CAREER hub, not a one-off GP", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const { G, sandbox: sb } = g;
    const { Career, SeasonCal } = sb;
    Career.start({ flavour: "driver", teamId: G.player.team.id, seed: 7 });
    Career.engage(true); SeasonCal.engage("career");
    G.flow = "career"; G.season = Career.data().season;
    G.endRace();
    assert.equal(G.state, "results", "precondition: the results sheet");
    softwareRaster(G);
    assert.equal(sb.PerfGov.softwareRaster(), true, "precondition: the deferred quit tail is armed");
    G.els.resNext.onclick();
    await drain(g);
    assert.equal(G.state, "menu");
    assert.equal(G.flow, "career", "the deferred quit tail must not reset the hub's flow to gp");
    assert.equal(Career.inCareer(), true, "the career stays engaged: GO RACING runs the scored round");
  } finally { g.close(); }
});

test("F2: Season NEXT ROUND → q-back → rs-cancel → sel-back shows STANDINGS on the title", async () => {
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const { G, sandbox: sb } = g;
    const $ = (id) => sb.document.getElementById(id);
    G.flow = "season"; G.season = sb.SeasonCal.load();
    G.endRace();
    assert.ok(sb.SeasonCal.hasProgress(G.season) && G.season.round >= 1, "precondition: round 1 is scored");
    G.els.resNext.onclick();   // NEXT ROUND → qualifying
    await g.settle(() => !$("quali").hidden, 15000);
    assert.equal($("quali").hidden, false, "precondition: the qualifying sheet is up");
    $("mb-standings").hidden = true;   // the boot paint: no season progress then
    const shelf = sb.document.createElement("div");   // the VM DOM leaves the picker's track list unparented (buildSelect mounts its toolbar beside it)
    if (!G.els.selTracks.parentNode) { shelf.appendChild(G.els.selTracks); sb.document.body.appendChild(shelf); }
    $("q-back").onclick();
    await drain(g, 4);
    assert.equal($("race-settings").hidden, false, "precondition: q-back lands on race settings (no quitToMenu)");
    $("rs-cancel").onclick(); await drain(g, 4);
    assert.equal($("select").hidden, false, "precondition: rs-cancel lands on the circuit picker");
    $("sel-back").onclick(); await drain(g, 4);
    assert.equal($("overlay").hidden, false, "precondition: back on the title");
    assert.equal($("mb-standings").hidden, false, "STANDINGS is the season-in-progress door");
  } finally { g.close(); }
});

test("F3: a click by id on the hidden #cr-go of the slot picker does not throw", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const { G, sandbox: sb } = g;
    const $ = (id) => sb.document.getElementById(id);
    assert.equal(sb.Career.data(), null, "precondition: no career save");
    G.openCareerSlots();
    await g.settle(() => typeof $("cr-go").onclick === "function", 15000);
    await drain(g, 10);   // the slot picker paints after the lazy career UI loads
    assert.equal($("career").hidden, false, "precondition: the CAREER screen (slot picker) is up");
    assert.equal(typeof $("cr-go").onclick, "function", "precondition: the career UI is wired");
    assert.doesNotThrow(() => $("cr-go").onclick());
  } finally { g.close(); }
});
