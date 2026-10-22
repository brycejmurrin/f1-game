/* ctx-lost-notice — graphics context loss explains itself on the menu and clears reload budget at green. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootGlx } from "../helpers/glx-mock.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("GLX arms apex26.ctxLostNotice before an automatic reload", () => {
  const h = bootGlx();
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostReloads");
  h.loseContext();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostReloads"), "1");
  for (const timer of h.sandbox.__timers.splice(0)) timer();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1");
});

test("select-screen consumes apex26.ctxLostNotice and wires RETRY to startRace", () => {
  const menus = read("js/ui/select-screen.js");
  assert.match(menus, /sessionStorage\.getItem\(CTX_LOST_NOTICE_KEY\) === "1"/);
  assert.match(menus, /sessionStorage\.removeItem\(CTX_LOST_NOTICE_KEY\)/);
  assert.match(menus, /if \(G\.startRace\) G\.startRace\(\)/);
  const game = read("js/game.js");
  assert.match(game, /function quitToMenuAfterCtxLost\(\)/);
  assert.match(game, /stashCtxLostNotice\(\)/);
  assert.match(game, /Graphics reset — retrying with lighter settings/);
});

test("lights-out and goRolling clear apex26.ctxLostReloads", () => {
  const game = read("js/game.js");
  const lights = game.indexOf('setState("race", feel.restartPending ? "restart-green" : "lights-out")');
  assert.ok(lights > 0);
  assert.match(game.slice(lights, lights + 220), /sessionStorage\.removeItem\("apex26\.ctxLostReloads"\)/);
  assert.match(game, /goRolling: \(\) => \{ if \(state !== "count"\) return false; try \{ sessionStorage\.removeItem\("apex26\.ctxLostReloads"\)/);
});

test("endRace still clears apex26.ctxLostReloads (radio-voice pin)", () => {
  const game = read("js/game.js");
  assert.match(game, /function endRace\(forcedOrder\) \{[\s\S]{0,200}sessionStorage\.removeItem\("apex26\.ctxLostReloads"\)/);
});
