// @ts-check
// D·DP3: after green flag, TLX live geometry count must stay flat — lazy flap /
// wheel-extra meshes are minted during load/countdown warm, not mid-race.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { syncFactoryMcLarenSeat } from "../helpers/factory-seat.js";

async function bootTlx(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.gfxPreset", JSON.stringify("medium"));
    } catch (_) { /* */ }
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await syncFactoryMcLarenSeat(page);
}

async function sampleGeo(page) {
  return page.evaluate(() => {
    const tlx = typeof GLX !== "undefined" && GLX.__tlx;
    if (!tlx || typeof tlx.memState !== "function") return null;
    const ms = tlx.memState();
    const flaps = (typeof CarMesh !== "undefined" && CarMesh.flapState) ? CarMesh.flapState() : null;
    const info = window.__apex.info ? window.__apex.info() : {};
    return {
      geoLive: ms.geoLive | 0,
      geoKinds: ms.geoKinds || {},
      flaps,
      state: info.state,
      raceT: (window.G && window.G.raceT) || 0,
    };
  });
}

test.describe("race geometry stable after green", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("geoLive does not grow over the first stretch of a race (TLX)", async ({ page }) => {
    test.setTimeout(300_000);
    await bootTlx(page);
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await page.waitForFunction(() => {
      const i = window.__apex.info && window.__apex.info();
      return i && i.track && i.track.id && !i.building;
    }, null, { polling: 200, timeout: 180_000 });
    await page.evaluate(() => window.__apex.go());
    await page.waitForFunction(() => {
      const i = window.__apex.info && window.__apex.info();
      return i && i.state === "race";
    }, null, { polling: 100, timeout: 60_000 });

    // A few presents so geoLive settles after countdown drain.
    await page.waitForFunction(() => {
      const tlx = GLX && GLX.__tlx;
      return tlx && tlx.memState && (tlx.memState().presents | 0) > 5;
    }, null, { polling: 100, timeout: 60_000 });

    const t0 = await sampleGeo(page);
    expect(t0, "TLX memState available").toBeTruthy();
    expect(t0.flaps && t0.flaps.sets, `flap sets should be warm before green: ${JSON.stringify(t0)}`).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.__apex.setInput({ throttle: 1, steer: 0, brake: 0 });
      for (let i = 0; i < 900; i++) window.__apex.step(1 / 60);
    });
    // Wall time for a few more presents while the field spreads.
    const p0 = await page.evaluate(() => (GLX.__tlx.memState().presents | 0));
    await page.waitForFunction((p) => (GLX.__tlx.memState().presents | 0) >= p + 60, p0, {
      polling: 100, timeout: 30_000,
    });

    const t1 = await sampleGeo(page);
    expect(t1.raceT, `sim advanced: ${t0.raceT} -> ${t1.raceT}`).toBeGreaterThan(t0.raceT + 5);
    // Far-rival idle silhouette may add at most one geo; anything more is a lazy build.
    expect(t1.geoLive, `geoLive grew after green: ${t0.geoLive} -> ${t1.geoLive} kinds0=${JSON.stringify(t0.geoKinds)} kinds1=${JSON.stringify(t1.geoKinds)} flaps0=${JSON.stringify(t0.flaps)} flaps1=${JSON.stringify(t1.flaps)}`)
      .toBeLessThanOrEqual(t0.geoLive + 2);
    expect(t1.flaps.sets, "flap set cache must not grow after green").toBeLessThanOrEqual(t0.flaps.sets);
    expect(t1.flaps.elements, "flap element cache must not grow after green").toBeLessThanOrEqual(t0.flaps.elements);
  });
});
