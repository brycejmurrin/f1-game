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
  assert.ok(menus.includes('sessionStorage.getItem(CTX_LOST_NOTICE_KEY) === "1"'));
  assert.ok(menus.includes("sessionStorage.removeItem(CTX_LOST_NOTICE_KEY)"));
  assert.ok(menus.includes("if (G.startRace) G.startRace()"));
  const game = read("js/game.js");
  assert.ok(game.includes("function quitToMenuAfterCtxLost()"));
  assert.ok(game.includes("stashCtxLostNotice()"));
  assert.ok(game.includes("Graphics reset — retrying with lighter settings"));
});

test("lights-out and goRolling clear apex26.ctxLostReloads", () => {
  const game = read("js/game.js");
  const lights = game.indexOf('setState("race", feel.restartPending ? "restart-green" : "lights-out")');
  assert.ok(lights > 0);
  assert.ok(game.slice(lights, lights + 220).includes('sessionStorage.removeItem("apex26.ctxLostReloads")'));
  assert.ok(game.includes('goRolling: () => { if (state !== "count") return false; try { sessionStorage.removeItem("apex26.ctxLostReloads")'));
});

test("endRace still clears apex26.ctxLostReloads (radio-voice pin)", () => {
  const game = read("js/game.js");
  const i = game.indexOf("function endRace(forcedOrder)");
  assert.ok(i >= 0);
  assert.ok(game.slice(i, i + 200).includes('sessionStorage.removeItem("apex26.ctxLostReloads")'));
});
