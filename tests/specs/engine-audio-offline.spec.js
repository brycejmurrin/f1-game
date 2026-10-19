// @ts-check
// #2966 — OfflineAudioContext render of the engine graph: fundamental pitch vs
// rev, plus layer crossfade levels in the rendered samples.
//
// A main-thread breakpoint does not stop the audio render thread (Node
// debugging gap map, issue #2966 / PR #2959). OfflineAudioContext is the
// deterministic way to assert what the graph actually emits.
//
// Tolerance (justified): synth fundamental is engA ≈ base * 0.994. At 1 s /
// 44100 Hz an FFT bin is 1 Hz; sawtooth energy on harmonics and the engine
// lowpass shift the spectral peak a little, so we allow ±4 % or ±12 Hz
// (whichever is larger) around the expected f0 from GameAudio's own tune/voice.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function waitApex(page) {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

test("OfflineAudioContext engine pitch tracks rev; sub layer crossfade is audible", async ({ page }) => {
  test.setTimeout(180_000);
  await waitApex(page);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.waitForFunction(
    () => typeof GameAudio !== "undefined" && !GameAudio._stub && typeof GameAudio.initOffline === "function",
    null, { polling: 100, timeout: BOOT_MS }
  );

  // Autocorr + band RMS run in-page so we do not ferry 4×44100 floats over CDP.
  const result = await page.evaluate(async () => {
    const SR = 44100;
    const SEC = 1;
    const revs = [0.25, 0.5, 0.75, 1.0];
    const gear = 4;

    function detectF0(samples, sampleRate, minHz = 40, maxHz = 900) {
      const n = samples.length;
      const minLag = Math.floor(sampleRate / maxHz);
      const maxLag = Math.min(n - 1, Math.floor(sampleRate / minHz));
      let bestLag = minLag, best = -Infinity;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const lim = n - lag;
        for (let i = 0; i < lim; i++) sum += samples[i] * samples[i + lag];
        if (sum > best) { best = sum; bestLag = lag; }
      }
      return sampleRate / bestLag;
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
    function expectedF0(rev) {
      const tune = GameAudio.tune();
      const voices = GameAudioToneModel.ENGINE_VOICES;
      const voice = voices[GameAudio.voiceName()] || voices.default || { rateTrim: 1 };
      const revC = Math.pow(rev, tune.curve);
      const g01 = (gear - 1) / 7;
      const gIdle = 130 - g01 * 70;
      const gSpan = 900 - g01 * 460;
      const base = (gIdle * tune.idle + revC * gSpan * tune.revRange)
        * (voice.rateTrim || 1) * tune.pitch;
      return base * 0.994; // engA
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
      const buf = await GameAudio.renderOffline();
      return buf.getChannelData(0);
    }

    const points = [];
    for (const rev of revs) {
      const samples = await renderAt(rev, {
        sub: true, gravel: false, wind: false, screech: false, overrun: false,
      });
      points.push({ rev, f0: detectF0(samples, SR), expected: expectedF0(rev) });
    }
    const subOn = await renderAt(0.6, {
      sub: true, gravel: false, wind: false, screech: false, overrun: false, whine: false,
    });
    const subOff = await renderAt(0.6, {
      sub: false, gravel: false, wind: false, screech: false, overrun: false, whine: false,
    });
    return {
      points,
      lowOn: bandRms(subOn, SR, 30, 200),
      lowOff: bandRms(subOff, SR, 30, 200),
    };
  });

  expect(result.points.length).toBe(4);

  let prevHz = 0;
  for (const { rev, f0, expected: expectHz } of result.points) {
    const tol = Math.max(12, expectHz * 0.04);
    expect(f0, `rev=${rev} f0=${f0} expected≈${expectHz}`).toBeGreaterThan(expectHz - tol);
    expect(f0, `rev=${rev} f0=${f0} expected≈${expectHz}`).toBeLessThan(expectHz + tol);
    expect(f0, `pitch must rise with rev (prev=${prevHz})`).toBeGreaterThan(prevHz);
    prevHz = f0;
  }

  expect(result.lowOn, `sub layer low-band on=${result.lowOn} off=${result.lowOff}`)
    .toBeGreaterThan(result.lowOff * 1.15);
});
