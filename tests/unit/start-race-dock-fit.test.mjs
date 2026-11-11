/* start-race-dock-fit.test.mjs — startRace's forced HUD fit runs AFTER the touch dock is laid out.
 *
 * The red (PR #5397's run 42981717423, scratch run 42986046359: ~1 boot in 4 on a clean tip): at the
 * owner's 852x393 cell with BUTTON 245 %, named-controls.spec.js read GAS 684.2..860.6 x 162.8..339.1 and
 * BRAKE -26.7..149.7 — the pedals at raw BUTTON SIZE, 176 px, off the right and top edges. Recorded live
 * (DOM mutation trace, every boot): startRaceBody forced `updateHud(true)` inside the debrisPrime span,
 * BEFORE `in-race` and showTouchControls(true). That fit measured an empty dock (dockH 0), so capDock
 * stayed Infinity, --hud-z-dock was removed and --hud-cap published the dock as unlimited; the dock then
 * appeared uncapped until the first HUD tick of the render loop wrote the cap (~150 ms locally, longer on
 * a loaded runner). A player's start hides that window under the loading cover; a headless start drops
 * the cover without a presented frame, so a read right after #loading hides can land inside it.
 *
 * A source pin, not a VM boot: the game VM's mini-dom has no layout rects, so fitHud never measures a dock
 * there and cannot tell the two orders apart. The order is what this pins.
 *
 * Run: node --test tests/unit/start-race-dock-fit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolSource } from "../helpers/game-source.mjs";

const body = symbolSource("async function startRaceBody(");

test("startRaceBody: the first forced HUD fit comes after the dock is shown", () => {
  assert.ok(body.length > 1000, "startRaceBody found in js/game.js");
  const shown = body.indexOf("showTouchControls(true);");
  const inRace = body.indexOf('document.body.classList.add("in-race");');
  const forced = body.indexOf("updateHud(true)");
  assert.ok(shown > 0 && inRace > 0, "startRaceBody shows the dock and sets in-race");
  assert.ok(forced > 0, "startRaceBody forces a HUD paint + fit");
  assert.ok(forced > shown && forced > inRace,
    "the first updateHud(true) must follow showTouchControls(true) and in-race: run before them, the fit measures an empty dock and the pedals paint uncapped until the next HUD tick");
});
