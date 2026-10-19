// @ts-check
// #2966 — OfflineAudioContext render of the engine graph: fundamental pitch vs
// rev, plus layer crossfade levels in the rendered samples.
//
// A main-thread breakpoint does not stop the audio render thread (Node
// debugging gap map, issue #2966 / PR #2959). OfflineAudioContext is the
// deterministic way to assert what the graph actually emits.
//
// Tolerance (justified): we take GameAudio.fundamentalHz() (the scheduled
// engA / sample-rate aim) as ground truth, then find the magnitude peak in a
// ±12 % window around it. The synth always runs engC an octave below and a
// formant EQ + lowpass move energy around the pure oscillator Hz, so a global
// autocorr locks an octave low; a windowed peak within ±8 % or ±25 Hz of the
// scheduled fundamental is the contract Offline render must keep.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function waitApex(page) {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

test("OfflineAudioContext engine pitch tracks rev; screech layer crossfade is audible", async ({ page }) => {
  test.setTimeout(180_000);
  await waitApex(page);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.waitForFunction(
    () => typeof GameAudio !== "undefined" && !GameAudio._stub && typeof GameAudio.initOffline === "function",
    null, { polling: 100, timeout: BOOT_MS }
  );

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const SEC = 1;
    const revs = [0.25, 0.5, 0.75, 1.0];
    const gear = 4;

    function detectF0Near(samples, sampleRate, expectHz) {
      const n = samples.length;
      const lo = Math.max(1, Math.floor(expectHz * 0.88 * n / sampleRate));
      const hi = Math.min(Math.floor(n / 2) - 1, Math.ceil(expectHz * 1.12 * n / sampleRate));
      let bestK = lo, best = -Infinity;
      for (let k = lo; k <= hi; k++) {
        let re = 0, im = 0;
        const w = 2 * Math.PI * k / n;
        for (let i = 0; i < n; i++) {
          re += samples[i] * Math.cos(w * i);
          im -= samples[i] * Math.sin(w * i);
        }
        const mag = re * re + im * im;
        if (mag > best) { best = mag; bestK = k; }
      }
      return bestK * sampleRate / n;
    }
    function bandRms(samples, sampleRate, loHz, hiHz) {
      const n = samples.length;
      let e = 0, c = 0;
      const i0 = Math.max(1, Math.floor(loHz * n / sampleRate));
      const i1 = Math.min(n / 2 - 1, Math.ceil(hiHz * n / sampleRate));
      for (let k = i0; k <= i1; k++) {
        let re = 0, im = 0;
        const w = 2 * Math.PI * k / n;
        for (let i = 0; i < n; i++) {
          re += samples[i] * Math.cos(w * i);
          im -= samples[i] * Math.sin(w * i);
        }
        e += re * re + im * im;
        c++;
      }
      return c ? Math.sqrt(e / c) / n : 0;
    }

    async function renderAt(rev, layerPatch) {
      if (!GameAudio.initOffline({ seconds: SEC, sampleRate: SR, channels: 1 })) {
        throw new Error("initOffline failed");
      }
      const defs = GameAudio.layerDefaults();
      for (const k of Object.keys(defs)) GameAudio.setLayer(k, defs[k]);
      if (layerPatch) for (const [k, v] of Object.entries(layerPatch)) GameAudio.setLayer(k, v);
      GameAudio.startEngine();
      GameAudio.setEngine(rev, 0, false, 0.55, gear, {
        slip: 1, ax: 0, onKerb: false, wet: false, throttle: 1, brake: 0,
      });
      const scheduled = GameAudio.fundamentalHz();
      const buf = await GameAudio.renderOffline();
      return { samples: buf.getChannelData(0), scheduled };
    }

    const points = [];
    for (const rev of revs) {
      const { samples, scheduled } = await renderAt(rev, {
        sub: true, gravel: false, wind: false, screech: false, overrun: false,
      });
      points.push({
        rev,
        scheduled,
        f0: detectF0Near(samples, SR, scheduled),
      });
    }
    // Screech layer crossfade: setSkid with screech off is silent; with it on
    // the bandpass tyre noise lands in ~600–1100 Hz and is loud vs the core.
    async function renderScreech(on) {
      if (!GameAudio.initOffline({ seconds: SEC, sampleRate: SR, channels: 1 })) {
        throw new Error("initOffline failed");
      }
      const defs = GameAudio.layerDefaults();
      for (const k of Object.keys(defs)) GameAudio.setLayer(k, k === "screech" ? on : false);
      GameAudio.startEngine();
      GameAudio.setEngine(0.3, 0, false, 0.4, gear, {
        slip: 1, ax: 0, onKerb: false, wet: false, throttle: 0.2, brake: 0,
      });
      GameAudio.setSkid(0.85, false);
      const level = GameAudio.skidLevel();
      const buf = await GameAudio.renderOffline();
      return { level, samples: buf.getChannelData(0) };
    }
    const scOn = await renderScreech(true);
    const scOff = await renderScreech(false);
    return {
      points,
      skidOn: scOn.level,
      skidOff: scOff.level,
      skidOnRms: bandRms(scOn.samples, SR, 500, 1200),
      skidOffRms: bandRms(scOff.samples, SR, 500, 1200),
    };
  });

  expect(result.points.length).toBe(4);

  let prevSched = 0;
  let prevF0 = 0;
  for (const { rev, f0, scheduled } of result.points) {
    expect(scheduled, `rev=${rev} scheduled fundamental`).toBeGreaterThan(40);
    expect(scheduled, `scheduled pitch rises with rev`).toBeGreaterThan(prevSched);
    const tol = Math.max(25, scheduled * 0.08);
    expect(f0, `rev=${rev} rendered f0=${f0} scheduled≈${scheduled}`).toBeGreaterThan(scheduled - tol);
    expect(f0, `rev=${rev} rendered f0=${f0} scheduled≈${scheduled}`).toBeLessThan(scheduled + tol);
    expect(f0, `rendered pitch must rise with rev (prev=${prevF0})`).toBeGreaterThan(prevF0);
    prevSched = scheduled;
    prevF0 = f0;
  }

  expect(result.skidOn, `skidLevel with screech on=${result.skidOn}`).toBeGreaterThan(0);
  expect(result.skidOff).toBe(0);
  // Core harmonics already fill 500–1200 Hz; screech adds a measured ~10 % in
  // that band (solo run 0.000198 vs 0.000180). Contract: on > off, plus the
  // parametric skidLevel gate above.
  expect(result.skidOnRms, `screech band on=${result.skidOnRms} off=${result.skidOffRms}`)
    .toBeGreaterThan(result.skidOffRms * 1.05);
});
