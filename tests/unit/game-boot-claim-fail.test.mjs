/* game-boot-claim-fail.test.mjs — the claim-fail ladder, driven through js/game.js's REAL boot (#4878).
 *
 * These replace the source pins gfx-backend-canary.test.mjs held in "a refused
 * WGX/TLX create does not persist WEBGL2 over the user's pick" (#1682 step 1):
 * the boot runs in tests/helpers/game-boot-vm.mjs with the deferred backend
 * stubbed, and each test reads what the boot DID — reloads, the session latch,
 * the probe and the pick — instead of regexing renderer-boot.js.
 *
 * Mutation evidence (each broken by hand, this file went red; PR #4878's body):
 *   reloadOnceIntoGlx: drop `p === "three"`          → "unset default THREE" red
 *   reloadOnceIntoGlx: skip the read-back            → "blocked sessionStorage" red
 *   reloadOnceIntoGlx: drop the `!_claimSkipped` gate → "at most once" red
 *   start(): `armed && !skipClaim` → `armed`          → "claim-skip boot" red
 *   GLX tail: drop the probe removeItem               → "refused create" red
 *
 * Run: node --test tests/unit/game-boot-claim-fail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootGame } from "../helpers/game-boot-vm.mjs";

const LATCH = "apex26.gfxClaimFail", PROBE = "apex26.gfxBackendProbe", PICK = "apex26.gfxBackend";

test("unset default THREE: a refused create on a claimed surface reloads ONCE into GLX behind the latch", async () => {
  // No stored pick + a GPU adapter = the THREE default. create() refuses, and the
  // canvas cannot attach GLX (init fails): the only recovery is one reload.
  const b = await bootGame({ glxInit: false });
  assert.ok(b.settled, "the boot returned");
  assert.deepEqual(b.creates, ["three"], "the unset default tried THREE");
  assert.equal(b.reloads, 1, "claim-fail recovery covers the unset default THREE attempt");
  assert.equal(b.ss.getItem(LATCH), "1", "the reload is latched in sessionStorage first");
  assert.equal(b.ls.getItem(PROBE), null, "a refused create disarms the boot canary before the reload");
  assert.equal(b.ls.getItem(PICK), null, "WEBGL2 is never persisted over the (unset) pick");
});

test("an explicit THREE pick keeps the pick through the claim-fail reload", async () => {
  const b = await bootGame({ ls: { [PICK]: "three" }, glxInit: false });
  assert.equal(b.reloads, 1);
  assert.equal(b.ls.getItem(PICK), "three", "the player's pick survives");
});

test("at most once: a boot that consumed the latch and still cannot attach GLX does not reload again", async () => {
  // The previous reload's GLX.init failed too: reloading again loops forever
  // (measured 236 reloads/64 s under a Vulkan-only browser config).
  const b = await bootGame({ ss: { [LATCH]: "1" }, glxInit: false });
  assert.deepEqual(b.creates, [], "a claim-skip boot never hands the canvas to the alternate");
  assert.equal(b.reloads, 0, "the latch is consumed, not re-set: no second reload");
  assert.equal(b.ss.getItem(LATCH), null, "the skip is one boot long");
});

test("blocked sessionStorage: the latch is read back before reloading, so no reload loop", async () => {
  // setItem silently drops (Safari private mode): removing the probe and
  // reloading would replay this claim-and-die boot forever.
  const b = await bootGame({ ssBlocked: true, glxInit: false });
  assert.deepEqual(b.creates, ["three"]);
  assert.equal(b.reloads, 0, "an unpersisted skip never reloads");
});

test("a claim-skip boot leaves an armed probe alone: no strike, no WEBGL2 over the pick", async () => {
  // The probe is leftover from the load that claimed and died; striking it here
  // would count that one death twice and retire the pick.
  const b = await bootGame({ ls: { [PICK]: "three", [PROBE]: "three" }, ss: { [LATCH]: "1" } });
  assert.equal(b.glxInits, 1, "GLX attaches this boot");
  assert.equal(b.ls.getItem("apex26.gfxProbeStrikes"), null, "no strike is recorded");
  assert.equal(b.ls.getItem(PICK), "three", "the pick is not retired");
  assert.equal(b.ls.getItem(PROBE), "three", "the probe stays for the next cold start to judge");
});

test("a refused create on a live tab disarms the probe and keeps the pick (GLX attaches, no reload)", async () => {
  const b = await bootGame({ ls: { [PICK]: "three" } });
  assert.deepEqual(b.creates, ["three"]);
  assert.equal(b.reloads, 0);
  assert.equal(b.ls.getItem(PROBE), null, "refresh retries the pick instead of reverting it");
  assert.equal(b.ls.getItem(PICK), "three", "create() refused does not write webgl2");
  assert.equal(b.ss.getItem("apex26.gfxBound"), "webgl2", "the live backend is published");
  assert.ok(b.G, "the boot carried on to the G façade");
});
