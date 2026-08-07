// @ts-check
// throttle-rescue-probe — IS THE THROTTLE REALLY ON after an off-track rescue
// in BUTTONS steering mode, and if so, WHO is asserting it?
//
// Player report (2026-08-07, deploy build): steer mode BUTTONS, go off track,
// get auto-recovered — after the RECOVERED banner the throttle behaves as
// always-on regardless of the GAS button. input.js already carries three
// anti-latch nets (window-level capture-phase release, lostpointercapture,
// blur reset) and the deploy build HAS all three, so this is a fourth
// mechanism — or not an input latch at all. Both halves of that fork are
// checkable in one run, because `__apex.inputState()` names which SOURCE is
// asserting throttle (key / btn / pad) and `physState().speed` says what the
// car is doing about it.
//
//   btn.throttle true after the finger lifts  -> input latch, new mechanism
//   throttle() false but speed climbing       -> physics-side forcing
//   throttle() false and speed decaying       -> not reproduced under emulation
//
// A REAL touch press via CDP (Input.dispatchTouchEvent), not __apex.setInput —
// setInput feeds the external-input path, which BYPASSES Input.throttle()
// entirely and would test nothing. Two scenarios: gas HELD through the rescue
// (the reporter's timeline — beaching used to REQUIRE held throttle), and no
// touch at all (beached = offroad + slow needs no input), which splits
// input-latch from physics-side if the first reproduces.
import { test, expect } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

async function bootButtons(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.steerMode", JSON.stringify("buttons")); } catch (_) {}
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { polling: 100, timeout: 30_000 });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track === "monza",
    { polling: 100, timeout: 60_000 });
  await page.evaluate(() => window.__apex.go());
  await page.waitForFunction(() => window.__apex.physState()?.speed != null,
    { polling: 100, timeout: 30_000 });
}

// Beach the car: off the road, slow enough for `beached` (offroad && speed
// under the grass floor + 1.5). rescueT accumulates ~3 s then rescuePlayer
// runs; the banner announces RECOVERED and speed is raised to >= 16.
async function beachAndAwaitRescue(page) {
  await page.evaluate(() => window.__apex.jump(0.3, 11, 13));
  await page.waitForFunction(() => {
    const a = document.getElementById("announce");
    return a && !a.hidden && /RECOVERED/i.test(a.textContent || "");
  }, { polling: 100, timeout: 45_000 });
}

async function sample(page, seconds) {
  const rows = [];
  for (let i = 0; i < seconds * 4; i++) {
    rows.push(await page.evaluate(() => {
      const s = window.__apex.inputState();
      const p = window.__apex.physState();
      return {
        t: performance.now(),
        btnThrottle: s.btn.throttle, keyThrottle: s.key.throttle,
        padThrottle: s.pad.throttle, throttle: s.throttle,
        speed: +p.speed.toFixed(2), x: +p.x.toFixed(1),
      };
    }));
    await page.waitForTimeout(250);
  }
  return rows;
}

function verdict(rows, label) {
  const last = rows[rows.length - 1];
  const dSpeed = last.speed - rows[0].speed;
  console.log(`--- ${label}: ${rows.length} samples over ~${(rows.length / 4).toFixed(0)}s`);
  for (const r of rows) console.log(
    `  speed ${String(r.speed).padStart(6)}  x ${String(r.x).padStart(5)}  ` +
    `throttle ${r.throttle}  (btn ${r.btnThrottle} key ${r.keyThrottle} pad ${r.padThrottle})`);
  console.log(
    last.btnThrottle ? `VERDICT(${label}): btn.throttle STILL TRUE after release — INPUT LATCH (new mechanism)`
    : last.throttle ? `VERDICT(${label}): throttle asserted by key/pad, not btn — see the source flags`
    : dSpeed > 2 ? `VERDICT(${label}): throttle() false but speed CLIMBED ${dSpeed.toFixed(1)} — PHYSICS-SIDE forcing`
    : `VERDICT(${label}): throttle off and speed decayed ${dSpeed.toFixed(1)} — not reproduced`);
  return { last, dSpeed };
}

test("gas held through the rescue, then released — who asserts throttle after?", async ({ page }) => {
  test.setTimeout(240_000);
  await bootButtons(page);

  const gas = await page.locator("#btn-throttle").boundingBox();
  expect(gas, "GAS pedal not visible — buttons mode did not enable it").toBeTruthy();
  const cdp = await page.context().newCDPSession(page);
  const tp = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp] });
  await page.waitForFunction(() => window.__apex.inputState().btn.throttle === true,
    { polling: 100, timeout: 5_000 });
  console.log("GAS held via real touch");

  await beachAndAwaitRescue(page);
  console.log("RESCUED with gas still held; lifting the finger now");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);

  const rows = await sample(page, 4);
  const { last } = verdict(rows, "held-through-rescue");
  expect(rows.length).toBeGreaterThan(0);
  // The probe's product is the verdict; this assertion pins only the half that
  // must ALWAYS hold — a lifted finger may not leave btn.throttle latched.
  expect(last.btnThrottle, "GAS latched after a real touchEnd").toBe(false);
});

test("no touch at all — does a rescue alone make the car drive itself?", async ({ page }) => {
  test.setTimeout(240_000);
  await bootButtons(page);
  await beachAndAwaitRescue(page);
  console.log("RESCUED with no input ever pressed");
  const rows = await sample(page, 4);
  verdict(rows, "no-input");
  expect(rows.length).toBeGreaterThan(0);
});
