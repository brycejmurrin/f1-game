// @ts-check
// Getting OUT of a scan — and taking the camera down with you.
//
// Separate from multiplayer-scan.spec.js because it needs a different camera,
// and Chromium takes the camera as a launch argument. Here the fake webcam
// shows a blank page and nothing else, so a scan NEVER resolves.
//
// That is the whole point. Against a camera holding a valid code, these tests
// pass for the wrong reason: the scanner decodes and releases the camera all by
// itself within milliseconds, so CANCEL and CLOSE are pressed against an
// already-torn-down scan and the teardown under test never runs. A camera that
// shows nothing turns "mid-scan" from a race into a stable state.
//
// A camera left live after its screen is gone is a privacy problem before it is
// a battery one, and nothing on screen would reveal it — which is exactly why
// it is asserted rather than assumed.
//
// STAYS ON THE PER-TEST FIXTURE: the blank Y4M webcam is a browser LAUNCH flag,
// the three tests run serially on that one browser, and the last one redefines
// `document.hidden` to true for good — a shared page after it would be a page
// the game believes is backgrounded.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import config from "../../playwright.config.js";
import { buildY4m, cameraLaunch } from "../helpers/qr-camera.js";

const Y4M = buildY4m(false);          // a blank page: nothing to decode, ever

test.use({
  viewport: { width: 844, height: 390 },
  launchOptions: cameraLaunch(config.projects[0].use.launchOptions, Y4M),
});
test.describe.configure({ mode: "serial" });

async function startScanning(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.lobbyFake(true));
  await page.click("#mb-vs");
  await page.click("#vs-join");
  await page.click("#vs-scan-invite");
  await expect(page.locator("#vs-scan")).toBeVisible();
  // The panel is revealed BEFORE getUserMedia resolves — deliberately, so
  // something happens the instant the button is pressed — so the camera being
  // live has to be waited for, not asserted alongside the panel.
  await page.waitForFunction(() => {
    const v = document.getElementById("vs-scan-video");
    const s = v && v.srcObject;
    return !!s && s.getTracks().some((t) => t.readyState === "live");
  }, null, { polling: 100, timeout: 20000 });
}

const liveTracks = (page) => page.evaluate(() => {
  const v = document.getElementById("vs-scan-video");
  const s = v && v.srcObject;
  return s ? s.getTracks().filter((t) => t.readyState === "live").length : 0;
});

test.describe("leaving a scan", () => {
    // DECLARE THE BUDGET. Each test here launches its OWN Chromium — the fake
    // Y4M webcam is a browser LAUNCH argument (see the header), so the per-test
    // fixture is deliberate and every test pays a full browser start, page boot
    // and getUserMedia handshake before its body runs.
    //
    // With nothing declared, tools/ci/select-specs.mjs had no way to know. Its
    // `EXCLUDED (declares Ns test budget > gate 120s)` guard keys on
    // test.setTimeout, so a spec that is silent about its cost is billed at the
    // gate's generic 120 s and selected. This one then failed at exactly "Test
    // timeout of 120000ms exceeded" on Pages #1974 (run 33830189400, job
    // 100891344583) and helped trip the run's 3-failure stop. No assertion
    // failed — the gate simply could not afford what it picked.
    //
    // 300 s is the value its peers on a race fixture already carry, and it
    // clears the MEASURED worst case with the same ~25 % margin ci.yml's own
    // caps were chosen to give: 238.2 s for `CANCEL stops the camera`.
    // This raises a BUDGET, not a tolerance — no assertion changed, and a test
    // that genuinely hangs still goes red, just later.
    test.setTimeout(300_000);
  test("CANCEL stops the camera", async ({ page }) => {
    await startScanning(page);
    await page.click("#vs-scan-cancel");
    await expect(page.locator("#vs-scan")).toBeHidden();
    expect(await liveTracks(page)).toBe(0);
    // Nothing was decoded, which is what makes the above a real teardown.
    await expect(page.locator("#vs-invite-in")).toHaveValue("");
  });

  test("closing the lobby stops the camera", async ({ page }) => {
    // The path a player actually takes when they give up: they do not press
    // CANCEL, they press CLOSE.
    await startScanning(page);
    await page.click("#vs-close");
    await expect(page.locator("#vsfriend")).toBeHidden();
    expect(await liveTracks(page)).toBe(0);
  });

  test("a camera does not survive the tab being backgrounded", async ({ page }) => {
    // On a phone this is someone walking away with the light still on.
    await startScanning(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator("#vs-scan")).toBeHidden();
    expect(await liveTracks(page)).toBe(0);
  });
});
