// @ts-check
// After Start Race, garage-out must finish before the race/session card appears
// on every path: reduce-motion (short version), view-transition / Home vt race,
// and quick start (warm race-settings). Card must never overlap the animation.
// Isolated `test` (not sharedTest): Start Race leaves async intro / track build
// that poisons the worker-scoped shared page for the next file on the shard
// (parts-ers track-build STALLED on CI). Own page per test avoids that.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

async function clickId(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("garage-out-before-card: missing #" + i);
    el.click();
  }, id);
}

/** Arm a timeline of loading phase + #ld-card visibility + garageCam.on. */
async function armTimeline(page) {
  await page.evaluate(() => {
    const L = document.getElementById("loading");
    const card = document.getElementById("ld-card");
    if (window.__garageOutPoll) clearInterval(window.__garageOutPoll);
    if (window.__garageOutRaf) cancelAnimationFrame(window.__garageOutRaf);
    window.__garageOutTL = [];
    const snap = (tag) => {
      if (!L || !card) return;
      const cs = window.getComputedStyle(card);
      const phase = L.dataset.phase || "";
      const cardShown = !L.hidden
        && ["run", "card", "build", "busy", "handoff"].includes(phase)
        && cs.visibility !== "hidden";
      const cam = window.__apex && window.__apex.garageCam && window.__apex.garageCam();
      const st = window.__apex && window.__apex.info ? window.__apex.info().state : "";
      window.__garageOutTL.push({
        t: performance.now(), tag, phase, hidden: !!L.hidden,
        cardVis: cs.visibility, cardShown,
        garageOn: !!(cam && cam.on), state: st,
      });
    };
    snap("arm");
    const mo = new MutationObserver(() => snap("mut"));
    mo.observe(L, { attributes: true, attributeFilter: ["data-phase", "hidden"] });
    window.__garageOutMo = mo;
    const tick = () => { snap("tick"); window.__garageOutRaf = requestAnimationFrame(tick); };
    window.__garageOutRaf = requestAnimationFrame(tick);
    window.__garageOutPoll = setInterval(() => snap("poll"), 100);
  });
}

async function stopTimeline(page) {
  return page.evaluate(() => {
    if (window.__garageOutPoll) clearInterval(window.__garageOutPoll);
    if (window.__garageOutRaf) cancelAnimationFrame(window.__garageOutRaf);
    if (window.__garageOutMo) window.__garageOutMo.disconnect();
    return window.__garageOutTL || [];
  });
}

function assertGarageThenCard(tl, label) {
  const summary = JSON.stringify(tl.filter((s, i) => i < 6 || s.phase === "garage" || s.cardShown || s.garageOn).slice(0, 36));
  expect(tl.length, `${label}: timeline empty`).toBeGreaterThan(3);
  const garagePhase = tl.filter((s) => s.phase === "garage");
  const garageSamples = garagePhase.length ? garagePhase : tl.filter((s) => s.garageOn);
  expect(garageSamples.length, `${label}: garage-out never ran — ${summary}`).toBeGreaterThan(0);
  const firstGarageT = garageSamples[0].t;
  const lastGarageT = garageSamples[garageSamples.length - 1].t;
  // Card raised, or race already took over after garage (handoff can be brief on SwiftShader).
  const cardSamples = tl.filter((s) => s.cardShown);
  const leftGarage = garagePhase.length > 0 && tl.some((s) => s.t > lastGarageT && s.phase !== "garage");
  const raced = tl.some((s) => s.t > firstGarageT && s.state && s.state !== "menu");
  expect(cardSamples.length || leftGarage || raced,
    `${label}: neither card nor post-garage race — ${summary}`).toBeTruthy();
  if (cardSamples.length) {
    const firstCardT = cardSamples[0].t;
    expect(firstCardT, `${label}: card before garage start`).toBeGreaterThanOrEqual(firstGarageT);
    expect(firstCardT, `${label}: card before garage-out finished`).toBeGreaterThanOrEqual(lastGarageT - 120);
  }
  const overlap = tl.filter((s) => s.phase === "garage" && s.cardShown);
  expect(overlap, `${label}: card overlapped garage-out`).toEqual([]);
  return { firstGarageT, lastGarageT, garageMs: Math.max(0, lastGarageT - firstGarageT), hadGaragePhase: garagePhase.length > 0 };
}

async function openRaceSettings(page) {
  await toMenu(page);
  // Player pace (see the beforeEach): set on the live page too, then prove the gate is off.
  await page.evaluate(() => { window.__apexFullIntro = true; });
  expect(await page.evaluate(() => LoadingScreen.isAutomation()), "fullIntro opt-in must turn the automation gate off").toBe(false);
  // Drop a leftover handoff/build plate from a prior sharedTest race.
  await page.evaluate(() => {
    const L = document.getElementById("loading");
    if (L) { L.hidden = true; delete L.dataset.phase; }
    try { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); } catch (_) { /* sealed */ }
  });
  await page.waitForFunction(() => window.__apex && window.__apex.info().state === "menu", null, { polling: 100, timeout: 60_000 });
  await clickId(page, "mb-race");
  await page.waitForFunction(() => {
    const s = document.getElementById("select");
    return !!(s && !s.hidden);
  }, null, { polling: 100, timeout: 30_000 });
  await clickId(page, "sel-go");
  await page.waitForFunction(() => {
    const rs = document.getElementById("race-settings");
    return !!(rs && !rs.hidden);
  }, null, { polling: 100, timeout: 30_000 });
}

