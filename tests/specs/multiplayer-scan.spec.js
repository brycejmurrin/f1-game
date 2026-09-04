// @ts-check
// Reading a code with the camera — the thing that removes the copy/paste.
//
// The camera here is REAL apart from the photons: Chromium plays a Y4M of an
// actual QR (encoded by the shipped encoder) in place of a webcam, so
// getUserMedia, the video element, the canvas readback and jsQR all run for
// real. See tests/helpers/qr-camera.js.
//
// That matters because every failure mode on this path is SILENT. A tainted
// canvas, a video element still reporting zero dimensions, a decoder script
// that never loaded — none of them throw. They just never produce a result, and
// the player is left holding a phone at a screen wondering what they did wrong.
//
// The camera in THIS file always has the code in frame, so a scan always
// resolves. Anything that must happen mid-scan is in multiplayer-scan-cancel,
// against a camera that shows nothing.
//
// STAYS ON THE PER-TEST FIXTURE: the Y4M webcam is a browser LAUNCH flag, the
// two tests run serially on that one browser, and the scan path is getUserMedia
// against a fresh video element — one boot saved is not worth a shared page
// under a real camera stream.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import config from "../../playwright.config.js";
import { CODE, buildY4m, cameraLaunch } from "../helpers/qr-camera.js";

// Built at MODULE scope: Chromium takes the path as a launch argument, and the
// browser can start before any hook runs.
const Y4M = buildY4m(true);

test.use({
  viewport: { width: 844, height: 390 },
  launchOptions: cameraLaunch(config.projects[0].use.launchOptions, Y4M),
});

// Software-GL workers starve each other, and a starved decode loop misses its
// frames — which reads as "scanning is broken" rather than "the box is busy".
test.describe.configure({ mode: "serial" });

// The scan lands the code in its box BEFORE running the handshake with it, so
// the box is what proves the camera path worked. The handshake itself cannot
// run here — lobbyFake swaps in a loopback transport with no
// RTCPeerConnection — and that is deliberate: a real one never finishes ICE in
// this environment, so a test that built one would HANG rather than fail.
async function openJoin(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.lobbyFake(true));
  await page.click("#mb-vs");
  await page.click("#vs-join");
}

const liveTracks = (page) => page.evaluate(() => {
  const v = document.getElementById("vs-scan-video");
  const s = v && v.srcObject;
  return s ? s.getTracks().filter((t) => t.readyState === "live").length : 0;
});

test.describe("scanning a code", () => {
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
    // caps were chosen to give: 229.7 s (#1974) / 179.6 s (#1977).
    // This raises a BUDGET, not a tolerance — no assertion changed, and a test
    // that genuinely hangs still goes red, just later.
    //
    // WHAT THIS DOES NOT FIX, said plainly so the next reader does not assume
    // a green gate means a green spec: `the camera reads a code …` does not
    // fail on the TEST budget, it fails the `toHaveValue` below, which carries
    // its own { timeout: 45000 }. test.setTimeout does not extend an expect
    // timeout — the two budgets are independent. On #1977 the page reached
    // `scan start` only at 57.8 s (starved runner, 257 KB decoder fetched on
    // demand, fake-webcam stream, SwiftShader boot), so the 45 s assertion
    // window had to cover a decode that had not started; the `handshake accept
    // fail corrupt_code` line lands 20 ms after `scan stop`, during teardown,
    // so it is the abandoned scan's consequence and not evidence that the QR
    // path is broken. Declaring 300 s takes this spec OFF a gate it could
    // never pay for; it does not make this test pass on a loaded runner.
    // See docs/notes/TESTING-FIELD-NOTES.md 2026-09-04.
    test.setTimeout(300_000);
  test("the camera reads a code and puts it where it belongs", async ({ page }) => {
    await openJoin(page);
    await page.click("#vs-scan-invite");
    await expect(page.locator("#vs-scan")).toBeVisible();
    // Generous: the decoder is 257 KB fetched on demand, and the first frames
    // arrive before the video reports its dimensions.
    await expect(page.locator("#vs-invite-in")).toHaveValue(CODE, { timeout: 45000 });
  });

  test("the camera is released the moment it has the code", async ({ page }) => {
    // A camera outliving the screen that opened it is a privacy problem before
    // it is a battery one, and nothing on screen would reveal it.
    await openJoin(page);
    await page.click("#vs-scan-invite");
    await expect(page.locator("#vs-invite-in")).toHaveValue(CODE, { timeout: 45000 });
    await expect(page.locator("#vs-scan")).toBeHidden();
    expect(await liveTracks(page)).toBe(0);
  });
});
