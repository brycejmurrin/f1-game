// Visual demonstration of the new camera + driving hooks (v196).
// Outputs shots to tests/hooks-demo/  (gitignored).
// Run: npx playwright test tests/hooks-visual-demo.spec.js

import { test } from "@playwright/test";
import fs from "fs";

const OUT = "tests/hooks-demo";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1200, height: 675 };  // 16:9

async function load(page, trackId = "monaco") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  await page.evaluate(async t => {
    __apex.race(t);
    await new Promise(r => setTimeout(r, 3500));
    __apex.go();
    await new Promise(r => setTimeout(r, 400));
    __apex.freeze(true);
    __apex.hud(false);
  }, trackId);
}

async function shot(page, name, label) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  → ${name}.png  ${label || ""}`);
}

// ── 1. orbit() fov comparison ─────────────────────────────────────────────────
test("orbit fov comparison — Casino corner Monaco", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monaco");

  // Casino entry is around frac 0.22 — tight right-hander
  for (const [fov, tag] of [[28, "telephoto"], [55, "default"], [90, "wide"]]) {
    await page.evaluate(([f, az, el, dist, h, fov]) =>
      __apex.orbit(f, az, el, dist, h, { fov }), [0.22, -80, 22, 55, 1.5, fov]);
    await shot(page, `01-orbit-fov-${fov}-${tag}`, `orbit fov=${fov} (${tag})`);
  }
});

// ── 2. cinematic() — 10 spots around Monaco ──────────────────────────────────
test("cinematic auto-outside-corner — Monaco tour", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monaco");

  const fracs = [0.0, 0.08, 0.16, 0.24, 0.35, 0.44, 0.52, 0.62, 0.73, 0.88];
  const labels = [
    "finish-straight", "sainte-devote", "massenet", "casino",
    "mirabeau", "grand-hotel", "portier", "tunnel-exit",
    "tabac", "swimming-pool",
  ];
  for (let i = 0; i < fracs.length; i++) {
    const f = fracs[i];
    const info = await page.evaluate(f => __apex.cinematic(f, { dist: 65, el: 20 }), f);
    console.log(`  cinematic f=${f} az=${info.az} k=${info.k}`);
    await shot(page, `02-cinematic-${String(i).padStart(2,"0")}-${labels[i]}`,
      `cinematic f=${f} az=${info.az.toFixed(0)}° k=${info.k.toFixed(4)}`);
  }
});

// ── 3. carOrbit() — player at different azimuths ─────────────────────────────
test("carOrbit player — 8 azimuths", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monaco");

  // Place player at a scenic spot
  await page.evaluate(() => {
    __apex.jump(0.08, 0);   // Sainte-Dévote
    __apex.freeze(true);
  });

  const azimuths = [0, 45, 90, 135, 180, 225, 270, 315];
  const labels   = ["behind","back-left","left","front-left","front","front-right","right","back-right"];
  for (let i = 0; i < azimuths.length; i++) {
    const az = azimuths[i];
    await page.evaluate(([az, el, dist]) => {
      const pIdx = __apex.cars().findIndex(c => c.p);
      __apex.carOrbit(pIdx >= 0 ? pIdx : 0, az, el, dist);
    }, [az, 16, 30]);
    await shot(page, `03-carOrbit-az${az}-${labels[i]}`,
      `carOrbit az=${az}° (${labels[i]})`);
  }
});

// ── 4. carOrbit() — AI car ────────────────────────────────────────────────────
test("carOrbit AI cars — head-on and chase", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monza");

  for (const [idx, az, tag] of [
    [1, 180, "ai1-head-on"],
    [1, 0,   "ai1-chase"],
    [2, 180, "ai2-head-on"],
    [3, 90,  "ai3-side"],
  ]) {
    await page.evaluate(([idx, az]) => __apex.carOrbit(idx, az, 12, 28), [idx, az]);
    await shot(page, `04-carOrbit-${tag}`, `carOrbit cars[${idx}] az=${az}°`);
  }
});

// ── 5. setSpeed() visual — player at different speeds with cockpit cam ────────
test("setSpeed — freeze at 0 / 80 / 160 kph", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monza");

  // Use orbit to show car from behind
  await page.evaluate(() => {
    const pIdx = __apex.cars().findIndex(c => c.p);
    __apex.jump(0.5, 0);
    __apex.freeze(false);
  });

  for (const [v, tag] of [[0, "0kph"], [22.2, "80kph"], [55.6, "200kph"]]) {
    await page.evaluate(v => {
      __apex.setSpeed(v);
      __apex.freeze(true);
      const pIdx = __apex.cars().findIndex(c => c.p);
      __apex.carOrbit(pIdx >= 0 ? pIdx : 0, 0, 12, 35);
    }, v);
    const probe = await page.evaluate(() => __apex.probe());
    console.log(`  setSpeed(${v}) → probe.speed=${probe.speed.toFixed(1)} m/s`);
    await shot(page, `05-setSpeed-${tag}`, `setSpeed(${v}) = ${(v*3.6).toFixed(0)} km/h`);
  }
});

// ── 6. spin() — player heading ────────────────────────────────────────────────
test("spin() — 0 / 90 / 180 / 270 degrees", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monza");

  for (const [extraDeg, tag] of [[0,"0deg"],[90,"90deg"],[180,"180deg"],[270,"270deg"]]) {
    await page.evaluate(deg => {
      __apex.jump(0.5, 0);
      __apex.freeze(true);
      if (deg) __apex.spin(deg);
      // Overhead view so heading is visible
      const pIdx = __apex.cars().findIndex(c => c.p);
      __apex.carOrbit(pIdx >= 0 ? pIdx : 0, 180, 55, 50, 1.0, { fov: 40 });
    }, extraDeg);
    const state = await page.evaluate(() => __apex.physState());
    console.log(`  spin(${extraDeg}) → head=${(state.head*180/Math.PI).toFixed(1)}°`);
    await shot(page, `06-spin-${tag}`, `spin(${extraDeg}°)`);
  }
});

// ── 7. nudge() — lateral push toward barrier ──────────────────────────────────
test("nudge() — lateral impulse steps", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monza");

  for (const [dLat, tag] of [[0,"baseline"],[5,"push-right-5"],[10,"push-right-10"]]) {
    await page.evaluate(dLat => {
      __apex.jump(0.5, 30);
      __apex.freeze(true);
      if (dLat) __apex.nudge(dLat, 0);
      const pIdx = __apex.cars().findIndex(c => c.p);
      // roadside camera perpendicular to track so lateral movement is visible
      __apex.roadside(0.5, -1, 25, 3, { look: "in", fov: 48 });
    }, dLat);
    const res = await page.evaluate(() => __apex.physState());
    console.log(`  nudge(${dLat}) → vLat=${res.vLat.toFixed(2)}`);
    await shot(page, `07-nudge-dLat${dLat}-${tag}`, `nudge(dLat=${dLat})`);
  }
});

// ── 8. cinematic() vs orbit() same spot — side-by-side comparison ─────────────
test("cinematic vs orbit at same frac", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await load(page, "monaco");

  // Loews hairpin — tightest corner, should show big az difference
  const f = 0.38;
  await page.evaluate(f => __apex.orbit(f, 35, 20, 60, 1.5, { fov: 55 }), f);
  await shot(page, "08a-orbit-loews-default", "orbit f=0.38 az=35 (manual default)");

  const info = await page.evaluate(f => __apex.cinematic(f, { dist: 60, el: 20 }), f);
  console.log(`  cinematic at Loews: az=${info.az}, k=${info.k}`);
  await shot(page, "08b-cinematic-loews-auto", `cinematic f=0.38 auto az=${info.az.toFixed(0)}°`);
});
