// @ts-check
// Gamepad input tests for js/input.js (W3C Gamepad API, "standard" mapping).
//
// These mock navigator.getGamepads() with a synthetic pad snapshot, call the
// once-per-frame Input.poll(), then read the public Input surface the game loop
// uses (steer / throttle / braking and the edge-triggered consume* latches).
// No race needs to start — the input module is wired by Input.init() at load.
import { test, expect } from "@playwright/test";

// Build a standard-mapping gamepad with the given left-stick X (axis 0) and a
// sparse {index: value} button map, install it as the sole connected pad, then
// poll. Returns whatever `read` extracts from the page afterwards.
async function poll(page, { axisX = 0, buttons = {}, connected = true } = {}, read) {
  return page.evaluate(
    ({ axisX, buttons, connected, readSrc }) => {
      const btns = [];
      for (let i = 0; i < 17; i++) {
        const v = buttons[i] || 0;
        btns.push({ pressed: v >= 0.5, value: v, touched: v > 0 });
      }
      const pad = connected
        ? { connected: true, mapping: "standard", axes: [axisX, 0, 0, 0], buttons: btns }
        : null;
      navigator.getGamepads = () => [pad, null, null, null];
      Input.poll();
      // eslint-disable-next-line no-eval
      return (0, eval)("(" + readSrc + ")")();
    },
    { axisX, buttons, connected, readSrc: read.toString() }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.poll);
  // clear any latched edges / held keys between cases
  await page.evaluate(() => Input.reset());
});

test("an idle pad does not steer and is reported connected", async ({ page }) => {
  const r = await poll(page, { axisX: 0 }, () => ({
    steer: Input.steer(),
    connected: Input.padConnected,
  }));
  expect(r.connected).toBe(true);
  expect(Math.abs(r.steer)).toBeLessThan(0.001);
});

test("left-stick deflection steers, with a centre dead zone", async ({ page }) => {
  const full = await poll(page, { axisX: -1 }, () => Input.steer());
  expect(full).toBeLessThan(-0.9);

  const right = await poll(page, { axisX: 1 }, () => Input.steer());
  expect(right).toBeGreaterThan(0.9);

  // inside the 0.14 dead zone → no steer
  const dz = await poll(page, { axisX: 0.1 }, () => Input.steer());
  expect(Math.abs(dz)).toBeLessThan(0.001);
});

test("d-pad gives a digital full-lock override", async ({ page }) => {
  const right = await poll(page, { buttons: { 15: 1 } }, () => Input.steer());
  expect(right).toBe(1);
  const left = await poll(page, { buttons: { 14: 1 } }, () => Input.steer());
  expect(left).toBe(-1);
});

test("triggers and face buttons drive throttle / brake", async ({ page }) => {
  const rt = await poll(page, { buttons: { 7: 1 } }, () => Input.throttle());
  expect(rt).toBe(true);
  const a = await poll(page, { buttons: { 0: 1 } }, () => Input.throttle());
  expect(a).toBe(true);
  const lt = await poll(page, { buttons: { 6: 1 } }, () => Input.braking());
  expect(lt).toBe(true);
  // a barely-touched trigger (below threshold) does not count
  const soft = await poll(page, { buttons: { 7: 0.05 } }, () => Input.throttle());
  expect(soft).toBe(false);
});

test("face/shoulder buttons fire edge-triggered actions exactly once", async ({ page }) => {
  // establish the released baseline so the next poll sees a rising edge
  await poll(page, { buttons: {} }, () => true);
  // press X (boost) — one rising edge
  const first = await poll(page, { buttons: { 2: 1 } }, () => Input.consumeBoostToggle());
  expect(first).toBe(true);
  // still held → no new edge
  const held = await poll(page, { buttons: { 2: 1 } }, () => Input.consumeBoostToggle());
  expect(held).toBe(false);

  await poll(page, { buttons: {} }, () => true);
  const ot = await poll(page, { buttons: { 3: 1 } }, () => Input.consumeOvertake());
  expect(ot).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const up = await poll(page, { buttons: { 5: 1 } }, () => Input.consumeShiftUp());
  expect(up).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const down = await poll(page, { buttons: { 4: 1 } }, () => Input.consumeShiftDown());
  expect(down).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const cam = await poll(page, { buttons: { 8: 1 } }, () => Input.consumeCameraCycle());
  expect(cam).toBe(true);
});

test("disconnecting the pad clears its state", async ({ page }) => {
  await poll(page, { axisX: -1 }, () => Input.steer());
  const r = await poll(page, { connected: false }, () => ({
    steer: Input.steer(),
    connected: Input.padConnected,
    throttle: Input.throttle(),
  }));
  expect(r.connected).toBe(false);
  expect(Math.abs(r.steer)).toBeLessThan(0.001);
  expect(r.throttle).toBe(false);
});