async function startRaceFromSettings(page) {
  await page.evaluate(() => {
    try { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); } catch (_) { /* sealed */ }
    const L = document.getElementById("loading");
    if (L && (L.dataset.phase === "handoff" || L.dataset.phase === "busy")) {
      L.hidden = true; delete L.dataset.phase;
    }
  });
  await armTimeline(page);
  await clickId(page, "rs-go");
  try {
    await page.waitForFunction(() => {
      const tl = window.__garageOutTL || [];
      const hadGarage = tl.some((s) => s.phase === "garage" || s.garageOn);
      if (!hadGarage) return false;
      const lastGar = [...tl].reverse().find((s) => s.phase === "garage" || s.garageOn);
      const after = tl.some((s) => s.t > lastGar.t && (s.cardShown || (s.phase && s.phase !== "garage") || (s.state && s.state !== "menu")));
      // Still in garage: allow studioDone's 3× duration cap to fire (ms up to ~8s × 3).
      return after || tl.some((s) => s.cardShown);
    }, null, { polling: 100, timeout: 180_000 });
  } catch (e) {
    const tl = await stopTimeline(page);
    throw new Error((e && e.message) + " timeline=" + JSON.stringify(tl.filter((s, i) => i < 4 || s.phase === "garage" || s.cardShown || s.garageOn).slice(0, 50)));
  }
  return stopTimeline(page);
}

async function setMotion(page, on) {
  if (on) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "on");
      document.documentElement.removeAttribute("data-motion");
    });
  } else {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "reduce");
      document.documentElement.dataset.motion = "reduce";
    });
  }
  await page.evaluate(() => {
    if (typeof GameStore !== "undefined" && GameStore.store) {
      const cur = GameStore.store.get("garageArrival", null) || {};
      GameStore.store.set("garageArrival", Object.assign({}, cur, { enabled: true, speed: 1 }));
    }
  });
}

test.describe("garage-out before race/session card", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  // PLAYER PACE UNDER THE HARNESS: navigator.webdriver skips the garage drive-out
  // and the flyby (LoadingScreen.isAutomation) so other specs reach the grid inside
  // BOOT_MS. This file is what proves the player's sequence (7.6 s drive-out, then
  // card), so it opts back in through the gate's own flag, before and after any
  // navigation, and keeps its >6 s assertion.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.__apexFullIntro = true; });
  });

  // Start Race leaves state === "menu" under the loading/garage plate, so
  // shared-page toMenu() only hides .screen nodes and never runs quitToMenu /
  // cancelIntro — the next sharedTest on the worker (parts-ers) then hits a
  // wedged track build. Always click #pm-quit after each path.
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      if (window.__garageOutPoll) clearInterval(window.__garageOutPoll);
      if (window.__garageOutRaf) cancelAnimationFrame(window.__garageOutRaf);
      if (window.__garageOutMo) window.__garageOutMo.disconnect();
      const q = document.getElementById("pm-quit");
      if (q) { q.click(); if (q.classList.contains("armed")) q.click(); }
      const L = document.getElementById("loading");
      if (L) { L.hidden = true; delete L.dataset.phase; }
    }).catch(() => {});
    await toMenu(page).catch(() => {});
  });

  test("reduce-motion: short garage-out completes before session card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 240_000);
    await setMotion(page, false);
    await openRaceSettings(page);
    const tl = await startRaceFromSettings(page);
    const m = assertGarageThenCard(tl, "reduce");
    // Reduce must still enter data-phase=garage, and play it at the tuner's pace
    // (speed 1 → GarageArrival.OUT_DURATION, 7.6 s): the old 4× cut (~1.9 s) read
    // as a glitch. A wall-clocked drive-out never finishes early on a slow box.
    expect(m.hadGaragePhase, "reduce must play garage phase, not skip it").toBe(true);
    expect(m.garageMs, "reduce must not speed the garage-out up (full OUT_DURATION at speed 1)").toBeGreaterThan(6000);
    // …and the flyby (card up, phase run — or card with no world) follows it, never a 700 ms flash to the race.
    const after = tl.find((s) => s.t > m.lastGarageT && s.phase && s.phase !== "garage" && s.phase !== "build");
    if (after) expect(["run", "card", "handoff"], "reduce: the card + flyby follow the garage").toContain(after.phase);
  });

  test("view-transition / Home vt race: garage-out before flyby card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 240_000);
    await setMotion(page, true);
    await openRaceSettings(page);
    const tl = await startRaceFromSettings(page);
    assertGarageThenCard(tl, "vt-home");
  });

  test("quick start (warm race-settings): garage-out before card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 240_000);
    await setMotion(page, true);
    await openRaceSettings(page);
    await page.waitForFunction(() => {
      const rs = document.getElementById("race-settings");
      const go = document.getElementById("rs-go");
      return !!(rs && !rs.hidden && go && !go.disabled);
    }, null, { polling: 100, timeout: 60_000 });
    const tl = await startRaceFromSettings(page);
    assertGarageThenCard(tl, "quick");
  });
});
