// @ts-check
import { test, expect } from "@playwright/test";

test("GameAudio initialises without console errors", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
  const defined = await page.evaluate(
    () =>
      typeof window.GameAudio === "object" || typeof window.GameAudio === "function"
  );
  expect(defined).toBe(true);
  const audioErrors = errors.filter(
    (e) =>
      e.includes("AudioContext") ||
      e.includes("decodeAudioData") ||
      e.includes("GameAudio")
  );
  expect(audioErrors).toHaveLength(0);
});

test("OfflineAudioContext synthesis produces non-silent output", async ({
  page,
}) => {
  // Verify the browser's Web Audio synthesis pipeline works end-to-end:
  // sawtooth → gain → OfflineAudioContext → rendered buffer has signal.
  // This is a capability check: if it fails, GameAudio's synth fallback
  // would also silently fail in the same environment.
  await page.goto("/");
  const hasSignal = await page.evaluate(async () => {
    try {
      const ctx = new OfflineAudioContext(1, 4096, 44100);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 220;
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      const buf = await ctx.startRendering();
      const data = buf.getChannelData(0);
      return data.some((s) => Math.abs(s) > 0.001);
    } catch {
      return false;
    }
  });
  expect(hasSignal).toBe(true);
});

test("AudioContext.state transitions to running after user gesture", async ({
  page,
}) => {
  // Autoplay policy means AudioContext starts suspended. The game unlocks it
  // via a click/touch. Verify that resume() actually transitions state.
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const ctx = new AudioContext();
    const initial = ctx.state;
    await ctx.resume();
    const after = ctx.state;
    ctx.close();
    return { initial, after };
  });
  // After explicit resume(), state must be running
  expect(result.after).toBe("running");
});
