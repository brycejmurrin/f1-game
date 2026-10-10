/* xr-visibility-pause — the headset's system menu pauses the race (R3-STATES-2).
 *
 * An immersive session going visible-blurred / hidden (system menu, guardian,
 * a notification) leaves the DOCUMENT visible, so platform-session's
 * visibilitychange pause never fired; blurred, WebXR stops delivering input and
 * the car ran on its last injected throttle sample. Taking the headset off
 * (session end) did not pause either. XrBoot now drops the remote sample and
 * calls the game's pause path (api.pause, bound by game.js). The real
 * xr-boot.js + xr-session.js in a VM with a fake XRSession that dispatches
 * visibilitychange / end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function fakeSession() {
  const ls = {};
  return {
    visibilityState: "visible", enabledFeatures: [], inputSources: [],
    addEventListener(t, f) { (ls[t] || (ls[t] = [])).push(f); },
    removeEventListener(t, f) { ls[t] = (ls[t] || []).filter((g) => g !== f); },
    fire(t) { for (const f of (ls[t] || []).slice()) f({ target: this }); },
    requestReferenceSpace: async () => ({}), requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    end: async function () { this.fire("end"); },
  };
}

async function boot({ withPause = true } = {}) {
  const session = fakeSession();
  const pauses = [], lost = [];
  const ctx = vm.createContext({
    Math, JSON, Promise, Array, Object, Float32Array, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { xr: { isSessionSupported: async () => true, requestSession: async () => session } },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    Input: { remoteLost: () => lost.push(1) },
  });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/xr/xr-session.js", "js/xr/xr-boot.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const gfx = { xrCapable: () => true, attachXrSession: async () => ({}), detachXrSession() {} };
  ctx.XrBoot.bind({ gfx, tickBody() {}, windowTick() {}, getCamMode: () => 0, setCamMode() {},
    ...(withPause ? { pause: (why) => pauses.push(why) } : {}) });
  assert.ok(await ctx.XrSession.start(), "the fake session starts");
  return { ctx, session, pauses, lost };
}

test("visible-blurred and hidden pause the race and drop the injected input; back to visible does not resume", async () => {
  const h = await boot();
  h.session.visibilityState = "visible-blurred"; h.session.fire("visibilitychange");
  assert.deepEqual(h.pauses, ["xr-hidden"], "the system menu over the session pauses");
  assert.equal(h.lost.length, 1, "the last throttle/steer sample is dropped");
  h.session.visibilityState = "hidden"; h.session.fire("visibilitychange");
  assert.deepEqual(h.pauses, ["xr-hidden", "xr-hidden"]);
  h.session.visibilityState = "visible"; h.session.fire("visibilitychange");
  assert.equal(h.pauses.length, 2, "coming back leaves the pause menu up, like a hidden tab");
});

test("the headset session ending (taken off / exit) pauses too", async () => {
  const h = await boot();
  h.session.fire("end");
  assert.deepEqual(h.pauses, ["xr-end"]);
  assert.equal(h.ctx.XrSession.isPresenting(), false);
});

test("a game that binds no pause path still drops the input and does not throw", async () => {
  const h = await boot({ withPause: false });
  h.session.visibilityState = "hidden"; h.session.fire("visibilitychange");
  assert.equal(h.lost.length, 1);
});
